// Web Worker: scan picked files for Serato cues off the main thread.
//
// Input:  { type: 'scan', jobs: { file: File; relPath: string }[] }
// Output: { type: 'progress', done, total } every PROGRESS_EVERY files,
//         { type: 'results', results: ScannedFile[] } in chunks,
//         { type: 'done' } at the end.
// Only tag slices are read (see readSeratoMp3Cues), never whole files, so a
// 15k-track library stays at a few MB of memory.

import { scanFile, ScannedFile } from './scan';

const CONCURRENCY = 8;
const PROGRESS_EVERY = 25;
const RESULT_CHUNK = 200;

interface Job { file: File; relPath: string }

let cancelled = false;

async function run(jobs: Job[]) {
  cancelled = false;
  let next = 0;
  let done = 0;
  let pending: ScannedFile[] = [];

  const flush = () => {
    if (!pending.length) return;
    postMessage({ type: 'results', results: pending });
    pending = [];
  };

  const lane = async () => {
    while (!cancelled && next < jobs.length) {
      const { file, relPath } = jobs[next++];
      pending.push(await scanFile(file, relPath, file.lastModified));
      done++;
      if (pending.length >= RESULT_CHUNK) flush();
      if (done % PROGRESS_EVERY === 0) postMessage({ type: 'progress', done, total: jobs.length });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, lane));
  flush();
  postMessage({ type: 'progress', done, total: jobs.length });
  postMessage({ type: cancelled ? 'cancelled' : 'done' });
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: 'scan'; jobs: Job[] } | { type: 'cancel' };
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type === 'scan') run(msg.jobs).catch(err => postMessage({ type: 'error', error: String(err) }));
};
