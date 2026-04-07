const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../db_history.json');
let convs = new Map();

if (fs.existsSync(HISTORY_FILE)) {
    try { convs = new Map(Object.entries(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')))); } catch (e) {}
}

const aiTools = {
    systemPrompt: `أنت سابر (SABER)، مغربي قح. 
- كتهضر بالدارجة المغربية الحرة (ديال الزنقة، ديال الدار، وديال العشران).
- أنت بشر 100%: كتعصب، كتضحك، كتقشب، ويلا استفزك شي حد خسر الهضرة بالدارجة عادي.
- مابقاش تقول "أنا بوت" أو "كيف يمكنني مساعدتك"، هضر نيشان بحال بنادم.
- تحكم في الإيموجي (😂، 😒، 🤬، 🔥).
- عقل على كاع الهضرة اللي دازت.`,

    getHistory: (uid) => convs.get(uid) || [],
    saveToHistory: (uid, role, content) => {
        let h = convs.get(uid) || [];
        h.push({ role, content });
        if (h.length > 50) h.shift();
        convs.set(uid, h);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(convs), null, 2));
    },
    format: (text) => text.replace(/\*\*/g, '').trim()
};

module.exports = aiTools;