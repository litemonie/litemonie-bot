// ==================== DATABASE.JS ====================
// Persistent storage operations with transaction sync
// ====================================================

const fs = require('fs').promises;
const path = require('path');

// ==================== PATHS ====================
const dataDir = path.join(__dirname, 'data');
const reportsDir = path.join(__dirname, 'reports');
const exportsDir = path.join(__dirname, 'exports');
const usersFile = path.join(dataDir, 'users.json');
const transactionsFile = path.join(dataDir, 'transactions.json');
const virtualAccountsFile = path.join(dataDir, 'virtualAccounts.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
const systemTransactionsFile = path.join(dataDir, 'systemTransactions.json');
const analyticsFile = path.join(dataDir, 'analytics.json');
const apiResponsesFile = path.join(dataDir, 'apiResponses.json');

// ==================== DATA STORES ====================
let users = {};
let transactions = {};
let virtualAccountsData = {};
let sessions = {};
let systemTransactions = [];
let analytics = {};
let apiResponses = {};

// ==================== FILE OPERATIONS ====================
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
    
    await ensureFile(usersFile, {});
    await ensureFile(transactionsFile, {});
    await ensureFile(virtualAccountsFile, {});
    await ensureFile(sessionsFile, {});
    await ensureFile(systemTransactionsFile, []);
    await ensureFile(analyticsFile, {
      daily: {},
      weekly: {},
      monthly: {},
      userStats: {},
      categoryStats: {}
    });
    await ensureFile(apiResponsesFile, {});
    
    console.log('✅ Persistent storage initialized');
  } catch (error) {
    console.error('❌ Storage initialization error:', error);
  }
}

async function loadData() {
  try {
    users = JSON.parse(await fs.readFile(usersFile, 'utf8'));
    transactions = JSON.parse(await fs.readFile(transactionsFile, 'utf8'));
    virtualAccountsData = JSON.parse(await fs.readFile(virtualAccountsFile, 'utf8'));
    sessions = JSON.parse(await fs.readFile(sessionsFile, 'utf8'));
    systemTransactions = JSON.parse(await fs.readFile(systemTransactionsFile, 'utf8'));
    analytics = JSON.parse(await fs.readFile(analyticsFile, 'utf8'));
    apiResponses = JSON.parse(await fs.readFile(apiResponsesFile, 'utf8'));
    
    console.log('✅ All data loaded successfully');
    console.log(`📊 Stats: ${Object.keys(users).length} users, ${Object.keys(transactions).length} users with transactions, ${systemTransactions.length} system transactions`);
  } catch (error) {
    console.error('❌ Error loading data:', error);
  }
}

async function saveAllData() {
  try {
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    await fs.writeFile(transactionsFile, JSON.stringify(transactions, null, 2));
    await fs.writeFile(virtualAccountsFile, JSON.stringify(virtualAccountsData, null, 2));
    await fs.writeFile(sessionsFile, JSON.stringify(sessions, null, 2));
    await fs.writeFile(systemTransactionsFile, JSON.stringify(systemTransactions, null, 2));
    await fs.writeFile(analyticsFile, JSON.stringify(analytics, null, 2));
    await fs.writeFile(apiResponsesFile, JSON.stringify(apiResponses, null, 2));
    
    console.log('💾 All data saved successfully');
  } catch (error) {
    console.error('❌ Error saving data:', error);
  }
}

function setupAutoSave() {
  setInterval(async () => {
    await saveAllData();
    console.log('💾 Auto-saved all data');
  }, 30000); // Save every 30 seconds
}

// ==================== ENHANCED TRANSACTION FUNCTIONS ====================

/**
 * Record a transaction in BOTH storage systems automatically
 * This ensures user history AND admin tracking are always in sync
 */
