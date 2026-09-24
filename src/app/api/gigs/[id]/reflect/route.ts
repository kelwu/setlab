import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordUsage, recordCost, usageFrom } from '@/lib/api-usage';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';

export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';

interface PlannedTrack {
  position: number;
  artist: string;
  title: string;
  bpm: number | null;
  energyLevel: number;
}

interface ActualTrack {
  position: number;
  artist: string;
  title: string;
  timestamp?: number;
  source: 'scan' | 'manual';
}

interface DiffEntry {
  position: number;
  planned: { artist: string; title: string; energyLevel: number } | null;
  actual: { artist: string; title: string } | null;
  status: 'matched' | 'swapped' | 'skipped' | 'added';
}

interface ReflectionOutput {
  diff: DiffEntry[];
  energySummary: string;
  patterns: string[];
  swapCount: number;
  matchCount: number;
  skippedCount: number;
}

const REFLECT_TOOL: Anthropic.Tool = {
  name: 'generate_reflection',
  description: 'Produce a data-only post-gig reflection. No judgment, no prescription — pure factual comparison.',
  input_schema: {
    type: 'object',
    required: ['diff', 'energySummary', 'patterns', 'swapCount', 'matchCount', 'skippedCount'],
    properties: {
      diff: {
        type: 'array',
        items: {
          type: 'object',
          required: ['position', 'planned', 'actual', 'status'],
          properties: {
            position: { type: 'number' },
            planned: {
              oneOf: [
                { type: 'object', required: ['artist', 'title', 'energyLevel'],
                  properties: { artist: { type: 'string' }, title: { type: 'string' }, energyLevel: { type: 'number' } } },
                { type: 'null' },
              ],
            },
            actual: {
              oneOf: [
                { type: 'object', required: ['artist', 'title'],
                  properties: { artist: { type: 'string' }, title: { type: 'string' } } },
                { type: 'null' },
              ],
            },
            status: { type: 'string', enum: ['matched', 'swapped', 'skipped', 'added'] },
          },
        },
      },
      energySummary: {
        type: 'string',
        description: 'One factual sentence about where the energy arc changed (e.g. "Peak arrived 3 tracks earlier than planned").',
      },
      patterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 3 factual observations about the set (e.g. "You swapped out 4 of 5 planned warmup tracks"). No advice.',
      },
      swapCount: { type: 'number' },
      matchCount: { type: 'number' },
      skippedCount: { type: 'number' },
    },
  },
};

// GET — fetch gig data + existing reflection
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: gig, error } = await admin
    .from('gig_history')
    .select('id, gig_name, gig_date, venue, setlist_id, played_at, actual_tracks, reflection_json')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !gig) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch planned setlist if linked
  let plannedTracks: PlannedTrack[] = [];
  let setlistName: string | null = null;
  if (gig.setlist_id) {
    const { data: setlist } = await admin
      .from('setlists')
      .select('name, tracks_json')
      .eq('id', gig.setlist_id)
      .single();
    if (setlist) {
      setlistName = setlist.name;
      const raw = setlist.tracks_json as Array<Record<string, unknown>> | null;
      if (Array.isArray(raw)) {
        plannedTracks = raw.map((t, i) => ({
          position: typeof t.position === 'number' ? t.position : i + 1,
          artist: String(t.artist ?? ''),
          title: String(t.title ?? ''),
          bpm: typeof t.bpm === 'number' ? t.bpm : null,
          energyLevel: typeof t.energyLevel === 'number' ? t.energyLevel : 5,
        }));
      }
    }
  }

  return NextResponse.json({
    gig: {
      id: gig.id,
      gigName: gig.gig_name,
      gigDate: gig.gig_date,
      venue: gig.venue,
      playedAt: gig.played_at,
      setlistName,
      actualTracks: gig.actual_tracks ?? null,
      reflectionJson: gig.reflection_json ?? null,
    },
    plannedTracks,
  });
}

// POST — submit actual tracks, run Claude, store reflection
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { banned } = await recordUsage(user.id, 'gig-reflect');
  if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });

  const body = await req.json() as { actualTracks: ActualTrack[] };
  const { actualTracks } = body;
  if (!Array.isArray(actualTracks) || actualTracks.length === 0) {
    return NextResponse.json({ error: 'actualTracks required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load gig
  const { data: gig, error } = await admin
    .from('gig_history')
    .select('id, setlist_id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (error || !gig) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Load planned tracks
  let plannedTracks: PlannedTrack[] = [];
  if (gig.setlist_id) {
    const { data: setlist } = await admin
      .from('setlists')
      .select('tracks_json')
      .eq('id', gig.setlist_id)
      .single();
    if (setlist) {
      const raw = setlist.tracks_json as Array<Record<string, unknown>> | null;
      if (Array.isArray(raw)) {
        plannedTracks = raw.map((t, i) => ({
          position: typeof t.position === 'number' ? t.position : i + 1,
          artist: String(t.artist ?? ''),
          title: String(t.title ?? ''),
          bpm: typeof t.bpm === 'number' ? t.bpm : null,
          energyLevel: typeof t.energyLevel === 'number' ? t.energyLevel : 5,
        }));
      }
    }
  }

  const anthropic = getAnthropic();

  const userMsg = `Planned set (${plannedTracks.length} tracks):
${plannedTracks.map(t => `${t.position}. ${t.artist} — ${t.title} (energy: ${t.energyLevel}/10)`).join('\n')}

Actually played (${actualTracks.length} tracks):
${actualTracks.map(t => `${t.position}. ${t.artist} — ${t.title}${t.timestamp !== undefined ? ` @ ${Math.floor(t.timestamp / 60)}:${String(Math.floor(t.timestamp % 60)).padStart(2, '0')}` : ''}`).join('\n')}

Produce a factual diff. Match tracks by artist/title similarity. "matched" = same track played at that slot. "swapped" = different track played at that slot. "skipped" = planned track not played. "added" = actual track with no planned equivalent.`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: 'You are a data analyst for a DJ. Produce factual, concise post-gig data. No judgment, no advice, no "you should have." Pure comparison only.',
    messages: [{ role: 'user', content: userMsg }],
    tools: [REFLECT_TOOL],
    tool_choice: { type: 'tool', name: 'generate_reflection' },
  }, { timeout: 55_000, maxRetries: 0 });
  await recordCost(user.id, 'gig-reflect', usageFrom(MODEL, msg));

  const block = msg.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use');
  if (!block) return NextResponse.json({ error: 'Claude did not return reflection' }, { status: 500 });

  const reflection = block.input as ReflectionOutput;

  await admin.from('gig_history').update({
    actual_tracks: actualTracks as unknown as import('@/lib/supabase/types').Json,
    reflection_json: reflection as unknown as import('@/lib/supabase/types').Json,
  }).eq('id', id);

  return NextResponse.json({ reflection, plannedTracks });
}
