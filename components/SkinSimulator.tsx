
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { generateImprovementPlan } from '../services/geminiService';
import { upscaleImage } from '../services/falService';
import { ArrowLeft, Sparkles, Loader, Activity, Microscope, Sun, Moon, Beaker, MoveHorizontal, Sliders, Zap, Check, X, Download, ScanFace } from 'lucide-react';

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

// Guided Smoothing + Frequency Separation
const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform sampler2D u_mask;
    uniform vec2 u_resolution;
    uniform float u_sigma;
    uniform float u_bsigma;
    uniform float u_slider; // Split position (0.0 to 1.0)

    float normpdf(in float x, in float sigma) {
        return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
    }

    void main() {
        vec4 c = texture2D(u_image, v_texCoord);
        
        // --- SPLIT SCREEN (BEFORE / AFTER) ---
        // Right side (x > slider) = Original (Before)
        // Left side (x < slider) = Processed (After)
        
        // Draw the separator line (Only if slider is within 0-1 visible range)
        if (u_slider >= 0.0 && u_slider <= 1.0) {
            float dist = abs(v_texCoord.x - u_slider);
            if (dist < 0.002) {
                gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                return;
            }
        }
        
        // If on the right side, just show original
        if (v_texCoord.x > u_slider) {
            gl_FragColor = c;
            return;
        }

        // --- PROCESSING (Left Side) ---
        
        float maskVal = texture2D(u_mask, v_texCoord).r;
        
        // Optimization: If mask is black (hair, background), skip expensive calc
        if (maskVal < 0.01) {
            gl_FragColor = c;
            return;
        }

        vec3 accum_color = vec3(0.0);
        float accum_weight = 0.0;
        
        vec3 gauss_color = vec3(0.0);
        float gauss_weight = 0.0;
        
        // 9x9 Kernel
        const int kSize = 9; 
        const int halfSize = kSize / 2;
        
        for (int i = -halfSize; i <= halfSize; ++i) {
            for (int j = -halfSize; j <= halfSize; ++j) {
                vec2 offset = vec2(float(i), float(j)) / u_resolution;
                vec3 cc = texture2D(u_image, v_texCoord + offset).rgb;
                
                // Spatial Weight (Gaussian)
                float sw = normpdf(float(i), u_sigma) * normpdf(float(j), u_sigma);
                
                // Range Weight (Guided / Bilateral)
                // We calculate luminance distance for better perceptual edges
                float lumaC = dot(c.rgb, vec3(0.299, 0.587, 0.114));
                float lumaCC = dot(cc, vec3(0.299, 0.587, 0.114));
                float rw = normpdf(lumaC - lumaCC, u_bsigma);
                
                float w = sw * rw;
                
                accum_color += cc * w;
                accum_weight += w;

                gauss_color += cc * sw;
                gauss_weight += sw;
            }
        }
        
        vec3 smoothed = accum_color / accum_weight;
        vec3 blurred = gauss_color / gauss_weight;

        // High Pass Detail (Texture)
        vec3 detail = c.rgb - blurred;

        // "Guided" Refinement:
        // We want smoothed skin but distinct features.
        // 1. Feature sharpening (Eyes, etc - Mask 0)
        vec3 sharpened_features = c.rgb + detail * 1.2; // Stronger pop

        // 2. Skin Smoothing (Mask 1)
        // Add back a fraction of detail to avoid plastic look
        vec3 refined_skin = smoothed + detail * 0.08; 

        // Final mix based on mask
        gl_FragColor = vec4(mix(sharpened_features, refined_skin, maskVal), 1.0);
    }
