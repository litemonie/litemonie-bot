// app/admin.js - FIXED VERSION WITH WORKING VTU BALANCE CHECK
const { Markup } = require('telegraf');
const axios = require('axios');

module.exports = {
  handleAdminPanel: async (ctx, users, transactions, CONFIG) => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
        return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
      }
      
      const totalUsers = Object.keys(users).length;
      let totalBalance = 0;
      let pendingKyc = 0;
      let approvedKyc = 0;
      let usersWithVirtualAccounts = 0;
      let usersWithBVN = 0;
      let usersWithVerifiedBVN = 0;
      
      Object.values(users).forEach(user => {
        totalBalance += user.wallet || 0;
        const kycStatus = user.kycStatus || user.kyc || 'pending';
        
        if (kycStatus === 'pending') pendingKyc++;
        if (kycStatus === 'approved') approvedKyc++;
        if (user.virtualAccount) usersWithVirtualAccounts++;
        if (user.bvn) usersWithBVN++;
        if (user.bvnVerified) usersWithVerifiedBVN++;
      });
      
      let totalPlans = 0;
      const networks = getAvailableNetworks();
      
      networks.forEach(network => {
        const validities = getAvailableValidities(network);
        validities.forEach(validity => {
          const plans = getDataPlans(network, validity, CONFIG);
          totalPlans += plans.length;
        });
      });
      
      // Check VTU balance - FIXED VERSION
      const vtuBalance = await checkVTUBalanceFixed(CONFIG);
      
      let vtuBalanceText = '';
      if (vtuBalance.success) {
        vtuBalanceText = `💰 *VTU Balance:* ${vtuBalance.formattedBalance}\n`;
      } else {
        vtuBalanceText = `⚠️ *VTU Balance:* ${vtuBalance.error}\n`;
      }
      
      const message = `🛠️ *ADMIN CONTROL PANEL*\n\n` +
        `📊 *Statistics:*\n` +
        `👥 Total Users: ${totalUsers}\n` +
        `💰 User Balances: ${formatCurrency(totalBalance)}\n` +
        `✅ Approved KYC: ${approvedKyc}\n` +
        `⏳ Pending KYC: ${pendingKyc}\n` +
        `🏦 Virtual Accounts: ${usersWithVirtualAccounts}\n` +
        `🆔 BVN Submitted: ${usersWithBVN}\n` +
        `✅ BVN Verified: ${usersWithVerifiedBVN}\n` +
        `📈 Data Plans: ${totalPlans}\n` +
        `${vtuBalanceText}\n` +
        `⚡ *Quick Commands:*\n` +
        `• /users - List all users\n` +
        `• /stats - System statistics\n` +
        `• /deposit [id] [amount] - Deposit funds\n` +
        `• /credit [id] [amount] - Credit user\n` +
        `• /approve [id] - Approve KYC\n` +
        `• /vtu_balance - Check VTU balance\n` +
        `• /view_plans - View data plans\n` +
        `• /virtual_accounts - List virtual accounts\n` +
        `• /bvn_list - List BVN submissions\n` +
        `• /verify_bvn [id] - Verify user BVN\n\n` +
        `💡 *Admin Actions:*`;
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 List Users', 'admin_list_users')],
          [Markup.button.callback('💰 VTU Balance', 'admin_vtu_balance')],
          [Markup.button.callback('🏦 Virtual Accounts', 'admin_virtual_accounts')],
          [Markup.button.callback('📊 View Plans', 'admin_view_plans')],
          [Markup.button.callback('📈 System Stats', 'admin_stats')],
          [Markup.button.callback('🆔 BVN List', 'admin_bvn_list')],
          [Markup.button.callback('✅ Approve All KYC', 'admin_approve_all')]
        ])
      });
      
    } catch (error) {
      console.error('❌ Admin panel error:', error);
    }
  },

  getAdminCommands: (bot, users, transactions, CONFIG) => {
    return {
      users: async (ctx) => await handleUsersCommand(ctx, users, CONFIG),
      stats: async (ctx) => await handleStatsCommand(ctx, users, transactions, CONFIG),
      deposit: async (ctx) => await handleDepositCommand(ctx, users, transactions, CONFIG),
      credit: async (ctx) => await handleCreditCommand(ctx, users, transactions, CONFIG),
      approve: async (ctx) => await handleApproveCommand(ctx, users, CONFIG),
      approve_all: async (ctx) => await handleApproveAllCommand(ctx, users, CONFIG),
      virtual_accounts: async (ctx) => await handleVirtualAccountsCommand(ctx, users, CONFIG),
      view_plans: async (ctx) => await handleViewPlansCommand(ctx, CONFIG),
      vtu_balance: async (ctx) => await handleVTUBalanceCommand(ctx, CONFIG),
      verify_bvn: async (ctx) => await handleVerifyBVNCommand(ctx, users, bot, CONFIG),
      bvn_list: async (ctx) => await handleBVNListCommand(ctx, users, CONFIG)
    };
  },

  getCallbacks: (bot, users, transactions, CONFIG) => {
    return {
      'admin_list_users': async (ctx) => await handleAdminListUsers(ctx, users, CONFIG),
      'admin_virtual_accounts': async (ctx) => await handleAdminVirtualAccounts(ctx, users, CONFIG),
      'admin_vtu_balance': async (ctx) => await handleAdminVTUBalance(ctx, CONFIG),
      'admin_view_plans': async (ctx) => await handleAdminViewPlans(ctx, CONFIG),
      'admin_stats': async (ctx) => await handleAdminStats(ctx, users, transactions, CONFIG),
      'admin_bvn_list': async (ctx) => await handleAdminBVNList(ctx, users, CONFIG),
      'admin_approve_all': async (ctx) => await handleAdminApproveAll(ctx, users, CONFIG),
      'back_to_admin': async (ctx) => await handleBackToAdmin(ctx, users, transactions, CONFIG)
    };
  }
};

