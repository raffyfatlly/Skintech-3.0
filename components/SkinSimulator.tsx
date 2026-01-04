import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { ArrowLeft, ScanFace, Sparkles, Loader, RefreshCw, Save, Check } from 'lucide-react';
import { generateRetouchedImage } from '../services/geminiService';

interface SkinSimulatorProps {
    user: UserProfile;
    onBack: () => void;
    location?: string;
    onUpdateUser: (user: UserProfile) => void;
}

const SkinSimulator: React.FC<SkinSimulatorProps> = ({ user, onBack, onUpdateUser }) => {
    const [originalImage, setOriginalImage] = useState<string | null>(user.faceImage || null);
    const [simulatedImage, setSimulatedImage] = useState<string | null>(user.simulatedSkinImage || null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [viewMode, setViewMode] = useState<'BEFORE' | 'AFTER'>('AFTER');
    const [error, setError] = useState<string | null>(null);

    // Auto-generate if not present
    useEffect(() => {
        if (originalImage && !simulatedImage && !isGenerating) {
            handleGenerate();
        }
    }, [originalImage, simulatedImage]);

    const handleGenerate = async () => {
        if (!originalImage) return;
        setIsGenerating(true);
        setError(null);
        
        try {
            const result = await generateRetouchedImage(originalImage);
            setSimulatedImage(result);
            setViewMode('AFTER');
            
            // Save to profile
            onUpdateUser({
                ...user,
                simulatedSkinImage: result
            });

        } catch (e: any) {
            console.error("Simulation failed", e);
            setError("Could not generate simulation. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleBackNav = () => {
        onBack();
    };

    if (!originalImage) {
        return (
            <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 text-center text-white font-sans">
                 <p className="mb-4">No face scan available.</p>
                 <button onClick={onBack} className="bg-white text-black px-6 py-2 rounded-full font-bold">Go Back</button>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col font-sans animate-in fade-in duration-500 overflow-y-auto">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-40 pt-safe-top pointer-events-none">
                <button 
                    onClick={handleBackNav}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors border border-white/10 pointer-events-auto"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg pointer-events-auto">
                    <span className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <ScanFace size={12} className="text-teal-400" /> Glow Up Visualizer
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 relative flex flex-col">
                <div className="relative flex-1 bg-zinc-900 w-full overflow-hidden">
                    {/* IMAGE DISPLAY */}
                    {isGenerating ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/80 backdrop-blur-sm">
                            <div className="w-20 h-20 rounded-full border-2 border-teal-500/30 flex items-center justify-center animate-spin mb-6">
                                <div className="w-14 h-14 rounded-full border-2 border-teal-400/50"></div>
                            </div>
                            <h2 className="text-2xl font-black text-white tracking-tight mb-2">Simulating</h2>
                            <p className="text-teal-400 text-xs font-bold uppercase tracking-widest animate-pulse">Generating your future skin...</p>
                        </div>
                    ) : (
                         <img 
                            src={viewMode === 'AFTER' && simulatedImage ? simulatedImage : originalImage} 
                            className="absolute inset-0 w-full h-full object-cover"
                            alt="Skin Analysis"
                        />
                    )}

                    {/* BEFORE/AFTER TOGGLE OVERLAY */}
                    {simulatedImage && !isGenerating && (
                        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 flex gap-2">
                            <button 
                                onClick={() => setViewMode('BEFORE')}
                                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'BEFORE' ? 'bg-white text-black scale-105' : 'bg-black/40 text-white backdrop-blur-md border border-white/10 hover:bg-black/60'}`}
                            >
                                Before
                            </button>
                             <button 
                                onClick={() => setViewMode('AFTER')}
                                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'AFTER' ? 'bg-teal-500 text-white scale-105 shadow-[0_0_20px_rgba(20,184,166,0.5)]' : 'bg-black/40 text-white backdrop-blur-md border border-white/10 hover:bg-black/60'}`}
                            >
                                After
                            </button>
                        </div>
                    )}
                    
                    {error && (
                        <div className="absolute bottom-32 left-6 right-6 z-30 bg-rose-900/90 text-white p-4 rounded-xl text-center border border-rose-500/50 backdrop-blur-md">
                            <p className="text-xs font-bold mb-2">{error}</p>
                            <button onClick={handleGenerate} className="px-4 py-2 bg-white text-rose-900 rounded-lg text-xs font-bold uppercase hover:bg-rose-50">Retry</button>
                        </div>
                    )}
                </div>

                {/* FOOTER ACTIONS */}
                <div className="bg-black border-t border-zinc-800 p-6 pt-8 pb-safe space-y-4">
                    <div className="flex items-center justify-between text-white mb-2">
                        <div>
                             <h3 className="text-lg font-black tracking-tight">AI Simulation</h3>
                             <p className="text-zinc-500 text-xs font-medium">Visualizing optimal skin health.</p>
                        </div>
                        {simulatedImage && (
                            <div className="flex gap-2">
                                <button onClick={handleGenerate} className="p-3 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                                    <RefreshCw size={18} />
                                </button>
                                <button className="p-3 rounded-full bg-teal-900/30 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                                    <Check size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    {!simulatedImage && !isGenerating && !error && (
                         <button 
                            onClick={handleGenerate}
                            className="w-full py-4 bg-white text-black rounded-2xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            <Sparkles size={16} /> Generate Simulation
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkinSimulator;
