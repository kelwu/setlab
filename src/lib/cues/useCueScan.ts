'use client';

// React hook around scan.worker.ts. One worker per hook instance, created on
// first scan and terminated on unmount.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScannedFile } from './scan';

export interface ScanJob { file: File; relPath: string }

export interface CueScanProgress { done: number; total: number }

export function useCueScan() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<CueScanProgress | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  const scan = useCallback((jobs: ScanJob[]): Promise<ScannedFile[]> => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
    }
    const worker = workerRef.current;
    setRunning(true);
    setProgress({ done: 0, total: jobs.length });

    return new Promise((resolve, reject) => {
      const results: ScannedFile[] = [];
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'progress') setProgress({ done: m.done, total: m.total });
        else if (m.type === 'results') results.push(...m.results);
        else if (m.type === 'done' || m.type === 'cancelled') { setRunning(false); resolve(results); }
        else if (m.type === 'error') { setRunning(false); reject(new Error(m.error)); }
      };
      worker.onerror = (e) => { setRunning(false); reject(new Error(e.message || 'Cue scan worker failed')); };
      worker.postMessage({ type: 'scan', jobs });
    });
  }, []);

  /** Stop early; the pending scan() resolves with what was scanned so far. */
  const cancel = useCallback(() => { workerRef.current?.postMessage({ type: 'cancel' }); }, []);

  return { scan, cancel, progress, running };
}
