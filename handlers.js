// ==================== HANDLERS.JS ====================
// ALL Menu Handlers, Commands, Text Handlers, Callbacks
// =====================================================

const { Markup } = require('telegraf');
const { CONFIG, NETWORK_CODES } = require('./config');
const { 
  getUsers, setUsers, getTransactions, setTransactions, getSessions, setSessions, 
  getSystemTransactions, saveAllData 
} = require('./database');
const { 
  escapeMarkdownV2, formatCurrency, isAdmin, initUser, 
  checkKYCAndPIN, isValidEmail 
} = require('./utils');
const { 
  systemTransactionManager, exportManager, analyticsManager 
} = require('./transaction-system');
const { getDeviceHandler, getDeviceLockApp } = require('./device-system');

// Import feature modules - USE SIMPLIFIED VERSIONS
const buyAirtime = require('./app/buyAirtime');
const buyData = require('./app/buyData');
const depositFunds = require('./app/depositFunds');
const transactionHistory = require('./app/transactionHistory');
const sendMoney = require('./app/sendmoney');
const buyTVSubscription = require('./app/Bill/tv');
const buyElectricity = require('./app/Bill/light');
const buyExamPins = require('./app/Bill/exam');
// IMPORT THE NEW SIMPLIFIED VERSION - NO TRANSACTION MANAGERS
const buyCardPins = require('./app/Card pins/buyCardPins-NEW'); // YOU NEED TO RENAME YOUR FILE

// ========== USER & TRANSACTION METHODS ==========
const userMethods = {
  creditWallet: async (telegramId, amount) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    const oldBalance = user.wallet || 0;
    user.wallet = (user.wallet || 0) + parseFloat(amount);
    setUsers(users);
    await saveAllData();
    await systemTransactionManager.recordAnyTransaction(telegramId, {
      type: 'wallet_credit', amount, status: 'completed',
      description: `Wallet credited with ₦${amount}`,
      metadata: { oldBalance, newBalance: user.wallet, action: 'manual_credit' }
    });
    return user.wallet;
  },
  
  debitWallet: async (telegramId, amount, description = 'Wallet debit') => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    if (user.wallet < amount) throw new Error('Insufficient balance');
    const oldBalance = user.wallet || 0;
    user.wallet = (user.wallet || 0) - parseFloat(amount);
    setUsers(users);
    await saveAllData();
    await systemTransactionManager.recordAnyTransaction(telegramId, {
      type: 'wallet_debit', amount, status: 'completed', description,
      metadata: { oldBalance, newBalance: user.wallet, action: 'manual_debit' }
    });
    return user.wallet;
  },
  
  findById: async (telegramId) => getUsers()[telegramId] || null,
  
  update: async (telegramId, updateData) => {
    const users = getUsers();
    let user = users[telegramId];
    if (!user) await initUser(telegramId);
    Object.assign(users[telegramId], updateData);
    setUsers(users);
    await saveAllData();
    return users[telegramId];
  },
  
  getKycStatus: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) { await initUser(telegramId); return 'pending'; }
    return user.kycStatus || 'pending';
  },
  
  checkKyc: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) { await initUser(telegramId); return false; }
    return (user.kycStatus || 'pending') === 'approved';
  },
  
  approveKyc: async (telegramId, adminId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    user.kycStatus = 'approved';
    user.kycApprovedDate = new Date().toISOString();
    setUsers(users);
    await saveAllData();
    await systemTransactionManager.recordTransaction({
      type: 'kyc_approval', userId: telegramId, telegramId, amount: 0, status: 'completed',
      description: `KYC approved for user ${telegramId}`, adminId,
      user: { telegramId, firstName: user.firstName, lastName: user.lastName, username: user.username }
    });
    return user;
  },
  
  rejectKyc: async (telegramId, reason) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    user.kycStatus = 'rejected';
    user.kycRejectedDate = new Date().toISOString();
    user.kycRejectionReason = reason;
    setUsers(users);
    await saveAllData();
    await systemTransactionManager.recordTransaction({
      type: 'kyc_rejection', userId: telegramId, telegramId, amount: 0, status: 'completed',
      description: `KYC rejected for user ${telegramId}: ${reason}`,
      user: { telegramId, firstName: user.firstName, lastName: user.lastName, username: user.username }
    });
    return user;
  },
  
  submitKyc: async (telegramId, kycData) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    user.kycStatus = 'submitted';
    user.kycSubmitted = true;
    user.kycSubmittedDate = new Date().toISOString();
    user.kycDocument = kycData.document;
    user.kycDocumentType = kycData.documentType;
    user.kycDocumentNumber = kycData.documentNumber;
    if (kycData.firstName) user.firstName = kycData.firstName;
    if (kycData.lastName) user.lastName = kycData.lastName;
    if (kycData.email) user.email = kycData.email;
    if (kycData.phone) user.phone = kycData.phone;
    setUsers(users);
    await saveAllData();
    await systemTransactionManager.recordTransaction({
      type: 'kyc_submission', userId: telegramId, telegramId, amount: 0, status: 'pending',
      description: `KYC submitted by user ${telegramId}`,
      user: { telegramId, firstName: user.firstName, lastName: user.lastName, username: user.username }
    });
    return user;
  },
  
  getUserWithTransactions: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) return null;
    const userTransactions = systemTransactionManager.searchTransactions({ userId: telegramId });
    return { ...user, transactions: userTransactions, transactionCount: userTransactions.length, totalSpent: userTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0) };
  }
};

