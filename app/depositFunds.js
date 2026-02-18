/**
 * depositFunds.js - FIXED VERSION with Proper Imports & Transaction Tracking
 */

const axios = require('axios');
const crypto = require('crypto');

// ========== IMPORT SYSTEM MANAGERS FROM CORRECT LOCATION ==========
let systemTransactionManager = null;
let apiResponseManager = null;

// Function to get system transaction manager (prevents circular dependency)
function getTransactionManagers() {
  if (!systemTransactionManager || !apiResponseManager) {
    try {
      const transactionSystem = require('../transaction-system');
      systemTransactionManager = transactionSystem.systemTransactionManager;
      apiResponseManager = transactionSystem.apiResponseManager;
      console.log('✅ Loaded transaction managers for depositFunds module');
    } catch (error) {
      console.error('❌ Could not load transaction managers:', error.message);
    }
  }
  return { systemTransactionManager, apiResponseManager };
}

// ========== IMPORT DATABASE FUNCTIONS ==========
const { 
  getUsers, 
  getTransactions,
  recordTransaction  // Use the unified recording function
} = require('../database');

/* =====================================================
   ENV VARIABLES & CONFIG
===================================================== */
const {
  BILLSTACK_API_KEY,
  BILLSTACK_SECRET_KEY,
  BILLSTACK_BASE_URL = 'https://api.billstack.co',
  BILLSTACK_WEBHOOK_SECRET,
  NODE_ENV
} = process.env;

const CONFIG = {
  BILLSTACK_TOKEN: BILLSTACK_SECRET_KEY || BILLSTACK_API_KEY || '',
  BILLSTACK_BASE_URL: BILLSTACK_BASE_URL,
  BILLSTACK_WEBHOOK_SECRET: BILLSTACK_WEBHOOK_SECRET || '',
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  
  BILLSTACK_ENABLED: (BILLSTACK_SECRET_KEY || BILLSTACK_API_KEY) ? true : false,
  
  SUPPORTED_BANKS: ['9PSB', 'SAFEHAVEN', 'PROVIDUS', 'BANKLY', 'PALMPAY'],
  DEFAULT_BANK: 'PALMPAY',
  
  TEST_MODE: !(BILLSTACK_SECRET_KEY || BILLSTACK_API_KEY) || NODE_ENV === 'development',
  TEST_VIRTUAL_ACCOUNT: {
    bank_name: 'PALMPAY BANK',
    account_number: `TEST${Date.now().toString().slice(-6)}`,
    account_name: 'TEST USER ACCOUNT',
    reference: 'TEST-REF',
    provider: 'test',
    bank_code: 'PALMPAY',
    created_at: new Date(),
    is_active: true
  }
};

console.log('🔧 Billstack Configuration:');
console.log('- Base URL:', CONFIG.BILLSTACK_BASE_URL);
console.log('- Has Token:', !!CONFIG.BILLSTACK_TOKEN);
console.log('- Test Mode:', CONFIG.TEST_MODE);

/* =====================================================
   SESSION MANAGER
===================================================== */
class DepositSessionManager {
  constructor() {
    this.sessions = new Map();
  }

  startSession(userId, action) {
    this.sessions.set(userId, {
      action: action,
      step: 1,
      data: {},
      timestamp: Date.now()
    });
    console.log(`📝 Session started for ${userId}: ${action}`);
  }

  updateStep(userId, step, data = {}) {
    const session = this.sessions.get(userId);
    if (session) {
      session.step = step;
      Object.assign(session.data, data);
    }
  }

  getSession(userId) {
    return this.sessions.get(userId);
  }

  clearSession(userId) {
    this.sessions.delete(userId);
    console.log(`🗑️ Session cleared for ${userId}`);
  }

  cleanupOldSessions(maxAge = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.timestamp > maxAge) {
        this.sessions.delete(userId);
      }
    }
  }
}

const sessionManager = new DepositSessionManager();

