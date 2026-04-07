# استعمل نسخة Node.js مستقرة وخفيفة
FROM node:18-slim

# تنصيب المكتبات اللي كيحتاجها Chrome/Puppeteer باش يخدم فـ Linux
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# إعداد مسار الكروم (ضروري لـ whatsapp-web.js)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# تحديد مجلد العمل
WORKDIR /app

# نسخ ملفات الـ package أولا لتسريع التنصيب
COPY package*.json ./

# تنصيب المكتبات (dependencies)
RUN npm install

# نسخ كاع الملفات ديال المشروع (main.js, ai/, aifix/...)
COPY . .

# حل البورت 3000 ديال الـ Dashboard
EXPOSE 3000

# أمر تشغيل البوت
CMD ["node", "server.js"]