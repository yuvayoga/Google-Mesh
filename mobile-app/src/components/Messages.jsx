import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Shield, MessageSquare } from 'lucide-react';
import { getDatabase, ref, push, onValue, off } from 'firebase/database';

function Messages({ deviceId, db }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [online, setOnline] = useState(navigator.onLine);
    const scrollRef = useRef(null);
    const meshChannel = new BroadcastChannel('sos_mesh_network');

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const messagesRef = ref(db, `chats/${deviceId}`);
        onValue(messagesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
                setMessages(list.sort((a, b) => a.time - b.time));
            }
        });

        // Listen for mesh messages to update UI even if offline
        meshChannel.onmessage = (event) => {
            if (event.data.type === 'CHAT_BROADCAST' && event.data.payload.deviceId === deviceId) {
                setMessages(prev => {
                    const exists = prev.find(m => m.time === event.data.payload.msg.time);
                    if (exists) return prev;
                    return [...prev, { id: `mesh-${Date.now()}`, ...event.data.payload.msg }].sort((a, b) => a.time - b.time);
                });
            }
        };

        return () => {
            off(messagesRef);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            meshChannel.close();
        };
    }, [deviceId, db]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        // AI Analysis
        let aiResult = { priority: 'normal', summary: input };
        try {
            const { default: geminiService } = await import('../services/GeminiService');
            aiResult = await geminiService.analyzeMessage(input);
        } catch (err) {
            console.error("AI Analysis skipped:", err);
        }

        const msg = {
            text: input,
            sender: 'user',
            time: Date.now(),
            priority: aiResult.priority || 'normal',
            aiSummary: aiResult.summary || input
        };

        if (online) {
            await push(ref(db, `chats/${deviceId}`), msg);
        } else {
            // OFFLINE MESH BROADCAST
            meshChannel.postMessage({
                type: 'CHAT_BROADCAST',
                payload: { deviceId, msg }
            });
            // Update local UI immediately
            setMessages(prev => [...prev, { id: `local-${Date.now()}`, ...msg }]);
        }

        setInput('');
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-md flex flex-col h-[68vh] glass rounded-[3rem] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.3)] border-white/10"
        >
            {/* Chat Header */}
            <div className="p-6 border-b border-slate-200 dark:border-white/5 bg-white/40 dark:bg-slate-900/40 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emergency/20 to-emergency/5 flex items-center justify-center border border-emergency/20 shadow-lg">
                    <Shield className="text-emergency w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Rescue Command</h3>
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest">Secure Link Active</p>
                    </div>
                </div>
            </div>

            {/* Message Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 scroll-smooth"
            >
                <AnimatePresence initial={false}>
                    {messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-4 opacity-50">
                            <div className="w-20 h-20 rounded-[2rem] bg-slate-100 dark:bg-slate-900/50 flex items-center justify-center border border-slate-200 dark:border-white/5">
                                <MessageSquare className="w-10 h-10" />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Encrypted Channel Ready</p>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm font-black shadow-xl relative overflow-hidden ${msg.sender === 'user'
                                    ? 'bg-gradient-to-br from-emergency via-emergency to-emergency-dark text-white rounded-tr-none'
                                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-100 dark:border-white/5'
                                    }`}>
                                    {msg.sender === 'user' && (
                                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                                    )}
                                    {/* Priority Badge */}
                                    {(msg.priority === 'critical' || msg.priority === 'high') && (
                                        <div className="mb-1 flex items-center gap-1">
                                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${msg.priority === 'critical' ? 'bg-white text-red-600' : 'bg-white text-orange-500'}`}>
                                                {msg.priority}
                                            </span>
                                        </div>
                                    )}
                                    {msg.text}
                                </div>
                                <span className="text-[9px] text-slate-400 dark:text-slate-600 mt-2 font-black uppercase tracking-widest px-2">
                                    {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>

            {/* Input Area */}
            <form onSubmit={sendMessage} className="p-4 bg-white/40 dark:bg-slate-900/40 border-t border-slate-200 dark:border-white/5 flex gap-3 items-center">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type secure message..."
                    className="flex-1 min-w-0 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 outline-none rounded-2xl px-4 py-3.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-700 shadow-inner font-bold"
                />
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.9 }}
                    type="submit"
                    className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-emergency via-emergency to-emergency-dark rounded-2xl flex items-center justify-center shadow-2xl shadow-emergency/30 border border-white/10"
                >
                    <Send className="w-5 h-5 text-white" />
                </motion.button>
            </form>
        </motion.div>
    );
}

export default Messages;
