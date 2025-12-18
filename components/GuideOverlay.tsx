
import React from 'react';
import { ScanBarcode, LayoutGrid, ArrowDown, User, Sparkles } from 'lucide-react';

interface GuideOverlayProps {
  step: 'ANALYSIS' | 'SCAN' | 'SHELF' | null;
  onDismiss: () => void;
  onNext: () => void;
}

const GuideOverlay: React.FC<GuideOverlayProps> = ({ step, onDismiss, onNext }) => {
  if (!step) return null;

  const isAnalysis = step === 'ANALYSIS';
  const isScan = step === 'SCAN';
  // If not analysis or scan, it is SHELF

  // Positioning logic (relative to the floating nav buttons)
  const translateX = isAnalysis ? '-88px' : isScan ? '0px' : '88px';

  const getContent = () => {
      if (isAnalysis) return {
          icon: <User size={16} />,
          title: "Skin Analysis",
          desc: "View your full clinical breakdown."
      };
      if (isScan) return {
          icon: <ScanBarcode size={16} />,
          title: "Scan Product",
          desc: "Check if products match your skin."
      };
      return {
          icon: <LayoutGrid size={16} />,
          title: "Smart Shelf",
          desc: "Manage your routine & conflicts."
      };
  }

  const content = getContent();

  return (
    <div 
        className="fixed inset-0 z-50 flex flex-col justify-end pb-32 pointer-events-none" 
    >
      {/* Backdrop - Clickable to dismiss */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-700 animate-in fade-in pointer-events-auto" 
        onClick={onDismiss}
      />

      <div 
        className="relative w-full flex justify-center transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ transform: `translateX(${translateX})` }}
      >
        <div 
            className="flex flex-col items-center max-w-[180px] text-center pointer-events-auto cursor-pointer active:scale-95 transition-transform"
            onClick={(e) => {
                e.stopPropagation();
                onNext();
            }}
        >
            
            {/* The "Bubble" */}
            <div className="bg-white rounded-[2rem] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-teal-100 mb-4 relative animate-in zoom-in-50 slide-in-from-bottom-8 duration-500 ease-out group">
                <div className="flex items-center justify-center w-10 h-10 bg-teal-50 rounded-full mx-auto mb-3 text-teal-600 shadow-inner border border-teal-100 group-hover:scale-110 transition-transform">
                    {content.icon}
                </div>
                
                <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Sparkles size={10} className="text-teal-500 fill-teal-500" />
                    <h4 className="text-[13px] font-black text-zinc-900 tracking-tight leading-none uppercase">
                        {content.title}
                    </h4>
                </div>
                
                <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                    {content.desc}
                </p>
                
                <div className="mt-3 py-1.5 px-3 bg-zinc-900 rounded-full inline-block">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white">Got it</span>
                </div>

                {/* Triangle Pointer (The "Tail") */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-b border-r border-teal-100"></div>
            </div>

            {/* Pulsing Arrow */}
            <div className="animate-bounce">
                <ArrowDown className="text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" size={24} strokeWidth={3} />
            </div>
            
        </div>
      </div>
    </div>
  );
};

export default GuideOverlay;
