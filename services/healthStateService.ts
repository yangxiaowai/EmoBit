/**
 * 健康状态服务
 * 管理老人的健康数据并映射到头像状态
 */

export interface HealthMetrics {
    heartRate: number;        // 心率 (bpm)
    bloodOxygen: number;      // 血氧 (%)
    sleepHours: number;       // 昨晚睡眠 (小时)
    steps: number;            // 今日步数
    bloodPressure?: {
        systolic: number;       // 收缩压
        diastolic: number;      // 舒张压
    };
    temperature?: number;     // 体温
    lastMealTime?: Date;      // 上次进餐时间
    lastMedicationTime?: Date; // 上次服药时间
}

export interface AvatarState {
    energy: number;           // 精力值 0-100
    mood: 'happy' | 'calm' | 'tired' | 'worried' | 'sleepy';
    skinTone: 'healthy' | 'pale' | 'flushed';
    posture: 'upright' | 'relaxed' | 'slouched';
    eyeState: 'wide' | 'normal' | 'droopy' | 'closed';
    animation: 'idle' | 'breathing_slow' | 'breathing_fast' | 'nodding';
    alertLevel: 'normal' | 'attention' | 'warning' | 'critical';
    message?: string;         // 状态提示语
}

export interface HealthAlert {
    type: 'warning' | 'critical';
    metric: string;
    value: number;
    threshold: number;
    message: string;
    timestamp: Date;
}

/**
 * 健康状态服务类
 */
export class HealthStateService {
    private currentMetrics: HealthMetrics | null = null;
    private alertHistory: HealthAlert[] = [];
    private listeners: ((state: AvatarState) => void)[] = [];

    // 健康阈值配置
    private thresholds = {
        heartRate: { low: 50, high: 100, critical: 120 },
        bloodOxygen: { low: 95, critical: 90 },
        sleepHours: { min: 6, ideal: 8 },
        steps: { min: 2000, ideal: 5000 },
        bloodPressure: {
            systolicHigh: 140,
            systolicCritical: 160,
            diastolicHigh: 90,
        },
    };

    /**
     * 更新健康指标
     */
    updateMetrics(metrics: Partial<HealthMetrics>): void {
        this.currentMetrics = {
            ...this.getDefaultMetrics(),
            ...this.currentMetrics,
            ...metrics,
        };

        // 检查是否需要发出警报
        this.checkAlerts();

        // 通知监听器
        const state = this.calculateAvatarState();
        this.listeners.forEach(listener => listener(state));
    }

    /**
     * 获取当前头像状态
     */
    getAvatarState(): AvatarState {
        return this.calculateAvatarState();
    }

    /**
     * 计算头像状态
     */
    private calculateAvatarState(): AvatarState {
        const metrics = this.currentMetrics || this.getDefaultMetrics();

        // 计算精力值 (综合多项指标)
        const energy = this.calculateEnergy(metrics);

        // 确定心情
        const mood = this.determineMood(metrics, energy);

        // 确定肤色
        const skinTone = this.determineSkinTone(metrics);

        // 确定姿态
        const posture = this.determinePosture(energy);

        // 确定眼睛状态
        const eyeState = this.determineEyeState(metrics, energy);

        // 确定动画
        const animation = this.determineAnimation(metrics);

        // 确定警报级别
        const alertLevel = this.determineAlertLevel(metrics);

        // 生成状态消息
        const message = this.generateStateMessage(metrics, mood, alertLevel);

        return {
            energy,
            mood,
            skinTone,
            posture,
            eyeState,
            animation,
            alertLevel,
            message,
        };
    }

    /**
     * 计算精力值
     */
    private calculateEnergy(metrics: HealthMetrics): number {
        let energy = 70; // 基础值

        // 睡眠影响 (30%)
        const sleepScore = Math.min(metrics.sleepHours / this.thresholds.sleepHours.ideal, 1) * 30;
        energy = energy - 15 + sleepScore;

        // 血氧影响 (20%)
        if (metrics.bloodOxygen < this.thresholds.bloodOxygen.low) {
            energy -= (this.thresholds.bloodOxygen.low - metrics.bloodOxygen) * 3;
        }

        // 心率影响 (20%)
        if (metrics.heartRate < this.thresholds.heartRate.low) {
            energy -= 10;
        } else if (metrics.heartRate > this.thresholds.heartRate.high) {
            energy -= 15;
        }

        // 运动影响 (10%)
        const stepsScore = Math.min(metrics.steps / this.thresholds.steps.ideal, 1) * 10;
        energy += stepsScore;

        return Math.max(0, Math.min(100, energy));
    }

    /**
     * 确定心情
     */
    private determineMood(metrics: HealthMetrics, energy: number): AvatarState['mood'] {
        if (energy < 30) return 'tired';
        if (metrics.sleepHours < 5) return 'sleepy';
        if (metrics.bloodOxygen < this.thresholds.bloodOxygen.low) return 'worried';
        if (energy > 70 && metrics.steps > this.thresholds.steps.min) return 'happy';
        return 'calm';
    }

    /**
     * 确定肤色
     */
    private determineSkinTone(metrics: HealthMetrics): AvatarState['skinTone'] {
        if (metrics.bloodOxygen < this.thresholds.bloodOxygen.critical) return 'pale';
        if (metrics.heartRate > this.thresholds.heartRate.critical) return 'flushed';
        return 'healthy';
    }

