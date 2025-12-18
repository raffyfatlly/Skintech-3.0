
import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, AlertOctagon, ScanLine, Image as ImageIcon, Upload, ZoomIn, ZoomOut, Zap, ZapOff, Search, ChevronRight } from 'lucide-react';
import { analyzeProductImage } from '../services/geminiService';
import { Product, UserProfile } from '../types';

interface ProductScannerProps {
  userProfile: UserProfile;
  onProductFound: (product: Product) => void;
  onCancel: () => void;
}

const ProductScanner: React.FC<ProductScannerProps> = ({ userProfile, onProductFound, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingText, setLoadingText] = useState("Initializing Vision...");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useCamera, setUseCamera] = useState(true);
  
  // Camera Capabilities State
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Cycle loading text to keep user engaged during deep search
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isProcessing) {
        const messages = [
            "Scanning product identity...",
            "Consulting global database...",
            "Resolving name variations...",
            "Checking ingredient safety...",
            "Calculating match score..."
        ];
        let i = 0;
        setLoadingText(messages[0]);
        interval = setInterval(() => {
            if (i < messages.length - 1) {
                i++;
                setLoadingText(messages[i]);
            }
        }, 2000); 
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let isMounted = true;

    const startCamera = async () => {
      if (!useCamera) return;

      try {
        // Request advanced constraints for zoom/torch
        const constraints: MediaStreamConstraints = {
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920 }, 
                height: { ideal: 1080 },
                // @ts-ignore - Non-standard constraints often work in modern browsers
                zoom: true,
                torch: true
            }
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!isMounted) {
            mediaStream.getTracks().forEach(t => t.stop());
            return;
        }
        
        setStream(mediaStream);
        currentStream = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
             videoRef.current?.play().catch(e => console.error("Play error", e));
             
             // Check Capabilities
             const track = mediaStream.getVideoTracks()[0];
             const capabilities = track.getCapabilities() as any;
             
             if (capabilities.torch) setHasTorch(true);
             if (capabilities.zoom) setMaxZoom(capabilities.zoom.max);
          };
        }
      } catch (err) {
        console.error("Camera Error", err);
        if (isMounted) setError("Camera access denied. Try uploading a photo.");
      }
    };
    
    startCamera();

    return () => {
        isMounted = false;
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
    }
  }, [useCamera]);

  const toggleTorch = async () => {
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      const newStatus = !torchOn;
      try {
          await track.applyConstraints({
              advanced: [{ torch: newStatus }] as any
          });
          setTorchOn(newStatus);
      } catch (e) {
          console.error("Torch failed", e);
      }
  };

  const handleZoom = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const z = parseFloat(e.target.value);
      setZoomLevel(z);
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      try {
          await track.applyConstraints({
              advanced: [{ zoom: z }] as any
          });
      } catch (err) {
          console.debug("Zoom failed", err);
      }
  };

  const processImageForAnalysis = async (base64: string) => {
      setCapturedImage(base64);
      setIsProcessing(true);
      setError(null);
      
      // Pause camera stream if active to save resources
      if (videoRef.current) {
          videoRef.current.pause();
      }

      try {
        // Turn off torch to save battery during processing
        if (torchOn && stream) {
             const track = stream.getVideoTracks()[0];
             track.applyConstraints({ advanced: [{ torch: false }] as any }).catch(() => {});
             setTorchOn(false);
        }

        const product = await analyzeProductImage(base64, userProfile.biometrics);
        onProductFound(product);
      } catch (err) {
        console.error(err);
        setError("Could not identify product. Try moving closer or typing the name.");
        setIsProcessing(false);
        setCapturedImage(null);
        // Restart camera
        if (videoRef.current) videoRef.current.play();
      }
  };

  const captureFromCamera = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.85); // High quality for OCR
    processImageForAnalysis(base64);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = reader.result as string;
          setUseCamera(false); // Stop camera
          processImageForAnalysis(base64);
      };
      reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col font-sans">
      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 p-6 z-40 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pt-12">
          <button onClick={onCancel} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/60 transition-colors">
              <X size={20} />
          </button>
          
          <div className="flex flex-col gap-2">
            {hasTorch && (
                <button 
                    onClick={toggleTorch} 
                    className={`p-3 rounded-full backdrop-blur-md transition-all ${torchOn ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'bg-black/40 text-white border border-white/10'}`}
                >
                    {torchOn ? <Zap size={20} fill="currentColor" /> : <ZapOff size={20} />}
                </button>
            )}
            
            {/* SEARCH FALLBACK */}
            <button 
                onClick={() => {
                   // This assumes parent handles navigation if onCancel passes a specific flag, 
                   // but for now we just rely on the user navigating via menu if they want to search.
                   // Ideally, we'd have a prop 'switchToSearch'. For MVP:
                   onCancel();
                }}
                className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/60 transition-colors"
                title="Type Name Instead"
            >
                <Search size={20} />
            </button>
          </div>
      </div>

      <div className="relative flex-1 bg-black overflow-hidden flex flex-col items-center justify-center">
        
        {/* Dynamic Background for Captured Image */}
        {capturedImage && (
            <div className="absolute inset-0 z-0">
                <img 
                    src={capturedImage} 
                    alt="Background" 
                    className="w-full h-full object-cover blur-xl scale-110 opacity-40" 
                />
            </div>
        )}

        {/* Foreground Content */}
        <div className="relative z-10 w-full h-full flex items-center justify-center">
            {capturedImage ? (
               <img src={capturedImage} alt="Captured" className="w-full h-full object-contain animate-in fade-in zoom-in-95 duration-300 drop-shadow-2xl" />
            ) : useCamera ? (
               <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
               <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-zinc-900">
                   <ImageIcon size={64} opacity={0.2} />
               </div>
            )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
        <input 
            type="file" 
            ref={fileInputRef} 
            accept="image/*" 
            className="hidden" 
            onChange={handleFileUpload}
        />
        
        {/* SCANNING OVERLAY (Only on Camera) */}
        {!capturedImage && useCamera && (
            <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center">
                {/* Focus Bracket Animation */}
                <div className="w-72 h-72 border border-white/30 rounded-3xl relative overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400 rounded-br-xl"></div>
                    
                    {/* Scanning Line */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent shadow-[0_0_20px_rgba(45,212,191,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                    
                    {/* Center Point */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-30">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                </div>

                <div className="mt-8 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 animate-pulse">
                    <p className="text-white text-xs font-bold uppercase tracking-widest">
                        Center Product Name
                    </p>
                </div>
            </div>
        )}
        
        {/* Loading State Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-30 animate-in fade-in duration-500">
            <div className="text-center p-6 relative w-full max-w-xs">
               <div className="relative w-24 h-24 mx-auto mb-8">
                    <div className="absolute inset-0 border-4 border-zinc-700 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-t-teal-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ScanLine size={32} className="text-teal-500 animate-pulse" />
                    </div>
               </div>
               <h3 className="text-xl font-black text-white mb-3 tracking-tight drop-shadow-md">{loadingText}</h3>
               <p className="text-teal-400 text-[10px] font-bold uppercase tracking-widest">Powered by Gemini Vision</p>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER CONTROLS */}
      <div className="bg-black/90 backdrop-blur-xl p-6 pb-10 border-t border-white/10 flex flex-col items-center gap-6 relative z-40">
        
        {/* Error Message */}
        {error && (
            <div className="absolute -top-16 left-4 right-4 text-rose-200 text-xs font-bold flex items-center justify-center gap-2 bg-rose-950/90 px-4 py-3 rounded-xl border border-rose-500/50 shadow-lg animate-in slide-in-from-bottom-2">
                <AlertOctagon size={16} /> {error}
            </div>
        )}

        {/* Zoom Slider */}
        {maxZoom > 1 && !capturedImage && (
            <div className="flex items-center gap-4 w-full max-w-xs px-4">
                <ZoomOut size={16} className="text-zinc-500" />
                <input 
                    type="range" 
                    min="1" 
                    max={Math.min(maxZoom, 3)} // Cap zoom at 3x for usability
                    step="0.1" 
                    value={zoomLevel} 
                    onChange={handleZoom}
                    className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                />
                <ZoomIn size={16} className="text-white" />
            </div>
        )}
        
        <div className="flex w-full items-center justify-between max-w-sm px-2">
            
            {/* Gallery Upload */}
            <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isProcessing}
                className="flex flex-col items-center gap-2 text-zinc-400 hover:text-white transition-colors p-2"
            >
                <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center hover:bg-zinc-800 transition-colors">
                    <ImageIcon size={20} />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-widest">Upload</span>
            </button>
            
            {/* Shutter Button */}
            <button 
                onClick={captureFromCamera}
                disabled={isProcessing || !useCamera}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center relative group active:scale-95 transition disabled:opacity-50 disabled:scale-100 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)]"
            >
                <div className="w-16 h-16 bg-white rounded-full transition-transform group-active:scale-90"></div>
            </button>

            {/* Hint / Spacer */}
            <div className="flex flex-col items-center gap-2 text-zinc-400 p-2 opacity-0 pointer-events-none">
                <div className="w-12 h-12"></div>
                <span className="text-[9px] font-bold uppercase tracking-widest">History</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ProductScanner;
