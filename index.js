import { Telegraf, Markup } from 'telegraf';
import http from 'http';
import dotenv from 'dotenv';
import { 
  initDatabase, 
  getOrCreateUser, 
  getUserStats, 
  getActiveAirdrops,
  getAirdropsBySource,
  addAccount, 
  getUserAccounts,
  updateUserWallet,
  toggleNotifications,
  deleteAccount,
  updateAccountProxy
} from './database.js';
import { startAutomationScheduler, runAutomationCycle } from './automation.js';
import { getSwapAdvice } from './deepseek.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '8643958185:AAHykYc6Jjz1jRhkl-2DnJn2r-qaE8eC2qY';
const bot = new Telegraf(BOT_TOKEN);

const userState = new Map();

const SUPPORTED_SITES = ['FreeBitco.in', 'Cointiply', 'FireFaucet'];
const SUPPORTED_NETWORKS = ['ERC20', 'BEP20', 'TRC20', 'SOL', 'TON'];

const NETWORK_CURRENCIES = {
  ERC20: ['ETH', 'USDT', 'USDC'],
  BEP20: ['BNB', 'USDT', 'BUSD'],
  TRC20: ['TRX', 'USDT'],
  SOL:   ['SOL', 'USDC'],
  TON:   ['TON', 'USDT']
};

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) { await initDatabase(); dbInitialized = true; }
}

bot.start(async (ctx) => {
  try {
    await ensureDb();
    await getOrCreateUser(ctx.from.id, ctx.from.username);
    await ctx.reply(
      'مرحباً ' + ctx.from.first_name + '! 👋\n\nأنا بوت الإيردروبات المطور بالذكاء الاصطناعي 🤖\nسأساعدك في:\n• اكتشاف أحدث الإيردروبات تلقائياً\n• جمع العملات من مواقع الفوسيت\n• إدارة محفظتك وتحويل عملاتك\n\nاختر من القائمة:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔍 الإيردروبات', 'view_airdrops'), Markup.button.callback('🤖 اكتشاف AI', 'view_ai_airdrops')],
        [Markup.button.callback('💰 الجمع التلقائي', 'view_faucets')],
        [Markup.button.callback('📊 إحصائياتي', 'view_stats')],
        [Markup.button.callback('⚙️ الإعدادات', 'view_settings')]
      ])
    );
  } catch (e) {
    console.error('start error:', e);
    await ctx.reply('حدث خطأ. يرجى المحاولة لاحقاً.');
  }
});

bot.action('view_airdrops', async (ctx) => {
  await ensureDb();
  const airdrops = await getActiveAirdrops('airdrop');
  let text = '🔍 *أحدث الإيردروبات النشطة:*\n\n';
  if (airdrops.length === 0) {
    text += '⏳ لا توجد إيردروبات حالياً. اضغط "بحث AI" لاكتشاف جديد.';
  } else {
    airdrops.forEach((a, i) => {
      text += (i+1) + '. *' + a.name + '*\n';
      if (a.network) text += '   🌐 ' + a.network + '\n';
      if (a.reward_value) text += '   💎 ' + a.reward_value + '\n';
      text += '   🔗 ' + a.link + '\n\n';
    });
  }
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🤖 بحث AI عن جديد', 'ai_search_now')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]).reply_markup
  });
});

bot.action('view_ai_airdrops', async (ctx) => {
  await ensureDb();
  const airdrops = await getAirdropsBySource('ai');
  let text = '🤖 *إيردروبات مكتشفة بالذكاء الاصطناعي:*\n\n';
  if (airdrops.length === 0) {
    text += '⏳ لم يتم الاكتشاف بعد. اضغط "بحث الآن".';
  } else {
    airdrops.forEach((a, i) => {
      text += (i+1) + '. *' + a.name + '*\n';
      if (a.network) text += '   🌐 ' + a.network + '\n';
      if (a.reward_value) text += '   💎 ' + a.reward_value + '\n';
      text += '   🔗 ' + a.link + '\n\n';
    });
  }
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔄 بحث الآن', 'ai_search_now')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]).reply_markup
  });
});

