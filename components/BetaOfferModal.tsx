
import React, { useState } from 'react';
import { X, Sparkles, Check, Crown, ArrowRight, ShieldCheck, Zap, KeyRound, Loader, Search, MessageCircle } from 'lucide-react';
import { claimAccessCode } from '../services/storageService';

interface BetaOfferModalProps {
  onClose: () => void;
  onConfirm: () => void;
  onCodeSuccess: () => void;
}

const BetaOfferModal: React.FC<BetaOfferModalProps> = ({ onClose, onConfirm, onCodeSuccess }) => {
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  // Auto-format input to XXXX-XXXX for better UX
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      // Auto-insert dash
      if (val.length > 4) {
          val = val.slice(0, 4) + '-' + val.slice(4, 8);
      }
      
      setCode(val);
      setCodeError('');
  };

  const handleRedeem = async () => {
      if (code.length < 5) {
          setCodeError("Code is too short.");
          return;
      }

      setIsChecking(true);
      setCodeError('');

      try {
          // Delegate all validation to the service
          const result = await claimAccessCode(code);
          
          if (result.success) {
              onCodeSuccess();
          } else {
              setCodeError(result.error || "Verification failed.");
          }
      } catch (err) {
          setCodeError("Connection error. Please try again.");
      } finally {
          setIsChecking(false);
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-zinc-900/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-white rounded-[2rem] relative shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[95vh] overflow-y-auto no-scrollbar">
        
        {/* Decorative Header Background */}
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
                        { icon: ShieldCheck, text: "Unlimited Buying Assistant" },
                        { icon: Zap, text: "Unlimited Routine Architect" },
                        { icon: MessageCircle, text: "Personal AI Assistant" },
                        { icon: Search, text: "Price Scout (Coming Soon)" },
                    ].map((feat, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                            <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                <Check size={10} strokeWidth={3} />
                            </div>
                            <span className="text-xs font-bold text-zinc-600">{feat.text}</span>
                        </div>
                    ))}
                </div>

                {/* Primary Button */}
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
                                    onChange={handleCodeChange}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
                                    placeholder="XXXX-XXXX"
                                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-bold text-center uppercase tracking-widest focus:outline-none focus:border-teal-500 focus:bg-white transition-all disabled:opacity-50"
                                    autoFocus
                                    maxLength={9}
                                    disabled={isChecking}
                                />
                                <button 
                                    onClick={handleRedeem}
                                    disabled={code.length < 9 || isChecking}
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
