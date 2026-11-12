// Read Serato `.crate` files and rebuild the crate tree.
//
// A .crate uses the same tag container as `database V2`: `vrsn`, column/sort
// tags (`osrt`, `ovct`), then one `otrk` per track holding a `ptrk` path
// (UTF-16BE, volume-relative, no leading slash). Nesting is NOT stored inside
// the file — it lives in the filename: `Parent%%Child%%Grandchild.crate`.
// A parent crate can hold tracks itself as well as having children.

import { stripBom, tagString16, walkSeratoTags } from './tags';

/** Track paths in a .crate, in Serato's stored order. */
export function parseSeratoCrate(bytes: Uint8Array): string[] {
  const top = walkSeratoTags(stripBom(bytes));
  const paths: string[] = [];
  for (const otrk of top.get('otrk') ?? []) {
    const p = tagString16(walkSeratoTags(otrk), 'ptrk');
    if (p) paths.push(p);
  }
  return paths;
}

/** `Parent%%Child.crate` → ['Parent', 'Child']. */
export function crateNamePath(filename: string): string[] {
  const base = filename.replace(/^.*[/\\]/, '').replace(/\.crate$/i, '');
  return base.split('%%').filter(Boolean);
}

export interface CrateNode {
  /** Full nesting path, Serato-style ("Parent%%Child") — unique per crate. */
  id: string;
  name: string;
  /** Track paths stored directly in this crate (may be empty for pure folders). */
  tracks: string[];
  children: CrateNode[];
}

/**
 * Build the crate tree from parsed crate files. Parents that have no .crate of
 * their own (only children) are created as empty folders. Siblings keep the
 * order the files were given in, so pass them sorted the way you want shown.
 */
export function buildCrateTree(crates: { filename: string; tracks: string[] }[]): CrateNode[] {
  const roots: CrateNode[] = [];
  for (const { filename, tracks } of crates) {
    const path = crateNamePath(filename);
    if (!path.length) continue;
    let level = roots;
    let node: CrateNode | undefined;
    path.forEach((name, depth) => {
      node = level.find(n => n.name === name);
      if (!node) {
        node = { id: path.slice(0, depth + 1).join('%%'), name, tracks: [], children: [] };
        level.push(node);
      }
      level = node.children;
    });
    node!.tracks = tracks;
  }
  return roots;
}

/** Depth-first list of every crate in the tree. */
export function flattenCrates(tree: CrateNode[]): CrateNode[] {
  return tree.flatMap(n => [n, ...flattenCrates(n.children)]);
}

/**
 * Keep only the selected crates. Ancestors of a selected crate stay as plain
 * folders (their own tracks dropped unless they're selected too), so the
 * exported playlist tree keeps its Serato nesting.
 */
export function pruneCrateTree(tree: CrateNode[], selected: Set<string>): CrateNode[] {
  const out: CrateNode[] = [];
  for (const n of tree) {
    const children = pruneCrateTree(n.children, selected);
    const keep = selected.has(n.id);
    if (keep || children.length) out.push({ ...n, tracks: keep ? n.tracks : [], children });
  }
  return out;
}
