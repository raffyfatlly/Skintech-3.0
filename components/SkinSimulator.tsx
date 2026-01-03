
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { generateImprovementPlan } from '../services/geminiService';
import { ArrowLeft, Sparkles, Loader, Eye, Activity, Microscope, Sun, Moon, Beaker, Syringe, Zap, PlayCircle, Sliders } from 'lucide-react';

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

// --- SHADERS ---

const VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

// Advanced Shader: Bilateral Smoothing + Unsharp Masking
const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform sampler2D u_mask;
    uniform vec2 u_resolution;
    uniform float u_sigma; // Spatial spread
    uniform float u_bsigma; // Range spread

    float normpdf(in float x, in float sigma) {
        return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
    }

    void main() {
        vec4 c = texture2D(u_image, v_texCoord);
        float maskVal = texture2D(u_mask, v_texCoord).r;
        
        // Optimize: If fully transparent mask or 0 intensity, just draw original
        if (u_bsigma < 0.001) {
            gl_FragColor = c;
            return;
        }

        vec3 bilateral_color = vec3(0.0);
        float bilateral_Z = 0.0;

        vec3 gauss_color = vec3(0.0);
        float gauss_Z = 0.0;
        
        // 9x9 Kernel
        const int kSize = 9; 
        const int halfSize = kSize / 2;
        
        for (int i = -halfSize; i <= halfSize; ++i) {
            for (int j = -halfSize; j <= halfSize; ++j) {
                vec2 offset = vec2(float(i), float(j)) / u_resolution;
                vec3 cc = texture2D(u_image, v_texCoord + offset).rgb;
                
                // Spatial Factor
                float factor = normpdf(float(i), u_sigma) * normpdf(float(j), u_sigma);
                
                // Range Factor (Bilateral)
                float bZ = normpdf(distance(c.rgb, cc), u_bsigma);
                
                // Accumulate Bilateral (Smoothing)
                float bW = factor * bZ;
                bilateral_Z += bW;
                bilateral_color += cc * bW;

                // Accumulate Gaussian (Blur for Unsharp Mask)
                gauss_Z += factor;
                gauss_color += cc * factor;
            }
        }
        
        vec3 smoothed = bilateral_color / bilateral_Z;
        vec3 blurred = gauss_color / gauss_Z;

        // Calculate High Frequency Detail (Edges/Texture)
        vec3 detail = c.rgb - blurred;

        // 1. Sharpen Features (Eyes, Lips, Hair - where mask is 0)
        // Add detail back strongly to pop features
        vec3 sharpened_features = c.rgb + detail * 0.8;

        // 2. Refine Skin (Smoothed + faint texture - where mask is 1)
        // Add a tiny bit of detail back to smoothed skin to avoid plastic look
        vec3 refined_skin = smoothed + detail * 0.05;

        // Blend based on mask
        // Mask 1.0 = Skin (Uses refined_skin)
        // Mask 0.0 = Features (Uses sharpened_features)
        gl_FragColor = vec4(mix(sharpened_features, refined_skin, maskVal), 1.0);
    }
