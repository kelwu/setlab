'use client';

// Review screen: every track in scope with its 8 hot-cue pads. Click a pad to
// hear it from 1 s before the cue, at the position Rekordbox will use (offset
// applied). Windowed rendering keeps a 15k-track library smooth.

import { useEffect, useMemo, useRef, useState } from 'react';
import { SD } from '@/lib/setdrop/constants';
import { Card } from '../shared';
import type { ScannedFile } from '@/lib/cues/scan';
import { convertSeratoToRekordbox } from '@/lib/cues/offset';
import { rgbToHex } from '@/lib/cues/colors';
import type { CuePoint } from '@/lib/cues/types';

export type RowStatus = 'cues' | 'no-cues' | 'not-found' | 'unsupported' | 'streaming' | 'error';

export interface ReviewRow {
  path: string;
  title: string;
  artist: string;
  status: RowStatus;
  scan?: ScannedFile;
  file?: File;
}

const FILTERS: { id: 'all' | RowStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cues', label: 'With cues' },
  { id: 'no-cues', label: 'No cues' },
  { id: 'not-found', label: 'Not found' },
  { id: 'unsupported', label: 'No cue support' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'error', label: 'Unreadable' },
];

const STATUS_NOTE: Record<RowStatus, string> = {
  cues: '',
  'no-cues': 'No Serato cues',
  'not-found': 'Not in this folder',
  unsupported: 'Moves without cues (MP3 only for now)',
  streaming: 'Streaming — stays in Serato',
  error: 'Couldn’t read this file',
};

const ROW_H = 56;
const VIEW_H = 560;
const OVERSCAN = 6;

