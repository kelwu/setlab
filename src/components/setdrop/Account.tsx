'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SD } from '@/lib/setdrop/constants';
import { SDButton } from './shared';
import { createClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand';
import { trackEvent } from '@/lib/analytics';
import { clearLibraryCaches } from '@/lib/setdrop/library-cache';

interface AccountProps {
  email: string;
  tier: string;
  exportsUsed: number;
  limit: number;
  hasStripeCustomer: boolean;
  upgraded: boolean;
}

export function Account({ email, tier, exportsUsed, limit, hasStripeCustomer, upgraded }: AccountProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<'upgrade' | 'billing' | 'signout' | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await fetch('/api/account/delete', { method: 'POST' });
      localStorage.clear();
      window.location.href = '/';
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleUpgrade = async () => {
    trackEvent.upgradeClicked('account');
    setLoading('upgrade');
    setStripeError(null);
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const text = await res.text();
      const data = text ? JSON.parse(text) as { url?: string; error?: string } : {};
      if (data.url) window.location.href = data.url;
      else { setStripeError(data.error ?? `Server error (${res.status})`); setLoading(null); }
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : 'Request failed');
      setLoading(null);
    }
  };

  const handleBillingPortal = async () => {
    setLoading('billing');
    try {
      const res = await fetch('/api/billing-portal', { method: 'POST' });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
      else setLoading(null);
    } catch {
      setLoading(null);
    }
  };

  const handleSignOut = async () => {
    setLoading('signout');
    const supabase = createClient();
    clearLibraryCaches(); // the next account on this browser starts clean
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isPro = tier === 'pro';
  const usagePct = limit > 0 ? Math.min((exportsUsed / limit) * 100, 100) : 0;
  const usageColor = usagePct >= 100 ? SD.red : usagePct >= 80 ? SD.yellow : SD.accent;

  return (
    <div style={{ background: SD.bg, minHeight: '100vh', paddingTop: 56, color: SD.text }}>
      <div className="sd-pad-x sd-inner-pad" style={{ maxWidth: 600, margin: '0 auto', padding: '48px 40px' }}>

        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Your Account</div>
          <h1 style={{ fontFamily: SD.display, fontSize: 52, letterSpacing: 4,
            margin: 0, color: SD.text, lineHeight: 1 }}>ACCOUNT</h1>
        </div>

        {upgraded && (
          <div style={{ marginBottom: 24, padding: '16px 20px',
            background: SD.greenDim, border: `1px solid ${SD.green}44`,
            borderRadius: 4, fontFamily: SD.mono, fontSize: 12, color: SD.green }}>
            ✓ You&apos;re now on {BRAND.name} Pro. Enjoy unlimited exports.
          </div>
        )}

        {/* Plan card */}
        <div style={{ background: SD.surface,
          border: `1px solid ${isPro ? SD.accent + '55' : SD.border}`,
          borderRadius: 4, padding: '24px', marginBottom: 16 }}>

          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textMuted,
              letterSpacing: 2, textTransform: 'uppercase' }}>Plan</div>
            <span style={{
              fontFamily: SD.mono, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase',
              padding: '4px 12px', borderRadius: 2,
              background: isPro ? SD.accentDim : SD.surface2,
              border: `1px solid ${isPro ? SD.accent + '66' : SD.border}`,
              color: isPro ? SD.accent : SD.textSec,
            }}>
              {isPro ? 'Pro' : 'Free'}
            </span>
          </div>

          {/* Usage */}
          {isPro ? (
            <div style={{ fontFamily: SD.mono, fontSize: 13, color: SD.textSec }}>
              Unlimited exports · unlimited set &amp; crate generation
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontFamily: SD.mono, fontSize: 13, color: SD.textSec }}>
                  Exports this month
                </span>
                <span style={{ fontFamily: SD.mono, fontSize: 13,
                  color: usagePct >= 100 ? SD.red : SD.text }}>
                  {exportsUsed}<span style={{ color: SD.textMuted, fontSize: 13 }}>/{limit}</span>
                </span>
              </div>
              <div style={{ height: 4, background: SD.surface2, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${usagePct}%`,
                  background: usageColor,
                  transition: 'width .4s ease',
                }} />
              </div>
              <div style={{ fontFamily: SD.mono, fontSize: 11, color: SD.textMuted, marginTop: 8 }}>
                Building sets &amp; crates is unlimited — only exports count. Extra formats of the same set are free.
              </div>
            </div>
          )}

          {!isPro && (
            <div style={{ borderTop: `1px solid ${SD.border}`, paddingTop: 20, marginTop: 4 }}>
              <div style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textMuted,
                lineHeight: 1.8, marginBottom: 16 }}>
                Pro includes unlimited exports and unlimited set &amp; crate generation. Free includes {limit} exports/month.
              </div>
              <SDButton
                onClick={handleUpgrade}
                style={{ fontSize: 12, padding: '12px 32px',
                  opacity: loading === 'upgrade' ? 0.6 : 1,
                  pointerEvents: loading ? 'none' : 'auto' }}>
                {loading === 'upgrade' ? 'Redirecting to Stripe...' : 'Upgrade to Pro →'}
              </SDButton>
              {stripeError && (
                <div style={{ marginTop: 12, fontFamily: SD.mono, fontSize: 12, color: SD.red }}>
                  Error: {stripeError}
                </div>
              )}
            </div>
          )}

          {isPro && (
            <div style={{ borderTop: `1px solid ${SD.border}`, paddingTop: 20, marginTop: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12 }}>
              <span style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textMuted }}>
                Billing managed via Stripe
              </span>
              {hasStripeCustomer && (
                <SDButton ghost onClick={handleBillingPortal}
                  style={{ fontSize: 13, opacity: loading === 'billing' ? 0.6 : 1,
                    pointerEvents: loading ? 'none' : 'auto' }}>
                  {loading === 'billing' ? 'Opening...' : 'Manage Billing ↗'}
                </SDButton>
              )}
            </div>
          )}
        </div>

        {/* Profile card */}
        <div style={{ background: SD.surface, border: `1px solid ${SD.border}`,
          borderRadius: 4, padding: '24px' }}>
          <div style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>Profile</div>
          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textSec,
              wordBreak: 'break-all' }}>{email}</span>
            <SDButton ghost onClick={handleSignOut}
              style={{ fontSize: 13, color: SD.red,
                borderColor: `${SD.red}44`,
                opacity: loading === 'signout' ? 0.6 : 1,
                pointerEvents: loading ? 'none' : 'auto' }}>
              {loading === 'signout' ? 'Signing out...' : 'Sign Out'}
            </SDButton>
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ marginTop: 16, borderTop: `1px solid ${SD.border}`, paddingTop: 24 }}>
          <div style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>Danger Zone</div>
          {!showDeleteConfirm ? (
            <SDButton ghost onClick={() => setShowDeleteConfirm(true)}
              style={{ fontSize: 12, padding: '7px 16px', color: SD.danger, borderColor: SD.danger + '4D' }}>
              Delete Account
            </SDButton>
          ) : (
            <div style={{ background: SD.dangerDim, border: `1px solid ${SD.danger}40`,
              borderRadius: 4, padding: '20px 24px' }}>
              <div style={{ fontFamily: SD.mono, fontSize: 13, color: SD.text, marginBottom: 8 }}>
                Delete your account?
              </div>
              <div style={{ fontFamily: SD.mono, fontSize: 13, color: SD.textSec, marginBottom: 20, lineHeight: 1.7 }}>
                This permanently deletes your library, setlists, wishlist, and gig history. This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <SDButton onClick={handleDeleteAccount}
                  style={{ fontSize: 13, background: SD.danger + '26',
                    borderColor: SD.danger + '66', color: SD.danger,
                    opacity: deleting ? 0.6 : 1, pointerEvents: deleting ? 'none' : 'auto' }}>
                  {deleting ? 'Deleting...' : 'Yes, delete everything'}
                </SDButton>
                <SDButton ghost onClick={() => setShowDeleteConfirm(false)} style={{ fontSize: 13 }}>
                  Cancel
                </SDButton>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
