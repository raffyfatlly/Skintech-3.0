
import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { generateRetouchedImage, generateImprovementPlan } from '../services/geminiService';
import { ArrowLeft, Sparkles, Loader, Eye, ScanFace, Calendar, Sun, Moon, Beaker, Syringe, ArrowRight, Check, Activity, Microscope } from 'lucide-react';

interface SkinSimulatorProps {
    user: UserProfile;
    onBack: () => void;
}

const simpleHash = (str: string) => {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash;
};

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack }) => {
    // Two-Layer Stack State
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [retouchedImage, setRetouchedImage] = useState<string | null>(null);
    const [opacity, setOpacity] = useState(0); // 0.0 (Original) to 1.0 (Retouched)
    
    const [isLoading, setIsLoading] = useState(true);
    const [statusText, setStatusText] = useState("Preparing photo...");
    const [error, setError] = useState<string | null>(null);

    // Plan State
    const [plan, setPlan] = useState<any>(null);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

    // Initial Load & Cache Check
    useEffect(() => {
        if (user.faceImage) {
            setOriginalImage(user.faceImage);
            
            // Cache Check
            const imgHash = simpleHash(user.faceImage);
            const cacheKey = `skinos_retouch_${imgHash}`;
            const cachedData = localStorage.getItem(cacheKey);

            if (cachedData) {
                setRetouchedImage(cachedData);
                setOpacity(1.0);
                setIsLoading(false);
            } else {
                startGeneration();
            }
        } else {
            setError("No face image found. Please rescan.");
            setIsLoading(false);
        }
    }, [user.faceImage]);

    const startGeneration = async () => {
        if (!user.faceImage) return;
        setIsLoading(true);
        setStatusText("Analyzing skin health...");
        
        try {
            const result = await generateRetouchedImage(user.faceImage);
            setRetouchedImage(result);
            setOpacity(1.0); // Show result immediately upon completion
            setIsLoading(false);

            // Save to Cache
            try {
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('skinos_retouch_')) {
                        localStorage.removeItem(key);
                    }
                });
                
                const imgHash = simpleHash(user.faceImage);
                const cacheKey = `skinos_retouch_${imgHash}`;
                localStorage.setItem(cacheKey, result);
            } catch (storageErr) {
                console.warn("Storage full, could not cache retouch image");
            }

        } catch (e: any) {
            console.error("AI Retouch Error", e);
            if (e.message && e.message.includes("429")) {
                setError("Server busy. Please try again in a moment.");
            } else {
                setError("Could not generate simulation. Try a different photo.");
            }
            setIsLoading(false);
        }
    };

    const handleGeneratePlan = async () => {
        if (!originalImage || !retouchedImage) return;
        setIsGeneratingPlan(true);
        try {
            const data = await generateImprovementPlan(originalImage, retouchedImage, user);
            setPlan(data);
        } catch (e) {
            console.error("Plan Generation Error", e);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    const toggleCompare = (isPressed: boolean) => {
        if (!retouchedImage) return;
        const topLayer = document.getElementById('ai-layer');
        const slider = document.getElementById('clarity-slider') as HTMLInputElement;
        if (topLayer) {
            if (isPressed) {
                topLayer.style.opacity = '0';
            } else {
                topLayer.style.opacity = (parseInt(slider.value) / 100).toString();
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col font-sans animate-in fade-in duration-500 overflow-y-auto">
            {/* Header (Absolute) */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-40 pt-safe-top pointer-events-none">
                <button 
                    onClick={onBack}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors border border-white/10 pointer-events-auto"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
                    <span className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <Sparkles size={12} className="text-teal-400" /> Skin Simulator
                    </span>
                </div>
            </div>

            {/* SCROLL CONTAINER */}
            <div className="flex-1 relative flex flex-col">
                
                {/* 1. IMAGE AREA */}
                <div className="h-[60vh] w-full relative shrink-0 bg-zinc-900 overflow-hidden sticky top-0 z-0">
                    <div className="w-full h-full relative">
                        {originalImage && (
                            <img src={originalImage} className="absolute inset-0 w-full h-full object-cover z-0" alt="Original" />
                        )}
                        {retouchedImage && (
                            <img 
                                id="ai-layer"
                                src={retouchedImage} 
                                className="absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-150 ease-linear will-change-opacity" 
                                alt="Retouched"
                                style={{ opacity: opacity }}
                            />
                        )}
                        
                        {/* Loading/Error States */}
                        {isLoading && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in">
                                <div className="relative mb-6">
                                    <div className="absolute inset-0 bg-teal-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                    <Loader size={48} className="text-teal-400 animate-spin relative z-10" />
                                </div>
                                <p className="text-white font-bold text-xs uppercase tracking-widest animate-pulse">{statusText}</p>
                            </div>
                        )}
                        {error && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-6 text-center">
                                <p className="text-rose-400 font-bold text-sm mb-4">{error}</p>
                                <button onClick={onBack} className="px-6 py-2 bg-white text-black rounded-full text-xs font-bold uppercase tracking-widest">Close</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. CONTENT SHEET (Slides Over) */}
                <div className="bg-zinc-50 min-h-[50vh] relative z-20 -mt-8 rounded-t-[2.5rem] p-6 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">
                    
                    {/* Controls */}
                    <div className="mb-10">
                        {/* Compare Button */}
                        <div className="flex justify-center -mt-10 mb-6">
                             <button
                                onMouseDown={() => toggleCompare(true)}
                                onMouseUp={() => toggleCompare(false)}
                                onTouchStart={() => toggleCompare(true)}
                                onTouchEnd={() => toggleCompare(false)}
                                disabled={isLoading || !retouchedImage}
                                className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest hover:scale-105 transition-all active:scale-95 disabled:opacity-50 select-none touch-manipulation shadow-xl shadow-zinc-900/30"
                            >
                                <Eye size={14} /> Hold to Compare
                            </button>
                        </div>

                        {/* Slider */}
                        <div className="bg-white border border-zinc-200 rounded-[2rem] p-1 mb-2 shadow-sm relative flex items-center h-16">
                            <div className="pl-5 pr-3 flex flex-col items-start min-w-[90px]">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider truncate max-w-[80px]">Simulation</span>
                                <span className={`text-xl font-black ${opacity > 0 ? 'text-teal-600' : 'text-zinc-300'}`}>
                                    {Math.round(opacity * 100)}%
                                </span>
                            </div>
                            <div className="flex-1 relative h-full flex items-center pr-6">
                                <input 
                                    id="clarity-slider"
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={opacity * 100}
                                    disabled={isLoading || !retouchedImage}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setOpacity(val / 100);
                                    }}
                                    className="w-full h-1 bg-transparent appearance-none cursor-pointer z-20 relative disabled:cursor-not-allowed accent-teal-600"
                                />
                                <div className="absolute left-0 right-6 h-1 bg-zinc-100 rounded-full z-10 pointer-events-none overflow-hidden">
                                     <div className="h-full bg-gradient-to-r from-teal-400 to-teal-600" style={{ width: `${opacity * 100}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ROADMAP HEADER */}
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-4 mb-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100">
                                <Activity size={16} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-zinc-900 tracking-tight leading-none">Clinical Protocol</h3>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Your path to results</p>
                            </div>
                        </div>
                        {!plan && !isGeneratingPlan && retouchedImage && (
                            <button 
                                onClick={handleGeneratePlan}
                                className="bg-teal-600 text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-teal-600/20 hover:bg-teal-700 transition-colors flex items-center gap-2 animate-pulse"
                            >
                                <Sparkles size={12} /> Generate Plan
                            </button>
                        )}
                    </div>

                    {/* CONTENT AREA */}
                    {isGeneratingPlan && (
                        <div className="py-12 text-center animate-in fade-in">
                            <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4 text-teal-600 shadow-sm border border-teal-100">
                                <Loader size={24} className="animate-spin" />
                            </div>
                            <p className="text-sm font-bold text-zinc-900 mb-1">Consulting AI Dermatologist...</p>
                            <p className="text-xs text-zinc-500">Analyzing the gap between current and goal skin.</p>
                        </div>
                    )}

                    {plan && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-700">
                            
                            {/* Analysis Summary Card */}
                            <div className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-xl shadow-zinc-100/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-bl-full -mr-4 -mt-4 opacity-50 pointer-events-none"></div>
                                <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                                    <Microscope size={14} className="text-teal-500" /> Assessment
                                </h4>
                                <p className="text-sm text-zinc-600 font-medium leading-relaxed relative z-10">
                                    {plan.analysis}
                                </p>
                            </div>

                            {/* Vertical Timeline */}
                            <div className="relative pl-4 space-y-8">
                                {/* Timeline Line */}
                                <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-zinc-200 border-l border-dashed border-zinc-300"></div>

                                {plan.weeks?.map((week: any, i: number) => (
                                    <div key={i} className="relative z-10">
                                        {/* Phase Connector/Marker */}
                                        <div className="absolute -left-1 w-14 h-14 rounded-full bg-zinc-50 border-4 border-white flex items-center justify-center shadow-md z-20 text-zinc-400 font-black text-sm">
                                            {i + 1}
                                        </div>

                                        {/* Phase Content */}
                                        <div className="ml-16 bg-white rounded-[2rem] p-6 border border-zinc-100 shadow-sm relative overflow-hidden group hover:border-teal-100 transition-colors">
                                            
                                            {/* Phase Header */}
                                            <div className="flex justify-between items-start mb-4 border-b border-zinc-50 pb-4">
                                                <div>
                                                    <span className="text-[9px] font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded mb-1.5 inline-block uppercase tracking-wide border border-teal-100">
                                                        {week.title}
                                                    </span>
                                                    <h4 className="text-lg font-black text-zinc-900 tracking-tight leading-none">
                                                        {week.phaseName || "Treatment Phase"}
                                                    </h4>
                                                </div>
                                                {week.focus && (
                                                    <div className="text-right hidden sm:block">
                                                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Focus</span>
                                                        <span className="text-xs font-bold text-zinc-700">{week.focus}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Routine Grid */}
                                            <div className="space-y-4">
                                                <div className="flex gap-3 items-start">
                                                    <div className="mt-0.5 p-1.5 rounded-full bg-amber-50 text-amber-500 shrink-0">
                                                        <Sun size={14} />
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">AM Routine</span>
                                                        <p className="text-xs text-zinc-600 font-medium leading-snug">{week.morning}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-3 items-start">
                                                    <div className="mt-0.5 p-1.5 rounded-full bg-indigo-50 text-indigo-500 shrink-0">
                                                        <Moon size={14} />
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">PM Routine</span>
                                                        <p className="text-xs text-zinc-600 font-medium leading-snug">{week.evening}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Ingredients Footer */}
                                            <div className="mt-5 pt-4 border-t border-zinc-50 flex flex-wrap gap-2">
                                                {week.ingredients?.map((ing: string, idx: number) => (
                                                    <div key={idx} className="flex items-center gap-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-lg border border-zinc-100 text-zinc-500">
                                                        <Beaker size={10} />
                                                        <span className="text-[10px] font-bold uppercase tracking-wide">{ing}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Treatments Section if available */}
                            {plan.weeks?.some((w: any) => w.treatment) && (
                                <div className="mt-8 bg-violet-50/50 rounded-[2rem] p-6 border border-violet-100/50 relative overflow-hidden">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-violet-500 shadow-sm border border-violet-100">
                                            <Syringe size={18} />
                                        </div>
                                        <h3 className="text-sm font-black text-violet-900 uppercase tracking-widest">Professional Boost</h3>
                                    </div>
                                    <div className="space-y-2">
                                        {plan.weeks.map((w: any, i: number) => w.treatment && (
                                            <div key={i} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-violet-100 shadow-sm">
                                                <div className="w-6 h-6 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 text-[10px] font-bold shrink-0">
                                                    {i + 1}
                                                </div>
                                                <span className="text-xs font-bold text-zinc-700">{w.treatment}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkinSimulator;
