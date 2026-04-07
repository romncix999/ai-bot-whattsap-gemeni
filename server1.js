/**
 * SABER — WhatsApp AI (Final Stable)
 * ✅ Edge/Chrome stable
 * ✅ No duplicate QR
 * ✅ Dashboard messages working
 * ✅ Always ON - Responds ONLY to .ai command
 */

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode   = require('qrcode-terminal');
const QRCode   = require('qrcode');
const fs       = require('fs');
const os       = require('os');
const OpenAI   = require('openai');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ═══════════════════════════════════════════════════
// BROWSER
// ═══════════════════════════════════════════════════
function findBrowser() {
  const L   = process.env.LOCALAPPDATA || '';
  const PF  = process.env.ProgramFiles  || 'C:\\Program Files';
  const P86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const list = [
    `${PF}\\Google\\Chrome\\Application\\chrome.exe`,
    `${P86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${L}\\Google\\Chrome\\Application\\chrome.exe`,
    `${PF}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${P86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const p of list) {
    try { if (fs.existsSync(p)) { console.log(`✅ Browser: ${p}`); return p; } } catch {}
  }
  console.error('❌ Install Chrome: https://www.google.com/chrome');
  process.exit(1);
}
const BROWSER = findBrowser();

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const CONFIG = {
  PORT:    process.env.PORT || 3000,
  API_KEY: process.env.OPENROUTER_API_KEY || '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',
  OWNER:   process.env.OWNER_NUMBER || '212769356031',
  MODEL:   'google/gemini-2.0-flash-001',
  PROMPT: `اسمك SABER-BOT، وأنت شخص حقيقي تتحدث عبر واتساب، لست برنامجاً ولا ذكاءً اصطناعياً.
- تحدث دائماً بالعربية الفصحى أو الدارجة المغربية، إلا إذا بدأ الآخر بلغة أخرى
- لا تقل أبداً أنك بوت أو ذكاء اصطناعي
- أنت تتذكر كل سياق المحادثة، لا تقل أبداً "لا أستطيع تذكر محادثات سابقة". تعامل كشخص بذاكرة قوية.
- إذا سألوك "من أنت؟" قل: "أنا SABER 😄 كيف أساعدك؟"
- إذا سألوا "لمن هذا الرقم؟" قل: "أنا سابر، معك 😊"
- ردود طبيعية ومختصرة، لا markdown، إيموجي بشكل طبيعي`
};

// ═══════════════════════════════════════════════════
// AI
// ═══════════════════════════════════════════════════
const ai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: CONFIG.API_KEY,
  defaultHeaders: { 'HTTP-Referer': 'https://saber-bot.app', 'X-Title': 'SABER' },
});

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// STATE & MEMORY (HISTORY SAVE)
// ═══════════════════════════════════════════════════
let isReconnecting = false;
let botStatus      = 'initializing';
let qrRaw          = null;
let qrPng          = null;
let connectedPhone = null;
let keepAlive      = null;
let waClient       = null;

const logs = [];
let convs = new Map();
const MAX_H = 50; // الحد الأقصى للرسائل اللي غيعقل عليها لكل شخص
const HISTORY_FILE = './db_history.json';

// استرجاع المحادثات القديمة يلا طفا البوت وشعل
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    convs = new Map(Object.entries(data));
    console.log('✅ تم استرجاع المحادثات السابقة من db_history.json');
  } catch (e) {
    console.error('❌ خطأ في قراءة ملف المحادثات:', e.message);
  }
}

// دالة باش نحفظو المحادثات فملف
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(convs), null, 2));
  } catch (e) {
    console.error('❌ خطأ في حفظ المحادثة:', e.message);
  }
}

function addLog(e) { logs.push(e); if (logs.length > 100) logs.shift(); io.emit(e.ev, e.data); }
function t() { return new Date().toLocaleTimeString('fr-MA'); }

function getH(uid) { if (!convs.has(uid)) convs.set(uid, []); return convs.get(uid); }

// هاد الدالة دابا كتسجل فملف json مع كل ميساج جديد
function pushH(uid, role, content) {
  const h = getH(uid); h.push({ role, content });
  if (h.length > MAX_H) h.splice(0, h.length - MAX_H);
  saveHistory(); // حفظ مباشر بعد كل رسالة
}

function clearH(uid) { convs.set(uid, []); saveHistory(); }

// ═══════════════════════════════════════════════════
// AI CALLS
// ═══════════════════════════════════════════════════
async function aiText(uid, msg) {
  pushH(uid, 'user', msg);
  try {
    const r = await ai.chat.completions.create({
      model: CONFIG.MODEL, max_tokens: 1024,
      messages: [{ role: 'system', content: CONFIG.PROMPT }, ...getH(uid)],
    });
    const reply = r.choices[0].message.content.trim();
    pushH(uid, 'assistant', reply);
    return reply;
  } catch (e) {
    console.error('AI Error:', e.message);
    clearH(uid);
    return '⚠️ حدث خطأ، أعد المحاولة 🙏';
  }
}

async function aiImage(uid, b64, mime, cap, prompt) {
  const p = prompt || (cap ? `صورة مع تعليق: "${cap}". علق.` : 'علق على هذه الصورة كصديق.');
  try {
    const r = await ai.chat.completions.create({
      model: CONFIG.MODEL, max_tokens: 1024,
      messages: [{ role: 'system', content: CONFIG.PROMPT },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          { type: 'text', text: p }
        ]}],
    });
    const reply = r.choices[0].message.content.trim();
    pushH(uid, 'user', `[صورة] ${cap||''}`);
    pushH(uid, 'assistant', reply);
    return reply;
  } catch { return '⚠️ لم أتمكن من قراءة الصورة 😕'; }
}

async function aiAudio(uid, b64, mime) {
  try {
    const r = await ai.chat.completions.create({
      model: CONFIG.MODEL, max_tokens: 1024,
      messages: [{ role: 'system', content: CONFIG.PROMPT },
        { role: 'user', content: [
          { type: 'input_audio', input_audio: { data: b64, format: mime.includes('ogg') ? 'audio/ogg' : 'audio/mpeg' } },
          { type: 'text', text: 'رد على هذه الرسالة الصوتية بشكل طبيعي.' }
        ]}],
    });
    const reply = r.choices[0].message.content.trim();
    pushH(uid, 'user', '[صوت]'); pushH(uid, 'assistant', reply);
    return reply;
  } catch { return await aiText(uid, '[صوت غير مفهوم، اطلب الكتابة بلطف]'); }
}

// ═══════════════════════════════════════════════════
// KEEPALIVE
// ═══════════════════════════════════════════════════
function startKA(client) {
  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(async () => {
    try { await client.getState(); } catch {}
  }, 20000);
}
function stopKA() { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } }

// ═══════════════════════════════════════════════════
// WA CLIENT
// ═══════════════════════════════════════════════════
function makeClient() {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      executablePath: BROWSER,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--no-zygote',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    }
  });

  // ── QR ──
  c.on('qr', async (qr) => {
    botStatus = 'qr_ready';
    qrRaw = qr;
    console.log('\n📱 QR ready → http://localhost:' + CONFIG.PORT);
    qrcode.generate(qr, { small: true });
    try {
      qrPng = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
    } catch { qrPng = null; }
    io.emit('status', { status: 'qr_ready', message: 'Scan QR avec WhatsApp' });
    if (qrPng) io.emit('qr', qrPng);
  });

  c.on('authenticated', () => {
    botStatus = 'authenticated'; qrRaw = null; qrPng = null;
    io.emit('status', { status: 'authenticated', message: 'Authentifié!' });
    console.log('✅ Authenticated');
  });

  c.on('ready', async () => {
    botStatus = 'ready'; isReconnecting = false;
    qrRaw = null; qrPng = null;
    connectedPhone = c.info?.wid?.user || '?';
    console.log(`✅ SABER ready +${connectedPhone}`);
    io.emit('status', { status: 'ready', message: 'SABER متصل 🟢', phone: connectedPhone });
    addLog({ ev: 'log', data: { icon: '✅', text: `متصل: +${connectedPhone}`, time: t() } });
    startKA(c);
  });

  c.on('disconnected', async (reason) => {
    botStatus = 'disconnected'; connectedPhone = null;
    stopKA();
    console.log('❌ Disconnected:', reason);
    io.emit('status', { status: 'disconnected', message: `Déconnecté (${reason})` });
    addLog({ ev: 'log', data: { icon: '❌', text: `Déconnecté: ${reason}`, time: t() } });

    if (reason === 'CONFLICT' || reason === 'UNLAUNCHED') {
      console.log('⚠️ CONFLICT — Close other WhatsApp Web sessions first!');
      io.emit('status', { status: 'disconnected', message: '⚠️ Ferme les autres sessions WhatsApp Web!' });
      return;
    }

    if (!isReconnecting) {
      isReconnecting = true;
      console.log('🔄 Reconnect in 5s...');
      setTimeout(async () => {
        try { await waClient.destroy(); } catch {}
        waClient = makeClient();
        waClient.initialize();
      }, 5000);
    }
  });

  c.on('auth_failure', () => {
    botStatus = 'disconnected'; stopKA();
    io.emit('status', { status: 'disconnected', message: 'Auth failed.' });
  });

  // ── MESSAGES ──
  c.on('message', async (msg) => {
    if (msg.from === 'status@broadcast' || msg.isGroupMsg) return;

    const uid  = msg.from;
    let text = (msg.body || '').trim();
    const type = msg.type;
    const num  = uid.replace('@c.us', '');

    // Log to dashboard always
    addLog({ ev: 'message', data: { from: num, text: type !== 'chat' ? `[${type}] ${text}` : (text||`[${type}]`), time: t(), type } });

    // 🚨 الشرط الأساسي: البوت كيجاوب غير يلا كان الميساج كيبدا بـ .ai 🚨
    if (!text.toLowerCase().startsWith('.ai')) {
      return; // تجاهل أي ميساج عادي
    }

    // كنحيدو كلمة .ai من الميساج باش الذكاء الاصطناعي يقرا غير السؤال
    text = text.substring(3).trim();

    try { const ch = await msg.getChat(); ch.sendStateTyping(); } catch {}

    let res = '';
    if (type === 'image') {
      try { const m = await msg.downloadMedia(); res = m ? await aiImage(uid, m.data, m.mimetype, text) : 'لم تصلني الصورة 😕'; }
      catch { res = 'خطأ مع الصورة 😕'; }
    } else if (type === 'sticker') {
      try { const m = await msg.downloadMedia(); res = m ? await aiImage(uid, m.data, m.mimetype, '', 'ستيكر، علق بمرح.') : '😂'; }
      catch { res = '😅'; }
    } else if (type === 'video') {
      try { const m = await msg.downloadMedia(); res = m ? await aiImage(uid, m.data, 'image/jpeg', text, 'فيديو وصلني.') : '🎥'; }
      catch { res = '🎥 لم أتمكن'; }
    } else if (type === 'audio' || type === 'ptt') {
      // ملاحظة: الأوديو غالباً مافيهش .ai، فهاد الحالة غايخصك ديرلو Quote (رد) وتكتب .ai باش يخدم.
      try { const m = await msg.downloadMedia(); res = m ? await aiAudio(uid, m.data, m.mimetype) : 'لم يصلني الصوت 😕'; }
      catch { res = 'خطأ مع الصوت'; }
    } else if (type === 'document') {
      res = 'الملفات لا أقرأها، اكتب المحتوى 😊';
    } else if (type === 'chat') {
      if (!text) {
        res = 'أهلاً! كيفاش نقدر نعاونك؟ (كتب السؤال ديالك مورا .ai)';
      } else {
        res = await aiText(uid, text);
      }
    }

    if (res) {
      await msg.reply(res);
      console.log(`🤖 → ${num}: ${res.substring(0,60)}`);
      addLog({ ev: 'reply', data: { to: num, text: res, time: t() } });
    }
  });

  return c;
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
const HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SABER</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#080d0a;color:#e8f5eb;font-family:Tahoma,sans-serif;min-height:100vh}
header{padding:18px 28px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(37,211,102,.12);background:rgba(8,13,10,.97);position:sticky;top:0;z-index:99}
.logo{display:flex;align-items:center;gap:12px}
.logo-icon{width:40px;height:40px;background:linear-gradient(135deg,#25d366,#128c7e);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px}
.logo h1{font-size:1.3rem;font-weight:900;background:linear-gradient(135deg,#25d366,#00ff88);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.logo p{font-size:.6rem;color:#5a7a60}
#badge{display:flex;align-items:center;gap:7px;padding:6px 14px;border-radius:50px;font-size:.72rem;border:1px solid rgba(37,211,102,.1);background:#0f160f}
#badge .dot{width:7px;height:7px;border-radius:50%;background:#4a6a50}
#badge.ready .dot{background:#25d366;box-shadow:0 0 8px #25d366;animation:bl 1.5s infinite}
#badge.qr_ready .dot{background:#ffd32a}
#badge.disconnected .dot{background:#ff4757}
@keyframes bl{0%,100%{opacity:1}50%{opacity:.3}}
main{max-width:1050px;margin:0 auto;padding:24px 18px;display:grid;grid-template-columns:280px 1fr;gap:18px}
.card{background:#0c140e;border:1px solid rgba(37,211,102,.1);border-radius:18px;padding:20px}
.ct{font-size:.62rem;color:#25d366;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:16px;opacity:.75}
/* QR */
#qa{text-align:center}
#qw{display:inline-block;padding:8px;background:white;border-radius:14px;margin-bottom:12px;border:2px solid rgba(37,211,102,.15);transition:.3s}
#qw.on{border-color:#25d366;box-shadow:0 0 25px rgba(37,211,102,.3)}
#qi{width:210px;height:210px;border-radius:8px;display:block}
#qph{width:210px;height:210px;background:#f5f5f5;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#999;font-size:.73rem}
.sp{width:28px;height:28px;border:3px solid #e0e0e0;border-top-color:#25d366;border-radius:50%;animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.hint{font-size:.7rem;color:#5a7a60;line-height:1.7;text-align:center}
#con{display:none;text-align:center;padding:14px;background:rgba(37,211,102,.05);border:1px solid rgba(37,211,102,.12);border-radius:12px;margin-bottom:12px}
.ph{font-size:1.1rem;font-weight:800;color:#25d366;direction:ltr;margin:3px 0}
/* Stats */
.st{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.sv{background:#080d0a;border:1px solid rgba(37,211,102,.08);border-radius:12px;padding:14px;text-align:center}
.sn{font-size:1.8rem;font-weight:900;color:#25d366;line-height:1}
.sl{font-size:.58rem;color:#5a7a60;margin-top:4px;text-transform:uppercase;letter-spacing:1px}
/* Log */
#log{max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
#log::-webkit-scrollbar{width:2px}
#log::-webkit-scrollbar-thumb{background:rgba(37,211,102,.12)}
.li{padding:9px 13px;border-radius:10px;font-size:.72rem;display:flex;gap:9px;animation:fa .2s ease}
@keyframes fa{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
.li.r{background:rgba(37,211,102,.03);border:1px solid rgba(37,211,102,.09)}
.li.s{background:rgba(59,130,246,.03);border:1px solid rgba(59,130,246,.09)}
.li.y{background:rgba(251,191,36,.03);border:1px solid rgba(251,191,36,.09)}
.lh{font-size:.66rem;color:#5a7a60;margin-bottom:2px}
.lf{font-weight:700;font-size:.68rem}
.lb{color:#9ab09e;word-break:break-word;line-height:1.5}
.em{text-align:center;color:#3a5a40;padding:35px;font-size:.77rem}
@media(max-width:720px){main{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <div class="logo">
    <div class="logo-icon">🤖</div>
    <div><h1>SABER</h1><p>WhatsApp AI — Always ON Mode</p></div>
  </div>
  <div id="badge"><div class="dot"></div><span id="bt">Initialisation...</span></div>
</header>
<main>
  <div class="card">
    <div class="ct">📱 Connexion</div>
    <div id="con">
      <div style="font-size:1.3rem">✅</div>
      <div class="ph" id="ph">+XXX</div>
      <div style="font-size:.72rem;color:#9ab09e">SABER جاهز (.ai)</div>
    </div>
    <div id="qa">
      <div id="qw">
        <div id="qph"><div class="sp"></div><div>جاري التحضير...</div><div style="font-size:.62rem;color:#bbb">10–30 ثانية</div></div>
        <img id="qi" src="" alt="" style="display:none">
      </div>
      <div class="hint">WhatsApp ← ⋮ ← Appareils associés ← Associer</div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:14px">
    <div class="st">
      <div class="sv"><div class="sn" id="sr">0</div><div class="sl">📨 Reçus</div></div>
      <div class="sv"><div class="sn" id="ss">0</div><div class="sl">🤖 Envoyés</div></div>
      <div class="sv"><div class="sn" id="su">0m</div><div class="sl">⏱️ Uptime</div></div>
    </div>
    <div class="card" style="flex:1">
      <div class="ct">💬 Activité</div>
      <div id="log"><div class="em" id="em">📭 En attente...</div></div>
    </div>
  </div>
</main>
<script>
const socket=io();
let rcv=0,snt=0,start=Date.now(),qrOk=false;

setInterval(()=>{
  const m=Math.floor((Date.now()-start)/60000);
  document.getElementById('su').textContent=m>=60?Math.floor(m/60)+'h'+(m%60)+'m':m+'m';
},8000);

function showQR(src){
  if(qrOk)return; qrOk=true;
  const img=document.getElementById('qi'),ph=document.getElementById('qph'),w=document.getElementById('qw');
  img.onload=()=>{img.style.display='block';ph.style.display='none';w.className='on';};
  img.src=src;
  badge('qr_ready','Scan QR — WhatsApp 📱');
  log('y','📱','نظام','QR جاهز — امسحه الآن! 📸');
}

let poll=setInterval(async()=>{
  if(qrOk){clearInterval(poll);return;}
  try{
    const r=await fetch('/api/qr-img?_='+Date.now());
    if(r.ok&&r.headers.get('content-type')?.includes('image')){
      showQR('/api/qr-img?_='+Date.now());
      clearInterval(poll);
    }
  }catch{}
},2000);

socket.on('qr',src=>{ clearInterval(poll); showQR(src); });

socket.on('status',({status,message,phone})=>{
  badge(status,message);
  if(status==='ready'){
    clearInterval(poll);
    document.getElementById('qa').style.display='none';
    document.getElementById('con').style.display='block';
    if(phone) document.getElementById('ph').textContent='+'+phone;
    log('y','✅','نظام','SABER متصل وجاهز للرد على .ai 🟢');
  } else if(status==='authenticated'){
    clearInterval(poll);
    document.getElementById('qa').style.display='none';
    log('y','🔐','نظام','Authentifié!');
  } else if(status==='disconnected'){
    qrOk=false;
    document.getElementById('qa').style.display='block';
    document.getElementById('con').style.display='none';
    document.getElementById('qi').style.display='none';
    document.getElementById('qph').style.display='flex';
    document.getElementById('qph').innerHTML='<div style="font-size:1.5rem">🔄</div><div>'+message+'</div>';
    document.getElementById('qw').className='';
    log('y','❌','نظام',message);
  }
});

socket.on('message',({from,text,time})=>{
  rcv++; document.getElementById('sr').textContent=rcv;
  log('r','📨',from,text,time);
});
socket.on('reply',({to,text,time})=>{
  snt++; document.getElementById('ss').textContent=snt;
  log('s','🤖','Saber→'+to,text,time);
});
socket.on('log',({icon,text,time})=>log('y',icon,'نظام',text,time));

socket.on('replay',items=>{
  items.forEach(i=>{
    if(i.ev==='message'){rcv++;document.getElementById('sr').textContent=rcv;log('r','📨',i.data.from,i.data.text,i.data.time);}
    else if(i.ev==='reply'){snt++;document.getElementById('ss').textContent=snt;log('s','🤖','Saber→'+i.data.to,i.data.text,i.data.time);}
    else if(i.ev==='log') log('y',i.data.icon,'نظام',i.data.text,i.data.time);
  });
});

function badge(s,m){ document.getElementById('badge').className=s; document.getElementById('bt').textContent=m; }

function log(type,icon,from,text,time){
  const em=document.getElementById('em'); if(em) em.remove();
  const el=document.getElementById('log');
  const d=document.createElement('div'); d.className='li '+type;
  const tm=time||new Date().toLocaleTimeString('fr-MA');
  d.innerHTML='<span style="flex-shrink:0">'+icon+'</span><div style="flex:1;min-width:0"><div class="lh"><span class="lf">'+e(from)+'</span> · '+tm+'</div><div class="lb">'+e((text||'').substring(0,130))+'</div></div>';
  el.appendChild(d); el.scrollTop=el.scrollHeight;
  if(el.children.length>80) el.removeChild(el.firstChild);
}
function e(t){return(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
<\/script>
</body>
</html>`;

// ═══════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════
app.get('/', (req, res) => res.send(HTML));

app.get('/api/qr-img', async (req, res) => {
  if (!qrRaw) return res.status(404).end();
  try {
    const buf = await QRCode.toBuffer(qrRaw, { width: 260, margin: 2 });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
    res.send(buf);
  } catch { res.status(500).end(); }
});

app.get('/api/status', (req, res) =>
  res.json({ status: botStatus, phone: connectedPhone, enabled: true, ownerOnline: true })
);

io.on('connection', socket => {
  const sm = { initializing:'Initialisation...', qr_ready:'Scan QR — WhatsApp',
    authenticated:'Authentifié!', ready:'SABER متصل 🟢', disconnected:'Déconnecté' };
  socket.emit('status', { status: botStatus, message: sm[botStatus]||botStatus, phone: connectedPhone });
  if (qrPng) socket.emit('qr', qrPng);
  if (logs.length) socket.emit('replay', logs);
});

// ═══════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════
server.listen(CONFIG.PORT, () => console.log(`
╔══════════════════════════════════════════╗
║        SABER — Always ON (.ai mode)      ║
║  📊 http://localhost:${CONFIG.PORT}               ║
╚══════════════════════════════════════════╝`));

waClient = makeClient();
waClient.initialize();