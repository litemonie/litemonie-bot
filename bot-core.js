// ====================================================================
// SECTION 1: BOT-CORE.JS - COMPLETE WORKING VERSION
// ====================================================================

// ====================================================================
// SECTION 1.1: SESSION MANAGEMENT FUNCTIONS
// ====================================================================
const botSessions = {};

async function getSession(userId) {
  return botSessions[userId] || null;
}

async function setSession(userId, data) {
  botSessions[userId] = data;
  return botSessions[userId];
}

async function updateSession(userId, updates) {
  if (botSessions[userId]) {
    Object.assign(botSessions[userId], updates);
  } else {
    botSessions[userId] = updates;
  }
  return botSessions[userId];
}

async function clearSession(userId) {
  delete botSessions[userId];
}

// ====================================================================
// SECTION 1.2: REQUIRED MODULES IMPORTS
// ====================================================================
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path = require('path');
const { CONFIG } = require('./config');
const { initStorage, loadData, setupAutoSave, saveAllData, recordTransaction, getUsers, setUsers, getSessions, setSessions, getTransactions } = require('./database');
const { initUser, isAdmin, formatCurrency, escapeMarkdownV2, checkKYCAndPIN } = require('./utils');
const { initializeDeviceHandler, getDeviceHandler, getDeviceCallbacks, getDeviceLockApp, getMiniAppCallbacks } = require('./device-system');
const { systemTransactionManager, analyticsManager } = require('./transaction-system');
const {
  userMethods, transactionMethods, virtualAccounts, sessionManager,
  handleAdminTransactionTracking, handleSearchTransactionById,
  handleViewApiTransactions, handleViewAllTransactions, handleViewFailedTransactions,
  handleAdvancedSearch, handleTextMessage
} = require('./handlers');

// ====================================================================
// SECTION 1.3: FEATURE MODULE IMPORTS
// ====================================================================
const buyAirtime = require('./app/buyAirtime');
const buyData = require('./app/buyData');
const depositFunds = require('./app/depositFunds');
const admin = require('./app/admin');
const kyc = require('./app/kyc');
const sendMoney = require('./app/sendmoney');
const buyCardPins = require('./app/Card pins/buyCardPins');
const buyExamPins = require('./app/Bill/exam');
const buyElectricity = require('./app/Bill/light');
const buyTVSubscription = require('./app/Bill/tv');
const transactionHistory = require('./app/transactionHistory');
const { showProfile } = require('./profile');

// ====================================================================
// SECTION 1.4: UPGRADE RECOVERY IMPORTS
// ====================================================================
const { 
  handleUpgradeRecovery, 
  processRecoveryInput, 
  handleCancelRecovery, 
  handleRestoreButton, 
  isFreshDeployment,
  getUpgradeSession,
  addUpgradeButtonToMenu
} = require('./upgrade');

// ====================================================================
// SECTION 1.5: GLOBAL VARIABLES
// ====================================================================
let botInstance = null;
let serverInstance = null;

// ====================================================================
// SECTION 2: HELPER FUNCTIONS
// ====================================================================
function registerCallbackHandlers(bot, callbacks, moduleName) {
  console.log(`🔗 Registering ${moduleName} callbacks...`);
  Object.entries(callbacks).forEach(([pattern, handler]) => {
    try {
      if (pattern.includes(':') && pattern.includes('_')) {
        bot.action(new RegExp(`^${pattern.replace(/:\w+/g, '(.+)')}$`), handler);
      } else if (pattern.includes('(') || pattern.includes('.') || pattern.includes('+') || pattern.includes('*') || pattern.includes('?')) {
        bot.action(new RegExp(`^${pattern}$`), handler);
      } else {
        bot.action(pattern, handler);
      }
      console.log(`   ✓ ${pattern}`);
    } catch (error) {
      console.error(`   ❌ Failed: ${pattern} - ${error.message}`);
    }
  });
}

