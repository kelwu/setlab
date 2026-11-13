'use client';

// Serato → Rekordbox converter: pick the Music folder (or drive) → choose the
// whole library or some crates → scan cues in a Web Worker → review/audition
// → download one Rekordbox XML. Audio never leaves the browser; only cue
// metadata is saved (so later exports can include cues).

import { useMemo, useRef, useState } from 'react';
import { SD } from '@/lib/setdrop/constants';
import { SDButton, Card, PageHeader } from '../shared';
import { downloadRekordboxXml } from '@/lib/setdrop/rekordbox-export';
import { trackEvent } from '@/lib/analytics';
import { isLocalFilePath } from '@/lib/setdrop/file-path';
import { parseSeratoDatabase } from '@/lib/setdrop/serato-db-parser';
import type { LibraryTrack } from '@/lib/agents/types';
import { analysePick } from '@/lib/cues/folder-pick';
import {
  buildCrateTree, flattenCrates, parseSeratoCrate, pruneCrateTree, CrateNode,
} from '@/lib/cues/serato/crate-reader';
import { matchLibrary, guessLibraryRoot, detectPlatform, resolveAbsolutePath } from '@/lib/cues/match';
import { convertSeratoLibrary, ConvertStats } from '@/lib/cues/convert';
import type { ScannedFile } from '@/lib/cues/scan';
import { useCueScan } from '@/lib/cues/useCueScan';
import { CueReview, ReviewRow, RowStatus } from './CueReview';

type Step = 'pick' | 'select' | 'scanning' | 'review' | 'done';

interface Loaded {
  files: File[];
  topFolder: string;
  dbTracks: LibraryTrack[];
  crates: CrateNode[];
  /** Serato path → index into files, for tracks found in the pick. */
  fileFor: Map<string, number>;
}

const SAVE_CHUNK = 500;