`;

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [statusText, setStatusText] = useState("Loading AI Model...");
    const [intensity, setIntensity] = useState(65);
    const [sliderPos, setSliderPos] = useState(0.5); // 0 to 1
    
    // Upscale State
    const [isUpscaling, setIsUpscaling] = useState(false);
    const [upscaledImage, setUpscaledImage] = useState<string | null>(null);
    
    // Plan State
    const [plan, setPlan] = useState<any>(null);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

    // Refs
    const canvasContainerRef = useRef<HTMLDivElement>(null);
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
    }, [intensity, sliderPos]); // Re-render on slider move

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

        drawShape(FACE_OVAL, "white", 15);

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

    const renderFrame = (overrideSlider?: number) => {
        const gl = glRef.current;
        const program = programRef.current;
        if (!gl || !program || !imageTextureRef.current || !maskTextureRef.current) return;

        const uImage = gl.getUniformLocation(program, "u_image");
        const uMask = gl.getUniformLocation(program, "u_mask");
        const uRes = gl.getUniformLocation(program, "u_resolution");
        const uSigma = gl.getUniformLocation(program, "u_sigma");
        const uBsigma = gl.getUniformLocation(program, "u_bsigma");
        const uSlider = gl.getUniformLocation(program, "u_slider");

        gl.uniform2f(uRes, gl.canvas.width, gl.canvas.height);
        
        // Pass slider. If override provided, use it (e.g., 2.0 to show full processed)
        gl.uniform1f(uSlider, overrideSlider !== undefined ? overrideSlider : sliderPos);
        
        // Tuned Params
        const sigma = 1.5 + (intensity / 100) * 4.0; 
        const bsigma = 0.02 + (intensity / 100) * 0.08;

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

    const handleUpscale = async () => {
        if (!canvasRef.current || !glRef.current) return;
        
        setIsUpscaling(true);
        try {
            // 1. Force render full processed image by pushing slider off-screen (2.0)
            renderFrame(2.0);
            
            // 2. Capture high quality jpeg
            const base64 = canvasRef.current.toDataURL('image/jpeg', 0.95);
            
            // 3. Restore view to current user slider
            renderFrame(); 

            // 4. Send to Fal for 4K Upscale
            const hdUrl = await upscaleImage(base64);
            setUpscaledImage(hdUrl);
            
        } catch (e) {
            console.error("Upscale Failed", e);
            setStatusText("Upscale Failed. Try again.");
            setTimeout(() => setStatusText("Loading AI Model..."), 3000);
        } finally {
            setIsUpscaling(false);
        }
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
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg pointer-events-auto">
                    <span className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <Sparkles size={12} className="text-teal-400" /> Skin Simulator
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 relative flex flex-col">
                
                {/* CANVAS AREA - Full Screen Max Size */}
                <div 
                    ref={canvasContainerRef}
                    className="flex-1 w-full bg-zinc-900 relative overflow-hidden cursor-col-resize touch-none"
                    onTouchMove={handleTouchMove}
                    onMouseMove={handleMouseMove}
                    onClick={handleMouseMove} // Jump on click
                >
                    <div className="w-full h-full flex items-center justify-center relative">
                        
                        {/* THE CANVAS (WebGL) */}
                        <canvas 
                            ref={canvasRef} 
                            className={`w-full h-full object-contain transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
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
                        
                        {/* Comparison Labels */}
                        {!isLoading && !upscaledImage && (
                            <>
                                <div className="absolute top-1/2 left-4 -translate-y-1/2 bg-black/40 backdrop-blur-md text-white/80 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300" style={{ opacity: sliderPos > 0.1 ? 1 : 0 }}>
                                    After
                                </div>
                                <div className="absolute top-1/2 right-4 -translate-y-1/2 bg-black/40 backdrop-blur-md text-white/80 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none transition-opacity duration-300" style={{ opacity: sliderPos < 0.9 ? 1 : 0 }}>
                                    Before
                                </div>
                                
                                {/* Draggable Handle Indicator (Visual Only) */}
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
                    
                    <div className="mb-6">
                        {/* Intensity Slider */}
                        <div className="flex justify-between items-center mb-3 px-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <Sliders size={12} /> Effect Strength
                            </span>
                            <span className="text-sm font-black text-teal-600">{intensity}%</span>
                        </div>
                        <div className="relative h-6 flex items-center">
                            <input 
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={intensity}
                                disabled={isLoading || isUpscaling}
                                onChange={(e) => setIntensity(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none cursor-pointer z-20 relative disabled:cursor-not-allowed accent-teal-600 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* ROADMAP HEADER */}
                    <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
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
                            {/* UPSCALE BUTTON */}
                            <button 
                                onClick={handleUpscale}
                                disabled={isUpscaling || isLoading || !!upscaledImage}
                                className="bg-white border border-teal-100 text-teal-600 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-teal-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
                            >
                                {isUpscaling ? <Loader size={12} className="animate-spin" /> : <Zap size={12} className="fill-teal-600" />}
                                {isUpscaling ? "Enhancing..." : "AI Upscale (4K)"}
                            </button>

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

            {/* UPSCALE RESULT MODAL */}
            {upscaledImage && (
                <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
                    <div className="relative w-full max-w-lg bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-20 bg-gradient-to-b from-black/80 to-transparent">
                             <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                                 <ScanFace size={14} className="text-teal-400" />
                                 <span className="text-[10px] font-bold text-white uppercase tracking-widest">Enhanced Result</span>
                             </div>
                             <button 
                                onClick={() => setUpscaledImage(null)}
                                className="p-2 bg-black/40 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors border border-white/10"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden relative bg-zinc-900">
                             <img src={upscaledImage} alt="HD Result" className="w-full h-full object-contain" />
                        </div>

                        <div className="p-6 bg-zinc-900 border-t border-white/10 shrink-0">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-white font-bold text-sm mb-1">High Fidelity Render</h4>
                                    <p className="text-zinc-500 text-[10px] font-medium">Upscaled to 4K resolution using AI.</p>
                                </div>
                                <a 
                                    href={upscaledImage} 
                                    download="skinos-hd.jpg" 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="bg-white text-zinc-900 px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-colors flex items-center gap-2 shadow-lg"
                                >
                                    <Download size={16} /> Save Image
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SkinSimulator;
