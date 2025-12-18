
import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { generateRoutineRecommendations } from '../services/geminiService';
import { startCheckout } from '../services/stripeService';
import { Sparkles, ArrowLeft, Sun, Moon, DollarSign, Star, Zap, ShieldCheck, Loader, ChevronDown, CheckCircle2, Crown, Lock } from 'lucide-react';

interface RoutineProduct {
    name: string;
    brand: string;
    tier: 'BUDGET' | 'VALUE' | 'LUXURY';
    price: string;
    reason: string;
    rating: number;
}

interface RoutineStep {
    step: string;
    products: RoutineProduct[];
}

interface RoutineData {
    am: RoutineStep[];
    pm: RoutineStep[];
}

interface PremiumRoutineBuilderProps {
    user: UserProfile;
    onBack: () => void;
    onUnlockPremium: () => void;
}

const PremiumRoutineBuilder: React.FC<PremiumRoutineBuilderProps> = ({ user, onBack, onUnlockPremium }) => {
    const [activeTab, setActiveTab] = useState<'AM' | 'PM'>('AM');
    const [routine, setRoutine] = useState<RoutineData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
    
    // Check if user is premium
    const isPaid = !!user.isPremium; 

    useEffect(() => {
        if (!isPaid) return; // Don't fetch if not paid

        const fetchRoutine = async () => {
            setLoading(true);
            try {
                const data = await generateRoutineRecommendations(user);
                if (data && data.am) {
                    setRoutine(data);
                    // Auto-expand first step
                    if (data.am.length > 0) {
                        setExpandedSteps({ [`AM-0`]: true });
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchRoutine();
    }, [user, isPaid]);

    const toggleStep = (key: string) => {
        setExpandedSteps(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const getTierColor = (tier: string) => {
        switch(tier) {
            case 'BUDGET': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'VALUE': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
            case 'LUXURY': return 'bg-amber-50 text-amber-700 border-amber-100';
            default: return 'bg-zinc-50';
        }
    };

    const getTierLabel = (tier: string) => {
         switch(tier) {
            case 'BUDGET': return 'Smart Save';
            case 'VALUE': return 'Best Value';
            case 'LUXURY': return 'Premium';
            default: return tier;
        }
    };

    const getTierIcon = (tier: string) => {
        switch(tier) {
            case 'BUDGET': return <DollarSign size={12} />;
            case 'VALUE': return <Star size={12} />;
            case 'LUXURY': return <Crown size={12} />;
            default: return <Sparkles size={12} />;
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
                <h2 className="text-3xl font-black mb-4">Unlock Premium Routine</h2>
                <p className="text-zinc-400 max-w-sm mx-auto mb-8">Get personalized 3-tier product recommendations (Budget, Value, Luxury) for every step of your routine.</p>
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

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="relative mb-8">
                     <div className="w-24 h-24 bg-teal-500/10 rounded-full animate-ping absolute inset-0"></div>
                     <div className="w-24 h-24 bg-white rounded-full relative z-10 flex items-center justify-center shadow-xl border border-teal-100">
                         <Sparkles size={48} className="text-teal-500 animate-pulse" />
                     </div>
                </div>
                <h2 className="text-2xl font-black text-zinc-900 mb-2">Building Your Routine...</h2>
                <p className="text-zinc-500 max-w-xs mx-auto text-sm">Our AI is analyzing thousands of products to find the perfect matches for your skin profile.</p>
            </div>
        );
    }

    const currentSteps = routine ? routine[activeTab.toLowerCase() as 'am' | 'pm'] : [];

    return (
        <div className="min-h-screen bg-white pb-32 animate-in fade-in slide-in-from-bottom-8 duration-500">
            {/* HERO HEADER - UPDATED TO TEAL (RGB 163, 206, 207) */}
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
                         <Crown size={12} className="text-amber-100" /> Premium Architect
                     </div>
                 </div>

                 <div className="relative z-10 text-white">
                     <h1 className="text-3xl font-black tracking-tight mb-2 drop-shadow-md">Your Perfect Routine</h1>
                     <p className="text-white/90 text-sm font-bold drop-shadow-sm">AI-curated products matched to your biomarkers.</p>
                 </div>

                 {/* TABS */}
                 <div className="flex gap-2 mt-8 relative z-10">
                     <button 
                        onClick={() => setActiveTab('AM')}
                        className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider transition-all shadow-md ${activeTab === 'AM' ? 'bg-white text-teal-800' : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'}`}
                     >
                         <Sun size={16} /> Morning
                     </button>
                     <button 
                        onClick={() => setActiveTab('PM')}
                        className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider transition-all shadow-md ${activeTab === 'PM' ? 'bg-indigo-600 text-white' : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'}`}
                     >
                         <Moon size={16} /> Evening
                     </button>
                 </div>
            </div>

            {/* CONTENT */}
            <div className="px-6 pt-8 space-y-6">
                {currentSteps.map((step, idx) => {
                    const stepKey = `${activeTab}-${idx}`;
                    const isExpanded = expandedSteps[stepKey];

                    return (
                        <div key={idx} className="border-b border-zinc-100 last:border-0 pb-6 last:pb-0">
                            <button 
                                onClick={() => toggleStep(stepKey)}
                                className="w-full flex items-center justify-between py-2 mb-2 group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center font-bold text-xs border border-zinc-200 group-hover:bg-teal-50 group-hover:text-teal-600 group-hover:border-teal-100 transition-colors">
                                        {idx + 1}
                                    </div>
                                    <h3 className="text-lg font-black text-zinc-900 uppercase tracking-tight group-hover:text-teal-600 transition-colors">{step.step}</h3>
                                </div>
                                <ChevronDown size={20} className={`text-zinc-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {isExpanded && (
                                <div className="grid gap-4 mt-4 animate-in slide-in-from-top-4 duration-300">
                                    {step.products.map((prod, pIdx) => (
                                        <div key={pIdx} className={`p-5 rounded-2xl border transition-all hover:scale-[1.01] hover:shadow-lg ${getTierColor(prod.tier)} bg-opacity-30 border-opacity-50 relative group/card`}>
                                            <div className="absolute top-4 right-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest bg-white bg-opacity-60 backdrop-blur-sm border border-black/5 shadow-sm`}>
                                                    {getTierIcon(prod.tier)} {getTierLabel(prod.tier)}
                                                </span>
                                            </div>

                                            <div className="pr-16">
                                                <h4 className="font-bold text-zinc-900 text-base leading-tight mb-1">{prod.name}</h4>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">{prod.brand}</p>
                                            </div>

                                            <p className="text-xs text-zinc-600 font-medium leading-relaxed mb-4">
                                                {prod.reason}
                                            </p>

                                            <div className="flex items-center justify-between pt-3 border-t border-black/5">
                                                 <div className="flex items-center gap-1 text-zinc-900 font-bold">
                                                     <span className="text-sm">{prod.price}</span>
                                                 </div>
                                                 <div className="flex items-center gap-1.5">
                                                     <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100/50 px-1.5 py-0.5 rounded border border-emerald-100">{prod.rating}% Match</span>
                                                 </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="p-6 bg-zinc-50 rounded-[2rem] text-center border border-zinc-100 mt-8">
                    <Sparkles className="w-8 h-8 text-teal-500 mx-auto mb-3" />
                    <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                        These recommendations are generated based on your unique skin metrics and analysis.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PremiumRoutineBuilder;
