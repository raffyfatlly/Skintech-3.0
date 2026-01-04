
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { generateImprovementPlan } from '../services/geminiService';
import { upscaleImage } from '../services/falService';
import { ArrowLeft, Sparkles, Loader, Activity, Microscope, Sun, Moon, Beaker, MoveHorizontal, Sliders, Zap, Check, X, Download, ScanFace, RefreshCw } from 'lucide-react';

declare global {
    interface Window {
        FaceMesh: any;
    }
}

interface SkinSimulatorProps {
    user: UserProfile;
    onBack: () => void;
    location?: string;
}

// --- SHADERS (Kept for initial loading preview only) ---

const VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    void main() {
        vec4 c = texture2D(u_image, v_texCoord);
        gl_FragColor = c;
    }
`;

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [statusText, setStatusText] = useState("Initializing...");
    const [intensity, setIntensity] = useState(65);
    const [sliderPos, setSliderPos] = useState(0.5); // 0 to 1
    
    // AI State
    const [isRetouching, setIsRetouching] = useState(false);
    const [retouchedImage, setRetouchedImage] = useState<string | null>(null);
    const [hasAutoStarted, setHasAutoStarted] = useState(false);
    
    // Plan State
    const [plan, setPlan] = useState<any>(null);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

    // Refs
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const originalImageRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        if (user.faceImage) {
            initializeSystem(user.faceImage);
        }
    }, [user.faceImage]);

    // AUTO RETOUCH TRIGGER
    useEffect(() => {
        if (!isLoading && !hasAutoStarted && !isRetouching && user.faceImage) {
            setHasAutoStarted(true);
            handleAiRetouch(user.faceImage);
        }
    }, [isLoading, hasAutoStarted, user.faceImage]);

    const handleInteraction = (clientX: number) => {
        if (!canvasContainerRef.current) return;
        const rect = canvasContainerRef.current.getBoundingClientRect();
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

    const initializeSystem = async (imageUrl: string) => {
        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = imageUrl;
            await new Promise((resolve) => { img.onload = resolve; });
            
            originalImageRef.current = img;
            
            // Draw initial frame to canvas for seamless transition
            initWebGL(img);
            setIsLoading(false);

        } catch (e) {
            console.error("Init Error", e);
            setStatusText("Initialization Failed");
        }
    };

    const initWebGL = (img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = img.width;
        canvas.height = img.height;

        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        if (!gl) return;
        glRef.current = gl;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        if (!vs || !fs) return;
        
        gl.shaderSource(vs, VERTEX_SHADER);
        gl.shaderSource(fs, FRAGMENT_SHADER);
        gl.compileShader(vs);
        gl.compileShader(fs);
        
        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.useProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1,
        ]), gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 1, 1, 1, 0, 0,
            0, 0, 1, 1, 1, 0,
        ]), gl.STATIC_DRAW);

        const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const handleAiRetouch = async (sourceImage: string) => {
        setIsRetouching(true);
        setStatusText("AI Retouching...");
        try {
            // Send original image directly to Fal
            const hdUrl = await upscaleImage(sourceImage);
            setRetouchedImage(hdUrl);
        } catch (e) {
            console.error("Retouch Failed", e);
            setStatusText("Retouch failed. Retrying...");
        } finally {
            setIsRetouching(false);
        }
    };

    const handleGeneratePlan = async () => {
        if (!originalImageRef.current || !retouchedImage) return;
        setIsGeneratingPlan(true);
        try {
            const original = originalImageRef.current.src;
            // Use the AI retouched image as the target
            const data = await generateImprovementPlan(original, retouchedImage, user);
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
                        <Sparkles size={12} className="text-teal-400" /> AI Skin Simulator
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 relative flex flex-col">
                
                {/* CANVAS / IMAGE AREA - Full Screen Max Size */}
                <div 
                    ref={canvasContainerRef}
                    className="flex-1 w-full bg-zinc-900 relative overflow-hidden cursor-col-resize touch-none"
                    onTouchMove={handleTouchMove}
                    onMouseMove={handleMouseMove}
                    onClick={handleMouseMove} // Jump on click
                >
                    <div className="w-full h-full flex items-center justify-center relative">
                        
                        {/* 1. RETOUCHED IMAGE COMPARISON (When Ready) */}
                        {retouchedImage ? (
                            <div className="relative w-full h-full animate-in fade-in duration-700">
                                 {/* LAYER 1: ORIGINAL (BEFORE) */}
                                 {originalImageRef.current && (
                                     <img 
                                        src={originalImageRef.current.src} 
                                        className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
                                        alt="Original"
                                     />
                                 )}
                                 
                                 {/* LAYER 2: AI RESULT (AFTER) - Clipped to show Left Side */}
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

                                 {/* HD Badge */}
                                 <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-teal-500/20 backdrop-blur-md text-teal-200 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none border border-teal-500/30 shadow-lg">
                                     AI Enhanced
                                 </div>
                            </div>
                        ) : (
                            /* 2. LOADING STATE (WebGL/Image Placeholder) */
                            <canvas 
                                ref={canvasRef} 
                                className={`w-full h-full object-contain transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                            />
                        )}

                        {/* Loader Overlay (Initial or AI Processing) */}
                        {(isLoading || isRetouching) && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                                <div className="relative mb-6">
                                    <div className="absolute inset-0 bg-teal-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                    <Loader size={48} className="text-teal-400 animate-spin relative z-10" />
                                </div>
                                <p className="text-white font-bold text-xs uppercase tracking-widest animate-pulse">{statusText}</p>
                            </div>
                        )}
                        
                        {/* Comparison Controls */}
                        {!isLoading && (
                            <>
                                <div className="absolute top-1/2 left-4 -translate-y-1/2 bg-black/40 backdrop-blur-md text-white/80 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300" style={{ opacity: sliderPos > 0.1 ? 1 : 0 }}>
                                    Target
                                </div>
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 bg-black/40 backdrop-blur-md text-white/80 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300" style={{ opacity: sliderPos < 0.9 ? 1 : 0 }}>
                                    Current
                                </div>
                                
                                {/* Separator Line */}
                                <div 
                                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none z-30"
                                    style={{ left: `${sliderPos * 100}%` }}
                                ></div>

                                {/* Draggable Handle Indicator */}
                                <div 
                                    className="absolute top-1/2 w-8 h-8 -ml-4 -mt-4 bg-white rounded-full shadow-lg flex items-center justify-center text-zinc-400 pointer-events-none z-30"
                                    style={{ left: `${sliderPos * 100}%` }}
                                >
                                    <MoveHorizontal size={16} />
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
                                    download="skinos-ai-result.jpg" 
                                    className="bg-white border border-teal-100 text-teal-600 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-teal-50 transition-colors flex items-center gap-2"
                                >
                                    <Download size={12} /> Save
                                </a>
                            )}

                            {!plan && !isGeneratingPlan && !isLoading && (
                                <button 
                                    onClick={handleGeneratePlan}
                                    className="bg-zinc-900 text-white px-5 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
                                >
                                    <Sparkles size={12} className="text-amber-300" /> Generate Plan
                                </button>
                            )}
                        </div>
                    </div>

                    {/* CONTENT AREA */}
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
