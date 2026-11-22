'use client';

import React, { useState } from 'react';
import { SD } from '@/lib/setdrop/constants';
import { trackEvent } from '@/lib/analytics';
import { PRO_PRICE_LABEL } from '@/lib/setdrop/export-quota';

/**
 * Sends the user straight to Stripe Checkout for Pro, using the same
 * /api/checkout route as the Account page. Falls back to /account if
 * checkout can't start, so the user still lands somewhere they can upgrade.
 */
export function UpgradeButton({ source, label }: { source: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    trackEvent.upgradeClicked(source);
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { url?: string };
      window.location.href = data.url ?? '/account';
    } catch {
      window.location.href = '/account';
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      style={{
        fontFamily: SD.mono, fontSize: SD.t11, letterSpacing: 1.5,
        textTransform: 'uppercase', fontWeight: 700,
        color: '#000', background: SD.accent,
        border: 'none', borderRadius: SD.r1, padding: '6px 12px',
        cursor: loading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Opening checkout…' : (label ?? `Upgrade to Pro · ${PRO_PRICE_LABEL}`)}
    </button>
  );
}

/**
 * Free-tier "exports left" line shown after a successful export. Adds an
 * upgrade button once the last free export is used. Renders nothing for Pro.
 */
export function ExportQuotaNote({ note, lastFree, source }: { note?: string | null; lastFree?: boolean; source: string }) {
  if (!note) return null;
  return (
    <div style={{
      margin: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted,
    }}>
      <span>{note}</span>
      {lastFree && <UpgradeButton source={source} />}
    </div>
  );
}
