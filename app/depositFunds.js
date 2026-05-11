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
  setUsers,
  saveAllData,
  recordTransaction
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
  
  TEST_MODE: !(BILLSTACK_SECRET_KEY || BILLSTACK_API_KEY),
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
   1️⃣ VIRTUAL ACCOUNT CREATION - ENHANCED WITH RETRIEVAL LOGIC
===================================================== */
async function createVirtualAccountForUser(user, virtualAccounts) {
  try {
    console.log(`\n🏦 Creating/Checking virtual account for user ${user.telegramId} (${user.firstName || 'User'})`);
    
    // FIRST: Check if user already has a virtual account in our database
    const existingAccount = await virtualAccounts.findByUserId(user.telegramId);
    
    if (existingAccount && existingAccount.is_active) {
      console.log('✅ User already has active virtual account in database:', existingAccount.account_number);
      return {
        ...existingAccount,
        note: 'Existing account retrieved from database'
      };
    }
    
    // SECOND: Try to retrieve account from Billstack by email
    if (!CONFIG.TEST_MODE && CONFIG.BILLSTACK_TOKEN && user.email) {
      console.log(`🔍 Searching for existing account on Billstack by email: ${user.email}`);
      
      try {
        const reference = generateReference(user.telegramId);
        
        const searchResponse = await billstackClient.get(`/v2/thirdparty/virtual-account/${reference}`);
        
        if (searchResponse.data && searchResponse.data.status && searchResponse.data.data) {
          const accountData = searchResponse.data.data;
          const firstAccount = accountData.account?.[0] || accountData;
          
          console.log('✅ Found existing account on Billstack:', firstAccount.account_number);
          
          const retrievedAccount = {
            bank_name: firstAccount.bank_name,
            account_number: firstAccount.account_number,
            account_name: firstAccount.account_name,
            reference: firstAccount.reference || reference,
            provider: 'billstack',
            bank_code: firstAccount.bank_id || CONFIG.DEFAULT_BANK,
            created_at: new Date(firstAccount.created_at || new Date()),
            is_active: true,
            note: 'Retrieved from Billstack'
          };
          
          await virtualAccounts.create({
            user_id: user.telegramId,
            ...retrievedAccount
          });
          
          console.log(`✅ Saved retrieved account to database for user ${user.telegramId}`);
          return retrievedAccount;
        }
      } catch (lookupError) {
        console.log('📝 No existing account found via reference lookup');
        if (lookupError.response?.status !== 404) {
          console.log('Lookup error:', lookupError.response?.data || lookupError.message);
        }
      }
      
      try {
        const listResponse = await billstackClient.get('/v2/thirdparty/virtual-accounts', {
          params: { email: user.email, limit: 10 }
        });
        
        if (listResponse.data && listResponse.data.status && listResponse.data.data) {
          const accounts = listResponse.data.data;
          if (accounts && accounts.length > 0) {
            const foundAccount = accounts[0];
            console.log('✅ Found existing account by email list:', foundAccount.account_number);
            
            const retrievedAccount = {
              bank_name: foundAccount.bank_name,
              account_number: foundAccount.account_number,
              account_name: foundAccount.account_name,
              reference: foundAccount.reference || generateReference(user.telegramId),
              provider: 'billstack',
              bank_code: foundAccount.bank_id || CONFIG.DEFAULT_BANK,
              created_at: new Date(foundAccount.created_at || new Date()),
              is_active: true,
              note: 'Retrieved from Billstack list'
            };
            
            await virtualAccounts.create({
              user_id: user.telegramId,
              ...retrievedAccount
            });
            
            return retrievedAccount;
          }
        }
      } catch (listError) {
        console.log('Could not list accounts, may not be supported');
      }
    }
    
    // THIRD: Wait a moment and retry creation
    if (!CONFIG.TEST_MODE && CONFIG.BILLSTACK_TOKEN) {
      console.log('⏳ Waiting 3 seconds before retrying account creation...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // FOURTH: Create new account
    console.log('🆕 Creating new virtual account...');
    
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

    console.log('📤 Creating new account with:', requestData);

    const response = await billstackClient.post(
      '/v2/thirdparty/generateVirtualAccount/',
      requestData
    );

    console.log('📥 Response:', response.data);

    if (!response.data.status) {
      if (response.data.message && response.data.message.includes('Multiple request')) {
        console.log('⚠️ Multiple request error, waiting 5 seconds and retrying...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const retryResponse = await billstackClient.post(
          '/v2/thirdparty/generateVirtualAccount/',
          requestData
        );
        
        if (retryResponse.data && retryResponse.data.status) {
          const accountData = retryResponse.data.data;
          const firstAccount = accountData.account[0];
          
          console.log(`✅ Account created on retry: ${firstAccount.account_number}`);
          
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
        }
      }
      throw new Error(response.data.message || 'Failed to create account');
    }

    const accountData = response.data.data;
    if (!accountData || !accountData.account || accountData.account.length === 0) {
      throw new Error('No account data returned');
    }

    const firstAccount = accountData.account[0];
    
    console.log(`✅ Account created successfully: ${firstAccount.account_number}`);

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
            [Markup.button.callback('🔍 Retrieve Existing Account', 'retrieve_account')],
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
   3️⃣ TEXT MESSAGE HANDLER - COMPLETELY FIXED
===================================================== */
async function handleDepositText(ctx, text, users, virtualAccounts) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    const session = sessionManager.getSession(telegramId);
    
    console.log(`📝 Handling deposit text for user ${telegramId}: ${text}`);
    console.log(`📊 Current session:`, session);
    
    if (!session) {
      console.log('❌ No session found, returning false');
      return false;
    }
    
    const user = await users.findById(telegramId);
    if (!user) {
      console.log('❌ User not found');
      return false;
    }
    
    // Handle email collection
    if (session.action === 'collect_email') {
      const email = text.trim();
      console.log(`📧 Processing email: ${email}`);
      
      if (!validateEmail(email)) {
        await ctx.reply('❌ Invalid email. Please enter a valid email (e.g., name@example.com):');
        return true;
      }
      
      // Save email
      user.email = email;
      await users.update(telegramId, { email: email });
      console.log(`✅ Email saved: ${email}`);
      
      // Clear the email session
      sessionManager.clearSession(telegramId);
      console.log('🗑️ Cleared email session');
      
      // Start phone collection
      sessionManager.startSession(telegramId, 'collect_phone');
      console.log('📝 Started phone collection session');
      
      await ctx.reply(
        `✅ Email saved: ${email}\n\n` +
        `📱 *Phone Number Required*\n\n` +
        `Please enter your phone number (e.g., 08012345678):`,
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
    
    // Handle phone collection
    if (session.action === 'collect_phone') {
      const phone = text.trim();
      console.log(`📱 Processing phone: ${phone}`);
      
      if (!validatePhone(phone)) {
        await ctx.reply('❌ Invalid phone number. Please enter a valid Nigerian number (e.g., 08012345678):');
        return true;
      }
      
      // Save phone
      user.phone = phone;
      await users.update(telegramId, { phone: phone });
      console.log(`✅ Phone saved: ${phone}`);
      
      // Clear the phone session
      sessionManager.clearSession(telegramId);
      console.log('🗑️ Cleared phone session');
      
      await ctx.reply(
        `✅ *Registration Complete!*\n\n` +
        `📧 Email: ${user.email}\n` +
        `📱 Phone: ${user.phone}\n\n` +
        `Now click the button below to create your virtual account:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Create Virtual Account', 'create_virtual_account')],
            [Markup.button.callback('🔍 Retrieve Existing Account', 'retrieve_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      return true;
    }
    
    console.log('⚠️ No matching action found, returning false');
    return false;
    
  } catch (error) {
    console.error('❌ Text handler error:', error);
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
    
    await ctx.answerCbQuery('⏳ Creating account...');
    
    try {
      await ctx.editMessageText(
        `🔄 *Creating Virtual Account...*\n\n` +
        `⏳ Please wait...`,
        { parse_mode: 'Markdown' }
      );
    } catch (editError) {
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
        `Please use /deposit again to set both.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    try {
      console.log('🚀 Starting virtual account creation...');
      
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
    
    const oldAccount = await virtualAccounts.findByUserId(telegramId);
    if (oldAccount) {
      await virtualAccounts.update(oldAccount.id, { is_active: false });
      console.log(`🗑️ Deactivated old account: ${oldAccount.account_number}`);
    }
    
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

// ========== RETRIEVE EXISTING ACCOUNT HANDLER ==========
async function handleRetrieveAccount(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK TRIGGERED: retrieve_account');
  
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('🔍 Retrieving account...');
    
    await ctx.editMessageText(
      `🔍 *Retrieving Virtual Account...*\n\n` +
      `Please wait while we fetch your existing account from Billstack...`,
      { parse_mode: 'Markdown' }
    );
    
    const user = await users.findById(telegramId);
    if (!user) {
      await ctx.reply('❌ User not found. Please /start first.');
      return;
    }
    
    if (!user.email || !user.phone) {
      await ctx.reply(
        `❌ Missing information.\n\n` +
        `Email: ${user.email ? '✅' : '❌'}\n` +
        `Phone: ${user.phone ? '✅' : '❌'}\n\n` +
        `Please use /deposit to set your email and phone first.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    try {
      console.log('🔍 Attempting to retrieve existing account from Billstack...');
      
      let retrievedAccount = null;
      const reference = generateReference(user.telegramId);
      
      // Try to get by reference
      try {
        const response = await billstackClient.get(`/v2/thirdparty/virtual-account/${reference}`);
        if (response.data && response.data.status && response.data.data) {
          const accountData = response.data.data;
          retrievedAccount = accountData.account?.[0] || accountData;
          console.log('✅ Account retrieved by reference');
        }
      } catch (refError) {
        console.log('Reference lookup failed:', refError.response?.status);
      }
      
      if (retrievedAccount) {
        console.log('✅ Found existing account:', retrievedAccount.account_number);
        
        const accountToSave = {
          bank_name: retrievedAccount.bank_name,
          account_number: retrievedAccount.account_number,
          account_name: retrievedAccount.account_name,
          reference: retrievedAccount.reference || reference,
          provider: 'billstack',
          bank_code: retrievedAccount.bank_id || CONFIG.DEFAULT_BANK,
          created_at: new Date(retrievedAccount.created_at || new Date()),
          is_active: true,
          note: 'Retrieved via retrieve button'
        };
        
        await virtualAccounts.create({
          user_id: telegramId,
          ...accountToSave
        });
        
        let message = `✅ *Virtual Account Retrieved!*\n\n`;
        message += `🏦 *Bank:* ${accountToSave.bank_name}\n`;
        message += `🔢 *Account Number:* \`${accountToSave.account_number}\`\n`;
        message += `👤 *Account Name:* ${accountToSave.account_name}\n\n`;
        message += `💰 *How to Deposit:*\n`;
        message += `1. Transfer to the account above\n`;
        message += `2. Use any bank app\n`;
        message += `3. Minimum: ₦100\n\n`;
        message += `💡 Funds will be auto-credited within 1-5 minutes!\n\n`;
        message += `📞 *Support:* @opuenekeke`;
        
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
        
      } else {
        await ctx.editMessageText(
          `❌ *No Existing Account Found*\n\n` +
          `We couldn't find an existing virtual account for your email.\n\n` +
          `💡 Would you like to create a new account instead?`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💳 Create New Account', 'create_virtual_account')],
              [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Account retrieval error:', error);
      
      await ctx.editMessageText(
        `❌ *Account Retrieval Failed*\n\n` +
        `${error.message}\n\n` +
        `💡 *What to do:*\n` +
        `1. Contact support @opuenekeke\n` +
        `2. Try manual deposit option\n` +
        `3. Try creating a new account`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Try Create Account', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('📞 Contact Admin', 'contact_admin_direct')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
    }
    
  } catch (error) {
    console.error('❌ Retrieve account error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

// ========== RESTORE FROM BACKUP HANDLER ==========
async function handleRestoreFromBackup(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK TRIGGERED: restore_from_backup');
  
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('💾 Searching backup...');
    
    await ctx.editMessageText(
      `💾 *Restoring from Backup...*\n\n` +
      `Searching for your account in our backup system...`,
      { parse_mode: 'Markdown' }
    );
    
    // Try to load from backup
    let backupData = null;
    try {
      const { loadFromBackup } = require('../database');
      backupData = await loadFromBackup();
    } catch (backupError) {
      console.log('Backup module not available, using local method');
      // Fallback: try to read from backups folder
      const fs = require('fs');
      const path = require('path');
      const backupPath = path.join(__dirname, '../backups/users_backup.json');
      if (fs.existsSync(backupPath)) {
        backupData = { users: JSON.parse(fs.readFileSync(backupPath, 'utf8')) };
      }
    }
    
    if (backupData && backupData.users && backupData.users[telegramId]) {
      const userData = backupData.users[telegramId];
      let virtualAccount = null;
      
      if (backupData.virtualAccounts) {
        virtualAccount = Object.values(backupData.virtualAccounts).find(va => va.user_id === telegramId);
      }
      
      // Restore user data to current database
      const currentUsers = getUsers();
      currentUsers[telegramId] = {
        ...currentUsers[telegramId],
        wallet: userData.wallet || 0,
        email: userData.email,
        phone: userData.phone,
        firstName: userData.firstName,
        lastName: userData.lastName,
        pin: userData.pin,
        kycStatus: userData.kycStatus || 'pending'
      };
      setUsers(currentUsers);
      
      // Restore virtual account if exists in backup
      if (virtualAccount && !(await virtualAccounts.findByUserId(telegramId))) {
        await virtualAccounts.create({
          user_id: telegramId,
          account_number: virtualAccount.account_number,
          bank_name: virtualAccount.bank_name,
          account_name: virtualAccount.account_name,
          bank_code: virtualAccount.bank_code,
          reference: virtualAccount.reference,
          provider: virtualAccount.provider,
          is_active: true
        });
      }
      
      await saveAllData();
      
      await ctx.editMessageText(
        `✅ *Account Restored from Backup!*\n\n` +
        `💰 *Balance:* ₦${(userData.wallet || 0).toLocaleString()}\n` +
        `📧 *Email:* ${userData.email || 'Not set'}\n` +
        `📱 *Phone:* ${userData.phone || 'Not set'}\n` +
        `🔐 *PIN:* ${userData.pin ? '✅ Set' : '❌ Not set'}\n\n` +
        `${virtualAccount ? `🏦 *Virtual Account:* ${virtualAccount.account_number}\n` : ''}\n` +
        `Your account has been successfully restored from the last backup!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💰 Check Balance', 'check_balance')],
            [Markup.button.callback('🏦 View Account', 'view_my_account')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
    } else {
      await ctx.editMessageText(
        `❌ *No Backup Found*\n\n` +
        `No backup data found for your account.\n\n` +
        `💡 *What you can do:*\n` +
        `1. Create a new virtual account\n` +
        `2. Use manual deposit option\n` +
        `3. Contact support @opuenekeke for assistance`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Create New Account', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('📞 Contact Admin', 'contact_admin_direct')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
    }
  } catch (error) {
    console.error('❌ Restore from backup error:', error);
    await ctx.editMessageText(
      `❌ *Restore Failed*\n\n` +
      `Error: ${error.message}\n\n` +
      `Please contact support @opuenekeke for assistance.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      }
    );
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

async function handleCheckBalance(ctx, users, virtualAccounts) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    const user = await users.findById(telegramId);
    
    if (!user) {
      await ctx.reply('❌ User not found. Please /start first.');
      return;
    }
    
    await ctx.editMessageText(
      `💰 *Your Balance*\n\n` +
      `💵 Available: ₦${(user.wallet || 0).toLocaleString()}\n\n` +
      `Use /deposit to add funds.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏦 Deposit', 'create_virtual_account')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      }
    );
  } catch (error) {
    console.error('Check balance error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleViewMyAccount(ctx, users, virtualAccounts) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    const user = await users.findById(telegramId);
    const virtualAccount = await virtualAccounts.findByUserId(telegramId);
    
    if (!virtualAccount) {
      await ctx.editMessageText(
        `❌ *No Virtual Account Found*\n\n` +
        `Click below to create one:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Create Account', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      return;
    }
    
    await ctx.editMessageText(
      `💰 *Your Virtual Account*\n\n` +
      `🏦 *Bank:* ${virtualAccount.bank_name}\n` +
      `🔢 *Account Number:* \`${virtualAccount.account_number}\`\n` +
      `👤 *Name:* ${virtualAccount.account_name}\n` +
      `💵 *Balance:* ₦${(user.wallet || 0).toLocaleString()}\n\n` +
      `💡 Transfer to this account to deposit funds.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Get New Account', 'force_new_account')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      }
    );
  } catch (error) {
    console.error('View my account error:', error);
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
   5️⃣ WEBHOOK HANDLER WITH TRANSACTION TRACKING - FIXED VERSION
===================================================== */
function handleBillstackWebhook(bot, users, transactions, virtualAccounts) {
  return async (req, res) => {
    console.log('📥 Billstack webhook received');
    
    try {
      const payload = req.body;
      console.log('📦 Webhook payload:', JSON.stringify(payload, null, 2));
      
      if (payload.event === 'PAYMENT_NOTIFICATION' && payload.data?.type === 'RESERVED_ACCOUNT_TRANSACTION') {
        const paymentData = payload.data;
        const amount = parseFloat(paymentData.amount);
        const transactionRef = paymentData.transaction_ref || paymentData.reference;
        const accountNumber = paymentData.account?.account_number;
        
        console.log(`💰 Deposit received: ₦${amount}`);
        console.log(`🏦 Account number: ${accountNumber}`);
        console.log(`🔖 Reference: ${transactionRef}`);
        
        let userId = null;
        let user = null;
        
        const allUsers = getUsers();
        console.log(`📊 Total users: ${Object.keys(allUsers).length}`);
        
        if (virtualAccounts && virtualAccounts.findByAccountNumber) {
          const virtualAccount = await virtualAccounts.findByAccountNumber(accountNumber);
          if (virtualAccount && virtualAccount.user_id) {
            userId = virtualAccount.user_id;
            user = allUsers[userId];
            console.log(`✅ User found by account number: ${userId}`);
          }
        }
        
        if (!user && paymentData.customer?.email) {
          const customerEmail = paymentData.customer.email;
          console.log(`📧 Looking for email: ${customerEmail}`);
          
          for (const [id, userData] of Object.entries(allUsers)) {
            if (userData.email === customerEmail) {
              userId = id;
              user = userData;
              console.log(`✅ User found by email: ${userId}`);
              break;
            }
          }
        }
        
        if (!user && paymentData.merchant_reference) {
          const merchantRef = paymentData.merchant_reference;
          console.log(`🔍 Checking merchant reference: ${merchantRef}`);
          
          const match = merchantRef.match(/VTU-(\d+)-/);
          if (match && match[1]) {
            userId = match[1];
            user = allUsers[userId];
            if (user) {
              console.log(`✅ User found by merchant reference: ${userId}`);
            }
          }
        }
        
        if (user && userId) {
          const oldBalance = user.wallet || 0;
          const newBalance = oldBalance + amount;
          
          user.wallet = newBalance;
          const allUsersUpdated = getUsers();
          allUsersUpdated[userId] = user;
          setUsers(allUsersUpdated);
          await saveAllData();
          
          console.log(`✅✅✅ SUCCESS: Credited ₦${amount} to user ${userId}`);
          console.log(`   Balance: ₦${oldBalance} → ₦${newBalance}`);
          
          try {
            await recordTransaction(userId, {
              type: 'deposit',
              amount: amount,
              status: 'completed',
              description: `Wallet deposit via virtual account`,
              reference: transactionRef,
              metadata: { account_number: accountNumber }
            });
            console.log(`✅ Transaction recorded`);
          } catch (err) {
            console.warn('Transaction record error:', err.message);
          }
          
          try {
            await bot.telegram.sendMessage(
              userId,
              `💰 *DEPOSIT SUCCESSFUL!*\n\n` +
              `Amount: ₦${amount.toLocaleString()}\n` +
              `Reference: \`${transactionRef}\`\n\n` +
              `New Balance: ₦${newBalance.toLocaleString()}\n\n` +
              `Thank you for using Liteway!`,
              { parse_mode: 'Markdown' }
            );
            console.log(`✅ Telegram notification sent to ${userId}`);
          } catch (notifyErr) {
            console.error('Notification error:', notifyErr.message);
          }
        } else {
          console.log(`❌❌❌ CRITICAL: Could not find user for deposit!`);
          console.log(`   Account: ${accountNumber}`);
          console.log(`   Email: ${paymentData.customer?.email}`);
          console.log(`   Merchant Ref: ${paymentData.merchant_reference}`);
          
          console.log('📋 Registered users:');
          for (const [id, u] of Object.entries(allUsers)) {
            console.log(`   - ${id}: ${u.firstName || '?'} | Email: ${u.email || '?'}`);
          }
        }
      }
      
      res.status(200).json({ status: 'ok' });
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      res.status(200).json({ status: 'received' });
    }
  };
}

/* =====================================================
   6️⃣ SETUP FUNCTION
===================================================== */
function setupDepositHandlers(bot, users, virtualAccounts) {
  console.log('\n📋 SETTING UP DEPOSIT CALLBACK HANDLERS...');
  
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
  
  bot.action('retrieve_account', (ctx) => {
    console.log('🟢 retrieve_account callback triggered');
    return handleRetrieveAccount(ctx, users, virtualAccounts, bot);
  });
  
  bot.action('restore_from_backup', (ctx) => {
    console.log('🟢 restore_from_backup callback triggered');
    return handleRestoreFromBackup(ctx, users, virtualAccounts, bot);
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
  
  bot.action('check_balance', (ctx) => {
    console.log('🟢 check_balance callback triggered');
    return handleCheckBalance(ctx, users, virtualAccounts);
  });
  
  bot.action('view_my_account', (ctx) => {
    console.log('🟢 view_my_account callback triggered');
    return handleViewMyAccount(ctx, users, virtualAccounts);
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
  handleDeposit,
  handleDepositText,
  sessionManager,
  createVirtualAccountForUser,
  handleCreateVirtualAccount,
  handleForceNewAccount,
  handleRetrieveAccount,
  handleRestoreFromBackup,
  handleManualDeposit,
  handleCancelDeposit,
  handleChangeEmail,
  handleContactAdminDirect,
  handleCheckBalance,
  handleViewMyAccount,
  setupDepositHandlers,
  handleBillstackWebhook,
  generateReference,
  validateEmail,
  validatePhone,
  formatPhoneNumber
};
