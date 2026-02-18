// app/storage/init.js
const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const reportsDir = path.join(__dirname, '..', '..', 'reports');
const exportsDir = path.join(__dirname, '..', '..', 'exports');

const usersFile = path.join(dataDir, 'users.json');
const transactionsFile = path.join(dataDir, 'transactions.json');
const virtualAccountsFile = path.join(dataDir, 'virtualAccounts.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
const systemTransactionsFile = path.join(dataDir, 'systemTransactions.json');
const analyticsFile = path.join(dataDir, 'analytics.json');
const apiResponsesFile = path.join(dataDir, 'apiResponses.json');

async function ensureFile(filePath, defaultData = {}) {
  try {
    await fs.access(filePath);
    console.log(`✅ Found: ${path.basename(filePath)}`);
    return true;
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
    console.log(`📄 Created: ${path.basename(filePath)}`);
    return false;
  }
}

async function initStorage() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.mkdir(exportsDir, { recursive: true });
    
    const filesExist = {
      users: await ensureFile(usersFile, {}),
      transactions: await ensureFile(transactionsFile, {}),
      virtualAccounts: await ensureFile(virtualAccountsFile, {}),
      sessions: await ensureFile(sessionsFile, {}),
      systemTransactions: await ensureFile(systemTransactionsFile, []),
      analytics: await ensureFile(analyticsFile, {
        daily: {},
        weekly: {},
        monthly: {},
        userStats: {},
        categoryStats: {}
      }),
      apiResponses: await ensureFile(apiResponsesFile, {})
    };
    
    console.log('✅ Persistent storage initialized');
    return filesExist;
  } catch (error) {
    console.error('❌ Storage initialization error:', error);
    return {};
  }
}

module.exports = {
  dataDir,
  reportsDir,
  exportsDir,
  usersFile,
  transactionsFile,
  virtualAccountsFile,
  sessionsFile,
  systemTransactionsFile,
  analyticsFile,
  apiResponsesFile,
  ensureFile,
  initStorage
};