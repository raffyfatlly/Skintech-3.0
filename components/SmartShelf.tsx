
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, UserProfile } from '../types';
import { Plus, Droplet, Sun, Zap, Sparkles, Palette, DollarSign, Edit2, Save, Award, ShoppingBag, ArrowRight, Lightbulb, Clock, Trash2, RotateCcw } from 'lucide-react';
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

const CARD_WIDTH = 260; // Base width of the cards
const CARD_GAP = 20;    // Gap for layout calculation

const SmartShelf: React.FC<SmartShelfProps> = ({ products, onRemoveProduct, onScanNew, onUpdateProduct, userProfile, onMoveToShelf, onRemoveFromWishlist, onOpenRoutineBuilder }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ROUTINE' | 'WISHLIST'>('ROUTINE');
  const [showGradingInfo, setShowGradingInfo] = useState(false); 
  const [activeIndex, setActiveIndex] = useState(0);
  
  // 3D Scroll State
  const [scrollX, setScrollX] = useState(0);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);
  
  // Price Editing State
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const shelfIQ = useMemo(() => analyzeShelfHealth(products, userProfile), [products, userProfile]);

  const displayedProducts = useMemo(() => {
      if (activeTab === 'ROUTINE') {
          return products;
      } else {
          return userProfile.wishlist || [];
      }
  }, [products, activeTab, userProfile.wishlist]);

  // --- 3D SCROLL LOGIC ---
  useEffect(() => {
      const handleResize = () => setContainerWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const handleScroll = () => {
          // Use requestAnimationFrame for smooth 60fps animation updates
          requestAnimationFrame(() => {
              setScrollX(container.scrollLeft);
              
              // Calculate active index for snapping logic
              const center = container.scrollLeft + (container.clientWidth / 2);
              // We add a spacer at start, so index logic needs to account for half viewport padding
              const firstItemCenter = (container.clientWidth / 2);
              const distanceFromStart = center - firstItemCenter;
              const index = Math.round(distanceFromStart / (CARD_WIDTH + CARD_GAP));
              
              const maxIndex = activeTab === 'ROUTINE' ? displayedProducts.length : displayedProducts.length - 1;
              setActiveIndex(Math.max(0, Math.min(maxIndex, index)));
          });
      };

      container.addEventListener('scroll', handleScroll);
      // Initialize center
      handleScroll();
      
      return () => container.removeEventListener('scroll', handleScroll);
  }, [displayedProducts, activeTab]);

  // Helper to calculate 3D Transform
  const getCardStyle = (index: number) => {
      // Center position of this item in the scrollable track
      const itemCenter = (containerWidth / 2) + (index * (CARD_WIDTH + CARD_GAP));
      // Current center position of the viewport within the track
      const viewCenter = scrollX + (containerWidth / 2);
      
      // Normalized distance (-1 to 1 means adjacent, 0 means centered)
      const distance = (viewCenter - itemCenter) / (CARD_WIDTH + CARD_GAP);
      const absDistance = Math.abs(distance);

      // --- THE 3D FORMULA ---
      // 1. Rotation: Rotate towards center (Clock effect)
      const rotateY = distance * 45; // Max 45deg rotation
      
      // 2. Depth: Push back non-active items
      const translateZ = Math.min(0, -absDistance * 150); // Push back up to 150px
      
      // 3. Overlap: Pull side items closer to center (Cover Flow)
      // When distance is 1 (neighbor), pull in by 60px
      const translateX = distance * -60; 

      // 4. Scale: Subtle shrink for depth perception
      const scale = Math.max(0.85, 1 - (absDistance * 0.15));

      // 5. Opacity: Fade out far items
      const opacity = Math.max(0.4, 1 - (absDistance * 0.4));
      
      // 6. Blur: Blur background items
      const blur = absDistance > 0.5 ? Math.min(4, (absDistance - 0.5) * 5) : 0;

      return {
          transform: `perspective(1200px) translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
          zIndex: 100 - Math.round(absDistance * 10),
          opacity,
          filter: `blur(${blur}px)`,
          transition: 'transform 0.1s linear, opacity 0.1s linear' // Fast transition for scroll sync
      };
  };

  const costAnalysis = useMemo(() => {
      let totalValue = 0;
      let monthlyCost = 0;
      products.forEach(p => {
          const price = p.estimatedPrice || 45; 
          totalValue += price;
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
          case 'CLEANSER': return 'text-sky-500 bg-sky-50 border-sky-100';
          case 'SPF': return 'text-amber-500 bg-amber-50 border-amber-100';
          case 'SERUM': return 'text-teal-500 bg-teal-50 border-teal-100';
          case 'MOISTURIZER': return 'text-rose-500 bg-rose-50 border-rose-100';
          case 'FOUNDATION': return 'text-orange-500 bg-orange-50 border-orange-100';
          default: return 'text-zinc-500 bg-zinc-50 border-zinc-100';
      }
  }

  const getProductIcon = (type: string, size: number = 24) => {
      switch(type) {
          case 'CLEANSER': return <Droplet size={size} strokeWidth={1.5} />;
          case 'SPF': return <Sun size={size} strokeWidth={1.5} />;
          case 'SERUM': return <Zap size={size} strokeWidth={1.5} />;
          case 'FOUNDATION': return <Palette size={size} strokeWidth={1.5} />;
          default: return <Sparkles size={size} strokeWidth={1.5} />;
      }
  }

  const getGradeColor = (grade: string) => {
      switch(grade) {
          case 'S': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
          case 'A': return 'text-teal-600 bg-teal-50 border-teal-200';
          case 'B': return 'text-sky-600 bg-sky-50 border-sky-200';
          case 'C': return 'text-amber-600 bg-amber-50 border-amber-200';
          default: return 'text-rose-600 bg-rose-50 border-rose-200';
      }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans overflow-hidden pb-32 transition-colors duration-1000">
       
       {/* HEADER SECTION */}
       <div className="pt-safe-top px-6 pb-4 z-10 flex justify-between items-start">
          <div>
              <h2 className="text-3xl font-black text-zinc-900 tracking-tighter">Digital Shelf</h2>
              <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-md bg-teal-600 text-white text-[10px] font-bold uppercase tracking-widest shadow-sm">
                      {displayedProducts.length} Items
                  </span>
                  {activeTab === 'ROUTINE' && (
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          RM {costAnalysis.monthlyCost}/mo
                      </span>
                  )}
              </div>
          </div>

          <div className="flex flex-col items-end gap-2">
              {activeTab === 'ROUTINE' && (
                  <button 
                    onClick={() => setShowGradingInfo(true)}
                    className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center border shadow-lg transition-transform active:scale-95 ${getGradeColor(shelfIQ.analysis.grade)}`}
                  >
                      <span className="text-xl font-black leading-none">{shelfIQ.analysis.grade}</span>
                      <span className="text-[8px] font-bold uppercase">Grade</span>
                  </button>
              )}
          </div>
       </div>

       {/* TABS (Floating Capsule) */}
       <div className="px-6 mb-6 z-10">
           <div className="inline-flex bg-white/60 backdrop-blur-md p-1 rounded-full border border-white/40 shadow-sm">
               <button 
                  onClick={() => setActiveTab('ROUTINE')}
                  className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'ROUTINE' ? 'bg-teal-600 text-white shadow-md' : 'text-zinc-500 hover:text-teal-600'}`}
               >
                  My Routine
               </button>
               <button 
                  onClick={() => setActiveTab('WISHLIST')}
                  className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'WISHLIST' ? 'bg-teal-600 text-white shadow-md' : 'text-zinc-500 hover:text-teal-600'}`}
               >
                  Wishlist
               </button>
           </div>
       </div>

       {/* SKINOS NOTES (Interactive HUD) */}
       {activeTab === 'ROUTINE' && (shelfIQ.analysis.notes.length > 0 || shelfIQ.analysis.missing.length > 0) && (
           <div className="px-6 mb-4 z-10 animate-in slide-in-from-top-4 duration-700">
               <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-2xl p-4 shadow-sm flex items-start gap-4">
                   <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                       <Lightbulb size={16} />
                   </div>
                   <div className="flex-1">
                       <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">SkinOS Notes</h3>
                       {shelfIQ.analysis.notes.length > 0 ? (
                           <p className="text-xs font-bold text-zinc-700 leading-snug">
                               {shelfIQ.analysis.notes[0].note}
                           </p>
                       ) : (
                           <p className="text-xs font-bold text-zinc-700 leading-snug">
                               Missing steps: {shelfIQ.analysis.missing.join(', ')}.
                           </p>
                       )}
                   </div>
               </div>
           </div>
       )}

       {/* 3D IMMERSIVE CAROUSEL */}
       <div className="flex-1 flex flex-col justify-center relative perspective-1000 overflow-hidden">
           
           {/* Empty State */}
           {displayedProducts.length === 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-20 pointer-events-none">
                   <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg text-zinc-300 pointer-events-auto">
                       <ShoppingBag size={32} strokeWidth={1} />
                   </div>
                   <h3 className="text-zinc-900 font-bold text-lg mb-2 pointer-events-auto">Shelf is empty</h3>
                   <p className="text-zinc-500 text-xs max-w-[200px] mb-6 pointer-events-auto">Start building your routine to get AI analysis.</p>
                   <button onClick={onScanNew} className="px-6 py-3 bg-teal-600 text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-xl hover:scale-105 transition-transform pointer-events-auto">
                       Scan First Product
                   </button>
               </div>
           )}

           <div 
                ref={scrollContainerRef}
                // CRITICAL FIX: Stop Propagation to prevent global Swipe Navigation
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="flex overflow-x-auto snap-x snap-mandatory pb-12 pt-12 no-scrollbar items-center px-[50vw] relative z-10"
                style={{ 
                    scrollPaddingLeft: '0px',
                    perspective: '1200px', // Deep perspective for 3D effect
                    transformStyle: 'preserve-3d'
                }} 
           >
               {/* Padding Spacer to allow first item to center */}
               <div className="shrink-0" style={{ width: 0 }} />

               {displayedProducts.map((p, i) => {
                   const audit = auditProduct(p, userProfile);
                   const score = Number(audit.adjustedScore);
                   const theme = getProductColor(p.type);
                   const isActive = i === activeIndex;
                   
                   // Dynamic Style from 3D Engine
                   const dynamicStyle = getCardStyle(i);

                   return (
                       <div 
                            key={p.id}
                            className="shrink-0 snap-center relative"
                            style={{ 
                                width: CARD_WIDTH,
                                marginRight: CARD_GAP,
                                ...dynamicStyle 
                            }}
                       >
                           <button
                                onClick={() => {
                                    if (isActive) setSelectedProduct(p);
                                    else {
                                        // Scroll to center this item
                                        const targetScroll = i * (CARD_WIDTH + CARD_GAP);
                                        scrollContainerRef.current?.scrollTo({
                                            left: targetScroll,
                                            behavior: 'smooth'
                                        });
                                    }
                                }}
                                className="w-full h-[380px] bg-white rounded-[2.5rem] border border-zinc-100 shadow-2xl relative overflow-hidden flex flex-col justify-between p-6 group transition-colors hover:border-teal-200"
                           >
                                {/* Glossy Reflection Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 pointer-events-none opacity-50"></div>

                                {/* Top Stats */}
                                <div className="flex justify-between items-start relative z-10">
                                    <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${theme}`}>
                                        {p.type}
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-2xl font-black ${score > 80 ? 'text-emerald-500' : score < 60 ? 'text-amber-500' : 'text-teal-500'}`}>
                                            {score}%
                                        </div>
                                        <span className="text-[8px] font-bold text-zinc-300 uppercase tracking-widest block">Match</span>
                                    </div>
                                </div>

                                {/* Central Visual */}
                                <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                                    <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center shadow-lg transition-transform duration-500 ${isActive ? 'scale-110 rotate-0 shadow-teal-100' : 'scale-100 rotate-3'} ${theme}`}>
                                        {getProductIcon(p.type, 48)}
                                    </div>
                                </div>

                                {/* Bottom Info */}
                                <div className="relative z-10">
                                    <h3 className="font-bold text-xl text-zinc-900 leading-tight mb-1 line-clamp-2">{p.name}</h3>
                                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wide truncate mb-4">{p.brand || 'Unknown Brand'}</p>
                                    
                                    <div className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors ${isActive ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'bg-zinc-100 text-zinc-400'}`}>
                                        View Details <ArrowRight size={14} />
                                    </div>
                                </div>
                           </button>
                       </div>
                   );
               })}

               {/* ADD NEW CARD (Last in Carousel) */}
               {activeTab === 'ROUTINE' && (
                   <div 
                        className="shrink-0 snap-center relative"
                        style={{ 
                            width: CARD_WIDTH,
                            marginRight: CARD_GAP,
                            ...getCardStyle(displayedProducts.length)
                        }}
                   >
                       <button 
                            onClick={onScanNew}
                            className="w-full h-[380px] rounded-[2.5rem] border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-4 text-zinc-400 hover:border-teal-400 hover:text-teal-500 hover:bg-teal-50/50 transition-all duration-300 group bg-white/50 backdrop-blur-sm"
                       >
                           <div className="w-20 h-20 rounded-full bg-zinc-50 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform group-hover:bg-white">
                               <Plus size={32} />
                           </div>
                           <span className="font-bold text-sm uppercase tracking-widest">Add Product</span>
                       </button>
                   </div>
               )}
               
               {/* Trailing Spacer */}
               <div className="shrink-0" style={{ width: '50vw' }} />
           </div>
       </div>

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

       {/* PRODUCT DETAIL MODAL (Overlay) */}
       {selectedProduct && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-zinc-900/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="w-full max-w-md bg-zinc-50 rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[90vh] sm:h-auto sm:max-h-[90vh] relative shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
                    
                    <div className="bg-white px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm z-10 shrink-0 relative overflow-hidden">
                        <button onClick={() => { setSelectedProduct(null); setIsEditingPrice(false); }} className="absolute top-6 left-6 p-2 bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors z-10">
                            <RotateCcw size={20} className="rotate-180" />
                        </button>
                        
                        <div className="flex flex-col items-center text-center relative z-10 mt-2">
                             <div className={`w-16 h-16 rounded-2xl ${getProductColor(selectedProduct.type).split(' ')[1]} ${getProductColor(selectedProduct.type).split(' ')[0]} flex items-center justify-center mb-4 shadow-lg border border-white/50`}>
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
                        {/* Usage Tip (Contextual) */}
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
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => {
                                        onRemoveProduct(selectedProduct.id);
                                        setSelectedProduct(null);
                                    }}
                                    className="w-full py-4 rounded-[1.5rem] border border-rose-200 bg-rose-50 text-rose-500 font-bold text-xs uppercase hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={16} /> Remove Product
                                </button>
                            </div>
                        )}
                    </div>
                </div>
           </div>
       )}
    </div>
  );
};

export default SmartShelf;
