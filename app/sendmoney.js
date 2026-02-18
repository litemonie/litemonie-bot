// app/sendmoney.js - FINAL FIXED VERSION WITH HEADER DEBUGGING
const axios = require('axios');
const { Markup } = require('telegraf');

// Configuration - REMOVED PERCENTAGE
const CONFIG = {
  KORA_API_KEY: process.env.KORA_API_KEY,               // Your Kora SECRET key 
  KORA_BASE_URL: process.env.KORA_BASE_URL || 'https://api.korapay.com',
  TRANSFER_FEE: 100,                                    // FLAT FEE - ₦100 fixed
  MIN_TRANSFER_AMOUNT: 100,
  MAX_TRANSFER_AMOUNT: 1000000,
  BANKS_PER_PAGE: 10,
  
  // Sender information (not used in single payouts but kept for reference)
  SENDER_NAME: process.env.SENDER_NAME || 'Liteway Technologies',
  SENDER_EMAIL: process.env.SENDER_EMAIL || 'admin@liteway.com',
  SENDER_PHONE: process.env.SENDER_PHONE || '+2348000000000',
  
  // Popular Nigerian banks including fintechs
  POPULAR_BANK_CODES: ["044", "058", "033", "232", "011", "214", "057", "050", "070", "076", "100002", "100003", "100004", "100007", "999999", "999991", "999992", "999993"]
};

// Global sessions object
const sendMoneySessions = {};

// Store banks in memory for quick access
let cachedBanks = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 3600000; // 1 hour cache

// Session management 
const sessionManager = {
  startSession: (userId, action) => {
    sendMoneySessions[userId] = {
      action: action,
      step: 1,
      data: {},
      timestamp: Date.now()
    };
    console.log(`💼 [SENDMONEY] Session started for ${userId}: ${action}`);
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
      console.log(`💼 [SENDMONEY] User ${userId} updated to step ${step}`);
    }
  },
  
  clearSession: (userId) => {
    delete sendMoneySessions[userId];
    console.log(`💼 [SENDMONEY] Session cleared for ${userId}`);
  },
  
  updateSession: (userId, updates) => {
    if (sendMoneySessions[userId]) {
      Object.assign(sendMoneySessions[userId], updates);
    }
  }
};

