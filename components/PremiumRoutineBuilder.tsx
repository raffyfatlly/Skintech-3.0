
import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, SkinMetrics, RecommendedProduct, Product } from '../types';
import { Sparkles, ArrowLeft, DollarSign, Star, Crown, Lock, Search, Droplet, Sun, Zap, ShieldCheck, Loader, Sliders, AlertCircle, Target, CheckCircle2, Check, ArrowRight, Minimize2, Dna, Heart, StarHalf, Activity, Layers, Scan, Eraser } from 'lucide-react';

interface PremiumRoutineBuilderProps {
    user: UserProfile;
    onBack: () => void;
    onUnlockPremium: () => void;
    usageCount: number;
    onIncrementUsage: () => void;
    onProductSelect: (product: { name: string, brand: string }) => void;
    savedResults: RecommendedProduct[];
    onSaveResults: (results: RecommendedProduct[]) => void;
    onGenerateBackground: (category: string, price: number, allergies: string, goals: string[]) => void;
    onAddToWishlist?: (product: Product) => void;
}

const LIMIT_ROUTINES = 1;

const CATEGORIES = [
    { label: 'Cleanser', icon: Droplet },
    { label: 'Toner', icon: Sparkles },
    { label: 'Serum', icon: Zap },
    { label: 'Moisturizer', icon: ShieldCheck },
    { label: 'Sunscreen', icon: Sun },
    { label: 'Mask', icon: Star },
];

const GOALS = [
    { label: 'Clear Acne', icon: Zap },
    { label: 'Repair Scars', icon: Eraser }, // Changed from Fade -> Repair (Targets Box/Icepick)
    { label: 'Fix Texture', icon: Activity }, 
    { label: 'Minimize Pores', icon: Scan },
    { label: 'Remove Blackheads', icon: Target }, 
    { label: 'Hydration Boost', icon: Droplet },
    { label: 'Anti-Aging', icon: Star }, 
    { label: 'Brightening', icon: Sun },
    { label: 'Soothe Redness', icon: ShieldCheck },
    { label: 'Oil Control', icon: Sliders },
    { label: 'Barrier Repair', icon: Layers },
];

