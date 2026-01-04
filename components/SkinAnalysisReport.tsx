import React from 'react';
import { UserProfile, Product } from '../types';
import { TrendingUp, Play, Droplet, Zap, ShieldCheck, Activity, Star, ScanFace, AlertCircle } from 'lucide-react';

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

export const SkinAnalysisReport: React.FC<SkinAnalysisReportProps> = ({
  userProfile,
  onRescan,
  onViewProgress,
  onOpenRoutineBuilder,
  onOpenSimulator
}) => {
  const metrics = userProfile.biometrics;
  const score = metrics.overallScore;
  
  // Helper to get color based on score
  const getScoreColor = (val: number) => {
      if (val >= 80) return 'text-emerald-500';
      if (val >= 60) return 'text-teal-500';
      if (val >= 40) return 'text-amber-500';
      return 'text-rose-500';
  };

  const MetricCard = ({ label, value, icon: Icon }: { label: string, value: number, icon: any }) => (
      <div className="bg-zinc-50 rounded-2xl p-4 flex flex-col items-center justify-center border border-zinc-100 shadow-sm">
          <Icon size={20} className={`mb-2 ${getScoreColor(value)}`} />
          <span className="text-2xl font-black text-zinc-900">{value}</span>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
      </div>
  );

  return (
    <div className="pb-32 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="px-6 pt-8 pb-10 bg-white rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          
          <div className="relative z-10 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 mb-6 border border-zinc-200">
                   <ScanFace size={12} className="text-zinc-500" />
                   <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                       {new Date(metrics.timestamp).toLocaleDateString()}
                   </span>
              </div>
              
              <div className="relative inline-block">
                  <h1 className={`text-8xl font-black tracking-tighter ${getScoreColor(score)} drop-shadow-sm`}>
                      {score}
                  </h1>
                  <div className="absolute -top-4 -right-8 bg-black text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-widest transform rotate-12">
                      Overall
                  </div>
              </div>
              
              <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest mt-2">Skin Health Score</p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3">
              <button 
                  onClick={onRescan}
                  className="py-4 rounded-xl bg-zinc-900 text-white font-bold text-xs uppercase tracking-widest hover:bg-zinc-800 transition-colors shadow-lg"
              >
                  New Scan
              </button>
              <button 
                   onClick={onOpenRoutineBuilder}
                   className="py-4 rounded-xl bg-teal-50 text-teal-700 border border-teal-100 font-bold text-xs uppercase tracking-widest hover:bg-teal-100 transition-colors"
              >
                  Build Routine
              </button>
          </div>
      </div>

      {/* METRICS GRID */}
      <div className="px-6 mt-8 space-y-6">
          <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Detailed Analysis</h3>
              {userProfile.scanHistory && userProfile.scanHistory.length > 1 && (
                  <button onClick={onViewProgress} className="flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-700">
                      <TrendingUp size={14} /> View History
                  </button>
              )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
              <MetricCard label="Hydration" value={metrics.hydration} icon={Droplet} />
              <MetricCard label="Acne Free" value={metrics.acneActive} icon={Zap} />
              <MetricCard label="Even Tone" value={metrics.pigmentation} icon={Activity} />
              <MetricCard label="Firmness" value={metrics.sagging} icon={ShieldCheck} />
              <MetricCard label="Texture" value={metrics.texture} icon={Star} />
              <MetricCard label="Redness" value={metrics.redness} icon={AlertCircle} />
          </div>

          {/* SIMULATOR CTA */}
          <div className="bg-gradient-to-br from-teal-900 to-zinc-900 rounded-[2rem] p-8 text-center relative overflow-hidden shadow-xl">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
              <div className="relative z-10">
                  <h3 className="text-2xl font-black text-white mb-2">Visualize Your Potential</h3>
                  <p className="text-teal-200 text-xs font-medium mb-6 max-w-xs mx-auto">
                      See what your skin could look like with the perfect routine.
                  </p>
                  <button 
                      onClick={onOpenSimulator}
                      className="w-full py-4 bg-white text-teal-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-center gap-2"
                  >
                      <Play size={14} fill="currentColor" /> Enter Simulator
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};
