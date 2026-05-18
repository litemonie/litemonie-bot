// ====================================================================
// SECTION 1: BOT-CORE.JS - MAIN BOT INITIALIZATION
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
const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const { CONFIG } = require('./config');
const { initStorage, loadData, setupAutoSave, saveAllData, recordTransaction, getUsers, setUsers, getSessions, setSessions, getTransactions } = require('./database');
const { initUser, isAdmin, formatCurrency, escapeMarkdownV2 } = require('./utils');
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
  addUpgradeButtonToMenu,
  getUpgradeSession
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
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.get('/ping', (req, res) => res.send('pong'));
  app.post('/test-webhook', (req, res) => res.status(200).json({ received: true, timestamp: new Date().toISOString() }));
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
  const { Markup } = require('telegraf');
  
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
      `🌟 Welcome to Liteway VTU Bot!\n\n🛂 KYC: ${(user.kycStatus || 'pending').toUpperCase()}\n💵 Wallet: ${formatCurrency(user.wallet)}`,
      { parse_mode: 'Markdown', ...Markup.keyboard(keyboard).resize() }
    );
  });

  bot.command('setpin', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('❌ Usage: /setpin [4 digits]');
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
// SECTION 6: MENU HANDLERS
// ====================================================================
async function setupMenuHandlers(bot) {
  const { checkKYCAndPIN, initUser } = require('./utils');
  const { Markup } = require('telegraf');
  
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

  bot.hears('🔄 Restore My Account', async (ctx) => {
    await handleRestoreButton(ctx);
  });

  bot.hears('💰 Wallet Balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    await ctx.reply(`💰 Your balance: ${formatCurrency(user.wallet)}`);
  });
  
  bot.hears('👤 Profile', async (ctx) => {
    await showProfile(ctx);
  });
  
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
}

// ====================================================================
// SECTION 7: CALLBACK HANDLERS
// ====================================================================
async function setupCallbackHandlers(bot) {
  const { Markup } = require('telegraf');
  
  bot.action('bank_transfer', async (ctx) => {
    await sendMoney.handleSendMoney(ctx, { ...getUsers(), ...userMethods }, transactionMethods);
    await ctx.answerCbQuery();
  });
  
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
      `🌟 Welcome to Liteway VTU Bot!\n\n🛂 KYC: ${(user.kycStatus || 'pending').toUpperCase()}\n💵 Wallet: ${formatCurrency(user.wallet)}`,
      { parse_mode: 'Markdown', ...Markup.keyboard(keyboard).resize() }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action('upgrade_recovery', async (ctx) => {
    await handleUpgradeRecovery(ctx);
    await ctx.answerCbQuery();
  });

  bot.action('cancel_recovery', async (ctx) => {
    await handleCancelRecovery(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('no_action', ctx => ctx.answerCbQuery());
  
  // Deposit callbacks
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
    
    // TEXT HANDLER
    botInstance.on('text', async (ctx) => {
      const text = ctx.message.text.trim();
      if (text.startsWith('/')) return;
      
      const userId = ctx.from.id.toString();
      console.log(`📝 Handling text: "${text}" for user ${userId}`);

      const depositSession = depositFunds.sessionManager.getSession(userId);
      if (depositSession && (depositSession.action === 'collect_email' || depositSession.action === 'collect_phone')) {
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
      
      const sendMoneySession = sendMoney.sessionManager.getSession(userId);
      if (sendMoneySession) {
        const handled = await sendMoney.handleText(ctx, text, getUsers(), getTransactions());
        if (handled) {
          await saveAllData();
          return;
        }
      }
      
      const recoverySession = await getUpgradeSession(userId);
      if (recoverySession && recoverySession.action === 'upgrade_recovery') {
        await processRecoveryInput(ctx, text);
        return;
      }
      
      await handleTextMessage(ctx, text);
    });
    
    botInstance.catch((err, ctx) => {
      console.error('❌ Global Error:', err);
      ctx.reply('❌ An error occurred').catch(() => {});
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
