// app/core/transactionMethods.js
module.exports = {
  initialize: (usersData, transactionsData, saveDataFunc, systemTransactionManager) => {
    // Store references for use in methods
    module.exports._users = usersData;
    module.exports._transactions = transactionsData;
    module.exports._saveData = saveDataFunc;
    module.exports._systemTransactionManager = systemTransactionManager;
  },
  
  create: async (txData) => {
    const userId = txData.user_id || txData.telegramId;
    
    if (!module.exports._transactions[userId]) {
      module.exports._transactions[userId] = [];
    }
    
    const transaction = {
      ...txData,
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString()
    };
    
    module.exports._transactions[userId].push(transaction);
    
    if (module.exports._saveData) {
      await module.exports._saveData('transactions.json', module.exports._transactions);
    }
    
    return transaction;
  },

  findByReference: async (reference) => {
    for (const userId in module.exports._transactions) {
      const userTransactions = module.exports._transactions[userId];
      const found = userTransactions.find(tx => tx.reference === reference);
      if (found) return found;
    }
    return null;
  }
};