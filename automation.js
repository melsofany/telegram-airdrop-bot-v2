import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { addAirdrop, getUserAccounts, addClaim, getDatabase } from './database.js';

const AIRDROP_SOURCES = [
  'https://airdrops.io/latest/',
  'https://dropstab.com/'
];

export async function scrapeAirdrops() {
  console.log('🔍 Scraping airdrops...');
  
  for (const url of AIRDROP_SOURCES) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract airdrop data (adjust selectors based on actual website structure)
      $('article, .airdrop-item, [data-airdrop]').each((i, elem) => {
        const name = $(elem).find('h3, h2, .title').text().trim();
        const link = $(elem).find('a').attr('href') || '';
        const reward = $(elem).find('.reward, .value').text().trim();
        
        if (name && link) {
          addAirdrop(name, link, reward || null).catch(err => {
            // Airdrop might already exist
          });
        }
      });
      
      console.log(`✅ Scraped airdrops from ${url}`);
    } catch (error) {
      console.error(`❌ Error scraping ${url}:`, error.message);
    }
  }
}

export async function claimFreebitcoin(account) {
  console.log(`💰 Attempting to claim from FreeBitco.in for ${account.email}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  // Add stealth headers
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  try {
    await page.goto('https://freebitco.in/?op=home', { waitUntil: 'networkidle' });
    
    // Try to login
    const emailInput = await page.$('#login_form_btc_address');
    if (emailInput) {
      await emailInput.fill(account.email);
      const passwordInput = await page.$('#login_form_password');
      if (passwordInput) {
        await passwordInput.fill(account.password);
        const loginBtn = await page.$('#login_button');
        if (loginBtn) {
          await loginBtn.click();
          await page.waitForTimeout(5000);
        }
      }
    }
    
    // Try to claim
    const claimBtn = await page.$('#free_play_form_button');
    if (claimBtn) {
      await claimBtn.click();
      console.log(`✅ Claimed for ${account.email}`);
      
      // Record the claim
      const db = getDatabase();
      if (db) {
        await addClaim(account.id, 'FreeBitco.in', 0.00000001);
      }
    } else {
      console.log(`⏳ Already claimed or captcha required for ${account.email}`);
    }
  } catch (error) {
    console.error(`❌ Error claiming for ${account.email}:`, error.message);
  } finally {
    await browser.close();
  }
}

export async function runAutomationCycle() {
  console.log('🤖 Starting automation cycle...');
  
  // Scrape airdrops
  await scrapeAirdrops();
  
  // Claim from faucets for all registered accounts
  const db = getDatabase();
  if (db) {
    // Get all accounts
    const accounts = await db.all('SELECT * FROM accounts');
    
    for (const account of accounts) {
      if (account.site_name === 'FreeBitco.in') {
        await claimFreebitcoin(account);
      }
    }
  }
  
  console.log('✅ Automation cycle completed');
}

export async function startAutomationScheduler() {
  // Run automation cycle every hour
  console.log('⏰ Starting automation scheduler...');
  
  // Run immediately on start
  await runAutomationCycle();
  
  // Then run every hour
  setInterval(async () => {
    await runAutomationCycle();
  }, 3600000); // 1 hour
}
