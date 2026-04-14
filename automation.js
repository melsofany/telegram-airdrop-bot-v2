import axios from 'axios';
import * as cheerio from 'cheerio';
import { addAirdrop, getUserAccounts, addClaim, getDatabase } from './database.js';
import { searchAirdropsWithAI, searchFaucetSitesWithAI } from './deepseek.js';

const AIRDROP_SOURCES = [
  'https://airdrops.io/latest/',
  'https://dropstab.com/'
];

export async function scrapeAirdrops() {
  console.log('🔍 Scraping airdrops from known sites...');
  for (const url of AIRDROP_SOURCES) {
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      $('article, .airdrop-item, [data-airdrop]').each((i, elem) => {
        const name = $(elem).find('h3, h2, .title').text().trim();
        const link = $(elem).find('a').attr('href') || '';
        const reward = $(elem).find('.reward, .value').text().trim();
        if (name && link) {
          addAirdrop(name, link, reward || null, null, 'airdrop', 'scraper').catch(() => {});
        }
      });
      console.log(`✅ Scraped from ${url}`);
    } catch (error) {
      console.error(`❌ Error scraping ${url}:`, error.message);
    }
  }
}

export async function runAutomationCycle() {
  console.log('🤖 Starting automation cycle...');

  // 1. Scrape from known sources
  await scrapeAirdrops();

  // 2. Use DeepSeek AI to discover new airdrops and faucets
  try {
    await searchAirdropsWithAI();
    await searchFaucetSitesWithAI();
  } catch (e) {
    console.error('❌ AI discovery error:', e.message);
  }

  // 3. Run faucet claims for registered accounts
  const db = getDatabase();
  if (db) {
    const accounts = await db.all('SELECT * FROM accounts WHERE is_active = 1');
    for (const account of accounts) {
      if (account.site_name === 'FreeBitco.in') {
        await claimFreeBitcoin(account);
      }
    }
  }

  console.log('✅ Automation cycle completed');
}

export async function startAutomationScheduler() {
  console.log('⏰ Starting automation scheduler...');
  // Run immediately on start
  runAutomationCycle().catch(e => console.error('❌ First cycle error:', e.message));
  // Then every 6 hours (AI search doesn't need to run every hour)
  setInterval(() => {
    runAutomationCycle().catch(e => console.error('❌ Cycle error:', e.message));
  }, 6 * 3600000);
}

async function claimFreeBitcoin(account) {
  console.log(`💰 Attempting claim from FreeBitco.in for ${account.email}`);
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    try {
      await page.goto('https://freebitco.in/?op=home', { waitUntil: 'networkidle' });
      const emailInput = await page.$('#login_form_btc_address');
      if (emailInput) {
        await emailInput.fill(account.email);
        const passwordInput = await page.$('#login_form_password');
        if (passwordInput) {
          await passwordInput.fill(account.password);
          const loginBtn = await page.$('#login_button');
          if (loginBtn) { await loginBtn.click(); await page.waitForTimeout(5000); }
        }
      }
      const claimBtn = await page.$('#free_play_form_button');
      if (claimBtn) {
        await claimBtn.click();
        await addClaim(account.id, 'FreeBitco.in', 0.00000001, 'BTC');
        console.log(`✅ Claimed for ${account.email}`);
      } else {
        console.log(`⏳ Already claimed or captcha for ${account.email}`);
      }
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error(`❌ Claim error for ${account.email}:`, e.message);
  }
}
