
import React, { useState } from 'react';
import { Search, X, Loader, AlertCircle, ArrowRight, Lock, Crown } from 'lucide-react';
import { Product, UserProfile } from '../types';
import { searchProducts } from '../services/geminiService';

interface SearchResult {
    name: string;
    brand: string;
    score: number;
}

interface ProductSearchProps {
    userProfile: UserProfile;
    shelf: Product[];
    onStartAnalysis: (name: string, brand: string) => void;
    onCancel: () => void;
    usageCount: number;
    limit: number;
    isPremium: boolean;
    onUnlockPremium: () => void;
}

const ProductSearch: React.FC<ProductSearchProps> = ({ userProfile, shelf, onStartAnalysis, onCancel, usageCount, limit, isPremium, onUnlockPremium }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isLimitReached = !isPremium && usageCount >= limit;

    const handleSearch = async () => {
        if (!query.trim()) return;
        if (isLimitReached) {
            onUnlockPremium();
            return;
        }
        setIsSearching(true);
        setHasSearched(true);
        setError(null);
        
        try {
            const products = await searchProducts(query);
            const mappedResults: SearchResult[] = products.map(p => ({
                name: p.name,
                brand: p.brand,
                score: 0
            }));
            setResults(mappedResults);
        } catch (e) {
            console.error(e);
            setResults([]);
            setError("Unable to connect to product database.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectProduct = (item: SearchResult) => {
        if (isLimitReached) {
            onUnlockPremium();
            return;
        }
        // Immediately delegate to parent for background processing
        onStartAnalysis(item.name, item.brand);
    };

    if (isLimitReached) {
        return (
            <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-6">
                    <Lock size={24} className="text-zinc-400" />
                </div>
                <h2 className="text-xl font-black text-zinc-900 mb-2">Search Limit Reached</h2>
                <p className="text-sm text-zinc-500 mb-8 max-w-xs">
                    You've reached the free limit of 3 scans/searches. Upgrade to continue exploring products.
                </p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button 
                        onClick={onUnlockPremium}
                        className="w-full py-3.5 bg-zinc-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                        <Crown size={14} className="text-amber-300" /> Unlock Unlimited
                    </button>
                    <button 
                        onClick={onCancel}
                        className="w-full py-3.5 text-zinc-500 font-bold text-xs uppercase tracking-widest hover:text-zinc-800"
                    >
                        Close
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
            <div className="p-6 border-b border-zinc-100 flex items-center gap-4">
                <button onClick={onCancel} className="p-2 -ml-2 text-zinc-400 hover:text-zinc-600">
                    <X size={24} />
                </button>
                <div className="flex-1 relative">
                    <input 
                        className="w-full bg-zinc-100 rounded-full pl-10 pr-12 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        placeholder="Search skincare product..."
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setHasSearched(false);
                        }}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        autoFocus
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    {query && (
                        <button 
                            onClick={handleSearch}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-zinc-900 text-white rounded-full hover:bg-zinc-700 transition-all active:scale-95 shadow-md"
                        >
                            {isSearching ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {isSearching ? (
                    <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-4">
                        <Loader className="animate-spin" size={32} />
                        <p className="text-xs font-bold uppercase tracking-widest">Searching Database...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-rose-500 gap-4 text-center">
                        <AlertCircle size={32} />
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {results.map((res, i) => (
                            <button 
                                key={i}
                                onClick={() => handleSelectProduct(res)}
                                className="w-full p-4 text-left border border-zinc-100 rounded-2xl hover:bg-zinc-50 active:scale-[0.99] transition-all"
                            >
                                <div className="font-bold text-zinc-900">{res.name}</div>
                                <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{res.brand}</div>
                            </button>
                        ))}
                        {results.length === 0 && query && !hasSearched && (
                             <div className="text-center text-zinc-300 mt-20 animate-in fade-in duration-500">
                                <Search size={48} className="mx-auto mb-4 opacity-20" />
                                <p className="text-sm font-medium">Tap the arrow to search</p>
                             </div>
                        )}
                        {results.length === 0 && query && hasSearched && !isSearching && (
                             <div className="text-center text-zinc-400 mt-10">
                                <p className="text-sm font-medium">No matching products found.</p>
                             </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductSearch;
