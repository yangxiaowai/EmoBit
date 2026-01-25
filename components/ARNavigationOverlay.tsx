import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowUp, ArrowLeft, ArrowRight, RotateCcw, MapPin, Navigation, X, Camera } from 'lucide-react';
import { arNavigationService, ARNavigationState } from '../services/arNavigationService';
import { RouteStep, mapService } from '../services/mapService';
import { edgeTTSService } from '../services/ttsService';

interface ARNavigationOverlayProps {
    isActive: boolean;
    steps: RouteStep[];
    destination: string;
    onClose: () => void;
}

/**
 * AR导航叠加层组件
 * 在摄像头画面上叠加导航箭头和指令
 */
const ARNavigationOverlay: React.FC<ARNavigationOverlayProps> = ({
    isActive,
    steps,
    destination,
    onClose,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [navState, setNavState] = useState<ARNavigationState | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const lastSpokenInstruction = useRef<string>('');

    const [viewMode, setViewMode] = useState<'ar' | 'map'>('ar');
    const mapInstance = useRef<any>(null);

    // 启动摄像头
    const startCamera = useCallback(async () => {
        if (viewMode !== 'ar') return; // 只在AR模式启动摄像头

        try {
            // 优先尝试后置摄像头
            const constraintsOptions = [
                {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    }
                },
                {
                    video: true // 降级：任意可用摄像头
                }
            ];

            let stream: MediaStream | null = null;
            let lastError;

            for (const constraints of constraintsOptions) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia(constraints);
                    if (stream) break;
                } catch (e) {
                    lastError = e;
                    console.warn('[AR] Camera constraint failed:', constraints, e);
                }
            }

            if (!stream) {
                throw lastError || new Error('No camera available');
            }

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsCameraReady(true);
                setCameraError(null);
            }
        } catch (error) {
            console.error('[AR] 摄像头启动失败:', error);
            setCameraError('无法启动摄像头 (Win端需检查隐私设置)');
        }
    }, [viewMode]);

    // 停止摄像头
    const stopCamera = useCallback(() => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraReady(false);
    }, []);

    // 切换模式处理
    useEffect(() => {
        if (viewMode === 'ar') {
            startCamera();
            // 销毁地图
            if (mapInstance.current) {
                mapInstance.current.destroy();
                mapInstance.current = null;
            }
        } else {
            stopCamera();
            // 初始化地图 (延迟一点等待DOM)
            setTimeout(async () => {
                const map = await mapService.createMap('nav-map-container');
                if (map) {
                    mapInstance.current = map;
                    // 如果有路线规划，可以在这里绘制（暂略，只显示地图场景）
                }
            }, 100);
        }
    }, [viewMode, startCamera, stopCamera]);

    // 初始化
    useEffect(() => {
        if (isActive) {
            if (viewMode === 'ar') startCamera();

            // 订阅导航状态
            const unsubscribe = arNavigationService.subscribe(setNavState);

            // 开始导航
            if (steps.length > 0) {
                arNavigationService.startNavigation(steps);
            }

            return () => {
                unsubscribe();
                stopCamera();
                arNavigationService.stopNavigation();
                if (mapInstance.current) {
                    mapInstance.current.destroy();
                    mapInstance.current = null;
                }
            };
        }
    }, [isActive, steps, startCamera, stopCamera]); // remove viewMode from here to avoid re-init logic conflict

    // 语音播报当前指令 (保持不变)
    useEffect(() => {
        if (navState?.instruction && navState.instruction !== lastSpokenInstruction.current) {
            lastSpokenInstruction.current = navState.instruction;
            edgeTTSService.speak(navState.instruction).catch(console.error);
        }
    }, [navState?.instruction]);

    // ... (getDirectionArrow logic unchanged) ...
    const getDirectionArrow = () => {
        const direction = navState?.arrowDirection || 'straight';
        const baseClass = "w-32 h-32 drop-shadow-2xl";

        switch (direction) {
            case 'left':
                return (
                    <div className="animate-pulse">
                        <ArrowLeft className={`${baseClass} text-yellow-400`} strokeWidth={3} />
                        <div className="text-center text-2xl font-bold text-white mt-2 drop-shadow-lg">左转</div>
                    </div>
                );
            case 'right':
                return (
                    <div className="animate-pulse">
                        <ArrowRight className={`${baseClass} text-yellow-400`} strokeWidth={3} />
                        <div className="text-center text-2xl font-bold text-white mt-2 drop-shadow-lg">右转</div>
                    </div>
                );
            case 'back':
                return (
                    <div className="animate-bounce">
                        <RotateCcw className={`${baseClass} text-orange-400`} strokeWidth={3} />
                        <div className="text-center text-2xl font-bold text-white mt-2 drop-shadow-lg">掉头</div>
                    </div>
                );
            case 'arrived':
                return (
                    <div className="animate-bounce">
                        <MapPin className={`${baseClass} text-green-400`} strokeWidth={3} />
                        <div className="text-center text-2xl font-bold text-white mt-2 drop-shadow-lg">已到达</div>
                    </div>
                );
            default:
                return (
                    <div className="animate-pulse">
                        <ArrowUp className={`${baseClass} text-green-400`} strokeWidth={3} />
                        <div className="text-center text-2xl font-bold text-white mt-2 drop-shadow-lg">直行</div>
                    </div>
                );
        }
    };

    if (!isActive) return null;

    return (
        <div className="absolute inset-0 z-50 bg-black">
            {/* 内容区域：AR视频 或 地图 */}
            {viewMode === 'ar' ? (
                <>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* 半透明遮罩 */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

                    {/* AR箭头 */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative">
                            <div className="absolute inset-0 scale-150 blur-2xl opacity-50">
                                {getDirectionArrow()}
                            </div>
                            {getDirectionArrow()}
                        </div>
                    </div>
                </>
            ) : (
                <div id="nav-map-container" className="absolute inset-0 w-full h-full bg-slate-100" />
            )}

            {/* 摄像头错误提示 (仅AR模式) */}
            {viewMode === 'ar' && cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
                    <div className="text-center p-8">
                        <Camera className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                        <p className="text-white text-lg mb-4">{cameraError}</p>
                        <button
                            onClick={startCamera}
                            className="px-6 py-3 bg-indigo-500 text-white rounded-full font-medium"
                        >
                            重试
                        </button>
                    </div>
                </div>
            )}

            {/* 顶部信息栏 */}
            <div className="absolute top-0 left-0 right-0 p-4 pt-12 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
                <div className="flex items-center justify-between pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <Navigation className="w-6 h-6 text-green-400" />
                        <div>
                            <div className="text-white font-bold text-lg">{destination}</div>
                            <div className="text-white/70 text-sm">{viewMode === 'ar' ? 'AR实景导航中' : '地图导航模式'}</div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {/* 切换视图按钮 */}
                        <button
                            onClick={() => setViewMode(prev => prev === 'ar' ? 'map' : 'ar')}
                            className="px-3 py-2 bg-white/20 backdrop-blur rounded-full flex items-center gap-2 text-white font-medium hover:bg-white/30 transition-colors"
                        >
                            {viewMode === 'ar' ? <MapPin size={16} /> : <Camera size={16} />}
                            {viewMode === 'ar' ? '看地图' : '实景'}
                        </button>

                        <button
                            onClick={onClose}
                            className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 底部信息面板 */}
            <div className="absolute bottom-0 left-0 right-0 p-6 pb-10 bg-gradient-to-t from-black/90 via-black/70 to-transparent pointer-events-none">
                {/* 当前指令 */}
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 mb-4">
                    <div className="text-white text-xl font-bold leading-relaxed">
                        {navState?.instruction || '准备开始导航...'}
                    </div>
                </div>

                {/* 距离和时间 */}
                <div className="flex gap-4">
                    <div className="flex-1 bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                        <div className="text-3xl font-black text-white">
                            {navState?.distanceToNextTurn ? `${navState.distanceToNextTurn}` : '--'}
                        </div>
                        <div className="text-white/60 text-sm">米后转弯</div>
                    </div>
                    <div className="flex-1 bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                        <div className="text-3xl font-black text-green-400">
                            {navState?.estimatedTimeMinutes || '--'}
                        </div>
                        <div className="text-white/60 text-sm">分钟到达</div>
                    </div>
                </div>
            </div>

            {/* 安全提示角标 */}
            {viewMode === 'ar' && (
                <div className="absolute top-32 right-4 bg-amber-500/90 backdrop-blur px-3 py-1.5 rounded-full pointer-events-none">
                    <span className="text-white text-xs font-medium">👀 请注意周围安全</span>
                </div>
            )}
        </div>
    );
};

export default ARNavigationOverlay;
