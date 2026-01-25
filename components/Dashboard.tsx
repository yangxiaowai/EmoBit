
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SimulationType, SystemStatus, LogEntry, DashboardTab } from '../types';
import { VoiceService, AvatarService } from '../services/api'; // Import Services
import { healthStateService, HealthMetrics } from '../services/healthStateService';
import { mapService } from '../services/mapService';
import { ShieldCheck, MapPin, Heart, Pill, AlertTriangle, Phone, Activity, Clock, User, Calendar, LayoutGrid, FileText, Settings, ChevronRight, Eye, Brain, Layers, Play, Pause, SkipBack, SkipForward, History, AlertCircle, Signal, Wifi, Battery, Moon, Footprints, Sun, Cloud, ArrowLeft, Mic, Upload, Sparkles, CheckCircle, Volume2, ToggleRight, Loader2, ScanFace, Box, Wand2 } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, AreaChart, Area, BarChart, Bar, CartesianGrid } from 'recharts';

interface DashboardProps {
    status: SystemStatus;
    simulation: SimulationType;
    logs: LogEntry[];
}

// Mock Data - 使用 healthStateService 的基准心率
const generateHeartRateData = () => {
    const baseHR = 72; // 与 healthStateService 保持一致
    return Array.from({ length: 24 }, (_, i) => ({
        time: `${i}:00`,
        bpm: Math.round(baseHR + Math.sin(i / 4) * 5 + (i > 18 ? 5 : 0)),
        pressure: Math.round(120 + Math.sin(i / 3) * 8)
    }));
};
const mockHeartRateData = generateHeartRateData();

const mockSleepData = [
    { name: '深睡', hours: 2.5, fill: '#4f46e5' },
    { name: '浅睡', hours: 4.5, fill: '#818cf8' },
    { name: '清醒', hours: 1, fill: '#e0e7ff' },
];

