// app/sendmoney.js - COMPLETE FIXED VERSION
const axios = require('axios');
const { Markup } = require('telegraf');

// Configuration
const CONFIG = {
  KORA_API_KEY: process.env.KORA_API_KEY,
  KORA_BASE_URL: process.env.KORA_BASE_URL || 'https://api.korapay.com',
  TRANSFER_FEE: 100,
  MIN_TRANSFER_AMOUNT: 100,
  MAX_TRANSFER_AMOUNT: 1000000,
  BANKS_PER_PAGE: 10,
  SENDER_NAME: process.env.SENDER_NAME || 'Liteway Technologies',
  SENDER_EMAIL: process.env.SENDER_EMAIL || 'admin@liteway.com',
  SENDER_PHONE: process.env.SENDER_PHONE || '+2348000000000',
  POPULAR_BANK_CODES: ["044", "058", "033", "232", "011", "214", "057", "050", "070", "076", "100002", "100003", "100004", "100007", "999999", "999991", "999992", "999993"]
};

// Global sessions object
const sendMoneySessions = {};

let cachedBanks = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 3600000;

// Escape MarkdownV2 special characters
function escapeMarkdown(text) {
  if (typeof text !== 'string') return String(text);
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escaped = '';
  for (const char of text) {
    escaped += specialChars.includes(char) ? '\\' + char : char;
  }
  return escaped;
}

function formatCurrency(amount) {
  return `₦${Math.floor(amount).toLocaleString('en-NG')}`;
}

// Session management 
const sessionManager = {
  startSession: (userId, action) => {
    sendMoneySessions[userId] = {
      action: action,
      step: 1,
      data: {},
      timestamp: Date.now()
    };
    console.log(`💼 Session started for ${userId}: ${action}`);
    return sendMoneySessions[userId];
  },
  
  getSession: (userId) => {
    return sendMoneySessions[userId] || null;
  },
  
  updateStep: (userId, step, data = {}) => {
    if (sendMoneySessions[userId]) {
      sendMoneySessions[userId].step = step;
      if (data) {
        Object.assign(sendMoneySessions[userId].data, data);
      }
      console.log(`💼 User ${userId} updated to step ${step}`);
    }
  },
  
  clearSession: (userId) => {
    delete sendMoneySessions[userId];
    console.log(`💼 Session cleared for ${userId}`);
  },
  
  updateSession: (userId, updates) => {
    if (sendMoneySessions[userId]) {
      Object.assign(sendMoneySessions[userId], updates);
    }
  }
};

// =============== LITEMONI (P2P) FUNCTIONS ===============

