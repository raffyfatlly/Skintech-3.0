
import React, { useEffect, useState } from 'react';
import { getAdminStats, getLiveFeed, ValidationMetrics, LiveEvent } from '../services/analyticsService';
import { 
  Users, Activity, DollarSign, Target, TrendingUp, AlertOctagon, 
  Zap, Eye, Crown, ArrowUpRight, ArrowDownRight, Fingerprint, 
  Search, Lock, RefreshCw, Smartphone, BarChart3, Database 
} from 'lucide-react';

interface AdminDashboardProps {
    onExit: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onExit }) => {
    const [metrics, setMetrics] = useState<ValidationMetrics | null>(null);
    const [feed, setFeed] = useState<LiveEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const data = await getAdminStats();
            setMetrics(data);
            setFeed(getLiveFeed());
            setLoading(false);
        };
        load();

        // Simulate Live Feed updates
        const interval = setInterval(() => {
            setFeed(prev => {
                const actions = ['SCAN_FACE', 'SCAN_PRODUCT', 'HIT_PAYWALL', 'VIEW_ROUTINE'];
                const randomAction = actions[Math.floor(Math.random() * actions.length)];
                const newEvent = {
                    id: Date.now().toString(),
                    user: `User_${Math.floor(Math.random() * 999)}`,
                    action: randomAction,
                    timestamp: Date.now(),
                    meta: randomAction === 'SCAN_FACE' ? 'Score: 78' : 'Analysis'
                };
                return [newEvent, ...prev.slice(0, 6)];
            });
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const MetricCard = ({ title, value, sub, icon: Icon, trend, color = "teal" }: any) => (
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl relative overflow-hidden group hover:border-zinc-700 transition-colors">
            <div className={`absolute top-0 right-0 p-24 rounded-full blur-3xl opacity-5 bg-${color}-500/10 group-hover:bg-${color}-500/20 transition-all`}></div>
            
            <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1">{title}</h3>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white tracking-tight">{value}</span>
                        {trend && (
                            <span className={`text-xs font-bold flex items-center ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {Math.abs(trend)}%
                            </span>
                        )}
                    </div>
                </div>
                <div className={`w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-${color}-400 border border-zinc-700`}>
                    <Icon size={20} />
                </div>
            </div>
            <p className="relative z-10 text-xs text-zinc-500 font-medium">{sub}</p>
        </div>
    );

    const InsightBadge = ({ label, value, good }: { label: string, value: string, good: boolean }) => (
        <div className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
            <span className="text-zinc-400 text-xs font-medium">{label}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${good ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                {value}
            </span>
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-t-2 border-teal-500 rounded-full animate-spin"></div>
                    <p className="text-teal-500 text-xs font-bold uppercase tracking-widest animate-pulse">Establishing Uplink...</p>
                </div>
            </div>
        );
    }

    if (!metrics) return null;

    // Unit Economics Calc
    const revenueEst = metrics.totalUsers * 0.05 * 9.90; // Assume 5% conversion
    const margin = revenueEst - metrics.apiCostEst;

    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-teal-500/30 pb-20">
            {/* Header */}
            <div className="border-b border-zinc-800 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="px-6 py-4 flex justify-between items-center max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-teal-500 animate-pulse shadow-[0_0_10px_#14b8a6]"></div>
                        <h1 className="text-lg font-black tracking-tight text-white">SkinOS <span className="text-zinc-600">Mission Control</span></h1>
                    </div>
                    <button onClick={onExit} className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-400 text-xs font-bold hover:text-white border border-zinc-800 transition-all">
                        Exit Dashboard
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                
                {/* 1. THE NORTH STAR METRICS (Validation) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard 
                        title="Active Users (24h)" 
                        value={metrics.activeUsers24h} 
                        sub={`${Math.round((metrics.activeUsers24h / metrics.totalUsers) * 100)}% of total user base`}
                        icon={Users}
                        trend={12.5}
                        color="teal"
                    />
                    <MetricCard 
                        title="Desire Score (LTV)" 
                        value={metrics.avgScansPerUser} 
                        sub="Avg. Scans per User. >5 indicates PMF."
                        icon={Target}
                        trend={4.2}
                        color="indigo"
                    />
                    <MetricCard 
                        title="Purchase Intent" 
                        value={`${metrics.paywallHitRate}%`} 
                        sub="Users hitting Premium features."
                        icon={Crown}
                        trend={2.1}
                        color="amber"
                    />
                    <MetricCard 
                        title="Est. Margin" 
                        value={`$${Math.round(margin)}`} 
                        sub={`Cost: $${metrics.apiCostEst} vs Est. Rev: $${Math.round(revenueEst)}`}
                        icon={DollarSign}
                        trend={-0.5}
                        color="emerald"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* 2. THE VALIDATION ENGINE */}
                    <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
                        
                        <div className="flex items-center gap-3 mb-8">
                            <Activity className="text-teal-500" size={20} />
                            <h2 className="text-xl font-black tracking-tight">Product Validation Signals</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Retention / Stickiness */}
                            <div>
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Retention & Habit</h4>
                                <div className="space-y-4">
                                    <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-sm font-bold text-zinc-300">Day 1 Retention</span>
                                            <span className="text-sm font-bold text-emerald-400">42%</span>
                                        </div>
                                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 w-[42%]"></div>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-sm font-bold text-zinc-300">Day 7 Retention</span>
                                            <span className="text-sm font-bold text-teal-400">18%</span>
                                        </div>
                                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-teal-500 w-[18%]"></div>
                                        </div>
                                    </div>
                                    <InsightBadge label="Avg Session Length" value="4m 12s" good={true} />
                                    <InsightBadge label="Return Rate (Week)" value="Top 10%" good={true} />
                                </div>
                            </div>

                            {/* Trust & Influence */}
                            <div>
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">AI Influence (Trust)</h4>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <div className="text-3xl font-black text-white mb-1">{metrics.trustScore}%</div>
                                            <p className="text-xs text-zinc-500 leading-snug">
                                                Users who <strong>discard</strong> a product after the AI flags it as "Risky".
                                                <span className="text-emerald-500 block mt-1 font-bold">High Trust Signal</span>
                                            </p>
                                        </div>
                                        <div className="w-16 h-16 rounded-full border-4 border-zinc-800 border-t-emerald-500 flex items-center justify-center text-emerald-500 font-bold text-xs bg-zinc-900 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                            {metrics.trustScore}%
                                        </div>
                                    </div>
                                    
                                    <div className="mt-6 pt-6 border-t border-zinc-800">
                                        <h5 className="text-[10px] font-bold text-zinc-600 uppercase mb-3">Top Scanned Brands</h5>
                                        <div className="flex flex-wrap gap-2">
                                            {metrics.mostScannedBrands.map((b, i) => (
                                                <div key={i} className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-300">
                                                    {b.name} <span className="text-zinc-500 ml-1">{b.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. LIVE PULSE FEED */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-6 flex flex-col h-full">
                         <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <Zap size={14} className="text-amber-400" /> Live Feed
                            </h3>
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">Realtime</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden relative">
                             {/* Fade gradient at bottom */}
                             <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-900 to-transparent z-10"></div>
                             
                             <div className="space-y-4">
                                 {feed.map((event) => (
                                     <div key={event.id} className="flex items-start gap-3 animate-in slide-in-from-right-4 fade-in duration-300">
                                         <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                             event.action === 'HIT_PAYWALL' ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 
                                             event.action === 'SCAN_FACE' ? 'bg-teal-500' : 
                                             event.action === 'DISCARD_PRODUCT' ? 'bg-rose-500' : 'bg-zinc-600'
                                         }`} />
                                         <div>
                                             <div className="text-xs font-bold text-white">
                                                 {event.user} <span className="text-zinc-500 font-medium">performed</span> {event.action.replace('_', ' ')}
                                             </div>
                                             <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                                                 {event.meta} • {Math.floor((Date.now() - event.timestamp) / 1000)}s ago
                                             </div>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                </div>

                {/* 4. TECHNICAL HEALTH */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Database className="text-zinc-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">DB Reads/m</span>
                         </div>
                         <span className="text-sm font-black text-white">142</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Zap className="text-teal-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">Gemini Latency</span>
                         </div>
                         <span className="text-sm font-black text-emerald-400">1.2s</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Lock className="text-amber-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">Auth Success</span>
                         </div>
                         <span className="text-sm font-black text-white">99.8%</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Smartphone className="text-indigo-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">Mobile Usage</span>
                         </div>
                         <span className="text-sm font-black text-white">92%</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default AdminDashboard;
