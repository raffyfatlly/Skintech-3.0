
import React, { useState } from 'react';
import { SkinType } from '../types';
import { Sparkles, Calendar, ArrowRight, LogIn, ArrowLeft, ScanFace } from 'lucide-react';

interface OnboardingProps {
  onComplete: (data: { name: string; age: number; skinType: SkinType }) => void;
  onSignIn: () => void;
  initialName?: string;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onSignIn, initialName = '' }) => {
  const [step, setStep] = useState(initialName ? 1 : 0);
  const [name, setName] = useState(initialName);
  const [age, setAge] = useState('');

  const handleNext = () => {
    if (step === 0 && name) setStep(1);
    else if (step === 1 && age) {
        onComplete({ name, age: parseInt(age), skinType: SkinType.UNKNOWN });
    }
  };

  const handleBack = () => {
      if (step > 0) setStep(step - 1);
  };

  return (
    <div className="min-h-[100dvh] w-full relative bg-white flex flex-col font-sans p-6 sm:p-8 overflow-y-auto supports-[min-height:100dvh]:min-h-[100dvh]">
      
      <div className="w-full flex justify-between items-center mb-8 pt-2 shrink-0">
          <div className="flex items-center gap-4">
            {step > 0 && (
                <button 
                    onClick={handleBack}
                    className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 hover:bg-zinc-200 transition-colors shadow-sm active:scale-95"
                    title="Back"
                >
                    <ArrowLeft size={18} />
                </button>
            )}
            <div className="flex gap-2">
                {[0, 1].map(i => (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? 'w-8 bg-teal-500' : 'w-2 bg-zinc-100'}`} />
                ))}
            </div>
          </div>
          
          {step === 0 ? (
             <button 
                onClick={onSignIn}
                className="text-zinc-500 text-[11px] font-bold tracking-widest uppercase hover:text-teal-600 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-50 hover:bg-teal-50 active:scale-95"
             >
                <LogIn size={14} /> Log In
             </button>
          ) : (
             <div className="text-zinc-300 text-[10px] font-bold tracking-widest uppercase">
                Step {step + 1}/2
             </div>
          )}
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full min-h-[200px]">
            {step === 0 && (
                <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
                    <div>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-teal-50 rounded-full mb-6 sm:mb-8 border border-teal-100">
                            <Sparkles size={12} className="text-teal-600" />
                            <span className="text-[10px] font-bold tracking-widest uppercase text-teal-600">AI Dermatologist</span>
                        </div>
                        <h1 className="text-5xl sm:text-6xl font-black text-zinc-900 tracking-tighter mb-4 leading-tight">Hello, <br/><span className="text-zinc-300">Beautiful.</span></h1>
                        <p className="text-base sm:text-lg text-zinc-500 font-medium leading-relaxed">Let's build your digital skin profile.</p>
                    </div>
                    <div className="space-y-4 pt-4">
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Your Name</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Type here..."
                            className="w-full bg-transparent border-b-2 border-zinc-100 px-0 py-3 sm:py-4 text-3xl sm:text-4xl font-bold text-zinc-900 placeholder:text-zinc-200 focus:outline-none focus:border-teal-500 transition-all rounded-none"
                            autoFocus
                        />
                    </div>
                </div>
            )}

            {step === 1 && (
                <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
                    <div>
                         <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-teal-50 rounded-full mb-6 sm:mb-8 border border-teal-100">
                            <Calendar size={12} className="text-teal-600" />
                            <span className="text-[10px] font-bold tracking-widest uppercase text-teal-600">Bio-Age</span>
                        </div>
                        <h1 className="text-5xl sm:text-6xl font-black text-zinc-900 tracking-tighter mb-4 leading-tight">Age is just <br/><span className="text-zinc-300">data.</span></h1>
                        <p className="text-base sm:text-lg text-zinc-500 font-medium leading-relaxed">This helps us track collagen needs.</p>
                    </div>
                    <div className="space-y-4 pt-4">
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Your Age</label>
                        <input 
                            type="number" 
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder="e.g. 25"
                            className="w-full bg-transparent border-b-2 border-zinc-100 px-0 py-3 sm:py-4 text-3xl sm:text-4xl font-bold text-zinc-900 placeholder:text-zinc-200 focus:outline-none focus:border-teal-500 transition-all rounded-none"
                            autoFocus
                        />
                    </div>
                </div>
            )}
      </div>

      <div className="mt-auto pt-8 shrink-0">
        <button
            onClick={handleNext}
            disabled={(step === 0 && !name) || (step === 1 && !age)}
            className="w-full h-16 sm:h-20 bg-teal-500 text-white rounded-[2rem] font-bold text-lg flex items-center justify-between px-8 disabled:opacity-50 disabled:scale-100 hover:bg-teal-600 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-teal-500/20 group shrink-0"
        >
            <span>{step === 1 ? 'Start Scan' : 'Next Step'}</span>
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors border border-white/10">
                {step === 1 ? <ScanFace size={22} /> : <ArrowRight size={22} />}
            </div>
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
