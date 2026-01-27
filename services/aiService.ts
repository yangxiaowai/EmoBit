/**
 * AI 对话服务
 * 接入 Gemini API 实现智能对话
 * 支持老人档案记忆和个性化回复
 */

// 老人档案数据结构
export interface ElderlyProfile {
    name: string;                    // 姓名
    nickname: string;                // 昵称 (如：张爷爷)
    age: number;                     // 年龄
    gender: 'male' | 'female';
    familyMembers: {                 // 家庭成员
        name: string;
        relation: string;            // 儿子、女儿、孙子等
        phone?: string;
    }[];
    healthConditions: string[];      // 健康状况
    medications: {                   // 用药信息
        name: string;
        dosage: string;
        times: string[];             // 服用时间
    }[];
    preferences: {                   // 偏好
        favoriteFood: string[];
        hobbies: string[];
        sleepTime: string;
        wakeTime: string;
    };
    importantDates: {               // 重要日期
        date: string;
        event: string;
    }[];
    memories: {                     // 记忆片段
        content: string;
        date: string;
        tags: string[];
    }[];
    homeAddress: string;            // 家庭住址
}

// 对话历史
interface ChatMessage {
    role: 'user' | 'model';
    content: string;
    timestamp: Date;
}

// AI 服务响应
export interface AIResponse {
    text: string;
    intent?: string;
    shouldTriggerAction?: 'nav' | 'meds' | 'memory' | 'call' | null;
    actionData?: any;
}

class AIService {
    private apiKey: string = '';
    private profile: ElderlyProfile | null = null;
    private chatHistory: ChatMessage[] = [];
    private maxHistoryLength = 20;

    constructor() {
        // 从环境变量加载 API Key (Groq)
        this.apiKey = import.meta.env.VITE_GROQ_API_KEY || '';
        // 加载老人档案
        this.loadProfile();
    }

    /**
     * 设置 API Key
     */
    setApiKey(key: string): void {
        this.apiKey = key;
        localStorage.setItem('emobit_groq_key', key);
    }

    /**
     * 获取 API Key
     */
    getApiKey(): string {
        if (!this.apiKey) {
            this.apiKey = localStorage.getItem('emobit_groq_key') || '';
        }
        return this.apiKey;
    }

    /**
     * 检查是否已配置
     */
    isConfigured(): boolean {
        return !!this.getApiKey();
    }

    /**
     * 设置老人档案
     */
    setProfile(profile: ElderlyProfile): void {
        this.profile = profile;
        localStorage.setItem('emobit_profile', JSON.stringify(profile));
    }

    /**
     * 获取老人档案
     */
    getProfile(): ElderlyProfile | null {
        return this.profile;
    }

    /**
     * 加载老人档案
     */
    private loadProfile(): void {
        try {
            const saved = localStorage.getItem('emobit_profile');
            if (saved) {
                this.profile = JSON.parse(saved);
            } else {
                // 默认档案（演示用）
                this.profile = this.getDefaultProfile();
            }
        } catch (e) {
            console.warn('[AI] Failed to load profile:', e);
            this.profile = this.getDefaultProfile();
        }
    }

    /**
     * 默认老人档案（演示用）
     */
    private getDefaultProfile(): ElderlyProfile {
        return {
            name: '张建国',
            nickname: '张爷爷',
            age: 75,
            gender: 'male',
            familyMembers: [
                { name: '张明', relation: '儿子', phone: '13800138001' },
                { name: '张丽', relation: '女儿', phone: '13800138002' },
                { name: '小明', relation: '孙子' },
            ],
            healthConditions: ['高血压', '轻度糖尿病'],
            medications: [
                { name: '阿司匹林', dosage: '100mg', times: ['08:00'] },
                { name: '二甲双胍', dosage: '500mg', times: ['08:00', '18:00'] },
            ],
            preferences: {
                favoriteFood: ['饺子', '红烧肉', '小米粥'],
                hobbies: ['下象棋', '听京剧', '遛弯'],
                sleepTime: '21:00',
                wakeTime: '06:00',
            },
            importantDates: [
                { date: '03-15', event: '老伴生日' },
                { date: '10-01', event: '结婚纪念日' },
            ],
            memories: [
                { content: '1995年在纺织厂获得劳动模范称号', date: '1995', tags: ['工作'] },
                { content: '儿子张明在北京工作，是工程师', date: '', tags: ['家人'] },
            ],
            homeAddress: '北京市朝阳区幸福小区3号楼2单元401室',
        };
    }

