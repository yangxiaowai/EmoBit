/**
 * AR导航服务
 * 提供AR增强现实导航功能
 */

import { RouteStep } from './mapService';

// 设备方向信息
export interface DeviceOrientation {
    alpha: number;  // 罗盘方向 (0-360)
    beta: number;   // 前后倾斜 (-180 to 180)
    gamma: number;  // 左右倾斜 (-90 to 90)
    heading: number; // 真实朝向（考虑磁偏角）
}

// AR导航状态
export interface ARNavigationState {
    isActive: boolean;
    currentStep: RouteStep | null;
    nextStep: RouteStep | null;
    distanceToNextTurn: number;     // 到下一转弯点的距离(米)
    bearingToNextTurn: number;      // 到下一转弯点的方位角
    deviceOrientation: DeviceOrientation | null;
    arrowDirection: 'straight' | 'left' | 'right' | 'back' | 'arrived';
    instruction: string;            // 当前指令
    estimatedTimeMinutes: number;   // 预计到达时间
}

// AR导航指令
export interface ARInstruction {
    direction: 'straight' | 'left' | 'right' | 'back' | 'arrived';
    distance: number;
    instruction: string;
    landmark?: string;
}

type ARNavigationCallback = (state: ARNavigationState) => void;

class ARNavigationService {
    private state: ARNavigationState;
    private subscribers: ARNavigationCallback[] = [];
    private deviceOrientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
    private routeSteps: RouteStep[] = [];
    private currentStepIndex = 0;
    private updateInterval: any = null;

    constructor() {
        this.state = {
            isActive: false,
            currentStep: null,
            nextStep: null,
            distanceToNextTurn: 0,
            bearingToNextTurn: 0,
            deviceOrientation: null,
            arrowDirection: 'straight',
            instruction: '准备开始导航',
            estimatedTimeMinutes: 0,
        };
    }

    /**
     * 订阅导航状态更新
     */
    subscribe(callback: ARNavigationCallback): () => void {
        this.subscribers.push(callback);
        callback(this.state);  // 立即发送当前状态
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    /**
     * 通知所有订阅者
     */
    private notify(): void {
        this.subscribers.forEach(cb => cb({ ...this.state }));
    }

    /**
     * 开始AR导航
     */
    startNavigation(steps: RouteStep[]): void {
        console.log('[ARNav] 开始AR导航，共', steps.length, '步');

        this.routeSteps = steps;
        this.currentStepIndex = 0;
        this.state.isActive = true;
        this.state.currentStep = steps[0] || null;
        this.state.nextStep = steps[1] || null;

        // 启动设备方向监听
        this.startOrientationTracking();

        // 模拟导航进度
        this.startNavigationSimulation();

        this.updateNavigationState();
        this.notify();
    }

    /**
     * 停止AR导航
     */
    stopNavigation(): void {
        console.log('[ARNav] 停止AR导航');

        this.state.isActive = false;
        this.stopOrientationTracking();

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        this.notify();
    }

    /**
     * 开始设备方向追踪
     */
    private startOrientationTracking(): void {
        if (typeof DeviceOrientationEvent !== 'undefined') {
            this.deviceOrientationHandler = (event: DeviceOrientationEvent) => {
                this.state.deviceOrientation = {
                    alpha: event.alpha || 0,
                    beta: event.beta || 0,
                    gamma: event.gamma || 0,
                    heading: event.alpha || 0,  // 简化处理
                };
                this.updateArrowDirection();
            };

            // 请求权限（iOS 13+需要）
            if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
                (DeviceOrientationEvent as any).requestPermission()
                    .then((permission: string) => {
                        if (permission === 'granted') {
                            window.addEventListener('deviceorientation', this.deviceOrientationHandler!);
                        }
                    });
            } else {
                window.addEventListener('deviceorientation', this.deviceOrientationHandler);
            }
        }
    }

    /**
     * 停止设备方向追踪
     */
    private stopOrientationTracking(): void {
        if (this.deviceOrientationHandler) {
            window.removeEventListener('deviceorientation', this.deviceOrientationHandler);
            this.deviceOrientationHandler = null;
        }
    }

    /**
     * 更新箭头方向
     */
    private updateArrowDirection(): void {
        if (!this.state.deviceOrientation || !this.state.currentStep) return;

        const deviceHeading = this.state.deviceOrientation.heading;
        const targetBearing = this.state.bearingToNextTurn;

        // 计算需要转向的角度
        let diff = targetBearing - deviceHeading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // 根据角度差确定箭头方向
        if (Math.abs(diff) < 30) {
            this.state.arrowDirection = 'straight';
        } else if (diff > 0 && diff <= 120) {
            this.state.arrowDirection = 'right';
        } else if (diff < 0 && diff >= -120) {
            this.state.arrowDirection = 'left';
        } else {
            this.state.arrowDirection = 'back';
        }
    }

    /**
     * 更新导航状态
     */
    private updateNavigationState(): void {
        if (!this.state.currentStep) return;

        // 解析当前步骤的指令
        const step = this.state.currentStep;

        // 根据动作类型设置箭头方向
        switch (step.action) {
            case 'left':
                this.state.arrowDirection = 'left';
                break;
            case 'right':
                this.state.arrowDirection = 'right';
                break;
            case 'straight':
                this.state.arrowDirection = 'straight';
                break;
            case 'arrive':
                this.state.arrowDirection = 'arrived';
                break;
            default:
                this.state.arrowDirection = 'straight';
        }

        this.state.instruction = step.instruction;
        this.state.distanceToNextTurn = step.distance;

        this.notify();
    }

    /**
     * 模拟导航进度（演示用）
     */
    private startNavigationSimulation(): void {
        let elapsedTime = 0;

        this.updateInterval = setInterval(() => {
            elapsedTime += 3;

            // 每隔一段时间切换到下一步
            if (elapsedTime % 8 === 0 && this.currentStepIndex < this.routeSteps.length - 1) {
                this.currentStepIndex++;
                this.state.currentStep = this.routeSteps[this.currentStepIndex];
                this.state.nextStep = this.routeSteps[this.currentStepIndex + 1] || null;

                console.log('[ARNav] 进入下一步:', this.state.currentStep?.instruction);

                this.updateNavigationState();
            }

            // 模拟距离减少
            if (this.state.distanceToNextTurn > 0) {
                this.state.distanceToNextTurn = Math.max(0, this.state.distanceToNextTurn - 20);
            }

            // 导航完成
            if (this.currentStepIndex >= this.routeSteps.length - 1 && this.state.distanceToNextTurn <= 0) {
                this.state.arrowDirection = 'arrived';
                this.state.instruction = '您已到达目的地！';
                this.notify();
                this.stopNavigation();
            }

        }, 3000);
    }

    /**
     * 获取AR显示指令
     */
    getARInstruction(): ARInstruction {
        return {
            direction: this.state.arrowDirection,
            distance: this.state.distanceToNextTurn,
            instruction: this.state.instruction,
        };
    }

    /**
     * 获取当前状态
     */
    getState(): ARNavigationState {
        return { ...this.state };
    }

    /**
     * 检查是否支持AR功能
     */
    static isSupported(): { camera: boolean; orientation: boolean } {
        return {
            camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            orientation: typeof DeviceOrientationEvent !== 'undefined',
        };
    }
}

// 单例导出
export const arNavigationService = new ARNavigationService();
