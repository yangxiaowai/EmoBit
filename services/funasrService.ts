/**
 * FunASR 语音识别客户端服务
 * 通过 WebSocket 连接 FunASR 服务器进行语音识别
 * 
 * 优势：
 * - 不依赖浏览器 API，兼容性更好
 * - 支持离线运行（本地部署）
 * - 中文识别准确率更高
 * - 可自定义模型和优化
 */

export interface FunASRResult {
    text: string;
    isFinal: boolean;
}

export type FunASROnResultCallback = (result: FunASRResult) => void;
export type FunASROnErrorCallback = (error: Error) => void;

export class FunASRService {
    private ws: WebSocket | null = null;
    private isRecording = false;
    private onResult: FunASROnResultCallback | null = null;
    private onError: FunASROnErrorCallback | null = null;
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private processor: ScriptProcessorNode | null = null;
    private serverUrl: string;
    private waitingForFinal = false; // 是否正在等待最终结果
    private lastResult: FunASRResult | null = null; // 保存最后一个结果（可能是中间结果）
    private finalResultTimeout: NodeJS.Timeout | null = null; // 等待最终结果的超时定时器

    constructor(serverUrl?: string) {
        // 从环境变量或参数获取服务器地址
        this.serverUrl = serverUrl || 
            import.meta.env.VITE_FUNASR_WS_URL || 
            'ws://localhost:10095';
    }

    /**
     * 检查 FunASR 服务是否可用
     */
    async checkConnection(): Promise<boolean> {
        try {
            // 尝试建立 WebSocket 连接（快速测试）
            const testWs = new WebSocket(this.serverUrl);
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (testWs.readyState === WebSocket.CONNECTING || testWs.readyState === WebSocket.OPEN) {
                        testWs.close();
                    }
                    resolve(false);
                }, 2000);

                testWs.onopen = () => {
                    clearTimeout(timeout);
                    // 等待一小段时间确保连接稳定
                    setTimeout(() => {
                        testWs.close();
                        resolve(true);
                    }, 100);
                };

                testWs.onerror = () => {
                    clearTimeout(timeout);
                    resolve(false);
                };

