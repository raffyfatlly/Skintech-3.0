
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { generateImprovementPlan } from '../services/geminiService';
import { upscaleImage } from '../services/falService'; // Using Fal Service
import { ArrowLeft, Sparkles, Loader, Activity, Microscope, Sun, Moon, Beaker, MoveHorizontal, Download, AlertCircle, ScanFace } from 'lucide-react';

interface SkinSimulatorProps {
    user: UserProfile;
    onBack: () => void;
    location?: string;
}

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack }) => {
    const [sliderPos, setSliderPos] = useState(0.5); // 0 to 1
    
    // AI State
    const [isRetouching, setIsRetouching] = useState(false);
    const [retouchedImage, setRetouchedImage] = useState<string | null>(null);
    const [errorText, setErrorText] = useState<string | null>(null);
    const [hasAutoStarted, setHasAutoStarted] = useState(false);
    
    // Plan State
    const [plan, setPlan] = useState<any>(null);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);

    // Helper: Resize image to prevent API Payload Limit errors (Good for Fal upload speed too)
    const optimizeImageForUpload = (base64Str: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_DIM = 1024; // Fal supports higher res
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_DIM) {
                        height *= MAX_DIM / width;
                        width = MAX_DIM;
                    }
                } else {
                    if (height > MAX_DIM) {
                        width *= MAX_DIM / height;
                        height = MAX_DIM;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.9));
                } else {
                    resolve(base64Str);
                }
            };
            img.onerror = () => resolve(base64Str);
        });
    };

    // AUTO RETOUCH TRIGGER
    useEffect(() => {
        if (!hasAutoStarted && !isRetouching && !retouchedImage && user.faceImage && !errorText) {
            setHasAutoStarted(true);
            handleAiRetouch(user.faceImage);
        }
    }, [hasAutoStarted, user.faceImage, errorText]);

    const handleInteraction = (clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        setSliderPos(x / rect.width);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        handleInteraction(e.touches[0].clientX);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (e.buttons === 1) {
            handleInteraction(e.clientX);
        }
    };

    const handleAiRetouch = async (sourceImage: string) => {
        setIsRetouching(true);
        setErrorText(null);
        try {
            // 1. Optimize Image
            const optimizedSource = await optimizeImageForUpload(sourceImage);

            // 2. Call Fal Service (Flux Model)
            const hdUrl = await upscaleImage(optimizedSource);
            setRetouchedImage(hdUrl);
        } catch (e: any) {
            console.error("Retouch Failed", e);
            // Display specific error for debugging
            if (e.message?.includes("Missing FAL_KEY")) {
                setErrorText("System Error: FAL Key Missing");
            } else if (e.message?.includes("timeout")) {
                setErrorText("Server Busy. Please try again.");
            } else {
                // Show the actual error message to help identify 403s etc
                setErrorText(e.message || "Simulation Failed. Please try again.");
            }
        } finally {
            setIsRetouching(false);
        }
    };

    const handleGeneratePlan = async () => {
        if (!user.faceImage || !retouchedImage) return;
        setIsGeneratingPlan(true);
        try {
            const data = await generateImprovementPlan(user.faceImage, retouchedImage, user);
            setPlan(data);
        } catch (e) {
            console.error("Plan Gen Error", e);
        } finally {
            setIsGeneratingPlan(false);
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
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg pointer-events-auto">
                    <span className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <ScanFace size={12} className="text-teal-400" /> Clinical Projector
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 relative flex flex-col">
                
                {/* IMAGE AREA */}
                <div 
                    ref={containerRef}
                    className="flex-1 w-full bg-zinc-900 relative overflow-hidden cursor-col-resize touch-none"
                    onTouchMove={handleTouchMove}
                    onMouseMove={handleMouseMove}
                    onClick={handleMouseMove}
                >
                    <div className="w-full h-full flex items-center justify-center relative">
                        
                        {/* 1. ORIGINAL IMAGE (Background / "Before") */}
                        {user.faceImage && (
                            <img 
                                src={user.faceImage} 
                                className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-80" 
                                alt="Original"
                            />
                        )}

                        {/* 2. RETOUCHED IMAGE (Foreground / "After") - Only if ready */}
                        {retouchedImage && (
                            <div 
                                className="absolute inset-0 w-full h-full"
                                style={{ 
                                    clipPath: `inset(0 ${100 - (sliderPos * 100)}% 0 0)` // Show left side (0 to slider)
                                }}
                            >
                                <img 
                                    src={retouchedImage} 
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
                                    alt="AI Result"
                                />
                            </div>
                        )}

                        {/* STATUS OVERLAYS */}
                        
                        {/* Loading / Processing */}
                        {isRetouching && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                                <div className="relative mb-6">
                                    <div className="absolute inset-0 bg-teal-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                    <Loader size={48} className="text-teal-400 animate-spin relative z-10" />
                                </div>
                                <p className="text-white font-bold text-xs uppercase tracking-widest animate-pulse">Generating Projection...</p>
                            </div>
                        )}

                        {/* Error State */}
                        {errorText && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in p-6 text-center">
                                <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-4 border border-rose-500/50">
                                    <AlertCircle size={32} className="text-rose-500" />
                                </div>
                                <h3 className="text-white font-bold text-lg mb-2">Simulation Failed</h3>
                                <p className="text-zinc-400 text-sm max-w-xs leading-relaxed mb-6 break-words">{errorText}</p>
                                <button 
                                    onClick={() => handleAiRetouch(user.faceImage!)}
                                    className="bg-white text-zinc-900 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}
                        
                        {/* SLIDER CONTROLS (Only when result is ready) */}
                        {retouchedImage && !isRetouching && (
                            <>
                                {/* Labels */}
                                <div className="absolute top-1/2 left-4 -translate-y-1/2 bg-black/40 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300 shadow-lg border border-white/10" style={{ opacity: sliderPos > 0.1 ? 1 : 0 }}>
                                    Projected
                                </div>
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 bg-black/40 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300 shadow-lg border border-white/10" style={{ opacity: sliderPos < 0.9 ? 1 : 0 }}>
                                    Current
                                </div>
                                
                                {/* Separator Line */}
                                <div 
                                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)] pointer-events-none z-30"
                                    style={{ left: `${sliderPos * 100}%` }}
                                ></div>

                                {/* Draggable Handle */}
                                <div 
                                    className="absolute top-1/2 w-10 h-10 -ml-5 -mt-5 bg-white rounded-full shadow-2xl flex items-center justify-center text-teal-600 pointer-events-none z-30 border-4 border-black/20"
                                    style={{ left: `${sliderPos * 100}%` }}
                                >
                                    <MoveHorizontal size={20} />
                                </div>

                                {/* "AI Enhanced" Badge */}
                                <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-teal-500/20 backdrop-blur-md text-teal-200 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none border border-teal-500/30 shadow-lg animate-in fade-in slide-in-from-top-2">
                                     Flux Clinical Engine
                                 </div>
                            </>
                        )}
                    </div>
                </div>

                {/* CONTROLS SHEET - Minimized */}
                <div className="bg-zinc-50 relative z-20 rounded-t-[2rem] p-6 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)] shrink-0 pb-safe">
                    
                    {/* ROADMAP HEADER */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100">
                                <Activity size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-zinc-900 tracking-tight leading-none">Clinical Protocol</h3>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Achieve this result</p>
                            </div>
                        </div>
                        
                        <div className="flex gap-2">
                            {retouchedImage && (
                                <a 
                                    href={retouchedImage} 
                                    download="skinos-projection.jpg" 
                                    className="bg-white border border-teal-100 text-teal-600 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-teal-50 transition-colors flex items-center gap-2"
                                >
                                    <Download size={12} /> Save
                                </a>
                            )}

                            {!plan && !isGeneratingPlan && !isRetouching && !errorText && (
                                <button 
                                    onClick={handleGeneratePlan}
                                    className="bg-zinc-900 text-white px-5 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                >
                                    <Sparkles size={12} className="text-amber-300" /> Generate Plan
                                </button>
                            )}
                        </div>
                    </div>

                    {/* PLAN CONTENT */}
                    {isGeneratingPlan && (
                        <div className="py-8 text-center animate-in fade-in">
                            <div className="flex justify-center gap-2 mb-3">
                                <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce delay-200"></div>
                            </div>
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Designing Protocol...</p>
                        </div>
                    )}

                    {plan && (
                        <div className="space-y-6 mt-6 animate-in slide-in-from-bottom-8 duration-700">
                            <div className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-bl-full -mr-4 -mt-4 opacity-50 pointer-events-none"></div>
                                <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 flex items-center gap-2 relative z-10">
                                    <Microscope size={14} className="text-teal-500" /> AI Analysis
                                </h4>
                                <p className="text-xs text-zinc-600 font-medium leading-relaxed relative z-10">
                                    {plan.analysis}
                                </p>
                            </div>

                            <div className="relative pl-4 space-y-6">
                                <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-zinc-200 border-l border-dashed border-zinc-300"></div>

                                {plan.weeks?.map((week: any, i: number) => (
                                    <div key={i} className="relative z-10">
                                        <div className="absolute -left-1 w-14 h-14 rounded-full bg-zinc-50 border-4 border-white flex items-center justify-center shadow-md z-20 text-zinc-400 font-black text-sm">
                                            {i + 1}
                                        </div>

                                        <div className="ml-16 bg-white rounded-2xl p-5 border border-zinc-100 shadow-sm relative group hover:border-teal-100 transition-colors">
                                            <div className="mb-3">
                                                <span className="text-[9px] font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded mb-1 inline-block uppercase tracking-wide border border-teal-100">
                                                    {week.title}
                                                </span>
                                                <h4 className="text-sm font-black text-zinc-900 tracking-tight">
                                                    {week.phaseName || "Treatment Phase"}
                                                </h4>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex gap-3 items-start">
                                                    <Sun size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-zinc-600 font-medium leading-snug">{week.morning}</p>
                                                </div>
                                                <div className="flex gap-3 items-start">
                                                    <Moon size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-zinc-600 font-medium leading-snug">{week.evening}</p>
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-3 border-t border-zinc-50 flex flex-wrap gap-2">
                                                {week.ingredients?.map((ing: string, idx: number) => (
                                                    <div key={idx} className="flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-lg text-zinc-500">
                                                        <Beaker size={10} />
                                                        <span className="text-[9px] font-bold uppercase tracking-wide">{ing}</span>
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
