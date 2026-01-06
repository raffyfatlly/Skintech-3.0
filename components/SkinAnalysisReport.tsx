
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { UserProfile, Product } from '../types';
import { TrendingUp, Droplet, Zap, ShieldCheck, Activity, ScanFace, Sun, ChevronUp, ChevronDown, Sparkles, ArrowRight, Microscope, Dna, Layers, ScanBarcode } from 'lucide-react';

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

// --- DATA ---
const METRIC_DETAILS: Record<string, { title: string; desc: string; high: string; low: string; icon: any }> = {
    texture: {
        title: "Skin Texture",
        desc: "Micro-Relief Analysis",
        high: "Smooth surface detected. Optimal exfoliation.",
        low: "Roughness detected. Exfoliation recommended.",
        icon: Activity
    },
    hydration: {
        title: "Hydration",
        desc: "Moisture Retention",
        high: "Well hydrated. Barrier function is strong.",
        low: "Dehydrated. Barrier function may be compromised.",
        icon: Droplet
    },
    acneActive: {
        title: "Inflammation",
        desc: "Bacterial Activity",
        high: "Clear skin. No active inflammation.",
        low: "Active breakouts detected. Bacterial activity present.",
        icon: Zap
    },
    pigmentation: {
        title: "Even Tone",
        desc: "Melanin Distribution",
        high: "Even skin tone. Minimal sun damage.",
        low: "Uneven tone. Signs of UV exposure visible.",
        icon: Sun
    },
    sagging: {
        title: "Elasticity",
        desc: "Collagen Network",
        high: "Firm contours. Strong collagen support.",
        low: "Loss of elasticity. Collagen support needed.",
        icon: ShieldCheck
    }
};

// --- COMPONENTS ---

const MetricOrb = ({ 
    label, 
    value, 
    icon: Icon,
    isActive,
    onClick
}: { 
    label: string; 
    value: number; 
    icon: any;
    isActive: boolean;
    onClick: () => void;
}) => {
    return (
        <button 
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={`shrink-0 flex flex-col items-center gap-3 snap-center group cursor-pointer transition-all duration-500 ${isActive ? 'scale-110 -translate-y-2' : 'opacity-60 hover:opacity-100 hover:-translate-y-1'}`}
        >
            <div className={`relative w-14 h-14 rounded-full backdrop-blur-md flex items-center justify-center shadow-lg transition-all duration-500 ${isActive ? 'bg-white/20 border border-white/40 text-white shadow-teal-500/20' : 'bg-black/20 border border-white/10 text-white/70'}`}>
                <Icon size={20} strokeWidth={isActive ? 2 : 1.5} className="transition-transform duration-500" />
                {isActive && (
                    <div className="absolute inset-0 rounded-full border border-teal-400/30 animate-ping"></div>
                )}
            </div>
            <div className="text-center">
                <span className={`block text-sm font-bold leading-none mb-1 transition-colors duration-500 ${isActive ? 'text-teal-300' : 'text-white'}`}>{value}</span>
                <span className="block text-[9px] font-medium text-white/80 uppercase tracking-widest">{label}</span>
            </div>
        </button>
    );
};