bot.action('ai_search_now', async (ctx) => {
  await ctx.answerCbQuery('⏳ جاري البحث بالذكاء الاصطناعي...');
  await ctx.reply('🤖 DeepSeek AI يبحث عن أحدث الإيردروبات ومواقع الجمع...\nقد يستغرق هذا 30 ثانية.');
  try {
    const { searchAirdropsWithAI, searchFaucetSitesWithAI } = await import('./deepseek.js');
    const [airdrops, faucets] = await Promise.all([searchAirdropsWithAI(), searchFaucetSitesWithAI()]);
    await ctx.reply(
      '✅ *اكتمل البحث!*\n\n🪂 إيردروبات جديدة: ' + airdrops.length + '\n💧 مواقع فوسيت: ' + faucets.length + '\n\nاضغط "اكتشاف AI" لعرض النتائج.',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.error('AI search error:', e);
    await ctx.reply('❌ خطأ في البحث. تحقق من DEEPSEEK_API_KEY على Render.');
  }
});

bot.action('view_faucets', async (ctx) => {
  await ctx.editMessageText(
    '💰 *نظام الجمع التلقائي*\n\nأضف حساباتك وسأجمع لك كل 6 ساعات.',
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('⚡ جمع الآن', 'run_manual_claim')],
        [Markup.button.callback('➕ إضافة حساب', 'select_site')],
        [Markup.button.callback('🔙 العودة', 'back_to_main')]
      ]).reply_markup
    }
  );
});

bot.action('select_site', async (ctx) => {
  const buttons = SUPPORTED_SITES.map(s => [Markup.button.callback(s, 'add_site_' + s)]);
  buttons.push([Markup.button.callback('🔙 العودة', 'view_faucets')]);
  await ctx.editMessageText('اختر الموقع:', Markup.inlineKeyboard(buttons));
});

bot.action(/add_site_(.+)/, async (ctx) => {
  const site = ctx.match[1];
  userState.set(ctx.from.id, { step: 'await_email', site });
  await ctx.editMessageText('اخترت *' + site + '*\n\nأرسل البريد الإلكتروني:', { parse_mode: 'Markdown' });
});

bot.action('run_manual_claim', async (ctx) => {
  await ctx.answerCbQuery('⏳ جاري الجمع...');
  runAutomationCycle().catch(e => console.error(e));
  await ctx.reply('✅ بدأت دورة الجمع. ستُعلم عند الانتهاء.');
});

bot.action('view_stats', async (ctx) => {
  await ensureDb();
  const stats = await getUserStats(ctx.from.id);
  const user  = await getOrCreateUser(ctx.from.id, ctx.from.username);

  const walletCurrency = user.wallet_currency || '—';
  const walletNetwork  = user.wallet_network  || '—';
  const walletAddress  = user.wallet_address  || 'غير مضافة';

  const earnedCurrencies = Object.keys(stats.currencies || {});
  const mismatched = user.wallet_currency
    ? earnedCurrencies.filter(c => c !== user.wallet_currency)
    : [];

  let currencyWarning = '';
  if (mismatched.length > 0) {
    currencyWarning = '\n⚠️ *تنبيه:* عملات (' + mismatched.join(', ') + ') تختلف عن محفظتك (' + walletCurrency + ')';
  }

  let currenciesText = '';
  if (earnedCurrencies.length > 0) {
    currenciesText = '\n💎 *العملات المكتسبة:*\n';
    for (const [cur, amt] of Object.entries(stats.currencies)) {
      currenciesText += '   • ' + cur + ': ' + Number(amt).toFixed(8) + '\n';
    }
  }

  const text =
    '📊 *إحصائياتك:*\n\n' +
    '👤 ' + ctx.from.first_name + '\n' +
    '👛 المحفظة: `' + walletAddress + '`\n' +
    '🌐 الشبكة: ' + walletNetwork + '\n' +
    '💱 العملة الأساسية: *' + walletCurrency + '*\n' +
    '🏦 الحسابات: ' + stats.accountsCount + '\n' +
    '🔄 عمليات الجمع: ' + stats.totalClaims + '\n' +
    currenciesText + currencyWarning;

  const buttons = [[Markup.button.callback('🔗 رابط الإحالة', 'get_referral')]];
  if (mismatched.length > 0) {
    buttons.push([Markup.button.callback('🔄 كيف أسحب عملاتي؟', 'swap_advice')]);
  }
  buttons.push([Markup.button.callback('🔙 العودة', 'back_to_main')]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup
  });
});

