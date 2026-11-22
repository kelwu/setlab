import { describe, expect, it } from 'vitest';
import { exportsLeftNote, PRO_PRICE_LABEL } from '../export-quota';

describe('exportsLeftNote', () => {
  it('shows nothing for unlimited plans', () => {
    expect(exportsLeftNote(null, null)).toBeNull();
    expect(exportsLeftNote(5, null)).toBeNull();
    expect(exportsLeftNote(undefined, 3)).toBeNull();
  });

  it('counts down the free exports left', () => {
    expect(exportsLeftNote(2, 3)).toBe('2 of 3 free exports left this month.');
    expect(exportsLeftNote(1, 3)).toBe('1 of 3 free exports left this month.');
  });

  it('flags the last free export with the Pro price', () => {
    expect(exportsLeftNote(0, 3)).toBe(`That was your last free export this month. Pro is unlimited for ${PRO_PRICE_LABEL}.`);
  });

  it('does not call a free re-export the last one', () => {
    expect(exportsLeftNote(0, 3, false)).toBe('0 of 3 free exports left this month.');
  });

  it('clamps out-of-range counts', () => {
    expect(exportsLeftNote(-1, 3)).toContain('last free export');
    expect(exportsLeftNote(9, 3)).toContain('3 of 3');
  });
});