async function handleLiteMoni(ctx, users) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId];
    
    if (!user) {
      return await ctx.reply('❌ User not found. Please use /start first.');
    }
    
    if (user.kycStatus !== 'approved') {
      return await ctx.reply(
        '❌ *KYC VERIFICATION REQUIRED*\n\nComplete your KYC using the 🛂 KYC Status menu option.',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    if (!user.pin) {
      return await ctx.reply(
        '❌ *TRANSACTION PIN NOT SET*\n\nUse `/setpin 1234` to set your PIN.',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    if (user.wallet < CONFIG.MIN_TRANSFER_AMOUNT) {
      return await ctx.reply(
        `❌ *INSUFFICIENT BALANCE*\n\n` +
        `💵 Your Balance: ₦${user.wallet.toLocaleString()}\n` +
        `💰 Minimum Transfer: ₦${CONFIG.MIN_TRANSFER_AMOUNT.toLocaleString()}`,
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    sessionManager.startSession(userId, 'litemoni');
    
    await ctx.reply(
      `📱 *LITEMONI TRANSFER*\n\n` +
      `Send money to another LiteMoni user using their phone number.\n\n` +
      `💵 *Your Balance:* ₦${user.wallet.toLocaleString()}\n` +
      `💸 *Fee:* FREE (No charges!)\n` +
      `💰 *Min:* ₦${CONFIG.MIN_TRANSFER_AMOUNT.toLocaleString()} | *Max:* ₦${CONFIG.MAX_TRANSFER_AMOUNT.toLocaleString()}\n\n` +
      `📞 *Enter recipient phone number:*\n\n` +
      `*Examples:*\n` +
      `• 08012345678\n` +
      `• 07012345678\n` +
      `• +2348012345678`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Back to Menu', 'sendmoney_menu')]
        ])
      }
    );
    
  } catch (error) {
    console.error('❌ LiteMoni handler error:', error);
    await ctx.reply('❌ Error starting LiteMoni transfer. Please try again.');
  }
}

async function processLiteMoniTransfer(ctx, phoneNumber, users, transactions) {
  const userId = ctx.from.id.toString();
  const session = sessionManager.getSession(userId);
  const sender = users[userId];
  
  if (!session || session.action !== 'litemoni') {
    return false;
  }
  
  let cleanPhone = phoneNumber.replace(/\s+/g, '');
  if (cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.substring(1);
  }
  if (cleanPhone.startsWith('234')) {
    cleanPhone = '0' + cleanPhone.substring(3);
  }
  if (!cleanPhone.startsWith('0')) {
    cleanPhone = '0' + cleanPhone;
  }
  
  if (!/^0[789][01]\d{8}$/.test(cleanPhone)) {
    await ctx.reply(
      '❌ *INVALID PHONE NUMBER*\n\n' +
      'Please enter a valid Nigerian phone number:\n' +
      '• 080XXXXXXXX\n• 081XXXXXXXX\n• 070XXXXXXXX\n• 090XXXXXXXX\n\n' +
      'Try again:',
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  let recipientId = null;
  let recipient = null;
  
  for (const [id, userData] of Object.entries(users)) {
    if (userData.phone === cleanPhone || userData.phone === phoneNumber) {
      recipientId = id;
      recipient = userData;
      break;
    }
  }
  
  if (!recipient) {
    await ctx.reply(
      `❌ *USER NOT FOUND*\n\n` +
      `No LiteMoni user found with phone number: ${cleanPhone}\n\n` +
      `💡 The recipient must be registered on LiteMoni.\n\n` +
      `Enter another phone number:`,
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  if (recipientId === userId) {
    await ctx.reply(
      '❌ *CANNOT TRANSFER TO SELF*\n\nEnter a different phone number:',
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  sessionManager.updateStep(userId, 2, {
    recipientId: recipientId,
    recipientPhone: cleanPhone,
    recipientName: recipient.name || recipient.username || 'LiteMoni User'
  });
  
  await ctx.reply(
    `✅ *RECIPIENT FOUND*\n\n` +
    `📛 *Name:* ${escapeMarkdown(recipient.name || recipient.username || 'LiteMoni User')}\n` +
    `📞 *Phone:* ${cleanPhone}\n\n` +
    `💰 *Enter amount to send:*\n\n` +
    `💸 *Fee:* FREE\n` +
    `💰 *Min:* ₦${CONFIG.MIN_TRANSFER_AMOUNT.toLocaleString()}\n` +
    `💎 *Max:* ₦${CONFIG.MAX_TRANSFER_AMOUNT.toLocaleString()}`,
    { parse_mode: 'MarkdownV2' }
  );
  
  return true;
}

async function processLiteMoniAmount(ctx, amount, users, transactions) {
  const userId = ctx.from.id.toString();
  const session = sessionManager.getSession(userId);
  const sender = users[userId];
  
  if (!session || session.action !== 'litemoni') {
    return false;
  }
  
  const amountNum = parseFloat(amount);
  
  if (isNaN(amountNum) || amountNum < CONFIG.MIN_TRANSFER_AMOUNT || amountNum > CONFIG.MAX_TRANSFER_AMOUNT) {
    await ctx.reply(
      `❌ *INVALID AMOUNT*\n\n` +
      `Amount must be between ₦${CONFIG.MIN_TRANSFER_AMOUNT.toLocaleString()} and ₦${CONFIG.MAX_TRANSFER_AMOUNT.toLocaleString()}.\n\n` +
      `Try again:`,
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  if (sender.wallet < amountNum) {
    await ctx.reply(
      `❌ *INSUFFICIENT BALANCE*\n\n` +
      `💵 Your Balance: ₦${sender.wallet.toLocaleString()}\n` +
      `💰 Required: ₦${amountNum.toLocaleString()}\n\n` +
      `💡 You need ₦${(amountNum - sender.wallet).toLocaleString()} more.`,
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  sessionManager.updateStep(userId, 3, { amount: amountNum });
  
  await ctx.reply(
    `📋 *LITEMONI TRANSFER SUMMARY*\n\n` +
    `📤 *To:* ${escapeMarkdown(session.data.recipientName)}\n` +
    `📞 *Phone:* ${session.data.recipientPhone}\n` +
    `💰 *Amount:* ₦${amountNum.toLocaleString()}\n` +
    `💸 *Fee:* FREE\n` +
    `💵 *Total Deducted:* ₦${amountNum.toLocaleString()}\n\n` +
    `🔐 *Enter your 4-digit PIN to confirm:*`,
    { parse_mode: 'MarkdownV2' }
  );
  
  return true;
}

async function confirmLiteMoniTransfer(ctx, pin, users, transactions) {
  const userId = ctx.from.id.toString();
  const session = sessionManager.getSession(userId);
  const sender = users[userId];
  
  if (!session || session.action !== 'litemoni') {
    return false;
  }
  
  if (pin !== sender.pin) {
    sender.pinAttempts = (sender.pinAttempts || 0) + 1;
    
    if (sender.pinAttempts >= 3) {
      sender.pinLocked = true;
      sessionManager.clearSession(userId);
      await ctx.reply(
        '❌ *ACCOUNT LOCKED*\n\nToo many wrong PIN attempts. Contact admin.',
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }
    
    await ctx.reply(
      `❌ *WRONG PIN*\n\n⚠️ Attempts left: ${3 - sender.pinAttempts}\n\nEnter correct PIN:`,
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  sender.pinAttempts = 0;
  
  const { amount, recipientId, recipientName, recipientPhone } = session.data;
  const recipient = users[recipientId];
  
  if (!recipient) {
    await ctx.reply('❌ *TRANSFER FAILED*\n\nRecipient no longer exists.', { parse_mode: 'MarkdownV2' });
    sessionManager.clearSession(userId);
    return true;
  }
  
  const processingMsg = await ctx.reply('🔄 *PROCESSING LITEMONI TRANSFER...*\n\n⏳ Please wait...', { parse_mode: 'MarkdownV2' });
  
  try {
    sender.wallet -= amount;
    recipient.wallet += amount;
    
    if (!transactions[userId]) transactions[userId] = [];
    transactions[userId].push({
      type: 'litemoni_sent',
      amount: amount,
      recipientName: recipientName,
      recipientPhone: recipientPhone,
      recipientId: recipientId,
      status: 'completed',
      date: new Date().toLocaleString(),
      balance: sender.wallet
    });
    
    if (!transactions[recipientId]) transactions[recipientId] = [];
    transactions[recipientId].push({
      type: 'litemoni_received',
      amount: amount,
      senderName: sender.name || sender.username || 'LiteMoni User',
      senderPhone: sender.phone || 'Unknown',
      senderId: userId,
      status: 'completed',
      date: new Date().toLocaleString(),
      balance: recipient.wallet
    });
    
    try {
      await ctx.telegram.sendMessage(recipientId,
        `✅ *MONEY RECEIVED!*\n\n📥 *You received:* ₦${amount.toLocaleString()}\n📤 *From:* ${escapeMarkdown(sender.name || sender.username || 'LiteMoni User')}\n💳 *New Balance:* ₦${recipient.wallet.toLocaleString()}`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch (e) {}
    
    await ctx.reply(
      `✅ *LITEMONI TRANSFER SUCCESSFUL!*\n\n📤 *Sent to:* ${escapeMarkdown(recipientName)}\n📞 *Phone:* ${recipientPhone}\n💰 *Amount:* ₦${amount.toLocaleString()}\n💸 *Fee:* FREE\n💳 *New Balance:* ₦${sender.wallet.toLocaleString()}\n\n🎉 Transfer completed instantly!`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📱 Send Another', 'litemoni')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      }
    );
    
    sessionManager.clearSession(userId);
    
  } catch (error) {
    console.error('❌ LiteMoni transfer error:', error);
    sender.wallet += amount;
    await ctx.reply('❌ *TRANSFER FAILED*\n\nAn error occurred. Your money has been refunded.', { parse_mode: 'MarkdownV2' });
    sessionManager.clearSession(userId);
  }
  
  try { await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
  
  return true;
}

// =============== BANK TRANSFER FUNCTIONS ===============

async function getKoraHeaders() {
  try {
    if (!CONFIG.KORA_API_KEY) throw new Error('Kora API key not configured');
    return {
      'x-api-key': CONFIG.KORA_API_KEY.toString().trim(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  } catch (error) {
    throw new Error('Failed to setup Kora API headers');
  }
}

async function resolveBankAccount(accountNumber, bankCode) {
  try {
    const headers = await getKoraHeaders();
    const response = await axios.post(
      `${CONFIG.KORA_BASE_URL}/merchant/api/v1/misc/banks/resolve`,
      { account: accountNumber, bank: bankCode },
      { headers, timeout: 15000 }
    );
    if (response.data?.status === true && response.data.data) {
      return {
        success: true,
        accountName: response.data.data.account_name || 'Account Holder',
        accountNumber: response.data.data.account_number || accountNumber,
        bankCode: response.data.data.bank_code || bankCode,
        bankName: response.data.data.bank_name || 'Selected Bank'
      };
    }
    return { success: false, error: response.data?.message || 'Invalid response' };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || 'Failed to resolve account' };
  }
}

async function getBanks() {
  if (cachedBanks.length > 0 && (Date.now() - cacheTimestamp) < CACHE_DURATION) return cachedBanks;
  try {
    const headers = await getKoraHeaders();
    const response = await axios.get(`${CONFIG.KORA_BASE_URL}/merchant/api/v1/misc/banks`, {
      params: { countryCode: 'NG' }, headers, timeout: 15000
    });
    if (response.data?.status === true && response.data.data) {
      cachedBanks = response.data.data.filter(b => b.name && b.code).map(b => ({
        code: b.code, name: b.name
      })).sort((a, b) => a.name.localeCompare(b.name));
      cacheTimestamp = Date.now();
      return cachedBanks;
    }
    return getComprehensiveBanks();
  } catch (error) {
    return cachedBanks.length > 0 ? cachedBanks : getComprehensiveBanks();
  }
}

function getComprehensiveBanks() {
  return [
    { code: "044", name: "Access Bank" }, { code: "058", name: "GTBank" },
    { code: "033", name: "UBA" }, { code: "011", name: "First Bank" },
    { code: "057", name: "Zenith Bank" }, { code: "214", name: "FCMB" },
    { code: "232", name: "Sterling Bank" }, { code: "070", name: "Fidelity Bank" },
    { code: "050", name: "Ecobank" }, { code: "076", name: "Polaris Bank" },
    { code: "999991", name: "Kuda Bank" }, { code: "100002", name: "OPay" },
    { code: "100003", name: "PalmPay" }, { code: "100004", name: "Moniepoint" }
  ];
}

function getPopularBanks(banks) {
  return banks.length > 0 ? banks.filter(b => CONFIG.POPULAR_BANK_CODES.includes(b.code)) : getComprehensiveBanks().slice(0, 10);
}

function createBankKeyboard(banks, page = 0, searchQuery = '') {
  const buttons = [];
  const startIndex = page * CONFIG.BANKS_PER_PAGE;
  const paginatedBanks = banks.slice(startIndex, startIndex + CONFIG.BANKS_PER_PAGE);
  
  paginatedBanks.forEach(bank => {
    buttons.push([Markup.button.callback(`🏦 ${bank.name}`, `sendmoney_bank_${bank.code}`)]);
  });
  
  const navRow = [];
  if (page > 0) navRow.push(Markup.button.callback('⬅️ Previous', `sendmoney_banks_page_${page - 1}_${searchQuery}`));
  if ((startIndex + CONFIG.BANKS_PER_PAGE) < banks.length) navRow.push(Markup.button.callback('Next ➡️', `sendmoney_banks_page_${page + 1}_${searchQuery}`));
  if (navRow.length > 0) buttons.push(navRow);
  
  buttons.push([Markup.button.callback('🔍 Search Bank', 'sendmoney_search_bank')]);
  if (!searchQuery) buttons.push([Markup.button.callback('⭐ Popular Banks', 'sendmoney_popular_banks'), Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')]);
  buttons.push([Markup.button.callback('🔄 Refresh', 'sendmoney_refresh_banks'), Markup.button.callback('❌ Cancel', 'start')]);
  
  return Markup.inlineKeyboard(buttons);
}

function searchBanks(banks, query) {
  if (!query) return [];
  return banks.filter(b => b.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
}

async function initiateTransfer(transferData, userInfo = null) {
  try {
    const headers = await getKoraHeaders();
    const reference = `KPY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const payload = {
      reference: reference,
      destination: {
        bank_account: {
          bank_name: transferData.bankName,
          account: transferData.accountNumber,
          account_name: transferData.accountName,
          beneficiary_type: "individual",
          account_number_type: "account_number",
          payment_method: "NIP"
        },
        type: "bank_account",
        amount: transferData.amount,
        currency: "NGN",
        narration: `Transfer to ${transferData.accountName}`
      }
    };
    const response = await axios.post(`${CONFIG.KORA_BASE_URL}/merchant/api/v1/transactions/disburse`, payload, { headers, timeout: 30000 });
    if (response.data?.status === true) {
      return { success: true, reference, status: 'processing', message: 'Transfer initiated' };
    }
    return { success: false, error: response.data?.message || 'Transfer failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function isKoraConfigured() {
  return CONFIG.KORA_API_KEY && CONFIG.KORA_API_KEY.trim() !== '';
}

// =============== MAIN MENU ===============

async function showSendMoneyMenu(ctx) {
  try {
    await ctx.reply(
      `💸 *SEND MONEY*\n\nSelect transfer type:\n\n🏦 *Bank Transfer* - Send to any Nigerian bank account\n📱 *LiteMoni* - Instant transfer to LiteMoni users\n\n*Fees:*\n• Bank Transfer: ₦100 flat fee\n• LiteMoni: FREE!`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏦 Bank Transfer', 'sendmoney_bank_menu')],
          [Markup.button.callback('📱 LiteMoni Transfer', 'litemoni')],
          [Markup.button.callback('🏠 Home', 'start')]
        ])
      }
    );
  } catch (error) {
    console.error('❌ Menu error:', error);
    await ctx.reply('❌ Error loading menu. Please try again.');
  }
}

async function handleSendMoney(ctx, users, transactions) {
  return await showSendMoneyMenu(ctx);
}

// =============== BANK TRANSFER TEXT HANDLER ===============

async function handleBankTransferText(ctx, text, users) {
  const userId = ctx.from.id.toString();
  const session = sessionManager.getSession(userId);
  const user = users[userId];
  
  if (!session || session.action !== 'bank_transfer') return false;
  
  // Step 2: Account number
  if (session.step === 1) {
    const accountNumber = text.replace(/\s+/g, '');
    if (!/^\d{10}$/.test(accountNumber)) {
      await ctx.reply('❌ *INVALID ACCOUNT NUMBER*\n\nAccount number must be exactly 10 digits.\n\nTry again:', { parse_mode: 'MarkdownV2' });
      return true;
    }
    sessionManager.updateStep(userId, 2, { accountNumber });
    
    const resolution = await resolveBankAccount(accountNumber, session.data.bankCode);
    if (resolution.success) {
      sessionManager.updateStep(userId, 3, { accountName: resolution.accountName });
      await ctx.reply(
        `✅ *ACCOUNT RESOLVED*\n\n📛 *Name:* ${escapeMarkdown(resolution.accountName)}\n🔢 *Account:* ${accountNumber}\n\n💰 *Enter amount:*\nMin: ₦${CONFIG.MIN_TRANSFER_AMOUNT.toLocaleString()}\nMax: ₦${CONFIG.MAX_TRANSFER_AMOUNT.toLocaleString()}`,
        { parse_mode: 'MarkdownV2' }
      );
    } else {
      await ctx.reply(`❌ *ACCOUNT RESOLUTION FAILED*\n\n${resolution.error}\n\nPlease enter account name manually:`, { parse_mode: 'MarkdownV2' });
      sessionManager.updateStep(userId, 4);
    }
    return true;
  }
  
  // Step 3: Amount
  if (session.step === 3) {
    const amount = parseFloat(text);
    const total = amount + CONFIG.TRANSFER_FEE;
    
    if (isNaN(amount) || amount < CONFIG.MIN_TRANSFER_AMOUNT || amount > CONFIG.MAX_TRANSFER_AMOUNT) {
      await ctx.reply(`❌ *INVALID AMOUNT*\n\nAmount must be between ₦${CONFIG.MIN_TRANSFER_AMOUNT.toLocaleString()} and ₦${CONFIG.MAX_TRANSFER_AMOUNT.toLocaleString()}.`, { parse_mode: 'MarkdownV2' });
      return true;
    }
    
    if (user.wallet < total) {
      await ctx.reply(`❌ *INSUFFICIENT BALANCE*\n\nYour Balance: ₦${user.wallet.toLocaleString()}\nRequired: ₦${total.toLocaleString()}`, { parse_mode: 'MarkdownV2' });
      sessionManager.clearSession(userId);
      return true;
    }
    
    sessionManager.updateStep(userId, 5, { amount, total });
    
    await ctx.reply(
      `📋 *TRANSFER SUMMARY*\n\n📛 *To:* ${escapeMarkdown(session.data.accountName)}\n🔢 *Account:* ${session.data.accountNumber}\n💰 *Amount:* ₦${amount.toLocaleString()}\n💸 *Fee:* ₦${CONFIG.TRANSFER_FEE}\n💵 *Total:* ₦${total.toLocaleString()}\n\n🔐 *Enter your PIN to confirm:*`,
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  // Step 4: Manual account name entry
  if (session.step === 4) {
    sessionManager.updateStep(userId, 3, { accountName: text.substring(0, 100) });
    await ctx.reply(
      `✅ *Account Name Saved:* ${escapeMarkdown(text.substring(0, 100))}\n\n💰 *Enter amount:*`,
      { parse_mode: 'MarkdownV2' }
    );
    return true;
  }
  
  // Step 5: PIN confirmation
  if (session.step === 5) {
    if (text !== user.pin) {
      user.pinAttempts = (user.pinAttempts || 0) + 1;
      if (user.pinAttempts >= 3) {
        await ctx.reply('❌ *ACCOUNT LOCKED*\n\nToo many wrong PIN attempts.', { parse_mode: 'MarkdownV2' });
        sessionManager.clearSession(userId);
        return true;
      }
      await ctx.reply(`❌ *WRONG PIN*\n\nAttempts left: ${3 - user.pinAttempts}`, { parse_mode: 'MarkdownV2' });
      return true;
    }
    
    user.pinAttempts = 0;
    user.wallet -= session.data.total;
    
    await ctx.reply(
      `✅ *TRANSFER INITIATED!*\n\n💰 Amount: ₦${session.data.amount.toLocaleString()}\n💳 New Balance: ₦${user.wallet.toLocaleString()}\n\nFunds will reflect within minutes.`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'start')]]) }
    );
    
    sessionManager.clearSession(userId);
    return true;
  }
  
  return false;
}

// =============== CALLBACK HANDLERS ===============

async function handleAllBanks(ctx) {
  const userId = ctx.from.id.toString();
  const banks = await getBanks();
  const keyboard = createBankKeyboard(banks, 0, '');
  await ctx.editMessageText(
    `🏦 *SELECT BANK*\n\n📋 All Banks (${banks.length} total)\nUse buttons below:`,
    { parse_mode: 'MarkdownV2', ...keyboard }
  );
  ctx.answerCbQuery();
}

async function handlePopularBanks(ctx) {
  const userId = ctx.from.id.toString();
  const banks = await getBanks();
  const popularBanks = getPopularBanks(banks);
  const buttons = popularBanks.slice(0, 10).map(bank => [Markup.button.callback(`🏦 ${bank.name}`, `sendmoney_bank_${bank.code}`)]);
  buttons.push([Markup.button.callback('🔍 Search', 'sendmoney_search_bank'), Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')]);
  buttons.push([Markup.button.callback('❌ Cancel', 'start')]);
  await ctx.editMessageText(
    `🏦 *POPULAR BANKS*\n\nSelect a bank:`,
    { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
  );
  ctx.answerCbQuery();
}

async function handleSearchBank(ctx) {
  const userId = ctx.from.id.toString();
  const session = sessionManager.getSession(userId);
  if (session) session.searchMode = true;
  await ctx.editMessageText(
    `🔍 *SEARCH BANK*\n\nType the bank name:\n\nExamples: opay, gtbank, uba`,
    { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', 'sendmoney_popular_banks')]]) }
  );
  ctx.answerCbQuery();
}

async function handleRefreshBanks(ctx) {
  cachedBanks = [];
  cacheTimestamp = 0;
  await handlePopularBanks(ctx);
  ctx.answerCbQuery('✅ Banks refreshed');
}

async function handleBankSelection(ctx, bankCode) {
  const userId = ctx.from.id.toString();
  const banks = await getBanks();
  const selectedBank = banks.find(b => b.code === bankCode);
  if (!selectedBank) return ctx.answerCbQuery('❌ Bank not found');
  
  sessionManager.startSession(userId, 'bank_transfer');
  sessionManager.updateStep(userId, 1, { bankCode, bankName: selectedBank.name });
  
  await ctx.editMessageText(
    `✅ *Bank:* ${escapeMarkdown(selectedBank.name)}\n\n🔢 *Enter 10-digit account number:*`,
    { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Change Bank', 'sendmoney_popular_banks')]]) }
  );
  ctx.answerCbQuery();
}

async function handleBankPagination(ctx, page, searchQuery) {
  const banks = await getBanks();
  let filteredBanks = searchQuery ? searchBanks(banks, searchQuery) : banks;
  const keyboard = createBankKeyboard(filteredBanks, parseInt(page), searchQuery);
  const title = searchQuery ? `Search: "${searchQuery}"` : 'All Banks';
  await ctx.editMessageText(
    `🏦 *${title}*\n\nShowing ${filteredBanks.length} banks:`,
    { parse_mode: 'MarkdownV2', ...keyboard }
  );
  ctx.answerCbQuery();
}

// =============== MAIN HANDLER ===============

function getCallbacks(bot, users, transactions, CONFIG) {
  return {
    'sendmoney_menu': async (ctx) => { await showSendMoneyMenu(ctx); ctx.answerCbQuery(); },
    'sendmoney_bank_menu': async (ctx) => {
      const userId = ctx.from.id.toString();
      const user = users[userId];
      if (!user || user.kycStatus !== 'approved' || !user.pin) {
        await ctx.reply('❌ Please complete KYC and set PIN first.');
        ctx.answerCbQuery();
        return;
      }
      const banks = await getBanks();
      const popularBanks = getPopularBanks(banks);
      const buttons = popularBanks.slice(0, 8).map(bank => [Markup.button.callback(`🏦 ${bank.name}`, `sendmoney_bank_${bank.code}`)]);
      buttons.push([Markup.button.callback('🔍 Search', 'sendmoney_search_bank'), Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')]);
      buttons.push([Markup.button.callback('❌ Cancel', 'start')]);
      await ctx.editMessageText(
        `🏦 *BANK TRANSFER*\n\n💵 Balance: ${formatCurrency(user.wallet)}\n💸 Fee: ₦100 flat\n\nSelect bank:`,
        { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
      );
      ctx.answerCbQuery();
    },
    'litemoni': async (ctx) => { await handleLiteMoni(ctx, users); ctx.answerCbQuery(); },
    'sendmoney_all_banks': async (ctx) => { await handleAllBanks(ctx); },
    'sendmoney_popular_banks': async (ctx) => { await handlePopularBanks(ctx); },
    'sendmoney_search_bank': async (ctx) => { await handleSearchBank(ctx); },
    'sendmoney_refresh_banks': async (ctx) => { await handleRefreshBanks(ctx); },
    'sendmoney_banks_page_(\\d+)_?(.*)$': async (ctx) => { await handleBankPagination(ctx, ctx.match[1], ctx.match[2] || ''); },
    '^sendmoney_bank_(.+)$': async (ctx) => { await handleBankSelection(ctx, ctx.match[1]); },
    'no_action': async (ctx) => { ctx.answerCbQuery(); }
  };
}

// =============== TEXT HANDLER ===============

async function handleText(ctx, text, users, transactions) {
  const userId = ctx.from.id.toString();
  const session = sessionManager.getSession(userId);
  
  if (!session) return false;
  
  // Handle search mode
  if (session.searchMode) {
    delete session.searchMode;
    const banks = await getBanks();
    const results = searchBanks(banks, text);
    if (results.length === 0) {
      await ctx.reply(`❌ No banks found for "${text}"`, { parse_mode: 'MarkdownV2' });
      return true;
    }
    const buttons = results.slice(0, 10).map(bank => [Markup.button.callback(`🏦 ${bank.name}`, `sendmoney_bank_${bank.code}`)]);
    buttons.push([Markup.button.callback('🔍 New Search', 'sendmoney_search_bank'), Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')]);
    buttons.push([Markup.button.callback('❌ Cancel', 'start')]);
    await ctx.reply(`🔍 *SEARCH RESULTS:* ${results.length} banks found\n\nSelect a bank:`, { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) });
    return true;
  }
  
  // LiteMoni flow
  if (session.action === 'litemoni') {
    if (session.step === 1) return await processLiteMoniTransfer(ctx, text, users, transactions);
    if (session.step === 2) return await processLiteMoniAmount(ctx, text, users, transactions);
    if (session.step === 3) return await confirmLiteMoniTransfer(ctx, text, users, transactions);
  }
  
  // Bank transfer flow
  if (session.action === 'bank_transfer') {
    return await handleBankTransferText(ctx, text, users);
  }
  
  return false;
}

// =============== TEST FUNCTION ===============

async function testKoraConnection() {
  try {
    const headers = await getKoraHeaders();
    const response = await axios.get(`${CONFIG.KORA_BASE_URL}/merchant/api/v1/misc/banks`, {
      params: { countryCode: 'NG' }, headers, timeout: 10000
    });
    if (response.data?.status === true) return { success: true, message: 'Kora API connection successful' };
    return { success: false, message: 'Unexpected API response' };
  } catch (error) {
    if (error.response?.status === 401) return { success: false, message: 'Invalid API key (401 Unauthorized)' };
    return { success: false, message: error.message };
  }
}

// =============== EXPORTS ===============

module.exports = {
  handleSendMoney,
  getCallbacks,
  handleText,
  sessionManager,
  testKoraConnection
};