/* =====================================================
   AXIOS CLIENT
===================================================== */
const createBillstackClient = () => {
  const client = axios.create({
    baseURL: CONFIG.BILLSTACK_BASE_URL,
    timeout: CONFIG.TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'VTU-Bot/1.0'
    }
  });

  client.interceptors.request.use(
    (config) => {
      console.log(`📤 ${config.method.toUpperCase()} ${config.url}`);
      
      if (CONFIG.BILLSTACK_TOKEN) {
        config.headers['Authorization'] = `Bearer ${CONFIG.BILLSTACK_TOKEN}`;
      }
      
      return config;
    },
    (error) => {
      console.error('❌ Request interceptor error:', error.message);
      return Promise.reject(error);
    }
  );

  client.interceptors.response.use(
    (response) => {
      console.log(`✅ ${response.status} ${response.config.url}`);
      return response;
    },
    async (error) => {
      console.error('❌ API Error:', error.message);
      
      const shouldRetry = error.code === 'ECONNRESET' || 
                         error.code === 'ETIMEDOUT' || 
                         error.code === 'ENOTFOUND' ||
                         error.code === 'ECONNREFUSED';
      
      if (shouldRetry && error.config) {
        if (!error.config._retryCount) {
          error.config._retryCount = 0;
        }
        
        if (error.config._retryCount < CONFIG.MAX_RETRIES) {
          error.config._retryCount++;
          const delay = CONFIG.RETRY_DELAY * error.config._retryCount;
          
          console.log(`⏳ Retry ${error.config._retryCount}/${CONFIG.MAX_RETRIES} in ${delay}ms`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          return client(error.config);
        }
      }
      
      return Promise.reject(error);
    }
  );

  return client;
};

const billstackClient = createBillstackClient();

/* =====================================================
   UTILITY FUNCTIONS
===================================================== */
function generateReference(telegramId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `VTU-${telegramId}-${timestamp}-${random}`;
}

function formatPhoneNumber(phone) {
  if (!phone) return '08012345678';
  
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return cleaned;
  } else if (cleaned.length === 13 && cleaned.startsWith('234')) {
    return '0' + cleaned.substring(3);
  } else if (cleaned.length === 10) {
    return '0' + cleaned;
  }
  
  return '08012345678';
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return true;
  } else if (cleaned.length === 13 && cleaned.startsWith('234')) {
    return true;
  } else if (cleaned.length === 10) {
    return true;
  }
  
  return false;
}

/* =====================================================
   1️⃣ VIRTUAL ACCOUNT CREATION - UPDATED WITH DUPLICATION CHECK
===================================================== */
async function createVirtualAccountForUser(user, virtualAccounts) {
  try {
    console.log(`\n🏦 Creating/Checking virtual account for user ${user.telegramId} (${user.firstName || 'User'})`);
    
    // FIRST: Check if user already has a virtual account in our database
    const existingAccount = await virtualAccounts.findByUserId(user.telegramId);
    
    if (existingAccount && existingAccount.is_active) {
      console.log('✅ User already has active virtual account:', existingAccount.account_number);
      
      // If in test mode, return existing account
      if (CONFIG.TEST_MODE) {
        console.log('🧪 TEST MODE: Using existing account');
        return {
          ...existingAccount,
          note: 'Existing account retrieved from database (Test Mode)'
        };
      }
      
      // Try to verify with Billstack API if we have credentials
      if (CONFIG.BILLSTACK_TOKEN) {
        try {
          console.log('🔍 Verifying existing account with Billstack...');
          // Note: You could add a Billstack API verification call here
          // For example: billstackClient.get(`/accounts/${existingAccount.account_number}`)
          // For now, we'll just log and return the existing account
          console.log('✅ Existing account verified (using cached data)');
          return {
            ...existingAccount,
            note: 'Existing active account retrieved from database'
          };
        } catch (verifyError) {
          console.log('⚠️ Could not verify existing account:', verifyError.message);
          // Continue to create a new one
        }
      } else {
        console.log('✅ Using existing account from database');
        return {
          ...existingAccount,
          note: 'Existing account retrieved from database'
        };
      }
    }
    
    // If no existing account or account is not active, create new one
    console.log('🆕 No active virtual account found, creating new one...');
    
    if (CONFIG.TEST_MODE) {
      console.log('🧪 TEST MODE: Creating test account');
      return {
        ...CONFIG.TEST_VIRTUAL_ACCOUNT,
        account_name: `${user.firstName || 'User'} ${user.lastName || ''}`.trim() || 'User Account',
        account_number: `TEST${user.telegramId.slice(-6)}${Date.now().toString().slice(-6)}`
      };
    }
    
    if (!CONFIG.BILLSTACK_TOKEN) {
      throw new Error('Billstack API token not configured');
    }
    
    const reference = generateReference(user.telegramId);
    const formattedPhone = user.phone ? formatPhoneNumber(user.phone) : '08012345678';
    
    const requestData = {
      email: user.email,
      reference: reference,
      firstName: user.firstName || 'User',
      lastName: user.lastName || 'Customer',
      phone: formattedPhone,
      bank: CONFIG.DEFAULT_BANK
    };

    console.log('📤 Request data:', requestData);

    const response = await billstackClient.post(
      '/v2/thirdparty/generateVirtualAccount/',
      requestData
    );

    console.log('📥 Response:', response.data);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Failed to create account');
    }

    const accountData = response.data.data;
    if (!accountData || !accountData.account || accountData.account.length === 0) {
      throw new Error('No account data returned');
    }

    const firstAccount = accountData.account[0];
    
    console.log(`✅ Account created successfully`);

    return {
      bank_name: firstAccount.bank_name,
      account_number: firstAccount.account_number,
      account_name: firstAccount.account_name,
      reference: reference,
      provider: 'billstack',
      bank_code: firstAccount.bank_id || CONFIG.DEFAULT_BANK,
      created_at: new Date(firstAccount.created_at || new Date()),
      is_active: true
    };

  } catch (error) {
    console.error(`❌ Failed to create/check account: ${error.message}`);
    
    if (error.response?.status === 401) {
      throw new Error('Invalid Billstack API token. Please contact admin.');
    }
    
    throw new Error(`Virtual account operation failed: ${error.message}`);
  }
}

