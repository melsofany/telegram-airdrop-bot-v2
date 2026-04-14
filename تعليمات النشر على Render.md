# تعليمات النشر على Render

هذا الملف يحتوي على خطوات نشر البوت على منصة Render باستخدام GitHub و API Key.

## المتطلبات

- حساب GitHub
- حساب Render
- Render API Key: `rnd_j8CLjugyzJIQ5E8PIDBCupXF85Je`
- Telegram Bot Token: `8643958185:AAHykYc6Jjz1jRhkl-2DnJn2r-qaE8eC2qY`

## خطوات النشر

### 1. إنشاء مستودع GitHub

```bash
# تهيئة مستودع جديد
git init
git add .
git commit -m "Initial commit: Telegram Airdrop Bot"

# إضافة الريموت (استبدل YOUR_USERNAME و YOUR_REPO)
git remote add origin https://github.com/YOUR_USERNAME/telegram-airdrop-bot.git
git branch -M main
git push -u origin main
```

### 2. نشر على Render عبر Dashboard

1. اذهب إلى https://dashboard.render.com
2. اضغط على **New +** ثم اختر **Web Service**
3. اختر **Build and deploy from a Git repository**
4. اربط حساب GitHub الخاص بك
5. اختر المستودع `telegram-airdrop-bot`
6. ملء البيانات:
   - **Name**: `telegram-airdrop-bot`
   - **Environment**: `Docker`
   - **Branch**: `main`
   - **Build Command**: (اتركه فارغاً - سيستخدم Dockerfile)
   - **Start Command**: (اتركه فارغاً - سيستخدم Dockerfile)

### 3. إضافة متغيرات البيئة

في صفحة الإعدادات، أضف المتغيرات التالية:

| المتغير | القيمة |
| :--- | :--- |
| `BOT_TOKEN` | `8643958185:AAHykYc6Jjz1jRhkl-2DnJn2r-qaE8eC2qY` |
| `NODE_ENV` | `production` |

### 4. النشر

اضغط على **Create Web Service** وانتظر اكتمال النشر (عادة يستغرق 5-10 دقائق).

## استخدام Render API (اختياري)

إذا أردت استخدام API Key مباشرة:

```bash
curl -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer rnd_j8CLjugyzJIQ5E8PIDBCupXF85Je" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "web_service",
    "name": "telegram-airdrop-bot",
    "ownerId": "YOUR_OWNER_ID",
    "repo": "https://github.com/YOUR_USERNAME/telegram-airdrop-bot",
    "branch": "main",
    "buildCommand": "",
    "startCommand": "",
    "envVars": [
      {
        "key": "BOT_TOKEN",
        "value": "8643958185:AAHykYc6Jjz1jRhkl-2DnJn2r-qaE8eC2qY"
      },
      {
        "key": "NODE_ENV",
        "value": "production"
      }
    ]
  }'
```

## ملاحظات مهمة

⚠️ **لا تقم بأي تعديل على قاعدة البيانات الموجودة على Render** - هذا البوت يستخدم قاعدة بيانات SQLite منفصلة تماماً.

## التحقق من الحالة

بعد النشر، يمكنك:
1. التحقق من سجلات النشر في Render Dashboard
2. اختبار البوت بإرسال `/start` إليه على Telegram
3. مراقبة الأخطاء في قسم Logs

## استكشاف الأخطاء

إذا لم يعمل البوت:
1. تحقق من صحة BOT_TOKEN
2. تحقق من سجلات Render للأخطاء
3. تأكد من أن الـ Dockerfile صحيح
4. تأكد من أن جميع المكتبات مثبتة بشكل صحيح

---

**آخر تحديث**: 2026-04-14
