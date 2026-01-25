/**
 * 语音识别服务 - 使用浏览器内置 Web Speech API
 * 完全免费，无需下载模型或运行服务器！
 * 
 * 支持浏览器: Chrome, Edge, Safari
 * 不支持: Firefox
 */

export interface SpeechRecognitionResult {
    text: string;
    isFinal: boolean;
    confidence?: number;
}

export type OnResultCallback = (result: SpeechRecognitionResult) => void;
export type OnErrorCallback = (error: Error) => void;

// 扩展Window接口以支持Web Speech API
declare global {
    interface Window {
        SpeechRecognition: typeof SpeechRecognition;
        webkitSpeechRecognition: typeof SpeechRecognition;
    }
}

export class SpeechRecognitionService {
    private recognition: SpeechRecognition | null = null;
    private isRecording = false;
    private onResult: OnResultCallback | null = null;
    private onError: OnErrorCallback | null = null;

    /**
     * 检查浏览器是否支持语音识别
     */
    static isSupported(): boolean {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    /**
     * 检查服务是否可用
     */
    async checkConnection(): Promise<boolean> {
        return SpeechRecognitionService.isSupported();
    }

    /**
     * 开始语音识别
     */
    async startRecognition(
        onResult: OnResultCallback,
        onError?: OnErrorCallback
    ): Promise<void> {
        if (!SpeechRecognitionService.isSupported()) {
            const err = new Error('您的浏览器不支持语音识别，请使用 Chrome 或 Edge');
            onError?.(err);
            throw err;
        }

        this.onResult = onResult;
        this.onError = onError || null;

        try {
            // 创建语音识别实例
            const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognitionAPI();

            // 配置
            this.recognition.lang = 'zh-CN'; // 中文
            this.recognition.continuous = true; // 持续识别
            this.recognition.interimResults = true; // 实时显示中间结果
            this.recognition.maxAlternatives = 1;

            // 处理识别结果
            this.recognition.onresult = (event: SpeechRecognitionEvent) => {
                const lastResult = event.results[event.results.length - 1];
                const transcript = lastResult[0].transcript;
                const confidence = lastResult[0].confidence;
                const isFinal = lastResult.isFinal;

                console.log('[WebSpeech] 识别结果:', transcript, isFinal ? '(最终)' : '(中间)');

                this.onResult?.({
                    text: transcript,
                    isFinal,
                    confidence,
                });
            };

            // 处理错误
            this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error('[WebSpeech] 错误:', event.error);

                let errorMessage = '语音识别错误';
                switch (event.error) {
                    case 'no-speech':
                        errorMessage = '未检测到语音，请说话';
                        break;
                    case 'audio-capture':
                        errorMessage = '无法访问麦克风';
                        break;
                    case 'not-allowed':
                        errorMessage = '请允许麦克风权限';
                        break;
                    case 'network':
                        errorMessage = '网络错误，请检查网络连接';
                        break;
                }

                this.onError?.(new Error(errorMessage));
            };

            // 处理结束
            this.recognition.onend = () => {
                console.log('[WebSpeech] 识别结束');
                // 如果还在录音状态，自动重启（处理长时间录音）
                if (this.isRecording) {
                    try {
                        this.recognition?.start();
                    } catch (e) {
                        this.isRecording = false;
                    }
                }
            };

            // 开始识别
            this.recognition.start();
            this.isRecording = true;
            console.log('[WebSpeech] 开始识别');

        } catch (error) {
            const err = error instanceof Error ? error : new Error('语音识别启动失败');
            this.onError?.(err);
            throw err;
        }
    }

    /**
     * 停止语音识别
     */
    stopRecognition(): void {
        this.isRecording = false;

        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // 忽略停止时的错误
            }
            this.recognition = null;
        }

        console.log('[WebSpeech] 已停止');
    }

    /**
     * 检查是否正在录音
     */
    get recording(): boolean {
        return this.isRecording;
    }
}

// 单例导出
export const speechService = new SpeechRecognitionService();