`;

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [statusText, setStatusText] = useState("Loading AI Model...");
    const [intensity, setIntensity] = useState(60); // Default higher for effect visibility
    const [isCompare, setIsCompare] = useState(false);
    
    // Plan State
    const [plan, setPlan] = useState<any>(null);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

    // Refs for WebGL
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const imageTextureRef = useRef<WebGLTexture | null>(null);
    const maskTextureRef = useRef<WebGLTexture | null>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const originalImageRef = useRef<HTMLImageElement | null>(null);
    const animationFrameRef = useRef<number>(0);

    // LANDMARK INDICES (Standard MediaPipe 468)
    const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    const LEFT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
    const RIGHT_EYE = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];
    const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
    
    // Add eyebrows to exclusion
    const LEFT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
    const RIGHT_EYEBROW = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];

    useEffect(() => {
        if (user.faceImage) {
            initializeSystem(user.faceImage);
        }
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [user.faceImage]);

    useEffect(() => {
        if (!glRef.current || !programRef.current) return;
        renderFrame();
    }, [intensity, isCompare]);

    const initializeSystem = async (imageUrl: string) => {
        try {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = imageUrl;
            await new Promise((resolve) => { img.onload = resolve; });
            
            // Limit resolution for performance (max 1280px)
            const maxDim = 1280;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            let scale = 1;
            
            if (w > maxDim || h > maxDim) {
                scale = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }

            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = w;
            resizedCanvas.height = h;
            const ctx = resizedCanvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, w, h);
            
            const processedImg = new Image();
            processedImg.src = resizedCanvas.toDataURL('image/jpeg', 0.9);
            await new Promise(r => processedImg.onload = r);
            
            originalImageRef.current = processedImg;

            setStatusText("Mapping Face Geometry...");
            
            if (!window.FaceMesh) {
                throw new Error("MediaPipe FaceMesh not loaded.");
            }

            const faceMesh = new window.FaceMesh({
                locateFile: (file: string) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            faceMesh.onResults(handleResults);
            await faceMesh.send({ image: processedImg });

        } catch (e) {
            console.error("Init Error", e);
            setStatusText("Initialization Failed");
        }
    };

    const handleResults = (results: any) => {
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            generateSkinMask(landmarks);
            initWebGL();
            setIsLoading(false);
        } else {
            setStatusText("No Face Detected.");
        }
    };

    const generateSkinMask = (landmarks: any[]) => {
        if (!originalImageRef.current) return;
        const width = originalImageRef.current.width;
        const height = originalImageRef.current.height;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);

        const drawShape = (indices: number[], color: string, blur: number = 0) => {
            ctx.beginPath();
            const first = landmarks[indices[0]];
            ctx.moveTo(first.x * width, first.y * height);
            for (let i = 1; i < indices.length; i++) {
                const pt = landmarks[indices[i]];
                ctx.lineTo(pt.x * width, pt.y * height);
            }
            ctx.closePath();
            if (blur > 0) ctx.filter = `blur(${blur}px)`;
            ctx.fillStyle = color;
            ctx.fill();
            ctx.filter = "none";
        };

        // Draw skin (White) with nice feathering
        drawShape(FACE_OVAL, "white", 15);

        // Erase Features (Black)
        ctx.globalCompositeOperation = 'destination-out';
        drawShape(LEFT_EYE, "black", 10);
        drawShape(RIGHT_EYE, "black", 10);
        drawShape(LIPS, "black", 8);
        drawShape(LEFT_EYEBROW, "black", 6);
        drawShape(RIGHT_EYEBROW, "black", 6);
        
        ctx.globalCompositeOperation = 'source-over';

        maskCanvasRef.current = canvas;
    };

    const initWebGL = () => {
        const canvas = canvasRef.current;
        const img = originalImageRef.current;
        if (!canvas || !img) return;

        canvas.width = img.width;
        canvas.height = img.height;

        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        if (!gl) return;
        glRef.current = gl;

        const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        if (!vs || !fs) return;
        
        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.useProgram(program);
        programRef.current = program;

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

        imageTextureRef.current = createTexture(gl, img);
        if (maskCanvasRef.current) {
            maskTextureRef.current = createTexture(gl, maskCanvasRef.current);
        }

        renderFrame();
    };

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    };

    const createTexture = (gl: WebGLRenderingContext, source: TexImageSource) => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        return texture;
    };

    const renderFrame = () => {
        const gl = glRef.current;
        const program = programRef.current;
        if (!gl || !program || !imageTextureRef.current || !maskTextureRef.current) return;

        const uImage = gl.getUniformLocation(program, "u_image");
        const uMask = gl.getUniformLocation(program, "u_mask");
        const uRes = gl.getUniformLocation(program, "u_resolution");
        const uSigma = gl.getUniformLocation(program, "u_sigma");
        const uBsigma = gl.getUniformLocation(program, "u_bsigma");

        gl.uniform2f(uRes, gl.canvas.width, gl.canvas.height);
        
        const val = isCompare ? 0 : intensity;
        
        // Tuned Params for 9x9 kernel
        const sigma = 1.5 + (val / 100) * 4.0; // Moderate spatial spread
        const bsigma = 0.02 + (val / 100) * 0.08; // Tight range spread for edge preservation

        gl.uniform1f(uSigma, sigma);
        gl.uniform1f(uBsigma, bsigma);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imageTextureRef.current);
        gl.uniform1i(uImage, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskTextureRef.current);
        gl.uniform1i(uMask, 1);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const handleGeneratePlan = async () => {
        if (!originalImageRef.current || !canvasRef.current) return;
        setIsGeneratingPlan(true);
        try {
            const original = originalImageRef.current.src;
            const retouched = canvasRef.current.toDataURL('image/jpeg', 0.8);
            const data = await generateImprovementPlan(original, retouched, user);
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
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
                    <span className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <Sparkles size={12} className="text-teal-400" /> Skin Simulator
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 relative flex flex-col">
                
                {/* CANVAS AREA */}
                <div className="h-[60vh] w-full relative shrink-0 bg-zinc-900 overflow-hidden sticky top-0 z-0">
                    <div className="w-full h-full flex items-center justify-center relative">
                        
                        {/* THE CANVAS (WebGL) */}
                        <canvas 
                            ref={canvasRef} 
                            className={`max-w-full max-h-full object-contain transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                        />

                        {/* Loader Overlay */}
                        {isLoading && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in">
                                <div className="relative mb-6">
                                    <div className="absolute inset-0 bg-teal-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                                    <Loader size={48} className="text-teal-400 animate-spin relative z-10" />
                                </div>
                                <p className="text-white font-bold text-xs uppercase tracking-widest animate-pulse">{statusText}</p>
                            </div>
                        )}
                        
                    </div>
                </div>

                {/* CONTROLS SHEET */}
                <div className="bg-zinc-50 min-h-[50vh] relative z-20 -mt-8 rounded-t-[2.5rem] p-6 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">
                    
                    <div className="mb-10">
                        {/* Compare Button */}
                        <div className="flex justify-center -mt-10 mb-6">
                             <button
                                onMouseDown={() => setIsCompare(true)}
                                onMouseUp={() => setIsCompare(false)}
                                onTouchStart={() => setIsCompare(true)}
                                onTouchEnd={() => setIsCompare(false)}
                                disabled={isLoading}
                                className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest hover:scale-105 transition-all active:scale-95 disabled:opacity-50 select-none touch-manipulation shadow-xl shadow-zinc-900/30"
                            >
                                <Eye size={14} /> Hold to Compare
                            </button>
                        </div>

                        {/* Intensity Slider */}
                        <div className="bg-white border border-zinc-200 rounded-[2rem] p-4 mb-2 shadow-sm relative flex flex-col justify-center h-24">
                            <div className="flex justify-between items-center mb-3 px-2">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                    <Sliders size={12} /> Smoothing Strength
                                </span>
                                <span className={`text-sm font-black ${intensity > 0 ? 'text-teal-600' : 'text-zinc-300'}`}>
                                    {intensity}%
                                </span>
                            </div>
                            <div className="relative h-6 flex items-center px-2">
                                <input 
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={intensity}
                                    disabled={isLoading}
                                    onChange={(e) => setIntensity(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-zinc-100 rounded-full appearance-none cursor-pointer z-20 relative disabled:cursor-not-allowed accent-teal-600 focus:outline-none"
                                />
                                {/* Custom Track Fill */}
                                <div className="absolute left-2 right-2 h-1.5 rounded-full overflow-hidden pointer-events-none z-10">
                                     <div className="h-full bg-gradient-to-r from-teal-400 to-teal-600" style={{ width: `${intensity}%` }}></div>
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
                        {!plan && !isGeneratingPlan && !isLoading && (
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
                        <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-700 pb-10">
                            
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