// Helper Functions
async function getKoraHeaders() {
  try {
    console.log('🔑 [SENDMONEY] Setting up Kora API headers...');
    
    if (!CONFIG.KORA_API_KEY) {
      console.error('❌ [SENDMONEY] Missing Kora API key');
      throw new Error('Kora API key not configured');
    }
    
    // Clean the API key - remove any whitespace
    const cleanKey = CONFIG.KORA_API_KEY.toString().trim();
    
    // Log first few characters of API key for debugging
    const keyPreview = cleanKey.substring(0, 8) + '...';
    console.log(`🔑 Using API key: ${keyPreview}`);
    console.log(`🔑 Key length: ${cleanKey.length} characters`);
    
    // Create headers object
    const headers = {
      'x-api-key': cleanKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    console.log('📤 Headers being sent:', JSON.stringify({
      'x-api-key': keyPreview,
      'Content-Type': headers['Content-Type'],
      'Accept': headers['Accept']
    }, null, 2));
    
    return headers;
  } catch (error) {
    console.error('❌ [SENDMONEY] Header setup error:', error.message);
    throw new Error('Failed to setup Kora API headers');
  }
}

async function resolveBankAccount(accountNumber, bankCode) {
  try {
    console.log(`🔍 [SENDMONEY] Resolving account via Kora: ${accountNumber}, bank: ${bankCode}`);
    
    const headers = await getKoraHeaders();
    
    const response = await axios.post(
      `${CONFIG.KORA_BASE_URL}/merchant/api/v1/misc/banks/resolve`,
      {
        account: accountNumber,
        bank: bankCode
      },
      {
        headers: headers,
        timeout: 15000
      }
    );
    
    if (response.data && response.data.status === true && response.data.data) {
      const data = response.data.data;
      
      return {
        success: true,
        accountName: data.account_name || 'Account Holder',
        accountNumber: data.account_number || accountNumber,
        bankCode: data.bank_code || bankCode,
        bankName: data.bank_name || 'Selected Bank'
      };
    } else {
      return {
        success: false,
        error: response.data.message || 'Invalid response from bank'
      };
    }
  } catch (error) {
    console.error('❌ [SENDMONEY] Kora account resolution error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to resolve account'
    };
  }
}

// Get banks with caching
async function getBanks() {
  if (cachedBanks.length > 0 && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    return cachedBanks;
  }
  
  try {
    console.log('🏦 [SENDMONEY] Fetching bank list from Kora...');
    const headers = await getKoraHeaders();
    
    const response = await axios.get(
      `${CONFIG.KORA_BASE_URL}/merchant/api/v1/misc/banks`,
      {
        params: { countryCode: 'NG' },
        headers: headers,
        timeout: 15000
      }
    );
    
    if (response.data && response.data.status === true && response.data.data) {
      const banks = response.data.data
        .filter(bank => bank.name && bank.code)
        .map(bank => ({
          code: bank.code,
          name: bank.name,
          slug: bank.slug,
          country: bank.country
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      cachedBanks = banks;
      cacheTimestamp = Date.now();
      console.log(`✅ [SENDMONEY] Loaded ${banks.length} banks`);
      return banks;
    } else {
      throw new Error('Invalid response from Kora API');
    }
  } catch (error) {
    console.error('❌ [SENDMONEY] Get banks error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      // If 401, provide clear error message
      if (error.response.status === 401) {
        console.error('❌ Invalid Kora API key. Please check your KORA_API_KEY in .env file');
      }
    }
    
    if (cachedBanks.length > 0) {
      return cachedBanks;
    }
    
    return getComprehensiveBanks();
  }
}

// Comprehensive bank list including fintechs (fallback)
function getComprehensiveBanks() {
  return [
    { code: "044", name: "Access Bank" },
    { code: "063", name: "Access Bank (Diamond)" },
    { code: "050", name: "Ecobank Nigeria" },
    { code: "070", name: "Fidelity Bank" },
    { code: "011", name: "First Bank of Nigeria" },
    { code: "214", name: "First City Monument Bank (FCMB)" },
    { code: "058", name: "Guaranty Trust Bank (GTBank)" },
    { code: "030", name: "Heritage Bank" },
    { code: "301", name: "Jaiz Bank" },
    { code: "082", name: "Keystone Bank" },
    { code: "076", name: "Polaris Bank" },
    { code: "101", name: "Providus Bank" },
    { code: "221", name: "Stanbic IBTC Bank" },
    { code: "068", name: "Standard Chartered Bank" },
    { code: "232", name: "Sterling Bank" },
    { code: "100", name: "Suntrust Bank" },
    { code: "032", name: "Union Bank of Nigeria" },
    { code: "033", name: "United Bank for Africa (UBA)" },
    { code: "215", name: "Unity Bank" },
    { code: "035", name: "Wema Bank" },
    { code: "057", name: "Zenith Bank" },
    { code: "999991", name: "Kuda Bank" },
    { code: "100002", name: "OPay" },
    { code: "100003", name: "PalmPay" },
    { code: "100004", name: "Moniepoint MFB" },
    { code: "100007", name: "VFD MFB" },
    { code: "999999", name: "Rubies MFB" },
    { code: "999992", name: "Mint MFB" },
    { code: "999993", name: "Sparkle MFB" },
    { code: "999994", name: "FairMoney MFB" },
    { code: "999995", name: "Carbon" },
    { code: "999996", name: "ALAT by Wema" },
    { code: "999997", name: "Eyowo" },
    { code: "999998", name: "OnePipe" },
    { code: "801", name: "Coronation Merchant Bank" },
    { code: "614", name: "FSDH Merchant Bank" },
    { code: "502", name: "Rand Merchant Bank" },
    { code: "508", name: "Suntrust Bank Nigeria" },
    { code: "513", name: "ALAT by Wema" },
    { code: "999", name: "Fortis Mobile" }
  ].sort((a, b) => a.name.localeCompare(b.name));
}

// Search banks by name
function searchBanks(banks, query) {
  if (!query || query.trim() === '') return [];
  
  const searchTerm = query.toLowerCase().trim();
  return banks.filter(bank => 
    bank.name.toLowerCase().includes(searchTerm)
  ).slice(0, 10);
}

// Get popular banks
function getPopularBanks(banks) {
  if (banks.length > 0 && banks[0].code) {
    return banks.filter(bank => 
      CONFIG.POPULAR_BANK_CODES.includes(bank.code)
    ).sort((a, b) => {
      const indexA = CONFIG.POPULAR_BANK_CODES.indexOf(a.code);
      const indexB = CONFIG.POPULAR_BANK_CODES.indexOf(b.code);
      return indexA - indexB;
    });
  }
  
  return [
    { code: "044", name: "Access Bank" },
    { code: "058", name: "GTBank" },
    { code: "033", name: "UBA" },
    { code: "011", name: "First Bank" },
    { code: "057", name: "Zenith Bank" },
    { code: "214", name: "FCMB" },
    { code: "232", name: "Sterling Bank" },
    { code: "070", name: "Fidelity Bank" },
    { code: "050", name: "Ecobank" },
    { code: "076", name: "Polaris Bank" },
    { code: "999991", name: "Kuda Bank" },
    { code: "100002", name: "OPay" },
    { code: "100003", name: "PalmPay" },
    { code: "100004", name: "Moniepoint MFB" },
    { code: "100007", name: "VFD MFB" },
    { code: "999999", name: "Rubies MFB" }
  ];
}

// Create bank selection keyboard
function createBankKeyboard(banks, page = 0, searchQuery = '') {
  const buttons = [];
  const banksPerPage = CONFIG.BANKS_PER_PAGE;
  const startIndex = page * banksPerPage;
  const endIndex = startIndex + banksPerPage;
  const paginatedBanks = banks.slice(startIndex, endIndex);
  
  if (searchQuery) {
    buttons.push([
      Markup.button.callback(`🔍 Results for: "${searchQuery.substring(0, 15)}..."`, 'no_action')
    ]);
  }
  
  paginatedBanks.forEach(bank => {
    let emoji = "🏦";
    
    if (bank.name.includes("OPay") || bank.code === "100002") emoji = "📱";
    else if (bank.name.includes("PalmPay") || bank.code === "100003") emoji = "🌴";
    else if (bank.name.includes("Moniepoint") || bank.code === "100004") emoji = "💳";
    else if (bank.name.includes("Kuda") || bank.code === "999991") emoji = "⚡";
    else if (bank.name.includes("Rubies") || bank.code === "999999") emoji = "💎";
    else if (bank.name.includes("VFD") || bank.code === "100007") emoji = "🏢";
    else if (bank.name.includes("Sparkle") || bank.code === "999993") emoji = "✨";
    
    const displayName = bank.name.length > 25 ? bank.name.substring(0, 22) + '...' : bank.name;
    buttons.push([
      Markup.button.callback(`${emoji} ${displayName}`, `sendmoney_bank_${bank.code}`)
    ]);
  });
  
  const navRow = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('⬅️ Previous', `sendmoney_banks_page_${page - 1}_${searchQuery}`));
  }
  if (endIndex < banks.length) {
    navRow.push(Markup.button.callback('Next ➡️', `sendmoney_banks_page_${page + 1}_${searchQuery}`));
  }
  if (navRow.length > 0) {
    buttons.push(navRow);
  }
  
  buttons.push([
    Markup.button.callback('🔍 Search Bank', 'sendmoney_search_bank')
  ]);
  
  if (!searchQuery) {
    buttons.push([
      Markup.button.callback('⭐ Popular Banks', 'sendmoney_popular_banks'),
      Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')
    ]);
  }
  
  buttons.push([
    Markup.button.callback('🔄 Refresh', 'sendmoney_refresh_banks'),
    Markup.button.callback('❌ Cancel', 'start')
  ]);
  
  return Markup.inlineKeyboard(buttons);
}

// FIXED: CORRECT Kora API payload structure based on official documentation
async function initiateTransfer(transferData, userInfo = null) {
  try {
    console.log('💸 [SENDMONEY] Initiating transfer via Kora...');
    console.log('📤 Transfer Data:', JSON.stringify(transferData, null, 2));
    
    const headers = await getKoraHeaders(); // Now using x-api-key
    const reference = `KPY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let narration = transferData.narration || `Transfer to ${transferData.accountName}`;
    if (userInfo) {
      const senderName = userInfo.name || userInfo.username || `User ${userInfo.id}`;
      narration = `From ${senderName}: ${narration}`;
    }
    
    // Split the account name into first and last name (if possible)
    const nameParts = transferData.accountName.split(' ');
    const firstName = nameParts[0] || transferData.accountName;
    const lastName = nameParts.slice(1).join(' ') || 'Customer';
    
    // Get bank name from bank code
    const bankName = transferData.bankName || getBankNameFromCode(transferData.bankCode);
    
    // CORRECT payload based on Kora API documentation
    const payload = {
      reference: reference,
      destination: {
        bank_account: {
          bank_name: bankName,
          account: transferData.accountNumber,
          account_name: transferData.accountName,
          beneficiary_type: "individual",
          first_name: firstName,
          last_name: lastName,
          account_number_type: "account_number",
          payment_method: "NIP",
          address_information: {
            country: "NG",
            city: "Lagos",
            state: "Lagos",
            zip_code: "100001",
            street: "Street Address",
            full_address: "Street Address, Lagos, Nigeria"
          }
        },
        type: "bank_account",
        amount: transferData.amount,
        currency: "NGN",
        narration: narration,
        customer: {
          name: transferData.accountName,
          email: `${transferData.accountName.replace(/\s+/g, '').toLowerCase()}@customer.com`
        }
      }
    };
    
    console.log('📤 Kora API Payload:', JSON.stringify(payload, null, 2));
    
    // Make the request with explicit headers
    const response = await axios({
      method: 'post',
      url: `${CONFIG.KORA_BASE_URL}/merchant/api/v1/transactions/disburse`,
      data: payload,
      headers: headers,
      timeout: 30000
    });
    
    console.log('📥 Kora API Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.status === true) {
      return {
        success: true,
        reference: reference,
        koraReference: response.data.data?.reference || reference,
        amount: response.data.data?.amount || transferData.amount,
        fee: response.data.data?.fee || CONFIG.TRANSFER_FEE,
        status: response.data.data?.status || 'processing',
        message: response.data.message || 'Transfer initiated successfully'
      };
    } else {
      console.error('❌ Kora API Error Response:', response.data);
      return {
        success: false,
        error: response.data.message || 'Transfer initiation failed',
        details: response.data
      };
    }
    
  } catch (error) {
    console.error('❌ [SENDMONEY] Kora transfer initiation error:', error.message);
    if (error.response) {
      console.error('❌ Kora Error Status:', error.response.status);
      console.error('❌ Kora Error Data:', JSON.stringify(error.response.data, null, 2));
      
      // Provide more helpful error messages based on status code
      let errorMessage = 'Transfer failed';
      if (error.response.status === 401) {
        errorMessage = 'Invalid API key. Please check your KORA_API_KEY.';
      } else if (error.response.status === 422) {
        if (error.response.data?.data) {
          const errors = Object.entries(error.response.data.data)
            .map(([field, err]) => `${field}: ${err.message}`)
            .join(', ');
          errorMessage = `Validation error: ${errors}`;
        } else {
          errorMessage = 'Invalid transfer details. Please check recipient account and bank details.';
        }
      } else if (error.response.status === 400) {
        errorMessage = 'Bad request. Please verify all transfer details.';
      }
      
      return {
        success: false,
        error: errorMessage,
        details: error.response.data
      };
    }
    return {
      success: false,
      error: error.message || 'Transfer failed'
    };
  }
}

// Helper function to get bank name from bank code
function getBankNameFromCode(bankCode) {
  const bankMap = {
    "044": "Access Bank",
    "063": "Access Bank (Diamond)",
    "050": "Ecobank Nigeria",
    "070": "Fidelity Bank",
    "011": "First Bank of Nigeria",
    "214": "First City Monument Bank (FCMB)",
    "058": "Guaranty Trust Bank (GTBank)",
    "030": "Heritage Bank",
    "301": "Jaiz Bank",
    "082": "Keystone Bank",
    "076": "Polaris Bank",
    "101": "Providus Bank",
    "221": "Stanbic IBTC Bank",
    "068": "Standard Chartered Bank",
    "232": "Sterling Bank",
    "100": "Suntrust Bank",
    "032": "Union Bank of Nigeria",
    "033": "United Bank for Africa (UBA)",
    "215": "Unity Bank",
    "035": "Wema Bank",
    "057": "Zenith Bank",
    "999991": "Kuda Bank",
    "100002": "OPay",
    "100003": "PalmPay",
    "100004": "Moniepoint MFB",
    "100007": "VFD MFB",
    "999999": "Rubies MFB",
    "999992": "Mint MFB",
    "999993": "Sparkle MFB",
    "999994": "FairMoney MFB",
    "999995": "Carbon",
    "999996": "ALAT by Wema",
    "999997": "Eyowo",
    "999998": "OnePipe",
    "801": "Coronation Merchant Bank",
    "614": "FSDH Merchant Bank",
    "502": "Rand Merchant Bank",
    "508": "Suntrust Bank Nigeria",
    "513": "ALAT by Wema",
    "999": "Fortis Mobile"
  };
  
  return bankMap[bankCode] || 'Selected Bank';
}

async function getTransferStatus(reference) {
  try {
    console.log(`📊 [SENDMONEY] Checking transfer status for: ${reference}`);
    
    const headers = await getKoraHeaders();
    
    const response = await axios.get(
      `${CONFIG.KORA_BASE_URL}/merchant/api/v1/payouts`,
      {
        params: { reference: reference },
        headers: headers,
        timeout: 10000
      }
    );
    
    if (response.data && response.data.data) {
      const payoutData = response.data.data;
      const transaction = Array.isArray(payoutData) 
        ? payoutData.find(t => t.reference === reference)
        : payoutData;
      
      if (transaction) {
        return {
          success: true,
          status: transaction.status || 'unknown',
          amount: transaction.amount,
          fee: transaction.fee,
          message: transaction.message || 'Transaction found',
          completedAt: transaction.date_completed
        };
      }
    }
    
    return {
      success: true,
      status: 'processing',
      message: 'Transaction is being processed'
    };
    
  } catch (error) {
    console.error('❌ [SENDMONEY] Status check error:', error.message);
    return {
      success: false,
      error: 'Unable to check status'
    };
  }
}

function formatCurrency(amount) {
  return `₦${Math.floor(amount).toLocaleString('en-NG')}`;
}

// FIXED: PROPER MarkdownV2 escaping function
function escapeMarkdown(text) {
  if (typeof text !== 'string') return String(text);
  
  // List of all special characters in MarkdownV2 that need escaping
  // _ * [ ] ( ) ~ ` > # + - = | { } . !
  const specialChars = [
    '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'
  ];
  
  let escaped = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (specialChars.includes(char)) {
      escaped += '\\' + char;
    } else {
      escaped += char;
    }
  }
  
  return escaped;
}

function isKoraConfigured() {
  console.log('🔍 [SENDMONEY] Checking Kora configuration...');
  
  const configs = {
    'KORA_API_KEY': CONFIG.KORA_API_KEY,
    'SENDER_NAME': CONFIG.SENDER_NAME,
    'SENDER_EMAIL': CONFIG.SENDER_EMAIL,
    'SENDER_PHONE': CONFIG.SENDER_PHONE
  };
  
  let allValid = true;
  for (const [key, value] of Object.entries(configs)) {
    const isValid = value && value !== 'undefined' && value !== 'null' && value.toString().trim() !== '';
    if (!isValid) allValid = false;
  }
  
  return allValid;
}

// Test Kora API connection
async function testKoraConnection() {
  try {
    console.log('🧪 Testing Kora API connection...');
    const headers = await getKoraHeaders();
    
    console.log('📤 Making test request with headers:', JSON.stringify({
      'x-api-key': headers['x-api-key'].substring(0, 8) + '...',
      'Content-Type': headers['Content-Type']
    }, null, 2));
    
    const response = await axios.get(
      `${CONFIG.KORA_BASE_URL}/merchant/api/v1/misc/banks`,
      {
        params: { countryCode: 'NG' },
        headers: headers,
        timeout: 10000
      }
    );
    
    if (response.data && response.data.status === true) {
      console.log('✅ Kora API connection successful!');
      console.log(`📊 Found ${response.data.data?.length || 0} banks`);
      return { success: true, message: 'Kora API connection successful' };
    } else {
      console.error('❌ Kora API returned unexpected response');
      return { success: false, message: 'Unexpected API response' };
    }
  } catch (error) {
    console.error('❌ Kora API test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      if (error.response.status === 401) {
        return { success: false, message: 'Invalid API key (401 Unauthorized)' };
      }
      return { success: false, message: `API Error: ${error.response.status}` };
    }
    return { success: false, message: error.message };
  }
}

// Main handler - WITH KYC INTEGRATION
async function handleSendMoney(ctx, users, transactions) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId];
    
    if (!user) {
      return await ctx.reply(
        '❌ User not found\\. Please use /start first\\.',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    // KYC check
    if (user.kycStatus !== 'approved') {
      return await ctx.reply(
        '❌ *KYC VERIFICATION REQUIRED*\n\n' +
        '📝 Your account needs verification\\.\n\n' +
        '🛂 *To Get Verified\\:*\n' +
        'Complete your KYC using the 🛂 KYC Status menu option\n' +
        'or contact @opuenekeke with your User ID',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    if (!user.pin) {
      return await ctx.reply(
        '❌ *TRANSACTION PIN NOT SET*\n\n' +
        '🔐 Set PIN\\: `/setpin 1234`',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    if (!isKoraConfigured()) {
      return await ctx.reply(
        '❌ *BANK TRANSFER SERVICE UNAVAILABLE*\n\n' +
        'Contact admin for assistance\\.',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    if (user.wallet < CONFIG.MIN_TRANSFER_AMOUNT) {
      return await ctx.reply(
        `❌ *INSUFFICIENT BALANCE*\n\n` +
        `💵 Your Balance\\: ${escapeMarkdown(formatCurrency(user.wallet))}\n` +
        `💰 Minimum Transfer\\: ${escapeMarkdown(formatCurrency(CONFIG.MIN_TRANSFER_AMOUNT))}\n\n` +
        `💳 Use "💳 Deposit Funds" to add money`,
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    sessionManager.startSession(userId, 'send_money');
    
    const banks = await getBanks();
    const popularBanks = getPopularBanks(banks);
    
    const initialButtons = [];
    
    initialButtons.push([
      Markup.button.callback('📱 FINTECH BANKS', 'no_action')
    ]);
    
    const fintechBanks = popularBanks.filter(bank => 
      ["100002", "100003", "100004", "999991", "100007", "999999"].includes(bank.code)
    ).slice(0, 4);
    
    fintechBanks.forEach(bank => {
      let emoji = "📱";
      if (bank.code === "100003") emoji = "🌴";
      else if (bank.code === "100004") emoji = "💳";
      else if (bank.code === "999991") emoji = "⚡";
      
      initialButtons.push([
        Markup.button.callback(`${emoji} ${bank.name}`, `sendmoney_bank_${bank.code}`)
      ]);
    });
    
    initialButtons.push([
      Markup.button.callback('🏦 TRADITIONAL BANKS', 'no_action')
    ]);
    
    const traditionalBanks = popularBanks.filter(bank => 
      !["100002", "100003", "100004", "999991", "100007", "999999"].includes(bank.code)
    ).slice(0, 6);
    
    traditionalBanks.forEach(bank => {
      initialButtons.push([
        Markup.button.callback(`🏦 ${bank.name}`, `sendmoney_bank_${bank.code}`)
      ]);
    });
    
    initialButtons.push([
      Markup.button.callback('🔍 Search Bank', 'sendmoney_search_bank'),
      Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')
    ]);
    
    initialButtons.push([
      Markup.button.callback('🔄 Refresh', 'sendmoney_refresh_banks'),
      Markup.button.callback('❌ Cancel', 'start')
    ]);
    
    const balanceText = escapeMarkdown(formatCurrency(user.wallet));
    const minText = escapeMarkdown(formatCurrency(CONFIG.MIN_TRANSFER_AMOUNT));
    const maxText = escapeMarkdown(formatCurrency(CONFIG.MAX_TRANSFER_AMOUNT));
    
    await ctx.reply(
      `🏦 *TRANSFER TO BANK ACCOUNT*\n\n` +
      `🔐 *Powered by KoraPay*\n\n` +
      `💵 *Your Balance\\:* ${balanceText}\n` +
      `💸 *Transfer Fee\\:* ₦100 flat\n` +
      `💰 *Min\\:* ${minText} \\| *Max\\:* ${maxText}\n\n` +
      `📋 *Select Bank\\:*`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(initialButtons)
      }
    );
    
  } catch (error) {
    console.error('❌ [SENDMONEY] Send money handler error:', error);
    await ctx.reply(
      '❌ *TRANSFER ERROR*\n\nFailed to initialize transfer\\. Please try again\\.',
      { parse_mode: 'MarkdownV2' }
    );
  }
}

// Handle callback queries
function getCallbacks(bot, users, transactions, CONFIG) {
  return {
    'sendmoney_all_banks': async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const banks = await getBanks();
        const keyboard = createBankKeyboard(banks, 0, '');
        
        await ctx.editMessageText(
          `🏦 *SELECT BANK*\n\n` +
          `🔐 *Powered by KoraPay*\n\n` +
          `📋 *All Banks \\(A\\-Z\\)*\n` +
          `📊 Total: ${banks.length} banks\n\n` +
          `Use the buttons below to navigate\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...keyboard
          }
        );
        
        ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ [SENDMONEY] All banks error:', error);
        ctx.answerCbQuery('❌ Error loading banks');
      }
    },
    
    'sendmoney_popular_banks': async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const banks = await getBanks();
        const popularBanks = getPopularBanks(banks);
        
        const buttons = [];
        
        buttons.push([
          Markup.button.callback('📱 FINTECH BANKS', 'no_action')
        ]);
        
        const fintechBanks = popularBanks.filter(bank => 
          ["100002", "100003", "100004", "999991", "100007", "999999"].includes(bank.code)
        );
        
        fintechBanks.forEach(bank => {
          let emoji = "📱";
          if (bank.code === "100003") emoji = "🌴";
          else if (bank.code === "100004") emoji = "💳";
          else if (bank.code === "999991") emoji = "⚡";
          else if (bank.code === "100007") emoji = "🏢";
          else if (bank.code === "999999") emoji = "💎";
          
          buttons.push([
            Markup.button.callback(`${emoji} ${bank.name}`, `sendmoney_bank_${bank.code}`)
          ]);
        });
        
        buttons.push([
          Markup.button.callback('🏦 TRADITIONAL BANKS', 'no_action')
        ]);
        
        const traditionalBanks = popularBanks.filter(bank => 
          !["100002", "100003", "100004", "999991", "100007", "999999"].includes(bank.code)
        );
        
        traditionalBanks.forEach(bank => {
          buttons.push([
            Markup.button.callback(`🏦 ${bank.name}`, `sendmoney_bank_${bank.code}`)
          ]);
        });
        
        buttons.push([
          Markup.button.callback('🔍 Search Bank', 'sendmoney_search_bank'),
          Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')
        ]);
        
        buttons.push([
          Markup.button.callback('🔄 Refresh', 'sendmoney_refresh_banks'),
          Markup.button.callback('❌ Cancel', 'start')
        ]);
        
        await ctx.editMessageText(
          `🏦 *SELECT BANK*\n\n` +
          `🔐 *Powered by KoraPay*\n\n` +
          `⭐ *Popular Banks*\n\n` +
          `Select from popular banks or view all\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard(buttons)
          }
        );
        
        ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ [SENDMONEY] Popular banks error:', error);
        ctx.answerCbQuery('❌ Error loading popular banks');
      }
    },
    
    'sendmoney_search_bank': async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        
        const session = sessionManager.getSession(userId);
        if (session) {
          session.searchMode = true;
        }
        
        await ctx.editMessageText(
          `🔍 *SEARCH BANK*\n\n` +
          `🔐 *Powered by KoraPay*\n\n` +
          `Type the name of the bank you want to transfer to\\:\n\n` +
          `*Examples\\:*\n` +
          `• "opay"\n` +
          `• "palmpay"\n` +
          `• "moniepoint"\n` +
          `• "kuda"\n\n` +
          `📝 *Enter bank name\\:*`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⬅️ Back', 'sendmoney_popular_banks')]
            ])
          }
        );
        
        ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ [SENDMONEY] Search bank error:', error);
        ctx.answerCbQuery('❌ Error starting search');
      }
    },
    
    '^sendmoney_banks_page_(\\d+)_?(.*)$': async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const page = parseInt(ctx.match[1]);
        const searchQuery = ctx.match[2] || '';
        
        const banks = await getBanks();
        let filteredBanks = banks;
        let title = 'All Banks (A-Z)';
        
        if (searchQuery) {
          filteredBanks = searchBanks(banks, searchQuery);
          title = `Search: "${searchQuery}"`;
        }
        
        if (filteredBanks.length === 0) {
          await ctx.editMessageText(
            `🔍 *NO BANKS FOUND*\n\n` +
            `No banks found for "${searchQuery}"\\.\n\n` +
            `Try a different search term\\:`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔍 Search Again', 'sendmoney_search_bank')],
                [Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')],
                [Markup.button.callback('⬅️ Cancel', 'start')]
              ])
            }
          );
        } else {
          const keyboard = createBankKeyboard(filteredBanks, page, searchQuery);
          
          await ctx.editMessageText(
            `🏦 *SELECT BANK*\n\n` +
            `🔐 *Powered by KoraPay*\n\n` +
            `📋 *${title}*\n` +
            `📊 Showing ${Math.min(filteredBanks.length, (page + 1) * CONFIG.BANKS_PER_PAGE)} of ${filteredBanks.length} banks\n\n` +
            `Use the buttons below to navigate\\:`,
            {
              parse_mode: 'MarkdownV2',
              ...keyboard
            }
          );
        }
        
        ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ [SENDMONEY] Pagination error:', error);
        ctx.answerCbQuery('❌ Error loading page');
      }
    },
    
    '^sendmoney_bank_(.+)$': async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const bankCode = ctx.match[1];
        
        const banks = await getBanks();
        const selectedBank = banks.find(b => b.code === bankCode);
        
        if (!selectedBank) {
          await ctx.answerCbQuery('❌ Bank not found');
          return;
        }
        
        const bankName = selectedBank.name;
        
        let session = sessionManager.getSession(userId);
        if (!session || session.action !== 'send_money') {
          session = sessionManager.startSession(userId, 'send_money');
        }
        
        sessionManager.updateStep(userId, 2, { 
          bankCode: bankCode, 
          bankName: bankName 
        });
        
        await ctx.editMessageText(
          `✅ *Bank Selected\\:* ${escapeMarkdown(bankName)}\n\n` +
          `🔢 *Enter recipient account number \\(10 digits\\)\\:*\n\n` +
          `📝 *Example\\:* 1234567890\n\n` +
          `💡 *Note\\:* Account name will be fetched automatically via Kora\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⬅️ Change Bank', 'sendmoney_popular_banks')]
            ])
          }
        );
        
        ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ [SENDMONEY] Bank selection error:', error);
        ctx.answerCbQuery('❌ Error occurred');
      }
    },
    
    'sendmoney_refresh_banks': async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        
        cachedBanks = [];
        cacheTimestamp = 0;
        
        const banks = await getBanks();
        const popularBanks = getPopularBanks(banks);
        
        const buttons = [];
        
        buttons.push([
          Markup.button.callback('📱 FINTECH BANKS', 'no_action')
        ]);
        
        const fintechBanks = popularBanks.filter(bank => 
          ["100002", "100003", "100004", "999991", "100007", "999999"].includes(bank.code)
        );
        
        fintechBanks.forEach(bank => {
          let emoji = "📱";
          if (bank.code === "100003") emoji = "🌴";
          else if (bank.code === "100004") emoji = "💳";
          else if (bank.code === "999991") emoji = "⚡";
          else if (bank.code === "100007") emoji = "🏢";
          else if (bank.code === "999999") emoji = "💎";
          
          buttons.push([
            Markup.button.callback(`${emoji} ${bank.name}`, `sendmoney_bank_${bank.code}`)
          ]);
        });
        
        buttons.push([
          Markup.button.callback('🏦 TRADITIONAL BANKS', 'no_action')
        ]);
        
        const traditionalBanks = popularBanks.filter(bank => 
          !["100002", "100003", "100004", "999991", "100007", "999999"].includes(bank.code)
        );
        
        traditionalBanks.forEach(bank => {
          buttons.push([
            Markup.button.callback(`🏦 ${bank.name}`, `sendmoney_bank_${bank.code}`)
          ]);
        });
        
        buttons.push([
          Markup.button.callback('🔍 Search Bank', 'sendmoney_search_bank'),
          Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')
        ]);
        
        buttons.push([
          Markup.button.callback('🔄 Refresh', 'sendmoney_refresh_banks'),
          Markup.button.callback('❌ Cancel', 'start')
        ]);
        
        await ctx.editMessageText(
          `🏦 *BANKS REFRESHED*\n\n` +
          `🔐 *Powered by KoraPay*\n\n` +
          `📊 Total banks available: ${banks.length}\n\n` +
          `Select from popular banks or search\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard(buttons)
          }
        );
        
        ctx.answerCbQuery('✅ Banks refreshed');
      } catch (error) {
        console.error('❌ [SENDMONEY] Refresh banks error:', error);
        ctx.answerCbQuery('❌ Failed to refresh banks');
      }
    },
    
    'no_action': async (ctx) => {
      ctx.answerCbQuery();
    }
  };
}

