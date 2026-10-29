// Reconcile the modern Markers2 cues with the legacy Markers_ block.
//
// Mixxx precedence (plan §2): for hot cues 0-4 the legacy block wins on
// position; a cue present in Markers2 but *unset* in Markers_ is treated as
// deleted and dropped. Cues 5-7, loops, names and colours all come from
// Markers2. When there is no legacy block, Markers2 is taken as-is.

import { CuePoint } from '../types';
import { LegacyCue } from './markers';
import { Markers2Result } from './markers2';

export function mergeSeratoCues(m2: Markers2Result, legacy: { cues: LegacyCue[] } | null): CuePoint[] {
  if (!legacy) return m2.cues;

  const bySlot = new Map<number, LegacyCue>();
  for (const c of legacy.cues) bySlot.set(c.slot, c);

  const out: CuePoint[] = [];
  for (const cue of m2.cues) {
    // Only hot cues in the legacy range (0-4) are subject to override/deletion.
    if (cue.kind === 'hotcue' && cue.slot != null && bySlot.has(cue.slot)) {
      const leg = bySlot.get(cue.slot)!;
      if (!leg.set) continue;                       // deleted in Serato — drop it
      out.push({ ...cue, startMs: leg.startMs });    // legacy position wins
    } else {
      out.push(cue);
    }
  }
  return out;
}
