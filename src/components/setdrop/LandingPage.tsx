import React from 'react';
import { SD, SAMPLE_TRACKS } from '@/lib/setdrop/constants';
import { SDButton, TrackRow, EnergyArcChart } from './shared';
import { ScrollFade } from './ScrollFade';
import { BRAND } from '@/lib/brand';

export function LandingPage() {
  const HOW_IT_WORKS = [
    { n:'01', label:'Import', desc:"Upload your Serato DB or Rekordbox XML, or add wishlist tracks manually. Your entire library is instantly searchable." },
    { n:'02', label:'Enrich', desc:"AI enriches every track with BPM, key, energy score, and genre tags — no manual tagging." },
    { n:'03', label:'Bridge', desc:`${BRAND.name} checks Beatport, Traxsource, BPM Supreme, and DJcity to tell you where each track can be purchased.` },
    { n:'04', label:'Sync', desc:`Download and import to Serato or Rekordbox. ${BRAND.name} tracks what's in your library and what still needs to get there.` },
    { n:'05', label:'Build', desc:"Set the gig context — genre, crowd, energy arc, duration. AI architects the perfect set from your library." },
    { n:'06', label:'Perform', desc:"Export your Serato crate or Rekordbox playlist. Hit the decks. Do not repeat." },
  ];

  const FEATURES = [
    { title:'Serato + Rekordbox Ready', desc:"Import from Serato DB or Rekordbox XML. Export your AI-built set back as a Serato crate or Rekordbox playlist — one click." },
    { title:'Do-Not-Repeat Logic', desc:"Tracks played in previous sets are flagged. AI never pulls from tracks you've already used this month." },
    { title:'Opener / Headliner Mode', desc:"Tell the AI your slot. Energy arc, track selection, and pacing adapt to your position on the lineup." },
    { title:'Genre-Specific Transition Rules', desc:"Afrobeats to House transitions follow different rules than Hip Hop to R&B. The AI knows." },
    { title:'Serato Crate Export', desc:"One click. Your setlist becomes a Serato crate file, ready to load before you hit the booth." },
    { title:'Gig Intel Agent', desc:"Provide the venue name. AI researches the room, resident DJs, and crowd profile to shape the set." },
  ];

  const DEMO_TRACKS = SAMPLE_TRACKS.slice(0, 5);

  return (
    <div style={{ background:SD.bg, minHeight:'100vh', color:SD.text }}>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="sd-landing-nav" style={{
        position:'fixed', top:0, left:0, right:0, zIndex:50,
        padding:'0 40px', height:56,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        background:'rgba(10,10,10,0.85)', backdropFilter:'blur(12px)',
        borderBottom:`1px solid ${SD.border}`,
      }}>
        <a href="/" style={{ fontFamily:SD.display, fontSize:22, letterSpacing:3, color:SD.text, textDecoration:'none', display:'flex', alignItems:'center', gap:8 }}>
          <span>{BRAND.logoLeft}<span style={{ color:SD.accent }}>{BRAND.logoRight}</span></span>
          <span style={{
            fontFamily:SD.mono, fontSize:9, letterSpacing:2, textTransform:'uppercase',
            color:SD.info, background:SD.infoDim, border:`1px solid ${SD.info}44`,
            borderRadius:3, padding:'2px 6px', lineHeight:1, alignSelf:'center',
          }}>BETA</span>
        </a>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <a href="/login" className="sd-landing-login" style={{
            fontFamily:SD.mono, fontSize:13, letterSpacing:1, color:SD.textSec,
            background:'none', padding:'7px 16px',
            border:'1px solid transparent', borderRadius:3, display:'inline-block',
          }}>
            Log In
          </a>
          <a href="/login?mode=signup" className="sd-landing-signup" style={{
            fontFamily:SD.mono, fontSize:13, letterSpacing:1, fontWeight:600,
            color:'#000', background:SD.accent,
            padding:'8px 18px', borderRadius:3, whiteSpace:'nowrap',
            textDecoration:'none', display:'inline-block',
          }}>
            Sign Up Free
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="sd-hero-pad" style={{
        minHeight:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center', position:'relative',
        overflow:'hidden', padding:'120px 40px 80px', textAlign:'center',
      }}>
        {/* Grid background */}
        <div style={{
          position:'absolute', inset:0, zIndex:0,
          backgroundImage:`
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize:'60px 60px',
        }}/>

        {/* Amber glow */}
        <div style={{
          position:'absolute', bottom:'-10%', left:'50%', transform:'translateX(-50%)',
          width:1100, height:520, borderRadius:'50%', zIndex:0,
          background:'radial-gradient(ellipse at center, rgba(245,166,35,0.18) 0%, transparent 65%)',
        }}/>

        {/* Speaker — left */}
        <svg className="sd-decorative" style={{ position:'absolute', left:'-20px', top:'50%', transform:'translateY(-50%)',
          opacity:.14, zIndex:0 }} width="180" height="380" viewBox="0 0 180 380" fill="none">
          <rect x="10" y="10" width="160" height="360" rx="8" fill="#F5A623"/>
          <circle cx="90" cy="70" r="28" fill="#0A0A0A" stroke="#F5A623" strokeWidth="3"/>
          <circle cx="90" cy="70" r="14" fill="#0A0A0A" stroke="#F5A623" strokeWidth="2"/>
          <circle cx="90" cy="70" r="5" fill="#F5A623"/>
          <circle cx="90" cy="230" r="80" fill="#0A0A0A" stroke="#F5A623" strokeWidth="3"/>
          <circle cx="90" cy="230" r="60" fill="#0A0A0A" stroke="#F5A623" strokeWidth="2"/>
          <circle cx="90" cy="230" r="40" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1.5"/>
          <circle cx="90" cy="230" r="20" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1"/>
          <circle cx="90" cy="230" r="6" fill="#F5A623"/>
          <rect x="30" y="330" width="120" height="18" rx="9" fill="#F5A623" opacity=".6"/>
        </svg>

        {/* Speaker — right */}
        <svg className="sd-decorative" style={{ position:'absolute', right:'-20px', top:'50%', transform:'translateY(-50%)',
          opacity:.14, zIndex:0 }} width="180" height="380" viewBox="0 0 180 380" fill="none">
          <rect x="10" y="10" width="160" height="360" rx="8" fill="#F5A623"/>
          <circle cx="90" cy="70" r="28" fill="#0A0A0A" stroke="#F5A623" strokeWidth="3"/>
          <circle cx="90" cy="70" r="14" fill="#0A0A0A" stroke="#F5A623" strokeWidth="2"/>
          <circle cx="90" cy="70" r="5" fill="#F5A623"/>
          <circle cx="90" cy="230" r="80" fill="#0A0A0A" stroke="#F5A623" strokeWidth="3"/>
          <circle cx="90" cy="230" r="60" fill="#0A0A0A" stroke="#F5A623" strokeWidth="2"/>
          <circle cx="90" cy="230" r="40" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1.5"/>
          <circle cx="90" cy="230" r="20" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1"/>
          <circle cx="90" cy="230" r="6" fill="#F5A623"/>
          <rect x="30" y="330" width="120" height="18" rx="9" fill="#F5A623" opacity=".6"/>
        </svg>

        {/* DJ Controller */}
        <svg className="sd-decorative" style={{ position:'absolute', top:'50%', left:'50%',
          transform:'translate(-50%,-50%)', opacity:.09, zIndex:0, pointerEvents:'none' }}
          width="900" height="360" viewBox="0 0 900 360" fill="none">
          <rect x="20" y="60" width="860" height="240" rx="24" fill="#F5A623"/>
          <circle cx="200" cy="180" r="110" fill="#0A0A0A" stroke="#F5A623" strokeWidth="4"/>
          <circle cx="200" cy="180" r="85" fill="#0A0A0A" stroke="#F5A623" strokeWidth="2"/>
          <circle cx="200" cy="180" r="60" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1.5"/>
          <circle cx="200" cy="180" r="30" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1"/>
          <circle cx="200" cy="180" r="10" fill="#F5A623"/>
          <circle cx="700" cy="180" r="110" fill="#0A0A0A" stroke="#F5A623" strokeWidth="4"/>
          <circle cx="700" cy="180" r="85" fill="#0A0A0A" stroke="#F5A623" strokeWidth="2"/>
          <circle cx="700" cy="180" r="60" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1.5"/>
          <circle cx="700" cy="180" r="30" fill="#0A0A0A" stroke="#F5A623" strokeWidth="1"/>
          <circle cx="700" cy="180" r="10" fill="#F5A623"/>
          <rect x="350" y="90" width="200" height="180" rx="8" fill="#0A0A0A" stroke="#F5A623" strokeWidth="2"/>
          <rect x="365" y="230" width="170" height="16" rx="8" fill="#F5A623" opacity=".3"/>
          <rect x="415" y="226" width="30" height="24" rx="4" fill="#F5A623" opacity=".8"/>
          {([380,420,460,500] as number[]).map((x, i) => (
            <g key={i}>
              <rect x={x} y={100} width={8} height={110} rx={4} fill="#F5A623" opacity=".2"/>
              <rect x={x-4} y={110+(i%3)*20} width={16} height={20} rx={3} fill="#F5A623" opacity=".7"/>
            </g>
          ))}
          {([375,415,455,495,535] as number[]).map((x, i) => (
            <circle key={i} cx={x} cy={155} r={9} fill="#0A0A0A" stroke="#F5A623" strokeWidth="1.5" opacity=".8"/>
          ))}
          {([375,405,435,465] as number[]).map((x, i) => (
            <rect key={i} x={x} y={200} width={22} height={16} rx={3}
              fill="#F5A623" opacity={i===0?.8:.25}/>
          ))}
        </svg>

        {/* Crowd silhouette */}
        <svg style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:1,
          width:'100%', pointerEvents:'none' }}
          viewBox="0 0 1440 180" preserveAspectRatio="none" fill="none">
          <defs>
            <linearGradient id="crowdFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F5A623" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="#F5A623" stopOpacity="0.06"/>
            </linearGradient>
          </defs>
          <path d="M0,140 C20,140 20,110 40,110 C60,110 60,125 80,120 C100,115 105,100 130,100 C155,100 158,118 180,115 C202,112 205,98 230,98 C255,98 258,112 280,112 C302,112 305,102 330,100 C355,98 360,115 385,112 C410,109 412,96 440,95 C468,94 470,110 500,108 C530,106 532,95 562,94 C592,93 595,108 625,106 C655,104 658,96 688,95 C718,94 720,110 750,108 C780,106 782,96 812,95 C842,94 845,108 875,107 C905,106 908,96 935,95 C962,94 965,112 995,110 C1025,108 1028,98 1055,97 C1082,96 1085,112 1112,110 C1139,108 1142,96 1170,95 C1198,94 1200,114 1230,112 C1260,110 1262,98 1290,97 C1318,96 1322,115 1350,112 C1378,109 1380,100 1410,100 C1430,100 1440,108 1440,108 L1440,180 L0,180 Z" fill="url(#crowdFade)"/>
          <path d="M0,155 C15,155 18,130 35,128 C52,126 55,145 75,142 C95,139 100,122 122,120 C144,118 148,138 170,136 C192,134 195,118 220,116 C245,114 248,135 272,133 C296,131 300,118 325,116 C350,114 353,136 378,133 C403,130 408,116 435,114 C462,112 465,132 492,130 C519,128 522,116 550,114 C578,112 580,134 608,132 C636,130 639,118 665,116 C691,114 694,135 720,132 C746,129 750,116 778,114 C806,112 808,134 835,132 C862,130 865,118 892,116 C919,114 922,136 948,133 C974,130 978,116 1005,114 C1032,112 1035,135 1062,132 C1089,129 1092,118 1118,116 C1144,114 1148,136 1175,133 C1202,130 1205,118 1230,116 C1255,114 1260,138 1285,135 C1310,132 1315,120 1340,118 C1365,116 1370,138 1395,135 C1420,132 1430,140 1440,138 L1440,180 L0,180 Z" fill="url(#crowdFade)" opacity=".8"/>
          {([120,240,380,520,660,800,940,1080,1220,1360] as number[]).map((x, i) => (
            <g key={i} opacity=".5">
              <line x1={x-18} y1={i%2===0?115:125} x2={x-32} y2={i%2===0?88:78}
                stroke="#F5A623" strokeWidth="3" strokeLinecap="round"/>
              <line x1={x+18} y1={i%2===0?115:125} x2={x+32} y2={i%2===0?82:92}
                stroke="#F5A623" strokeWidth="3" strokeLinecap="round"/>
            </g>
          ))}
        </svg>

        {/* Content */}
        <div style={{ position:'relative', zIndex:1, maxWidth:900 }}>
          <div style={{
            fontFamily:SD.mono, fontSize:13, letterSpacing:3,
            color:SD.accent, textTransform:'uppercase', marginBottom:24,
            display:'flex', alignItems:'center', justifyContent:'center', gap:12,
            animation:'sdFadeUp 0.6s 0.1s ease both',
          }}>
            <span style={{ width:32, height:1, background:SD.accent, display:'inline-block' }}/>
            Your Library. Your Set.
            <span style={{ width:32, height:1, background:SD.accent, display:'inline-block' }}/>
          </div>

          <h1 style={{
            fontFamily:SD.display, fontSize:'clamp(80px,14vw,160px)',
            letterSpacing:8, lineHeight:.9, margin:'0 0 8px', color:SD.text,
            animation:'sdFadeUp 0.7s 0.25s ease both',
          }}>{BRAND.logoLeft}<span style={{ color:SD.accent }}>{BRAND.logoRight}</span></h1>

          <p style={{
            fontFamily:SD.body, fontSize:17, color:SD.textSec,
            lineHeight:1.75, margin:'32px auto 48px', maxWidth:540,
            animation:'sdFadeUp 0.7s 0.45s ease both',
          }}>
            {BRAND.name} connects your entire DJ workflow — from building your library to walking into the booth ready to play.
          </p>

          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap',
            animation:'sdFadeUp 0.6s 0.6s ease both' }}>
            <SDButton href="/login?mode=signup&redirect=/builder" style={{ fontSize:13, padding:'14px 36px' }}>
              Start Building Your Set
            </SDButton>
            <SDButton ghost href="#demo" style={{ fontSize:13, padding:'14px 36px' }}>
              See It In Action
            </SDButton>
          </div>

          <div style={{ marginTop:64, display:'flex', gap:48, justifyContent:'center', flexWrap:'wrap',
            animation:'sdFadeUp 0.6s 0.75s ease both' }}>
            {([['2,400+','Tracks analyzed'],['98%','Key accuracy'],['< 30s','Set generation']] as [string,string][]).map(([n, l]) => (
              <div key={l} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:SD.display, fontSize:40, letterSpacing:2, color:SD.accent }}>{n}</div>
                <div style={{ fontFamily:SD.body, fontSize:12, color:SD.textMuted,
                  letterSpacing:0.5, marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position:'absolute', bottom:32, left:'50%', transform:'translateX(-50%)',
          display:'flex', flexDirection:'column', alignItems:'center', gap:6, zIndex:1 }}>
          <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, letterSpacing:2,
            textTransform:'uppercase' }}>Scroll</span>
          <div style={{ width:1, height:32, background:`linear-gradient(${SD.accent},transparent)` }}/>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="sd-pad-x" style={{ padding:'120px 40px', maxWidth:1100, margin:'0 auto' }}>
        <ScrollFade style={{ textAlign:'center', marginBottom:80 }}>
          <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:3, color:SD.accent,
            textTransform:'uppercase', marginBottom:12 }}>The Workflow</div>
          <h2 style={{ fontFamily:SD.display, fontSize:'clamp(48px,6vw,80px)', letterSpacing:4,
            margin:0, color:SD.text }}>HOW IT WORKS</h2>
        </ScrollFade>

        <div style={{ display:'flex', flexDirection:'column' }}>
          {HOW_IT_WORKS.map((s, i) => {
            const flip = i % 2 === 1;
            return (
              <ScrollFade key={i} delay={i * 60} className="sd-how-step" style={{
                display:'grid',
                gridTemplateColumns: flip ? '1fr 3fr' : '3fr 1fr',
                gap:0,
                borderTop:`1px solid ${SD.border}`,
                ...(i === HOW_IT_WORKS.length - 1 ? { borderBottom:`1px solid ${SD.border}` } : {}),
              }}>
                {/* Number column */}
                {flip && (
                  <div className="sd-how-step-num" style={{
                    display:'flex', alignItems:'center', justifyContent:'center',
                    padding:'48px 32px',
                    borderRight:`1px solid ${SD.border}`,
                    background: SD.surface,
                    position:'relative', overflow:'hidden',
                  }}>
                    <span style={{
                      fontFamily:SD.display, fontSize:120, letterSpacing:4,
                      color:SD.accent, opacity:0.12, lineHeight:1, userSelect:'none',
                      position:'absolute',
                    }}>{s.n}</span>
                    <span style={{
                      fontFamily:SD.mono, fontSize:13, color:SD.accent,
                      letterSpacing:3, position:'relative', zIndex:1,
                    }}>{s.n}</span>
                  </div>
                )}

                {/* Content column */}
                <div style={{
                  padding:'48px 56px',
                  background: flip ? SD.bg : SD.surface,
                  ...(flip ? {} : { borderRight:`1px solid ${SD.border}` }),
                }}>
                  <div style={{ fontFamily:SD.display, fontSize:36, letterSpacing:3,
                    color:SD.text, marginBottom:16, lineHeight:1 }}>{s.label.toUpperCase()}</div>
                  <div style={{ fontFamily:SD.body, fontSize:15, color:SD.textSec,
                    lineHeight:1.8, maxWidth:480 }}>{s.desc}</div>
                </div>

                {/* Number column (right side for odd steps) */}
                {!flip && (
                  <div className="sd-how-step-num" style={{
                    display:'flex', alignItems:'center', justifyContent:'center',
                    padding:'48px 32px',
                    background: SD.bg,
                    position:'relative', overflow:'hidden',
                  }}>
                    <span style={{
                      fontFamily:SD.display, fontSize:120, letterSpacing:4,
                      color:SD.accent, opacity:0.12, lineHeight:1, userSelect:'none',
                      position:'absolute',
                    }}>{s.n}</span>
                    <span style={{
                      fontFamily:SD.mono, fontSize:13, color:SD.accent,
                      letterSpacing:3, position:'relative', zIndex:1,
                    }}>{s.n}</span>
                  </div>
                )}
              </ScrollFade>
            );
          })}
        </div>
      </section>

      {/* ── Demo Setlist ──────────────────────────────────────────────────── */}
      <section id="demo" className="sd-pad-x" style={{
        padding:'100px 40px 120px',
        background:SD.bg,
        borderTop:`1px solid ${SD.border}`,
        borderBottom:`1px solid ${SD.border}`,
        position:'relative', overflow:'hidden',
      }}>
        {/* Spotlight glow */}
        <div style={{
          position:'absolute', top:'-15%', left:'50%', transform:'translateX(-50%)',
          width:900, height:420, borderRadius:'50%', zIndex:0, pointerEvents:'none',
          background:'radial-gradient(ellipse at center, rgba(245,166,35,0.08) 0%, transparent 65%)',
        }}/>

        <div style={{ maxWidth:980, margin:'0 auto', position:'relative', zIndex:1 }}>
          <ScrollFade style={{ textAlign:'center', marginBottom:52 }}>
            <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:3, color:SD.accent,
              textTransform:'uppercase', marginBottom:16 }}>Live Preview</div>
            <h2 style={{ fontFamily:SD.display, fontSize:'clamp(40px,5vw,64px)', letterSpacing:3,
              margin:'0 0 28px', color:SD.text }}>AI-GENERATED SETLIST</h2>
            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
              {([
                ['Genre',    'Afrobeats / Hip Hop'],
                ['Venue',    'Club'],
                ['Duration', '90 min'],
                ['Slot',     'Headliner'],
                ['Arc',      'Peak Hour'],
              ] as [string,string][]).map(([label, value]) => (
                <div key={label} style={{
                  display:'inline-flex', alignItems:'center', gap:6,
                  background:SD.surface, border:`1px solid ${SD.border}`,
                  borderRadius:2, padding:'5px 12px',
                }}>
                  <span style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:1.5,
                    color:SD.textMuted, textTransform:'uppercase' }}>{label}</span>
                  <span style={{ fontFamily:SD.mono, fontSize:11, color:SD.textSec }}>{value}</span>
                </div>
              ))}
            </div>
          </ScrollFade>

          {/* App chrome frame */}
          <ScrollFade>
            <div style={{
              border:`1px solid ${SD.borderMid}`,
              borderTop:`2px solid ${SD.accent}`,
              borderRadius:'4px 4px 0 0',
              overflow:'hidden',
            }}>
              {/* Title bar */}
              <div style={{
                background:SD.surface2, padding:'10px 16px',
                display:'flex', alignItems:'center', gap:10,
                borderBottom:`1px solid ${SD.border}`,
              }}>
                <div style={{ display:'flex', gap:6 }}>
                  {['rgba(239,68,68,0.55)','rgba(234,179,8,0.55)','rgba(34,197,94,0.55)'].map((c,i) => (
                    <div key={i} style={{ width:10, height:10, borderRadius:'50%', background:c }}/>
                  ))}
                </div>
                <span style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted,
                  letterSpacing:1.5, textTransform:'uppercase', marginLeft:8 }}>
                  {BRAND.name} — Friday Night Affair
                </span>
              </div>

              {/* Energy arc panel */}
              <div style={{ background:SD.surface, padding:'20px 24px 12px',
                borderBottom:`1px solid ${SD.border}` }}>
                <div style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:2,
                  color:SD.textMuted, textTransform:'uppercase', marginBottom:14 }}>Energy Arc</div>
                <div style={{ overflowX:'auto' }}>
                  <EnergyArcChart tracks={DEMO_TRACKS} width={900} height={160} />
                </div>
              </div>

              {/* Tracklist panel */}
              <div style={{ background:SD.bg, padding:'12px 16px' }}>
                {DEMO_TRACKS.map(t => <TrackRow key={t.pos} track={t} />)}
              </div>
            </div>
          </ScrollFade>

          <div style={{ textAlign:'center', marginTop:40 }}>
            <SDButton href="/login?mode=signup&redirect=/builder">Build Your Own Set</SDButton>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="sd-pad-x" style={{ padding:'120px 40px', maxWidth:1200, margin:'0 auto' }}>
        <ScrollFade style={{ textAlign:'center', marginBottom:72 }}>
          <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:3, color:SD.accent,
            textTransform:'uppercase', marginBottom:12 }}>Why {BRAND.name}</div>
          <h2 style={{ fontFamily:SD.display, fontSize:'clamp(40px,5vw,72px)', letterSpacing:4,
            margin:0, color:SD.text }}>BUILT FOR REAL DJs</h2>
        </ScrollFade>
        <div className="sd-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1,
          border:`1px solid ${SD.border}` }}>
          {FEATURES.map((f, i) => (
            <ScrollFade key={i} delay={i * 70} style={{
              padding:'36px 32px', background:SD.bg,
              borderRight: i%3!==2 ? `1px solid ${SD.border}` : 'none',
              borderBottom: i<3 ? `1px solid ${SD.border}` : 'none',
            }}>
              <div style={{ width:32, height:2, background:SD.accent, marginBottom:20 }}/>
              <div style={{ fontFamily:SD.display, fontSize:22, letterSpacing:2,
                color:SD.text, marginBottom:12 }}>{f.title.toUpperCase()}</div>
              <div style={{ fontFamily:SD.body, fontSize:14, color:SD.textSec,
                lineHeight:1.75 }}>{f.desc}</div>
            </ScrollFade>
          ))}
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="sd-pad-x" style={{
        padding:'120px 40px',
        background: SD.surface,
        borderTop:`1px solid ${SD.border}`,
        borderBottom:`1px solid ${SD.border}`,
      }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <ScrollFade style={{ textAlign:'center', marginBottom:72 }}>
            <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:3, color:SD.accent,
              textTransform:'uppercase', marginBottom:12 }}>Pricing</div>
            <h2 style={{ fontFamily:SD.display, fontSize:'clamp(40px,5vw,72px)', letterSpacing:4,
              margin:0, color:SD.text }}>SIMPLE PRICING</h2>
          </ScrollFade>

          <div className="sd-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', border:`1px solid ${SD.border}` }}>

            {/* Free */}
            <ScrollFade style={{ padding:'40px 36px', background:SD.bg }}>
              <div style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:3,
                color:SD.textMuted, textTransform:'uppercase', marginBottom:20 }}>Free</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:6 }}>
                <span style={{ fontFamily:SD.display, fontSize:60, letterSpacing:2,
                  color:SD.text, lineHeight:1 }}>$0</span>
                <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>/mo</span>
              </div>
              <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted,
                marginBottom:36 }}>No credit card required.</div>

              <ul style={{ listStyle:'none', padding:0, margin:'0 0 40px', display:'flex', flexDirection:'column', gap:14 }}>
                {[
                  'Unlimited AI set & crate generation',
                  '3 exports / month (Serato, Rekordbox, M3U)',
                  'Full library upload (Serato DB / CSV)',
                  'BPM & key enrichment',
                ].map(f => (
                  <li key={f} style={{ display:'flex', alignItems:'flex-start', gap:12,
                    fontFamily:SD.body, fontSize:14, color:SD.textSec, lineHeight:1.5 }}>
                    <span style={{ color:SD.accent, fontFamily:SD.mono, fontSize:13, flexShrink:0, marginTop:1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <SDButton ghost href="/login?mode=signup" full style={{ fontSize:12 }}>
                Get Started Free
              </SDButton>
            </ScrollFade>

            {/* Pro */}
            <ScrollFade delay={80} style={{
              padding:'40px 36px',
              background:SD.surface,
              borderLeft:`1px solid ${SD.border}`,
              borderTop:`2px solid ${SD.accent}`,
              position:'relative',
            }}>
              <div style={{
                position:'absolute', top:16, right:16,
                fontFamily:SD.mono, fontSize:10, letterSpacing:2, textTransform:'uppercase',
                background:SD.accentDim, border:`1px solid ${SD.accent}44`,
                color:SD.accent, padding:'3px 10px', borderRadius:2,
              }}>Most Popular</div>

              <div style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:3,
                color:SD.accent, textTransform:'uppercase', marginBottom:20 }}>Pro</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:6 }}>
                <span style={{ fontFamily:SD.display, fontSize:60, letterSpacing:2,
                  color:SD.text, lineHeight:1 }}>$12</span>
                <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>/mo</span>
              </div>
              <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted,
                marginBottom:36 }}>Cancel anytime.</div>

              <ul style={{ listStyle:'none', padding:0, margin:'0 0 40px', display:'flex', flexDirection:'column', gap:14 }}>
                {[
                  'Unlimited exports — Serato, Rekordbox, M3U',
                  'Unlimited AI set & crate generation',
                  '500 Track IDs / month',
                  'Full library upload (Serato DB / CSV)',
                  'BPM & key enrichment',
                ].map(f => (
                  <li key={f} style={{ display:'flex', alignItems:'flex-start', gap:12,
                    fontFamily:SD.body, fontSize:14, color:SD.textSec, lineHeight:1.5 }}>
                    <span style={{ color:SD.accent, fontFamily:SD.mono, fontSize:13, flexShrink:0, marginTop:1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <SDButton href="/login?mode=signup" full style={{ fontSize:12 }}>
                Get Started — $12/mo
              </SDButton>
            </ScrollFade>

          </div>
        </div>
      </section>

      {/* ── Platforms ─────────────────────────────────────────────────────── */}
      <section style={{ borderTop:`1px solid ${SD.border}`, borderBottom:`1px solid ${SD.border}` }}>
        <ScrollFade>
          <div style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:3, color:SD.textMuted,
            textTransform:'uppercase', textAlign:'center', padding:'40px 40px 0' }}>
            Works with your tools
          </div>
          <div className="sd-platform-grid" style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)' }}>
            {([
              { name:'Serato DJ Pro',  type:'DJ Software'    },
              { name:'Rekordbox',      type:'DJ Software'    },
              { name:'Beatport',       type:'Download Store' },
              { name:'Traxsource',     type:'Download Store' },
              { name:'BPM Supreme',    type:'Record Pool'    },
              { name:'DJcity',         type:'Record Pool'    },
            ] as { name: string; type: string }[]).map((p, i) => (
              <div key={p.name} className="sd-platform-tile" style={{
                padding:'32px 16px 36px',
                display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                borderLeft: i > 0 ? `1px solid ${SD.border}` : 'none',
              }}>
                <div style={{ fontFamily:SD.display, fontSize:20, letterSpacing:2,
                  color:SD.textSec, lineHeight:1, textAlign:'center' }}>
                  {p.name.toUpperCase()}
                </div>
                <div style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:2,
                  color:SD.textMuted, textTransform:'uppercase' }}>{p.type}</div>
              </div>
            ))}
          </div>
        </ScrollFade>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="sd-pad-x" style={{ padding:'140px 40px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{
          position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          width:800, height:400, borderRadius:'50%',
          background:'radial-gradient(ellipse,rgba(245,166,35,0.13) 0%,transparent 68%)', zIndex:0,
        }}/>
        <ScrollFade style={{ position:'relative', zIndex:1 }}>
          <h2 style={{ fontFamily:SD.display, fontSize:'clamp(48px,7vw,96px)',
            letterSpacing:4, margin:'0 0 24px', lineHeight:.95, color:SD.text }}>
            YOUR NEXT SET<br/><span style={{ color:SD.accent }}>STARTS HERE</span>
          </h2>
          <p style={{ fontFamily:SD.body, fontSize:16, color:SD.textSec,
            margin:'0 auto 48px', maxWidth:480, lineHeight:1.8 }}>
            Upload your library and start planning your next set. Free to start.
          </p>
          <SDButton href="/login?mode=signup&redirect=/builder" style={{ fontSize:14, padding:'16px 48px' }}>
            Get Started — It&apos;s Free
          </SDButton>
          <div style={{ marginTop:20, fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>{BRAND.domain}</div>
        </ScrollFade>
      </section>

      {/* Footer */}
      <footer className="sd-pad-x" style={{ borderTop:`1px solid ${SD.border}`, padding:'40px 40px 32px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:32, marginBottom:32 }}>
          <span style={{ fontFamily:SD.display, fontSize:20, letterSpacing:3, color:SD.textMuted }}>
            {BRAND.logoLeft}<span style={{ color:SD.accent }}>{BRAND.logoRight}</span>
          </span>
          <div style={{ display:'flex', gap:48, flexWrap:'wrap' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <span style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:2, color:SD.textMuted, textTransform:'uppercase' }}>Product</span>
              {([
                ['How It Works', '#how-it-works'],
                ['Demo',         '#demo'],
                ['Pricing',      '#pricing'],
              ] as [string, string][]).map(([label, href]) => (
                <a key={label} href={href} className="sd-footer-link"
                  style={{ fontFamily:SD.mono, fontSize:13 }}>
                  {label}
                </a>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <span style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:2, color:SD.textMuted, textTransform:'uppercase' }}>App</span>
              {([
                ['Sign Up Free', '/login'],
                ['Log In',       '/login'],
                ['Build a Set',  '/builder'],
                ['Explore',      '/explore'],
              ] as [string, string][]).map(([label, href]) => (
                <a key={label} href={href} className="sd-footer-link"
                  style={{ fontFamily:SD.mono, fontSize:13 }}>
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderTop:`1px solid ${SD.border}`, paddingTop:24,
          display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>© 2026 {BRAND.name}</span>
          <div style={{ display:'flex', gap:24 }}>
            <a href="/privacy" style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, textDecoration:'none' }}>Privacy Policy</a>
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>{BRAND.domain}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
