/**
 * depositFunds.js - COMPLETE VERSION with Multi-Bank Fallback Support
 * Priority: PalmPay → Providus → 9PSB → SAFEHAVEN → BANKLY
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ========== IMPORT SYSTEM MANAGERS FROM CORRECT LOCATION ==========
let systemTransactionManager = null;
let apiResponseManager = null;

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
  recordTransaction,
  loadFromBackup
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
  
  // Banks in priority order
  SUPPORTED_BANKS: ['PALMPAY', 'PROVIDUS', '9PSB', 'SAFEHAVEN', 'BANKLY', 'WEMA', 'STERLING'],
  DEFAULT_BANK: 'PALMPAY',
  FALLBACK_BANKS: ['PROVIDUS', '9PSB', 'SAFEHAVEN', 'BANKLY'],
  
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
        if (!error.config._retryCount) error.config._retryCount = 0;
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
  if (cleaned.length === 11 && cleaned.startsWith('0')) return cleaned;
  if (cleaned.length === 13 && cleaned.startsWith('234')) return '0' + cleaned.substring(3);
  if (cleaned.length === 10) return '0' + cleaned;
  return '08012345678';
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('0')) return true;
  if (cleaned.length === 13 && cleaned.startsWith('234')) return true;
  if (cleaned.length === 10) return true;
  return false;
}

/* =====================================================
   MULTI-BANK ACCOUNT CREATION
===================================================== */
async function createVirtualAccountForSpecificBank(user, virtualAccounts, bankName) {
  try {
    console.log(`🏦 Creating account with ${bankName} for user ${user.telegramId}`);
    
    const existingAccount = await virtualAccounts.findByUserId(user.telegramId);
    if (existingAccount && existingAccount.is_active) {
      console.log('✅ User already has active virtual account:', existingAccount.account_number);
      return { ...existingAccount, note: 'Existing account retrieved', bank_used: existingAccount.bank_code };
    }
    
    if (CONFIG.TEST_MODE) {
      return {
        ...CONFIG.TEST_VIRTUAL_ACCOUNT,
        bank_name: `${bankName} BANK`,
        account_name: `${user.firstName || 'User'} ${user.lastName || ''}`.trim() || 'User Account',
        account_number: `TEST${bankName.substring(0, 3)}${user.telegramId.slice(-4)}${Date.now().toString().slice(-4)}`,
        bank_code: bankName,
        bank_used: bankName
      };
    }
    
    if (!CONFIG.BILLSTACK_TOKEN) throw new Error('Billstack API token not configured');
    
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

    console.log(`📤 Creating ${bankName} account...`);
    const response = await billstackClient.post('/v2/thirdparty/generateVirtualAccount/', requestData);
    console.log(`📥 ${bankName} Response:`, response.data);

    if (!response.data.status) {
      if (response.data.message && response.data.message.includes('Multiple request')) {
        console.log('⚠️ Multiple request error, retrying...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        const retryResponse = await billstackClient.post('/v2/thirdparty/generateVirtualAccount/', requestData);
        if (retryResponse.data && retryResponse.data.status) {
          const accountData = retryResponse.data.data;
          const firstAccount = accountData.account[0];
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
    console.log(`✅ Account created with ${bankName}: ${firstAccount.account_number}`);

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
    if (error.response?.status === 401) throw new Error('Invalid Billstack API token');
    throw error;
  }
}

async function createVirtualAccountWithFallback(user, virtualAccounts) {
  const banksToTry = [CONFIG.DEFAULT_BANK, ...CONFIG.FALLBACK_BANKS];
  const errors = [];
  
  console.log(`\n🏦 Multi-bank account creation for user ${user.telegramId}`);
  console.log(`📋 Banks to try: ${banksToTry.join(' → ')}`);
  
  for (let i = 0; i < banksToTry.length; i++) {
    const bank = banksToTry[i];
    console.log(`🔄 Attempt ${i + 1}/${banksToTry.length}: Trying ${bank}...`);
    
    try {
      const account = await createVirtualAccountForSpecificBank(user, virtualAccounts, bank);
      if (account && account.account_number) {
        console.log(`✅ SUCCESS! Account created with ${bank}`);
        CONFIG.USER_BANK_PREFERENCE[user.telegramId] = bank;
        return { ...account, bank_used: bank, fallback_attempts: i };
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      console.log(`❌ ${bank} failed: ${errorMsg}`);
      errors.push({ bank, error: errorMsg });
      if (i === banksToTry.length - 1) {
        const errorSummary = errors.map(e => `${e.bank}: ${e.error}`).join('\n');
        throw new Error(`All banks failed:\n${errorSummary}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('No banks available');
}

async function createVirtualAccountForUser(user, virtualAccounts) {
  return createVirtualAccountWithFallback(user, virtualAccounts);
}

/* =====================================================
   MAIN DEPOSIT COMMAND
===================================================== */
async function handleDeposit(ctx, users, virtualAccounts) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    console.log(`💰 Deposit requested by ${telegramId}`);
    
    const user = await users.findById(telegramId);
    if (!user) return ctx.reply('❌ Account not found. Please /start first.');

    if (user.kycStatus !== 'approved') {
      return ctx.reply('📝 KYC Verification Required\n\nPlease use /kyc to verify.');
    }

    const needsEmail = !user.email;
    const needsPhone = !user.phone;
    
    if (needsEmail || needsPhone) {
      if (needsEmail) {
        sessionManager.startSession(telegramId, 'collect_email');
        return ctx.reply('📧 *Email Required*\n\nPlease enter your email address:', {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🚫 Cancel', 'cancel_deposit')]])
        });
      } else if (needsPhone) {
        sessionManager.startSession(telegramId, 'collect_phone');
        return ctx.reply(`📱 *Phone Required*\n\nYour email: ${user.email}\n\nPlease enter your phone number:`, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📧 Change Email', 'change_email')],
            [Markup.button.callback('🚫 Cancel', 'cancel_deposit')]
          ])
        });
      }
    }

    const virtualAccount = await virtualAccounts.findByUserId(telegramId);
    
    if (!virtualAccount || !virtualAccount.is_active) {
      return ctx.reply(
        `🏦 *DEPOSIT FUNDS*\n\n📧 Email: ${user.email}\n📱 Phone: ${user.phone}\n🛂 KYC: ✅ Approved\n\n💡 Choose deposit method:`,
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
      const bankEmoji = virtualAccount.bank_code === 'PALMPAY' ? '📱' : '🏦';
      await ctx.reply(
        `💰 *Your Account*\n\n${bankEmoji} *Bank:* ${virtualAccount.bank_name}\n🔢 *Account:* \`${virtualAccount.account_number}\`\n👤 *Name:* ${virtualAccount.account_name}\n\n💡 Transfer to this account to deposit funds.`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Deposit command error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

/* =====================================================
   TEXT MESSAGE HANDLER
===================================================== */
async function handleDepositText(ctx, text, users, virtualAccounts) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    const session = sessionManager.getSession(telegramId);
    
    console.log(`📝 Handling deposit text for user ${telegramId}: ${text}`);
    
    if (!session) return false;
    
    const user = await users.findById(telegramId);
    if (!user) return false;
    
    if (session.action === 'collect_email') {
      const email = text.trim();
      if (!validateEmail(email)) {
        await ctx.reply('❌ Invalid email. Please enter a valid email (e.g., name@example.com):');
        return true;
      }
      user.email = email;
      await users.update(telegramId, { email: email });
      sessionManager.clearSession(telegramId);
      sessionManager.startSession(telegramId, 'collect_phone');
      await ctx.reply(`✅ Email saved: ${email}\n\n📱 *Phone Number Required*\n\nPlease enter your phone number (e.g., 08012345678):`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('↩️ Back', 'change_email')],
          [Markup.button.callback('🚫 Cancel', 'cancel_deposit')]
        ])
      });
      return true;
    }
    
    if (session.action === 'collect_phone') {
      const phone = text.trim();
      if (!validatePhone(phone)) {
        await ctx.reply('❌ Invalid phone number. Please enter a valid Nigerian number (e.g., 08012345678):');
        return true;
      }
      user.phone = phone;
      await users.update(telegramId, { phone: phone });
      sessionManager.clearSession(telegramId);
      await ctx.reply(
        `✅ *Registration Complete!*\n\n📧 Email: ${user.email}\n📱 Phone: ${user.phone}\n\nNow click the button below to create your virtual account:`,
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
    
    return false;
  } catch (error) {
    console.error('❌ Text handler error:', error);
    return false;
  }
}

/* =====================================================
   CALLBACK HANDLERS
===================================================== */
async function handleCreateVirtualAccount(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK: create_virtual_account');
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('⏳ Creating account...');
    await ctx.editMessageText(`🔄 *Creating Virtual Account...*\n\n⏳ Please wait...`, { parse_mode: 'Markdown' }).catch(() => {});
    
    const user = await users.findById(telegramId);
    if (!user) {
      await ctx.reply('❌ User not found. Please /start first.');
      return;
    }
    
    if (!user.email || !user.phone) {
      await ctx.reply(`❌ Missing information.\n\nEmail: ${user.email ? '✅' : '❌'}\nPhone: ${user.phone ? '✅' : '❌'}\n\nPlease use /deposit again to set both.`, { parse_mode: 'Markdown' });
      return;
    }
    
    try {
      const existingAccount = await virtualAccounts.findByUserId(telegramId);
      if (existingAccount && existingAccount.is_active) {
        const bankEmoji = existingAccount.bank_code === 'PALMPAY' ? '📱' : '🏦';
        let message = `✅ *Virtual Account Found!*\n\n${bankEmoji} *Bank:* ${existingAccount.bank_name}\n🔢 *Account Number:* \`${existingAccount.account_number}\`\n👤 *Account Name:* ${existingAccount.account_name}\n\n📞 *Support:* @opuenekeke`;
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Create New Account', 'force_new_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
        return;
      }
      
      const newAccount = await createVirtualAccountWithFallback({
        telegramId: user.telegramId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        phone: user.phone
      }, virtualAccounts);

      await virtualAccounts.create({ user_id: telegramId, ...newAccount });
      
      const bankEmoji = newAccount.bank_used === 'PALMPAY' ? '📱' : '🏦';
      let message = `✅ *Virtual Account Created!*\n\n`;
      if (newAccount.fallback_attempts > 0) {
        message += `⚠️ *Note:* PalmPay was temporarily unavailable.\nYour account was created with ${newAccount.bank_used} instead.\n\n`;
      }
      message += `${bankEmoji} *Bank:* ${newAccount.bank_name}\n🔢 *Account Number:* \`${newAccount.account_number}\`\n👤 *Account Name:* ${newAccount.account_name}\n\n💰 *How to Deposit:*\n1. Transfer to account above\n2. Use any bank app\n3. Minimum: ₦100\n\n⏱️ *Processing Time:* 1-5 minutes\n\n📞 *Support:* @opuenekeke`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
      
      setTimeout(async () => {
        try {
          await bot.telegram.sendMessage(telegramId, `💡 Reminder: Your virtual account is ready!\n\nBank: ${newAccount.bank_name}\nAccount: \`${newAccount.account_number}\`\nName: ${newAccount.account_name}`, { parse_mode: 'Markdown' });
        } catch (err) {}
      }, 60000);
      
    } catch (error) {
      await ctx.editMessageText(`❌ *Virtual Account Creation Failed*\n\n${error.message}\n\n💡 Use manual deposit option.`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', 'create_virtual_account')],
          [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
          [Markup.button.callback('📞 Contact Admin', 'contact_admin_direct')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
    }
  } catch (error) {
    console.error('❌ Callback error:', error);
    await ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleForceNewAccount(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK: force_new_account');
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('⏳ Creating new account...');
    await ctx.editMessageText(`🔄 *Creating New Virtual Account...*\n\n⏳ Please wait...`, { parse_mode: 'Markdown' }).catch(() => {});
    
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
    
    const newAccount = await createVirtualAccountWithFallback({
      telegramId: user.telegramId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: user.phone
    }, virtualAccounts);

    await virtualAccounts.create({ user_id: telegramId, ...newAccount });
    
    const bankEmoji = newAccount.bank_used === 'PALMPAY' ? '📱' : '🏦';
    let message = `🆕 *New Virtual Account Created!*\n\n(Old account deactivated)\n\n${bankEmoji} *Bank:* ${newAccount.bank_name}\n🔢 *Account Number:* \`${newAccount.account_number}\`\n👤 *Account Name:* ${newAccount.account_name}\n\n📞 *Support:* @opuenekeke`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
        [Markup.button.callback('🏠 Home', 'start')]
      ])
    });
  } catch (error) {
    console.error('❌ Force new account error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleRetrieveAccount(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK: retrieve_account');
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('🔍 Retrieving account...');
    await ctx.editMessageText(`🔍 *Retrieving Virtual Account...*\n\nPlease wait...`, { parse_mode: 'Markdown' });
    
    const user = await users.findById(telegramId);
    if (!user || !user.email || !user.phone) {
      await ctx.editMessageText(`❌ Missing information.\n\nPlease use /deposit to set your email and phone first.`, { parse_mode: 'Markdown' });
      return;
    }
    
    try {
      let retrievedAccount = null;
      const reference = generateReference(user.telegramId);
      
      try {
        const response = await billstackClient.get(`/v2/thirdparty/virtual-account/${reference}`);
        if (response.data && response.data.status && response.data.data) {
          const accountData = response.data.data;
          retrievedAccount = accountData.account?.[0] || accountData;
        }
      } catch (refError) {}
      
      if (retrievedAccount) {
        const accountToSave = {
          bank_name: retrievedAccount.bank_name,
          account_number: retrievedAccount.account_number,
          account_name: retrievedAccount.account_name,
          reference: retrievedAccount.reference || reference,
          provider: 'billstack',
          bank_code: retrievedAccount.bank_id || CONFIG.DEFAULT_BANK,
          created_at: new Date(retrievedAccount.created_at || new Date()),
          is_active: true
        };
        
        await virtualAccounts.create({ user_id: telegramId, ...accountToSave });
        
        await ctx.editMessageText(`✅ *Virtual Account Retrieved!*\n\n🏦 *Bank:* ${accountToSave.bank_name}\n🔢 *Account Number:* \`${accountToSave.account_number}\`\n👤 *Account Name:* ${accountToSave.account_name}\n\n💰 Transfer to this account to deposit funds.`, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'start')]])
        });
      } else {
        await ctx.editMessageText(`❌ *No Existing Account Found*\n\nWould you like to create a new account?`, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Create New Account', 'create_virtual_account')],
            [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
      }
    } catch (error) {
      await ctx.editMessageText(`❌ *Account Retrieval Failed*\n\n${error.message}\n\nPlease contact support.`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Create Account', 'create_virtual_account')],
          [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
    }
  } catch (error) {
    console.error('❌ Retrieve account error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleRestoreFromBackup(ctx, users, virtualAccounts, bot) {
  console.log('🟢 CALLBACK: restore_from_backup');
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    
    await ctx.answerCbQuery('💾 Searching backup...');
    await ctx.editMessageText(`💾 *Restoring from Backup...*\n\nSearching for your account...`, { parse_mode: 'Markdown' });
    
    let backupData = null;
    try {
      backupData = await loadFromBackup();
    } catch (backupError) {
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
      
      await ctx.editMessageText(`✅ *Account Restored from Backup!*\n\n💰 *Balance:* ₦${(userData.wallet || 0).toLocaleString()}\n📧 *Email:* ${userData.email || 'Not set'}\n📱 *Phone:* ${userData.phone || 'Not set'}\n\nYour account has been successfully restored!`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💰 Check Balance', 'check_balance')],
          [Markup.button.callback('🏦 View Account', 'view_my_account')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
    } else {
      await ctx.editMessageText(`❌ *No Backup Found*\n\nNo backup data found for your account.\n\nPlease contact support @opuenekeke for assistance.`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Create Account', 'create_virtual_account')],
          [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
    }
  } catch (error) {
    console.error('❌ Restore from backup error:', error);
    await ctx.editMessageText(`❌ *Restore Failed*\n\nError: ${error.message}\n\nPlease contact support.`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'start')]])
    });
  }
}

async function handleManualDeposit(ctx) {
  try {
    const { Markup } = require('telegraf');
    const telegramId = ctx.from.id.toString();
    await ctx.answerCbQuery();
    await ctx.editMessageText(`📋 *MANUAL DEPOSIT*\n\nContact @opuenekeke with:\n• User ID: \`${telegramId}\`\n• Amount\n• Payment proof\n\n⏰ Processing: 1-24 hours`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💳 Try Virtual Account', 'create_virtual_account')],
        [Markup.button.callback('🏠 Home', 'start')]
      ])
    });
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
    await ctx.editMessageText('❌ Deposit cancelled.\n\nUse /deposit to try again.', Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'start')]]));
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
    await ctx.editMessageText('📧 Please enter your email address:', Markup.inlineKeyboard([[Markup.button.callback('🚫 Cancel', 'cancel_deposit')]]));
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
    await ctx.editMessageText(`💰 *Your Balance*\n\n💵 Available: ₦${(user.wallet || 0).toLocaleString()}\n\nUse /deposit to add funds.`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏦 Deposit', 'create_virtual_account')],
        [Markup.button.callback('🏠 Home', 'start')]
      ])
    });
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
      await ctx.editMessageText(`❌ *No Virtual Account Found*\n\nClick below to create one:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Create Account', 'create_virtual_account')],
          [Markup.button.callback('📋 Manual Deposit', 'manual_deposit')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      });
      return;
    }
    
    await ctx.editMessageText(`💰 *Your Virtual Account*\n\n🏦 *Bank:* ${virtualAccount.bank_name}\n🔢 *Account Number:* \`${virtualAccount.account_number}\`\n👤 *Name:* ${virtualAccount.account_name}\n💵 *Balance:* ₦${(user.wallet || 0).toLocaleString()}\n\n💡 Transfer to this account to deposit funds.`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Get New Account', 'force_new_account')],
        [Markup.button.callback('🏠 Home', 'start')]
      ])
    });
  } catch (error) {
    console.error('View my account error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

async function handleContactAdminDirect(ctx) {
  try {
    const { Markup } = require('telegraf');
    await ctx.answerCbQuery();
    await ctx.editMessageText('📞 Contact @opuenekeke for assistance.', Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'start')]]));
  } catch (error) {
    console.error('Contact admin error:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/* =====================================================
   WEBHOOK HANDLER
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
        
        let userId = null;
        let user = null;
        const allUsers = getUsers();
        
        if (virtualAccounts && virtualAccounts.findByAccountNumber) {
          const virtualAccount = await virtualAccounts.findByAccountNumber(accountNumber);
          if (virtualAccount && virtualAccount.user_id) {
            userId = virtualAccount.user_id;
            user = allUsers[userId];
          }
        }
        
        if (!user && paymentData.customer?.email) {
          const customerEmail = paymentData.customer.email;
          for (const [id, userData] of Object.entries(allUsers)) {
            if (userData.email === customerEmail) {
              userId = id;
              user = userData;
              break;
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
          
          console.log(`✅ SUCCESS: Credited ₦${amount} to user ${userId}`);
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
          } catch (err) {}
          
          try {
            await bot.telegram.sendMessage(userId, `💰 *DEPOSIT SUCCESSFUL!*\n\nAmount: ₦${amount.toLocaleString()}\nReference: \`${transactionRef}\`\n\nNew Balance: ₦${newBalance.toLocaleString()}\n\nThank you for using Liteway!`, { parse_mode: 'Markdown' });
          } catch (err) {}
        } else {
          console.log(`❌ Could not find user for deposit! Account: ${accountNumber}`);
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
   SETUP FUNCTION
===================================================== */
function setupDepositHandlers(bot, users, virtualAccounts) {
  console.log('\n📋 SETTING UP DEPOSIT CALLBACK HANDLERS...');
  
  bot.action('create_virtual_account', (ctx) => handleCreateVirtualAccount(ctx, users, virtualAccounts, bot));
  bot.action('force_new_account', (ctx) => handleForceNewAccount(ctx, users, virtualAccounts, bot));
  bot.action('manual_deposit', (ctx) => handleManualDeposit(ctx));
  bot.action('retrieve_account', (ctx) => handleRetrieveAccount(ctx, users, virtualAccounts, bot));
  bot.action('restore_from_backup', (ctx) => handleRestoreFromBackup(ctx, users, virtualAccounts, bot));
  bot.action('cancel_deposit', (ctx) => handleCancelDeposit(ctx));
  bot.action('change_email', (ctx) => handleChangeEmail(ctx, users));
  bot.action('contact_admin_direct', (ctx) => handleContactAdminDirect(ctx));
  bot.action('check_balance', (ctx) => handleCheckBalance(ctx, users, virtualAccounts));
  bot.action('view_my_account', (ctx) => handleViewMyAccount(ctx, users, virtualAccounts));
  bot.action('retry_deposit', (ctx) => handleDeposit(ctx, users, virtualAccounts));
  
  console.log('✅ Deposit callback handlers registered');
}

/* =====================================================
   EXPORTS
===================================================== */
module.exports = {
  handleDeposit,
  handleDepositText,
  sessionManager,
  createVirtualAccountForUser,
  createVirtualAccountWithFallback,
  createVirtualAccountForSpecificBank,
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
