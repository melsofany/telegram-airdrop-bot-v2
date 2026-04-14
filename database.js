import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'bot_database.db');

let db = null;

export async function initDatabase() {
  db = await open({ filename: dbPath, driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      wallet_address TEXT,
      wallet_network TEXT,
      wallet_currency TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      join_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      site_name TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      proxy TEXT,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS airdrops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      link TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      reward_value TEXT,
      network TEXT,
      type TEXT DEFAULT 'airdrop',
      source TEXT DEFAULT 'scraper',
      expiry_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      site_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'BTC',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);

  // Migrate existing tables (add missing columns if needed)
  const migrations = [
    `ALTER TABLE users ADD COLUMN wallet_currency TEXT`,
    `ALTER TABLE airdrops ADD COLUMN network TEXT`,
    `ALTER TABLE airdrops ADD COLUMN type TEXT DEFAULT 'airdrop'`,
    `ALTER TABLE airdrops ADD COLUMN source TEXT DEFAULT 'scraper'`,
    `ALTER TABLE airdrops ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE claims ADD COLUMN currency TEXT DEFAULT 'BTC'`
  ];
  for (const m of migrations) {
    await db.run(m).catch(() => {});
  }

  console.log('Database initialized successfully');
  return db;
}

export async function getOrCreateUser(userId, username) {
  if (!db) throw new Error('Database not initialized');
  let user = await db.get('SELECT * FROM users WHERE user_id = ?', userId);
  if (!user) {
    await db.run('INSERT INTO users (user_id, username) VALUES (?, ?)', [userId, username]);
    user = await db.get('SELECT * FROM users WHERE user_id = ?', userId);
  }
  return user;
}

export async function updateUserWallet(userId, walletAddress, network, currency) {
  if (!db) throw new Error('Database not initialized');
  await db.run(
    'UPDATE users SET wallet_address = ?, wallet_network = ?, wallet_currency = ? WHERE user_id = ?',
    [walletAddress, network, currency || network, userId]
  );
}

export async function toggleNotifications(userId, enabled) {
  if (!db) throw new Error('Database not initialized');
  await db.run('UPDATE users SET notifications_enabled = ? WHERE user_id = ?', [enabled ? 1 : 0, userId]);
}

export async function addAccount(userId, siteName, email, password, proxy = null) {
  if (!db) throw new Error('Database not initialized');
  const result = await db.run(
    'INSERT INTO accounts (user_id, site_name, email, password, proxy) VALUES (?, ?, ?, ?, ?)',
    [userId, siteName, email, password, proxy]
  );
  return result.lastID;
}

export async function getUserAccounts(userId) {
  if (!db) throw new Error('Database not initialized');
  return await db.all('SELECT * FROM accounts WHERE user_id = ?', userId);
}

export async function deleteAccount(accountId, userId) {
  if (!db) throw new Error('Database not initialized');
  await db.run('DELETE FROM accounts WHERE id = ? AND user_id = ?', [accountId, userId]);
}

export async function updateAccountProxy(accountId, userId, proxy) {
  if (!db) throw new Error('Database not initialized');
  await db.run('UPDATE accounts SET proxy = ? WHERE id = ? AND user_id = ?', [proxy, accountId, userId]);
}

export async function getActiveAirdrops(type = null) {
  if (!db) throw new Error('Database not initialized');
  if (type) {
    return await db.all('SELECT * FROM airdrops WHERE status = ? AND type = ? ORDER BY created_at DESC LIMIT 8', ['active', type]);
  }
  return await db.all('SELECT * FROM airdrops WHERE status = ? ORDER BY created_at DESC LIMIT 8', 'active');
}

export async function getAirdropsBySource(source) {
  if (!db) throw new Error('Database not initialized');
  return await db.all('SELECT * FROM airdrops WHERE source = ? AND status = ? ORDER BY created_at DESC LIMIT 10', [source, 'active']);
}

export async function addAirdrop(name, link, rewardValue = null, network = null, type = 'airdrop', source = 'scraper') {
  if (!db) throw new Error('Database not initialized');
  await db.run(
    'INSERT OR IGNORE INTO airdrops (name, link, reward_value, network, type, source) VALUES (?, ?, ?, ?, ?, ?)',
    [name, link, rewardValue, network, type, source]
  );
}

export async function getUserStats(userId) {
  if (!db) throw new Error('Database not initialized');
  const accounts = await db.all('SELECT * FROM accounts WHERE user_id = ?', userId);
  const accountIds = accounts.map(acc => acc.id);
  if (accountIds.length === 0) return { accountsCount: 0, totalClaims: 0, totalAmount: 0, currencies: {} };

  const placeholders = accountIds.map(() => '?').join(',');
  const claims = await db.all(`SELECT * FROM claims WHERE account_id IN (${placeholders})`, accountIds);

  const totalAmount = claims.reduce((sum, c) => sum + c.amount, 0);
  const currencies = claims.reduce((acc, c) => {
    const cur = c.currency || 'BTC';
    acc[cur] = (acc[cur] || 0) + c.amount;
    return acc;
  }, {});

  return { accountsCount: accounts.length, totalClaims: claims.length, totalAmount: totalAmount.toFixed(8), currencies };
}

export async function addClaim(accountId, siteName, amount, currency = 'BTC') {
  if (!db) throw new Error('Database not initialized');
  await db.run(
    'INSERT INTO claims (account_id, site_name, amount, currency) VALUES (?, ?, ?, ?)',
    [accountId, siteName, amount, currency]
  );
}

export function getDatabase() { return db; }
