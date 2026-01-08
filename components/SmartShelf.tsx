
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, UserProfile } from '../types';
import { Plus, Droplet, Sun, Zap, Sparkles, Palette, DollarSign, Edit2, Save, Award, ShoppingBag, ArrowRight, Lightbulb, Clock, Trash2, RotateCcw, ScanBarcode, ChevronDown } from 'lucide-react';
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

const CARD_WIDTH = 280; 
const CARD_GAP = 20;    

const SmartShelf: React.FC<SmartShelfProps> = ({ products, onRemoveProduct, onScanNew, onUpdateProduct, userProfile, onMoveToShelf, onRemoveFromWishlist, onOpenRoutineBuilder }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'ROUTINE' | 'WISHLIST'>('ROUTINE');
  const [showGradingInfo, setShowGradingInfo] = useState(false); 
  const [activeIndex, setActiveIndex] = useState(0);
  
  // 3D Scroll State
  const [scrollX, setScrollX] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);
  
  // Insight Interaction State
  const [isInsightExpanded, setIsInsightExpanded] = useState(false);

  // Price Editing State
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shelfIQ = useMemo(() => analyzeShelfHealth(products, userProfile), [products, userProfile]);

  const displayedProducts = useMemo(() => {
      if (activeTab === 'ROUTINE') {
          return products;
      } else {
          return userProfile.wishlist || [];
      }
  }, [products, activeTab, userProfile.wishlist]);

  // --- CONTEXTUAL USAGE LOGIC ---
  const getContextualUsageGuide = (product: Product, shelf: Product[]) => {
      const type = product.type;
      // Filter out self
      const others = shelf.filter(p => p.id !== product.id);
      const otherTypes = new Set(others.map(p => p.type));
      const ingredients = (product.ingredients || []).join(' ').toLowerCase();
      
      // 1. Conflict / Timing Checks
      const hasRetinol = ingredients.includes('retinol') || ingredients.includes('tretinoin');
      const hasAcids = ingredients.includes('acid') || ingredients.includes('salicylic') || ingredients.includes('glycolic');
      const hasVitC = ingredients.includes('vitamin c') || ingredients.includes('ascorbic');

      const shelfHasRetinol = others.some(p => (p.ingredients || []).join(' ').toLowerCase().includes('retinol'));
      const shelfHasAcids = others.some(p => (p.ingredients || []).join(' ').toLowerCase().includes('acid'));

      if (hasRetinol) {
          if (shelfHasAcids) return "Use only at night. **Alternate nights** with your exfoliating acids to avoid irritation.";
          return "Use only at night. Apply after cleansing and before moisturizer. Start 2-3 times a week.";
      }

      if (hasAcids) {
          if (shelfHasRetinol) return "Use mainly at night. **Do not use on the same night** as your Retinol.";
          return "Use 2-3 times a week. Over-exfoliation damages the skin barrier.";
      }

      if (hasVitC) {
          if (shelfHasRetinol) return "Excellent for **Morning** use under SPF. Let your Retinol work at night.";
          return "Apply in the morning on clean, dry skin to boost sun protection.";
      }

      // 2. Routine Order Checks
      if (type === 'CLEANSER') {
          if (otherTypes.has('CLEANSER')) return "Use as your daily wash. If you double cleanse, use this second.";
          return "Use AM and PM as the essential first step to remove impurities.";
      }

      if (type === 'TONER') {
          return "Apply immediately after cleansing while skin is damp to boost absorption of serums.";
      }

      if (type === 'SERUM') {
          if (otherTypes.has('MOISTURIZER')) return "Apply this active layer **before** your moisturizer for deep penetration.";
          return "Apply after cleansing. Follow with a moisturizer to seal it in.";
      }

      if (type === 'MOISTURIZER') {
          if (otherTypes.has('SPF')) return "Use AM and PM. In the morning, **wait 2 mins** before applying SPF.";
          return "Apply as your final step at night to lock in hydration.";
      }

      if (type === 'SPF') {
          return "The most important step. Apply generously as the **very last step** every morning.";
      }

      return product.usageTips || "Apply after lighter serums and before heavier creams.";
  };

  // --- DYNAMIC INSIGHT LOGIC ---
  const activeInsight = useMemo(() => {
      // 1. If looking at the "Ghost Card" (Add New)
      if (activeTab === 'ROUTINE' && activeIndex === displayedProducts.length) {
          return {
              title: 'Expand Routine',
              text: 'Scan a new product to check for conflicts.',
              color: 'text-zinc-600',
              bg: 'from-zinc-100/50',
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
              color: 'text-rose-600',
              bg: 'from-rose-50/60',
              icon: <Trash2 size={16} strokeWidth={2.5} />
          };
      }

      // Minor Warning
      const caution = audit.warnings.find(w => w.severity === 'CAUTION');
      if (caution) {
          return {
              title: 'Note',
              text: caution.reason,
              color: 'text-amber-600',
              bg: 'from-amber-50/60',
              icon: <Lightbulb size={16} strokeWidth={2.5} />
          };
      }

      // Good Match
      if (audit.adjustedScore > 80) {
          return {
              title: 'Great Match',
              text: `This ${product.type.toLowerCase()} aligns well with your skin profile.`,
              color: 'text-emerald-600',
              bg: 'from-emerald-50/60',
              icon: <Sparkles size={16} strokeWidth={2.5} />
          };
      }

      // Neutral
      return {
          title: 'Product Info',
          text: product.usageTips || 'Tap "View Details" to see full ingredient analysis.',
          color: 'text-zinc-500',
          bg: 'from-zinc-50/60',
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
          setIsScrolling(true);
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
              setIsScrolling(false);
          }, 200);

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
                  setIsInsightExpanded(false); 
              }
          });
      };

      container.addEventListener('scroll', handleScroll);
      handleScroll(); 
      return () => {
          container.removeEventListener('scroll', handleScroll);
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      };
  }, [displayedProducts, activeTab, activeIndex]);

  const getCardStyle = (index: number) => {
      const itemFullWidth = CARD_WIDTH + CARD_GAP;
      const viewportCenter = scrollX + (containerWidth / 2);
      const visualItemCenter = (containerWidth / 2) + (index * itemFullWidth) + (CARD_WIDTH / 2);
      const distance = (viewportCenter - visualItemCenter) / itemFullWidth;
      const absDistance = Math.abs(distance);
      
      let rotateY = 0;
      if (absDistance > 0.15) { 
          rotateY = distance * -20; 
          rotateY = Math.max(-45, Math.min(45, rotateY));
      }

      const scale = Math.max(0.85, 1 - (absDistance * 0.15));
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

  // UPDATED: Thinner stroke width (0.75) for ultra-premium aesthetic
  const getProductIcon = (type: string, size: number = 24, className: string = "") => {
      const props = { size, strokeWidth: 0.75, className };
      switch(type) {
          case 'CLEANSER': return <Droplet {...props} />;
          case 'SPF': return <Sun {...props} />;
          case 'SERUM': return <Zap {...props} />;
          case 'FOUNDATION': return <Palette {...props} />;
          default: return <Sparkles {...props} />;
      }
  }

  const getGradeColor = (grade: string) => {
      switch(grade) {
          case 'S': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
          case 'A': return 'text-teal-600 bg-teal-50 border-teal-200';
          case 'B': return 'text-sky-600 bg-sky-50 border-sky-200';
          default: return 'text-rose-600 bg-rose-50 border-rose-200';
      }
  }

  // Helper function to render formatted text with bolding
  const renderFormattedText = (text: string) => {
      if (!text) return null;
      const parts = text.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="font-bold text-indigo-900">{part.slice(2, -2)}</strong>;
          }
          return <span key={i}>{part}</span>;
      });
  };

  return (
    <div className="min-h-screen w-full relative flex flex-col font-sans overflow-hidden pb-32 bg-zinc-50">
       
       <div className="absolute top-[20%] left-[-20%] w-[500px] h-[500px] bg-zinc-300/30 rounded-full blur-[100px] pointer-events-none"></div>
       <div className="absolute top-[40%] right-[-20%] w-[600px] h-[600px] bg-slate-200/40 rounded-full blur-[120px] pointer-events-none"></div>
       <div className="absolute top-[10%] right-[10%] w-[300px] h-[300px] bg-white rounded-full blur-3xl opacity-80 pointer-events-none"></div>

       {/* --- HEADER --- */}
       <div className="pt-safe-top px-6 z-20 relative">
          <div className="flex justify-between items-end mb-6 pt-4">
              <div>
                  <h2 className="text-4xl font-thin text-zinc-900 tracking-tighter leading-none mb-1">
                      Smart Shelf
                  </h2>
                  <p className="text-xs text-teal-500 font-bold uppercase tracking-widest opacity-90 pl-0.5">
                      Digital Vanity
                  </p>
              </div>
              
              {activeTab === 'ROUTINE' && (
                  <button 
                    onClick={() => setShowGradingInfo(true)}
                    className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center border transition-transform active:scale-95 shadow-sm bg-white/80 backdrop-blur-md ${getGradeColor(shelfIQ.analysis.grade)}`}
                  >
                      <span className="text-xl font-black leading-none">{shelfIQ.analysis.grade}</span>
                      <span className="text-[8px] font-bold uppercase opacity-60">Grade</span>
                  </button>
              )}
          </div>

          <div className="flex items-center justify-between">
               <div className="inline-flex bg-white/60 backdrop-blur-md p-1 rounded-full border border-zinc-200/50 shadow-sm">
                   <button 
                      onClick={() => setActiveTab('ROUTINE')}
                      className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'ROUTINE' ? 'bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-100' : 'text-zinc-400 hover:text-zinc-600'}`}
                   >
                      Routine
                   </button>
                   <button 
                      onClick={() => setActiveTab('WISHLIST')}
                      className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${activeTab === 'WISHLIST' ? 'bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-100' : 'text-zinc-400 hover:text-zinc-600'}`}
                   >
                      Wishlist {userProfile.wishlist?.length ? <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'WISHLIST' ? 'bg-rose-400' : 'bg-rose-500'}`}></span> : ''}
                   </button>
               </div>

               <div className="text-right hidden sm:block">
                   <span className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Monthly</span>
                   <span className="block text-sm font-black text-zinc-900">RM {costAnalysis.monthlyCost}</span>
               </div>
          </div>
       </div>

       {/* 3D CAROUSEL */}
       <div className="flex-1 flex flex-col justify-center relative perspective-800 overflow-hidden z-10 -mt-4">
           
           {activeTab === 'WISHLIST' && displayedProducts.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
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
               <div className="shrink-0" style={{ width: 0 }} />

               {displayedProducts.map((p, i) => {
                   const audit = auditProduct(p, userProfile);
                   const score = Number(audit.adjustedScore);
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
                                    w-full h-[440px] rounded-[2rem] border relative overflow-hidden flex flex-col p-6 group transition-all duration-500
                                    ${isActive 
                                        ? 'bg-gradient-to-br from-white/30 via-white/10 to-transparent backdrop-blur-2xl border-white/40 shadow-[0_20px_50px_rgba(0,0,0,0.15)] opacity-100' 
                                        : 'bg-white/5 backdrop-blur-md border-white/10 opacity-50 hover:opacity-80 scale-95'}
                                `}
                           >
                                <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
                                
                                <div className="absolute left-6 top-1/2 -translate-y-1/2 -ml-3 flex items-center justify-center h-full w-4 pointer-events-none opacity-40">
                                     <span className="text-[10px] font-black uppercase tracking-[0.3em] -rotate-90 whitespace-nowrap text-zinc-800">
                                         {p.type}
                                     </span>
                                </div>

                                <div className="flex-1 flex flex-col w-full pl-6 relative z-10">
                                    <div className="flex justify-between items-start w-full mb-4">
                                        <div className="text-left">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 truncate max-w-[120px]">{p.brand || 'Brand'}</p>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className={`text-2xl font-light tracking-tighter leading-none ${score > 80 ? 'text-emerald-700' : score < 60 ? 'text-rose-700' : 'text-amber-700'}`}>
                                                {score}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex-1 flex items-center justify-center py-2">
                                        <div className={`w-32 h-32 rounded-full flex items-center justify-center shadow-inner ${isActive ? 'bg-white/20 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)]' : 'bg-transparent'} backdrop-blur-sm transition-all duration-500 ring-1 ring-white/10`}>
                                            <div className={`text-teal-500 opacity-100 drop-shadow-sm transition-transform duration-500 ${isActive ? 'scale-110' : 'scale-100'}`}>
                                                 {getProductIcon(p.type, 64, "currentColor")}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-left mt-4">
                                        <h3 className="font-medium text-lg text-zinc-800 leading-tight mb-4 line-clamp-2 pr-2 drop-shadow-sm">
                                            {p.name}
                                        </h3>
                                        <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all ${isActive ? 'text-zinc-900 translate-x-0' : 'text-zinc-400 -translate-x-2 opacity-0'}`}>
                                            View Details <ArrowRight size={12} />
                                        </div>
                                    </div>
                                </div>
                           </button>
                       </div>
                   );
               })}

               {/* VISIBLE 'ADD NEW' CARD */}
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
                            className="w-full h-[440px] rounded-[2rem] border-2 border-dashed border-zinc-300 bg-white/40 backdrop-blur-md flex flex-col items-center justify-center gap-6 text-zinc-400 hover:bg-white/60 hover:border-teal-300 transition-all duration-300 group shadow-sm hover:shadow-md"
                       >
                           <div className="w-24 h-24 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform text-zinc-300 bg-white shadow-sm border border-zinc-100 group-hover:text-teal-500 group-hover:border-teal-100">
                               <ScanBarcode size={48} strokeWidth={1} />
                           </div>
                           <span className="font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 group-hover:text-teal-600 transition-colors">Scan Product</span>
                       </button>
                   </div>
               )}
               
               <div className="shrink-0" style={{ width: '50vw' }} />
           </div>
       </div>

       {/* ACTIVE INSIGHT (HUD) - With Fixes */}
       <div 
           className={`w-full flex justify-center mb-4 z-20 relative px-6 transition-all duration-700 ease-out ${
               isScrolling ? 'opacity-0 translate-y-4 pointer-events-none scale-95' : 'opacity-100 translate-y-0 scale-100'
           }`}
       >
           {activeInsight ? (
               <button 
                   onClick={() => setIsInsightExpanded(!isInsightExpanded)}
                   style={{ width: CARD_WIDTH }}
                   className={`
                        bg-white/80 backdrop-blur-xl border border-white/60 rounded-[1.5rem] shadow-[0_15px_40px_-10px_rgba(0,0,0,0.1)] 
                        relative overflow-hidden transition-all duration-500 cubic-bezier(0.19, 1, 0.22, 1) text-left group
                        ${isInsightExpanded ? 'p-6' : 'p-3 hover:bg-white/90 active:scale-[0.98]'}
                   `}
               >
                   <div className="flex items-center gap-4 relative z-10">
                       <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-white shadow-sm border border-zinc-50 ${activeInsight.color}`}>
                           {activeInsight.icon}
                       </div>
                       
                       <div className="flex-1 min-w-0">
                           <h3 className={`text-[10px] font-bold uppercase tracking-widest ${activeInsight.color} truncate flex items-center gap-2`}>
                               {activeInsight.title}
                           </h3>
                           {!isInsightExpanded && (
                               <p className="text-xs font-medium text-zinc-500 truncate mt-0.5">
                                   Tap to view analysis
                               </p>
                           )}
                       </div>

                       <div className={`w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 transition-transform duration-500 ${isInsightExpanded ? 'rotate-180 bg-zinc-200' : 'rotate-0'}`}>
                           <ChevronDown size={14} strokeWidth={2} />
                       </div>
                   </div>

                   {/* FIX: Z-Index for Text visibility */}
                   <div 
                        className={`transition-all duration-500 ease-in-out overflow-hidden relative z-10 ${isInsightExpanded ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}
                   >
                        <p className="text-sm font-medium text-zinc-600 leading-relaxed border-l-2 border-zinc-100 pl-3">
                            {activeInsight.text}
                        </p>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            <Sparkles size={10} className="text-teal-500" /> AI Verdict
                        </div>
                   </div>
                   
                   {/* FIX: Softer Gradient, Z-0 */}
                   <div className={`absolute inset-0 bg-gradient-to-br ${activeInsight.bg || 'from-zinc-50/40'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0`}></div>
               </button>
           ) : (
               <div style={{ width: CARD_WIDTH, height: '64px' }} /> 
           )}
       </div>

       {/* GRADING MODAL */}
       {showGradingInfo && (
            <div 
                className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" 
                onClick={(e) => { e.stopPropagation(); setShowGradingInfo(false); }}
            >
                <div 
                    className="w-full max-w-xs bg-white border border-white/10 rounded-[2rem] p-6 shadow-2xl relative animate-in zoom-in-95 duration-300" 
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-center mb-6 pt-2">
                        <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-teal-600 shadow-sm border border-teal-100">
                            <Award size={24} strokeWidth={1.5} />
                        </div>
                        <h3 className="text-lg font-black tracking-tight text-zinc-900">Routine Grading</h3>
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
                            <div key={item.grade} className="flex items-center justify-between p-3 rounded-xl border border-zinc-100 bg-zinc-50">
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
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
                <div className="w-full max-w-md bg-white/90 backdrop-blur-2xl border border-white/20 rounded-t-[2.5rem] sm:rounded-[2.5rem] h-[90vh] sm:h-auto sm:max-h-[90vh] relative shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
                    
                    {/* Header with FIX: Larger Back Button */}
                    <div className="bg-white/50 px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm z-10 shrink-0 relative overflow-hidden border-b border-white/30">
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation();
                                setSelectedProduct(null); 
                                setIsEditingPrice(false); 
                            }} 
                            className="absolute top-5 left-5 w-12 h-12 flex items-center justify-center bg-white/80 backdrop-blur-md rounded-full text-zinc-600 hover:bg-white hover:scale-105 transition-all z-50 shadow-sm border border-zinc-100 cursor-pointer active:scale-95"
                        >
                            <RotateCcw size={20} className="rotate-180" />
                        </button>
                        
                        <div className="flex flex-col items-center text-center relative z-10 mt-2">
                             <div className={`w-24 h-24 rounded-[2rem] bg-white flex items-center justify-center mb-4 shadow-xl border border-zinc-100`}>
                                 {getProductIcon(selectedProduct.type, 40, 'text-zinc-800')}
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
                        
                        {/* CONTEXTUAL USAGE GUIDE (HOLISTIC) */}
                        <div className="bg-indigo-50/80 p-5 rounded-[1.5rem] border border-indigo-100">
                            <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Clock size={14} /> Usage Guide
                            </h3>
                            <p className="text-xs text-indigo-800 font-medium leading-relaxed">
                                {renderFormattedText(getContextualUsageGuide(selectedProduct, displayedProducts))}
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
