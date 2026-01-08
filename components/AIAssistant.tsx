
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Product } from '../types';
import { createDermatologistSession as initSession, isQuotaError } from '../services/geminiService'; 
import { playNotificationSound } from '../services/soundService';
import { 
    Send, Mic, X, ChevronLeft, FileText, Keyboard, Sparkles, 
    AudioWaveform, MessageSquare, Loader, Bookmark, Check, Trash2,
    ChevronDown, ChevronUp
} from 'lucide-react';
import type { Chat, GenerateContentResponse, Part } from "@google/genai";

interface AIAssistantProps {
  user: UserProfile;
  shelf: Product[];
  triggerQuery?: string | null;
  onUnlockPremium: () => void;
  location?: string;
  onClose?: () => void;
}

interface Message {
    role: 'user' | 'model';
    text: string;
    image?: string;
    isStreaming?: boolean;
}

interface SavedFile {
    id: string;
    question: string;
    answer: string;
    timestamp: number;
}

// Robust text polisher for final speech output
const polishText = (text: string) => {
    if (!text) return "";
    let clean = text.replace(/\s+/g, ' ').trim();
    clean = clean.replace(/(\b\w+\b)(?:\s+\1\b)+/gi, '$1');
    clean = clean.replace(/(\b\w+\s+\w+\b)(?:\s+\1\b)+/gi, '$1');
    clean = clean.replace(/\b(um|uh|ah|like)\b/gi, '');
    clean = clean.replace(/\s+([.,!?:;])/g, '$1').replace(/([.,!?:;])([^\s])/g, '$1 $2');
    clean = clean.replace(/\s+/g, ' ').trim();
    if (!clean) return "";
    return clean.charAt(0).toUpperCase() + clean.slice(1);
};

const renderText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="text-teal-700 font-bold">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

