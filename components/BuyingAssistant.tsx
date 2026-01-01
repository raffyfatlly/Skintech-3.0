
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Product, UserProfile } from '../types';
import { getBuyingDecision } from '../services/geminiService';
import { startCheckout } from '../services/stripeService';
import { Check, X, AlertTriangle, ShieldCheck, Zap, AlertOctagon, TrendingUp, DollarSign, Clock, ArrowRight, Lock, Sparkles, Crown, Link, ExternalLink, CloudSun, Layers, MessageCircle, ArrowLeft, ThumbsUp, ThumbsDown, HelpCircle, ChevronDown, Eye, Search } from 'lucide-react';

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

  const comparableProducts = useMemo(() => {
      // Show all products on shelf for comprehensive comparison
      return shelf.filter(p => p.id !== product.id);
  }, [shelf, product.id]);

  const { verdict, audit, shelfConflicts, comparison } = decisionData;

  // --- SIMPLIFIED VERDICT LOGIC ---
  const simpleVerdict = useMemo(() => {
      const rawDecision = verdict.decision;
      if (['BUY', 'GREAT FIND', 'SWAP'].includes(rawDecision)) {
          return { type: 'GREAT', label: 'Great Match', color: 'emerald', icon: ThumbsUp };
      } else if (rawDecision === 'AVOID') {
          return { type: 'AVOID', label: 'Avoid', color: 'rose', icon: ThumbsDown };
      } else if (rawDecision === 'UNKNOWN') {
          return { type: 'UNKNOWN', label: 'Verify Info', color: 'zinc', icon: Search };
      } else {
          return { type: 'CONSIDER', label: 'Consider', color: 'amber', icon: HelpCircle };
      }
  }, [verdict.decision]);

  const dynamicDescription = useMemo(() => {
      const decision = simpleVerdict.type;
      
      const typeLabel = product.type === 'UNKNOWN' ? 'product' : 
                        product.type.charAt(0).toUpperCase() + product.type.slice(1).toLowerCase();

      // Helper to get nice labels for targets based on benefits
      const getTargetLabels = () => {
          const uniqueTargets = Array.from(new Set(product.benefits.map(b => b.target)));
          const labels = uniqueTargets.map(t => {
              switch(t) {
                  case 'acneActive': return 'Acne';
                  case 'acneScars': return 'Scarring';
                  case 'wrinkleFine': case 'wrinkleDeep': return 'Anti-Aging';
                  case 'pigmentation': return 'Brightening';
                  case 'hydration': return 'Hydration';
                  case 'redness': return 'Redness';
                  case 'oiliness': return 'Oil Control';
                  case 'poreSize': return 'Pores';
                  case 'texture': return 'Texture';
                  default: return null;
              }
          }).filter(Boolean);
          
          if (labels.length === 0) return null;
          return Array.from(new Set(labels)).slice(0, 2).join(' & ');
      };

      const targets = getTargetLabels();

      // 1. GOOD MATCH
      if (decision === 'GREAT') {
          if (targets) {
              return `Great choice. This **${typeLabel}** targets your **${targets}** goals while keeping your skin barrier safe.`;
          }
          return `Excellent match. This **${typeLabel}** is safe and aligns perfectly with your skin profile.`;
      }

      // 2. CONSIDER
      if (decision === 'CONSIDER') {
          // Only show caution if risk is relevant to a low biometric score
          const getRelevantRisk = () => {
              if (!product.risks || product.risks.length === 0) return null;
              const b = user.biometrics;
              
              // Find a risk that matches a vulnerability (score < 60)
              return product.risks.find(r => {
                  const content = (r.ingredient + ' ' + r.reason).toLowerCase();
                  
                  // Sensitivity/Redness
                  if (b.redness < 60 && (content.includes('irritat') || content.includes('sensit') || content.includes('alcohol') || content.includes('fragrance') || content.includes('acid') || content.includes('exfolia'))) return true;
                  
                  // Dryness/Hydration
                  if (b.hydration < 60 && (content.includes('dry') || content.includes('strip') || content.includes('alcohol') || content.includes('sulfate'))) return true;
                  
                  // Acne/Oily/Pores
                  if ((b.acneActive < 60 || b.oiliness < 60 || b.poreSize < 60) && (content.includes('clog') || content.includes('comedogen') || content.includes('oil') || content.includes('butter') || content.includes('coconut'))) return true;

                  return false;
              });
          };

          const risk = getRelevantRisk();

          if (risk) {
              let reason = risk.reason.trim();
              
              // Simplify language
              reason = reason.replace(/is flagged for potential/i, 'may cause');
              reason = reason.replace(/increase the feeling of/i, 'cause');
              
              reason = reason.charAt(0).toUpperCase() + reason.slice(1);
              if (!reason.endsWith('.')) reason += '.';
              
              return `Be careful. This contains **${risk.ingredient}**. ${reason}`;
          }
          
          return `It's okay, but not the best fit. This **${typeLabel}** is safe, but there are better options for your skin goals.`;
      }

      // 3. AVOID
      if (decision === 'AVOID') {
          const risk = product.risks.find(r => r.riskLevel === 'HIGH') || product.risks[0];
          if (risk) {
              return `Best to avoid. It contains **${risk.ingredient}**, which could irritate your skin.`;
          }
          return `Not recommended. This **${typeLabel}** has ingredients that may conflict with your skin type.`;
      }

      // 4. UNKNOWN
      if (decision === 'UNKNOWN') {
          return `We couldn't auto-retrieve the full ingredient list. To keep your routine safe, please verify this product using **Google AI Overview** below.`;
      }

      return verdict.description;
  }, [simpleVerdict.type, product, verdict.description, user.biometrics]);

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
          case 'UNKNOWN': return {
              bg: 'bg-zinc-50',
              border: 'border-zinc-200',
              text: 'text-zinc-800',
              accent: 'text-zinc-500',
              badge: 'bg-zinc-100 text-zinc-600'
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

                {simpleVerdict.type === 'UNKNOWN' ? (
                    <div className="mt-4">
                        <a 
                            href={`https://www.google.com/search?q=${encodeURIComponent(product.brand + ' ' + product.name + ' ingredients safety review')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 group"
                        >
                            <Sparkles size={16} className="text-blue-200 group-hover:text-white transition-colors" /> 
                            Launch Google AI
                        </a>
                        <p className="text-[9px] text-center text-zinc-400 mt-2 font-medium">Opens Google Search for AI Overview</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between text-xs font-bold text-zinc-500 px-1">
                            <span>Skin Match Score</span>
                            <span className={`text-lg font-black ${theme.accent}`}>{Math.min(99, product.suitabilityScore)}%</span>
                        </div>
                        
                        {/* Score Bar with Comparisons */}
                        <div className="relative mt-2 mb-2">
                            <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-1000 ${simpleVerdict.type === 'GREAT' ? 'bg-emerald-500' : simpleVerdict.type === 'AVOID' ? 'bg-rose-500' : 'bg-amber-500'}`} 
                                    style={{ width: `${Math.min(99, product.suitabilityScore)}%` }}
                                />
                            </div>

                            {/* Shelf Markers - Updated Style (White/Clean) */}
                            {comparableProducts.map(p => (
                                <div 
                                    key={p.id}
                                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-4 bg-white rounded-full border border-zinc-300 shadow-sm z-10 cursor-help group/marker hover:scale-125 transition-transform hover:z-30 hover:border-teal-500"
                                    style={{ left: `${Math.min(99, p.suitabilityScore)}%` }}
                                >
                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white text-zinc-600 text-[9px] font-bold px-3 py-2 rounded-xl shadow-xl border border-zinc-100 whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-all pointer-events-none z-20 flex flex-col items-center min-w-[80px]">
                                        <span className="text-teal-700 uppercase tracking-widest text-[8px] mb-0.5">{p.type}</span>
                                        <span className="text-zinc-900 text-[10px]">{p.brand || p.name.substring(0, 10)}</span>
                                        <span className="text-zinc-400 font-medium mt-0.5">Match: {p.suitabilityScore}%</span>
                                        {/* Pointer Arrow */}
                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-b border-r border-zinc-100 rotate-45"></div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {comparableProducts.length > 0 && (
                            <div className="flex justify-end mt-1">
                                <p className="text-[9px] font-bold text-zinc-400 flex items-center gap-1.5">
                                    <span className="w-1.5 h-3 bg-white rounded-full border border-zinc-300 inline-block"></span>
                                    vs {comparableProducts.length} items in your routine
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* EXPAND ACTION - HIDE IF UNKNOWN */}
            {!showDetails && simpleVerdict.type !== 'UNKNOWN' && (
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
            {showDetails && simpleVerdict.type !== 'UNKNOWN' && (
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

        {/* FIXED BOTTOM BAR - Only visible when unlocked or missing info */}
        {(isUnlocked || !isUsageLimitReached || simpleVerdict.type === 'UNKNOWN') && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t border-zinc-100 z-50 pb-safe animate-in slide-in-from-bottom-full duration-500">
                <div className="flex gap-3 max-w-md mx-auto">
                    <button 
                        onClick={onDiscard}
                        className="flex-1 py-4 bg-white text-zinc-500 border border-zinc-200 rounded-2xl font-bold text-sm hover:bg-zinc-50 transition-colors"
                    >
                        Cancel
                    </button>
                    {simpleVerdict.type !== 'UNKNOWN' && (
                        <button 
                            onClick={onAddToShelf}
                            className="flex-[2] py-4 bg-teal-600 text-white rounded-2xl font-bold text-sm hover:bg-teal-700 transition-colors shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2"
                        >
                            Add to Routine <ArrowRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default BuyingAssistant;
