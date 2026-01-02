
import React from 'react';
import { ScanFace } from 'lucide-react';

const SplashScreen = ({ message }: { message?: string }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 select-none cursor-wait overflow-hidden font-sans">
      
      <div className="flex flex-col items-center gap-10 animate-in fade-in duration-700 ease-out">
        
        {/* Premium Brand Icon (Mint Teal) */}
        <div className="relative group">
           {/* Soft Glow */}
           <div className="absolute inset-0 bg-teal-400/30 blur-3xl rounded-full opacity-60 animate-pulse"></div>
           
           {/* Icon Container (Squircle) */}
           <div className="w-28 h-28 bg-gradient-to-br from-teal-400 to-teal-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-teal-500/20 relative z-10 ring-1 ring-white/20">
               <ScanFace size={56} className="text-white drop-shadow-sm" strokeWidth={1.5} />
           </div>
        </div>

        {/* Typography */}
        <div className="text-center space-y-4">
            <h1 className="text-4xl font-black tracking-tighter text-zinc-900">
                SkinOS
            </h1>
            
            <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-1 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 w-1/2 animate-[loading_1s_ease-in-out_infinite] rounded-full shadow-[0_0_10px_#14b8a6]" />
                </div>
                <p className="text-[10px] font-bold text-teal-600 uppercase tracking-[0.2em] animate-pulse">
                    {message || "Initializing"}
                </p>
            </div>
        </div>

      </div>
      
      {/* Footer Branding */}
      <div className="absolute bottom-12 flex items-center gap-2 opacity-40">
          <div className="w-1.5 h-1.5 bg-teal-500 rounded-full"></div>
          <span className="text-[9px] font-bold text-zinc-400 tracking-[0.2em] uppercase">AI Dermatologist</span>
      </div>
    </div>
  );
};

export default SplashScreen;
