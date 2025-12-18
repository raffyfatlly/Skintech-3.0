
import React, { useState } from 'react';
import { X, Sparkles, Check, Crown, ArrowRight, ShieldCheck, Zap, Ticket, KeyRound, Loader } from 'lucide-react';
import { claimAccessCode } from '../services/storageService';

interface BetaOfferModalProps {
  onClose: () => void;
  onConfirm: () => void;
  onCodeSuccess: () => void;
}

// Provided List of 100 Unique Access Codes
const VALID_CODES = new Set([
  "A7K2-M9XP", "L4W8-Q2ZR", "B9X3-Y6VM", "H2J5-T8NK", "R7C4-D1QS", "P3M9-F6GL", "X8W2-Z5VB", "K1N7-H4TJ", "Q6D9-S3RF", "V2B8-L5YM",
  "C4G7-P9XN", "M8J3-K2WQ", "T5R6-D1ZL", "F9H2-B4CS", "W3Q8-V7NP", "Z6L5-X9MK", "G2T4-J8RY", "S7P3-N1WD", "D5M9-H6BF", "Y8K2-C4VG",
  "R3X7-Q9ZL", "L6N2-W5TJ", "B8D4-P1SM", "H9G5-F3VK", "M2Q7-R8YC", "X5J9-Z4TN", "C1W6-L8KP", "K7B3-D2RF", "V4S9-H5XQ", "T8M2-N6GP",
  "F3Y7-J9WL", "P6R5-C2VB", "Z9K4-G1TS", "Q2L8-D5XM", "W7N3-B6RJ", "G4H9-S2FK", "D8T5-P1VQ", "Y3C6-X9ZL", "J5M2-R7WN", "N9S8-K4YF",
  "R2B6-L3TJ", "H7Q4-D9VP", "X3G5-F8MC", "L9W2-Z1NK", "C6J8-T5RS", "M4P7-Y2XB", "K8D3-Q6VG", "V5N9-H1ZL", "S2R4-B8WJ", "F7T6-C3KM",
  "Q9X5-G2NP", "W4L8-D7YV", "Z1J3-M6RF", "P8H2-K5TS", "B6S7-N9WQ", "G3C5-R1XL", "D9M4-V2FB", "Y7K8-T3ZP", "R5W6-J9LG", "L2Q9-X4HN",
  "H8G3-S7VK", "C5B2-D6MY", "M9T7-F1RJ", "X4P5-N8WS", "K6R2-L9ZC", "V3J8-G5TP", "F1S4-Q7XM", "T9N6-B2KV", "W5H3-C8YD", "Z2M7-K4RL",
  "P7D9-R6WG", "Q4L2-J5XN", "G8W5-V1TS", "Y6B3-S9FM", "D2K7-H4ZP", "J9R8-C5VQ", "N5T2-L3YB", "R8X6-M1GK", "H4Q9-D7WJ", "L7G5-P2ZN",
  "C3J2-F6VR", "X9S4-K8TY", "M6N8-B1DL", "V2H5-R9WQ", "F8M3-T4XG", "W1P7-L6ZJ", "Z5K9-C2VS", "Q3R4-D8NM", "G7B6-H1YK", "T2J5-S9WF",
  "D6W8-N3XQ", "Y9L2-V5RP", "P4C7-M1ZG", "K3G5-F8TJ", "R1T9-Q6VB", "H5N4-X2LS", "L8S3-J7WK", "B2M6-D9RY", "X7Q2-C5ZN"
]);

