
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Product, UserProfile } from '../types';
import { getBuyingDecision } from '../services/geminiService';
import { startCheckout } from '../services/stripeService';
import { Check, X, AlertTriangle, ShieldCheck, Zap, AlertOctagon, TrendingUp, DollarSign, Clock, ArrowRight, Lock, Sparkles, Crown, Link, ExternalLink, CloudSun, Layers, MessageCircle, ArrowLeft, ThumbsUp, ThumbsDown, HelpCircle, ChevronDown, Eye } from 'lucide-react';

interface BuyingAssistantProps {
  product: Product;
  user: UserProfile;
  shelf: Product[];
  onAddToShelf: () => void;
  onDiscard: () => void;
  onUnlockPremium: () => void;
  usageCount: number;
  onIncrementUsage: () => void;
}

const LIMIT_VIEWS = 3;

// Helper to render bold text from Markdown with customizable highlight class
const renderFormattedText = (text: string, highlightClass: string = "font-black") => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className={highlightClass}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
};

const BuyingAssistant: React.FC<BuyingAssistantProps> = ({ product, user, shelf, onAddToShelf, onDiscard, onUnlockPremium, usageCount, onIncrementUsage }) => {
  // If user is premium, unlocked by default
  const [isUnlocked, setIsUnlocked] = useState(!!user.isPremium);
  const [showDetails, setShowDetails] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  
  // Sync if user becomes premium while viewing
  useEffect(() => {
    setIsUnlocked(!!user.isPremium);
  }, [user.isPremium]);

  // Auto-scroll when expanded
  useEffect(() => {
      if (showDetails && detailsRef.current) {
          setTimeout(() => {
              detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
      }
  }, [showDetails]);

  const handleExpand = () => {
      if (user.isPremium) {
          setShowDetails(true);
      } else {
          if (usageCount < LIMIT_VIEWS) {
              onIncrementUsage();
              setShowDetails(true);
          } else {
              // Show premium wall over details
              setShowDetails(true);
              // But ensure locked state handles the CTA
          }
      }
  };

  const decisionData = useMemo(() => {
    return getBuyingDecision(product, shelf, user);
  }, [product, shelf, user]);

  const { verdict, audit, shelfConflicts, comparison } = decisionData;

  // --- SIMPLIFIED VERDICT LOGIC ---
  const simpleVerdict = useMemo(() => {
      const rawDecision = verdict.decision;
      if (['BUY', 'GREAT FIND', 'SWAP'].includes(rawDecision)) {
          return { type: 'GREAT', label: 'Great Match', color: 'emerald', icon: ThumbsUp };
      } else if (rawDecision === 'AVOID') {
          return { type: 'AVOID', label: 'Avoid', color: 'rose', icon: ThumbsDown };
      } else {
          return { type: 'CONSIDER', label: 'Consider', color: 'amber', icon: HelpCircle };
      }
  }, [verdict.decision]);

  const dynamicDescription = useMemo(() => {
      const decision = simpleVerdict.type;
      
      // 1. GOOD MATCH
      if (decision === 'GREAT') {
          // Find high relevance benefits first
          const relevantBenefits = product.benefits.filter(b => b.relevance === 'HIGH');
          const primaryBenefit = relevantBenefits.length > 0 ? relevantBenefits[0] : product.benefits[0];

          if (primaryBenefit) {
              return `Excellent match. This formulation is optimized to **${primaryBenefit.description.toLowerCase()}**, directly targeting your skin needs.`;
          }
          return "This product aligns perfectly with your skin profile and contains no harsh irritants.";
      }

      // 2. CONSIDER
      if (decision === 'CONSIDER') {
          const benefit = product.benefits[0];
          const risk = product.risks[0]; // Usually the reason for 'Consider'

          if (benefit && risk) {
              return `While it can help **${benefit.description.toLowerCase()}**, it contains **${risk.ingredient}** which may cause **${risk.reason.toLowerCase()}**. Use with caution.`;
          }
          if (risk) {
              return `Proceed with caution. Contains **${risk.ingredient}** which can trigger **${risk.reason.toLowerCase()}**.`;
          }
          return verdict.description;
      }

      // 3. AVOID
      if (decision === 'AVOID') {
          const risk = product.risks.find(r => r.riskLevel === 'HIGH') || product.risks[0];
          if (risk) {
              return `Not recommended. Contains **${risk.ingredient}** which is likely to exacerbate **${risk.reason.toLowerCase()}**.`;
          }
          return "This product formulation conflicts with your current skin biometric profile.";
      }

      return verdict.description;
  }, [simpleVerdict.type, product, verdict.description]);

  const getThemeClasses = () => {
      switch(simpleVerdict.type) {
          case 'GREAT': return {
              bg: 'bg-emerald-50',
              border: 'border-emerald-100',
              text: 'text-emerald-900',
              accent: 'text-emerald-600',
              badge: 'bg-emerald-100 text-emerald-700'
          };
          case 'AVOID': return {
              bg: 'bg-rose-50',
              border: 'border-rose-100',
              text: 'text-rose-900',
              accent: 'text-rose-600',
              badge: 'bg-rose-100 text-rose-700'
          };
          default: return {
              bg: 'bg-amber-50',
              border: 'border-amber-100',
              text: 'text-amber-900',
              accent: 'text-amber-600',
              badge: 'bg-amber-100 text-amber-700'
          };
      }
  };

  const theme = getThemeClasses();
  
  // Calculate lock status based on usage if not premium
  const isUsageLimitReached = !user.isPremium && usageCount >= LIMIT_VIEWS;
  // If user is premium OR hasn't expanded OR (has expanded AND is under limit), it's considered "viewable" logic-wise, 
  // but actual content blur happens if isUsageLimitReached is true when showDetails is true.
  
  return (
    <div className="min-h-screen pb-32 animate-in slide-in-from-bottom-8 duration-500 bg-zinc-50 font-sans">
        
        {/* HERO HEADER */}
        <div 
            className="pt-12 pb-12 px-6 rounded-b-[2.5rem] relative overflow-hidden shadow-xl"
            style={{ backgroundColor: 'rgb(163, 206, 207)' }}
        >
             <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none mix-blend-overlay"></div>
             
             <div className="flex items-center justify-between mb-6 relative z-10">
                 <button onClick={onDiscard} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-white drop-shadow-sm">
                     <ArrowLeft size={24} />
                 </button>
                 <div className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 text-white shadow-sm">
                     <Sparkles size={12} className="text-amber-100" /> Buying Assistant
                 </div>
             </div>

             <div className="relative z-10 text-white text-center">
                 <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg text-3xl">
                    🧴
                 </div>
                 <h1 className="text-2xl font-black tracking-tight mb-1 drop-shadow-md max-w-xs mx-auto leading-tight">{product.name}</h1>
                 <p className="text-white/90 text-xs font-bold uppercase tracking-widest drop-shadow-sm mb-4">{product.brand || 'Unknown Brand'}</p>
                 
                 <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-lg border border-white/20">
                    <DollarSign size={12} className="text-white" />
                    <span className="text-xs font-bold text-white">RM {product.estimatedPrice || 45}</span>
                 </div>
             </div>
        </div>

        <div className="px-6 -mt-8 relative z-20 space-y-4">
            
            {/* VERDICT CARD */}
            <div className={`bg-white rounded-[2rem] p-6 shadow-xl shadow-zinc-200/50 border border-zinc-100 relative overflow-hidden`}>
                <div className={`absolute top-0 left-0 right-0 h-1.5 ${theme.bg.replace('50', '500')}`}></div>
                
                <div className="flex items-center justify-between mb-4 mt-2">
                    <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">AI Verdict</span>
                        <div className="flex items-center gap-2">
                            <h2 className={`text-2xl font-black tracking-tight ${theme.text}`}>{simpleVerdict.label}</h2>
                        </div>
                    </div>
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${theme.bg} ${theme.accent}`}>
                        <simpleVerdict.icon size={28} strokeWidth={2.5} />
                    </div>
                </div>

                <div className={`p-4 rounded-2xl ${theme.bg} border ${theme.border} mb-4`}>
                    <p className={`text-xs font-medium leading-relaxed ${theme.text}`}>
                        {renderFormattedText(dynamicDescription)}
                    </p>
                </div>

                <div className="flex items-center justify-between text-xs font-bold text-zinc-500 px-1">
                    <span>Skin Match Score</span>
                    <span className={`text-lg font-black ${theme.accent}`}>{product.suitabilityScore}%</span>
                </div>
                
                {/* Score Bar */}
                <div className="h-2 w-full bg-zinc-100 rounded-full mt-2 overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-1000 ${simpleVerdict.type === 'GREAT' ? 'bg-emerald-500' : simpleVerdict.type === 'AVOID' ? 'bg-rose-500' : 'bg-amber-500'}`} 
                        style={{ width: `${product.suitabilityScore}%` }}
                    />
                </div>
            </div>

            {/* EXPAND ACTION */}
            {!showDetails && (
                <button 
                    onClick={handleExpand}
                    className="w-full bg-white rounded-[2rem] p-4 flex flex-col items-center justify-center gap-1 shadow-sm border border-zinc-100 text-zinc-400 font-bold text-xs uppercase tracking-widest hover:text-teal-600 hover:border-teal-100 transition-all active:scale-95 group animate-in slide-in-from-bottom-2"
                >
                    <div className="flex items-center gap-2">
                        View Full Analysis 
                        <ChevronDown size={16} className="group-hover:translate-y-0.5 transition-transform" />
                    </div>
                    {!user.isPremium && (
                        <span className="text-[9px] text-zinc-300 font-medium bg-zinc-50 px-2 py-0.5 rounded-full">
                            {usageCount < LIMIT_VIEWS ? `${LIMIT_VIEWS - usageCount} Free Views Left` : "Premium Required"}
                        </span>
                    )}
                </button>
            )}

            {/* DETAILED ANALYSIS - EXPANDABLE */}
            {showDetails && (
                <div ref={detailsRef} className="relative animate-in slide-in-from-bottom-4 duration-500 fade-in pt-2">
                     
                     {/* LOCKED OVERLAY (If Not Premium AND Usage Limit Reached) */}
                     {isUsageLimitReached && (
                         <div className="absolute inset-x-0 top-0 bottom-0 z-30 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px] rounded-[2rem] border border-zinc-100 shadow-sm p-6 text-center">
                             <div className="w-14 h-14 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                                 <Lock className="text-zinc-400" size={24} />
                             </div>
                             <h2 className="text-lg font-black text-zinc-900 mb-2">Detailed Report Locked</h2>
                             <p className="text-zinc-500 text-xs font-medium mb-6 max-w-[200px]">
                                You've used your 3 free analysis views. Unlock unlimited access to see ingredient risks & conflicts.
                             </p>
                             <button 
                                onClick={onUnlockPremium}
                                className="bg-zinc-900 text-white px-6 py-3 rounded-full font-bold text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg"
                            >
                                <Sparkles size={14} className="text-amber-300" /> Unlock Now
                            </button>
                         </div>
                     )}

                     <div className={`space-y-4 transition-all duration-700 ${isUsageLimitReached ? 'filter blur-md opacity-50 pointer-events-none select-none h-[400px] overflow-hidden' : ''}`}>
                        
                        {/* SOURCES */}
                        {product.sources && product.sources.length > 0 && (
                            <div className="px-2">
                                <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Link size={12} /> Verified Sources
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {product.sources.slice(0, 3).map((src, i) => {
                                        try {
                                            const url = new URL(src);
                                            const domain = url.hostname.replace('www.', '');
                                            return (
                                                <a 
                                                    key={i} 
                                                    href={src} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="bg-white px-3 py-1.5 rounded-full border border-zinc-200 text-[10px] font-bold text-zinc-500 flex items-center gap-1 hover:border-teal-300 hover:text-teal-700 transition-colors shadow-sm"
                                                >
                                                    {domain} <ExternalLink size={8} />
                                                </a>
                                            );
                                        } catch (e) { return null; }
                                    })}
                                </div>
                            </div>
                        )}

                        {/* EXPERT REVIEW */}
                        {product.expertReview && (
                            <div className="bg-white p-6 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                 <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <MessageCircle size={14} className="text-teal-500" /> Expert Take
                                 </h3>
                                 <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                                     {product.expertReview}
                                 </p>
                            </div>
                        )}

                        {/* USAGE TIPS */}
                        {product.usageTips && (
                            <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-[1.5rem] border border-indigo-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <CloudSun size={64} className="text-indigo-900" />
                                </div>
                                <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                                    <Layers size={14} className="text-indigo-600" /> Smart Usage
                                </h3>
                                <p className="text-xs text-indigo-800 font-medium leading-relaxed relative z-10">
                                    {renderFormattedText(product.usageTips, "font-black text-indigo-900")}
                                </p>
                            </div>
                        )}

                        {/* RISKS */}
                        <div className="bg-white p-6 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <AlertOctagon size={14} className="text-rose-500" /> Risk Analysis
                            </h3>
                            <div className="space-y-3">
                                {(audit.warnings.length > 0 ? audit.warnings : [{ severity: 'CAUTION', reason: "Contains potential irritants." }]).map((w, i) => (
                                    <div key={i} className={`flex gap-3 p-3 rounded-xl border ${w.severity === 'CRITICAL' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
                                        <div className="mt-0.5">
                                            {w.severity === 'CRITICAL' ? <AlertOctagon size={16} className="text-rose-500" /> : <AlertTriangle size={16} className="text-amber-500" />}
                                        </div>
                                        <div>
                                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded mb-1 inline-block ${w.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {w.severity}
                                            </span>
                                            <p className={`text-xs font-medium leading-snug ${w.severity === 'CRITICAL' ? 'text-rose-900' : 'text-amber-900'}`}>
                                                {w.reason}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CONFLICTS */}
                        {shelfConflicts.length > 0 && (
                            <div className="bg-white p-6 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Clock size={14} className="text-indigo-500" /> Routine Conflicts
                                </h3>
                                <div className="space-y-2">
                                    {shelfConflicts.map((c, i) => (
                                        <div key={i} className="flex gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                                            <AlertTriangle size={16} className="text-indigo-500 mt-0.5" />
                                            <p className="text-xs font-medium text-indigo-800 leading-snug">{c}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* BENEFITS */}
                        {product.benefits.length > 0 && (
                            <div className="bg-white p-6 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-teal-500" /> Key Benefits
                                </h3>
                                <div className="space-y-3">
                                    {product.benefits.slice(0, 3).map((b, i) => {
                                        const val = user.biometrics[b.target as keyof typeof user.biometrics];
                                        const metricScore = typeof val === 'number' ? val : 0;
                                        const isTargeted = metricScore < 60;
                                        
                                        return (
                                            <div key={i} className="flex gap-3 items-start">
                                                <div className={`mt-0.5 ${isTargeted ? 'text-teal-500' : 'text-zinc-300'}`}>
                                                    <Check size={16} strokeWidth={3} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-sm font-bold text-zinc-900">{b.ingredient}</span>
                                                        {isTargeted && (
                                                            <span className="text-[9px] font-bold bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded border border-teal-100 uppercase">Targeted</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-zinc-500 font-medium leading-snug">{b.description}</p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* FIXED BOTTOM BAR - Only visible when unlocked */}
        {(isUnlocked || !isUsageLimitReached) && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t border-zinc-100 z-50 pb-safe animate-in slide-in-from-bottom-full duration-500">
                <div className="flex gap-3 max-w-md mx-auto">
                    <button 
                        onClick={onDiscard}
                        className="flex-1 py-4 bg-white text-zinc-500 border border-zinc-200 rounded-2xl font-bold text-sm hover:bg-zinc-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onAddToShelf}
                        className="flex-[2] py-4 bg-teal-600 text-white rounded-2xl font-bold text-sm hover:bg-teal-700 transition-colors shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2"
                    >
                        Add to Routine <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default BuyingAssistant;
