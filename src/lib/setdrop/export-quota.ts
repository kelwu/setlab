// Pure helpers for the free-tier export quota. Kept free of browser/analytics
// imports so they can be unit-tested.

/** Price shown on in-app upgrade buttons. Keep in sync with the Stripe Pro price. */
export const PRO_PRICE_LABEL = '$12/mo';

/**
 * The line shown after a successful export. `limit` null means unlimited
 * (Pro or beta), which gets no line. `remaining` is what's left this month
 * after this export. `counted` is false when the export was a re-export of an
 * item already counted this month (those are free), so it can't be "the last".
 */
export function exportsLeftNote(
  remaining: number | null | undefined,
  limit: number | null | undefined,
  counted = true,
): string | null {
  if (limit == null || remaining == null) return null;
  const left = Math.max(0, Math.min(remaining, limit));
  if (left === 0 && counted) return `That was your last free export this month. Pro is unlimited for ${PRO_PRICE_LABEL}.`;
  return `${left} of ${limit} free export${limit === 1 ? '' : 's'} left this month.`;
}
