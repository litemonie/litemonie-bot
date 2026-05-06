// ==================== database-sql.js ====================
// SQLite Database System for Litemonie Bot
// ========================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database file path
const DB_PATH = path.join(__dirname, 'data', 'litemonie.db');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Create database connection
const db = new sqlite3.Database(DB_PATH);

// ========== INITIALIZE DATABASE TABLES ==========
function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    telegram_id TEXT UNIQUE NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    username TEXT,
                    email TEXT,
                    phone TEXT,
                    pin TEXT,
                    wallet REAL DEFAULT 0,
                    kyc_status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS virtual_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    account_number TEXT UNIQUE NOT NULL,
                    bank_name TEXT,
                    account_name TEXT,
                    bank_code TEXT,
                    reference TEXT,
                    provider TEXT DEFAULT 'billstack',
                    is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    amount REAL NOT NULL,
                    status TEXT DEFAULT 'pending',
                    reference TEXT UNIQUE,
                    description TEXT,
                    previous_balance REAL,
                    new_balance REAL,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    step INTEGER DEFAULT 1,
                    data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);

            console.log('✅ SQLite Database initialized');
            resolve();
        });
    });
}

// ========== USER FUNCTIONS ==========

async function getUserByTelegramId(telegramId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId.toString()], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

async function getUserById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

async function getUserByEmail(email) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

async function upsertUser(telegramId, userData) {
    return new Promise((resolve, reject) => {
        const { firstName, lastName, username, email, phone, pin, wallet, kycStatus } = userData;

        db.run(`
            INSERT INTO users (telegram_id, first_name, last_name, username, email, phone, pin, wallet, kyc_status, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(telegram_id) DO UPDATE SET
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                username = COALESCE(?, username),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                pin = COALESCE(?, pin),
                wallet = COALESCE(?, wallet),
                kyc_status = COALESCE(?, kyc_status),
                updated_at = CURRENT_TIMESTAMP
        `, [telegramId.toString(), firstName, lastName, username, email, phone, pin, wallet || 0, kycStatus || 'pending',
            firstName, lastName, username, email, phone, pin, wallet, kycStatus], function(err) {
            if (err) reject(err);
            resolve({ id: this.lastID, telegram_id: telegramId });
        });
    });
}

async function updateUserWallet(telegramId, amount) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE users SET wallet = wallet + ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`, [amount, telegramId.toString()], function(err) {
            if (err) reject(err);
            resolve({ changes: this.changes });
        });
    });
}

async function updateUserEmail(telegramId, email) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?`, [email, telegramId.toString()], function(err) {
            if (err) reject(err);
            resolve({ changes: this.changes });
        });
    });
}

async function getAllUsers() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM users ORDER BY created_at DESC', (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
}

// ========== VIRTUAL ACCOUNT FUNCTIONS ==========

async function createVirtualAccount(userId, accountData) {
    return new Promise((resolve, reject) => {
        const { account_number, bank_name, account_name, bank_code, reference, provider } = accountData;

        db.run(`INSERT INTO virtual_accounts (user_id, account_number, bank_name, account_name, bank_code, reference, provider, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`, [userId, account_number, bank_name, account_name, bank_code, reference, provider], function(err) {
            if (err) reject(err);
            resolve({ id: this.lastID });
        });
    });
}

async function getVirtualAccountByUserId(userId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM virtual_accounts WHERE user_id = ? AND is_active = 1', [userId], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

async function getVirtualAccountByNumber(accountNumber) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM virtual_accounts WHERE account_number = ? AND is_active = 1', [accountNumber], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

async function deactivateVirtualAccount(accountId) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE virtual_accounts SET is_active = 0 WHERE id = ?', [accountId], function(err) {
            if (err) reject(err);
            resolve({ changes: this.changes });
        });
    });
}

// ========== TRANSACTION FUNCTIONS ==========

async function recordTransactionSQL(userId, transactionData) {
    return new Promise((resolve, reject) => {
        const { type, amount, status, reference, description, previous_balance, new_balance, metadata } = transactionData;

        db.run(`INSERT INTO transactions (user_id, type, amount, status, reference, description, previous_balance, new_balance, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, type, amount, status, reference, description, previous_balance, new_balance, JSON.stringify(metadata || {})], function(err) {
            if (err) reject(err);
            resolve({ id: this.lastID });
        });
    });
}

async function getUserTransactions(userId, limit = 20) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
}

// ========== SESSION FUNCTIONS ==========

async function saveSession(userId, action, step, data) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO sessions (user_id, action, step, data, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT DO UPDATE SET action = excluded.action, step = excluded.step, data = excluded.data, updated_at = CURRENT_TIMESTAMP`, [userId, action, step, JSON.stringify(data || {})], function(err) {
            if (err) reject(err);
            resolve({ id: this.lastID });
        });
    });
}

async function getSession(userId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM sessions WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            if (row && row.data) row.data = JSON.parse(row.data);
            resolve(row);
        });
    });
}

async function deleteSession(userId) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM sessions WHERE user_id = ?', [userId], function(err) {
            if (err) reject(err);
            resolve({ changes: this.changes });
        });
    });
}

// ========== PROFILE FUNCTIONS ==========

async function getUserProfile(telegramId) {
    const user = await getUserByTelegramId(telegramId);
    if (!user) return null;
    const virtualAccount = await getVirtualAccountByUserId(user.id);
    const recentTransactions = await getUserTransactions(user.id, 5);
    return { user, virtualAccount, recentTransactions };
}

// ========== EXPORTS ==========
module.exports = {
    initDatabase,
    getUserByTelegramId,
    getUserById,
    getUserByEmail,
    upsertUser,
    updateUserWallet,
    updateUserEmail,
    getAllUsers,
    createVirtualAccount,
    getVirtualAccountByUserId,
    getVirtualAccountByNumber,
    deactivateVirtualAccount,
    recordTransactionSQL,
    getUserTransactions,
    saveSession,
    getSession,
    deleteSession,
    getUserProfile,
    db
};
