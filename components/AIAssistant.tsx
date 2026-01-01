
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Product } from '../types';
import { createDermatologistSession, isQuotaError } from '../services/geminiService';
import { Sparkles, Send, RotateCcw, X, Lock, Crown } from 'lucide-react';
import type { Chat, GenerateContentResponse } from "@google/genai";

interface AIAssistantProps {
  user: UserProfile;
  shelf: Product[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  triggerQuery?: string | null;
  onUnlockPremium: () => void;
  location?: string; // New Prop
}

interface Message {
    role: 'user' | 'model';
    text: string;
}

// Format Helper Component
const MessageContent: React.FC<{ text: string }> = ({ text }) => {
    const lines = text.split('\n');
    return (
        <div className="space-y-1">
            {lines.map((line, i) => {
                const isListItem = line.trim().startsWith('* ') || line.trim().startsWith('- ');
                const cleanLine = isListItem ? line.trim().substring(2) : line;
                const parts = cleanLine.split(/(\*\*.*?\*\*)/g);

                const renderedLine = (
                    <span className={isListItem ? "block pl-2" : "block min-h-[1.2em]"}>
                        {parts.map((part, j) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={j} className="font-bold text-teal-100">{part.slice(2, -2)}</strong>;
                            }
                            return <span key={j}>{part}</span>;
                        })}
                    </span>
                );

                if (isListItem) {
                    return (
                        <div key={i} className="flex items-start gap-2">
                            <span className="text-teal-300 mt-1.5 text-[6px] shrink-0">●</span>
                            <div className="flex-1">{renderedLine}</div>
                        </div>
                    )
                }
                if (!line.trim()) return <div key={i} className="h-2" />
                return <div key={i}>{renderedLine}</div>;
            })}
        </div>
    );
}

