
import React, { useRef, useEffect, useState } from 'react';
import { UserProfile, Product } from '../types';
import { TrendingUp, Play, Droplet, Zap, ShieldCheck, Activity, ScanFace, Sun, ChevronUp, ChevronDown, Sparkles, ArrowRight, Microscope, Dna, Layers, ScanBarcode } from 'lucide-react';

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

// --- HORIZONTAL SCROLL ITEM (Top HUD) ---
const MetricOrb = ({ 
    label, 
    value, 
    icon: Icon,
    delay
}: { 
    label: string; 
    value: number; 
    icon: any;
    delay: number;
}) => {
    return (
        <div 
            className="shrink-0 flex flex-col items-center gap-3 snap-center animate-in zoom-in-50 fade-in duration-700 fill-mode-backwards"
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="w-14 h-14 rounded-full backdrop-blur-md bg-black/20 border border-white/10 flex items-center justify-center shadow-lg transition-transform active:scale-95 text-white">
                <Icon size={20} strokeWidth={1.5} />
            </div>
            <div className="text-center">
                <span className="block text-sm font-bold text-white leading-none mb-1 shadow-black drop-shadow-md">{value}</span>
                <span className="block text-[9px] font-medium text-white/80 uppercase tracking-widest drop-shadow-sm">{label}</span>
            </div>
        </div>
    );
};

