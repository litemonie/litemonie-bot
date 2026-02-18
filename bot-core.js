// ==================== BOT-CORE.JS ====================
// Bot initialization, server setup, launch
// PRODUCTION READY - WITH RENDER/WEBHOOK SUPPORT & DEBUG ENDPOINTS
// =====================================================

const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const { CONFIG } = require('./config');
const { initStorage, loadData, setupAutoSave, saveAllData, recordTransaction } = require('./database');
const { initUser, isAdmin, formatCurrency, escapeMarkdownV2 } = require('./utils');
const { initializeDeviceHandler, getDeviceHandler, getDeviceCallbacks, getDeviceLockApp, getMiniAppCallbacks } = require('./device-system');
const { systemTransactionManager, analyticsManager } = require('./transaction-system');
const {
  userMethods, transactionMethods, virtualAccounts, sessionManager,
  handleAdminTransactionTracking, handleSearchTransactionById,
  handleViewApiTransactions, handleViewAllTransactions, handleViewFailedTransactions,
  handleAdvancedSearch, handleTextMessage
} = require('./handlers');

// Import feature modules for callbacks
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

// Global bot instance
let botInstance = null;
let serverInstance = null;

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

async function createBot() {
  console.log('🚀 Creating bot instance...');
  
  if (!process.env.BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not set');
    process.exit(1);
  }
  
  const bot = new Telegraf(process.env.BOT_TOKEN);
  
  // ========== FETCH AND CACHE BOT USERNAME ==========
  try {
    console.log('🔍 Fetching bot username from Telegram API...');
    const botInfo = await bot.telegram.getMe();
    bot.options = bot.options || {};
    bot.options.username = botInfo.username;
    bot.botInfo = botInfo;
    console.log(`✅ Bot username set to: @${botInfo.username}`);
  } catch (error) {
    console.error('❌ Could not fetch bot username:', error.message);
    
    // Better error handling for 404
    if (error.code === 404 || (error.response && error.response.error_code === 404)) {
      console.error('\n🔴 CRITICAL: Bot token is invalid or bot does not exist!');
      console.error('Please check:');
      console.error('1. BOT_TOKEN environment variable is set correctly in Render dashboard');
      console.error('2. The bot exists on Telegram (check with @BotFather)');
      console.error('3. No hidden characters in the token');
      console.error('\nCurrent BOT_TOKEN starts with:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 5) + '...' : 'NOT SET');
      process.exit(1);
    }
    
    console.warn('⚠️ Using fallback username - UPDATE THIS!');
    bot.options = bot.options || {};
    bot.options.username = 'litewaydatabot'; // Your actual bot username
  }
  
  // Initialize systems
  await initStorage();
  await loadData();
  await initializeDeviceHandler(bot);
  setupAutoSave();
  
  return bot;
}

// ========== SETUP EXPRESS SERVER WITH PRODUCTION CONFIG ==========
function setupExpressServer(bot) {
  const app = express();
  
  // Middleware
  app.use(express.json());
  
  // Trust proxy for Render (important for webhooks)
  app.set('trust proxy', true);

  // ========== PRODUCTION CORS CONFIGURATION ==========
  app.use((req, res, next) => {
    // List of allowed origins (your Mini App URLs)
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
      // For development, allow all (but restrict in production)
      res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, ngrok-skip-browser-warning');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // ========== DEBUG ENDPOINTS ==========
  // Simple ping endpoint
  app.get('/ping', (req, res) => {
    console.log('📡 Ping received!');
    res.send('pong');
  });

  // Test webhook endpoint
  app.post('/test-webhook', (req, res) => {
    console.log('🧪 Test webhook received!');
    console.log('Body:', JSON.stringify(req.body));
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      body: req.body 
    });
  });

  // ========== HEALTH CHECK ENDPOINTS FOR RENDER ==========
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      bot: bot.options?.username || 'unknown',
      version: '1.0.0'
    });
  });

  app.get('/', (req, res) => {
    res.status(200).json({
      message: '🚀 Litemonie Bot is running!',
      docs: {
        health: '/health',
        ping: '/ping',
        api: '/api/device-data',
        botInfo: '/bot-info',
        webhook: '/webhook',
        testWebhook: '/test-webhook'
      },
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/bot-info', async (req, res) => {
    try {
      res.status(200).json({
        username: bot.options?.username,
        isRunning: true,
        uptime: process.uptime(),
        webhook: process.env.NODE_ENV === 'production' ? await bot.telegram.getWebhookInfo() : null
      });
    } catch (error) {
      res.status(500).json({ error: 'Bot info unavailable', message: error.message });
    }
  });

  // ========== WEBHOOK ENDPOINT FOR TELEGRAM ==========
  app.post('/webhook', (req, res) => {
    console.log('📩 WEBHOOK RECEIVED AT:', new Date().toISOString());
    console.log('📦 Update ID:', req.body?.update_id);
    console.log('💬 Message:', req.body?.message?.text);
    console.log('👤 From:', req.body?.message?.from?.id, req.body?.message?.from?.first_name);
    
    try {
      // Process update with Telegraf
      bot.handleUpdate(req.body, (err, result) => {
        if (err) {
          console.error('❌ Bot handleUpdate error:', err);
          // Always return 200 to Telegram
          res.status(200).send('OK');
        } else {
          console.log('✅ Update handled successfully');
          res.status(200).send('OK');
        }
      });
    } catch (error) {
      console.error('❌ Webhook error:', error);
      // CRITICAL: Always return 200 to Telegram so it doesn't keep retrying
      res.status(200).send('OK');
    }
  });

  // ========== DEPOSIT WEBHOOK ==========
  try {
    const usersForDeposit = { ...require('./database').getUsers(), ...userMethods };
    depositFunds.setupDepositHandlers(bot, usersForDeposit, virtualAccounts);
    console.log('✅ Deposit handlers setup');
  } catch (error) {
    console.error('❌ Deposit handlers failed:', error);
  }
  
  app.post('/billstack-webhook', depositFunds.handleBillstackWebhook(
    bot, 
    require('./database').getUsers(), 
    require('./database').getTransactions(), 
    virtualAccounts
  ));
  
  // ========== MINI APP API ENDPOINTS ==========
  app.get('/api/device-data', async (req, res) => {
    try {
      const { sessionId, token } = req.query;
      console.log(`📡 API Request: /api/device-data - Session: ${sessionId?.substring(0, 8)}...`);
      
      const deviceLockApp = getDeviceLockApp();
      if (!deviceLockApp) {
        return res.status(500).json({ 
          success: false, 
          error: 'Device Lock App not initialized' 
        });
      }
      
      const data = await deviceLockApp.getDeviceData(sessionId, token);
      res.json(data);
    } catch (error) {
      console.error('❌ API Error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  app.post('/api/request-unlock', express.json(), async (req, res) => {
    try {
      const { sessionId, token, imei } = req.body;
      console.log(`📡 API Request: /api/request-unlock - IMEI: ${imei?.substring(0, 8)}...`);
      
      const deviceLockApp = getDeviceLockApp();
      if (!deviceLockApp) {
        return res.status(500).json({ 
          success: false, 
          error: 'Device Lock App not initialized' 
        });
      }
      
      const result = await deviceLockApp.requestDeviceUnlock(sessionId, token, imei);
      res.json(result);
    } catch (error) {
      console.error('❌ API Error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      time: new Date().toISOString(),
      bot: bot.options?.username 
    });
  });

  console.log('✅ Mini App API endpoints registered');
  console.log(`   GET  /api/device-data - Get device data`);
  console.log(`   POST /api/request-unlock - Request device unlock`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   POST /webhook - Telegram webhook`);
  console.log(`   GET  /ping - Debug ping`);
  console.log(`   POST /test-webhook - Test webhook endpoint`);

  return app;
}

async function setupCommands(bot) {
  const { getUsers, getSessions, getTransactions, setSessions } = require('./database');
  const { isAdmin, formatCurrency, escapeMarkdownV2, isValidEmail } = require('./utils');
  const { Markup } = require('telegraf');
  
  // ========== START COMMAND WITH MINI APP PAYLOAD HANDLING ==========
  bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const isUserAdmin = isAdmin(userId);
    
    // CAPTURE MINI APP START PAYLOAD
    const startPayload = ctx.startPayload;
    console.log(`🚀 /start from user ${userId} | Payload: ${startPayload || 'none'}`);
    
    // CHECK IF THIS IS FROM MINI APP
    if (startPayload && startPayload.includes('session=')) {
      console.log(`📱 Mini App deep link detected for user ${userId}`);
      
      const deviceLockApp = getDeviceLockApp();
      if (deviceLockApp) {
        try {
          await ctx.reply('📱 <b>Opening Device Lock App...</b>\n\nPlease wait...', { 
            parse_mode: 'HTML' 
          });
          
          const result = await deviceLockApp.generateMiniAppLink(userId);
          
          if (result.success) {
            await ctx.reply(
              `📱 <b>Device Lock App</b>\n\n` +
              `Click the button below to open your device management portal:`,
              {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                  [Markup.button.url('📱 OPEN MINI APP', result.miniAppUrl)],
                  [Markup.button.callback('🔄 Refresh Link', 'refresh_miniapp_link')]
                ])
              }
            );
          }
        } catch (error) {
          console.error('❌ Error handling mini app start:', error);
        }
        return;
      }
    }
    
    // NORMAL START COMMAND
    if (!user.firstName) {
      user.firstName = ctx.from.first_name || '';
      user.lastName = ctx.from.last_name || '';
      user.username = ctx.from.username || null;
      require('./database').setUsers(getUsers());
      await saveAllData();
    }
    
    const keyboard = isUserAdmin ? [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '🛠️ Admin Panel', '🆘 Help & Support']
    ] : [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '🆘 Help & Support']
    ];
    
    await ctx.reply(
      `🌟 \\*Welcome to Liteway VTU Bot\\!\\*\n\n` +
      `🛂 \\*KYC Status\\:* ${escapeMarkdownV2((user.kycStatus || 'pending').toUpperCase())}\n` +
      `💵 \\*Wallet Balance\\:* ${formatCurrency(user.wallet)}\n\n` +
      `📱 \\*Available Services\\:*\n` +
      `• 📱 Device Financing\n• 📺 TV Subscription\n• 💡 Electricity Bill\n` +
      `• 📞 Buy Airtime\n• 📡 Buy Data\n• 🎫 Card Pins\n• 📝 Exam Pins\n` +
      `• 🏦 Money Transfer\n• 💰 Wallet Balance\n• 💳 Deposit Funds\n` +
      `• 📜 Transaction History\n• 🛂 KYC Status\n` +
      `${isUserAdmin ? '• 🛠️ Admin Panel\n' : ''}• 🆘 Help & Support\n\n` +
      `📞 \\*Support\\:* @opuenekeke`,
      { parse_mode: 'MarkdownV2', ...Markup.keyboard(keyboard).resize() }
    );
  });
  
  // ========== ADMIN CREDIT USER COMMAND (FIXED) ==========
  bot.command('credituser', async (ctx) => {
    const adminId = ctx.from.id.toString();
    if (!isAdmin(adminId)) {
      return ctx.reply('❌ *Admin only*', { parse_mode: 'MarkdownV2' });
    }

    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      return ctx.reply(
        '❌ *Usage:* `/credituser [user_id] [amount] [reason]`\n\n' +
        '*Examples:*\n' +
        '`/credituser 123456789 1000 Welcome bonus`\n' +
        '`/credituser 123456789 500`',
        { parse_mode: 'MarkdownV2' }
      );
    }

    const targetUserId = args[0];
    const amount = parseFloat(args[1]);
    const reason = args.slice(2).join(' ') || 'Manual credit by admin';

    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Please enter a valid positive amount', { parse_mode: 'MarkdownV2' });
    }

    const users = getUsers();
    
    if (!users[targetUserId]) {
      return ctx.reply('❌ User not found', { parse_mode: 'MarkdownV2' });
    }

    const targetUser = users[targetUserId];
    const userName = `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || 'Unknown';
    
    // Store credit data in session instead of passing through callback
    const sessions = getSessions();
    const creditId = `credit_${Date.now()}`;
    sessions[creditId] = {
      adminId: adminId,
      targetUserId: targetUserId,
      amount: amount,
      reason: reason,
      timestamp: Date.now()
    };
    setSessions(sessions);
    
    await ctx.reply(
      `⚠️ *CONFIRM CREDIT*\n\n` +
      `👤 *User:* ${escapeMarkdownV2(userName)}\n` +
      `🆔 *User ID:* \`${targetUserId}\`\n` +
      `💰 *Amount:* ${formatCurrency(amount)}\n` +
      `📝 *Reason:* ${escapeMarkdownV2(reason)}\n\n` +
      `💵 *Current Balance:* ${formatCurrency(targetUser.wallet || 0)}\n` +
      `💵 *New Balance:* ${formatCurrency((targetUser.wallet || 0) + amount)}`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ CONFIRM CREDIT', `confirm_credit:${creditId}`),
            Markup.button.callback('❌ CANCEL', 'cancel_credit')
          ]
        ])
      }
    );
  });

  // ========== SEARCH USER COMMAND ==========
  bot.command('searchuser', async (ctx) => {
    const adminId = ctx.from.id.toString();
    if (!isAdmin(adminId)) {
      return ctx.reply('❌ *Admin only*', { parse_mode: 'MarkdownV2' });
    }

    const searchTerm = ctx.message.text.split(' ').slice(1).join(' ').toLowerCase();
    
    if (!searchTerm) {
      return ctx.reply(
        '❌ *Usage:* `/searchuser [name|username|phone|id]`\n\n' +
        '*Examples:*\n' +
        '`/searchuser John`\n' +
        '`/searchuser 123456789`',
        { parse_mode: 'MarkdownV2' }
      );
    }

    const users = getUsers();
    const results = [];
    
    for (const [userId, userData] of Object.entries(users)) {
      const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.toLowerCase();
      const username = userData.username?.toLowerCase() || '';
      const phone = userData.phone?.toLowerCase() || '';
      
      if (userId.includes(searchTerm) || 
          fullName.includes(searchTerm) || 
          username.includes(searchTerm) || 
          phone.includes(searchTerm)) {
        results.push({ userId, ...userData });
      }
      
      if (results.length >= 10) break;
    }
    
    if (results.length === 0) {
      return ctx.reply('❌ No users found', { parse_mode: 'MarkdownV2' });
    }
    
    let message = `🔍 *SEARCH RESULTS:* ${results.length} users\n\n`;
    
    results.forEach((user, index) => {
      message += `${index + 1}. *${escapeMarkdownV2(user.firstName || '')} ${escapeMarkdownV2(user.lastName || '')}*\n`;
      message += `   🆔 ID: \`${user.userId}\`\n`;
      if (user.username) message += `   📱 @${escapeMarkdownV2(user.username)}\n`;
      if (user.phone) message += `   📞 ${escapeMarkdownV2(user.phone)}\n`;
      message += `   💰 Balance: ${formatCurrency(user.wallet || 0)}\n`;
      message += `   🛂 KYC: ${user.kycStatus || 'pending'}\n\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });
  
  // ========== MINI APP COMMANDS ==========
  bot.command('app', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    const deviceLockApp = getDeviceLockApp();
    if (!deviceLockApp) {
      return ctx.reply('📱 \\*DEVICE LOCK APP\\*\n\n❌ \\*System Not Ready\\*', { parse_mode: 'MarkdownV2' });
    }
    await deviceLockApp.handleMiniAppCommand(ctx);
  });

  bot.command('status', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System not ready', { parse_mode: 'MarkdownV2' });
    
    deviceHandler.users = getUsers();
    const installments = await deviceHandler.getUserInstallments(userId);
    
    if (installments.length === 0) {
      return ctx.reply('📱 \\*DEVICE STATUS\\*\n\nYou have no active devices.', {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([[Markup.button.callback('📱 Browse Devices', 'device_view_devices')]])
      });
    }
    
    let message = `📱 \\*YOUR DEVICES STATUS\\*\n\n`;
    installments.forEach((inst, i) => {
      message += `\\*${i+1}\\. ${inst.deviceMake} ${inst.deviceModel}\\*\n`;
      message += `   🆔 ID: ${inst.id}\n   📱 Status: ${inst.status.toUpperCase()}\n`;
      message += `   🔒 IMEI: ${inst.imeiStatus || 'Pending'}\n`;
      message += `   💰 Paid: ${inst.installmentsPaid}/${inst.totalInstallments + 1}\n\n`;
    });
    
    await ctx.reply(message, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([[Markup.button.callback('📱 Open App', 'device_mini_app')]])
    });
  });

  bot.command('unlock', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System not ready', { parse_mode: 'MarkdownV2' });
    
    deviceHandler.users = getUsers();
    const imeiMappings = await deviceHandler.getUserIMEIMappings(userId);
    const lockedDevices = imeiMappings.filter(m => m.imeiStatus === 'locked');
    
    if (lockedDevices.length === 0) {
      return ctx.reply('🔓 \\*DEVICE UNLOCK\\*\n\nNo locked devices.', { parse_mode: 'MarkdownV2' });
    }
    
    let message = `🔓 \\*LOCKED DEVICES\\*\n\n`;
    lockedDevices.forEach((m, i) => {
      message += `\\*${i+1}\\. ${m.deviceMake} ${m.deviceModel}\\*\n`;
      message += `   📱 IMEI: ${m.imei}\n   🆔 ID: ${m.installmentId}\n\n`;
    });
    
    const buttons = lockedDevices.map(m => [Markup.button.callback(`🔓 Unlock ${m.deviceMake}`, `request_unlock_${m.imei}`)]);
    buttons.push([Markup.button.callback('📱 Open App', 'device_mini_app')]);
    
    await ctx.reply(message, { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) });
  });
  
  // ========== TRANSACTION COMMANDS ==========
  bot.command('transactions', handleAdminTransactionTracking);
  bot.command('failedtransactions', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString())) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    await handleViewFailedTransactions(ctx);
  });
  
  bot.command('todaysales', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    
    const stats = systemTransactionManager.getTransactionStats();
    await ctx.reply(`📅 \\*TODAY\\'S SALES\\*\n\n💰 Amount: ${formatCurrency(stats.todayAmount)}\n📊 Count: ${stats.today}`, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([[Markup.button.callback('📊 Details', 'admin_view_today_transactions')]])
    });
  });
  
  bot.command('transactionstats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    
    const stats = systemTransactionManager.getTransactionStats();
    await ctx.reply(
      `📈 \\*TRANSACTION STATS\\*\n\n` +
      `📊 Total: ${stats.total}\n✅ Completed: ${stats.completed}\n` +
      `❌ Failed: ${stats.failed}\n⏳ Pending: ${stats.pending}\n` +
      `💰 Total Amount: ${formatCurrency(stats.totalAmount)}`,
      { parse_mode: 'MarkdownV2' }
    );
  });
  
  bot.command('analytics', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    
    const report = analyticsManager.getAnalyticsReport('daily');
    await ctx.reply(
      `📊 \\*ANALYTICS DASHBOARD\\*\n\n` +
      `📅 Today: ${report.summary.totalTransactions || 0} transactions\n` +
      `💰 Revenue: ${formatCurrency(report.summary.totalAmount || 0)}`,
      { parse_mode: 'MarkdownV2' }
    );
  });
  
  // ========== KORA API TEST COMMAND (FIXED) ==========
  bot.command('testkora', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
      return ctx.reply('❌ *Admin only*', { parse_mode: 'MarkdownV2' });
    }
    
    const { testKoraConnection } = require('./app/sendmoney');
    
    const msg = await ctx.reply('🔄 Testing Kora API connection...');
    
    try {
      const result = await testKoraConnection();
      
      if (result.success) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          msg.message_id,
          null,
          '✅ *KORA API CONNECTION SUCCESSFUL*\n\n' +
          'Your API key is working correctly!',
          { parse_mode: 'MarkdownV2' }
        );
      } else {
        const errorMessage = `❌ *KORA API CONNECTION FAILED*\n\n` +
          `*Error:* ${escapeMarkdownV2(result.message)}\n\n` +
          `Please check your KORA_API_KEY in the .env file.`;
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          msg.message_id,
          null,
          errorMessage,
          { parse_mode: 'MarkdownV2' }
        );
      }
    } catch (error) {
      const errorMessage = `❌ *KORA API ERROR*\n\n${escapeMarkdownV2(error.message)}`;
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        msg.message_id,
        null,
        errorMessage,
        { parse_mode: 'MarkdownV2' }
      );
    }
  });
  
  // ========== BASIC COMMANDS ==========
  bot.command('setpin', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const args = ctx.message.text.split(' ');
    
    if (args.length !== 2) return ctx.reply('❌ Usage: /setpin [4 digits]', { parse_mode: 'MarkdownV2' });
    if (!/^\d{4}$/.test(args[1])) return ctx.reply('❌ PIN must be 4 digits', { parse_mode: 'MarkdownV2' });
    
    user.pin = args[1];
    user.pinAttempts = 0;
    user.pinLocked = false;
    require('./database').setUsers(getUsers());
    await saveAllData();
    
    await ctx.reply('✅ PIN set successfully!', { parse_mode: 'MarkdownV2' });
  });
  
  bot.command('balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    await ctx.reply(`💰 \\*YOUR WALLET BALANCE\\*\n\n💵 Available: ${formatCurrency(user.wallet)}`, { parse_mode: 'MarkdownV2' });
  });
  
  bot.command('devices', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System not ready', { parse_mode: 'MarkdownV2' });
    deviceHandler.users = getUsers();
    await deviceHandler.handleDeviceMenu(ctx);
  });
  
  // ========== DEVICE ADMIN COMMANDS ==========
  bot.command('adddevice', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString())) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System not ready', { parse_mode: 'MarkdownV2' });
    deviceHandler.users = getUsers();
    await deviceHandler.handleAdminAddDevice(ctx, ctx.message.text.split(' ').slice(1).join(' '));
  });
  
  bot.command('addinventory', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString())) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System not ready', { parse_mode: 'MarkdownV2' });
    deviceHandler.users = getUsers();
    await deviceHandler.handleAdminAddInventory(ctx, ctx.message.text.split(' ').slice(1).join(' '));
  });
  
  bot.command('addmarketer', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString())) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System not ready', { parse_mode: 'MarkdownV2' });
    deviceHandler.users = getUsers();
    await deviceHandler.handleAdminAddMarketer(ctx, ctx.message.text.split(' ').slice(1).join(' '));
  });
  
  bot.command('removedevice', async (ctx) => {
    if (!isAdmin(ctx.from.id.toString())) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System not ready', { parse_mode: 'MarkdownV2' });
    deviceHandler.users = getUsers();
    await deviceHandler.handleAdminRemoveDevice(ctx, ctx.message.text.split(' ').slice(1).join(' '));
  });
}