const Dashboard: React.FC<DashboardProps> = ({ status, simulation, logs }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const [greeting, setGreeting] = useState<string>('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const mapRef = useRef<any>(null); // Leaflet map instance
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const layersRef = useRef<any>(null); // LayerGroup for dynamic content

    // History Playback State
    const [historyIndex, setHistoryIndex] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const statusColor = status === SystemStatus.CRITICAL ? 'rose' : status === SystemStatus.WARNING ? 'amber' : 'emerald';
    const StatusIcon = status === SystemStatus.CRITICAL ? AlertTriangle : status === SystemStatus.WARNING ? MapPin : ShieldCheck;

    // Clock & Greeting
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();

            const hour = now.getHours();
            if (hour < 11) setGreeting('上午好');
            else if (hour < 13) setGreeting('中午好');
            else if (hour < 18) setGreeting('下午好');
            else setGreeting('晚上好');
        };
        updateTime();
        const timer = setInterval(updateTime, 1000);
        return () => clearInterval(timer);
    }, []);

    // Generate Mock History Data (Path with Events)
    const historyData = useMemo(() => {
        const points = [];
        const center = [31.2235, 121.4453]; // Home
        const now = new Date();
        const startTime = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

        for (let i = 0; i <= 60; i++) {
            // Create a semi-realistic path (spiral outwards then back)
            const t = i / 10;
            const latOffset = (Math.sin(t) * 0.002) + (Math.random() * 0.0002);
            const lngOffset = (Math.cos(t * 1.3) * 0.002) + (Math.random() * 0.0002);

            let event = null;
            // Inject fake events
            if (i === 42) {
                event = { type: 'fall', title: '⚠️ 跌倒检测', desc: '检测到高G值冲击，姿态异常。' };
            } else if (i === 25) {
                event = { type: 'wandering', title: '🚶 异常徘徊', desc: '在此区域停留时间过长 (>10min)。' };
            }

            points.push({
                lat: center[0] + latOffset,
                lng: center[1] + lngOffset,
                time: new Date(startTime.getTime() + i * 60000),
                event
            });
        }
        return points;
    }, []);

    // Initialize history index to end
    useEffect(() => {
        setHistoryIndex(historyData.length - 1);
    }, [historyData]);

    // Playback Timer
    useEffect(() => {
        let interval: any;
        if (isPlaying) {
            interval = setInterval(() => {
                setHistoryIndex(prev => {
                    if (prev >= historyData.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 500); // Update every 500ms
        }
        return () => clearInterval(interval);
    }, [isPlaying, historyData.length]);


    // Initialize Map when Location Tab is active
    useEffect(() => {
        let isCancelled = false;

        const initMap = async () => {
            if (activeTab === 'location' && !isSettingsOpen && !mapRef.current) {
                // Wait for DOM to be ready
                await new Promise(r => setTimeout(r, 100));

                const homePos: [number, number] = [121.4453, 31.2235]; // Lng, Lat

                // 1. Create Map
                const map = await mapService.createMap('guardian-map-container', homePos);
                if (!map || isCancelled) return;

                mapRef.current = map;

                // 2. Add Static Geofence
                mapService.addCircle(map, homePos, 300, {
                    color: '#10b981',
                    fillColor: '#34d399',
                    dashArray: '5, 5'
                });

                // 3. Add Home Marker
                mapService.addMarker(map, homePos, undefined, "家庭住址 (安全中心)");

                // Initialize active layers array
                layersRef.current = [];
            }
        };

        if (activeTab === 'location' && !isSettingsOpen) {
            initMap();
        }

        return () => {
            isCancelled = true;
            if ((activeTab !== 'location' || isSettingsOpen) && mapRef.current) {
                if (mapRef.current.destroy) mapRef.current.destroy();
                mapRef.current = null;
                layersRef.current = null;
            }
        }
    }, [activeTab, isSettingsOpen]);

    // Update Map Layers based on historyIndex and Simulation
    useEffect(() => {
        if (activeTab === 'location' && !isSettingsOpen && mapRef.current) {
            // Clear dynamic layers
            if (layersRef.current && Array.isArray(layersRef.current)) {
                mapRef.current.remove(layersRef.current);
                layersRef.current = [];
            } else {
                layersRef.current = [];
            }

            const newOverlays: any[] = [];

            // 1. Draw Historical Path (Amap uses [lng, lat])
            const pastPoints = historyData.slice(0, historyIndex + 1).map(p => [p.lng, p.lat] as [number, number]);
            const futurePoints = historyData.slice(historyIndex).map(p => [p.lng, p.lat] as [number, number]);

            if (pastPoints.length > 0) {
                const poly = mapService.addPolyline(mapRef.current, pastPoints, { color: '#6366f1', weight: 6, opacity: 0.9 });
                if (poly) newOverlays.push(poly);
            }
            if (futurePoints.length > 0) {
                const poly = mapService.addPolyline(mapRef.current, futurePoints, { color: '#cbd5e1', weight: 4, opacity: 0.5, dashArray: '10, 10' });
                if (poly) newOverlays.push(poly);
            }

            // 2. Draw Historical Events (Markers)
            historyData.forEach((pt, idx) => {
                if (pt.event && idx <= historyIndex) {
                    const isFall = pt.event.type === 'fall';
                    const color = isFall ? '#e11d48' : '#f59e0b';

                    const marker = mapService.addMarker(mapRef.current, [pt.lng, pt.lat],
                        `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 3px 6px rgba(0,0,0,0.3);color:white;text-align:center;line-height:20px;font-weight:bold;font-size:14px;">${isFall ? '!' : '?'}</div>`,
                        pt.event.title
                    );
                    if (marker) newOverlays.push(marker);
                }
            });

            // 3. Draw Current User Position
            const currentPt = historyData[historyIndex];
            if (currentPt) {
                const userMarker = mapService.addMarker(mapRef.current, [currentPt.lng, currentPt.lat],
                    `<div style="background:#4f46e5;width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 6px rgba(79, 70, 229, 0.2);"></div>`
                );
                if (userMarker) {
                    newOverlays.push(userMarker);
                }
            }

            layersRef.current = newOverlays;
        }
    }, [activeTab, isSettingsOpen, historyIndex, historyData]);



    // --- Sub-Components ---

    const SettingsView = () => {
        // Voice Clone State
        const [cloneStep, setCloneStep] = useState<'idle' | 'recording' | 'processing' | 'done'>('idle');
        const [voiceProgress, setVoiceProgress] = useState(0);

        // 3D Avatar Generation State
        const [avatarStep, setAvatarStep] = useState<'idle' | 'uploading' | 'scanning' | 'rigging' | 'rendering' | 'done'>('idle');
        const [avatarProgress, setAvatarProgress] = useState(0);
        const [generatedAvatarUrl, setGeneratedAvatarUrl] = useState<string | null>(null);

        // Use the Service Layer
        const handleStartVoiceClone = async () => {
            setCloneStep('recording');

            // Simulate recording time (In real app, use MediaRecorder API here)
            setTimeout(async () => {
                setCloneStep('processing');

                // Call API Service
                // Create a dummy blob for now
                const dummyBlob = new Blob([""], { type: "audio/wav" });

                try {
                    // Initiate cloning
                    const result = await VoiceService.cloneVoice(dummyBlob, "Grandpa's Voice");

                    // Simulate progress bar based on status
                    let p = 0;
                    const interval = setInterval(() => {
                        p += 10;
                        if (p > 100) {
                            clearInterval(interval);
                            setCloneStep('done');
                        } else {
                            setVoiceProgress(p);
                        }
                    }, 200);
                } catch (e) {
                    console.error("Voice cloning failed", e);
                    setCloneStep('idle');
                }
            }, 2000);
        };

        const handleCreateAvatar = async () => {
            setAvatarStep('uploading');

            // Call API Service
            // Create dummy file
            const dummyFile = new File([""], "photo.jpg", { type: "image/jpeg" });

            try {
                // 1. Uploading
                setTimeout(() => setAvatarStep('scanning'), 1000);

                // 2. Call Service (This is async)
                const result = await AvatarService.generateAvatar(dummyFile);

                // 3. Update UI steps to show "process"
                setTimeout(() => setAvatarStep('rigging'), 2500);
                setTimeout(() => setAvatarStep('rendering'), 4000);

                // 4. Finish
                setTimeout(() => {
                    setAvatarStep('done');
                    setGeneratedAvatarUrl(result.meshUrl); // In a real app, you'd load this GLB into a viewer
                }, 5500);

            } catch (e) {
                console.error("Avatar generation failed", e);
                setAvatarStep('idle');
            }
        };

        return (
            <div className="flex flex-col h-full bg-[#F8FAFC] animate-fade-in-up">
                {/* Settings Header */}
                <div className="px-5 py-4 flex items-center justify-between sticky top-0 z-10 bg-[#F8FAFC]/90 backdrop-blur-sm">
                    <button
                        onClick={() => setIsSettingsOpen(false)}
                        className="p-2 -ml-2 text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className="text-lg font-bold text-slate-800">系统设置</h2>
                    <div className="w-8"></div>
                </div>

                <div className="p-5 space-y-6 pb-20">

                    {/* 1. AIGC Digital Twin Factory (New Feature) */}
                    <div className="bg-black rounded-[2rem] p-1 shadow-xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 animate-pulse"></div>
                        <div className="bg-slate-900 rounded-[1.8rem] p-5 relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                        <Box size={18} className="text-violet-400" /> AIGC 数字孪生工坊
                                    </h3>
                                    <p className="text-slate-400 text-[10px] mt-1">Unity 引擎渲染 · 高保真 3D 建模</p>
                                </div>
                                <div className="bg-violet-500/10 border border-violet-500/30 px-2 py-1 rounded-md text-violet-300 text-[10px] font-mono">BETA</div>
                            </div>

                            {avatarStep === 'idle' && (
                                <div
                                    onClick={handleCreateAvatar}
                                    className="border-2 border-dashed border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 hover:bg-slate-800 transition-all"
                                >
                                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-2">
                                        <Upload size={20} className="text-slate-400" />
                                    </div>
                                    <p className="text-slate-300 text-sm font-medium">上传正面照片</p>
                                    <p className="text-slate-500 text-[10px]">支持 JPG/PNG, 建议光线充足</p>
                                </div>
                            )}

                            {(avatarStep !== 'idle' && avatarStep !== 'done') && (
                                <div className="space-y-4 py-4">
                                    <div className="flex justify-center">
                                        <div className="w-24 h-24 rounded-full border-4 border-violet-500/30 border-t-violet-500 animate-spin relative flex items-center justify-center">
                                            <ScanFace size={32} className="text-violet-400 animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-violet-300 font-mono">
                                            <span>
                                                {avatarStep === 'uploading' && '>>> 上传云端节点...'}
                                                {avatarStep === 'scanning' && '>>> 生成面部网格 (Mesh)...'}
                                                {avatarStep === 'rigging' && '>>> 绑定骨骼系统 (Rigging)...'}
                                                {avatarStep === 'rendering' && '>>> 编译纹理材质 (Shader)...'}
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-violet-500 animate-progress-indeterminate"></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {avatarStep === 'done' && (
                                <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
                                    <div className="aspect-video bg-gradient-to-b from-slate-700 to-slate-900 flex items-center justify-center relative">
                                        {/* Mock 3D Model View */}
                                        <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=400&auto=format&fit=crop" className="w-16 h-16 rounded-full border-2 border-white/50 object-cover z-10" />
                                        <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-10">
                                            {Array.from({ length: 24 }).map((_, i) => <div key={i} className="border border-green-500/50"></div>)}
                                        </div>
                                        <div className="absolute bottom-2 right-2 flex gap-1">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                            <span className="text-[8px] text-green-500 font-mono">LIVE PREVIEW</span>
                                        </div>
                                    </div>
                                    <div className="p-3 flex justify-between items-center">
                                        <div className="text-xs text-slate-300">
                                            <p className="font-bold">模型生成成功</p>
                                            <p className="text-[10px] text-slate-500">面数: 12,400 | 骨骼: Standard_Humanoid</p>
                                        </div>
                                        <button className="px-3 py-1.5 bg-violet-600 text-white text-xs rounded-lg font-bold">应用模型</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Voice Clone Feature Card */}
                    <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-3xl"></div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md border border-white/20">
                                <Mic size={20} className="text-yellow-300" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg leading-tight">AI 语音克隆</h3>
                                <p className="text-[10px] text-indigo-100 opacity-80">Powered by Gemini Nano</p>
                            </div>
                        </div>

                        <p className="text-sm text-indigo-50 leading-relaxed mb-6 opacity-90">
                            只需录制 10 秒语音，AI 即可学习您的声线。
                        </p>

                        {cloneStep === 'idle' && (
                            <div className="bg-white/10 rounded-xl p-1 backdrop-blur-sm border border-white/20 flex">
                                <button
                                    onClick={handleStartVoiceClone}
                                    className="flex-1 bg-white text-indigo-600 py-3 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                >
                                    <Mic size={16} /> 开始录制样本
                                </button>
                            </div>
                        )}

                        {cloneStep === 'recording' && (
                            <div className="flex flex-col items-center justify-center py-2">
                                <div className="flex gap-1 h-8 items-center mb-2">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="w-1.5 bg-white rounded-full animate-talk" style={{ height: Math.random() * 20 + 10 + 'px', animationDelay: i * 0.1 + 's' }}></div>
                                    ))}
                                </div>
                                <p className="text-xs font-mono animate-pulse">正在采集声音样本...</p>
                            </div>
                        )}

                        {cloneStep === 'processing' && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-medium opacity-80">
                                    <span>构建声纹模型</span>
                                    <span>{voiceProgress}%</span>
                                </div>
                                <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-white rounded-full transition-all duration-150" style={{ width: `${voiceProgress}%` }}></div>
                                </div>
                            </div>
                        )}

                        {cloneStep === 'done' && (
                            <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-xl p-3 flex flex-col gap-3 animate-fade-in">
                                <div className="flex items-center gap-2 text-emerald-100 text-sm font-bold">
                                    <CheckCircle size={16} className="text-emerald-300" />
                                    模型训练完成
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="bg-white/10 hover:bg-white/20 text-white text-xs py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5">
                                        <Play size={12} /> 试听效果
                                    </button>
                                    <button className="bg-white text-emerald-600 text-xs py-2 rounded-lg font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                                        <Volume2 size={12} /> 发送问候
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* General Settings */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">通用设置</h4>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
                                    <AlertCircle size={20} />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800 text-sm">跌倒自动报警</p>
                                </div>
                            </div>
                            <ToggleRight size={28} className="text-indigo-600" />
                        </div>
                    </div>

                    <button className="w-full py-4 text-center text-rose-500 text-sm font-bold bg-rose-50 rounded-2xl border border-rose-100 hover:bg-rose-100 transition-colors">
                        退出登录
                    </button>
                </div>
                <style>{`
                .animate-progress-indeterminate { animation: progressIndeterminate 1.5s infinite linear; }
                @keyframes progressIndeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
            `}</style>
            </div>
        );
    };

    const OverviewTab = () => (
        <div className="flex flex-col gap-6 pb-28 p-5 animate-fade-in-up">
            {/* Header Section */}
            <div className="flex justify-between items-end px-1 mt-2">
                <div>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Sun size={12} className="text-amber-500" /> Oct 24, Thursday
                    </p>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{greeting}, <span className="text-indigo-600">李先生</span></h2>
                </div>
                <div className="bg-white p-1 rounded-full shadow-sm border border-slate-100 cursor-pointer hover:scale-105 transition-transform">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full overflow-hidden flex items-center justify-center">
                        <User className="text-indigo-500" size={20} />
                    </div>
                </div>
            </div>

            {/* Hero Status Card (Premium Gradient) */}
            <div className={`relative overflow-hidden rounded-[2.5rem] p-8 shadow-xl transition-all duration-500 group ${status === SystemStatus.CRITICAL ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-200' :
                status === SystemStatus.WARNING ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-200' :
                    'bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#d946ef] shadow-indigo-200'
                }`}>
                {/* Abstract Background Shapes */}
                <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000"></div>
                <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-48 h-48 bg-black opacity-10 rounded-full blur-3xl"></div>

                <div className="relative z-10 flex flex-col items-center text-center text-white">
                    <div className={`w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-5 border border-white/30 ${status === SystemStatus.CRITICAL ? 'animate-ping-slow' : 'shadow-[0_0_40px_rgba(255,255,255,0.3)]'}`}>
                        <StatusIcon size={36} strokeWidth={1.5} className="drop-shadow-lg" />
                    </div>
                    <h3 className="text-3xl font-bold tracking-tight mb-2">
                        {status === SystemStatus.NORMAL ? 'AI 实时守护中' : status === SystemStatus.WARNING ? '位置异常提醒' : '紧急跌倒警报'}
                    </h3>
                    <p className="text-white/90 text-sm font-medium mb-8 max-w-[240px] leading-relaxed opacity-90">
                        {status === SystemStatus.NORMAL ? '系统运行正常。所有生命体征监测指标均在安全范围内。' : status === SystemStatus.WARNING ? '检测到用户离开了常驻安全区域，建议确认位置。' : '检测到剧烈撞击或跌倒，正在尝试联系紧急联系人。'}
                    </p>

                    {/* Glass Stats Pills */}
                    <div className="grid grid-cols-2 gap-3 w-full">
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col items-center hover:bg-white/20 transition-colors cursor-pointer">
                            <span className="text-[10px] text-white/70 uppercase font-bold tracking-wider mb-0.5">安全评分</span>
                            <span className="text-xl font-bold">98</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col items-center hover:bg-white/20 transition-colors cursor-pointer">
                            <span className="text-[10px] text-white/70 uppercase font-bold tracking-wider mb-0.5">设备电量</span>
                            <span className="text-xl font-bold flex items-center gap-1"><Battery size={14} className="fill-white" /> 84%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bento Grid Stats */}
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="font-bold text-slate-800 text-lg">健康快照</h3>
                    <button className="text-xs font-bold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors">详细报表</button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Heart Rate Card */}
                    <div className="bg-white p-5 rounded-[2rem] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] border border-slate-50 relative overflow-hidden group hover:shadow-lg transition-all active:scale-95" onClick={() => setActiveTab('health')}>
                        <div className="flex justify-between items-start mb-2 relative z-20">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">平均心率</span>
                            <div className="bg-rose-50 p-2 rounded-full text-rose-500">
                                <Heart size={16} fill="currentColor" />
                            </div>
                        </div>
                        <div className="relative z-20">
                            <p className="text-3xl font-bold text-slate-800">75 <span className="text-xs text-slate-400 font-medium uppercase">bpm</span></p>
                        </div>
                        {/* Decorative Chart Line */}
                        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-30 group-hover:scale-110 transition-transform origin-bottom text-rose-500 z-10 pointer-events-none">
                            <svg viewBox="0 0 100 40" className="w-full h-full fill-rose-50 stroke-current" preserveAspectRatio="none">
                                <path d="M0,35 Q10,35 15,25 T30,35 T45,15 T60,35 T75,30 T90,35 L100,35 L100,50 L0,50 Z" strokeWidth="2" />
                            </svg>
                        </div>
                    </div>

                    {/* Sleep Card */}
                    <div className="bg-white p-5 rounded-[2rem] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] border border-slate-50 relative overflow-hidden group hover:shadow-lg transition-all active:scale-95" onClick={() => setActiveTab('health')}>
                        <div className="flex justify-between items-start mb-2 relative z-20">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">昨日睡眠</span>
                            <div className="bg-indigo-50 p-2 rounded-full text-indigo-500">
                                <Moon size={16} fill="currentColor" />
                            </div>
                        </div>
                        <div className="relative z-20 mb-3">
                            <p className="text-3xl font-bold text-slate-800">8.2<span className="text-sm text-slate-400 font-medium ml-1">h</span></p>
                        </div>
                        {/* Simple Progress Bar */}
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative z-20">
                            <div className="w-[85%] h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full"></div>
                        </div>
                    </div>

                    {/* Activity / Steps Card (Dark Mode Contrast) */}
                    <div className="col-span-2 bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl shadow-slate-200 relative overflow-hidden flex items-center justify-between group cursor-pointer hover:bg-slate-800 transition-colors">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-3 text-slate-400">
                                <div className="p-1.5 bg-white/10 rounded-lg">
                                    <Footprints size={14} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider">今日步数</span>
                            </div>
                            <p className="text-4xl font-bold tracking-tight">3,240 <span className="text-lg text-slate-600 font-medium">/ 5000</span></p>
                        </div>

                        {/* Ring Chart Simulation */}
                        <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                            <svg className="w-full h-full rotate-[-90deg]">
                                <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
                                <circle cx="48" cy="48" r="40" stroke="#818cf8" strokeWidth="8" fill="none" strokeDasharray="251" strokeDashoffset="90" strokeLinecap="round" className="group-hover:stroke-indigo-400 transition-colors" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-bold text-sm">64%</span>
                                <span className="text-[8px] text-slate-400 uppercase">Goal</span>
                            </div>
                        </div>

                        {/* Decorative Blob */}
                        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500 opacity-20 blur-3xl rounded-full"></div>
                    </div>
                </div>
            </div>

            {/* Location Widget */}
            <div className="bg-white rounded-[2.5rem] p-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] border border-slate-100 cursor-pointer group" onClick={() => setActiveTab('location')}>
                <div className="relative h-44 bg-slate-100 rounded-[2rem] overflow-hidden">
                    {/* Map BG Pattern */}
                    <div className="absolute inset-0 opacity-60">
                        <svg width="100%" height="100%">
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                            </pattern>
                            <rect width="100%" height="100%" fill="url(#grid)" />
                        </svg>
                        <path d="M-10,80 Q50,60 100,80 T200,50 T300,80" fill="none" stroke="white" strokeWidth="12" />
                        <path d="M-10,80 Q50,60 100,80 T200,50 T300,80" fill="none" stroke="#cbd5e1" strokeWidth="6" strokeDasharray="8,8" />
                    </div>

                    {/* Radar Pulse Effect */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <div className="w-40 h-40 bg-indigo-500/10 rounded-full animate-ping opacity-75"></div>
                        <div className="absolute inset-0 w-40 h-40 bg-indigo-500/5 rounded-full animate-pulse delay-75"></div>
                        <div className="absolute top-1/2 left-1/2 w-5 h-5 bg-white border-[3px] border-indigo-600 rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-10"></div>
                    </div>

                    {/* Floating Status Badge */}
                    <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-sm text-xs font-bold text-slate-700 flex items-center gap-2 border border-white/50">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${status === SystemStatus.WARNING ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                        {simulation === SimulationType.WANDERING ? '离家 1.2km (异常)' : '在家中 (安全)'}
                    </div>
                </div>

                <div className="px-5 py-4 flex justify-between items-center">
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <MapPin size={16} className="text-indigo-500" /> 实时位置追踪
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5 ml-6">GPS Signal Strong · Battery 84%</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                        <ChevronRight size={20} />
                    </div>
                </div>
            </div>
        </div>
    );

    const HealthTab = () => (
        <div className="flex flex-col gap-6 p-4 pb-24 animate-fade-in-up">
            <h2 className="text-xl font-bold text-slate-800 px-1">健康生命体征</h2>

            {/* Heart Rate Card (Large) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-72">
                <h3 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2"><Heart className="text-rose-500" size={18} /> 24小时心率趋势</h3>
                <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mockHeartRateData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval={3} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[60, 100]} width={25} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Line type="monotone" dataKey="bpm" stroke="#f43f5e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* BP Card (Large) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-64">
                <h3 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2"><Activity className="text-indigo-500" size={18} /> 血压波动 (mmHg)</h3>
                <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mockHeartRateData.filter((_, i) => i % 4 === 0)}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[100, 140]} />
                            <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                            <Bar dataKey="pressure" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={16} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Sleep Card (Restored Circular Score) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-base font-bold text-slate-700">睡眠质量分析</h3>
                        <p className="text-sm text-slate-500 mt-1">昨日睡眠 <span className="font-bold text-slate-800">8小时 12分</span></p>
                    </div>
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-500 flex items-center justify-center bg-indigo-50 text-indigo-700 font-bold text-lg">
                        88
                    </div>
                </div>

                <div className="space-y-3 mt-2">
                    {mockSleepData.map((d) => (
                        <div key={d.name} className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }}></div>
                            <span className="text-sm text-slate-600 w-12">{d.name}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(d.hours / 8) * 100}%`, backgroundColor: d.fill }}></div>
                            </div>
                            <span className="text-sm font-bold text-slate-700">{d.hours}h</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const LocationTab = () => (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Map Half */}
            <div className="h-[55%] w-full relative group">
                <div id="guardian-map-container" ref={mapContainerRef} className="w-full h-full z-0 bg-slate-200"></div>

                {/* Controls */}
                <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-sm border border-slate-200">
                    <div className="text-[10px] space-y-1 text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> 电子围栏
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> 实时位置
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div> 历史轨迹
                        </div>
                    </div>
                </div>

                {/* Timeline Slider Overlay */}
                <div className="absolute bottom-4 left-4 right-4 z-[400] bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-lg border border-slate-200/60">
                    <div className="flex items-center gap-3 mb-1">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-md transition-colors"
                        >
                            {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                        </button>

                        <div className="flex-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                <span className="text-indigo-600">
                                    {historyData[historyIndex]?.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                {historyIndex === historyData.length - 1 && <span className="px-1 py-0.5 bg-red-100 text-red-600 rounded text-[9px]">LIVE</span>}
                            </div>
                            <input
                                type="range"
                                min="0"
                                max={historyData.length - 1}
                                value={historyIndex}
                                onChange={(e) => {
                                    setHistoryIndex(Number(e.target.value));
                                    setIsPlaying(false);
                                }}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Half (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4">
                {/* Location Card */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MapPin size={14} /> 地理编码解析
                    </h3>
                    <div className="mb-3">
                        <p className="text-lg font-bold text-slate-800 leading-tight">
                            {simulation === SimulationType.WANDERING ? '上海市 静安区 华山路' : '上海市 静安区 幸福小区'}
                        </p>
                        <p className="text-xs text-slate-500 font-mono mt-1">
                            Lat: {historyData[historyIndex]?.lat.toFixed(4)}, Long: {historyData[historyIndex]?.lng.toFixed(4)}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 p-2 rounded-xl text-center">
                            <p className="text-[10px] text-slate-400">海拔</p>
                            <p className="font-bold text-slate-700">12m</p>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl text-center">
                            <p className="text-[10px] text-slate-400">移动速度</p>
                            <p className="font-bold text-slate-700">{isPlaying ? '4.2 km/h' : '0 km/h'}</p>
                        </div>
                    </div>
                </div>

                {/* Multimodal Card */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Brain size={14} /> 多模态环境感知
                    </h3>

                    <div className="w-full h-32 bg-slate-100 rounded-xl overflow-hidden mb-3 relative group">
                        <img
                            src={simulation === SimulationType.WANDERING
                                ? "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=600&auto=format&fit=crop"
                                : "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?q=80&w=600&auto=format&fit=crop"
                            }
                            alt="View"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1">
                            <Eye size={10} /> 视觉模态
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <div className="w-1 bg-indigo-500 rounded-full shrink-0"></div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold mb-1">环境语义分析 (Gemini)</p>
                            <p className="text-sm text-slate-700 leading-relaxed">
                                {simulation === SimulationType.WANDERING
                                    ? "检测到用户处于繁忙十字路口附近。视觉分析显示车流量较大。建议立即介入。"
                                    : "用户处于熟悉的家庭环境中。光照充足，地面无障碍物。环境安全评级：优。"
                                }
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const MedicationTab = () => (
        <div className="flex flex-col gap-5 p-5 pb-24 animate-fade-in-up">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold text-slate-800">用药管理</h2>
                <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200">
                    + 添加药物
                </button>
            </div>

            <div className="space-y-4">
                {/* Item 1 */}
                <div className="flex items-center p-4 border border-slate-100 rounded-2xl bg-slate-50 opacity-60">
                    <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center mr-4">
                        <ShieldCheck className="text-slate-500" size={20} />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-slate-700 line-through">阿司匹林肠溶片</h4>
                        <p className="text-sm text-slate-500">100mg · 每日一次 · 饭后</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded">已服用</p>
                        <p className="text-xs text-slate-400 mt-1">08:05 AM</p>
                    </div>
                </div>

                {/* Item 2 */}
                <div className="flex items-center p-4 border border-indigo-100 rounded-2xl bg-indigo-50/50">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mr-4">
                        <Clock className="text-indigo-600" size={20} />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-slate-800">维生素 D 滴剂</h4>
                        <p className="text-sm text-slate-500">400IU · 随餐服用</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded">即将</p>
                        <p className="text-xs text-slate-500 mt-1">12:30 PM</p>
                    </div>
                </div>

                {/* Item 3 */}
                <div className="flex items-center p-4 border border-slate-100 rounded-2xl">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mr-4">
                        <Clock className="text-slate-400" size={20} />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-slate-800">二甲双胍缓释片</h4>
                        <p className="text-sm text-slate-500">0.5g · 每日两次</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">待定</p>
                        <p className="text-xs text-slate-400 mt-1">06:00 PM</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const LogsTab = () => (
        <div className="flex flex-col h-full bg-slate-50 animate-fade-in-up">
            <div className="p-6 border-b border-slate-100 bg-white">
                <h2 className="text-xl font-bold text-slate-800">系统事件日志</h2>
            </div>
            <div className="flex-1 overflow-auto pb-24">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 sticky top-0 text-slate-500">
                        <tr>
                            <th className="p-4 font-semibold">时间</th>
                            <th className="p-4 font-semibold">模块</th>
                            <th className="p-4 font-semibold">内容</th>
                            <th className="p-4 font-semibold text-right">状态</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-slate-400 font-mono whitespace-nowrap">{log.timestamp.split(':').slice(0, 2).join(':')}</td>
                                <td className="p-4 font-bold text-slate-700">{log.module}</td>
                                <td className="p-4 text-slate-600 line-clamp-2">{log.message}</td>
                                <td className="p-4 text-right">
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${log.level === 'error' ? 'bg-rose-100 text-rose-600' :
                                        log.level === 'warn' ? 'bg-amber-100 text-amber-600' :
                                            'bg-emerald-100 text-emerald-600'
                                        }`}>
                                        {log.level.toUpperCase()}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // --- Main Render ---

    return (
        <div className="flex items-center justify-center h-full py-8">
            {/* Phone Frame */}
            <div className="relative w-[360px] h-[720px] bg-black rounded-[3rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border-[8px] border-slate-800 overflow-hidden ring-1 ring-slate-900/5 select-none flex flex-col">

                {/* Main Content Area - Updated: Removed Status Bar, Added pt-8 to clear corners */}
                <div className="flex-1 bg-[#F8FAFC] overflow-y-auto no-scrollbar relative pt-8">

                    {isSettingsOpen ? (
                        <SettingsView />
                    ) : (
                        <>
                            {/* Scrollable Header */}
                            <div className="px-5 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-md">
                                        <Activity size={18} className="text-white" />
                                    </div>
                                    <span className="text-lg font-bold text-slate-800 tracking-tight">EmoBit <span className="text-slate-400 font-normal">· 忆守</span></span>
                                </div>
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="p-2 bg-white text-slate-400 hover:text-indigo-600 rounded-full shadow-sm border border-slate-50 transition-colors"
                                >
                                    <Settings size={18} />
                                </button>
                            </div>

                            {activeTab === 'overview' && <OverviewTab />}
                            {activeTab === 'health' && <HealthTab />}
                            {activeTab === 'location' && <LocationTab />}
                            {activeTab === 'medication' && <MedicationTab />}
                            {activeTab === 'logs' && <LogsTab />}
                        </>
                    )}
                </div>

                {/* Bottom Navigation Bar - Hide when in Settings */}
                {!isSettingsOpen && (
                    <div className="absolute bottom-0 w-full h-20 bg-white/95 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around pb-4 z-50 shadow-[0_-5px_30px_rgba(0,0,0,0.03)]">
                        {[
                            { id: 'overview', label: '总览', icon: LayoutGrid },
                            { id: 'health', label: '健康', icon: Heart },
                            { id: 'location', label: '定位', icon: MapPin },
                            { id: 'medication', label: '用药', icon: Pill },
                            { id: 'logs', label: '日志', icon: FileText },
                        ].map((item) => {
                            const isActive = activeTab === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id as DashboardTab)}
                                    className={`flex flex-col items-center gap-1.5 w-12 transition-all duration-300 group ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}
                                >
                                    <div className={`p-2 rounded-2xl transition-all duration-300 ${isActive ? 'bg-indigo-50 -translate-y-1 shadow-sm' : 'group-hover:bg-slate-50'}`}>
                                        <item.icon size={22} className={isActive ? 'fill-indigo-600/20' : ''} strokeWidth={isActive ? 2.5 : 2} />
                                    </div>
                                    <span className={`text-[10px] font-bold transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-0 h-0'}`}>{item.label}</span>
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Overlay for Critical Alerts */}
                {status === SystemStatus.CRITICAL && !isSettingsOpen && (
                    <div className="absolute top-16 left-0 right-0 bg-rose-600 text-white text-xs font-bold px-4 py-2 flex items-center justify-between animate-pulse z-40 shadow-lg">
                        <span className="flex items-center gap-2"><AlertTriangle size={14} fill="white" /> 紧急警报触发</span>
                        <button className="bg-white/20 px-3 py-1 rounded-full text-[10px]">立即处理 &gt;</button>
                    </div>
                )}
            </div>

            <style>{`
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            .animate-fade-in-up { animation: fadeInUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .animate-ping-slow { animation: pingSlow 3s infinite; }
            .animate-talk { animation: talk 0.5s ease-in-out infinite alternate; }
            @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes pingSlow { 0% { transform: scale(1); opacity: 1; } 75%, 100% { transform: scale(1.5); opacity: 0; } }
            @keyframes talk { from { height: 10px; } to { height: 30px; } }
        `}</style>
        </div>
    );
};

export default Dashboard;