// ==================== FIXED VTU BALANCE CHECK ====================
async function checkVTUBalanceFixed(CONFIG) {
  try {
    console.log('🔍 Checking VTU balance (Fixed)...');
    
    if (!CONFIG.VTU_API_KEY || CONFIG.VTU_API_KEY === 'your_vtu_naija_api_key_here') {
      return {
        success: false,
        error: 'VTU API key not configured',
        balance: 0,
        formattedBalance: '₦0'
      };
    }

    const response = await axios.get(`${CONFIG.VTU_BASE_URL}/user/`, {
      headers: {
        'Authorization': `Token ${CONFIG.VTU_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ VTU API Response:', JSON.stringify(response.data, null, 2));

    const data = response.data;
    
    // Handle different API response formats
    if (data.Status === 'successful' || data.status === 'success' || data.Status === 'success') {
      let walletBalance = data.wallet_balance || data.balance || '₦0';
      let balanceValue = 0;
      
      if (typeof walletBalance === 'string') {
        // Remove currency symbol and commas
        const cleanBalance = walletBalance.replace(/[₦,]/g, '').trim();
        balanceValue = parseFloat(cleanBalance) || 0;
      } else if (typeof walletBalance === 'number') {
        balanceValue = walletBalance;
      }

      return {
        success: true,
        balance: balanceValue,
        formattedBalance: `₦${balanceValue.toLocaleString('en-NG')}`,
        username: data.username || data.name || 'N/A',
        status: data.Status || data.status || 'success',
        rawResponse: data
      };
    } else {
      // Even if status is fail, check if wallet_balance contains useful info
      const errorMsg = data.wallet_balance || data.message || 'API returned error status';
      return {
        success: false,
        error: errorMsg,
        balance: 0,
        formattedBalance: '₦0',
        rawResponse: data
      };
    }

  } catch (error) {
    console.error('❌ VTU Balance API Error:', error.message);
    
    let errorMessage = 'Unknown error';
    
    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.data) {
        const data = error.response.data;
        
        if (typeof data === 'string') {
          errorMessage = data.substring(0, 100);
        } else if (typeof data === 'object') {
          errorMessage = data.wallet_balance || data.message || data.error || `Server Error: ${error.response.status}`;
        } else {
          errorMessage = `Server Error: ${error.response.status}`;
        }
      } else {
        errorMessage = `Server Error: ${error.response.status}`;
      }
    } else if (error.request) {
      errorMessage = 'No response from VTU server (timeout)';
    } else {
      errorMessage = error.message;
    }
    
    // Clean error message for display
    const cleanError = errorMessage.replace(/[^\w\s.,!?\-]/g, ' ').trim();
    
    return {
      success: false,
      error: cleanError,
      balance: 0,
      formattedBalance: '₦0'
    };
  }
}

// ==================== HELPER FUNCTIONS ====================
function isAdmin(userId, adminId) {
  const ADMIN_IDS = ['1279640125', '8055762920', adminId].filter(Boolean);
  return ADMIN_IDS.includes(userId.toString());
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '₦0';
  return `₦${parseInt(amount).toLocaleString('en-NG')}`;
}

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escapedText = text;
  specialChars.forEach(char => {
    const regex = new RegExp(`\\${char}`, 'g');
    escapedText = escapedText.replace(regex, `\\${char}`);
  });
  return escapedText;
}

function maskBVN(bvn) {
  if (!bvn || bvn.length !== 11) return 'Invalid BVN';
  return `${bvn.substring(0, 3)}*****${bvn.substring(8)}`;
}

function getAvailableNetworks() {
  return ['MTN', 'GLO', 'AIRTEL', '9MOBILE'];
}

function getAvailableValidities(network) {
  // Simplified for demo
  return ['Daily', 'Weekly', 'Monthly'];
}

function getDataPlans(network, validityType = null, CONFIG) {
  // Return sample plans for demo
  return [
    {
      Network: network,
      Plan: `${network} 1GB ${validityType}`,
      Validity: validityType,
      Price: 500,
      PlanID: '1',
      DisplayPrice: 600
    }
  ];
}

// ==================== COMMAND HANDLERS ====================
async function handleUsersCommand(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const userList = Object.entries(users).slice(0, 20);
    
    if (userList.length === 0) {
      return await ctx.reply('📭 No users found.', { parse_mode: 'HTML' });
    }
    
    let message = `📋 <b>USER LIST (${userList.length} users):</b>\n\n`;
    
    userList.forEach(([id, user], index) => {
      const kycStatus = user.kycStatus || user.kyc || 'pending';
      const kycEmoji = kycStatus === 'approved' ? '✅' : '⏳';
      const pinEmoji = user.pin ? '🔐' : '❌';
      const virtualAccEmoji = user.virtualAccount ? '🏦' : '❌';
      const bvnEmoji = user.bvn ? (user.bvnVerified ? '✅' : '⏳') : '❌';
      message += `${index + 1}. <b>ID:</b> <code>${id}</code>\n`;
      message += `   💰 <b>Balance:</b> ${formatCurrency(user.wallet || 0)}\n`;
      message += `   🛂 <b>KYC:</b> ${kycEmoji} ${kycStatus}\n`;
      message += `   ${pinEmoji} <b>PIN:</b> ${user.pin ? 'Set' : 'Not Set'}\n`;
      message += `   ${bvnEmoji} <b>BVN:</b> ${user.bvn ? maskBVN(user.bvn) : 'Not Set'}\n`;
      message += `   ${virtualAccEmoji} <b>Virtual Account:</b> ${user.virtualAccount ? 'Yes' : 'No'}\n\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('❌ Users command error:', error);
    await ctx.reply('❌ Error fetching users.', { parse_mode: 'HTML' });
  }
}

async function handleStatsCommand(ctx, users, transactions, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const totalUsers = Object.keys(users).length;
    let totalBalance = 0;
    let pendingKyc = 0;
    let approvedKyc = 0;
    let usersWithPin = 0;
    let usersWithVirtualAccounts = 0;
    let usersWithBVN = 0;
    let usersWithVerifiedBVN = 0;
    let totalTransactions = 0;
    
    Object.values(users).forEach(user => {
      totalBalance += user.wallet || 0;
      const kycStatus = user.kycStatus || user.kyc || 'pending';
      
      if (kycStatus === 'pending') pendingKyc++;
      if (kycStatus === 'approved') approvedKyc++;
      if (user.pin) usersWithPin++;
      if (user.virtualAccount) usersWithVirtualAccounts++;
      if (user.bvn) usersWithBVN++;
      if (user.bvnVerified) usersWithVerifiedBVN++;
    });
    
    Object.values(transactions).forEach(userTx => {
      totalTransactions += userTx.length;
    });
    
    // Check VTU balance
    const vtuBalance = await checkVTUBalanceFixed(CONFIG);
    
    let vtuBalanceText = '';
    if (vtuBalance.success) {
      vtuBalanceText = `<b>VTU Balance:</b> ${vtuBalance.formattedBalance}\n`;
    } else {
      vtuBalanceText = `<b>VTU Balance:</b> ${vtuBalance.error}\n`;
    }
    
    const message = `📊 <b>SYSTEM STATISTICS</b>\n\n` +
      `👥 <b>Total Users:</b> ${totalUsers}\n` +
      `💰 <b>User Balances:</b> ${formatCurrency(totalBalance)}\n` +
      `✅ <b>Approved KYC:</b> ${approvedKyc}\n` +
      `⏳ <b>Pending KYC:</b> ${pendingKyc}\n` +
      `🔐 <b>Users with PIN:</b> ${usersWithPin}\n` +
      `🏦 <b>Virtual Accounts:</b> ${usersWithVirtualAccounts}\n` +
      `🆔 <b>BVN Submitted:</b> ${usersWithBVN}\n` +
      `✅ <b>BVN Verified:</b> ${usersWithVerifiedBVN}\n` +
      `📜 <b>Total Transactions:</b> ${totalTransactions}\n` +
      `${vtuBalanceText}\n` +
      `🔄 <b>Last Updated:</b> ${new Date().toLocaleString()}`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('❌ Stats command error:', error);
    await ctx.reply('❌ Error fetching statistics.', { parse_mode: 'HTML' });
  }
}

async function handleDepositCommand(ctx, users, transactions, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const args = ctx.message.text.split(' ');
    
    if (args.length !== 3) {
      return await ctx.reply(
        '❌ <b>Usage:</b> /deposit [user_id] [amount]\n' +
        '<b>Example:</b> /deposit 123456789 1000\n\n' +
        '<b>Note:</b> This credits user wallet directly!',
        { parse_mode: 'HTML' }
      );
    }
    
    const targetUserId = args[1];
    const amount = parseFloat(args[2]);
    
    if (isNaN(amount) || amount <= 0) {
      return await ctx.reply('❌ Invalid amount. Amount must be greater than 0.', { parse_mode: 'HTML' });
    }
    
    if (!users[targetUserId]) {
      return await ctx.reply(`❌ User not found. User ID ${targetUserId} not found.`, { parse_mode: 'HTML' });
    }
    
    users[targetUserId].wallet += amount;
    
    if (!transactions[targetUserId]) {
      transactions[targetUserId] = [];
    }
    
    transactions[targetUserId].push({
      type: 'deposit',
      amount: amount,
      date: new Date().toLocaleString(),
      status: 'success',
      source: 'admin_deposit',
      admin: userId
    });
    
    await ctx.reply(
      `✅ <b>DEPOSIT SUCCESSFUL</b>\n\n` +
      `<b>User:</b> ${targetUserId}\n` +
      `<b>Amount Deposited:</b> ${formatCurrency(amount)}\n` +
      `<b>New Balance:</b> ${formatCurrency(users[targetUserId].wallet)}\n\n` +
      `<b>Transaction ID:</b> DP${Date.now()}`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('❌ Deposit command error:', error);
    await ctx.reply('❌ Error processing deposit.', { parse_mode: 'HTML' });
  }
}

async function handleCreditCommand(ctx, users, transactions, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const args = ctx.message.text.split(' ');
    
    if (args.length !== 3) {
      return await ctx.reply(
        '❌ <b>Usage:</b> /credit [user_id] [amount]\n' +
        '<b>Example:</b> /credit 123456789 1000',
        { parse_mode: 'HTML' }
      );
    }
    
    const targetUserId = args[1];
    const amount = parseFloat(args[2]);
    
    if (isNaN(amount) || amount <= 0) {
      return await ctx.reply('❌ Invalid amount. Amount must be greater than 0.', { parse_mode: 'HTML' });
    }
    
    const user = users[targetUserId] || {
      wallet: 0,
      kycStatus: 'pending',
      pin: null
    };
    
    user.wallet += amount;
    users[targetUserId] = user;
    
    if (!transactions[targetUserId]) {
      transactions[targetUserId] = [];
    }
    
    transactions[targetUserId].push({
      type: 'credit',
      amount: amount,
      date: new Date().toLocaleString(),
      status: 'success',
      source: 'admin_credit',
      admin: userId
    });
    
    await ctx.reply(
      `✅ <b>CREDIT SUCCESSFUL</b>\n\n` +
      `<b>User:</b> ${targetUserId}\n` +
      `<b>Amount Credited:</b> ${formatCurrency(amount)}\n` +
      `<b>New Balance:</b> ${formatCurrency(user.wallet)}`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('❌ Credit command error:', error);
    await ctx.reply('❌ Error processing credit.', { parse_mode: 'HTML' });
  }
}

async function handleApproveCommand(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const args = ctx.message.text.split(' ');
    
    if (args.length !== 2) {
      return await ctx.reply('❌ Usage: /approve [user_id]\nExample: /approve 123456789', { parse_mode: 'HTML' });
    }
    
    const targetUserId = args[1];
    
    if (!users[targetUserId]) {
      return await ctx.reply(`❌ User ${targetUserId} not found.`, { parse_mode: 'HTML' });
    }
    
    users[targetUserId].kycStatus = 'approved';
    users[targetUserId].kyc = 'approved';
    users[targetUserId].kycApprovedDate = new Date().toISOString();
    
    await ctx.reply(
      `✅ <b>KYC APPROVED</b>\n\n` +
      `<b>User:</b> ${targetUserId}\n` +
      `<b>Status:</b> ✅ APPROVED\n\n` +
      `User can now perform transactions.`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('❌ Approve command error:', error);
    await ctx.reply('❌ Error approving KYC.', { parse_mode: 'HTML' });
  }
}

async function handleApproveAllCommand(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    let approvedCount = 0;
    
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      const kycStatus = user.kycStatus || user.kyc || 'pending';
      
      if (kycStatus === 'pending' || kycStatus === 'submitted') {
        user.kycStatus = 'approved';
        user.kyc = 'approved';
        user.kycApprovedDate = new Date().toISOString();
        approvedCount++;
      }
    });
    
    await ctx.reply(
      `✅ <b>BULK KYC APPROVAL</b>\n\n` +
      `<b>Users Approved:</b> ${approvedCount}\n\n` +
      `All pending KYC requests have been approved.`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('❌ Approve all command error:', error);
    await ctx.reply('❌ Error approving all KYC.', { parse_mode: 'HTML' });
  }
}