// Handle text messages
async function handleText(ctx, text, users, transactions) {
  const userId = ctx.from.id.toString();
  const session = sessionManager.getSession(userId);
  
  if (session && session.searchMode) {
    session.searchMode = false;
    
    const banks = await getBanks();
    const searchResults = searchBanks(banks, text);
    
    if (searchResults.length === 0) {
      await ctx.reply(
        `❌ *NO BANKS FOUND*\n\n` +
        `No banks found for "${text}"\\.\n\n` +
        `Try a different search term\\:`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Search Again', 'sendmoney_search_bank')],
            [Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')],
            [Markup.button.callback('⬅️ Cancel', 'start')]
          ])
        }
      );
    } else {
      const buttons = [];
      
      buttons.push([
        Markup.button.callback(`🔍 Results for: "${text.substring(0, 15)}"`, 'no_action')
      ]);
      
      searchResults.slice(0, 10).forEach(bank => {
        let emoji = "🏦";
        if (bank.name.includes("OPay") || bank.code === "100002") emoji = "📱";
        else if (bank.name.includes("PalmPay") || bank.code === "100003") emoji = "🌴";
        else if (bank.name.includes("Moniepoint") || bank.code === "100004") emoji = "💳";
        else if (bank.name.includes("Kuda") || bank.code === "999991") emoji = "⚡";
        else if (bank.name.includes("Rubies") || bank.code === "999999") emoji = "💎";
        else if (bank.name.includes("VFD") || bank.code === "100007") emoji = "🏢";
        
        buttons.push([
          Markup.button.callback(`${emoji} ${bank.name}`, `sendmoney_bank_${bank.code}`)
        ]);
      });
      
      if (searchResults.length > 10) {
        buttons.push([
          Markup.button.callback('🔍 View More Results', `sendmoney_banks_page_0_${text}`)
        ]);
      }
      
      buttons.push([
        Markup.button.callback('🔍 New Search', 'sendmoney_search_bank'),
        Markup.button.callback('🔠 All Banks', 'sendmoney_all_banks')
      ]);
      
      buttons.push([
        Markup.button.callback('⬅️ Cancel', 'start')
      ]);
      
      await ctx.reply(
        `🔍 *SEARCH RESULTS*\n\n` +
        `Found ${searchResults.length} banks matching "${text}"\\.\n\n` +
        `Select a bank\\:`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(buttons)
        }
      );
    }
    
    return true;
  }
  
  if (!session || session.action !== 'send_money') {
    return false;
  }
  
  const user = users[userId];
  if (!user) return false;
  
  try {
    if (session.step === 2) {
      const accountNumber = text.replace(/\s+/g, '');
      
      if (!/^\d{10}$/.test(accountNumber)) {
        await ctx.reply(
          '❌ *INVALID ACCOUNT NUMBER*\n\n' +
          'Account number must be exactly 10 digits\\.\n\n' +
          '📝 Try again\\:',
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      sessionManager.updateStep(userId, 3, { accountNumber: accountNumber });
      
      const loadingMsg = await ctx.reply(
        `🔄 *Resolving account details with Kora\\.\\.\\.*\n\n` +
        `🔢 *Account Number\\:* ${accountNumber}\n` +
        `🏦 *Bank\\:* ${escapeMarkdown(session.data.bankName)}\n\n` +
        `⏳ Please wait\\.\\.\\.`,
        { parse_mode: 'MarkdownV2' }
      );
      
      try {
        const resolution = await resolveBankAccount(accountNumber, session.data.bankCode);
        
        if (!resolution.success) {
          await ctx.reply(
            `❌ *ACCOUNT RESOLUTION FAILED*\n\n` +
            `🔢 *Account Number\\:* ${accountNumber}\n` +
            `🏦 *Bank\\:* ${escapeMarkdown(session.data.bankName)}\n\n` +
            `📛 *Error\\:* ${escapeMarkdown(resolution.error)}\n\n` +
            `📛 *Please enter recipient account name manually\\:*`,
            { parse_mode: 'MarkdownV2' }
          );
          
          sessionManager.updateStep(userId, 4);
        } else {
          sessionManager.updateStep(userId, 5, {
            accountName: resolution.accountName,
            accountNumber: resolution.accountNumber || accountNumber,
            bankCode: resolution.bankCode || session.data.bankCode,
            bankName: resolution.bankName || session.data.bankName
          });
          
          await ctx.reply(
            `✅ *ACCOUNT RESOLVED*\n\n` +
            `🔢 *Account Number\\:* ${accountNumber}\n` +
            `📛 *Account Name\\:* ${escapeMarkdown(resolution.accountName)}\n` +
            `🏦 *Bank\\:* ${escapeMarkdown(resolution.bankName || session.data.bankName)}\n\n` +
            `💰 *Enter amount to transfer\\:*\n\n` +
            `💸 *Fee\\:* ₦100 flat\n` +
            `💰 *Min\\:* ${escapeMarkdown(formatCurrency(CONFIG.MIN_TRANSFER_AMOUNT))}\n` +
            `💎 *Max\\:* ${escapeMarkdown(formatCurrency(CONFIG.MAX_TRANSFER_AMOUNT))}`,
            { parse_mode: 'MarkdownV2' }
          );
        }
      } catch (error) {
        sessionManager.updateStep(userId, 4);
        
        await ctx.reply(
          `⚠️ *ACCOUNT RESOLUTION ERROR*\n\n` +
          `🔢 *Account Number\\:* ${accountNumber}\n` +
          `🏦 *Bank\\:* ${escapeMarkdown(session.data.bankName)}\n\n` +
          `📛 *Please enter recipient account name manually\\:*`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
      } catch (e) {}
      
      return true;
    }
    
    if (session.step === 4) {
      const accountName = text.substring(0, 100);
      
      sessionManager.updateStep(userId, 5, {
        accountName: accountName,
        accountNumber: session.data.accountNumber,
        bankCode: session.data.bankCode,
        bankName: session.data.bankName
      });
      
      await ctx.reply(
        `✅ *Account Name Saved\\:* ${escapeMarkdown(accountName)}\n\n` +
        `💰 *Enter amount to transfer\\:*\n\n` +
        `💸 *Fee\\:* ₦100 flat\n` +
        `💰 *Min\\:* ${escapeMarkdown(formatCurrency(CONFIG.MIN_TRANSFER_AMOUNT))}\n` +
        `💎 *Max\\:* ${escapeMarkdown(formatCurrency(CONFIG.MAX_TRANSFER_AMOUNT))}`,
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }
    
    if (session.step === 5) {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < CONFIG.MIN_TRANSFER_AMOUNT || amount > CONFIG.MAX_TRANSFER_AMOUNT) {
        await ctx.reply(
          `❌ *INVALID AMOUNT*\n\n` +
          `Amount must be between ${escapeMarkdown(formatCurrency(CONFIG.MIN_TRANSFER_AMOUNT))} and ${escapeMarkdown(formatCurrency(CONFIG.MAX_TRANSFER_AMOUNT))}\\.\n\n` +
          `📝 Try again\\:`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      const fee = CONFIG.TRANSFER_FEE;
      const total = amount + fee;
      
      if (user.wallet < total) {
        sessionManager.clearSession(userId);
        await ctx.reply(
          `❌ *INSUFFICIENT BALANCE*\n\n` +
          `💵 Your Balance\\: ${escapeMarkdown(formatCurrency(user.wallet))}\n` +
          `💰 Required \\(Amount \\+ Fee\\)\\: ${escapeMarkdown(formatCurrency(total))}\n\n` +
          `💡 You need ${escapeMarkdown(formatCurrency(total - user.wallet))} more\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      sessionManager.updateStep(userId, 6, {
        amount: amount,
        fee: fee,
        totalAmount: total
      });
      
      // Escape ALL text fields thoroughly
      const escapedAccountName = escapeMarkdown(session.data.accountName);
      const escapedBankName = escapeMarkdown(session.data.bankName);
      const escapedAmount = escapeMarkdown(formatCurrency(amount));
      const escapedFee = escapeMarkdown(formatCurrency(fee));
      const escapedTotal = escapeMarkdown(formatCurrency(total));
      
      await ctx.reply(
        `📋 *TRANSFER SUMMARY*\n\n` +
        `🔐 *Powered by KoraPay*\n\n` +
        `📛 *To\\:* ${escapedAccountName}\n` +
        `🔢 *Account\\:* ${session.data.accountNumber}\n` +
        `🏦 *Bank\\:* ${escapedBankName}\n` +
        `💰 *Amount\\:* ${escapedAmount}\n` +
        `💸 *Fee\\:* ${escapedFee} \\(flat\\)\n` +  // ESCAPED PARENTHESES
        `💵 *Total Deducted\\:* ${escapedTotal}\n\n` +
        `🔐 *Enter your 4\\-digit PIN to confirm transfer\\:*`,
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }
    
    if (session.step === 6) {
      if (text !== user.pin) {
        user.pinAttempts++;
        
        if (user.pinAttempts >= 3) {
          user.pinLocked = true;
          sessionManager.clearSession(userId);
          
          await ctx.reply(
            '❌ *ACCOUNT LOCKED*\n\n' +
            '🔒 Too many wrong PIN attempts\\.\n\n' +
            '📞 Contact admin to unlock\\.',
            { parse_mode: 'MarkdownV2' }
          );
          return true;
        }
        
        await ctx.reply(
          `❌ *WRONG PIN*\n\n` +
          `⚠️ Attempts left\\: ${3 - user.pinAttempts}\n\n` +
          `🔐 Enter correct PIN\\:`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      user.pinAttempts = 0;
      
      const { amount, fee, totalAmount } = session.data;
      const { accountNumber, accountName, bankName, bankCode } = session.data;
      
      const processingMsg = await ctx.reply(
        `🔄 *PROCESSING BANK TRANSFER VIA KORAPAY\\.\\.\\.*\n\n` +
        `⏳ Please wait while we process your transfer\\.`,
        { parse_mode: 'MarkdownV2' }
      );
      
      try {
        user.wallet -= totalAmount;
        user.dailyTransfer += totalAmount;
        user.lastTransfer = new Date().toLocaleString();
        
        const transaction = {
          type: 'bank_transfer',
          amount: amount,
          fee: fee,
          totalAmount: totalAmount,
          recipientName: accountName,
          recipientAccount: accountNumber,
          recipientBank: bankName,
          status: 'pending',
          date: new Date().toLocaleString(),
          note: 'Transfer via KoraPay'
        };
        
        if (!transactions[userId]) {
          transactions[userId] = [];
        }
        
        const transferResult = await initiateTransfer({
          amount: amount,
          accountNumber: accountNumber,
          accountName: accountName,
          bankCode: bankCode,
          bankName: bankName  // Pass bank name for the API
        }, {
          id: userId,
          name: user.name,
          username: user.username
        });
        
        if (transferResult.success) {
          transaction.reference = transferResult.reference;
          transaction.koraReference = transferResult.koraReference;
          transaction.status = transferResult.status;
          transaction.completedAt = new Date().toLocaleString();
          transaction.message = transferResult.message;
          transaction.actualFee = transferResult.fee || fee;
          
          transactions[userId].push(transaction);
          
          // Escape ALL text fields thoroughly for success message
          const escapedBankName = escapeMarkdown(bankName);
          const escapedAccountName = escapeMarkdown(accountName);
          const escapedAmount = escapeMarkdown(formatCurrency(amount));
          const escapedFee = escapeMarkdown(formatCurrency(fee));
          const escapedTotal = escapeMarkdown(formatCurrency(totalAmount));
          const escapedNewBalance = escapeMarkdown(formatCurrency(user.wallet));
          
          await ctx.reply(
            `✅ *TRANSFER INITIATED SUCCESSFULLY\\!*\n\n` +
            `🔐 *Powered by KoraPay*\n\n` +
            `📛 *To\\:* ${escapedAccountName}\n` +
            `🔢 *Account\\:* ${accountNumber}\n` +
            `🏦 *Bank\\:* ${escapedBankName}\n` +
            `💰 *Amount\\:* ${escapedAmount}\n` +
            `💸 *Fee\\:* ${escapedFee} \\(flat\\)\n` +  // ESCAPED PARENTHESES
            `💵 *Total Deducted\\:* ${escapedTotal}\n` +
            `🔢 *Reference\\:* ${transaction.reference}\n` +
            `💳 *New Balance\\:* ${escapedNewBalance}\n\n` +
            `⚡ *Status\\:* ✅ ${transaction.status.toUpperCase()}\n\n` +
            `💡 *Note\\:* Funds should reflect within minutes to a few hours\\.`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 Check Status', `check_status_${transaction.reference}`)],
                [Markup.button.callback('🏠 Home', 'start')]
              ])
            }
          );
          
          sessionManager.clearSession(userId);
        } else {
          user.wallet += totalAmount;
          user.dailyTransfer -= totalAmount;
          
          transaction.status = 'failed';
          transaction.error = transferResult.error;
          transactions[userId].push(transaction);
          
          await ctx.reply(
            `❌ *TRANSFER FAILED*\n\n` +
            `🔐 *Powered by KoraPay*\n\n` +
            `💰 *Amount\\:* ${escapeMarkdown(formatCurrency(amount))}\n` +
            `📛 *To\\:* ${escapeMarkdown(accountName)}\n` +
            `🔢 *Account\\:* ${accountNumber}\n\n` +
            `⚠️ *Error\\:* ${escapeMarkdown(transferResult.error)}\n\n` +
            `💡 *Note\\:* Your wallet has been refunded\\.`,
            { parse_mode: 'MarkdownV2' }
          );
          
          sessionManager.clearSession(userId);
        }
        
      } catch (error) {
        console.error('❌ [SENDMONEY] Transfer processing error:', error);
        
        user.wallet += totalAmount;
        user.dailyTransfer -= totalAmount;
        
        await ctx.reply(
          `⚠️ *TRANSFER ERROR*\n\n` +
          `❌ *Error\\:* ${escapeMarkdown(error.message)}\n\n` +
          `💡 *Note\\:* Your wallet has been refunded\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        
        sessionManager.clearSession(userId);
      }
      
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
      } catch (e) {}
      
      return true;
    }
    
  } catch (error) {
    console.error('❌ [SENDMONEY] Text handler error:', error);
    await ctx.reply('❌ An error occurred\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    sessionManager.clearSession(userId);
    return true;
  }
  
  return false;
}

// Export module
module.exports = {
  handleSendMoney,
  getCallbacks,
  handleText,
  sessionManager,
  getTransferStatus,
  testKoraConnection  // Export for admin testing
};