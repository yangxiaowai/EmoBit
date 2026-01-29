/**
 * 语音识别服务 - 仅使用 FunASR
 * 
 * 要求：
 * - 必须运行 FunASR 服务器（ws://localhost:10095）
 * - 不依赖浏览器 API，兼容所有浏览器
 * 
 * 优势：
 * - 中文识别准确率更高
 * - 支持离线运行（本地部署）
 * - 可自定义模型和优化
 * - 不依赖浏览器兼容性
 */

import { funasrService, FunASRResult } from './funasrService';
import { USE_MOCK_API } from './api';

export interface SpeechRecognitionResult {
    text: string;
    isFinal: boolean;
    confidence?: number;
}

export type OnResultCallback = (result: SpeechRecognitionResult) => void;
export type OnErrorCallback = (error: Error) => void;

export class SpeechRecognitionService {
    private isRecording = false;
    private onResult: OnResultCallback | null = null;
    private onError: OnErrorCallback | null = null;

    /**
     * 检查 FunASR 服务是否可用
     */
    async checkConnection(): Promise<boolean> {
        if (USE_MOCK_API) {
            // Check if browser supports speech recognition
            const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
            return !!SpeechRecognition;
        }
        return await funasrService.checkConnection();
    }

    /**
     * 开始语音识别
     * 仅使用 FunASR 服务
     */
    async startRecognition(
        onResult: OnResultCallback,
        onError?: OnErrorCallback
    ): Promise<void> {
        if (this.isRecording) {
            console.warn('[SpeechService] 已在录音中');
            return;
        }

        this.onResult = onResult;
        this.onError = onError || null;

        if (USE_MOCK_API) {
            console.log('[SpeechService] Using Browser Speech Recognition (Mock Mode)');
            this.startBrowserRecognition(onResult, onError);
            return;
        }

        // 检查 FunASR 服务是否可用
        const funasrAvailable = await funasrService.checkConnection();
        if (!funasrAvailable) {
            const err = new Error(
                'FunASR 服务不可用。请确保 FunASR 服务器正在运行。\n' +
                '启动方法: ./scripts/start_funasr.sh\n' +
                '或运行: python scripts/funasr_server.py'
            );
            this.onError?.(err);
            throw err;
        }

        try {
            console.log('[SpeechService] ============================================================');
            console.log('[SpeechService] 准备启动 FunASR 识别...');
            console.log('[SpeechService] onResult 回调:', this.onResult ? '✅ 已设置' : '❌ 未设置');
            console.log('[SpeechService] ============================================================');

            await funasrService.startRecognition(
                (result: FunASRResult) => {
                    // 详细日志
                    console.log('[SpeechService] ============================================================');
                    console.log('[SpeechService] 📥 收到 FunASR 识别结果:', {
                        text: result.text,
                        isFinal: result.isFinal,
                    });
                    console.log('[SpeechService] ============================================================');

                    // 转换 FunASR 结果格式
                    const speechResult = {
                        text: result.text,
                        isFinal: result.isFinal,
                        confidence: undefined, // FunASR 不提供置信度
                    };

                    // 输出到控制台，方便调试
                    if (speechResult.isFinal && speechResult.text) {
                        console.log('='.repeat(60));
                        console.log(`[SpeechService] ✅ 最终识别结果: "${speechResult.text}"`);
                        console.log(`[SpeechService] 准备传递给上层回调...`);
                        console.log('='.repeat(60));
                    }

                    // 检查回调是否存在
                    if (!this.onResult) {
                        console.error('[SpeechService] ❌ onResult 回调未设置！无法传递结果');
                    } else {
                        console.log(`[SpeechService] 调用上层 onResult 回调...`);
                        try {
                            this.onResult(speechResult);
                            console.log(`[SpeechService] ✅ 上层回调已调用`);
                        } catch (error) {
                            console.error('[SpeechService] ❌ 上层回调执行失败:', error);
                        }
                    }
                },
                (error: Error) => {
                    console.error('[SpeechService] ❌ 识别错误:', error);
                    this.onError?.(error);
                }
            );
            this.isRecording = true;
            console.log('[SpeechService] ✅ 使用 FunASR 开始识别');
        } catch (error) {
            const err = error instanceof Error ? error : new Error('FunASR 启动失败');
            console.error('[SpeechService] ❌ 启动失败:', err);
            this.onError?.(err);
            this.isRecording = false;
            throw err;
        }
    }

    /**
     * 停止语音识别
     */
    stopRecognition(): void {
        if (!this.isRecording) {
            return;
        }

        this.isRecording = false;

        if (USE_MOCK_API) {
            if (this.recognition) {
                this.recognition.stop();
                this.recognition = null;
            }
            console.log('[SpeechService-Browser] Stopped');
            return;
        }

        funasrService.stopRecognition();
        console.log('[SpeechService] 已停止识别');
    }

    /**
     * 检查是否正在录音
     */
    get recording(): boolean {
        return this.isRecording;
    }

    private recognition: SpeechRecognition | null = null;

    private startBrowserRecognition(onResult: OnResultCallback, onError?: OnErrorCallback): void {
        const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            const err = new Error('浏览器不支持 Web Speech API');
            onError?.(err);
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                const result = event.results[event.results.length - 1];
                if (result) {
                    const text = result[0].transcript;
                    const isFinal = result.isFinal;

                    console.log('[SpeechService-Browser] Result:', text, 'isFinal:', isFinal);
                    onResult({
                        text,
                        isFinal
                    });
                }
            };

            recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error('[SpeechService-Browser] Error:', event.error);
                onError?.(new Error(event.error));
            };

            recognition.onend = () => {
                if (this.isRecording) {
                    // Auto restart if supposedly still recording
                    try {
                        recognition.start();
                    } catch (e) {
                        // ignore 
                    }
                }
            };

            recognition.start();
            this.recognition = recognition;
            this.isRecording = true;
            console.log('[SpeechService-Browser] Started');
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            onError?.(err);
        }
    }
}

// 单例导出
export const speechService = new SpeechRecognitionService();