async function handleVirtualAccountsCommand(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const virtualAccountsList = [];
    Object.entries(users).forEach(([uid, user]) => {
      if (user.virtualAccount) {
        const kycStatus = user.kycStatus || user.kyc || 'pending';
        
        virtualAccountsList.push({
          userId: uid,
          accountReference: user.virtualAccount,
          accountNumber: user.virtualAccountNumber,
          accountBank: user.virtualAccountBank,
          balance: user.wallet,
          kyc: kycStatus,
          bvnVerified: user.bvnVerified
        });
      }
    });
    
    if (virtualAccountsList.length === 0) {
      return await ctx.reply('🏦 No virtual accounts created yet.', { parse_mode: 'HTML' });
    }
    
    let message = `<b>VIRTUAL ACCOUNTS (${virtualAccountsList.length}):</b>\n\n`;
    
    virtualAccountsList.slice(0, 20).forEach((acc, index) => {
      message += `${index + 1}. <b>User:</b> ${acc.userId}\n`;
      message += `   🏦 <b>Bank:</b> ${acc.accountBank || 'Unknown'}\n`;
      message += `   🔢 <b>Account:</b> ${acc.accountNumber}\n`;
      message += `   💰 <b>Balance:</b> ${formatCurrency(acc.balance)}\n`;
      message += `   🛂 <b>KYC:</b> ${acc.kyc.toUpperCase()}\n`;
      message += `   🆔 <b>BVN Verified:</b> ${acc.bvnVerified ? '✅ YES' : '❌ NO'}\n\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('❌ Virtual accounts command error:', error);
    await ctx.reply('❌ Error fetching virtual accounts.', { parse_mode: 'HTML' });
  }
}

async function handleViewPlansCommand(ctx, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const networks = getAvailableNetworks();
    
    let message = `<b>DATA PLANS OVERVIEW</b>\n\n`;
    
    networks.forEach(network => {
      message += `<b>${network}:</b>\n`;
      const validities = getAvailableValidities(network);
      
      validities.forEach(validity => {
        const plans = getDataPlans(network, validity, CONFIG);
        message += `   📅 <b>${validity}:</b> ${plans.length} plans\n`;
      });
      message += `\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('❌ View plans command error:', error);
    await ctx.reply('❌ Error viewing plans.', { parse_mode: 'HTML' });
  }
}

async function handleVTUBalanceCommand(ctx, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const loadingMsg = await ctx.reply('🔄 Checking VTU balance...', { parse_mode: 'HTML' });
    
    try {
      const vtuBalance = await checkVTUBalanceFixed(CONFIG);
      
      if (vtuBalance.success) {
        const message = `<b>💰 VTU ACCOUNT BALANCE</b>\n\n` +
          `<b>Balance:</b> ${vtuBalance.formattedBalance}\n` +
          `<b>Status:</b> ${vtuBalance.status}\n` +
          `<b>Account:</b> ${vtuBalance.username}\n` +
          `<b>Last Updated:</b> ${new Date().toLocaleString()}`;
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          null,
          message,
          { parse_mode: 'HTML' }
        );
      } else {
        const message = `<b>💰 VTU ACCOUNT BALANCE</b>\n\n` +
          `<b>Error:</b> ${vtuBalance.error}\n` +
          `<b>Status:</b> Connection Failed\n\n` +
          `<i>Using fallback data for display</i>`;
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          null,
          message,
          { parse_mode: 'HTML' }
        );
      }
      
    } catch (apiError) {
      console.error('VTU Balance API Error:', apiError.message);
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        `<b>💰 VTU ACCOUNT BALANCE</b>\n\n` +
        `<b>Balance:</b> ₦121.63 (Demo)\n` +
        `<b>Status:</b> Active\n` +
        `<b>Account:</b> 07052110985\n\n` +
        `<i>⚠️ Using API fallback data</i>\n` +
        `<i>API Error: ${apiError.message || 'Connection failed'}</i>`,
        { parse_mode: 'HTML' }
      );
    }
    
  } catch (error) {
    console.error('❌ VTU balance command error:', error);
    await ctx.reply('❌ Error checking VTU balance.', { parse_mode: 'HTML' });
  }
}

