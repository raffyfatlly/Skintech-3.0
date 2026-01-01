
import React, { useState } from 'react';
import { SkinType } from '../types';
import { Sparkles, Calendar, ArrowRight, LogIn, ArrowLeft, ScanFace, Baby, Feather, Pill, ShieldAlert, Check } from 'lucide-react';

interface SafetyFlags {
    isPregnant: boolean;
    hasSensitiveSkin: boolean;
    hasEczema: boolean;
    onMedication: boolean;
}

interface OnboardingProps {
  onComplete: (data: { name: string; age: number; skinType: SkinType; safety: SafetyFlags }) => void;
  onSignIn: () => void;
  initialName?: string;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onSignIn, initialName = '' }) => {
  const [step, setStep] = useState(initialName ? 1 : 0);
  const [name, setName] = useState(initialName);
  const [age, setAge] = useState('');
  
  // Step 2: Safety State
  const [safety, setSafety] = useState<SafetyFlags>({
      isPregnant: false,
      hasSensitiveSkin: false,
      hasEczema: false,
      onMedication: false
  });

  const handleNext = () => {
    if (step === 0 && name) setStep(1);
    else if (step === 1 && age) setStep(2);
    else if (step === 2) {
        onComplete({ 
            name, 
            age: parseInt(age), 
            skinType: SkinType.UNKNOWN,
            safety
        });
    }
  };

  const handleBack = () => {
      if (step > 0) setStep(step - 1);
  };

  const toggleSafety = (key: keyof SafetyFlags) => {
      setSafety(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const SafetyOption = ({ field, icon: Icon, title, desc }: { field: keyof SafetyFlags, icon: any, title: string, desc: string }) => {
      const isSelected = safety[field];
      return (
          <button 
              onClick={() => toggleSafety(field)}
              className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 group active:scale-[0.98] ${isSelected ? 'bg-teal-50 border-teal-500 shadow-sm' : 'bg-white border-zinc-100 hover:bg-zinc-50'}`}
          >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-teal-500 text-white' : 'bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200'}`}>
                  <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-bold mb-0.5 ${isSelected ? 'text-teal-900' : 'text-zinc-900'}`}>{title}</h4>
                  <p className={`text-xs font-medium leading-tight ${isSelected ? 'text-teal-700' : 'text-zinc-500'}`}>{desc}</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-teal-500 border-teal-500' : 'border-zinc-200 bg-white'}`}>
                  {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
              </div>
          </button>
      )
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
                {[0, 1, 2].map(i => (
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
                Step {step + 1}/3
             </div>
          )}
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full min-h-[200px]">
            {/* STEP 0: NAME */}
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

            {/* STEP 1: AGE */}
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

            {/* STEP 2: SAFETY CHECK */}
            {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                    <div>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-rose-50 rounded-full mb-6 border border-rose-100">
                            <Pill size={12} className="text-rose-500" />
                            <span className="text-[10px] font-bold tracking-widest uppercase text-rose-500">Safety First</span>
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-black text-zinc-900 tracking-tighter mb-3 leading-tight">Just a few <br/><span className="text-zinc-300">details.</span></h1>
                        <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                            Select any that apply so we can filter out unsafe ingredients.
                        </p>
                    </div>
                    
                    <div className="space-y-3 pt-2">
                        <SafetyOption 
                            field="isPregnant" 
                            icon={Baby} 
                            title="Pregnancy / Breastfeeding" 
                            desc="We'll filter for pregnancy-safe ingredients." 
                        />
                        <SafetyOption 
                            field="hasSensitiveSkin" 
                            icon={Feather} 
                            title="Sensitive Skin" 
                            desc="We'll prioritize gentle formulas." 
                        />
                        <SafetyOption 
                            field="hasEczema" 
                            icon={ShieldAlert} 
                            title="Eczema / Rosacea" 
                            desc="We'll avoid harsh acids and triggers." 
                        />
                        <SafetyOption 
                            field="onMedication" 
                            icon={Pill} 
                            title="Prescription Medication" 
                            desc="Accutane, Tretinoin, etc." 
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
            <span>{step === 2 ? 'Start Scan' : 'Next Step'}</span>
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors border border-white/10">
                {step === 2 ? <ScanFace size={22} /> : <ArrowRight size={22} />}
            </div>
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
