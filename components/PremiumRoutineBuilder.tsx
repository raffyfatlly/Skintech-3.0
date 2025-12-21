
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { generateTargetedRecommendations } from '../services/geminiService';
import { Sparkles, ArrowLeft, DollarSign, Star, Crown, Lock, Search, Droplet, Sun, Zap, ShieldCheck, Loader, Sliders, AlertCircle } from 'lucide-react';

interface RecommendedProduct {
    name: string;
    brand: string;
    price: string;
    reason: string;
    rating: number;
    tier?: string;
}

interface PremiumRoutineBuilderProps {
    user: UserProfile;
    onBack: () => void;
    onUnlockPremium: () => void;
}

const CATEGORIES = [
    { label: 'Cleanser', icon: Droplet },
    { label: 'Toner', icon: Sparkles },
    { label: 'Serum', icon: Zap },
    { label: 'Moisturizer', icon: ShieldCheck },
    { label: 'Sunscreen', icon: Sun },
    { label: 'Mask', icon: Star },
];

const PremiumRoutineBuilder: React.FC<PremiumRoutineBuilderProps> = ({ user, onBack, onUnlockPremium }) => {
    // Input State
    const [selectedCategory, setSelectedCategory] = useState('Cleanser');
    const [maxPrice, setMaxPrice] = useState(100);
    const [allergies, setAllergies] = useState('');
    
    // Result State
    const [results, setResults] = useState<RecommendedProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const isPaid = !!user.isPremium; 

    const handleGenerate = async () => {
        if (!isPaid) return onUnlockPremium();
        
        setLoading(true);
        setResults([]);
        setHasSearched(true);
        
        try {
            const data = await generateTargetedRecommendations(user, selectedCategory, maxPrice, allergies);
            setResults(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // If not paid, show paywall immediately
    if (!isPaid) {
        return (
            <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-6 text-center text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-md mb-6 border border-white/20 shadow-lg">
                    <Lock size={32} />
                </div>
                <h2 className="text-3xl font-black mb-4">Unlock Routine Architect</h2>
                <p className="text-zinc-400 max-w-sm mx-auto mb-8">Get precise, budget-conscious product recommendations tailored to your skin DNA.</p>
                <button 
                    onClick={onUnlockPremium}
                    className="bg-gradient-to-r from-teal-400 to-emerald-500 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg hover:scale-105 transition-transform active:scale-95 flex items-center gap-2"
                >
                    <Sparkles size={18} className="text-yellow-300" /> Unlock Now
                </button>
                <button onClick={onBack} className="mt-6 text-sm text-zinc-500 font-bold hover:text-white transition-colors">No Thanks</button>
            </div>
        );
    }

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
                    
                    {/* Categories */}
                    <div className="mb-6">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-3 pl-1">Target Category</label>
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
                    <button 
                        onClick={handleGenerate}
                        disabled={loading}
                        className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-zinc-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader size={18} className="animate-spin text-zinc-500" /> : <Search size={18} />}
                        {loading ? 'Analyzing Options...' : 'Find Matches'}
                    </button>
                </div>
            </div>

            {/* RESULTS AREA */}
            <div className="px-6 mt-8 space-y-4">
                {hasSearched && results.length > 0 && (
                    <div className="animate-in slide-in-from-bottom-4 duration-500">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Sparkles size={14} className="text-teal-500" /> Top Recommendations
                        </h3>
                        <div className="space-y-4">
                            {results.map((prod, idx) => (
                                <div key={idx} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-zinc-100 relative overflow-hidden group hover:border-teal-200 transition-colors">
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
                                </div>
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
