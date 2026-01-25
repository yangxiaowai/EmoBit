/**
 * EmoBit API 服务层
 * 使用免费本地服务：Edge TTS (语音合成) + Ready Player Me (3D形象)
 */

import { VoiceProfile, AvatarModel } from '../types';
import { edgeTTSService } from './ttsService';

// 配置：设置为 false 以启用真实 API 调用
const USE_MOCK_API = false;

// --- Voice Service (使用本地Edge TTS - 免费) ---
export const VoiceService = {
  /**
   * 声音克隆功能（模拟实现）
   * 注意：免费方案不支持真正的声音克隆，但提供预设声音
   * 预设声音：xiaoxiao(女声), yunxi(男声), xiaoyi(童声)
   */
  cloneVoice: async (audioBlob: Blob, name: string): Promise<VoiceProfile> => {
    // 免费方案不支持真正的声音克隆
    // 返回预设声音配置
    console.log('[VoiceService] 使用免费Edge TTS，提供预设声音');

    return {
      id: 'voice_xiaoxiao', // 默认使用小小女声
      name: name || '小小 (女声)',
      status: 'ready',
      previewUrl: undefined,
    };
  },

  /**
   * 获取可用的预设声音列表
   */
  getAvailableVoices: (): VoiceProfile[] => {
    return [
      { id: 'xiaoxiao', name: '小小 (女声)', status: 'ready' },
      { id: 'yunxi', name: '云希 (男声)', status: 'ready' },
      { id: 'xiaoyi', name: '小艺 (童声)', status: 'ready' },
      { id: 'yunyang', name: '云扬 (新闻男声)', status: 'ready' },
    ];
  },

  /**
   * 使用Edge TTS进行文字转语音 - 完全免费
   * @param text 要转换的文本
   * @param voiceId 声音ID (xiaoxiao/yunxi/xiaoyi)
   * @returns 返回音频Blob的URL
   */
  synthesize: async (text: string, voiceId: string = 'xiaoxiao'): Promise<string> => {
    if (USE_MOCK_API) {
      return 'mock_audio_url.mp3';
    }

    try {
      const result = await edgeTTSService.synthesize(text, voiceId as any);

      if (result.success && result.audioUrl) {
        return result.audioUrl;
      }

      console.warn('[VoiceService] Edge TTS合成失败:', result.error);
      return '';
    } catch (error) {
      console.error('[VoiceService] 语音合成失败:', error);
      return '';
    }
  },

  /**
   * 直接播放语音
   */
  speak: async (text: string, voiceId: string = 'xiaoxiao'): Promise<void> => {
    try {
      await edgeTTSService.speak(text, voiceId as any);
    } catch (error) {
      console.error('[VoiceService] 播放语音失败:', error);
    }
  },

  /**
   * 检查TTS服务是否可用
   */
  checkAvailability: async (): Promise<boolean> => {
    return edgeTTSService.checkConnection();
  },
};

// --- Avatar Generation Service (Ready Player Me - 免费100/月) ---
export const AvatarService = {
  /**
   * 使用Ready Player Me API从照片生成3D头像
   * @param photoFile 照片文件 (推荐正面清晰照片)
   */
  generateAvatar: async (photoFile: File): Promise<AvatarModel> => {
    if (USE_MOCK_API) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            id: 'avatar_' + Math.random().toString(36).substr(2, 9),
            meshUrl: 'https://models.readyplayer.me/64b7...glb',
            thumbnailUrl: URL.createObjectURL(photoFile),
            status: 'ready'
          });
        }, 5000);
      });
    }

    const apiKey = import.meta.env.VITE_RPM_API_KEY;
    const subdomain = import.meta.env.VITE_RPM_SUBDOMAIN || 'emobit';

    if (!apiKey || apiKey === 'your_ready_player_me_api_key_here') {
      console.warn('[AvatarService] Ready Player Me API Key未配置，使用模拟模式');
      return {
        id: 'avatar_mock_' + Date.now(),
        meshUrl: '',
        thumbnailUrl: URL.createObjectURL(photoFile),
        status: 'ready',
      };
    }

    try {
      // Step 1: 将图片转为Base64
      const base64Image = await fileToBase64(photoFile);

      // Step 2: 创建头像草稿
      const createResponse = await fetch('https://api.readyplayer.me/v2/avatars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          partner: subdomain,
          bodyType: 'fullbody',
          base64Image: base64Image.split(',')[1], // 移除data:image/...;base64,前缀
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.message || '创建头像失败');
      }

      const createData = await createResponse.json();
      const avatarId = createData.data?.id || createData.id;

      // Step 3: 保存头像草稿
      await fetch(`https://api.readyplayer.me/v2/avatars/${avatarId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({}),
      });

      // Step 4: 构建GLB模型URL
      const meshUrl = `https://models.readyplayer.me/${avatarId}.glb`;
      const thumbnailUrl = `https://models.readyplayer.me/${avatarId}.png`;

      return {
        id: avatarId,
        meshUrl,
        thumbnailUrl,
        status: 'ready',
      };
    } catch (error) {
      console.error('[AvatarService] 头像生成失败:', error);
      throw error;
    }
  },

  /**
   * 获取头像GLB模型URL
   */
  getAvatarModelUrl: (avatarId: string, options?: {
    quality?: 'low' | 'medium' | 'high';
    morphTargets?: string[];
  }): string => {
    let url = `https://models.readyplayer.me/${avatarId}.glb`;
    const params: string[] = [];

    if (options?.quality) {
      const qualityMap = { low: 'low', medium: 'medium', high: 'high' };
      params.push(`quality=${qualityMap[options.quality]}`);
    }

    if (options?.morphTargets?.length) {
      params.push(`morphTargets=${options.morphTargets.join(',')}`);
    }

    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    return url;
  },

  /**
   * 预加载头像模型（检查是否可访问）
   */
  preloadAvatar: async (avatarId: string): Promise<boolean> => {
    try {
      const response = await fetch(
        `https://models.readyplayer.me/${avatarId}.glb`,
        { method: 'HEAD' }
      );
      return response.ok;
    } catch {
      return false;
    }
  },
};

// --- Helper Functions ---

/**
 * 将File转换为Base64字符串
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * API健康检查
 */
export const ApiHealth = {
  checkElevenLabs: async (): Promise<boolean> => {
    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === 'your_elevenlabs_api_key_here') return false;

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey },
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  checkReadyPlayerMe: async (): Promise<boolean> => {
    const apiKey = import.meta.env.VITE_RPM_API_KEY;
    if (!apiKey || apiKey === 'your_ready_player_me_api_key_here') return false;

    try {
      // 简单检查API是否可达
      const response = await fetch('https://api.readyplayer.me/v2/avatars', {
        method: 'OPTIONS',
      });
      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  },

  checkAll: async (): Promise<{
    elevenLabs: boolean;
    readyPlayerMe: boolean;
    amap: boolean;
    funAsr: boolean;
  }> => {
    const [elevenLabs, readyPlayerMe] = await Promise.all([
      ApiHealth.checkElevenLabs(),
      ApiHealth.checkReadyPlayerMe(),
    ]);

    // 高德地图检查
    const amapKey = import.meta.env.VITE_AMAP_KEY;
    const amap = !!(amapKey && amapKey !== 'your_amap_key_here');

    // FunASR检查
    const funAsrUrl = import.meta.env.VITE_FUNASR_WS_URL;
    const funAsr = !!(funAsrUrl && funAsrUrl !== 'ws://localhost:10095') ||
      funAsrUrl === 'ws://localhost:10095';

    return { elevenLabs, readyPlayerMe, amap, funAsr };
  },
};
