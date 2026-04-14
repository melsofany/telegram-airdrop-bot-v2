# بوت الإيردروبات والجمع التلقائي (Telegram Airdrop & Faucet Bot)

بوت تيليجرام متكامل مبني بـ Node.js يقوم بمتابعة أحدث الإيردروبات وجمع العملات الرقمية من مواقع Faucet تلقائياً.

## 🚀 الميزات الرئيسية

- **تتبع الإيردروبات**: جلب تلقائي لأحدث الإيردروبات من مصادر موثوقة.
- **الجمع التلقائي (Faucet Automation)**: أتمتة عملية الجمع من مواقع مثل FreeBitco.in باستخدام Playwright.
- **إحصائيات الأرباح**: لوحة تحكم لمتابعة الأرباح وعدد عمليات الجمع.
- **نظام الإحالة**: رابط إحالة خاص لكل مستخدم لزيادة الأرباح.
- **قاعدة بيانات SQLite**: تخزين بيانات المستخدمين والحسابات والعمليات بشكل آمن.

## 🛠️ المتطلبات التقنية

- Node.js 18+ 
- npm أو pnpm
- متصفح Chromium (يتم تثبيته عبر Playwright)

## 📋 طريقة التشغيل المحلي

### 1. تثبيت المكتبات

```bash
npm install
```

### 2. إعداد متغيرات البيئة

قم بإنشاء ملف `.env.local` وأضف توكن البوت:

```
BOT_TOKEN=your_telegram_bot_token_here
NODE_ENV=development
```

### 3. تشغيل البوت

```bash
npm start
```

أو للتطوير مع إعادة تحميل تلقائية:

```bash
npm run dev
```

## 🐳 النشر على Render باستخدام Docker

### 1. إنشاء مستودع GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/telegram-airdrop-bot.git
git push -u origin main
```

### 2. نشر على Render

1. اذهب إلى [Render Dashboard](https://dashboard.render.com)
2. اضغط على "New +" ثم اختر "Web Service"
3. اربط مستودع GitHub الخاص بك
4. اختر الإعدادات التالية:
   - **Name**: telegram-airdrop-bot
   - **Environment**: Docker
   - **Branch**: main
   - **Build Command**: (اتركه فارغاً)
   - **Start Command**: npm start

5. أضف متغيرات البيئة:
   - `BOT_TOKEN`: ضع توكن البوت الخاص بك
   - `NODE_ENV`: production

6. اضغط "Create Web Service"

## 📂 هيكل المشروع

```
.
├── src/
│   ├── index.js           # البوت الرئيسي
│   ├── database.js        # إدارة قاعدة البيانات
│   └── automation.js      # محرك الأتمتة
├── package.json
├── Dockerfile
├── .env.local
└── README.md
```

## 🔧 الأوامر المتاحة

- `/start` - ابدأ البوت واعرض القائمة الرئيسية
- `/add_account` - أضف حساب جديد لموقع Faucet
- `/help` - اعرض المساعدة

## 💡 أفكار لزيادة الربح

- إضافة بروكسيات (Proxies) لكل حساب لتجنب الحظر
- ربط خدمات حل الكابتشا (مثل 2Captcha) للأتمتة الكاملة
- إضافة المزيد من مواقع Faucet و PTC
- تطبيق نظام الإحالة الفعلي

## 📝 الملاحظات الهامة

- تأكد من أن توكن البوت صحيح قبل التشغيل
- قاعدة البيانات (bot_database.db) تُنشأ تلقائياً عند التشغيل الأول
- البوت يعمل بشكل مستمر ويقوم بفحص الإيردروبات كل ساعة

## 📞 الدعم

إذا واجهت أي مشاكل، تأكد من:
1. أن توكن البوت صحيح
2. أن اتصالك بالإنترنت مستقر
3. أن جميع المكتبات مثبتة بشكل صحيح

---

**تم الإنشاء بواسطة**: Manus AI  
**آخر تحديث**: 2026-04-14
