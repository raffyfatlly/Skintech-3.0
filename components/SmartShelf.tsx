import React, { useState, useMemo } from 'react';
import { Product, UserProfile, SkinMetrics } from '../types';
import { Plus, Droplet, Sun, Zap, Sparkles, AlertTriangle, Layers, AlertOctagon, Target, ShieldCheck, X, FlaskConical, Clock, Ban, ArrowRightLeft, CheckCircle2, Microscope, Dna, Palette, Brush, SprayCan, Stamp, DollarSign, TrendingUp, TrendingDown, Wallet, ArrowUpRight, Edit2, Save, Info, ArrowUpCircle, Check, Award } from 'lucide-react';
import { auditProduct, analyzeShelfHealth, analyzeProductContext, getBuyingDecision } from '../services/geminiService';

interface SmartShelfProps {
  products: Product[];
  onRemoveProduct: (id: string) => void;
  onScanNew: () => void;
  onUpdateProduct: (product: Product) => void;
  userProfile: UserProfile;
}

// --- INTERNAL COMPONENT: GRADING POPUP ---
const GradingInfo = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button 
                onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
                className="ml-1.5 text-zinc-300 hover:text-teal-600 transition-colors align-middle"
                aria-label="Grading Info"
            >
                <Info size={14} />
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}>
                    <div className="w-full max-w-xs bg-white rounded-[2rem] p-6 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white/50" onClick={(e) => e.stopPropagation()}>
                        {/* Close Button - Fixed Z-Index and Interaction */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} 
                            className="absolute top-4 right-4 p-2.5 bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 transition-colors z-50 cursor-pointer"
                        >
                            <X size={18} />
                        </button>

                        {/* Header */}
                        <div className="text-center mb-6 pt-2">
                            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-teal-600 shadow-sm border border-teal-100">
                                <Award size={24} />
                            </div>
                            <h3 className="text-lg font-black text-zinc-900 tracking-tight">Routine Grading</h3>
                            <p className="text-xs text-zinc-500 font-medium mt-1">AI evaluation of your shelf efficacy.</p>
                        </div>

                        {/* Tiers */}
                        <div className="space-y-3">
                            {/* S Tier */}
                            <div className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
                                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-sm shadow-sm">S</div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Elite</span>
                                        <span className="text-[10px] font-bold text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-100 shadow-sm">{'>'} 85%</span>
                                    </div>
                                    <p className="text-[10px] text-emerald-800/70 leading-tight mt-0.5 font-medium">Requires Cleanser, Moisturizer & SPF.</p>
                                </div>
                            </div>

                            {/* A Tier */}
                            <div className="flex items-center gap-3 p-3 bg-teal-50/50 rounded-xl border border-teal-100/50">
                                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-black text-sm shadow-sm">A</div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-teal-900 uppercase tracking-wide">Excellent</span>
                                        <span className="text-[10px] font-bold text-teal-600 bg-white px-2 py-0.5 rounded-full border border-teal-100 shadow-sm">{'>'} 75%</span>
                                    </div>
                                </div>
                            </div>

                            {/* B Tier */}
                            <div className="flex items-center gap-3 p-3 bg-sky-50/50 rounded-xl border border-sky-100/50">
                                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700 font-black text-sm shadow-sm">B</div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-sky-900 uppercase tracking-wide">Good</span>
                                        <span className="text-[10px] font-bold text-sky-600 bg-white px-2 py-0.5 rounded-full border border-sky-100 shadow-sm">{'>'} 60%</span>
                                    </div>
                                </div>
                            </div>

                            {/* C Tier */}
                            <div className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
                                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-black text-sm shadow-sm">C</div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">Fair</span>
                                        <span className="text-[10px] font-bold text-amber-600 bg-white px-2 py-0.5 rounded-full border border-amber-100 shadow-sm">Optimize</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const SmartShelf: React.FC<SmartShelfProps> = ({ products, onRemoveProduct, onScanNew, onUpdateProduct, userProfile }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ROUTINE' | 'VANITY'>('ROUTINE');
  
  // Price Editing State
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>('');

  const shelfIQ = useMemo(() => analyzeShelfHealth(products, userProfile), [products, userProfile]);

  const makeupTypes = ['FOUNDATION', 'CONCEALER', 'POWDER', 'PRIMER', 'SETTING_SPRAY', 'BLUSH', 'BRONZER'];

  const filteredProducts = useMemo(() => {
      if (activeTab === 'ROUTINE') {
          return products.filter(p => !makeupTypes.includes(p.type));
      } else {
          return products.filter(p => makeupTypes.includes(p.type));
      }
  }, [products, activeTab]);

  const costAnalysis = useMemo(() => {
      let totalValue = 0;
      let monthlyCost = 0;
      let totalSuitability = 0;
      let count = 0;

      products.forEach(p => {
          const price = p.estimatedPrice || 45; 
          totalValue += price;

          // Estimate monthly cost based on depletion rate
          let durationMonths = 3;
          if (makeupTypes.includes(p.type)) durationMonths = 6;
          else if (p.type === 'SPF') durationMonths = 1.5;
          else if (p.type === 'SERUM' || p.type === 'TREATMENT') durationMonths = 2;
          else if (p.type === 'CLEANSER' || p.type === 'TONER') durationMonths = 3;
          else if (p.type === 'MOISTURIZER') durationMonths = 2.5;

          monthlyCost += price / durationMonths;
          
          // Use adjusted suitability score (after audit penalties) for realistic match
          const audit = auditProduct(p, userProfile);
          totalSuitability += audit.adjustedScore;
          count++;
      });
      
      const avgSuitability = count > 0 ? totalSuitability / count : 0;

      // Verdict Logic based on Cost vs Match % (Suitability)
      let verdict = { 
          title: "Balanced Investment", 
          desc: "Spending aligns with efficacy.", 
          icon: Wallet, 
          color: "text-zinc-600 bg-zinc-50 border-zinc-100" 
      };

      if (monthlyCost > 250 && avgSuitability < 70) {
          verdict = { title: "High Waste", desc: "High spend on low-match products.", icon: TrendingDown, color: "text-rose-600 bg-rose-50 border-rose-100" };
      } else if (monthlyCost > 150 && avgSuitability < 75) {
          verdict = { title: "Inefficient Spend", desc: "Overpaying for average results.", icon: AlertTriangle, color: "text-amber-600 bg-amber-50 border-amber-100" };
      } else if (monthlyCost < 200 && avgSuitability > 80) {
          verdict = { title: "Smart Value", desc: "High match at a smart price.", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50 border-emerald-100" };
      } else if (monthlyCost > 300 && avgSuitability > 85) {
          verdict = { title: "Premium Match", desc: "High investment, excellent fit.", icon: Sparkles, color: "text-purple-600 bg-purple-50 border-purple-100" };
      } else if (monthlyCost < 100 && avgSuitability < 60) {
           verdict = { title: "Low Impact", desc: "Low cost, but needs optimization.", icon: AlertTriangle, color: "text-zinc-500 bg-zinc-50 border-zinc-200" };
      }

      return { totalValue: Math.round(totalValue), monthlyCost: Math.round(monthlyCost), avgSuitability: Math.round(avgSuitability), verdict };
  }, [products, userProfile]);

  const handleStartEditPrice = (p: Product) => {
      setTempPrice((p.estimatedPrice || 45).toString());
      setIsEditingPrice(true);
  };

  const handleSavePrice = () => {
      if (selectedProduct) {
          const newPrice = parseFloat(tempPrice);
          if (!isNaN(newPrice)) {
              onUpdateProduct({ ...selectedProduct, estimatedPrice: newPrice });
          }
          setIsEditingPrice(false);
      }
  };

  const getProductColor = (type: string) => {
      switch(type) {
          case 'CLEANSER': return 'bg-sky-50 text-sky-600';
          case 'SPF': return 'bg-amber-50 text-amber-600';
          case 'SERUM': return 'bg-teal-50 text-teal-600';
          case 'MOISTURIZER': return 'bg-rose-50 text-rose-600';
          case 'FOUNDATION': return 'bg-orange-50 text-orange-600';
          case 'POWDER': return 'bg-stone-50 text-stone-600';
          case 'PRIMER': return 'bg-purple-50 text-purple-600';
          default: return 'bg-zinc-50 text-zinc-600';
      }
  }

  const getProductIcon = (type: string) => {
      switch(type) {
          case 'CLEANSER': return <Droplet size={20} />;
          case 'SPF': return <Sun size={20} />;
          case 'SERUM': return <Zap size={20} />;
          case 'FOUNDATION': return <Palette size={20} />;
          case 'POWDER': return <Stamp size={20} />;
          case 'PRIMER': return <Layers size={20} />;
          case 'SETTING_SPRAY': return <SprayCan size={20} />;
          case 'BLUSH': return <Brush size={20} />;
          default: return <Sparkles size={20} />;
      }
  }

  const getGradeColor = (grade: string) => {
      switch(grade) {
          case 'S': return 'text-emerald-500 border-emerald-500 bg-emerald-50';
          case 'A': return 'text-teal-500 border-teal-500 bg-teal-50';
          case 'B': return 'text-sky-500 border-sky-500 bg-sky-50';
          case 'C': return 'text-amber-500 border-amber-500 bg-amber-50';
          default: return 'text-rose-500 border-rose-500 bg-rose-50';
      }
  }

  const getVerdictGradient = (color: string) => {
      switch(color) {
          case 'emerald': return 'from-emerald-500 to-teal-600 shadow-emerald-200';
          case 'rose': return 'from-rose-500 to-red-600 shadow-rose-200';
          case 'amber': return 'from-amber-400 to-orange-500 shadow-amber-200';
          case 'zinc': return 'from-zinc-500 to-zinc-600 shadow-zinc-200';
          default: return 'from-zinc-500 to-zinc-600';
      }
  };

  const getVerdictIcon = (decision: string) => {
      switch(decision) {
          case 'BUY': 
          case 'SWAP':
          case 'GREAT FIND':
              return <Check size={20} className="text-white" />;
          case 'AVOID':
              return <X size={20} className="text-white" />;
          case 'CAUTION':
          case 'PASS':
          case 'CONSIDER':
              return <AlertTriangle size={20} className="text-white" />;
          default:
              return <Check size={20} className="text-white" />;
      }
  };

  const renderActionPlan = () => {
      const { analysis } = shelfIQ;
      const hasActions = analysis.riskyProducts.length > 0 || analysis.conflicts.length > 0 || analysis.missing.length > 0 || analysis.redundancies.length > 0 || analysis.upgrades.length > 0;

      if (!hasActions && products.length > 0) return null;

      return (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-700">
               <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <CheckCircle2 size={14} className="text-teal-500" /> Optimize your routine
               </h3>
               
               {/* 1. DISCONTINUE / REPLACE / CAUTION */}
               {analysis.riskyProducts.map((item, i) => {
                   const isCritical = item.severity === 'CRITICAL';
                   const colorClass = isCritical ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-amber-50 border-amber-100 text-amber-500';
                   const textClass = isCritical ? 'text-rose-800' : 'text-amber-800';
                   const barClass = isCritical ? 'bg-rose-400' : 'bg-amber-400';
                   const descClass = isCritical ? 'text-rose-700' : 'text-amber-700';
                   const title = isCritical ? 'Issue Detected' : 'Caution';

                   return (
                       <div key={`risk-${i}`} className={`flex items-start gap-4 p-4 rounded-[1.5rem] border relative overflow-hidden group ${colorClass}`}>
                           <div className={`absolute left-0 top-0 bottom-0 w-1 ${barClass}`}></div>
                           <div className={`w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border ${isCritical ? 'border-rose-100 text-rose-500' : 'border-amber-100 text-amber-500'} shadow-sm`}>
                               {isCritical ? <Ban size={18} /> : <AlertTriangle size={18} />}
                           </div>
                           <div className="flex-1">
                               <h4 className={`text-xs font-black uppercase tracking-wide mb-1 ${textClass}`}>{title}: {item.name}</h4>
                               <p className={`text-xs font-medium leading-relaxed mb-2 ${descClass}`}>
                                   {item.reason}
                               </p>
                               <button 
                                    onClick={() => {
                                        const p = products.find(prod => prod.name === item.name);
                                        if (p) { setSelectedProduct(p); }
                                    }}
                                    className={`text-[10px] font-bold uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border transition-colors ${isCritical ? 'text-rose-600 border-rose-200 hover:bg-rose-100' : 'text-amber-600 border-amber-200 hover:bg-amber-100'}`}
                               >
                                   View Product
                               </button>
                           </div>
                       </div>
                   )
               })}

               {/* 2. UPGRADES (Replaces missing/bad items) */}
               {analysis.upgrades.map((upgrade, i) => (
                    <div key={`upg-${i}`} className="flex items-start gap-4 p-4 rounded-[1.5rem] bg-indigo-50 border border-indigo-100 relative overflow-hidden">
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-400"></div>
                       <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-indigo-100 text-indigo-500 shadow-sm">
                           <ArrowUpCircle size={18} />
                       </div>
                       <div className="flex-1">
                           <h4 className="text-xs font-black uppercase tracking-wide text-indigo-800 mb-1">Change {upgrade}</h4>
                           <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                               Your current {upgrade.toLowerCase()} has a low match score. Consider switching to a better suited formula.
                           </p>
                       </div>
                   </div>
               ))}

               {/* 3. SCHEDULE / CONFLICTS */}
               {analysis.conflicts.map((conflict, i) => (
                   <div key={`conflict-${i}`} className="flex items-start gap-4 p-4 rounded-[1.5rem] bg-orange-50 border border-orange-100 relative overflow-hidden">
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-400"></div>
                       <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-orange-100 text-orange-500 shadow-sm">
                           <Clock size={18} />
                       </div>
                       <div className="flex-1">
                           <h4 className="text-xs font-black uppercase tracking-wide text-orange-800 mb-1">Adjust Routine</h4>
                           <p className="text-xs text-orange-700 font-medium leading-relaxed">
                               {conflict}. Use these products at different times of day (AM vs PM) or alternate nights.
                           </p>
                       </div>
                   </div>
               ))}

                {/* 4. SIMPLIFY / REDUNDANCIES */}
                {analysis.redundancies.map((red, i) => (
                   <div key={`red-${i}`} className="flex items-start gap-4 p-4 rounded-[1.5rem] bg-amber-50 border border-amber-100 relative overflow-hidden">
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                       <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-amber-100 text-amber-500 shadow-sm">
                           <ArrowRightLeft size={18} />
                       </div>
                       <div className="flex-1">
                           <h4 className="text-xs font-black uppercase tracking-wide text-amber-800 mb-1">Simplify Steps</h4>
                           <p className="text-xs text-amber-700 font-medium leading-relaxed">
                               {red}. Choose the formula with the highest match score and store the other to avoid barrier damage.
                           </p>
                       </div>
                   </div>
               ))}

               {/* 5. ADD / MISSING */}
               {analysis.missing.map((missing, i) => (
                   <div key={`miss-${i}`} className="flex items-start gap-4 p-4 rounded-[1.5rem] bg-teal-50 border border-teal-100 relative overflow-hidden">
                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-400"></div>
                       <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 border border-teal-100 text-teal-500 shadow-sm">
                           <Plus size={18} />
                       </div>
                       <div className="flex-1">
                           <h4 className="text-xs font-black uppercase tracking-wide text-teal-800 mb-1">Add {missing}</h4>
                           <p className="text-xs text-teal-700 font-medium leading-relaxed">
                               Your routine lacks a {missing.toLowerCase()}. Adding this step will improve your overall efficacy score.
                           </p>
                       </div>
                   </div>
               ))}
          </div>
      )
  };

  const renderDashboard = () => {
      const { analysis } = shelfIQ;
      
      if (products.length === 0) {
           return (
               <div className="modern-card rounded-[2rem] p-8 text-center border border-dashed border-zinc-200 shadow-none">
                   <p className="text-sm font-medium text-zinc-400">Your digital shelf is empty. Scan products to get AI insights.</p>
               </div>
           );
      }

      return (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
               {/* ROUTINE DNA MATRIX */}
               <div className="bg-white border border-zinc-100 rounded-[2rem] p-6 shadow-sm">
                   <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Dna size={12} className="text-teal-500" /> Routine DNA
                   </h3>
                   <div className="space-y-4">
                        {[
                            { label: 'Exfoliation', val: analysis.balance.exfoliation, color: 'bg-rose-400' },
                            { label: 'Hydration', val: analysis.balance.hydration, color: 'bg-sky-400' },
                            { label: 'Protection', val: analysis.balance.protection, color: 'bg-amber-400' },
                            { label: 'Actives', val: analysis.balance.treatment, color: 'bg-emerald-400' }
                        ].map((stat, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1.5">
                                    <span>{stat.label}</span>
                                    <span>{stat.val > 100 ? 'High' : stat.val > 40 ? 'Optimal' : 'Low'}</span>
                                </div>
                                <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full ${stat.color} transition-all duration-1000`} 
                                        style={{ width: `${Math.min(100, stat.val)}%` }} 
                                    />
                                </div>
                            </div>
                        ))}
                   </div>
               </div>
               
               {/* COST ANALYSIS CARD */}
               <div className="modern-card rounded-[2rem] p-6 relative overflow-hidden">
                   <div className="flex justify-between items-center mb-6">
                        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                            <DollarSign size={12} className="text-teal-500" /> Cost Efficiency
                        </h3>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5 border ${costAnalysis.verdict.color}`}>
                             <costAnalysis.verdict.icon size={12} />
                             {costAnalysis.verdict.title}
                        </div>
                   </div>
                   
                   <div className="flex items-center gap-6 mb-6">
                       <div className="flex-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block mb-1">Monthly Burn</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xs font-bold text-zinc-500">RM</span>
                                <span className="text-3xl font-black text-zinc-900 tracking-tight">{costAnalysis.monthlyCost}</span>
                            </div>
                       </div>
                       <div className="w-px h-10 bg-zinc-100"></div>
                       <div className="flex-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide block mb-1">Skin Match</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-zinc-900 tracking-tight">{costAnalysis.avgSuitability}</span>
                                <span className="text-xs font-bold text-zinc-500">%</span>
                            </div>
                       </div>
                   </div>
                   
                   <p className="text-xs text-zinc-500 font-medium mb-6 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                       {costAnalysis.verdict.desc}
                   </p>
                   
                   <div className="flex gap-4 pt-4 border-t border-zinc-100">
                        <div>
                             <span className="block text-xs font-bold text-zinc-900">RM {costAnalysis.totalValue}</span>
                             <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Total Inventory</span>
                        </div>
                        <div>
                             <span className="block text-xs font-bold text-zinc-900">{products.length} Items</span>
                             <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Routine Size</span>
                        </div>
                   </div>
               </div>
          </div>
      )
  };

  return (
    <div className="pb-32 animate-in fade-in duration-500">
       <div className="px-6 space-y-8">
          <div className="flex justify-between items-end pt-6">
              <div>
                  <h2 className="text-3xl font-black text-zinc-900 tracking-tight">Digital Shelf</h2>
                  <p className="text-zinc-400 font-medium text-sm mt-1">AI-Optimized Inventory.</p>
              </div>
              <button onClick={onScanNew} className="w-14 h-14 rounded-[1.2rem] bg-teal-600 text-white flex items-center justify-center shadow-xl shadow-teal-200 hover:scale-105 transition-transform active:scale-95">
                  <Plus size={24} />
              </button>
          </div>

          {/* MAIN SCORE CARD */}
          <div className="modern-card rounded-[2.5rem] p-8 relative">
             {/* Background Watermark Container - Clip this instead */}
             <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none">
                 <div className="absolute top-0 right-0 p-8 opacity-10">
                     <span className={`text-9xl font-black ${getGradeColor(shelfIQ.analysis.grade).split(' ')[0]}`}>
                         {shelfIQ.analysis.grade}
                     </span>
                 </div>
             </div>

             <div className="relative z-10 flex items-start justify-between">
                 <div>
                     <div className="flex items-center mb-1">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Routine Grade</h3>
                        <GradingInfo />
                     </div>
                     <div className="flex items-baseline gap-2">
                         <span className={`text-5xl font-black ${getGradeColor(shelfIQ.analysis.grade).split(' ')[0]}`}>
                             {shelfIQ.analysis.grade}
                         </span>
                     </div>
                     <p className="text-xs font-medium text-zinc-500 mt-2 max-w-[180px] leading-relaxed">
                         {shelfIQ.analysis.grade === 'S' ? "Clinical perfection. High efficiency & safety." :
                          shelfIQ.analysis.grade === 'A' ? "Excellent. Covers all essential bases." :
                          shelfIQ.analysis.grade === 'B' ? "Good start, but missing some key steps." :
                          "Optimization required for safety/efficacy."}
                     </p>
                 </div>
                 
                 {/* Mini Stats Column */}
                 <div className="text-right space-y-3 pt-1">
                     <div>
                         <span className="block text-xl font-bold text-zinc-900">{products.length}</span>
                         <span className="text-[9px] font-bold text-zinc-400 uppercase">Items</span>
                     </div>
                     <div>
                         <span className={`block text-xl font-bold ${shelfIQ.analysis.conflicts.length > 0 ? 'text-amber-500' : 'text-zinc-900'}`}>{shelfIQ.analysis.conflicts.length}</span>
                         <span className="text-[9px] font-bold text-zinc-400 uppercase">Conflicts</span>
                     </div>
                 </div>
             </div>
          </div>

          {/* OPTIMIZATION PLAN (Moved directly under routine grade) */}
          {renderActionPlan()}

          {/* DASHBOARD CHARTS */}
          {renderDashboard()}
       </div>

       {/* TABS FOR ROUTINE VS VANITY */}
       <div className="px-6 mt-10">
           <div className="flex bg-zinc-100/50 p-1 rounded-2xl mb-6 border border-zinc-100">
               <button 
                  onClick={() => setActiveTab('ROUTINE')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'ROUTINE' ? 'bg-white shadow-sm text-teal-700' : 'text-zinc-400 hover:text-zinc-600'}`}
               >
                  Skincare
               </button>
               <button 
                  onClick={() => setActiveTab('VANITY')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'VANITY' ? 'bg-white shadow-sm text-teal-700' : 'text-zinc-400 hover:text-zinc-600'}`}
               >
                  Vanity
               </button>
           </div>
       </div>

       {/* PRODUCT LIST */}
       <div className="px-6 grid grid-cols-2 gap-4">
           {filteredProducts.map((p) => {
               const audit = auditProduct(p, userProfile);
               const warning = audit.warnings.length > 0;
               const critical = audit.warnings.some(w => w.severity === 'CRITICAL');
               const caution = audit.warnings.some(w => w.severity === 'CAUTION') && !critical;
               
               const score = Number(audit.adjustedScore);
               // New logic: Only consider it "Low Score" if below 50. 50-70 is passable.
               const isLowScore = score < 50; 
               
               const isConflict = shelfIQ.analysis.conflicts.some(c => c.toLowerCase().includes(p.ingredients[0]?.toLowerCase()) || p.ingredients.some(i => c.toLowerCase().includes(i.toLowerCase())));

               return (
                   <button 
                        key={p.id} 
                        onClick={() => setSelectedProduct(p)}
                        className="modern-card rounded-[2rem] p-5 text-left relative group flex flex-col items-start min-h-[180px] hover:border-teal-100 transition-colors"
                   >
                        <div className={`absolute top-5 right-5 w-2 h-2 rounded-full ${caution ? 'bg-amber-500' : critical ? 'bg-rose-500' : isLowScore ? 'bg-rose-400' : 'bg-emerald-400'}`} />

                        <div className={`w-14 h-14 rounded-2xl ${getProductColor(p.type)} flex items-center justify-center mb-5`}>
                            {getProductIcon(p.type)}
                        </div>

                        <div className="flex-1 w-full">
                            <h3 className="font-bold text-sm text-zinc-900 leading-tight mb-1 line-clamp-2">{p.name}</h3>
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wide truncate max-w-[70px]">{p.brand || 'Unknown'}</p>
                                <span className="text-[10px] font-bold text-zinc-300">RM {p.estimatedPrice || 45}</span>
                            </div>
                        </div>

                        <div className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wide ${
                            caution ? 'bg-amber-50 text-amber-700' :
                            critical ? 'bg-rose-50 text-rose-700' : 
                            isLowScore ? 'bg-rose-50 text-rose-700' :
                            'bg-emerald-50 text-emerald-700'
                        }`}>
                            {caution ? (
                                <>
                                    <AlertTriangle size={12} className="mr-1.5" />
                                    CAUTION
                                </>
                            ) : critical ? (
                                <>
                                    <Ban size={12} className="mr-1.5" />
                                    AVOID
                                </>
                            ) : isConflict ? (
                                <>
                                    <Clock size={12} className="mr-1.5" />
                                    SCHEDULE
                                </>
                            ) : (
                                `${score}% MATCH`
                            )}
                        </div>
                   </button>
               )
           })}

           <button onClick={onScanNew} className="rounded-[2rem] border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-3 min-h-[180px] text-zinc-400 hover:bg-zinc-50 hover:border-zinc-300 transition-all group">
               <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                   <Plus size={24} />
               </div>
               <span className="text-[10px] font-bold uppercase tracking-widest">Check New Match</span>
           </button>
       </div>
       
       {activeTab === 'VANITY' && filteredProducts.length === 0 && (
           <div className="px-6 mt-4 text-center">
               <p className="text-zinc-400 text-sm font-medium">No cosmetics found. Scan foundation, powder, or primer to check compatibility.</p>
           </div>
       )}

       {/* PRODUCT DETAIL MODAL - REDESIGNED */}
       {selectedProduct && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-zinc-900/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="w-full max-w-md bg-zinc-50 rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[90vh] sm:h-auto sm:max-h-[90vh] relative shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
                    
                    {/* Header Section */}
                    <div className="bg-white px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm z-10 shrink-0 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-100 rounded-full -mr-10 -mt-10 opacity-50"></div>
                        
                        <button onClick={() => { setSelectedProduct(null); setIsEditingPrice(false); }} className="absolute top-6 left-6 p-2 bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors z-10">
                            <X size={20} />
                        </button>
                        
                        <div className="flex flex-col items-center text-center relative z-10 mt-2">
                             <div className={`w-16 h-16 rounded-2xl ${getProductColor(selectedProduct.type)} flex items-center justify-center mb-4 shadow-lg border border-white/50`}>
                                 {getProductIcon(selectedProduct.type)}
                             </div>
                             <h2 className="text-xl font-black text-zinc-900 leading-tight mb-1 max-w-xs">{selectedProduct.name}</h2>
                             <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{selectedProduct.brand || 'Unknown Brand'}</p>
                             
                             {/* PRICE EDITOR */}
                             <div className="mt-3 flex items-center justify-center gap-2">
                                {isEditingPrice ? (
                                    <div className="flex items-center gap-2 animate-in fade-in">
                                        <span className="text-sm font-bold text-zinc-500">RM</span>
                                        <input 
                                            type="number" 
                                            value={tempPrice}
                                            onChange={(e) => setTempPrice(e.target.value)}
                                            className="w-20 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:border-teal-500"
                                            autoFocus
                                        />
                                        <button onClick={handleSavePrice} className="p-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                                            <Save size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => handleStartEditPrice(selectedProduct)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200 transition-colors group"
                                    >
                                        <DollarSign size={10} />
                                        <span className="text-[10px] font-bold text-zinc-700">RM {selectedProduct.estimatedPrice || 45}</span>
                                        <Edit2 size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-safe">
                        {(() => {
                            const decision = getBuyingDecision(selectedProduct, products, userProfile);
                            const { verdict, audit } = decision;
                            
                            // Context Check (existing logic)
                            const otherProducts = products.filter(p => p.id !== selectedProduct.id);
                            const context = analyzeProductContext(selectedProduct, otherProducts);
                            const conflicts = context.conflicts;
                            const redundancy = context.typeCount;

                            return (
                                <>
                                    {/* VERDICT CARD */}
                                    <div className={`rounded-[2rem] p-5 text-white shadow-xl bg-gradient-to-br ${getVerdictGradient(verdict.color)} relative overflow-hidden`}>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none"></div>
                                        
                                        <div className="flex items-center gap-4 relative z-10">
                                            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shrink-0 shadow-sm">
                                                {getVerdictIcon(verdict.decision)}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-0.5 opacity-90">
                                                    <Zap size={10} className="fill-current" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest">Analysis</span>
                                                </div>
                                                <h2 className="text-xl font-black tracking-tight leading-none truncate">{verdict.title}</h2>
                                            </div>

                                            <div className="text-right bg-black/10 px-3 py-2 rounded-xl border border-white/10 backdrop-blur-sm">
                                                <span className="block text-[9px] font-bold uppercase tracking-wide opacity-80 mb-0.5">Match</span>
                                                <span className="text-xl font-black leading-none">{selectedProduct.suitabilityScore}%</span>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-white/10 relative z-10">
                                            <p className="text-xs font-medium leading-relaxed opacity-95">
                                                {verdict.description}
                                            </p>
                                        </div>
                                    </div>

                                    {/* CRITICAL ALERTS */}
                                    {audit.warnings.length > 0 && (
                                        <div className="bg-white p-5 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <AlertOctagon size={14} className="text-rose-500" /> Risk Analysis
                                            </h3>
                                            <div className="space-y-3">
                                                {audit.warnings.map((w, i) => (
                                                    <div key={i} className={`flex gap-3 p-3 rounded-xl border ${w.severity === 'CRITICAL' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
                                                        <div className="mt-0.5">
                                                            {w.severity === 'CRITICAL' ? <AlertOctagon size={16} className="text-rose-500" /> : <AlertTriangle size={16} className="text-amber-500" />}
                                                        </div>
                                                        <div>
                                                            <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded mb-1 inline-block ${w.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {w.severity}
                                                            </span>
                                                            <p className={`text-xs font-medium leading-snug ${w.severity === 'CRITICAL' ? 'text-rose-800' : 'text-amber-800'}`}>
                                                                {w.reason}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* CONFLICTS */}
                                    {conflicts.length > 0 && (
                                        <div className="bg-white p-5 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <Clock size={14} className="text-indigo-500" /> Routine Conflicts
                                            </h3>
                                            <div className="space-y-2">
                                                {conflicts.map((c, i) => (
                                                    <div key={i} className="flex gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                                                        <AlertTriangle size={16} className="text-indigo-500 mt-0.5" />
                                                        <p className="text-xs font-medium text-indigo-800 leading-snug">{c}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* REDUNDANCY */}
                                    {redundancy > 0 && conflicts.length === 0 && (
                                         <div className="bg-white p-5 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                            <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <ArrowRightLeft size={14} /> Duplicate Type
                                            </h3>
                                            <p className="text-xs text-amber-800 font-medium leading-relaxed bg-amber-50 p-3 rounded-xl border border-amber-100">
                                                You have {redundancy} other {selectedProduct.type.toLowerCase()}{redundancy > 1 ? 's' : ''} in your routine.
                                            </p>
                                        </div>
                                    )}

                                    {/* BENEFITS */}
                                    {selectedProduct.benefits.length > 0 && (
                                        <div className="bg-white p-5 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <ShieldCheck size={14} className="text-teal-500" /> Key Benefits
                                            </h3>
                                            <div className="space-y-3">
                                                {selectedProduct.benefits.slice(0, 3).map((b, i) => {
                                                    const val = userProfile.biometrics[b.target];
                                                    const metricScore = typeof val === 'number' ? val : 0;
                                                    const isTargeted = metricScore < 60;
                                                    
                                                    return (
                                                        <div key={i} className="flex gap-3 items-start">
                                                            <div className={`mt-0.5 ${isTargeted ? 'text-teal-500' : 'text-zinc-400'}`}>
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

                                    {/* INGREDIENTS */}
                                    <div>
                                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 px-1">Active Ingredients</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedProduct.ingredients.slice(0, 10).map((ing, i) => (
                                                <span key={i} className="px-3 py-1.5 bg-white text-zinc-600 text-[10px] font-bold rounded-lg uppercase border border-zinc-100">
                                                    {ing}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="h-4"></div>

                                    {/* REMOVE BUTTON */}
                                    <button 
                                        onClick={() => {
                                            onRemoveProduct(selectedProduct.id);
                                            setSelectedProduct(null);
                                        }}
                                        className="w-full py-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 text-rose-500 font-bold text-xs uppercase hover:bg-rose-100 transition-colors"
                                    >
                                        Remove from Shelf
                                    </button>
                                </>
                            );
                        })()}
                    </div>
                </div>
           </div>
       )}
    </div>
  );
};

export default SmartShelf;