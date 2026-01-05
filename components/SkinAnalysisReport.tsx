
import React from 'react';
import { UserProfile, Product } from '../types';
import { TrendingUp, Play, Droplet, Zap, ShieldCheck, Activity, ScanFace, Sun, ChevronUp, Sparkles, ArrowRight, Microscope, Dna, Layers } from 'lucide-react';

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

// --- DETAIL ROW (Light Grey Theme) ---
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
                    <div className="w-6 h-6 rounded-full bg-teal-50 flex items-center justify-center text-teal-600">
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
            <p className="text-[10px] text-zinc-400 font-medium leading-relaxed pl-9">
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
  onOpenSimulator
}) => {
  const metrics = userProfile.biometrics;
  const score = metrics.overallScore;

  const getMetricDesc = (val: number) => {
      if (val >= 80) return "Optimal condition.";
      if (val >= 60) return "Good, maintain routine.";
      return "Needs attention.";
  }

  return (
    <div className="relative w-full bg-black font-sans selection:bg-teal-100 selection:text-teal-900">
      
      {/* GLOBAL SCROLL SNAP STYLES */}
      <style>{`
        html {
            scroll-snap-type: y mandatory;
        }
        .snap-section {
            scroll-snap-align: start;
            scroll-snap-stop: always;
        }
      `}</style>

      {/* 1. FIXED BACKGROUND LAYER */}
      <div className="fixed inset-0 z-0 h-full w-full bg-zinc-900">
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none"></div>
      </div>

      {/* 2. SCROLLABLE CONTENT */}
      <div className="relative z-10 w-full pb-safe">
          
          {/* --- SECTION 1: HERO (Snap 1) --- */}
          <section className="h-[100dvh] w-full relative flex flex-col pt-safe-top snap-section shrink-0">
              
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

              {/* Metrics Strip */}
              <div className="mb-4 w-full animate-in slide-in-from-bottom-8 duration-700">
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
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center opacity-40 animate-pulse pointer-events-none">
                      <ChevronUp size={20} className="text-white" />
                  </div>
              </div>
          </section>

          {/* --- SECTION 2: CLINICAL REPORT (Snap 2) --- */}
          {/* Acts as a "Paper Sheet" floating over the face */}
          <section className="min-h-[85vh] w-full px-2 snap-section flex flex-col justify-end pb-4 pt-12">
              <div className="bg-zinc-100/60 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] px-6 pt-12 pb-8 shadow-2xl relative overflow-hidden min-h-[55vh]">
                  
                  {/* Drag Handle */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-400/30 rounded-full"></div>

                  <div className="mb-8 flex justify-between items-end">
                      <div>
                          <h2 className="text-4xl font-thin text-teal-500 tracking-tighter leading-none mb-1.5 drop-shadow-sm">Skin Report</h2>
                          <p className="text-xs text-black font-bold">Detailed clinical analysis.</p>
                      </div>
                      {userProfile.scanHistory && userProfile.scanHistory.length > 1 && (
                          <button onClick={onViewProgress} className="w-10 h-10 bg-white border border-zinc-200 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-50 hover:text-teal-600 transition-colors shadow-sm">
                              <TrendingUp size={16} />
                          </button>
                      )}
                  </div>

                  <div className="bg-white/80 rounded-[2rem] p-6 mb-8 border border-white shadow-xl shadow-zinc-200/50 relative overflow-hidden group">
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
                                                  <div key={i} className="flex gap-3 items-start pl-3 border-l-2 border-teal-100">
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
                      <h3 className="text-[10px] font-bold text-white uppercase tracking-widest mb-4 px-2 drop-shadow-md">Key Metrics</h3>
                      <div className="bg-white/40 backdrop-blur-md rounded-[2rem] border border-white/40 p-4 shadow-sm space-y-1">
                          <DetailRow label="Hydration" value={metrics.hydration} description={getMetricDesc(metrics.hydration)} icon={Droplet} />
                          <DetailRow label="Acne" value={metrics.acneActive} description={getMetricDesc(metrics.acneActive)} icon={Zap} />
                          <DetailRow label="Pigmentation" value={metrics.pigmentation} description={getMetricDesc(metrics.pigmentation)} icon={Sun} />
                          <DetailRow label="Texture" value={metrics.texture} description={getMetricDesc(metrics.texture)} icon={Activity} />
                      </div>
                  </div>
              </div>
          </section>

          {/* --- SECTION 3: ADVANCED TOOLS (Snap 3) --- */}
          {/* INFOGRAPHIC STYLE / GLASS PROTOCOL */}
          <section className="min-h-[85vh] w-full px-2 snap-section flex flex-col justify-end pb-4 pt-12">
              <div className="rounded-[2.5rem] backdrop-blur-3xl bg-black/60 border border-white/10 px-6 pt-12 pb-8 shadow-2xl relative overflow-hidden min-h-[55vh]">
                  
                  {/* Decorative Background Elements inside Glass */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-[80px] pointer-events-none"></div>
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>

                  {/* Header */}
                  <div className="mb-10 text-center relative z-10">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></div>
                          <span className="text-[10px] font-bold text-teal-200 uppercase tracking-widest">Next Steps</span>
                      </div>
                      <h2 className="text-3xl font-black text-white tracking-tight">Active Protocol</h2>
                      <p className="text-white/50 text-xs font-medium mt-2 max-w-[200px] mx-auto">
                          AI-generated interventions based on your unique skin profile.
                      </p>
                  </div>

                  {/* Infographic Layout */}
                  <div className="relative z-10 space-y-6">
                      
                      {/* TOOL 1: GLOWUP VISUALIZER */}
                      <button 
                          onClick={onOpenSimulator}
                          className="group relative w-full text-left"
                      >
                          {/* Connecting Line (Gradient) */}
                          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-teal-500/50 to-transparent group-hover:from-teal-400 transition-colors"></div>
                          
                          <div className="pl-12 relative">
                              {/* Node Circle */}
                              <div className="absolute left-4 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-black bg-zinc-800 group-hover:bg-teal-400 group-hover:border-teal-400 transition-colors shadow-[0_0_10px_rgba(45,212,191,0.5)] z-20"></div>
                              
                              <div className="bg-white/5 border border-white/10 rounded-[2rem] p-6 backdrop-blur-md transition-all duration-300 group-hover:bg-white/10 group-hover:border-white/20 group-hover:translate-x-1 group-active:scale-[0.98] shadow-lg">
                                  <div className="flex justify-between items-start mb-4">
                                      <div className="p-3 bg-white/10 rounded-2xl text-teal-300 border border-white/5 shadow-inner">
                                          <Dna size={24} />
                                      </div>
                                      <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors -rotate-45 group-hover:rotate-0 transform duration-300" />
                                  </div>
                                  
                                  <h3 className="text-xl font-bold text-white mb-1">Glowup Visualizer</h3>
                                  <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                                      Visualize your ideal skin and generate a clinical plan to achieve the result.
                                  </p>
                              </div>
                          </div>
                      </button>

                      {/* TOOL 2: ROUTINE ARCHITECT */}
                      <button 
                          onClick={onOpenRoutineBuilder}
                          className="group relative w-full text-left"
                      >
                          {/* Connecting Line */}
                          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent to-indigo-500/50 group-hover:to-indigo-400 transition-colors"></div>
                          
                          <div className="pl-12 relative">
                              {/* Node Circle */}
                              <div className="absolute left-4 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-black bg-zinc-800 group-hover:bg-indigo-400 group-hover:border-indigo-400 transition-colors shadow-[0_0_10px_rgba(129,140,248,0.5)] z-20"></div>
                              
                              <div className="bg-white/5 border border-white/10 rounded-[2rem] p-6 backdrop-blur-md transition-all duration-300 group-hover:bg-white/10 group-hover:border-white/20 group-hover:translate-x-1 group-active:scale-[0.98] shadow-lg">
                                  <div className="flex justify-between items-start mb-4">
                                      <div className="p-3 bg-white/10 rounded-2xl text-indigo-300 border border-white/5 shadow-inner">
                                          <Layers size={24} />
                                      </div>
                                      <ArrowRight size={20} className="text-white/20 group-hover:text-white transition-colors -rotate-45 group-hover:rotate-0 transform duration-300" />
                                  </div>
                                  
                                  <h3 className="text-xl font-bold text-white mb-1">Routine Architect</h3>
                                  <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                                      Get recommended best-match products scientifically tailored to your skin.
                                  </p>
                              </div>
                          </div>
                      </button>

                  </div>
              </div>
          </section>

      </div>
    </div>
  );
};
