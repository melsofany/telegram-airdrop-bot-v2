import { Telegraf, Markup } from 'telegraf';
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

bot.action('view_airdrops', async (ctx) => {
  try {
    await ensureDb();
    const airdrops = await getActiveAirdrops();
    
    if (airdrops.length === 0) {
      await ctx.editMessageText(
        '🚀 لا توجد إيردروبات نشطة حالياً. سأقوم بتنبيهك فور توفرها!',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'back_to_main')]])
      );
    } else {
      let text = '🚀 **أحدث الإيردروبات المتاحة:**\n\n';
      airdrops.forEach((ad, i) => {
        text += `${i + 1}. **${ad.name}**\n`;
        text += `🔗 [رابط التسجيل](${ad.link})\n`;
        text += `💰 القيمة: ${ad.reward_value || 'غير محددة'}\n\n`;
      });
      
      await ctx.editMessageText(
        text,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'back_to_main')]]).reply_markup
        }
      );
    }
  } catch (error) {
    console.error('Error viewing airdrops:', error);
  }
});

bot.action('view_faucets', async (ctx) => {
  try {
    const text = 
      '💰 **نظام الجمع التلقائي (Faucets)**\n\n' +
      'يمكنك إضافة حساباتك في المواقع المدعومة وسأقوم بالجمع لك تلقائياً.\n\n' +
      '**المواقع المدعومة حالياً:**\n' +
      '1. FreeBitco.in\n' +
      '2. Cointiply\n' +
      '3. FireFaucet\n\n' +
      '**الخيارات المتاحة:**';
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⚡ جمع الآن يدوياً', 'run_manual_claim')],
      [Markup.button.callback('➕ إضافة حساب', 'add_account_info')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) {
    console.error('Error viewing faucets:', error);
  }
});

bot.action('run_manual_claim', async (ctx) => {
  try {
    await ctx.answerCbQuery('⏳ جاري بدء عملية الجمع التلقائي...');
    await runAutomationCycle();
    await ctx.reply('✅ اكتملت دورة الجمع التلقائي لجميع حساباتك النشطة.');
  } catch (error) {
    console.error('Error running manual claim:', error);
    await ctx.reply('❌ فشل تشغيل الجمع التلقائي. تأكد من إضافة حسابات أولاً.');
  }
});

bot.action('add_account_info', async (ctx) => {
  await ctx.reply(
    'لإضافة حساب جديد، استخدم الأمر التالي:\n' +
    '`/add_account <site_name> <email> <password>`\n\n' +
    'مثال:\n' +
    '`/add_account FreeBitco.in user@example.com pass123`',
    { parse_mode: 'Markdown' }
  );
});

bot.action('view_stats', async (ctx) => {
  try {
    await ensureDb();
    const stats = await getUserStats(ctx.from.id);
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    
    const text = 
      '📊 **إحصائياتك الشخصية:**\n\n' +
      `👤 المستخدم: ${ctx.from.first_name}\n` +
      `👛 المحفظة: \`${user.wallet_address || 'لم يتم التحديد'}\`\n` +
      `🏦 عدد الحسابات: ${stats.accountsCount}\n` +
      `🔄 عمليات الجمع: ${stats.totalClaims}\n` +
      `💰 الأرباح المقدرة: ${stats.totalAmount} BTC\n\n` +
      '💡 قم بإضافة محفظتك من الإعدادات لاستلام الأرباح.';
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔗 رابط الإحالة', 'get_referral')],
        [Markup.button.callback('🔙 العودة', 'back_to_main')]
      ]).reply_markup
    });
  } catch (error) {
    console.error('Error viewing stats:', error);
  }
});