const transactionMethods = {
  create: async (txData) => {
    const userId = txData.user_id || txData.telegramId;
    const users = getUsers();
    if (!users[userId]) await initUser(userId);
    const transactions = getTransactions();
    if (!transactions[userId]) transactions[userId] = [];
    const transaction = { ...txData, id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, created_at: new Date().toISOString() };
    transactions[userId].push(transaction);
    setTransactions(transactions);
    await saveAllData();
    await systemTransactionManager.recordAnyTransaction(userId, { ...transaction, source: 'transaction_methods_create' });
    return transaction;
  },
  
  findByReference: async (reference) => {
    const transactions = getTransactions();
    for (const userId in transactions) {
      const found = transactions[userId].find(tx => tx.reference === reference);
      if (found) return found;
    }
    return null;
  },
  
  getTransactionWithSync: async (userId, transactionId) => {
    const transactions = getTransactions();
    if (transactions[userId]) {
      const userTx = transactions[userId].find(tx => tx.id === transactionId);
      if (userTx) return userTx;
    }
    return systemTransactionManager.getTransactionWithDetails(transactionId);
  },
  
  updateTransactionWithSync: async (userId, transactionId, updates) => {
    const transactions = getTransactions();
    if (transactions[userId]) {
      const index = transactions[userId].findIndex(tx => tx.id === transactionId);
      if (index !== -1) {
        Object.assign(transactions[userId][index], updates);
        setTransactions(transactions);
      }
    }
    const systemTransactions = getSystemTransactions();
    const systemTx = systemTransactions.find(tx => tx.id === transactionId);
    if (systemTx) {
      Object.assign(systemTx, updates);
      systemTx.updatedAt = new Date().toISOString();
      require('./database').setSystemTransactions(systemTransactions);
    }
    await saveAllData();
    return true;
  }
};

