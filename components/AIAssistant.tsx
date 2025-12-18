
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Product } from '../types';
import { createDermatologistSession, isQuotaError } from '../services/geminiService';
import { Sparkles, Send, RotateCcw, ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react';
import { Chat, GenerateContentResponse } from "@google/genai";

interface AIAssistantProps {
  user: UserProfile;
  shelf: Product[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  triggerQuery?: string | null;
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

const AIAssistant: React.FC<AIAssistantProps> = ({ user, shelf, isOpen, onOpen, onClose, triggerQuery }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [session, setSession] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedTriggerRef = useRef<string | null>(null);

  // Touch Handling for Swipe
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
      if (!session) {
          const newSession = createDermatologistSession(user, shelf);
          setSession(newSession);
          if (messages.length === 0) {
             setMessages([{ role: 'model', text: `Analysis complete. I can help optimize your routine or suggest professional treatments.` }]);
          }
      }
  }, [user, shelf, session]); 

  // Handle Trigger Query
  useEffect(() => {
      if (isOpen && triggerQuery && triggerQuery !== processedTriggerRef.current && session) {
          processedTriggerRef.current = triggerQuery;
          handleSend(triggerQuery);
      }
  }, [isOpen, triggerQuery, session]);

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
      const newSession = createDermatologistSession(user, shelf);
      setSession(newSession);
  };

  // --- SWIPE LOGIC FOR TOP SHEET ---
  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchEndY - touchStartY.current; // Positive = Down, Negative = Up

      // 1. If Open: Swipe UP (Negative) to Close
      if (isOpen && diff < -40) {
          onClose();
      }
      // 2. If Closed: Swipe DOWN (Positive) to Open
      else if (!isOpen && diff > 40) {
          onOpen();
      }
      
      touchStartY.current = null;
  };

  return (
    <>
      {/* BACKDROP */}
      <div 
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-500 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* TOP SHEET WRAPPER */}
      <div 
        className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1) flex flex-col items-center pointer-events-none ${isOpen ? 'translate-y-0' : '-translate-y-full'}`}
      >
          {/* MAIN SHEET CONTENT */}
          <div className="w-full h-[85vh] bg-white rounded-b-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative border-b border-zinc-100 pointer-events-auto">
              
              {/* Header inside Sheet */}
              <div 
                  className="flex items-center justify-between px-6 py-4 border-b border-zinc-50 bg-white shrink-0 pt-12 pb-4 cursor-grab active:cursor-grabbing"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
              >
                  <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600">
                           <Sparkles size={16} /> 
                       </div>
                       <span className="text-xs font-black text-zinc-900 uppercase tracking-widest">SkinOS AI</span>
                  </div>
                  <button onClick={handleReset} className="text-zinc-400 hover:text-zinc-600 transition-colors p-2 bg-zinc-50 rounded-full" title="Reset Chat">
                      <RotateCcw size={16} />
                  </button>
              </div>

              {/* CHAT AREA */}
              <div 
                className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/30"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
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
                                    <span className="text-[9px] font-bold uppercase tracking-widest">AI Analysis</span>
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
          </div>

          {/* PULL TAB / TONGUE (Always Visible at bottom of sheet) */}
          <div 
             className="absolute bottom-0 translate-y-[90%] flex flex-col items-center pointer-events-auto cursor-grab active:cursor-grabbing group z-50 touch-none"
             onClick={isOpen ? onClose : onOpen} 
             onTouchStart={handleTouchStart}
             onTouchEnd={handleTouchEnd}
          >
              <div className={`w-20 h-7 bg-white/95 backdrop-blur-md rounded-b-xl shadow-lg border-b border-x border-zinc-100 flex items-center justify-center relative z-10 transition-all duration-300 ${isOpen ? 'hover:h-9' : 'hover:h-8'} ${!isOpen ? 'shadow-teal-500/10 border-b-teal-50' : ''}`}>
                  {isOpen ? (
                      <ChevronUp size={16} className="text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                  ) : (
                      /* Elegant Handle Bar */
                      <div className="w-8 h-1 bg-zinc-300 rounded-full group-hover:bg-teal-500 transition-colors duration-300" />
                  )}
              </div>
          </div>
      </div>
    </>
  );
};

export default AIAssistant;
