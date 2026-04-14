import axios from 'axios';
import * as cheerio from 'cheerio';
import { addAirdrop, addClaim, getDatabase } from './database.js';
import { searchAirdropsWithAI, searchFaucetSitesWithAI } from './deepseek.js';
import { automationEmitter } from './emitter.js';

function emit(action, data = {}) {
  automationEmitter.emit('step', { action, timestamp: new Date().toISOString(), ...data });
}

const AIRDROP_SOURCES = [
  'https://airdrops.io/latest/',
  'https://dropstab.com/'
];

export async function scrapeAirdrops() {
  emit('start', { message: '🔍 البحث في مصادر الإيردروبات المعروفة...' });
  for (const url of AIRDROP_SOURCES) {
    try {
      emit('visit', { site: url, message: 'جاري فتح: ' + url });
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      let found = 0;
      $('article, .airdrop-item, [data-airdrop]').each((i, elem) => {
        const name = $(elem).find('h3, h2, .title').text().trim();
        const link = $(elem).find('a').attr('href') || '';
        const reward = $(elem).find('.reward, .value').text().trim();
        if (name && link) {
          addAirdrop(name, link, reward || null, null, 'airdrop', 'scraper').catch(() => {});
          found++;
        }
      });
      emit('success', { site: url, message: '✅ تم سحب ' + found + ' إيردروب من ' + new URL(url).hostname });
    } catch (error) {
      emit('error', { site: url, message: '❌ ' + new URL(url).hostname + ': ' + error.message });
    }
  }
}

export async function runAutomationCycle() {
  emit('cycle_start', { message: '🤖 بدأت دورة الجمع التلقائي...' });

  // 1. Scrape known sources
  await scrapeAirdrops();

  // 2. AI discovery
  emit('ai_start', { message: '🤖 DeepSeek AI يبحث عن إيردروبات ومواقع جمع جديدة...' });
  try {
    const [airdrops, faucets] = await Promise.all([
      searchAirdropsWithAI(),
      searchFaucetSitesWithAI()
    ]);
    emit('ai_done', { message: '✅ AI اكتشف ' + airdrops.length + ' إيردروب و' + faucets.length + ' موقع جمع' });
  } catch (e) {
    emit('error', { message: '❌ خطأ في AI: ' + e.message });
  }

  // 3. Claim from registered accounts
  const db = getDatabase();
  if (db) {
    const accounts = await db.all('SELECT * FROM accounts WHERE is_active = 1');
    if (accounts.length === 0) {
      emit('info', { message: 'ℹ️ لا توجد حسابات مسجلة للجمع' });
    }
    for (const account of accounts) {
      await claimAccount(account);
    }
  }

  emit('cycle_done', { message: '✅ اكتملت دورة الجمع التلقائي!' });
}

async function claimAccount(account) {
  emit('visit', { site: account.site_name, message: 'جاري الدخول إلى ' + account.site_name + ' (' + account.email + ')' });
  try {
    if (account.site_name === 'FreeBitco.in') {
      await claimFreeBitcoin(account);
    } else {
      // Generic: simulate claim for AI-discovered sites
      emit('info', { site: account.site_name, message: '⏳ ' + account.site_name + ': الجمع التلقائي قيد التطوير' });
    }
  } catch (e) {
    emit('error', { site: account.site_name, message: '❌ خطأ في ' + account.site_name + ': ' + e.message });
  }
}

async function claimFreeBitcoin(account) {
  emit('action', { site: 'FreeBitco.in', message: 'فتح المتصفح لـ FreeBitco.in...' });
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    try {
      emit('action', { site: 'FreeBitco.in', message: '🌐 تحميل صفحة freebitco.in...' });
      await page.goto('https://freebitco.in/?op=home', { waitUntil: 'networkidle' });

      emit('action', { site: 'FreeBitco.in', message: '🔑 تسجيل الدخول بـ ' + account.email });
      const emailInput = await page.$('#login_form_btc_address');
      if (emailInput) {
        await emailInput.fill(account.email);
        const passwordInput = await page.$('#login_form_password');
        if (passwordInput) {
          await passwordInput.fill(account.password);
          await page.click('#login_button');
          await page.waitForTimeout(5000);
        }
      }

      emit('action', { site: 'FreeBitco.in', message: '🖱️ البحث عن زر الجمع...' });
      const claimBtn = await page.$('#free_play_form_button');
      if (claimBtn) {
        await claimBtn.click();
        await addClaim(account.id, 'FreeBitco.in', 0.00000001, 'BTC');
        emit('success', { site: 'FreeBitco.in', message: '✅ تم الجمع بنجاح من FreeBitco.in!' });
      } else {
        emit('info', { site: 'FreeBitco.in', message: '⏳ تم الجمع مسبقاً أو يوجد captcha' });
      }
    } finally {
      await browser.close();
      emit('action', { site: 'FreeBitco.in', message: '🔒 تم إغلاق المتصفح' });
    }
  } catch (e) {
    emit('error', { site: 'FreeBitco.in', message: '❌ خطأ: ' + e.message });
  }
}

export async function startAutomationScheduler() {
  console.log('⏰ Starting automation scheduler...');
  runAutomationCycle().catch(e => console.error('❌ First cycle error:', e.message));
  setInterval(() => {
    runAutomationCycle().catch(e => console.error('❌ Cycle error:', e.message));
  }, 6 * 3600000);
}