const AIAssistant: React.FC<AIAssistantProps> = ({ user, shelf, isOpen, onOpen, onClose, triggerQuery, onUnlockPremium, location = "Global" }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [session, setSession] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedTriggerRef = useRef<string | null>(null);

  // Unlock for all users
  const isChatEnabled = true;

  useEffect(() => {
      if (!session && isChatEnabled) {
          // Pass location to session creation
          const newSession = createDermatologistSession(user, shelf, location);
          setSession(newSession);
          if (messages.length === 0) {
             setMessages([{ role: 'model', text: `Analysis complete. I can help optimize your routine or suggest professional treatments.` }]);
          }
      }
  }, [user, shelf, session, isChatEnabled, location]); 

  // Handle Trigger Query
  useEffect(() => {
      if (isOpen && isChatEnabled && triggerQuery && triggerQuery !== processedTriggerRef.current && session) {
          processedTriggerRef.current = triggerQuery;
          handleSend(triggerQuery);
      }
  }, [isOpen, triggerQuery, session, isChatEnabled]);

  // Auto-scroll
  useEffect(() => {
      if (isOpen) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
  }, [messages, isTyping, isOpen]);

  const handleSend = async (textOverride?: string) => {
      const msgText = textOverride || inputText;
      if (!msgText.trim() || !session) return;
      
      if (!textOverride) setInputText('');
      
      setMessages(prev => [...prev, { role: 'user', text: msgText }]);
      setIsTyping(true);

      try {
          const result = await session.sendMessageStream({ message: msgText });
          let fullResponse = "";
          
          setMessages(prev => [...prev, { role: 'model', text: "" }]); 

          for await (const chunk of result) {
              const text = (chunk as GenerateContentResponse).text;
              if (text) {
                  fullResponse += text;
                  setMessages(prev => {
                      const newArr = [...prev];
                      newArr[newArr.length - 1].text = fullResponse;
                      return newArr;
                  });
              }
          }
      } catch (e) {
          console.error("Chat Error", e);
          const isQuota = isQuotaError(e);
          setMessages(prev => [...prev, { 
              role: 'model', 
              text: isQuota 
                ? "I'm currently at capacity due to high demand. Please try asking again in a few moments." 
                : "I'm having trouble connecting right now. Please try again." 
          }]);
      } finally {
          setIsTyping(false);
      }
  };

  const handleReset = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSession(null);
      setMessages([{ role: 'model', text: `Session reset. Ready for your next query.` }]);
      const newSession = createDermatologistSession(user, shelf, location);
      setSession(newSession);
  };

  return (
    <div 
        className={`fixed inset-0 z-50 bg-white transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
    >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-50 bg-white shrink-0 pt-safe-top pb-4">
              <div className="flex items-center gap-2">
                   <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center text-teal-600">
                       <Sparkles size={20} /> 
                   </div>
                   <div>
                       <span className="text-sm font-black text-zinc-900 uppercase tracking-widest block leading-none">
                           SkinOS { !user.isPremium && <span className="text-teal-600 text-[10px] ml-1">(Free Trial)</span> }
                       </span>
                       <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Expert Assistant</span>
                   </div>
              </div>
              <div className="flex items-center gap-2">
                  {isChatEnabled && (
                      <button onClick={handleReset} className="text-zinc-400 hover:text-zinc-600 transition-colors p-2 bg-zinc-50 rounded-full" title="Reset Chat">
                          <RotateCcw size={20} />
                      </button>
                  )}
                  <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors p-2 bg-zinc-50 rounded-full">
                      <X size={20} />
                  </button>
              </div>
          </div>

          {/* CHAT AREA */}
          {!isChatEnabled ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 text-center">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl border border-zinc-100">
                      <Lock size={32} className="text-zinc-300" />
                  </div>
                  <h3 className="text-2xl font-black text-zinc-900 mb-2">Expert Assistant Locked</h3>
                  <p className="text-sm text-zinc-500 font-medium mb-8 max-w-xs leading-relaxed">
                      Unlock premium to chat with our AI expert about your specific skin concerns, ingredients, and routines.
                  </p>
                  <button 
                      onClick={onUnlockPremium}
                      className="px-8 py-4 bg-zinc-900 text-white rounded-full font-bold text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all"
                  >
                      <Crown size={14} className="text-amber-300" /> Unlock Now
                  </button>
              </div>
          ) : (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/30">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div 
                            className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm animate-in fade-in slide-in-from-bottom-2 ${
                                msg.role === 'user' 
                                    ? 'bg-zinc-100 text-zinc-800 rounded-tr-sm font-medium' 
                                    : 'bg-gradient-to-br from-teal-600 to-teal-700 text-white rounded-tl-sm shadow-teal-500/20'
                            }`}
                            >
                                {msg.role === 'model' && (
                                    <div className="flex items-center gap-2 mb-2 opacity-70 border-b border-white/20 pb-1.5">
                                        <Sparkles size={10} />
                                        <span className="text-[9px] font-bold uppercase tracking-widest">SkinOS Analysis</span>
                                    </div>
                                )}
                                {msg.role === 'user' ? (
                                    <div>{msg.text}</div>
                                ) : (
                                    <MessageContent text={msg.text} />
                                )}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-zinc-100 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1.5 items-center shadow-sm">
                                <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" />
                                <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce delay-100" />
                                <div className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce delay-200" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* INPUT AREA */}
                <div className="p-4 bg-white border-t border-zinc-100 shrink-0 pb-safe">
                    <div className="relative flex items-center">
                        <input 
                            type="text" 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask about your routine..." 
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-full pl-6 pr-14 py-4 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 transition-all shadow-inner"
                        />
                        <button 
                            onClick={() => handleSend()}
                            disabled={!inputText.trim() || isTyping}
                            className="absolute right-2 p-2.5 bg-zinc-900 text-white rounded-full hover:bg-zinc-800 disabled:opacity-50 disabled:scale-95 transition-all shadow-md active:scale-90"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
              </>
          )}
    </div>
  );
};

export default AIAssistant;
