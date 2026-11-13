'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { SD, ConfidenceStatus, SampleTrack, TrackStores, orderedStores } from '@/lib/setdrop/constants';
import { BRAND } from '@/lib/brand';
import { AnnouncementBanner } from '@/components/setdrop/AnnouncementBanner';

// ─── Nav ───────────────────────────────────────────────────────────────────
export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        supabase.from('users').upsert({ id: user.id, email: user.email }, { onConflict: 'id' });
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const initials = user?.email ? user.email[0].toUpperCase() : 'DJ';

  const links = [
    { id:'dashboard', label:'Dashboard' },
    { id:'builder', label:'Plan Set' },
    { id:'crates', label:'Crates' },
    { id:'id', label:'Track ID' },
    { id:'explore', label:'Explore' },
    { id:'library', label:'Library' },
  ];
  const mobileNavItems = [
    { id:'dashboard', label:'Dash',     icon:'⊞' },
    { id:'builder',   label:'Plan',     icon:'≣' },
    { id:'crates',    label:'Crates',   icon:'▦' },
    { id:'id',        label:'Track ID', icon:'◎' },
    { id:'explore',   label:'Explore',  icon:'◉' },
    { id:'library',   label:'Library',  icon:'♬' },
  ];

  return (
    <>
      <AnnouncementBanner />
      <nav className="sd-pad-x" style={{
        position:'fixed', top:0, left:0, right:0, zIndex:200,
        height:56, display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 40px',
        background:'rgba(10,10,10,0.96)', backdropFilter:'blur(16px)',
        borderBottom:`1px solid ${SD.border}`,
      }}>
        <span onClick={() => router.push('/')} style={{
          fontFamily:SD.display, fontSize:26, letterSpacing:4, cursor:'pointer', color:SD.text,
          display:'flex', alignItems:'center', gap:8,
        }}>
          <span>{BRAND.logoLeft}<span style={{ color:SD.accent }}>{BRAND.logoRight}</span></span>
          <span style={{
            fontFamily:SD.mono, fontSize:9, letterSpacing:2, textTransform:'uppercase',
            color:SD.info, background:SD.infoDim, border:`1px solid ${SD.info}44`,
            borderRadius:3, padding:'2px 6px', lineHeight:1, alignSelf:'center',
          }}>BETA</span>
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div className="sd-nav-links" style={{ display:'flex', alignItems:'center', gap:36, marginRight:12 }}>
            {links.map(l => (
              <Link key={l.id} href={'/' + l.id} style={{
                fontFamily:SD.mono, fontSize:13, letterSpacing:1.5,
                textTransform:'uppercase', cursor:'pointer', textDecoration:'none',
                color: pathname === '/' + l.id ? SD.accent : SD.textSec,
                borderBottom: pathname === '/' + l.id ? `1px solid ${SD.accent}` : '1px solid transparent',
                paddingBottom:2, transition:'color .15s',
              }}>{l.label}</Link>
            ))}
            <SDButton onClick={() => router.push('/builder')} small>Plan Set</SDButton>
          </div>
          <div ref={menuRef} style={{ position:'relative' }}>
            <div
              onClick={() => setMenuOpen(o => !o)}
              style={{
                width:30, height:30, borderRadius:'50%', cursor:'pointer',
                background:`linear-gradient(135deg,#F5A623,#FF6B35)`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:SD.mono, fontSize:13, fontWeight:700, color:'#000',
              }}
            >{initials}</div>
            {menuOpen && (
              <div style={{
                position:'absolute', top:'calc(100% + 10px)', right:0,
                background:SD.surface2, border:`1px solid ${SD.border}`,
                borderRadius:3, minWidth:160, zIndex:300,
                boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {user && (
                  <div style={{
                    padding:'10px 14px', borderBottom:`1px solid ${SD.border}`,
                    fontSize:13, color:SD.textSec, fontFamily:SD.mono,
                    letterSpacing:.3, wordBreak:'break-all',
                  }}>
                    {user.email}
                  </div>
                )}
                <Link href="/account"
                  style={{
                    display:'block', padding:'10px 14px', fontSize:13, color:SD.textSec,
                    fontFamily:SD.mono, letterSpacing:1, textTransform:'uppercase',
                    cursor:'pointer', transition:'background .12s', textDecoration:'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = SD.surface)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  Account
                </Link>
                <Link href="/invoice"
                  style={{
                    display:'block', padding:'10px 14px', fontSize:13, color:SD.textSec,
                    fontFamily:SD.mono, letterSpacing:1, textTransform:'uppercase',
                    cursor:'pointer', transition:'background .12s', textDecoration:'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = SD.surface)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  Invoice Generator
                </Link>
                <Link href="/convert"
                  style={{
                    display:'block', padding:'10px 14px', fontSize:13, color:SD.textSec,
                    fontFamily:SD.mono, letterSpacing:1, textTransform:'uppercase',
                    cursor:'pointer', transition:'background .12s', textDecoration:'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = SD.surface)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  Serato → Rekordbox
                </Link>
                <div
                  onClick={handleSignOut}
                  style={{
                    padding:'10px 14px', fontSize:13, color:SD.red,
                    fontFamily:SD.mono, letterSpacing:1, textTransform:'uppercase',
                    cursor:'pointer', transition:'background .12s',
                    borderTop:`1px solid ${SD.border}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = SD.redDim)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  Sign Out
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <div className="sd-bottom-nav" style={{
        display:'none',
        position:'fixed', bottom:0, left:0, right:0, zIndex:200,
        height:58, alignItems:'stretch',
        background:'rgba(10,10,10,0.97)', backdropFilter:'blur(16px)',
        borderTop:`1px solid ${SD.border}`,
      }}>
        {mobileNavItems.map(item => (
          <Link key={item.id} href={'/' + item.id} style={{
            flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:3, cursor:'pointer', textDecoration:'none',
            color: pathname === '/' + item.id ? SD.accent : SD.textMuted,
            borderTop: pathname === '/' + item.id ? `2px solid ${SD.accent}` : '2px solid transparent',
            transition:'color .15s',
          }}>
            <span style={{ fontSize:15, lineHeight:1 }}>{item.icon}</span>
            <span style={{ fontFamily:SD.mono, fontSize:10, letterSpacing:1,
              textTransform:'uppercase' }}>{item.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────
interface SDButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  small?: boolean;
  ghost?: boolean;
  danger?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: React.CSSProperties;
}
export function SDButton({ children, onClick, href, small, ghost, disabled, full, style: extraStyle = {} }: SDButtonProps) {
  const [hov, setHov] = useState(false);
  const base: React.CSSProperties = {
    fontFamily:SD.mono, letterSpacing:1.5, textTransform:'uppercase',
    border:'none', borderRadius:3, cursor: disabled ? 'not-allowed' : 'pointer',
    transition:'all .2s', display:'inline-flex', alignItems:'center', justifyContent:'center',
    gap:8, opacity: disabled ? 0.4 : 1, textDecoration:'none',
    ...(full ? { width:'100%' } : {}),
    ...(small ? { fontSize:12, padding:'7px 16px' } : { fontSize:13, padding:'12px 28px' }),
  };
  const hoverProps = { onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false) };
  const ghostStyle = { ...base,
    background: hov ? SD.accentDim : 'transparent',
    border:`1px solid ${hov ? SD.accent : 'rgba(255,255,255,0.18)'}`,
    color: hov ? SD.accent : SD.textSec,
    boxShadow: hov ? `0 0 16px rgba(245,166,35,0.12)` : 'none',
    ...extraStyle,
  };
  const solidStyle = { ...base,
    background: hov ? SD.accentHover : SD.accent,
    color:'#000', fontWeight:700,
    transform: hov ? 'scale(1.02)' : 'scale(1)',
    boxShadow: hov
      ? `0 0 28px rgba(245,166,35,0.4), 0 2px 8px rgba(0,0,0,0.3)`
      : `0 2px 6px rgba(0,0,0,0.25)`,
    ...extraStyle,
  };
  if (href) {
    return <a href={href} style={ghost ? ghostStyle : solidStyle} {...hoverProps}>{children}</a>;
  }
  if (ghost) {
    return (
      <button onClick={onClick} disabled={disabled} style={ghostStyle} {...hoverProps}>{children}</button>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} style={solidStyle} {...hoverProps}>{children}</button>
  );
}

// ─── PageHeader ────────────────────────────────────────────────────────────
// Eyebrow + display heading + optional subtitle + optional right-aligned actions.
// `size: 'medium'` (40px) suits narrower pages like Track ID; `'large'` (52px) is the default for dashboard-style pages.
interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  size?: 'large' | 'medium';
}
export function PageHeader({ eyebrow, title, subtitle, actions, size = 'large' }: PageHeaderProps) {
  const titleSize = size === 'large' ? SD.t52 : SD.t40;
  const titleSpacing = size === 'large' ? 4 : 3;
  return (
    <div style={{
      marginBottom: SD.s8, display: 'flex', alignItems: 'flex-end',
      justifyContent: 'space-between', flexWrap: 'wrap', gap: SD.s4,
    }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div style={{
            fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: SD.s2,
          }}>{eyebrow}</div>
        )}
        <h1 style={{
          fontFamily: SD.display, fontSize: titleSize, letterSpacing: titleSpacing,
          margin: 0, color: SD.text, lineHeight: 1,
        }}>{title}</h1>
        {subtitle && (
          <div style={{
            fontFamily: SD.mono, fontSize: SD.t13, color: SD.textSec,
            marginTop: SD.s3,
          }}>{subtitle}</div>
        )}
      </div>
      {actions}
    </div>
  );
}

// ─── Card / CardHeader ─────────────────────────────────────────────────────
// Standard surface container. Pass `padding` only if children don't manage their own.
// Most cards wrap a CardHeader plus an inner div with its own padding.
interface CardProps {
  children: React.ReactNode;
  padding?: number | string;
  style?: React.CSSProperties;
}
export function Card({ children, padding, style: extra = {} }: CardProps) {
  return (
    <div style={{
      background: SD.surface,
      border: `1px solid ${SD.border}`,
      borderRadius: SD.r3,
      ...(padding !== undefined ? { padding } : {}),
      ...extra,
    }}>{children}</div>
  );
}

interface CardHeaderProps {
  title: string;
  action?: React.ReactNode;
}
export function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 24px', borderBottom: `1px solid ${SD.border}`,
    }}>
      <span style={{
        fontFamily: SD.mono, fontSize: SD.t12, letterSpacing: 2,
        textTransform: 'uppercase', color: SD.textSec,
      }}>{title}</span>
      {action}
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────
// Single tab implementation. Replaces Dashboard Discover tabs + Library page tabs.
// `action` slot is for context (e.g. "Updated 3h ago" or an "Analyze" button) right of the tabs.
export interface TabItem {
  id: string;
  label: string;
  count?: number;
  subtitle?: string;
}
interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  action?: React.ReactNode;
}
export function Tabs({ tabs, value, onChange, action }: TabsProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', borderBottom: `1px solid ${SD.border}`,
    }}>
      <div style={{ display: 'flex' }}>
        {tabs.map(tab => {
          const on = value === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              style={{
                fontFamily: SD.mono, fontSize: SD.t12, letterSpacing: 1.5,
                textTransform: 'uppercase', padding: '14px 20px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: on ? SD.text : SD.textMuted,
                borderBottom: on ? `2px solid ${SD.accent}` : '2px solid transparent',
                transition: 'color .15s', textAlign: 'left',
              }}
            >
              <span style={{ display: 'block' }}>
                {tab.label}
                {tab.count !== undefined && (
                  <span style={{ marginLeft: 8, color: on ? SD.accent : SD.textMuted }}>
                    ({tab.count})
                  </span>
                )}
              </span>
              {tab.subtitle && (
                <span style={{
                  display: 'block', fontFamily: SD.mono, fontSize: 10,
                  letterSpacing: 0.5, textTransform: 'none',
                  color: on ? SD.textSec : SD.textMuted,
                  marginTop: 3, fontWeight: 400,
                }}>
                  {tab.subtitle}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {action}
    </div>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────
// Use variant by INTENT, not color. `accent` = wishlist/primary; `success` = library health;
// `warning` = caution; `danger` = errors/destructive; `info` = neutral notifications.
type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}
export function Badge({ children, variant = 'default' }: BadgeProps) {
  const palette: Record<BadgeVariant, { color: string; bg: string; border: string }> = {
    default: { color: SD.textSec, bg: SD.surface2, border: SD.border },
    accent:  { color: SD.accent,  bg: SD.accentDim,  border: SD.accent + '44' },
    success: { color: SD.success, bg: SD.successDim, border: SD.success + '44' },
    warning: { color: SD.warning, bg: SD.warningDim, border: SD.warning + '44' },
    danger:  { color: SD.danger,  bg: SD.dangerDim,  border: SD.danger + '44' },
    info:    { color: SD.info,    bg: SD.infoDim,    border: SD.info + '44' },
  };
  const p = palette[variant];
  return (
    <span style={{
      fontFamily: SD.mono, fontSize: SD.t10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 1.5,
      color: p.color, background: p.bg,
      border: `1px solid ${p.border}`,
      borderRadius: SD.r1, padding: '2px 7px',
    }}>
      {children}
    </span>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────
// Empty list / no-data state. Pass an SDButton or link as `cta`.
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  cta?: React.ReactNode;
}
export function EmptyState({ icon, title, body, cta }: EmptyStateProps) {
  return (
    <div style={{
      padding: '32px 16px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SD.s3,
    }}>
      {icon && <div style={{ marginBottom: SD.s2, opacity: 0.6 }}>{icon}</div>}
      <div style={{ fontFamily: SD.mono, fontSize: SD.t13, color: SD.text }}>{title}</div>
      {body && (
        <div style={{
          fontFamily: SD.body, fontSize: SD.t13, color: SD.textMuted,
          maxWidth: 320, lineHeight: 1.5,
        }}>{body}</div>
      )}
      {cta && <div style={{ marginTop: SD.s2 }}>{cta}</div>}
    </div>
  );
}

// ─── LoadingState ──────────────────────────────────────────────────────────
// `spinner` mode renders a 32px ring animation; without it, just centered muted text.
// Uses the `sdSpin` keyframe defined in globals.css.
interface LoadingStateProps {
  message?: string;
  spinner?: boolean;
}
export function LoadingState({ message = 'Loading...', spinner = false }: LoadingStateProps) {
  if (spinner) {
    return (
      <div style={{
        padding: '32px 16px', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SD.s3,
      }}>
        <div style={{
          width: 32, height: 32,
          border: `2px solid ${SD.border}`, borderTopColor: SD.accent,
          borderRadius: '50%', animation: 'sdSpin 0.8s linear infinite',
        }} />
        {message && (
          <div style={{ fontFamily: SD.mono, fontSize: SD.t13, color: SD.textMuted }}>
            {message}
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{
      padding: '32px 16px', textAlign: 'center',
      fontFamily: SD.mono, fontSize: SD.t13, color: SD.textMuted,
    }}>{message}</div>
  );
}

// ─── ConfidenceBadge ───────────────────────────────────────────────────────
export function ConfidenceBadge({ status, label, href }: { status: ConfidenceStatus; label: string; href?: string }) {
  const c = { green:SD.green, yellow:SD.yellow, red:SD.red }[status];
  const inner = (
    <>
      <span style={{ width:6, height:6, borderRadius:'50%', background:c, display:'inline-block',
        boxShadow:`0 0 5px ${c}66` }} />
      {label}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ display:'inline-flex', alignItems:'center', gap:4,
          fontFamily:SD.mono, fontSize:12, color:SD.textSec, letterSpacing:.3,
          textDecoration:'none', cursor:'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.color = SD.text)}
        onMouseLeave={e => (e.currentTarget.style.color = SD.textSec)}>
        {inner}
      </a>
    );
  }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4,
      fontFamily:SD.mono, fontSize:12, color:SD.textSec, letterSpacing:.3 }}>
      {inner}
    </span>
  );
}

// ─── Energy dot ────────────────────────────────────────────────────────────
export function EnergyDot({ energy, size = 8 }: { energy: number; size?: number }) {
  const c = energy<=3?'#22C55E':energy<=6?'#EAB308':energy<=8?'#F5A623':'#EF4444';
  return <span style={{ width:size, height:size, borderRadius:'50%', background:c,
    display:'inline-block', boxShadow:`0 0 6px ${c}88`, flexShrink:0 }} />;
}

// ─── TrackRow ──────────────────────────────────────────────────────────────
export function TrackRow({ track, onExpand }: { track: SampleTrack; onExpand?: () => void }) {
  const [exp, setExp] = useState(false);
  const [hov, setHov] = useState(false);
  const hasNotes = !!(track.why || track.transition);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => { if (!exp) onExpand?.(); setExp(!exp); }}
      style={{
        background: hov ? SD.surface2 : SD.surface,
        borderTop: `1px solid ${hov ? SD.borderMid : SD.border}`,
        borderRight: `1px solid ${hov ? SD.borderMid : SD.border}`,
        borderBottom: `1px solid ${hov ? SD.borderMid : SD.border}`,
        borderLeft: track.wishlist ? `3px solid ${SD.accent}` : `1px solid ${hov ? SD.borderMid : SD.border}`,
        borderRadius:3, padding:'13px 16px', marginBottom:2,
        transition:'background .12s, border-color .12s', cursor:'pointer',
      }}>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted,
          width:22, textAlign:'right', flexShrink:0 }}>
          {String(track.pos).padStart(2,'0')}
        </span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontFamily:SD.mono, fontSize:13, fontWeight:600, color:SD.text }}>{track.artist}</span>
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>— {track.title}</span>
          </div>
          <div style={{ display:'flex', gap:12, marginTop:3, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent, letterSpacing:.5 }}>{track.bpm} BPM</span>
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>{track.key}</span>
            {track.wishlist && (
              <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent,
                background:SD.accentDim, border:`1px solid ${SD.accent}44`,
                borderRadius:2, padding:'1px 6px', letterSpacing:.5, textTransform:'uppercase' }}>
                ⚠ Download before gig
              </span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <EnergyDot energy={track.energy} />
          <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>{track.energy}/10</span>
          {hov && !exp && (
            <div style={{ display:'flex', gap:8 }}>
              {orderedStores(track.genre).map(s => (
                <ConfidenceBadge key={s} status={track.stores[s]}
                  label={s==='bpmSupreme'?'BPM':s==='djcity'?'DJcity':s[0].toUpperCase()+s.slice(1)}
                  href={track.storeUrls?.[s]} />
              ))}
            </div>
          )}
          {hasNotes ? (
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent, marginLeft:4,
              letterSpacing:.5, display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
              Why <span style={{ fontSize:10 }}>{exp ? '▲' : '▼'}</span>
            </span>
          ) : (
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, marginLeft:4 }}>{exp ? '▲' : '▼'}</span>
          )}
        </div>
      </div>
      {exp && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${SD.border}` }}>
          {track.why && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent, letterSpacing:1.5,
                textTransform:'uppercase', marginBottom:4 }}>Why this track</div>
              <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec, lineHeight:1.7 }}>{track.why}</div>
            </div>
          )}
          {track.transition && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, letterSpacing:1.5,
                textTransform:'uppercase', marginBottom:4 }}>Transition note</div>
              <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted, lineHeight:1.7 }}>{track.transition}</div>
            </div>
          )}
          <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:8 }}>
            {orderedStores(track.genre).map(s => (
              <ConfidenceBadge key={s} status={track.stores[s]}
                label={s==='bpmSupreme'?'BPM Supreme':s==='djcity'?'DJcity':s[0].toUpperCase()+s.slice(1)}
                href={track.storeUrls?.[s]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GenrePillSelector (legacy, kept for compat) ───────────────────────────
interface GenrePillSelectorProps {
  selected: string | string[];
  onChange: (g: string) => void;
  genres: readonly string[];
}
export function GenrePillSelector({ selected, onChange, genres }: GenrePillSelectorProps) {
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
      {genres.map(g => {
        const on = Array.isArray(selected) ? selected.includes(g) : selected === g;
        return (
          <button key={g} onClick={() => onChange(g)} style={{
            fontFamily:SD.mono, fontSize:13, letterSpacing:.5,
            textTransform:'uppercase', padding:'7px 16px', borderRadius:100,
            border:`1px solid ${on ? SD.accent : SD.border}`,
            background: on ? SD.accent : 'transparent',
            color: on ? '#000' : SD.textSec,
            cursor:'pointer', transition:'all .12s',
            transform: on ? 'scale(1.03)' : 'scale(1)',
          }}>{g}</button>
        );
      })}
    </div>
  );
}

// ─── GenreCombobox ──────────────────────────────────────────────────────────
import { GENRE_GROUPS } from '@/lib/setdrop/constants';

function genreSearchKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9&]+/g, '');
}