bot.action('swap_advice', async (ctx) => {
  await ensureDb();
  const user  = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const stats = await getUserStats(ctx.from.id);
  if (!user.wallet_currency) { await ctx.answerCbQuery('⚠️ اضبط عملة المحفظة أولاً'); return; }

  const mismatched = Object.keys(stats.currencies || {}).filter(c => c !== user.wallet_currency);
  if (mismatched.length === 0) { await ctx.answerCbQuery('✅ عملاتك متطابقة'); return; }

  await ctx.answerCbQuery('⏳ جاري الاستشارة...');
  await ctx.reply('🤖 DeepSeek يبحث عن أفضل طريقة لتحويل ' + mismatched[0] + ' → ' + user.wallet_currency + '...');
  const advice = await getSwapAdvice(mismatched[0], user.wallet_currency);
  await ctx.reply('💱 *' + mismatched[0] + ' → ' + user.wallet_currency + ':*\n\n' + advice, { parse_mode: 'Markdown' });
});

bot.command('swap', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) { await ctx.reply('الاستخدام: /swap [من] [إلى]\nمثال: /swap BTC ETH'); return; }
  const from = args[0].toUpperCase();
  const to   = args[1].toUpperCase();
  await ctx.reply('🤖 DeepSeek يستشير... (' + from + ' → ' + to + ')');
  const advice = await getSwapAdvice(from, to);
  await ctx.reply('💱 *' + from + ' → ' + to + ':*\n\n' + advice, { parse_mode: 'Markdown' });
});

bot.action('view_settings', async (ctx) => {
  await ctx.editMessageText('⚙️ *الإعدادات:*', {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('👛 ربط محفظة', 'set_wallet')],
      [Markup.button.callback('🔔 الإشعارات', 'toggle_notif')],
      [Markup.button.callback('📋 حساباتي', 'my_accounts')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]).reply_markup
  });
});

bot.action('set_wallet', async (ctx) => {
  const netButtons = SUPPORTED_NETWORKS.map(n => [Markup.button.callback(n, 'wallet_net_' + n)]);
  netButtons.push([Markup.button.callback('🔙 العودة', 'view_settings')]);
  await ctx.editMessageText(
    '👛 *ربط المحفظة*\n\nالخطوة 1/3 — اختر الشبكة:',
    { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(netButtons).reply_markup }
  );
});

bot.action(/wallet_net_(.+)/, async (ctx) => {
  const network = ctx.match[1];
  const currencies = NETWORK_CURRENCIES[network] || ['USDT'];
  const curButtons = currencies.map(c => [Markup.button.callback(c, 'wallet_cur_' + network + '_' + c)]);
  curButtons.push([Markup.button.callback('🔙 العودة', 'set_wallet')]);
  await ctx.editMessageText(
    '👛 *ربط المحفظة*\n\nالشبكة: *' + network + '*\nالخطوة 2/3 — اختر العملة الأساسية:',
    { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(curButtons).reply_markup }
  );
});

bot.action(/wallet_cur_([^_]+)_(.+)/, async (ctx) => {
  const network  = ctx.match[1];
  const currency = ctx.match[2];
  userState.set(ctx.from.id, { step: 'await_wallet', network, currency });
  await ctx.editMessageText(
    '👛 *ربط المحفظة*\n\nالشبكة: *' + network + '* | العملة: *' + currency + '*\nالخطوة 3/3 — أرسل عنوان محفظتك:',
    { parse_mode: 'Markdown' }
  );
});

bot.action('toggle_notif', async (ctx) => {
  await ensureDb();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const newState = !user.notifications_enabled;
  await toggleNotifications(ctx.from.id, newState);
  await ctx.answerCbQuery(newState ? '🔔 تم تفعيل الإشعارات' : '🔕 تم إيقاف الإشعارات');
  await ctx.editMessageText(
    'الإشعارات: ' + (newState ? '🔔 مفعّلة' : '🔕 موقوفة'),
    { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'view_settings')]]).reply_markup }
  );
});

