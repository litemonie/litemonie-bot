// app/core/userMethods.js
module.exports = {
  initialize: (usersData, saveDataFunc, systemTransactionManager) => {
    // Store references for use in methods
    module.exports._users = usersData;
    module.exports._saveData = saveDataFunc;
    module.exports._systemTransactionManager = systemTransactionManager;
  },
  
  creditWallet: async (telegramId, amount) => {
    const user = module.exports._users[telegramId];
    if (!user) throw new Error('User not found');
    
    const oldBalance = user.wallet || 0;
    user.wallet = (user.wallet || 0) + parseFloat(amount);
    
    if (module.exports._saveData) {
      await module.exports._saveData('users.json', module.exports._users);
    }
    
    return user.wallet;
  },

  debitWallet: async (telegramId, amount, description = 'Wallet debit') => {
    const user = module.exports._users[telegramId];
    if (!user) throw new Error('User not found');
    
    if (user.wallet < amount) {
      throw new Error('Insufficient balance');
    }
    
    const oldBalance = user.wallet || 0;
    user.wallet = (user.wallet || 0) - parseFloat(amount);
    
    if (module.exports._saveData) {
      await module.exports._saveData('users.json', module.exports._users);
    }
    
    return user.wallet;
  },

  findById: async (telegramId) => {
    return module.exports._users[telegramId] || null;
  },

  update: async (telegramId, updateData) => {
    const user = module.exports._users[telegramId];
    if (!user) throw new Error('User not found');
    
    Object.assign(user, updateData);
    
    if (module.exports._saveData) {
      await module.exports._saveData('users.json', module.exports._users);
    }
    
    return user;
  }
};