const PremiumRoutineBuilder: React.FC<PremiumRoutineBuilderProps> = ({ user, onBack, onUnlockPremium, usageCount, onIncrementUsage, onProductSelect, savedResults, onSaveResults, onGenerateBackground, onAddToWishlist }) => {
    const defaultGoal = useMemo(() => {
        const b = user.biometrics;
        // Prioritize critical low scores
        if (b.acneActive < 60) return 'Clear Acne';
        if (b.redness < 60) return 'Soothe Redness';
        
        // Texture & Scarring Logic
        if (b.acneScars < 65) return 'Repair Scars';
        if (b.blackheads < 65) return 'Remove Blackheads';
        if (b.texture < 65) return 'Fix Texture';
        if (b.poreSize < 60) return 'Minimize Pores';
        
        // Health & Aging
        if (b.hydration < 50) return 'Barrier Repair';
        if (b.wrinkleFine < 70) return 'Anti-Aging';
        if (b.pigmentation < 70) return 'Brightening';
        if (b.oiliness < 60) return 'Oil Control';
        
        return 'Hydration Boost';
    }, [user.biometrics]);

    const [selectedGoals, setSelectedGoals] = useState<string[]>([defaultGoal]);
    const [selectedCategory, setSelectedCategory] = useState('Cleanser');
    const [maxPrice, setMaxPrice] = useState(100);
    const [allergies, setAllergies] = useState('');
    const [results, setResults] = useState<RecommendedProduct[]>(savedResults);
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadingText, setLoadingText] = useState("Initializing Architect...");
    const [savedIds, setSavedIds] = useState<string[]>([]);

    useEffect(() => {
        if (savedResults.length > 0) {
            setResults(savedResults);
            setIsGenerating(false);
        }
    }, [savedResults]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isGenerating) {
            const messages = [
                "Initiating holistic search...",
                `Scanning top-rated ${selectedCategory} candidates...`,
                "Filtering by price and availability...",
                "Checking for allergen conflicts...",
                "Selecting the top 3 best matches..."
            ];
            let i = 0;
            setLoadingText(messages[0]);
            interval = setInterval(() => {
                i = (i + 1) % messages.length;
                setLoadingText(messages[i]);
            }, 3000); 
        }
        return () => clearInterval(interval);
    }, [isGenerating, selectedCategory]);

    const isPaid = !!user.isPremium; 
    const hasFreeUsage = usageCount < LIMIT_ROUTINES;

    const toggleGoal = (goal: string) => {
        if (selectedGoals.includes(goal)) {
            setSelectedGoals(selectedGoals.filter(g => g !== goal));
        } else {
            setSelectedGoals([...selectedGoals, goal]);
        }
    };

    const handleGenerate = () => {
        if (!isPaid && !hasFreeUsage) return onUnlockPremium();
        if (selectedGoals.length === 0) return;
        setIsGenerating(true);
        onGenerateBackground(selectedCategory, maxPrice, allergies, selectedGoals);
    };

    const handleSave = (rec: RecommendedProduct) => {
        if (onAddToWishlist) {
            // FIX: Parsing logic was stripping decimals (45.00 -> 4500). Now keeps dots.
            const rawPrice = rec.price.replace(/[^0-9.]/g, ''); 
            const price = parseFloat(rawPrice) || 0;

            const product: Product = {
                id: Date.now().toString() + Math.random(),
                name: rec.name,
                brand: rec.brand,
                type: selectedCategory.toUpperCase() as any,
                ingredients: [], // Placeholder
                estimatedPrice: price,
                suitabilityScore: rec.rating,
                risks: [],
                benefits: [{ ingredient: "Recommended Match", target: "overallScore", description: rec.reason, relevance: "HIGH" }],
                dateScanned: Date.now()
            };
            onAddToWishlist(product);
            setSavedIds([...savedIds, rec.name]);
        }
    };

    const renderStars = (rating: number) => {
        // Normalize 0-100 to 0-5 if needed
        const score = rating > 5 ? rating / 20 : rating;
        const fullStars = Math.floor(score);
        const hasHalfStar = score % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

        return (
            <div className="flex items-center gap-0.5">
                {[...Array(fullStars)].map((_, i) => (
                    <Star key={`full-${i}`} size={12} className="fill-amber-400 text-amber-400" />
                ))}
                {hasHalfStar && <StarHalf size={12} className="fill-amber-400 text-amber-400" />}
                {[...Array(emptyStars)].map((_, i) => (
                    <Star key={`empty-${i}`} size={12} className="text-zinc-200" />
                ))}
                <span className="ml-1.5 text-xs font-bold text-zinc-700">{score.toFixed(1)}</span>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-zinc-50 pb-32 animate-in fade-in slide-in-from-bottom-8 duration-500 font-sans relative">
            
            {/* LOADING */}
            {isGenerating && (
                <div className="fixed inset-0 z-50 bg-gradient-to-br from-teal-900 to-zinc-900 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500 font-sans">
                    <div className="relative mb-10">
                        <div className="w-24 h-24 rounded-full border-2 border-teal-500/30 flex items-center justify-center animate-[spin_10s_linear_infinite]">
                            <div className="w-16 h-16 rounded-full border-2 border-teal-400/50"></div>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Dna size={32} className="text-teal-400 animate-pulse" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Building Routine</h3>
                    <p className="text-sm text-teal-200 font-bold uppercase tracking-widest mb-10 animate-pulse max-w-xs leading-relaxed">
                        {loadingText}
                    </p>
                    <div className="w-full max-w-xs space-y-4">
                        <button 
                            onClick={onBack}
                            className="w-full py-4 bg-white/10 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Minimize2 size={14} /> Run in Background
                        </button>
                    </div>
                </div>
            )}

            {/* HEADER */}
            <div 
                className="pt-12 pb-10 px-6 rounded-b-[2.5rem] relative overflow-hidden shadow-2xl"
                style={{ backgroundColor: 'rgb(163, 206, 207)' }}
            >
                 <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none mix-blend-overlay"></div>
                 
                 <div className="flex items-center justify-between mb-8 relative z-10">
                     <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-white drop-shadow-sm">
                         <ArrowLeft size={24} />
                     </button>
                     <div className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 text-white shadow-sm">
                         <Crown size={12} className="text-amber-100" /> Routine Architect
                     </div>
                 </div>

                 <div className="relative z-10 text-white">
                     <h1 className="text-3xl font-black tracking-tight mb-2 drop-shadow-md">Build Your Routine</h1>
                     <p className="text-white/90 text-sm font-bold drop-shadow-sm">Find the perfect products for your budget & skin.</p>
                 </div>
            </div>

            <div className="px-6 -mt-6 relative z-20">
                {/* FILTER CARD */}
                <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-zinc-200/50 border border-zinc-100">
                    {/* Goals */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-3 px-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <Target size={12} className="text-teal-500" /> Target Goals
                            </label>
                            {selectedGoals.length > 0 && (
                                <span className="text-[9px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                                    {selectedGoals.length} Selected
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-2 px-2 snap-x">
                            {GOALS.map(g => {
                                const isSelected = selectedGoals.includes(g.label);
                                return (
                                    <button
                                        key={g.label}
                                        onClick={() => toggleGoal(g.label)}
                                        className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all snap-start ${isSelected ? 'bg-teal-600 border-teal-600 text-white shadow-md' : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-white hover:border-zinc-200'}`}
                                    >
                                        <g.icon size={14} strokeWidth={isSelected ? 2.5 : 2} />
                                        <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">{g.label}</span>
                                        {isSelected && <Check size={12} strokeWidth={3} className="ml-1 text-teal-200" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="mb-6">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3 pl-1">Product Category</label>
                        <div className="grid grid-cols-3 gap-2">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.label}
                                    onClick={() => setSelectedCategory(cat.label)}
                                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${selectedCategory === cat.label ? 'bg-teal-50 border-teal-500 text-teal-700 shadow-inner' : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-white hover:border-zinc-200'}`}
                                >
                                    <cat.icon size={18} className="mb-1.5" strokeWidth={selectedCategory === cat.label ? 2.5 : 2} />
                                    <span className="text-[10px] font-bold">{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Price Slider */}
                    <div className="mb-6">
                        <div className="flex justify-between items-end mb-3 px-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Max Budget</label>
                            <span className="text-lg font-black text-zinc-900">RM {maxPrice}</span>
                        </div>
                        <input 
                            type="range" 
                            min="20" 
                            max="500" 
                            step="10" 
                            value={maxPrice} 
                            onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                            className="w-full h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-teal-600"
                        />
                    </div>

                    {/* Button */}
                    <div className="space-y-3">
                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating || selectedGoals.length === 0}
                            className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-zinc-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100"
                        >
                            <Search size={18} />
                            {!isPaid && !hasFreeUsage ? 'Unlock Full Access' : selectedGoals.length === 0 ? 'Select a Goal' : 'Find Matches'}
                        </button>
                    </div>
                </div>
            </div>

            {/* RESULTS */}
            <div className="px-6 mt-8 space-y-4">
                {results.length > 0 ? (
                    <div className="animate-in slide-in-from-bottom-4 duration-500">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Sparkles size={14} className="text-teal-500" /> Top Recommendations
                        </h3>
                        <div className="space-y-4">
                            {results.map((prod, idx) => {
                                const isSaved = savedIds.includes(prod.name);
                                return (
                                    <div 
                                        key={idx} 
                                        className="w-full text-left bg-white p-5 rounded-[1.5rem] shadow-sm border border-zinc-100 relative overflow-hidden"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-bold text-zinc-900 text-lg leading-tight mb-1">{prod.name}</h4>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{prod.brand}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleSave(prod)}
                                                disabled={isSaved}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${isSaved ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-white border-zinc-200 text-zinc-400 hover:text-rose-500 hover:border-rose-200'}`}
                                            >
                                                <Heart size={16} fill={isSaved ? "currentColor" : "none"} />
                                            </button>
                                        </div>
                                        
                                        <p className="text-xs text-zinc-600 font-medium leading-relaxed mb-4 border-l-2 border-teal-100 pl-3">
                                            {prod.reason}
                                        </p>
                                        
                                        <div className="flex items-center gap-3">
                                            {renderStars(prod.rating)}
                                            <div className="w-px h-3 bg-zinc-200"></div>
                                            <span className="text-xs font-bold text-zinc-900">{prod.price}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                     <div className="text-center py-10 opacity-60">
                         <p className="text-sm font-medium text-zinc-400">Results will appear here.</p>
                     </div>
                )}
            </div>
        </div>
    );
};

export default PremiumRoutineBuilder;