async function recordTransaction(userId, transactionData) {
  try {
    // Generate transaction ID if not provided
    const txId = transactionData.id || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Ensure user exists
    if (!users[userId]) {
      users[userId] = { telegramId: userId, wallet: 0, createdAt: new Date().toISOString() };
    }
    
    // Get user info for enrichment
    const user = users[userId];
    
    // Create enriched transaction object
    const enrichedTransaction = {
      id: txId,
      userId: userId,
      telegramId: userId,
      timestamp: transactionData.timestamp || new Date().toISOString(),
      type: transactionData.type || 'unknown',
      category: transactionData.category || transactionData.type || 'general',
      amount: parseFloat(transactionData.amount) || 0,
      status: transactionData.status || 'completed',
      description: transactionData.description || `${transactionData.type || 'Transaction'} for user ${userId}`,
      phone: transactionData.phone,
      network: transactionData.network,
      dataPlan: transactionData.dataPlan || transactionData.planName,
      reference: transactionData.reference || transactionData.id || txId,
      error: transactionData.error,
      metadata: transactionData.metadata || {},
      user: {
        telegramId: userId,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        phone: user.phone || ''
      }
    };
    
    // ===== 1. SAVE TO USER-SPECIFIC HISTORY (for "📜 Transaction History") =====
    if (!transactions[userId]) {
      transactions[userId] = [];
    }
    
    // Check if transaction already exists in user history
    const existingUserTxIndex = transactions[userId].findIndex(tx => tx.id === txId);
    if (existingUserTxIndex === -1) {
      transactions[userId].push(enrichedTransaction);
    } else {
      // Update existing
      transactions[userId][existingUserTxIndex] = {
        ...transactions[userId][existingUserTxIndex],
        ...enrichedTransaction
      };
    }
    
    // Keep only last 100 transactions per user (optional, prevents unlimited growth)
    if (transactions[userId].length > 100) {
      transactions[userId] = transactions[userId].slice(-100);
    }
    
    // ===== 2. SAVE TO SYSTEM TRANSACTIONS (for Admin Advanced Tracking) =====
    const existingSystemTxIndex = systemTransactions.findIndex(tx => tx.id === txId);
    if (existingSystemTxIndex === -1) {
      systemTransactions.push(enrichedTransaction);
    } else {
      // Update existing
      systemTransactions[existingSystemTxIndex] = {
        ...systemTransactions[existingSystemTxIndex],
        ...enrichedTransaction
      };
    }
    
    // Keep only last 5000 system transactions (prevents memory issues)
    if (systemTransactions.length > 5000) {
      systemTransactions = systemTransactions.slice(-5000);
    }
    
    // Auto-save (optional - you can comment this out if auto-save handles it)
    // await saveAllData();
    
    console.log(`✅ Transaction recorded: ${txId} (User: ${userId}, Type: ${transactionData.type}, Amount: ₦${enrichedTransaction.amount})`);
    return enrichedTransaction;
    
  } catch (error) {
    console.error('❌ Error recording transaction:', error);
    return null;
  }
}

/**
 * Record multiple transactions at once (batch operation)
 */
async function recordTransactions(userId, transactionsArray) {
  const results = [];
  for (const tx of transactionsArray) {
    const result = await recordTransaction(userId, tx);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Sync existing user transactions to system transactions
 * Run this once to fix existing data
 */
async function syncTransactionsToSystem() {
  console.log('🔄 Starting transaction sync...');
  let syncedCount = 0;
  let skippedCount = 0;
  
  // Create a Set of existing system transaction IDs for quick lookup
  const existingSystemIds = new Set(systemTransactions.map(tx => tx.id));
  
  // Loop through all users and their transactions
  for (const [userId, userTransactions] of Object.entries(transactions)) {
    for (const tx of userTransactions) {
      // If transaction not in system transactions, add it
      if (!existingSystemIds.has(tx.id)) {
        // Ensure transaction has all required fields
        const enrichedTx = {
          ...tx,
          userId: userId,
          telegramId: userId,
          // Ensure user object exists
          user: tx.user || {
            telegramId: userId,
            firstName: users[userId]?.firstName || '',
            lastName: users[userId]?.lastName || '',
            username: users[userId]?.username || '',
            phone: users[userId]?.phone || ''
          }
        };
        
        systemTransactions.push(enrichedTx);
        existingSystemIds.add(tx.id);
        syncedCount++;
      } else {
        skippedCount++;
      }
    }
  }
  
  console.log(`✅ Sync complete: ${syncedCount} transactions added, ${skippedCount} already existed`);
  await saveAllData();
  return { synced: syncedCount, skipped: skippedCount };
}

/**
 * Get user transactions with pagination
 */
function getUserTransactions(userId, page = 1, limit = 20) {
  const userTxs = transactions[userId] || [];
  const start = (page - 1) * limit;
  const end = start + limit;
  
  return {
    total: userTxs.length,
    page,
    limit,
    totalPages: Math.ceil(userTxs.length / limit),
    transactions: userTxs.slice(start, end).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    )
  };
}

/**
 * Get system transactions with advanced filtering
 */
function getFilteredSystemTransactions(filters = {}) {
  let results = [...systemTransactions];
  
  // Apply filters
  if (filters.userId) {
    results = results.filter(tx => tx.userId === filters.userId || tx.telegramId === filters.userId);
  }
  
  if (filters.type) {
    results = results.filter(tx => tx.type === filters.type);
  }
  
  if (filters.status) {
    results = results.filter(tx => tx.status === filters.status);
  }
  
  if (filters.startDate) {
    const start = new Date(filters.startDate);
    results = results.filter(tx => new Date(tx.timestamp) >= start);
  }
  
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    results = results.filter(tx => new Date(tx.timestamp) <= end);
  }
  
  if (filters.minAmount) {
    results = results.filter(tx => (tx.amount || 0) >= filters.minAmount);
  }
  
  if (filters.maxAmount) {
    results = results.filter(tx => (tx.amount || 0) <= filters.maxAmount);
  }
  
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    results = results.filter(tx => 
      tx.id?.toLowerCase().includes(term) ||
      tx.description?.toLowerCase().includes(term) ||
      tx.phone?.toLowerCase().includes(term) ||
      tx.reference?.toLowerCase().includes(term)
    );
  }
  
  // Sort by timestamp (newest first)
  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return results;
}

