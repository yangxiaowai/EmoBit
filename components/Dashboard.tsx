
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SimulationType, SystemStatus, LogEntry, DashboardTab } from '../types';
import AvatarStatus3D from './AvatarStatus3D';
import { VoiceService, AvatarService } from '../services/api';
import { aiService } from '../services/aiService';
import { voiceSelectionService } from '../services/voiceSelectionService';
import { blobToWav, getAudioDurationSeconds } from '../utils/audioUtils';
import { healthStateService, HealthMetrics } from '../services/healthStateService';
import { mapService } from '../services/mapService';
import { medicationService, Medication } from '../services/medicationService';
import { faceService, FaceData } from '../services/faceService';
import { ALBUM_MEMORIES } from '../config/albumMemories';
import { FACE_RECOGNITION_CONFIG } from '../config/faceRecognition';
import { ShieldCheck, MapPin, Heart, Pill, AlertTriangle, Phone, Activity, Clock, User, Calendar, LayoutGrid, FileText, Settings, ChevronRight, Eye, Brain, Layers, Play, Pause, SkipBack, SkipForward, History, AlertCircle, Signal, Wifi, Battery, Moon, Footprints, Sun, Cloud, ArrowLeft, Mic, Upload, Sparkles, CheckCircle, Volume2, ToggleRight, Loader2, ScanFace, Box, Wand2, Plus, X, Users, Camera } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, AreaChart, Area, BarChart, Bar, CartesianGrid } from 'recharts';
import ReactMarkdown from 'react-markdown';

interface DashboardProps {
    status: SystemStatus;
    simulation: SimulationType;
    logs: LogEntry[];
}

/** 定位 Tab 内容：独立组件保证引用稳定，避免父组件重渲染时卸载导致地图容器被销毁 */
interface LocationTabContentProps {
    mapContainerRef: React.RefObject<HTMLDivElement | null>;
    historyData: { lat: number; lng: number; time: Date; event?: { type: string; title: string; desc?: string } }[];
    historyIndex: number;
    setHistoryIndex: (v: number | ((prev: number) => number)) => void;
    isPlaying: boolean;
    setIsPlaying: (v: boolean) => void;
    trajectoryLoading: boolean;
    simulateNormalPath: () => void;
    simulateLostPath: () => void;
    resetToCurrentLocation: () => void;
    playbackIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
    POINT_INTERVAL_SEC: number;
    simulation: SimulationType;
    displayAddress: string;
    addressLoading?: boolean;
    /** 经纬度文案：有轨迹时为当前点，无轨迹时为预设模拟位置（与紫色点一致） */
    latLngText: string;
    /** 当前位置相关照片：多模态环境感知（不显示地图），与当前地址/POI 关联 */
    locationPhotoItems: { url: string; caption?: string }[];
    /** 是否使用 JS API 交互地图（可缩放、平移）；null=尚未尝试，true=使用 JS 地图，false=使用静态图 */
    useJsMap: boolean | null;
    /** 上方静态地图图片 URL（高德 Web 服务，仅 useJsMap=false 时显示） */
    topMapStaticUrl: string;
    /** 静态图中心（与 topMapStaticUrl 一致），用于叠加层坐标转换 */
    staticMapCenter: { lng: number; lat: number };
    /** 安全中心（电子围栏圆心）[lng, lat] */
    homePos: [number, number];
    /** 电子围栏半径（度，约 100m） */
    geofenceRadiusDeg: number;
    /** 环境语义分析（Groq）：老人周边安全与地理位置描述 */
    environmentAnalysis: string;
    environmentAnalysisLoading?: boolean;
}

