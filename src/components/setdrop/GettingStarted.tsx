'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { SD } from '@/lib/setdrop/constants';
import { SDButton } from './shared';
import {
  getOnboardingSteps,
  isOnboardingComplete,
  type OnboardingProgress,
  type OnboardingStep,
} from '@/lib/setdrop/onboarding';

// Numbered getting-started checklist: 1. Upload your library → 2. Plan a set →
// 3. Export. Steps tick off from real account state, the current step is
// highlighted with its button, and the whole thing hides once all three are done.
//
//  - "full":    dashboard + library import screen (one row per step)
//  - "compact": set builder (one slim line, so it doesn't compete with the
//               builder's own Gig Context / Energy Arc / Seeds stepper)

interface Props {
  progress: OnboardingProgress;
  variant?: 'full' | 'compact';
  /** Hide the current step's button (e.g. on the library page, where the upload UI is right below). */
  hideCurrentCta?: OnboardingStep['id'];
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

export function GettingStarted({ progress, variant = 'full', hideCurrentCta, onDismiss, style }: Props) {
  const router = useRouter();
  if (isOnboardingComplete(progress)) return null;
  const steps = getOnboardingSteps(progress);
  const doneCount = steps.filter(s => s.status === 'done').length;

  if (variant === 'compact') {
    return (
      <div data-testid="getting-started-compact" style={{
        display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
        marginBottom:16, fontFamily:SD.mono, fontSize:12, ...style,
      }}>
        <span style={{ letterSpacing:2, textTransform:'uppercase', color:SD.textMuted }}>
          Getting started {doneCount}/3
        </span>
        {steps.map(s => (
          <span key={s.id} style={{ display:'inline-flex', alignItems:'center', gap:6,
            color: s.status === 'current' ? SD.accent : s.status === 'done' ? SD.green : SD.textMuted }}>
            <StepDot step={s} size={18} />
            <span style={{ textDecoration: s.status === 'done' ? 'line-through' : 'none' }}>{s.label}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="getting-started" style={{ background:SD.surface, border:`1px solid ${SD.borderMid}`,
      borderRadius:4, padding:'24px 28px', marginBottom:24, ...style }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:2,
            color:SD.accent, textTransform:'uppercase', marginBottom:6 }}>
            Get Started · {doneCount} of 3 done
          </div>
          <div style={{ fontFamily:SD.body, fontSize:15, color:SD.text }}>
            Three steps from your crates to a set you can play
          </div>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss getting started"
            style={{ background:'none', border:'none', cursor:'pointer',
              fontFamily:SD.mono, fontSize:12, color:SD.textMuted, padding:'2px 6px' }}>✕</button>
        )}
      </div>
      <ol style={{ display:'flex', flexDirection:'column', gap:12, listStyle:'none', margin:0, padding:0 }}>
        {steps.map(step => {
          const current = step.status === 'current';
          const done = step.status === 'done';
          return (
            <li key={step.id} aria-current={current ? 'step' : undefined} style={{ display:'flex', alignItems:'center', gap:16,
              padding:'14px 18px', background: current ? SD.accentDim : SD.bg,
              border:`1px solid ${done ? SD.green + '44' : current ? SD.accent : SD.border}`,
              borderRadius:3, opacity: step.status === 'upcoming' ? 0.6 : 1 }}>
              <StepDot step={step} size={28} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:SD.mono, fontSize:12, fontWeight:600, marginBottom:2,
                  color: done ? SD.textSec : current ? SD.accent : SD.text,
                  textDecoration: done ? 'line-through' : 'none' }}>
                  {step.n}. {step.label}
                </div>
                <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted }}>{step.sub}</div>
              </div>
              {current && hideCurrentCta !== step.id && (
                <SDButton onClick={() => router.push(step.href)}
                  style={{ fontSize:12, padding:'8px 16px', flexShrink:0 }}>
                  {step.cta}
                </SDButton>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepDot({ step, size }: { step: OnboardingStep; size: number }) {
  const done = step.status === 'done';
  const current = step.status === 'current';
  return (
    <span style={{ width:size, height:size, borderRadius:'50%', flexShrink:0,
      background: done ? SD.greenDim : current ? SD.accent : SD.surface2,
      border:`1px solid ${done ? SD.green + '66' : current ? SD.accent : SD.border}`,
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontFamily:SD.mono, fontSize: size > 20 ? 13 : 11,
      color: done ? SD.green : current ? '#000' : SD.textMuted }}>
      {done ? '✓' : step.n}
    </span>
  );
}