export function ConvertWizard() {
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lib, setLib] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<'library' | 'crates'>('library');
  const [pickedCrates, setPickedCrates] = useState<Set<string>>(new Set());
  const [scans, setScans] = useState<Map<string, ScannedFile>>(new Map());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [root, setRoot] = useState('');
  const [loopsAsHotcue, setLoopsAsHotcue] = useState(false);
  const [dupMemory, setDupMemory] = useState(false);
  const [trackColours, setTrackColours] = useState(true);
  const [result, setResult] = useState<ConvertStats | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { scan, cancel, progress } = useCueScan();

  // ── Step 1: folder pick ────────────────────────────────────────────────────
  const onPick = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    setLoading(true);
    try {
      const files = Array.from(list);
      const rel = files.map(f => f.webkitRelativePath || f.name);
      const layout = analysePick(rel);
      if (layout.dbIndex === null) {
        setError('No Serato library found in that folder. Choose the folder that contains "_Serato_" — usually Music on your computer, or the top level of your external drive.');
        return;
      }
      const dbBytes = new Uint8Array(await files[layout.dbIndex].arrayBuffer());
      const dbTracks = parseSeratoDatabase(dbBytes).tracks;
      const crateFiles = await Promise.all(layout.crateIndexes.map(async i => ({
        filename: files[i].name,
        tracks: parseSeratoCrate(new Uint8Array(await files[i].arrayBuffer())),
      })));
      crateFiles.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }));
      const crates = buildCrateTree(crateFiles);

      const audioRel = layout.audioIndexes.map(i => rel[i]);
      const localPaths = dbTracks.map(t => t.filePath).filter((p): p is string => !!p && isLocalFilePath(p));
      const fileFor = new Map<string, number>();
      for (const [path, hit] of matchLibrary(localPaths, audioRel)) fileFor.set(path, layout.audioIndexes[hit]);

      const sample = dbTracks.find(t => t.filePath && isLocalFilePath(t.filePath))?.filePath ?? '';
      setRoot(guessLibraryRoot(sample, detectPlatform(navigator.userAgent), layout.topFolder));
      setLib({ files, topFolder: layout.topFolder, dbTracks, crates, fileFor });
      setPickedCrates(new Set());
      setStep('select');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that folder.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // ── Selection → the Serato paths in scope ──────────────────────────────────
  const allCrates = useMemo(() => (lib ? flattenCrates(lib.crates) : []), [lib]);
  const scopePaths = useMemo(() => {
    if (!lib) return [] as string[];
    if (mode === 'library') return lib.dbTracks.map(t => t.filePath).filter((p): p is string => !!p);
    const set = new Set<string>();
    for (const c of allCrates) if (pickedCrates.has(c.id)) c.tracks.forEach(p => set.add(p));
    return [...set];
  }, [lib, mode, allCrates, pickedCrates]);


  // ── Step 2 → 3: scan ───────────────────────────────────────────────────────
  const startScan = async () => {
    if (!lib) return;
    setError(null);
    setStep('scanning');
    const jobs: { file: File; relPath: string }[] = [];
    const pathForJob: string[] = [];
    for (const p of scopePaths) {
      const i = lib.fileFor.get(p);
      if (i === undefined) continue;
      jobs.push({ file: lib.files[i], relPath: lib.files[i].webkitRelativePath || lib.files[i].name });
      pathForJob.push(p);
    }
    trackEvent.cueConvertStarted(mode, jobs.length);
    try {
      const results = await scan(jobs);
      const byRel = new Map(results.map(r => [r.relPath, r]));
      const next = new Map<string, ScannedFile>();
      jobs.forEach((j, k) => { const r = byRel.get(j.relPath); if (r) next.set(pathForJob[k], r); });
      setScans(next);
      setExcluded(new Set());
      const withCues = [...next.values()].filter(r => r.status === 'ok' && r.cues?.cues.length);
      trackEvent.cueScanCompleted(next.size, withCues.length,
        withCues.reduce((n, r) => n + (r.cues?.cues.length ?? 0), 0));
      setStep('review');
      saveCues(lib.dbTracks, next); // fire-and-forget
    } catch (e) {
      trackEvent.cueScanFailed(e instanceof Error && /cancel/i.test(e.message) ? 'cancelled' : 'error');
      setError(e instanceof Error ? e.message : 'Scan failed.');
      setStep('select');
    }
  };

  // ── Review rows ────────────────────────────────────────────────────────────
  const rows: ReviewRow[] = useMemo(() => {
    if (!lib) return [];
    const byPath = new Map(lib.dbTracks.filter(t => t.filePath).map(t => [t.filePath!, t]));
    return scopePaths.map(p => {
      const t = byPath.get(p);
      const s = scans.get(p);
      let status: RowStatus;
      if (!isLocalFilePath(p)) status = 'streaming';
      else if (!lib.fileFor.has(p)) status = 'not-found';
      else if (!s) status = 'not-found';
      else if (s.status === 'ok') status = 'cues';
      else if (s.status === 'no-cues') status = 'no-cues';
      else if (s.status === 'unsupported') status = 'unsupported';
      else status = 'error';
      const fi = lib.fileFor.get(p);
      return {
        path: p,
        title: t?.title || p.split('/').pop() || p,
        artist: t?.artist ?? '',
        status,
        scan: s,
        file: fi !== undefined ? lib.files[fi] : undefined,
      };
    });
  }, [lib, scopePaths, scans]);

  const exampleLocation = useMemo(() => {
    const p = rows.find(r => r.status === 'cues' || r.status === 'no-cues')?.path;
    return p ? resolveAbsolutePath(p, root) : '';
  }, [rows, root]);

  // ── Step 4: export ─────────────────────────────────────────────────────────
  // Conversion is free for every signed-in DJ and doesn't count toward the
  // monthly export limit (Lexicon converts whole libraries free; the paid value
  // is cues travelling with SetLab's own set/crate exports).
  const exportXml = () => {
    if (!lib) return;
    setError(null);
    const selected = new Set(rows.filter(r => !excluded.has(r.path)).map(r => r.path));
    const crates = mode === 'library' ? lib.crates : pruneCrateTree(lib.crates, pickedCrates);
    const { xml, stats } = convertSeratoLibrary({
      dbTracks: lib.dbTracks, crates, scans, root, selected, trackColours,
      markOpts: { loopsAsHotcue, duplicateHotCuesAsMemory: dupMemory },
    });
    downloadRekordboxXml(xml, 'SetLab Serato to Rekordbox');
    trackEvent.cueConvertDownloaded(stats.tracks, stats.tracksWithCues, stats.playlists);
    setResult(stats);
    setStep('done');
  };

  const toggleCrate = (c: CrateNode) => {
    const ids = flattenCrates([c]).map(n => n.id);
    setPickedCrates(prev => {
      const next = new Set(prev);
      const on = !prev.has(c.id);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  return (
    <div style={{ background: SD.bg, minHeight: '100vh', paddingTop: 56, color: SD.text }}>
      <div className="sd-pad-x sd-inner-pad" style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 40px' }}>
        <PageHeader
          eyebrow="Serato → Rekordbox"
          title="CONVERT YOUR LIBRARY"
          subtitle="Tracks, hot cues, loops, colours and crates — moved to Rekordbox with the MP3 timing fix applied."
        />

        <Steps step={step} />

        {error && (
          <div role="alert" style={{
            margin: `0 0 ${SD.s5}px`, padding: '12px 16px', borderRadius: SD.r2,
            background: SD.dangerDim, border: `1px solid ${SD.danger}55`,
            fontFamily: SD.mono, fontSize: SD.t12, color: SD.text, lineHeight: 1.6,
          }}>
            {error}

          </div>
        )}

        {step === 'pick' && (
          <Card padding={32}>
            <h2 style={h2}>Choose your Music folder</h2>
            <p style={p}>
              Pick the folder that holds your <code style={code}>_Serato_</code> folder — usually <b>Music</b> on your
              computer, or the top level of your external drive. SetLab reads the Serato database, your crates and
              the cue tags inside each MP3.
            </p>
            <p style={{ ...p, color: SD.textSec }}>
              Your music never leaves this browser. Your browser may ask to “upload” the folder — nothing is
              uploaded; SetLab only reads cue data from the files.
            </p>
            <input
              ref={inputRef} type="file" multiple hidden
              // @ts-expect-error — non-standard but supported by every modern browser
              webkitdirectory="" directory=""
              onChange={e => onPick(e.target.files)}
            />
            <SDButton onClick={() => inputRef.current?.click()} disabled={loading}>
              {loading ? 'Reading library…' : 'Choose folder'}
            </SDButton>
            <p style={{ ...p, color: SD.textMuted, marginTop: SD.s5, marginBottom: 0 }}>
              MP3 cues are converted in this version. AIFF, M4A, WAV and FLAC tracks come across without cues.
              Libraries spread over several drives: convert one drive at a time.
            </p>
          </Card>
        )}

        {step === 'select' && lib && (
          <Card padding={32}>
            <h2 style={h2}>What do you want to convert?</h2>
            <p style={p}>
              Found <b>{lib.dbTracks.length.toLocaleString()}</b> tracks and <b>{allCrates.length}</b> crates in
              “{lib.topFolder}”. <b>{lib.fileFor.size.toLocaleString()}</b> of the tracks were found in this folder.
            </p>

            <div style={{ display: 'flex', gap: SD.s3, flexWrap: 'wrap', margin: `${SD.s5}px 0` }}>
              <ModeButton active={mode === 'library'} onClick={() => setMode('library')}
                title="Whole library" sub="Every track and crate" />
              <ModeButton active={mode === 'crates'} onClick={() => setMode('crates')}
                title="Choose crates" sub="Pick what to move" />
            </div>

            {mode === 'crates' && (
              <div style={{ border: `1px solid ${SD.border}`, borderRadius: SD.r2, maxHeight: 360, overflowY: 'auto', padding: '8px 0' }}>
                {lib.crates.length === 0 && <div style={{ ...p, padding: 16 }}>No crates in this library.</div>}
                <CrateTree nodes={lib.crates} picked={pickedCrates} onToggle={toggleCrate} depth={0} />
              </div>
            )}

            <div style={{ display: 'flex', gap: SD.s3, alignItems: 'center', marginTop: SD.s5, flexWrap: 'wrap' }}>
              <SDButton onClick={startScan} disabled={!scopePaths.length}>
                Scan {scopePaths.length.toLocaleString()} tracks
              </SDButton>
              <SDButton ghost small onClick={() => { setLib(null); setStep('pick'); }}>Choose another folder</SDButton>
            </div>
          </Card>
        )}

        {step === 'scanning' && (
          <Card padding={32}>
            <h2 style={h2}>Reading cues…</h2>
            <Progress done={progress?.done ?? 0} total={progress?.total ?? 0} />
            <div style={{ marginTop: SD.s5 }}>
              <SDButton ghost small onClick={cancel}>Stop and review what’s done</SDButton>
            </div>
          </Card>
        )}

        {step === 'review' && lib && (
          <>
            <CueReview rows={rows} excluded={excluded} onToggle={path => setExcluded(prev => {
              const next = new Set(prev);
              if (next.has(path)) next.delete(path); else next.add(path);
              return next;
            })} />

            <Card padding={24} style={{ marginTop: SD.s5 }}>
              <h2 style={h2}>Export options</h2>
              <label style={labelRow}>
                <span style={{ ...p, margin: 0, minWidth: 150 }}>Library location</span>
                <input value={root} onChange={e => setRoot(e.target.value)} placeholder="(system drive)"
                  style={inputStyle} aria-label="Library location" />
              </label>
              <p style={{ ...p, color: SD.textMuted, marginTop: SD.s2 }}>
                Where this library lives on the computer you’ll run Rekordbox on. Example track path:{' '}
                <code style={code}>{exampleLocation || '—'}</code>
              </p>
              <Check checked={loopsAsHotcue} onChange={setLoopsAsHotcue}
                label="Put saved loops on free hot cue pads (otherwise they become memory loops)" />
              <Check checked={dupMemory} onChange={setDupMemory}
                label="Also add each hot cue as a memory cue" />
              <Check checked={trackColours} onChange={setTrackColours} label="Carry track colours" />
              <div style={{ display: 'flex', gap: SD.s3, marginTop: SD.s5, flexWrap: 'wrap' }}>
                <SDButton onClick={exportXml} disabled={rows.length === excluded.size}>Download Rekordbox XML</SDButton>
                <SDButton ghost small onClick={() => setStep('select')}>Back</SDButton>
              </div>
            </Card>
          </>
        )}

        {step === 'done' && result && <DoneStep stats={result} onAgain={() => setStep('review')} />}
      </div>
    </div>
  );
}

// ── Save cue metadata so later SetLab exports can include cues ───────────────
async function saveCues(dbTracks: LibraryTrack[], scans: Map<string, ScannedFile>) {
  const byPath = new Map(dbTracks.filter(t => t.filePath).map(t => [t.filePath!, t]));
  const records = [...scans.entries()]
    .filter(([, s]) => (s.status === 'ok' || s.status === 'no-cues') && s.cues)
    .map(([path, s]) => ({
      filePath: path,
      artist: byPath.get(path)?.artist ?? '',
      title: byPath.get(path)?.title ?? '',
      fingerprint: s.fingerprint,
      sizeBytes: s.size,
      durationMs: s.durationMs,
      cues: s.cues,
    }));
  for (let i = 0; i < records.length; i += SAVE_CHUNK) {
    try {
      const res = await fetch('/api/cues/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: records.slice(i, i + SAVE_CHUNK) }),
      });
      if (res.status === 409) return; // no SetLab library yet — conversion still works
    } catch { return; }
  }
}

// ── Small pieces ─────────────────────────────────────────────────────────────

const h2: React.CSSProperties = { fontFamily: SD.display, fontSize: SD.t28, letterSpacing: 2, margin: `0 0 ${SD.s3}px`, fontWeight: 400 };
const p: React.CSSProperties = { fontFamily: SD.mono, fontSize: SD.t13, color: SD.text, lineHeight: 1.7, margin: `0 0 ${SD.s3}px` };
const code: React.CSSProperties = { fontFamily: SD.mono, fontSize: SD.t12, background: SD.surface3, padding: '1px 6px', borderRadius: SD.r1, wordBreak: 'break-all' };
const labelRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: SD.s3, flexWrap: 'wrap' };
const inputStyle: React.CSSProperties = {
  flex: '1 1 240px', minWidth: 0, background: SD.surface2, border: `1px solid ${SD.borderMid}`, borderRadius: SD.r2,
  color: SD.text, fontFamily: SD.mono, fontSize: SD.t13, padding: '9px 12px',
};

