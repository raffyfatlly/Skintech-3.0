
import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, SkinMetrics, RecommendedProduct } from '../types';
import { generateTargetedRecommendations } from '../services/geminiService';
import { Sparkles, ArrowLeft, DollarSign, Star, Crown, Lock, Search, Droplet, Sun, Zap, ShieldCheck, Loader, Sliders, AlertCircle, Target, CheckCircle2, Check, ArrowRight } from 'lucide-react';

interface PremiumRoutineBuilderProps {
    user: UserProfile;
    onBack: () => void;
    onUnlockPremium: () => void;
    usageCount: number;
    onIncrementUsage: () => void;
    onProductSelect: (product: { name: string, brand: string }) => void;
    savedResults: RecommendedProduct[];
    onSaveResults: (results: RecommendedProduct[]) => void;
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
    { label: 'Hydration Boost', icon: Droplet },
    { label: 'Anti-Aging', icon: Star }, 
    { label: 'Brightening', icon: Sun },
    { label: 'Soothe Redness', icon: ShieldCheck },
    { label: 'Oil Control', icon: Sliders },
];

const PremiumRoutineBuilder: React.FC<PremiumRoutineBuilderProps> = ({ user, onBack, onUnlockPremium, usageCount, onIncrementUsage, onProductSelect, savedResults, onSaveResults }) => {
    // Auto-select Goal Logic
    const defaultGoal = useMemo(() => {
        const b = user.biometrics;
        if (b.acneActive < 65) return 'Clear Acne';
        if (b.redness < 65) return 'Soothe Redness';
        if (b.hydration < 50) return 'Hydration Boost';
        if (b.wrinkleFine < 70) return 'Anti-Aging';
        if (b.pigmentation < 70) return 'Brightening';
        return 'Hydration Boost';
    }, [user.biometrics]);

    // Input State
    const [selectedGoals, setSelectedGoals] = useState<string[]>([defaultGoal]);
    const [selectedCategory, setSelectedCategory] = useState('Cleanser');
    const [maxPrice, setMaxPrice] = useState(100);
    const [allergies, setAllergies] = useState('');
    
    // Result State - Initialize from SAVED results
    const [results, setResults] = useState<RecommendedProduct[]>(savedResults);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(savedResults.length > 0);
    
    // Loading Animation State
    const [loadingText, setLoadingText] = useState("Initializing Architect...");

    // Cycle through affirmations while loading
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (loading) {
            const messages = [
                "Initiating holistic search...",
                `Scanning 5 top-rated ${selectedCategory} candidates...`,
                "Cross-referencing with your biometrics...",
                "Filtering allergens and price...",
                "Selecting the top 3 best matches..."
            ];
            let i = 0;
            setLoadingText(messages[0]);
            interval = setInterval(() => {
                i = (i + 1) % messages.length;
                setLoadingText(messages[i]);
            }, 3000); // Slower updates for heavier process
        }
        return () => clearInterval(interval);
    }, [loading, selectedCategory]);

    const isPaid = !!user.isPremium; 
    const hasFreeUsage = usageCount < LIMIT_ROUTINES;

    const toggleGoal = (goal: string) => {
        if (selectedGoals.includes(goal)) {
            setSelectedGoals(selectedGoals.filter(g => g !== goal));
        } else {
            setSelectedGoals([...selectedGoals, goal]);
        }
    };

    const handleGenerate = async () => {
        // Enforce limit
        if (!isPaid && !hasFreeUsage) {
            return onUnlockPremium();
        }
        
        // Ensure at least one goal
        if (selectedGoals.length === 0) return;

        // If free, increment
        if (!isPaid) {
            onIncrementUsage();
        }

        setLoading(true);
        // REMOVED: setResults([]); -> Keeps previous results visible
        setHasSearched(true);
        
        try {
            const data = await generateTargetedRecommendations(user, selectedCategory, maxPrice, allergies, selectedGoals);
            setResults(data);
            onSaveResults(data); // Save to parent App state
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 pb-32 animate-in fade-in slide-in-from-bottom-8 duration-500 font-sans">
            {/* HERO HEADER */}
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
                    
                    {/* PRIMARY GOAL SELECTOR */}
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
                        <p className="text-[9px] text-zinc-400 font-medium px-1 mt-1">Select multiple goals to refine your search.</p>
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
                        <div className="flex justify-between mt-2 px-1 text-[10px] font-bold text-zinc-400">
                            <span>RM 20</span>
                            <span>RM 500+</span>
                        </div>
                    </div>

                    {/* Allergies Input */}
                    <div className="mb-6">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2 pl-1">Avoid Ingredients (Optional)</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={allergies}
                                onChange={(e) => setAllergies(e.target.value)}
                                placeholder="e.g. Fragrance, Alcohol, Niacinamide"
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-4 pr-10 py-3 text-sm font-medium text-zinc-900 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 placeholder:text-zinc-400"
                            />
                            <AlertCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300" />
                        </div>
                    </div>

                    {/* Generate Button */}
                    <div className="space-y-3">
                        <button 
                            onClick={handleGenerate}
                            disabled={loading || selectedGoals.length === 0}
                            className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-zinc-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100"
                        >
                            {loading ? <Loader size={18} className="animate-spin text-zinc-500" /> : <Search size={18} />}
                            {loading ? 'Processing...' : (!isPaid && !hasFreeUsage ? 'Unlock Full Access' : selectedGoals.length === 0 ? 'Select a Goal' : 'Find Matches')}
                        </button>
                        {!isPaid && (
                            <p className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-wide">
                                {hasFreeUsage ? '1 Free Generation Available' : 'Free Limit Reached'}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* RESULTS AREA */}
            <div className="px-6 mt-8 space-y-4">
                {/* LOADING STATE - Now with affirmations */}
                {loading && (
                    <div className="py-12 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-2">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 relative shadow-md">
                             <div className="absolute inset-0 border-4 border-zinc-100 rounded-full"></div>
                             <div className="absolute inset-0 border-4 border-t-teal-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                             <Sparkles className="text-teal-600 animate-pulse" size={24} />
                        </div>
                        <h3 className="text-lg font-black text-zinc-900 mb-2">Building Routine</h3>
                        <p className="text-sm text-zinc-500 font-medium animate-pulse max-w-[200px] leading-relaxed">{loadingText}</p>
                    </div>
                )}

                {hasSearched && !loading && results.length > 0 && (
                    <div className="animate-in slide-in-from-bottom-4 duration-500">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Sparkles size={14} className="text-teal-500" /> Top Recommendations
                        </h3>
                        <div className="space-y-4">
                            {results.map((prod, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => onProductSelect({ name: prod.name, brand: prod.brand })}
                                    className="w-full text-left bg-white p-5 rounded-[1.5rem] shadow-sm border border-zinc-100 relative overflow-hidden group hover:border-teal-200 transition-colors active:scale-[0.99]"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-bold text-zinc-900 text-lg leading-tight mb-1">{prod.name}</h4>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{prod.brand}</p>
                                        </div>
                                        <div className="bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-100 text-xs font-black text-zinc-900 whitespace-nowrap">
                                            {prod.price}
                                        </div>
                                    </div>
                                    
                                    <p className="text-xs text-zinc-600 font-medium leading-relaxed mb-4 border-l-2 border-teal-100 pl-3">
                                        {prod.reason}
                                    </p>
                                    
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-[10px] font-bold border border-emerald-100 flex items-center gap-1">
                                                <ShieldCheck size={10} /> {prod.rating}% Match
                                            </div>
                                            {prod.tier && (
                                                <div className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold border border-indigo-100 uppercase">
                                                    {prod.tier}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-[10px] font-bold text-zinc-400 uppercase flex items-center gap-1 group-hover:text-teal-600 transition-colors">
                                            Analyze & Add <ArrowRight size={12} />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                {hasSearched && !loading && results.length === 0 && (
                     <div className="text-center py-10 opacity-60">
                         <p className="text-sm font-medium text-zinc-400">No matches found within this budget. Try adjusting your filters.</p>
                     </div>
                )}
            </div>
        </div>
    );
};

export default PremiumRoutineBuilder;