                testWs.onclose = () => {
                    // 如果已经 resolve，忽略关闭事件
                };
            });
        } catch (error) {
            console.error('[FunASR] 连接检查失败:', error);
            return false;
        }
    }

    /**
     * 开始语音识别
     */
    async startRecognition(
        onResult: FunASROnResultCallback,
        onError?: FunASROnErrorCallback
    ): Promise<void> {
        if (this.isRecording) {
            console.warn('[FunASR] 已在录音中');
            return;
        }

        this.onResult = onResult;
        this.onError = onError || null;

        try {
            // 1. 建立 WebSocket 连接
            await this.connectWebSocket();

            // 2. 获取麦克风权限并开始录音
            await this.startAudioCapture();

            // 3. 发送开始命令
            this.sendCommand({ type: 'start' });

            this.isRecording = true;
            console.log('[FunASR] 开始识别');

        } catch (error) {
            const err = error instanceof Error ? error : new Error('FunASR 启动失败');
            this.onError?.(err);
            this.cleanup();
            throw err;
        }
    }

    /**
     * 停止语音识别
     */
    stopRecognition(): void {
        if (!this.isRecording) {
            console.log('[FunASR] 未在录音，无需停止');
            return;
        }

        console.log('[FunASR] 正在停止识别...');
        this.isRecording = false;

        // 发送停止命令（在清理之前）
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('[FunASR] 发送停止命令到服务器，等待最终结果...');
            try {
                this.sendCommand({ type: 'stop', is_speaking: false });
            } catch (error) {
                console.error('[FunASR] ❌ 发送停止命令失败:', error);
            }
            
            // 设置一个标志，表示正在等待最终结果
            this.waitingForFinal = true;
            
            // 清除之前的超时定时器（如果有）
            if (this.finalResultTimeout) {
                clearTimeout(this.finalResultTimeout);
            }
            
            // 等待更长时间让服务器处理并发送最终结果
            // 服务器处理音频可能需要5-10秒（特别是长音频），所以增加等待时间
            this.finalResultTimeout = setTimeout(() => {
                if (this.waitingForFinal) {
                    console.warn('[FunASR] ⚠️ 等待最终结果超时（10秒），清理连接');
                    console.warn('[FunASR] 提示：如果音频较长，服务器可能需要更多时间处理');
                    this.waitingForFinal = false;
                    // 延迟清理，给服务器更多时间
                    setTimeout(() => {
                        this.cleanup();
                    }, 2000); // 再等2秒
                } else {
                    // 已经收到最终结果，清理会在收到最终结果后自动触发
                    console.log('[FunASR] ✅ 已收到最终结果，清理将在收到结果后自动触发');
                }
            }, 10000); // 等待 10 秒，给服务器足够时间处理长音频
        } else {
            console.warn('[FunASR] WebSocket 未连接，无法发送停止命令');
            this.cleanup();
        }

        console.log('[FunASR] ✅ 停止命令已发送');
    }

    /**
     * 检查是否正在录音
     */
    get recording(): boolean {
        return this.isRecording;
    }

    /**
     * 建立 WebSocket 连接
     */
    private async connectWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);

                this.ws.onopen = () => {
                    console.log('[FunASR] WebSocket 连接已建立');
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event);
                };

                this.ws.onerror = (error) => {
                    console.error('[FunASR] WebSocket 错误:', error);
                    this.isRecording = false;
                    this.waitingForFinal = false;
                    this.onError?.(new Error('WebSocket 连接错误'));
                    // 延迟清理，避免在错误处理过程中关闭连接
                    setTimeout(() => {
                        this.cleanup();
                    }, 100);
                };

                this.ws.onclose = (event) => {
                    console.log('[FunASR] WebSocket 连接已关闭', {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean
                    });
                    this.isRecording = false;
                    this.waitingForFinal = false;
                    if (this.isRecording) {
                        // 如果还在录音状态但连接关闭，尝试重连
                        this.onError?.(new Error('连接已断开'));
                    }
                    // 只有在非正常关闭时才清理资源
                    // 正常关闭时资源已经清理过了
                    if (!event.wasClean && event.code !== 1000) {
                        console.warn('[FunASR] ⚠️ 非正常关闭，清理资源');
                        this.cleanup();
                    }
                };

                // 5秒超时
                setTimeout(() => {
                    if (this.ws?.readyState !== WebSocket.OPEN) {
                        reject(new Error('WebSocket 连接超时'));
                    }
                }, 5000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 处理 WebSocket 消息
     */
    private handleMessage(event: MessageEvent): void {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'ready') {
                console.log('[FunASR] ✅ 服务器已就绪，可以开始录音');
                return;
            }

            if (data.text !== undefined) {
                const result: FunASRResult = {
                    text: data.text,
                    isFinal: data.is_final === true,
                };

                // 完全禁用中间结果：只处理最终结果
                // 如果收到中间结果，只记录日志，不传递给上层
                if (!result.isFinal) {
                    console.log(`[FunASR] 🔄 收到中间结果（已忽略，只处理最终结果）: "${result.text}"`);
                    // 保存最后一个中间结果，但不上报
                    this.lastResult = result;
                    return; // 直接返回，不处理中间结果
                }

                // 只处理最终结果
                console.log('='.repeat(60));
                console.log(`[FunASR] ✅ 收到最终结果: "${result.text}"`);
                console.log(`[FunASR] 准备调用 onResult 回调...`);
                console.log('='.repeat(60));
                
                // 保存最后一个结果
                this.lastResult = result;
                this.waitingForFinal = false; // 收到最终结果，清除等待标志
                
                // 清除等待超时定时器
                if (this.finalResultTimeout) {
                    clearTimeout(this.finalResultTimeout);
                    this.finalResultTimeout = null;
                    console.log('[FunASR] ✅ 已收到最终结果，清除等待超时定时器');
                }
                
                // 收到最终结果后，延迟关闭连接，确保服务器处理完成
                setTimeout(() => {
                    if (!this.isRecording && this.ws && this.ws.readyState === WebSocket.OPEN) {
                        console.log('[FunASR] 收到最终结果，准备关闭连接...');
                        this.cleanup();
                    }
                }, 500); // 给服务器500ms时间完成处理
                
                // 检查回调是否存在
                if (!this.onResult) {
                    console.error('[FunASR] ❌ onResult 回调未设置！');
                } else {
                    console.log(`[FunASR] 调用 onResult 回调，结果:`, result);
                    try {
                        this.onResult(result);
                        console.log(`[FunASR] ✅ onResult 回调已调用`);
                    } catch (error) {
                        console.error('[FunASR] ❌ onResult 回调执行失败:', error);
                    }
                }
            } else {
                console.warn('[FunASR] ⚠️ 收到消息但没有 text 字段:', data);
            }
        } catch (error) {
            console.error('[FunASR] ❌ 解析消息失败:', error);
            console.error('[FunASR] 原始消息:', event.data);
        }
    }

    /**
     * 开始音频捕获
     */
    private async startAudioCapture(): Promise<void> {
        try {
            // 获取麦克风权限
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000, // FunASR 通常使用 16kHz
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // 创建 AudioContext
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000,
            });

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // 创建 ScriptProcessorNode 处理音频数据
            // 注意：ScriptProcessorNode 已废弃，但为了兼容性仍使用
            // 未来可考虑使用 AudioWorklet
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.processor.onaudioprocess = (event) => {
                if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    return;
                }

                // 获取音频数据（Float32Array，范围 -1 到 1）
                const inputData = event.inputBuffer.getChannelData(0);

                // 转换为 Int16 PCM（FunASR 需要的格式）
                const pcm16 = this.float32ToInt16(inputData);

                // 通过 WebSocket 发送音频数据
                this.ws.send(pcm16);
            };

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

        } catch (error) {
            if (error instanceof Error && error.name === 'NotAllowedError') {
                throw new Error('请允许麦克风权限');
            } else if (error instanceof Error && error.name === 'NotFoundError') {
                throw new Error('未找到麦克风设备');
            } else {
                throw new Error(`音频捕获失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * 将 Float32Array 转换为 Int16Array PCM
     */
    private float32ToInt16(float32: Float32Array): Int16Array {
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            // 限制范围并转换为 16bit
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return int16;
    }

    /**
     * 发送控制命令
     */
    private sendCommand(command: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(command));
        } else {
            console.warn('[FunASR] WebSocket 未连接，无法发送命令');
        }
    }

    /**
     * 清理资源
     */
    private cleanup(): void {
        console.log('[FunASR] 开始清理资源...');
        
        // 清除等待超时定时器
        if (this.finalResultTimeout) {
            clearTimeout(this.finalResultTimeout);
            this.finalResultTimeout = null;
        }
        
        // 停止音频处理
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        // 停止媒体流
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // 关闭 AudioContext
        if (this.audioContext) {
            this.audioContext.close().catch(console.error);
            this.audioContext = null;
        }

            // 延迟关闭 WebSocket，确保收到最终结果
            if (this.ws) {
                // 如果还在等待最终结果，等待更长时间
                const waitTime = this.waitingForFinal ? 2000 : 500;
                console.log(`[FunASR] 将在 ${waitTime}ms 后关闭 WebSocket`);
                
                setTimeout(() => {
                    if (this.ws) {
                        // 检查连接状态，安全关闭
                        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                            console.log('[FunASR] 安全关闭 WebSocket 连接');
                            try {
                                // 发送关闭帧，优雅关闭
                                this.ws.close(1000, 'Normal closure');
                            } catch (error) {
                                console.warn('[FunASR] 关闭连接时出错:', error);
                                // 如果关闭失败，直接设置为null
                                this.ws = null;
                            }
                        } else {
                            console.log('[FunASR] WebSocket 已关闭，无需再次关闭');
                            this.ws = null;
                        }
                    }
                    this.waitingForFinal = false;
                }, waitTime);
            }
        
        console.log('[FunASR] ✅ 资源清理完成');
    }
}

// 单例导出
export const funasrService = new FunASRService();
