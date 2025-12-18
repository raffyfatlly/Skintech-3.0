
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SkinMetrics, Product, UserProfile } from '../types';
import { auditProduct, getClinicalTreatmentSuggestions } from '../services/geminiService';
import { RefreshCw, Sparkles, Sun, Moon, Ban, CheckCircle2, AlertTriangle, Target, BrainCircuit, Stethoscope, Plus, Microscope, X, FlaskConical, Search, ArrowRight, Pipette, Droplet, Layers, Fingerprint, Info, AlertOctagon, GitBranch, ArrowUpRight, Syringe, Zap, Activity, MessageCircle, ShieldAlert, TrendingUp, TrendingDown, Minus, ShoppingBag, ScanBarcode, ShieldCheck, ChevronDown, Lock, Crown, ListChecks, HelpCircle } from 'lucide-react';

// --- SUB COMPONENTS ---

const renderVerdict = (text: string) => {
  if (!text) return null;
  // Split by bold markers
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      // High contrast bolding for critical info
      return <strong key={i} className="font-black text-teal-900">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
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

const getIngredientIcon = (name: string, action: string) => {
    const n = name.toLowerCase();
    const a = action.toLowerCase();
    
    if (n.includes('acid') || n.includes('bha') || n.includes('aha')) return <FlaskConical size={18} />;
    if (n.includes('vitamin c') || n.includes('bright') || a.includes('glow')) return <Sun size={18} />;
    if (n.includes('retinol') || n.includes('retinal') || n.includes('peptide')) return <Activity size={18} />;
    if (n.includes('hyaluronic') || n.includes('glycerin') || a.includes('hydrat')) return <Droplet size={18} />;
    if (n.includes('niacinamide') || n.includes('zinc')) return <ShieldCheck size={18} />;
    if (n.includes('spf') || a.includes('protect')) return <ShieldAlert size={18} />;
    if (n.includes('oil') || n.includes('extract')) return <Pipette size={18} />;
    
    return <Sparkles size={18} />;
};

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

const SkinAnalysisReport: React.FC<SkinAnalysisReportProps> = ({ userProfile, shelf, onRescan, onConsultAI, onViewProgress, onLoginRequired, onOpenRoutineBuilder, onUnlockPremium }) => {
  const metrics = userProfile.biometrics;
  const history = userProfile.scanHistory || [];
  const prevMetrics = history.length > 1 ? history[history.length - 2] : null;
  
  const age = userProfile.age || 25; 
  
  const [selectedMetric, setSelectedMetric] = useState<keyof SkinMetrics | null>(null);
  const [complexity, setComplexity] = useState<'BASIC' | 'ADVANCED'>(userProfile.preferences?.complexity === 'ADVANCED' ? 'ADVANCED' : 'BASIC');
  const [isTreatmentExpanded, setIsTreatmentExpanded] = useState(false);
  
  const [isChartVisible, setIsChartVisible] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const treatmentRef = useRef<HTMLDivElement>(null); // New ref for auto-scrolling

  // If user is premium, features are unlocked by default
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(!!userProfile.isPremium);

  // Sync state if userProfile updates
  useEffect(() => {
    setIsPremiumUnlocked(!!userProfile.isPremium);
  }, [userProfile.isPremium]);

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

  const calculatedSkinType = useMemo(() => {
      const parts = [];
      const isSensitive = metrics.redness < 60;
      const isCriticallyDry = metrics.hydration < 45;
      const isOily = metrics.oiliness < 50;
      const isDry = metrics.hydration < 55;
      
      if (isSensitive) parts.push("Sensitive");

      if (isCriticallyDry) {
          parts.push("Dry");
      } else if (isOily) {
          parts.push("Oily");
      } else if (isDry) {
          parts.push("Dry");
      } else if (metrics.oiliness > 50 && metrics.oiliness < 70) {
          parts.push("Combination");
      } else {
          parts.push("Normal");
      }

      return parts.join(" + ");
  }, [metrics]);

  const groupAnalysis = useMemo(() => {
      const blemishScore = (metrics.acneActive + metrics.acneScars + metrics.blackheads + metrics.poreSize) / 4;
      const healthScore = (metrics.hydration + metrics.oiliness + metrics.redness + metrics.texture) / 4;
      const agingScore = (metrics.pigmentation + metrics.darkCircles + metrics.wrinkleFine + metrics.wrinkleDeep + metrics.sagging) / 5;

      const scores = [{ name: 'Blemishes', val: blemishScore }, { name: 'Skin Health', val: healthScore }, { name: 'Vitality', val: agingScore }].sort((a,b) => a.val - b.val);
      const lowestGroup = scores[0];

      let summary = "";
      if (metrics.analysisSummary) {
          summary = metrics.analysisSummary;
      } else {
          if (lowestGroup.val > 80) {
              summary = "Your skin demonstrates excellent resilience. **Maintenance is your primary goal** to preserve barrier integrity and elasticity.";
          } else if (lowestGroup.name === 'Blemishes') {
              summary = "Analysis detects congestion and active blemish markers. **Deep pore cleansing and oil control** should be the primary focus of your routine.";
          } else if (lowestGroup.name === 'Skin Health') {
              summary = "Your moisture barrier appears compromised. **Immediate hydration and soothing** are required to reduce sensitivity and restore balance.";
          } else {
              summary = "Early structural changes are visible. **Collagen support and sun protection** are critical to prevent deepening of fine lines.";
          }
      }

      return { blemishScore, healthScore, agingScore, priorityCategory: lowestGroup.name, priorityScore: lowestGroup.val, summaryText: summary };
  }, [metrics]);

  const progressVerdict = useMemo(() => {
      if (!prevMetrics) {
          return {
              status: "Baseline Established",
              trend: 0,
              verdictTitle: "Analysis Complete",
              verdictText: "We've mapped your skin's starting point. Add products to your shelf and scan again regularly to track real efficacy.",
              color: "text-zinc-600 bg-zinc-50 border-zinc-200"
          };
      }

      const diff = metrics.overallScore - prevMetrics.overallScore;
      const trend = Math.round(((metrics.overallScore - prevMetrics.overallScore) / prevMetrics.overallScore) * 100);
      
      const changes = [
          { name: 'Redness', val: metrics.redness - prevMetrics.redness },
          { name: 'Hydration', val: metrics.hydration - prevMetrics.hydration },
          { name: 'Acne', val: metrics.acneActive - prevMetrics.acneActive },
          { name: 'Texture', val: metrics.texture - prevMetrics.texture }
      ].sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
      
      const biggestChange = changes[0];

      const newProducts = shelf.filter(p => p.dateScanned > prevMetrics.timestamp && p.dateScanned < metrics.timestamp);
      const latestProduct = newProducts.length > 0 ? newProducts[newProducts.length - 1] : null;

      let verdictText = "";
      let title = "";
      
      if (Math.abs(diff) < 5) {
          let status = "Steady";
          let color = "text-zinc-500 bg-zinc-50 border-zinc-200";

          if (metrics.overallScore > 80) {
              title = "Health Maintained";
              status = "Maintained";
              color = "text-emerald-700 bg-emerald-50 border-emerald-100";
          } else if (metrics.overallScore < 60) {
              title = "Condition Persistent";
              status = "Persistent";
              color = "text-amber-700 bg-amber-50 border-amber-100";
          } else {
              title = "Consistent State";
              status = "Consistent";
          }
          
          verdictText = "Your skin metrics are hovering in the same range. No significant reactions or major improvements detected recently.";
          return { status: status, trend, verdictTitle: title, verdictText, color: color };
      }

      const improved = diff > 0;
      title = improved ? "Improving" : "Declining";
      
      if (improved) {
          if (latestProduct && biggestChange.val > 0) {
               verdictText = `The ${latestProduct.name} appears to be helping. ${biggestChange.name} has improved by +${Math.round(biggestChange.val)} points.`;
          } else {
               verdictText = `Routine is effective. ${biggestChange.name} shows the strongest improvement (+${Math.round(biggestChange.val)} points).`;
          }
          return { status: "Improving", trend, verdictTitle: title, verdictText, color: "text-emerald-700 bg-emerald-50 border-emerald-100" };
      } else {
           if (latestProduct && biggestChange.val < 0) {
               verdictText = `Monitor ${latestProduct.name}. ${biggestChange.name} has dropped by ${Math.round(biggestChange.val)} points since adding it.`;
          } else {
               verdictText = `Regression detected. ${biggestChange.name} has worsened (-${Math.abs(Math.round(biggestChange.val))} points). Check routine for irritants.`;
          }
          return { status: "Declining", trend, verdictTitle: title, verdictText, color: "text-rose-700 bg-rose-50 border-rose-100" };
      }

  }, [metrics, prevMetrics, shelf]);

  const prescription = useMemo(() => {
    let rankedConcerns = [
        { id: 'acneActive', score: metrics.acneActive }, { id: 'acneScars', score: metrics.acneScars },
        { id: 'pigmentation', score: metrics.pigmentation }, { id: 'redness', score: metrics.redness },
        { id: 'wrinkleFine', score: metrics.wrinkleFine }, { id: 'wrinkleDeep', score: metrics.wrinkleDeep },
        { id: 'hydration', score: metrics.hydration }, { id: 'oiliness', score: metrics.oiliness },
        { id: 'poreSize', score: metrics.poreSize }, { id: 'blackheads', score: metrics.blackheads },
        { id: 'texture', score: metrics.texture }, { id: 'sagging', score: metrics.sagging },
        { id: 'darkCircles', score: metrics.darkCircles }
    ];

    rankedConcerns = rankedConcerns.map(c => {
        if (c.id === 'acneActive') return { ...c, score: c.score - 15 }; 
        if (c.id === 'redness') return { ...c, score: c.score - 10 };   
        return c;
    });

    const goals = userProfile.preferences?.goals || [];
    if (goals.length > 0) {
        if (goals.includes('Look Younger & Firm')) {
             const idx = rankedConcerns.findIndex(c => c.id === 'wrinkleFine');
             if (idx > -1) rankedConcerns[idx].score -= 5;
        }
        if (goals.includes('Clear Acne & Blemishes')) {
             const idx = rankedConcerns.findIndex(c => c.id === 'acneActive');
             if (idx > -1) rankedConcerns[idx].score -= 5;
        }
    }

    rankedConcerns.sort((a, b) => a.score - b.score);
    const concernLimit = complexity === 'ADVANCED' ? 6 : 3;
    const topConcerns = rankedConcerns.slice(0, concernLimit);

    const ingredients: { name: string, action: string, context?: string, isSafetySwap?: boolean }[] = [];
    
    topConcerns.forEach(concern => {
        switch(concern.id) {
            case 'acneActive': ingredients.push({ name: 'Salicylic Acid', action: 'Deep clean your pores' }, { name: 'Benzoyl Peroxide', action: 'Eliminate acne bacteria' }); break;
            case 'acneScars': ingredients.push({ name: 'Azelaic Acid', action: 'Fade redness and marks' }, { name: 'Niacinamide', action: 'Balance oil and tone' }); break;
            case 'pigmentation': ingredients.push({ name: 'Vitamin C', action: 'Boost radiance and glow' }, { name: 'Tranexamic Acid', action: 'Target stubborn dark spots' }); break;
            case 'redness': ingredients.push({ name: 'Centella', action: 'Calm irritated skin' }, { name: 'Panthenol', action: 'Strengthen skin barrier' }); break;
            case 'wrinkleFine': ingredients.push({ name: 'Retinol', action: 'Refine texture and lines' }, { name: 'Peptides', action: 'Boost skin elasticity' }); break;
            case 'wrinkleDeep': ingredients.push({ name: 'Retinal', action: 'Accelerate skin renewal' }, { name: 'Growth Factors', action: 'Repair deep damage' }); break;
            case 'hydration': ingredients.push({ name: 'Hyaluronic Acid', action: 'Lock in deep moisture' }, { name: 'Polyglutamic Acid', action: 'Intense surface hydration' }); break;
            case 'oiliness': ingredients.push({ name: 'Niacinamide', action: 'Balance oil and tone' }, { name: 'Green Tea', action: 'Soothe and protect' }); break;
            case 'poreSize': ingredients.push({ name: 'BHA', action: 'Unclog congested pores' }, { name: 'Niacinamide', action: 'Tighten pore appearance' }); break;
            case 'blackheads': ingredients.push({ name: 'Salicylic Acid', action: 'Deep clean your pores' }, { name: 'Clay', action: 'Detoxify excess oil' }); break;
            case 'texture': ingredients.push({ name: 'Glycolic Acid', action: 'Resurface skin texture' }, { name: 'Urea', action: 'Hydrate and exfoliate' }); break;
            case 'sagging': ingredients.push({ name: 'Copper Peptides', action: 'Restore firmness' }, { name: 'Vitamin C', action: 'Boost radiance and glow' }); break;
            case 'darkCircles': ingredients.push({ name: 'Caffeine', action: 'Reduce under-eye bags' }); break;
        }
    });

    const limit = complexity === 'ADVANCED' ? 8 : 4;
    let uniqueIngredients = ingredients.filter((v,i,a)=>a.findIndex(t=>(t.name===v.name))===i).slice(0, limit);

    const isDehydrated = metrics.hydration < 45;
    const isSensitive = metrics.redness < 50;

    uniqueIngredients = uniqueIngredients.map(ing => {
        if (isDehydrated) {
            if (ing.name === 'Glycolic Acid') return { name: 'Lactic Acid', action: 'Gentle exfoliation', context: 'Swapped from Glycolic due to low hydration.', isSafetySwap: true };
            if (ing.name === 'Salicylic Acid') return { name: 'Willow Bark', action: 'Natural pore cleansing', context: 'Swapped from BHA to prevent drying.', isSafetySwap: true };
            if (ing.name === 'Retinol' || ing.name === 'Retinal') return { name: 'Bakuchiol', action: 'Gentle anti-aging', context: 'Swapped from Retinol to preserve moisture.', isSafetySwap: true };
            if (ing.name === 'Benzoyl Peroxide') return { name: 'Sulfur', action: 'Gentle acne treatment', context: 'Less drying than Benzoyl Peroxide.', isSafetySwap: true };
            if (ing.name === 'Clay') return { name: 'Enzyme Mask', action: 'Non-abrasive smoothing', context: 'Non-drying alternative to Clay.', isSafetySwap: true };
        }
        
        if (isSensitive) {
            if (ing.name === 'Glycolic Acid' || ing.name === 'Lactic Acid') return { name: 'PHA', action: 'Sensitive skin renewal', context: 'Acid swapped for sensitive skin safety.', isSafetySwap: true };
            if (ing.name === 'Vitamin C') return { name: 'Magnesium Ascorbyl Phosphate', action: 'Gentle brightening', context: 'Non-stinging Vitamin C form.', isSafetySwap: true };
            if (ing.name === 'Retinol') return { name: 'Peptides', action: 'Boost skin elasticity', context: 'Retinol is too harsh for current sensitivity.', isSafetySwap: true };
        }

        return ing;
    });

    const avoid: string[] = [];
    if (metrics.redness < 65) avoid.push('Fragrance', 'Alcohol Denat', 'Essential Oils');
    if (metrics.hydration < 55) avoid.push('Clay Masks', 'SLS', 'High % Acids');
    if (metrics.acneActive < 65 || metrics.oiliness < 55) avoid.push('Coconut Oil', 'Shea Butter', 'Mineral Oil');
    if (avoid.length === 0) avoid.push('Harsh Physical Scrubs');

    return { topConcerns, ingredients: uniqueIngredients, avoid, hasSafetySwaps: uniqueIngredients.some(i => i.isSafetySwap) };
  }, [metrics, complexity, userProfile.preferences]);

  const priorityColor = groupAnalysis.priorityScore > 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100';
  const priorityLabel = groupAnalysis.priorityScore > 80 ? 'Maintenance' : 'Focus';

  const isAnonymous = userProfile.isAnonymous;
  const hasHistory = userProfile.scanHistory && userProfile.scanHistory.length > 1;

  let verdictTagText = "";
  let verdictTagColor = "";
  let verdictBodyText: React.ReactNode = renderVerdict(groupAnalysis.summaryText);

  if (isAnonymous) {
      verdictTagText = "BASELINE SET";
      verdictTagColor = "bg-zinc-100 text-zinc-600 border-zinc-200";
      verdictBodyText = (
          <>
            {verdictBodyText} <span className="block mt-2 font-medium italic text-teal-600/80">Rescan regularly to build a clinical history and unlock trend analysis.</span>
          </>
      );
  } else if (!hasHistory) {
       verdictTagText = "BASELINE ESTABLISHED";
       verdictTagColor = "bg-zinc-100 text-zinc-600 border-zinc-200";
  } else {
       const status = progressVerdict.status.toUpperCase();
       verdictTagText = status;
       
       if (status === 'IMPROVING' || status === 'MAINTAINED') {
           verdictTagColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
       } else if (status === 'DECLINING' || status === 'PERSISTENT') {
           verdictTagColor = "bg-rose-50 text-rose-700 border-rose-100";
       } else {
           verdictTagText = "STABLE";
           verdictTagColor = "bg-zinc-50 text-zinc-600 border-zinc-200";
       }
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

  // Increased bottom padding to 48 (12rem) to allow full scroll visibility above mobile navigation bars
  return (
    <div className="space-y-12 pb-48">
        {/* PROGRESS TRACKER OVERLAY ON HERO */}
        <div className="modern-card rounded-[2.5rem] overflow-hidden relative group hover:shadow-2xl transition-shadow duration-500">
            <div className="relative w-full overflow-hidden aspect-[4/5] sm:aspect-[16/9] bg-black">
                 {userProfile.faceImage ? (
                    <img src={userProfile.faceImage} className="w-full h-full object-cover opacity-100" alt="Clinical Scan" />
                 ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500 font-mono text-xs uppercase">No Clinical Data</div>
                 )}
                 <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                 
                 <button onClick={handleRescan} className="absolute top-6 right-6 z-20 bg-black/40 backdrop-blur-md text-white px-5 py-2.5 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:bg-black/60 transition-colors border border-white/10 shadow-lg">
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

                        <HeroTooltip title="Skin State" content="Your dynamic skin type calculated from real-time oil, hydration, and sensitivity levels. This can change with weather and routine." align="right">
                            <div className="text-right sm:text-left">
                                 <span className="text-[9px] font-bold text-teal-400 uppercase tracking-widest block mb-0.5">Skin State</span>
                                 <span className="text-xl font-black text-white flex items-center justify-end sm:justify-start gap-1.5">
                                    {calculatedSkinType.split('+')[0].trim()}
                                 </span>
                            </div>
                        </HeroTooltip>
                     </div>
                 </div>
            </div>
        </div>

        {/* CLINICAL VERDICT SECTION */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 tech-reveal delay-100 flex flex-col sm:flex-row gap-4">
             <div className="flex-1">
                 <div className="flex items-center justify-between mb-3">
                     <div className="flex items-center gap-2">
                        <Stethoscope size={14} className="text-teal-500" />
                        <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                            Clinical Verdict
                        </h3>
                     </div>
                     <span className={`text-[9px] font-bold px-2 py-1 rounded border ${verdictTagColor}`}>
                        {verdictTagText}
                     </span>
                 </div>
                 <p className="text-sm text-zinc-600 font-normal leading-relaxed">
                    {verdictBodyText}
                 </p>
             </div>
             
             {onViewProgress && (
                 <button 
                    onClick={handleViewProgress}
                    className="shrink-0 flex items-center justify-center gap-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 rounded-xl px-5 py-3 text-xs font-bold uppercase tracking-wide border border-zinc-200 transition-colors self-start sm:self-center w-full sm:w-auto"
                 >
                    <TrendingUp size={14} /> See My Progress
                 </button>
             )}
        </div>

        <div ref={chartRef} className="modern-card rounded-[2.5rem] p-10 flex flex-col items-center relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700 delay-100 chart-container group cursor-crosshair">
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

        {/* PREMIUM INTELLIGENCE HUB (New Replacement for Analysis Complete) */}
        <div 
            className="rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden animate-in slide-in-from-bottom-8 duration-700 delay-500"
            style={{ backgroundColor: 'rgb(163, 206, 207)' }}
        >
             {/* Decorative Background */}
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
             <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none mix-blend-overlay"></div>

             {!isPremiumUnlocked ? (
                 <div className="text-center relative z-10 py-4">
                      {/* Premium Teaser Icon */}
                      <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-6 border border-white/30 shadow-inner">
                          <Lock className="text-white drop-shadow-sm" size={32} strokeWidth={2.5} />
                      </div>
                      
                      <h2 className="text-3xl font-black text-white mb-2 tracking-tight drop-shadow-md">Unlock Your Routine</h2>
                      
                      {/* Enticing Value Prop - Updated Copy */}
                      <p className="text-white/95 font-medium text-sm mb-8 max-w-xs mx-auto leading-relaxed drop-shadow-sm">
                         We've identified the best products for your unique skin profile. Get a personalized routine and curated product plan built just for you.
                      </p>
                      
                      {/* Feature List (Updated Tags) */}
                      <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-sm mx-auto opacity-90">
                          {["Routine Architect", "Unlimited Rescans", "Smart Search", "Product Swaps", "Priority Access"].map((feat, i) => (
                              <span key={i} className="px-2 py-1 bg-white/10 rounded-md text-[9px] font-bold text-white uppercase tracking-wider border border-white/10">
                                  {feat}
                              </span>
                          ))}
                      </div>

                      {/* Unlock Button - ANIMATED */}
                      <div className="relative inline-flex group rounded-full p-[2px] overflow-hidden shadow-[0_10px_20px_rgba(0,0,0,0.1)]">
                          <div className="absolute inset-[-100%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2E8F0_0%,#E2E8F0_50%,#0F766E_100%)]" />
                          <button 
                            onClick={onUnlockPremium}
                            className="relative z-10 bg-white text-teal-900 px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                          >
                              <Sparkles size={14} className="text-amber-400 fill-amber-400 group-hover:rotate-12 transition-transform" /> Unlock Full Access
                          </button>
                      </div>
                      <p className="text-[10px] text-white/80 font-bold mt-4 uppercase tracking-widest">RM 9.90 • One-time Payment</p>
                 </div>
             ) : (
                 <div className="relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-8">
                          <div>
                              <h3 className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1 flex items-center gap-2">
                                 <Sparkles size={12} className="text-white" /> Premium Report
                              </h3>
                              <h2 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Power Ingredients</h2>
                          </div>
                          <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Unlocked</span>
                          </div>
                      </div>

                      {/* Revealed Ingredients Grid */}
                      <div className="grid grid-cols-2 gap-3 mb-8">
                          {prescription.ingredients.map((ing, i) => (
                              <div key={i} className="bg-white/20 backdrop-blur-md border border-white/30 p-4 rounded-2xl flex flex-col justify-center animate-in zoom-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 100}ms` }}>
                                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-teal-600 mb-2 shadow-sm">
                                      {getIngredientIcon(ing.name, ing.action)}
                                  </div>
                                  <span className="text-white font-bold text-sm block leading-tight mb-0.5">{ing.name}</span>
                                  <span className="text-white/80 text-[10px] font-medium leading-tight">{ing.action}</span>
                              </div>
                          ))}
                      </div>

                      {/* Avoid List */}
                      {prescription.avoid.length > 0 && (
                        <div className="mb-8 p-4 bg-white/10 rounded-2xl border border-white/10 flex items-start gap-3">
                             <Ban size={16} className="text-white mt-0.5 shrink-0" />
                             <div>
                                 <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest block mb-1">Avoid for now</span>
                                 <p className="text-xs text-white font-medium leading-relaxed">
                                     {prescription.avoid.join(', ')}
                                 </p>
                             </div>
                        </div>
                      )}

                      {/* Prominent Launch Architect CTA - SLEEK ACTION CARD DESIGN */}
                      <button 
                        onClick={onOpenRoutineBuilder}
                        className="w-full group relative overflow-hidden rounded-[2rem] p-6 text-left transition-all hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]"
                      >
                           {/* Background Gradients */}
                           <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-emerald-500"></div>
                           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
                           <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                           {/* Content */}
                           <div className="relative z-10 flex items-center justify-between">
                              <div>
                                 <div className="flex items-center gap-2 mb-1.5 opacity-90">
                                    <div className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-md border border-white/20 text-[9px] font-bold uppercase tracking-widest text-white flex items-center gap-1.5">
                                        <Crown size={10} /> Premium Feature
                                    </div>
                                 </div>
                                 <h3 className="text-2xl font-black text-white tracking-tight drop-shadow-sm mb-1">
                                     Launch Architect
                                 </h3>
                                 <p className="text-white/90 text-xs font-bold flex items-center gap-2">
                                     3-Tier Product Plan: Budget • Value • Luxury
                                 </p>
                              </div>
                              
                              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                                 <ArrowRight size={20} className="text-teal-600" />
                              </div>
                           </div>
                      </button>
                 </div>
             )}
        </div>

        {/* CLINICAL MENU SECTION (Renamed to Treatment for You) */}
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

export default SkinAnalysisReport;