const virtualAccounts = {
  findByUserId: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (user?.virtualAccount) {
      return { user_id: telegramId, ...user.virtualAccount };
    }
    return null;
  },
  
  create: async (accountData) => {
    const userId = accountData.user_id;
    const users = getUsers();
    if (!users[userId]) await initUser(userId);
    users[userId].virtualAccount = {
      bank_name: accountData.bank_name, account_number: accountData.account_number,
      account_name: accountData.account_name, reference: accountData.reference,
      provider: accountData.provider || 'billstack', created_at: accountData.created_at || new Date(),
      is_active: accountData.is_active !== undefined ? accountData.is_active : true
    };
    users[userId].virtualAccountNumber = accountData.account_number;
    users[userId].virtualAccountBank = accountData.bank_name;
    const virtualAccountsData = require('./database').getVirtualAccounts();
    virtualAccountsData[userId] = users[userId].virtualAccount;
    require('./database').setVirtualAccounts(virtualAccountsData);
    setUsers(users);
    await saveAllData();
    await systemTransactionManager.recordTransaction({
      type: 'virtual_account_creation', userId, telegramId: userId, amount: 0, status: 'completed',
      description: `Virtual account created for user ${userId}`,
      accountNumber: accountData.account_number, bankName: accountData.bank_name,
      user: { telegramId: userId, firstName: users[userId].firstName, lastName: users[userId].lastName, username: users[userId].username }
    });
    return users[userId].virtualAccount;
  },
  
  findByAccountNumber: async (accountNumber) => {
    const virtualAccountsData = require('./database').getVirtualAccounts();
    for (const userId in virtualAccountsData) {
      if (virtualAccountsData[userId].account_number === accountNumber) {
        return { user_id: userId, ...virtualAccountsData[userId] };
      }
    }
    return null;
  }
};

const sessionManager = {
  getSession: (userId) => getSessions()[userId] || null,
  setSession: async (userId, sessionData) => {
    const sessions = getSessions();
    sessions[userId] = sessionData;
    setSessions(sessions);
    await saveAllData();
  },
  clearSession: async (userId) => {
    const sessions = getSessions();
    delete sessions[userId];
    setSessions(sessions);
    await saveAllData();
  },
  updateSession: async (userId, updates) => {
    const sessions = getSessions();
    if (sessions[userId]) {
      Object.assign(sessions[userId], updates);
      setSessions(sessions);
      await saveAllData();
    }
  }
};

// ========== ADMIN TRANSACTION HANDLERS ==========
async function handleAdminTransactionTracking(ctx) {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
  
  const stats = systemTransactionManager.getTransactionStats();
  await ctx.reply(
    '📊 \\*ADVANCED TRANSACTION TRACKING WITH API RESPONSES\\*\n\n' +
    `📊 \\*Total Transactions\\:\\* ${stats.total}\n✅ \\*Completed\\:\\* ${stats.completed}\n` +
    `⏳ \\*Pending\\:\\* ${stats.pending}\n❌ \\*Failed\\:\\* ${stats.failed}\n` +
    `📅 \\*Today\\:\\* ${stats.today}\n💰 \\*Total Amount\\:\\* ${formatCurrency(stats.totalAmount)}\n` +
    `💵 \\*Today\\'s Amount\\:\\* ${formatCurrency(stats.todayAmount)}\n` +
    `📡 \\*Transactions with API Responses\\:\\* ${stats.withApiResponses}\n\n` +
    '👇 \\*Select an option\\:\\*',
    { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Search Transaction by ID', 'admin_search_tx_id')],
      [Markup.button.callback('🔍 Advanced Search', 'admin_advanced_search')],
      [Markup.button.callback('📁 Quick Export', 'admin_quick_export')],
      [Markup.button.callback('📈 Analytics Dashboard', 'admin_analytics_dashboard')],
      [Markup.button.callback('📋 View All Transactions', 'admin_view_all_transactions')],
      [Markup.button.callback('❌ Failed Transactions', 'admin_view_failed_transactions')],
      [Markup.button.callback('⏳ Pending Transactions', 'admin_view_pending_transactions')],
      [Markup.button.callback('📡 Transactions with API Data', 'admin_view_api_transactions')],
      [Markup.button.callback('🏠 Back to Admin', 'admin_panel')]
    ]) }
  );
}

