
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SkinMetrics, Product, UserProfile } from '../types';
import { getClinicalTreatmentSuggestions } from '../services/geminiService';
import { RefreshCw, Sparkles, Ban, Activity, Lightbulb, TrendingUp, Crown, ChevronDown, Syringe, Zap, ArrowRight, Dna, Info, CheckCircle2, Microscope, X, ScanFace, ScanBarcode, MessageCircle, ShieldCheck } from 'lucide-react';

// --- SUB COMPONENTS ---

const renderFormattedText = (text: string) => {
    if (!text) return null;
    return text.split(/(\*\*.*?\*\*)/).map((part, i) => 
        part.startsWith('**') ? <strong key={i} className="font-bold text-zinc-800">{part.slice(2,-2)}</strong> : part
    );
};

const renderVerdict = (data: any) => {
  if (!data) return null;

  // New Structured Format (Object)
  if (typeof data === 'object' && data.headline && Array.isArray(data.points)) {
      return (
          <div className="flex flex-col gap-5">
              <div className="mb-1">
                  <p className="text-zinc-900 font-black text-lg uppercase tracking-tight leading-snug drop-shadow-sm">
                      {data.headline}
                  </p>
                  
                  {/* New: Holistic Summary Sentence */}
                  {data.generalCondition && (
                      <div className="text-sm text-zinc-600 font-medium leading-relaxed mt-2 normal-case border-l-2 border-teal-100 pl-3">
                          {renderFormattedText(data.generalCondition)}
                      </div>
                  )}
              </div>
              
              <div className="space-y-4 pl-3 relative border-l-2 border-zinc-100">
                  {data.points.map((point: any, i: number) => (
                      <div key={i} className="relative">
                          {/* Dot connector */}
                          <div className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-teal-50 border-2 border-teal-100 flex items-center justify-center">
                              <div className="w-1 h-1 bg-teal-500 rounded-full"></div>
                          </div>
                          
                          <h4 className="text-[10px] font-bold text-teal-700 uppercase tracking-widest mb-1">
                              {point.subtitle}
                          </h4>
                          <div className="text-xs text-zinc-600 font-medium leading-relaxed">
                              {renderFormattedText(point.content)}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  }

  // Legacy String Format
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const parts = text.split(/(\*\*.*?\*\*)/g);
  const headlinePart = parts.find(p => p.startsWith('**') && p.endsWith('**'));
  const bodyText = parts.filter(p => !p.startsWith('**')).join('');

  const bulletPoints = bodyText.split(/\n/).filter(line => line.trim().match(/^[\*\-•]/)).map(line => line.replace(/^[\*\-•]\s*/, '').trim());
  const fallbackText = bodyText.split(/\n/).filter(line => !line.trim().match(/^[\*\-•]/) && line.trim().length > 0).join(' ');

  return (
      <div className="flex flex-col gap-4">
          {headlinePart && (
              <div className="mb-2">
                  <p className="text-zinc-900 font-black text-sm uppercase tracking-wide leading-snug">
                      {headlinePart.slice(2, -2)}
                  </p>
              </div>
          )}
          
          {bulletPoints.length > 0 ? (
              <div className="space-y-3 pl-1">
                  {bulletPoints.map((point, i) => (
                      <div key={i} className="flex gap-3 items-start">
                          <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
                          </div>
                          <p className="text-xs text-zinc-600 font-medium leading-relaxed">{point}</p>
                      </div>
                  ))}
              </div>
          ) : (
              <p className="text-xs text-zinc-500 font-medium leading-relaxed px-1">{fallbackText || text.replace(/\*\*/g, '')}</p>
          )}
      </div>
  )
};

// New Tooltip Component for Hero Section
const HeroTooltip: React.FC<{ 
    children: React.ReactNode; 
    title: string; 
    content: string;
    align?: 'left' | 'right';
}> = ({ children, title, content, align = 'left' }) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className="relative">
            <button 
                onClick={(e) => { e.stopPropagation(); setIsVisible(!isVisible); }}
                className="text-left group outline-none w-full"
            >
                {children}
            </button>
            
            {isVisible && (
                <>
                    <div className="fixed inset-0 z-30 cursor-default" onClick={(e) => { e.stopPropagation(); setIsVisible(false); }} />
                    <div className={`absolute bottom-full mb-3 w-56 bg-zinc-900/95 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-2xl z-40 animate-in fade-in zoom-in-95 ${align === 'right' ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left'}`}>
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                            <Info size={12} className="text-teal-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">{title}</span>
                        </div>
                        <p className="text-[11px] font-medium text-white/90 leading-relaxed">
                            {content}
                        </p>
                        {/* Triangle Pointer */}
                        <div className={`absolute -bottom-1.5 w-3 h-3 bg-zinc-900 rotate-45 border-b border-r border-white/20 ${align === 'right' ? 'right-6' : 'left-6'}`}></div>
                    </div>
                </>
            )}
        </div>
    );
};

interface MetricRingProps {
  label: string;
  value: number;
  metricKey: keyof SkinMetrics;
  onSelect: (key: keyof SkinMetrics) => void;
}

const MetricRing: React.FC<MetricRingProps> = ({ label, value, metricKey, onSelect }) => {
  let colorClass = "text-zinc-300"; 
  if (value < 60) colorClass = "text-rose-500"; 
  else if (value > 89) colorClass = "text-emerald-500"; 
  
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
      const observer = new IntersectionObserver(
          ([entry]) => {
              if (entry.isIntersecting) {
                  setIsVisible(true);
                  observer.disconnect(); 
              }
          },
          { threshold: 0.1 } 
      );

      if (elementRef.current) {
          observer.observe(elementRef.current);
      }

      return () => observer.disconnect();
  }, []);

  useEffect(() => {
      if (!isVisible) return;

      let start = 0;
      const duration = 1500;
      const startTime = performance.now();

      const animate = (time: number) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 4);
          
          setDisplayValue(Math.round(start + (value - start) * ease));

          if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
  }, [value, isVisible]);

  return (
      <button 
        ref={elementRef}
        onClick={() => onSelect(metricKey)}
        className="flex flex-col items-center justify-center p-2 relative transition-transform w-full group hover:scale-110 duration-300 ease-out"
      >
          <div className="relative w-11 h-11 flex items-center justify-center mb-3">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  <circle
                    cx="50" cy="50" r="40"
                    className="text-black transition-colors opacity-10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8" 
                  />
                  <circle
                    cx="50" cy="50" r="40"
                    className={`${colorClass} transition-all duration-1000 ease-out`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${displayValue * 2.51}, 251`}
                    strokeLinecap="round"
                    style={{ 
                        opacity: isVisible ? 1 : 0,
                        transition: 'opacity 0.5s ease-out'
                    }}
                  />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-[10px] font-black tracking-tighter text-black`}>{displayValue}</span>
              </div>
          </div>
          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest truncate w-full text-center group-hover:text-teal-600 transition-colors">{label}</span>
      </button>
  );
};

