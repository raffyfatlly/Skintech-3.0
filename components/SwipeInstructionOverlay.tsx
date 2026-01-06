
import React, { useState } from 'react';
import { Hand, ArrowRight, ArrowLeft, ArrowDown, ScanBarcode, ChevronRight, Check } from 'lucide-react';

interface SwipeInstructionOverlayProps {
  onDismiss: () => void;
}

const SwipeInstructionOverlay: React.FC<SwipeInstructionOverlayProps> = ({ onDismiss }) => {
  const [step, setStep] = useState(0);

  const handleNext = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (step < 2) {
          setStep(prev => prev + 1);
      } else {
          onDismiss();
      }
  };

  const renderVisual = () => {
      switch(step) {
          case 0: // SWIPE
              return (
                <div className="relative w-32 h-32 flex items-center justify-center">
                    <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/10 rounded-full"></div>
                    <ArrowLeft size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-white/30" />
                    <ArrowRight size={16} className="absolute right-0 top-1/2 -translate-y-1/2 text-white/30" />
                    
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[swipe_2s_ease-in-out_infinite]">
                        <div className="w-14 h-14 bg-teal-500/20 rounded-full flex items-center justify-center border border-teal-500/50 shadow-[0_0_30px_rgba(20,184,166,0.3)]">
                            <Hand size={28} className="text-teal-400 fill-teal-400/20" />
                        </div>
                    </div>
                </div>
              );
          case 1: // SCROLL DOWN
              return (
                <div className="relative w-32 h-32 flex items-center justify-center">
                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 bg-white/10 rounded-full"></div>
                    
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[scrollHint_2s_ease-in-out_infinite]">
                        <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                            <Hand size={28} className="text-white fill-white/20" />
                        </div>
                    </div>
                    
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/50 animate-bounce">
                        <ArrowDown size={16} />
                    </div>
                </div>
              );
          case 2: // SCAN
              return (
                <div className="relative w-32 h-32 flex items-center justify-center">
                    <div className="absolute inset-0 bg-teal-500/10 rounded-full animate-ping"></div>
                    <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center border-2 border-white/20 shadow-2xl relative z-10">
                        <ScanBarcode size={24} className="text-teal-400" />
                    </div>
                    {/* Ring */}
                    <div className="absolute inset-4 border-2 border-teal-500/30 rounded-full animate-[spin_4s_linear_infinite]"></div>
                </div>
              );
          default: return null;
      }
  };

  const getContent = () => {
      switch(step) {
          case 0: return { title: "Swipe to Navigate", desc: "Switch between Dashboard, Routine, and Profile." };
          case 1: return { title: "Scroll to Reveal", desc: "Pull down to view your full clinical report." };
          case 2: return { title: "Smart Scan", desc: "Tap the center button to analyze product ingredients." };
          default: return { title: "", desc: "" };
      }
  };

  const content = getContent();

  return (
    <div 
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500 cursor-pointer"
        onClick={handleNext}
    >
        <div className="max-w-[320px] w-full flex flex-col items-center pointer-events-none">
            
            {/* Animated Visual Container */}
            <div key={step} className="mb-8 animate-in zoom-in-50 fade-in duration-500 ease-out">
                {renderVisual()}
            </div>

            {/* Text Content */}
            <div key={`text-${step}`} className="animate-in slide-in-from-bottom-4 fade-in duration-500">
                <h2 className="text-2xl font-black text-white mb-3 tracking-tight">{content.title}</h2>
                <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-10 px-2 h-10">
                    {content.desc}
                </p>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center w-full gap-8 pointer-events-auto">
                {/* Pagination Dots */}
                <div className="flex gap-2">
                    {[0, 1, 2].map(i => (
                        <div 
                            key={i} 
                            className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-teal-500' : 'w-1.5 bg-zinc-800'}`} 
                        />
                    ))}
                </div>

                <button 
                    className="bg-white text-zinc-900 px-10 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] flex items-center gap-2 group"
                    onClick={handleNext}
                >
                    {step === 2 ? (
                        <>Get Started <Check size={14} strokeWidth={3} /></>
                    ) : (
                        <>Next <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" /></>
                    )}
                </button>
                
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                    Tap anywhere to continue
                </p>
            </div>
        </div>

        {/* CSS Animation Keyframes */}
        <style>{`
            @keyframes swipe {
                0%, 100% { transform: translate(-50%, -50%) translateX(0); }
                25% { transform: translate(-50%, -50%) translateX(-30px) rotate(-10deg); }
                75% { transform: translate(-50%, -50%) translateX(30px) rotate(10deg); }
            }
            @keyframes scrollHint {
                0%, 100% { transform: translate(-50%, -50%) translateY(-10px); }
                50% { transform: translate(-50%, -50%) translateY(10px); }
            }
        `}</style>
    </div>
  );
};

export default SwipeInstructionOverlay;