async function handleSearchTransactionById(ctx) {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin access only');
  
  await ctx.reply('🔍 \\*SEARCH TRANSACTION BY ID\\*\n\nEnter the Transaction ID to search\\:\n\\(Example\\: TX123456789\\)', { parse_mode: 'MarkdownV2' });
  const sessions = getSessions();
  sessions[userId] = { action: 'admin_search_tx_id', step: 'enter_tx_id' };
  setSessions(sessions);
  await saveAllData();
  await ctx.answerCbQuery();
}

async function handleViewApiTransactions(ctx, page = 0) {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin access only');
  
  const apiTransactions = systemTransactionManager.searchTransactions({ hasApiResponse: true });
  const pageSize = 10;
  const totalPages = Math.ceil(apiTransactions.length / pageSize);
  const pageTransactions = apiTransactions.slice(page * pageSize, (page + 1) * pageSize);
  
  let message = `📡 \\*TRANSACTIONS WITH API RESPONSES\\*\n\n`;
  message += `📊 \\*Total\\:\\* ${apiTransactions.length} transactions\n`;
  message += `💰 \\*Total Amount\\:\\* ${formatCurrency(apiTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
  message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
  
  if (pageTransactions.length === 0) message += 'No transactions found\\.';
  else pageTransactions.forEach(tx => {
    message += `${tx.status === 'completed' ? '✅' : tx.status === 'failed' ? '❌' : '⏳'} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
    message += `💰 \\*Amount\\:\\* ${formatCurrency(tx.amount || 0)}\n`;
    message += `📱 \\*Phone\\:\\* ${escapeMarkdownV2(tx.phone || 'N/A')}\n`;
    message += `📶 \\*Network\\:\\* ${escapeMarkdownV2(tx.network || 'N/A')}\n`;
    message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(new Date(tx.timestamp).toLocaleDateString())}\n`;
    message += `📡 \\*API Calls\\:\\* ${tx.apiResponses?.length || 0}\n`;
    message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
  });
  
  const keyboard = [];
  if (page > 0) keyboard.push(Markup.button.callback('⬅️ Previous', `admin_api_page_${page - 1}`));
  if (page < totalPages - 1 && pageTransactions.length === pageSize) keyboard.push(Markup.button.callback('Next ➡️', `admin_api_page_${page + 1}`));
  keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
  
  await ctx.reply(message, { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(keyboard) });
}

async function handleViewAllTransactions(ctx, page = 0) {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
  
  const allTransactions = systemTransactionManager.searchTransactions({});
  const pageSize = 10;
  const totalPages = Math.ceil(allTransactions.length / pageSize);
  const pageTransactions = allTransactions.slice(page * pageSize, (page + 1) * pageSize);
  
  let message = `📋 \\*ALL SYSTEM TRANSACTIONS\\*\n\n`;
  message += `📊 \\*Total\\:\\* ${allTransactions.length} transactions\n`;
  message += `💰 \\*Total Amount\\:\\* ${formatCurrency(allTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
  message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
  
  if (pageTransactions.length === 0) message += 'No transactions found\\.';
  else pageTransactions.forEach(tx => {
    const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
    message += `${tx.status === 'completed' ? '✅' : tx.status === 'failed' ? '❌' : '⏳'} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
    message += `💰 \\*Amount\\:\\* ${formatCurrency(tx.amount || 0)}\n`;
    message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
    message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(new Date(tx.timestamp).toLocaleDateString())}\n`;
    message += `📡 \\*API Calls\\:\\* ${tx.apiResponses?.length || 0}\n`;
    message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
  });
  
  const keyboard = [];
  if (page > 0) keyboard.push(Markup.button.callback('⬅️ Previous', `admin_transactions_page_${page - 1}`));
  if (page < totalPages - 1 && pageTransactions.length === pageSize) keyboard.push(Markup.button.callback('Next ➡️', `admin_transactions_page_${page + 1}`));
  keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
  
  await ctx.reply(message, { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(keyboard) });
}

async function handleViewFailedTransactions(ctx, page = 0) {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
  
  const failedTransactions = systemTransactionManager.searchTransactions({ status: 'failed' });
  const pageSize = 10;
  const totalPages = Math.ceil(failedTransactions.length / pageSize);
  const pageTransactions = failedTransactions.slice(page * pageSize, (page + 1) * pageSize);
  
  let message = `❌ \\*FAILED TRANSACTIONS\\*\n\n`;
  message += `📊 \\*Total Failed\\:\\* ${failedTransactions.length} transactions\n`;
  message += `💸 \\*Total Amount\\:\\* ${formatCurrency(failedTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
  message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
  
  if (pageTransactions.length === 0) message += 'No failed transactions found\\.';
  else pageTransactions.forEach(tx => {
    const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
    message += `❌ \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
    message += `💰 \\*Amount\\:\\* ${formatCurrency(tx.amount || 0)}\n`;
    message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
    message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(new Date(tx.timestamp).toLocaleString())}\n`;
    message += `📡 \\*API Calls\\:\\* ${tx.apiResponses?.length || 0}\n`;
    if (tx.error) message += `🚨 \\*Error\\:\\* ${escapeMarkdownV2(tx.error.substring(0, 50))}${tx.error.length > 50 ? '\\.\\.\\.' : ''}\n`;
    message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
  });
  
  const keyboard = [];
  if (page > 0) keyboard.push(Markup.button.callback('⬅️ Previous', `admin_failed_page_${page - 1}`));
  if (page < totalPages - 1 && pageTransactions.length === pageSize) keyboard.push(Markup.button.callback('Next ➡️', `admin_failed_page_${page + 1}`));
  keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
  
  await ctx.reply(message, { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(keyboard) });
}

async function handleAdvancedSearch(ctx) {
  const userId = ctx.from.id.toString();
  if (!isAdmin(userId)) return ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
  
  await ctx.reply(
    '🔍 \\*ADVANCED TRANSACTION SEARCH\\*\n\nEnter search criteria:\n\n' +
    '`search\\: [term]`\n`type\\: [airtime|data|deposit|etc]`\n`category\\: [category]`\n' +
    '`status\\: [completed|failed|pending]`\n`user\\: [user_id]`\n`phone\\: [phone_number]`\n' +
    '`network\\: [network]`\n`date_from\\: YYYY-MM-DD`\n`date_to\\: YYYY-MM-DD`\n' +
    '`amount_min\\: [amount]`\n`amount_max\\: [amount]`\n`has_api\\: [true|false]`\n' +
    '`api_name\\: [api_name]`\n`sort_by\\: [amount|timestamp]`\n`sort_order\\: [asc|desc]`\n' +
    '`page\\: [number]`\n`page_size\\: [number]`\n\nEnter your search criteria\\:',
    { parse_mode: 'MarkdownV2' }
  );
  
  const sessions = getSessions();
  sessions[userId] = { action: 'admin_advanced_search', step: 'enter_criteria' };
  setSessions(sessions);
  await saveAllData();
}

async function handleAdvancedSearchText(ctx, text) {
  const userId = ctx.from.id.toString();
  const sessions = getSessions();
  const userSession = sessions[userId];
  if (!userSession || userSession.action !== 'admin_advanced_search') return false;
  
  const filters = {};
  text.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      const value = valueParts.join(':').trim();
      const cleanKey = key.trim().toLowerCase().replace(/[^a-z]/g, '');
      const map = {
        'search': 'searchTerm', 'type': 'type', 'category': 'category', 'status': 'status',
        'user': 'userId', 'phone': 'phone', 'network': 'network', 'datefrom': 'startDate',
        'dateto': 'endDate', 'amountmin': 'minAmount', 'amountmax': 'maxAmount',
        'hasapi': 'hasApiResponse', 'apiname': 'apiName', 'sortby': 'sortBy',
        'sortorder': 'sortOrder', 'page': 'page', 'pagesize': 'pageSize'
      };
      if (map[cleanKey]) {
        if (['minAmount', 'maxAmount', 'page', 'pageSize'].includes(map[cleanKey])) filters[map[cleanKey]] = parseFloat(value);
        else if (map[cleanKey] === 'hasApiResponse') filters[map[cleanKey]] = value.toLowerCase() === 'true';
        else filters[map[cleanKey]] = value;
      }
    }
  });
  
  const results = systemTransactionManager.searchTransactions(filters);
  const totalResults = systemTransactionManager.searchTransactions({ ...filters, page: null, pageSize: null }).length;
  
  let message = `🔍 \\*SEARCH RESULTS\\*\n\n📊 Found\\: ${totalResults} transactions\n`;
  if (Object.keys(filters).length) {
    message += `🔎 Filters applied\\:\n`;
    Object.entries(filters).forEach(([k, v]) => { if (!['page','pageSize','sortBy','sortOrder'].includes(k)) message += `• ${k}\\: ${v}\n`; });
  }
  message += `\n📄 Showing ${results.length} transactions\n\n`;
  
  if (results.length === 0) message += 'No transactions found\\.';
  else {
    results.slice(0, 5).forEach(tx => {
      const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
      message += `${tx.status === 'completed' ? '✅' : tx.status === 'failed' ? '❌' : '⏳'} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
      message += `💰 Amount\\: ${formatCurrency(tx.amount || 0)}\n`;
      message += `👤 User\\: ${escapeMarkdownV2(userInfo)}\n`;
      message += `📅 Date\\: ${escapeMarkdownV2(new Date(tx.timestamp).toLocaleString())}\n`;
      message += `📡 API Calls\\: ${tx.apiResponses?.length || 0}\n`;
      message += `🔗 ID\\: \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
    });
    if (results.length > 5) message += `\\.\\.\\. and ${results.length - 5} more results\\.`;
  }
  
  sessions[userId] = { ...sessions[userId], lastSearch: filters, searchResults: results };
  setSessions(sessions);
  await saveAllData();
  
  await ctx.reply(message, {
    parse_mode: 'MarkdownV2',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📁 Export Results', 'admin_export_search')],
      [Markup.button.callback('🔍 New Search', 'admin_advanced_search')],
      [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
    ])
  });
  return true;
}

async function handleSearchTransactionIdText(ctx, text) {
  const userId = ctx.from.id.toString();
  const sessions = getSessions();
  const userSession = sessions[userId];
  if (!userSession || userSession.action !== 'admin_search_tx_id') return false;
  
  const transactionId = text.trim();
  const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
  
  if (!transactionDetails) {
    await ctx.reply(`❌ \\*Transaction Not Found\\*\n\nTransaction ID\\: \`${escapeMarkdownV2(transactionId)}\`\nNo transaction found with this ID\\.`, { parse_mode: 'MarkdownV2' });
    sessions[userId].action = null;
    setSessions(sessions);
    await saveAllData();
    return true;
  }
  
  await systemTransactionManager.viewTransactionDetails(ctx, transactionId);
  sessions[userId].action = null;
  setSessions(sessions);
  await saveAllData();
  return true;
}