// --- DETAIL ROW (Light Glass Theme) ---
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
  const score = metrics.overallScore;
  const [activeTool, setActiveTool] = useState(0);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const toolScrollRef = useRef<HTMLDivElement>(null);
  const toolRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  // Independent scroll trackers
  const lastMainScrollY = useRef(0);
  const lastToolScrollY = useRef(0);

  const getMetricDesc = (val: number) => {
      if (val >= 80) return "Optimal condition.";
      if (val >= 60) return "Good, maintain routine.";
      return "Needs attention.";
  }

  // --- INIT: HIDE NAV ON MOUNT (IMMERSIVE HERO) ---
  useEffect(() => {
      // Force hide the navigation bar when this component mounts (starts in Hero section)
      window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
      
      return () => {
          // Restore navigation bar when unmounting
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
      }, {
          root: el,
          threshold: 0.6,
          rootMargin: "0px"
      });

      toolRefs.current.forEach(r => { if (r) observer.observe(r); });
      return () => observer.disconnect();
  }, []);

  // --- MAIN PAGE SCROLL HANDLER ---
  const handleMainScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const currentScrollY = e.currentTarget.scrollTop;
      const viewportHeight = e.currentTarget.clientHeight;
      
      // Determine if we are in the Hero Section (Section 1)
      const isHeroSection = currentScrollY < (viewportHeight * 0.8); 

      if (isHeroSection) {
          // FORCE HIDE in Section 1
          window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
          lastMainScrollY.current = currentScrollY;
          return;
      }

      // Check if we just transitioned FROM Hero TO Report (Section 2)
      // Logic: If we are in Section 2, but just came from above, force show.
      const inSection2 = currentScrollY >= (viewportHeight * 0.8) && currentScrollY < (viewportHeight * 1.8);
      if (inSection2 && lastMainScrollY.current < (viewportHeight * 0.8)) {
           window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
           lastMainScrollY.current = currentScrollY;
           return;
      }

      // Standard directional logic for main page
      const threshold = 10; 
      const diff = Math.abs(currentScrollY - lastMainScrollY.current);
      
      if (diff > threshold) {
          if (currentScrollY > lastMainScrollY.current) {
              // Scrolling Down -> Hide
              window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
          } else {
              // Scrolling Up -> Show
              window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
          }
          lastMainScrollY.current = currentScrollY;
      }
  };

  // --- INNER TOOL SCROLL HANDLER ---
  const handleToolScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const currentScrollY = e.currentTarget.scrollTop;
      const threshold = 5; // Sensitive
      
      const diff = Math.abs(currentScrollY - lastToolScrollY.current);
      
      if (diff > threshold) {
          if (currentScrollY > lastToolScrollY.current) {
              // Scrolling Down in tools -> Hide Nav
              window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
          } else {
              // Scrolling Up in tools -> Show Nav
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
      {
          id: 0,
          title: "Ingredient Scanner",
          desc: "Instant safety check. Scan products to see match score.",
          icon: ScanBarcode,
          action: onScanProduct
      },
      {
          id: 1,
          title: "Glowup Visualizer",
          desc: "Visualize ideal skin and generate clinical plans.",
          icon: Dna,
          action: onOpenSimulator
      },
      {
          id: 2,
          title: "Routine Architect",
          desc: "Get recommended products tailored to your skin.",
          icon: Layers,
          action: onOpenRoutineBuilder
      }
  ];

  return (
    <div className="relative h-[100dvh] w-full bg-black font-sans selection:bg-teal-100 selection:text-teal-900 overflow-hidden">
      
      {/* 1. FIXED BACKGROUND LAYER */}
      <div className="fixed inset-0 z-0 h-full w-full bg-zinc-900 pointer-events-none">
          {userProfile.faceImage ? (
              <img 
                src={userProfile.faceImage} 
                alt="Face Scan" 
                className="w-full h-full object-cover opacity-90" 
              />
          ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black"></div>
          )}
          {/* Overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
      </div>

      {/* 2. SCROLLABLE CONTAINER (Full Page Snap) */}
      <div 
        ref={mainContainerRef}
        className="relative z-10 w-full h-full overflow-y-auto snap-y snap-mandatory scroll-smooth scrollbar-hide"
        onScroll={handleMainScroll}
      >
          
          {/* --- SECTION 1: HERO (Snap 1) --- */}
          <section className="h-[100dvh] w-full relative flex flex-col pt-safe-top snap-start snap-always shrink-0">
              
              {/* Top Nav */}
              <div className="px-6 pt-8 flex justify-between items-center z-50 animate-in slide-in-from-top-4 duration-700">
                  <div className="px-3 py-1.5 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white/90 shadow-sm flex items-center gap-2">
                      <ScanFace size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                          {new Date(metrics.timestamp).toLocaleDateString()}
                      </span>
                  </div>
                  <button onClick={onRescan} className="w-9 h-9 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/30 transition-all active:scale-95">
                      <ScanFace size={16} />
                  </button>
              </div>

              <div className="flex-1"></div>

              {/* Metrics Strip - Lowered (Less padding bottom) */}
              <div className="mb-4 w-full animate-in slide-in-from-bottom-8 duration-700 pb-10">
                  <div className="flex items-end gap-8 overflow-x-auto px-6 pb-8 no-scrollbar snap-x snap-mandatory">
                      {/* Score */}
                      <div className="shrink-0 snap-center flex flex-col items-center justify-center pb-1">
                          <div className="relative">
                              <span className="text-6xl font-thin tracking-tighter leading-none text-white drop-shadow-xl">{score}</span>
                              <div className="absolute -top-1 -right-2 w-2 h-2 bg-teal-400 rounded-full shadow-[0_0_10px_rgba(45,212,191,0.8)] animate-pulse"></div>
                          </div>
                          <span className="text-[9px] font-bold text-white/80 uppercase tracking-[0.2em] mt-2 border-t border-white/20 pt-2 w-full text-center">Health Score</span>
                      </div>
                      <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/30 to-transparent shrink-0"></div>
                      
                      <MetricOrb label="Texture" value={metrics.texture} icon={Activity} delay={100} />
                      <MetricOrb label="Hydration" value={metrics.hydration} icon={Droplet} delay={200} />
                      <MetricOrb label="Acne" value={metrics.acneActive} icon={Zap} delay={300} />
                      <MetricOrb label="Tone" value={metrics.pigmentation} icon={Sun} delay={400} />
                      <MetricOrb label="Firmness" value={metrics.sagging} icon={ShieldCheck} delay={500} />
                      <div className="w-4 shrink-0"></div>
                  </div>
                  
                  {/* Explicit Navigation Arrow to Section 2 */}
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
                      <button 
                        onClick={() => scrollToSection(1)}
                        className="animate-bounce p-2 rounded-full text-white/50 hover:text-white transition-colors"
                      >
                          <ChevronDown size={24} />
                      </button>
                  </div>
              </div>
          </section>

          {/* --- SECTION 2: CLINICAL REPORT (Snap 2) --- */}
          {/* Forced height to viewport for strict snap */}
          <section className="h-[100dvh] w-full px-2 snap-start snap-always shrink-0 flex flex-col justify-end pb-4 pt-4 relative">
              <div 
                className="bg-zinc-100/90 backdrop-blur-3xl border border-white/40 rounded-[2.5rem] px-6 pt-12 pb-8 shadow-2xl relative overflow-y-auto scrollbar-hide h-[92vh] w-full"
                onScroll={(e) => e.stopPropagation()} // Prevent bubble up if necessary, but actually we want main scroll on this overlay? No, this is content scroll.
                // Actually this div has overflow-y-auto, so IT scrolls. We should attach handleMainScroll logic here too if we want nav bar to react to this content.
                // Let's attach a simplified handler here.
                onScrollCapture={(e) => {
                    // Re-use logic but context is Section 2 content
                    const currentY = e.currentTarget.scrollTop;
                    const diff = Math.abs(currentY - lastMainScrollY.current);
                    if (diff > 10) {
                        if (currentY > lastMainScrollY.current) {
                             window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: false }));
                        } else {
                             window.dispatchEvent(new CustomEvent('set-bottom-nav-visibility', { detail: true }));
                        }
                        lastMainScrollY.current = currentY;
                    }
                }}
              >
                  
                  {/* Drag Handle */}
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

                  {/* AI Dermatologist Box - White Glass */}
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

                  {/* Scroll Down Hint Button */}
                  <div className="flex justify-center pt-8 pb-4">
                      <button 
                        onClick={() => scrollToSection(2)}
                        className="flex flex-col items-center gap-1 text-zinc-400 hover:text-teal-600 transition-colors animate-bounce"
                      >
                          <span className="text-[9px] font-bold uppercase tracking-widest">Clinical Protocol</span>
                          <ChevronDown size={20} />
                      </button>
                  </div>
              </div>
          </section>

          {/* --- SECTION 3: ADVANCED TOOLS (Snap 3) --- */}
          {/* Forced height to viewport for strict snap */}
          <section className="h-[100dvh] w-full px-2 snap-start snap-always shrink-0 flex flex-col justify-end pb-4 pt-4">
              <div className="rounded-[2.5rem] backdrop-blur-3xl bg-zinc-900/60 border border-white/10 shadow-2xl relative overflow-hidden h-[92vh] flex flex-col">
                  
                  {/* Decorative Background Elements (Subtle Uniform) */}
                  <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-black/20 to-transparent pointer-events-none"></div>

                  {/* Scroll Up Cue - Explicit Back Button */}
                  <div className="absolute top-6 right-6 z-20">
                      <button 
                        onClick={() => scrollToSection(1)}
                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                      >
                          <ChevronUp size={20} />
                      </button>
                  </div>

                  {/* Header (Smaller, Thin Font) */}
                  <div className="pt-12 pb-2 px-8 shrink-0 text-center relative z-10">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-6">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></div>
                          <span className="text-[10px] font-bold text-teal-200 uppercase tracking-widest">Next Steps</span>
                      </div>
                      <h2 className="text-4xl font-thin text-white tracking-tighter leading-none">Active Protocol</h2>
                  </div>

                  {/* Vertical Scroll List (Strict Snapping for Controlled Speed) */}
                  <div 
                      ref={toolScrollRef}
                      className="flex-1 overflow-y-auto relative z-10 scroll-smooth snap-y snap-mandatory scrollbar-hide pb-safe pt-4"
                      onScroll={handleToolScroll}
                  >
                      {tools.map((tool, i) => {
                          const isActive = activeTool === i;
                          return (
                              <div 
                                  key={i}
                                  ref={el => toolRefs.current[i] = el}
                                  data-index={i}
                                  // ADDED snap-always to force stop
                                  className="snap-start snap-always shrink-0 w-full h-full flex flex-col justify-center px-8"
                              >
                                  <button 
                                      onClick={tool.action}
                                      className={`text-left group transition-all duration-700 ${isActive ? 'opacity-100 scale-100 translate-y-0' : 'opacity-30 scale-95 translate-y-8 blur-[2px]'}`}
                                  >
                                      <div className="flex items-baseline gap-4 mb-4">
                                          <span className={`text-8xl font-thin tracking-tighter transition-colors duration-500 leading-none ${isActive ? 'text-teal-400' : 'text-zinc-600'}`}>
                                              0{i + 1}
                                          </span>
                                      </div>
                                      
                                      <div className="pl-4 border-l-2 border-white/10 ml-2 py-4">
                                          <h3 className={`text-5xl font-thin tracking-tighter mb-4 transition-colors ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                                              {tool.title}
                                          </h3>
                                          <p className={`text-base font-light leading-relaxed max-w-sm transition-colors ${isActive ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                              {tool.desc}
                                          </p>
                                          
                                          <div className={`mt-8 flex items-center gap-3 text-xs font-bold uppercase tracking-widest transition-all ${isActive ? 'text-teal-400 translate-x-2' : 'text-zinc-700 opacity-0'}`}>
                                              Open Tool <ArrowRight size={16} />
                                          </div>
                                      </div>
                                  </button>
                              </div>
                          )
                      })}
                  </div>
                  
                  {/* Fade gradients for scroll (Seamless blend) */}
                  <div className="absolute top-36 left-0 right-0 h-32 bg-gradient-to-b from-zinc-900/0 to-transparent pointer-events-none z-20"></div>
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-zinc-900/80 to-transparent pointer-events-none z-20"></div>

              </div>
          </section>

      </div>
    </div>
  );
};
