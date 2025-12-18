
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, Image as ImageIcon, ScanFace, BrainCircuit, Target, Lightbulb, CheckCircle2, Focus, X, ArrowRight } from 'lucide-react';
import { analyzeSkinFrame, drawBiometricOverlay, validateFrame, applyClinicalOverlays, applyMedicalProcessing, preprocessForAI } from '../services/visionService';
import { analyzeFaceSkin } from '../services/geminiService';
import { SkinMetrics } from '../types';

interface FaceScannerProps {
  onScanComplete: (metrics: SkinMetrics, image: string) => void;
  scanHistory?: SkinMetrics[];
  onCancel?: () => void;
}

const SCAN_TIPS = [
  "Natural daylight provides the most accurate skin tone analysis.",
  "Pulling hair back helps us analyze your forehead texture.",
  "Removing glasses ensures accurate under-eye analysis.",
  "A neutral expression helps detect resting fine lines accurately.",
  "Scanning at the same time of day improves progress tracking.",
  "Wiping your camera lens can significantly improve score accuracy.",
  "Avoid harsh overhead lighting to reduce shadow interference.",
  "For best results, remove makeup before scanning.",
  "Consistent weekly scans build the most accurate skin profile."
];

const FaceScanner: React.FC<FaceScannerProps> = ({ onScanComplete, scanHistory, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Optimization Refs
  const metricsBuffer = useRef<SkinMetrics[]>([]); 
  const lastFacePos = useRef<{ cx: number, cy: number } | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const circleRef = useRef<SVGCircleElement>(null);
  const lastAnalysisTimeRef = useRef<number>(0);
  const cachedMetricsRef = useRef<SkinMetrics | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false); 
  const [aiProgress, setAiProgress] = useState(0); 
  const [streamError, setStreamError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<string>("Align Face");
  const [statusColor, setStatusColor] = useState<'default'|'warning'|'error'>('default');
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);
  const [currentTip, setCurrentTip] = useState<string>("");
  
  // Result Display Logic
  const [resultMetrics, setResultMetrics] = useState<SkinMetrics | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);

  // Focus Logic
  const [showFocusTarget, setShowFocusTarget] = useState<{x: number, y: number} | null>(null);
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'user', 
                width: { ideal: 1920 }, 
                height: { ideal: 1080 }
            }
        });

        if (!isMounted) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        setCurrentStream(stream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(e => console.error("Video play failed", e));
          };
        }
      } catch (err) {
        console.error("Camera Error:", err);
        if (isMounted) setStreamError("Camera access denied.");
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Simulate AI Progress & Cycle Tips
  useEffect(() => {
      let progressInterval: ReturnType<typeof setInterval>;
      let tipInterval: ReturnType<typeof setInterval>;

      if (isProcessingAI) {
          // Helper to get random tip excluding current
          const getRandomTip = (exclude?: string) => {
              const available = exclude ? SCAN_TIPS.filter(t => t !== exclude) : SCAN_TIPS;
              return available[Math.floor(Math.random() * available.length)];
          };

          // Set initial tip
          setCurrentTip(getRandomTip());
          
          setAiProgress(0);
          
          // Progress Bar Simulation (Slower to allow reading tips)
          progressInterval = setInterval(() => {
              setAiProgress(prev => {
                  if (prev >= 90) return prev; 
                  return prev + 0.8; // Approx 5-6 seconds to reach 90%
              });
          }, 50);

          // Cycle Tips every 4 seconds (Slowed down from 2s)
          tipInterval = setInterval(() => {
              setCurrentTip(prev => getRandomTip(prev));
          }, 4000);
      }
      return () => {
          clearInterval(progressInterval);
          clearInterval(tipInterval);
      };
  }, [isProcessingAI]);

  // Score Animation Effect
  useEffect(() => {
    if (showResult && resultMetrics) {
      let start = 0;
      const end = resultMetrics.overallScore;
      const duration = 2000;
      const startTime = performance.now();

      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // EaseOutQuart
        setAnimatedScore(Math.round(start + (end - start) * ease));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, [showResult, resultMetrics]);

  // Handle Manual Focus Tap
  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      setShowFocusTarget({ x, y });
      setTimeout(() => setShowFocusTarget(null), 1500);

      if (currentStream) {
          const track = currentStream.getVideoTracks()[0];
          const capabilities = track.getCapabilities() as any;
          if (capabilities.focusMode) {
              try {
                  await track.applyConstraints({
                      advanced: [{ focusMode: 'continuous' }] as any 
                  });
              } catch (err) {
                  console.debug("Focus constraint not supported", err);
              }
          }
      }
  };

  const calculateAverageMetrics = (buffer: SkinMetrics[]): SkinMetrics => {
      if (buffer.length === 0) return { 
          overallScore: 70, acneActive: 70, acneScars: 70, poreSize: 70, blackheads: 70, 
          wrinkleFine: 70, wrinkleDeep: 70, sagging: 70, pigmentation: 70, redness: 70, 
          texture: 70, hydration: 70, oiliness: 70, darkCircles: 70, timestamp: Date.now() 
      };

      const sum = buffer.reduce((acc, curr) => ({
          overallScore: acc.overallScore + curr.overallScore,
          acneActive: acc.acneActive + curr.acneActive,
          acneScars: acc.acneScars + curr.acneScars,
          poreSize: acc.poreSize + curr.poreSize,
          blackheads: acc.blackheads + curr.blackheads,
          wrinkleFine: acc.wrinkleFine + curr.wrinkleFine,
          wrinkleDeep: acc.wrinkleDeep + curr.wrinkleDeep,
          sagging: acc.sagging + curr.sagging,
          pigmentation: acc.pigmentation + curr.pigmentation,
          redness: acc.redness + curr.redness,
          texture: acc.texture + curr.texture,
          hydration: acc.hydration + curr.hydration,
          oiliness: acc.oiliness + curr.oiliness,
          darkCircles: acc.darkCircles + curr.darkCircles,
          skinAge: (acc.skinAge || 0) + (curr.skinAge || 25), // Average skin age
          timestamp: 0
      }), { 
          overallScore: 0, acneActive: 0, acneScars: 0, poreSize: 0, blackheads: 0, 
          wrinkleFine: 0, wrinkleDeep: 0, sagging: 0, pigmentation: 0, redness: 0, 
          texture: 0, hydration: 0, oiliness: 0, darkCircles: 0, skinAge: 0, timestamp: 0 
      });

      const len = buffer.length;
      return {
          overallScore: Math.round(sum.overallScore / len),
          acneActive: Math.round(sum.acneActive / len),
          acneScars: Math.round(sum.acneScars / len),
          poreSize: Math.round(sum.poreSize / len),
          blackheads: Math.round(sum.blackheads / len),
          wrinkleFine: Math.round(sum.wrinkleFine / len),
          wrinkleDeep: Math.round(sum.wrinkleDeep / len),
          sagging: Math.round(sum.sagging / len),
          pigmentation: Math.round(sum.pigmentation / len),
          redness: Math.round(sum.redness / len),
          texture: Math.round(sum.texture / len),
          hydration: Math.round(sum.hydration / len),
          oiliness: Math.round(sum.oiliness / len),
          darkCircles: Math.round(sum.darkCircles / len),
          skinAge: Math.round(sum.skinAge! / len),
          observations: buffer[buffer.length-1].observations,
          timestamp: Date.now()
      };
  };

  const captureSnapshot = (source: HTMLVideoElement | HTMLImageElement, flip: boolean): string => {
      const captureCanvas = document.createElement('canvas');
      const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

      captureCanvas.width = width;
      captureCanvas.height = height;
      const ctx = captureCanvas.getContext('2d');
      if (ctx) {
          if (flip) {
              ctx.translate(captureCanvas.width, 0);
              ctx.scale(-1, 1);
          }
          ctx.drawImage(source, 0, 0, captureCanvas.width, captureCanvas.height);
          if (flip) ctx.setTransform(1, 0, 0, 1, 0, 0);
          
          // Apply Clinical Overlay Logic (Lines + Dots) for Display
          applyClinicalOverlays(ctx, captureCanvas.width, captureCanvas.height);
          
          return captureCanvas.toDataURL('image/jpeg', 0.95);
      }
      return '';
  };
  
  // Capture Pre-Processed Image for AI
  const captureProcessedImage = (source: HTMLVideoElement | HTMLImageElement, flip: boolean): string => {
      const captureCanvas = document.createElement('canvas');
      const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      captureCanvas.width = width;
      captureCanvas.height = height;
      const ctx = captureCanvas.getContext('2d');
      if (ctx) {
           if (flip) {
              ctx.translate(captureCanvas.width, 0);
              ctx.scale(-1, 1);
          }
          ctx.drawImage(source, 0, 0, width, height);
          if (flip) ctx.setTransform(1, 0, 0, 1, 0, 0);

          // Use advanced pre-processing (Auto-exposure + Contrast + Sharpening)
          // This normalizes lighting and makes AI scores more consistent
          return preprocessForAI(ctx, width, height);
      }
      return '';
  };

  const finalizeScan = (metrics: SkinMetrics, image: string) => {
      setResultMetrics(metrics);
      setCapturedSnapshot(image);
      setAiProgress(100);
      setTimeout(() => {
          setIsProcessingAI(false);
          setShowResult(true);
      }, 500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsProcessingAI(true);
      const reader = new FileReader();
      reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxDim = 1920;
              let w = img.naturalWidth;
              let h = img.naturalHeight;
              if (w > maxDim || h > maxDim) {
                  const ratio = Math.min(maxDim/w, maxDim/h);
                  w *= ratio;
                  h *= ratio;
              }
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(img, 0, 0, w, h);
                  
                  // Run local analysis on the uploaded image to get deterministic anchor data
                  const localMetrics = analyzeSkinFrame(ctx, w, h);
                  
                  // Capture visual snapshot for UI
                  applyClinicalOverlays(ctx, w, h);
                  const displaySnapshot = canvas.toDataURL('image/jpeg', 0.9);
                  
                  // Re-draw original for AI processing
                  ctx.drawImage(img, 0, 0, w, h);
                  // Use pre-processing for file uploads too!
                  const processedBase64 = preprocessForAI(ctx, w, h);

                  // Pass image, local metrics, AND HISTORY to AI for context-aware analysis
                  analyzeFaceSkin(processedBase64, localMetrics, scanHistory).then(aiMetrics => {
                      finalizeScan(aiMetrics, displaySnapshot);
                  }).catch(err => {
                      console.error(err);
                      setIsProcessingAI(false);
                      setStreamError("AI Analysis Failed.");
                  });
              }
          };
          img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
  };

  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning || isProcessingAI) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const now = performance.now();
    const deltaTime = now - lastTimeRef.current;
    lastTimeRef.current = now;

    if (ctx && video.readyState === 4) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      
      const check = validateFrame(ctx, canvas.width, canvas.height, lastFacePos.current);
      
      setInstruction(check.instruction || check.message);
      setStatusColor(check.status === 'ERROR' ? 'error' : check.status === 'WARNING' ? 'warning' : 'default');

      if (check.isGood) {
          const SCAN_DURATION = 3000; 
          const increment = (deltaTime / SCAN_DURATION) * 100;
          progressRef.current = Math.min(100, progressRef.current + increment);
          
          if (check.facePos) lastFacePos.current = check.facePos;
      }

      // Sample more frequently for better averaging (100ms instead of 200ms)
      if (now - lastAnalysisTimeRef.current > 100) {
          const metrics = analyzeSkinFrame(ctx, canvas.width, canvas.height);
          cachedMetricsRef.current = metrics;
          lastAnalysisTimeRef.current = now;
          if (check.isGood) {
              metricsBuffer.current.push(metrics);
              // Increase buffer size to 30 for smoother average
              if (metricsBuffer.current.length > 30) metricsBuffer.current.shift();
          }
      }
      
      if (cachedMetricsRef.current) {
          drawBiometricOverlay(ctx, canvas.width, canvas.height, cachedMetricsRef.current);
      }

      if (circleRef.current) {
          const radius = 130;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (progressRef.current / 100) * circumference;
          circleRef.current.style.strokeDashoffset = `${offset}`;
      }

      if (progressRef.current >= 100) {
           setIsScanning(false);
           setIsProcessingAI(true);
           
           // Capture Processed Image (Auto-Exposed + Contrasted) for AI Consistency
           const processedImage = captureProcessedImage(video, true);
           const avgLocalMetrics = calculateAverageMetrics(metricsBuffer.current);
           
           // Generate Image with Clinical Overlay for Display
           const displayImage = captureSnapshot(video, true);
           setCapturedSnapshot(displayImage);

           // Pass averaged local metrics AND HISTORY as anchor
           analyzeFaceSkin(processedImage, avgLocalMetrics, scanHistory).then(aiMetrics => {
               finalizeScan(aiMetrics, displayImage);
           }).catch(err => {
               console.error("AI Failed", err);
               finalizeScan(avgLocalMetrics, displayImage);
           });
      }
    }

    if (isScanning && !isProcessingAI) {
      requestAnimationFrame(scanFrame);
    }
  }, [isScanning, isProcessingAI, scanHistory]);

  useEffect(() => {
    if (isScanning) {
      metricsBuffer.current = []; 
      lastFacePos.current = undefined;
      progressRef.current = 0;
      cachedMetricsRef.current = null;
      lastTimeRef.current = performance.now();
      if (circleRef.current) {
         const radius = 130;
         const circumference = 2 * Math.PI * radius;
         circleRef.current.style.strokeDashoffset = `${circumference}`;
      }
      requestAnimationFrame(scanFrame);
    }
  }, [isScanning, scanFrame]);

  const getAIStatusText = (p: number) => {
      if (p < 30) return "Validating Biometrics...";
      if (p < 60) return "Consulting Database...";
      if (p < 90) return "Refining Analysis...";
      return "Finalizing...";
  };

  const getStatusColor = () => {
      if (statusColor === 'error') return 'bg-rose-500 border-rose-600 text-white';
      if (statusColor === 'warning') return 'bg-amber-400 border-amber-500 text-amber-900';
      return 'bg-white/90 border-white text-zinc-900';
  }

  // --- RENDER: RESULT OVERLAY ---
  if (showResult && resultMetrics && capturedSnapshot) {
      return (
        <div className="relative h-screen w-full bg-black font-sans overflow-hidden animate-in fade-in duration-700">
            {/* Background Image */}
            <img src={capturedSnapshot} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="Scan Result" />
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/90" />
            <div className="absolute inset-0 bg-teal-900/10 mix-blend-overlay" />

            <div className="relative z-10 h-full flex flex-col items-center justify-between py-safe pt-12 pb-12 px-6">
                
                {/* Header */}
                <div className="animate-in slide-in-from-top-8 duration-700 delay-100">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-xl">
                        <CheckCircle2 size={16} className="text-emerald-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-widest">Analysis Complete</span>
                    </div>
                </div>

                {/* Main Score Display */}
                <div className="flex flex-col items-center justify-center relative w-full">
                    {/* Rotating Rings */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] border border-white/10 rounded-full animate-[spin_20s_linear_infinite]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                    
                    {/* Glow effect */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] bg-teal-500/20 blur-[60px] rounded-full" />

                    <div className="relative z-10 flex flex-col items-center">
                        <span className="text-xs font-bold text-teal-200 uppercase tracking-[0.3em] mb-4 animate-in fade-in duration-1000 delay-300 shadow-black drop-shadow-md">Overall Score</span>
                        
                        {/* Big Number */}
                        <div className="text-[9rem] leading-[0.85] font-black text-white tracking-tighter drop-shadow-2xl animate-in zoom-in-50 duration-1000 ease-out select-none">
                            {animatedScore}
                        </div>
                    </div>
                </div>

                {/* Footer / Continue */}
                <div className="w-full max-w-xs animate-in slide-in-from-bottom-8 duration-700 delay-500 flex flex-col items-center">
                    <p className="text-center text-white/90 text-sm font-medium mb-8 leading-relaxed max-w-[260px] drop-shadow-md">
                        Your clinical metrics are ready. <br/> Let's breakdown your skin health.
                    </p>
                    <button 
                        onClick={() => onScanComplete(resultMetrics, capturedSnapshot)}
                        className="w-full h-16 bg-white text-teal-950 rounded-[2rem] font-black text-sm uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-3 group"
                    >
                        View Full Report 
                        <div className="w-8 h-8 rounded-full bg-teal-950/10 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                             <ArrowRight size={16} />
                        </div>
                    </button>
                </div>
            </div>
        </div>
      )
  }

  if (isProcessingAI) {
      return (
          <div className="h-screen w-full bg-black flex flex-col items-center justify-center relative overflow-hidden font-sans">
             {capturedSnapshot && (
                 <img src={capturedSnapshot} className="absolute inset-0 w-full h-full object-cover opacity-50 blur-sm scale-105" />
             )}
             <div className="relative z-10 flex flex-col items-center w-full max-w-[280px]">
                 <div className="w-24 h-24 relative mb-10">
                     <div className="absolute inset-0 bg-teal-500/30 rounded-full animate-ping duration-1000"></div>
                     <div className="relative z-10 w-24 h-24 bg-gradient-to-tr from-teal-500 to-cyan-600 rounded-full flex items-center justify-center shadow-2xl border border-white/20">
                        <BrainCircuit size={40} className="text-white animate-pulse" />
                     </div>
                 </div>
                 <h2 className="text-3xl font-black text-white tracking-tight mb-2 text-center">Analyzing</h2>
                 <p className="text-teal-200 text-xs font-bold tracking-widest uppercase mb-4 animate-pulse text-center">{getAIStatusText(aiProgress)}</p>
                 
                 {/* PRO TIP DISPLAY (Animated) */}
                 <div key={currentTip} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 mt-4 animate-in slide-in-from-bottom-4 fade-in duration-500 flex flex-col items-center text-center max-w-xs min-h-[100px] justify-center">
                     <div className="flex items-center gap-2 mb-2 text-teal-400">
                         <Lightbulb size={14} />
                         <span className="text-[10px] font-bold uppercase tracking-widest">Pro Tip</span>
                     </div>
                     <p className="text-white/80 text-xs font-medium leading-relaxed">
                         {currentTip}
                     </p>
                 </div>
             </div>
          </div>
      )
  }

  const radius = 130;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden font-sans select-none">
      <div 
        className="absolute inset-0 cursor-pointer"
        onClick={handleTapToFocus}
        onTouchStart={handleTapToFocus}
      >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }} 
          />
          <canvas 
            ref={canvasRef} 
            className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${!isScanning ? 'opacity-0' : 'opacity-100'}`} 
          />
      </div>

      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />

      {showFocusTarget && (
          <div 
            className="absolute w-20 h-20 border-2 border-teal-400 rounded-lg pointer-events-none animate-ping z-30 flex items-center justify-center shadow-[0_0_15px_rgba(45,212,191,0.5)]"
            style={{ top: showFocusTarget.y - 40, left: showFocusTarget.x - 40 }}
          >
              <div className="w-1.5 h-1.5 bg-teal-200 rounded-full"></div>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-teal-300 uppercase tracking-widest">Focus</div>
          </div>
      )}

      <div className="absolute inset-0 pointer-events-none z-10">
         <svg width="100%" height="100%" preserveAspectRatio="none">
           <defs>
             <mask id="faceMask">
               <rect width="100%" height="100%" fill="white" />
               <ellipse cx="50%" cy="45%" rx="38%" ry="28%" fill="black" />
             </mask>
           </defs>
           <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#faceMask)" />
         </svg>
      </div>
      
      <div className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none">
          <div className="w-full p-6 pt-12 flex justify-between items-start pointer-events-auto">
             <div className="bg-white/10 backdrop-blur-md rounded-full px-4 py-2 border border-white/10 flex items-center gap-2">
                <ScanFace size={16} className="text-white" />
                <span className="text-white text-xs font-bold tracking-wider">SKIN AI</span>
             </div>

             {/* Close Button - ADDED */}
             {onCancel && (
               <button 
                 onClick={onCancel}
                 className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white border border-white/10 hover:bg-black/40 transition-colors z-50 cursor-pointer"
               >
                 <X size={20} />
               </button>
             )}
          </div>

          {isScanning && (
              <div className="absolute top-28 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-full px-8 transition-all duration-300">
                  <div className={`backdrop-blur-xl rounded-full px-6 py-3 shadow-lg flex items-center gap-3 border transition-colors duration-300 ${getStatusColor()}`}>
                      {statusColor === 'error' ? <Target size={18} /> : statusColor === 'warning' ? <Lightbulb size={18} /> : <CheckCircle2 size={18} />}
                      <span className="text-sm font-bold uppercase tracking-wide">{instruction}</span>
                  </div>
              </div>
          )}

          <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[76vw] h-[56vh] flex items-center justify-center pointer-events-none">
              {!isScanning && (
                  <div className="absolute inset-0 border border-white/30 rounded-[48%] opacity-60"></div>
              )}

              {isScanning && (
                <svg className="w-[300px] h-[300px] absolute opacity-90 drop-shadow-2xl" style={{ transform: 'rotate(-90deg)' }}>
                   <circle cx="150" cy="150" r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="transparent" />
                   <circle
                      ref={circleRef}
                      cx="150" cy="150" r={radius}
                      stroke={statusColor === 'warning' ? '#FBBF24' : '#10B981'} 
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference}
                      strokeLinecap="round"
                      className="transition-all duration-300 shadow-[0_0_15px_rgba(255,255,255,0.2)]" 
                   />
                </svg>
              )}
          </div>

          <div className="w-full pb-safe pointer-events-auto">
            <div className="pt-20 pb-10 px-6 flex flex-col items-center justify-end h-48 bg-gradient-to-t from-black via-black/40 to-transparent">
                {streamError ? (
                     <div className="text-rose-300 bg-rose-900/40 px-6 py-4 rounded-xl backdrop-blur-md border border-rose-500/30 mb-8 text-center">
                        <p>{streamError}</p>
                        <button onClick={() => fileInputRef.current?.click()} className="mt-3 text-white text-sm underline font-bold">Upload Photo Instead</button>
                     </div>
                ) : !isScanning ? (
                    <div className="flex items-center gap-10 animate-in slide-in-from-bottom-8 duration-700">
                        <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-95 border border-white/10"><ImageIcon size={20} /></button>
                        <button onClick={() => setIsScanning(true)} className="w-20 h-20 bg-transparent rounded-full flex items-center justify-center border-4 border-white/30 hover:border-white transition-colors relative active:scale-95 group">
                            <div className="w-16 h-16 bg-white rounded-full group-hover:scale-90 transition-transform duration-300" />
                        </button>
                        <div className="w-12 h-12" /> 
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="text-white/80 text-xs font-medium tracking-widest uppercase animate-pulse mb-2 flex items-center justify-center gap-2">
                           <Focus size={12} /> Tap screen to focus
                        </p>
                        <button onClick={() => setIsScanning(false)} className="px-6 py-2 rounded-full bg-white/10 backdrop-blur text-white text-xs font-bold hover:bg-white/20">Cancel</button>
                    </div>
                )}
            </div>
          </div>
      </div>
    </div>
  );
};

export default FaceScanner;
