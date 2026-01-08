
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

  // --- DYNAMIC INSIGHT LOGIC ---
  const activeInsight = useMemo(() => {
      // 1. If looking at the "Ghost Card" (Add New)
      if (activeTab === 'ROUTINE' && activeIndex === displayedProducts.length) {
          return {
              title: 'Expand Routine',
              text: 'Scan a new product to check for conflicts.',
              color: 'text-teal-200',
              borderColor: 'border-teal-500/30',
              bg: 'bg-teal-500/10',
              icon: <ScanBarcode size={16} strokeWidth={2.5} />
          };
      }

      // 2. If looking at a real product
      const product = displayedProducts[activeIndex];
      if (!product) return null;

      const audit = auditProduct(product, userProfile);
      
      // Critical Warning
      const critical = audit.warnings.find(w => w.severity === 'CRITICAL');
      if (critical) {
          return {
              title: 'Caution',
              text: critical.reason,
              color: 'text-rose-300',
              borderColor: 'border-rose-500/30',
              bg: 'bg-rose-500/10',
              icon: <Trash2 size={16} strokeWidth={2.5} />
          };
      }

      // Minor Warning
      const caution = audit.warnings.find(w => w.severity === 'CAUTION');
      if (caution) {
          return {
              title: 'Note',
              text: caution.reason,
              color: 'text-amber-300',
              borderColor: 'border-amber-500/30',
              bg: 'bg-amber-500/10',
              icon: <Lightbulb size={16} strokeWidth={2.5} />
          };
      }

      // Good Match
      if (audit.adjustedScore > 80) {
          return {
              title: 'Great Match',
              text: `This ${product.type.toLowerCase()} aligns well with your skin profile.`,
              color: 'text-emerald-300',
              borderColor: 'border-emerald-500/30',
              bg: 'bg-emerald-500/10',
              icon: <Sparkles size={16} strokeWidth={2.5} />
          };
      }

      // Neutral
      return {
          title: 'Product Info',
          text: product.usageTips || 'Tap "View Details" to see full ingredient analysis.',
          color: 'text-zinc-300',
          borderColor: 'border-white/20',
          bg: 'bg-white/10',
          icon: <Lightbulb size={16} strokeWidth={2.5} />
      };

  }, [activeIndex, displayedProducts, activeTab, userProfile]);

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
              const centerPoint = container.scrollLeft + (container.clientWidth / 2);
              const startOffset = (container.clientWidth / 2) + (CARD_WIDTH / 2);
              
              const rawIndex = (centerPoint - startOffset) / itemFullWidth;
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
      
      // Calculate centers
      const viewportCenter = scrollX + (containerWidth / 2);
      const visualItemCenter = (containerWidth / 2) + (index * itemFullWidth) + (CARD_WIDTH / 2);
      
      // Distance 
      const distance = (viewportCenter - visualItemCenter) / itemFullWidth;
      const absDistance = Math.abs(distance);
      
      // --- PHYSICS TWEAKS ---
      
      // 1. ROTATION:
      let rotateY = 0;
      // WIDER DEADZONE: If within 15% of center, force FLAT (0deg)
      if (absDistance > 0.15) { 
          // Inverse rotation for "cylinder" effect
          // If item is to the right (positive distance), rotate Y negative (face left)
          rotateY = distance * -20; 
          rotateY = Math.max(-45, Math.min(45, rotateY));
      }

      // 2. SCALE
      const scale = Math.max(0.85, 1 - (absDistance * 0.15));

      // 3. DEPTH & OPACITY
      // Push back Z significantly to emphasize the front card
      const translateZ = Math.min(0, -absDistance * 150);
      const opacity = Math.max(0.4, 1 - (absDistance * 0.5));
      const blur = absDistance > 0.5 ? Math.min(8, (absDistance - 0.5) * 8) : 0;

      return {
          transform: `perspective(800px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
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

  // UPDATED: Sharp, defined icons for crystal-clear look
  const getProductIcon = (type: string, size: number = 24) => {
      const props = { size, strokeWidth: 1.5, className: "text-white" };
      switch(type) {
          case 'CLEANSER': return <Droplet {...props} />;
          case 'SPF': return <Sun {...props} />;
          case 'SERUM': return <Zap {...props} />;
          case 'FOUNDATION': return <Palette {...props} />;
          default: return <Sparkles {...props} />;
      }
  }

  // UPDATED: Glass Colors with Sharper Borders
  const getGlassColor = (type: string) => {
      // Returns backdrop colors for the *Icon Container*, not the card
      switch(type) {
          case 'CLEANSER': return 'bg-sky-500/20 border-sky-400/50 shadow-[inset_0_0_20px_rgba(56,189,248,0.2)]';
          case 'SPF': return 'bg-amber-500/20 border-amber-400/50 shadow-[inset_0_0_20px_rgba(251,191,36,0.2)]';
          case 'SERUM': return 'bg-teal-500/20 border-teal-400/50 shadow-[inset_0_0_20px_rgba(45,212,191,0.2)]';
          case 'MOISTURIZER': return 'bg-rose-500/20 border-rose-400/50 shadow-[inset_0_0_20px_rgba(251,113,133,0.2)]';
          default: return 'bg-white/10 border-white/40 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]';
      }
  }

  const getGradeColor = (grade: string) => {
      switch(grade) {
          case 'S': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
          case 'A': return 'text-teal-400 bg-teal-500/10 border-teal-500/30';
          case 'B': return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
          default: return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
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
                   className="w-full h-full object-cover opacity-80"
               />
           ) : (
               <div className="w-full h-full bg-gradient-to-br from-teal-100 via-white to-rose-50"></div>
           )}
           {/* The "Light Frost" Overlay - Matches Skin Report */}
           <div className="absolute inset-0 bg-white/10 backdrop-blur-[50px]"></div>
           <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40"></div>
       </div>

       {/* --- HEADER: CLEAN TYPOGRAPHY --- */}
       <div className="pt-safe-top px-6 z-20 relative">
          <div className="flex justify-between items-end mb-6 pt-4">
              <div>
                  <h2 className="text-4xl font-thin text-white tracking-tighter leading-none mb-1 mix-blend-overlay">
                      Smart Shelf
                  </h2>
                  <p className="text-xs text-teal-200 font-bold uppercase tracking-widest flex items-center gap-2 opacity-80">
                      <LayoutGrid size={12} /> Digital Vanity
                  </p>
              </div>
              
              {/* GRADE BADGE */}
              {activeTab === 'ROUTINE' && (
                  <button 
                    onClick={() => setShowGradingInfo(true)}
                    className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center border backdrop-blur-md transition-transform active:scale-95 ${getGradeColor(shelfIQ.analysis.grade)}`}
                  >
                      <span className="text-xl font-black leading-none">{shelfIQ.analysis.grade}</span>
                      <span className="text-[8px] font-bold uppercase opacity-80">Grade</span>
                  </button>
              )}
          </div>

          {/* TABS & STATS */}
          <div className="flex items-center justify-between">
               <div className="inline-flex bg-white/10 backdrop-blur-md p-1 rounded-full border border-white/20 shadow-lg">
                   <button 
                      onClick={() => setActiveTab('ROUTINE')}
                      className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'ROUTINE' ? 'bg-white/20 text-white shadow-sm border border-white/10' : 'text-white/60 hover:text-white'}`}
                   >
                      Routine
                   </button>
                   <button 
                      onClick={() => setActiveTab('WISHLIST')}
                      className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${activeTab === 'WISHLIST' ? 'bg-white/20 text-white shadow-sm border border-white/10' : 'text-white/60 hover:text-white'}`}
                   >
                      Wishlist {userProfile.wishlist?.length ? <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> : ''}
                   </button>
               </div>

               <div className="text-right hidden sm:block">
                   <span className="block text-[9px] font-bold text-white/60 uppercase tracking-widest">Monthly</span>
                   <span className="block text-sm font-black text-white/90">RM {costAnalysis.monthlyCost}</span>
               </div>
          </div>
       </div>

       {/* 3D IMMERSIVE CAROUSEL */}
       <div className="flex-1 flex flex-col justify-center relative perspective-800 overflow-hidden z-10 -mt-4">
           
           {/* Wishlist Empty State (Minimal) */}
           {activeTab === 'WISHLIST' && displayedProducts.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-white/30 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <ShoppingBag size={14} /> Wishlist Empty
                    </p>
                </div>
           )}

           <div 
                ref={scrollContainerRef}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="flex overflow-x-auto snap-x snap-mandatory pb-8 pt-12 no-scrollbar items-center px-[50vw] relative z-10"
                style={{ 
                    scrollPaddingLeft: '0px',
                    perspective: '1000px',
                    transformStyle: 'preserve-3d'
                }} 
           >
               {/* Padding Spacer */}
               <div className="shrink-0" style={{ width: 0 }} />

               {displayedProducts.map((p, i) => {
                   const audit = auditProduct(p, userProfile);
                   const score = Number(audit.adjustedScore);
                   const glassStyle = getGlassColor(p.type);
                   const isActive = i === activeIndex;
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
                                        scrollContainerRef.current?.scrollTo({
                                            left: i * (CARD_WIDTH + CARD_GAP),
                                            behavior: 'smooth'
                                        });
                                    }
                                }}
                                className={`
                                    w-full h-[440px] rounded-[2.5rem] border shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between p-7 group transition-all duration-300
                                    ${isActive 
                                        ? 'bg-white/20 backdrop-blur-xl border-white/60 ring-1 ring-white/40' 
                                        : 'bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/15'}
                                `}
                           >
                                {/* Top Stats */}
                                <div className="flex justify-between items-start relative z-10 w-full">
                                    <div className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border bg-white/5 border-white/10 text-white/80`}>
                                        {p.type}
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-4xl font-thin tracking-tighter ${score > 80 ? 'text-emerald-300' : score < 60 ? 'text-amber-300' : 'text-teal-300'}`}>
                                            {score}
                                        </div>
                                        <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest block -mt-1">Match</span>
                                    </div>
                                </div>

                                {/* Central Visual - Transparent Glass Box */}
                                <div className="flex-1 flex flex-col items-center justify-center relative z-10 py-4 w-full">
                                    <div className={`w-40 h-40 rounded-[2.5rem] flex items-center justify-center shadow-lg transition-transform duration-500 border ${isActive ? 'scale-105 rotate-0' : 'scale-95 rotate-3 opacity-80'} ${glassStyle}`}>
                                        {getProductIcon(p.type, 72)}
                                    </div>
                                </div>

                                {/* Bottom Info - Minimalist Text */}
                                <div className="relative z-10 w-full text-center">
                                    <h3 className="font-bold text-xl text-white leading-tight mb-1 line-clamp-2 drop-shadow-sm">{p.name}</h3>
                                    <p className="text-xs text-white/60 font-bold uppercase tracking-wide truncate mb-6">{p.brand || 'Unknown Brand'}</p>
                                    
                                    {/* Glass Pill Button (No Black) */}
                                    <div className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${isActive ? 'bg-white/20 text-white border border-white/30 hover:bg-white/30 shadow-lg' : 'bg-white/5 text-white/40 border border-white/5'}`}>
                                        View Details <ChevronRight size={14} />
                                    </div>
                                </div>
                           </button>
                       </div>
                   );
               })}

               {/* ADD NEW CARD (Ghost Card Style) */}
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
                            className="w-full h-[440px] rounded-[2.5rem] border border-dashed border-white/30 bg-white/5 backdrop-blur-sm flex flex-col items-center justify-center gap-6 text-white/40 hover:bg-white/10 hover:border-white/60 transition-all duration-300 group"
                       >
                           <div className="w-24 h-24 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform text-white/40 group-hover:text-white">
                               <ScanBarcode size={64} strokeWidth={0.5} />
                           </div>
                           <span className="font-bold text-xs uppercase tracking-[0.2em] group-hover:text-white transition-colors">Scan Product</span>
                       </button>
                   </div>
               )}
               
               <div className="shrink-0" style={{ width: '50vw' }} />
           </div>
       </div>

       {/* ACTIVE PRODUCT INSIGHT (HUD) - Moved Below Carousel */}
       {activeInsight && (
           <div className="px-6 mb-4 z-10 relative">
               <div key={activeIndex} className={`backdrop-blur-md border rounded-2xl p-4 shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-4 fade-in duration-700 delay-300 ${activeInsight.bg} ${activeInsight.borderColor}`}>
                   <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${activeInsight.color} border-current/20 bg-white/10`}>
                       {activeInsight.icon}
                   </div>
                   <div className="flex-1">
                       <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${activeInsight.color}`}>{activeInsight.title}</h3>
                       <p className="text-xs font-medium text-white/90 leading-snug">
                           {activeInsight.text}
                       </p>
                   </div>
               </div>
           </div>
       )}

       {/* GRADING INFO MODAL (Darkened Glass) */}
       {showGradingInfo && (
            <div 
                className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" 
                onClick={(e) => { e.stopPropagation(); setShowGradingInfo(false); }}
            >
                <div 
                    className="w-full max-w-xs bg-zinc-900/90 border border-white/10 rounded-[2rem] p-6 shadow-2xl relative animate-in zoom-in-95 duration-300 text-white" 
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-center mb-6 pt-2">
                        <div className="w-12 h-12 bg-teal-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 text-teal-400 shadow-sm border border-teal-500/30">
                            <Award size={24} strokeWidth={1.5} />
                        </div>
                        <h3 className="text-lg font-black tracking-tight">Routine Grading</h3>
                        <p className="text-xs text-zinc-400 font-medium mt-1">Based on average product suitability.</p>
                    </div>

                    <div className="space-y-2">
                        {[
                            { grade: 'S', label: 'Perfect', range: '90-100%', color: 'text-emerald-400 bg-emerald-500/20' },
                            { grade: 'A', label: 'Great', range: '80-89%', color: 'text-teal-400 bg-teal-500/20' },
                            { grade: 'B', label: 'Good', range: '70-79%', color: 'text-sky-400 bg-sky-500/20' },
                            { grade: 'C', label: 'Fair', range: '60-69%', color: 'text-amber-400 bg-amber-500/20' },
                            { grade: 'D', label: 'Weak', range: '< 60%', color: 'text-rose-400 bg-rose-500/20' },
                        ].map((item) => (
                            <div key={item.grade} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5">
                                <div className="flex items-center gap-3">
                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${item.color}`}>
                                        {item.grade}
                                    </span>
                                    <span className="text-xs font-bold text-zinc-300">{item.label}</span>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-500">{item.range}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
       )}

       {/* PRODUCT DETAIL MODAL (Light Glass Overlay to match Report) */}
       {selectedProduct && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
                <div className="w-full max-w-md bg-white/90 backdrop-blur-2xl border border-white/20 rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[90vh] sm:h-auto sm:max-h-[90vh] relative shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
                    
                    {/* Detail Header */}
                    <div className="bg-white/50 px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm z-10 shrink-0 relative overflow-hidden border-b border-white/30">
                        <button onClick={() => { setSelectedProduct(null); setIsEditingPrice(false); }} className="absolute top-6 left-6 p-2 bg-white/60 rounded-full text-zinc-600 hover:bg-white transition-colors z-10 shadow-sm border border-zinc-100">
                            <RotateCcw size={20} className="rotate-180" />
                        </button>
                        
                        <div className="flex flex-col items-center text-center relative z-10 mt-2">
                             <div className={`w-24 h-24 rounded-[2rem] bg-white flex items-center justify-center mb-4 shadow-xl border border-zinc-100`}>
                                 {/* Colored icon inside white box for detail view */}
                                 {React.cloneElement(getProductIcon(selectedProduct.type, 40) as React.ReactElement, { className: 'text-zinc-800' })}
                             </div>
                             <h2 className="text-2xl font-black text-zinc-900 leading-tight mb-1 max-w-xs tracking-tight">{selectedProduct.name}</h2>
                             <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{selectedProduct.brand || 'Unknown Brand'}</p>
                             
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
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/60 rounded-xl text-zinc-600 hover:text-zinc-900 hover:bg-white transition-colors group border border-zinc-200 shadow-sm"
                                    >
                                        <DollarSign size={12} />
                                        <span className="text-xs font-bold">RM {selectedProduct.estimatedPrice || 45}</span>
                                        <Edit2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-safe bg-white/40">
                        {/* Usage Tip (Contextual) */}
                        <div className="bg-indigo-50/80 p-5 rounded-[1.5rem] border border-indigo-100">
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
                            <div className="bg-white/80 p-5 rounded-[1.5rem] border border-white/50 shadow-sm">
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
                                    className="w-full py-4 rounded-[1.5rem] border border-rose-200 bg-rose-50/50 text-rose-500 font-bold text-xs uppercase hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
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