const MessageItem: React.FC<{ 
    msg: Message, 
    index: number, 
    onSave: (idx: number) => void, 
    isSaved: boolean 
}> = ({ msg, index, onSave, isSaved }) => {
    const [showSave, setShowSave] = useState(false);

    useEffect(() => {
        // Auto-show when streaming finishes, then auto-hide after 4s
        if (!msg.isStreaming && msg.role === 'model') {
            setShowSave(true);
            const timer = setTimeout(() => setShowSave(false), 4000);
            return () => clearTimeout(timer);
        }
    }, [msg.isStreaming, msg.role]);

    return (
        <div className="w-full flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-500 relative group">
            {msg.image && (
                <img src={msg.image} className="w-32 h-32 rounded-2xl object-cover mb-4 border-2 border-white shadow-lg" />
            )}

            {msg.role === 'user' ? (
                <div className="mb-2 animate-in fade-in zoom-in-95 duration-500">
                    <p className="text-sm font-medium text-zinc-400 max-w-xs mx-auto leading-tight opacity-70 italic">
                        "{msg.text}"
                    </p>
                </div>
            ) : (
                <div className="w-full relative pb-8 px-2"> {/* Added padding bottom for button space */}
                    <p className="text-xl md:text-2xl font-semibold text-zinc-900 leading-relaxed drop-shadow-sm">
                        {renderText(msg.text)}
                        {msg.isStreaming && <span className="inline-block w-2 h-5 ml-1 bg-teal-500 align-middle animate-pulse rounded-full"/>}
                    </p>
                    
                    {!msg.isStreaming && (
                        <div 
                            className={`absolute bottom-0 right-0 transform transition-all duration-500 z-10 ${showSave ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'}`}
                        >
                            <button 
                                onClick={() => onSave(index)}
                                disabled={isSaved}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm backdrop-blur-md transition-colors ${isSaved ? 'bg-emerald-100/80 text-emerald-700 border-emerald-200' : 'bg-white/80 text-zinc-400 border-zinc-200 hover:bg-white hover:text-teal-600 hover:border-teal-200'}`}
                            >
                                {isSaved ? <Check size={12} strokeWidth={2.5} /> : <Bookmark size={12} />}
                                {isSaved ? 'Saved' : 'Save'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const SavedFileItem: React.FC<{ 
    file: SavedFile, 
    onDelete: (id: string) => void 
}> = ({ file, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className={`bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-white/50 shadow-sm relative group animate-in slide-in-from-bottom-2 transition-all duration-300 ${isExpanded ? 'bg-white shadow-md' : ''}`}>
            <div className="mb-2 pr-8">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide truncate">
                    Q: {file.question}
                </p>
            </div>
            <div className={`text-sm font-medium text-zinc-800 leading-relaxed ${isExpanded ? '' : 'line-clamp-4'} transition-all`}>
                {renderText(file.answer)}
            </div>
            
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-center pt-3 pb-1 mt-1 group/btn"
            >
                {isExpanded ? (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest group-hover/btn:text-zinc-600 transition-colors">
                        Show Less <ChevronUp size={12} />
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest group-hover/btn:text-teal-600 transition-colors">
                        Read More <ChevronDown size={12} />
                    </div>
                )}
            </button>

            <div className="flex justify-between items-center mt-2 pt-3 border-t border-zinc-100/50">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                    {new Date(file.timestamp).toLocaleDateString()}
                </span>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
};

const AIAssistant: React.FC<AIAssistantProps> = ({ user, shelf, triggerQuery, onUnlockPremium, location = "Global", onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [session, setSession] = useState<Chat | null>(null);
  
  // Interaction Modes: VOICE (Live Session) vs TEXT (Chat History)
  const [inputMode, setInputMode] = useState<'VOICE' | 'TEXT'>('VOICE');
  const [orbState, setOrbState] = useState<'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING'>('IDLE');

  // Media Input State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  
  // Saved Files State
  const [viewMode, setViewMode] = useState<'CHAT' | 'FILES'>('CHAT');
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>(() => {
      try {
          const saved = localStorage.getItem('skinos_saved_files');
          return saved ? JSON.parse(saved) : [];
      } catch { return []; }
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');

  // Determine if the session has started (for UI animation)
  const hasStarted = messages.length > 0 || isListening || isTyping;

  // Persist Saved Files
  useEffect(() => {
      localStorage.setItem('skinos_saved_files', JSON.stringify(savedFiles));
  }, [savedFiles]);

  // Initialize Chat
  useEffect(() => {
      if (!session) {
          try {
              const newSession = initSession(user, shelf, location);
              setSession(newSession);
          } catch (e) {
              console.error("Failed to init chat session", e);
          }
      }
  }, [user, shelf, session, location]);

  // Handle Trigger Query
  useEffect(() => {
      if (triggerQuery && session && messages.length === 0) {
          handleSend(triggerQuery);
      }
  }, [triggerQuery, session]);

  // Auto-scroll logic
  useEffect(() => {
      if (viewMode === 'CHAT') {
          setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
      }
  }, [messages, isTyping, selectedImage, inputMode, isListening, viewMode]);

  // Sync Orb State
  useEffect(() => {
      if (isTyping) setOrbState('THINKING');
      else if (isListening) setOrbState('LISTENING');
      else if (messages.length > 0 && messages[messages.length-1].role === 'model') setOrbState('SPEAKING'); 
      else setOrbState('IDLE');
  }, [isTyping, isListening, messages, inputMode]);

  // Setup Speech
  useEffect(() => {
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = true;
          recognitionRef.current.interimResults = true; 
          recognitionRef.current.lang = 'en-US';

          recognitionRef.current.onstart = () => {
              setIsListening(true);
          };

          recognitionRef.current.onresult = (event: any) => {
              const current = Array.from(event.results)
                .map((result: any) => result[0])
                .map((result) => result.transcript)
                .join(' ');
              
              transcriptRef.current = current;
          };

          recognitionRef.current.onerror = (event: any) => {
              console.error("Speech Recognition Error:", event.error);
              if (event.error === 'not-allowed') {
                  alert("Microphone access denied.");
              }
              setIsListening(false);
          };

          recognitionRef.current.onend = () => {
              setIsListening(false);
              
              if (transcriptRef.current.trim()) {
                  const refinedText = polishText(transcriptRef.current);
                  if (refinedText.length > 1) { 
                      handleSend(refinedText);
                  }
                  transcriptRef.current = '';
              }
          };
      }
  }, [session, inputMode]);

  const startListening = () => {
      if (!recognitionRef.current) {
          alert("Voice input not supported.");
          return;
      }
      if (isListening) return;
      
      transcriptRef.current = '';
      try {
          recognitionRef.current.start();
      } catch (e) {
          console.error("Start listening failed", e);
      }
  };

  const stopListening = () => {
      if (!recognitionRef.current || !isListening) return;
      try {
          recognitionRef.current.stop();
      } catch (e) {
          console.error("Stop listening failed", e);
      }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              setSelectedImage(ev.target?.result as string);
              setInputMode('TEXT'); 
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSend = async (textOverride?: string) => {
      const textToSend = textOverride || inputText;
      const imageToSend = selectedImage;

      if ((!textToSend.trim() && !imageToSend) || !session) return;

      setInputText('');
      if (!textOverride) setSelectedImage(null);

      setMessages(prev => [...prev, { role: 'user', text: textToSend, image: imageToSend || undefined }]);
      setIsTyping(true);

      try {
          let result;
          if (imageToSend) {
              const base64Data = imageToSend.includes(',') ? imageToSend.split(',')[1] : imageToSend;
              const parts: Part[] = [
                  { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
              ];
              if (textToSend) parts.push({ text: textToSend });
              result = await session.sendMessageStream({ message: parts });
          } else {
              result = await session.sendMessageStream({ message: textToSend });
          }

          let fullResponse = "";
          let hasPlayedSound = false;
          
          setMessages(prev => [...prev, { role: 'model', text: "", isStreaming: true }]);

          for await (const chunk of result) {
              const text = (chunk as GenerateContentResponse).text;
              if (text) {
                  if (!hasPlayedSound) {
                      playNotificationSound(); // Play clearer notification sound on first token
                      hasPlayedSound = true;
                  }

                  fullResponse += text;
                  setMessages(prev => {
                      const newArr = [...prev];
                      const lastMsg = newArr[newArr.length - 1];
                      if (lastMsg.role === 'model') {
                          lastMsg.text = fullResponse;
                      }
                      return newArr;
                  });
              }
          }
          
          setMessages(prev => {
              const newArr = [...prev];
              newArr[newArr.length - 1].isStreaming = false;
              return newArr;
          });

      } catch (e: any) {
          const errorMsg = isQuotaError(e)
              ? "System busy. Retry shortly." 
              : "Connection interrupted.";
          
          setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last.role === 'model' && last.isStreaming) {
                  const newArr = [...prev];
                  newArr[newArr.length - 1].text = errorMsg;
                  newArr[newArr.length - 1].isStreaming = false;
                  return newArr;
              } else {
                  return [...prev, { role: 'model', text: errorMsg }];
              }
          });
      } finally {
          setIsTyping(false);
      }
  };

  const handleSaveResponse = (index: number) => {
      const msg = messages[index];
      if (!msg || msg.role !== 'model') return;
      
      const prevMsg = messages[index - 1];
      const question = prevMsg?.role === 'user' ? prevMsg.text : "AI Insight";
      
      const newFile: SavedFile = {
          id: Date.now().toString(),
          question,
          answer: msg.text,
          timestamp: Date.now()
      };
      
      if (!savedFiles.some(f => f.answer === newFile.answer)) {
          setSavedFiles(prev => [newFile, ...prev]);
      }
  };

  const handleDeleteFile = (id: string) => {
      setSavedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClose = () => {
      if (viewMode === 'FILES') {
          setViewMode('CHAT');
      } else {
          if (onClose) onClose();
          else {
              const event = new CustomEvent('navigate-home');
              window.dispatchEvent(event);
          }
      }
  };

  return (
    <div className="fixed inset-0 z-[200] font-sans h-[100dvh] overflow-hidden flex flex-col bg-black text-zinc-800">
        
        {/* --- DYNAMIC BACKGROUND --- */}
        <div className="absolute inset-0 z-0">
            {user.faceImage ? (
                <img 
                    src={user.faceImage} 
                    className="w-full h-full object-cover opacity-80" 
                    alt="Background" 
                />
            ) : (
                <div className="w-full h-full bg-gradient-to-br from-teal-100 via-white to-rose-50" />
            )}
        </div>

        {/* --- MAIN GLASS CONTAINER --- */}
        <div className="absolute inset-2 z-10 bg-white/70 backdrop-blur-3xl rounded-[2.5rem] border border-white/50 shadow-2xl flex flex-col overflow-hidden">
            
            {/* --- HEADER --- */}
            <div className={`absolute top-0 left-0 right-0 px-6 pt-6 pb-4 flex items-center justify-between z-50 transition-all duration-500`}>
                <button 
                    onClick={handleClose} 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 transition-colors active:scale-95 bg-white/40 backdrop-blur-md border border-white/50 shadow-sm"
                >
                    <ChevronLeft size={24} strokeWidth={1.5} />
                </button>
                
                <div className="bg-white/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/50 shadow-sm flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${orbState === 'THINKING' ? 'bg-teal-500 animate-pulse' : 'bg-zinc-400'}`}></div>
                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest font-sans">
                        {viewMode === 'FILES' ? 'Saved Answers' : inputMode === 'VOICE' ? 'Live Session' : 'Chat Mode'}
                    </span>
                </div>

                <button 
                    onClick={() => setViewMode(prev => prev === 'CHAT' ? 'FILES' : 'CHAT')}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors active:scale-95 bg-white/40 backdrop-blur-md border border-white/50 shadow-sm ${viewMode === 'FILES' ? 'text-teal-600 bg-teal-50 border-teal-200' : 'text-zinc-400 hover:text-zinc-700'}`}
                >
                    {viewMode === 'FILES' ? <MessageSquare size={18} strokeWidth={1.5} /> : <FileText size={18} strokeWidth={1.5} />}
                </button>
            </div>

            {/* --- UNIFIED VISUAL AREA --- */}
            
            {viewMode === 'CHAT' && (
                <>
                    {/* 1. THE ORB (MOVES FROM CENTER TO TOP) */}
                    <div className={`w-full shrink-0 flex flex-col items-center justify-center relative z-10 transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${hasStarted ? 'h-[45%] pt-28' : 'h-full pb-32'}`}>
                        <div className="relative flex items-center justify-center w-48 h-48">
                            <div className="absolute inset-0 rounded-full border-2 border-teal-500/10 animate-[spin_8s_linear_infinite]"></div>
                            <div className="absolute inset-4 rounded-full border border-teal-500/20 animate-[spin_6s_linear_infinite_reverse]"></div>
                            
                            <div 
                                className={`rounded-full bg-gradient-to-tr from-teal-400 to-teal-200 flex items-center justify-center shadow-2xl relative z-10 transition-all duration-500 w-full h-full ${orbState === 'LISTENING' ? 'scale-110 shadow-teal-500/50' : 'animate-[bounce_3s_ease-in-out_infinite]'}`}
                            >
                                {orbState === 'LISTENING' ? (
                                    <AudioWaveform className="text-white animate-pulse w-20 h-20" />
                                ) : orbState === 'THINKING' ? (
                                    <Sparkles className="text-white animate-spin w-20 h-20" />
                                ) : (
                                    <AudioWaveform className="text-white drop-shadow-md w-20 h-20" strokeWidth={1.5} />
                                )}
                            </div>

                            {orbState === 'LISTENING' && (
                                <div className="absolute inset-0 rounded-full border-2 border-teal-400 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                            )}
                        </div>

                        <div className={`text-center mt-10 transition-all duration-700 absolute top-[55%] left-0 right-0 ${hasStarted ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0 delay-200'}`}>
                            <h2 className="text-3xl font-thin text-zinc-900 tracking-tighter">Hi, {user.name.split(' ')[0]}</h2>
                            <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mt-2">AI Dermatologist</p>
                        </div>
                    </div>

                    {/* 2. TEXT CONTENT AREA */}
                    <div className="flex-1 relative overflow-hidden w-full z-20">
                        <div className="absolute inset-0 overflow-y-auto no-scrollbar px-6 pb-32 pt-4 animate-in fade-in duration-500 font-sans">
                            <div className="w-full max-w-md mx-auto flex flex-col justify-start space-y-8 min-h-min">
                                {messages.length === 0 && !isListening && hasStarted && (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-400 opacity-50 py-10">
                                        <Loader size={24} className="animate-spin mb-2" />
                                        <p className="text-xs font-medium uppercase tracking-widest">Thinking...</p>
                                    </div>
                                )}
                                
                                {messages.map((msg, idx) => {
                                    const isSaved = savedFiles.some(f => f.answer === msg.text);
                                    return (
                                        <MessageItem 
                                            key={idx} 
                                            msg={msg} 
                                            index={idx} 
                                            onSave={handleSaveResponse} 
                                            isSaved={isSaved} 
                                        />
                                    );
                                })}

                                <div ref={messagesEndRef} className="h-1" />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {viewMode === 'FILES' && (
                <div className="absolute inset-0 pt-24 pb-32 px-6 overflow-y-auto z-20 animate-in fade-in slide-in-from-right-8 duration-300">
                    <div className="max-w-md mx-auto space-y-4">
                        {savedFiles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center h-[50vh] text-zinc-400">
                                <div className="w-16 h-16 rounded-full bg-white/40 flex items-center justify-center mb-4">
                                    <FileText size={24} className="opacity-50" />
                                </div>
                                <p className="text-sm font-medium">No saved answers yet.</p>
                                <p className="text-[10px] uppercase tracking-widest mt-1 opacity-70">Tap 'Save' on any response</p>
                            </div>
                        ) : (
                            savedFiles.map((file) => (
                                <SavedFileItem key={file.id} file={file} onDelete={handleDeleteFile} />
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* --- BOTTOM CONTROLS (Only in Chat Mode) --- */}
            {viewMode === 'CHAT' && (
                <div className="absolute bottom-0 left-0 right-0 p-6 pb-8 z-40 bg-gradient-to-t from-white/90 via-white/80 to-transparent">
                    <div className="flex items-center justify-between max-w-sm mx-auto w-full">
                        
                        <button 
                            onClick={() => setInputMode(inputMode === 'VOICE' ? 'TEXT' : 'VOICE')}
                            className="w-12 h-12 rounded-full bg-white border border-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-all active:scale-95 shadow-sm"
                        >
                            {inputMode === 'VOICE' ? <Keyboard size={20} /> : <AudioWaveform size={20} />}
                        </button>

                        <div className="relative select-none">
                            {inputMode === 'VOICE' ? (
                                <button 
                                    onMouseDown={startListening}
                                    onMouseUp={stopListening}
                                    onMouseLeave={stopListening}
                                    onTouchStart={startListening}
                                    onTouchEnd={stopListening}
                                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl border-4 ${isListening ? 'bg-teal-50 border-teal-200 shadow-teal-200 scale-110' : 'bg-white border-white/50 shadow-lg hover:shadow-2xl active:scale-95'}`}
                                >
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-teal-500 text-white' : 'bg-zinc-50 text-zinc-400'}`}>
                                        <Mic size={28} strokeWidth={isListening ? 2 : 1.5} />
                                    </div>
                                    {isListening && (
                                        <span className="absolute -top-8 text-[10px] font-bold text-teal-600 bg-white/80 px-2 py-1 rounded-full shadow-sm animate-bounce">
                                            Release to Send
                                        </span>
                                    )}
                                </button>
                            ) : (
                                <div className="w-full max-w-[200px] bg-white rounded-full p-1.5 flex items-center shadow-lg border border-zinc-100">
                                    <input 
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                        placeholder="Type a message..."
                                        className="bg-transparent border-none outline-none text-sm font-medium px-3 w-full text-zinc-800 placeholder:text-zinc-400 font-sans"
                                        autoFocus
                                    />
                                    <button 
                                        onClick={() => handleSend()}
                                        disabled={!inputText.trim()}
                                        className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center disabled:opacity-50 transition-all active:scale-90"
                                    >
                                        <Send size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={handleClose}
                            className="w-12 h-12 rounded-full bg-white border border-zinc-100 flex items-center justify-center text-zinc-500 hover:text-rose-500 transition-all active:scale-95 shadow-sm"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

            <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
            />
        </div>
    </div>
  );
};

export default AIAssistant;