const BetaOfferModal: React.FC<BetaOfferModalProps> = ({ onClose, onConfirm, onCodeSuccess }) => {
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const handleRedeem = async () => {
      const normalizedCode = code.trim().toUpperCase();
      
      // 1. Static Validation Check
      if (!VALID_CODES.has(normalizedCode) && normalizedCode !== 'SKINOSVIP' && normalizedCode !== 'DEMO2025') {
          setCodeError('Invalid code format.');
          return;
      }

      setIsChecking(true);
      setCodeError('');

      // 2. Backend Claim Check (Enforces Single User Use)
      const result = await claimAccessCode(normalizedCode);
      
      setIsChecking(false);

      if (result.success) {
          onCodeSuccess();
      } else {
          setCodeError(result.error || "Verification failed.");
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-zinc-900/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-white rounded-[2rem] relative shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[95vh] overflow-y-auto no-scrollbar">
        
        {/* Decorative Header Background - UPDATED COLOR & HEIGHT */}
        <div 
            className="absolute top-0 left-0 right-0 h-28 pointer-events-none transition-colors" 
            style={{ backgroundColor: 'rgb(163, 206, 207)' }}
        />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none mix-blend-overlay" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>

        {/* Close Button */}
        <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-black/10 hover:bg-black/20 text-white rounded-full transition-colors z-20 backdrop-blur-md"
        >
            <X size={18} />
        </button>

        <div className="relative z-10 pt-8 px-6 pb-6">
            {/* Badge */}
            <div className="flex justify-center mb-4">
                <div className="bg-white/20 backdrop-blur-md border border-white/40 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                    <Crown size={12} className="text-amber-300 fill-amber-300" />
                    <span className="text-[9px] font-bold text-white uppercase tracking-widest">Early Access</span>
                </div>
            </div>

            {/* Headline */}
            <div className="text-center mb-6">
                <h2 className="text-2xl font-black text-white tracking-tight mb-1.5 drop-shadow-md">Unlock Full Access</h2>
                <p className="text-white/90 text-xs font-bold leading-relaxed drop-shadow-sm max-w-[240px] mx-auto">
                    Join the first <strong className="text-white">100 beta users</strong> to lock in lifetime access at our lowest price ever.
                </p>
            </div>

            {/* Pricing Card */}
            <div className="bg-white rounded-[1.5rem] p-5 shadow-xl relative -mb-16">
                <div className="flex justify-between items-end mb-4 border-b border-zinc-100 pb-4">
                    <div>
                        <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wide line-through decoration-rose-500/50">Regular RM 39.90</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-zinc-900">RM</span>
                            <span className="text-4xl font-black text-zinc-900 tracking-tighter">9.90</span>
                        </div>
                        <span className="text-[9px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded uppercase tracking-wide">One-time payment</span>
                    </div>
                    <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center text-teal-600 mb-1">
                        <Sparkles size={20} className="animate-pulse" />
                    </div>
                </div>

                <div className="space-y-3 mb-6">
                    {[
                        { icon: Zap, text: "Advanced Ingredient Analysis" },
                        { icon: ShieldCheck, text: "Routine Architect (3-Tier Plan)" },
                        { icon: Crown, text: "Unlimited AI Rescans" },
                    ].map((feat, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check size={10} strokeWidth={3} />
                            </div>
                            <span className="text-xs font-bold text-zinc-600">{feat.text}</span>
                        </div>
                    ))}
                </div>

                {/* Primary Button - UPDATED TO TEAL */}
                <button 
                    onClick={onConfirm}
                    disabled={isChecking}
                    className="w-full py-3.5 bg-teal-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-teal-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 hover:scale-[1.02] active:scale-[0.98] group"
                >
                    Claim Beta Offer <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
                
                <p className="text-center mt-3 text-[9px] text-zinc-400 font-medium flex items-center justify-center gap-1">
                    <ShieldCheck size={10} /> Secure payment via Stripe
                </p>

                {/* UNIQUE CODE REDEMPTION */}
                <div className="mt-5 pt-5 border-t border-zinc-100">
                    {!showCodeInput ? (
                        <button 
                            onClick={() => setShowCodeInput(true)}
                            className="w-full text-center text-[10px] font-bold text-zinc-500 hover:text-teal-600 transition-colors flex items-center justify-center gap-1.5"
                        >
                            <KeyRound size={12} /> Have a unique access code?
                        </button>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2">
                            <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 text-center">Enter Access Code</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={code}
                                    onChange={(e) => {
                                        setCode(e.target.value);
                                        setCodeError('');
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
                                    placeholder="CODE"
                                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-bold text-center uppercase tracking-widest focus:outline-none focus:border-teal-500 focus:bg-white transition-all disabled:opacity-50"
                                    autoFocus
                                    disabled={isChecking}
                                />
                                <button 
                                    onClick={handleRedeem}
                                    disabled={!code || isChecking}
                                    className="bg-zinc-900 text-white px-3 rounded-lg font-bold text-[10px] uppercase tracking-wide hover:bg-zinc-800 disabled:opacity-50 transition-colors min-w-[60px] flex items-center justify-center"
                                >
                                    {isChecking ? <Loader size={12} className="animate-spin" /> : "Apply"}
                                </button>
                            </div>
                            {codeError && (
                                <p className="text-center text-[9px] font-bold text-rose-500 mt-1.5 animate-in slide-in-from-top-1">{codeError}</p>
                            )}
                            <button 
                                onClick={() => {
                                    setShowCodeInput(false);
                                    setCodeError('');
                                    setCode('');
                                }} 
                                disabled={isChecking}
                                className="w-full text-center text-[9px] font-bold text-zinc-400 mt-2 hover:text-zinc-600"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        {/* Spacer for the negative margin overlap */}
        <div className="h-12 bg-white"></div>
      </div>
    </div>
  );
};

export default BetaOfferModal;
