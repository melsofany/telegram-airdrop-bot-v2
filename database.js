import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'bot_database.db');

let db = null;

export async function initDatabase() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      join_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      site_name TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      proxy TEXT,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS airdrops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      link TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      reward_value TEXT,
      expiry_date DATETIME
    );

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      site_name TEXT NOT NULL,
      amount REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);

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

export async function getActiveAirdrops() {
  if (!db) throw new Error('Database not initialized');
  
  return await db.all('SELECT * FROM airdrops WHERE status = ? LIMIT 5', 'active');
}

export async function addAirdrop(name, link, rewardValue = null) {
  if (!db) throw new Error('Database not initialized');
  
  try {
    await db.run(
      'INSERT INTO airdrops (name, link, reward_value) VALUES (?, ?, ?)',
      [name, link, rewardValue]
    );
  } catch (err) {
    // Airdrop already exists
  }
}

export async function getUserStats(userId) {
  if (!db) throw new Error('Database not initialized');
  
  const accounts = await db.all('SELECT * FROM accounts WHERE user_id = ?', userId);
  const accountIds = accounts.map(acc => acc.id);
  
  if (accountIds.length === 0) {
    return { accountsCount: 0, totalClaims: 0, totalAmount: 0 };
  }
  
  const placeholders = accountIds.map(() => '?').join(',');
  const claims = await db.all(
    `SELECT * FROM claims WHERE account_id IN (${placeholders})`,
    accountIds
  );
  
  const totalAmount = claims.reduce((sum, claim) => sum + claim.amount, 0);
  
  return {
    accountsCount: accounts.length,
    totalClaims: claims.length,
    totalAmount: totalAmount.toFixed(8)
  };
}

export async function addClaim(accountId, siteName, amount) {
  if (!db) throw new Error('Database not initialized');
  
  await db.run(
    'INSERT INTO claims (account_id, site_name, amount) VALUES (?, ?, ?)',
    [accountId, siteName, amount]
  );
}

export function getDatabase() {
  return db;
}