async function handleVerifyBVNCommand(ctx, users, bot, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const args = ctx.message.text.split(' ');
    
    if (args.length !== 2) {
      return await ctx.reply(
        '❌ <b>Usage:</b> /verify_bvn [user_id]\n' +
        '<b>Example:</b> /verify_bvn 123456789',
        { parse_mode: 'HTML' }
      );
    }
    
    const targetUserId = args[1];
    
    if (!users[targetUserId]) {
      return await ctx.reply(`❌ User ${targetUserId} not found.`, { parse_mode: 'HTML' });
    }
    
    const user = users[targetUserId];
    
    if (!user.bvn) {
      return await ctx.reply(
        `<b>NO BVN SUBMITTED</b>\n\n` +
        `User ${targetUserId} has not submitted BVN.\n\n` +
        `Ask user to use "💳 Deposit Funds" to submit BVN.`,
        { parse_mode: 'HTML' }
      );
    }
    
    if (user.bvnVerified) {
      return await ctx.reply(
        `<b>BVN ALREADY VERIFIED</b>\n\n` +
        `User ${targetUserId} BVN is already verified.\n\n` +
        `<b>BVN:</b> ${maskBVN(user.bvn)}`,
        { parse_mode: 'HTML' }
      );
    }
    
    // Verify BVN
    user.bvnVerified = true;
    user.bvnVerifiedAt = new Date().toLocaleString();
    user.bvnVerifiedBy = userId;
    
    await ctx.reply(
      `<b>✅ BVN VERIFIED SUCCESSFULLY!</b>\n\n` +
      `<b>User:</b> ${targetUserId}\n` +
      `<b>BVN:</b> ${maskBVN(user.bvn)}\n` +
      `<b>Status:</b> VERIFIED\n` +
      `<b>Verified At:</b> ${new Date().toLocaleString('en-NG')}\n\n` +
      `<b>Next Steps:</b>\n` +
      `User can now generate virtual account via "💳 Deposit Funds".`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    console.error('❌ Verify BVN command error:', error);
    await ctx.reply('❌ Error verifying BVN.', { parse_mode: 'HTML' });
  }
}

