/**
 * Edge TTS 语音合成服务
 * 使用本地Python服务调用微软Edge TTS - 完全免费
 */

export interface TTSResult {
    success: boolean;
    audioUrl?: string;
    error?: string;
}

export type VoiceType = 'xiaoxiao' | 'yunxi' | 'xiaoyi' | 'yunyang';

class EdgeTTSService {
    private wsUrl: string;
    private ws: WebSocket | null = null;
    private pendingRequests: Map<number, {
        resolve: (result: TTSResult) => void;
        reject: (error: Error) => void;
    }> = new Map();
    private requestId = 0;

    constructor() {
        this.wsUrl = import.meta.env.VITE_EDGE_TTS_WS_URL || 'ws://localhost:10096';
    }

    /**
     * 检查服务是否可用
     */
    async checkConnection(): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const testWs = new WebSocket(this.wsUrl);
                testWs.onopen = () => {
                    testWs.close();
                    resolve(true);
                };
                testWs.onerror = () => resolve(false);
                setTimeout(() => {
                    testWs.close();
                    resolve(false);
                }, 3000);
            } catch {
                resolve(false);
            }
        });
    }

    /**
     * 将文本转换为语音
     * @param text 要转换的文本
     * @param voice 声音类型
     * @returns 音频URL (blob URL)
     */
    async synthesize(text: string, voice: VoiceType = 'xiaoxiao'): Promise<TTSResult> {
        return new Promise((resolve, reject) => {
            try {
                const ws = new WebSocket(this.wsUrl);

                ws.onopen = () => {
                    ws.send(JSON.stringify({ text, voice }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        if (data.error) {
                            resolve({ success: false, error: data.error });
                        } else if (data.success && data.audio) {
                            // 将Base64转换为Blob URL
                            const audioBlob = this.base64ToBlob(data.audio, 'audio/mpeg');
                            const audioUrl = URL.createObjectURL(audioBlob);
                            resolve({ success: true, audioUrl });
                        }
                    } catch (e) {
                        resolve({ success: false, error: '解析响应失败' });
                    } finally {
                        ws.close();
                    }
                };

                ws.onerror = () => {
                    resolve({ success: false, error: 'TTS服务连接失败，请确保edge_tts_server.py已启动' });
                };

                // 10秒超时
                setTimeout(() => {
                    ws.close();
                    resolve({ success: false, error: '请求超时' });
                }, 10000);

            } catch (error) {
                resolve({ success: false, error: '无法连接TTS服务' });
            }
        });
    }

    private currentAudio: HTMLAudioElement | null = null;

    /**
     * 直接播放语音
     */
    async speak(text: string, voice: VoiceType = 'xiaoxiao', onEnded?: () => void): Promise<void> {
        // Stop any currently playing audio
        this.stop();

        const result = await this.synthesize(text, voice);

        if (result.success && result.audioUrl) {
            this.currentAudio = new Audio(result.audioUrl);
            try {
                await this.currentAudio.play();

                // 播放完成后释放资源
                this.currentAudio.onended = () => {
                    URL.revokeObjectURL(result.audioUrl!);
                    if (this.currentAudio?.src === result.audioUrl) {
                        this.currentAudio = null;
                    }
                    if (onEnded) {
                        onEnded();
                    }
                };
            } catch (err) {
                console.error("Audio playback failed", err);
                if (onEnded) onEnded();
            }
        } else {
            console.error('[EdgeTTS] 语音合成失败:', result.error);
            if (onEnded) onEnded();
        }
    }

    /**
     * 停止语音播放
     */
    stop(): void {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
    }

    /**
     * Base64转Blob
     */
    private base64ToBlob(base64: string, mimeType: string): Blob {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
}

// 单例导出
export const edgeTTSService = new EdgeTTSService();
