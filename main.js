const { askGemini } = require("./ai/gemeni");
const { searchMusic, downloadAndSend, hasPendingSelection } = require("./commands/music");
const { MessageMedia } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

function getMenu() {
    return `
╔════════════════════════════════╗
║          🔥 SABER BOT 🔥        ║
║       Professional Edition      ║
╚════════════════════════════════╝

📌 *الأوامر العامة*:
┌─────────────────────────────────
│ ◇ .menu   – عرض هذه القائمة
│ ◇ .ping   – سرعة الاستجابة
│ ◇ .owner  – معلومات المطور
│ ◇ .afk    – وضع بعيداً عن لوحة المفاتيح

🧠 *الذكاء الاصطناعي*:
├─────────────────────────────────
│ ◇ .ai [نص] – محادثة ذكية
│ ◇ .ai + صورة – تحليل الصورة
│ ◇ .gpt4 [نص] – نموذج GPT-4 متقدم

🎵 *الوسائط والتحميل*:
├─────────────────────────────────
│ ◇ .music [اسم الأغنية] – تحميل موسيقى
│ ◇ .ytmp3 [رابط] – تحميل صوت يوتيوب
│ ◇ .ytmp4 [رابط] – تحميل فيديو يوتيوب
│ ◇ .ig [رابط] – تحميل من انستغرام
│ ◇ .fb [رابط] – تحميل من فيسبوك

🖼️ *الملصقات والصور*:
├─────────────────────────────────
│ ◇ .sticker – تحويل صورة إلى ملصق
│ ◇ .toimg – تحويل ملصق إلى صورة
│ ◇ .take – إعادة تسمية حزمة ملصقات

👥 *إدارة المجموعات*:
├─────────────────────────────────
│ ◇ .tagall – منشن الجميع
│ ◇ .hidetag – منشن مخفي
│ ◇ .kick @user – طرد عضو
│ ◇ .add @user – إضافة عضو
│ ◇ .promote @user – ترقية أدمن
│ ◇ .demote @user – تنزيل أدمن
│ ◇ .setpp – تعيين صورة المجموعة

🌐 *خدمات متنوعة*:
├─────────────────────────────────
│ ◇ .weather [مدينة] – حالة الطقس
│ ◇ .time [دولة] – الوقت الحالي
│ ◇ .qr [نص] – إنشاء رمز QR
│ ◇ .tr [نص] – ترجمة (تلقائياً)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *أمثلة*:
• _.ai ما هو البوت؟_ → رد ذكي
• _.ai_ مع صورة → وصف الصورة
• _.music tflow messi_ → اختر .1 .2
• _.ytmp3 رابط_ → رفع الملف الصوتي
• _.tagall_ → منشن الجميع بأدب

💡 *ملاحظة*: استخدم الأوامر بدون علامة النقطة إذا كان البوت يستخدم البادئة المخصصة له.
    `.trim();
}

async function handleMessages(client, msg) {
    try {
        const text = (msg.body || "").trim();
        console.log(`📩 [${msg.type}] من ${msg.from}: "${text.slice(0, 80)}"`);

        if (!text && !msg.hasMedia) return;

        // ━━━ .menu ━━━
        if (text.toLowerCase() === ".menu") {
            await msg.reply(getMenu());
            return;
        }

        // ━━━ .music ━━━
        if (text.toLowerCase().startsWith(".music")) {
            const query = text.replace(/^\.music\s*/i, "").trim();
            if (!query) {
                await msg.reply(`🎵 Usage: *.music* [song name]\nExample: _.music tflow messi_`);
                return;
            }

            let chat;
            try { chat = await msg.getChat(); } catch {}
            try { if (chat) await chat.sendStateTyping(); } catch {}

            const result = await searchMusic(msg.from, query);
            await msg.reply(result.text);
            return;
        }

        // ━━━ اختيار الأغنية — .1 / .2 / .3 / .4 / .5 ━━━
        const pickMatch = text.match(/^\.([1-5])$/);
        if (pickMatch && hasPendingSelection(msg.from)) {
            const choice = pickMatch[1];
            let chat2;
            try { chat2 = await msg.getChat(); } catch {}
            try { if (chat2) await chat2.sendStateRecording(); } catch {}
            await msg.reply(`⏳ *Downloading...*`);
            const errMsg = await downloadAndSend(msg.from, choice, msg);
            if (errMsg) await msg.reply(errMsg);
            return;
        }

        // ━━━ .ai ━━━
        if (text.toLowerCase().startsWith(".ai")) {
            let query = text.replace(/^\.ai\s*/i, "").trim();

            let chat;
            try { chat = await msg.getChat(); } catch {}
            try { if (chat) await chat.sendStateTyping(); } catch {}

            if (msg.hasMedia) {
                let media;
                try { media = await msg.downloadMedia(); } catch (e) {
                    console.error("⚠️ downloadMedia error:", e.message);
                    return;
                }
                if (!media) return;
                const res = await askGemini(
                    msg.from,
                    query || "شوف هاد التصويرة وقوليا شنو كاين.",
                    media.data
                );
                await msg.reply(res);
            } else {
                if (!query) {
                    await msg.reply("كتب شي حاجة مورا .ai، مالك ساكت؟ 😒");
                    return;
                }
                const res = await askGemini(msg.from, query);
                await msg.reply(res);
            }
            return;
        }

    } catch (e) {
        console.error("❌ handleMessages crash:", e.message);
    }
}

module.exports = { handleMessages };