async function setupMenuHandlers(bot) {
  const { getUsers, getSessions, getTransactions } = require('./database');
  const { checkKYCAndPIN, formatCurrency, escapeMarkdownV2, isValidEmail, initUser } = require('./utils');
  const { Markup } = require('telegraf');
  const { getDeviceHandler, getDeviceLockApp } = require('./device-system');
  const { userMethods, virtualAccounts, sessionManager } = require('./handlers');
  
  // Import feature modules
  const buyAirtime = require('./app/buyAirtime');
  const buyData = require('./app/buyData');
  const depositFunds = require('./app/depositFunds');
  const transactionHistory = require('./app/transactionHistory');
  const sendMoney = require('./app/sendmoney');
  const buyTVSubscription = require('./app/Bill/tv');
  const buyElectricity = require('./app/Bill/light');
  const buyExamPins = require('./app/Bill/exam');
  const buyCardPins = require('./app/Card pins/buyCardPins');
  
  // Menu handlers
  bot.hears('📱 Device Financing', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    
    const deviceHandler = getDeviceHandler();
    if (!deviceHandler) return ctx.reply('❌ System error', { parse_mode: 'MarkdownV2' });
    
    deviceHandler.users = getUsers();
    const user = getUsers()[userId];
    const installments = await deviceHandler.getUserInstallments(userId);
    const imeiMappings = await deviceHandler.getUserIMEIMappings(userId);
    
    await ctx.reply(
      `📱 \\*DEVICE FINANCING\\*\n\n` +
      `💵 Wallet: ${formatCurrency(user.wallet)}\n` +
      `📱 Active: ${installments.length}\n` +
      `🔒 Locked: ${imeiMappings.filter(m => m.imeiStatus === 'locked').length}\n\n` +
      `👇 Select an option:`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('📱 Browse Devices', 'device_view_devices')],
        [Markup.button.callback('🚀 Open Mini App', 'device_mini_app')],
        [Markup.button.callback('📋 My Installments', 'device_my_installments')],
        [Markup.button.callback('💰 Make Payment', 'device_make_payment')],
        [Markup.button.callback('🏠 Home', 'start')]
      ]) }
    );
  });
  
  bot.hears('📺 TV Subscription', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyTVSubscription.handleTVSubscription(ctx, getUsers(), sessionManager, require('./config').CONFIG);
  });
  
  bot.hears('💡 Electricity Bill', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyElectricity.handleElectricity(ctx, getUsers(), sessionManager, require('./config').CONFIG);
  });
  
  bot.hears('📞 Buy Airtime', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyAirtime.handleAirtime(ctx, getUsers(), getSessions(), require('./config').CONFIG, require('./config').NETWORK_CODES);
  });
  
  bot.hears('📡 Buy Data', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyData.handleData(ctx, getUsers(), sessionManager, require('./config').CONFIG, require('./config').NETWORK_CODES);
  });
  
  bot.hears('🎫 Card Pins', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyCardPins.handleCardPinsMenu(ctx, getUsers(), sessionManager, require('./config').CONFIG);
  });
  
  bot.hears('📝 Exam Pins', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    await buyExamPins.handleExamPins(ctx, getUsers(), sessionManager, require('./config').CONFIG);
  });
  
  bot.hears('⚡ Lite Light', async (ctx) => {
    await ctx.reply('⚡ \\*LITE LIGHT\\*\n\n🚧 Coming Soon!', { parse_mode: 'MarkdownV2' });
  });
  
  bot.hears('🏦 Money Transfer', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    if (!await checkKYCAndPIN(userId, ctx)) return;
    
    await ctx.reply(
      '🏦 \\*SEND MONEY\\*\n\n💸 Choose transfer method:\n\n🏦 BANK\n📱 LITEMONIE',
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('🏦 BANK TRANSFER', 'bank_transfer')],
        [Markup.button.callback('📱 LITEMONIE', 'litemonie_transfer')],
        [Markup.button.callback('🏠 Home', 'start')]
      ]) }
    );
  });
  
  bot.hears('💰 Wallet Balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    await ctx.reply(`💰 \\*YOUR WALLET BALANCE\\*\n\n💵 Available: ${formatCurrency(user.wallet)}`, { parse_mode: 'MarkdownV2' });
  });
  
  bot.hears('💳 Deposit Funds', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    
    if ((user.kycStatus || 'pending') !== 'approved') {
      return ctx.reply('❌ KYC verification required', { parse_mode: 'MarkdownV2' });
    }
    
    await depositFunds.handleDeposit(ctx, { ...getUsers(), ...userMethods }, virtualAccounts);
  });
  
  bot.hears('📜 Transaction History', async (ctx) => {
    const userId = ctx.from.id.toString();
    await initUser(userId);
    await transactionHistory.handleHistory(ctx, getUsers(), getTransactions(), require('./config').CONFIG);
  });
  
  bot.hears('🛂 KYC Status', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    
    let statusEmoji = { 'approved': '✅', 'rejected': '❌', 'submitted': '📋' }[user.kycStatus] || '⏳';
    
    await ctx.reply(
      `🛂 \\*KYC STATUS\\*\n\n` +
      `👤 User ID: ${userId}\n` +
      `📛 Name: ${escapeMarkdownV2(user.firstName || '')} ${escapeMarkdownV2(user.lastName || '')}\n` +
      `📧 Email: ${escapeMarkdownV2(user.email || 'Not set')}\n` +
      `📱 Phone: ${escapeMarkdownV2(user.phone || 'Not set')}\n\n` +
      `🛂 Status: ${statusEmoji} ${escapeMarkdownV2((user.kycStatus || 'pending').toUpperCase())}`,
      { parse_mode: 'MarkdownV2' }
    );
  });
  
  bot.hears('🛠️ Admin Panel', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!require('./utils').isAdmin(userId)) return ctx.reply('❌ Admin only', { parse_mode: 'MarkdownV2' });
    
    await ctx.reply(
      '🛠️ \\*ADMIN PANEL\\*\n\n👑 Administrator Controls',
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('👥 User Management', 'admin_users')],
        [Markup.button.callback('💰 Credit User', 'admin_quick_credit')],
        [Markup.button.callback('📊 Transaction Tracking', 'admin_transaction_tracking')],
        [Markup.button.callback('📈 Analytics', 'admin_analytics_dashboard')],
        [Markup.button.callback('🛂 KYC Approvals', 'admin_kyc')],
        [Markup.button.callback('💼 Device Admin', 'admin_device_financing')],
        [Markup.button.callback('💰 System Balance', 'admin_balance')],
        [Markup.button.callback('📈 System Stats', 'admin_stats')],
        [Markup.button.callback('🏠 Home', 'start')]
      ]) }
    );
  });
  
  bot.hears('🆘 Help & Support', async (ctx) => {
    await ctx.reply(
      `🆘 \\*HELP & SUPPORT\\*\n\n` +
      `📱 Main Commands:\n` +
      `/start - Start bot\n` +
      `/setpin [1234] - Set PIN\n` +
      `/balance - Check balance\n` +
      `/app - Open Mini App\n` +
      `/status - Device status\n` +
      `/unlock - Request unlock\n` +
      `/credituser - Admin: Credit user\n` +
      `/searchuser - Admin: Search users\n\n` +
      `📞 Support: @opuenekeke`,
      { parse_mode: 'MarkdownV2' }
    );
  });
}

