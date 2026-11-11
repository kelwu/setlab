#!/usr/bin/env tsx
/**
 * Phase 0 cue probe (local-only; never shipped, never imported by the app).
 *
 * Runs the real Serato cue reader over a folder (or a single file) of your MP3s,
 * prints what it found — cues, timing case, sample rate, the LAME CRC it checked
 * — and emits a Rekordbox XML you can import into a BACKED-UP / throwaway
 * rekordbox 7.2.19 collection to measure the true position offset per case.
 *
 * The XML writes RAW Serato positions on purpose: import it, then compare each
 * cue's position in Rekordbox against Serato to read off the real delta. The
 * console also prints the position our offset hypothesis WOULD produce, so you
 * can see at a glance whether the prediction matches the measurement.
 *
 * Usage:
 *   npx tsx scripts/cue-probe.ts <folder-or-file> [--out probe.xml] [--limit 50]
 */

import { open, readdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, basename, extname, resolve } from 'node:path';
import type { ByteSource } from '../src/lib/cues/bytes';
import { readSeratoMp3Cues } from '../src/lib/cues/serato/read';
import { seratoToRekordboxOffsetMs, convertSeratoToRekordbox } from '../src/lib/cues/offset';
import { cuesToPositionMarks } from '../src/lib/cues/rekordbox-marks';
import { rgbToHex } from '../src/lib/cues/colors';
import type { TrackCues } from '../src/lib/cues/types';

function parseArgs(argv: string[]) {
  const out = { target: '', outFile: 'cue-probe.xml', limit: 200, offset: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.outFile = argv[++i];
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10) || out.limit;
    else if (a === '--offset') out.offset = true; // apply the predicted Serato→Rekordbox shift
    else if (!a.startsWith('--')) out.target = a;
  }
  return out;
}

async function collectMp3s(target: string, limit: number): Promise<string[]> {
  const st = await stat(target);
  if (st.isFile()) return [target];
  const found: string[] = [];
  async function walk(dir: string) {
    if (found.length >= limit) return;
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (found.length >= limit) return;
      const p = join(dir, ent.name);
      // Skip macOS debris on drives that lived on a Mac: "._x.mp3" AppleDouble
      // stubs (not audio) and .Trashes / dot-folders.
      if (ent.name.startsWith('.')) continue;
      if (ent.isDirectory()) { if (ent.name !== '_Serato_') await walk(p); }
      else if (extname(ent.name).toLowerCase() === '.mp3') found.push(p);
    }
  }
  await walk(target);
  return found;
}

async function nodeByteSource(filePath: string): Promise<{ src: ByteSource; close: () => Promise<void> }> {
  const fh = await open(filePath, 'r');
  const { size } = await fh.stat();
  return {
    src: {
      size,
      async read(start: number, end: number) {
        const len = Math.max(0, end - start);
        const buf = Buffer.allocUnsafe(len);
        const { bytesRead } = await fh.read(buf, 0, len, start);
        return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
      },
    },
    close: () => fh.close(),
  };
}

