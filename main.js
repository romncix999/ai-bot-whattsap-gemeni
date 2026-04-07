const { askGemini } = require('./ai/gemeni');
const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

async function handleMessages(client, msg) {
    try {
        const text = msg.body.trim();

        // ✅ FIX 1: في الغروبات نستخدمو msg.author (الشخص اللي كتب)
        // مشي msg.from (اللي هو ID ديال الغروب)
        const isGroup = msg.from.endsWith('@g.us');
        const user = isGroup ? (msg.author || msg.from) : msg.from;

        let chat;
        try {
            chat = await msg.getChat();
        } catch (e) {
            console.error('⚠️ getChat error:', e.message);
            return;
        }

        // ─── .menu ───────────────────────────────────────────────────
        if (text.toLowerCase() === '.menu') {
            const menuMsg = `
╭━━━〔 🤖 *SABER BOT* 〕━━━╮
┃
┃  ✨ *مرحباً بيك أ عشيري*
┃
┃ 🛠 *الأوامر:*
┃ 📝 *.ai* + هضرتك (جاوب مباشر)
┃ 📸 صيفط صورة + *.ai* (تحليل بصري)
┃
┃ 💡 *سابر كيهضر بحال بنادم، جرب تعصبو!*
┃
╰━━━━━━━━━━━━━━━━━━━━╯`.trim();

            const imgPath = path.join(__dirname, 'img', '1.png');
            try {
                if (fs.existsSync(imgPath)) {
                    const media = MessageMedia.fromFilePath(imgPath);
                    // ✅ FIX: في الغروبات نستخدمو msg.reply باش يجي في الغروب
                    if (isGroup) {
                        await msg.reply(menuMsg);
                    } else {
                        await client.sendMessage(user, media, { caption: menuMsg });
                    }
                } else {
                    await msg.reply(menuMsg);
                }
            } catch (e) {
                console.error('⚠️ menu send error:', e.message);
                await msg.reply(menuMsg).catch(() => {});
            }
            return;
        }

        // ─── .ai ─────────────────────────────────────────────────────
        if (text.toLowerCase().startsWith('.ai')) {
            let query = text.replace(/^\.ai\s*/i, '').trim();

            // ✅ FIX 2: sendStateTyping دايما في try/catch — في الغروبات كيطيح
            try { await chat.sendStateTyping(); } catch {}

            if (msg.hasMedia) {
                let media;
                try {
                    media = await msg.downloadMedia();
                } catch (e) {
                    console.error('⚠️ downloadMedia error:', e.message);
                    return msg.reply("مقدرتش نحمل الصورة، عاود جرب 😒").catch(() => {});
                }
                if (!media) return msg.reply("مقدرتش نحمل الصورة، عاود جرب 😒").catch(() => {});
                const res = await askGemini(user, query || "شوف هاد التصويرة وقوليا شنو كاين.", media.data);
                await msg.reply(res).catch(() => {});

            } else {
                if (!query) {
                    return msg.reply("كتب شي حاجة، مالك ساكت؟ 😒").catch(() => {});
                }
                const res = await askGemini(user, query);
                await msg.reply(res).catch(() => {});
            }
        }

    } catch (e) {
        // ✅ FIX 3: catch كلشي باش البوت مايوقفش
        console.error('❌ handleMessages crash:', e.message);
        try { await msg.reply("حدث خطأ، عاود المحاولة 😒"); } catch {}
    }
}

module.exports = { handleMessages };
