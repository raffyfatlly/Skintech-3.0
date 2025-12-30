
import React, { useEffect, useState } from 'react';
import { getAdminStats, getLiveFeed, getDailyTrends, ValidationMetrics, LiveEvent, DailyMetric } from '../services/analyticsService';
import { auth, signInWithGoogle } from '../services/firebase'; // Import signIn
import { onAuthStateChanged, User } from 'firebase/auth'; // Import auth listener
import { 
  Users, Activity, DollarSign, Target, TrendingUp, AlertOctagon, 
  Zap, Eye, Crown, ArrowUpRight, ArrowDownRight, Fingerprint, 
  Search, Lock, RefreshCw, Smartphone, BarChart3, Database,
  Calendar, Clock, AlertCircle, UserCheck, Filter, Info, Copy, Shield, LogIn
} from 'lucide-react';

interface AdminDashboardProps {
    onExit: () => void;
}

// --- SUB-COMPONENT: Trend Chart (SVG) ---
const TrendChart: React.FC<{ data: DailyMetric[] }> = ({ data }) => {
    // Graceful empty state
    if (!data || data.length === 0 || data.every(d => d.visits === 0 && d.scans === 0)) {
        return (
            <div className="w-full h-32 flex items-center justify-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/50">
                <p className="text-zinc-600 text-xs font-medium flex items-center gap-2">
                    <Activity size={14} /> Waiting for traffic...
                </p>
            </div>
        );
    }
    
    // Find max for scaling
    const maxVal = Math.max(...data.map(d => Math.max(d.visits, d.scans)), 5); 
    const height = 100;
    const width = 300;
    const padding = 20;
    
    const getX = (index: number) => padding + (index / (data.length - 1)) * (width - 2 * padding);
    const getY = (val: number) => height - padding - (val / maxVal) * (height - 2 * padding);

    // Build Paths
    const buildPath = (accessor: (d: DailyMetric) => number) => {
        let path = `M ${getX(0)} ${getY(accessor(data[0]))}`;
        for (let i = 1; i < data.length; i++) {
            path += ` L ${getX(i)} ${getY(accessor(data[i]))}`;
        }
        return path;
    };

    const visitPath = buildPath(d => d.visits);
    const scanPath = buildPath(d => d.conversions * 10); // Scale up conversions for visibility (10x zoom)

    return (
        <div className="w-full h-32 relative group">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                {/* Grid Lines */}
                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#333" strokeWidth="1" />
                <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#333" strokeDasharray="4 4" strokeWidth="1" opacity="0.5" />
                
                {/* VISITS LINE (Teal) */}
                <path d={visitPath} fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                
                {/* CONVERSIONS LINE (Amber) */}
                <path d={scanPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
                
                {/* Points */}
                {data.map((d, i) => (
                    <g key={i} className="group/point">
                        {/* Visit Point */}
                        <circle cx={getX(i)} cy={getY(d.visits)} r="3" fill="#0f172a" stroke="#14b8a6" strokeWidth="2" />
                        
                        {/* Conversion Point (Only if > 0) */}
                        {d.conversions > 0 && (
                             <circle cx={getX(i)} cy={getY(d.conversions * 10)} r="3" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
                        )}

                        {/* Tooltip on Hover */}
                        <foreignObject x={getX(i) - 30} y={getY(d.visits) - 45} width="60" height="40" className="opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none">
                            <div className="flex flex-col items-center">
                                <div className="bg-zinc-800 text-white text-[9px] font-bold px-2 py-1 rounded shadow-xl border border-zinc-700 whitespace-nowrap">
                                    <span className="text-teal-400">{d.visits} Visits</span> <br/>
                                    <span className="text-amber-400">{d.conversions} Sales</span>
                                </div>
                            </div>
                        </foreignObject>
                        
                        {/* Label */}
                        <text x={getX(i)} y={height} fill="#666" fontSize="8" textAnchor="middle" fontWeight="bold">{d.date}</text>
                    </g>
                ))}
            </svg>
            
            {/* Legend */}
            <div className="absolute top-0 right-0 flex gap-3">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Visits</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Sales</span>
                </div>
            </div>
        </div>
    );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onExit }) => {
    const [metrics, setMetrics] = useState<ValidationMetrics | null>(null);
    const [feed, setFeed] = useState<LiveEvent[]>([]);
    const [trends, setTrends] = useState<DailyMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [adminUser, setAdminUser] = useState<User | null>(auth?.currentUser || null);
    
    // Time Range State with Persistence
    const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('skinos_admin_time_range');
            if (saved === '24h' || saved === '7d' || saved === '30d' || saved === 'all') {
                return saved;
            }
        }
        return '7d';
    });

    const refreshData = async () => {
        try {
            const [statsData, feedData, trendsData] = await Promise.all([
                getAdminStats(timeRange), // Pass the selected time range
                getLiveFeed(),
                getDailyTrends()
            ]);
            setMetrics(statsData);
            setFeed(feedData);
            setTrends(trendsData);
        } catch (e) {
            console.error("Dashboard Sync Error", e);
        }
    };

    // Save preference when timeRange changes
    useEffect(() => {
        localStorage.setItem('skinos_admin_time_range', timeRange);
    }, [timeRange]);

    // AUTH LISTENER: Updates UID automatically when user logs in
    useEffect(() => {
        if (!auth) return;
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setAdminUser(user);
            if (user) {
                // Trigger refresh once we have a user to try DB permissions again
                refreshData(); 
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        setLoading(true);
        const load = async () => {
            await refreshData();
            setLoading(false);
        };
        load();

        const interval = setInterval(refreshData, 10000); // 10s refresh
        return () => clearInterval(interval);
    }, [timeRange]); // Reload when filter changes

    const handleLogin = async () => {
        try {
            await signInWithGoogle();
        } catch (e) {
            alert("Login failed. Check console.");
            console.error(e);
        }
    };

    const copyUid = () => {
        if (adminUser) {
            navigator.clipboard.writeText(adminUser.uid);
            alert(`UID Copied:\n${adminUser.uid}\n\nNow paste this into your Firestore Rules!`);
        }
    };

    // --- LOGIN SCREEN (If not authenticated) ---
    if (!adminUser) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                <div className="w-20 h-20 bg-zinc-900 rounded-[2rem] border border-zinc-800 flex items-center justify-center mb-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/20 to-transparent"></div>
                    <Lock size={32} className="text-zinc-400 relative z-10" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight mb-3">Admin Access Required</h1>
                <p className="text-zinc-500 font-medium text-sm mb-10 max-w-xs leading-relaxed">
                    You must be authenticated to view sensitive analytics and configure database permissions.
                </p>
                <button 
                    onClick={handleLogin}
                    className="bg-white text-zinc-900 px-8 py-4 rounded-full font-bold text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(255,255,255,0.15)]"
                >
                    <LogIn size={16} /> Authenticate
                </button>
                <button onClick={onExit} className="mt-8 text-zinc-600 text-xs font-bold uppercase hover:text-white transition-colors">
                    Back to App
                </button>
            </div>
        );
    }

    const MetricCard = ({ title, value, sub, icon: Icon, trend, color = "teal", badge }: any) => (
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl relative overflow-hidden group hover:border-zinc-700 transition-colors">
            <div className={`absolute top-0 right-0 p-24 rounded-full blur-3xl opacity-5 bg-${color}-500/10 group-hover:bg-${color}-500/20 transition-all`}></div>
            
            <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                        {title}
                        {badge && <span className="bg-zinc-800 text-zinc-400 text-[9px] px-1.5 py-0.5 rounded">{badge}</span>}
                    </h3>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white tracking-tight">{value}</span>
                        {/* Only show trend if value > 0 to avoid -100% on empty state */}
                        {trend && value > 0 && (
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

    if (loading && !metrics) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-t-2 border-teal-500 rounded-full animate-spin"></div>
                    <p className="text-teal-500 text-xs font-bold uppercase tracking-widest animate-pulse">Syncing {timeRange} Data...</p>
                </div>
            </div>
        );
    }

    if (!metrics) return null;

    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-teal-500/30 pb-20">
            {/* Header */}
            <div className="border-b border-zinc-800 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto gap-4">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="w-3 h-3 rounded-full bg-teal-500 animate-pulse shadow-[0_0_10px_#14b8a6]"></div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight text-white leading-none">SkinOS <span className="text-zinc-600">Command</span></h1>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Global Live View</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                        {/* Time Filters */}
                        <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex items-center">
                            {(['24h', '7d', '30d', 'all'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTimeRange(t)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${timeRange === t ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {t === 'all' ? 'All Time' : t.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        <button onClick={onExit} className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-400 text-xs font-bold hover:text-white border border-zinc-800 transition-all hover:bg-zinc-800">
                            Exit
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                
                {/* 1. KEY PERFORMANCE INDICATORS (Global) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard 
                        title={`Visits (${timeRange})`} 
                        value={metrics.totalUsers} 
                        sub="Unique visitors."
                        icon={Eye}
                        trend={null}
                        color="teal"
                    />
                    <MetricCard 
                        title="Total Members" 
                        value={metrics.registeredUsers} 
                        sub={metrics.isExactCount ? "Verified DB Count." : "Est. from Events (Check Rules)."}
                        icon={UserCheck}
                        trend={null}
                        color="indigo"
                        badge={metrics.isExactCount ? "Exact" : "Est"}
                    />
                    <MetricCard 
                        title="Paid Members" 
                        value={metrics.totalPremium} 
                        sub="Premium Plan Active."
                        icon={Crown}
                        trend={null}
                        color="amber"
                        badge={metrics.isExactCount ? "Exact" : "Est"}
                    />
                    <MetricCard 
                        title="Total Revenue" 
                        value={`$${Math.round(metrics.localStats.mySpendPotential)}`} 
                        sub={`Based on ${metrics.totalPremium} subscribers.`}
                        icon={DollarSign}
                        trend={null}
                        color="emerald"
                    />
                </div>

                {!metrics.isExactCount && (
                    <div className="bg-amber-900/20 border border-amber-500/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-2 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                        
                        <div className="flex items-start gap-4 relative z-10">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/30 text-amber-400">
                                <Shield size={20} />
                            </div>
                            <div>
                                <h4 className="text-base font-black text-amber-400 mb-1">Database Permissions Limited</h4>
                                <p className="text-xs text-amber-200/80 leading-relaxed max-w-xl">
                                    The "Total Members" count is currently an estimate. To see exact numbers, you must allow your Admin UID to read the user database.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 w-full md:w-auto relative z-10">
                            <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-amber-500/20">
                                <code className="text-[10px] font-mono text-amber-200 select-all px-2 break-all max-w-[200px] md:max-w-none">
                                    {adminUser.uid}
                                </code>
                            </div>
                            <button 
                                onClick={copyUid}
                                className="flex items-center justify-center gap-2 bg-amber-500 text-amber-950 px-6 py-3 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/20"
                            >
                                <Copy size={14} />
                                Copy My UID
                            </button>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* 2. DAY-TO-DAY VELOCITY (Visits vs Sales) */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 relative overflow-hidden">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <TrendingUp className="text-teal-500" size={20} />
                                        <h2 className="text-xl font-black tracking-tight">Traffic vs. Sales</h2>
                                    </div>
                                    <p className="text-zinc-500 text-xs font-medium">Daily visitors compared to premium conversions.</p>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-[10px] font-bold bg-zinc-800 px-3 py-1 rounded-full text-zinc-400 flex items-center gap-2">
                                        <Calendar size={12} /> Last 7 Days
                                    </span>
                                </div>
                            </div>

                            {/* THE CHART */}
                            <TrendChart data={trends} />
                            
                            <div className="mt-6 pt-6 border-t border-zinc-800 grid grid-cols-3 gap-6">
                                <div>
                                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide">Avg Daily Visits</span>
                                    <div className="text-white font-bold text-xl">
                                        {Math.round(trends.reduce((a, b) => a + b.visits, 0) / 7)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide">Total Sales (7d)</span>
                                    <div className="text-white font-bold text-xl">
                                        {trends.reduce((a, b) => a + b.conversions, 0)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wide">Est. API Cost</span>
                                    <div className="text-emerald-400 font-bold text-xl flex items-center gap-1">
                                        ${metrics.apiCostEst}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PRODUCT TRUST METRICS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                                 <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Trust Signal</h4>
                                 <div className="flex items-center gap-4">
                                     <div className="text-4xl font-black text-white">{metrics.trustScore}%</div>
                                     <p className="text-[10px] text-zinc-400 leading-snug">
                                         Of scans followed by a "Discard" action. <strong className="text-emerald-400">Higher = More Influence.</strong>
                                     </p>
                                 </div>
                             </div>
                             <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                                 <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Top Global Brand</h4>
                                 {metrics.mostScannedBrands.length > 0 && metrics.mostScannedBrands[0].name !== 'No Data' ? (
                                     <div className="flex items-center gap-4">
                                         <div className="text-2xl font-black text-white truncate max-w-[120px]">{metrics.mostScannedBrands[0].name}</div>
                                         <div className="bg-zinc-800 px-2 py-1 rounded text-[10px] font-bold text-zinc-400">{metrics.mostScannedBrands[0].count} Scans</div>
                                     </div>
                                 ) : (
                                     <div className="text-zinc-600 text-xs font-medium italic">No brand data yet.</div>
                                 )}
                             </div>
                        </div>
                    </div>

                    {/* 3. LIVE EVENT FEED */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-6 flex flex-col h-full min-h-[400px]">
                         <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                                <Zap size={14} className="text-amber-400" /> Global Feed
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
                             <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-900 to-transparent z-10"></div>
                             
                             <div className="space-y-4">
                                 {feed.length === 0 ? (
                                     <div className="text-center mt-20 opacity-50">
                                         <AlertCircle size={24} className="mx-auto mb-2 text-zinc-600" />
                                         <p className="text-xs text-zinc-500">No global events yet.</p>
                                         <p className="text-[10px] text-zinc-700">Open the app in a new tab to see traffic.</p>
                                     </div>
                                 ) : (
                                     feed.map((event) => (
                                         <div key={event.id} className="flex items-start gap-3 animate-in slide-in-from-right-4 fade-in duration-300">
                                             <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                                                 event.action === 'APP_VISIT' ? 'bg-indigo-400' :
                                                 event.action.includes('PAYMENT') ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' :
                                                 event.action.includes('SCAN') ? 'bg-teal-400' :
                                                 'bg-zinc-600'
                                             }`} />
                                             <div className="min-w-0 flex-1">
                                                 <div className="flex justify-between items-baseline">
                                                     <span className="text-[11px] font-bold text-white truncate">
                                                         {event.user === 'anonymous' ? 'Visitor' : 'User'}
                                                     </span>
                                                     <span className="text-[9px] text-zinc-600 font-mono">
                                                         {Math.floor((Date.now() - event.timestamp) / 1000)}s
                                                     </span>
                                                 </div>
                                                 <div className="text-[10px] font-medium text-zinc-400 mt-0.5 truncate">
                                                     {event.action.replace(/_/g, ' ')}
                                                 </div>
                                                 {event.meta && (
                                                     <div className="text-[9px] text-zinc-600 mt-0.5 truncate border-l border-zinc-800 pl-2">
                                                         {typeof event.meta === 'string' ? event.meta : JSON.stringify(event.meta)}
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     ))
                                 )}
                             </div>
                        </div>
                    </div>
                </div>

                {/* 4. TECHNICAL HEALTH */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Database className="text-zinc-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">Total Events</span>
                         </div>
                         <span className="text-sm font-black text-white">{feed.length}+</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Zap className="text-teal-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">Est. API Cost</span>
                         </div>
                         <span className="text-sm font-black text-emerald-400">${metrics.apiCostEst}</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Lock className="text-amber-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">Auth State</span>
                         </div>
                         <span className="text-sm font-black text-white">Active</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                             <Smartphone className="text-indigo-600" size={18} />
                             <span className="text-xs font-bold text-zinc-400">Device</span>
                         </div>
                         <span className="text-sm font-black text-white">Mobile</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default AdminDashboard;