async function handleBVNListCommand(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      return await ctx.reply('❌ Access denied. Admin only.', { parse_mode: 'HTML' });
    }
    
    const bvnUsers = [];
    Object.entries(users).forEach(([uid, user]) => {
      if (user.bvn) {
        bvnUsers.push({
          userId: uid,
          fullName: user.fullName,
          bvn: user.bvn,
          bvnVerified: user.bvnVerified,
          bvnSubmittedAt: user.bvnSubmittedAt,
          bvnVerifiedAt: user.bvnVerifiedAt,
          virtualAccount: user.virtualAccount
        });
      }
    });
    
    if (bvnUsers.length === 0) {
      return await ctx.reply('📭 No BVN submissions yet.', { parse_mode: 'HTML' });
    }
    
    let message = `<b>BVN SUBMISSIONS (${bvnUsers.length} users):</b>\n\n`;
    
    bvnUsers.slice(0, 20).forEach((user, index) => {
      const verifiedEmoji = user.bvnVerified ? '✅' : '⏳';
      const virtualAccEmoji = user.virtualAccount ? '🏦' : '❌';
      message += `${index + 1}. <b>User:</b> ${user.userId}\n`;
      message += `   📛 <b>Name:</b> ${user.fullName || 'Not provided'}\n`;
      message += `   🆔 <b>BVN:</b> ${maskBVN(user.bvn)}\n`;
      message += `   ${verifiedEmoji} <b>Status:</b> ${user.bvnVerified ? 'Verified' : 'Pending'}\n`;
      message += `   ${virtualAccEmoji} <b>Virtual Account:</b> ${user.virtualAccount ? 'Yes' : 'No'}\n`;
      if (!user.bvnVerified) {
        message += `   ✅ <b>Verify:</b> /verify_bvn ${user.userId}\n`;
      }
      message += `\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('❌ BVN list command error:', error);
    await ctx.reply('❌ Error fetching BVN list.', { parse_mode: 'HTML' });
  }
}

// ==================== CALLBACK HANDLERS ====================
async function handleAdminListUsers(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    const userList = Object.entries(users).slice(0, 20);
    
    if (userList.length === 0) {
      await ctx.editMessageText('📭 No users found.', { parse_mode: 'HTML' });
      return;
    }
    
    let message = `<b>USER LIST (${userList.length} users):</b>\n\n`;
    
    userList.forEach(([id, user], index) => {
      const kycStatus = user.kycStatus || user.kyc || 'pending';
      const kycEmoji = kycStatus === 'approved' ? '✅' : '⏳';
      const pinEmoji = user.pin ? '🔐' : '❌';
      const virtualAccEmoji = user.virtualAccount ? '🏦' : '❌';
      const bvnEmoji = user.bvn ? (user.bvnVerified ? '✅' : '⏳') : '❌';
      message += `${index + 1}. <b>ID:</b> <code>${id}</code>\n`;
      message += `   💰 <b>Balance:</b> ${formatCurrency(user.wallet || 0)}\n`;
      message += `   🛂 <b>KYC:</b> ${kycEmoji} ${kycStatus}\n`;
      message += `   ${pinEmoji} <b>PIN:</b> ${user.pin ? 'Set' : 'Not Set'}\n`;
      message += `   ${bvnEmoji} <b>BVN:</b> ${user.bvn ? maskBVN(user.bvn) : 'Not Set'}\n`;
      message += `   ${virtualAccEmoji} <b>Virtual Account:</b> ${user.virtualAccount ? 'Yes' : 'No'}\n\n`;
    });
    
    await ctx.editMessageText(message, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'admin_list_users')],
        [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
      ])
    });
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Admin list users error:', error);
    ctx.answerCbQuery('❌ Error loading users');
  }
}

async function handleAdminVirtualAccounts(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    const virtualAccountsList = [];
    Object.entries(users).forEach(([uid, user]) => {
      if (user.virtualAccount) {
        const kycStatus = user.kycStatus || user.kyc || 'pending';
        
        virtualAccountsList.push({
          userId: uid,
          accountReference: user.virtualAccount,
          accountNumber: user.virtualAccountNumber,
          accountBank: user.virtualAccountBank,
          balance: user.wallet,
          kyc: kycStatus,
          bvnVerified: user.bvnVerified
        });
      }
    });
    
    if (virtualAccountsList.length === 0) {
      await ctx.editMessageText('🏦 No virtual accounts created yet.', { parse_mode: 'HTML' });
      return;
    }
    
    let message = `<b>VIRTUAL ACCOUNTS (${virtualAccountsList.length}):</b>\n\n`;
    
    virtualAccountsList.slice(0, 15).forEach((acc, index) => {
      message += `${index + 1}. <b>User:</b> ${acc.userId}\n`;
      message += `   🏦 <b>Bank:</b> ${acc.accountBank || 'Unknown'}\n`;
      message += `   🔢 <b>Account:</b> ${acc.accountNumber}\n`;
      message += `   💰 <b>Balance:</b> ${formatCurrency(acc.balance)}\n`;
      message += `   🛂 <b>KYC:</b> ${acc.kyc.toUpperCase()}\n`;
      message += `   🆔 <b>BVN Verified:</b> ${acc.bvnVerified ? '✅ YES' : '❌ NO'}\n\n`;
    });
    
    await ctx.editMessageText(message, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'admin_virtual_accounts')],
        [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
      ])
    });
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Admin virtual accounts error:', error);
    ctx.answerCbQuery('❌ Error loading virtual accounts');
  }
}

async function handleAdminVTUBalance(ctx, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    await ctx.editMessageText('🔄 Checking VTU balance...', { parse_mode: 'HTML' });
    
    try {
      const vtuBalance = await checkVTUBalanceFixed(CONFIG);
      
      if (vtuBalance.success) {
        const message = `<b>💰 VTU ACCOUNT BALANCE</b>\n\n` +
          `<b>Balance:</b> ${vtuBalance.formattedBalance}\n` +
          `<b>Status:</b> ${vtuBalance.status}\n` +
          `<b>Account:</b> ${vtuBalance.username}\n` +
          `<b>Last Updated:</b> ${new Date().toLocaleString()}`;
        
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', 'admin_vtu_balance')],
            [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
          ])
        });
      } else {
        const message = `<b>💰 VTU ACCOUNT BALANCE</b>\n\n` +
          `<b>Error:</b> ${vtuBalance.error}\n` +
          `<b>Status:</b> Connection Failed\n\n` +
          `<i>Using fallback data for display</i>`;
        
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Retry', 'admin_vtu_balance')],
            [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
          ])
        });
      }
      
    } catch (apiError) {
      console.error('VTU Balance API Error:', apiError.message);
      
      await ctx.editMessageText(
        `<b>💰 VTU ACCOUNT BALANCE</b>\n\n` +
        `<b>Balance:</b> ₦121.63 (Demo)\n` +
        `<b>Status:</b> Active\n` +
        `<b>Account:</b> 07052110985\n\n` +
        `<i>⚠️ Using API fallback data</i>\n` +
        `<i>API Error: ${apiError.message || 'Connection failed'}</i>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Retry', 'admin_vtu_balance')],
            [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
          ])
        }
      );
    }
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Admin VTU balance error:', error);
    ctx.answerCbQuery('❌ Error checking balance');
  }
}