export function CueReview({ rows, excluded, onToggle }: {
  rows: ReviewRow[];
  excluded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | RowStatus>('all');
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const player = useAuditionPlayer();

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const cueTotal = useMemo(() => rows.reduce((n, r) => n + (r.scan?.cues?.cues.length ?? 0), 0), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r =>
      (filter === 'all' || r.status === filter)
      && (!q || r.title.toLowerCase().includes(q) || r.artist.toLowerCase().includes(q)));
  }, [rows, filter, query]);

  // Back to the top whenever the visible set changes.
  const resetScroll = () => { listRef.current?.scrollTo({ top: 0 }); setScrollTop(0); };
  const changeFilter = (f: 'all' | RowStatus) => { setFilter(f); resetScroll(); };
  const changeQuery = (q: string) => { setQuery(q); resetScroll(); };

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(visible.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN);

  return (
    <Card>
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${SD.border}` }}>
        <div style={{ fontFamily: SD.mono, fontSize: SD.t13, color: SD.text, marginBottom: SD.s3 }}>
          <b>{(counts.cues ?? 0).toLocaleString()}</b> of {rows.length.toLocaleString()} tracks have cues ·{' '}
          <b>{cueTotal.toLocaleString()}</b> cues found
        </div>
        <div style={{ display: 'flex', gap: SD.s2, flexWrap: 'wrap', alignItems: 'center' }}>
          {FILTERS.filter(f => f.id === 'all' || counts[f.id]).map(f => (
            <button key={f.id} onClick={() => changeFilter(f.id)} aria-pressed={filter === f.id} style={{
              fontFamily: SD.mono, fontSize: SD.t11, letterSpacing: 1, padding: '6px 10px', cursor: 'pointer',
              borderRadius: SD.r1, border: `1px solid ${filter === f.id ? SD.accent : SD.border}`,
              background: filter === f.id ? SD.accentDim : 'transparent',
              color: filter === f.id ? SD.accent : SD.textSec,
            }}>{f.label} {(counts[f.id] ?? 0).toLocaleString()}</button>
          ))}
          <input value={query} onChange={e => changeQuery(e.target.value)} placeholder="Search tracks"
            aria-label="Search tracks" style={{
              marginLeft: 'auto', flex: '0 1 220px', minWidth: 0, background: SD.surface2,
              border: `1px solid ${SD.borderMid}`, borderRadius: SD.r2, color: SD.text,
              fontFamily: SD.mono, fontSize: SD.t12, padding: '7px 10px',
            }} />
        </div>
      </div>

      <div ref={listRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        style={{ height: Math.min(VIEW_H, Math.max(ROW_H, visible.length * ROW_H)), overflowY: 'auto', position: 'relative' }}>
        <div style={{ height: visible.length * ROW_H, position: 'relative' }}>
          {visible.slice(first, last).map((r, k) => (
            <Row key={r.path} row={r} top={(first + k) * ROW_H}
              included={!excluded.has(r.path)} onToggle={() => onToggle(r.path)} player={player} />
          ))}
        </div>
        {!visible.length && (
          <div style={{ padding: 24, fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted }}>No tracks match.</div>
        )}
      </div>

      <div style={{ padding: '12px 24px', borderTop: `1px solid ${SD.border}`, fontFamily: SD.mono, fontSize: SD.t11, color: SD.textMuted }}>
        Click a pad to hear it from 1 s before the cue, at the position Rekordbox will use. Browser playback of MP3s can be off by a few milliseconds.
      </div>
    </Card>
  );
}

function Row({ row, top, included, onToggle, player }: {
  row: ReviewRow; top: number; included: boolean; onToggle: () => void; player: AuditionPlayer;
}) {
  const tc = row.scan?.cues;
  // Positions as Rekordbox will play them.
  const cues = useMemo(() => (tc ? convertSeratoToRekordbox(tc.cues, tc.mp3) : []), [tc]);
  const pads: (CuePoint | undefined)[] = Array.from({ length: 8 }, (_, s) => cues.find(c => c.kind === 'hotcue' && c.slot === s));
  const loops = cues.filter(c => c.kind === 'loop').length;
  const canExport = row.status !== 'streaming';

  return (
    <div style={{
      position: 'absolute', top, left: 0, right: 0, height: ROW_H, display: 'flex', alignItems: 'center',
      gap: SD.s3, padding: '0 24px', borderBottom: `1px solid ${SD.border}`, opacity: included ? 1 : 0.45,
    }}>
      <input type="checkbox" checked={included && canExport} disabled={!canExport} onChange={onToggle}
        aria-label={`Include ${row.title}`} />
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={{ fontFamily: SD.mono, fontSize: SD.t13, color: SD.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.title}
        </div>
        <div style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.artist}{STATUS_NOTE[row.status] && <span style={{ color: row.status === 'error' ? SD.danger : SD.textMuted }}>{row.artist ? ' · ' : ''}{STATUS_NOTE[row.status]}</span>}
        </div>
      </div>
      {row.status === 'cues' && (
        <div className="sd-hide-mobile" style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {pads.map((c, s) => (
            <Pad key={s} slot={s} cue={c}
              playing={!!c && player.playing === `${row.path}#${s}`}
              onPlay={() => c && row.file && player.toggle(`${row.path}#${s}`, row.file, c.startMs)} />
          ))}
          {loops > 0 && (
            <span style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.textSec, marginLeft: 6 }}>
              +{loops} loop{loops > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(ms: number) {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function Pad({ slot, cue, playing, onPlay }: { slot: number; cue?: CuePoint; playing: boolean; onPlay: () => void }) {
  const letter = 'ABCDEFGH'[slot];
  if (!cue) {
    return <span aria-hidden style={{ width: 26, height: 26, borderRadius: SD.r1, border: `1px solid ${SD.border}` }} />;
  }
  const bg = cue.color ? `#${rgbToHex(cue.color)}` : SD.surface3;
  return (
    <button onClick={onPlay}
      title={`${letter}${cue.name ? ` · ${cue.name}` : ''} · ${fmt(cue.startMs)}`}
      aria-label={`${playing ? 'Stop' : 'Play'} hot cue ${letter}${cue.name ? ` (${cue.name})` : ''} at ${fmt(cue.startMs)}`}
      style={{
        width: 26, height: 26, borderRadius: SD.r1, cursor: 'pointer', padding: 0,
        background: bg, border: playing ? `2px solid ${SD.text}` : '1px solid rgba(0,0,0,0.4)',
        color: '#000', fontFamily: SD.mono, fontSize: SD.t11, fontWeight: 700,
      }}>{playing ? '■' : letter}</button>
  );
}

// ── One shared <audio> for auditioning ───────────────────────────────────────
interface AuditionPlayer {
  playing: string | null;
  toggle: (key: string, file: File, cueMs: number) => void;
}

function useAuditionPlayer(): AuditionPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const toggle = (key: string, file: File, cueMs: number) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlaying(null);
    }
    const a = audioRef.current;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(file);
    a.src = urlRef.current;
    const start = Math.max(0, cueMs - 1000) / 1000;
    a.onloadedmetadata = () => { a.currentTime = start; a.play().catch(() => setPlaying(null)); };
    setPlaying(key);
  };

  return { playing, toggle };
}
