// Scan one audio file for Serato cues. Pure and environment-neutral: the Web
// Worker runs it over a folder pick in the browser, and tests/scripts run it in
// Node against real files.

import { fileByteSource } from './bytes';
import { readSeratoMp3Cues } from './serato/read';
import { TrackCues } from './types';

export type ScanStatus = 'ok' | 'no-cues' | 'unsupported' | 'error';

export interface ScannedFile {
  /** Path relative to the picked folder, as the browser reports it. */
  relPath: string;
  size: number;
  lastModified: number;
  fingerprint: string;
  status: ScanStatus;
  /** Present for 'ok' and 'no-cues' (comment/colour can exist without cues). */
  cues?: TrackCues;
  durationMs?: number;
  error?: string;
}

/** Change detector for re-scans: Serato rewrites the file's tags when cues
 *  change, which moves its mtime (and usually its size). */
export function fingerprintOf(size: number, lastModified: number): string {
  return `${size}:${lastModified}`;
}

export function isMp3(name: string): boolean {
  return /\.mp3$/i.test(name);
}

export async function scanFile(file: Blob, relPath: string, lastModified: number): Promise<ScannedFile> {
  const base = { relPath, size: file.size, lastModified, fingerprint: fingerprintOf(file.size, lastModified) };
  if (!isMp3(relPath)) return { ...base, status: 'unsupported' };
  try {
    const { cues, durationMs } = await readSeratoMp3Cues(fileByteSource(file), relPath);
    return { ...base, status: cues.cues.length ? 'ok' : 'no-cues', cues, durationMs };
  } catch (e) {
    return { ...base, status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