interface GroupSectionProps {
    title: string;
    score: number;
    delayClass?: string;
    children?: React.ReactNode;
}

const GroupSection: React.FC<GroupSectionProps> = ({ title, score, delayClass = "", children }) => (
  <div className={`modern-card rounded-[2rem] p-6 tech-reveal ${delayClass} hover:shadow-lg transition-shadow duration-500`}>
      <div className="flex justify-between items-center mb-6 px-1 border-b border-zinc-50 pb-4">
          <h3 className="text-xs font-black text-zinc-900 uppercase tracking-widest">{title}</h3>
          <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${score > 89 ? 'bg-emerald-50 text-emerald-600' : score < 60 ? 'bg-rose-50 text-rose-600' : 'text-zinc-400 bg-zinc-50'}`}>
              Avg: {Math.round(score)}
          </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
          {children}
      </div>
  </div>
);

interface MetricModalProps {
    metric: string; 
    score: number;
    age: number;
    observation?: string;
    onClose: () => void;
}

const MetricModal: React.FC<MetricModalProps> = ({ metric, score, age, observation, onClose }) => {
    const getAverage = () => {
        if (metric === 'sagging' || metric === 'wrinkleFine') return age < 30 ? 85 : 65;
        if (metric === 'oiliness') return age < 30 ? 60 : 80;
        return 75;
    };
    
    const avg = getAverage();
    const performance = score >= avg ? 'Above Average' : 'Below Average';

    const getObservation = () => {
        if (observation) return observation;
        
        const ROIMap: Record<string, string> = {
            'acneActive': 'Cheeks and Jawline',
            'acneScars': 'Cheek area',
            'poreSize': 'Nose/T-Zone',
            'blackheads': 'Nose and Chin',
            'wrinkleFine': 'Around eyes and forehead',
            'wrinkleDeep': 'Nasolabial folds and forehead',
            'sagging': 'Lower jawline contour',
            'pigmentation': 'Cheeks and forehead (Sun exposed areas)',
            'redness': 'Cheeks and nose bridge',
            'texture': 'Cheek surface',
            'hydration': 'General facial surface',
            'oiliness': 'Forehead and Nose (T-Zone)',
            'darkCircles': 'Under-eye area',
        };

        const location = ROIMap[metric] || 'Facial area';
        const severity = score < 60 ? 'Significant' : score < 80 ? 'Mild' : 'Minimal';
        
        if (metric === 'poreSize') return `${severity} enlargement detected on ${location} based on shadow analysis.`;
        if (metric === 'acneActive') return `${severity} inflammatory markers detected on ${location}.`;
        if (metric === 'redness') return `${severity} vascular reactivity observed on ${location}.`;
        if (metric === 'wrinkleFine') return `${severity} static lines detected ${location}.`;
        if (metric === 'pigmentation') return `${severity} melanin clustering observed on ${location}.`;
        
        if (score > 85) return `Healthy tissue density and clear skin surface detected on ${location}.`;
        return `${severity} biometric markers detected on ${location} needing attention.`;
    }

    const getDisplayTerm = (m: string) => {
        if (m === 'acneActive') return 'Acne';
        if (m === 'wrinkleFine') return 'Fine Lines';
        if (m === 'wrinkleDeep') return 'Wrinkles';
        if (m === 'poreSize') return 'Pores (Enlarged)';
        if (m === 'acneScars') return 'Scars/Marks';
        return m.charAt(0).toUpperCase() + m.slice(1);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-md animate-in fade-in duration-300">
             <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 relative animate-in zoom-in-95 shadow-2xl">
                 <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-zinc-50 rounded-full text-zinc-400 hover:bg-zinc-100 transition-colors">
                     <X size={20} />
                 </button>

                 <div className="text-center mb-10 mt-4 tech-reveal">
                     <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{getDisplayTerm(metric)}</span>
                     <h2 className="text-7xl font-black text-zinc-900 mt-4 mb-4 tracking-tighter">{Math.round(score)}</h2>
                     <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-wide ${score > avg ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                         {performance}
                     </span>
                 </div>

                 <div className="mb-10 tech-reveal delay-100">
                     <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
                         <span>Peer Average ({avg})</span>
                         <span>You ({Math.round(score)})</span>
                     </div>
                     <div className="h-3 bg-zinc-100 rounded-full overflow-hidden relative">
                         <div className="absolute top-0 bottom-0 w-0.5 bg-zinc-400 z-10" style={{ left: `${avg}%` }} />
                         <div className={`h-full rounded-full transition-all duration-1000 draw-stroke ${score > 80 ? 'bg-emerald-400' : score > 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${score}%` }} />
                     </div>
                     <p className="text-[10px] text-zinc-400 mt-3 text-center">Comparing against age group: {age-5}-{age+5}</p>
                 </div>

                 <div className="bg-teal-50/50 rounded-2xl p-6 border border-teal-100/50 tech-reveal delay-200">
                     <h4 className="text-xs font-bold text-teal-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                         <Microscope size={14} /> AI Observation
                     </h4>
                     <p className="text-sm text-zinc-600 leading-relaxed font-medium">
                         {getObservation()}
                     </p>
                 </div>
             </div>
        </div>
    )
}

interface SkinAnalysisReportProps {
  userProfile: UserProfile;
  shelf: Product[];
  onRescan: () => void;
  onConsultAI: (query: string) => void;
  onViewProgress?: () => void;
  onLoginRequired: (reason: string) => void;
  onOpenRoutineBuilder: () => void;
  onUnlockPremium: () => void;
}

export const SkinAnalysisReport: React.FC<SkinAnalysisReportProps> = ({ userProfile, shelf, onRescan, onConsultAI, onViewProgress, onLoginRequired, onOpenRoutineBuilder, onUnlockPremium }) => {
  const metrics = userProfile.biometrics;
  
  // Guard against missing data to prevent crash
  if (!metrics || typeof metrics.overallScore === 'undefined') {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 p-6 text-center animate-in fade-in">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center animate-pulse">
                <ScanFace size={32} className="text-zinc-300" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">Analysis Data Missing</h3>
            <p className="text-sm text-zinc-500 max-w-xs">We couldn't load your skin profile. Please try rescanning.</p>
            <button 
                onClick={onRescan}
                className="bg-zinc-900 text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-zinc-800 transition-colors"
            >
                Start New Scan
            </button>
        </div>
      );
  }

  const age = userProfile.age || 25; 
  
  const [selectedMetric, setSelectedMetric] = useState<keyof SkinMetrics | null>(null);
  const [isTreatmentExpanded, setIsTreatmentExpanded] = useState(false);
  
  const [isChartVisible, setIsChartVisible] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const treatmentRef = useRef<HTMLDivElement>(null); 

  const isPremiumUnlocked = !!userProfile.isPremium;
  const usage = userProfile.usage || { manualScans: 0, buyingAssistantViews: 0, routineGenerations: 0 };

  useEffect(() => {
      const observer = new IntersectionObserver(
          ([entry]) => {
              if (entry.isIntersecting) {
                  setIsChartVisible(true);
                  observer.disconnect();
              }
          },
          { threshold: 0.3 }
      );
      if (chartRef.current) observer.observe(chartRef.current);
      return () => observer.disconnect();
  }, []);

  // Auto-Scroll when Treatment expands
  useEffect(() => {
    if (isTreatmentExpanded && treatmentRef.current) {
        setTimeout(() => {
            treatmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }
  }, [isTreatmentExpanded]);

  const clinicalSuggestions = useMemo(() => {
      return getClinicalTreatmentSuggestions(userProfile);
  }, [userProfile]);

  const rubricState = useMemo(() => {
      const score = metrics.overallScore;
      if (score >= 93) return "Pristine";
      if (score >= 80) return "Resilient";
      if (score >= 60) return "Imbalanced";
      if (score >= 40) return "Reactive";
      if (score >= 20) return "Clinical";
      return "Crisis";
  }, [metrics.overallScore]);

  // Dynamic Description based on Rubric
  const rubricDescription = useMemo(() => {
      switch(rubricState) {
          case "Pristine": return "Status: Flawless • Glass-like • Optimized. Your barrier is functioning perfectly.";
          case "Resilient": return "Status: Healthy • Clean • Balanced. High resistance to environmental stressors.";
          case "Imbalanced": return "Status: Sub-Optimal • Dull • Congested. Requires optimization to prevent decline.";
          case "Reactive": return "Status: Active Concern • Inflamed • Damaged. Visible signs of barrier stress.";
          case "Clinical": return "Status: Severe • Pathological • Deeply Compromised. Professional intervention recommended.";
          case "Crisis": return "Status: Critical • Emergency • Compromised. Immediate dermatological attention advised.";
          default: return "Your clinical grade based on inflammation, barrier integrity, and resilience.";
      }
  }, [rubricState]);

  const groupAnalysis = useMemo(() => {
      const blemishScore = (metrics.acneActive + metrics.acneScars + metrics.blackheads + metrics.poreSize) / 4;
      const healthScore = (metrics.hydration + metrics.oiliness + metrics.redness + metrics.texture) / 4;
      const agingScore = (metrics.pigmentation + metrics.darkCircles + metrics.wrinkleFine + metrics.wrinkleDeep + metrics.sagging) / 5;

      const scores = [{ name: 'Blemishes', val: blemishScore }, { name: 'Skin Health', val: healthScore }, { name: 'Vitality', val: agingScore }].sort((a,b) => a.val - b.val);
      let lowestGroup = scores[0];

      // --- SMART PRIORITIZATION LOGIC ---
      // If Vitality (which includes Dark Circles) is the lowest group, we check if it's truly critical.
      // If Dark Circles are above 45 (not severe) AND another actionable group (Health or Blemishes) is also low (< 85),
      // we swap priority to the actionable group. This prevents "Dark Circles" from dominating the advice when they are just genetic/structural.
      if (lowestGroup.name === 'Vitality') {
          const isDarkCircleSevere = metrics.darkCircles < 45; // Critical threshold
          if (!isDarkCircleSevere) {
              // Find next lowest that is actionable (not perfect)
              const alternative = scores.find(s => s.name !== 'Vitality' && s.val < 85);
              if (alternative) {
                  lowestGroup = alternative;
              }
          }
      }

      let summary: any = "";
      if (metrics.analysisSummary) {
          summary = metrics.analysisSummary;
      } else {
          if (lowestGroup.val > 85) {
              summary = "Your skin demonstrates excellent resilience. **Holistic maintenance** involving hydration, sleep, and SPF is your primary goal.";
          } else if (lowestGroup.name === 'Blemishes') {
              summary = "Analysis detects congestion and active blemish markers. **Deep pore cleansing and oil control** should be the primary focus of your routine.";
          } else if (lowestGroup.name === 'Skin Health') {
              summary = "Your moisture barrier appears compromised. **Immediate hydration and soothing** are required to reduce sensitivity and restore balance.";
          } else {
              // Vitality fallback - simplified holistic advice
              summary = "Signs of fatigue or structural change detected. **Restorative care** focusing on hydration, sleep quality, and collagen support is recommended.";
          }
      }

      return { blemishScore, healthScore, agingScore, priorityCategory: lowestGroup.name, priorityScore: lowestGroup.val, summaryText: summary };
  }, [metrics]);

  const skinSignatures = useMemo(() => {
      const parts = rubricDescription.replace('Status: ', '').split('.');
      const keywordString = parts[0];
      return keywordString.split('•').map(s => s.trim()).filter(s => s.length > 0);
  }, [rubricDescription]);

  let verdictTagText = "BASELINE";
  let verdictTagColor = "bg-zinc-100 text-zinc-600 border-zinc-200";
  
  if (metrics.overallScore > 0) {
       verdictTagText = "LIVE";
       verdictTagColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
  }

  const handleRescan = () => {
      if (userProfile.isAnonymous) {
          onLoginRequired('RESCAN_FACE');
      } else {
          onRescan();
      }
  };

  const handleViewProgress = () => {
      if (userProfile.isAnonymous) {
          onLoginRequired('VIEW_PROGRESS');
      } else if (onViewProgress) {
          onViewProgress();
      }
  };

  const adviceText = metrics.observations?.advice;

  const renderUsageBar = (current: number, max: number, label: string) => {
      const isUnlimited = isPremiumUnlocked;
      const pct = isUnlimited ? 100 : Math.min(100, (current / max) * 100);
      
      return (
          <div className="mb-3 last:mb-0">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1">
                  <span>{label}</span>
                  <span className="text-zinc-600">
                      {isUnlimited ? 'Unlimited' : `${current} / ${max}`}
                  </span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                      className={`h-full rounded-full transition-all duration-500 ${isUnlimited ? 'bg-gradient-to-r from-teal-400 to-emerald-500' : current >= max ? 'bg-rose-400' : 'bg-teal-500'}`} 
                      style={{ width: `${pct}%` }} 
                  />
              </div>
          </div>
      );
  };

  // --- SAFE AREA PADDING ADDED ---
  // Added 'pt-safe-top' to ensure content is not hidden behind notch
  return (
    <div className="max-w-7xl mx-auto lg:px-8 pb-48 pt-safe-top">
      
      <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-start lg:pt-8">
        
        {/* LEFT COLUMN (Desktop Sticky) */}
        <div className="lg:col-span-5 lg:sticky lg:top-8 space-y-12">
            {/* PROGRESS TRACKER OVERLAY ON HERO */}
            <div className="modern-card rounded-[2.5rem] overflow-hidden relative group hover:shadow-2xl transition-shadow duration-500">
                <div className="relative w-full overflow-hidden aspect-[4/5] sm:aspect-[16/9] lg:aspect-[4/5] bg-black">
                    {userProfile.faceImage ? (
                        <img src={userProfile.faceImage} className="w-full h-full object-cover opacity-100" alt="Clinical Scan" />
                    ) : (
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500 font-mono text-xs uppercase">No Clinical Data</div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                    
                    {/* RESCAN BUTTON FIX: Increased Z-Index, Added Cursor Pointer, Touch Manipulation */}
                    <button 
                        onClick={handleRescan} 
                        className="absolute top-6 right-6 z-40 cursor-pointer bg-black/40 backdrop-blur-md text-white px-5 py-2.5 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:bg-black/60 transition-colors border border-white/10 shadow-lg active:scale-95 touch-manipulation"
                    >
                        {userProfile.isAnonymous ? <Sparkles size={12} /> : <RefreshCw size={12} />}
                        {userProfile.isAnonymous ? "Save to Rescan" : "Rescan"}
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 text-white z-10">
                        <div className="flex justify-between items-start border-t border-white/10 pt-4 tech-reveal delay-100">
                            <HeroTooltip title="Overall Score" content="A holistic health rating (0-100) combining analysis of acne, wrinkles, texture, redness, and hydration.">
                                <div>
                                    <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block mb-0.5">Score</span>
                                    <span className="text-xl font-black text-white">{metrics.overallScore}</span>
                                </div>
                            </HeroTooltip>
                            
                            <HeroTooltip title="Priority Focus" content="The primary category (Blemishes, Health, or Vitality) that currently requires the most attention in your routine.">
                                <div>
                                    <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block mb-0.5">Priority</span>
                                    <span className="text-xl font-black text-white">{groupAnalysis.priorityCategory}</span>
                                </div>
                            </HeroTooltip>

                            <HeroTooltip title="Skin State" content={rubricDescription} align="right">
                                <div className="text-right sm:text-left">
                                    <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block mb-0.5">Skin State</span>
                                    <span className="text-xl font-black text-white flex items-center justify-end sm:justify-start gap-1.5">
                                        {rubricState}
                                    </span>
                                </div>
                            </HeroTooltip>
                        </div>
                    </div>
                </div>
            </div>

            {/* BALANCE MATRIX (Moved to left column on desktop for better layout balance) */}
            <div ref={chartRef} className="modern-card rounded-[2.5rem] p-10 flex flex-col items-center relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700 delay-100 chart-container group cursor-crosshair hidden lg:flex">
                <h3 className="text-xs font-black text-zinc-900 uppercase tracking-widest mb-10">Balance Matrix</h3>
                <div className="relative w-full max-w-[260px] aspect-square chart-zoom">
                    {/* ... SVG Chart code ... */}
                    <svg viewBox="-10 -10 140 140" className="w-full h-full">
                        {[20, 40, 60].map(r => (
                            <circle key={r} cx="60" cy="60" r={r/2} fill="none" stroke="#F4F4F5" strokeWidth="1" className={isChartVisible ? "draw-stroke" : "opacity-0"} />
                        ))}
                        {[0, 60, 120, 180, 240, 300].map(deg => {
                            const rad = deg * Math.PI / 180;
                            return <line key={deg} x1="60" y1="60" x2={60 + 30*Math.cos(rad)} y2={60 + 30*Math.sin(rad)} stroke="#F4F4F5" strokeWidth="1" className={isChartVisible ? "draw-stroke" : "opacity-0"} />
                        })}
                        {(() => {
                            const pts = [
                                { v: metrics.acneActive, a: -Math.PI/2 }, { v: metrics.redness, a: -Math.PI/6 },
                                { v: metrics.texture, a: Math.PI/6 }, { v: metrics.oiliness, a: Math.PI/2 },
                                { v: metrics.hydration, a: 5*Math.PI/6 }, { v: metrics.wrinkleFine, a: 7*Math.PI/6 }
                            ].map(p => {
                                const r = (p.v / 100) * 30; 
                                return { x: 60 + r * Math.cos(p.a), y: 60 + r * Math.sin(p.a) };
                            });
                            const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
                            return (
                                <g className={isChartVisible ? "opacity-100 transition-opacity duration-1000" : "opacity-0"}>
                                    <polygon points={polyPoints} fill="rgba(13, 148, 136, 0.15)" stroke="#0F766E" strokeWidth="2" strokeLinejoin="round" className="draw-stroke" />
                                    {pts.map((p, i) => (
                                        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#0D9488" className="animate-pulse" />
                                    ))}
                                </g>
                            )
                        })()}
                        <text x="60" y="22" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">ACNE</text>
                        <text x="94" y="42" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">TONE</text>
                        <text x="94" y="78" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">TEXTURE</text>
                        <text x="60" y="98" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">OIL</text>
                        <text x="26" y="78" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">HYDRA</text>
                        <text x="26" y="42" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">VITALITY</text>
                    </svg>
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN (Content) */}
        <div className="lg:col-span-7 space-y-12 mt-12 lg:mt-0">
            {/* CLINICAL VERDICT */}
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-zinc-100 tech-reveal delay-100 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100">
                            <Dna size={20} />
                        </div>
                        <div>
                            <h3 className="text-xs font-black text-zinc-900 uppercase tracking-widest leading-none mb-1">Clinical Verdict</h3>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border inline-block ${verdictTagColor}`}>
                                {verdictTagText}
                            </span>
                        </div>
                    </div>
                    <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                    {skinSignatures.map((sig, i) => (
                        <div key={i} className="px-3 py-1.5 rounded-full bg-zinc-50 border border-zinc-100 text-[10px] font-bold text-zinc-600 uppercase tracking-wide">
                            {sig}
                        </div>
                    ))}
                </div>

                <div className="relative">
                    {renderVerdict(groupAnalysis.summaryText)}
                </div>

                {adviceText && (
                    <div className="mt-6 p-4 bg-teal-50/50 rounded-2xl border border-teal-100/80 flex items-start gap-3">
                        <div className="bg-white p-1.5 rounded-full border border-teal-100 shadow-sm shrink-0">
                            <Lightbulb size={14} className="text-teal-500 fill-teal-500" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-teal-800 uppercase tracking-widest block mb-1">Quick Tip</span>
                            <p className="text-xs font-medium text-teal-900 leading-snug">
                                {adviceText.split(/(\*\*.*?\*\*)/).map((part, i) => 
                                    part.startsWith('**') ? <strong key={i} className="font-bold">{part.slice(2,-2)}</strong> : part
                                )}
                            </p>
                        </div>
                    </div>
                )}

                {onViewProgress && (
                    <div className="mt-6 pt-4 border-t border-zinc-50">
                        <button 
                            onClick={handleViewProgress}
                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-zinc-400 hover:text-teal-600 transition-colors py-2 group"
                        >
                            <TrendingUp size={14} className="group-hover:-translate-y-0.5 transition-transform" /> 
                            See Detailed Progress Report
                        </button>
                    </div>
                )}
            </div>

            {/* BALANCE MATRIX (Mobile Only) */}
            <div ref={chartRef} className="modern-card rounded-[2.5rem] p-10 flex flex-col items-center relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700 delay-100 chart-container group cursor-crosshair lg:hidden">
                <h3 className="text-xs font-black text-zinc-900 uppercase tracking-widest mb-10">Balance Matrix</h3>
                <div className="relative w-full max-w-[260px] aspect-square chart-zoom">
                    <svg viewBox="-10 -10 140 140" className="w-full h-full">
                        {[20, 40, 60].map(r => (
                            <circle key={r} cx="60" cy="60" r={r/2} fill="none" stroke="#F4F4F5" strokeWidth="1" className={isChartVisible ? "draw-stroke" : "opacity-0"} />
                        ))}
                        {[0, 60, 120, 180, 240, 300].map(deg => {
                            const rad = deg * Math.PI / 180;
                            return <line key={deg} x1="60" y1="60" x2={60 + 30*Math.cos(rad)} y2={60 + 30*Math.sin(rad)} stroke="#F4F4F5" strokeWidth="1" className={isChartVisible ? "draw-stroke" : "opacity-0"} />
                        })}
                        {(() => {
                            const pts = [
                                { v: metrics.acneActive, a: -Math.PI/2 }, { v: metrics.redness, a: -Math.PI/6 },
                                { v: metrics.texture, a: Math.PI/6 }, { v: metrics.oiliness, a: Math.PI/2 },
                                { v: metrics.hydration, a: 5*Math.PI/6 }, { v: metrics.wrinkleFine, a: 7*Math.PI/6 }
                            ].map(p => {
                                const r = (p.v / 100) * 30; 
                                return { x: 60 + r * Math.cos(p.a), y: 60 + r * Math.sin(p.a) };
                            });
                            const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
                            return (
                                <g className={isChartVisible ? "opacity-100 transition-opacity duration-1000" : "opacity-0"}>
                                    <polygon points={polyPoints} fill="rgba(13, 148, 136, 0.15)" stroke="#0F766E" strokeWidth="2" strokeLinejoin="round" className="draw-stroke" />
                                    {pts.map((p, i) => (
                                        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#0D9488" className="animate-pulse" />
                                    ))}
                                </g>
                            )
                        })()}
                        <text x="60" y="22" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">ACNE</text>
                        <text x="94" y="42" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">TONE</text>
                        <text x="94" y="78" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">TEXTURE</text>
                        <text x="60" y="98" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">OIL</text>
                        <text x="26" y="78" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">HYDRA</text>
                        <text x="26" y="42" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#A1A1AA" letterSpacing="0.2">VITALITY</text>
                    </svg>
                </div>
            </div>

            <div className="space-y-6">
                <GroupSection title="Blemishes" score={groupAnalysis.blemishScore} delayClass="delay-200">
                    <MetricRing label="Acne" value={metrics.acneActive} metricKey="acneActive" onSelect={setSelectedMetric} />
                    <MetricRing label="Scars" value={metrics.acneScars} metricKey="acneScars" onSelect={setSelectedMetric} />
                    <MetricRing label="Pores" value={metrics.poreSize} metricKey="poreSize" onSelect={setSelectedMetric} />
                    <MetricRing label="Blackheads" value={metrics.blackheads} metricKey="blackheads" onSelect={setSelectedMetric} />
                </GroupSection>

                <GroupSection title="Health" score={groupAnalysis.healthScore} delayClass="delay-300">
                    <MetricRing label="Hydration" value={metrics.hydration} metricKey="hydration" onSelect={setSelectedMetric} />
                    <MetricRing label="Oil Ctrl" value={metrics.oiliness} metricKey="oiliness" onSelect={setSelectedMetric} />
                    <MetricRing label="Redness" value={metrics.redness} metricKey="redness" onSelect={setSelectedMetric} />
                    <MetricRing label="Texture" value={metrics.texture} metricKey="texture" onSelect={setSelectedMetric} />
                </GroupSection>

                <GroupSection title="Vitality" score={groupAnalysis.agingScore} delayClass="delay-500">
                    <MetricRing label="Fine Lines" value={metrics.wrinkleFine} metricKey="wrinkleFine" onSelect={setSelectedMetric} />
                    <MetricRing label="Wrinkles" value={metrics.wrinkleDeep} metricKey="wrinkleDeep" onSelect={setSelectedMetric} />
                    <MetricRing label="Firmness" value={metrics.sagging} metricKey="sagging" onSelect={setSelectedMetric} />
                    <MetricRing label="Spots" value={metrics.pigmentation} metricKey="pigmentation" onSelect={setSelectedMetric} />
                    <div className="col-span-4 mt-2 border-t border-zinc-50 pt-2 flex justify-center">
                        <div className="w-1/4">
                            <MetricRing label="Dark Circles" value={metrics.darkCircles} metricKey="darkCircles" onSelect={setSelectedMetric} />
                        </div>
                    </div>
                </GroupSection>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. ROUTINE ARCHITECT */}
                <button 
                    onClick={onOpenRoutineBuilder}
                    className="w-full group relative overflow-hidden rounded-[2.5rem] p-8 text-left transition-all hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] border border-zinc-100 shadow-sm animate-in slide-in-from-bottom-8 duration-700 delay-500 bg-white"
                >
                    <div className="absolute top-0 right-0 w-48 h-48 bg-teal-50/50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600">
                                    <Sparkles size={16} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-600">Routine Architect</span>
                            </div>
                            <h3 className="text-2xl font-black text-zinc-900 tracking-tight leading-tight mb-2">
                                Build Your Perfect Routine
                            </h3>
                            <p className="text-sm text-zinc-500 font-medium max-w-[240px] leading-relaxed">
                                Get personalized product recommendations based on your skin metrics and budget.
                            </p>
                        </div>
                        
                        <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 text-white">
                            <ArrowRight size={20} />
                        </div>
                    </div>
                </button>

                {/* 2. ASK SKINOS (AI CHAT) - RENAMED */}
                <button
                    onClick={() => onConsultAI('')}
                    className="w-full relative overflow-hidden rounded-[2.5rem] p-8 text-left transition-all hover:scale-[1.01] active:scale-[0.99] shadow-xl group animate-in slide-in-from-bottom-8 duration-700 delay-500"
                    style={{ backgroundColor: 'rgb(163, 206, 207)' }}
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none mix-blend-overlay"></div>
                    
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-sm">
                                    <MessageCircle size={16} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">24/7 Support</span>
                            </div>
                            <h3 className="text-2xl font-black text-white tracking-tight leading-tight mb-2 drop-shadow-sm flex items-center gap-2">
                                Ask SkinOS
                                {!isPremiumUnlocked && <span className="text-xs bg-white/20 px-2 py-1 rounded-lg font-bold uppercase tracking-wider backdrop-blur-sm">Free Trial</span>}
                            </h3>
                            <p className="text-sm text-white/90 font-bold max-w-[240px] leading-relaxed">
                                Your personal skin advisor. Ask about ingredients, routine conflicts, or specific concerns based on your analysis.
                            </p>
                        </div>
                        
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 text-teal-700">
                            <ArrowRight size={20} />
                        </div>
                    </div>
                </button>
            </div>

            {/* CLINICAL MENU SECTION */}
            <div 
                ref={treatmentRef}
                className={`modern-card rounded-[2.5rem] p-8 tech-reveal delay-200 cursor-pointer transition-colors duration-300 border-zinc-100 relative overflow-hidden
                ${isTreatmentExpanded ? 'bg-white shadow-xl ring-1 ring-teal-100' : 'bg-gradient-to-br from-white to-zinc-50 hover:bg-white hover:border-teal-200'}`}
                onClick={() => setIsTreatmentExpanded(!isTreatmentExpanded)}
            >
                    <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-500 ${isTreatmentExpanded ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-teal-50 text-teal-600'}`}>
                                <Syringe size={22} strokeWidth={isTreatmentExpanded ? 2.5 : 2} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-zinc-900 tracking-tight leading-none mb-1">Clinical Treatments</h3>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Targeting {groupAnalysis.priorityCategory}</p>
                        </div>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-500 ${isTreatmentExpanded ? 'bg-zinc-100 rotate-180 text-zinc-900' : 'text-zinc-300'}`}>
                            <ChevronDown size={20} />
                    </div>
                    </div>

                    {/* SUMMARY VIEW (Visible when collapsed) */}
                    {!isTreatmentExpanded && (
                    <div className="mt-5 pt-5 border-t border-zinc-100/50 animate-in fade-in duration-300">
                            <p className="text-xs text-zinc-500 font-medium leading-relaxed mb-4">
                            Professional, non-invasive procedures recommended to accelerate your results.
                            </p>
                            
                            <div className="flex items-center justify-between">
                                <div className="flex -space-x-2">
                                    {clinicalSuggestions.map((s, i) => (
                                        <div key={i} className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${s.type === 'LASER' ? 'bg-rose-50 text-rose-500' : s.type === 'FACIAL' ? 'bg-sky-50 text-sky-500' : 'bg-violet-50 text-violet-500'}`}>
                                            {s.type === 'LASER' ? <Zap size={10} /> : s.type === 'FACIAL' ? <Sparkles size={10} /> : <Activity size={10} />}
                                        </div>
                                    ))}
                                </div>
                                <span className="text-[10px] font-bold text-teal-600 bg-white border border-teal-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                                View Options <ArrowRight size={10} />
                                </span>
                        </div>
                    </div>
                    )}

                    {/* EXPANDED DETAILS VIEW */}
                    {isTreatmentExpanded && (
                        <div className="space-y-3 mt-8 animate-in slide-in-from-top-2 duration-300 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 bg-zinc-50 rounded-2xl mb-4 border border-zinc-100">
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                <span className="font-bold text-zinc-900">AI Recommendation:</span> Based on your {groupAnalysis.priorityCategory.toLowerCase()} score of {Math.round(groupAnalysis.priorityScore)}, these professional treatments could accelerate results.
                            </p>
                        </div>

                        {clinicalSuggestions.map((treatment, idx) => {
                            const isLaser = treatment.type === 'LASER';
                            const isFacial = treatment.type === 'FACIAL';
                            const colorClass = isLaser ? 'text-rose-500 bg-rose-50 border-rose-100' : isFacial ? 'text-sky-500 bg-sky-50 border-sky-100' : 'text-violet-500 bg-violet-50 border-violet-100';

                            return (
                                <div key={idx} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-zinc-100 flex flex-col sm:flex-row gap-5 transition-all hover:border-teal-200 hover:shadow-md">
                                    <div className="flex items-start justify-between sm:hidden">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${colorClass}`}>
                                            {isLaser ? <Zap size={18} /> : isFacial ? <Sparkles size={18} /> : <Activity size={18} />}
                                        </div>
                                        <span className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-wide border ${colorClass}`}>
                                            {treatment.type}
                                        </span>
                                    </div>

                                    <div className={`hidden sm:flex w-12 h-12 rounded-2xl items-center justify-center shrink-0 border ${colorClass}`}>
                                        {isLaser ? <Zap size={22} /> : isFacial ? <Sparkles size={22} /> : <Activity size={22} />}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-sm text-zinc-900 mb-1.5 flex items-center gap-2">
                                            {treatment.name}
                                            <span className="sm:hidden text-[9px] font-medium text-zinc-400 border border-zinc-100 px-1.5 py-0.5 rounded-full">{treatment.downtime}</span>
                                        </h4>
                                        <p className="text-xs text-zinc-500 font-medium leading-relaxed">{treatment.benefit}</p>
                                    </div>

                                    <div className="hidden sm:flex flex-col items-end justify-center gap-2 min-w-[100px]">
                                        <span className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-wide border ${colorClass}`}>
                                            {treatment.type}
                                        </span>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400">
                                            {treatment.downtime === 'None' ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> : <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                                            {treatment.downtime}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    )}
            </div>

            {/* 3. MEMBERSHIP PLAN (MOVED TO BOTTOM) - REDESIGNED */}
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-zinc-100 relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700 delay-500">
                
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Crown size={14} className={isPremiumUnlocked ? "text-amber-400 fill-amber-400" : "text-zinc-300"} /> 
                            Current Plan
                        </h3>
                        <h2 className="text-3xl font-black text-zinc-900 tracking-tighter">
                            {isPremiumUnlocked ? "Premium" : "Free Starter"}
                        </h2>
                    </div>
                    {!isPremiumUnlocked && (
                        <button 
                            onClick={onUnlockPremium}
                            className="bg-zinc-900 text-white px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/10"
                        >
                            Unlock All
                        </button>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Usage Bars */}
                    <div>
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 border-b border-zinc-50 pb-2">Usage Limits</h4>
                        <div className="space-y-4">
                            {renderUsageBar(usage.manualScans, 3, "Smart Scan & Search")}
                            {renderUsageBar(usage.buyingAssistantViews, 3, "Buying Assistant")}
                            {renderUsageBar(usage.routineGenerations, 1, "Routine Architect")}
                        </div>
                    </div>
                </div>
            </div>
        </div> {/* CLOSE RIGHT COLUMN */}
      </div> {/* CLOSE GRID */}

        {selectedMetric && (
            <MetricModal 
                metric={selectedMetric} 
                score={metrics[selectedMetric] as number} 
                age={age}
                observation={metrics.observations?.[selectedMetric]}
                onClose={() => setSelectedMetric(null)} 
            />
        )}
    </div> 
  );
};
