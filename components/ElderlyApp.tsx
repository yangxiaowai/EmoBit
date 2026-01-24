
import React, { useEffect, useState, useRef } from 'react';
import { SimulationType, SystemStatus, MemoryPhoto } from '../types';
import { Mic, Battery, Wifi, Signal, Info, ChevronLeft, Image as ImageIcon, Volume2, X, CloudSun, Loader2, Navigation, ScanLine, Pill, CheckCircle, ArrowUp, ArrowLeft, ArrowRight, MapPin, Camera, User, ScanFace, Box } from 'lucide-react';

interface ElderlyAppProps {
  status: SystemStatus;
  simulation: SimulationType;
}

// --- Data ---
const MOCK_MEMORIES: MemoryPhoto[] = [
  { id: '1', url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=600&auto=format&fit=crop', date: '1982年 秋', location: '人民公园', story: '这是您和奶奶在人民公园的合影。那时候刚买了第一台胶片相机...', tags: ['家人'] },
  { id: '2', url: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=600&auto=format&fit=crop', date: '1995年 春节', location: '老家院子', story: '这张是大年初一的全家福。大家围在一起包饺子...', tags: ['春节'] },
  { id: '3', url: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?q=80&w=600&auto=format&fit=crop', date: '2010年 夏', location: '上海世博会', story: '这是咱们一家去上海看世博会。中国馆真的好壮观...', tags: ['旅行'] }
];

// --- Sub-Components (Full Screen Scenarios) ---

// 1. AR Navigation Scenario (Enhanced HUD)
const ARNavigationFlow = ({ step }: { step: number }) => {
    // Step 0: Analyzing -> Step 1: Turn Left -> Step 2: Straight -> Step 3: Arrived
    const instructions = [
        { text: "正在定位...", sub: "请扫描周围环境", icon: <Loader2 className="animate-spin" /> },
        { text: "前方路口左转", sub: "距离 50 米", icon: <ArrowLeft size={64} className="animate-bounce-left" /> },
        { text: "沿大路直行", sub: "距离 300 米", icon: <ArrowUp size={64} className="animate-bounce-up" /> },
        { text: "即将到达目的地", sub: "天安门广场", icon: <MapPin size={64} className="animate-bounce" /> },
    ];
    
    const current = instructions[Math.min(step, instructions.length - 1)];
    const bgImage = step === 1 
        ? "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=800&auto=format&fit=crop" // City Street
        : "https://images.unsplash.com/photo-1597022227183-49d7f646098b?q=80&w=800&auto=format&fit=crop"; // Beijing-ish

    return (
        <div className="absolute inset-0 z-50 bg-black text-white flex flex-col relative overflow-hidden animate-fade-in font-sans">
             {/* AR Background */}
            <div className="absolute inset-0">
                <img src={bgImage} className="w-full h-full object-cover opacity-80" alt="AR View" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60"></div>
            </div>

            {/* HUD Header */}
            <div className="relative z-10 px-6 pt-12 flex justify-between items-start">
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
                     <p className="text-[10px] text-white/70 uppercase">目的地</p>
                     <p className="font-bold text-lg">天安门广场</p>
                </div>
                <div className="w-12 h-12 bg-emerald-500/20 backdrop-blur rounded-full flex items-center justify-center border border-emerald-400/50 animate-pulse">
                    <Navigation size={24} className="text-emerald-400" />
                </div>
            </div>

            {/* AR Elements (Center) */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                 {step > 0 && (
                     <div className="bg-indigo-600/80 backdrop-blur p-6 rounded-[2rem] shadow-[0_0_50px_rgba(79,70,229,0.5)] border-4 border-white/30 transform transition-all duration-500">
                         {current.icon}
                     </div>
                 )}
                 
                 {/* 3D Path visualization (Fake) */}
                 {step === 2 && (
                     <div className="absolute bottom-0 w-32 h-64 bg-gradient-to-t from-indigo-500/50 to-transparent transform perspective-3d rotate-x-60"></div>
                 )}
            </div>

            {/* Bottom Instruction Panel */}
            <div className="relative z-10 p-6 pb-12">
                <div className="bg-white/95 text-slate-900 p-6 rounded-3xl shadow-2xl animate-slide-up border border-white/50">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <h2 className="text-3xl font-black mb-1">{current.text}</h2>
                            <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                                {step === 0 ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={18} className="text-indigo-600" />}
                                {current.sub}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>{`
                .animate-bounce-left { animation: bounceLeft 1s infinite; }
                .animate-bounce-up { animation: bounceUp 1s infinite; }
                @keyframes bounceLeft { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-10px); } }
                @keyframes bounceUp { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
            `}</style>
        </div>
    );
};

// 2. Medication Guide Scenario (Detailed CV Flow)
const MedicationFlow = ({ step }: { step: number }) => {
    // Step 0: Scan Prompt -> Step 1: Scanning -> Step 2: Identified -> Step 3: Action -> Step 4: Check Hand -> Step 5: Swallow Check
    const scanImage = "https://images.unsplash.com/photo-1628771065518-0d82f1938462?q=80&w=800&auto=format&fit=crop"; // Medicine Box
    const handImage = "https://images.unsplash.com/photo-1550572017-edd951aa8f72?q=80&w=800&auto=format&fit=crop"; // Pills in hand
    const drinkingImage = "https://images.unsplash.com/photo-1543506987-a2e6669c5e53?q=80&w=800&auto=format&fit=crop"; // Drinking water
    
    let state = { text: "", sub: "", img: scanImage, overlay: null as React.ReactNode };

    if (step === 0) {
        state = { 
            text: "请拿出药盒", sub: "将药盒正面放入框内", img: scanImage, 
            overlay: <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white/50 rounded-2xl flex items-center justify-center"><ScanLine className="text-white opacity-50" size={32} /></div> 
        };
    } else if (step === 1) {
        state = { 
            text: "正在识别...", sub: "保持药盒稳定", img: scanImage, 
            overlay: <div className="absolute inset-12 border-2 border-indigo-400 rounded-xl animate-pulse flex items-center justify-center bg-indigo-500/10"><ScanLine className="text-indigo-400 w-full h-full opacity-80 animate-ping" /></div> 
        };
    } else if (step === 2) {
        state = { 
            text: "识别成功：阿司匹林", sub: "100mg肠溶片", img: scanImage, 
            overlay: (
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-xl border border-emerald-500 shadow-lg flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <span className="font-bold text-slate-800">匹配处方</span>
                </div>
            )
        };
    } else if (step === 3) {
        state = { 
            text: "请倒出 2 粒", sub: "放在手心让我看看", img: handImage, 
            overlay: <div className="absolute inset-0 flex items-center justify-center"><div className="w-48 h-48 border-2 border-dashed border-yellow-400 rounded-full animate-spin-slow opacity-50"></div></div> 
        };
    } else if (step === 4) {
        state = {
            text: "数量正确 (2粒)", sub: "请准备温水送服", img: handImage,
            overlay: (
                <>
                     <div className="absolute top-1/2 left-1/2 -translate-x-12 -translate-y-12 w-6 h-6 border-2 border-green-400 rounded-full"></div>
                     <div className="absolute top-1/2 left-1/2 translate-x-4 -translate-y-8 w-6 h-6 border-2 border-green-400 rounded-full"></div>
                     <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">Count: 2</div>
                </>
            )
        }
    } else {
        state = { 
            text: "检测服药动作", sub: "请正对摄像头吞咽", img: drinkingImage, 
            overlay: (
                <div className="absolute inset-0">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-40 h-40 border-2 border-indigo-400 rounded-full opacity-50"></div>
                    <div className="absolute bottom-32 left-0 right-0 text-center">
                        <div className="inline-flex items-center gap-2 bg-black/60 text-white px-3 py-1 rounded-full text-xs">
                            <ScanFace size={12} /> 动作分析中...
                        </div>
                    </div>
                </div>
            )
        };
    }

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in font-sans">
             {/* Camera Feed Simulation */}
             <div className="flex-1 relative overflow-hidden bg-black">
                 <img src={state.img} className="w-full h-full object-cover opacity-90" alt="Camera" />
                 
                 {/* Status Badges */}
                 <div className="absolute top-4 right-4 bg-black/50 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-mono flex items-center gap-2 border border-white/10">
                     <Camera size={12} className="text-red-500 animate-pulse" /> AI Vision Active
                 </div>
                 
                 {state.overlay}
             </div>

             {/* Interactive Guide Panel */}
             <div className="bg-white rounded-t-[2.5rem] p-8 -mt-6 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
                 <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>
                 <div className="flex items-start gap-4">
                     <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${step === 2 || step >= 4 ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                         {step >= 5 ? <CheckCircle size={28} /> : <Pill size={28} />}
                     </div>
                     <div>
                         <h2 className="text-2xl font-black text-slate-800 mb-1">{state.text}</h2>
                         <p className="text-slate-500 font-bold flex items-center gap-2">
                             <Volume2 size={16} className="text-indigo-500" />
                             {state.sub}
                         </p>
                     </div>
                 </div>
                 
                 {/* Progress Steps */}
                 <div className="flex gap-2 mt-8">
                     {[0,1,2,3,4,5].map(i => (
                         <div key={i} className={`h-2 rounded-full flex-1 transition-all duration-500 ${i <= step ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
                     ))}
                 </div>
             </div>
        </div>
    );
};

// 3. Immersive Memories Scenario
const MemoriesFlow = ({ step }: { step: number }) => {
    // Loop through photos based on step
    const photoIndex = step % MOCK_MEMORIES.length;
    const photo = MOCK_MEMORIES[photoIndex];

    return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col animate-fade-in font-sans">
            {/* Immersive Photo (Ken Burns Effect) */}
            <div className="absolute inset-0 overflow-hidden">
                <img 
                    key={photo.id} // Key change triggers animation reset
                    src={photo.url} 
                    className="w-full h-full object-cover animate-ken-burns opacity-90" 
                    alt="Memory" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40"></div>
            </div>

            {/* Top Info */}
            <div className="relative z-10 px-6 pt-12 flex justify-between">
                <div className="bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-white/80 text-xs font-bold flex items-center gap-2">
                    <ImageIcon size={12} /> 时光回忆录
                </div>
                <div className="text-white/60 text-xs font-mono">{photo.date}</div>
            </div>

            {/* Bottom Caption / Story */}
            <div className="mt-auto relative z-10 p-8 pb-16">
                 <div className="mb-4 flex flex-wrap gap-2">
                     {photo.tags.map(tag => (
                         <span key={tag} className="bg-indigo-500/80 backdrop-blur px-2 py-1 rounded-md text-white text-[10px] font-bold shadow-sm">
                             #{tag}
                         </span>
                     ))}
                 </div>
                 <h2 className="text-3xl font-black text-white mb-2 leading-tight drop-shadow-lg">{photo.location}</h2>
                 
                 {/* Narration Box */}
                 <div className="bg-white/10 backdrop-blur-lg border border-white/20 p-4 rounded-2xl mt-4">
                     <p className="text-white/90 text-lg font-medium leading-relaxed drop-shadow-md">
                         "{photo.story}"
                     </p>
                     <div className="mt-4 flex items-center gap-3">
                         <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                             <Volume2 size={16} className="text-white animate-pulse" />
                         </div>
                         <div className="flex-1 h-8 flex items-center gap-0.5">
                             {/* Fake Waveform */}
                             {[...Array(20)].map((_, i) => (
                                 <div 
                                    key={i} 
                                    className="w-1 bg-white/60 rounded-full animate-wave" 
                                    style={{
                                        height: Math.random() * 20 + 5 + 'px', 
                                        animationDelay: i * 0.05 + 's'
                                    }}
                                 ></div>
                             ))}
                         </div>
                     </div>
                 </div>
            </div>
            
            <style>{`
                .animate-ken-burns { animation: kenBurns 15s ease-out infinite alternate; }
                .animate-wave { animation: wave 1s ease-in-out infinite; }
                @keyframes kenBurns { 0% { transform: scale(1); } 100% { transform: scale(1.15) translate(-2%, -2%); } }
                @keyframes wave { 0%, 100% { height: 30%; opacity: 0.5; } 50% { height: 100%; opacity: 1; } }
            `}</style>
        </div>
    );
};


// --- Main Component ---

const ElderlyApp: React.FC<ElderlyAppProps> = ({ status, simulation }) => {
  const [time, setTime] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  
  // Scenario Flow State
  const [activeScenario, setActiveScenario] = useState<'none' | 'nav' | 'meds' | 'memory'>('none');
  const [step, setStep] = useState(0);
  const [voiceInputDisplay, setVoiceInputDisplay] = useState<string | null>(null);

  // Avatar State
  const [isTalking, setIsTalking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiMessage, setAiMessage] = useState("张爷爷，我在呢。有什么想聊的吗？");

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setDateStr(now.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Logic: Handle External Simulations & Voice Triggers ---
  useEffect(() => {
      if (simulation === SimulationType.NONE) {
          setActiveScenario('none');
          setStep(0);
          setVoiceInputDisplay(null);
          setAiMessage("张爷爷，我在呢。今天天气不错。");
          return;
      }

      // Handle Voice Command Scenarios
      if (simulation === SimulationType.VOICE_NAV_START) {
          triggerVoiceCommand("我要去天安门", 'nav', "好的，正在为您开启 AR 导航。");
      } else if (simulation === SimulationType.VOICE_MEMORY_START) {
          triggerVoiceCommand("听听照片回忆", 'memory', "没问题，让我们一起翻翻老照片。");
      } else if (simulation === SimulationType.VOICE_MEDS_START) {
          triggerVoiceCommand("这药怎么吃？", 'meds', "我来帮您看看。请把药盒拿出来。");
      }
      // Handle Emergency Scenarios (Existing)
      else if (simulation === SimulationType.FALL || simulation === SimulationType.WANDERING || simulation === SimulationType.MEDICATION) {
          setActiveScenario('none');
      }

  }, [simulation]);

  // Helper to simulate the "User Speaking -> AI Confirming -> Switching UI" flow
  const triggerVoiceCommand = (userText: string, targetScenario: 'nav' | 'meds' | 'memory', aiResponse: string) => {
      // 1. Reset
      setActiveScenario('none');
      setStep(0);
      
      // 2. Simulate User Voice Input Visualization
      setVoiceInputDisplay(userText);
      setIsListening(true); // Avatar shows listening state

      // 3. AI Processes (1.5s delay)
      setTimeout(() => {
          setIsListening(false);
          setVoiceInputDisplay(null);
          setAiMessage(aiResponse);
          setIsTalking(true);

          // 4. AI Finishes talking and Switches UI (2s delay)
          setTimeout(() => {
              setIsTalking(false);
              setActiveScenario(targetScenario);
          }, 2000);
      }, 1500);
  };

  // --- Logic: Scenario Auto-Progression (The 3-Second Rule) ---
  useEffect(() => {
      let interval: any;
      if (activeScenario !== 'none') {
          interval = setInterval(() => {
              setStep((prev) => prev + 1);
          }, 3500); // 3.5s per step
      }
      return () => clearInterval(interval);
  }, [activeScenario]);


  // --- Render ---

  return (
    <div className="flex items-center justify-center h-full py-8">
      <div className="relative w-[360px] h-[720px] bg-black rounded-[3rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border-[8px] border-slate-800 overflow-hidden ring-1 ring-slate-900/5 select-none font-sans">
        
        {/* Status Bar */}
        <div className="absolute top-0 left-0 right-0 h-10 z-[60] flex items-center justify-between px-6 pt-2 text-white text-xs font-medium pointer-events-none mix-blend-difference">
            <span>{time}</span>
            <div className="flex items-center gap-1.5"><Signal size={12} /><Wifi size={12} /><Battery size={14} /></div>
        </div>

        {/* --- SCENARIO LAYERS --- */}
        {activeScenario === 'nav' && <ARNavigationFlow step={step} />}
        {activeScenario === 'meds' && <MedicationFlow step={step} />}
        {activeScenario === 'memory' && <MemoriesFlow step={step} />}

        {/* --- HOME SCREEN (3D Avatar) --- */}
        <div className={`w-full h-full flex flex-col relative transition-all duration-700 overflow-hidden bg-gradient-to-b from-indigo-50 to-white ${activeScenario !== 'none' ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'}`}>
            
            {/* Header */}
            <div className="w-full px-8 pt-14 mb-6 flex justify-between items-end relative z-10 animate-fade-in-up">
                <div className="flex flex-col">
                    <span className="text-5xl font-black text-slate-800 tracking-tighter leading-none">{time}</span>
                    <span className="text-sm font-bold text-slate-500 mt-2 pl-1 tracking-widest uppercase">{dateStr}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-3xl font-black text-slate-800">24°</span>
                    <CloudSun size={32} className="text-amber-500" />
                </div>
            </div>

            {/* 3D Avatar Container with Health Visualization */}
            <div className="flex-1 flex flex-col items-center justify-center -mt-10">
                <div className="relative w-64 h-80 perspective-1000 group">
                    
                    {/* The 3D Model Placeholder (Using a silhouette concept for visual clarity) */}
                    <div className={`w-40 h-72 mx-auto bg-gradient-to-t from-slate-300 to-slate-200 rounded-[3rem] relative shadow-2xl animate-float transition-all duration-300 ${isTalking ? 'scale-105' : 'scale-100'}`}>
                        
                        {/* Body - Health Glows */}
                        {/* 1. Brain (Mental State) */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-20 bg-blue-400/30 rounded-full blur-xl animate-pulse"></div>
                        
                        {/* 2. Heart (BPM) */}
                        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-16 h-16 bg-red-400/20 rounded-full blur-xl animate-pulse delay-150"></div>
                        <div className="absolute top-28 left-1/2 -translate-x-1/2 text-red-500/50 text-[10px] font-bold font-mono">75 BPM</div>

                        {/* 3. Joints (Knees - Fall Risk Status) */}
                        {status === SystemStatus.WARNING && (
                            <>
                                <div className="absolute bottom-16 left-8 w-8 h-8 bg-amber-400/40 rounded-full blur-lg animate-ping"></div>
                                <div className="absolute bottom-16 right-8 w-8 h-8 bg-amber-400/40 rounded-full blur-lg animate-ping"></div>
                            </>
                        )}

                        {/* Face */}
                        <div className="absolute top-8 left-0 right-0 flex justify-center gap-6">
                             <div className={`w-2 h-6 bg-slate-400/80 rounded-full animate-blink relative ${isListening ? 'scale-y-125' : ''}`}></div>
                             <div className={`w-2 h-6 bg-slate-400/80 rounded-full animate-blink relative ${isListening ? 'scale-y-125' : ''}`}></div>
                        </div>

                        {/* Mouth */}
                        <div className={`absolute bottom-52 left-1/2 -translate-x-1/2 bg-slate-400/80 rounded-full transition-all duration-200 ${
                            isTalking ? 'w-6 h-4 animate-talk' : isListening ? 'w-4 h-1' : 'w-2 h-0.5'
                        }`}></div>
                    </div>
                    
                    {/* Platform */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-12 bg-black/5 rounded-[100%] blur-sm transform scale-x-150"></div>
                </div>

                {/* Main Dialogue Box */}
                <div className="px-6 w-full relative z-10 mt-6">
                    <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl rounded-tl-none shadow-sm border border-white/50 animate-fade-in-up min-h-[80px] flex items-center">
                        <div className="w-full">
                            <div className="flex items-center gap-2 mb-2 text-indigo-600 text-xs font-bold uppercase tracking-wider">
                                {isListening ? <Mic size={12} className="animate-pulse" /> : <Volume2 size={12} />}
                                {isListening ? "正在聆听..." : "AI 陪伴助手"}
                            </div>
                            
                            {/* Dynamic Text Switching */}
                            {voiceInputDisplay ? (
                                <p className="text-slate-800 text-lg font-bold leading-relaxed animate-pulse">
                                    "{voiceInputDisplay}"
                                </p>
                            ) : (
                                <p className="text-slate-700 text-lg font-medium leading-relaxed">
                                    {aiMessage}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mic Button */}
            <div className="mb-12 flex justify-center relative group">
                <button 
                    className={`w-20 h-20 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-full shadow-lg shadow-indigo-300 flex items-center justify-center text-white relative z-10 active:scale-95 transition-transform ${isListening ? 'scale-110' : ''}`}
                >
                    {isListening ? (
                         <div className="flex gap-1">
                             <div className="w-1 h-4 bg-white rounded-full animate-bounce"></div>
                             <div className="w-1 h-6 bg-white rounded-full animate-bounce delay-150"></div>
                             <div className="w-1 h-4 bg-white rounded-full animate-bounce delay-75"></div>
                         </div>
                    ) : <Mic size={32} />}
                </button>
            </div>
        </div>
        
        <style>{`
            @keyframes float { 0%, 100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(-10px) rotate(1deg); } }
            @keyframes blink { 0%, 45%, 55%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.1); } }
            @keyframes talk { 0%, 100% { height: 4px; } 50% { height: 12px; } }
            .animate-float { animation: float 6s ease-in-out infinite; }
            .animate-blink { animation: blink 4s infinite; }
            .animate-talk { animation: talk 0.3s ease-in-out infinite; }
            .animate-fade-in { animation: fadeIn 0.5s ease-out; }
            .animate-fade-in-up { animation: fadeInUp 0.5s ease-out; }
            .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .perspective-3d { transform: perspective(500px) rotateX(60deg); }
        `}</style>
      </div>
    </div>
  );
};

export default ElderlyApp;
