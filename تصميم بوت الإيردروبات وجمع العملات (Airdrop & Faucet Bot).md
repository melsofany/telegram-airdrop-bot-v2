# تصميم بوت الإيردروبات وجمع العملات (Airdrop & Faucet Bot)

## 1. هيكل البوت (Bot Architecture)
سيعتمد البوت على لغة **Python** مع مكتبة `aiogram` للتعامل مع واجهة تيليجرام، و`Playwright` للأتمتة.

| المكون | الوظيفة | التقنية المستخدمة |
| :--- | :--- | :--- |
| **Telegram Interface** | واجهة المستخدم للتفاعل مع البوت | `aiogram` |
| **Scraper Engine** | جلب بيانات الإيردروبات الجديدة | `BeautifulSoup` + `Requests` |
| **Automation Engine** | تنفيذ عمليات الجمع والتسجيل التلقائي | `Playwright` + `Stealth` |
| **Database** | تخزين بيانات المستخدمين، المهام، والحسابات | `SQLite` / `PostgreSQL` |
| **Scheduler** | جدولة مهام الجمع التلقائي | `APScheduler` |
| **Captcha Solver** | حل رموز الكابتشا تلقائياً | `2Captcha API` |

## 2. ميزات البوت (Bot Features)

### أ. تتبع الإيردروبات (Airdrop Hunting)
- **المراقبة المستمرة**: فحص مواقع مثل `Airdrops.io` و `DappRadar` كل ساعة.
- **التسجيل التلقائي**: محاولة إكمال المهام البسيطة (مثل الانضمام لقنوات تيليجرام أو متابعة تويتر) عبر API أو الأتمتة.
- **تنبيهات مخصصة**: إرسال إشعار للمستخدم عند توفر إيردروب جديد عالي القيمة.

### ب. الجمع التلقائي (Faucet Automation)
- **دعم مواقع متعددة**: مثل `FreeBitco.in`, `Cointiply`, `FireFaucet`.
- **الجمع الدوري**: تنفيذ عملية "Roll" أو "Claim" تلقائياً حسب توقيت كل موقع.
- **تجاوز الحماية**: استخدام تقنيات `Stealth` والبروكسي لتجنب كشف البوت.

### ج. تعظيم الأرباح (Profit Maximization)
- **نظام الإحالة الذكي**: استخدام روابط إحالة المستخدم لزيادة أرباحه من خلال دعوة الآخرين.
- **إدارة المحافظ**: تتبع الرصيد في المحافظ المختلفة (MetaMask, Trust Wallet) وإظهار الإجمالي في البوت.
- **تعدد الحسابات**: إمكانية إضافة أكثر من حساب لنفس الموقع لزيادة الدخل.

## 3. هيكل قاعدة البيانات (Database Schema)

| الجدول | الحقول الأساسية |
| :--- | :--- |
| **Users** | `user_id`, `username`, `join_date`, `subscription_status` |
| **Accounts** | `account_id`, `user_id`, `site_name`, `email`, `password`, `proxy` |
| **Airdrops** | `airdrop_id`, `name`, `link`, `status`, `reward_value`, `expiry_date` |
| **Claims** | `claim_id`, `account_id`, `site_name`, `amount`, `timestamp` |

## 4. واجهة التحكم (User Interface)
- **/start**: ترحيب وعرض القائمة الرئيسية.
- **/add_account**: إضافة حساب لموقع Faucet.
- **/airdrops**: عرض قائمة الإيردروبات النشطة.
- **/stats**: عرض إحصائيات الأرباح والجمع التلقائي.
- **/settings**: إعدادات التنبيهات والبروكسي.
