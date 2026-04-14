import { Telegraf, Markup } from 'telegraf';
import http from 'http';
import dotenv from 'dotenv';
import { 
  initDatabase, 
  getOrCreateUser, 
  getUserStats, 
  getActiveAirdrops, 
  addAccount, 
  getUserAccounts,
  updateUserWallet,
  toggleNotifications,
  deleteAccount,
  updateAccountProxy
} from './database.js';
import { startAutomationScheduler, runAutomationCycle } from './automation.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '8643958185:AAHykYc6Jjz1jRhkl-2DnJn2r-qaE8eC2qY';
const bot = new Telegraf(BOT_TOKEN);

// State management for wizard-like flows
const userState = new Map();

const SUPPORTED_SITES = ['FreeBitco.in', 'Cointiply', 'FireFaucet'];
const SUPPORTED_NETWORKS = ['ERC20', 'BEP20', 'TRC20', 'SOL', 'TON'];

// Initialize database on startup
let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

bot.start(async (ctx) => {
  try {
    await ensureDb();
    await getOrCreateUser(ctx.from.id, ctx.from.username);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔍 تتبع الإيردروبات', 'view_airdrops')],
      [Markup.button.callback('💰 الجمع التلقائي', 'view_faucets')],
      [Markup.button.callback('📊 إحصائياتي', 'view_stats')],
      [Markup.button.callback('⚙️ الإعدادات', 'view_settings')]
    ]);
    
    await ctx.reply(
      `مرحباً ${ctx.from.first_name}! 👋\n\n` +
      `أنا بوت الإيردروبات والجمع التلقائي المطور. سأساعدك في جمع العملات الرقمية مجاناً ومتابعة أحدث الفرص.\n\n` +
      `اختر من القائمة أدناه للبدء:`,
      keyboard
    );
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('حدث خطأ. يرجى المحاولة لاحقاً.');
  }
});

// --- Faucets & Automation ---
bot.action('view_faucets', async (ctx) => {
  const text = 
    '💰 **نظام الجمع التلقائي (Faucets)**\n\n' +
    'يمكنك إضافة حساباتك في المواقع المدعومة وسأقوم بالجمع لك تلقائياً.\n\n' +
    '**الخيارات المتاحة:**';
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚡ جمع الآن يدوياً', 'run_manual_claim')],
    [Markup.button.callback('➕ إضافة حساب جديد', 'select_site')],
    [Markup.button.callback('🔙 العودة', 'back_to_main')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
});

bot.action('select_site', async (ctx) => {
  const buttons = SUPPORTED_SITES.map(site => [Markup.button.callback(site, `add_site_${site}`)]);
  buttons.push([Markup.button.callback('🔙 العودة', 'view_faucets')]);
  
  await ctx.editMessageText('اختر الموقع الذي تريد إضافته:', Markup.inlineKeyboard(buttons));
});

bot.action(/add_site_(.+)/, async (ctx) => {
  const site = ctx.match[1];
  userState.set(ctx.from.id, { step: 'await_email', site });
  await ctx.editMessageText(`لقد اخترت **${site}**.\n\nالآن، يرجى إرسال **البريد الإلكتروني** الخاص بحسابك:`, { parse_mode: 'Markdown' });
});

bot.action('run_manual_claim', async (ctx) => {
  await ctx.answerCbQuery('⏳ جاري بدء عملية الجمع التلقائي...');
  await runAutomationCycle();
  await ctx.reply('✅ اكتملت دورة الجمع التلقائي لجميع حساباتك النشطة.');
});

// --- Stats ---
bot.action('view_stats', async (ctx) => {
  await ensureDb();
  const stats = await getUserStats(ctx.from.id);
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  
  const text = 
    '📊 **إحصائياتك الشخصية:**\n\n' +
    `👤 المستخدم: ${ctx.from.first_name}\n` +
    `👛 المحفظة: \`${user.wallet_address || 'غير مضافة'}\`\n` +
    `🌐 الشبكة: \`${user.wallet_network || 'غير محددة'}\`\n` +
    `🏦 عدد الحسابات: ${stats.accountsCount}\n` +
    `🔄 عمليات الجمع: ${stats.totalClaims}\n` +
    `💰 الأرباح المقدرة: ${stats.totalAmount} BTC`;
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔗 رابط الإحالة', 'get_referral')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]).reply_markup
  });
});

// --- Settings ---
bot.action('view_settings', async (ctx) => {
  await ensureDb();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const notifyStatus = user.notifications_enabled ? '✅ مفعلة' : '❌ معطلة';

  const text = 
    '⚙️ **الإعدادات**\n\n' +
    `🔔 التنبيهات: ${notifyStatus}\n` +
    `👛 المحفظة: \`${user.wallet_address || 'غير مضافة'}\`\n` +
    `🌐 الشبكة: \`${user.wallet_network || 'غير محددة'}\`\n\n` +
    'اختر ما تريد تعديله:';
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`🔔 ${user.notifications_enabled ? 'تعطيل' : 'تفعيل'} التنبيهات`, 'toggle_notify')],
    [Markup.button.callback('👛 إعداد المحفظة والشبكة', 'setup_wallet')],
    [Markup.button.callback('📂 إدارة الحسابات والبروكسي', 'manage_accounts')],
    [Markup.button.callback('🔙 العودة', 'back_to_main')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
});

