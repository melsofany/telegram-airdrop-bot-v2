import axios from 'axios';
import { addAirdrop } from './database.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

async function callDeepSeek(messages, maxTokens = 2000) {
  const response = await axios.post(DEEPSEEK_URL, {
    model: 'deepseek-chat',
    messages,
    temperature: 0.3,
    max_tokens: maxTokens
  }, {
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
  return response.data.choices[0].message.content.trim();
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) return JSON.parse(match[0]);
  return [];
}

export async function searchAirdropsWithAI() {
  if (!DEEPSEEK_API_KEY) { console.warn('⚠️ DEEPSEEK_API_KEY not set'); return []; }
  console.log('🤖 DeepSeek: searching for new airdrops...');
  try {
    const text = await callDeepSeek([
      { role: 'system', content: 'You are a crypto airdrop researcher. Return ONLY valid JSON array, no markdown.' },
      { role: 'user', content: `Find 10 currently active crypto airdrops (${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}). Return JSON array with fields: name, link (official URL), reward (estimated or "Unknown"), network (blockchain), type ("airdrop"). Only legitimate projects.` }
    ]);
    const airdrops = parseJSON(text);
    let added = 0;
    for (const item of airdrops) {
      if (item.name && item.link) {
        await addAirdrop(item.name, item.link, item.reward || null, item.network || null, item.type || 'airdrop', 'ai').catch(()=>{});
        added++;
      }
    }
    console.log(`✅ DeepSeek airdrops: added ${added} new items`);
    return airdrops;
  } catch (e) {
    console.error('❌ DeepSeek airdrop search error:', e.message);
    return [];
  }
}

export async function searchFaucetSitesWithAI() {
  if (!DEEPSEEK_API_KEY) { console.warn('⚠️ DEEPSEEK_API_KEY not set'); return []; }
  console.log('🤖 DeepSeek: searching for faucet sites...');
  try {
    const text = await callDeepSeek([
      { role: 'system', content: 'You are a crypto faucet researcher. Return ONLY valid JSON array, no markdown.' },
      { role: 'user', content: `List 8 top legitimate crypto faucet websites that pay users crypto for free. Return JSON array with fields: name, url, currencies (array like ["BTC","ETH"]), claimInterval (e.g. "1 hour"), minWithdrawal (string), type ("faucet").` }
    ]);
    const sites = parseJSON(text);
    let added = 0;
    for (const item of sites) {
      if (item.name && item.url) {
        const currencies = Array.isArray(item.currencies) ? item.currencies.join(',') : (item.currencies || '');
        await addAirdrop(item.name, item.url, `Min: ${item.minWithdrawal || '?'} | Every: ${item.claimInterval || '?'}`, currencies, 'faucet', 'ai').catch(()=>{});
        added++;
      }
    }
    console.log(`✅ DeepSeek faucets: added ${added} new sites`);
    return sites;
  } catch (e) {
    console.error('❌ DeepSeek faucet search error:', e.message);
    return [];
  }
}

export async function getSwapAdvice(fromCurrency, toCurrency) {
  if (!DEEPSEEK_API_KEY) return '⚠️ خدمة DeepSeek غير متاحة حالياً.';
  try {
    const text = await callDeepSeek([
      { role: 'system', content: 'أنت مستشار تشفير متخصص. أجب بالعربية بشكل مختصر وعملي.' },
      { role: 'user', content: `كيف أحول عملة ${fromCurrency} إلى ${toCurrency}؟ اذكر:\n1. أفضل 3 منصات مع أسمائها\n2. تقريب الرسوم لكل منصة\n3. هل هناك bridge مباشر أم swap؟\nاجعل الإجابة قصيرة وواضحة مع أرقام.` }
    ], 600);
    return text;
  } catch (e) {
    console.error('❌ DeepSeek swap advice error:', e.message);
    return '❌ تعذر الحصول على المعلومات. حاول لاحقاً.';
  }
}
