const OpenAI = require('openai');
const aiTools = require('../aifix/ai');

const ai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: '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',
    timeout: 30000,   // ✅ FIX: 30 ثانية timeout — ما يبقاش راكد غير هكا
    maxRetries: 2,    // ✅ FIX: يعاود يحاول مرتين تلقائياً
});

async function askGemini(uid, msg, imageBase64 = null) {
    const history = aiTools.getHistory(uid);
    let userContent;

    if (imageBase64) {
        // ✅ FIX: content دايما array ملا كاين صورة
        userContent = [
            { type: "text", text: msg || "شوف هاد التصويرة وقوليا شنو كاين." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
        ];
    } else {
        // ✅ FIX: نص عادي بدون array — أسرع
        userContent = msg;
    }

    try {
        const r = await ai.chat.completions.create({
            model: 'google/gemini-2.0-flash-001',
            max_tokens: 1024,
            messages: [
                { role: 'system', content: aiTools.systemPrompt },
                ...history,
                { role: 'user', content: userContent }
            ],
        });

        const reply = r.choices[0]?.message?.content;
        if (!reply) throw new Error('Empty response from API');

        aiTools.saveToHistory(uid, 'user', msg || "[صورة]");
        aiTools.saveToHistory(uid, 'assistant', reply);
        return aiTools.format(reply);

    } catch (e) {
        console.error('❌ Gemini Error:', e.message);

        // ✅ FIX: رسائل خطأ واضحة حسب نوع المشكل
        if (e.message?.includes('timeout') || e.code === 'ETIMEDOUT' || e.name?.includes('Timeout')) {
            return "السيرفر ثقيل بزاف، عاود صيفط الميساج دابا 😒";
        }
        if (e.status === 429) {
            return "الذكاء الاصطناعي مشغول بزاف، صبر شوية وعاود 😅";
        }
        if (e.status === 401 || e.status === 403) {
            return "مشكل في المفتاح ديال API، كلم صاحب البوت 🔑";
        }
        return "هاد الساعة السيرفر عيان، جرب من بعد! 😒";
    }
}

module.exports = { askGemini };
