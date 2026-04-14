import { Telegraf, Markup } from 'telegraf';
import http from 'http';
import dotenv from 'dotenv';
import { 
  initDatabase, getOrCreateUser, getUserStats, getActiveAirdrops,
  getAirdropsBySource, addAccount, getUserAccounts, updateUserWallet,
  toggleNotifications, deleteAccount, updateAccountProxy
} from './database.js';
import { startAutomationScheduler, runAutomationCycle } from './automation.js';
import { getSwapAdvice } from './deepseek.js';
import { automationEmitter } from './emitter.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '8643958185:AAHykYc6Jjz1jRhkl-2DnJn2r-qaE8eC2qY';
const bot = new Telegraf(BOT_TOKEN);
const userState = new Map();
const SUPPORTED_SITES = ['FreeBitco.in', 'Cointiply', 'FireFaucet'];
const SUPPORTED_NETWORKS = ['ERC20', 'BEP20', 'TRC20', 'SOL', 'TON'];
const NETWORK_CURRENCIES = {
  ERC20: ['ETH', 'USDT', 'USDC'], BEP20: ['BNB', 'USDT', 'BUSD'],
  TRC20: ['TRX', 'USDT'], SOL: ['SOL', 'USDC'], TON: ['TON', 'USDT']
};

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) { await initDatabase(); dbInitialized = true; }
}

// ─── SSE Clients ──────────────────────────────────────────────
const sseClients = new Set();

automationEmitter.on('step', (data) => {
  const payload = 'data: ' + JSON.stringify(data) + '\n\n';
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) { sseClients.delete(res); }
  }
});