async function handleTextMessage(ctx, text) {
  const userId = ctx.from.id.toString();
  await initUser(userId);
  if (text.startsWith('/')) return true;
  
  const sessions = getSessions();
  const userSession = sessions[userId];
  
  if (userSession?.action === 'admin_search_tx_id') return handleSearchTransactionIdText(ctx, text);
  if (userSession?.action === 'admin_advanced_search') return handleAdvancedSearchText(ctx, text);
  
  // FIXED: Handle send money with proper error catching
  const sendMoneySession = sendMoney.sessionManager?.getSession?.(userId);
  if (sendMoneySession?.action === 'send_money') {
    try {
      const result = await sendMoney.handleText(ctx, text, { ...getUsers(), ...userMethods }, transactionMethods);
      if (result) return true;
    } catch (error) {
      console.error('❌ Send money error in handlers:', error);
      // Don't throw - let other handlers try
    }
  }
  
  const depositHandled = await depositFunds.handleDepositText(ctx, text, { ...getUsers(), ...userMethods }, virtualAccounts);
  if (depositHandled) return true;
  
  const deviceHandler = getDeviceHandler();
  if (deviceHandler) {
    deviceHandler.users = getUsers();
    if (await deviceHandler.handleTextMessage(ctx, text, userSession)) return true;
  }
  
  const deviceLockApp = getDeviceLockApp();
  if (deviceLockApp && userSession?.action === 'mini_app' && typeof deviceLockApp.handleText === 'function') {
    if (await deviceLockApp.handleText(ctx, text, userSession)) return true;
  }
  
  if (userSession?.action === 'airtime') {
    const result = await buyAirtime.handleText(ctx, text, getUsers(), getTransactions(), sessions, NETWORK_CODES, CONFIG);
    if (result !== false) return true;
  }
  
  if (userSession?.action === 'data') {
    const result = await buyData.handleText?.(ctx, text, userSession, getUsers()[userId], getUsers(), getTransactions(), sessionManager, NETWORK_CODES, CONFIG);
    if (result) return true;
  }
  
  if (userSession?.action === 'tv_subscription') {
    const result = await buyTVSubscription.handleText?.(ctx, text, userSession, getUsers()[userId], getUsers(), getTransactions(), sessionManager, CONFIG);
    if (result) return true;
  }
  
  if (userSession?.action === 'electricity') {
    const result = await buyElectricity.handleText?.(ctx, text, userSession, getUsers()[userId], getUsers(), getTransactions(), sessionManager, CONFIG);
    if (result) return true;
  }
  
  if (userSession?.action === 'exam_pins') {
    const result = await buyExamPins.handleText?.(ctx, text, userSession, getUsers()[userId], getUsers(), getTransactions(), sessionManager, CONFIG);
    if (result) return true;
  }
  
  // ===== IMPORTANT: USE THE SIMPLIFIED VERSION =====
  if (userSession?.action === 'card_pins') {
    const result = await buyCardPins.handleText?.(ctx, text, userSession, getUsers()[userId], getUsers(), getTransactions(), sessionManager, CONFIG);
    if (result) return true;
  }
  
  if (!userSession) {
    if (/^\d+$/.test(text) && parseInt(text) > 0 && parseInt(text) <= 50000) {
      await ctx.reply(`💰 \\*Amount Detected\\:\\* ${formatCurrency(parseInt(text))}\n\nPlease select a service first\\:`, { parse_mode: 'MarkdownV2' });
      return true;
    }
    if (/^0[7-9][0-1]\d{8}$/.test(text)) {
      await ctx.reply(`📱 \\*Phone Number Detected\\:\\* ${escapeMarkdownV2(text)}\n\nPlease select a service first\\.`, { parse_mode: 'MarkdownV2' });
      return true;
    }
    await ctx.reply('🤔 \\*I didn\'t understand that\\*\n\nPlease select an option from the menu or use /help for commands\\.', { parse_mode: 'MarkdownV2' });
    return true;
  }
  
  return false;
}

// Export all handlers and methods
module.exports = {
  userMethods,
  transactionMethods,
  virtualAccounts,
  sessionManager,
  handleAdminTransactionTracking,
  handleSearchTransactionById,
  handleViewApiTransactions,
  handleViewAllTransactions,
  handleViewFailedTransactions,
  handleAdvancedSearch,
  handleAdvancedSearchText,
  handleSearchTransactionIdText,
  handleTextMessage
};