/**
 * Get transaction statistics
 */
function getTransactionStats() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  return {
    total: systemTransactions.length,
    completed: systemTransactions.filter(tx => tx.status === 'completed').length,
    pending: systemTransactions.filter(tx => tx.status === 'pending').length,
    failed: systemTransactions.filter(tx => tx.status === 'failed').length,
    today: systemTransactions.filter(tx => tx.timestamp.startsWith(today)).length,
    totalAmount: systemTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
    todayAmount: systemTransactions
      .filter(tx => tx.timestamp.startsWith(today))
      .reduce((sum, tx) => sum + (tx.amount || 0), 0),
    byType: systemTransactions.reduce((acc, tx) => {
      acc[tx.type] = (acc[tx.type] || 0) + 1;
      return acc;
    }, {})
  };
}

// ==================== GETTERS/SETTERS (Keep original) ====================
function getUsers() { return users; }
function setUsers(newUsers) { users = newUsers; }

function getTransactions() { return transactions; }
function setTransactions(newTransactions) { transactions = newTransactions; }

function getVirtualAccounts() { return virtualAccountsData; }
function setVirtualAccounts(newVA) { virtualAccountsData = newVA; }

function getSessions() { return sessions; }
function setSessions(newSessions) { sessions = newSessions; }

function getSystemTransactions() { return systemTransactions; }
function setSystemTransactions(newST) { systemTransactions = newST; }

function getAnalytics() { return analytics; }
function setAnalytics(newAnalytics) { analytics = newAnalytics; }

function getApiResponses() { return apiResponses; }
function setApiResponses(newAR) { apiResponses = newAR; }

// ==================== EXPORT ====================
module.exports = {
  // Paths
  dataDir, reportsDir, exportsDir,
  usersFile, transactionsFile, virtualAccountsFile,
  sessionsFile, systemTransactionsFile, analyticsFile, apiResponsesFile,
  
  // Data stores (use with caution - prefer getters)
  users, transactions, virtualAccountsData, sessions,
  systemTransactions, analytics, apiResponses,
  
  // Getters/Setters
  getUsers, setUsers,
  getTransactions, setTransactions,
  getVirtualAccounts, setVirtualAccounts,
  getSessions, setSessions,
  getSystemTransactions, setSystemTransactions,
  getAnalytics, setAnalytics,
  getApiResponses, setApiResponses,
  
  // NEW: Enhanced transaction functions
  recordTransaction,
  recordTransactions,
  syncTransactionsToSystem,
  getUserTransactions,
  getFilteredSystemTransactions,
  getTransactionStats,
  
  // Operations
  initStorage,
  loadData,
  saveAllData,
  setupAutoSave,
  ensureFile
};