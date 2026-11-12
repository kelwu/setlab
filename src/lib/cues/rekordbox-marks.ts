// Render a neutral CuePoint list as Rekordbox <POSITION_MARK> elements.
//
// Rekordbox XML (plan §2 "Rekordbox XML"):
//   <POSITION_MARK Name Type Start [End] Num Red Green Blue/>
//     Type: 0 = cue, 4 = loop.
//     Start/End: seconds, float, ALWAYS '.' as the decimal separator.
//     Num:  0-7 = hot cue A-H;  -1 = memory cue / memory loop.
//     Red/Green/Blue: 0-255. Not in the official spec but present in real
//       rekordbox 5/6/7 exports, so we always write them when we have a colour.

import { CuePoint } from './types';

export interface MarkOptions {
  /** Put saved loops into free hot-cue slots instead of memory loops. Default
   *  (false) keeps loops as memory loops so no hot cue is ever displaced —
   *  plan §7a decision 6. */
  loopsAsHotcue?: boolean;
  /** Also emit each hot cue a second time as a memory cue (a common Rekordbox
   *  habit so cues show on the waveform overview). Default false. */
  duplicateHotCuesAsMemory?: boolean;
}

// Characters XML 1.0 forbids outright (C0 controls other than tab/LF/CR, and
// lone surrogates). Track titles occasionally carry them from bad tags, and a
// single one makes Rekordbox reject the whole file.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function escapeXmlAttr(s: string): string {
  return s
    .replace(XML_INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sec(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function colorAttrs(cue: CuePoint): string {
  if (!cue.color) return '';
  return ` Red="${cue.color.r}" Green="${cue.color.g}" Blue="${cue.color.b}"`;
}

function oneMark(cue: CuePoint, num: number, type: 0 | 4): string {
  const end = type === 4 && cue.endMs != null ? ` End="${sec(cue.endMs)}"` : '';
  return `      <POSITION_MARK Name="${escapeXmlAttr(cue.name ?? '')}" Type="${type}" `
    + `Start="${sec(cue.startMs)}"${end} Num="${num}"${colorAttrs(cue)}/>`;
}

/** One CuePoint → one or more POSITION_MARK lines. */
export function cueToPositionMarks(cue: CuePoint, opts: MarkOptions = {}): string[] {
  const lines: string[] = [];
  if (cue.kind === 'loop') {
    const num = opts.loopsAsHotcue && cue.slot != null ? cue.slot : -1;
    lines.push(oneMark(cue, num, 4));
  } else if (cue.kind === 'memory') {
    lines.push(oneMark(cue, -1, 0));
  } else {
    // hot cue
    const num = cue.slot ?? -1;
    lines.push(oneMark(cue, num, 0));
    if (opts.duplicateHotCuesAsMemory) lines.push(oneMark(cue, -1, 0));
  }
  return lines;
}

export function cuesToPositionMarks(cues: CuePoint[], opts: MarkOptions = {}): string {
  return cues.flatMap(c => cueToPositionMarks(c, opts)).join('\n');
}
