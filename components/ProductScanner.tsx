
import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Check, X, AlertOctagon, ScanLine, Image as ImageIcon, Upload, ZoomIn, ZoomOut, Zap, ZapOff, Search, ChevronRight, Lock, Crown, Minimize2, Loader, Database, ShieldCheck } from 'lucide-react';
import { Product, UserProfile } from '../types';

interface ProductScannerProps {
  userProfile: UserProfile;
  shelf: Product[];
  onStartAnalysis: (base64: string) => void;
  onCancel: () => void;
  usageCount: number;
  limit: number;
  isPremium: boolean;
  onUnlockPremium: () => void;
}

const ProductScanner: React.FC<ProductScannerProps> = ({ userProfile, shelf, onStartAnalysis, onCancel, usageCount, limit, isPremium, onUnlockPremium }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [useCamera, setUseCamera] = useState(true);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // NEW: Internal processing state for UI feedback
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("Initializing scan...");

  const isLimitReached = !isPremium && usageCount >= limit;

  // Cycle Status Text
  useEffect(() => {
      let interval: ReturnType<typeof setInterval>;
      if (isProcessing) {
          const steps = [
              "Extracting text from image...",
              "Identifying brand & product name...",
              "Retrieving ingredient list...",
              "Cross-referencing allergies...",
              "Analyzing skin compatibility...",
              "Finalizing safety report..."
          ];
          let i = 0;
          setStatusText(steps[0]);
          interval = setInterval(() => {
              i = (i + 1) % steps.length;
              setStatusText(steps[i]);
          }, 3000);
      }
      return () => clearInterval(interval);
  }, [isProcessing]);

  useEffect(() => {
    // If limit reached, don't start camera
    if (isLimitReached) return;

    let currentStream: MediaStream | null = null;
    let isMounted = true;

    const startCamera = async () => {
      if (!useCamera) return;
      try {
        const constraints: MediaStreamConstraints = {
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920 }, 
                height: { ideal: 1080 },
                // @ts-ignore
                zoom: true
                // torch: false // Default to off
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
        if (currentStream) currentStream.getTracks().forEach(track => track.stop());
    }
  }, [useCamera, isLimitReached]);

  const toggleTorch = async () => {
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      const newStatus = !torchOn;
      try {
          await track.applyConstraints({ advanced: [{ torch: newStatus }] as any });
          setTorchOn(newStatus);
      } catch (e) { console.error("Torch failed", e); }
  };

  const handleZoom = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const z = parseFloat(e.target.value);
      setZoomLevel(z);
      if (!stream) return;
      const track = stream.getVideoTracks()[0];
      try { await track.applyConstraints({ advanced: [{ zoom: z }] as any }); } catch (err) { console.debug("Zoom failed", err); }
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
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    
    // Stop torch before leaving
    if (torchOn && stream) {
         const track = stream.getVideoTracks()[0];
         track.applyConstraints({ advanced: [{ torch: false }] as any }).catch(() => {});
    }
    
    setIsProcessing(true);
    onStartAnalysis(base64);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = reader.result as string;
          setIsProcessing(true);
          onStartAnalysis(base64);
      };
      reader.readAsDataURL(file);
  };

  if (isLimitReached) {
      return (
          <div className="fixed inset-0 bg-black z-50 flex flex-col font-sans items-center justify-center p-6 text-center">
              <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800 shadow-2xl relative">
                  <div className="absolute inset-0 bg-amber-500/10 rounded-full animate-pulse"></div>
                  <Lock size={32} className="text-zinc-400 relative z-10" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">Scan Limit Reached</h2>
              <p className="text-zinc-400 text-sm font-medium mb-8 max-w-xs leading-relaxed">
                  You've used your 3 free scans. Unlock unlimited vision analysis to continue building your routine.
              </p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button 
                      onClick={onUnlockPremium}
                      className="w-full py-4 bg-white text-zinc-900 rounded-xl font-bold text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                      <Crown size={16} className="text-amber-500" /> Unlock Unlimited
                  </button>
                  <button 
                      onClick={onCancel}
                      className="w-full py-4 bg-zinc-900 text-zinc-500 rounded-xl font-bold text-sm uppercase tracking-widest hover:text-white transition-colors"
                  >
                      Go Back
                  </button>
              </div>
          </div>
      )
  }

  // --- PROMINENT PROCESSING UI ---
  if (isProcessing) {
      return (
          <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500 font-sans">
              
              {/* Animated Radar */}
              <div className="w-48 h-48 relative mb-12 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-teal-500/30 rounded-full animate-[spin_4s_linear_infinite]"></div>
                  <div className="absolute inset-4 border-2 border-teal-500/20 rounded-full animate-[spin_3s_linear_infinite_reverse]"></div>
                  <div className="absolute inset-0 rounded-full bg-teal-500/10 blur-xl animate-pulse"></div>
                  
                  {/* Scanner Beam */}
                  <div className="absolute inset-x-0 h-1 bg-teal-400/50 shadow-[0_0_15px_rgba(45,212,191,0.8)] animate-[scan_1.5s_ease-in-out_infinite]"></div>

                  <div className="relative z-10 bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-2xl">
                      <ScanLine size={48} className="text-teal-400" />
                  </div>
              </div>
              
              <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Analyzing Product</h2>
              <p className="text-sm text-teal-400 font-bold uppercase tracking-widest mb-1 animate-pulse">
                  {statusText}
              </p>
              <p className="text-zinc-500 text-xs font-medium mb-12 max-w-xs leading-relaxed">
                  This deep AI audit checks thousands of ingredients. It may take a few minutes to complete.
              </p>

              <div className="w-full max-w-xs space-y-4">
                  <button 
                      disabled className="w-full py-4 bg-zinc-900 text-zinc-400 rounded-xl font-bold text-xs uppercase tracking-widest cursor-wait flex items-center justify-center gap-2 border border-zinc-800"
                  >
                      <Loader size={14} className="animate-spin" /> Processing...
                  </button>
                  
                  <button 
                      onClick={onCancel} 
                      className="w-full py-4 text-zinc-500 font-bold text-xs uppercase tracking-widest hover:text-white transition-colors flex items-center justify-center gap-2 group"
                  >
                      <Minimize2 size={16} className="group-hover:-translate-y-0.5 transition-transform" /> 
                      Run in Background
                  </button>
                  <p className="text-[10px] text-zinc-600">
                      You'll be notified when the results are ready.
                  </p>
              </div>
          </div>
      )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col font-sans">
      <div className="absolute top-0 left-0 right-0 p-6 z-40 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pt-12">
          <button onClick={onCancel} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/60 transition-colors"><X size={20} /></button>
          <div className="flex flex-col gap-2">
            {hasTorch && <button onClick={toggleTorch} className={`p-3 rounded-full backdrop-blur-md transition-all ${torchOn ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20' : 'bg-black/40 text-white border border-white/10'}`}>{torchOn ? <Zap size={20} fill="currentColor" /> : <ZapOff size={20} />}</button>}
            <button onClick={() => onCancel()} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/60 transition-colors"><Search size={20} /></button>
          </div>
      </div>

      <div className="relative flex-1 bg-black overflow-hidden flex flex-col items-center justify-center">
        <div className="relative z-10 w-full h-full flex items-center justify-center">
            {useCamera ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-zinc-900"><ImageIcon size={64} opacity={0.2} /></div>}
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
        {useCamera && (
            <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-72 h-72 border border-white/30 rounded-3xl relative overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400 rounded-br-xl"></div>
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent shadow-[0_0_20px_rgba(45,212,191,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-30"><div className="w-2 h-2 bg-white rounded-full"></div></div>
                </div>
                <div className="mt-8 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 animate-pulse"><p className="text-white text-xs font-bold uppercase tracking-widest">Center Product Name</p></div>
            </div>
        )}
      </div>

      <div className="bg-black/90 backdrop-blur-xl p-6 pb-10 border-t border-white/10 flex flex-col items-center gap-6 relative z-40">
        {error && <div className="absolute -top-16 left-4 right-4 text-rose-200 text-xs font-bold flex items-center justify-center gap-2 bg-rose-950/90 px-4 py-3 rounded-xl border border-rose-500/50 shadow-lg animate-in slide-in-from-bottom-2"><AlertOctagon size={16} /> {error}</div>}
        {maxZoom > 1 && <div className="flex items-center gap-4 w-full max-w-xs px-4"><ZoomOut size={16} className="text-zinc-500" /><input type="range" min="1" max={Math.min(maxZoom, 3)} step="0.1" value={zoomLevel} onChange={handleZoom} className="flex-1 h-1 bg-zinc-700 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" /><ZoomIn size={16} className="text-white" /></div>}
        <div className="flex w-full items-center justify-between max-w-sm px-2">
            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 text-zinc-400 hover:text-white transition-colors p-2"><div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center hover:bg-zinc-800 transition-colors"><ImageIcon size={20} /></div><span className="text-[9px] font-bold uppercase tracking-widest">Upload</span></button>
            <button onClick={captureFromCamera} disabled={!useCamera} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center relative group active:scale-95 transition disabled:opacity-50 disabled:scale-100 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)]"><div className="w-16 h-16 bg-white rounded-full transition-transform group-active:scale-90"></div></button>
            <div className="flex flex-col items-center gap-2 text-zinc-400 p-2 opacity-0 pointer-events-none"><div className="w-12 h-12"></div><span className="text-[9px] font-bold uppercase tracking-widest">History</span></div>
        </div>
      </div>
    </div>
  );
};

export default ProductScanner;