const STEP_LABELS: { id: Step[]; label: string }[] = [
  { id: ['pick'], label: 'Folder' },
  { id: ['select', 'scanning'], label: 'Scan' },
  { id: ['review'], label: 'Review' },
  { id: ['done'], label: 'Import' },
];

function Steps({ step }: { step: Step }) {
  const current = STEP_LABELS.findIndex(s => s.id.includes(step));
  return (
    <ol style={{ display: 'flex', gap: SD.s2, listStyle: 'none', padding: 0, margin: `0 0 ${SD.s6}px`, flexWrap: 'wrap' }}>
      {STEP_LABELS.map((s, i) => (
        <li key={s.label} aria-current={i === current ? 'step' : undefined} style={{
          fontFamily: SD.mono, fontSize: SD.t11, letterSpacing: 1.5, textTransform: 'uppercase',
          padding: '6px 12px', borderRadius: SD.r1,
          color: i === current ? '#000' : i < current ? SD.text : SD.textMuted,
          background: i === current ? SD.accent : i < current ? SD.surface3 : 'transparent',
          border: `1px solid ${i <= current ? 'transparent' : SD.border}`,
        }}>{i + 1}. {s.label}</li>
      ))}
    </ol>
  );
}

function ModeButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      textAlign: 'left', cursor: 'pointer', padding: '14px 18px', minWidth: 200, borderRadius: SD.r2,
      background: active ? SD.accentDim : SD.surface2,
      border: `1px solid ${active ? SD.accent : SD.border}`, color: SD.text,
    }}>
      <div style={{ fontFamily: SD.mono, fontSize: SD.t14, fontWeight: 700 }}>{title}</div>
      <div style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.textSec, marginTop: 4 }}>{sub}</div>
    </button>
  );
}

