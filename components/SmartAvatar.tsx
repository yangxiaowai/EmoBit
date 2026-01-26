import React, { useEffect, useState } from 'react';
import { healthStateService, AvatarState, HealthMetrics } from '../services/healthStateService';

interface SmartAvatarProps {
    customImageUrl?: string;          // 用户自定义头像图片
    metrics?: Partial<HealthMetrics>; // 健康数据
    isTalking?: boolean;              // 是否在说话
    isListening?: boolean;            // 是否在聆听
    isThinking?: boolean;             // 是否在思考（等 AI 回复）
    size?: 'small' | 'medium' | 'large';
    showStatus?: boolean;             // 是否显示状态信息
    onClick?: () => void;
}

/**
 * 智能3D头像组件
 * 根据健康状态动态调整表情和动画
 */
const SmartAvatar: React.FC<SmartAvatarProps> = ({
    customImageUrl,
    metrics,
    isTalking = false,
    isListening = false,
    isThinking = false,
    size = 'medium',
    showStatus = true,
    onClick,
}) => {
    const [avatarState, setAvatarState] = useState<AvatarState>(healthStateService.getAvatarState());

    // 订阅健康状态变化
    useEffect(() => {
        const unsubscribe = healthStateService.subscribe(setAvatarState);

        // 启动模拟数据（演示用）
        const stopSimulation = healthStateService.startSimulation();

        return () => {
            unsubscribe();
            stopSimulation();
        };
    }, []);

    // 更新健康指标
    useEffect(() => {
        if (metrics) {
            healthStateService.updateMetrics(metrics);
        }
    }, [metrics]);

    // 尺寸映射
    const sizeMap = {
        small: { container: 'w-24 h-28', avatar: 'w-20 h-20', bpm: 'text-xs' },
        medium: { container: 'w-40 h-48', avatar: 'w-32 h-32', bpm: 'text-sm' },
        large: { container: 'w-56 h-64', avatar: 'w-48 h-48', bpm: 'text-base' },
    };

    const sizeClasses = sizeMap[size];

    // 获取肤色样式
    const getSkinToneClass = () => {
        switch (avatarState.skinTone) {
            case 'pale':
                return 'opacity-75 saturate-50';
            case 'flushed':
                return 'saturate-125 brightness-105';
            default:
                return '';
        }
    };

    // 获取姿态样式
    const getPostureTransform = () => {
        switch (avatarState.posture) {
            case 'slouched':
                return 'translateY(8px) scale(0.95)';
            case 'upright':
                return 'translateY(-4px) scale(1.02)';
            default:
                return '';
        }
    };

    // 获取眼睛样式
    const getEyeStyle = () => {
        switch (avatarState.eyeState) {
            case 'wide':
                return { scaleY: 1.2 };
            case 'droopy':
                return { scaleY: 0.7 };
            case 'closed':
                return { scaleY: 0.1 };
            default:
                return { scaleY: 1 };
        }
    };

    // 获取心情对应的表情
    const getMoodEmoji = () => {
        switch (avatarState.mood) {
            case 'happy':
                return '😊';
            case 'tired':
                return '😮‍💨';
            case 'worried':
                return '😟';
            case 'sleepy':
                return '😴';
            default:
                return '😌';
        }
    };

    // 获取警报级别颜色
    const getAlertColor = () => {
        switch (avatarState.alertLevel) {
            case 'critical':
                return 'bg-red-500 animate-pulse';
            case 'warning':
                return 'bg-amber-500';
            case 'attention':
                return 'bg-blue-500';
            default:
                return 'bg-emerald-500';
        }
    };

    // 获取呼吸动画
    const getBreathingAnimation = () => {
        switch (avatarState.animation) {
            case 'breathing_fast':
                return 'animate-[breathing_1s_ease-in-out_infinite]';
            case 'breathing_slow':
                return 'animate-[breathing_4s_ease-in-out_infinite]';
            default:
                return 'animate-[breathing_2.5s_ease-in-out_infinite]';
        }
    };

    // 计算心率显示
    const heartRate = metrics?.heartRate || 72;

    return (
        <div
            className={`relative ${sizeClasses.container} flex flex-col items-center cursor-pointer`}
            onClick={onClick}
        >
            {/* 主体容器 */}
            <div
                className={`relative ${sizeClasses.avatar} ${getBreathingAnimation()}`}
                style={{ transform: getPostureTransform() }}
            >
                {/* 外层光晕 (根据状态变化) */}
                <div
                    className={`absolute inset-0 rounded-[40%_40%_45%_45%] blur-xl transition-all duration-1000
            ${avatarState.alertLevel === 'critical' ? 'bg-red-200' :
                            avatarState.alertLevel === 'warning' ? 'bg-amber-200' :
                                'bg-gradient-to-br from-indigo-200 to-blue-200'}`}
                    style={{ transform: 'scale(1.1)' }}
                />

                {/* 头像主体 */}
                <div
                    className={`relative w-full h-full rounded-[40%_40%_45%_45%] 
            bg-gradient-to-br from-slate-100 via-slate-50 to-white
            shadow-lg border border-slate-200/50 overflow-hidden transition-all duration-500
            ${getSkinToneClass()}`}
                >
                    {/* 自定义头像图片 */}
                    {customImageUrl && (
                        <img
                            src={customImageUrl}
                            alt="Avatar"
                            className="absolute inset-0 w-full h-full object-cover rounded-[40%_40%_45%_45%]"
                        />
                    )}

                    {/* 默认表情 (无自定义图片时) */}
                    {!customImageUrl && (
                        <>
                            {/* 眼睛 */}
                            <div className="absolute top-[35%] left-1/2 -translate-x-1/2 flex gap-4">
                                <div
                                    className="w-2 h-3 bg-slate-700 rounded-full transition-transform duration-300"
                                    style={{ transform: `scaleY(${getEyeStyle().scaleY})` }}
                                />
                                <div
                                    className="w-2 h-3 bg-slate-700 rounded-full transition-transform duration-300"
                                    style={{ transform: `scaleY(${getEyeStyle().scaleY})` }}
                                />
                            </div>

                            {/* 嘴巴 */}
                            <div
                                className={`absolute top-[55%] left-1/2 -translate-x-1/2 transition-all duration-300
                  ${isTalking ? 'w-4 h-4 rounded-full bg-slate-600 animate-[talk_0.15s_ease-in-out_infinite]' :
                                        isThinking ? 'w-3 h-3 rounded-full bg-amber-400/80 animate-pulse' :
                                        avatarState.mood === 'happy' ? 'w-6 h-3 rounded-b-full border-b-2 border-slate-600' :
                                            avatarState.mood === 'worried' ? 'w-4 h-2 rounded-t-full border-t-2 border-slate-600' :
                                                'w-5 h-0.5 bg-slate-500 rounded-full'}`}
                            />

                            {/* 腮红 (开心时) */}
                            {avatarState.mood === 'happy' && (
                                <>
                                    <div className="absolute top-[45%] left-[20%] w-3 h-2 bg-pink-200 rounded-full opacity-60" />
                                    <div className="absolute top-[45%] right-[20%] w-3 h-2 bg-pink-200 rounded-full opacity-60" />
                                </>
                            )}
                        </>
                    )}

                    {/* 聆听 / 思考指示器 */}
                    {isListening && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-3 bg-indigo-500 rounded-full animate-[wave_0.5s_ease-in-out_infinite_0ms]" />
                                <div className="w-1.5 h-4 bg-indigo-500 rounded-full animate-[wave_0.5s_ease-in-out_infinite_100ms]" />
                                <div className="w-1.5 h-3 bg-indigo-500 rounded-full animate-[wave_0.5s_ease-in-out_infinite_200ms]" />
                            </div>
                        </div>
                    )}
                    {isThinking && !isListening && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                            <div className="w-1.5 h-2 bg-amber-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-2.5 bg-amber-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-2 bg-amber-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                        </div>
                    )}
                </div>

                {/* 心率显示 */}
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
            ${sizeClasses.bpm} font-mono text-rose-400 pointer-events-none
            ${isTalking || isListening || isThinking ? 'opacity-0' : 'opacity-70'}`}
                >
                    <span className="animate-pulse">❤️</span> {heartRate} BPM
                </div>

                {/* 状态指示点 */}
                <div className={`absolute -top-1 -right-1 w-4 h-4 ${getAlertColor()} rounded-full border-2 border-white shadow-sm`} />
            </div>

            {/* 状态消息 */}
            {showStatus && avatarState.message && (
                <div className="mt-3 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-xs text-slate-600 max-w-full truncate">
                    {getMoodEmoji()} {avatarState.message}
                </div>
            )}

            {/* CSS动画定义 */}
            <style>{`
        @keyframes breathing {
          0%, 100% { transform: scale(1) ${getPostureTransform()}; }
          50% { transform: scale(1.02) ${getPostureTransform()}; }
        }
        
        @keyframes talk {
          0%, 100% { transform: translate(-50%, 0) scaleY(1); }
          50% { transform: translate(-50%, 0) scaleY(0.5); }
        }
        
        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }
      `}</style>
        </div>
    );
};

export default SmartAvatar;
