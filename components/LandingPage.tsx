
import React, { useEffect, useState } from 'react';
import { ScanFace, ScanBarcode, TrendingUp, Sparkles, ArrowRight, ShieldCheck, Play, Lock, ChevronRight, Zap } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 font-sans text-slate-800 pb-0 selection:bg-teal-500 selection:text-white overflow-x-hidden">
      
      {/* 1. HERO SECTION (Full Viewport "One Shot") */}
      <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col justify-end">
          
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
               <img 
                 src="https://i.postimg.cc/MGgqrPmP/Whats-App-Image-2025-12-13-at-02-02-02-(1).jpg" 
                 alt="SkinOS Background" 
                 className="w-full h-full object-cover animate-in fade-in duration-1000"
               />
               {/* No filters - showing original image brightness */}
          </div>

          {/* Nav (Absolute Top) */}
          <div className="absolute top-0 left-0 right-0 p-6 pt-8 flex justify-between items-center z-50 animate-in slide-in-from-top-4 duration-1000">
            <div className="flex items-center gap-2">
                <span className="font-bold text-2xl tracking-tight text-white drop-shadow-lg shadow-black/50">SkinOS</span>
            </div>
            <button 
                onClick={onLogin} 
                className="text-xs font-bold bg-white/10 backdrop-blur-md text-white px-6 py-2.5 rounded-full hover:bg-white/20 transition-all active:scale-95 border border-white/20 shadow-lg"
            >
                Log In
            </button>
          </div>

          {/* Hero Content (Bottom Anchored) */}
          <div className="relative z-20 px-6 pb-28 sm:pb-32 w-full max-w-xl mx-auto space-y-6">
               <div className={`transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/80 backdrop-blur-md border border-teal-400/50 text-white text-[10px] font-bold uppercase tracking-widest mb-4 shadow-lg">
                        <Sparkles size={10} className="text-white" /> AI Dermatologist
                    </div>
                    {/* Updated Headline: Removed background from 'Made simple', kept thickness */}
                    <h1 className="text-5xl sm:text-6xl font-black tracking-tighter leading-[0.9] text-white mb-6 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                        Skincare.<br/>
                        <span className="text-3xl sm:text-4xl font-semibold text-white tracking-wide block mt-2 opacity-95">Made simple.</span>
                    </h1>
                    
                    <p className="text-lg font-medium text-white leading-relaxed max-w-xs tracking-tight mb-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        The first AI dermatologist that lives in your pocket. Scan faces. Scan products. See results.
                    </p>

                    <div className="flex flex-col sm:flex-row items-start gap-4">
                        <button 
                            onClick={onGetStarted} 
                            className="w-full sm:w-auto bg-white text-zinc-900 px-8 py-4 rounded-full hover:bg-zinc-100 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-2xl min-w-[180px] font-bold text-sm tracking-wide"
                        >
                            Start Free Scan <ArrowRight size={16} />
                        </button>
                    </div>
               </div>
          </div>
          
          {/* Scroll Hint */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 text-white/50 animate-bounce drop-shadow-md">
              <div className="w-1 h-12 rounded-full bg-gradient-to-b from-white to-transparent"></div>
          </div>
      </div>

      {/* 2. SCROLLABLE FEATURES (Bento Grid Layout) - Sleek White Theme with Teal Accents */}
      <div className="relative z-30 bg-white rounded-t-[3rem] -mt-10 px-6 pt-20 pb-20 shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.1)]">
           <div className="max-w-xl mx-auto space-y-6">
               
               <div className="text-center mb-12">
                   <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
                      <Play size={10} fill="currentColor" /> Powered by Computer Vision
                   </h3>
                   <h2 className="text-3xl font-black text-zinc-900 tracking-tight">Your Pocket Clinic</h2>
               </div>

                {/* FEATURE 1: PRODUCT SCANNER (Hero Card) */}
                <div className="bg-white rounded-[2rem] p-8 border border-zinc-100 shadow-xl shadow-zinc-200/20 relative overflow-hidden group hover:border-teal-100 transition-colors">
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-6">
                            {/* Changed to Teal Badge */}
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full">
                                <ScanBarcode size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">In-Store Companion</span>
                            </div>
                        </div>
                        
                        {/* Softer Black Text */}
                        <h3 className="text-4xl font-black text-zinc-900 tracking-tighter leading-[0.9] mb-4">
                            Don't guess.<br/>Just scan.
                        </h3>
                        <p className="text-sm text-zinc-500 font-medium leading-relaxed max-w-xs">
                            Instantly analyze ingredients at Watsons or Sephora to see if they match your skin profile.
                        </p>

                        <div className="mt-8 flex gap-3">
                             <div className="px-3 py-1.5 rounded-lg border border-teal-100 bg-teal-50/50 text-teal-700 text-[10px] font-bold">Safe Match</div>
                             <div className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-500 text-[10px] font-bold">Acne Risk</div>
                        </div>
                    </div>
                </div>

                {/* GRID ROW */}
                <div className="grid grid-cols-2 gap-4">
                    {/* FEATURE 2: BIOMETRICS - White Theme with Teal Accent */}
                    <div className="bg-white rounded-[2rem] p-6 text-zinc-900 border border-zinc-100 relative overflow-hidden flex flex-col justify-between min-h-[200px] shadow-lg shadow-zinc-200/20 hover:border-teal-100 transition-colors">
                        <div className="relative z-10">
                            <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center mb-4 border border-teal-100">
                                <ScanFace size={20} className="text-teal-600" />
                            </div>
                            <h3 className="text-lg font-bold leading-tight mb-2 text-zinc-900">Clinical Analysis</h3>
                            <p className="text-xs text-zinc-500 font-medium">15+ biomarkers scanned instantly.</p>
                        </div>
                    </div>

                    {/* FEATURE 3: RESULTS - White Theme with Teal Accent */}
                    <div className="bg-white rounded-[2rem] p-6 border border-zinc-100 relative overflow-hidden flex flex-col justify-between min-h-[200px] shadow-lg shadow-zinc-200/20 hover:border-teal-100 transition-colors">
                        <div className="relative z-10">
                            <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center mb-4 border border-teal-100">
                                <TrendingUp size={20} className="text-teal-600" />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900 leading-tight mb-2">Real Results</h3>
                            <p className="text-xs text-zinc-500 font-medium">Track your skin's improvement over time.</p>
                        </div>
                    </div>
                </div>

                {/* FEATURE 4: AI LOGIC - White Theme with Teal Accent */}
                <div className="bg-white rounded-[2rem] p-8 text-zinc-900 border border-zinc-100 shadow-xl shadow-zinc-200/20 relative overflow-hidden hover:border-teal-100 transition-colors">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4 text-teal-600">
                            <Sparkles size={16} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Smart Filtering</span>
                        </div>
                        <h3 className="text-2xl font-black tracking-tight leading-tight mb-4 text-zinc-900">
                            "This moisturizer isn't for you."
                        </h3>
                        <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                            Our AI filters out products that conflict with your routine or sensitivity level.
                        </p>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="text-center pt-8 pb-4">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-center gap-2">
                        <Lock size={12} /> Privacy First. Data Encrypted.
                    </p>
                </div>
           </div>
      </div>
    </div>
  );
};

export default LandingPage;