// ====================================================================
// SECTION 3: BOT CREATION FUNCTION
// ====================================================================
async function createBot() {
  console.log('🚀 Creating bot instance...');
  
  if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not set');
    process.exit(1);
  }
  
  const bot = new Telegraf(process.env.BOT_TOKEN);
  
  try {
    console.log('🔍 Fetching bot username from Telegram API...');
    const botInfo = await bot.telegram.getMe();
    bot.options = bot.options || {};
    bot.options.username = botInfo.username;
    bot.botInfo = botInfo;
    console.log(`✅ Bot username set to: @${botInfo.username}`);
  } catch (error) {
    console.error('❌ Could not fetch bot username:', error.message);
    console.warn('⚠️ Using fallback username');
    bot.options = bot.options || {};
    bot.options.username = 'litewaydatabot';
  }
  
  await initStorage();
  await loadData();
  await initializeDeviceHandler(bot);
  setupAutoSave();
  
  return bot;
}

// ====================================================================
// SECTION 4: EXPRESS SERVER SETUP
// ====================================================================
function setupExpressServer(bot) {
  const app = express();
  app.use(express.json());
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    const allowedOrigins = [
      'https://litemonie-device.onrender.com',
      'https://opuenekeke.github.io',
      'https://litemonie-bot.onrender.com',
      ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5000'] : [])
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (process.env.NODE_ENV !== 'production') {
      res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, ngrok-skip-browser-warning');
    
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.get('/ping', (req, res) => res.send('pong'));
  app.get('/health', (req, res) => res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() }));
  app.get('/', (req, res) => res.status(200).json({ message: '🚀 Litemonie Bot is running!' }));

  app.post('/webhook', (req, res) => {
    try {
      bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(200).send('OK');
    }
  });

  const billstackWebhook = require('./billstack-webhook');
  app.use('/billstack-webhook', billstackWebhook);

  app.get('/api/device-data', async (req, res) => {
    const deviceLockApp = getDeviceLockApp();
    if (!deviceLockApp) return res.status(500).json({ success: false, error: 'Device Lock App not initialized' });
    const data = await deviceLockApp.getDeviceData(req.query.sessionId, req.query.token);
    res.json(data);
  });

  app.post('/api/request-unlock', express.json(), async (req, res) => {
    const deviceLockApp = getDeviceLockApp();
    if (!deviceLockApp) return res.status(500).json({ success: false, error: 'Device Lock App not initialized' });
    const result = await deviceLockApp.requestDeviceUnlock(req.body.sessionId, req.body.token, req.body.imei);
    res.json(result);
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  return app;
}

// ====================================================================
// SECTION 5: COMMAND HANDLERS
// ====================================================================
async function setupCommands(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const isUserAdmin = isAdmin(userId);
    
    let keyboard = isUserAdmin ? [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '🛠️ Admin Panel', '👤 Profile', '🆘 Help & Support']
    ] : [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '👤 Profile', '🆘 Help & Support']
    ];
    
    keyboard = addUpgradeButtonToMenu(keyboard);
    
    await ctx.reply(
      `🌟 Welcome to Liteway VTU Bot!\n\n🛂 KYC: ${(user.kycStatus || 'pending').toUpperCase()}\n💵 Wallet: ${formatCurrency(user.wallet)}\n\nSelect an option from the menu:`,
      { parse_mode: 'Markdown', ...Markup.keyboard(keyboard).resize() }
    );
  });

  bot.command('setpin', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('❌ Usage: /setpin 1234');
    if (!/^\d{4}$/.test(args[1])) return ctx.reply('❌ PIN must be 4 digits');
    user.pin = args[1];
    user.pinAttempts = 0;
    user.pinLocked = false;
    setUsers(getUsers());
    await saveAllData();
    await ctx.reply('✅ PIN set successfully!');
  });

  bot.command('balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    await ctx.reply(`💰 Your balance: ${formatCurrency(user.wallet)}`);
  });
  
  bot.command('profile', async (ctx) => {
    await showProfile(ctx);
  });
}