bot.action('my_accounts', async (ctx) => {
  await ensureDb();
  const accounts = await getUserAccounts(ctx.from.id);
  if (accounts.length === 0) {
    await ctx.editMessageText('📋 لا توجد حسابات.', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'view_settings')]]).reply_markup
    });
    return;
  }
  let text = '📋 *حساباتك:*\n\n';
  accounts.forEach((a, i) => { text += (i+1) + '. ' + a.site_name + ' — ' + a.email + '\n'; });
  const delButtons = accounts.map(a => [Markup.button.callback('🗑 حذف: ' + a.site_name, 'del_acc_' + a.id)]);
  delButtons.push([Markup.button.callback('🔙 العودة', 'view_settings')]);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(delButtons).reply_markup });
});

bot.action(/del_acc_(\d+)/, async (ctx) => {
  await ensureDb();
  await deleteAccount(parseInt(ctx.match[1]), ctx.from.id);
  await ctx.answerCbQuery('✅ تم الحذف');
  const accounts = await getUserAccounts(ctx.from.id);
  if (accounts.length === 0) {
    await ctx.editMessageText('📋 لا توجد حسابات.', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'view_settings')]]).reply_markup
    });
  }
});

bot.action('back_to_main', async (ctx) => {
  await ctx.editMessageText('اختر من القائمة:', Markup.inlineKeyboard([
    [Markup.button.callback('🔍 الإيردروبات', 'view_airdrops'), Markup.button.callback('🤖 اكتشاف AI', 'view_ai_airdrops')],
    [Markup.button.callback('💰 الجمع التلقائي', 'view_faucets')],
    [Markup.button.callback('📊 إحصائياتي', 'view_stats')],
    [Markup.button.callback('⚙️ الإعدادات', 'view_settings')]
  ]));
});

bot.action('get_referral', async (ctx) => {
  const botInfo = await bot.telegram.getMe();
  const link = 'https://t.me/' + botInfo.username + '?start=' + ctx.from.id;
  await ctx.reply('🔗 *رابط الإحالة:*\n\n`' + link + '`', { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (!state) return;
  try {
    await ensureDb();
    if (state.step === 'await_email') {
      userState.set(ctx.from.id, { ...state, step: 'await_password', email: ctx.message.text });
      await ctx.reply('✅ تم. أرسل *كلمة المرور:*', { parse_mode: 'Markdown' });

    } else if (state.step === 'await_password') {
      await addAccount(ctx.from.id, state.site, state.email, ctx.message.text);
      userState.delete(ctx.from.id);
      await ctx.reply('✅ تم إضافة حساب *' + state.site + '* بنجاح!', {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة', 'back_to_main')]]).reply_markup
      });

    } else if (state.step === 'await_wallet') {
      const address = ctx.message.text.trim();
      await updateUserWallet(ctx.from.id, address, state.network, state.currency);
      userState.delete(ctx.from.id);
      await ctx.reply(
        '✅ *تم ربط المحفظة!*\n\n' +
        '🌐 الشبكة: *' + state.network + '*\n' +
        '💱 العملة الأساسية: *' + state.currency + '*\n' +
        '👛 العنوان: `' + address + '`\n\n' +
        '⚠️ إذا كسبت عملات أخرى غير *' + state.currency + '*، استخدم:\n/swap [عملة] ' + state.currency,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة', 'back_to_main')]]).reply_markup
        }
      );
    }
  } catch (e) {
    console.error('Wizard error:', e);
    await ctx.reply('❌ حدث خطأ. حاول مرة أخرى.');
    userState.delete(ctx.from.id);
  }
});

bot.catch((err) => console.error('Telegraf error:', err));

async function main() {
  try {
    console.log('🚀 Starting Telegram Airdrop Bot...');
    await initDatabase();
    dbInitialized = true;

    const PORT = process.env.PORT || 3000;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Telegram Airdrop Bot is running!');
    });
    server.listen(PORT, () => console.log('🌐 HTTP server listening on port ' + PORT));

    await startAutomationScheduler();

    bot.launch().catch((err) => { console.error('Bot launch error:', err); process.exit(1); });
    console.log('✅ Bot is running!');

    process.once('SIGINT',  () => { bot.stop('SIGINT');  server.close(); });
    process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