const ComparisonWidget = ({ userScore, age, metric }: { userScore: number, age: number, metric: string }) => {
    const [animate, setAnimate] = useState(false);
    
    // Dynamic Average Calculation based on Cohort (Age) + Metric Type
    // High Score = Good Condition
    const avgScore = useMemo(() => {
        let base = 75;
        let ageDelta = age - 25; // baseline age 25

        switch (metric) {
            case 'acneActive':
                // Acne usually improves with age (Score goes UP)
                // 18yo ~ 68, 40yo ~ 85
                base = 72;
                return Math.min(92, Math.round(base + (ageDelta * 0.4))); 
            
            case 'hydration':
                // Hydration drops with age
                // 25yo ~ 78, 60yo ~ 60
                base = 78;
                return Math.max(50, Math.round(base - (ageDelta * 0.3)));

            case 'sagging':
            case 'wrinkleFine':
            case 'texture':
                // Structural integrity drops with age
                // 20yo ~ 88, 60yo ~ 55
                base = 85;
                return Math.max(45, Math.round(base - (ageDelta * 0.6)));

            case 'pigmentation':
                // Sun damage accumulates (Score drops)
                base = 80;
                return Math.max(50, Math.round(base - (ageDelta * 0.4)));

            case 'redness':
                // Generally stable, slightly lower for older (rosacea risk)
                return 76;

            default:
                return 75;
        }
    }, [age, metric]);
    
    const diff = userScore - avgScore;
    const isBetter = diff >= 0;

    useEffect(() => {
        const t = setTimeout(() => setAnimate(true), 200);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="w-full max-w-[260px] mt-8 bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest">
                    Avg for Age {age}
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wide ${isBetter ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isBetter ? `Top ${Math.max(1, 50 - Math.round(diff * 1.5))}%` : 'Below Avg'}
                </span>
            </div>
            
            <div className="space-y-4">
                {/* User Bar */}
                <div className="relative">
                    <div className="flex justify-between text-[10px] font-bold text-white mb-1.5">
                        <span className="text-teal-300">You</span>
                        <span>{userScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-teal-400 shadow-[0_0_10px_#2dd4bf] transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] rounded-full"
                            style={{ width: animate ? `${userScore}%` : '0%' }}
                        />
                    </div>
                </div>

                {/* Average Bar */}
                <div className="relative">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-400 mb-1.5">
                        <span>Global Average</span>
                        <span>{avgScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-zinc-500/80 transition-all duration-1000 ease-out rounded-full"
                            style={{ width: animate ? `${avgScore}%` : '0%' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

const DetailRow = ({ label, value, description, icon: Icon }: { label: string, value: number, description: string, icon: any }) => {
    const getBarColor = (val: number) => {
        if (val >= 80) return 'bg-teal-500';
        if (val >= 60) return 'bg-teal-400';
        return 'bg-teal-300';
    };

    return (
        <div className="group py-4 border-b border-zinc-200/50 last:border-0 hover:bg-white/40 transition-colors rounded-xl px-2">
            <div className="flex justify-between items-end mb-2">
                <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100/50">
                        <Icon size={12} />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wide">{label}</h4>
                    </div>
                </div>
                <span className="text-sm font-black text-zinc-900">{value}%</span>
            </div>
            <div className="h-1.5 bg-zinc-200/60 rounded-full overflow-hidden mb-2 ml-8.5 w-[calc(100%-2rem)]">
                <div className={`h-full rounded-full ${getBarColor(value)} transition-all duration-1000 shadow-[0_0_10px_rgba(45,212,191,0.3)]`} style={{ width: `${value}%` }}></div>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium leading-relaxed pl-9">
                {description}
            </p>
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
  
  // Interactive State
  const [focusedMetric, setFocusedMetric] = useState<string | null>(null);
  const [displayScore, setDisplayScore] = useState(metrics.overallScore);
  
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const toolScrollRef = useRef<HTMLDivElement>(null);
  const toolRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastMainScrollY = useRef(0);
  const lastToolScrollY = useRef(0);

  // Score Animation Effect
  useEffect(() => {
      const targetScore = focusedMetric ? metrics[focusedMetric as keyof typeof metrics] as number : metrics.overallScore;
      
      let start = displayScore;
      const end = targetScore;
      const duration = 600;
      const startTime = performance.now();

      const animate = (time: number) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out
          
          const next = Math.round(start + (end - start) * ease);
          setDisplayScore(next);

          if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
  }, [focusedMetric, metrics]);

  // Derived Display Info
  const displayTitle = focusedMetric ? METRIC_DETAILS[focusedMetric]?.title : "Health Score";
  const displayIcon = focusedMetric ? METRIC_DETAILS[focusedMetric]?.icon : null;
  const displayAnalysis = focusedMetric 
      ? (metrics[focusedMetric as keyof typeof metrics] as number >= 70 ? METRIC_DETAILS[focusedMetric].high : METRIC_DETAILS[focusedMetric].low)
      : null;
  const displaySub = focusedMetric ? METRIC_DETAILS[focusedMetric].desc : null;

  const getMetricDesc = (val: number) => {
      if (val >= 80) return "Optimal condition.";
      if (val >= 60) return "Good, maintain routine.";
      return "Needs attention.";
  }

  useEffect(() => {
      window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
      return () => {
          window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
      };
  }, []);

  // --- TOOLS SCROLL SPY ---
  useEffect(() => {
      const el = toolScrollRef.current;
      if (!el) return;
      const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
              if (entry.isIntersecting) {
                  const idx = Number(entry.target.getAttribute('data-index'));
                  setActiveTool(idx);
              }
          });
      }, { threshold: 0.6 });
      toolRefs.current.forEach(r => { if (r) observer.observe(r); });
      return () => observer.disconnect();
  }, []);

  const handleMainScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const currentScrollY = e.currentTarget.scrollTop;
      const viewportHeight = e.currentTarget.clientHeight;
      const isHeroSection = currentScrollY < (viewportHeight * 0.8); 

      if (isHeroSection) {
          window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
          lastMainScrollY.current = currentScrollY;
          return;
      }

      const inSection2 = currentScrollY >= (viewportHeight * 0.8) && currentScrollY < (viewportHeight * 1.8);
      if (inSection2 && lastMainScrollY.current < (viewportHeight * 0.8)) {
           window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
           lastMainScrollY.current = currentScrollY;
           return;
      }

      const diff = Math.abs(currentScrollY - lastMainScrollY.current);
      if (diff > 10) {
          if (currentScrollY > lastMainScrollY.current) {
              window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
          } else {
              window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
          }
          lastMainScrollY.current = currentScrollY;
      }
  };

  const handleToolScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const currentScrollY = e.currentTarget.scrollTop;
      const diff = Math.abs(currentScrollY - lastToolScrollY.current);
      if (diff > 5) {
          if (currentScrollY > lastToolScrollY.current) {
              window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
          } else {
              window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
          }
          lastToolScrollY.current = currentScrollY;
      }
  };

  const scrollToSection = (index: number) => {
      if (mainContainerRef.current) {
          const h = mainContainerRef.current.clientHeight;
          mainContainerRef.current.scrollTo({ top: h * index, behavior: 'smooth' });
      }
  };

  const tools = [
      { id: 0, title: "Ingredient Scanner", desc: "Instant safety check. Scan products to see match score.", icon: ScanBarcode, action: onScanProduct },
      { id: 1, title: "Glowup Visualizer", desc: "Visualize ideal skin and generate clinical plans.", icon: Dna, action: onOpenSimulator },
      { id: 2, title: "Routine Architect", desc: "Get recommended products tailored to your skin.", icon: Layers, action: onOpenRoutineBuilder }
  ];

  const CurrentIcon = displayIcon || ScanFace;

  return (
    <div className="relative h-[100dvh] w-full bg-black font-sans selection:bg-teal-100 selection:text-teal-900 overflow-hidden">
      
      {/* 1. FIXED BACKGROUND LAYER */}
      <div className="fixed inset-0 z-0 h-full w-full bg-zinc-900 pointer-events-none">
          {userProfile.faceImage ? (
              <img src={userProfile.faceImage} alt="Face Scan" className="w-full h-full object-cover opacity-90" />
          ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black"></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
          
          {/* Dynamic Glow based on Score */}
          <div className={`absolute inset-0 transition-opacity duration-1000 ${focusedMetric ? 'opacity-30' : 'opacity-0'}`}>
               <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-teal-950/80 to-transparent"></div>
          </div>

          {/* NEW: Darker Overlay for Infographic Mode */}
          <div className={`absolute inset-0 bg-black/80 transition-opacity duration-700 ease-out ${focusedMetric ? 'opacity-100' : 'opacity-0'}`}></div>
      </div>

      {/* 2. SCROLLABLE CONTAINER (Full Page Snap) */}
      <div 
        ref={mainContainerRef}
        className="relative z-10 w-full h-full overflow-y-auto snap-y snap-mandatory scroll-smooth scrollbar-hide"
        onScroll={handleMainScroll}
      >
          
          {/* --- SECTION 1: HERO (Snap 1) --- */}
          <section className="h-[100dvh] w-full relative flex flex-col pt-safe-top snap-start snap-always shrink-0" onClick={() => setFocusedMetric(null)}>
              
              {/* Top Nav (Fade out when focusing metric to clean up UI) */}
              <div className={`px-6 pt-8 flex justify-between items-center z-50 transition-opacity duration-500 ${focusedMetric ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                  <div className="px-3 py-1.5 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/90 shadow-sm flex items-center gap-2">
                      <ScanFace size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                          {new Date(metrics.timestamp).toLocaleDateString()}
                      </span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onRescan(); }} className="w-9 h-9 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/30 transition-all active:scale-95">
                      <ScanFace size={16} />
                  </button>
              </div>

              {/* NEW: TOP HUD ANALYSIS OVERLAY (Immersive Text) */}
              {focusedMetric && (
                  <div className="absolute top-24 left-0 right-0 z-30 px-8 flex flex-col items-center text-center pointer-events-none">
                      {/* Transition container */}
                      <div className="animate-in fade-in slide-in-from-top-4 duration-500 ease-out w-full flex flex-col items-center">
                          <div className="inline-flex items-center gap-2 mb-4 animate-in fade-in zoom-in duration-500">
                              <CurrentIcon size={18} className="text-teal-400 drop-shadow-[0_0_10px_rgba(45,212,191,0.5)]" strokeWidth={2} />
                              <span className="text-xs font-bold text-teal-400 uppercase tracking-[0.3em] drop-shadow-sm">
                                  {displayTitle}
                              </span>
                          </div>
                          
                          <h2 className="text-4xl font-thin text-white leading-tight drop-shadow-lg mb-4 max-w-xs mx-auto animate-in slide-in-from-bottom-2 duration-700 delay-100">
                              {displayAnalysis}
                          </h2>
                          
                          <div className="inline-block relative animate-in fade-in duration-1000 delay-200">
                              <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                              <span className="relative bg-transparent px-4 text-[10px] text-zinc-300 font-bold uppercase tracking-widest bg-opacity-0 drop-shadow-md">
                                  {displaySub}
                              </span>
                          </div>

                          {/* COMPARISON WIDGET */}
                          <ComparisonWidget 
                              userScore={metrics[focusedMetric as keyof typeof metrics] as number} 
                              age={userProfile.age} 
                              metric={focusedMetric}
                          />
                      </div>
                  </div>
              )}

              <div className="flex-1 flex flex-col items-center justify-center pointer-events-none">
                  {/* Space for face */}
              </div>

              {/* Metrics Strip - The Stage */}
              <div className="mb-4 w-full animate-in slide-in-from-bottom-8 duration-700 pb-10">
                  <div 
                    className="flex items-end gap-8 overflow-x-auto px-6 pb-8 no-scrollbar snap-x snap-mandatory min-h-[160px]"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                  >
                      
                      {/* Main Dynamic Score Display */}
                      <div className="shrink-0 snap-center flex flex-col items-center justify-center pb-1 min-w-[100px]">
                          <div className="relative">
                              <span className={`text-6xl font-thin tracking-tighter leading-none text-white drop-shadow-xl transition-all duration-500 ${focusedMetric ? 'scale-125 text-teal-50 text-shadow-glow' : 'scale-100'}`}>
                                  {displayScore}
                              </span>
                              {!focusedMetric && <div className="absolute -top-1 -right-2 w-2 h-2 bg-teal-400 rounded-full shadow-[0_0_10px_rgba(45,212,191,0.8)] animate-pulse"></div>}
                          </div>
                          
                          <div className="mt-3 flex flex-col items-center gap-1 transition-opacity duration-500">
                              <span className="text-[9px] font-bold text-white/80 uppercase tracking-[0.2em] border-t border-white/20 pt-2 w-full text-center">
                                  {displayTitle}
                              </span>
                          </div>
                      </div>

                      <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/30 to-transparent shrink-0"></div>
                      
                      {/* Interactive Orbs */}
                      <MetricOrb label="Texture" value={metrics.texture} icon={Activity} isActive={focusedMetric === 'texture'} onClick={() => setFocusedMetric('texture')} />
                      <MetricOrb label="Hydration" value={metrics.hydration} icon={Droplet} isActive={focusedMetric === 'hydration'} onClick={() => setFocusedMetric('hydration')} />
                      <MetricOrb label="Acne" value={metrics.acneActive} icon={Zap} isActive={focusedMetric === 'acneActive'} onClick={() => setFocusedMetric('acneActive')} />
                      <MetricOrb label="Tone" value={metrics.pigmentation} icon={Sun} isActive={focusedMetric === 'pigmentation'} onClick={() => setFocusedMetric('pigmentation')} />
                      <MetricOrb label="Firmness" value={metrics.sagging} icon={ShieldCheck} isActive={focusedMetric === 'sagging'} onClick={() => setFocusedMetric('sagging')} />
                      
                      <div className="w-4 shrink-0"></div>
                  </div>
                  
                  <div className={`absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none transition-opacity duration-300 ${focusedMetric ? 'opacity-0' : 'opacity-100'}`}>
                      <button onClick={(e) => { e.stopPropagation(); scrollToSection(1); }} className="animate-bounce p-2 rounded-full text-white/50 pointer-events-auto hover:text-white transition-colors">
                          <ChevronDown size={24} />
                      </button>
                  </div>
              </div>
          </section>

          {/* --- SECTION 2: CLINICAL REPORT (Snap 2) --- */}
          <section className="h-[100dvh] w-full px-2 snap-start snap-always shrink-0 flex flex-col justify-end pb-4 pt-4 relative">
              <div 
                className="bg-zinc-100/90 backdrop-blur-3xl border border-white/40 rounded-[2.5rem] px-6 pt-12 pb-8 shadow-2xl relative overflow-y-auto scrollbar-hide h-[92vh] w-full"
                onScrollCapture={(e) => {
                    const currentY = e.currentTarget.scrollTop;
                    const diff = Math.abs(currentY - lastMainScrollY.current);
                    if (diff > 10) {
                        if (currentY > lastMainScrollY.current) window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
                        else window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
                        lastMainScrollY.current = currentY;
                    }
                }}
              >
                  <div className="sticky top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-300/50 rounded-full mb-6 mx-auto"></div>

                  <div className="mb-8 flex justify-between items-end">
                      <div>
                          <h2 className="text-4xl font-thin text-zinc-900 tracking-tighter leading-none mb-1.5 drop-shadow-sm">Skin Report</h2>
                          <p className="text-xs text-teal-600 font-bold">Detailed clinical analysis.</p>
                      </div>
                      {userProfile.scanHistory && userProfile.scanHistory.length > 1 && (
                          <button onClick={onViewProgress} className="w-10 h-10 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:text-teal-600 transition-colors shadow-sm">
                              <TrendingUp size={16} />
                          </button>
                      )}
                  </div>

                  {/* AI Dermatologist Box */}
                  <div className="bg-white/60 rounded-[2rem] p-6 mb-8 border border-white shadow-xl shadow-zinc-200/20 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-teal-100/50 transition-colors opacity-60"></div>
                      <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-3 text-teal-600">
                              <Sparkles size={14} fill="currentColor" className="opacity-40" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">AI Dermatologist</span>
                          </div>
                          {metrics.analysisSummary && (
                              <div className="space-y-3">
                                  {typeof metrics.analysisSummary === 'string' ? (
                                      <p className="text-sm text-zinc-600 font-medium leading-relaxed">{metrics.analysisSummary}</p>
                                  ) : (
                                      <>
                                          <p className="text-sm font-bold leading-relaxed text-zinc-800">
                                              {metrics.analysisSummary.generalCondition}
                                          </p>
                                          <div className="space-y-2 mt-2">
                                              {metrics.analysisSummary.points?.slice(0,2).map((p: any, i: number) => (
                                                  <div key={i} className="flex gap-3 items-start pl-3 border-l-2 border-teal-200">
                                                      <p className="text-xs text-zinc-500 leading-snug">
                                                          <span className="text-teal-700 font-bold">{p.subtitle}: </span>
                                                          {p.content}
                                                      </p>
                                                  </div>
                                              ))}
                                          </div>
                                      </>
                                  )}
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="">
                      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 px-2">Key Metrics</h3>
                      <div className="bg-white/40 backdrop-blur-md rounded-[2rem] border border-white/40 p-4 shadow-sm space-y-1">
                          <DetailRow label="Hydration" value={metrics.hydration} description={getMetricDesc(metrics.hydration)} icon={Droplet} />
                          <DetailRow label="Acne" value={metrics.acneActive} description={getMetricDesc(metrics.acneActive)} icon={Zap} />
                          <DetailRow label="Pigmentation" value={metrics.pigmentation} description={getMetricDesc(metrics.pigmentation)} icon={Sun} />
                          <DetailRow label="Texture" value={metrics.texture} description={getMetricDesc(metrics.texture)} icon={Activity} />
                      </div>
                  </div>

                  <div className="flex justify-center pt-8 pb-4">
                      <button onClick={() => scrollToSection(2)} className="flex flex-col items-center gap-1 text-zinc-400 hover:text-teal-600 transition-colors animate-bounce">
                          <span className="text-[9px] font-bold uppercase tracking-widest">Clinical Protocol</span>
                          <ChevronDown size={20} />
                      </button>
                  </div>
              </div>
          </section>

          {/* --- SECTION 3: ADVANCED TOOLS (Snap 3) --- */}
          <section className="h-[100dvh] w-full px-2 snap-start snap-always shrink-0 flex flex-col justify-end pb-4 pt-4">
              <div className="rounded-[2.5rem] backdrop-blur-3xl bg-zinc-900/60 border border-white/10 shadow-2xl relative overflow-hidden h-[92vh] flex flex-col">
                  <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-black/20 to-transparent pointer-events-none"></div>
                  <div className="absolute top-6 right-6 z-20">
                      <button onClick={() => scrollToSection(1)} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
                          <ChevronUp size={20} />
                      </button>
                  </div>

                  <div className="pt-12 pb-2 px-8 shrink-0 text-center relative z-10">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-6">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></div>
                          <span className="text-[10px] font-bold text-teal-200 uppercase tracking-widest">Next Steps</span>
                      </div>
                      <h2 className="text-4xl font-thin text-white tracking-tighter leading-none">Active Protocol</h2>
                  </div>

                  <div ref={toolScrollRef} className="flex-1 overflow-y-auto relative z-10 scroll-smooth snap-y snap-mandatory scrollbar-hide pb-safe pt-4" onScroll={handleToolScroll}>
                      {tools.map((tool, i) => {
                          const isActive = activeTool === i;
                          return (
                              <div key={i} ref={el => toolRefs.current[i] = el} data-index={i} className="snap-start snap-always shrink-0 w-full h-full flex flex-col justify-center px-8">
                                  <button onClick={tool.action} className={`text-left group transition-all duration-700 ${isActive ? 'opacity-100 scale-100 translate-y-0' : 'opacity-30 scale-95 translate-y-8 blur-[2px]'}`}>
                                      <div className="flex items-baseline gap-4 mb-4">
                                          <span className={`text-8xl font-thin tracking-tighter transition-colors duration-500 leading-none ${isActive ? 'text-teal-400' : 'text-zinc-600'}`}>0{i + 1}</span>
                                      </div>
                                      <div className="pl-4 border-l-2 border-white/10 ml-2 py-4">
                                          <h3 className={`text-5xl font-thin tracking-tighter mb-4 transition-colors ${isActive ? 'text-white' : 'text-zinc-500'}`}>{tool.title}</h3>
                                          <p className={`text-base font-light leading-relaxed max-w-sm transition-colors ${isActive ? 'text-zinc-300' : 'text-zinc-700'}`}>{tool.desc}</p>
                                          <div className={`mt-8 flex items-center gap-3 text-xs font-bold uppercase tracking-widest transition-all ${isActive ? 'text-teal-400 translate-x-2' : 'text-zinc-700 opacity-0'}`}>
                                              Open Tool <ArrowRight size={16} />
                                          </div>
                                      </div>
                                  </button>
                              </div>
                          )
                      })}
                  </div>
                  <div className="absolute top-36 left-0 right-0 h-32 bg-gradient-to-b from-zinc-900/0 to-transparent pointer-events-none z-20"></div>
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-zinc-900/80 to-transparent pointer-events-none z-20"></div>
              </div>
          </section>

      </div>
    </div>
  );
};