// ====================================================================
// SECTION 6: MENU HANDLERS (ALL BUTTONS)
// ====================================================================
async function setupMenuHandlers(bot) {
  // Device Financing
  bot.hears('📱 Device Financing', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System error');
    
    deviceHandler.users = getUsers();
    await deviceHandler.handleDeviceMenu(ctx);
  });
  
  // TV Subscription
  bot.hears('📺 TV Subscription', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyTVSubscription.handleTVSubscription(ctx, getUsers(), sessionManager, CONFIG);
  });
  
  // Electricity Bill
  bot.hears('💡 Electricity Bill', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyElectricity.handleElectricity(ctx, getUsers(), sessionManager, CONFIG);
  });
  
  // Buy Airtime
  bot.hears('📞 Buy Airtime', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyAirtime.handleAirtime(ctx, getUsers(), getSessions(), CONFIG, require('./config').NETWORK_CODES);
  });
  
  // Buy Data
  bot.hears('📡 Buy Data', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyData.handleData(ctx, getUsers(), sessionManager, CONFIG, require('./config').NETWORK_CODES);
  });
  
  // Card Pins
  bot.hears('🎫 Card Pins', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyCardPins.handleCardPinsMenu(ctx, getUsers(), sessionManager, CONFIG);
  });
  
  // Exam Pins
  bot.hears('📝 Exam Pins', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyExamPins.handleExamPins(ctx, getUsers(), sessionManager, CONFIG);
  });
  
  // Lite Light
  bot.hears('⚡ Lite Light', async (ctx) => {
    await ctx.reply('⚡ Lite Light\n\n🚧 Coming Soon!');
  });
  
  // Money Transfer
  bot.hears('🏦 Money Transfer', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    
    await ctx.reply(
      '🏦 SEND MONEY\n\nChoose transfer method:',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('🏦 BANK TRANSFER', 'bank_transfer')],
        [Markup.button.callback('📱 LITEMONIE', 'litemonie_transfer')],
        [Markup.button.callback('🏠 Home', 'start')]
      ]) }
    );
  });
  
  // Wallet Balance
  bot.hears('💰 Wallet Balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    await ctx.reply(`💰 Your balance: ${formatCurrency(user.wallet)}`);
  });
  
  // Deposit Funds
  bot.hears('💳 Deposit Funds', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    
    if ((user.kycStatus || 'pending') !== 'approved') {
      return ctx.reply('❌ KYC Verification Required. Please complete KYC first.');
    }
    
    const needsEmail = !user.email;
    const needsPhone = !user.phone;
    
    if (needsEmail) {
      depositFunds.sessionManager.startSession(userId, 'collect_email');
      return ctx.reply('📧 Email Required\n\nPlease enter your email address:');
    }
    
    if (needsPhone) {
      depositFunds.sessionManager.startSession(userId, 'collect_phone');
      return ctx.reply(`📱 Phone Required\n\nEmail: ${user.email}\n\nPlease enter your phone number:`);
    }
    
    await ctx.reply(
      `🏦 DEPOSIT FUNDS\n\n👤 User ID: ${userId}\n💰 Balance: ${formatCurrency(user.wallet || 0)}\n\n📧 Email: ${user.email}\n📱 Phone: ${user.phone}`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('🏦 Get Virtual Account', 'create_virtual_account')],
        [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
        [Markup.button.callback('🏠 Home', 'start')]
      ]) }
    );
  });
  
  // Transaction History
  bot.hears('📜 Transaction History', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    await transactionHistory.handleHistory(ctx, getUsers(), getTransactions(), CONFIG);
  });
  
  // KYC Status
  bot.hears('🛂 KYC Status', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const statusEmoji = { 'approved': '✅', 'rejected': '❌', 'submitted': '📋' }[user.kycStatus] || '⏳';
    await ctx.reply(`🛂 KYC STATUS\n\nStatus: ${statusEmoji} ${(user.kycStatus || 'pending').toUpperCase()}`);
  });
  
  // Admin Panel
  bot.hears('🛠️ Admin Panel', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Admin only');
    
    await ctx.reply(
      '🛠️ ADMIN PANEL\n\nAdministrator Controls',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([
        [Markup.button.callback('👥 User Management', 'admin_users')],
        [Markup.button.callback('💰 Credit User', 'admin_quick_credit')],
        [Markup.button.callback('📊 Transaction Tracking', 'admin_transaction_tracking')],
        [Markup.button.callback('🛂 KYC Approvals', 'admin_kyc')],
        [Markup.button.callback('🏠 Home', 'start')]
      ]) }
    );
  });
  
  // Profile
  bot.hears('👤 Profile', async (ctx) => {
    await showProfile(ctx);
  });
  
  // Help & Support
  bot.hears('🆘 Help & Support', async (ctx) => {
    await ctx.reply(
      `🆘 HELP & SUPPORT\n\nCommands:\n/start - Main menu\n/setpin 1234 - Set PIN\n/balance - Check balance\n/profile - View profile\n\n📞 Support: @opuenekeke`
    );
  });
  
  // Restore My Account
  bot.hears('🔄 Restore My Account', async (ctx) => {
    await handleRestoreButton(ctx);
  });
}

