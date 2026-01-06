
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { UserProfile, Product } from '../types';
import { TrendingUp, Droplet, Zap, ShieldCheck, Activity, ScanFace, Sun, ChevronUp, ChevronDown, Sparkles, ArrowRight, Microscope, Dna, Layers, ScanBarcode, AlignJustify, Palette, Clock, AlertCircle } from 'lucide-react';

interface SkinAnalysisReportProps {
  userProfile: UserProfile;
  shelf: Product[];
  onRescan: () => void;
  onConsultAI: (query: string) => void;
  onViewProgress: () => void;
  onOpenRoutineBuilder: () => void;
  onLoginRequired: (reason: string) => void;
  onUnlockPremium: () => void;
  onOpenSimulator: () => void;
  onScanProduct: () => void;
}

// --- DATA: NEW 12 BIOMARKERS ---
const BIOMARKER_GROUPS = [
    {
        id: 'breakout',
        title: 'Breakout',
        icon: Zap,
        metrics: [
            { key: 'acneActive', label: 'Active Acne', desc: 'Live inflammation' },
            { key: 'blackheads', label: 'Blackheads', desc: 'Clogged pores' },
            { key: 'acneMarks', label: 'Post-Acne Marks', desc: 'PIH/PIE' },
        ]
    },
    {
        id: 'tone',
        title: 'Tone',
        icon: Palette,
        metrics: [
            { key: 'darkSpots', label: 'Dark Spots', desc: 'Sun damage/Melasma' },
            { key: 'redness', label: 'Redness', desc: 'Sensitivity' },
            { key: 'darkCircles', label: 'Dark Circles', desc: 'Eye shadows' },
        ]
    },
    {
        id: 'surface',
        title: 'Surface',
        icon: Activity,
        metrics: [
            { key: 'pores', label: 'Pores', desc: 'Visible size' },
            { key: 'texture', label: 'Texture', desc: 'Roughness' },
            { key: 'oiliness', label: 'Oiliness', desc: 'Sebum levels' },
            { key: 'hydration', label: 'Dehydration', desc: 'Water retention' },
        ]
    },
    {
        id: 'aging',
        title: 'Aging',
        icon: Clock,
        metrics: [
            { key: 'wrinkles', label: 'Wrinkles', desc: 'Deep lines' },
            { key: 'firmness', label: 'Firmness', desc: 'Elasticity' },
        ]
    }
];

// Helper for age-adjusted averages
const getAgeAdjustedAverage = (age: number, metric: string): number => {
    let base = 75;
    let ageDelta = age - 25; 

    if (['acneActive', 'oiliness'].includes(metric)) {
        base = 72; // Acne improves with age (score goes UP)
        return Math.min(92, Math.round(base + (ageDelta * 0.4))); 
    } else if (['wrinkles', 'firmness', 'hydration'].includes(metric)) {
        base = 85; // Structural items drop with age
        return Math.max(45, Math.round(base - (ageDelta * 0.6)));
    } else {
        return 75;
    }
};

const getInsightText = (metricKey: string, score: number): string => {
    if (score >= 80) {
        switch(metricKey) {
            case 'hydration': return "Optimally Hydrated. Barrier is intact.";
            case 'oiliness': return "Balanced Sebum. No excess shine.";
            case 'acneActive': return "Clear Skin. No active inflammation.";
            case 'redness': return "Calm Tone. No irritation detected.";
            case 'pores': return "Refined Pores. Excellent texture.";
            case 'wrinkles': return "Smooth Skin. No static lines.";
            default: return "Excellent Condition. Keep it up.";
        }
    } else if (score >= 60) {
        switch(metricKey) {
            case 'hydration': return "Mildly Dehydrated. Drink more water.";
            case 'oiliness': return "Slightly Oily. Manage T-zone.";
            case 'redness': return "Mild Sensitivity. Use gentle products.";
            case 'texture': return "Minor Roughness. Gentle exfoliation helps.";
            default: return "Good Health. Minor improvements possible.";
        }
    } else {
        switch(metricKey) {
            case 'hydration': return "Dehydrated. Barrier function may be compromised.";
            case 'acneActive': return "Active Breakouts. Inflammation detected.";
            case 'wrinkles': return "Visible Lines. Collagen support needed.";
            case 'texture': return "Rough Texture. Exfoliation recommended.";
            case 'redness': return "High Sensitivity. Barrier repair needed.";
            case 'darkSpots': return "Pigmentation detected. Use SPF daily.";
            default: return "Needs Attention. Critical levels detected.";
        }
    }
};

