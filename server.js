const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');
const { handleMessages } = require('./main');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

function getExecutablePath() {
    if (os.platform() === 'win32') {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
        return null;
    } else {
        // Linux / Back4App
        const linuxPaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
        ];
        for (const p of linuxPaths) {
            if (fs.existsSync(p)) return p;
        }
        return '/usr/bin/chromium';
    }
}

const waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        executablePath: getExecutablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    }
});

waClient.on('qr', (qr) => {
    console.log('--- QR RECEIVED ---');
    qrcodeTerminal.generate(qr, { small: true });
    qrcode.toDataURL(qr, (err, url) => {
        if (!err) {
            io.emit('qr_code', url);
            io.emit('status', 'Waiting for scan... 📱');
        }
    });
});

waClient.on('ready', () => {
    console.log('✅ SABER BOT IS READY!');
    io.emit('ready', {
        message: 'SABER BOT IS ONLINE 🟢',
        user: waClient.info.pushname
    });
});

waClient.on('message', async (msg) => {
    // ✅ FIX: تصفية status@broadcast
    if (msg.from === 'status@broadcast') return;

    // ✅ FIX: dashboard log
    io.emit('new_message', {
        from: msg.from.split('@')[0],
        body: msg.body,
        time: new Date().toLocaleTimeString()
    });

    // ✅ FIX: try/catch حول handleMessages — البوت مايوقفش بسبب error واحد
    try {
        await handleMessages(waClient, msg);
    } catch (e) {
        console.error('❌ Unhandled error in handleMessages:', e.message);
    }
});

// واجهة التحكم (Dashboard HTML)
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>SABER BOT | Control Panel</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="/socket.io/socket.io.js"></script>
        <style>
            body { font-family: sans-serif; background: #0b141a; color: #e9edef; text-align: center; padding: 20px; }
            .card { max-width: 450px; margin: auto; background: #111b21; padding: 25px; border-radius: 12px; border: 1px solid #222e35; }
            h1 { color: #00a884; }
            #status { margin: 20px 0; font-weight: bold; color: #ffd700; }
            #qr-container img { background: white; padding: 10px; border-radius: 8px; width: 250px; }
            .logs { margin-top: 20px; text-align: left; background: #202c33; height: 120px; overflow-y: auto; padding: 10px; font-size: 0.85em; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>SABER BOT 🤖</h1>
            <div id="status">Initializing... ⏳</div>
            <div id="qr-container">
                <img id="qrcode" src="" style="display:none;" />
            </div>
            <div class="logs" id="logs">System waiting...</div>
        </div>

        <script>
            const socket = io();
            const qrImg = document.getElementById('qrcode');
            const statusDiv = document.getElementById('status');
            const logsDiv = document.getElementById('logs');

            socket.on('qr_code', (url) => {
                qrImg.src = url;
                qrImg.style.display = 'inline-block';
                statusDiv.innerHTML = 'Scan now with WhatsApp 📱';
            });

            socket.on('ready', (data) => {
                qrImg.style.display = 'none';
                statusDiv.innerHTML = data.message;
                statusDiv.style.color = '#00ff00';
            });

            socket.on('new_message', (msg) => {
                const p = document.createElement('p');
                p.style.margin = '2px 0';
                p.innerHTML = '<b>' + msg.from + ':</b> ' + msg.body;
                logsDiv.prepend(p);
            });
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('🚀 Server running on http://localhost:' + PORT);
    waClient.initialize().catch(err => console.error('Initialization Error:', err));
});
