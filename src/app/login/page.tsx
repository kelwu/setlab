'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { SD } from '@/lib/setdrop/constants';
import { BRAND } from '@/lib/brand';
import { trackEvent } from '@/lib/analytics';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [redirectPath, setRedirectPath] = useState('/dashboard');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'auth_failed') setError('Authentication failed. Please try again.');
    if (params.get('mode') === 'signup') setMode('signup');
    // Preserve the destination the user came from (e.g. /builder). Same-origin paths only.
    const r = params.get('redirect');
    const safeR = r && r.startsWith('/') && !r.startsWith('//') ? r : null;
    if (safeR) setRedirectPath(safeR);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(safeR ?? '/dashboard');
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(redirectPath)}` },
    });
    if (error) { setError(error.message); setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'signup') {
      trackEvent.signupStarted('email');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(redirectPath)}` },
      });
      if (error) setError(error.message);
      // If email confirmation is disabled, signUp returns a live session — log in
      // immediately instead of telling the user to check an email that never comes.
      else if (data.session) {
        trackEvent.signUp('email');
        fetch('/api/auth/welcome', { method: 'POST' }).catch(() => {});
        router.push(redirectPath);
      }
      else { trackEvent.signUp('email'); setMessage('Check your email for a confirmation link.'); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push(redirectPath);
    }

    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: SD.surface2,
    border: `1px solid ${SD.border}`, borderRadius: 3,
    padding: '12px 14px', color: SD.text,
    fontFamily: SD.mono, fontSize: 13, outline: 'none',
    boxSizing: 'border-box', transition: 'border-color .15s',
  };

  return (
    <div style={{
      background: SD.bg, minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: SD.mono,
      backgroundImage: `
        linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
      `,
      backgroundSize: '60px 60px',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, margin: '0 20px',
        background: SD.surface, border: `1px solid ${SD.border}`,
        borderRadius: 4, padding: '40px 36px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: SD.display, fontSize: 32, letterSpacing: 4, color: SD.text,
          }}>
            {BRAND.logoLeft}<span style={{ color: SD.accent }}>{BRAND.logoRight}</span>
          </div>
          <div style={{ fontSize: 13, color: SD.textSec, letterSpacing: 1.5, marginTop: 6 }}>
            {mode === 'signin' ? 'SIGN IN TO CONTINUE' : 'CREATE YOUR ACCOUNT'}
          </div>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          type="button"
          style={{
            width: '100%', padding: '12px', marginBottom: 20,
            background: SD.surface2, border: `1px solid ${SD.borderMid}`,
            borderRadius: 3, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontFamily: SD.mono, fontSize: 12, color: SD.text,
            letterSpacing: 1, transition: 'border-color .15s, background .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = SD.accent; e.currentTarget.style.background = SD.surface3; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = SD.borderMid; e.currentTarget.style.background = SD.surface2; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: SD.border }} />
          <span style={{ fontFamily: SD.mono, fontSize: 12, color: SD.textMuted, letterSpacing: 1 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: SD.border }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: SD.textSec, letterSpacing: 1.5, marginBottom: 6 }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = SD.borderMid)}
              onBlur={e => (e.target.style.borderColor = SD.border)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: SD.textSec, letterSpacing: 1.5, marginBottom: 6 }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = SD.borderMid)}
              onBlur={e => (e.target.style.borderColor = SD.border)}
            />
          </div>

          {error && (
            <div style={{
              background: SD.redDim, border: `1px solid ${SD.red}33`,
              borderRadius: 3, padding: '10px 14px',
              fontSize: 12, color: SD.red,
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              background: SD.greenDim, border: `1px solid ${SD.green}33`,
              borderRadius: 3, padding: '10px 14px',
              fontSize: 12, color: SD.green,
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', marginTop: 4,
              background: loading ? SD.surface3 : SD.accent,
              color: loading ? SD.textSec : '#000',
              border: 'none', borderRadius: 3, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: SD.mono, fontSize: 13, fontWeight: 700,
              letterSpacing: 1.5, textTransform: 'uppercase',
              transition: 'background .15s',
            }}
          >
            {loading ? 'LOADING...' : mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div style={{
          textAlign: 'center', marginTop: 24,
          fontSize: 13, color: SD.textSec,
        }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }}
            style={{ color: SD.accent, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {mode === 'signin' ? 'Sign Up' : 'Sign In'}
          </span>
        </div>

        <div style={{
          textAlign: 'center', marginTop: 20,
          fontSize: 13, color: SD.textMuted,
        }}>
          <span
            onClick={() => router.push('/')}
            style={{ cursor: 'pointer' }}
          >
            ← Back to home
          </span>
        </div>
      </div>
    </div>
  );
}
