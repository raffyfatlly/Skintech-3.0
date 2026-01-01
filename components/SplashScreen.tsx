
import React from 'react';
import { ScanFace, Sparkles } from 'lucide-react';

const SplashScreen = ({ message }: { message?: string }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 select-none cursor-wait overflow-hidden font-sans">
      
      {/* Decorative Gradients */}
      <div className="absolute top-0 left-0 w-full h-2/3 bg-gradient-to-b from-teal-50/60 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-teal-100/20 rounded-full blur-3xl translate-y-1/2 translate-x-1/2 pointer-events-none" />

      {/* Main Logo Container */}
      <div className="relative mb-14">
        {/* Pulsing Rings */}
        <div className="absolute inset-0 bg-teal-500/5 rounded-3xl animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
        
        {/* Rotating Elements */}
        <div className="absolute inset-[-20px] border border-teal-100/50 rounded-full animate-[spin_8s_linear_infinite]" />
        <div className="absolute inset-[-35px] border border-dashed border-teal-200/30 rounded-full animate-[spin_12s_linear_infinite_reverse]" />
        
        {/* Icon Container */}
        <div className="relative z-10 w-28 h-28 bg-white rounded-[2rem] shadow-[0_20px_50px_-12px_rgba(20,184,166,0.25)] flex items-center justify-center border border-zinc-50 overflow-hidden">
           <ScanFace size={52} className="text-zinc-900" strokeWidth={1.5} />
           
           {/* Scanner Beam Animation */}
           <div className="absolute inset-0 bg-gradient-to-b from-transparent via-teal-400/20 to-transparent animate-[scan_2s_ease-in-out_infinite] z-20" />
        </div>

        {/* Floating Sparkle Badge */}
        <div className="absolute -top-3 -right-3 z-30 bg-teal-500 text-white p-2 rounded-xl shadow-lg animate-bounce border-2 border-white">
            <Sparkles size={14} fill="currentColor" />
        </div>
      </div>

      {/* Typography & Status */}
      <div className="text-center relative z-10 space-y-4">
          <h1 className="text-4xl font-black tracking-tighter text-zinc-900 animate-in slide-in-from-bottom-4 fade-in duration-700 drop-shadow-sm">
              Skin<span className="text-teal-500">OS</span>
          </h1>
          
          <div className="flex flex-col items-center gap-3">
              {/* Custom Loading Bar */}
              <div className="h-1 w-36 bg-zinc-100 rounded-full overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-500 to-transparent w-1/2 animate-[shimmer_1.5s_infinite] -translate-x-full" />
              </div>
              
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] animate-pulse">
                  {message || "Initializing System..."}
              </p>
          </div>
      </div>
      
      {/* Footer Branding */}
      <div className="absolute bottom-8 text-[9px] font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse"></div>
          Powered by Gemini 3 Flash
      </div>
    </div>
  );
};

export default SplashScreen;