interface GenreComboboxProps {
  value: string;
  onChange: (g: string) => void;
  placeholder?: string;
}

export function GenreCombobox({ value, onChange, placeholder = 'Search or type a genre…' }: GenreComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIdx, setActiveIdx] = React.useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.toLowerCase().trim();
  // Match ignoring spaces/punctuation so "nu disco" finds "Nu-Disco" and "hiphop"
  // finds "Hip-Hop". A plain substring match missed those, leaving only the
  // custom "Use …" row and making the listed genre look absent.
  const qKey = genreSearchKey(query);

  // Build filtered list: [{sectionLabel, genres}]
  const filtered = GENRE_GROUPS
    .map(g => ({ label: g.label, genres: qKey ? g.genres.filter(n => genreSearchKey(n).includes(qKey)) : g.genres }))
    .filter(g => g.genres.length > 0);

  // Flat list for keyboard nav
  const flatOptions: string[] = filtered.flatMap(g => g.genres);
  const exactOption = qKey ? flatOptions.find(g => genreSearchKey(g) === qKey) : undefined;
  const showCustom = q.length > 0 && !exactOption;
  const allOptions = showCustom ? [query, ...flatOptions] : flatOptions;

  function select(g: string) {
    onChange(g);
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); setActiveIdx(-1); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, allOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, showCustom ? 0 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) select(allOptions[activeIdx]);
      else if (exactOption) select(exactOption); // canonical spelling, e.g. "Nu-Disco"
      else if (q) select(query);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const inputDisplay = open ? query : value;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: SD.surface2, border: `1px solid ${open ? SD.borderMid : SD.border}`,
        borderRadius: SD.r3, padding: `10px 12px`,
        transition: 'border-color 0.15s', cursor: 'text',
      }} onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
        <input
          ref={inputRef}
          value={inputDisplay}
          onChange={e => { setQuery(e.target.value); setActiveIdx(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={value ? '' : placeholder}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontFamily: SD.mono, fontSize: SD.t13, color: value && !open ? SD.accent : SD.text,
            cursor: 'text',
          }}
        />
        {value && !open && (
          <button
            onClick={e => { e.stopPropagation(); onChange(''); setQuery(''); }}
            style={{ background: 'none', border: 'none', color: SD.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 0 0 8px' }}
          >×</button>
        )}
        {!value && (
          <span style={{ color: SD.textMuted, fontSize: 12, pointerEvents: 'none' }}>▾</span>
        )}
      </div>

      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: SD.surface, border: `1px solid ${SD.borderMid}`,
          borderRadius: SD.r3, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          maxHeight: 300, overflowY: 'auto',
        }}>
          {showCustom && (
            <div
              data-idx={0}
              onClick={() => select(query)}
              style={{
                padding: '10px 14px', fontFamily: SD.mono, fontSize: SD.t12,
                color: SD.accent, cursor: 'pointer', borderBottom: `1px solid ${SD.border}`,
                background: activeIdx === 0 ? SD.surface2 : 'transparent',
              }}
            >
              Use &ldquo;{query}&rdquo;
            </div>
          )}
          {filtered.map(group => (
            <div key={group.label}>
              <div style={{
                padding: '8px 14px 4px',
                fontFamily: SD.mono, fontSize: SD.t10, letterSpacing: 2,
                textTransform: 'uppercase', color: SD.textMuted,
                borderTop: `1px solid ${SD.border}`,
              }}>
                {group.label}
              </div>
              {group.genres.map(g => {
                const flatIdx = allOptions.indexOf(g);
                return (
                  <div
                    key={g}
                    data-idx={flatIdx}
                    onClick={() => select(g)}
                    style={{
                      padding: '8px 14px 8px 20px', fontFamily: SD.mono, fontSize: SD.t12,
                      color: g === value ? SD.accent : SD.textSec,
                      background: activeIdx === flatIdx ? SD.surface2 : 'transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                  >
                    {g}{g === value && ' ✓'}
                  </div>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && !showCustom && (
            <div style={{ padding: '16px 14px', fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted }}>
              No matches — press Enter to use your genre.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Energy Arc Chart (static, read-only) ────────────────────────────────
export function EnergyArcChart({ tracks, width = 640, height = 200 }: {
  tracks: SampleTrack[]; width?: number; height?: number;
}) {
  const px = 44, py = 18;
  const cw = width - px*2, ch = height - py*2;
  const n = tracks.length;
  if (n < 2) return null;
  const pts = tracks.map((t, i) => [px + (i/(n-1))*cw, py + ch - (t.energy/10)*ch]);
  const d = pts.reduce((a, p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const pr = pts[i-1], cx = (pr[0]+p[0])/2;
    return a + ` C${cx},${pr[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
  }, '');
  const fill = d + ` L${pts[n-1][0]},${py+ch} L${px},${py+ch}Z`;
  const gridLines = [0,2,4,6,8,10];
  return (
    <svg width={width} height={height} style={{ overflow:'visible', display:'block' }}>
      <defs>
        <linearGradient id="arcFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SD.accent} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={SD.accent} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      {gridLines.map(v => {
        const y = py + ch - (v/10)*ch;
        return (
          <g key={v}>
            <line x1={px} y1={y} x2={px+cw} y2={y} stroke={SD.border} strokeWidth={.5}/>
            <text x={px-8} y={y+4} textAnchor="end" fill={SD.textMuted}
              fontSize={9} fontFamily="var(--font-mono),monospace">{v}</text>
          </g>
        );
      })}
      <path d={fill} fill="url(#arcFill)"/>
      <path d={d} fill="none" stroke={SD.accent} strokeWidth={2}/>
      {pts.map((pt, i) => (
        <g key={i}>
          <circle cx={pt[0]} cy={pt[1]} r={4} fill={SD.accent} stroke={SD.bg} strokeWidth={1.5}/>
          <text x={pt[0]} y={py+ch+16} textAnchor="middle"
            fill={SD.textMuted} fontSize={8} fontFamily="var(--font-mono),monospace">
            {tracks[i].artist.split(' ')[0]}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Agent Progress ─────────────────────────────────────────────────────────
export function AgentProgress({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {steps.map((s, i) => {
        const done = i < currentStep, active = i === currentStep;
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{
              width:28, height:28, borderRadius:'50%', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: done ? SD.accentDim : active ? `${SD.accent}18` : SD.surface2,
              border:`1px solid ${done ? SD.accent : active ? `${SD.accent}66` : SD.border}`,
              transition:'all .3s',
            }}>
              {done
                ? <span style={{ color:SD.accent, fontSize:12, fontWeight:700 }}>✓</span>
                : active
                ? <span style={{ width:8, height:8, borderRadius:'50%', background:SD.accent,
                    display:'block', animation:'sdPulse 1.2s ease-in-out infinite' }}/>
                : <span style={{ width:5, height:5, borderRadius:'50%', background:SD.borderMid, display:'block' }}/>
              }
            </div>
            <span style={{ fontFamily:SD.mono, fontSize:12,
              color: done ? SD.text : active ? SD.accent : SD.textMuted,
              transition:'color .3s' }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── SDInput ───────────────────────────────────────────────────────────────
interface SDInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  type?: string;
  style?: React.CSSProperties;
}
export function SDInput({ value, onChange, placeholder, label, type = 'text', style: extra = {} }: SDInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <label style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec,
        letterSpacing:1.5, textTransform:'uppercase' }}>{label}</label>}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background:SD.surface2, border:`1px solid ${focused ? SD.accent : SD.border}`,
          borderRadius:3, padding:'10px 14px', color:SD.text,
          fontFamily:SD.mono, fontSize:13, outline:'none',
          transition:'border-color .15s', ...extra,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

// ─── Section label ──────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec,
      letterSpacing:2, textTransform:'uppercase', marginBottom:10,
      display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ flex:1, height:1, background:SD.border, display:'block' }}/>
      {children}
      <span style={{ flex:1, height:1, background:SD.border, display:'block' }}/>
    </div>
  );
}