    /**
     * 确定姿态
     */
    private determinePosture(energy: number): AvatarState['posture'] {
        if (energy < 30) return 'slouched';
        if (energy > 70) return 'upright';
        return 'relaxed';
    }

    /**
     * 确定眼睛状态
     */
    private determineEyeState(metrics: HealthMetrics, energy: number): AvatarState['eyeState'] {
        if (metrics.sleepHours < 4) return 'closed';
        if (energy < 40) return 'droopy';
        if (energy > 80) return 'wide';
        return 'normal';
    }

    /**
     * 确定动画
     */
    private determineAnimation(metrics: HealthMetrics): AvatarState['animation'] {
        if (metrics.heartRate > this.thresholds.heartRate.high) return 'breathing_fast';
        if (metrics.heartRate < this.thresholds.heartRate.low) return 'breathing_slow';
        return 'idle';
    }

    /**
     * 确定警报级别
     */
    private determineAlertLevel(metrics: HealthMetrics): AvatarState['alertLevel'] {
        // 严重警报
        if (
            metrics.bloodOxygen < this.thresholds.bloodOxygen.critical ||
            metrics.heartRate > this.thresholds.heartRate.critical ||
            (metrics.bloodPressure && metrics.bloodPressure.systolic > this.thresholds.bloodPressure.systolicCritical)
        ) {
            return 'critical';
        }

        // 警告
        if (
            metrics.bloodOxygen < this.thresholds.bloodOxygen.low ||
            metrics.heartRate > this.thresholds.heartRate.high ||
            metrics.heartRate < this.thresholds.heartRate.low ||
            metrics.sleepHours < 5
        ) {
            return 'warning';
        }

        // 关注
        if (metrics.steps < this.thresholds.steps.min) {
            return 'attention';
        }

        return 'normal';
    }

    /**
     * 生成状态消息
     */
    private generateStateMessage(
        metrics: HealthMetrics,
        mood: AvatarState['mood'],
        alertLevel: AvatarState['alertLevel']
    ): string {
        if (alertLevel === 'critical') {
            if (metrics.bloodOxygen < this.thresholds.bloodOxygen.critical) {
                return '血氧偏低，请深呼吸并休息';
            }
            if (metrics.heartRate > this.thresholds.heartRate.critical) {
                return '心跳过快，请坐下休息';
            }
        }

        if (alertLevel === 'warning') {
            if (metrics.sleepHours < 5) {
                return '昨晚睡眠不足，今天要早点休息哦';
            }
        }

        const messages: Record<AvatarState['mood'], string> = {
            happy: '今天状态不错！继续保持~',
            calm: '一切正常，我在陪着您',
            tired: '看起来有点累，要不要休息一下？',
            worried: '我有点担心您，要不要测量一下血压？',
            sleepy: '眼睛都睁不开啦，去躺一会吧',
        };

        return messages[mood];
    }

    /**
     * 检查并发出警报
     */
    private checkAlerts(): void {
        if (!this.currentMetrics) return;

        const metrics = this.currentMetrics;

        // 血氧警报
        if (metrics.bloodOxygen < this.thresholds.bloodOxygen.critical) {
            this.addAlert('critical', 'bloodOxygen', metrics.bloodOxygen, this.thresholds.bloodOxygen.critical, '血氧水平严重偏低！');
        } else if (metrics.bloodOxygen < this.thresholds.bloodOxygen.low) {
            this.addAlert('warning', 'bloodOxygen', metrics.bloodOxygen, this.thresholds.bloodOxygen.low, '血氧水平偏低');
        }

        // 心率警报
        if (metrics.heartRate > this.thresholds.heartRate.critical) {
            this.addAlert('critical', 'heartRate', metrics.heartRate, this.thresholds.heartRate.critical, '心率过快！');
        }
    }

    /**
     * 添加警报
     */
    private addAlert(
        type: HealthAlert['type'],
        metric: string,
        value: number,
        threshold: number,
        message: string
    ): void {
        this.alertHistory.unshift({
            type,
            metric,
            value,
            threshold,
            message,
            timestamp: new Date(),
        });

        // 只保留最近20条
        this.alertHistory = this.alertHistory.slice(0, 20);
    }

    /**
     * 订阅状态变化
     */
    subscribe(listener: (state: AvatarState) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * 获取警报历史
     */
    getAlertHistory(): HealthAlert[] {
        return [...this.alertHistory];
    }

    /**
     * 获取默认指标（模拟数据）
     */
    private getDefaultMetrics(): HealthMetrics {
        return {
            heartRate: 72 + Math.floor(Math.random() * 10),
            bloodOxygen: 97 + Math.floor(Math.random() * 3),
            sleepHours: 7,
            steps: 3000 + Math.floor(Math.random() * 2000),
        };
    }

    /**
     * 开始模拟数据（用于演示）
     */
    startSimulation(): () => void {
        const interval = setInterval(() => {
            const variation = () => (Math.random() - 0.5) * 2;

            this.updateMetrics({
                heartRate: Math.floor(72 + variation() * 5),
                bloodOxygen: Math.floor(97 + variation()),
                steps: (this.currentMetrics?.steps || 3000) + Math.floor(Math.random() * 50),
            });
        }, 5000);

        return () => clearInterval(interval);
    }
}

// 单例导出
export const healthStateService = new HealthStateService();
