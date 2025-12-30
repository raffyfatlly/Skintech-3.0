
import React, { useState, useMemo } from 'react';
import { Product, UserProfile, SkinMetrics } from '../types';
import { Plus, Droplet, Sun, Zap, Sparkles, AlertTriangle, Layers, AlertOctagon, Target, ShieldCheck, X, FlaskConical, Clock, Ban, ArrowRightLeft, CheckCircle2, Microscope, Dna, Palette, Brush, SprayCan, Stamp, DollarSign, TrendingUp, TrendingDown, Wallet, ArrowUpRight, Edit2, Save, Info, ArrowUpCircle, Check, Award, Heart, ShoppingBag, ArrowRight } from 'lucide-react';
import { auditProduct, analyzeShelfHealth, analyzeProductContext, getBuyingDecision } from '../services/geminiService';

interface SmartShelfProps {
  products: Product[];
  onRemoveProduct: (id: string) => void;
  onScanNew: () => void;
  onUpdateProduct: (product: Product) => void;
  userProfile: UserProfile;
  onMoveToShelf?: (product: Product) => void;
  onRemoveFromWishlist?: (id: string) => void;
  onOpenRoutineBuilder?: () => void;
}

const SmartShelf: React.FC<SmartShelfProps> = ({ products, onRemoveProduct, onScanNew, onUpdateProduct, userProfile, onMoveToShelf, onRemoveFromWishlist, onOpenRoutineBuilder }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ROUTINE' | 'WISHLIST'>('ROUTINE');
  const [showGradingInfo, setShowGradingInfo] = useState(false); 
  
  // Price Editing State
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>('');

  const shelfIQ = useMemo(() => analyzeShelfHealth(products, userProfile), [products, userProfile]);

  const displayedProducts = useMemo(() => {
      if (activeTab === 'ROUTINE') {
          return products;
      } else {
          return userProfile.wishlist || [];
      }
  }, [products, activeTab, userProfile.wishlist]);

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
          if (p.type === 'SPF') durationMonths = 1.5;
          else if (p.type === 'SERUM' || p.type === 'TREATMENT') durationMonths = 2;
          else if (p.type === 'CLEANSER' || p.type === 'TONER') durationMonths = 3;
          else if (p.type === 'MOISTURIZER') durationMonths = 2.5;

          monthlyCost += price / durationMonths;
          
          const audit = auditProduct(p, userProfile);
          totalSuitability += audit.adjustedScore;
          count++;
      });
      
      const avgSuitability = count > 0 ? totalSuitability / count : 0;

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
          default: return 'bg-zinc-50 text-zinc-600';
      }
  }

  const getProductIcon = (type: string) => {
      switch(type) {
          case 'CLEANSER': return <Droplet size={20} />;
          case 'SPF': return <Sun size={20} />;
          case 'SERUM': return <Zap size={20} />;
          case 'FOUNDATION': return <Palette size={20} />;
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

  const renderActionPlan = () => {
      if (activeTab === 'WISHLIST') return null;
      
      const { analysis } = shelfIQ;
      const hasActions = analysis.riskyProducts.length > 0 || analysis.conflicts.length > 0 || analysis.missing.length > 0 || analysis.upgrades.length > 0;

      if (!hasActions && products.length > 0) return null;

      return (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-700">
               <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <CheckCircle2 size={14} className="text-teal-500" /> Optimize your routine
               </h3>
               
               {analysis.riskyProducts.map((item, i) => (
                   <div key={`risk-${i}`} className={`flex items-start gap-4 p-4 rounded-[1.5rem] border relative overflow-hidden group ${item.severity === 'CRITICAL' ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-amber-50 border-amber-100 text-amber-500'}`}>
                       <div className="flex-1">
                           <h4 className="text-xs font-black uppercase tracking-wide mb-1">Issue: {item.name}</h4>
                           <p className="text-xs font-medium leading-relaxed mb-2">{item.reason}</p>
                       </div>
                   </div>
               ))}

               {analysis.missing.map((missing, i) => (
                   <div key={`miss-${i}`} className="flex items-start gap-4 p-4 rounded-[1.5rem] bg-teal-50 border border-teal-100 relative overflow-hidden">
                       <div className="flex-1">
                           <h4 className="text-xs font-black uppercase tracking-wide text-teal-800 mb-1">Add {missing}</h4>
                           <p className="text-xs text-teal-700 font-medium leading-relaxed">
                               Your routine lacks a {missing.toLowerCase()}. Adding this will improve your score.
                           </p>
                       </div>
                   </div>
               ))}
          </div>
      )
  };

  const renderDashboard = () => {
      if (activeTab === 'WISHLIST') return null;
      if (products.length === 0) {
           return (
               <div className="modern-card rounded-[2rem] p-8 text-center border border-dashed border-zinc-200 shadow-none">
                   <p className="text-sm font-medium text-zinc-400">Your digital shelf is empty. Scan products to get AI insights.</p>
               </div>
           );
      }

      return (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
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

          {activeTab === 'ROUTINE' && (
            <div className="modern-card rounded-[2.5rem] p-8 relative">
                <div className="relative z-10 flex items-start justify-between">
                    <div>
                        <div className="flex items-center mb-1">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Routine Grade</h3>
                            <button onClick={() => setShowGradingInfo(true)} className="ml-1.5 text-zinc-300 hover:text-teal-600 transition-colors"><Info size={14} /></button>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-5xl font-black ${getGradeColor(shelfIQ.analysis.grade).split(' ')[0]}`}>
                                {shelfIQ.analysis.grade}
                            </span>
                        </div>
                    </div>
                    
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
          )}

          {renderActionPlan()}
          {renderDashboard()}
       </div>

       {/* TABS */}
       <div className="px-6 mt-10">
           <div className="flex bg-zinc-100/50 p-1 rounded-2xl mb-6 border border-zinc-100">
               <button 
                  onClick={() => setActiveTab('ROUTINE')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${activeTab === 'ROUTINE' ? 'bg-white shadow-sm text-teal-700' : 'text-zinc-400 hover:text-zinc-600'}`}
               >
                  My Routine
               </button>
               <button 
                  onClick={() => setActiveTab('WISHLIST')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${activeTab === 'WISHLIST' ? 'bg-white shadow-sm text-teal-700' : 'text-zinc-400 hover:text-zinc-600'}`}
               >
                  <Heart size={14} className={activeTab === 'WISHLIST' ? "fill-teal-700" : ""} /> Wishlist
               </button>
           </div>
       </div>

       {/* PRODUCT LIST */}
       <div className="px-6 grid grid-cols-2 gap-4">
           {displayedProducts.map((p) => {
               const audit = auditProduct(p, userProfile);
               const warning = audit.warnings.length > 0;
               const score = Number(audit.adjustedScore);
               
               return (
                   <button 
                        key={p.id} 
                        onClick={() => setSelectedProduct(p)}
                        className="modern-card rounded-[2rem] p-5 text-left relative group flex flex-col items-start min-h-[180px] hover:border-teal-100 transition-colors bg-white"
                   >
                        <div className={`absolute top-5 right-5 w-2 h-2 rounded-full ${score > 70 ? 'bg-emerald-400' : 'bg-amber-400'}`} />

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

                        <div className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wide ${score > 70 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {score}% MATCH
                        </div>
                   </button>
               )
           })}

           {activeTab === 'ROUTINE' && (
               <button onClick={onScanNew} className="rounded-[2rem] border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-3 min-h-[180px] text-zinc-400 hover:bg-zinc-50 hover:border-zinc-300 transition-all group">
                   <div className="w-12 h-12 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                       <Plus size={24} />
                   </div>
                   <span className="text-[10px] font-bold uppercase tracking-widest">Check New Match</span>
               </button>
           )}
       </div>
       
       {activeTab === 'WISHLIST' && displayedProducts.length === 0 && (
           <div className="px-6 py-12 text-center flex flex-col items-center">
               <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4 text-zinc-300">
                   <ShoppingBag size={24} />
               </div>
               <h3 className="text-zinc-900 font-bold mb-1">Your wishlist is empty</h3>
               <p className="text-zinc-400 text-xs font-medium max-w-[200px] mb-6">Use the Routine Architect to find products recommended for your skin.</p>
               <button 
                   onClick={onOpenRoutineBuilder || onScanNew} 
                   className="px-6 py-3 bg-zinc-900 text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-lg"
               >
                   Find Products
               </button>
           </div>
       )}

       {/* GRADING INFO MODAL */}
       {showGradingInfo && (
            <div 
                className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200" 
                onClick={(e) => { e.stopPropagation(); setShowGradingInfo(false); }}
            >
                <div 
                    className="w-full max-w-xs bg-white rounded-[2rem] p-6 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white/50" 
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowGradingInfo(false); }} 
                        className="absolute top-4 right-4 p-3 bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 transition-colors z-50 cursor-pointer"
                    >
                        <X size={18} />
                    </button>

                    <div className="text-center mb-6 pt-2">
                        <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-teal-600 shadow-sm border border-teal-100">
                            <Award size={24} />
                        </div>
                        <h3 className="text-lg font-black text-zinc-900 tracking-tight">Routine Grading</h3>
                        <p className="text-xs text-zinc-500 font-medium mt-1">AI evaluation of your shelf efficacy.</p>
                    </div>

                    <div className="space-y-3">
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
                    </div>
                </div>
            </div>
       )}

       {/* PRODUCT DETAIL MODAL */}
       {selectedProduct && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-zinc-900/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="w-full max-w-md bg-zinc-50 rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[90vh] sm:h-auto sm:max-h-[90vh] relative shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
                    
                    <div className="bg-white px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm z-10 shrink-0 relative overflow-hidden">
                        <button onClick={() => { setSelectedProduct(null); setIsEditingPrice(false); }} className="absolute top-6 left-6 p-2 bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors z-10">
                            <X size={20} />
                        </button>
                        
                        <div className="flex flex-col items-center text-center relative z-10 mt-2">
                             <div className={`w-16 h-16 rounded-2xl ${getProductColor(selectedProduct.type)} flex items-center justify-center mb-4 shadow-lg border border-white/50`}>
                                 {getProductIcon(selectedProduct.type)}
                             </div>
                             <h2 className="text-xl font-black text-zinc-900 leading-tight mb-1 max-w-xs">{selectedProduct.name}</h2>
                             <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{selectedProduct.brand || 'Unknown Brand'}</p>
                             
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

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-safe">
                        {/* Benefits Section */}
                        {selectedProduct.benefits.length > 0 && (
                            <div className="bg-white p-5 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-teal-500" /> Key Benefits
                                </h3>
                                <div className="space-y-3">
                                    {selectedProduct.benefits.slice(0, 3).map((b, i) => (
                                        <div key={i} className="flex gap-3 items-start">
                                            <div className="mt-0.5 text-zinc-400">
                                                <Check size={16} strokeWidth={3} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-sm font-bold text-zinc-900">{b.ingredient}</span>
                                                </div>
                                                <p className="text-xs text-zinc-500 font-medium leading-snug">{b.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="h-4"></div>

                        {/* ACTIONS */}
                        {activeTab === 'WISHLIST' ? (
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => {
                                        if(onRemoveFromWishlist) onRemoveFromWishlist(selectedProduct.id);
                                        setSelectedProduct(null);
                                    }}
                                    className="flex-1 py-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 text-rose-500 font-bold text-xs uppercase hover:bg-rose-100 transition-colors"
                                >
                                    Delete
                                </button>
                                <button 
                                    onClick={() => {
                                        if(onMoveToShelf) onMoveToShelf(selectedProduct);
                                        setSelectedProduct(null);
                                    }}
                                    className="flex-[2] py-4 rounded-[1.5rem] bg-teal-600 text-white font-bold text-xs uppercase hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    Add to Routine <ArrowRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => {
                                    onRemoveProduct(selectedProduct.id);
                                    setSelectedProduct(null);
                                }}
                                className="w-full py-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 text-rose-500 font-bold text-xs uppercase hover:bg-rose-100 transition-colors"
                            >
                                Remove from Shelf
                            </button>
                        )}
                    </div>
                </div>
           </div>
       )}
    </div>
  );
};

export default SmartShelf;
