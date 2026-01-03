
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { generateRetouchedImage, generateImprovementPlan } from '../services/geminiService';
import { ArrowLeft, Sparkles, Loader, Eye, Activity, Microscope, Sun, Moon, Beaker, Syringe, AlertTriangle, Terminal, PlayCircle, Zap } from 'lucide-react';

interface SkinSimulatorProps {
    user: UserProfile;
    onBack: () => void;
    location?: string;
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

// Optimization: Downscale image before sending to AI to save Token Quota
const resizeForAI = (base64Str: string, maxWidth = 512): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Compress to 0.7 to further reduce payload size
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            } else {
                resolve(base64Str);
            }
        };
        img.onerror = () => resolve(base64Str);
    });
};

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack, location }) => {
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [retouchedImage, setRetouchedImage] = useState<string | null>(null);
    const [opacity, setOpacity] = useState(0); 
    
    const [isLoading, setIsLoading] = useState(true);
    const [statusText, setStatusText] = useState("Preparing photo...");
    const [error, setError] = useState<string | null>(null);
    
    // Fallback Mode State
    const [isLocalFallback, setIsLocalFallback] = useState(false);

    // Plan State
    const [plan, setPlan] = useState<any>(null);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

    useEffect(() => {
        if (user.faceImage) {
            setOriginalImage(user.faceImage);
            
            const imgHash = simpleHash(user.faceImage);
            const cacheKey = `skinos_retouch_v3_${imgHash}`;
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
        setError(null);
        setIsLocalFallback(false);
        setStatusText("Optimizing image for AI...");
        
        try {
            // 1. Resize Image (Critical for Free Tier Quota)
            const optimizedImage = await resizeForAI(user.faceImage);
            
            setStatusText("Simulating healthy skin...");
            const result = await generateRetouchedImage(optimizedImage);
            
            setRetouchedImage(result);
            setOpacity(1.0);
            setIsLoading(false);

            // Cache Success
            try {
                const imgHash = simpleHash(user.faceImage);
                localStorage.setItem(`skinos_retouch_v3_${imgHash}`, result);
            } catch (e) {}

        } catch (e: any) {
            console.error("AI Retouch Failed:", e);
            
            // AUTOMATIC FALLBACK ON QUOTA ERROR
            if (e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('limit')) {
                console.warn("Quota exceeded. Activating Local Simulation Mode.");
                activateLocalFallback();
            } else {
                // Show error for non-quota issues (like safety filters)
                let cleanMessage = "Generation failed.";
                if (e.message) cleanMessage = e.message.substring(0, 100);
                setError(cleanMessage);
                setIsLoading(false);
            }
        }
    };

    const activateLocalFallback = () => {
        setIsLocalFallback(true);
        // Use original image as base, we will apply CSS filters
        setRetouchedImage(user.faceImage); 
        setOpacity(1.0);
        setIsLoading(false);
        setError(null);
    };

    const handleGeneratePlan = async () => {
        if (!originalImage) return;
        setIsGeneratingPlan(true);
        
        // Use a placeholder for target image if we are in fallback mode to avoid sending huge data
        const targetToSend = isLocalFallback ? originalImage : (retouchedImage || originalImage);

        try {
            // Resize inputs for plan generation too
            const smallOriginal = await resizeForAI(originalImage, 400);
            const smallTarget = await resizeForAI(targetToSend, 400);

            const data = await generateImprovementPlan(smallOriginal, smallTarget, user);
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
                const val = slider ? parseInt(slider.value) / 100 : 1;
                topLayer.style.opacity = val.toString();
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col font-sans animate-in fade-in duration-500 overflow-y-auto">
            {/* Header */}
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
                                style={{ 
                                    opacity: opacity,
                                    // IF LOCAL FALLBACK: Apply CSS filters to simulate better skin
                                    // Brightness boost, slight blur for texture smoothing, contrast for clarity
                                    filter: isLocalFallback ? 'brightness(1.08) contrast(1.05) saturate(1.05) blur(0.5px)' : 'none'
                                }}
                            />
                        )}
                        
                        {/* Fallback Badge */}
                        {isLocalFallback && !isLoading && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-amber-900/80 backdrop-blur-md text-amber-100 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border border-amber-500/30 flex items-center gap-2">
                                <Zap size={12} className="fill-amber-400 text-amber-400" />
                                High Traffic: Simulation Mode
                            </div>
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
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl p-6 text-center">
                                <AlertTriangle size={32} className="text-rose-500 mb-4" />
                                <h3 className="text-white font-bold text-lg mb-2">Generation Failed</h3>
                                <p className="text-rose-200 text-xs font-medium mb-6 leading-relaxed max-w-xs mx-auto">
                                    {error}
                                </p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    <button 
                                        onClick={startGeneration} 
                                        className="w-full px-6 py-3 bg-white text-black rounded-full text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                                    >
                                        Try Again
                                    </button>
                                    <button 
                                        onClick={activateLocalFallback} 
                                        className="w-full px-6 py-3 bg-zinc-800 text-zinc-300 rounded-full text-xs font-bold uppercase tracking-widest hover:text-white transition-colors flex items-center justify-center gap-2 border border-zinc-700"
                                    >
                                        <PlayCircle size={12} /> Use Local Simulation
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. CONTENT SHEET */}
                <div className="bg-zinc-50 min-h-[50vh] relative z-20 -mt-8 rounded-t-[2.5rem] p-6 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">
                    
                    {/* Controls */}
                    <div className="mb-10">
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

                    {/* PLAN CONTENT */}
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
                            <div className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-xl shadow-zinc-100/50 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-bl-full -mr-4 -mt-4 opacity-50 pointer-events-none"></div>
                                <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                                    <Microscope size={14} className="text-teal-500" /> Assessment
                                </h4>
                                <p className="text-sm text-zinc-600 font-medium leading-relaxed relative z-10">
                                    {plan.analysis}
                                </p>
                            </div>

                            <div className="relative pl-4 space-y-8">
                                <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-zinc-200 border-l border-dashed border-zinc-300"></div>
                                {plan.weeks?.map((week: any, i: number) => (
                                    <div key={i} className="relative z-10">
                                        <div className="absolute -left-1 w-14 h-14 rounded-full bg-zinc-50 border-4 border-white flex items-center justify-center shadow-md z-20 text-zinc-400 font-black text-sm">
                                            {i + 1}
                                        </div>
                                        <div className="ml-16 bg-white rounded-[2rem] p-6 border border-zinc-100 shadow-sm relative overflow-hidden group hover:border-teal-100 transition-colors">
                                            <div className="flex justify-between items-start mb-4 border-b border-zinc-50 pb-4">
                                                <div>
                                                    <span className="text-[9px] font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded mb-1.5 inline-block uppercase tracking-wide border border-teal-100">
                                                        {week.title}
                                                    </span>
                                                    <h4 className="text-lg font-black text-zinc-900 tracking-tight leading-none">
                                                        {week.phaseName || "Treatment Phase"}
                                                    </h4>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex gap-3 items-start">
                                                    <div className="mt-0.5 p-1.5 rounded-full bg-amber-50 text-amber-500 shrink-0"><Sun size={14} /></div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">AM Routine</span>
                                                        <p className="text-xs text-zinc-600 font-medium leading-snug">{week.morning}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-3 items-start">
                                                    <div className="mt-0.5 p-1.5 rounded-full bg-indigo-50 text-indigo-500 shrink-0"><Moon size={14} /></div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-0.5">PM Routine</span>
                                                        <p className="text-xs text-zinc-600 font-medium leading-snug">{week.evening}</p>
                                                    </div>
                                                </div>
                                            </div>
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkinSimulator;