    /**
     * 构建系统提示词
     */
    private buildSystemPrompt(): string {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });

        let prompt = `你是"小智"，一个专门陪伴老年人的AI助手。你的语气温暖、亲切、有耐心，像家人一样关心老人。

当前时间：${dateStr} ${timeStr}

【重要规则】
1. 用简单易懂的语言，避免专业术语
2. 回复简短，每次不超过50个字
3. 语气亲切，可以用"您"称呼老人
4. 关心老人的身体和心情
5. 必要时提醒老人吃药、喝水、休息
6. 如果老人问到需要导航、吃药、看照片的事情，在回复末尾加上特殊标记：[ACTION:nav]、[ACTION:meds]、[ACTION:memory]

`;

        if (this.profile) {
            prompt += `【老人档案】
姓名：${this.profile.nickname}（${this.profile.name}）
年龄：${this.profile.age}岁
健康状况：${this.profile.healthConditions.join('、')}
用药：${this.profile.medications.map(m => `${m.name}(${m.times.join('、')})`).join('、')}
家人：${this.profile.familyMembers.map(f => `${f.name}(${f.relation})`).join('、')}
爱好：${this.profile.preferences.hobbies.join('、')}
喜欢的食物：${this.profile.preferences.favoriteFood.join('、')}
作息：${this.profile.preferences.wakeTime}起床，${this.profile.preferences.sleepTime}睡觉
家庭住址：${this.profile.homeAddress}

【记忆片段】
${this.profile.memories.map(m => `- ${m.content}`).join('\n')}
`;
        }

        return prompt;
    }

    /**
     * 发送消息并获取回复
     */
    async chat(userMessage: string): Promise<AIResponse> {
        console.log('[AI] ============================================================');
        console.log('[AI] 收到用户消息:', userMessage);
        console.log('[AI] ============================================================');

        // 添加到历史
        this.chatHistory.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
        });

        // 保持历史长度
        if (this.chatHistory.length > this.maxHistoryLength) {
            this.chatHistory = this.chatHistory.slice(-this.maxHistoryLength);
        }

        // 🚀 本地优先策略：先检查是否可以本地回答
        const localResponse = this.tryLocalResponse(userMessage);
        if (localResponse) {
            console.log('[AI] ✅ 使用本地回复（节省API调用）');
            console.log('[AI] 回复内容:', localResponse.text);
            console.log('[AI] ============================================================');
            return localResponse;
        }

        // 如果没有 API Key，使用通用本地回复
        if (!this.isConfigured()) {
            console.log('[AI] ⚠️ 未配置API Key，使用本地回复');
            const response = this.getLocalResponse(userMessage);
            console.log('[AI] 回复内容:', response.text);
            console.log('[AI] ============================================================');
            return response;
        }

        console.log('[AI] 🔄 复杂问题，调用 Groq API...');

        try {
            const response = await this.callGroqAPI(userMessage);
            console.log('[AI] ✅ Groq API 回复:', response.text);
            console.log('[AI] ============================================================');

            // 添加回复到历史
            this.chatHistory.push({
                role: 'model',
                content: response.text,
                timestamp: new Date(),
            });

            return response;
        } catch (error) {
            console.error('[AI] ❌ Gemini API 调用失败:', error);
            console.error('[AI] 错误详情:', error instanceof Error ? error.stack : String(error));
            // 回退到本地回复
            console.log('[AI] ⚠️ 使用本地回复作为回退方案');
            const fallbackResponse = this.getLocalResponse(userMessage);
            console.log('[AI] 本地回复内容:', fallbackResponse.text);
            console.log('[AI] ============================================================');
            return fallbackResponse;
        }
    }

    /**
     * 尝试本地回答（能处理就不调用API）
     */
    private tryLocalResponse(userMessage: string): AIResponse | null {
        const lowerText = userMessage.toLowerCase();
        const now = new Date();
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[now.getDay()];

        // 天气相关
        if (lowerText.includes('天气') || lowerText.includes('冷') || lowerText.includes('热') || lowerText.includes('下雨')) {
            return { text: '今天天气不错，24度晴朗。出门记得戴帽子防晒哦~' };
        }

        // 时间相关
        if (lowerText.includes('几点') || lowerText.includes('时间')) {
            const h = now.getHours();
            const m = now.getMinutes();
            return { text: `现在是${h}点${m > 0 ? m + '分' : '整'}。` };
        }

        // 星期相关
        if (lowerText.includes('星期') || lowerText.includes('周几') || lowerText.includes('礼拜')) {
            return { text: `今天是星期${weekday}，${now.getMonth() + 1}月${now.getDate()}号。` };
        }

        // 日期相关
        if (lowerText.includes('几号') || lowerText.includes('日期')) {
            return { text: `今天是${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}号，星期${weekday}。` };
        }

        // 问候相关 - 只处理非常简短的问候（不超过5个字）
        if (userMessage.length <= 5 && /^(你好|早上好|下午好|晚上好|嗨|hello|hi)$/i.test(lowerText)) {
            const hour = now.getHours();
            const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
            return { text: `${greeting}，${this.profile?.nickname || '您'}！今天感觉怎么样？` };
        }

        // 导航相关 - 触发场景
        if (lowerText.includes('去') && (lowerText.includes('怎么走') || lowerText.includes('导航') || lowerText.length < 15)) {
            return { text: '好的，我来帮您导航。', shouldTriggerAction: 'nav' };
        }

        // 药物相关 - 触发场景
        if (lowerText.includes('药') || lowerText.includes('吃药')) {
            return { text: '好的，我来帮您看看药。', shouldTriggerAction: 'meds' };
        }

        // 照片/回忆相关 - 触发场景
        if (this.isExplicitMemoryRequest(lowerText, userMessage.length)) {
            return { text: '好的，让我们一起看看老照片吧~', shouldTriggerAction: 'memory' };
        }

        // 感谢相关
        if (lowerText.includes('谢谢') || lowerText.includes('多谢')) {
            return { text: '不客气，能帮到您是我的荣幸！' };
        }

        // 无法本地回答，返回null让API处理
        return null;
    }

    /**
     * 调用 Groq API（OpenAI 兼容格式）
     */
    private async callGroqAPI(userMessage: string): Promise<AIResponse> {
        const apiKey = this.getApiKey();
        const model = 'llama-3.1-8b-instant'; // Groq 免费模型

        const url = 'https://api.groq.com/openai/v1/chat/completions';

        // 构建 OpenAI 格式的消息
        const messages = [
            {
                role: 'system',
                content: this.buildSystemPrompt()
            },
            ...this.chatHistory.slice(-10).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            })),
            {
                role: 'user',
                content: userMessage
            }
        ];

        console.log(`[AI] 调用 Groq API (${model})...`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.7,
                max_tokens: 200,
            }),
        });

        // 处理429限流错误
        if (response.status === 429) {
            console.warn('[AI] Groq API 限流 (429)，使用本地回复');
            return this.getLocalResponse(userMessage);
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[AI] Groq API 错误:', response.status, errorText);
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '抱歉，我没听清楚。';

        // 解析动作标记
        const actionMatch = text.match(/\[ACTION:(\w+)\]/);
        const cleanText = text.replace(/\[ACTION:\w+\]/g, '').trim();

        return {
            text: cleanText,
            shouldTriggerAction: actionMatch ? actionMatch[1] as any : null,
        };
    }

    /**
     * 本地回复（无API时使用）
     */
    private getLocalResponse(userMessage: string): AIResponse {
        console.log('[AI] 使用本地回复，API可能未配置或调用失败');
        const now = new Date();
        const lowerText = userMessage.toLowerCase();

        // 日期/星期
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[now.getDay()];

        // ⚠️ 匹配顺序很重要！更具体的词要放前面

        // 天气 (必须在"今天"之前检查，因为用户可能说"今天天气")
        if (lowerText.includes('天气') || lowerText.includes('冷') || lowerText.includes('热') || lowerText.includes('下雨')) {
            return { text: '今天天气不错，24度晴朗。出门记得戴帽子哦~' };
        }

        // 导航
        if (lowerText.includes('去') || lowerText.includes('导航') || lowerText.includes('怎么走')) {
            return { text: '好的，我来帮您导航。', shouldTriggerAction: 'nav' };
        }

        // 药物
        if (lowerText.includes('药') || lowerText.includes('吃药')) {
            return { text: '好的，我来帮您看看药。', shouldTriggerAction: 'meds' };
        }

        // 照片/回忆
        if (lowerText.includes('照片') || lowerText.includes('回忆')) {
            return { text: '好的，让我们看看老照片。', shouldTriggerAction: 'memory' };
        }

        // 星期
        if (lowerText.includes('星期') || lowerText.includes('周几') || lowerText.includes('礼拜')) {
            return { text: `今天是星期${weekday}，${now.getMonth() + 1}月${now.getDate()}号。` };
        }

        // 日期 (只有明确问日期时才回复)
        if (lowerText.includes('几号') || lowerText.includes('日期') || (lowerText.includes('今天') && lowerText.length < 5)) {
            return { text: `今天是${now.getMonth() + 1}月${now.getDate()}号，星期${weekday}。` };
        }

        // 时间
        if (lowerText.includes('几点') || lowerText.includes('时间') || lowerText.includes('现在')) {
            return { text: `现在是${now.getHours()}点${now.getMinutes()}分。` };
        }

        // 问候
        if (lowerText.includes('你好') || lowerText.includes('早上好') || lowerText.includes('晚上好')) {
            return { text: `${this.profile?.nickname || '您'}好！今天感觉怎么样？` };
        }

        // 通用回复
        return {
            text: `${this.profile?.nickname || '张爷爷'}，我听到您说"${userMessage}"。有什么我能帮您的吗？`
        };
    }

    /**
     * 添加记忆片段
     */
    addMemory(content: string, tags: string[] = []): void {
        if (this.profile) {
            this.profile.memories.push({
                content,
                date: new Date().toLocaleDateString('zh-CN'),
                tags,
            });
            this.setProfile(this.profile);
        }
    }

    /**
     * 清除对话历史
     */
    clearHistory(): void {
        this.chatHistory = [];
    }

    /**
     * 检查是否为明确的回忆唤起请求
     */
    private isExplicitMemoryRequest(text: string, length: number): boolean {
        // 关键词
        const keywords = ['照片', '回忆', '老照片', '相册', '看看', '翻翻'];

        // 必须包含关键词
        const hasKeyword = keywords.some(k => text.includes(k));

        // 长度限制 (防止"我不记得照片放哪了"这种长句子误触)
        const isShort = length <= 10;

        // 排除词 (防止"不要看照片"误触)
        const isNegative = text.includes('不') || text.includes('别');

        return hasKeyword && isShort && !isNegative;
    }
}

// 单例导出
export const aiService = new AIService();
