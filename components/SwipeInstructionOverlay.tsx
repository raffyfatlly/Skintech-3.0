
import React from 'react';
import { Hand, ArrowRight, ArrowLeft } from 'lucide-react';

interface SwipeInstructionOverlayProps {
  onDismiss: () => void;
}

const SwipeInstructionOverlay: React.FC<SwipeInstructionOverlayProps> = ({ onDismiss }) => {
  return (
    <div 
        className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500 cursor-pointer"
        onClick={onDismiss}
    >
        <div className="max-w-xs w-full flex flex-col items-center pointer-events-none">
            
            {/* Animated Hand Gesture */}
            <div className="relative mb-10 w-32 h-32 flex items-center justify-center">
                {/* Track */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/10 rounded-full"></div>
                
                {/* Moving Hand */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[swipe_2s_ease-in-out_infinite]">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                        <Hand size={32} className="text-white fill-white/20" />
                    </div>
                </div>

                {/* Arrows */}
                <ArrowLeft size={20} className="absolute left-0 top-1/2 -translate-y-1/2 text-white/30" />
                <ArrowRight size={20} className="absolute right-0 top-1/2 -translate-y-1/2 text-white/30" />
            </div>

            <h2 className="text-2xl font-black text-white mb-3 tracking-tight">Swipe to Navigate</h2>
            <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-10">
                Easily switch between your <span className="text-teal-400">Dashboard</span>, <span className="text-teal-400">Routine</span>, and <span className="text-teal-400">Profile</span> by swiping left or right.
            </p>

            <button 
                className="bg-white text-zinc-900 px-8 py-3.5 rounded-full font-bold text-xs uppercase tracking-widest hover:scale-105 transition-transform pointer-events-auto"
                onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                }}
            >
                Got it
            </button>
        </div>

        {/* CSS Animation for Swipe */}
        <style>{`
            @keyframes swipe {
                0%, 100% { transform: translate(-50%, -50%) translateX(0); }
                25% { transform: translate(-50%, -50%) translateX(-40px) rotate(-10deg); }
                75% { transform: translate(-50%, -50%) translateX(40px) rotate(10deg); }
            }
        `}</style>
    </div>
  );
};

export default SwipeInstructionOverlay;