function CrateTree({ nodes, picked, onToggle, depth }: {
  nodes: CrateNode[]; picked: Set<string>; onToggle: (c: CrateNode) => void; depth: number;
}) {
  return (
    <>
      {nodes.map(n => (
        <div key={n.id}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: `6px 16px 6px ${16 + depth * 20}px`, fontFamily: SD.mono, fontSize: SD.t13,
          }}>
            <input type="checkbox" checked={picked.has(n.id)} onChange={() => onToggle(n)} />
            <span>{n.name}</span>
            <span style={{ color: SD.textMuted, fontSize: SD.t11 }}>{n.tracks.length || ''}</span>
          </label>
          {n.children.length > 0 && <CrateTree nodes={n.children} picked={picked} onToggle={onToggle} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
        style={{ height: 6, background: SD.surface3, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: '100%', height: '100%', background: SD.accent,
          transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform .2s',
        }} />
      </div>
      <div style={{ ...p, marginTop: SD.s3, color: SD.textSec }}>
        {done.toLocaleString()} of {total.toLocaleString()} tracks
      </div>
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginTop: SD.s3 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 4 }} />
      <span style={{ ...p, margin: 0 }}>{label}</span>
    </label>
  );
}

function DoneStep({ stats, onAgain }: { stats: ConvertStats; onAgain: () => void }) {
  return (
    <Card padding={32}>
      <h2 style={h2}>Your XML is downloading</h2>
      <p style={p}>
        <b>{stats.tracks.toLocaleString()}</b> tracks, <b>{stats.cues.toLocaleString()}</b> cues on{' '}
        <b>{stats.tracksWithCues.toLocaleString()}</b> tracks, <b>{stats.playlists}</b> playlists.
        {stats.streaming > 0 && <> {stats.streaming} streaming tracks stay in Serato.</>}
      </p>
      <h3 style={{ ...h2, fontSize: SD.t20, marginTop: SD.s6 }}>Import it into Rekordbox</h3>
      <ol style={{ ...p, paddingLeft: 20 }}>
        <li><b>Back up first:</b> File → Library → Backup Library.</li>
        <li>Open Preferences (the gear icon, top right) → <b>View</b> → Layout: tick <b>rekordbox xml</b>.</li>
        <li>Preferences → <b>Advanced</b> → Database → rekordbox xml → Imported Library: <b>Browse</b> to the downloaded file.</li>
        <li>In the sidebar, open <b>rekordbox xml</b> and click its refresh icon.</li>
        <li>Open <b>All Tracks</b>, select everything, right-click → <b>Import To Collection</b>. Then right-click the
          “Serato (SetLab)” folder under Playlists → <b>Import Playlist</b>.</li>
      </ol>
      <p style={{ ...p, color: SD.textSec }}>
        Tracks already in your Rekordbox collection: Import To Collection updates them, and their existing hot cues in
        the same pads may be replaced. When checking a cue, turn Quantize off so it isn’t snapped to the grid.
      </p>
      <SDButton ghost small onClick={onAgain}>Back to review</SDButton>
    </Card>
  );
}