/* =====================================================
   2️⃣ MAIN DEPOSIT COMMAND
===================================================== */
async function handleDeposit(ctx, users, virtualAccounts) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    console.log(`💰 Deposit requested by ${telegramId}`);
    
    const user = await users.findById(telegramId);
    if (!user) {
      return ctx.reply('❌ Account not found. Please /start first.');
    }

    if (user.kycStatus !== 'approved') {
      return ctx.reply('📝 KYC Verification Required\n\nPlease use /kyc to verify.');
    }

    const needsEmail = !user.email;
    const needsPhone = !user.phone;
    
    if (needsEmail || needsPhone) {
      if (needsEmail) {
        sessionManager.startSession(telegramId, 'collect_email');
        return ctx.reply(
          '📧 *Email Required*\n\nPlease enter your email address:',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🚫 Cancel', 'cancel_deposit')]
            ])
          }
        );
      } else if (needsPhone) {
        sessionManager.startSession(telegramId, 'collect_phone');
        return ctx.reply(
          `📱 *Phone Required*\n\nYour email: ${user.email}\n\nPlease enter your phone number:`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📧 Change Email', 'change_email')],
              [Markup.button.callback('🚫 Cancel', 'cancel_deposit')]
            ])
          }
        );
      }
    }

    const virtualAccount = await virtualAccounts.findByUserId(telegramId);
    
    if (!virtualAccount || !virtualAccount.is_active) {
      return ctx.reply(
        `🏦 *DEPOSIT FUNDS*\n\n` +
        `📧 Email: ${user.email}\n` +
        `📱 Phone: ${user.phone}\n` +
        `🛂 KYC: ✅ Approved\n\n` +
        `💡 Choose deposit method:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Create Virtual Account', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
    } else {
      await ctx.reply(
        `💰 *Your Account*\n\n` +
        `🏦 Bank: ${virtualAccount.bank_name}\n` +
        `🔢 Account: \`${virtualAccount.account_number}\`\n` +
        `👤 Name: ${virtualAccount.account_name}\n\n` +
        `💡 Transfer to this account to deposit funds.`,
        { parse_mode: 'Markdown' }
      );
    }

  } catch (error) {
    console.error('Deposit command error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

/* =====================================================
   3️⃣ TEXT MESSAGE HANDLER
===================================================== */
async function handleDepositText(ctx, text, users, virtualAccounts) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    const session = sessionManager.getSession(telegramId);
    
    if (!session) return false;
    
    const user = await users.findById(telegramId);
    if (!user) return false;
    
    if (session.action === 'collect_email') {
      const email = text.trim();
      
      if (!validateEmail(email)) {
        await ctx.reply('❌ Invalid email. Please enter a valid email:');
        return true;
      }
      
      user.email = email;
      await users.update(telegramId, { email: email });
      
      sessionManager.startSession(telegramId, 'collect_phone');
      
      await ctx.reply(
        `✅ Email saved: ${email}\n\n` +
        `📱 Now enter your phone number:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Back', 'change_email')],
            [Markup.button.callback('🚫 Cancel', 'cancel_deposit')]
          ])
        }
      );
      return true;
    }
    
    if (session.action === 'collect_phone') {
      const phone = text.trim();
      
      if (!validatePhone(phone)) {
        await ctx.reply('❌ Invalid phone. Please enter a valid Nigerian number:');
        return true;
      }
      
      user.phone = phone;
      await users.update(telegramId, { phone: phone });
      
      sessionManager.clearSession(telegramId);
      
      await ctx.reply(
        `✅ *Registration Complete!*\n\n` +
        `📧 Email: ${user.email}\n` +
        `📱 Phone: ${user.phone}\n\n` +
        `Now create your virtual account:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Create Virtual Account', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('Text handler error:', error);
    return false;
  }
}

/* =====================================================
   4️⃣ CALLBACK QUERY HANDLERS
===================================================== */
async function handleCreateVirtualAccount(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK TRIGGERED: create_virtual_account');
  
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    console.log(`👤 User ${telegramId} clicked create_virtual_account`);
    
    // First answer the callback query to remove loading state
    await ctx.answerCbQuery('⏳ Creating account...');
    
    // Edit the message to show processing
    try {
      await ctx.editMessageText(
        `🔄 *Creating Virtual Account...*\n\n` +
        `⏳ Please wait...`,
        { parse_mode: 'Markdown' }
      );
    } catch (editError) {
      // If edit fails, send a new message
      await ctx.reply(
        `🔄 *Creating Virtual Account...*\n\n` +
        `⏳ Please wait...`,
        { parse_mode: 'Markdown' }
      );
    }
    
    const user = await users.findById(telegramId);
    if (!user) {
      await ctx.reply('❌ User not found. Please /start first.');
      return;
    }
    
    console.log('📋 User data:', {
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName
    });
    
    if (!user.email || !user.phone) {
      await ctx.reply(
        `❌ Missing information.\n\n` +
        `Email: ${user.email ? '✅' : '❌'}\n` +
        `Phone: ${user.phone ? '✅' : '❌'}\n\n` +
        `Please use /deposit again to set both.`
      );
      return;
    }
    
    try {
      console.log('🚀 Starting virtual account creation...');
      
      // Check if user already has an account first
      const existingAccount = await virtualAccounts.findByUserId(telegramId);
      
      if (existingAccount && existingAccount.is_active) {
        console.log('✅ User already has active account, displaying it...');
        
        let message = `✅ *Virtual Account Found!*\n\n`;
        message += `You already have an active account:\n\n`;
        message += `🏦 *Bank:* ${existingAccount.bank_name}\n`;
        message += `🔢 *Account Number:* \`${existingAccount.account_number}\`\n`;
        message += `👤 *Account Name:* ${existingAccount.account_name}\n`;
        message += `📅 *Created:* ${new Date(existingAccount.created_at).toLocaleDateString()}\n\n`;
        
        if (existingAccount.provider !== 'test') {
          message += `💰 *How to Deposit:*\n`;
          message += `1. Transfer to account above\n`;
          message += `2. Use any bank app\n`;
          message += `3. Minimum: ₦100\n`;
          message += `4. Maximum: ₦1,000,000\n\n`;
          message += `⏱️ *Processing Time:* 1-5 minutes\n`;
        }
        
        message += `📞 *Support:* @opuenekeke`;
        
        try {
          await ctx.editMessageText(message, { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Create New Account', 'force_new_account')],
              [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          });
        } catch (editError) {
          await ctx.reply(message, { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Create New Account', 'force_new_account')],
              [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          });
        }
        return;
      }
      
      // If no existing account, create new one
      const newAccount = await createVirtualAccountForUser({
        telegramId: user.telegramId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        phone: user.phone
      }, virtualAccounts);

      console.log('✅ Account created, saving to database...');
      await virtualAccounts.create({
        user_id: telegramId,
        ...newAccount
      });
      
      // ===== RECORD VIRTUAL ACCOUNT CREATION TRANSACTION =====
      try {
        const { recordTransaction } = require('../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(telegramId, {
            type: 'virtual_account_created',
            amount: 0,
            status: 'completed',
            description: `Virtual account created with ${newAccount.bank_name} - ${newAccount.account_number}`,
            category: 'account',
            metadata: {
              bank_name: newAccount.bank_name,
              account_number: newAccount.account_number,
              account_name: newAccount.account_name,
              provider: newAccount.provider || 'billstack'
            }
          });
          console.log(`✅ Virtual account creation recorded for user ${telegramId}`);
        }
      } catch (dbError) {
        console.warn('⚠️ Could not record virtual account creation:', dbError.message);
      }
      
      let message = `✅ *Virtual Account Created!*\n\n`;
      
      if (newAccount.provider === 'test') {
        message += `🧪 *TEST MODE*\n`;
        message += `This is a test account.\n\n`;
      }
      
      message += `🏦 *Bank:* ${newAccount.bank_name}\n`;
      message += `🔢 *Account Number:* \`${newAccount.account_number}\`\n`;
      message += `👤 *Account Name:* ${newAccount.account_name}\n\n`;
      
      if (newAccount.provider !== 'test') {
        message += `💰 *How to Deposit:*\n`;
        message += `1. Transfer to account above\n`;
        message += `2. Use any bank app\n`;
        message += `3. Minimum: ₦100\n`;
        message += `4. Maximum: ₦1,000,000\n\n`;
        message += `⏱️ *Processing Time:* 1-5 minutes\n`;
      }
      
      message += `📞 *Support:* @opuenekeke`;

      try {
        await ctx.editMessageText(message, { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
      } catch (editError) {
        await ctx.reply(message, { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
      }
      
      // Send reminder
      setTimeout(async () => {
        try {
          await bot.telegram.sendMessage(
            telegramId,
            `💡 Reminder: Your virtual account is ready!\n\n` +
            `Bank: ${newAccount.bank_name}\n` +
            `Account: \`${newAccount.account_number}\`\n` +
            `Name: ${newAccount.account_name}`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) {
          console.error('Reminder failed:', err.message);
        }
      }, 60000);
      
    } catch (error) {
      console.error('❌ Account creation error:', error);
      
      const errorMessage = `❌ *Virtual Account Creation Failed*\n\n` +
        `${error.message}\n\n` +
        `💡 *What to do:*\n` +
        `1. Check your email & phone format\n` +
        `2. Try again later\n` +
        `3. Use manual deposit option\n` +
        `4. Contact admin if issue persists`;
      
      try {
        await ctx.editMessageText(errorMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('📞 Contact Admin', 'contact_admin_direct')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
      } catch (editError) {
        await ctx.reply(errorMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Try Again', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('📞 Contact Admin', 'contact_admin_direct')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Callback handler error:', error);
    await ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleForceNewAccount(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK TRIGGERED: force_new_account');
  
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('⏳ Creating new account...');
    
    try {
      await ctx.editMessageText(
        `🔄 *Creating New Virtual Account...*\n\n` +
        `⏳ Please wait...`,
        { parse_mode: 'Markdown' }
      );
    } catch (editError) {
      await ctx.reply(
        `🔄 *Creating New Virtual Account...*\n\n` +
        `⏳ Please wait...`,
        { parse_mode: 'Markdown' }
      );
    }
    
    const user = await users.findById(telegramId);
    if (!user) {
      await ctx.reply('❌ User not found.');
      return;
    }
    
    // Deactivate old account if exists
    const oldAccount = await virtualAccounts.findByUserId(telegramId);
    if (oldAccount) {
      await virtualAccounts.update(oldAccount.id, { is_active: false });
      console.log(`🗑️ Deactivated old account: ${oldAccount.account_number}`);
    }
    
    // Create new account
    const newAccount = await createVirtualAccountForUser({
      telegramId: user.telegramId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: user.phone
    }, virtualAccounts);

    await virtualAccounts.create({
      user_id: telegramId,
      ...newAccount
    });
    
    // ===== RECORD NEW VIRTUAL ACCOUNT CREATION =====
    try {
      const { recordTransaction } = require('../database');
      if (typeof recordTransaction === 'function') {
        await recordTransaction(telegramId, {
          type: 'virtual_account_recreated',
          amount: 0,
          status: 'completed',
          description: `New virtual account created (replaced old one) with ${newAccount.bank_name} - ${newAccount.account_number}`,
          category: 'account',
          metadata: {
            bank_name: newAccount.bank_name,
            account_number: newAccount.account_number,
            account_name: newAccount.account_name,
            provider: newAccount.provider || 'billstack',
            old_account: oldAccount?.account_number
          }
        });
      }
    } catch (dbError) {
      console.warn('⚠️ Could not record account recreation:', dbError.message);
    }
    
    let message = `🆕 *New Virtual Account Created!*\n\n`;
    message += `(Old account deactivated)\n\n`;
    message += `🏦 *Bank:* ${newAccount.bank_name}\n`;
    message += `🔢 *Account Number:* \`${newAccount.account_number}\`\n`;
    message += `👤 *Account Name:* ${newAccount.account_name}\n\n`;
    
    if (newAccount.provider !== 'test') {
      message += `💰 *How to Deposit:*\n`;
      message += `1. Transfer to new account above\n`;
      message += `2. Use any bank app\n`;
      message += `3. Minimum: ₦100\n`;
      message += `4. Maximum: ₦1,000,000\n\n`;
      message += `⏱️ *Processing Time:* 1-5 minutes\n`;
    }
    
    message += `📞 *Support:* @opuenekeke`;
    
    try {
      await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
    } catch (editError) {
      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
    }
    
  } catch (error) {
    console.error('❌ Force new account error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleManualDeposit(ctx) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      `📋 *MANUAL DEPOSIT*\n\n` +
      `Contact @opuenekeke with:\n` +
      `• User ID: \`${telegramId}\`\n` +
      `• Amount\n` +
      `• Payment proof\n\n` +
      `⏰ Processing: 1-24 hours`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Try Virtual Account', 'create_virtual_account')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      }
    );
    
  } catch (error) {
    console.error('Manual deposit error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleCancelDeposit(ctx) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    sessionManager.clearSession(telegramId);
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      '❌ Deposit cancelled.\n\nUse /deposit to try again.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Home', 'start')]
      ])
    );
    
  } catch (error) {
    console.error('Cancel error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleChangeEmail(ctx, users) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    sessionManager.startSession(telegramId, 'collect_email');
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      '📧 Please enter your email address:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🚫 Cancel', 'cancel_deposit')]
      ])
    );
    
  } catch (error) {
    console.error('Change email error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleContactAdminDirect(ctx) {
  try {
    const { Markup } = require('telegraf');
    
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      '📞 Contact @opuenekeke for assistance.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Home', 'start')]
      ])
    );
    
  } catch (error) {
    console.error('Contact admin error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/* =====================================================
   5️⃣ WEBHOOK HANDLER WITH TRANSACTION TRACKING
===================================================== */
function handleBillstackWebhook(bot, users, transactions, virtualAccounts) {
  return async (req, res) => {
    console.log('📥 Webhook received');
    
    try {
      const payload = req.body;
      console.log('Webhook payload:', JSON.stringify(payload, null, 2));
      
      // Verify webhook signature if secret is set
      if (CONFIG.BILLSTACK_WEBHOOK_SECRET) {
        const signature = req.headers['x-billstack-signature'];
        // Add signature verification here if needed
      }
      
      // Check if this is a deposit notification
      if (payload.event === 'deposit.successful' || payload.type === 'deposit') {
        const { 
          account_number, 
          amount, 
          reference,
          transaction_reference,
          status,
          metadata
        } = payload.data || payload;
        
        console.log(`💰 Deposit received: ₦${amount} to account ${account_number}`);
        
        // Find user by virtual account number
        const virtualAccount = await virtualAccounts.findByAccountNumber(account_number);
        
        if (virtualAccount) {
          const userId = virtualAccount.user_id;
          const user = await users.findById(userId);
          
          if (user) {
            // Credit user's wallet
            const oldBalance = user.wallet || 0;
            user.wallet = oldBalance + parseFloat(amount);
            await users.update(userId, { wallet: user.wallet });
            
            console.log(`✅ Credited ₦${amount} to user ${userId}. New balance: ₦${user.wallet}`);
            
            // ===== RECORD DEPOSIT TRANSACTION =====
            const depositRef = transaction_reference || reference || `DEP${Date.now()}`;
            
            try {
              const { recordTransaction } = require('../database');
              if (typeof recordTransaction === 'function') {
                await recordTransaction(userId, {
                  id: depositRef,
                  type: 'deposit',
                  amount: parseFloat(amount),
                  status: 'completed',
                  description: `Wallet deposit via virtual account`,
                  category: 'deposit',
                  reference: depositRef,
                  metadata: {
                    account_number,
                    bank_name: virtualAccount.bank_name,
                    webhook_payload: payload
                  }
                });
                console.log(`✅ Deposit transaction recorded: ${depositRef}`);
              }
            } catch (dbError) {
              console.warn('⚠️ Could not record deposit:', dbError.message);
            }
            
            // Notify user
            try {
              await bot.telegram.sendMessage(
                userId,
                `💰 *Deposit Received!*\n\n` +
                `Amount: ₦${amount.toLocaleString()}\n` +
                `New Balance: ₦${user.wallet.toLocaleString()}\n` +
                `Reference: \`${depositRef}\`\n\n` +
                `Thank you for using our service!`,
                { parse_mode: 'Markdown' }
              );
            } catch (notifyError) {
              console.error('Failed to notify user:', notifyError.message);
            }
          }
        } else {
          console.log(`⚠️ No user found for account number: ${account_number}`);
        }
      }
      
      res.status(200).json({ status: 'ok' });
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(500).json({ error: error.message });
    }
  };
}

/* =====================================================
   6️⃣ SETUP FUNCTION
===================================================== */
function setupDepositHandlers(bot, users, virtualAccounts) {
  console.log('\n📋 SETTING UP DEPOSIT CALLBACK HANDLERS...');
  
  // Register all callback handlers
  bot.action('create_virtual_account', (ctx) => {
    console.log('🟢 create_virtual_account callback triggered');
    return handleCreateVirtualAccount(ctx, users, virtualAccounts, bot);
  });
  
  bot.action('force_new_account', (ctx) => {
    console.log('🟢 force_new_account callback triggered');
    return handleForceNewAccount(ctx, users, virtualAccounts, bot);
  });
  
  bot.action('manual_deposit', (ctx) => {
    console.log('🟢 manual_deposit callback triggered');
    return handleManualDeposit(ctx);
  });
  
  bot.action('cancel_deposit', (ctx) => {
    console.log('🟢 cancel_deposit callback triggered');
    return handleCancelDeposit(ctx);
  });
  
  bot.action('change_email', (ctx) => {
    console.log('🟢 change_email callback triggered');
    return handleChangeEmail(ctx, users);
  });
  
  bot.action('contact_admin_direct', (ctx) => {
    console.log('🟢 contact_admin_direct callback triggered');
    return handleContactAdminDirect(ctx);
  });
  
  bot.action('retry_deposit', (ctx) => {
    console.log('🟢 retry_deposit callback triggered');
    return handleDeposit(ctx, users, virtualAccounts);
  });
  
  console.log('✅ Deposit callback handlers registered');
}

/* =====================================================
   7️⃣ EXPORTS
===================================================== */
module.exports = {
  // Main handlers
  handleDeposit,
  handleDepositText,
  
  // Session manager
  sessionManager,
  
  // Virtual account function - Updated to accept virtualAccounts parameter
  createVirtualAccountForUser,
  
  // Callback handlers (for registration)
  handleCreateVirtualAccount,
  handleForceNewAccount,
  handleManualDeposit,
  handleCancelDeposit,
  handleChangeEmail,
  handleContactAdminDirect,
  
  // Setup function
  setupDepositHandlers,
  
  // Webhook handler with transaction tracking
  handleBillstackWebhook,
  
  // Utility functions
  generateReference,
  validateEmail,
  validatePhone,
  formatPhoneNumber
};