const LIVE_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>مراقب الجمع التلقائي</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#0d0d0d;color:#e0e0e0;min-height:100vh;overflow-x:hidden}
.browser-chrome{background:#1a1a2e;padding:10px 12px;border-bottom:1px solid #2d2d4e;position:sticky;top:0;z-index:100}
.browser-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.dots{display:flex;gap:5px}
.dot{width:10px;height:10px;border-radius:50%}
.dot.r{background:#ff5f57}.dot.y{background:#febc2e}.dot.g{background:#28c840}
.browser-title{font-size:13px;color:#888;flex:1;text-align:center}
.url-bar{background:#0d0d1a;border:1px solid #3d3d6b;border-radius:20px;padding:6px 14px;font-size:12px;color:#7b9fff;display:flex;align-items:center;gap:6px;word-break:break-all}
.url-bar .lock{color:#28c840;font-size:10px}
.status-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#161625;border-bottom:1px solid #222}
.status-dot{width:8px;height:8px;border-radius:50%;background:#444}
.status-dot.active{background:#28c840;animation:pulse 1s infinite}
.status-dot.done{background:#7b9fff}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.status-text{font-size:12px;color:#888}
.badge{background:#1e1e3a;border:1px solid #3d3d6b;border-radius:12px;padding:2px 8px;font-size:11px;color:#7b9fff}
.feed{padding:12px;display:flex;flex-direction:column;gap:8px;padding-bottom:80px}
.entry{background:#141424;border:1px solid #222;border-radius:12px;padding:10px 12px;display:flex;align-items:flex-start;gap:10px;animation:slide-in .3s ease}
@keyframes slide-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.entry.success{border-color:#1a3a1a;background:#0d1f0d}
.entry.error  {border-color:#3a1a1a;background:#1f0d0d}
.entry.ai     {border-color:#1a1a3a;background:#0d0d1f}
.entry.visit  {border-color:#2a2a0d;background:#1a1a07}
.icon{font-size:18px;flex-shrink:0;margin-top:1px}
.content{}
.site-label{font-size:10px;color:#555;margin-bottom:2px}
.msg{font-size:13px;line-height:1.4}
.time{font-size:10px;color:#444;margin-top:3px}
.empty{text-align:center;padding:60px 20px;color:#444;font-size:14px}
.footer-bar{position:fixed;bottom:0;left:0;right:0;background:#1a1a2e;border-top:1px solid #2d2d4e;padding:10px 16px;display:flex;align-items:center;justify-content:space-between}
.conn-status{font-size:11px;color:#555;display:flex;align-items:center;gap:5px}
.clear-btn{background:#2d2d4e;border:none;color:#888;padding:5px 12px;border-radius:10px;font-size:12px;cursor:pointer}
</style>
</head>
<body>
<div class="browser-chrome">
  <div class="browser-header">
    <div class="dots"><div class="dot r"></div><div class="dot y"></div><div class="dot g"></div></div>
    <div class="browser-title">بوت الإيردروبات</div>
  </div>
  <div class="url-bar"><span class="lock">🔒</span><span id="current-url">في الانتظار...</span></div>
</div>
<div class="status-bar">
  <div style="display:flex;align-items:center;gap:6px">
    <div class="status-dot" id="status-dot"></div>
    <span class="status-text" id="status-text">جاهز</span>
  </div>
  <div class="badge" id="count-badge">0 خطوة</div>
</div>
<div class="feed" id="feed">
  <div class="empty" id="empty-msg">⏳ في انتظار بدء دورة الجمع...</div>
</div>
<div class="footer-bar">
  <div class="conn-status"><span id="conn-dot" style="width:6px;height:6px;border-radius:50%;background:#444;display:inline-block"></span><span id="conn-text">غير متصل</span></div>
  <button class="clear-btn" onclick="clearFeed()">مسح</button>
</div>
<script>
let count = 0;
const feed = document.getElementById('feed');
const emptyMsg = document.getElementById('empty-msg');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const countBadge = document.getElementById('count-badge');
const currentUrl = document.getElementById('current-url');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');

function timeStr(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ar', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function addEntry(data) {
  if (emptyMsg) emptyMsg.remove();
  count++;
  countBadge.textContent = count + ' خطوة';
  
  const cls = data.action === 'success' || data.action === 'cycle_done' ? 'success'
    : data.action === 'error' ? 'error'
    : data.action === 'ai_start' || data.action === 'ai_done' ? 'ai'
    : data.action === 'visit' ? 'visit' : '';
  
  const icon = data.action === 'success' || data.action === 'cycle_done' ? '✅'
    : data.action === 'error' ? '❌'
    : data.action === 'ai_start' || data.action === 'ai_done' ? '🤖'
    : data.action === 'visit' ? '🌐'
    : data.action === 'cycle_start' ? '🚀'
    : data.action === 'action' ? '🖱️'
    : 'ℹ️';

  if (data.site) currentUrl.textContent = data.site;

  const entry = document.createElement('div');
  entry.className = 'entry ' + cls;
  entry.innerHTML =
    '<div class="icon">' + icon + '</div>' +
    '<div class="content">' +
      (data.site ? '<div class="site-label">' + data.site + '</div>' : '') +
      '<div class="msg">' + data.message + '</div>' +
      '<div class="time">' + timeStr(data.timestamp) + '</div>' +
    '</div>';
  feed.appendChild(entry);
  entry.scrollIntoView({ behavior: 'smooth' });

  if (data.action === 'cycle_start') {
    statusDot.className = 'status-dot active';
    statusText.textContent = 'جاري الجمع...';
  } else if (data.action === 'cycle_done') {
    statusDot.className = 'status-dot done';
    statusText.textContent = 'اكتمل';
  }
}

function clearFeed() {
  feed.innerHTML = '';
  count = 0;
  countBadge.textContent = '0 خطوة';
  currentUrl.textContent = 'في الانتظار...';
  statusDot.className = 'status-dot';
  statusText.textContent = 'جاهز';
}

function connect() {
  const es = new EventSource('/events');
  es.onopen = () => {
    connDot.style.background = '#28c840';
    connText.textContent = 'متصل';
  };
  es.onmessage = (e) => {
    try { addEntry(JSON.parse(e.data)); } catch(_) {}
  };
  es.onerror = () => {
    connDot.style.background = '#ff5f57';
    connText.textContent = 'انقطع الاتصال - إعادة محاولة...';
    es.close();
    setTimeout(connect, 3000);
  };
}
connect();
</script>
</body>
</html>`;

// ─── Main Menu ────────────────────────────────────────────────
bot.start(async (ctx) => {
  try {
    await ensureDb();
    await getOrCreateUser(ctx.from.id, ctx.from.username);
    await ctx.reply(
      'مرحباً ' + ctx.from.first_name + '! 👋\n\nأنا بوت الإيردروبات المطور بالذكاء الاصطناعي 🤖\nاختر من القائمة:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔍 الإيردروبات', 'view_airdrops'), Markup.button.callback('🤖 اكتشاف AI', 'view_ai_airdrops')],
        [Markup.button.callback('💰 الجمع التلقائي', 'view_faucets')],
        [Markup.button.callback('📊 إحصائياتي', 'view_stats')],
        [Markup.button.callback('⚙️ الإعدادات', 'view_settings')]
      ])
    );
  } catch (e) { console.error('start error:', e); await ctx.reply('حدث خطأ.'); }
});

// ─── Airdrops ─────────────────────────────────────────────────
bot.action('view_airdrops', async (ctx) => {
  await ensureDb();
  const airdrops = await getActiveAirdrops('airdrop');
  let text = '🔍 *أحدث الإيردروبات النشطة:*\n\n';
  if (!airdrops.length) text += '⏳ لا توجد إيردروبات. اضغط "بحث AI".';
  else airdrops.forEach((a,i) => {
    text += (i+1)+'. *'+a.name+'*\n';
    if (a.network) text += '   🌐 '+a.network+'\n';
    if (a.reward_value) text += '   💎 '+a.reward_value+'\n';
    text += '   🔗 '+a.link+'\n\n';
  });
  await ctx.editMessageText(text, {
    parse_mode:'Markdown', disable_web_page_preview:true,
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🤖 بحث AI', 'ai_search_now')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]).reply_markup
  });
});

bot.action('view_ai_airdrops', async (ctx) => {
  await ensureDb();
  const airdrops = await getAirdropsBySource('ai');
  let text = '🤖 *مكتشفة بالذكاء الاصطناعي:*\n\n';
  if (!airdrops.length) text += '⏳ لم يتم الاكتشاف بعد. اضغط "بحث الآن".';
  else airdrops.forEach((a,i) => {
    text += (i+1)+'. *'+a.name+'*\n';
    if (a.network) text += '   🌐 '+a.network+'\n';
    if (a.reward_value) text += '   💎 '+a.reward_value+'\n';
    text += '   🔗 '+a.link+'\n\n';
  });
  await ctx.editMessageText(text, {
    parse_mode:'Markdown', disable_web_page_preview:true,
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔄 بحث الآن', 'ai_search_now')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]).reply_markup
  });
});

bot.action('ai_search_now', async (ctx) => {
  await ctx.answerCbQuery('⏳ جاري البحث...');
  await ctx.reply('🤖 DeepSeek يبحث... انتظر 30 ثانية.');
  try {
    const { searchAirdropsWithAI, searchFaucetSitesWithAI } = await import('./deepseek.js');
    const [a, f] = await Promise.all([searchAirdropsWithAI(), searchFaucetSitesWithAI()]);
    await ctx.reply('✅ *اكتمل البحث!*\n🪂 إيردروبات: '+a.length+'\n💧 مواقع فوسيت: '+f.length, { parse_mode:'Markdown' });
  } catch (e) {
    await ctx.reply('❌ خطأ: '+e.message);
  }
});

// ─── Faucets ──────────────────────────────────────────────────
bot.action('view_faucets', async (ctx) => {
  await ensureDb();
  const aiFaucets = await getActiveAirdrops('faucet');
  const totalSites = new Set([...SUPPORTED_SITES, ...aiFaucets.map(f => f.name)]).size;
  await ctx.editMessageText(
    '💰 *نظام الجمع التلقائي*\n\nأضف حساباتك وسأجمع لك كل 6 ساعات.\n🤖 مواقع متاحة: *'+totalSites+'*',
    {
      parse_mode:'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('⚡ جمع الآن', 'run_manual_claim')],
        [Markup.button.callback('➕ إضافة حساب', 'select_site')],
        [Markup.button.callback('🔙 العودة', 'back_to_main')]
      ]).reply_markup
    }
  );
});

bot.action('select_site', async (ctx) => {
  await ensureDb();
  const aiFaucets = await getActiveAirdrops('faucet');
  const aiNames = aiFaucets.map(f => f.name);
  const allSites = [...new Set([...SUPPORTED_SITES, ...aiNames])];
  const buttons = allSites.map(s => [Markup.button.callback(s, 'add_site_' + s)]);
  buttons.push([Markup.button.callback('🔙 العودة', 'view_faucets')]);
  await ctx.editMessageText(
    '📋 اختر موقع الجمع:\n_(يشمل المواقع المكتشفة بواسطة AI)_',
    { parse_mode:'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
  );
});

bot.action(/add_site_(.+)/, async (ctx) => {
  const site = ctx.match[1];
  userState.set(ctx.from.id, { step:'await_email', site });
  await ctx.editMessageText('اخترت *'+site+'*\n\nأرسل البريد الإلكتروني:', { parse_mode:'Markdown' });
});

bot.action('run_manual_claim', async (ctx) => {
  await ctx.answerCbQuery('⏳ جاري الجمع...');
  const chatId = ctx.chat.id;
  const serviceUrl = process.env.RENDER_EXTERNAL_URL || '';
  
  const replyButtons = [[Markup.button.callback('🔙 القائمة', 'back_to_main')]];
  if (serviceUrl) {
    replyButtons.unshift([Markup.button.url('📱 مشاهدة الجمع مباشرة', serviceUrl + '/live')]);
  }
  
  await ctx.reply(
    '⏳ *بدأت دورة الجمع التلقائي...*\n' + (serviceUrl ? '👆 اضغط على الزر لمشاهدة التقدم لحظة بلحظة' : ''),
    { parse_mode:'Markdown', reply_markup: Markup.inlineKeyboard(replyButtons).reply_markup }
  );

  runAutomationCycle()
    .then(() => bot.telegram.sendMessage(chatId, '✅ اكتملت دورة الجمع بنجاح!'))
    .catch(e => {
      console.error('Cycle error:', e);
      bot.telegram.sendMessage(chatId, '❌ خطأ في الجمع: ' + e.message);
    });
});

// ─── Stats ────────────────────────────────────────────────────
bot.action('view_stats', async (ctx) => {
  await ensureDb();
  const stats = await getUserStats(ctx.from.id);
  const user  = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const wc = user.wallet_currency || '—';
  const wn = user.wallet_network  || '—';
  const wa = user.wallet_address  || 'غير مضافة';
  const earned = Object.keys(stats.currencies || {});
  const mismatched = user.wallet_currency ? earned.filter(c => c !== user.wallet_currency) : [];
  let currenciesText = '';
  if (earned.length) {
    currenciesText = '\n💎 *العملات المكتسبة:*\n';
    for (const [c,a] of Object.entries(stats.currencies)) currenciesText += '   • '+c+': '+Number(a).toFixed(8)+'\n';
  }
  const warn = mismatched.length ? '\n⚠️ *تنبيه:* ('+mismatched.join(', ')+') تختلف عن محفظتك ('+wc+')' : '';
  const text = '📊 *إحصائياتك:*\n\n👤 '+ctx.from.first_name+'\n👛 المحفظة: `'+wa+'`\n🌐 الشبكة: '+wn+'\n💱 العملة: *'+wc+'*\n🏦 الحسابات: '+stats.accountsCount+'\n🔄 عمليات الجمع: '+stats.totalClaims+currenciesText+warn;
  const buttons = [[Markup.button.callback('🔗 رابط الإحالة','get_referral')]];
  if (mismatched.length) buttons.push([Markup.button.callback('🔄 كيف أسحب عملاتي؟','swap_advice')]);
  buttons.push([Markup.button.callback('🔙 العودة','back_to_main')]);
  await ctx.editMessageText(text, { parse_mode:'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
});

bot.action('swap_advice', async (ctx) => {
  await ensureDb();
  const user  = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const stats = await getUserStats(ctx.from.id);
  if (!user.wallet_currency) { await ctx.answerCbQuery('⚠️ اضبط عملة المحفظة أولاً'); return; }
  const mismatched = Object.keys(stats.currencies||{}).filter(c => c !== user.wallet_currency);
  if (!mismatched.length) { await ctx.answerCbQuery('✅ عملاتك متطابقة'); return; }
  await ctx.answerCbQuery('⏳ جاري الاستشارة...');
  await ctx.reply('🤖 DeepSeek يبحث عن أفضل طريقة لتحويل '+mismatched[0]+' → '+user.wallet_currency+'...');
  const advice = await getSwapAdvice(mismatched[0], user.wallet_currency);
  await ctx.reply('💱 *'+mismatched[0]+' → '+user.wallet_currency+':*\n\n'+advice, { parse_mode:'Markdown' });
});

bot.command('swap', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) { await ctx.reply('الاستخدام: /swap [من] [إلى]\nمثال: /swap BTC ETH'); return; }
  const [from, to] = args.map(a => a.toUpperCase());
  await ctx.reply('🤖 DeepSeek يستشير... ('+from+' → '+to+')');
  const advice = await getSwapAdvice(from, to);
  await ctx.reply('💱 *'+from+' → '+to+':*\n\n'+advice, { parse_mode:'Markdown' });
});

// ─── Settings ─────────────────────────────────────────────────
bot.action('view_settings', async (ctx) => {
  await ctx.editMessageText('⚙️ *الإعدادات:*', {
    parse_mode:'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('👛 ربط محفظة','set_wallet')],
      [Markup.button.callback('🔔 الإشعارات','toggle_notif')],
      [Markup.button.callback('📋 حساباتي','my_accounts')],
      [Markup.button.callback('🔙 العودة','back_to_main')]
    ]).reply_markup
  });
});

bot.action('set_wallet', async (ctx) => {
  const nb = SUPPORTED_NETWORKS.map(n => [Markup.button.callback(n,'wallet_net_'+n)]);
  nb.push([Markup.button.callback('🔙 العودة','view_settings')]);
  await ctx.editMessageText('👛 *ربط المحفظة*\nالخطوة 1/3 — اختر الشبكة:', { parse_mode:'Markdown', reply_markup: Markup.inlineKeyboard(nb).reply_markup });
});

bot.action(/wallet_net_(.+)/, async (ctx) => {
  const network = ctx.match[1];
  const currencies = NETWORK_CURRENCIES[network] || ['USDT'];
  const cb = currencies.map(c => [Markup.button.callback(c,'wallet_cur_'+network+'_'+c)]);
  cb.push([Markup.button.callback('🔙 العودة','set_wallet')]);
  await ctx.editMessageText('👛 *ربط المحفظة*\nالشبكة: *'+network+'*\nالخطوة 2/3 — اختر العملة:', { parse_mode:'Markdown', reply_markup: Markup.inlineKeyboard(cb).reply_markup });
});

bot.action(/wallet_cur_([^_]+)_(.+)/, async (ctx) => {
  const network = ctx.match[1], currency = ctx.match[2];
  userState.set(ctx.from.id, { step:'await_wallet', network, currency });
  await ctx.editMessageText('👛 *ربط المحفظة*\nالشبكة: *'+network+'* | العملة: *'+currency+'*\nالخطوة 3/3 — أرسل عنوان محفظتك:', { parse_mode:'Markdown' });
});

bot.action('toggle_notif', async (ctx) => {
  await ensureDb();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const newState = !user.notifications_enabled;
  await toggleNotifications(ctx.from.id, newState);
  await ctx.answerCbQuery(newState ? '🔔 تم التفعيل' : '🔕 تم الإيقاف');
  await ctx.editMessageText('الإشعارات: '+(newState?'🔔 مفعّلة':'🔕 موقوفة'), {
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة','view_settings')]]).reply_markup
  });
});

bot.action('my_accounts', async (ctx) => {
  await ensureDb();
  const accounts = await getUserAccounts(ctx.from.id);
  if (!accounts.length) {
    await ctx.editMessageText('📋 لا توجد حسابات.', { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة','view_settings')]]).reply_markup });
    return;
  }
  let text = '📋 *حساباتك:*\n\n';
  accounts.forEach((a,i) => { text += (i+1)+'. '+a.site_name+' — '+a.email+'\n'; });
  const db = accounts.map(a => [Markup.button.callback('🗑 حذف: '+a.site_name,'del_acc_'+a.id)]);
  db.push([Markup.button.callback('🔙 العودة','view_settings')]);
  await ctx.editMessageText(text, { parse_mode:'Markdown', reply_markup: Markup.inlineKeyboard(db).reply_markup });
});

bot.action(/del_acc_(\d+)/, async (ctx) => {
  await ensureDb();
  await deleteAccount(parseInt(ctx.match[1]), ctx.from.id);
  await ctx.answerCbQuery('✅ تم الحذف');
  const accounts = await getUserAccounts(ctx.from.id);
  if (!accounts.length) {
    await ctx.editMessageText('📋 لا توجد حسابات.', { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة','view_settings')]]).reply_markup });
  }
});

bot.action('back_to_main', async (ctx) => {
  await ctx.editMessageText('اختر من القائمة:', Markup.inlineKeyboard([
    [Markup.button.callback('🔍 الإيردروبات','view_airdrops'), Markup.button.callback('🤖 اكتشاف AI','view_ai_airdrops')],
    [Markup.button.callback('💰 الجمع التلقائي','view_faucets')],
    [Markup.button.callback('📊 إحصائياتي','view_stats')],
    [Markup.button.callback('⚙️ الإعدادات','view_settings')]
  ]));
});

bot.action('get_referral', async (ctx) => {
  const info = await bot.telegram.getMe();
  await ctx.reply('🔗 *رابط الإحالة:*\n\n`https://t.me/'+info.username+'?start='+ctx.from.id+'`', { parse_mode:'Markdown' });
});

bot.on('text', async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (!state) return;
  try {
    await ensureDb();
    if (state.step === 'await_email') {
      userState.set(ctx.from.id, { ...state, step:'await_password', email:ctx.message.text });
      await ctx.reply('✅ تم. أرسل *كلمة المرور:*', { parse_mode:'Markdown' });
    } else if (state.step === 'await_password') {
      await addAccount(ctx.from.id, state.site, state.email, ctx.message.text);
      userState.delete(ctx.from.id);
      await ctx.reply('✅ تم إضافة حساب *'+state.site+'* بنجاح!', {
        parse_mode:'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة','back_to_main')]]).reply_markup
      });
    } else if (state.step === 'await_wallet') {
      const address = ctx.message.text.trim();
      await updateUserWallet(ctx.from.id, address, state.network, state.currency);
      userState.delete(ctx.from.id);
      await ctx.reply(
        '✅ *تم ربط المحفظة!*\n\n🌐 الشبكة: *'+state.network+'*\n💱 العملة: *'+state.currency+'*\n👛 العنوان: `'+address+'`\n\n💡 لتحويل عملة: /swap BTC '+state.currency,
        { parse_mode:'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة','back_to_main')]]).reply_markup }
      );
    }
  } catch (e) {
    console.error('Wizard error:', e);
    await ctx.reply('❌ حدث خطأ. حاول مرة أخرى.');
    userState.delete(ctx.from.id);
  }
});

bot.catch((err) => console.error('Telegraf error:', err));

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  try {
    console.log('🚀 Starting Telegram Airdrop Bot...');
    await initDatabase();
    dbInitialized = true;

    const PORT = process.env.PORT || 3000;
    const server = http.createServer((req, res) => {
      if (req.url === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        res.write('data: ' + JSON.stringify({ action:'connected', message:'متصل بخادم المراقبة', timestamp: new Date().toISOString() }) + '\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
      } else if (req.url === '/live' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(LIVE_HTML);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is running');
      }
    });

    server.listen(PORT, () => console.log('🌐 HTTP server on port ' + PORT));

    await startAutomationScheduler();

    bot.launch().catch(err => { console.error('Bot launch error:', err); process.exit(1); });
    console.log('✅ Bot is running!');

    process.once('SIGINT',  () => { bot.stop('SIGINT');  server.close(); });
    process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