async function handleAdminViewPlans(ctx, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    await ctx.editMessageText('🔄 Loading plans...', { parse_mode: 'HTML' });
    
    const networks = getAvailableNetworks();
    
    let message = `<b>DATA PLANS OVERVIEW</b>\n\n`;
    
    networks.forEach(network => {
      message += `<b>${network}:</b>\n`;
      const validities = getAvailableValidities(network);
      
      validities.forEach(validity => {
        const plans = getDataPlans(network, validity, CONFIG);
        message += `   📅 <b>${validity}:</b> ${plans.length} plans\n`;
      });
      message += `\n`;
    });
    
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'admin_view_plans')],
        [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
      ])
    });
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Admin view plans error:', error);
    ctx.answerCbQuery('❌ Error loading plans');
  }
}

async function handleAdminStats(ctx, users, transactions, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    const totalUsers = Object.keys(users).length;
    let totalBalance = 0;
    let pendingKyc = 0;
    let approvedKyc = 0;
    let usersWithVirtualAccounts = 0;
    let usersWithBVN = 0;
    let usersWithVerifiedBVN = 0;
    let totalTransactions = 0;
    
    Object.values(users).forEach(user => {
      totalBalance += user.wallet || 0;
      const kycStatus = user.kycStatus || user.kyc || 'pending';
      
      if (kycStatus === 'pending') pendingKyc++;
      if (kycStatus === 'approved') approvedKyc++;
      if (user.virtualAccount) usersWithVirtualAccounts++;
      if (user.bvn) usersWithBVN++;
      if (user.bvnVerified) usersWithVerifiedBVN++;
    });
    
    Object.values(transactions).forEach(userTx => {
      totalTransactions += userTx.length;
    });
    
    // Check VTU balance
    const vtuBalance = await checkVTUBalanceFixed(CONFIG);
    
    let vtuBalanceText = '';
    if (vtuBalance.success) {
      vtuBalanceText = `<b>VTU Balance:</b> ${vtuBalance.formattedBalance}\n`;
    } else {
      vtuBalanceText = `<b>VTU Balance:</b> ${vtuBalance.error}\n`;
    }
    
    const message = `<b>📊 SYSTEM STATISTICS</b>\n\n` +
      `<b>Total Users:</b> ${totalUsers}\n` +
      `<b>User Balances:</b> ${formatCurrency(totalBalance)}\n` +
      `<b>Approved KYC:</b> ${approvedKyc}\n` +
      `<b>Pending KYC:</b> ${pendingKyc}\n` +
      `<b>Virtual Accounts:</b> ${usersWithVirtualAccounts}\n` +
      `<b>BVN Submitted:</b> ${usersWithBVN}\n` +
      `<b>BVN Verified:</b> ${usersWithVerifiedBVN}\n` +
      `<b>Total Transactions:</b> ${totalTransactions}\n` +
      `${vtuBalanceText}\n` +
      `<b>Last Updated:</b> ${new Date().toLocaleString()}`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'admin_stats')],
        [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
      ])
    });
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Admin stats error:', error);
    ctx.answerCbQuery('❌ Error loading stats');
  }
}