bot.action('setup_wallet', async (ctx) => {
  const buttons = SUPPORTED_NETWORKS.map(net => [Markup.button.callback(net, `set_net_${net}`)]);
  buttons.push([Markup.button.callback('🔙 العودة', 'view_settings')]);
  
  await ctx.editMessageText('يرجى اختيار نوع الشبكة أولاً:', Markup.inlineKeyboard(buttons));
});

bot.action(/set_net_(.+)/, async (ctx) => {
  const net = ctx.match[1];
  userState.set(ctx.from.id, { step: 'await_wallet', network: net });
  await ctx.editMessageText(`تم اختيار شبكة **${net}**.\n\nالآن، يرجى إرسال **عنوان المحفظة**:`, { parse_mode: 'Markdown' });
});

bot.action('toggle_notify', async (ctx) => {
  await ensureDb();
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  await toggleNotifications(ctx.from.id, !user.notifications_enabled);
  await ctx.answerCbQuery('تم تحديث إعدادات التنبيهات');
  return bot.handleAction(ctx, 'view_settings');
});

// --- Accounts Management ---
bot.action('manage_accounts', async (ctx) => {
  await ensureDb();
  const accounts = await getUserAccounts(ctx.from.id);
  if (accounts.length === 0) {
    return ctx.editMessageText('ليس لديك حسابات مضافة حالياً.', Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'view_settings')]]));
  }

  let text = '📂 **حساباتك المضافة:**\n\n';
  const buttons = [];
  accounts.forEach((acc) => {
    text += `🔹 ${acc.site_name} (${acc.email})\n`;
    buttons.push([Markup.button.callback(`❌ حذف ${acc.site_name}`, `del_acc_${acc.id}`)]);
  });
  buttons.push([Markup.button.callback('🔙 العودة', 'view_settings')]);

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
});

bot.action(/del_acc_(\d+)/, async (ctx) => {
  await deleteAccount(ctx.match[1], ctx.from.id);
  await ctx.answerCbQuery('تم حذف الحساب');
  return bot.handleAction(ctx, 'manage_accounts');
});

// --- Text Message Handler (Wizard Flow) ---
bot.on('text', async (ctx) => {
  const state = userState.get(ctx.from.id);
  if (!state) return;

  try {
    if (state.step === 'await_email') {
      state.email = ctx.message.text;
      state.step = 'await_password';
      await ctx.reply(`تم استلام البريد: \`${state.email}\`\n\nالآن أرسل **كلمة المرور**:`, { parse_mode: 'Markdown' });
    } 
    else if (state.step === 'await_password') {
      const password = ctx.message.text;
      await ensureDb();
      await addAccount(ctx.from.id, state.site, state.email, password);
      userState.delete(ctx.from.id);
      await ctx.reply(`✅ تم إضافة حساب **${state.site}** بنجاح!`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة الرئيسية', 'back_to_main')]]).reply_markup
      });
    }
    else if (state.step === 'await_wallet') {
      const wallet = ctx.message.text;
      await ensureDb();
      await updateUserWallet(ctx.from.id, wallet, state.network);
      userState.delete(ctx.from.id);
      await ctx.reply(`✅ تم حفظ المحفظة بنجاح!\n\nالشبكة: **${state.network}**\nالعنوان: \`${wallet}\``, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 القائمة الرئيسية', 'back_to_main')]]).reply_markup
      });
    }
  } catch (error) {
    console.error('Error in wizard flow:', error);
    await ctx.reply('❌ حدث خطأ أثناء المعالجة. يرجى المحاولة مرة أخرى.');
    userState.delete(ctx.from.id);
  }
});

bot.action('back_to_main', async (ctx) => {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔍 تتبع الإيردروبات', 'view_airdrops')],
    [Markup.button.callback('💰 الجمع التلقائي', 'view_faucets')],
    [Markup.button.callback('📊 إحصائياتي', 'view_stats')],
    [Markup.button.callback('⚙️ الإعدادات', 'view_settings')]
  ]);
  await ctx.editMessageText('اختر من القائمة أدناه:', keyboard);
});

bot.action('get_referral', async (ctx) => {
  const botInfo = await bot.telegram.getMe();
  const referralLink = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  await ctx.reply(`🔗 **رابط الإحالة الخاص بك:**\n\n\`${referralLink}\``, { parse_mode: 'Markdown' });
});

bot.catch((err) => console.error('Telegraf error:', err));

async function main() {
  try {
    console.log('🚀 Starting Telegram Airdrop Bot...');
    await initDatabase();
    dbInitialized = true;
    await startAutomationScheduler();
    await bot.launch();
    console.log('✅ Bot is running!');

    // HTTP server to satisfy Render port binding requirement
    const PORT = process.env.PORT || 3000;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Telegram Airdrop Bot is running!');
    });
    server.listen(PORT, () => {
      console.log('🌐 HTTP server listening on port ' + PORT);
    });

    process.once('SIGINT', () => { bot.stop('SIGINT'); server.close(); });
    process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();