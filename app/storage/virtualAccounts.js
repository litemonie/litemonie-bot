// app/storage/virtualAccounts.js
module.exports = {
  // Find virtual account by user ID
  findByUserId: async (telegramId, users) => {
    const user = users[telegramId];
    if (user && user.virtualAccount) {
      return {
        user_id: telegramId,
        bank_name: user.virtualAccount.bank_name,
        account_number: user.virtualAccount.account_number,
        account_name: user.virtualAccount.account_name,
        reference: user.virtualAccount.reference,
        provider: user.virtualAccount.provider || 'billstack',
        created_at: user.virtualAccount.created_at || new Date(),
        is_active: user.virtualAccount.is_active !== undefined ? user.virtualAccount.is_active : true
      };
    }
    return null;
  },

  // Create virtual account
  create: async (accountData, users, saveDataFunc) => {
    const userId = accountData.user_id;
    
    if (!users[userId]) {
      throw new Error('User not found');
    }
    
    users[userId].virtualAccount = {
      bank_name: accountData.bank_name,
      account_number: accountData.account_number,
      account_name: accountData.account_name,
      reference: accountData.reference,
      provider: accountData.provider || 'billstack',
      created_at: accountData.created_at || new Date().toISOString(),
      is_active: accountData.is_active !== undefined ? accountData.is_active : true
    };
    
    users[userId].virtualAccountNumber = accountData.account_number;
    users[userId].virtualAccountBank = accountData.bank_name;
    
    // Save data
    await saveDataFunc(users);
    
    return users[userId].virtualAccount;
  },

  // Find by account number
  findByAccountNumber: async (accountNumber, users) => {
    for (const userId in users) {
      const account = users[userId]?.virtualAccount;
      if (account && account.account_number === accountNumber) {
        return {
          user_id: userId,
          ...account
        };
      }
    }
    return null;
  }
};