
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UserProfile, UserPreferences, SkinMetrics, Product } from '../types';
import { ArrowLeft, Check, Sparkles, Target, Zap, Activity, TrendingUp, LineChart, X, Trash2, Settings2, ChevronDown, ChevronRight, Minus, Trophy, LogOut, AlertCircle, Clock, Calendar, Edit2 } from 'lucide-react';
import { signOut, auth } from '../services/firebase';

// Helper to parse markdown-style bolding from AI response
const renderFormattedText = (text: string) => {
  if (!text) return null;
  // Clean up bullets/asterisks
  const cleanText = text.replace(/^\s*\*\s*/gm, '• ').replace(/\*\*/g, ''); 
  // We can also handle bolding properly:
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-teal-800">{part.slice(2, -2)}</strong>;
    }
    // Remove standalone asterisks that might be left over
    return <span key={i}>{part.replace(/^\s*\*\s*/gm, '• ')}</span>;
  });
};

interface ProfileSetupProps {
  user: UserProfile;
  shelf?: Product[];
  onComplete: (updatedProfile: UserProfile) => void;
  onBack: () => void;
  onReset: () => void;
  onLoginRequired: (trigger: string) => void;
}

// --- SUB-COMPONENT: MONTH GROUP (Expandable) ---
const MonthGroup: React.FC<{ 
    monthYear: string; 
    scans: SkinMetrics[]; 
    onSelect: (s: SkinMetrics) => void 
}> = ({ monthYear, scans, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-zinc-100 last:border-0 bg-white">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-4 pl-6 pr-6 text-left hover:bg-zinc-50 transition-colors group"
            >
                <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm border ${isOpen ? 'bg-teal-50 text-teal-600 border-teal-100' : 'bg-white text-zinc-400 border-zinc-100 group-hover:border-zinc-200'}`}>
                        <Calendar size={14} />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-widest leading-none mb-1">{monthYear}</h4>
                        <span className="text-[10px] text-zinc-400 font-medium">{scans.length} Scan{scans.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div className={`transition-transform duration-300 text-zinc-300 ${isOpen ? 'rotate-180 text-teal-500' : ''}`}>
                    <ChevronDown size={16} />
                </div>
            </button>
            
            {isOpen && (
                <div className="space-y-2 pb-6 px-6 pt-1 animate-in slide-in-from-top-2 duration-300 bg-zinc-50/50 border-t border-zinc-50">
                    {scans.map((entry) => (
                          <button 
                              key={entry.timestamp} 
                              onClick={() => onSelect(entry)}
                              className="w-full bg-white border border-zinc-100 hover:border-teal-200 hover:shadow-md p-3 rounded-xl flex items-center justify-between shadow-sm transition-all duration-200 group/item text-left relative overflow-hidden"
                          >
                               <div className="flex items-center gap-3 relative z-10">
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-xs transition-colors border ${entry.overallScore > 80 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : entry.overallScore < 60 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                      {entry.overallScore}
                                  </div>
                                  <div>
                                      <span className="block text-xs font-bold text-zinc-900 mb-0.5">
                                          {new Date(entry.timestamp).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      <span className="text-[9px] font-bold text-zinc-400 group-hover/item:text-teal-600 transition-colors">
                                          View Analysis
                                      </span>
                                  </div>
                              </div>
                              <ChevronRight size={14} className="text-zinc-200 group-hover/item:text-teal-400 transition-colors" />
                          </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- SUB-COMPONENT: GOAL EDIT MODAL ---
const GoalEditModal: React.FC<{ 
    currentPreferences: UserPreferences; 
    onSave: (prefs: UserPreferences) => void; 
    onClose: () => void; 
}> = ({ currentPreferences, onSave, onClose }) => {
    const [goals, setGoals] = useState<string[]>(currentPreferences.goals || []);
    const [sensitivity, setSensitivity] = useState(currentPreferences.sensitivity || 'MILD');

    const goalOptions = [
        { label: "Clear Acne & Blemishes", icon: <Target size={16} /> },
        { label: "Smooth & Hydrated Skin", icon: <Sparkles size={16} /> },
        { label: "Look Younger & Firm", icon: <Activity size={16} /> },
        { label: "Brighten Dark Spots", icon: <Zap size={16} /> },
    ];

    const toggleGoal = (goal: string) => {
        if (goals.includes(goal)) {
            setGoals(goals.filter(g => g !== goal));
        } else {
            setGoals([...goals, goal]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/60 backdrop-blur-md animate-in fade-in">
            <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-6 shadow-2xl animate-in zoom-in-95 relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-black text-zinc-900">Tracking Goals</h3>
                        <p className="text-xs text-zinc-400 font-medium">Customize your analysis focus</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-zinc-50 rounded-full text-zinc-400 hover:text-zinc-900 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-3 pl-1">Select your priorities</label>
                        <div className="grid grid-cols-1 gap-2">
                            {goalOptions.map(opt => {
                                const isSelected = goals.includes(opt.label);
                                return (
                                    <button
                                        key={opt.label}
                                        onClick={() => toggleGoal(opt.label)}
                                        className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left group active:scale-[0.98] ${isSelected ? 'bg-teal-50 border-teal-500 text-teal-900' : 'bg-white border-zinc-100 text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isSelected ? 'bg-teal-500 text-white' : 'bg-zinc-100 text-zinc-400 group-hover:bg-white'}`}>
                                            {opt.icon}
                                        </div>
                                        <span className="font-bold text-sm">{opt.label}</span>
                                        {isSelected && <Check size={16} className="ml-auto text-teal-600" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                         <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-3 pl-1">Skin Sensitivity</label>
                         <div className="flex bg-zinc-100/50 p-1 rounded-2xl border border-zinc-100">
                             {['NOT_SENSITIVE', 'MILD', 'VERY_SENSITIVE'].map((s) => (
                                 <button
                                    key={s}
                                    onClick={() => setSensitivity(s as any)}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase transition-all ${sensitivity === s ? 'bg-white shadow-sm text-teal-700 ring-1 ring-zinc-100' : 'text-zinc-400 hover:text-zinc-600'}`}
                                 >
                                    {s === 'NOT_SENSITIVE' ? 'Normal' : s === 'VERY_SENSITIVE' ? 'High' : 'Mild'}
                                 </button>
                             ))}
                         </div>
                    </div>

                    <button 
                        onClick={() => onSave({ ...currentPreferences, goals, sensitivity })}
                        className="w-full py-4 rounded-[1.5rem] bg-zinc-900 text-white font-bold text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-zinc-900/10"
                    >
                        Save Preferences
                    </button>
                </div>
            </div>
        </div>
    )
}

// --- SUB-COMPONENT: HISTORY CHART (CANVAS) ---
const HistoryChart: React.FC<{ history: SkinMetrics[] }> = ({ history }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ x: number, y: number, score: number, date: string } | null>(null);
    const pointsRef = useRef<{ x: number, y: number, metric: SkinMetrics }[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || history.length < 2) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle High DPI
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, bottom: 20, left: 10, right: 10 };
        const drawWidth = width - padding.left - padding.right;
        const drawHeight = height - padding.top - padding.bottom;

        // Data Prep
        const data = [...history].sort((a, b) => a.timestamp - b.timestamp);
        const scores = data.map(d => d.overallScore);
        const minScore = Math.min(...scores, 60) - 5;
        const maxScore = Math.max(...scores, 95) + 5;
        const range = maxScore - minScore;

        const getX = (i: number) => padding.left + (i / (data.length - 1)) * drawWidth;
        const getY = (s: number) => height - padding.bottom - ((s - minScore) / range) * drawHeight;

        // Clear
        ctx.clearRect(0, 0, width, height);

        const points = data.map((d, i) => ({ x: getX(i), y: getY(d.overallScore), metric: d }));
        pointsRef.current = points; // Store for hit testing

        // Gradient Fill (Curve)
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, 'rgba(13, 148, 136, 0.15)');
        gradient.addColorStop(1, 'rgba(13, 148, 136, 0)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, height - padding.bottom);
        ctx.lineTo(points[0].x, points[0].y);
        
        // Draw Curve
        for (let i = 0; i < points.length - 1; i++) {
            const midX = (points[i].x + points[i+1].x) / 2;
            const midY = (points[i].y + points[i+1].y) / 2;
            const p1 = points[i];
            
            // Quadratic curve logic for smoothness
            if (i === 0) {
                 ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
            } else {
                 ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
            }
        }
        // Connect to last point
        const last = points[points.length-1];
        ctx.lineTo(last.x, last.y);
        ctx.lineTo(last.x, height - padding.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Stroke (Curve)
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
             const midX = (points[i].x + points[i+1].x) / 2;
             const midY = (points[i].y + points[i+1].y) / 2;
             if (i === points.length - 2) {
                 ctx.quadraticCurveTo(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
             } else {
                 ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
             }
        }
        ctx.strokeStyle = '#0d9488';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Dots
        points.forEach((p, i) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#0d9488';
            ctx.stroke();

            // Label
            ctx.fillStyle = '#52525b'; // zinc-600
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            // Always show first and last, show others if spare
            if (i === 0 || i === points.length - 1) {
                 ctx.fillText(scores[i].toString(), p.x, p.y - 12);
            } else if (points.length < 10) {
                 ctx.fillText(scores[i].toString(), p.x, p.y - 12);
            }
        });

    }, [history]);

    const handleInteraction = (clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        
        let nearest = null;
        let minDist = Infinity;
        
        pointsRef.current.forEach(p => {
            const dist = Math.abs(p.x - x);
            if (dist < minDist && dist < 40) { // 40px hit radius
                minDist = dist;
                nearest = p;
            }
        });
    
        if (nearest) {
            setTooltip({
                x: nearest.x,
                y: nearest.y,
                score: nearest.metric.overallScore,
                date: new Date(nearest.metric.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            });
        } else {
            setTooltip(null);
        }
    };
    
    return (
        <div 
            ref={containerRef} 
            className="w-full h-40 relative group cursor-crosshair touch-none"
            onMouseMove={(e) => handleInteraction(e.clientX)}
            onTouchMove={(e) => handleInteraction(e.touches[0].clientX)}
            onMouseLeave={() => setTooltip(null)}
            onTouchEnd={() => setTooltip(null)}
        >
            <canvas ref={canvasRef} />
            
            {tooltip && (
                <div 
                    className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 animate-in fade-in zoom-in-95 duration-200"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    <div className="bg-zinc-800 text-white rounded-lg shadow-xl shadow-zinc-900/20 py-2 px-3 flex flex-col items-center">
                        <span className="text-sm font-black leading-none mb-0.5">{tooltip.score}</span>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide leading-none">{tooltip.date}</span>
                        {/* Triangle */}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-800 rotate-45"></div>
                    </div>
                </div>
            )}

            {/* Active Point Indicator */}
            {tooltip && (
                <div 
                    className="absolute w-3 h-3 rounded-full border-2 border-white bg-teal-500 shadow-md pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
                    style={{ left: tooltip.x, top: tooltip.y }}
                />
            )}
        </div>
    );
};

// --- SUB-COMPONENT: HISTORY DETAIL MODAL ---
const ScanDetailModal: React.FC<{ scan: SkinMetrics; onClose: () => void }> = ({ scan, onClose }) => {
    const dateStr = new Date(scan.timestamp).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    // Calculate primary concern for this specific scan
    const concerns = [
        { label: 'Acne', val: scan.acneActive },
        { label: 'Hydration', val: scan.hydration },
        { label: 'Redness', val: scan.redness },
        { label: 'Texture', val: scan.texture },
        { label: 'Wrinkles', val: scan.wrinkleFine },
    ].sort((a,b) => a.val - b.val);
    
    const primaryIssue = concerns[0];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-teal-900/40 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 relative animate-in zoom-in-95 shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-teal-50 to-white pointer-events-none" />
                
                <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-white rounded-full text-zinc-400 hover:text-zinc-900 transition-colors z-20 shadow-sm border border-zinc-100">
                    <X size={20} />
                </button>

                <div className="relative z-10 text-center mb-8">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-zinc-100 shadow-sm">{dateStr}</span>
                    <h2 className="text-6xl font-black text-zinc-900 mt-6 mb-2 tracking-tighter">{scan.overallScore}</h2>
                    <p className="text-sm font-bold text-teal-600 uppercase tracking-wide">Skin Health Score</p>
                </div>

                <div className="space-y-4 relative z-10">
                    <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Activity size={14} className="text-teal-500" /> Primary Analysis
                        </h4>
                        <div className="text-sm font-medium text-zinc-700 leading-relaxed">
                            {renderFormattedText(scan.analysisSummary || `During this scan, your primary concern was ${primaryIssue.label.toLowerCase()} (Score: ${primaryIssue.val}).`)}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                         <div className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm">
                             <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Hydration</span>
                             <div className="h-2 bg-zinc-100 rounded-full overflow-hidden mb-1">
                                 <div className="h-full bg-sky-400" style={{ width: `${scan.hydration}%` }} />
                             </div>
                             <span className="text-xs font-bold text-zinc-900">{scan.hydration}%</span>
                         </div>
                         <div className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm">
                             <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Acne</span>
                             <div className="h-2 bg-zinc-100 rounded-full overflow-hidden mb-1">
                                 <div className="h-full bg-rose-400" style={{ width: `${scan.acneActive}%` }} />
                             </div>
                             <span className="text-xs font-bold text-zinc-900">{scan.acneActive}%</span>
                         </div>
                         <div className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm">
                             <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Redness</span>
                             <div className="h-2 bg-zinc-100 rounded-full overflow-hidden mb-1">
                                 <div className="h-full bg-amber-400" style={{ width: `${scan.redness}%` }} />
                             </div>
                             <span className="text-xs font-bold text-zinc-900">{scan.redness}%</span>
                         </div>
                         <div className="p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm">
                             <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">Texture</span>
                             <div className="h-2 bg-zinc-100 rounded-full overflow-hidden mb-1">
                                 <div className="h-full bg-teal-400" style={{ width: `${scan.texture}%` }} />
                             </div>
                             <span className="text-xs font-bold text-zinc-900">{scan.texture}%</span>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProfileSetup: React.FC<ProfileSetupProps> = ({ user, shelf = [], onComplete, onBack, onReset, onLoginRequired }) => {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [selectedScan, setSelectedScan] = useState<SkinMetrics | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  
  // Editing State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editAge, setEditAge] = useState(user.age.toString());
  
  // Clear Data Confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const history = useMemo(() => user.scanHistory || [user.biometrics], [user.scanHistory, user.biometrics]);

  // --- HELPER: Goal Progress ---
  const getGoalProgress = (goal: string, currentMetrics: SkinMetrics, initialMetrics: SkinMetrics) => {
      let metricKeys: (keyof SkinMetrics)[] = [];
      let label = "";

      switch(goal) {
          case "Clear Acne & Blemishes":
              metricKeys = ['acneActive', 'acneScars', 'blackheads'];
              label = "Acne & Clarity";
              break;
          case "Smooth & Hydrated Skin":
              metricKeys = ['hydration', 'texture', 'oiliness'];
              label = "Hydration & Texture";
              break;
          case "Look Younger & Firm":
              metricKeys = ['wrinkleFine', 'wrinkleDeep', 'sagging'];
              label = "Youth & Firmness";
              break;
          case "Brighten Dark Spots":
              metricKeys = ['pigmentation', 'darkCircles'];
              label = "Brightening";
              break;
          default:
              return null;
      }

      if (metricKeys.length === 0) return null;

      const currentAvg = metricKeys.reduce((acc, k) => {
          const val = currentMetrics[k];
          return acc + (typeof val === 'number' ? val : 0);
      }, 0) / metricKeys.length;

      const initialAvg = metricKeys.reduce((acc, k) => {
          const val = initialMetrics[k];
          return acc + (typeof val === 'number' ? val : 0);
      }, 0) / metricKeys.length;
      
      const delta = Math.round(currentAvg - initialAvg);
      
      return {
          label,
          current: Math.round(currentAvg),
          start: Math.round(initialAvg),
          target: 90, // Aspiration
          delta
      };
  };

  const handleGoalsSave = (newPrefs: UserPreferences) => {
      onComplete({ ...user, preferences: newPrefs });
      setIsGoalModalOpen(false);
  };
  
  const handleSaveProfile = () => {
      if (editName && editAge) {
          onComplete({
              ...user,
              name: editName,
              age: parseInt(editAge)
          });
          setIsEditingProfile(false);
      }
  };

  const handleSignOut = async () => {
    await signOut();
    onReset(); // Clear local state in App
  }

  // --- RENDER: OVERVIEW ---
  // History Processing
  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sortedHistory[0];
  const previous = sortedHistory.length > 1 ? sortedHistory[1] : null;
  const initial = sortedHistory[sortedHistory.length - 1]; // Baseline
  const totalProgress = latest.overallScore - initial.overallScore;

  // Group History by Month for Scalability
  const groupedHistory: Record<string, SkinMetrics[]> = {};
  sortedHistory.forEach(scan => {
      const date = new Date(scan.timestamp);
      const key = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
      if (!groupedHistory[key]) groupedHistory[key] = [];
      groupedHistory[key].push(scan);
  });

  // --- PREMIUM PROGRESS INTELLIGENCE LOGIC ---
  const progressIntel = useMemo(() => {
    if (!previous) return null;
    
    // 1. Time Context
    const timeDiffMs = latest.timestamp - previous.timestamp;
    const hoursDiff = timeDiffMs / (1000 * 60 * 60);
    const daysDiff = hoursDiff / 24;

    const isRapidRescan = hoursDiff < 24;
    const isShortTerm = daysDiff < 7;
    const isMediumTerm = daysDiff >= 7 && daysDiff < 30;
    const isLongTerm = daysDiff >= 30;

    // 2. Score Deltas & Driving Factors
    const scoreDiff = latest.overallScore - previous.overallScore;
    
    // Find biggest mover
    const metricsToCheck: (keyof SkinMetrics)[] = ['redness', 'hydration', 'acneActive', 'texture', 'wrinkleFine', 'pigmentation'];
    let biggestMover = { key: '', val: 0 };
    
    metricsToCheck.forEach(key => {
        const diff = (latest[key] as number) - (previous[key] as number);
        if (Math.abs(diff) > Math.abs(biggestMover.val)) {
            biggestMover = { key, val: diff };
        }
    });

    const primaryFactorName = biggestMover.key === 'acneActive' ? 'Inflammation' : biggestMover.key.charAt(0).toUpperCase() + biggestMover.key.slice(1);
    
    // 3. Shelf Context (Added Products)
    const addedProducts = shelf.filter(p => p.dateScanned > previous.timestamp && p.dateScanned < latest.timestamp);
    const latestProduct = addedProducts.length > 0 ? addedProducts[addedProducts.length - 1] : null;

    // 4. Constructing the Narrative
    let statusTitle = "";
    let statusDesc = "";
    let strategy = "";
    let visualState: 'NEUTRAL' | 'GOOD' | 'BAD' = 'NEUTRAL';

    // SCENARIO A: RAPID RESCAN (< 24 Hours)
    if (isRapidRescan) {
        statusTitle = "Skin Progress"; // Changed from 'Daily Change'
        visualState = 'NEUTRAL';
        
        if (Math.abs(scoreDiff) > 5) {
            statusDesc = `Biometrics show a ${scoreDiff > 0 ? '+' : ''}${scoreDiff} point shift in ${Math.round(hoursDiff)} hours. likely due to hydration/lighting.`;
            strategy = "Focus on how your skin feels. Small daily shifts are normal.";
        } else {
            statusTitle = "Stable";
            statusDesc = "Your skin metrics are consistent with your last scan.";
            strategy = "No immediate action needed. Continue your current routine.";
        }
    }
    // SCENARIO B: SHORT TERM (1-7 Days) -> Reaction Check
    else if (isShortTerm) {
        statusTitle = "Weekly Check";
        if (scoreDiff < -3) {
            visualState = 'BAD';
            statusDesc = `A dip driven by ${primaryFactorName} (${biggestMover.val}).`;
            if (latestProduct) {
                statusDesc += ` This coincides with adding ${latestProduct.name}.`;
                strategy = `Monitor ${primaryFactorName}. If it worsens, pause the new product.`;
            } else {
                strategy = "Check for lack of sleep or environmental stress.";
            }
        } else if (scoreDiff > 3) {
            visualState = 'GOOD';
            statusDesc = `Early signs of improvement in ${primaryFactorName} (+${biggestMover.val}).`;
            strategy = "Your skin is responding well. Keep going.";
        } else {
            statusTitle = "Balanced";
            statusDesc = "Your skin is maintaining balance. No major spikes.";
            strategy = "This stability is good. You can safely introduce actives if needed.";
        }
    }
    // SCENARIO C: MEDIUM/LONG TERM (> 7 Days) -> Efficacy Check
    else {
        statusTitle = "Long-Term Trend";
        if (scoreDiff > 5) {
            visualState = 'GOOD';
            statusDesc = `Significant progress. ${primaryFactorName} improved by +${biggestMover.val} points over ${Math.round(daysDiff)} days.`;
            strategy = "Your routine is effective. Keep it up.";
        } else if (scoreDiff < -5) {
            statusTitle = "Needs Attention";
            visualState = 'BAD';
            statusDesc = `Decline detected over ${Math.round(daysDiff)} days in ${primaryFactorName}.`;
            strategy = "Your routine may need adjustment. Consider simplifying to reset.";
        } else {
             statusTitle = "Maintained";
             visualState = 'NEUTRAL';
             statusDesc = `Your skin health is steady over the long term.`;
             strategy = "To see more change, consider adding a targeted treatment.";
        }
    }

    return { 
        title: statusTitle, 
        desc: statusDesc, 
        strategy, 
        visualState,
        diff: scoreDiff 
    };
  }, [latest, previous, shelf]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32 min-h-screen bg-gradient-to-br from-teal-50 via-white to-teal-50/30">
      {/* HEADER - SOLID RGB */}
      <div 
          className="px-6 pt-12 pb-8 text-white rounded-b-[2.5rem] shadow-xl relative overflow-hidden border-b border-white/20"
          style={{ backgroundColor: 'rgb(163, 206, 207)' }}
      >
          {/* Subtle Texture Overlay */}
          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none"></div>
          
          <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                  <button onClick={onBack} className="p-2 -ml-2 text-white hover:scale-105 transition-all drop-shadow-md">
                      <ArrowLeft size={24} />
                  </button>
                  {auth && auth.currentUser && (
                      <button 
                        onClick={handleSignOut}
                        className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors shadow-sm border border-white/20"
                        title="Sign Out"
                      >
                          <LogOut size={18} />
                      </button>
                  )}
              </div>

              <div className="flex items-center gap-5 mb-8">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shadow-inner border border-white/30 text-2xl font-black shrink-0 drop-shadow-md">
                      {user.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                      {isEditingProfile ? (
                          <div className="animate-in fade-in space-y-2">
                                <input 
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="bg-white/20 border border-white/40 rounded-lg px-3 py-1.5 text-2xl font-black text-white w-full focus:outline-none focus:bg-white/30 placeholder:text-white/50 drop-shadow-sm"
                                    placeholder="Name"
                                />
                                <div className="flex items-center gap-2">
                                     <input 
                                        type="number"
                                        value={editAge}
                                        onChange={(e) => setEditAge(e.target.value)}
                                        className="bg-white/20 border border-white/40 rounded-lg px-3 py-1.5 text-sm font-bold text-white w-20 focus:outline-none focus:bg-white/30 placeholder:text-white/50 drop-shadow-sm"
                                        placeholder="Age"
                                    />
                                    <span className="text-white text-xs font-bold whitespace-nowrap drop-shadow-sm">Years</span>
                                    
                                    <div className="flex-1 flex justify-end gap-2 ml-2">
                                         <button onClick={() => setIsEditingProfile(false)} className="p-1.5 bg-white/20 rounded-lg text-white hover:bg-white/30 border border-white/20"><X size={16}/></button>
                                         <button onClick={handleSaveProfile} className="p-1.5 bg-white rounded-lg text-teal-600 hover:bg-teal-50 shadow-sm"><Check size={16}/></button>
                                    </div>
                                </div>
                          </div>
                      ) : (
                          <>
                             <div className="flex items-center gap-3">
                                 <h1 className="text-3xl font-black tracking-tighter text-white truncate drop-shadow-md">{user.name}</h1>
                                 <button onClick={() => {
                                     setEditName(user.name);
                                     setEditAge(user.age.toString());
                                     setIsEditingProfile(true);
                                 }} className="p-1.5 bg-white/20 rounded-full text-white hover:bg-white/30 hover:scale-105 transition-all border border-white/20 shadow-sm">
                                     <Edit2 size={14} />
                                 </button>
                             </div>
                             {/* HIDE Unknown Skin Text Logic */}
                             <p className="text-sm font-bold text-white mt-1 drop-shadow-sm opacity-95">
                                 {user.age} Years{user.skinType !== 'UNKNOWN' ? ` • ${user.skinType.charAt(0) + user.skinType.slice(1).toLowerCase()} Skin` : ''}
                             </p>
                          </>
                      )}
                      {auth && auth.currentUser && !isEditingProfile && (
                          <span className="text-[10px] font-bold bg-white/25 border border-white/30 px-2 py-0.5 rounded text-white mt-1 inline-block drop-shadow-sm">Cloud Synced</span>
                      )}
                  </div>
              </div>

              <div className="flex gap-4">
                  <div className="flex-1 bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30 shadow-lg shadow-teal-900/5">
                       <span className="text-[10px] font-bold text-white uppercase tracking-widest block mb-1 drop-shadow-sm">Total Scans</span>
                       <span className="text-2xl font-black text-white drop-shadow-md">{history.length}</span>
                  </div>
                  <div className="flex-1 bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30 shadow-lg shadow-teal-900/5">
                       <span className="text-[10px] font-bold text-white uppercase tracking-widest block mb-1 drop-shadow-sm">Progress</span>
                       <span className={`text-2xl font-black flex items-center gap-1 text-white drop-shadow-md`}>
                          {totalProgress > 0 ? '+' : ''}{totalProgress}
                          {totalProgress > 0 ? <TrendingUp size={18} className="text-white drop-shadow-sm" /> : totalProgress < 0 ? <TrendingUp size={18} className="rotate-180 text-rose-100 drop-shadow-sm" /> : <Minus size={18} className="text-white/80" />}
                       </span>
                  </div>
              </div>
          </div>
      </div>

      {/* CONTENT CONTAINER */}
      <div className="space-y-6 px-6 pt-8">
          
          {/* REFINED PROGRESS INTELLIGENCE (SIMPLIFIED UI) */}
          {progressIntel && (
             <div className="bg-white rounded-[2rem] p-6 border border-zinc-100 shadow-sm relative overflow-hidden animate-in slide-in-from-bottom-2">
                 <div className="flex justify-between items-start mb-4">
                     <h3 className="text-sm font-black text-zinc-800 uppercase tracking-widest">{progressIntel.title}</h3>
                     {progressIntel.visualState === 'GOOD' ? (
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <TrendingUp size={16} />
                        </div>
                    ) : progressIntel.visualState === 'BAD' ? (
                         <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                            <AlertCircle size={16} />
                        </div>
                    ) : (
                         <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400">
                            <Clock size={16} />
                        </div>
                    )}
                 </div>

                 <div className="space-y-4">
                     <p className="text-sm font-medium text-zinc-500 leading-relaxed">
                         {progressIntel.desc}
                     </p>

                     <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100/50">
                         <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Recommendation</span>
                         <p className="text-sm font-semibold text-zinc-700 leading-snug">
                             {progressIntel.strategy}
                         </p>
                     </div>
                 </div>
             </div>
          )}

          {/* GOAL PROGRESS CARDS (RESIZED SMALLER AS REQUESTED) */}
          <section>
               <div className="flex justify-between items-end mb-4 px-1">
                   <h3 className="text-xs font-bold text-teal-800/60 uppercase tracking-widest flex items-center gap-2">
                      <Target size={14} /> Goal Tracking
                   </h3>
                   <button 
                      onClick={() => setIsGoalModalOpen(true)}
                      className="text-[10px] font-bold text-teal-600 bg-teal-50 px-3 py-1.5 rounded-full border border-teal-100 hover:bg-teal-100 transition-colors flex items-center gap-1.5"
                   >
                      <Settings2 size={12} />
                      Customize
                   </button>
               </div>
               
               {(!user.preferences?.goals || user.preferences.goals.length === 0) && (
                  <div className="p-6 bg-white rounded-[1.5rem] text-center border border-zinc-100 shadow-sm">
                      <h4 className="font-bold text-zinc-900 mb-2">Track your progress</h4>
                      <p className="text-xs text-zinc-500 font-medium mb-4">Select skin goals to see how your metrics improve over time.</p>
                      <button 
                          onClick={() => setIsGoalModalOpen(true)}
                          className="px-6 py-3 bg-zinc-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-zinc-900/10"
                      >
                          Set Goals
                      </button>
                  </div>
               )}
               
               <div className="space-y-3">
                  {user.preferences?.goals.map(goal => {
                       const stats = getGoalProgress(goal, latest, initial);
                       if (!stats) return null;
                       const progressPercent = Math.min(100, Math.max(0, (stats.current / stats.target) * 100));
                       
                       return (
                           <div key={goal} className="bg-white border border-teal-50 p-3 rounded-2xl shadow-sm relative overflow-hidden group">
                               <div className="flex justify-between items-end mb-2 relative z-10">
                                   <div>
                                       <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">{stats.label}</span>
                                       <div className="flex items-center gap-1.5">
                                          <span className="text-xl font-black text-zinc-900 tracking-tight">{stats.current}</span>
                                          <span className="text-[10px] font-bold text-zinc-300">/ {stats.target}</span>
                                       </div>
                                   </div>
                                   <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${stats.delta > 0 ? 'bg-emerald-50 text-emerald-600' : stats.delta < 0 ? 'bg-rose-50 text-rose-600' : 'bg-zinc-50 text-zinc-400'}`}>
                                       {stats.delta > 0 ? 'Improved' : stats.delta < 0 ? 'Declined' : 'Stable'} ({stats.delta > 0 ? '+' : ''}{stats.delta})
                                   </div>
                               </div>
                               
                               {/* Progress Bar */}
                               <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden relative z-10">
                                    <div className="absolute top-0 bottom-0 left-0 rounded-full transition-all duration-1000 bg-teal-500" style={{ width: `${progressPercent}%` }}></div>
                               </div>
                               
                               <div className="flex justify-between mt-1.5 relative z-10">
                                   <span className="text-[9px] font-bold text-zinc-400">Baseline: {stats.start}</span>
                                   {progressPercent >= 100 ? (
                                       <span className="text-[9px] font-bold text-teal-600 flex items-center gap-1"><Trophy size={10} /> Goal Met</span>
                                   ) : (
                                       <span className="text-[9px] font-bold text-zinc-400">{Math.round(100 - progressPercent)}% to go</span>
                                   )}
                               </div>
                           </div>
                       )
                  })}
               </div>
          </section>

          {/* SKIN HEALTH JOURNEY */}
          <section className="bg-white rounded-[2rem] border border-teal-50 shadow-sm overflow-hidden transition-all duration-500">
              <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                       <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                          <LineChart size={14} className="text-teal-500" /> Skin Health Journey
                      </h3>
                      {/* Optional summary info can go here */}
                  </div>
                  
                  {/* High-Res Canvas Chart (Always visible if data exists) */}
                  {history.length > 1 && (
                      <div className="mb-6">
                           <HistoryChart history={history} />
                      </div>
                  )}

                  <button 
                      onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                      className="w-full py-3 bg-zinc-50 hover:bg-zinc-100 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-zinc-500 hover:text-zinc-700 transition-colors"
                  >
                      {isHistoryExpanded ? 'Hide Scan Logs' : 'View Scan Logs'}
                      <ChevronDown size={14} className={`transition-transform duration-300 ${isHistoryExpanded ? 'rotate-180' : ''}`} />
                  </button>
              </div>

              {/* EXPANDABLE LIST AREA */}
              {isHistoryExpanded && (
                  <div className="border-t border-zinc-100 bg-zinc-50/30 animate-in slide-in-from-top-4 duration-300">
                      {Object.entries(groupedHistory).map(([monthYear, scans]) => (
                          <MonthGroup 
                             key={monthYear} 
                             monthYear={monthYear} 
                             scans={scans} 
                             onSelect={setSelectedScan} 
                          />
                      ))}
                  </div>
              )}
          </section>

          {/* DANGER ZONE */}
          <div className="mt-12 text-center pb-8">
               <button 
                  onClick={() => {
                      if (user.isAnonymous) {
                          onLoginRequired('GENERIC');
                      } else {
                          setShowClearConfirm(true);
                      }
                  }}
                  className="inline-flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-widest hover:text-rose-600 transition-colors px-6 py-3 rounded-full hover:bg-rose-50"
               >
                   <Trash2 size={14} /> Clear Local Data
               </button>
          </div>
      </div>

      {/* MODALS */}
      {selectedScan && (
          <ScanDetailModal scan={selectedScan} onClose={() => setSelectedScan(null)} />
      )}
      
      {isGoalModalOpen && (
          <GoalEditModal 
             currentPreferences={user.preferences || {
                goals: [],
                sensitivity: 'MILD',
                complexity: 'MODERATE',
                sunscreenFrequency: 'SUNNY',
                lifestyle: [],
                buyingPriority: 'Fast Results'
             }} 
             onSave={handleGoalsSave} 
             onClose={() => setIsGoalModalOpen(false)} 
          />
      )}

      {/* Clear Data Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/60 backdrop-blur-md animate-in fade-in">
             <div className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95 text-center">
                 <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
                     <AlertCircle size={32} />
                 </div>
                 <h3 className="text-xl font-black text-zinc-900 mb-2">Delete Everything?</h3>
                 <p className="text-sm text-zinc-500 mb-6 leading-relaxed">This will permanently delete your scan history, products, and profile data. This cannot be undone.</p>
                 
                 <div className="flex flex-col gap-3">
                     <button 
                        onClick={() => {
                            setShowClearConfirm(false);
                            onReset();
                        }}
                        className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-900/10"
                     >
                         Yes, Delete Everything
                     </button>
                     <button 
                        onClick={() => setShowClearConfirm(false)}
                        className="w-full py-3 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors"
                     >
                         Cancel
                     </button>
                 </div>
             </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSetup;