const LocationTabContent: React.FC<LocationTabContentProps> = ({
    mapContainerRef,
    historyData,
    historyIndex,
    setHistoryIndex,
    isPlaying,
    setIsPlaying,
    trajectoryLoading,
    simulateNormalPath,
    simulateLostPath,
    resetToCurrentLocation,
    playbackIntervalRef,
    POINT_INTERVAL_SEC,
    simulation,
    displayAddress,
    addressLoading = false,
    latLngText,
    locationPhotoItems,
    useJsMap,
    topMapStaticUrl,
    staticMapCenter,
    homePos,
    geofenceRadiusDeg,
    environmentAnalysis,
    environmentAnalysisLoading = false,
}) => {
    const STATIC_MAP_ZOOM = 16;
    const STATIC_MAP_W = 800;
    const STATIC_MAP_H = 400;
    const toPx = (lng: number, lat: number) =>
        mapService.latLngToStaticMapPx(lng, lat, staticMapCenter.lng, staticMapCenter.lat, STATIC_MAP_ZOOM, STATIC_MAP_W, STATIC_MAP_H);
    const currentPos = historyData.length > 0 && historyData[historyIndex]
        ? { lng: historyData[historyIndex].lng, lat: historyData[historyIndex].lat }
        : { lng: homePos[0] + 0.00025, lat: homePos[1] + 0.0002 };
    const homePx = toPx(homePos[0], homePos[1]);
    const radiusPx = Math.abs(toPx(homePos[0], homePos[1] + geofenceRadiusDeg).y - homePx.y);
    const pastPath = historyData.length > 0 && historyIndex >= 0
        ? historyData.slice(0, historyIndex + 1).map((p) => toPx(p.lng, p.lat))
        : [];
    const futurePath = historyData.length > 0 && historyIndex < historyData.length - 1
        ? historyData.slice(historyIndex).map((p) => toPx(p.lng, p.lat))
        : [];
    const currentPx = toPx(currentPos.lng, currentPos.lat);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="h-[55%] w-full relative group">
                <div id="guardian-map-container" ref={mapContainerRef} className="w-full h-full min-h-[280px] z-0 bg-slate-200 overflow-hidden relative">
                    {useJsMap === false && topMapStaticUrl ? (
                        <>
                            <img src={topMapStaticUrl} alt="当前位置地图" className="w-full h-full min-h-[280px] object-cover object-center" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ aspectRatio: `${STATIC_MAP_W}/${STATIC_MAP_H}` }}>
                                <svg className="w-full h-full" viewBox={`0 0 ${STATIC_MAP_W} ${STATIC_MAP_H}`} preserveAspectRatio="xMidYMid slice">
                                    {/* 电子围栏（绿色虚线圆） */}
                                    <circle cx={homePx.x} cy={homePx.y} r={radiusPx} fill="#34d399" fillOpacity="0.15" stroke="#10b981" strokeWidth="2" strokeDasharray="5 5" />
                                    {/* 历史轨迹（已走过） */}
                                    {pastPath.length >= 2 && (
                                        <polyline points={pastPath.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                                    )}
                                    {/* 历史轨迹（未走） */}
                                    {futurePath.length >= 2 && (
                                        <polyline points={futurePath.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" />
                                    )}
                                    {/* 当前位置点 */}
                                    <circle cx={currentPx.x} cy={currentPx.y} r="10" fill="#6366f1" stroke="white" strokeWidth="3" />
                                    <circle cx={currentPx.x} cy={currentPx.y} r="16" fill="none" stroke="#6366f1" strokeWidth="2" opacity="0.5" />
                                </svg>
                            </div>
                        </>
                    ) : null}
                </div>
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
                <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
                    <button
                        onClick={simulateNormalPath}
                        disabled={trajectoryLoading}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-[10px] font-bold rounded-lg shadow-sm active:scale-95 transition-all text-left"
                    >
                        {trajectoryLoading ? '生成中…' : '🏠 模拟: 正常轨迹 (12h)'}
                    </button>
                    <button
                        onClick={simulateLostPath}
                        disabled={trajectoryLoading}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[10px] font-bold rounded-lg shadow-sm active:scale-95 transition-all text-left"
                    >
                        {trajectoryLoading ? '生成中…' : '⚠️ 模拟: 疑似走失 (12h)'}
                    </button>
                    <button
                        onClick={resetToCurrentLocation}
                        disabled={historyData.length === 0}
                        className="px-3 py-1.5 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg shadow-sm active:scale-95 transition-all text-left flex items-center gap-1"
                    >
                        <ArrowLeft size={12} /> 返回当前位置
                    </button>
                </div>
                <div className="absolute bottom-4 left-4 right-4 z-[400] bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-lg border border-slate-200/60">
                    <div className="flex items-center gap-3 mb-1">
                        <button
                            type="button"
                            onClick={() => {
                                if (historyData.length === 0) return;
                                if (isPlaying && playbackIntervalRef.current) {
                                    clearInterval(playbackIntervalRef.current);
                                    playbackIntervalRef.current = null;
                                }
                                setIsPlaying(!isPlaying);
                            }}
                            disabled={historyData.length === 0}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-md transition-colors"
                        >
                            {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <div className="flex-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                                <span className="text-slate-400">
                                    {historyData.length > 0 ? historyData[0].time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
                                </span>
                                <span className="text-indigo-600">
                                    {historyData.length > 0 && historyData[historyIndex]
                                        ? historyData[historyIndex].time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                        : '--'}
                                </span>
                                {historyData.length > 0 && historyIndex === historyData.length - 1 && (
                                    <span className="px-1 py-0.5 bg-red-100 text-red-600 rounded text-[9px]">LIVE</span>
                                )}
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0, historyData.length - 1)}
                                value={historyData.length ? Math.min(historyIndex, historyData.length - 1) : 0}
                                onChange={(e) => {
                                    if (playbackIntervalRef.current) {
                                        clearInterval(playbackIntervalRef.current);
                                        playbackIntervalRef.current = null;
                                    }
                                    setIsPlaying(false);
                                    setHistoryIndex(Number(e.target.value));
                                }}
                                disabled={historyData.length === 0}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50"
                            />
                            {historyData.length > 0 && (
                                <p className="text-[9px] text-slate-400 mt-0.5">
                                    共 {historyData.length} 点 · 每点 {POINT_INTERVAL_SEC} 秒 · 回溯 12 小时
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4">
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MapPin size={14} /> 地理编码解析
                    </h3>
                    <div className="mb-3">
                        <p className="text-lg font-bold text-slate-800 leading-tight">
                            {displayAddress}
                            {addressLoading && <span className="text-slate-400 font-normal text-sm ml-1">(解析中…)</span>}
                        </p>
                        <p className="text-xs text-slate-500 font-mono mt-1">
                            {latLngText}
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
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
                    <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Brain size={14} /> 多模态环境感知
                    </h3>
                    <p className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
                        <Eye size={10} /> 当前位置周边照片（与上方地址一致）
                    </p>
                    <div className="w-full flex gap-2 overflow-x-auto pb-1 no-scrollbar mb-3">
                        {locationPhotoItems.length > 0 ? locationPhotoItems.map((item, i) => (
                            <div key={i} className="flex-shrink-0 w-28 h-24 rounded-xl overflow-hidden bg-slate-100 relative group">
                                <img
                                    src={item.url}
                                    alt={item.caption || `位置照片 ${i + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.currentTarget.src = "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?q=80&w=400&auto=format&fit=crop";
                                    }}
                                />
                                {item.caption ? (
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">{item.caption}</div>
                                ) : null}
                            </div>
                        )) : (
                            <div className="flex gap-2 flex-shrink-0">
                                <div className="w-28 h-24 rounded-xl overflow-hidden bg-slate-100">
                                    <img src="https://images.unsplash.com/photo-1484154218962-a1c002085d2f?q=80&w=400&auto=format&fit=crop" alt="位置照片" className="w-full h-full object-cover" />
                                </div>
                                <div className="w-28 h-24 rounded-xl overflow-hidden bg-slate-100">
                                    <img src="https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=400&auto=format&fit=crop" alt="位置照片" className="w-full h-full object-cover" />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <div className="w-1 bg-indigo-500 rounded-full shrink-0"></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-400 font-bold mb-1">环境语义分析 (Groq)</p>
                            {environmentAnalysisLoading ? (
                                <p className="text-sm text-slate-500">分析中…</p>
                            ) : environmentAnalysis ? (
                                <div className="text-sm text-slate-700 leading-relaxed report-markdown [&_h2]:font-bold [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h2:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-2 [&_li]:my-0.5 [&_p]:my-1 [&_strong]:font-semibold [&_strong]:text-slate-800">
                                    <ReactMarkdown>{environmentAnalysis}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500">暂无分析</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Mock Data - 使用 healthStateService 的基准心率
const mockSleepData = [
    { name: '深睡', hours: 2.5, fill: '#4f46e5' },
    { name: '浅睡', hours: 4.5, fill: '#818cf8' },
    { name: '清醒', hours: 1, fill: '#e0e7ff' },
];

// Refactored Sub-component for Real-time Charts to prevent full Dashboard re-renders
const RealTimeHealthCharts = () => {
    // Initial Real-time Data (Last 60 seconds)
    const [data, setData] = useState(() => {
        const initial = [];
        const now = new Date();
        for (let i = 60; i >= 0; i--) {
            const t = new Date(now.getTime() - i * 1000);
            initial.push({
                time: t.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                bpm: Math.round(75 + Math.random() * 10 - 5),
                pressure: Math.round(120 + Math.random() * 15 - 7)
            });
        }
        return initial;
    });

    useEffect(() => {
        const interval = setInterval(() => {
            setData(prevData => {
                const now = new Date();
                const newPoint = {
                    time: now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    bpm: Math.round(75 + Math.sin(now.getTime() / 5000) * 10 + Math.random() * 5),
                    pressure: Math.round(120 + Math.sin(now.getTime() / 8000) * 10 + Math.random() * 5)
                };
                return [...prevData.slice(1), newPoint];
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col gap-6">
            {/* Heart Rate Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-72">
                <h3 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2"><Heart className="text-rose-500" size={18} /> 实时心率监测 (Live)</h3>
                <div className="flex-1 w-full min-h-[200px]">
                    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            {/* Increased interval to prevent overlap */}
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[60, 100]} width={25} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Line type="monotone" dataKey="bpm" stroke="#f43f5e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* BP Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-64">
                <h3 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2"><Activity className="text-indigo-500" size={18} /> 实时血压监测 (Live)</h3>
                <div className="flex-1 w-full min-h-[180px]">
                    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} interval={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} domain={[100, 140]} width={25} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Line type="monotone" dataKey="pressure" stroke="#6366f1" strokeWidth={3} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ status, simulation, logs }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const [greeting, setGreeting] = useState<string>('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // AI Health Report State
    const [reportLoading, setReportLoading] = useState(false);
    const [reportContent, setReportContent] = useState<string | null>(null);

    // NLP Cognitive Report State
    const [cognitiveLoading, setCognitiveLoading] = useState(false);
    const [cognitiveContent, setCognitiveContent] = useState<string | null>(null);

    const generateReport = async () => {
        setReportLoading(true);
        try {
            // Calculate real sleep duration from mock data
            const totalSleep = mockSleepData.reduce((acc, curr) => (curr.name === '深睡' || curr.name === '浅睡') ? acc + curr.hours : acc, 0);

            // Get mock vital signs (synchronized with Chart initial state roughly)
            const vitalSigns = {
                bpm: 75,
                pressure: '120/80',
                sleep: totalSleep // Use calculated value
            };
            // Call the real AI service
            const report = await aiService.generateHealthBrief(vitalSigns, []);
            setReportContent(report);
        } catch (error) {
            setReportContent("生成报告时出错，请检查网络设置。");
        } finally {
            setReportLoading(false);
        }
    };

    const generateCognitive = async () => {
        setCognitiveLoading(true);
        try {
            const report = await aiService.generateCognitiveReport([]); // In real app, pass history
            setCognitiveContent(report);
        } catch (error) {
            setCognitiveContent("分析失败");
        } finally {
            setCognitiveLoading(false);
        }
    };

    const mapRef = useRef<any>(null); // Leaflet map instance
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const layersRef = useRef<any>(null); // 已废弃：轨迹改用稳定 ref 更新
    const pastPolylineRef = useRef<any>(null);
    const futurePolylineRef = useRef<any>(null);
    const userMarkerRef = useRef<any>(null);
    /** 返回当前位置时显示的模拟“实时位置”点（美丽园小区内，与图例 indigo 一致） */
    const currentLocationMarkerRef = useRef<any>(null);
    /** 事件点标记：创建一次，仅通过 show(idx <= historyIndex) 显隐，避免闪烁 */
    const eventMarkersRef = useRef<{ marker: any; eventIndex: number }[]>([]);
    const lastHistoryDataForEventsRef = useRef<any[] | null>(null);

    // Overview Map State
    const overviewMapRef = useRef<any>(null);
    const overviewMapContainerRef = useRef<HTMLDivElement>(null);


    // History Playback State
    const [historyIndex, setHistoryIndex] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /** 当前位置周边 POI，用于多模态“当前位置相关照片” */
    const [locationPhotoItems, setLocationPhotoItems] = useState<{ url: string; caption?: string }[]>([]);
    /** 定位页是否使用 JS API 交互地图；null=首次进入待尝试，true=已用 JS 地图，false=已回退到静态图 */
    const [useJsMap, setUseJsMap] = useState<boolean | null>(null);
    /** 环境语义分析（Groq）：老人周边安全与地理位置描述 */
    const [environmentAnalysis, setEnvironmentAnalysis] = useState<string>('');
    const [environmentAnalysisLoading, setEnvironmentAnalysisLoading] = useState(false);
    const environmentAnalysisReqIdRef = useRef(0);

    const statusColor = status === SystemStatus.CRITICAL ? 'rose' : status === SystemStatus.WARNING ? 'amber' : 'emerald';

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

    // Simulation State
    const [historyData, setHistoryData] = useState<{ lat: number; lng: number; time: Date; event?: { type: string; title: string; desc?: string } }[]>([]);
    const [trajectoryLoading, setTrajectoryLoading] = useState(false);

    // 上海市静安区美丽园小区（延安西路379弄）- 真实地址作为安全中心，电子围栏半径 100m
    const HOME_LAT = 31.2192;
    const HOME_LNG = 121.4385;
    const HOME_POS: [number, number] = [HOME_LNG, HOME_LAT]; // [lng, lat] for 高德
    const GEOFENCE_RADIUS_M = 100;                          // 电子围栏半径 100 米
    const POINT_INTERVAL_SEC = 180;          // 每点间隔 3 分钟
    const TOTAL_HOURS = 12;                  // 12 小时内的轨迹
    const NUM_POINTS = Math.floor((TOTAL_HOURS * 3600) / POINT_INTERVAL_SEC); // 240 点
    const PLAYBACK_MS_PER_POINT = 400;      // 回放时每点间隔 400ms，兼顾逆地理解析速度
    const SAFE_ZONE_RADIUS_DEG = 0.0009;    // 约 100 米对应的纬度近似量（111km/度）

    const distFromHome = (lat: number, lng: number) =>
        Math.sqrt((lat - HOME_LAT) ** 2 + (lng - HOME_LNG) ** 2);

    // 1. 正常轨迹：12 小时内，模拟在美丽园小区及 100m 电子围栏内活动（下楼、小区内散步、取快递等）
    const simulateNormalPath = () => {
        setTrajectoryLoading(true);
        requestAnimationFrame(() => {
            const points: { lat: number; lng: number; time: Date; event?: { type: string; title: string; desc?: string } }[] = [];
            const startTime = new Date(Date.now() - TOTAL_HOURS * 3600 * 1000);
            // 围栏内半径约 80m（略小于 100m），保证所有点都在电子围栏内
            const maxR = 0.00072; // 约 80m
            let lat = HOME_LAT;
            let lng = HOME_LNG;
            for (let i = 0; i < NUM_POINTS; i++) {
                const t = i / NUM_POINTS;
                // 模拟一天内多次在小区内短距离移动：早晨-中午-下午-傍晚-夜间
                const phase = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
                const angle = t * Math.PI * 4 + phase * Math.PI + (Math.random() - 0.5) * 0.3;
                const r = maxR * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(i * 0.02))) + (Math.random() - 0.5) * 0.00008;
                lat = HOME_LAT + Math.sin(angle) * r;
                lng = HOME_LNG + Math.cos(angle) * r;
                const event = i === 0 ? { type: 'normal', title: '🏠 在安全区域内', desc: '12 小时轨迹开始' } : undefined;
                points.push({
                    lat,
                    lng,
                    time: new Date(startTime.getTime() + i * POINT_INTERVAL_SEC * 1000),
                    event,
                });
            }
            setHistoryData(points);
            setHistoryIndex(0);
            setIsPlaying(true);
            setTrajectoryLoading(false);
        });
    };

    // 2. 疑似走失轨迹：前 6 小时在美丽园小区内/附近，之后沿延安西路→南京西路方向离开，超出 100m 围栏时打“疑似走失”
    const simulateLostPath = () => {
        setTrajectoryLoading(true);
        requestAnimationFrame(() => {
            const points: { lat: number; lng: number; time: Date; event?: { type: string; title: string; desc?: string } }[] = [];
            const startTime = new Date(Date.now() - TOTAL_HOURS * 3600 * 1000);
            const halfPoints = Math.floor(NUM_POINTS / 2);
            let eventTriggered = false;
            // 真实路径：美丽园(延安西路379弄) → 向东向北沿路可到静安寺/南京西路一带（约 1.5–2.5 km）
            const stepLat = 0.00025 / 50;   // 每约 50 点向北约 0.00025 度（约 28m），后半段共约 0.0025 度 ≈ 280m 纬度方向
            const stepLng = 0.00035 / 50;  // 向东略大，模拟沿延安西路向东再向北
            let lat = HOME_LAT;
            let lng = HOME_LNG;
            for (let i = 0; i < NUM_POINTS; i++) {
                if (i <= halfPoints) {
                    // 前 6 小时：在小区及围栏内活动（与正常轨迹类似但范围略大，仍 <100m）
                    const t = i / halfPoints;
                    const angle = t * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                    const r = 0.00075 * (0.4 + 0.6 * Math.random());
                    lat = HOME_LAT + Math.sin(angle) * r + (Math.random() - 0.5) * 0.00006;
                    lng = HOME_LNG + Math.cos(angle) * r + (Math.random() - 0.5) * 0.00006;
                } else {
                    // 后 6 小时：沿东北方向“走出”小区（模拟沿延安西路向东、向南京西路方向）
                    const k = i - halfPoints;
                    const jitter = (Math.random() - 0.5) * 0.00004;
                    lat += stepLat + jitter;
                    lng += stepLng + jitter * 1.2;
                }

                let event: { type: string; title: string; desc?: string } | undefined;
                if (i === 0) {
                    event = { type: 'normal', title: '🏠 在安全区域内', desc: '轨迹开始' };
                } else if (!eventTriggered && distFromHome(lat, lng) > SAFE_ZONE_RADIUS_DEG) {
                    eventTriggered = true;
                    event = { type: 'wandering', title: '⚠️ 疑似走失', desc: '已超出电子围栏（100m）' };
                }

                points.push({
                    lat,
                    lng,
                    time: new Date(startTime.getTime() + i * POINT_INTERVAL_SEC * 1000),
                    event,
                });
            }
            setHistoryData(points);
            setHistoryIndex(0);
            setIsPlaying(true);
            setTrajectoryLoading(false);
        });
    };

    // 回放：从最早记录时间（index 0）推进到最后一个点；用 ref 存 interval 便于暂停按钮立即清除
    useEffect(() => {
        if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
        }
        if (isPlaying && historyData.length > 0) {
            playbackIntervalRef.current = setInterval(() => {
                setHistoryIndex(prev => {
                    if (prev >= historyData.length - 1) {
                        setIsPlaying(false);
                        if (playbackIntervalRef.current) {
                            clearInterval(playbackIntervalRef.current);
                            playbackIntervalRef.current = null;
                        }
                        return prev;
                    }
                    return prev + 1;
                });
            }, PLAYBACK_MS_PER_POINT);
        }
        return () => {
            if (playbackIntervalRef.current) {
                clearInterval(playbackIntervalRef.current);
                playbackIntervalRef.current = null;
            }
        };
    }, [isPlaying, historyData.length]);

    const resetToCurrentLocation = () => {
        if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
        }
        setIsPlaying(false);
        setHistoryData([]);
        setHistoryIndex(0);
    };

    const [displayAddress, setDisplayAddress] = useState<string>('上海市静安区延安西路379弄 美丽园小区');
    const [addressLoading, setAddressLoading] = useState(false);
    const addressRequestIdRef = useRef(0);

    useEffect(() => {
        const lng = historyData.length > 0 && historyData[historyIndex]
            ? historyData[historyIndex].lng
            : HOME_LNG + 0.00025;
        const lat = historyData.length > 0 && historyData[historyIndex]
            ? historyData[historyIndex].lat
            : HOME_LAT + 0.0002;
        const reqId = ++addressRequestIdRef.current;
        setAddressLoading(true);
        mapService.reverseGeocode(lng, lat).then((res) => {
            if (reqId !== addressRequestIdRef.current) return;
            setAddressLoading(false);
            if (res.success && res.formattedAddress) {
                setDisplayAddress(res.formattedAddress);
            } else {
                setDisplayAddress(`经纬度: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }
        }).catch(() => {
            if (reqId !== addressRequestIdRef.current) return;
            setAddressLoading(false);
            setDisplayAddress(`经纬度: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        });
    }, [historyData, historyIndex]);

    // 经纬度文案：有轨迹为当前点，无轨迹为预设模拟位置（与紫色“实时位置”点一致）
    const latLngText = useMemo(() => {
        if (historyData.length > 0 && historyData[historyIndex]) {
            const p = historyData[historyIndex];
            return `Lat: ${p.lat.toFixed(4)}, Lng: ${p.lng.toFixed(4)}`;
        }
        const simLat = HOME_LAT + 0.0002;
        const simLng = HOME_LNG + 0.00025;
        return `Lat: ${simLat.toFixed(4)}, Lng: ${simLng.toFixed(4)}`;
    }, [historyData, historyIndex]);

    // 上方静态图 URL（高德 Web 服务）：与当前经纬度一致，仅在使用静态图回退时展示
    const currentLngLat = useMemo(() => {
        if (historyData.length > 0 && historyData[historyIndex]) {
            return { lng: historyData[historyIndex].lng, lat: historyData[historyIndex].lat };
        }
        return { lng: HOME_LNG + 0.00025, lat: HOME_LAT + 0.0002 };
    }, [historyData, historyIndex]);
    const topMapStaticUrl = useMemo(() => {
        return mapService.getStaticMapUrl(currentLngLat.lng, currentLngLat.lat, 800, 400);
    }, [currentLngLat.lng, currentLngLat.lat]);

    // 根据当前经纬度拉取周边 POI，生成“当前位置相关照片”列表（多模态环境感知）
    useEffect(() => {
        let cancelled = false;
        const { lng, lat } = currentLngLat;
        mapService.getNearbyPoisWeb(lng, lat, 500, 3).then((pois) => {
            if (cancelled) return;
            if (!pois.length) {
                setLocationPhotoItems([
                    { url: 'https://images.unsplash.com/photo-1484154218962-a1c002085d2f?q=80&w=400&auto=format&fit=crop', caption: '当前位置' },
                    { url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?q=80&w=400&auto=format&fit=crop', caption: '周边' },
                ]);
                return;
            }
            const placeholder = 'https://images.unsplash.com/photo-1484154218962-a1c002085d2f?q=80&w=400&auto=format&fit=crop';
            setLocationPhotoItems(pois.slice(0, 3).map((p) => ({
                url: p.photoUrl || placeholder,
                caption: p.name || undefined,
            })));
        });
        return () => { cancelled = true; };
    }, [currentLngLat.lng, currentLngLat.lat]);

    // 环境语义分析（Groq）：根据当前地址与最近 3 个周边 POI 分析老人周边安全与地理位置
    useEffect(() => {
        const reqId = ++environmentAnalysisReqIdRef.current;
        setEnvironmentAnalysisLoading(true);
        const poiNames = locationPhotoItems.map((i) => i.caption).filter((c): c is string => !!c);
        aiService
            .analyzeEnvironmentForGuardian(displayAddress, poiNames)
            .then((text) => {
                if (reqId !== environmentAnalysisReqIdRef.current) return;
                setEnvironmentAnalysis(text || '');
            })
            .catch(() => {
                if (reqId !== environmentAnalysisReqIdRef.current) return;
                setEnvironmentAnalysis('');
            })
            .finally(() => {
                if (reqId === environmentAnalysisReqIdRef.current) setEnvironmentAnalysisLoading(false);
            });
    }, [displayAddress, locationPhotoItems]);

    // Initialize Map when Location Tab is active
    useEffect(() => {
        let isCancelled = false;

        const initMap = async () => {
            if (activeTab !== 'location' || isSettingsOpen || mapRef.current) return;
            await new Promise(r => setTimeout(r, 100));
            const homePos: [number, number] = HOME_POS;

            const map = await mapService.createMap('guardian-map-container', homePos);
            if (isCancelled) return;
            if (!map) {
                setUseJsMap(false);
                return;
            }
            setUseJsMap(true);
            mapRef.current = map;

            // 2. Add Static Geofence
            mapService.addCircle(map, homePos, GEOFENCE_RADIUS_M, {
                color: '#10b981',
                fillColor: '#34d399',
                dashArray: '5, 5'
            });

            // 3. Add Home Marker - 美丽园小区（安全中心）
            mapService.addMarker(map, homePos, undefined, "美丽园小区 (安全中心)");

            // 4. 预设“实时位置”点
            const currentPos: [number, number] = [HOME_LNG + 0.00025, HOME_LAT + 0.0002];
            currentLocationMarkerRef.current = mapService.addMarker(map, currentPos,
                `<div style="background:#6366f1;width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 6px rgba(99, 102, 241, 0.25);"></div>`
            );

            layersRef.current = [];
            setTimeout(() => {
                if (!isCancelled && mapRef.current && typeof mapRef.current.resize === 'function') {
                    mapRef.current.resize();
                }
            }, 350);
        };

        if (activeTab === 'location' && !isSettingsOpen) {
            initMap();
        }

        return () => {
            isCancelled = true;
            if (activeTab !== 'location' || isSettingsOpen) {
                setUseJsMap(null);
                if (mapRef.current) {
                    if (mapRef.current.destroy) mapRef.current.destroy();
                    mapRef.current = null;
                    layersRef.current = null;
                    pastPolylineRef.current = null;
                    futurePolylineRef.current = null;
                    userMarkerRef.current = null;
                    currentLocationMarkerRef.current = null;
                    eventMarkersRef.current = [];
                    lastHistoryDataForEventsRef.current = null;
                }
            }
        }
    }, [activeTab, isSettingsOpen]);

    // Initialize Overview Map
    useEffect(() => {
        let isCancelled = false;

        const initOverviewMap = async () => {
            if (activeTab === 'overview' && !isSettingsOpen && !overviewMapRef.current) {
                await new Promise(r => setTimeout(r, 100));
                const homePos: [number, number] = HOME_POS;
                const map = await mapService.createMap('overview-map-container', homePos);
                if (!map || isCancelled) return;
                overviewMapRef.current = map;

                // Add Home Marker & Circle
                mapService.addCircle(map, homePos, GEOFENCE_RADIUS_M, {
                    color: '#6366f1',
                    fillColor: '#818cf8',
                    dashArray: '5, 5'
                });
                mapService.addMarker(map, homePos, undefined, "美丽园小区");
            }
        };

        if (activeTab === 'overview' && !isSettingsOpen) {
            initOverviewMap();
        }

        return () => {
            isCancelled = true;
            if ((activeTab !== 'overview' || isSettingsOpen) && overviewMapRef.current) {
                if (overviewMapRef.current.destroy) overviewMapRef.current.destroy();
                overviewMapRef.current = null;
            }
        };
    }, [activeTab, isSettingsOpen]);

    // 稳定轨迹渲染：创建一次折线/标记，仅用 setPath/setPosition 更新，避免闪烁
    useEffect(() => {
        if (activeTab !== 'location' || isSettingsOpen || !mapRef.current) return;
        const map = mapRef.current;

        const thin = (path: [number, number][], step: number) => {
            if (path.length <= step) return path;
            const out: [number, number][] = [];
            for (let i = 0; i < path.length; i += step) out.push(path[i]);
            if ((path.length - 1) % step !== 0) out.push(path[path.length - 1]);
            return out;
        };
        const thinStep = 10;

        const run = () => {
            try {
                if (historyData.length === 0) {
                    if (pastPolylineRef.current) {
                        map.remove(pastPolylineRef.current);
                        pastPolylineRef.current = null;
                    }
                    if (futurePolylineRef.current) {
                        map.remove(futurePolylineRef.current);
                        futurePolylineRef.current = null;
                    }
                    if (userMarkerRef.current) {
                        map.remove(userMarkerRef.current);
                        userMarkerRef.current = null;
                    }
                    eventMarkersRef.current.forEach(({ marker }) => map.remove(marker));
                    eventMarkersRef.current = [];
                    lastHistoryDataForEventsRef.current = null;
                    // 返回当前位置：在美丽园小区内显示模拟的“实时位置”点，颜色与图例“实时位置”(indigo-500)一致
                    const currentPos: [number, number] = [
                        HOME_LNG + 0.00025,
                        HOME_LAT + 0.0002,
                    ];
                    if (!currentLocationMarkerRef.current) {
                        currentLocationMarkerRef.current = mapService.addMarker(map, currentPos,
                            `<div style="background:#6366f1;width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 6px rgba(99, 102, 241, 0.25);"></div>`
                        );
                    }
                    return;
                }
                if (currentLocationMarkerRef.current) {
                    map.remove(currentLocationMarkerRef.current);
                    currentLocationMarkerRef.current = null;
                }

                const pastPoints = historyData.slice(0, historyIndex + 1).map(p => [p.lng, p.lat] as [number, number]);
                const futurePoints = historyData.slice(historyIndex).map(p => [p.lng, p.lat] as [number, number]);
                const pastThin = pastPoints.length > 500 ? thin(pastPoints, thinStep) : pastPoints;
                const futureThin = futurePoints.length > 500 ? thin(futurePoints, thinStep) : futurePoints;
                const pastPath = pastThin.length >= 2 ? pastThin : pastThin.length === 1 ? [pastThin[0], pastThin[0]] : [];
                const futurePath = futureThin.length >= 2 ? futureThin : futureThin.length === 1 ? [futureThin[0], futureThin[0]] : [];
                const currentPt = historyData[historyIndex];

                if (!pastPolylineRef.current && pastPath.length >= 2) {
                    pastPolylineRef.current = mapService.addPolyline(map, pastPath, { color: '#94a3b8', weight: 6, opacity: 0.9 });
                }
                if (pastPolylineRef.current && pastPath.length >= 2) {
                    pastPolylineRef.current.setPath(pastPath);
                }

                if (!futurePolylineRef.current && futurePath.length >= 2) {
                    futurePolylineRef.current = mapService.addPolyline(map, futurePath, { color: '#94a3b8', weight: 4, opacity: 0.5, dashArray: '10, 10' });
                }
                if (futurePolylineRef.current) {
                    const fp = futurePath.length >= 2 ? futurePath : (currentPt ? [[currentPt.lng, currentPt.lat], [currentPt.lng, currentPt.lat]] : []);
                    futurePolylineRef.current.setPath(fp);
                }

                // 事件点：仅在 historyData 变更时重建，否则只更新显隐，避免闪烁
                if (lastHistoryDataForEventsRef.current !== historyData) {
                    eventMarkersRef.current.forEach(({ marker }) => map.remove(marker));
                    eventMarkersRef.current = [];
                    historyData.forEach((pt, idx) => {
                        if (!pt.event) return;
                        const isFall = pt.event.type === 'fall';
                        const color = isFall ? '#e11d48' : '#f59e0b';
                        const marker = mapService.addMarker(map, [pt.lng, pt.lat],
                            `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 3px 6px rgba(0,0,0,0.3);color:white;text-align:center;line-height:20px;font-weight:bold;font-size:14px;">${isFall ? '!' : '?'}</div>`,
                            pt.event.title
                        );
                        if (marker) eventMarkersRef.current.push({ marker, eventIndex: idx });
                    });
                    lastHistoryDataForEventsRef.current = historyData;
                }
                eventMarkersRef.current.forEach(({ marker, eventIndex }) => {
                    const visible = eventIndex <= historyIndex;
                    if (visible && typeof marker.show === 'function') marker.show();
                    if (!visible && typeof marker.hide === 'function') marker.hide();
                });

                if (currentPt) {
                    if (!userMarkerRef.current) {
                        userMarkerRef.current = mapService.addMarker(map, [currentPt.lng, currentPt.lat],
                            `<div style="background:#4f46e5;width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 6px rgba(79, 70, 229, 0.2);"></div>`
                        );
                    } else {
                        userMarkerRef.current.setPosition([currentPt.lng, currentPt.lat]);
                    }
                }
            } catch (e) {
                console.warn('[Dashboard] Map layer update error:', e);
            }
        };

        run();
    }, [activeTab, isSettingsOpen, historyIndex, historyData]);



    // --- Sub-Components ---

    const MIN_RECORDING_SECONDS = 10;

    const SettingsView = () => {
        // Voice Clone State
        const [cloneStep, setCloneStep] = useState<'idle' | 'recording' | 'processing' | 'done'>('idle');
        const [voiceProgress, setVoiceProgress] = useState(0);
        const [clonedVoiceName, setClonedVoiceName] = useState<string>('');
        const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
        const [isRecording, setIsRecording] = useState(false);
        const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
        const [recordingSeconds, setRecordingSeconds] = useState(0);
        const mediaRecorderRef = useRef<MediaRecorder | null>(null);
        const audioChunksRef = useRef<Blob[]>([]);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
        const recordingSecondsRef = useRef(0);

        // 所有音色（Edge 预设 + 克隆）& 当前选中
        const [allVoices, setAllVoices] = useState<{ id: string; name: string; isCloned?: boolean }[]>([]);
        const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(() =>
            voiceSelectionService.getSelectedVoiceId()
        );

        // 3D Avatar Generation State
        const [avatarStep, setAvatarStep] = useState<'idle' | 'uploading' | 'scanning' | 'rigging' | 'rendering' | 'done'>('idle');
        const [avatarProgress, setAvatarProgress] = useState(0);
        const [generatedAvatarUrl, setGeneratedAvatarUrl] = useState<string | null>(null);

        // 加载所有音色（Edge 预设 + 克隆）& 订阅选中变化
        const loadVoices = async () => {
            const all = await VoiceService.getAllVoices();
            setAllVoices(all.map((v) => ({ id: v.id, name: v.name, isCloned: v.isCloned })));
        };

        useEffect(() => {
            loadVoices();
            const unsub = voiceSelectionService.subscribe((id) => setSelectedVoiceId(id));
            return unsub;
        }, []);

        // 开始录音
        const handleStartRecording = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mr = new MediaRecorder(stream);
                mediaRecorderRef.current = mr;
                audioChunksRef.current = [];
                recordingSecondsRef.current = 0;
                setRecordingSeconds(0);

                mr.ondataavailable = (e) => {
                    if (e.data.size > 0) audioChunksRef.current.push(e.data);
                };

                mr.onstop = async () => {
                    stream.getTracks().forEach((t) => t.stop());
                    const raw = new Blob(audioChunksRef.current, {
                        type: mr.mimeType || 'audio/webm',
                    });
                    try {
                        const wav = await blobToWav(raw);
                        setRecordedAudio(wav);
                    } catch (e) {
                        console.error('转 WAV 失败', e);
                        setRecordedAudio(raw);
                    }
                };

                mr.start();
                setIsRecording(true);
                setCloneStep('recording');
                recordingTimerRef.current = setInterval(() => {
                    recordingSecondsRef.current += 1;
                    setRecordingSeconds(recordingSecondsRef.current);
                }, 1000);
            } catch (err) {
                console.error('录音失败:', err);
                alert('无法访问麦克风，请检查权限设置');
            }
        };

        // 停止录音（需 ≥10 秒）
        const handleStopRecording = () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
            if (mediaRecorderRef.current && isRecording) {
                const secs = recordingSecondsRef.current;
                if (secs < MIN_RECORDING_SECONDS) {
                    alert(`请至少录制 ${MIN_RECORDING_SECONDS} 秒。当前 ${secs} 秒。`);
                    recordingSecondsRef.current = 0;
                    setRecordingSeconds(0);
                    return;
                }
                mediaRecorderRef.current.stop();
                setIsRecording(false);
                recordingSecondsRef.current = 0;
                setRecordingSeconds(0);
                setCloneStep('idle');
            }
        };

        // 处理文件上传（时长 ≥10 秒才允许克隆，并转为 WAV 供后端）
        const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith('audio/')) {
                alert('请选择音频文件（WAV/MP3 等）');
                return;
            }
            try {
                const dur = await getAudioDurationSeconds(file);
                if (dur < MIN_RECORDING_SECONDS) {
                    alert(`音频时长至少 ${MIN_RECORDING_SECONDS} 秒，当前约 ${dur.toFixed(1)} 秒。`);
                    event.target.value = '';
                    return;
                }
            } catch (e) {
                console.warn('无法解析音频时长，仍允许使用', e);
            }
            try {
                const wav = await blobToWav(file);
                setRecordedAudio(wav);
            } catch (e) {
                console.error('转 WAV 失败', e);
                setRecordedAudio(file);
            }
            setCloneStep('idle');
            event.target.value = '';
        };

        /** 设为当前使用。传 null 表示使用默认孙女声（晓伊）。 */
        const handleSetAsCurrent = (id: string | null) => {
            voiceSelectionService.setSelectedVoiceId(id);
            setSelectedVoiceId(id);
            VoiceService.preloadClonePhrases(id ?? undefined);
        };

        // 开始语音克隆
        const handleStartVoiceClone = async () => {
            if (!recordedAudio) {
                fileInputRef.current?.click();
                return;
            }

            console.log('[克隆] 开始流程, 音频大小:', recordedAudio.size);
            setCloneStep('processing');
            setVoiceProgress(0);

            let progressInterval: ReturnType<typeof setInterval> | null = null;
            try {
                const voiceName = clonedVoiceName || `子女声音_${new Date().toLocaleDateString()}`;
                progressInterval = setInterval(() => {
                    setVoiceProgress(prev => {
                        if (prev >= 90) return 90;
                        return prev + 10;
                    });
                }, 300);

                console.log('[克隆] 调用 VoiceService.cloneVoice...');
                const result = await VoiceService.cloneVoice(recordedAudio, voiceName);

                if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
                setVoiceProgress(100);
                console.log('[克隆] 结果', result);

                if (result.status === 'ready' && result.isCloned) {
                    setClonedVoiceId(result.id);
                    setCloneStep('done');
                    await loadVoices();
                    voiceSelectionService.setSelectedVoiceId(result.id);
                    setSelectedVoiceId(result.id);
                    VoiceService.preloadClonePhrases(result.id);
                    console.log('[克隆] 完成，已切换为当前音色');
                } else if (result.status === 'failed') {
                    throw new Error('克隆失败');
                } else {
                    console.warn('[克隆] 服务不可用，使用预设音色');
                    setCloneStep('idle');
                    setVoiceProgress(0);
                }
            } catch (e) {
                if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
                const msg = e instanceof Error ? e.message : '未知错误';
                console.error('[克隆] 失败', e);
                alert(`语音克隆失败：${msg}\n\n请确认：\n1. 已启动语音克隆服务 (./scripts/start_voice_clone.sh)\n2. 浏览器控制台与服务器日志中的报错信息`);
                setCloneStep('idle');
                setVoiceProgress(0);
            }
        };

        // 试听克隆声音
        const handlePreviewVoice = async () => {
            if (!clonedVoiceId) return;

            try {
                await VoiceService.speak('你好，我是你的数字人助手', clonedVoiceId);
            } catch (error) {
                console.error('试听失败:', error);
                alert('试听失败，请检查服务连接');
            }
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
                            直接录音 ≥10 秒或上传 ≥10 秒音频（WAV/MP3），整合为一份样本后用于克隆。克隆一次即存为一个音色，可在下方切换使用。
                        </p>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*"
                            onChange={handleFileUpload}
                            className="hidden"
                        />

                        {cloneStep === 'idle' && (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="输入声音名称（如：女儿的声音）"
                                    value={clonedVoiceName}
                                    onChange={(e) => setClonedVoiceName(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                                />
                                <div className="bg-white/10 rounded-xl p-1 backdrop-blur-sm border border-white/20 flex gap-1">
                                    <button
                                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                                        className={`flex-1 py-3 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform ${isRecording ? 'bg-rose-500 text-white' : 'bg-white text-indigo-600'
                                            }`}
                                    >
                                        <Mic size={16} />
                                        {isRecording ? '停止录音' : '开始录音'}
                                    </button>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex-1 bg-white/20 text-white py-3 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform hover:bg-white/30"
                                    >
                                        <Upload size={16} /> 上传文件
                                    </button>
                                </div>
                                {recordedAudio && (
                                    <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-xl p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-emerald-100 text-sm">
                                            <CheckCircle size={16} />
                                            已选择音频（≥10 秒）
                                        </div>
                                        <button
                                            onClick={handleStartVoiceClone}
                                            className="bg-white text-emerald-600 px-4 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform"
                                        >
                                            开始克隆
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {cloneStep === 'recording' && (
                            <div className="flex flex-col items-center justify-center py-2">
                                <div className="flex gap-1 h-8 items-center mb-2">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <div
                                            key={i}
                                            className="w-1.5 bg-white rounded-full animate-talk"
                                            style={{
                                                height: Math.random() * 20 + 10 + 'px',
                                                animationDelay: i * 0.1 + 's',
                                            }}
                                        />
                                    ))}
                                </div>
                                <p className="text-sm font-mono text-white tabular-nums">
                                    {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
                                    {String(recordingSeconds % 60).padStart(2, '0')}
                                </p>
                                <p className="text-xs text-indigo-100 mt-1">
                                    至少 {MIN_RECORDING_SECONDS} 秒后可停止
                                </p>
                                <button
                                    onClick={handleStopRecording}
                                    disabled={recordingSeconds < MIN_RECORDING_SECONDS}
                                    className="mt-3 px-4 py-2 bg-rose-500 text-white rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    停止录音
                                </button>
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
                                    声音克隆完成！
                                </div>
                                <p className="text-xs text-emerald-100/80">已存为可切换音色，当前已设为使用中</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handlePreviewVoice}
                                        className="bg-white/10 hover:bg-white/20 text-white text-xs py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <Play size={12} /> 试听效果
                                    </button>
                                    <button
                                        onClick={() =>
                                            VoiceService.speak(
                                                '你好，我是你的数字人助手，很高兴为你服务',
                                                clonedVoiceId || undefined
                                            )
                                        }
                                        className="bg-white text-emerald-600 text-xs py-2 rounded-lg font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                                    >
                                        <Volume2 size={12} /> 发送问候
                                    </button>
                                </div>
                                <button
                                    onClick={() => {
                                        setCloneStep('idle');
                                        setRecordedAudio(null);
                                        setClonedVoiceId(null);
                                        setVoiceProgress(0);
                                    }}
                                    className="bg-white/10 hover:bg-white/20 text-white text-xs py-2 rounded-lg font-medium transition-colors"
                                >
                                    克隆新声音
                                </button>
                            </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-white/20">
                            <h4 className="text-xs font-bold text-indigo-100 uppercase tracking-wider mb-2">
                                TTS 音色 · 可切换（Edge 预设 + 克隆）
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {allVoices.map((v) => (
                                    <div
                                        key={v.id}
                                        className="flex items-center justify-between gap-2 bg-white/10 rounded-lg px-3 py-2"
                                    >
                                        <span className="text-sm text-white truncate flex-1">
                                            {v.name}
                                            {v.isCloned && (
                                                <span className="ml-1 text-[10px] text-amber-300">克隆</span>
                                            )}
                                            {(selectedVoiceId === v.id || (!selectedVoiceId && v.id === 'edge_xiaoyi')) && (
                                                <span className="ml-1 text-[10px] text-emerald-300">当前使用</span>
                                            )}
                                        </span>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                onClick={() =>
                                                    VoiceService.speak('你好，我是你的数字人助手', v.id)
                                                }
                                                className="px-2 py-1 bg-white/20 text-white text-[10px] rounded hover:bg-white/30"
                                            >
                                                试听
                                            </button>
                                            <button
                                                onClick={() => handleSetAsCurrent(v.id)}
                                                className="px-2 py-1 bg-white/20 text-white text-[10px] rounded hover:bg-white/30"
                                            >
                                                设为当前
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
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

            {/* 3D 老年数字人 Hero 状态卡片 - 尽量占满模块 */}
            <div className={`relative overflow-hidden rounded-[2.5rem] p-4 shadow-xl transition-all duration-700 group flex flex-col items-center ${
                status === SystemStatus.CRITICAL ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-200' :
                status === SystemStatus.WARNING ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-200' :
                'bg-white border border-slate-100 shadow-lg shadow-slate-100'
            }`}>
                {/* 状态角标 - 左上角 */}
                <div className={`absolute top-4 left-4 z-20 flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full shadow-sm ${
                    status === SystemStatus.NORMAL ? 'bg-slate-50 border border-slate-100' : 'bg-white/20 backdrop-blur-md border border-white/30'
                }`}>
                    <div className="relative flex items-center justify-center w-5 h-5">
                        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${status === SystemStatus.NORMAL ? 'bg-emerald-500' : 'bg-emerald-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${status === SystemStatus.NORMAL ? 'bg-emerald-500' : 'bg-emerald-500'}`}></span>
                    </div>
                    <span className={`text-xs font-bold tracking-widest ${status === SystemStatus.NORMAL ? 'text-slate-600' : 'text-white text-shadow-sm'}`}>实时守护中</span>
                </div>

                <div className={`absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 opacity-5 rounded-full blur-3xl ${status === SystemStatus.NORMAL ? 'bg-indigo-500' : 'bg-white'}`}></div>

                {/* 3D 数字人容器：尽量占满模块，居中显示 */}
                <div className="relative z-10 w-full min-h-[260px] flex items-center justify-center overflow-hidden py-2">
                    <div className="relative w-full max-w-[300px] aspect-square flex items-center justify-center mx-auto">
                        <div className={`absolute inset-0 rounded-full blur-2xl animate-pulse ${status === SystemStatus.NORMAL ? 'bg-slate-100' : 'bg-white/5'}`}></div>
                        <div className={`absolute inset-0 rounded-full backdrop-blur-sm border ${status === SystemStatus.NORMAL ? 'bg-white/50 border-slate-100' : 'bg-gradient-to-tr from-white/10 to-transparent border-white/10'}`}></div>
                        <div className={`absolute inset-1 border-2 border-dashed rounded-full animate-spin-slow opacity-60 ${status === SystemStatus.NORMAL ? 'border-indigo-200/50' : 'border-white/40'}`}></div>
                        <div className={`absolute inset-2 rounded-full border overflow-hidden flex items-center justify-center ${
                            status === SystemStatus.NORMAL ? 'bg-slate-50 border-white shadow-[inset_0_4px_20px_rgba(0,0,0,0.05)]' : 'bg-gradient-to-b from-white/20 to-white/5 border-white/30'
                        }`}>
                            <AvatarStatus3D status={status} size={260} />
                        </div>

                        {status !== SystemStatus.NORMAL && (
                            <div className="absolute top-1 right-1 bg-white rounded-full p-1.5 shadow-lg border-2 border-red-500 z-30">
                                <AlertTriangle size={18} className="text-red-600 animate-pulse" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Bento Grid Stats */}
            <div>
                <div className="flex items-center justify-between mb-4 px-1">
                    <h3 className="font-bold text-slate-800 text-lg">健康快照</h3>
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

                    {/* Section Header */}
                    <div className="col-span-2 pt-2">
                        <h3 className="text-lg font-bold text-slate-800">实时位置</h3>
                    </div>
                </div>
            </div>

            {/* Location Widget */}
            <div className="bg-white rounded-[2.5rem] p-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] border border-slate-100 cursor-pointer group" onClick={() => setActiveTab('location')}>
                <div className="relative h-44 bg-slate-100 rounded-[2rem] overflow-hidden">
                    {/* Real Amap Container */}
                    <div id="overview-map-container" ref={overviewMapContainerRef} className="w-full h-full"></div>

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
                            <MapPin size={16} className="text-indigo-500" /> 实时位置
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

    const HealthTab = () => {
        const totalSleepHours = mockSleepData.reduce((acc, d) => (d.name === '深睡' || d.name === '浅睡') ? acc + d.hours : acc, 0);
        const deepSleepHours = mockSleepData.find(d => d.name === '深睡')?.hours ?? 0;
        const lightSleepHours = mockSleepData.find(d => d.name === '浅睡')?.hours ?? 0;
        const awakeHours = mockSleepData.find(d => d.name === '清醒')?.hours ?? 0;
        const deepRatio = totalSleepHours > 0 ? deepSleepHours / totalSleepHours : 0;
        const sleepMinutes = Math.round(totalSleepHours * 60);
        const displayHours = Math.floor(sleepMinutes / 60);
        const displayMins = sleepMinutes % 60;
        const sleepDisplay = `${displayHours}小时 ${displayMins > 0 ? displayMins + '分' : '0分'}`;

        const sleepScore = useMemo(() => {
            let s = 60;
            if (totalSleepHours >= 7 && totalSleepHours <= 9) s += 20;
            else if (totalSleepHours >= 6 && totalSleepHours < 7) s += 10;
            else if (totalSleepHours < 5) s -= 15;
            if (deepRatio >= 0.25 && deepRatio <= 0.45) s += 15;
            else if (deepRatio >= 0.2) s += 5;
            return Math.min(98, Math.max(55, s));
        }, [totalSleepHours, deepRatio]);

        const { sleepDescription, sleepTipsOrAffirmation } = useMemo(() => {
            const deepPct = Math.round(deepRatio * 100);
            let description: string;
            let tipsOrAffirmation: string;

            if (totalSleepHours >= 7 && deepRatio >= 0.25) {
                description = `昨日共睡 ${displayHours} 小时${displayMins > 0 ? ' ' + displayMins + ' 分' : ''}，其中深睡 ${deepSleepHours} 小时、浅睡 ${lightSleepHours} 小时。深睡占比约 ${deepPct}%，睡眠时长与结构均良好。`;
                tipsOrAffirmation = `睡眠情况良好，时长与深睡占比都不错，子女可放心。请继续保持规律作息与良好习惯。`;
            } else if (totalSleepHours >= 6) {
                description = `昨日共睡 ${displayHours} 小时${displayMins > 0 ? ' ' + displayMins + ' 分' : ''}，其中深睡 ${deepSleepHours} 小时、浅睡 ${lightSleepHours} 小时${awakeHours > 0 ? '，夜间清醒约 ' + awakeHours + ' 小时' : ''}。深睡占比约 ${deepPct}%，整体尚可，仍有优化空间。`;
                tipsOrAffirmation = `改善建议（子女可协助）：固定就寝与起床时间；白天适度活动、傍晚避免剧烈运动；睡前 1 小时避免屏幕与咖啡因；午睡不超过 30 分钟；卧室保持安静、昏暗。若持续入睡困难或早醒，可考虑就医排查睡眠障碍。`;
            } else {
                description = `昨日共睡 ${displayHours} 小时${displayMins > 0 ? ' ' + displayMins + ' 分' : ''}，其中深睡 ${deepSleepHours} 小时、浅睡 ${lightSleepHours} 小时${awakeHours > 0 ? '，夜间清醒约 ' + awakeHours + ' 小时' : ''}。睡眠时长偏少，深睡占比约 ${deepPct}%。`;
                tipsOrAffirmation = `改善建议（子女可协助）：固定就寝与起床时间，即使睡得晚也尽量同一时间起床；白天多接触自然光、适度活动；睡前避免饱餐、酒精与咖啡因；减少午睡或控制在 20 分钟内；睡前可做放松活动（如温水泡脚、听轻音乐）。若长期睡眠不足或日间困倦明显，建议到睡眠门诊或神经内科评估。`;
            }
            return { sleepDescription: description, sleepTipsOrAffirmation: tipsOrAffirmation };
        }, [totalSleepHours, deepRatio, deepSleepHours, lightSleepHours, awakeHours, displayHours, displayMins]);

        return (
            <div className="flex flex-col gap-6 p-4 pb-24 animate-fade-in-up">
                <h2 className="text-xl font-bold text-slate-800 px-1">健康生命体征</h2>

                {/* Refactored Charts Component */}
                <RealTimeHealthCharts />

                {/* Sleep Card (Restored Circular Score + Auto Description & Tips) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-base font-bold text-slate-700">睡眠质量分析</h3>
                            <p className="text-sm text-slate-500 mt-1">昨日睡眠 <span className="font-bold text-slate-800">{sleepDisplay}</span></p>
                        </div>
                        <div className="w-16 h-16 rounded-full border-4 border-indigo-500 flex items-center justify-center bg-indigo-50 text-indigo-700 font-bold text-lg">
                            {sleepScore}
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

                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                        <p className="text-sm text-slate-600 leading-relaxed">{sleepDescription}</p>
                        <div className={`text-sm leading-relaxed rounded-xl p-3 ${totalSleepHours >= 7 && deepRatio >= 0.25 ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-amber-50 text-amber-900 border border-amber-100'}`}>
                            <p>{sleepTipsOrAffirmation}</p>
                        </div>
                    </div>
                </div>

                {/* AI Health Report Card (New Feature) */}
                <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-6 rounded-3xl shadow-lg shadow-indigo-200 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>

                    <div className="flex items-center gap-3 mb-4 relative z-10">
                        <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl border border-white/20">
                            <Sparkles size={20} className="text-yellow-300" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-tight">AI 综合健康日报</h3>
                            <p className="text-[10px] text-indigo-100 opacity-90">基于生理数据与认知交互记录</p>
                        </div>
                    </div>

                    {!reportContent && !reportLoading && (
                        <div className="relative z-10">
                            <p className="text-sm text-indigo-50 mb-4 leading-relaxed opacity-90">
                                系统将结合今日的实时体征数据（心率/血压）与老人在应用端的语音交互、记忆回顾等行为数据，利用大模型生成综合健康评估。
                            </p>
                            <button
                                onClick={generateReport}
                                className="w-full py-3 bg-white text-indigo-600 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                            >
                                <Sparkles size={16} /> 生成今日分析报告
                            </button>
                        </div>
                    )}

                    {reportLoading && (
                        <div className="flex flex-col items-center justify-center py-6 relative z-10">
                            <Loader2 size={32} className="text-white animate-spin mb-3" />
                            <p className="text-xs text-indigo-100 animate-pulse">正在分析多模态数据...</p>
                        </div>
                    )}

                    {reportContent && (
                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 relative z-10 animate-fade-in-up">
                            <div className="report-markdown font-sans text-xs leading-relaxed text-indigo-50 [&_h2]:font-bold [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h2:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-2 [&_li]:my-0.5 [&_p]:my-1 [&_strong]:font-semibold">
                                <ReactMarkdown>{reportContent}</ReactMarkdown>
                            </div>
                            <button
                                onClick={() => setReportContent(null)}
                                className="mt-3 text-[10px] text-indigo-200 underline opacity-60 hover:opacity-100"
                            >
                                重新生成
                            </button>
                        </div>
                    )}
                </div>

                {/* NLP Cognitive Analysis (Alzheimer's Prevention) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-lg">
                            <Brain size={18} className="text-emerald-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-base font-bold text-slate-800">NLP 语言认知分析</h3>
                            <p className="text-xs text-slate-500">阿尔兹海默症早期筛查</p>
                        </div>
                        <button
                            onClick={generateCognitive}
                            disabled={cognitiveLoading}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-1"
                        >
                            {cognitiveLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                            {cognitiveLoading ? '分析中' : '开始分析'}
                        </button>
                    </div>

                    {cognitiveContent && (
                        <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 leading-relaxed animate-fade-in report-markdown [&_h2]:font-bold [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h2:first-child]:mt-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-2 [&_li]:my-0.5 [&_p]:my-1 [&_strong]:font-semibold [&_strong]:text-slate-700">
                            <ReactMarkdown>{cognitiveContent}</ReactMarkdown>
                        </div>
                    )}
                </div>


            </div>
        );
    };

    const FaceAlbumTab = () => {
        const [faces, setFaces] = useState<FaceData[]>(() => faceService.getFaces());
        const [showAddModal, setShowAddModal] = useState(false);
        const [form, setForm] = useState({
            name: '',
            relation: '',
            imageUrl: '',
            description: ''
        });

        const refreshList = () => setFaces(faceService.getFaces());

        const handleAddSubmit = () => {
            if (!form.name || !form.imageUrl) return;
            faceService.addFace({
                name: form.name,
                relation: form.relation || '亲友',
                imageUrl: form.imageUrl,
                description: form.description
            });
            refreshList();
            setForm({ name: '', relation: '', imageUrl: '', description: '' });
            setShowAddModal(false);
        };

        const handleDelete = (id: string, e: React.MouseEvent) => {
            e.stopPropagation();
            if (confirm('确定要删除这张照片吗？')) {
                faceService.deleteFace(id);
                refreshList();
            }
        };

        return (
            <div className="flex flex-col gap-5 p-5 pb-24 animate-fade-in-up">
                {/* 时光相册：老人端展示的回忆照片 */}
                <div>
                    <h2 className="text-xl font-bold text-slate-800 mb-3">时光相册</h2>
                    <p className="text-xs text-slate-500 mb-3">老人端相册中的照片，用于回忆唤起</p>
                    <div className="grid grid-cols-2 gap-3">
                        {ALBUM_MEMORIES.map((photo) => (
                            <div key={photo.id} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                                <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 mb-2">
                                    <img src={photo.url} alt={photo.location} className="w-full h-full object-cover" />
                                </div>
                                <h4 className="font-bold text-slate-800 text-sm truncate">{photo.location}</h4>
                                <p className="text-xs text-slate-500 mt-0.5 truncate">{photo.date}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 人脸相册：用于老人端人脸识别的亲属照片 */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xl font-bold text-slate-800">人脸相册</h2>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-200 active:scale-95"
                        >
                            <Plus size={16} /> 添加照片
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">老人说不认识时可识别人脸，下方为预设亲属照片</p>

                <div className="grid grid-cols-2 gap-4">
                    {FACE_RECOGNITION_CONFIG.map((item) => (
                        <div key={`preset-${item.file}`} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                            <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 mb-3">
                                <img src={`/faces/${item.file}`} alt={item.relation} className="w-full h-full object-cover" />
                            </div>
                            <h4 className="font-bold text-slate-800 text-sm text-center">{item.name || item.relation}</h4>
                            <p className="text-xs text-slate-500 text-center mt-0.5">{item.relation}</p>
                        </div>
                    ))}
                    {faces.map((face) => (
                        <div key={face.id} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 relative group">
                            <button
                                onClick={(e) => handleDelete(face.id, e)}
                                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X size={12} />
                            </button>
                            <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 mb-3">
                                <img src={face.imageUrl} alt={face.name} className="w-full h-full object-cover" />
                            </div>
                            <h4 className="font-bold text-slate-800 text-sm text-center">{face.name}</h4>
                            <p className="text-xs text-slate-500 text-center mt-0.5">{face.relation}</p>
                        </div>
                    ))}
                </div>
                </div>

                {showAddModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAddModal(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="font-bold text-slate-800">添加人脸照片</h3>
                                <button onClick={() => setShowAddModal(false)}><X size={20} className="text-slate-400" /></button>
                            </div>
                            <div className="p-4 space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 block mb-1">照片 URL</label>
                                    <input type="text" value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="https://..." />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 block mb-1">姓名</label>
                                        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="如：张伟" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 block mb-1">关系</label>
                                        <input type="text" value={form.relation} onChange={e => setForm(f => ({ ...f, relation: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm" placeholder="如：儿子" />
                                    </div>
                                </div>
                                <button onClick={handleAddSubmit} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold mt-2">保存照片</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // --- Medication Section Component (Moved from MedicationTab) ---
    const MedicationSection = () => {
        const [medications, setMedications] = useState<Medication[]>(() => medicationService.getMedications());
        const [showAddModal, setShowAddModal] = useState(false);
        const [form, setForm] = useState({
            name: '',
            dosage: '',
            frequency: '每日1次',
            timesStr: '08:00',
            instructions: '',
            purpose: '',
            imageUrl: '',
        });

        const refreshList = () => setMedications(medicationService.getMedications());

        const normalizeTime = (s: string): string => {
            const t = s.trim();
            const m = t.match(/^(\d{1,2}):(\d{2})$/);
            if (m) return m[1].padStart(2, '0') + ':' + m[2].padStart(2, '0');
            if (/^\d{4}$/.test(t)) return t.slice(0, 2) + ':' + t.slice(2);
            return t;
        };

        const handleAddSubmit = () => {
            const name = form.name.trim();
            if (!name) return;
            const times = form.timesStr.split(/[,，\s]+/).map(normalizeTime).filter(t => /^\d{2}:\d{2}$/.test(t));
            medicationService.addMedication({
                name,
                dosage: form.dosage,
                frequency: form.frequency,
                times: times.length ? times : ['08:00'],
                instructions: form.instructions,
                purpose: form.purpose,
                imageUrl: form.imageUrl || undefined
            });
            refreshList();
            setShowAddModal(false);
            setForm({ name: '', dosage: '', frequency: '每日1次', timesStr: '08:00', instructions: '', purpose: '', imageUrl: '' });
        };

        const todayLogs = medicationService.getTodayLogs();
        const nowTime = new Date().toTimeString().slice(0, 5);

        const getMedicationStatus = (med: Medication) => {
            const takenToday = todayLogs.filter((l) => l.medicationId === med.id && l.status === 'taken');
            if (takenToday.length > 0) {
                const last = takenToday[takenToday.length - 1];
                return { label: '已服用', cls: 'text-emerald-600 bg-emerald-100', nextTime: last.actualTime || last.scheduledTime };
            }
            const nextTime = med.times.find((t) => t >= nowTime) || med.times[0];
            return { label: '待定', cls: 'text-slate-500 bg-slate-100', nextTime };
        };

        return (
            <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Pill size={18} className="text-indigo-500" /> 用药管理
                    </h3>
                    <button onClick={() => setShowAddModal(true)} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg">
                        + 添加
                    </button>
                </div>

                <div className="space-y-3">
                    {medications.length === 0 ? (
                        <p className="text-center text-slate-400 text-xs py-4">暂无药物信息</p>
                    ) : (
                        medications.map(med => {
                            const status = getMedicationStatus(med);
                            return (
                                <div key={med.id} className="flex items-center p-3 border border-slate-100 rounded-xl bg-white shadow-sm">
                                    <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mr-3 overflow-hidden">
                                        {med.imageUrl ? <img src={med.imageUrl} className="w-full h-full object-cover" /> : <Pill size={16} className="text-slate-400" />}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-slate-700 text-sm">{med.name}</h4>
                                        <p className="text-xs text-slate-500">{med.dosage} · {med.frequency}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.cls}`}>{status.label}</span>
                                </div>
                            )
                        })
                    )}
                </div>

                {showAddModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAddModal(false)}>
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-slate-100 flex justify-between">
                                <h3 className="font-bold">添加药物</h3>
                                <button onClick={() => setShowAddModal(false)}><X size={18} /></button>
                            </div>
                            <div className="p-4 space-y-3">
                                {/* Simplified Form for brevity in this refactor, but keeping checking fields */}
                                <div><label className="text-xs block text-slate-500">药名</label><input className="border w-full rounded p-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                                <div><label className="text-xs block text-slate-500">剂量</label><input className="border w-full rounded p-2 text-sm" value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} /></div>
                                <div><label className="text-xs block text-slate-500">时间 (逗号分隔)</label><input className="border w-full rounded p-2 text-sm" value={form.timesStr} onChange={e => setForm(f => ({ ...f, timesStr: e.target.value }))} /></div>
                                <button onClick={handleAddSubmit} className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-bold">保存</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };



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
                            {activeTab === 'location' && (
                                <LocationTabContent
                                    mapContainerRef={mapContainerRef}
                                    historyData={historyData}
                                    historyIndex={historyIndex}
                                    setHistoryIndex={setHistoryIndex}
                                    isPlaying={isPlaying}
                                    setIsPlaying={setIsPlaying}
                                    trajectoryLoading={trajectoryLoading}
                                    simulateNormalPath={simulateNormalPath}
                                    simulateLostPath={simulateLostPath}
                                    resetToCurrentLocation={resetToCurrentLocation}
                                    playbackIntervalRef={playbackIntervalRef}
                                    POINT_INTERVAL_SEC={POINT_INTERVAL_SEC}
                                    simulation={simulation}
                                    displayAddress={displayAddress}
                                    addressLoading={addressLoading}
                                    latLngText={latLngText}
                                    locationPhotoItems={locationPhotoItems}
                                    useJsMap={useJsMap}
                                    topMapStaticUrl={topMapStaticUrl}
                                    staticMapCenter={currentLngLat}
                                    homePos={HOME_POS}
                                    geofenceRadiusDeg={SAFE_ZONE_RADIUS_DEG}
                                    environmentAnalysis={environmentAnalysis}
                                    environmentAnalysisLoading={environmentAnalysisLoading}
                                />
                            )}
                            {activeTab === 'faces' && <FaceAlbumTab />}

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
                            { id: 'faces', label: '相册', icon: Users },
                        ].map((item) => {
                            const isActive = activeTab === (item.id as DashboardTab);
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
