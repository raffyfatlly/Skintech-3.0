
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { generateImprovementPlan } from '../services/geminiService';
import { upscaleImage } from '../services/falService'; 
import { ArrowLeft, Sparkles, Loader, Activity, Microscope, Sun, Moon, Beaker, MoveHorizontal, Download, AlertCircle, ScanFace, ChevronDown, ChevronUp, CheckCircle2, Lock } from 'lucide-react';

interface SkinSimulatorProps {
    user: UserProfile;
    onBack: () => void;
    location?: string;
    onUpdateUser: (user: UserProfile) => void;
    // New Props for Freemium Logic
    usageCount: number;
    onIncrementUsage: () => void;
    isPremium: boolean;
    onUnlockPremium: () => void;
}

const LIMIT_SIMULATIONS = 1;

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack, onUpdateUser, usageCount, onIncrementUsage, isPremium, onUnlockPremium }) => {
    const [sliderPos, setSliderPos] = useState(0.5); // 0 to 1
    
    // AI State - Initialize from cached image if available
    const [isRetouching, setIsRetouching] = useState(false);
    const [retouchedImage, setRetouchedImage] = useState<string | null>(user.simulatedSkinImage || null);
    const [hasAutoStarted, setHasAutoStarted] = useState(!!user.simulatedSkinImage);
    const [errorText, setErrorText] = useState<string | null>(null);
    
    // Plan State - Init from user profile
    const [plan, setPlan] = useState<any>(user.simulatedSkinPlan || null);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [isPlanOpen, setIsPlanOpen] = useState(false); // Default closed to show image

    // Scroll Spy State
    const [activeStep, setActiveStep] = useState(0);
    const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);

    // Helper: Resize image
    const optimizeImageForUpload = (base64Str: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_DIM = 1024; 
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

    // Sync state
    useEffect(() => {
        if (user.simulatedSkinImage && !retouchedImage) {
            setRetouchedImage(user.simulatedSkinImage);
            setHasAutoStarted(true);
        }
        if (user.simulatedSkinPlan && !plan) {
            setPlan(user.simulatedSkinPlan);
        }
    }, [user.simulatedSkinImage, user.simulatedSkinPlan]);

    // Auto Retouch Trigger
    useEffect(() => {
        const alreadyHasImage = !!retouchedImage || !!user.simulatedSkinImage;
        // Don't auto start if they are out of free usage and not premium
        if (!hasAutoStarted && !isRetouching && !alreadyHasImage && user.faceImage && !errorText) {
            if (!isPremium && usageCount >= LIMIT_SIMULATIONS) {
                // Do not auto start, wait for user to click button so we can show lock
                return;
            }
            setHasAutoStarted(true);
            handleAiRetouch(user.faceImage);
        }
    }, [hasAutoStarted, isRetouching, retouchedImage, user.faceImage, user.simulatedSkinImage, errorText, isPremium, usageCount]);

    // Scroll Observer for Steps
    useEffect(() => {
        if (!isPlanOpen || !plan || !scrollContainerRef.current) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const idx = Number(entry.target.getAttribute('data-index'));
                    setActiveStep(idx);
                }
            });
        }, {
            root: scrollContainerRef.current,
            threshold: 0.6, // Higher threshold for clearer snap detection
            rootMargin: "0px"
        });

        stepRefs.current = stepRefs.current.slice(0, plan.weeks?.length || 0);
        stepRefs.current.forEach(el => {
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [isPlanOpen, plan]);

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

    const handleGeneratePlan = async (imgOverride?: string | any) => {
        // Enforce Limits
        if (!isPremium && usageCount >= LIMIT_SIMULATIONS && !plan) {
            onUnlockPremium();
            return;
        }

        const targetImage = (typeof imgOverride === 'string' ? imgOverride : null) || retouchedImage;
        if (!user.faceImage || !targetImage) return;
        
        setIsGeneratingPlan(true);
        setPlan(null);
        
        if (!isPremium) onIncrementUsage();

        try {
            const data = await generateImprovementPlan(user.faceImage, targetImage, user);
            setPlan(data);
            setIsPlanOpen(true);
            onUpdateUser({ 
                ...user, 
                simulatedSkinImage: targetImage, 
                simulatedSkinPlan: data 
            }); 
        } catch (e) {
            console.error("Plan Gen Error", e);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    const handleAiRetouch = async (sourceImage: string) => {
        // Enforce Limits
        if (!isPremium && usageCount >= LIMIT_SIMULATIONS && !retouchedImage) {
            onUnlockPremium();
            return;
        }

        setIsRetouching(true);
        setErrorText(null);
        
        if (!isPremium && !hasAutoStarted) onIncrementUsage();

        try {
            const optimizedSource = await optimizeImageForUpload(sourceImage);
            const hdUrl = await upscaleImage(optimizedSource);
            setRetouchedImage(hdUrl);
            onUpdateUser({ ...user, simulatedSkinImage: hdUrl, simulatedSkinPlan: undefined });
            setIsRetouching(false);
            await handleGeneratePlan(hdUrl);
        } catch (e: any) {
            console.error("Retouch Failed", e);
            if (e.message?.includes("Missing API Key")) setErrorText("System Error: API Key Missing");
            else if (e.message?.includes("timeout")) setErrorText("Server Busy. Please try again.");
            else setErrorText(e.message || "Simulation Failed. Please try again.");
            setHasAutoStarted(false); 
            setIsRetouching(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col font-sans animate-in fade-in duration-700 overflow-hidden selection:bg-teal-500 selection:text-white">
            
            {/* Header (Fixed Top) */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-40 pt-safe-top pointer-events-none">
                <button 
                    onClick={onBack}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors border border-white/10 pointer-events-auto active:scale-95 shadow-lg"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg pointer-events-auto">
                    <span className="text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                        <ScanFace size={14} className="text-teal-400" /> Glow Up Visualizer
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT LAYER */}
            <div className="flex-1 relative flex flex-col h-full">
                
                {/* IMAGE AREA */}
                <div 
                    ref={containerRef}
                    className="absolute inset-0 bg-zinc-900 cursor-col-resize touch-none z-0"
                    onTouchMove={handleTouchMove}
                    onMouseMove={handleMouseMove}
                    onClick={handleMouseMove}
                >
                    <div className="w-full h-full flex items-center justify-center relative">
                        {user.faceImage && (
                            <img 
                                src={user.faceImage} 
                                className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-80" 
                                alt="Original"
                            />
                        )}
                        {retouchedImage && (
                            <div 
                                className="absolute inset-0 w-full h-full"
                                style={{ clipPath: `inset(0 ${100 - (sliderPos * 100)}% 0 0)` }}
                            >
                                <img 
                                    src={retouchedImage} 
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
                                    alt="AI Result"
                                />
                            </div>
                        )}

                        {/* EMPTY STATE / LOCKED STATE */}
                        {!retouchedImage && !isRetouching && !errorText && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-700">
                                <div className="text-center max-w-xs">
                                    <div className="mb-6 mx-auto w-20 h-20 rounded-full bg-black/40 border border-white/20 flex items-center justify-center">
                                        <Sparkles size={32} className="text-teal-400" />
                                    </div>
                                    <h3 className="text-white font-black text-xl mb-2">Visualize Results</h3>
                                    <p className="text-zinc-300 text-sm font-medium mb-8 leading-relaxed">
                                        Use AI to see your skin after following the recommended protocol.
                                    </p>
                                    <button 
                                        onClick={() => handleAiRetouch(user.faceImage!)}
                                        className="bg-white text-zinc-900 px-8 py-4 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2 mx-auto"
                                    >
                                        <Sparkles size={14} className="text-teal-600" /> 
                                        {!isPremium && usageCount >= LIMIT_SIMULATIONS ? "Unlock Visualizer" : "Start Simulation"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Loading State */}
                        {isRetouching && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-700">
                                <div className="relative mb-8">
                                    <div className="absolute inset-0 bg-teal-500 blur-2xl opacity-20 rounded-full animate-pulse"></div>
                                    <div className="relative z-10 w-20 h-20 rounded-full border-2 border-teal-500/30 flex items-center justify-center animate-[spin_3s_linear_infinite]">
                                        <div className="w-16 h-16 rounded-full border-t-2 border-teal-400"></div>
                                    </div>
                                    <Sparkles size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-teal-400 animate-pulse" />
                                </div>
                                <p className="text-white font-bold text-xs uppercase tracking-[0.2em] animate-pulse">Visualising your glow up look...</p>
                            </div>
                        )}

                        {/* Error State */}
                        {errorText && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in p-6 text-center">
                                <AlertCircle size={32} className="text-rose-500 mb-4" />
                                <h3 className="text-white font-bold text-lg mb-2">Simulation Failed</h3>
                                <p className="text-zinc-400 text-sm max-w-xs leading-relaxed mb-6">{errorText}</p>
                                <button onClick={() => handleAiRetouch(user.faceImage!)} className="bg-white text-zinc-900 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors">Try Again</button>
                            </div>
                        )}
                        
                        {/* Slider UI */}
                        {retouchedImage && !isRetouching && (
                            <>
                                <div className="absolute top-0 bottom-0 w-0.5 bg-teal-400/50 shadow-[0_0_15px_rgba(45,212,191,0.5)] pointer-events-none z-30" style={{ left: `${sliderPos * 100}%` }}></div>
                                <div className="absolute top-1/2 w-12 h-12 -ml-6 -mt-6 bg-black/50 backdrop-blur-md rounded-full shadow-2xl flex items-center justify-center text-white pointer-events-none z-30 border border-white/20" style={{ left: `${sliderPos * 100}%` }}>
                                    <MoveHorizontal size={20} />
                                </div>
                                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex gap-12 pointer-events-none z-20">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest transition-opacity duration-300 ${sliderPos < 0.1 ? 'opacity-0' : 'opacity-60 text-white'}`}>Original</span>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest transition-opacity duration-300 ${sliderPos > 0.9 ? 'opacity-0' : 'opacity-100 text-teal-400 shadow-black drop-shadow-md'}`}>Glow Up</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* CONTROLS SHEET (Fixed Overlays) */}
                {/* 1. Minimized View (Bottom Bar) - Hidden when plan is open */}
                <div className={`absolute bottom-0 left-0 right-0 p-4 pb-safe z-20 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isPlanOpen ? 'translate-y-[150%] opacity-0' : 'translate-y-0 opacity-100'}`}>
                    {/* Sleek Glass Capsule - Mobile Optimized */}
                    <div className="bg-zinc-900/90 backdrop-blur-xl rounded-2xl p-2 shadow-[0_8px_30px_rgba(0,0,0,0.5)] border border-white/10 flex items-center justify-between gap-2 mx-auto w-full max-w-md">
                        
                        {/* Info Group - Flexible */}
                        <div className="flex items-center gap-3 pl-2 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20 shrink-0">
                                <Activity size={18} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <h3 className="text-sm font-bold text-white truncate">Clinical Protocol</h3>
                                <p className="text-[10px] font-medium text-zinc-400 truncate">AI Treatment Plan</p>
                            </div>
                        </div>
                        
                        {/* Actions Group - Fixed width */}
                        <div className="flex items-center gap-2 shrink-0">
                            {/* Download Button */}
                            {retouchedImage && (
                                <a 
                                    href={retouchedImage} 
                                    download="skinos-projection.jpg" 
                                    className="w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white flex items-center justify-center transition-colors active:scale-95"
                                    title="Save Image"
                                >
                                    <Download size={18} strokeWidth={1.5} />
                                </a>
                            )}
                            
                            {/* Primary Action Button - Uniform Size */}
                            {!plan && !isGeneratingPlan && !isRetouching && !errorText && retouchedImage && (
                                <button 
                                    onClick={() => handleGeneratePlan()} 
                                    className="h-11 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-teal-900/20 whitespace-nowrap"
                                >
                                    <Sparkles size={14} />
                                    <span>Generate</span>
                                </button>
                            )}

                            {(plan || isGeneratingPlan) && (
                                <button 
                                    onClick={() => setIsPlanOpen(true)} 
                                    className="h-11 px-5 rounded-xl bg-white text-black text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-white/10 whitespace-nowrap"
                                >
                                    {isGeneratingPlan ? (
                                        <Loader size={14} className="animate-spin" />
                                    ) : (
                                        <ChevronUp size={16} />
                                    )}
                                    <span>View Plan</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Maximized View (Full Sheet) - MATCHING SKIN ANALYSIS REPORT AESTHETIC */}
                <div 
                    className={`absolute left-0 right-0 bottom-0 bg-zinc-900/80 backdrop-blur-[50px] border-t border-white/10 rounded-t-[2.5rem] shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.5)] z-30 transition-all duration-700 cubic-bezier(0.19, 1, 0.22, 1) flex flex-col overflow-hidden ${isPlanOpen ? 'top-[10%]' : 'top-[100vh]'}`}
                >
                    {/* Sheet Header */}
                    <div className="px-8 pt-6 pb-4 shrink-0 border-b border-white/5 z-10 relative cursor-pointer" onClick={() => setIsPlanOpen(false)}>
                        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6"></div>
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/20 bg-teal-500/10 mb-3 backdrop-blur-md">
                                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></div>
                                    <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest">Generated Plan</span>
                                </div>
                                <h2 className="text-3xl font-thin text-white tracking-tighter">Clinical Protocol</h2>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setIsPlanOpen(false); }} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/70 hover:bg-white/10 transition-colors active:scale-95 border border-white/5">
                                <ChevronDown size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content with Snap */}
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-safe scroll-smooth snap-y snap-mandatory relative scrollbar-hide">
                        
                        {isGeneratingPlan && (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                <div className="relative mb-6">
                                    <div className="w-16 h-16 rounded-full border-t-2 border-teal-400 animate-spin"></div>
                                    <Microscope className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-teal-400" size={24} />
                                </div>
                                <p className="text-xs font-bold text-white/50 uppercase tracking-widest animate-pulse">Analyzing Transformation...</p>
                            </div>
                        )}

                        {plan && (
                            <div className="p-6 space-y-8">
                                {/* AI Analysis Summary - First Snap Item */}
                                <div className="snap-start snap-always scroll-mt-6 mb-8">
                                    <div className="bg-black/20 backdrop-blur-md p-8 rounded-[2rem] border border-white/10 shadow-lg relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-6 opacity-5">
                                            <Sparkles size={64} className="text-teal-400" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="flex items-center gap-2 mb-4 text-teal-400">
                                                <Microscope size={18} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">AI Dermatologist Analysis</span>
                                            </div>
                                            <p className="text-sm text-white/90 font-medium leading-relaxed">{plan.analysis}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Roadmap Line */}
                                <div className="relative pl-4 space-y-2">
                                    {/* Vertical Line */}
                                    <div className="absolute top-8 bottom-8 left-[19px] w-0.5 border-l-2 border-dashed border-white/10"></div>

                                    {plan.weeks?.map((week: any, i: number) => {
                                        const isActive = activeStep === i;
                                        
                                        return (
                                            <div 
                                                key={i} 
                                                ref={el => stepRefs.current[i] = el}
                                                data-index={i}
                                                // Increased height to 50vh to force distinct snapping
                                                className={`relative pl-10 transition-all duration-700 snap-start snap-always min-h-[50vh] flex flex-col justify-center py-8 ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-95 blur-[1px]'}`}
                                            >
                                                {/* Number Bubble */}
                                                <div 
                                                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-4 border-zinc-900 flex items-center justify-center font-black text-sm transition-all duration-500 shadow-md z-10 ${isActive ? 'bg-teal-500 text-white scale-110 shadow-teal-500/20' : 'bg-white/10 text-white/30'}`}
                                                >
                                                    {i + 1}
                                                </div>

                                                <div className={`bg-black/20 backdrop-blur-md rounded-[2rem] p-6 border transition-all duration-500 ${isActive ? 'border-teal-500/30 shadow-xl shadow-teal-900/10 ring-1 ring-teal-500/10' : 'border-white/5 shadow-sm'}`}>
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className={`text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wide border inline-block ${isActive ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' : 'bg-white/5 text-zinc-500 border-white/5'}`}>
                                                                    {week.title}
                                                                </span>
                                                            </div>
                                                            <h3 className="text-xl font-thin text-white tracking-tight">{week.phaseName}</h3>
                                                        </div>
                                                        {isActive && <CheckCircle2 size={20} className="text-teal-400" />}
                                                    </div>

                                                    <div className="space-y-6 mb-6">
                                                        <div className="flex gap-4 group">
                                                            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0 border border-amber-500/20 group-hover:scale-110 transition-transform"><Sun size={18} /></div>
                                                            <div className="pt-1">
                                                                <span className="text-[10px] font-bold text-amber-300/70 uppercase tracking-widest block mb-1">Morning Routine</span>
                                                                <p className="text-xs text-white/80 font-medium leading-relaxed">{week.morning}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-4 group">
                                                            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0 border border-indigo-500/20 group-hover:scale-110 transition-transform"><Moon size={18} /></div>
                                                            <div className="pt-1">
                                                                <span className="text-[10px] font-bold text-indigo-300/70 uppercase tracking-widest block mb-1">Evening Routine</span>
                                                                <p className="text-xs text-white/80 font-medium leading-relaxed">{week.evening}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {week.ingredients && (
                                                        <div className="flex flex-wrap gap-2 pt-5 border-t border-white/5">
                                                            {week.ingredients.map((ing: string, idx: number) => (
                                                                <span key={idx} className="bg-white/5 text-zinc-300 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-white/5 flex items-center gap-1.5 hover:border-teal-500/30 transition-colors cursor-default shadow-sm">
                                                                    <Beaker size={10} className="text-teal-500" /> {ing}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        
                        {/* Footer Spacer */}
                        <div className="h-32 flex items-center justify-center opacity-30 pb-10">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em]">End of Protocol</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SkinSimulator;