// file:// URL with the Windows drive colon kept literal — same rule as the app's
// toRekordboxLocation (C%3A doesn't resolve in Rekordbox).
function toFileUrl(abs: string): string {
  let p = abs.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(p)) p = '/' + p;
  if (!p.startsWith('/')) p = '/' + p;
  const enc = p.split('/')
    .map(seg => (seg === '' ? '' : /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/');
  return 'file://localhost' + enc;
}

// Real track metadata for the XML. Rekordbox drops (or never shows) position marks
// on a TRACK with TotalTime="0" and no Kind/Size, so fill them from ffprobe when
// it's installed; fall back to zeros (old behaviour) when it isn't.
function trackMeta(file: string, bytes: number): { totalTime: number; artist: string; title: string; size: number } {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags=artist,title', '-of', 'json', file], { encoding: 'utf8' });
    const f = (JSON.parse(out) as { format?: { duration?: string; tags?: { artist?: string; title?: string } } }).format ?? {};
    return { totalTime: Math.round(Number(f.duration) || 0), artist: f.tags?.artist ?? '', title: f.tags?.title ?? '', size: bytes };
  } catch {
    return { totalTime: 0, artist: '', title: '', size: bytes };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ms = (n: number) => `${(n / 1000).toFixed(3)}s`;

async function main() {
  const { target, outFile, limit, offset } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error('Usage: npx tsx scripts/cue-probe.ts <folder-or-file> [--out probe.xml] [--limit N]');
    process.exit(1);
  }

  const files = await collectMp3s(resolve(target), limit);
  console.log(`\nScanning ${files.length} MP3${files.length === 1 ? '' : 's'} under ${resolve(target)}\n`);

  const caseCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, '-': 0 };
  const collection: string[] = [];
  const playlist: string[] = [];
  let id = 1;

  for (const file of files) {
    const { src, close } = await nodeByteSource(file);
    try {
      const { cues: track, frame } = await readSeratoMp3Cues(src, basename(file));
      const tc = frame?.timingCase ?? '-';
      caseCounts[tc] = (caseCounts[tc] ?? 0) + 1;
      const predicted = seratoToRekordboxOffsetMs(track.mp3);

      console.log(`• ${basename(file)}`);
      console.log(`    frame: case ${tc} · ${frame?.sampleRate ?? '?'} Hz · ${frame?.encoder ?? 'no LAME'}`
        + (frame?.storedCrc != null ? ` · CRC stored=0x${frame.storedCrc.toString(16)} computed=0x${frame.computedCrc?.toString(16)}` : ''));
      console.log(`    predicted offset: ${predicted.toFixed(1)} ms${track.trackColor ? ` · track colour #${rgbToHex(track.trackColor)}` : ''}`);
      if (!track.cues.length) { console.log('    (no cues)\n'); continue; }
      for (const c of track.cues) {
        const slot = c.slot != null ? `#${c.slot}` : 'mem';
        const col = c.color ? ` #${rgbToHex(c.color)}` : '';
        const adj = Math.max(0, c.startMs + predicted);
        console.log(`    ${c.kind.padEnd(6)} ${slot.padEnd(4)} ${ms(c.startMs)} (→ ${ms(adj)})${col}  ${c.name ?? ''}`);
      }
      console.log('');

      addToXml(track, file, id++, collection, playlist, offset, trackMeta(file, src.size));
    } catch (err) {
      console.log(`! ${basename(file)}: ${(err as Error).message}\n`);
    } finally {
      await close();
    }
  }

  const xml = buildXml(collection, playlist, offset);
  const outPath = resolve(outFile);
  await writeFile(outPath, xml, 'utf8');

  console.log('── summary ───────────────────────────────');
  console.log(`timing cases: A=${caseCounts.A} B=${caseCounts.B} C=${caseCounts.C} D=${caseCounts.D} none=${caseCounts['-']}`);
  console.log(`tracks with cues in XML: ${collection.length}`);
  console.log(`\nWrote ${outPath} (${offset ? 'OFFSET-applied' : 'RAW'} positions)`);
  if (offset) console.log('Cues shifted by the predicted Serato→Rekordbox correction.');
  else console.log('RAW Serato positions — compare each cue to Serato to measure the real offset.');
  console.log('Import into a BACKED-UP rekordbox 7.2.19.\n');
}

function addToXml(
  track: TrackCues, file: string, trackId: number, collection: string[], playlist: string[], offset: boolean,
  meta: { totalTime: number; artist: string; title: string; size: number },
) {
  if (!track.cues.length) return;
  const name = esc(basename(file, extname(file)));
  const cues = offset ? convertSeratoToRekordbox(track.cues, track.mp3) : track.cues;
  const marks = cuesToPositionMarks(cues); // loops as memory loops
  collection.push(
    `    <TRACK TrackID="${trackId}" Name="${name}" Artist="${esc(meta.artist)}" Kind="MP3 File" `
    + `Size="${meta.size}" TotalTime="${meta.totalTime}" SampleRate="${track.mp3?.sampleRate ?? 44100}" `
    + `Location="${esc(toFileUrl(file))}"${track.trackColor ? ` Colour="0x${rgbToHex(track.trackColor)}"` : ''}>\n`
    + marks + `\n    </TRACK>`,
  );
  playlist.push(`        <TRACK Key="${trackId}"/>`);
}

function buildXml(collection: string[], playlist: string[], offset: boolean): string {
  const nodeName = `Serato Cue Probe (${offset ? 'offset' : 'raw'})`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="AlphaTheta"/>
  <COLLECTION Entries="${collection.length}">
${collection.join('\n')}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${nodeName}" Type="1" KeyType="0" Entries="${playlist.length}">
${playlist.join('\n')}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;
}

main().catch(err => { console.error(err); process.exit(1); });
