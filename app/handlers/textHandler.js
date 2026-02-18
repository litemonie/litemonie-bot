// app/handlers/textHandler.js
const { escapeMarkdownV2 } = require('../utils/markdownHelpers');
const { formatCurrency } = require('../utils/formatters');
const { Markup } = require('telegraf');

module.exports = function createTextHandler(
  users,
  transactions,
  sessions,
  saveData,
  sessionsFile,
  systemTransactionManager,
  userMethods,
  transactionMethods,
  deviceHandler,
  deviceLockApp,
  depositFunds,
  sendMoney,
  buyAirtime,
  buyData,
  buyTVSubscription,
  buyElectricity,
  buyExamPins,
  buyCardPins,
  NETWORK_CODES,
  CONFIG
) {
  
  // Helper functions that need to be passed from main file
  function isAdmin(userId) {
    return userId.toString() === CONFIG.ADMIN_ID.toString();
  }
  
  function isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  async function initUser(userId) {
    // This should be passed from main file
    // For now, we'll create a placeholder
    if (!users[userId]) {
      const isAdminUser = userId.toString() === CONFIG.ADMIN_ID.toString();
      
      users[userId] = {
        telegramId: userId,
        wallet: 0,
        kycStatus: isAdminUser ? 'approved' : 'pending',
        pin: null,
        pinAttempts: 0,
        pinLocked: false,
        joined: new Date().toLocaleString(),
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        username: null,
        virtualAccount: null,
        virtualAccountNumber: null,
        virtualAccountBank: null,
        dailyDeposit: 0,
        dailyTransfer: 0,
        lastDeposit: null,
        lastTransfer: null,
        kycSubmittedDate: null,
        kycApprovedDate: isAdminUser ? new Date().toISOString() : null,
        kycRejectedDate: null,
        kycRejectionReason: null,
        kycSubmitted: false,
        kycDocument: null,
        kycDocumentType: null,
        kycDocumentNumber: null,
        isMarketer: false,
        marketerId: null,
        totalDeviceSales: 0,
        totalDeviceCommission: 0
      };
      
      if (!transactions[userId]) {
        transactions[userId] = [];
      }
      
      // Save data
      await saveData(usersFile, users);
      await saveData(transactionsFile, transactions);
    }
    return users[userId];
  }
  
  async function checkKYCAndPIN(userId, ctx) {
    try {
      const user = await initUser(userId);
      
      if (!user) {
        await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
        return false;
      }
      
      const kycStatus = user.kycStatus || 'pending';
      
      if (kycStatus !== 'approved') {
        await ctx.reply(
          '❌ \\*KYC VERIFICATION REQUIRED\\*\n\n' +
          '📝 Your account needs verification\\.\n\n' +
          `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
          '📞 \\*Contact admin\\:\\* @opuenekeke',
          { parse_mode: 'MarkdownV2' }
        );
        return false;
      }
      
      if (!user.pin) {
        await ctx.reply(
          '❌ \\*TRANSACTION PIN NOT SET\\*\n\n' +
          '🔐 \\*Set PIN\\:\\* `/setpin 1234`',
          { parse_mode: 'MarkdownV2' }
        );
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ KYC check error:', error);
      await ctx.reply('❌ Error checking account status\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      return false;
    }
  }
  
  async function handleSearchTransactionIdText(ctx, text) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || userSession.action !== 'admin_search_tx_id') {
        return false;
      }
      
      const transactionId = text.trim();
      const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
      
      if (!transactionDetails) {
        await ctx.reply(
          `❌ \\*Transaction Not Found\\*\n\n` +
          `Transaction ID\\: \`${escapeMarkdownV2(transactionId)}\`\n` +
          `No transaction found with this ID\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        
        sessions[userId].action = null;
        await saveData(sessionsFile, sessions);
        return true;
      }
      
      // Show transaction details
      await systemTransactionManager.viewTransactionDetails(ctx, transactionId);
      
      sessions[userId].action = null;
      await saveData(sessionsFile, sessions);
      return true;
      
    } catch (error) {
      console.error('❌ Search transaction ID text error:', error);
      await ctx.reply('❌ Error searching for transaction\\.', { parse_mode: 'MarkdownV2' });
      return true;
    }
  }
  
  async function handleAdvancedSearchText(ctx, text) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || userSession.action !== 'admin_advanced_search') {
        return false;
      }
      
      // Parse search criteria
      const filters = {};
      const lines = text.split('\n');
      
      lines.forEach(line => {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          const cleanKey = key.trim().toLowerCase().replace(/[^a-z]/g, '');
          
          switch (cleanKey) {
            case 'search':
              filters.searchTerm = value;
              break;
            case 'type':
              filters.type = value;
              break;
            case 'category':
              filters.category = value;
              break;
            case 'status':
              filters.status = value;
              break;
            case 'user':
              filters.userId = value;
              break;
            case 'phone':
              filters.phone = value;
              break;
            case 'network':
              filters.network = value;
              break;
            case 'datefrom':
              filters.startDate = value;
              break;
            case 'dateto':
              filters.endDate = value;
              break;
            case 'amountmin':
              filters.minAmount = parseFloat(value);
              break;
            case 'amountmax':
              filters.maxAmount = parseFloat(value);
              break;
            case 'hasapi':
              filters.hasApiResponse = value.toLowerCase() === 'true';
              break;
            case 'apiname':
              filters.apiName = value;
              break;
            case 'sortby':
              filters.sortBy = value;
              break;
            case 'sortorder':
              filters.sortOrder = value;
              break;
            case 'page':
              filters.page = parseInt(value) || 1;
              break;
            case 'pagesize':
              filters.pageSize = parseInt(value) || 50;
              break;
          }
        }
      });
      
      // Perform search
      const results = systemTransactionManager.searchTransactions(filters);
      const totalResults = systemTransactionManager.searchTransactions({ ...filters, page: null, pageSize: null }).length;
      
      let message = `🔍 \\*SEARCH RESULTS\\*\n\n`;
      message += `📊 Found\\: ${totalResults} transactions\n`;
      
      if (Object.keys(filters).length > 0) {
        message += `🔎 Filters applied\\:\n`;
        Object.entries(filters).forEach(([key, value]) => {
          if (!['page', 'pageSize', 'sortBy', 'sortOrder'].includes(key)) {
            message += `• ${key}\\: ${value}\n`;
          }
        });
      }
      
      message += `\n📄 Showing ${results.length} transactions\n\n`;
      
      if (results.length === 0) {
        message += 'No transactions found\\.';
      } else {
        results.slice(0, 5).forEach((tx, index) => {
          const statusEmoji = tx.status === 'completed' ? '✅' : 
                            tx.status === 'failed' ? '❌' : '⏳';
          const amountText = formatCurrency(tx.amount || 0);
          const date = new Date(tx.timestamp).toLocaleString();
          const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
          const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
          
          message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
          message += `💰 Amount\\: ${amountText}\n`;
          message += `👤 User\\: ${escapeMarkdownV2(userInfo)}\n`;
          message += `📅 Date\\: ${escapeMarkdownV2(date)}\n`;
          message += `📡 API Calls\\: ${apiCount}\n`;
          message += `🔗 ID\\: \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
        });
        
        if (results.length > 5) {
          message += `\\.\\.\\. and ${results.length - 5} more results\\.`;
        }
      }
      
      // Save search for export
      sessions[userId] = {
        ...sessions[userId],
        lastSearch: filters,
        searchResults: results
      };
      await saveData(sessionsFile, sessions);
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📁 Export Results', 'admin_export_search')],
          [Markup.button.callback('📊 Generate Report', 'admin_generate_search_report')],
          [Markup.button.callback('🔍 New Search', 'admin_advanced_search')],
          [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
        ])
      });
      
      return true;
      
    } catch (error) {
      console.error('❌ Advanced search text error:', error);
      await ctx.reply('❌ Error processing search\\. Please check your format\\.', { parse_mode: 'MarkdownV2' });
      return true;
    }
  }
  
  async function handleTextMessage(ctx, text) {
    try {
      const userId = ctx.from.id.toString();
      
      console.log(`📱 [TEXT ROUTER] User ${userId}: "${text}"`);
      
      await initUser(userId);
      
      if (text.startsWith('/')) {
        return true;
      }
      
      const userSession = sessions[userId];
      
      // Check admin search transaction by ID
      if (userSession && userSession.action === 'admin_search_tx_id') {
        return await handleSearchTransactionIdText(ctx, text);
      }
      
      // Check admin advanced search
      if (userSession && userSession.action === 'admin_advanced_search') {
        return await handleAdvancedSearchText(ctx, text);
      }
      
      // Check admin search (old format)
      if (userSession && userSession.action === 'admin_search_transactions') {
        const results = systemTransactionManager.searchTransactions({ searchTerm: text });
        await ctx.reply(`Found ${results.length} transactions for "${text}"`, { parse_mode: 'MarkdownV2' });
        return true;
      }
      
      // Check send money session
      const sendMoneySession = sendMoney.sessionManager?.getSession?.(userId);
      if (sendMoneySession && sendMoneySession.action === 'send_money') {
        const usersWithMethods = { ...users, ...userMethods };
        const result = await sendMoney.handleText(ctx, text, usersWithMethods, transactionMethods);
        if (result) return true;
      }
      
      // Check Litemonie session
      if (userSession && userSession.action === 'litemonie_transfer') {
        // Handle Litemonie transfer text
        return true;
      }
      
      // Check deposit text
      const usersWithMethods = { ...users, ...userMethods };
      const depositHandled = await depositFunds.handleDepositText(ctx, text, usersWithMethods, virtualAccounts);
      if (depositHandled) {
        console.log(`📱 Deposit text handled for user ${userId}`);
        return true;
      }
      
      // Check if device handler can handle the text
      if (deviceHandler) {
        deviceHandler.users = users;
        const handledByDevice = await deviceHandler.handleTextMessage(ctx, text, userSession);
        
        if (handledByDevice) {
          console.log(`📱 Device handler handled text for user ${userId}`);
          return true;
        }
      }
      
      // Check airtime session
      if (userSession && userSession.action === 'airtime') {
        try {
          const result = await buyAirtime.handleText(
            ctx,
            text,
            users,
            transactions,
            sessions,
            NETWORK_CODES,
            CONFIG
          );
          return result !== false;
        } catch (error) {
          console.error('❌ Error in airtime text handler:', error);
        }
      }
      
      // Check data session
      if (userSession && userSession.action === 'data') {
        const dataTextHandler = buyData.handleText;
        if (dataTextHandler) {
          try {
            const result = await dataTextHandler(ctx, text, userSession, users[userId], users, transactions, sessionManager, NETWORK_CODES, CONFIG);
            if (result) return true;
          } catch (error) {
            console.error('❌ Error in data text handler:', error);
          }
        }
      }
      
      // Check TV subscription session
      if (userSession && userSession.action === 'tv_subscription') {
        const tvTextHandler = buyTVSubscription.handleText;
        if (tvTextHandler) {
          try {
            const result = await tvTextHandler(ctx, text, userSession, users[userId], users, transactions, sessionManager, CONFIG);
            if (result) return true;
          } catch (error) {
            console.error('❌ Error in TV subscription text handler:', error);
          }
        }
      }
      
      // Check electricity session
      if (userSession && userSession.action === 'electricity') {
        const electricityTextHandler = buyElectricity.handleText;
        if (electricityTextHandler) {
          try {
            const result = await electricityTextHandler(ctx, text, userSession, users[userId], users, transactions, sessionManager, CONFIG);
            if (result) return true;
          } catch (error) {
            console.error('❌ Error in electricity text handler:', error);
          }
        }
      }
      
      // Check exam pins session
      if (userSession && userSession.action === 'exam_pins') {
        const examTextHandler = buyExamPins.handleText;
        if (examTextHandler) {
          try {
            const result = await examTextHandler(ctx, text, userSession, users[userId], users, transactions, sessionManager, CONFIG);
            if (result) return true;
          } catch (error) {
            console.error('❌ Error in exam pins text handler:', error);
          }
        }
      }
      
      // Check card pins session
      if (userSession && userSession.action === 'card_pins') {
        const cardPinsTextHandler = buyCardPins.handleText;
        if (cardPinsTextHandler) {
          try {
            const result = await cardPinsTextHandler(ctx, text, userSession, users[userId], users, transactions, sessionManager, CONFIG);
            if (result) return true;
          } catch (error) {
            console.error('❌ Error in card pins text handler:', error);
          }
        }
      }
      
      // Check Mini App session
      if (userSession && userSession.action === 'mini_app') {
        if (deviceLockApp && typeof deviceLockApp.handleText === 'function') {
          try {
            const result = await deviceLockApp.handleText(ctx, text, userSession);
            if (result) return true;
          } catch (error) {
            console.error('❌ Error in Mini App text handler:', error);
          }
        }
      }
      
      // No active session handling
      if (!userSession) {
        if (/^\d+$/.test(text) && parseInt(text) > 0 && parseInt(text) <= 50000) {
          const amount = parseInt(text);
          const formattedAmount = formatCurrency(amount);
          
          await ctx.reply(
            `💰 \\*Amount Detected\\:\\* ${formattedAmount}\n\n` +
            `Please select a service first\\:\n\n` +
            `📱 \\*Device Financing\\*\n` +
            `📞 \\*Buy Airtime\\*\n` +
            `📡 \\*Buy Data\\*\n` +
            `🎫 \\*Card Pins\\*\n` +
            `📝 \\*Exam Pins\\*\n` +
            `📺 \\*TV Subscription\\*\n` +
            `💡 \\*Electricity Bill\\*\n` +
            `🏦 \\*Send Money\\*\n\n` +
            `Use the menu buttons to start a transaction\\.`,
            { parse_mode: 'MarkdownV2' }
          );
          return true;
        }
        
        if (/^0[7-9][0-1]\d{8}$/.test(text)) {
          const escapedPhone = escapeMarkdownV2(text);
          
          await ctx.reply(
            `📱 \\*Phone Number Detected\\:\\* ${escapedPhone}\n\n` +
            `Please select what you want to do with this number\\:\n\n` +
            `📞 \\*Buy Airtime\\*\n` +
            `📡 \\*Buy Data\\*\n\n` +
            `Use the menu buttons to select a service first\\.`,
            { parse_mode: 'MarkdownV2' }
          );
          return true;
        }
        
        await ctx.reply(
          '🤔 \\*I didn\'t understand that\\*\n\n' +
          'Please select an option from the menu or use /help for commands\\.',
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      console.log(`⚠️ Session exists but wasn't handled:`, userSession);
      return false;
      
    } catch (error) {
      console.error('❌ Text handler error:', error);
      await ctx.reply('❌ An error occurred\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      return true;
    }
  }
  
  return {
    handleTextMessage,
    handleSearchTransactionIdText,
    handleAdvancedSearchText,
    checkKYCAndPIN
  };
};