
import React, { useState, useMemo } from 'react';
import { Product, UserProfile } from '../types';
import { Plus, Droplet, Sun, Zap, Sparkles, Palette, DollarSign, Wallet, Edit2, Save, Info, Award, Heart, ShoppingBag, ArrowRight, Lightbulb, Clock, RefreshCw, Layers } from 'lucide-react';
import { auditProduct, analyzeShelfHealth } from '../services/geminiService';

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
      });
      return { totalValue: Math.round(totalValue), monthlyCost: Math.round(monthlyCost) };
  }, [products]);

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
          case 'S': return 'text-emerald-500';
          case 'A': return 'text-teal-500';
          case 'B': return 'text-sky-500';
          case 'C': return 'text-amber-500';
          default: return 'text-rose-500';
      }
  }

  const renderRoutineCoach = () => {
      if (activeTab === 'WISHLIST') return null;
      
      const { analysis } = shelfIQ;
      const hasNotes = analysis.notes.length > 0;
      const hasMissing = analysis.missing.length > 0;

      if (!hasNotes && !hasMissing && products.length > 0) return null;

      return (
          <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-700">
               <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2 px-1">
                    <Lightbulb size={14} className="text-teal-500" /> SkinOS Notes
               </h3>
               
               {analysis.notes.map((item: any, i: number) => (
                   <div key={`note-${i}`} className="flex items-start gap-4 p-4 rounded-3xl bg-white border border-zinc-100 shadow-sm relative overflow-hidden group">
                       <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.type === 'TIMING' ? 'bg-indigo-50 text-indigo-500' : item.type === 'SWAP' ? 'bg-amber-50 text-amber-500' : 'bg-zinc-50 text-zinc-500'}`}>
                           {item.type === 'TIMING' ? <Clock size={16} /> : item.type === 'SWAP' ? <RefreshCw size={16} /> : <Info size={16} />}
                       </div>
                       <div className="flex-1">
                           <h4 className="text-xs font-bold text-zinc-900 mb-0.5">{item.product}</h4>
                           <p className="text-xs text-zinc-500 font-medium leading-relaxed">{item.note}</p>
                       </div>
                   </div>
               ))}

               {analysis.missing.map((missing: string, i: number) => (
                   <div key={`miss-${i}`} className="flex items-center gap-4 p-4 rounded-3xl bg-teal-50 border border-teal-100 relative overflow-hidden">
                       <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-teal-600 shrink-0 shadow-sm">
                           <Plus size={16} />
                       </div>
                       <div className="flex-1">
                           <h4 className="text-xs font-bold text-teal-800 mb-0.5">Missing Step</h4>
                           <p className="text-xs text-teal-700 font-medium">
                               Add a <strong>{missing}</strong> to complete your base routine.
                           </p>
                       </div>
                   </div>
               ))}
          </div>
      )
  };

  return (
    <div className="pb-32 animate-in fade-in duration-500 max-w-7xl mx-auto flex flex-col min-h-screen">
       <div className="px-6 space-y-8 flex-1">
          <div className="flex justify-between items-end pt-6">
              <div>
                  <h2 className="text-3xl font-black text-zinc-900 tracking-tight">Smart Shelf</h2>
                  <p className="text-zinc-400 font-medium text-sm mt-1">Your Digital Cabinet.</p>
              </div>
              <button onClick={onScanNew} className="w-14 h-14 rounded-[1.2rem] bg-teal-600 text-white flex items-center justify-center shadow-xl shadow-teal-200 hover:scale-105 transition-transform active:scale-95">
                  <Plus size={24} />
              </button>
          </div>

          {activeTab === 'ROUTINE' && (
            <div className="bg-white rounded-[2.5rem] p-8 relative shadow-xl shadow-zinc-100 border border-zinc-50 overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-teal-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-50 pointer-events-none"></div>
                
                <div className="relative z-10 flex items-center gap-6">
                    <div className="flex flex-col items-center">
                        <div className="flex items-baseline gap-1">
                            <span className={`text-6xl font-black tracking-tighter ${getGradeColor(shelfIQ.analysis.grade)}`}>
                                {shelfIQ.analysis.grade}
                            </span>
                        </div>
                        <button onClick={() => setShowGradingInfo(true)} className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1 hover:text-zinc-600 transition-colors">
                            Grade <Info size={10} />
                        </button>
                    </div>
                    
                    <div className="flex-1 border-l border-zinc-100 pl-6">
                        <h3 className="text-sm font-bold text-zinc-900 mb-1">{shelfIQ.analysis.headline}</h3>
                        <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                            {shelfIQ.analysis.averageScore > 0 
                                ? `Average match score: ${shelfIQ.analysis.averageScore}%. ${products.length} products active.` 
                                : "Start scanning to analyze your routine."}
                        </p>
                    </div>
                </div>
            </div>
          )}

          {renderRoutineCoach()}
          
          {/* VISUAL SPEND TRACKER */}
          {activeTab === 'ROUTINE' && products.length > 0 && (
              <div className="bg-zinc-50 rounded-3xl p-5 border border-zinc-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-zinc-400 shadow-sm">
                          <Wallet size={18} />
                      </div>
                      <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Est. Monthly</span>
                          <span className="text-sm font-black text-zinc-700">RM {costAnalysis.monthlyCost}</span>
                      </div>
                  </div>
                  <div className="h-8 w-px bg-zinc-200"></div>
                  <div className="pr-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block text-right">Items</span>
                      <span className="text-sm font-black text-zinc-700 block text-right">{products.length}</span>
                  </div>
              </div>
          )}
       </div>

       {/* TABS */}
       <div className="px-6 mt-10">
           <div className="flex bg-zinc-100/50 p-1 rounded-2xl mb-6 border border-zinc-100">
               <button 
                  onClick={() => setActiveTab('ROUTINE')}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${activeTab === 'ROUTINE' ? 'bg-white shadow-sm text-teal-700' : 'text-zinc-400 hover:text-zinc-600'}`}
               >
                  <Layers size={14} /> Routine
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
       <div className="px-6 grid grid-cols-1 gap-3 pb-12">
           {displayedProducts.map((p) => {
               const audit = auditProduct(p, userProfile);
               const score = Number(audit.adjustedScore);
               
               return (
                   <button 
                        key={p.id} 
                        onClick={() => setSelectedProduct(p)}
                        className="bg-white rounded-[1.8rem] p-4 text-left border border-zinc-100 shadow-sm hover:shadow-md hover:border-teal-100 transition-all group flex items-center gap-4 relative overflow-hidden"
                   >
                        <div className={`w-16 h-16 rounded-2xl ${getProductColor(p.type)} flex items-center justify-center shrink-0`}>
                            {getProductIcon(p.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm text-zinc-900 leading-tight mb-1 truncate">{p.name}</h3>
                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wide truncate">{p.brand || 'Unknown'}</p>
                        </div>

                        <div className="text-right pr-2">
                            <div className={`text-xl font-black ${score > 80 ? 'text-emerald-500' : score < 60 ? 'text-amber-500' : 'text-teal-500'}`}>
                                {score}%
                            </div>
                            <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">Match</span>
                        </div>
                   </button>
               )
           })}

           {activeTab === 'ROUTINE' && (
               <button onClick={onScanNew} className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[1.8rem] p-6 flex items-center justify-center gap-3 text-zinc-400 hover:bg-white hover:border-zinc-300 transition-all group">
                   <Plus size={20} />
                   <span className="text-xs font-bold uppercase tracking-widest">Add Product</span>
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
                    className="w-full max-w-xs bg-white rounded-[2rem] p-6 shadow-2xl relative animate-in zoom-in-95 duration-300" 
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-center mb-6 pt-2">
                        <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-teal-600 shadow-sm border border-teal-100">
                            <Award size={24} />
                        </div>
                        <h3 className="text-lg font-black text-zinc-900 tracking-tight">Routine Grading</h3>
                        <p className="text-xs text-zinc-500 font-medium mt-1">Based on average product suitability.</p>
                    </div>

                    <div className="space-y-2">
                        {[
                            { grade: 'S', label: 'Perfect', range: '90-100%', color: 'text-emerald-600 bg-emerald-50' },
                            { grade: 'A', label: 'Great', range: '80-89%', color: 'text-teal-600 bg-teal-50' },
                            { grade: 'B', label: 'Good', range: '70-79%', color: 'text-sky-600 bg-sky-50' },
                            { grade: 'C', label: 'Fair', range: '60-69%', color: 'text-amber-600 bg-amber-50' },
                            { grade: 'D', label: 'Weak', range: '< 60%', color: 'text-rose-600 bg-rose-50' },
                        ].map((item) => (
                            <div key={item.grade} className="flex items-center justify-between p-3 rounded-xl border border-zinc-50">
                                <div className="flex items-center gap-3">
                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${item.color}`}>
                                        {item.grade}
                                    </span>
                                    <span className="text-xs font-bold text-zinc-700">{item.label}</span>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-400">{item.range}</span>
                            </div>
                        ))}
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
                            <ArrowRight size={20} className="rotate-180" />
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
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200 transition-colors group"
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
                        {/* Usage Tip (Dynamic "Shelf Mind" Feature) */}
                        <div className="bg-indigo-50 p-5 rounded-[1.5rem] border border-indigo-100">
                            <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Clock size={14} /> Usage Guide
                            </h3>
                            <p className="text-xs text-indigo-800 font-medium leading-relaxed">
                                {selectedProduct.type === 'CLEANSER' ? "Use AM and PM as the first step." : 
                                 selectedProduct.type === 'SPF' ? "Apply generously every morning as the last step." :
                                 selectedProduct.type === 'RETINOL' ? "Use only at night. Do not mix with acids." :
                                 "Apply after cleansing and before heavier creams."}
                            </p>
                        </div>

                        {selectedProduct.benefits.length > 0 && (
                            <div className="bg-white p-5 rounded-[1.5rem] border border-zinc-100 shadow-sm">
                                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Sparkles size={14} className="text-teal-500" /> Why it works
                                </h3>
                                <div className="space-y-3">
                                    {selectedProduct.benefits.slice(0, 3).map((b, i) => (
                                        <div key={i} className="flex gap-3 items-start">
                                            <div className="mt-0.5 text-teal-500">
                                                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5"></div>
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
                                className="w-full py-4 rounded-[1.5rem] border border-zinc-200 bg-white text-zinc-400 font-bold text-xs uppercase hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition-colors"
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