async function setupCallbackHandlers(bot) {
  const { getUsers, getSessions, setSessions, getSystemTransactions, saveAllData } = require('./database');
  const { isAdmin, escapeMarkdownV2, formatCurrency, initUser } = require('./utils');
  const { 
    systemTransactionManager, exportManager, apiResponseManager 
  } = require('./transaction-system');
  const { 
    getDeviceCallbacks, getMiniAppCallbacks, getDeviceHandler, getDeviceLockApp 
  } = require('./device-system');
  const { 
    userMethods, virtualAccounts, handleAdminTransactionTracking,
    handleSearchTransactionById, handleViewApiTransactions,
    handleViewAllTransactions, handleViewFailedTransactions,
    handleAdvancedSearch
  } = require('./handlers');
  const { Markup } = require('telegraf');
  
  // Import feature callbacks
  const buyAirtime = require('./app/buyAirtime');
  const buyData = require('./app/buyData');
  const admin = require('./app/admin');
  const kyc = require('./app/kyc');
  const sendMoney = require('./app/sendmoney');
  const buyCardPins = require('./app/Card pins/buyCardPins');
  const buyExamPins = require('./app/Bill/exam');
  const buyElectricity = require('./app/Bill/light');
  const buyTVSubscription = require('./app/Bill/tv');
  
  // Register module callbacks
  const airtimeCallbacks = buyAirtime.getCallbacks?.(bot, getUsers(), getSessions(), require('./config').CONFIG, require('./config').NETWORK_CODES) || {};
  const dataCallbacks = buyData.getCallbacks?.(bot, getUsers(), require('./handlers').sessionManager, require('./config').CONFIG) || {};
  const adminCallbacks = admin.getCallbacks?.(bot, getUsers(), require('./database').getTransactions(), require('./config').CONFIG) || {};
  const kycCallbacks = kyc.getCallbacks?.(bot, getUsers()) || {};
  const sendMoneyCallbacks = sendMoney.getCallbacks?.(bot, { ...getUsers(), ...userMethods }, require('./handlers').transactionMethods, require('./config').CONFIG) || {};
  const cardPinCallbacks = buyCardPins.getCallbacks?.(bot, getUsers(), require('./handlers').sessionManager, require('./config').CONFIG) || {};
  const examPinCallbacks = buyExamPins.getCallbacks?.(bot, getUsers(), require('./handlers').sessionManager, require('./config').CONFIG) || {};
  const electricityCallbacks = buyElectricity.getCallbacks?.(bot, getUsers(), require('./handlers').sessionManager, require('./config').CONFIG) || {};
  const tvCallbacks = buyTVSubscription.getCallbacks?.(bot, getUsers(), require('./handlers').sessionManager, require('./config').CONFIG) || {};
  
  // Register device callbacks
  const deviceCallbacks = getDeviceCallbacks() || {};
  Object.entries(deviceCallbacks).forEach(([pattern, handler]) => {
    try {
      if (pattern.includes('(') || pattern.includes('.')) {
        bot.action(new RegExp(pattern), handler);
      } else if (pattern.includes(':')) {
        bot.action(new RegExp(`^${pattern.replace(/:\w+/g, '(.+)')}$`), handler);
      } else {
        bot.action(pattern, handler);
      }
    } catch (e) { console.error(`❌ Device callback failed: ${pattern}`, e.message); }
  });
  
  // Register Mini App callbacks
  const miniAppCallbacks = getMiniAppCallbacks() || {};
  Object.entries(miniAppCallbacks).forEach(([pattern, handler]) => {
    try {
      if (pattern.includes('(') || pattern.includes('.')) {
        bot.action(new RegExp(pattern), handler);
      } else {
        bot.action(pattern, handler);
      }
    } catch (e) { console.error(`❌ Mini App callback failed: ${pattern}`, e.message); }
  });
  
  // ========== FIXED ADMIN CREDIT CALLBACKS ==========
  bot.action(/^confirm_credit:(.+)$/, async (ctx) => {
    const adminId = ctx.from.id.toString();
    if (!isAdmin(adminId)) {
      return ctx.answerCbQuery('❌ Admin only');
    }

    const creditId = ctx.match[1];
    const sessions = getSessions();
    const creditData = sessions[creditId];
    
    if (!creditData) {
      await ctx.editMessageText('❌ Credit session expired or invalid. Please try again.');
      return ctx.answerCbQuery();
    }

    // Verify this admin created the credit
    if (creditData.adminId !== adminId) {
      await ctx.editMessageText('❌ You are not authorized to confirm this credit.');
      return ctx.answerCbQuery();
    }

    const { targetUserId, amount, reason } = creditData;
    
    try {
      const users = getUsers();
      
      if (!users[targetUserId]) {
        await ctx.editMessageText('❌ User not found');
        delete sessions[creditId];
        setSessions(sessions);
        return ctx.answerCbQuery();
      }
      
      // Initialize wallet if needed
      if (!users[targetUserId].wallet) users[targetUserId].wallet = 0;
      
      const previousBalance = users[targetUserId].wallet;
      
      // Add the amount
      users[targetUserId].wallet += amount;
      
      // Save users
      require('./database').setUsers(users);
      
      // Record transaction using the database function
      await recordTransaction(targetUserId, {
        type: 'admin_credit',
        amount: amount,
        status: 'completed',
        description: reason,
        previousBalance: previousBalance,
        newBalance: users[targetUserId].wallet,
        metadata: {
          creditedBy: adminId,
          adminUsername: ctx.from.username || 'Unknown',
          adminName: `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim()
        }
      });
      
      await saveAllData();
      
      // Clean up session
      delete sessions[creditId];
      setSessions(sessions);
      
      const userName = `${users[targetUserId].firstName || ''} ${users[targetUserId].lastName || ''}`.trim() || 'Unknown';
      
      await ctx.editMessageText(
        `✅ *CREDIT SUCCESSFUL*\n\n` +
        `👤 *User:* ${escapeMarkdownV2(userName)}\n` +
        `🆔 *ID:* \`${targetUserId}\`\n` +
        `💰 *Amount:* ${formatCurrency(amount)}\n` +
        `📝 *Reason:* ${escapeMarkdownV2(reason)}\n\n` +
        `💵 *Previous Balance:* ${formatCurrency(previousBalance)}\n` +
        `💵 *New Balance:* ${formatCurrency(users[targetUserId].wallet)}`,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Notify user
      try {
        await ctx.telegram.sendMessage(
          targetUserId,
          `💰 *CREDIT ALERT*\n\n` +
          `You have received *${formatCurrency(amount)}* in your wallet!\n\n` +
          `📝 *Reason:* ${escapeMarkdownV2(reason)}\n` +
          `💵 *New Balance:* ${formatCurrency(users[targetUserId].wallet)}`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (e) {
        console.log(`Could not notify user ${targetUserId}`);
      }
      
      await ctx.answerCbQuery('✅ Credit completed');
      
    } catch (error) {
      console.error('❌ Credit error:', error);
      await ctx.editMessageText('❌ Failed to credit user');
      await ctx.answerCbQuery('❌ Failed');
    }
  });

  bot.action('cancel_credit', async (ctx) => {
    await ctx.editMessageText('❌ Credit cancelled');
    await ctx.answerCbQuery();
  });

  bot.action('admin_quick_credit', async (ctx) => {
    const adminId = ctx.from.id.toString();
    if (!isAdmin(adminId)) {
      return ctx.answerCbQuery('❌ Admin only');
    }
    
    await ctx.reply(
      '💰 *MANUAL CREDIT USER*\n\n' +
      'Use command: `/credituser [user_id] [amount] [reason]`\n\n' +
      'Or search user first: /searchuser',
      { parse_mode: 'MarkdownV2' }
    );
    await ctx.answerCbQuery();
  });
  
  // Register other callbacks
  const allCallbacks = {
    ...airtimeCallbacks, ...dataCallbacks, ...adminCallbacks, ...kycCallbacks,
    ...sendMoneyCallbacks, ...cardPinCallbacks, ...examPinCallbacks,
    ...electricityCallbacks, ...tvCallbacks
  };
  
  Object.entries(allCallbacks).forEach(([pattern, handler]) => {
    try {
      if (pattern.includes(':')) {
        bot.action(new RegExp(`^${pattern.replace(/:\w+/g, '(.+)')}$`), handler);
      } else if (pattern.includes('(') || pattern.includes('.')) {
        bot.action(new RegExp(`^${pattern}$`), handler);
      } else {
        bot.action(pattern, handler);
      }
    } catch (e) { console.error(`❌ Callback failed: ${pattern}`, e.message); }
  });
  
  // ========== TRANSACTION TRACKING CALLBACKS ==========
  bot.action('admin_transaction_tracking', async (ctx) => {
    await handleAdminTransactionTracking(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_search_tx_id', async (ctx) => {
    await handleSearchTransactionById(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_advanced_search', async (ctx) => {
    await handleAdvancedSearch(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_quick_export', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    await ctx.reply(
      '📁 \\*QUICK EXPORT\\*\n\nSelect what to export:',
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('📅 Today', 'admin_export_today_menu')],
        [Markup.button.callback('❌ Failed', 'admin_export_failed_menu')],
        [Markup.button.callback('⏳ Pending', 'admin_export_pending_menu')],
        [Markup.button.callback('📡 API Data', 'admin_export_api_menu')],
        [Markup.button.callback('📊 All', 'admin_export_all_menu')],
        [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
      ]) }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_view_all_transactions', async (ctx) => {
    await handleViewAllTransactions(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_view_failed_transactions', async (ctx) => {
    await handleViewFailedTransactions(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_view_pending_transactions', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const pending = systemTransactionManager.searchTransactions({ status: 'pending' });
    let message = `⏳ \\*PENDING TRANSACTIONS\\*\n\n📊 Total: ${pending.length}\n💰 Amount: ${formatCurrency(pending.reduce((s,t)=>s+(t.amount||0),0))}`;
    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_view_api_transactions', async (ctx) => {
    await handleViewApiTransactions(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_view_tx_(.+)$/, async (ctx) => {
    await systemTransactionManager.viewTransactionDetails(ctx, ctx.match[1]);
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_view_api_raw_(.+)$/, async (ctx) => {
    await systemTransactionManager.viewRawApiData(ctx, ctx.match[1]);
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_export_tx_(.+)$/, async (ctx) => {
    const txId = ctx.match[1];
    if (!isAdmin(ctx.from.id.toString())) return ctx.answerCbQuery('❌ Admin only');
    
    await ctx.reply(
      '📁 Select format:',
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 JSON', `admin_export_tx_json_${txId}`)],
        [Markup.button.callback('📄 TEXT', `admin_export_tx_txt_${txId}`)],
        [Markup.button.callback('🏠 Back', `admin_view_tx_${txId}`)]
      ]) }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_export_tx_json_(.+)$/, async (ctx) => {
    const txId = ctx.match[1];
    if (!isAdmin(ctx.from.id.toString())) return ctx.answerCbQuery('❌ Admin only');
    
    await ctx.reply('🔄 Generating JSON...', { parse_mode: 'MarkdownV2' });
    const result = await systemTransactionManager.exportTransaction(txId, 'json');
    await ctx.reply(`✅ Exported: ${path.basename(result.path)}`, { parse_mode: 'MarkdownV2' });
    try { await ctx.replyWithDocument({ source: result.path, filename: path.basename(result.path) }); } catch (e) {}
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_export_tx_txt_(.+)$/, async (ctx) => {
    const txId = ctx.match[1];
    if (!isAdmin(ctx.from.id.toString())) return ctx.answerCbQuery('❌ Admin only');
    
    await ctx.reply('🔄 Generating TEXT...', { parse_mode: 'MarkdownV2' });
    const result = await systemTransactionManager.exportTransaction(txId, 'txt');
    await ctx.reply(`✅ Exported: ${path.basename(result.path)}`, { parse_mode: 'MarkdownV2' });
    try { await ctx.replyWithDocument({ source: result.path, filename: path.basename(result.path) }); } catch (e) {}
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_update_tx_(.+)$/, async (ctx) => {
    const txId = ctx.match[1];
    if (!isAdmin(ctx.from.id.toString())) return ctx.answerCbQuery('❌ Admin only');
    
    await ctx.reply(
      `🔄 Update Status for \`${escapeMarkdownV2(txId)}\`:`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Complete', `admin_update_tx_complete_${txId}`)],
        [Markup.button.callback('❌ Fail', `admin_update_tx_fail_${txId}`)],
        [Markup.button.callback('⏳ Pending', `admin_update_tx_pending_${txId}`)],
        [Markup.button.callback('🏠 Back', `admin_view_tx_${txId}`)]
      ]) }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_update_tx_complete_(.+)$/, async (ctx) => {
    await systemTransactionManager.updateTransactionStatus(ctx, ctx.match[1], 'completed', 'Admin completed');
    await ctx.answerCbQuery('✅ Completed');
  });
  
  bot.action(/^admin_update_tx_fail_(.+)$/, async (ctx) => {
    await systemTransactionManager.updateTransactionStatus(ctx, ctx.match[1], 'failed', 'Admin failed');
    await ctx.answerCbQuery('❌ Failed');
  });
  
  bot.action(/^admin_update_tx_pending_(.+)$/, async (ctx) => {
    await systemTransactionManager.updateTransactionStatus(ctx, ctx.match[1], 'pending', 'Admin set pending');
    await ctx.answerCbQuery('⏳ Pending');
  });
  
  bot.action(/^admin_transactions_page_(\d+)$/, async (ctx) => {
    await handleViewAllTransactions(ctx, parseInt(ctx.match[1]));
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_failed_page_(\d+)$/, async (ctx) => {
    await handleViewFailedTransactions(ctx, parseInt(ctx.match[1]));
    await ctx.answerCbQuery();
  });
  
  bot.action(/^admin_api_page_(\d+)$/, async (ctx) => {
    await handleViewApiTransactions(ctx, parseInt(ctx.match[1]));
    await ctx.answerCbQuery();
  });
  
  // Export menu callbacks
  ['today', 'failed', 'pending', 'api', 'all'].forEach(type => {
    bot.action(`admin_export_${type}_menu`, async (ctx) => {
      await exportManager.quickExport(ctx, type);
      await ctx.answerCbQuery();
    });
    
    ['csv', 'excel', 'json', 'pdf'].forEach(format => {
      bot.action(`admin_export_${type}_${format}`, async (ctx) => {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const filters = sessions[userId]?.exportFilters || {};
        await exportManager.generateExport(ctx, filters, format);
        await ctx.answerCbQuery();
      });
    });
  });
  
  bot.action('admin_export_search', async (ctx) => {
    const userId = ctx.from.id.toString();
    const sessions = getSessions();
    if (!sessions[userId]?.lastSearch) return ctx.answerCbQuery('❌ No search results');
    
    await ctx.reply(
      '📁 Export Results:',
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 JSON', 'admin_export_search_json')],
        [Markup.button.callback('📈 CSV', 'admin_export_search_csv')],
        [Markup.button.callback('📉 Excel', 'admin_export_search_excel')],
        [Markup.button.callback('📋 PDF', 'admin_export_search_pdf')],
        [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
      ]) }
    );
    await ctx.answerCbQuery();
  });
  
  ['json', 'csv', 'excel', 'pdf'].forEach(format => {
    bot.action(`admin_export_search_${format}`, async (ctx) => {
      const userId = ctx.from.id.toString();
      const sessions = getSessions();
      if (!sessions[userId]?.lastSearch) return ctx.answerCbQuery('❌ No search results');
      await exportManager.generateExport(ctx, sessions[userId].lastSearch, format);
      await ctx.answerCbQuery();
    });
  });
  
  // ========== STANDARD ADMIN CALLBACKS ==========
  bot.action('admin_users', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const users = getUsers();
    const total = Object.keys(users).length;
    const kycPending = Object.values(users).filter(u => u.kycStatus === 'pending').length;
    const kycApproved = Object.values(users).filter(u => u.kycStatus === 'approved').length;
    
    await ctx.reply(
      `👥 \\*USER MANAGEMENT\\*\n\n📊 Total: ${total}\n⏳ KYC Pending: ${kycPending}\n✅ KYC Approved: ${kycApproved}`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 KYC Approvals', 'admin_kyc')],
        [Markup.button.callback('🏠 Back', 'admin_panel')]
      ]) }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_kyc', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const pending = Object.entries(getUsers())
      .filter(([_, u]) => u.kycStatus === 'submitted' || u.kycStatus === 'pending')
      .map(([id, u]) => ({ userId: id, ...u }));
    
    if (pending.length === 0) {
      await ctx.reply('🛂 \\*KYC APPROVALS\\*\n\n✅ No pending applications', { parse_mode: 'MarkdownV2' });
    } else {
      let msg = `🛂 \\*KYC APPROVALS\\*\n\n📋 Pending: ${pending.length}\n\n`;
      pending.slice(0, 3).forEach((u, i) => {
        msg += `${i+1}. ${escapeMarkdownV2(u.firstName || '')} ${escapeMarkdownV2(u.lastName || '')}\n`;
        msg += `   ID: ${u.userId}\n   Email: ${escapeMarkdownV2(u.email || 'Not set')}\n\n`;
      });
      await ctx.reply(msg, { parse_mode: 'MarkdownV2' });
    }
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_device_financing', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    await ctx.reply(
      '💼 \\*DEVICE FINANCING ADMIN\\*\n\n' +
      'Commands:\n/adddevice\n/addinventory\n/addmarketer\n/removedevice',
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Back', 'admin_panel')]]) }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_balance', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const totalBalance = Object.values(getUsers()).reduce((s, u) => s + (u.wallet || 0), 0);
    await ctx.reply(
      `💰 \\*SYSTEM BALANCE\\*\n\n💵 Total Wallet Balance: ${formatCurrency(totalBalance)}`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'admin_balance')]]) }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action('admin_stats', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const users = getUsers();
    const totalUsers = Object.keys(users).length;
    const totalBalance = Object.values(users).reduce((s, u) => s + (u.wallet || 0), 0);
    const stats = systemTransactionManager.getTransactionStats();
    
    await ctx.reply(
      `📈 \\*SYSTEM STATISTICS\\*\n\n` +
      `👥 Users: ${totalUsers}\n💰 Balance: ${formatCurrency(totalBalance)}\n` +
      `📊 Transactions: ${stats.total}\n📅 Today: ${stats.today}`,
      { parse_mode: 'MarkdownV2' }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action('start', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    const isUserAdmin = isAdmin(userId);
    
    const keyboard = isUserAdmin ? [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '🛠️ Admin Panel', '🆘 Help & Support']
    ] : [
      ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
      ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
      ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
      ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
      ['🛂 KYC Status', '🆘 Help & Support']
    ];
    
    await ctx.reply(
      `🌟 \\*Welcome to Liteway VTU Bot\\!\\*\n\n` +
      `🛂 KYC: ${escapeMarkdownV2((user.kycStatus || 'pending').toUpperCase())}\n` +
      `💵 Wallet: ${formatCurrency(user.wallet)}\n\n` +
      `📞 Support: @opuenekeke`,
      { parse_mode: 'MarkdownV2', ...Markup.keyboard(keyboard).resize() }
    );
    await ctx.answerCbQuery();
  });
  
  bot.action('no_action', ctx => ctx.answerCbQuery());
  
  bot.action('device_back', async (ctx) => {
    const deviceHandler = getDeviceHandler();
    if (deviceHandler) {
      deviceHandler.users = getUsers();
      await deviceHandler.handleDeviceMenu(ctx);
    }
    await ctx.answerCbQuery();
  });
  
  bot.action('device_mini_app', async (ctx) => {
    const deviceLockApp = getDeviceLockApp();
    if (deviceLockApp) await deviceLockApp.handleMiniAppCommand(ctx);
    await ctx.answerCbQuery();
  });
  
  bot.action('bank_transfer', async (ctx) => {
    const usersForSendMoney = { ...getUsers(), ...userMethods };
    await systemTransactionManager.recordTransaction({
      type: 'bank_transfer_started', userId: ctx.from.id.toString(),
      telegramId: ctx.from.id.toString(), status: 'started'
    });
    await sendMoney.handleSendMoney(ctx, usersForSendMoney, require('./handlers').transactionMethods);
    await ctx.answerCbQuery();
  });
  
  bot.action('litemonie_transfer', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await initUser(userId);
    
    if (!user.phone) {
      return ctx.reply('📱 Phone number required for Litemonie', { parse_mode: 'MarkdownV2' });
    }
    
    await ctx.reply(
      `📱 \\*LITEMONIE TRANSFER\\*\n\n📞 Your account: ${escapeMarkdownV2(user.phone)}\n` +
      `💵 Balance: ${formatCurrency(user.wallet)}\n\nEnter recipient phone:`,
      { parse_mode: 'MarkdownV2' }
    );
    
    const sessions = getSessions();
    sessions[userId] = { action: 'litemonie_transfer', step: 'enter_phone' };
    setSessions(sessions);
    await saveAllData();
    await ctx.answerCbQuery();
  });
  
  console.log('✅ All callbacks registered');
}

// ========== WEBHOOK SETUP FUNCTION ==========
async function setupWebhook(bot, webhookUrl) {
  try {
    console.log(`🌐 Setting up webhook: ${webhookUrl}`);
    
    // Delete any existing webhook
    await bot.telegram.deleteWebhook();
    
    // Set the new webhook
    await bot.telegram.setWebhook(webhookUrl);
    
    // Verify webhook was set
    const webhookInfo = await bot.telegram.getWebhookInfo();
    console.log('✅ Webhook configured successfully:');
    console.log(`   URL: ${webhookInfo.url}`);
    console.log(`   Pending updates: ${webhookInfo.pending_update_count || 0}`);
    console.log(`   Max connections: ${webhookInfo.max_connections || 40}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to setup webhook:', error.message);
    return false;
  }
}

// ========== STOP BOT FUNCTION ==========
async function stopBot() {
  console.log('🛑 Stopping bot...');
  
  try {
    if (botInstance) {
      // Stop the bot
      await botInstance.stop();
      
      // If in production, delete webhook
      if (process.env.NODE_ENV === 'production') {
        await botInstance.telegram.deleteWebhook();
        console.log('✅ Webhook deleted');
      }
      
      console.log('✅ Bot stopped');
    }
    
    if (serverInstance) {
      await new Promise((resolve) => {
        serverInstance.close(() => {
          console.log('✅ Server closed');
          resolve();
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error stopping bot:', error);
  }
}

// ========== GET BOT INFO FUNCTION ==========
async function getBotInfo() {
  if (!botInstance) return null;
  
  try {
    const me = await botInstance.telegram.getMe();
    const webhookInfo = await botInstance.telegram.getWebhookInfo();
    
    return {
      username: me.username,
      id: me.id,
      isBot: me.is_bot,
      firstName: me.first_name,
      webhook: webhookInfo,
      uptime: process.uptime()
    };
  } catch (error) {
    return { error: error.message };
  }
}

// ========== MAIN LAUNCH FUNCTION ==========
async function launchBot(useWebhook = false) {
  try {
    // Create bot instance
    botInstance = await createBot();
    
    // Setup Express server
    const app = setupExpressServer(botInstance);
    
    // Setup commands and handlers
    await setupCommands(botInstance);
    await setupMenuHandlers(botInstance);
    await setupCallbackHandlers(botInstance);
    
    // Text handler
    botInstance.on('text', async (ctx) => {
      const text = ctx.message.text.trim();
      if (text.startsWith('/')) return;
      await handleTextMessage(ctx, text);
    });
    
    // Error handler
    botInstance.catch((err, ctx) => {
      console.error('❌ Global Error:', err);
      ctx.reply('❌ An error occurred', { parse_mode: 'MarkdownV2' }).catch(() => {});
    });
    
    // Start server
    const PORT = process.env.PORT || 3000;
    serverInstance = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n📡 Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      
      if (process.env.RENDER_EXTERNAL_URL) {
        console.log(`🌍 Public URL: ${process.env.RENDER_EXTERNAL_URL}`);
      }
    });
    
    // Launch bot (webhook or polling)
    if (useWebhook || process.env.NODE_ENV === 'production') {
      // Production: Use webhook
      const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      const webhookUrl = `${baseUrl}/webhook`;
      
      const webhookSuccess = await setupWebhook(botInstance, webhookUrl);
      
      if (webhookSuccess) {
        console.log('\n✅ Bot running in PRODUCTION mode with webhook');
      } else {
        console.log('\n⚠️ Webhook setup failed, falling back to polling');
        await botInstance.launch();
      }
    } else {
      // Development: Use polling
      await botInstance.launch();
      console.log('\n✅ Bot running in DEVELOPMENT mode with polling');
    }
    
    console.log(`👑 Admin ID: ${require('./config').CONFIG.ADMIN_ID}`);
    console.log(`🤖 Bot Username: @${botInstance.options?.username || 'unknown'}`);
    
    return botInstance;
    
  } catch (error) {
    console.error('❌ Failed to launch bot:', error);
    
    // Better error handling for 404
    if (error.code === 404 || (error.response && error.response.error_code === 404)) {
      console.error('\n🔴 CRITICAL: Bot token is invalid or bot does not exist!');
      console.error('Please check your BOT_TOKEN environment variable in Render dashboard.');
    }
    
    throw error;
  }
}

// Export functions
module.exports = { 
  launchBot,
  stopBot,
  getBotInfo,
  setupWebhook,
  bot: botInstance
};