// ====================================================================
// SECTION 7: CALLBACK HANDLERS
// ====================================================================
async function setupCallbackHandlers(bot) {
  // Bank Transfer
  bot.action('bank_transfer', async (ctx) => {
    await sendMoney.handleSendMoney(ctx, { ...getUsers(), ...userMethods }, transactionMethods);
    await ctx.answerCbQuery();
  });
  
  // LiteMoni Transfer
  bot.action('litemonie_transfer', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    if (!user.phone) {
      await ctx.reply('📱 Phone number required for Litemonie. Please set your phone number in profile first.');
      return ctx.answerCbQuery();
    }
    await sendMoney.handleLiteMoni(ctx, getUsers());
    await ctx.answerCbQuery();
  });
  
  // Start/Home
  bot.action('start', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const isUserAdmin = isAdmin(userId);
    
    let keyboard = isUserAdmin ? [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '🛠️ Admin Panel', '👤 Profile', '🆘 Help & Support']
    ] : [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '👤 Profile', '🆘 Help & Support']
    ];
    
    keyboard = addUpgradeButtonToMenu(keyboard);
    
    await ctx.reply(
      `🌟 Welcome to Liteway VTU Bot!\n\n🛂 KYC: ${(user.kycStatus || 'pending').toUpperCase()}\n💵 Wallet: ${formatCurrency(user.wallet)}\n\nSelect an option from the menu:`,
      { parse_mode: 'Markdown', ...Markup.keyboard(keyboard).resize() }
    );
    await ctx.answerCbQuery();
  });
  
  // Upgrade Recovery
  bot.action('upgrade_recovery', async (ctx) => {
    await handleUpgradeRecovery(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('cancel_recovery', async (ctx) => {
    await handleCancelRecovery(ctx);
    await ctx.answerCbQuery();
  });
  
  // Deposit Callbacks
  bot.action('create_virtual_account', async (ctx) => {
    await depositFunds.handleCreateVirtualAccount(ctx, {
      findById: async (id) => {
        const users = getUsers();
        return users[id] || null;
      }
    }, virtualAccounts, bot);
  });
  
  bot.action('manual_deposit', async (ctx) => {
    await depositFunds.handleManualDeposit(ctx);
  });
  
  bot.action('cancel_deposit', async (ctx) => {
    await depositFunds.handleCancelDeposit(ctx);
  });
  
  bot.action('change_email', async (ctx) => {
    await depositFunds.handleChangeEmail(ctx, {
      findById: async (id) => {
        const users = getUsers();
        return users[id] || null;
      }
    });
  });
  
  bot.action('contact_admin_direct', async (ctx) => {
    await depositFunds.handleContactAdminDirect(ctx);
  });
  
  bot.action('check_balance', async (ctx) => {
    await depositFunds.handleCheckBalance(ctx, {
      findById: async (id) => {
        const users = getUsers();
        return users[id] || null;
      }
    }, virtualAccounts);
  });
  
  bot.action('view_my_account', async (ctx) => {
    await depositFunds.handleViewMyAccount(ctx, {
      findById: async (id) => {
        const users = getUsers();
        return users[id] || null;
      }
    }, virtualAccounts);
  });
  
  bot.action('force_new_account', async (ctx) => {
    await depositFunds.handleForceNewAccount(ctx, {
      findById: async (id) => {
        const users = getUsers();
        return users[id] || null;
      }
    }, virtualAccounts, bot);
  });
  
  bot.action('retrieve_account', async (ctx) => {
    await depositFunds.handleRetrieveAccount(ctx, {
      findById: async (id) => {
        const users = getUsers();
        return users[id] || null;
      }
    }, virtualAccounts, bot);
  });
  
  // Admin Callbacks
  bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    const users = getUsers();
    const total = Object.keys(users).length;
    await ctx.reply(`👥 USERS\n\nTotal users: ${total}`);
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_quick_credit', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    await ctx.reply('💰 Use command: /credituser [user_id] [amount] [reason]');
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_transaction_tracking', async (ctx) => {
    await handleAdminTransactionTracking(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_kyc', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    await ctx.reply('🛂 KYC Approvals\n\nUse /searchuser to find users');
    await ctx.answerCbQuery();
  });
  
  bot.action('no_action', ctx => ctx.answerCbQuery());
}

// ====================================================================
// SECTION 8: WEBHOOK SETUP
// ====================================================================
async function setupWebhook(bot, webhookUrl) {
  try {
    await bot.telegram.deleteWebhook();
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook configured: ${webhookUrl}`);
    return true;
  } catch (error) {
    console.error('❌ Webhook failed:', error.message);
    return false;
  }
}

// ====================================================================
// SECTION 9: BOT LIFECYCLE MANAGEMENT
// ====================================================================
async function stopBot() {
  console.log('🛑 Stopping bot...');
  if (botInstance) await botInstance.stop();
  if (serverInstance) serverInstance.close();
}

async function getBotInfo() {
  if (!botInstance) return null;
  const me = await botInstance.telegram.getMe();
  return { username: me.username, id: me.id };
}

// ====================================================================
// SECTION 10: MAIN LAUNCH FUNCTION
// ====================================================================
async function launchBot(useWebhook = false) {
  try {
    botInstance = await createBot();
    const app = setupExpressServer(botInstance);
    await setupCommands(botInstance);
    await setupMenuHandlers(botInstance);
    await setupCallbackHandlers(botInstance);
    
    // ================================================================
    // SECTION 10.1: TEXT HANDLER - PROPER ORDER
    // ================================================================
    botInstance.on('text', async (ctx) => {
      const text = ctx.message.text.trim();
      
      if (text.startsWith('/')) return;
      
      const userId = ctx.from.id.toString();
      console.log(`📝 Text: "${text}" from ${userId}`);

      // 1. UPGRADE RECOVERY (HIGHEST PRIORITY)
      const recoverySession = await getUpgradeSession(userId);
      if (recoverySession && recoverySession.action === 'upgrade_recovery') {
        console.log(`🔄 Upgrade recovery active`);
        await processRecoveryInput(ctx, text);
        return;
      }

      // 2. DEPOSIT SESSION
      const depositSession = depositFunds.sessionManager.getSession(userId);
      if (depositSession && (depositSession.action === 'collect_email' || depositSession.action === 'collect_phone')) {
        console.log(`💰 Deposit session active`);
        await depositFunds.handleDepositText(ctx, text, {
          findById: async (id) => {
            const users = getUsers();
            return users[id] || null;
          },
          update: async (id, data) => {
            const users = getUsers();
            if (users[id]) {
              Object.assign(users[id], data);
              setUsers(users);
              await saveAllData();
              return true;
            }
            return false;
          }
        }, virtualAccounts);
        return;
      }
      
      // 3. SENDMONEY SESSION
      const sendMoneySession = sendMoney.sessionManager.getSession(userId);
      if (sendMoneySession) {
        console.log(`💸 SendMoney session active`);
        const handled = await sendMoney.handleText(ctx, text, getUsers(), getTransactions());
        if (handled) {
          await saveAllData();
          return;
        }
      }
      
      // 4. REGULAR HANDLER
      console.log(`ℹ️ No active session`);
      await handleTextMessage(ctx, text);
    });
    
    botInstance.catch((err, ctx) => {
      console.error('❌ Global Error:', err);
      ctx.reply('❌ An error occurred. Please try again.').catch(() => {});
    });
    
    const PORT = process.env.PORT || 3000;
    serverInstance = app.listen(PORT, '0.0.0.0', () => {
      console.log(`📡 Server running on port ${PORT}`);
    });
    
    await botInstance.telegram.deleteWebhook();
    
    if (useWebhook || process.env.NODE_ENV === 'production') {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      await setupWebhook(botInstance, `${baseUrl}/webhook`);
    } else {
      await botInstance.launch();
      console.log('✅ Bot running in DEVELOPMENT mode');
    }
    
    console.log(`✅ Bot started successfully!`);
    return botInstance;
  } catch (error) {
    console.error('❌ Failed to launch bot:', error);
    throw error;
  }
}

// ====================================================================
// SECTION 11: EXPORTS
// ====================================================================
module.exports = { 
  launchBot,
  stopBot,
  getBotInfo,
  setupWebhook,
  bot: botInstance
};
