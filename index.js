import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { initDatabase, getOrCreateUser, getUserStats, getActiveAirdrops, addAccount, getUserAccounts } from './database.js';
import { startAutomationScheduler } from './automation.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '8643958185:AAHykYc6Jjz1jRhkl-2DnJn2r-qaE8eC2qY';
const bot = new Telegraf(BOT_TOKEN);

// Initialize database on startup
let dbInitialized = false;

bot.start(async (ctx) => {
  try {
    if (!dbInitialized) {
      await initDatabase();
      dbInitialized = true;
    }
    
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔍 تتبع الإيردروبات', 'view_airdrops')],
      [Markup.button.callback('💰 الجمع التلقائي', 'view_faucets')],
      [Markup.button.callback('📊 إحصائياتي', 'view_stats')],
      [Markup.button.callback('⚙️ الإعدادات', 'view_settings')]
    ]);
    
    await ctx.reply(
      `مرحباً ${ctx.from.first_name}! 👋\n\n` +
      `أنا بوت الإيردروبات والجمع التلقائي. سأساعدك في جمع العملات الرقمية مجاناً ومتابعة أحدث الفرص.\n\n` +
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
    await ctx.reply('حدث خطأ. يرجى المحاولة لاحقاً.');
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
      'استخدم الأمر /add_account لإضافة حساب جديد.';
    
    await ctx.editMessageText(
      text,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'back_to_main')]]).reply_markup
      }
    );
  } catch (error) {
    console.error('Error viewing faucets:', error);
  }
});

bot.action('view_stats', async (ctx) => {
  try {
    const stats = await getUserStats(ctx.from.id);
    
    const text = 
      '📊 **إحصائياتك الشخصية:**\n\n' +
      `👤 المستخدم: ${ctx.from.first_name}\n` +
      `🏦 عدد الحسابات المضافة: ${stats.accountsCount}\n` +
      `🔄 إجمالي عمليات الجمع: ${stats.totalClaims}\n` +
      `💰 إجمالي الأرباح المقدرة: ${stats.totalAmount} BTC\n\n` +
      '💡 **نصيحة لزيادة الربح:**\n' +
      'قم بإضافة المزيد من الحسابات واستخدم روابط الإحالة الخاصة بك لدعوة أصدقائك!';
    
    await ctx.editMessageText(
      text,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔗 رابط الإحالة', 'get_referral')],
          [Markup.button.callback('🔙 العودة', 'back_to_main')]
        ]).reply_markup
      }
    );
  } catch (error) {
    console.error('Error viewing stats:', error);
  }
});

bot.action('get_referral', async (ctx) => {
  try {
    const botInfo = await bot.telegram.getMe();
    const referralLink = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
    
    const text = 
      '🔗 **رابط الإحالة الخاص بك:**\n\n' +
      `\`${referralLink}\`\n\n` +
      'شارك هذا الرابط مع أصدقائك! ستحصل على نسبة 10% من أرباح كل شخص يسجل عن طريقك (ميزة قادمة).';
    
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error getting referral link:', error);
  }
});

bot.action('view_settings', async (ctx) => {
  try {
    const text = 
      '⚙️ **الإعدادات**\n\n' +
      'سيتم إضافة المزيد من الخيارات قريباً:\n' +
      '- تفعيل/تعطيل التنبيهات\n' +
      '- إضافة بروكسي\n' +
      '- إدارة الحسابات';
    
    await ctx.editMessageText(
      text,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'back_to_main')]]).reply_markup
      }
    );
  } catch (error) {
    console.error('Error viewing settings:', error);
  }
});

bot.action('back_to_main', async (ctx) => {
  try {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔍 تتبع الإيردروبات', 'view_airdrops')],
      [Markup.button.callback('💰 الجمع التلقائي', 'view_faucets')],
      [Markup.button.callback('📊 إحصائياتي', 'view_stats')],
      [Markup.button.callback('⚙️ الإعدادات', 'view_settings')]
    ]);
    
    await ctx.editMessageText(
      'اختر من القائمة أدناه:',
      keyboard
    );
  } catch (error) {
    console.error('Error going back to main:', error);
  }
});

bot.command('add_account', async (ctx) => {
  try {
    await ctx.reply(
      'لإضافة حساب جديد، يرجى إرسال البيانات بالصيغة التالية:\n\n' +
      '/add_account <site_name> <email> <password>\n\n' +
      'مثال:\n' +
      '/add_account FreeBitco.in myemail@gmail.com mypassword123'
    );
  } catch (error) {
    console.error('Error in add_account command:', error);
  }
});

// Handle errors
bot.catch((err) => {
  console.error('Telegraf error:', err);
});

// Start the bot
async function main() {
  try {
    console.log('🚀 Starting Telegram Airdrop Bot...');
    
    // Initialize database
    await initDatabase();
    dbInitialized = true;
    
    // Start automation scheduler
    await startAutomationScheduler();
    
    // Launch bot
    await bot.launch();
    console.log('✅ Bot is running!');
    
    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