const ComparisonWidget = ({ userScore, age, metric }: { userScore: number, age: number, metric: string }) => {
    const [animate, setAnimate] = useState(false);
    
    const avgScore = useMemo(() => getAgeAdjustedAverage(age, metric), [age, metric]);
    
    const diff = userScore - avgScore;
    const isBetter = diff >= 0;

    useEffect(() => {
        setAnimate(false);
        const t = setTimeout(() => setAnimate(true), 100);
        return () => clearTimeout(t);
    }, [userScore]); // Re-animate on score change

    return (
        <div className="w-full max-w-[260px] mx-auto mt-8 bg-black/60 backdrop-blur-md rounded-2xl p-5 border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest">
                    Avg for Age {age}
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wide ${isBetter ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {isBetter ? `Top ${Math.max(1, 50 - Math.round(diff * 1.5))}%` : 'Below Avg'}
                </span>
            </div>
            <div className="space-y-4">
                <div className="relative">
                    <div className="flex justify-between text-[10px] font-bold text-white mb-1.5">
                        <span className="text-teal-200">You</span>
                        <span>{userScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-400 shadow-[0_0_10px_#2dd4bf] transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] rounded-full" style={{ width: animate ? `${userScore}%` : '0%' }} />
                    </div>
                </div>
                <div className="relative">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                        <span>Global Average</span>
                        <span>{avgScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-500/80 transition-all duration-1000 ease-out rounded-full" style={{ width: animate ? `${avgScore}%` : '0%' }} />
                    </div>
                </div>
            </div>
        </div>
    )
}

const DetailRow: React.FC<{ label: string, value: number, description: string, avg: number }> = ({ label, value, description, avg }) => {
    const [width, setWidth] = useState(0);
    const rowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                // Add staggered delay for visual effect
                const delay = Math.random() * 150;
                setTimeout(() => setWidth(value), delay);
                observer.disconnect();
            }
        }, { threshold: 0.1 });

        if (rowRef.current) {
            observer.observe(rowRef.current);
        }

        return () => observer.disconnect();
    }, [value]);

    const getBarColor = (val: number) => {
        if (val >= 80) return 'bg-teal-400';
        if (val >= 60) return 'bg-teal-500';
        return 'bg-amber-400';
    };

    return (
        <div ref={rowRef} className="group py-4 px-2 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors rounded-xl">
            <div className="flex justify-between items-end mb-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">{label}</h4>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">{value}%</span>
                </div>
            </div>
            
            <div className="relative h-2 w-full mb-2 flex items-center bg-white/10 rounded-full overflow-hidden">
                {/* Fill */}
                <div 
                    className={`h-full rounded-full ${getBarColor(value)} transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-[0_0_15px_rgba(45,212,191,0.4)]`} 
                    style={{ width: `${width}%` }}
                ></div>
                
                {/* Global Average Marker */}
                <div 
                    className="absolute h-full w-0.5 bg-white/30 z-10 top-0 bottom-0"
                    style={{ left: `${avg}%` }}
                    title={`Average: ${avg}%`}
                ></div>
            </div>
            
            <div className="flex justify-between items-center">
                <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">{description}</p>
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">AVG {avg}</span>
            </div>
        </div>
    )
};

