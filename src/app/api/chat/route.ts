import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { SYSTEM_PROMPT, isMessageBlocked } from '@/lib/setdrop/knowledge';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAnthropic } from '@/lib/anthropic';
import { BRAND } from '@/lib/brand';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { message, page, history } = await req.json();

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 });
  }

  // Server-side guardrail — catch anything that slipped past the client
  if (isMessageBlocked(message)) {
    return NextResponse.json({ blocked: true });
  }

  // Log the question and notify via email (non-blocking). We hold onto the insert
  // promise so the streamed reply can be written back onto the SAME row once the
  // response finishes — giving an auditable question↔answer transcript. The admin
  // client is used so RLS never blocks the select-back or the later update.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const logPromise = admin
    .from('feedback')
    .insert({
      user_id: user?.id ?? null,
      email: user?.email ?? null,
      message: `[chat] ${message.trim()}`,
      page: page ?? null,
    })
    .select('id')
    .single()
    .then(
      (r) => r,
      (err): { data: { id: string } | null } => {
        console.error('[chat] question log failed', err);
        return { data: null };
      },
    );

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  if (apiKey) {
    const resend = new Resend(apiKey);
    resend.emails.send({
      from: `${BRAND.name} Chat <${fromEmail}>`,
      to: 'kelcwu@gmail.com',
      replyTo: user?.email ?? undefined,
      subject: `Chat question${user?.email ? ` from ${user.email}` : ' from visitor'}`,
      html: `
        <div style="font-family:monospace;max-width:600px">
          <h2 style="color:#F5A623;margin:0 0 16px">${BRAND.name} — Chat Question</h2>
          <p style="white-space:pre-wrap;background:#141414;color:#F0F0F0;padding:16px;border-radius:4px;border:1px solid #222">${message.trim()}</p>
          <table style="color:#909090;font-size:12px;margin-top:16px;border-collapse:collapse">
            <tr><td style="padding:2px 12px 2px 0">From</td><td>${user?.email ?? 'anonymous visitor'}</td></tr>
            <tr><td style="padding:2px 12px 2px 0">Page</td><td>${page ?? '—'}</td></tr>
          </table>
        </div>
      `,
    }).catch(err => console.error('[chat] email failed', err));
  }

  // Open the stream before returning so a pre-stream failure surfaces as a real
  // HTTP error rather than an empty 200. The timeout guards against a hung call
  // silently eating the 30s function budget.
  // Build the conversation for the model: prior turns (sanitised + capped) then
  // the new question. Multi-turn context lets follow-ups like "show me" / "and
  // in Spanish?" resolve against what was already said.
  type ChatTurn = { role: 'user' | 'assistant'; content: string };
  const priorTurns: ChatTurn[] = (Array.isArray(history) ? history : [])
    .filter(
      (m): m is { role: string; text: string } =>
        !!m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'),
    )
    .slice(-10)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text.slice(0, 2000).trim() }))
    .filter((m) => m.content.length > 0);
  // The API requires the first message to be from the user; drop any leading
  // assistant turns that would violate that.
  while (priorTurns.length && priorTurns[0].role === 'assistant') priorTurns.shift();
  const convo: ChatTurn[] = [...priorTurns, { role: 'user', content: message.trim() }];

  // Tell the bot where this DJ is (signed in? library imported?) so a "how do I
  // make a set" answer starts with importing when they haven't yet. Best-effort:
  // a failed lookup just leaves the context out.
  let userContext = 'USER CONTEXT: not signed in.';
  if (user) {
    try {
      const [{ data: lib }, { data: profile }] = await Promise.all([
        admin.from('serato_libraries').select('total_tracks, source').eq('user_id', user.id).limit(1).maybeSingle(),
        admin.from('users').select('subscription_tier, is_beta').eq('id', user.id).maybeSingle(),
      ]);
      const plan = profile?.subscription_tier === 'pro' || profile?.is_beta ? 'Pro' : 'Free';
      const library = lib
        ? `library imported (${lib.total_tracks ?? 'unknown'} tracks, from ${lib.source === 'rekordbox' ? 'Rekordbox' : 'Serato'})`
        : 'NO library imported yet';
      userContext = `USER CONTEXT: signed in, ${plan} plan, ${library}.`;
    } catch (err) {
      console.error('[chat] user context lookup failed', err);
      userContext = '';
    }
  }

  let stream: ReturnType<ReturnType<typeof getAnthropic>['messages']['stream']>;
  try {
    stream = getAnthropic().messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: userContext ? `${SYSTEM_PROMPT}\n\n${userContext}` : SYSTEM_PROMPT,
      messages: convo,
    }, { timeout: 25_000 });
  } catch (err) {
    console.error('[chat] stream failed to start', err);
    return new Response('Sorry — chat is unavailable right now. Please try again.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let full = '';
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            full += chunk.delta.text;
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        // Mid-stream failure (timeout, aborted connection, etc.). The client has
        // already received a 200 + partial text, so append a visible notice
        // instead of closing silently on a truncated reply.
        console.error('[chat] stream interrupted', err);
        const notice = '\n\n_(Got cut off — please try again.)_';
        full += notice;
        controller.enqueue(encoder.encode(notice));
      } finally {
        controller.close();
        // Persist the assistant reply onto the logged question row. Best-effort:
        // the stream is already done, so a logging failure must never surface.
        try {
          const { data: row } = await logPromise;
          if (row?.id && full.trim()) {
            await admin.from('feedback').update({ reply: full }).eq('id', row.id);
          }
        } catch (err) {
          console.error('[chat] reply log failed', err);
        }
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
