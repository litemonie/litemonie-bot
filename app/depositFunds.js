/**
 * depositFunds.js - UPGRADED with Multi-Bank Fallback Support
 * Priority: PalmPay → Providus → 9PSB → SAFEHAVEN → BANKLY
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

// ========== UPGRADED: MULTI-BANK CONFIGURATION ==========
const CONFIG = {
  BILLSTACK_TOKEN: BILLSTACK_SECRET_KEY || BILLSTACK_API_KEY || '',
  BILLSTACK_BASE_URL: BILLSTACK_BASE_URL,
  BILLSTACK_WEBHOOK_SECRET: BILLSTACK_WEBHOOK_SECRET || '',
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  
  BILLSTACK_ENABLED: (BILLSTACK_SECRET_KEY || BILLSTACK_API_KEY) ? true : false,
  
  // UPGRADED: Banks in priority order
  SUPPORTED_BANKS: ['PALMPAY', 'PROVIDUS', '9PSB', 'SAFEHAVEN', 'BANKLY', 'WEMA', 'STERLING'],
  
  // Primary bank (tried first)
  DEFAULT_BANK: 'PALMPAY',
  
  // Fallback banks (tried in order if primary fails)
  FALLBACK_BANKS: ['PROVIDUS', '9PSB', 'SAFEHAVEN', 'BANKLY'],
  
  // Store which bank was last used for each user (optional)
  USER_BANK_PREFERENCE: {},
  
  TEST_MODE: !(BILLSTACK_SECRET_KEY || BILLSTACK_API_KEY),
  TEST_VIRTUAL_ACCOUNT: {
    bank_name: 'TEST BANK',
    account_number: `TEST${Date.now().toString().slice(-6)}`,
    account_name: 'TEST USER ACCOUNT',
    reference: 'TEST-REF',
    provider: 'test',
    bank_code: 'TEST',
    created_at: new Date(),
    is_active: true
  }
};

console.log('🔧 Billstack Configuration:');
console.log('- Base URL:', CONFIG.BILLSTACK_BASE_URL);
console.log('- Has Token:', !!CONFIG.BILLSTACK_TOKEN);
console.log('- Test Mode:', CONFIG.TEST_MODE);
console.log('- Banks Priority:', [CONFIG.DEFAULT_BANK, ...CONFIG.FALLBACK_BANKS].join(' → '));

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

// ========== UPGRADED: Multi-Bank Account Creation with Fallback ==========
async function createVirtualAccountWithFallback(user, virtualAccounts) {
  const banksToTry = [CONFIG.DEFAULT_BANK, ...CONFIG.FALLBACK_BANKS];
  const errors = [];
  
  console.log(`\n🏦 Starting multi-bank account creation for user ${user.telegramId}`);
  console.log(`📋 Banks to try in order: ${banksToTry.join(' → ')}`);
  
  for (let i = 0; i < banksToTry.length; i++) {
    const bank = banksToTry[i];
    console.log(`\n🔄 Attempt ${i + 1}/${banksToTry.length}: Trying ${bank}...`);
    
    try {
      const account = await createVirtualAccountForSpecificBank(user, virtualAccounts, bank);
      
      if (account && account.account_number) {
        console.log(`✅✅✅ SUCCESS! Account created with ${bank}`);
        console.log(`   Account: ${account.account_number}`);
        console.log(`   Name: ${account.account_name}`);
        
        // Store which bank was used for this user
        CONFIG.USER_BANK_PREFERENCE[user.telegramId] = bank;
        
        return {
          ...account,
          bank_used: bank,
          fallback_attempts: i
        };
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      console.log(`❌ ${bank} failed: ${errorMsg}`);
      errors.push({ bank, error: errorMsg });
      
      // If this is the last bank, throw all errors
      if (i === banksToTry.length - 1) {
        const errorSummary = errors.map(e => `${e.bank}: ${e.error}`).join('\n');
        throw new Error(`All banks failed:\n${errorSummary}`);
      }
      
      // Wait before trying next bank (avoid rate limiting)
      console.log(`⏳ Waiting 2 seconds before trying next bank...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('No banks available to create virtual account');
}

async function createVirtualAccountForSpecificBank(user, virtualAccounts, bankName) {
  try {
    console.log(`🏦 Creating account with ${bankName} for user ${user.telegramId}`);
    
    // FIRST: Check if user already has a virtual account in our database
    const existingAccount = await virtualAccounts.findByUserId(user.telegramId);
    
    if (existingAccount && existingAccount.is_active) {
      console.log('✅ User already has active virtual account in database:', existingAccount.account_number);
      return {
        ...existingAccount,
        note: 'Existing account retrieved from database',
        bank_used: existingAccount.bank_code
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
            bank_code: firstAccount.bank_id || bankName,
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
    }
    
    // THIRD: Create new account with specified bank
    console.log(`🆕 Creating new virtual account with ${bankName}...`);
    
    if (CONFIG.TEST_MODE) {
      console.log('🧪 TEST MODE: Creating test account');
      return {
        ...CONFIG.TEST_VIRTUAL_ACCOUNT,
        bank_name: `${bankName} BANK`,
        account_name: `${user.firstName || 'User'} ${user.lastName || ''}`.trim() || 'User Account',
        account_number: `TEST${bankName.substring(0, 3)}${user.telegramId.slice(-4)}${Date.now().toString().slice(-4)}`,
        bank_code: bankName,
        bank_used: bankName
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
      bank: bankName
    };

    console.log(`📤 Creating ${bankName} account with:`, {
      email: requestData.email,
      reference: requestData.reference,
      bank: requestData.bank,
      phone: requestData.phone
    });

    const response = await billstackClient.post(
      '/v2/thirdparty/generateVirtualAccount/',
      requestData
    );

    console.log(`📥 ${bankName} Response:`, response.data);

    if (!response.data.status) {
      // Special handling for "Multiple request" error - retry once
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
          
          console.log(`✅ Account created on retry with ${bankName}: ${firstAccount.account_number}`);
          
          return {
            bank_name: firstAccount.bank_name,
            account_number: firstAccount.account_number,
            account_name: firstAccount.account_name,
            reference: reference,
            provider: 'billstack',
            bank_code: firstAccount.bank_id || bankName,
            created_at: new Date(firstAccount.created_at || new Date()),
            is_active: true,
            bank_used: bankName
          };
        }
      }
      throw new Error(response.data.message || `Failed to create ${bankName} account`);
    }

    const accountData = response.data.data;
    if (!accountData || !accountData.account || accountData.account.length === 0) {
      throw new Error(`No account data returned from ${bankName}`);
    }

    const firstAccount = accountData.account[0];
    
    console.log(`✅ Account created successfully with ${bankName}: ${firstAccount.account_number}`);

    return {
      bank_name: firstAccount.bank_name,
      account_number: firstAccount.account_number,
      account_name: firstAccount.account_name,
      reference: reference,
      provider: 'billstack',
      bank_code: firstAccount.bank_id || bankName,
      created_at: new Date(firstAccount.created_at || new Date()),
      is_active: true,
      bank_used: bankName
    };

  } catch (error) {
    console.error(`❌ Failed to create ${bankName} account:`, error.message);
    
    if (error.response?.status === 401) {
      throw new Error('Invalid Billstack API token. Please contact admin.');
    }
    
    throw error;
  }
}

// Keep original function for backward compatibility
async function createVirtualAccountForUser(user, virtualAccounts) {
  return createVirtualAccountWithFallback(user, virtualAccounts);
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
      // Show existing account with bank info
      const bankEmoji = virtualAccount.bank_code === 'PALMPAY' ? '📱' : '🏦';
      await ctx.reply(
        `💰 *Your Account*\n\n` +
        `${bankEmoji} *Bank:* ${virtualAccount.bank_name}\n` +
        `🔢 *Account:* \`${virtualAccount.account_number}\`\n` +
        `👤 *Name:* ${virtualAccount.account_name}\n\n` +
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
      
      user.email = email;
      await users.update(telegramId, { email: email });
      console.log(`✅ Email saved: ${email}`);
      
      sessionManager.clearSession(telegramId);
      console.log('🗑️ Cleared email session');
      
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
      
      user.phone = phone;
      await users.update(telegramId, { phone: phone });
      console.log(`✅ Phone saved: ${phone}`);
      
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
      console.log('🚀 Starting virtual account creation with multi-bank fallback...');
      
      const existingAccount = await virtualAccounts.findByUserId(telegramId);
      
      if (existingAccount && existingAccount.is_active) {
        console.log('✅ User already has active account, displaying it...');
        
        const bankEmoji = existingAccount.bank_code === 'PALMPAY' ? '📱' : '🏦';
        let message = `✅ *Virtual Account Found!*\n\n`;
        message += `You already have an active account:\n\n`;
        message += `${bankEmoji} *Bank:* ${existingAccount.bank_name}\n`;
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
      
      // Use the new multi-bank fallback function
      const newAccount = await createVirtualAccountWithFallback({
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
              provider: newAccount.provider || 'billstack',
              bank_used: newAccount.bank_used,
              fallback_attempts: newAccount.fallback_attempts || 0
            }
          });
          console.log(`✅ Virtual account creation recorded for user ${telegramId}`);
        }
      } catch (dbError) {
        console.warn('⚠️ Could not record virtual account creation:', dbError.message);
      }
      
      const bankEmoji = newAccount.bank_used === 'PALMPAY' ? '📱' : '🏦';
      let message = `✅ *Virtual Account Created!*\n\n`;
      
      if (newAccount.fallback_attempts > 0) {
        message += `⚠️ *Note:* PalmPay was temporarily unavailable.\n`;
        message += `Your account was created with ${newAccount.bank_used} instead.\n\n`;
      }
      
      if (newAccount.provider === 'test') {
        message += `🧪 *TEST MODE*\n`;
        message += `This is a test account.\n\n`;
      }
      
      message += `${bankEmoji} *Bank:* ${newAccount.bank_name}\n`;
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

// Keep all other handlers (handleForceNewAccount, handleRetrieveAccount, etc.) the same as before
// They will automatically use the new multi-bank functions

// ... (rest of your existing handler functions remain the same)

/* =====================================================
   5️⃣ WEBHOOK HANDLER (unchanged)
===================================================== */
function handleBillstackWebhook(bot, users, transactions, virtualAccounts) {
  return async (req, res) => {
    // ... (keep your existing webhook handler code)
    console.log('📥 Billstack webhook received');
    res.status(200).json({ status: 'ok' });
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
  
  // ... (rest of your existing setup code)
  
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
  createVirtualAccountWithFallback,  // NEW: Export the multi-bank function
  createVirtualAccountForSpecificBank, // NEW: Export bank-specific function
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