export const SkinAnalysisReport: React.FC<SkinAnalysisReportProps> = ({
  userProfile,
  onRescan,
  onViewProgress,
  onOpenRoutineBuilder,
  onOpenSimulator,
  onScanProduct
}) => {
  const metrics = userProfile.biometrics;
  const [activeTool, setActiveTool] = useState(0);
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const toolRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastMainScrollY = useRef(0);

  useEffect(() => {
      window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
      return () => {
          window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
      };
  }, []);

  const handleMainScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const currentScrollY = e.currentTarget.scrollTop;
      const viewportHeight = e.currentTarget.clientHeight;
      
      // Calculate active section index (0, 1, 2)
      // Using Math.round to determine which section takes up the majority of the view
      const activeSectionIndex = Math.round(currentScrollY / viewportHeight);

      // Section 3 (index 2) is "Active Protocol" - force nav visibility here
      if (activeSectionIndex === 2) {
           window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
           lastMainScrollY.current = currentScrollY;
           return;
      }

      const diff = Math.abs(currentScrollY - lastMainScrollY.current);
      if (diff > 10) {
          if (currentScrollY > lastMainScrollY.current) window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
          else window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
          lastMainScrollY.current = currentScrollY;
      }
  };

  const scrollToSection = (index: number) => {
      if (mainContainerRef.current) {
          const h = mainContainerRef.current.clientHeight;
          mainContainerRef.current.scrollTo({ top: h * index, behavior: 'smooth' });
      }
  };

  const tools = [
      { id: 0, title: "Ingredient Scanner", desc: "Instant safety check.", icon: ScanBarcode, action: onScanProduct },
      { id: 1, title: "Glowup Visualizer", desc: "Visualize ideal skin.", icon: Dna, action: onOpenSimulator },
      { id: 2, title: "Routine Architect", desc: "Get recommended products.", icon: Layers, action: onOpenRoutineBuilder }
  ];

  return (
    <div className="relative h-[100dvh] w-full bg-black font-sans selection:bg-teal-500 selection:text-white overflow-hidden">
      
      {/* BACKGROUND */}
      <div className="fixed inset-0 z-0 h-full w-full bg-black pointer-events-none">
          {userProfile.faceImage ? (
              <img src={userProfile.faceImage} alt="Face Scan" className="w-full h-full object-cover opacity-100" />
          ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-black"></div>
          )}
          {/* Dynamic Overlay: Light by default, Dark when focused */}
          <div className={`absolute inset-0 transition-all duration-700 ease-in-out ${focusedGroup ? 'bg-black/80 backdrop-blur-sm' : 'bg-gradient-to-b from-black/0 via-black/0 to-black/60'}`}></div>
      </div>

      <div 
        ref={mainContainerRef}
        className="relative z-10 w-full h-full overflow-y-auto snap-y snap-mandatory scroll-smooth scrollbar-hide"
        onScroll={handleMainScroll}
      >
          
          {/* --- SECTION 1: HERO (Snap 1) --- */}
          <section className="h-[100dvh] w-full relative flex flex-col pt-safe-top snap-start snap-always shrink-0" onClick={() => setFocusedGroup(null)}>
              
              <div className="px-6 pt-8 flex justify-between items-center z-50">
                  <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white/90 shadow-sm flex items-center gap-2">
                      <ScanFace size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                          {new Date(metrics.timestamp).toLocaleDateString()}
                      </span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onRescan(); }} className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-white/20 transition-all active:scale-95">
                      <ScanFace size={16} />
                  </button>
              </div>

              {/* OVERLAY for Focused Group */}
              {focusedGroup && (
                  <div className="absolute top-24 left-0 right-0 z-30 px-8 flex flex-col items-center justify-center text-center pointer-events-none w-full">
                      <div className="animate-in fade-in slide-in-from-top-4 duration-500 ease-out w-full flex flex-col items-center">
                          {(() => {
                              const group = BIOMARKER_GROUPS.find(g => g.id === focusedGroup);
                              if (!group) return null;
                              
                              const sortedMetrics = [...group.metrics].sort((a, b) => {
                                  const valA = metrics[a.key as keyof typeof metrics] as number;
                                  const valB = metrics[b.key as keyof typeof metrics] as number;
                                  return valA - valB;
                              });
                              const primaryMetric = sortedMetrics[0];
                              const score = metrics[primaryMetric.key as keyof typeof metrics] as number;
                              
                              return (
                                  <>
                                    <div className="inline-flex items-center gap-2 mb-4 animate-in fade-in zoom-in duration-500 mx-auto">
                                        <group.icon size={18} className="text-teal-400" />
                                        <span className="text-xs font-bold text-teal-400 uppercase tracking-[0.3em]">{primaryMetric.label}</span>
                                    </div>
                                    <h2 className="text-4xl font-thin text-white leading-tight drop-shadow-lg mb-2 text-center max-w-sm mx-auto">
                                        {getInsightText(primaryMetric.key, score)}
                                    </h2>
                                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em] mb-4 text-center">
                                        {primaryMetric.desc.toUpperCase()}
                                    </p>
                                    <ComparisonWidget userScore={score} age={userProfile.age} metric={primaryMetric.key} />
                                  </>
                              );
                          })()}
                      </div>
                  </div>
              )}

              <div className="flex-1"></div>

              {/* METRICS STRIP */}
              <div className="mb-4 w-full animate-in slide-in-from-bottom-8 duration-700 pb-10">
                  <div 
                    className="flex items-end gap-6 overflow-x-auto px-6 pb-8 no-scrollbar snap-x snap-mandatory min-h-[160px]"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                  >
                      
                      {/* Overall Score */}
                      <div className="shrink-0 snap-center flex flex-col items-center justify-center pb-1 min-w-[100px]">
                          <div className="relative">
                              <span className={`text-6xl font-thin tracking-tighter leading-none text-white drop-shadow-xl transition-all duration-500 ${focusedGroup ? 'scale-125 text-teal-50 text-shadow-glow' : 'scale-100'}`}>
                                  {metrics.overallScore}
                              </span>
                              {!focusedGroup && <div className="absolute -top-1 -right-2 w-2 h-2 bg-teal-400 rounded-full animate-pulse"></div>}
                          </div>
                          <span className="text-[9px] font-bold text-white/80 uppercase tracking-[0.2em] border-t border-white/20 pt-2 w-full text-center mt-3">Health Score</span>
                      </div>

                      <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/30 to-transparent shrink-0"></div>
                      
                      {/* Group Orbs */}
                      {BIOMARKER_GROUPS.map(group => {
                          const avg = Math.round(group.metrics.reduce((acc, m) => acc + (metrics[m.key as keyof typeof metrics] as number), 0) / group.metrics.length);
                          const isActive = focusedGroup === group.id;

                          return (
                            <button 
                                key={group.id}
                                onClick={(e) => { e.stopPropagation(); setFocusedGroup(group.id); }}
                                className={`shrink-0 flex flex-col items-center gap-3 snap-center group cursor-pointer transition-all duration-500 ${isActive ? 'scale-110 -translate-y-2' : 'opacity-60 hover:opacity-100'}`}
                            >
                                <div className={`relative w-14 h-14 rounded-full backdrop-blur-md flex items-center justify-center shadow-lg transition-all duration-500 ${isActive ? 'bg-white/20 border border-white/40 text-white' : 'bg-black/20 border border-white/10 text-white/70'}`}>
                                    <group.icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                                    {avg < 60 && <div className="absolute top-0 right-0 w-3 h-3 bg-amber-500 rounded-full border-2 border-black"></div>}
                                </div>
                                <div className="text-center">
                                    <span className={`block text-sm font-bold leading-none mb-1 ${isActive ? 'text-teal-300' : 'text-white'}`}>{avg}</span>
                                    <span className="block text-[9px] font-medium text-white/80 uppercase tracking-widest">{group.title}</span>
                                </div>
                            </button>
                          );
                      })}
                      <div className="w-4 shrink-0"></div>
                  </div>
                  
                  <div className={`absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none transition-opacity duration-300 ${focusedGroup ? 'opacity-0' : 'opacity-100'}`}>
                      <button onClick={(e) => { e.stopPropagation(); scrollToSection(1); }} className="animate-bounce p-2 rounded-full text-white/50 pointer-events-auto hover:text-white transition-colors">
                          <ChevronDown size={24} />
                      </button>
                  </div>
              </div>
          </section>

          {/* --- SECTION 2: CLINICAL REPORT (Light Glass Theme) --- */}
          <section className="h-[100dvh] w-full px-2 snap-start snap-always shrink-0 flex flex-col justify-end pb-4 pt-4 relative">
              <div className="bg-white/15 backdrop-blur-[50px] border border-white/20 rounded-[2.5rem] px-6 pt-12 pb-8 shadow-[0_0_100px_rgba(255,255,255,0.05)] relative overflow-y-auto scrollbar-hide h-[92vh] w-full">
                  <div className="sticky top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full mb-6 mx-auto"></div>

                  <div className="mb-8 flex justify-between items-end">
                      <div>
                          <h2 className="text-4xl font-thin text-white tracking-tighter leading-none mb-1.5">Skin Report</h2>
                          <p className="text-xs text-teal-400 font-bold uppercase tracking-widest">SkinOS Analysis.</p>
                      </div>
                      {userProfile.scanHistory && userProfile.scanHistory.length > 1 && (
                          <button onClick={onViewProgress} className="w-10 h-10 bg-white/10 border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors">
                              <TrendingUp size={16} />
                          </button>
                      )}
                  </div>

                  {/* AI Diagnosis Card */}
                  <div className="bg-black/20 rounded-[2rem] p-6 mb-8 border border-white/10 shadow-lg relative overflow-hidden backdrop-blur-md">
                      <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-4 text-teal-400">
                              <Sparkles size={14} className="text-teal-400" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">AI Dermatologist</span>
                          </div>
                          {metrics.analysisSummary && (
                              <div className="space-y-4">
                                  {typeof metrics.analysisSummary === 'string' ? (
                                      <p className="text-sm text-white/90 font-medium leading-relaxed">{metrics.analysisSummary}</p>
                                  ) : (
                                      <>
                                          <p className="text-sm font-bold leading-relaxed text-white">{metrics.analysisSummary.generalCondition}</p>
                                          <div className="space-y-3 mt-3">
                                              {metrics.analysisSummary.points?.map((p: any, i: number) => (
                                                  <div key={i} className="pl-3 border-l-2 border-teal-500/50">
                                                      <h4 className="text-[11px] font-bold text-teal-200 uppercase tracking-wide mb-1">{p.subtitle}</h4>
                                                      <p className="text-xs text-zinc-300 font-medium leading-snug">{p.content}</p>
                                                  </div>
                                              ))}
                                          </div>
                                      </>
                                  )}
                              </div>
                          )}
                      </div>
                  </div>

                  {/* BIOMARKER DETAILS */}
                  <div className="space-y-8">
                      {BIOMARKER_GROUPS.map(group => (
                          <div key={group.id}>
                              <h3 className="text-[10px] font-bold text-white uppercase tracking-widest mb-4 px-2 flex items-center gap-2">
                                  <group.icon size={12} className="text-white" /> {group.title}
                              </h3>
                              <div className="bg-black/40 backdrop-blur-md rounded-[2.5rem] border border-white/5 p-5 shadow-inner">
                                  {group.metrics.map(m => (
                                      <DetailRow 
                                          key={m.key}
                                          label={m.label} 
                                          value={metrics[m.key as keyof typeof metrics] as number} 
                                          description={m.desc} 
                                          avg={getAgeAdjustedAverage(userProfile.age, m.key)}
                                      />
                                  ))}
                              </div>
                          </div>
                      ))}
                  </div>

                  <div className="flex justify-center pt-8 pb-4">
                      <button onClick={() => scrollToSection(2)} className="flex flex-col items-center gap-1 text-white/40 hover:text-white transition-colors animate-bounce">
                          <span className="text-[9px] font-bold uppercase tracking-widest">Protocol</span>
                          <ChevronDown size={20} />
                      </button>
                  </div>
              </div>
          </section>

          {/* --- SECTION 3: TOOLS (Snap 3) --- */}
          <section className="h-[100dvh] w-full px-2 snap-start snap-always shrink-0 flex flex-col justify-end pb-4 pt-4">
              <div className="rounded-[2.5rem] backdrop-blur-3xl bg-zinc-900/80 border border-white/10 shadow-2xl relative overflow-hidden h-[92vh] flex flex-col">
                  <div className="absolute top-6 right-6 z-20">
                      <button onClick={() => scrollToSection(1)} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-white/20">
                          <ChevronUp size={20} />
                      </button>
                  </div>
                  <div className="pt-12 pb-2 px-8 shrink-0 text-center relative z-10">
                      <h2 className="text-4xl font-thin text-white tracking-tighter">Active Protocol</h2>
                  </div>
                  {/* Added pb-24 to prevent bottom nav overlap */}
                  <div className="flex-1 overflow-y-auto relative z-10 scroll-smooth snap-y snap-mandatory scrollbar-hide pb-24 pt-4">
                      {tools.map((tool, i) => (
                          <div key={i} className="snap-start snap-always shrink-0 w-full h-full flex flex-col justify-center px-8">
                              <button onClick={tool.action} className="text-left group opacity-80 hover:opacity-100 transition-all">
                                  <div className="flex items-baseline gap-4 mb-4">
                                      <span className="text-8xl font-thin text-teal-400 tracking-tighter">0{i + 1}</span>
                                  </div>
                                  <div className="pl-4 border-l-2 border-white/10 ml-2 py-4">
                                      <h3 className="text-5xl font-thin text-white tracking-tighter mb-4">{tool.title}</h3>
                                      <p className="text-base font-light text-zinc-300 leading-relaxed max-w-sm">{tool.desc}</p>
                                      <div className="mt-8 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-teal-400">Open Tool <ArrowRight size={16} /></div>
                                  </div>
                              </button>
                          </div>
                      ))}
                  </div>
              </div>
          </section>

      </div>
    </div>
  );
};
