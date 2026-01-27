/**
 * EmoBit API 服务层
 * 使用语音克隆服务 (IndexTTS2) + Ready Player Me (3D形象)
 */

import { VoiceProfile, AvatarModel } from '../types';
import { voiceCloneService } from './voiceCloneService';
import { voiceSelectionService } from './voiceSelectionService';

// 配置：设置为 false 以启用真实 API 调用
const USE_MOCK_API = false;

/** 克隆常用句，预拉后服务端缓存命中可近即时播放 */
const COMMON_CLONE_PHRASES = [
  '你好，我是你的数字人助手',
  '今天天气不错，24度晴朗。出门记得戴帽子防晒哦~',
  '好的，我来帮您导航。',
  '好的，我来帮您看看药。',
  '好的，让我们一起看看老照片吧~',
  '不客气，能帮到您是我的荣幸！',
  '抱歉，我没太听清楚，您能再说一遍吗？',
];

// --- Voice Service (使用语音克隆服务 - IndexTTS2) ---
export const VoiceService = {
  /**
   * 声音克隆功能 - 使用 IndexTTS2
   * @param audioBlob 音频文件 (须 ≥10 秒，WAV；前端会先整合/转换)
   * @param name 声音名称
   * @returns 返回克隆的声音配置，并会存入可切换列表
   */
  cloneVoice: async (audioBlob: Blob, name: string): Promise<VoiceProfile> => {
    try {
      console.log('[VoiceService] cloneVoice: 检查服务连接...');
      const isAvailable = await voiceCloneService.checkConnection();
      
      if (!isAvailable) {
        console.warn('[VoiceService] 语音克隆服务不可用');
        throw new Error('语音克隆服务不可用，请确保语音克隆服务器正在运行');
      }

      const voiceId = `cloned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('[VoiceService] cloneVoice: 注册声音', { voiceId, name, blobSize: audioBlob.size });
      
      const config = await voiceCloneService.registerVoice(
        audioBlob,
        voiceId,
        name || '克隆声音'
      );

      console.log('[VoiceService] cloneVoice: 完成', config);
      return {
        id: voiceId,
        name: config.name,
        status: config.status,
        previewUrl: undefined,
        isCloned: true,
        voiceId: voiceId,
      };
    } catch (error) {
      console.error('[VoiceService] 声音克隆失败:', error);
      return {
        id: 'voice_xiaoxiao',
        name: name || '小小 (女声)',
        status: 'failed',
        previewUrl: undefined,
        isCloned: false,
      };
    }
  },

  /**
   * 获取可用的预设声音列表（已废弃，只返回空数组）
   * 现在只支持克隆声音
   */
  getAvailableVoices: (): VoiceProfile[] => {
    return [];
  },

  /**
   * 使用克隆声音进行文字转语音
   * @param text 要转换的文本
   * @param voiceId 可选。不传则使用当前选中的克隆音色
   * @param voiceProfile 可选，用于判断是否为克隆声音
   * @returns 返回音频 Blob 的 URL
   */
  synthesize: async (
    text: string,
    voiceId?: string,
    voiceProfile?: VoiceProfile
  ): Promise<string> => {
    if (USE_MOCK_API) {
      return 'mock_audio_url.mp3';
    }

    const id = voiceId ?? voiceSelectionService.getSelectedVoiceId();
    if (!id || !id.startsWith('cloned_')) {
      throw new Error('必须使用克隆声音，请先克隆一个声音');
    }

    try {
      const result = await voiceCloneService.synthesize(text, id, 'zh');
      if (result.success && result.audioUrl) return result.audioUrl;
      throw new Error(result.error || '语音合成失败');
    } catch (error) {
      console.error('[VoiceService] 语音合成失败:', error);
      throw error;
    }
  },

  /**
   * 直接播放语音。使用当前选中的克隆音色。
   * 对话、讲解回忆、相册故事、提醒等均使用选中音色，以体现数字人个性化。
   * onEnded 播完或出错时回调。
   * @param options.forceEdgeTTS 若为 true，强制用 Edge TTS（忽略克隆）；仅用于特殊降级或“极速模式”等可选场景。
   */
  speak: async (
    text: string,
    voiceId?: string,
    voiceProfile?: VoiceProfile,
    onEnded?: () => void
  ): Promise<void> => {
    try {
      const id = voiceId ?? voiceSelectionService.getSelectedVoiceId();
      if (!id || !id.startsWith('cloned_')) {
        throw new Error('必须使用克隆声音，请先克隆一个声音');
      }

      console.log(`[VoiceService] 播放语音: "${text}" (使用克隆，voiceId: ${id})`);
      console.log('[VoiceService] 使用语音克隆服务');
      await voiceCloneService.speak(text, id, 'zh', onEnded);
      console.log('[VoiceService] ✅ 语音播放请求已发送');
    } catch (error) {
      console.error('[VoiceService] ❌ 播放语音失败:', error);
      console.error('[VoiceService] 错误详情:', error instanceof Error ? error.stack : String(error));
      onEnded?.();
    }
  },

  stop: (): void => {
    voiceCloneService.stop();
  },

  /**
   * 按句优先播放：将文本按 。！？\n 拆成多句，先播第一句（缩短首音延迟），再依次播剩余句。
   * 适用克隆音色等合成较慢场景，首句较短可更快听到回复。
   */
  speakSegments: async (
    text: string,
    voiceId?: string,
    voiceProfile?: VoiceProfile,
    onEnded?: () => void
  ): Promise<void> => {
    const t = text.trim();
    if (!t) {
      onEnded?.();
      return;
    }
    const segs = t.split(/[。！？\n]+/).map((s) => s.trim()).filter(Boolean);
    if (segs.length <= 1) {
      return VoiceService.speak(t, voiceId, voiceProfile, onEnded);
    }
    const id = voiceId ?? voiceSelectionService.getSelectedVoiceId();
    if (!id) {
      throw new Error('必须使用克隆声音，请先克隆一个声音');
    }
    
    const run = async (i: number): Promise<void> => {
      if (i >= segs.length) {
        onEnded?.();
        return;
      }
      try {
        // 使用 Promise 等待当前句播放完成后再播放下一句
        await new Promise<void>((resolve, reject) => {
          VoiceService.speak(segs[i], id, voiceProfile, () => {
            resolve();
          }).catch(reject);
        });
        // 当前句播放完成后，继续播放下一句
        await run(i + 1);
      } catch {
        onEnded?.();
      }
    };
    run(0);
  },

  /**
   * 预拉克隆常用句，填充服务端缓存，命中时合成近即时。
   * 在选中克隆音色后调用（如设为当前、进入老人端时）。
   */
  preloadClonePhrases: (voiceId: string): void => {
    if (!voiceId.startsWith('cloned_')) return;
    voiceCloneService.preloadPhrases(voiceId, COMMON_CLONE_PHRASES).catch(() => {});
  },

  /**
   * 获取所有可用的声音（只返回克隆的声音）
   */
  getAllVoices: async (): Promise<VoiceProfile[]> => {
    try {
      // 获取克隆的声音列表
      const clonedVoices = await voiceCloneService.listVoices();
      const clonedProfiles: VoiceProfile[] = clonedVoices.map(v => ({
        id: v.id,
        name: v.name,
        status: v.status,
        isCloned: true,
        voiceId: v.id,
      }));
      
      return clonedProfiles;
    } catch (error) {
      console.warn('[VoiceService] 获取克隆声音列表失败:', error);
      return [];
    }
  },

  /**
   * 检查TTS服务是否可用（检查语音克隆服务）
   */
  checkAvailability: async (): Promise<boolean> => {
    return voiceCloneService.checkConnection();
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
