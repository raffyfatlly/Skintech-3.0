
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, UserProfile } from '../types';
import { Plus, Droplet, Sun, Zap, Sparkles, Palette, DollarSign, Edit2, Save, Award, ShoppingBag, ArrowRight, Lightbulb, Clock, Trash2, RotateCcw, ScanBarcode, ChevronRight, LayoutGrid, Heart } from 'lucide-react';
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

const CARD_WIDTH = 280; // Optimized width for phone screens
const CARD_GAP = 20;    // Increased gap slightly for better separation

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
          requestAnimationFrame(() => {
              setScrollX(container.scrollLeft);
              
              const itemFullWidth = CARD_WIDTH + CARD_GAP;
              // Center of viewport in scroll space
              const viewportCenter = container.scrollLeft + (container.clientWidth / 2);
              
              // Padding is container.clientWidth / 2.
              // Start of first item (index 0) is at paddingLeft.
              // Center of first item is paddingLeft + CARD_WIDTH / 2.
              const firstItemCenter = (container.clientWidth / 2) + (CARD_WIDTH / 2);
              
              const rawIndex = (viewportCenter - firstItemCenter) / itemFullWidth;
              const index = Math.round(rawIndex);
              
              const maxIndex = activeTab === 'ROUTINE' ? displayedProducts.length : displayedProducts.length - 1;
              const safeIndex = Math.max(0, Math.min(maxIndex, index));
              
              if (safeIndex !== activeIndex) {
                  setActiveIndex(safeIndex);
              }
          });
      };

      container.addEventListener('scroll', handleScroll);
      handleScroll(); // Init
      
      return () => container.removeEventListener('scroll', handleScroll);
  }, [displayedProducts, activeTab, activeIndex]);

  // --- THE IMPROVED 3D ENGINE ---
  const getCardStyle = (index: number) => {
      const itemFullWidth = CARD_WIDTH + CARD_GAP;
      
      // Current scroll center
      const viewportCenter = scrollX + (containerWidth / 2);
      
      // Item Center position
      // Account for 50vw padding (containerWidth / 2) AND the card's own half-width
      const visualItemCenter = (containerWidth / 2) + (index * itemFullWidth) + (CARD_WIDTH / 2);
      
      // Distance in "units" of cards
      const distance = (viewportCenter - visualItemCenter) / itemFullWidth;
      const absDistance = Math.abs(distance);
      
      // --- PHYSICS TWEAKS ---
      
      // 1. ROTATION:
      // Invert rotation direction: If item is to the right (distance > 0), we want it to look "inwards".
      // Standard CSS rotateY: positive = right side goes back.
      // So if item is on Right, we want positive rotation.
      // However, to make it perfectly flat at 0, we use a tighter curve.
      let rotateY = 0;
      if (absDistance > 0.05) { // Smaller deadzone (5%)
          // Using a sigmoid-like clamp for smooth snap
          rotateY = distance * -25; // Reduce max rotation angle to 25deg for subtle effect
          rotateY = Math.max(-25, Math.min(25, rotateY));
      }

      // 2. SCALE
      const scale = Math.max(0.9, 1 - (absDistance * 0.1));

      // 3. DEPTH & OPACITY
      const translateZ = Math.min(0, -absDistance * 100);
      const opacity = Math.max(0.5, 1 - (absDistance * 0.4));
      const blur = absDistance > 0.5 ? Math.min(4, (absDistance - 0.5) * 4) : 0;

      return {
          transform: `perspective(1000px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
          zIndex: 100 - Math.round(absDistance * 10),
          opacity,
          filter: `blur(${blur}px)`,
          transition: 'transform 0.1s linear, opacity 0.1s linear', 
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
          case 'CLEANSER': return 'text-sky-600 bg-sky-50/50 border-sky-200';
          case 'SPF': return 'text-amber-600 bg-amber-50/50 border-amber-200';
          case 'SERUM': return 'text-teal-600 bg-teal-50/50 border-teal-200';
          case 'MOISTURIZER': return 'text-rose-600 bg-rose-50/50 border-rose-200';
          case 'FOUNDATION': return 'text-orange-600 bg-orange-50/50 border-orange-200';
          default: return 'text-zinc-600 bg-zinc-50/50 border-zinc-200';
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
    <div className="min-h-screen w-full relative flex flex-col font-sans overflow-hidden pb-32">
       
       {/* BACKGROUND LAYER (Selfie + Light Frost Overlay) */}
       <div className="absolute inset-0 z-0 pointer-events-none">
           {userProfile.faceImage ? (
               <img 
                   src={userProfile.faceImage} 
                   alt="Background" 
                   className="w-full h-full object-cover opacity-100"
               />
           ) : (
               <div className="w-full h-full bg-gradient-to-br from-teal-50 to-white"></div>
           )}
           {/* The "Light Frost" Overlay */}
           <div className="absolute inset-0 bg-white/40 backdrop-blur-2xl transition-all duration-1000"></div>
           <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/60 to-white/40"></div>
       </div>

       {/* --- HEADER: CLEAN TYPOGRAPHY (Matches Skin Report) --- */}
       <div className="pt-safe-top px-6 z-20 relative">
          <div className="flex justify-between items-end mb-6 pt-4">
              <div>
                  <h2 className="text-4xl font-thin text-zinc-900 tracking-tighter leading-none mb-1 mix-blend-multiply opacity-90">
                      Smart Shelf
                  </h2>
                  <p className="text-xs text-teal-600 font-bold uppercase tracking-widest flex items-center gap-2">
                      <LayoutGrid size={12} /> Digital Vanity
                  </p>
              </div>
              
              {/* GRADE BADGE */}
              {activeTab === 'ROUTINE' && (
                  <button 
                    onClick={() => setShowGradingInfo(true)}
                    className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center border shadow-lg backdrop-blur-md transition-transform active:scale-95 ${getGradeColor(shelfIQ.analysis.grade)} bg-white/60`}
                  >
                      <span className="text-xl font-black leading-none">{shelfIQ.analysis.grade}</span>
                      <span className="text-[8px] font-bold uppercase">Grade</span>
                  </button>
              )}
          </div>

          {/* TABS & STATS */}
          <div className="flex items-center justify-between">
               <div className="inline-flex bg-zinc-900/5 backdrop-blur-md p-1 rounded-full border border-white/40">
                   <button 
                      onClick={() => setActiveTab('ROUTINE')}
                      className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'ROUTINE' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900'}`}
                   >
                      Routine
                   </button>
                   <button 
                      onClick={() => setActiveTab('WISHLIST')}
                      className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${activeTab === 'WISHLIST' ? 'bg-zinc-900 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900'}`}
                   >
                      Wishlist {userProfile.wishlist?.length ? <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> : ''}
                   </button>
               </div>

               <div className="text-right hidden sm:block">
                   <span className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Monthly</span>
                   <span className="block text-sm font-black text-zinc-800">RM {costAnalysis.monthlyCost}</span>
               </div>
          </div>
       </div>

       {/* SKINOS NOTES (Integrated HUD) */}
       {activeTab === 'ROUTINE' && (shelfIQ.analysis.notes.length > 0 || shelfIQ.analysis.missing.length > 0) && (
           <div className="px-6 mt-6 z-10 animate-in slide-in-from-top-4 duration-700 relative">
               <div className="bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl p-4 shadow-sm flex items-start gap-3">
                   <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
                       <Lightbulb size={12} strokeWidth={2.5} />
                   </div>
                   <div className="flex-1">
                       <h3 className="text-[9px] font-bold text-teal-800 uppercase tracking-widest mb-0.5 opacity-60">AI Insight</h3>
                       {shelfIQ.analysis.notes.length > 0 ? (
                           <p className="text-xs font-bold text-zinc-800 leading-snug">
                               {shelfIQ.analysis.notes[0].note}
                           </p>
                       ) : (
                           <p className="text-xs font-bold text-zinc-800 leading-snug">
                               Missing steps: {shelfIQ.analysis.missing.join(', ')}.
                           </p>
                       )}
                   </div>
               </div>
           </div>
       )}

       {/* 3D IMMERSIVE CAROUSEL */}
       <div className="flex-1 flex flex-col justify-center relative perspective-800 overflow-hidden z-10">
           
           {/* Empty State */}
           {displayedProducts.length === 0 && (
               <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-20 pointer-events-none">
                   <div className="w-24 h-24 bg-white/40 backdrop-blur-xl rounded-[2rem] flex items-center justify-center mb-6 shadow-xl border border-white/40 pointer-events-auto animate-bounce">
                       <ShoppingBag size={40} className="text-teal-600/50" />
                   </div>
                   <h3 className="text-zinc-800 font-black text-xl mb-2 pointer-events-auto tracking-tight">Shelf is empty</h3>
                   <p className="text-zinc-500 text-sm max-w-[200px] mb-8 pointer-events-auto font-medium leading-relaxed">Start building your intelligent routine.</p>
                   <button onClick={onScanNew} className="px-8 py-4 bg-zinc-900 text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-2xl hover:scale-105 transition-transform pointer-events-auto flex items-center gap-2">
                       <ScanBarcode size={16} /> Scan First Product
                   </button>
               </div>
           )}

           <div 
                ref={scrollContainerRef}
                // CRITICAL FIX: Stop Propagation to prevent global Swipe Navigation
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="flex overflow-x-auto snap-x snap-mandatory pb-16 pt-8 no-scrollbar items-center px-[50vw] relative z-10"
                style={{ 
                    scrollPaddingLeft: '0px',
                    perspective: '1000px',
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
                                className={`
                                    w-full h-[440px] rounded-[2.5rem] border shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] relative overflow-hidden flex flex-col justify-between p-7 group transition-all duration-300
                                    ${isActive 
                                        ? 'bg-white/90 backdrop-blur-2xl border-white ring-1 ring-white/50' 
                                        : 'bg-white/40 backdrop-blur-md border-white/20 hover:bg-white/60'}
                                `}
                           >
                                {/* Glossy Reflection Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-white/60 via-white/20 to-transparent pointer-events-none opacity-50"></div>

                                {/* Top Stats */}
                                <div className="flex justify-between items-start relative z-10">
                                    <div className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${theme}`}>
                                        {p.type}
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-4xl font-thin tracking-tighter ${score > 80 ? 'text-emerald-500' : score < 60 ? 'text-amber-500' : 'text-teal-500'}`}>
                                            {score}
                                        </div>
                                        <span className="text-[8px] font-bold text-zinc-300 uppercase tracking-widest block -mt-1">Match</span>
                                    </div>
                                </div>

                                {/* Central Visual */}
                                <div className="flex-1 flex flex-col items-center justify-center relative z-10 py-4">
                                    <div className={`w-40 h-40 rounded-[2.5rem] flex items-center justify-center shadow-xl transition-transform duration-500 ${isActive ? 'scale-105 rotate-0 shadow-teal-500/10' : 'scale-95 rotate-6 opacity-80'} ${theme}`}>
                                        {getProductIcon(p.type, 72)}
                                    </div>
                                </div>

                                {/* Bottom Info */}
                                <div className="relative z-10 w-full text-center">
                                    <h3 className="font-bold text-xl text-zinc-900 leading-tight mb-1 line-clamp-2">{p.name}</h3>
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-wide truncate mb-6 opacity-70">{p.brand || 'Unknown Brand'}</p>
                                    
                                    <div className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors ${isActive ? 'bg-zinc-900 text-white shadow-lg' : 'bg-white/50 text-zinc-400'}`}>
                                        View Details <ChevronRight size={14} />
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
                            className="w-full h-[440px] rounded-[2.5rem] border-2 border-dashed border-white/40 bg-white/20 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-zinc-500 hover:border-teal-400 hover:text-teal-600 hover:bg-white/40 transition-all duration-300 group"
                       >
                           <div className="w-24 h-24 rounded-full bg-white/40 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform group-hover:bg-white text-teal-600">
                               <Plus size={40} strokeWidth={1.5} />
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
                className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-zinc-900/40 backdrop-blur-md animate-in fade-in duration-200" 
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
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-zinc-900/40 backdrop-blur-lg animate-in fade-in duration-300">
                <div className="w-full max-w-md bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[90vh] sm:h-auto sm:max-h-[90vh] relative shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
                    
                    <div className="bg-zinc-50 px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm z-10 shrink-0 relative overflow-hidden border-b border-zinc-100">
                        <button onClick={() => { setSelectedProduct(null); setIsEditingPrice(false); }} className="absolute top-6 left-6 p-2 bg-white rounded-full text-zinc-500 hover:bg-zinc-100 transition-colors z-10 shadow-sm border border-zinc-100">
                            <RotateCcw size={20} className="rotate-180" />
                        </button>
                        
                        <div className="flex flex-col items-center text-center relative z-10 mt-2">
                             <div className={`w-24 h-24 rounded-[2rem] ${getProductColor(selectedProduct.type).split(' ')[1]} ${getProductColor(selectedProduct.type).split(' ')[0]} flex items-center justify-center mb-4 shadow-lg border border-white/50`}>
                                 {getProductIcon(selectedProduct.type, 40)}
                             </div>
                             <h2 className="text-2xl font-black text-zinc-900 leading-tight mb-1 max-w-xs">{selectedProduct.name}</h2>
                             <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{selectedProduct.brand || 'Unknown Brand'}</p>
                             
                             <div className="mt-4 flex items-center justify-center gap-2">
                                {isEditingPrice ? (
                                    <div className="flex items-center gap-2 animate-in fade-in">
                                        <span className="text-sm font-bold text-zinc-500">RM</span>
                                        <input 
                                            type="number" 
                                            value={tempPrice}
                                            onChange={(e) => setTempPrice(e.target.value)}
                                            className="w-20 bg-white border border-zinc-200 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:border-teal-500"
                                            autoFocus
                                        />
                                        <button onClick={handleSavePrice} className="p-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                                            <Save size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => handleStartEditPrice(selectedProduct)}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors group border border-zinc-200 shadow-sm"
                                    >
                                        <DollarSign size={12} />
                                        <span className="text-xs font-bold">RM {selectedProduct.estimatedPrice || 45}</span>
                                        <Edit2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-safe bg-white">
                        {/* Usage Tip (Contextual) */}
                        <div className="bg-indigo-50/50 p-5 rounded-[1.5rem] border border-indigo-100/50">
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
                                    className="flex-[2] py-4 rounded-[1.5rem] bg-teal-600 text-white font-bold text-xs uppercase hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20"
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