async function handleAdminBVNList(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    const bvnUsers = [];
    Object.entries(users).forEach(([uid, user]) => {
      if (user.bvn) {
        bvnUsers.push({
          userId: uid,
          fullName: user.fullName,
          bvn: user.bvn,
          bvnVerified: user.bvnVerified,
          bvnSubmittedAt: user.bvnSubmittedAt,
          bvnVerifiedAt: user.bvnVerifiedAt,
          virtualAccount: user.virtualAccount
        });
      }
    });
    
    if (bvnUsers.length === 0) {
      await ctx.editMessageText('📭 No BVN submissions yet.', { parse_mode: 'HTML' });
      return;
    }
    
    let message = `<b>BVN SUBMISSIONS (${bvnUsers.length} users):</b>\n\n`;
    
    bvnUsers.slice(0, 15).forEach((user, index) => {
      const verifiedEmoji = user.bvnVerified ? '✅' : '⏳';
      const virtualAccEmoji = user.virtualAccount ? '🏦' : '❌';
      message += `${index + 1}. <b>User:</b> ${user.userId}\n`;
      message += `   📛 <b>Name:</b> ${user.fullName || 'Not provided'}\n`;
      message += `   🆔 <b>BVN:</b> ${maskBVN(user.bvn)}\n`;
      message += `   ${verifiedEmoji} <b>Status:</b> ${user.bvnVerified ? 'Verified' : 'Pending'}\n`;
      message += `   ${virtualAccEmoji} <b>Virtual Account:</b> ${user.virtualAccount ? 'Yes' : 'No'}\n`;
      if (!user.bvnVerified) {
        message += `   ✅ <b>Verify:</b> /verify_bvn ${user.userId}\n`;
      }
      message += `\n`;
    });
    
    await ctx.editMessageText(message, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'admin_bvn_list')],
        [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
      ])
    });
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Admin BVN list error:', error);
    ctx.answerCbQuery('❌ Error loading BVN list');
  }
}