bot.action('view_settings', async (ctx) => {
  try {
    await ensureDb();
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const notifyStatus = user.notifications_enabled ? '✅ مفعلة' : '❌ معطلة';

    const text = 
      '⚙️ **الإعدادات**\n\n' +
      `🔔 التنبيهات: ${notifyStatus}\n` +
      `👛 المحفظة الحالية: \`${user.wallet_address || 'غير مضافة'}\`\n\n` +
      'اختر ما تريد تعديله:';
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(`🔔 ${user.notifications_enabled ? 'تعطيل' : 'تفعيل'} التنبيهات`, 'toggle_notify')],
      [Markup.button.callback('👛 إضافة/تعديل المحفظة', 'edit_wallet')],
      [Markup.button.callback('📂 إدارة الحسابات والبروكسي', 'manage_accounts')],
      [Markup.button.callback('🔙 العودة', 'back_to_main')]
    ]);

    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
  } catch (error) {
    console.error('Error viewing settings:', error);
  }
});

bot.action('toggle_notify', async (ctx) => {
  try {
    await ensureDb();
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    await toggleNotifications(ctx.from.id, !user.notifications_enabled);
    await ctx.answerCbQuery('تم تحديث إعدادات التنبيهات');
    return bot.handleAction(ctx, 'view_settings');
  } catch (error) {
    console.error('Error toggling notifications:', error);
  }
});

bot.action('edit_wallet', async (ctx) => {
  await ctx.reply('يرجى إرسال عنوان محفظتك باستخدام الأمر التالي:\n`/set_wallet <address>`');
});

bot.action('manage_accounts', async (ctx) => {
  try {
    await ensureDb();
    const accounts = await getUserAccounts(ctx.from.id);
    if (accounts.length === 0) {
      return ctx.reply('ليس لديك حسابات مضافة حالياً. استخدم /add_account للإضافة.');
    }

    let text = '📂 **حساباتك المضافة:**\n\n';
    const buttons = [];
    accounts.forEach((acc) => {
      text += `🔹 ${acc.site_name} (${acc.email})\n🌐 بروكسي: ${acc.proxy || 'بدون'}\n\n`;
      buttons.push([Markup.button.callback(`❌ حذف ${acc.site_name}`, `del_acc_${acc.id}`)]);
      buttons.push([Markup.button.callback(`🌐 بروكسي ${acc.site_name}`, `proxy_acc_${acc.id}`)]);
    });
    buttons.push([Markup.button.callback('🔙 العودة', 'view_settings')]);

    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  } catch (error) {
    console.error('Error managing accounts:', error);
  }
});

bot.action(/del_acc_(\d+)/, async (ctx) => {
  const accId = ctx.match[1];
  await deleteAccount(accId, ctx.from.id);
  await ctx.answerCbQuery('تم حذف الحساب');
  return bot.handleAction(ctx, 'manage_accounts');
});

bot.action(/proxy_acc_(\d+)/, async (ctx) => {
  const accId = ctx.match[1];
  await ctx.reply(`لإضافة بروكسي لهذا الحساب، أرسل:\n\`/set_proxy ${accId} <ip:port:user:pass>\``);
});

bot.command('set_wallet', async (ctx) => {
  const wallet = ctx.message.text.split(' ')[1];
  if (!wallet) return ctx.reply('يرجى إدخال عنوان المحفظة. مثال: `/set_wallet 0x...`');
  await ensureDb();
  await updateUserWallet(ctx.from.id, wallet);
  await ctx.reply('✅ تم تحديث عنوان المحفظة بنجاح.');
});

bot.command('set_proxy', async (ctx) => {
  const parts = ctx.message.text.split(' ');
  if (parts.length < 3) return ctx.reply('الصيغة: `/set_proxy <account_id> <proxy_details>`');
  await ensureDb();
  await updateAccountProxy(parts[1], ctx.from.id, parts[2]);
  await ctx.reply('✅ تم تحديث البروكسي للحساب.');
});

bot.command('add_account', async (ctx) => {
  try {
    const parts = ctx.message.text.split(' ');
    if (parts.length < 4) {
      return ctx.reply('الصيغة: `/add_account <site_name> <email> <password>`');
    }
    await ensureDb();
    await addAccount(ctx.from.id, parts[1], parts[2], parts[3]);
    await ctx.reply(`✅ تم إضافة حساب ${parts[1]} بنجاح.`);
  } catch (error) {
    console.error('Error in add_account:', error);
    await ctx.reply('❌ حدث خطأ أثناء إضافة الحساب.');
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
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
