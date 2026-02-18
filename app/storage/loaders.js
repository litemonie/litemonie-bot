// app/storage/loaders.js
const fs = require('fs').promises;
const path = require('path');
const { 
  usersFile, 
  transactionsFile, 
  virtualAccountsFile, 
  sessionsFile, 
  systemTransactionsFile, 
  analyticsFile, 
  apiResponsesFile 
} = require('./init');

async function loadData(filePath, defaultData = {}) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error loading ${path.basename(filePath)}:`, error.message);
    return defaultData;
  }
}

async function saveData(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`❌ Error saving ${path.basename(filePath)}:`, error.message);
  }
}

async function loadAllData() {
  try {
    const users = await loadData(usersFile, {});
    const transactions = await loadData(transactionsFile, {});
    const virtualAccountsData = await loadData(virtualAccountsFile, {});
    const sessions = await loadData(sessionsFile, {});
    const systemTransactions = await loadData(systemTransactionsFile, []);
    const analytics = await loadData(analyticsFile, {
      daily: {},
      weekly: {},
      monthly: {},
      userStats: {},
      categoryStats: {}
    });
    const apiResponses = await loadData(apiResponsesFile, {});
    
    console.log('✅ All data loaded successfully');
    
    return {
      users,
      transactions,
      virtualAccountsData,
      sessions,
      systemTransactions,
      analytics,
      apiResponses
    };
    
  } catch (error) {
    console.error('❌ Error loading all data:', error);
    return {
      users: {},
      transactions: {},
      virtualAccountsData: {},
      sessions: {},
      systemTransactions: [],
      analytics: {
        daily: {},
        weekly: {},
        monthly: {},
        userStats: {},
        categoryStats: {}
      },
      apiResponses: {}
    };
  }
}

module.exports = {
  loadData,
  saveData,
  loadAllData,
  usersFile,
  transactionsFile,
  virtualAccountsFile,
  sessionsFile,
  systemTransactionsFile,
  analyticsFile,
  apiResponsesFile
};