async function handleAdminApproveAll(ctx, users, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    let approvedCount = 0;
    
    Object.keys(users).forEach(userId => {
      const user = users[userId];
      const kycStatus = user.kycStatus || user.kyc || 'pending';
      
      if (kycStatus === 'pending' || kycStatus === 'submitted') {
        user.kycStatus = 'approved';
        user.kyc = 'approved';
        user.kycApprovedDate = new Date().toISOString();
        approvedCount++;
      }
    });
    
    await ctx.editMessageText(
      `<b>✅ BULK KYC APPROVAL</b>\n\n` +
      `<b>Users Approved:</b> ${approvedCount}\n\n` +
      `All pending KYC requests have been approved.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Refresh', 'admin_stats')],
          [Markup.button.callback('⬅️ Back to Admin', 'back_to_admin')]
        ])
      }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Admin approve all error:', error);
    ctx.answerCbQuery('❌ Error approving KYC');
  }
}

async function handleBackToAdmin(ctx, users, transactions, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId, CONFIG.ADMIN_ID)) {
      await ctx.answerCbQuery('❌ Admin only');
      return;
    }
    
    const totalUsers = Object.keys(users).length;
    let totalBalance = 0;
    let pendingKyc = 0;
    let approvedKyc = 0;
    let usersWithVirtualAccounts = 0;
    let usersWithBVN = 0;
    let usersWithVerifiedBVN = 0;
    
    Object.values(users).forEach(user => {
      totalBalance += user.wallet || 0;
      const kycStatus = user.kycStatus || user.kyc || 'pending';
      
      if (kycStatus === 'pending') pendingKyc++;
      if (kycStatus === 'approved') approvedKyc++;
      if (user.virtualAccount) usersWithVirtualAccounts++;
      if (user.bvn) usersWithBVN++;
      if (user.bvnVerified) usersWithVerifiedBVN++;
    });
    
    // Check VTU balance
    const vtuBalance = await checkVTUBalanceFixed(CONFIG);
    
    let vtuBalanceText = '';
    if (vtuBalance.success) {
      vtuBalanceText = `💰 <b>VTU Balance:</b> ${vtuBalance.formattedBalance}\n`;
    } else {
      vtuBalanceText = `⚠️ <b>VTU Balance:</b> ${vtuBalance.error}\n`;
    }
    
    const message = `🛠️ <b>ADMIN CONTROL PANEL</b>\n\n` +
      `<b>Statistics:</b>\n` +
      `👥 Total Users: ${totalUsers}\n` +
      `💰 User Balances: ${formatCurrency(totalBalance)}\n` +
      `✅ Approved KYC: ${approvedKyc}\n` +
      `⏳ Pending KYC: ${pendingKyc}\n` +
      `🏦 Virtual Accounts: ${usersWithVirtualAccounts}\n` +
      `🆔 BVN Submitted: ${usersWithBVN}\n` +
      `✅ BVN Verified: ${usersWithVerifiedBVN}\n` +
      `${vtuBalanceText}` +
      `<b>Quick Commands:</b>\n` +
      `• /users - List all users\n` +
      `• /stats - System statistics\n` +
      `• /deposit [id] [amount] - Deposit funds\n` +
      `• /credit [id] [amount] - Credit user\n` +
      `• /approve [id] - Approve KYC\n` +
      `• /vtu_balance - Check VTU balance\n` +
      `• /virtual_accounts - List virtual accounts\n` +
      `• /view_plans - View data plans\n` +
      `• /bvn_list - List BVN submissions\n` +
      `• /verify_bvn [id] - Verify user BVN\n\n` +
      `<b>Admin Actions:</b>`;
    
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 List Users', 'admin_list_users')],
        [Markup.button.callback('💰 VTU Balance', 'admin_vtu_balance')],
        [Markup.button.callback('🏦 Virtual Accounts', 'admin_virtual_accounts')],
        [Markup.button.callback('📊 View Plans', 'admin_view_plans')],
        [Markup.button.callback('📈 System Stats', 'admin_stats')],
        [Markup.button.callback('🆔 BVN List', 'admin_bvn_list')],
        [Markup.button.callback('✅ Approve All KYC', 'admin_approve_all')]
      ])
    });
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Back to admin error:', error);
    ctx.answerCbQuery('❌ Error loading admin panel');
  }
}