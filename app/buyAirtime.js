// app/buyAirtime.js - FIXED VERSION WITH CORRECT KYC INTEGRATION
const axios = require('axios');
const { Markup } = require('telegraf');

// ========== IMPORT SYSTEM MANAGERS FROM CORRECT LOCATION ==========
let systemTransactionManager = null;
let apiResponseManager = null;

// Function to get system transaction manager (prevents circular dependency)
function getSystemManagers() {
  if (!systemTransactionManager || !apiResponseManager) {
    try {
      // Import from transaction-system.js instead of index.js
      const transactionSystem = require('../transaction-system');
      systemTransactionManager = transactionSystem.systemTransactionManager;
      apiResponseManager = transactionSystem.apiResponseManager;
      console.log('✅ System managers loaded successfully for buyAirtime');
    } catch (error) {
      console.error('❌ Could not load system managers:', error.message);
    }
  }
  return { systemTransactionManager, apiResponseManager };
}

// ========== IMPORT DATABASE FUNCTIONS ==========
const { 
  getUsers, 
  getTransactions, 
  getSystemTransactions,
  recordTransaction  // We'll use this if available
} = require('../database');

module.exports = {
  handleAirtime: async (ctx, users, sessions, CONFIG) => {
    try {
      const userId = ctx.from.id.toString();
      const user = users[userId] || {
        wallet: 0,
        kycStatus: 'pending',  // FIXED: Changed from 'kyc' to 'kycStatus'
        pin: null
      };
      
      // FIXED: Check kycStatus instead of kyc
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
      
      if (user.wallet <= CONFIG.MIN_AIRTIME) {
        return await ctx.reply(
          `❌ *INSUFFICIENT BALANCE*\n\n` +
          `💵 Your Balance\\: ${formatCurrency(user.wallet)}\n` +
          `💰 Minimum Airtime\\: ${formatCurrency(CONFIG.MIN_AIRTIME)}\n\n` +
          `💳 Use "💳 Deposit Funds" to add money`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      await ctx.reply(
        `📞 *BUY AIRTIME*\n\n` +
        `💵 *Your Balance\\:* ${formatCurrency(user.wallet)}\n\n` +
        `📱 *Select Network\\:*`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🟢 MTN', 'airtime_mtn')],
            [Markup.button.callback('🔵 GLO', 'airtime_glo')],
            [Markup.button.callback('🔴 9MOBILE', 'airtime_9mobile')],
            [Markup.button.callback('🟡 AIRTEL', 'airtime_airtel')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Buy Airtime error:', error);
    }
  },

  getCallbacks: (bot, users, sessions, CONFIG, NETWORK_CODES) => {
    return {
      'airtime_mtn': async (ctx) => handleAirtimeNetwork(ctx, 'MTN', users, sessions, CONFIG),
      'airtime_glo': async (ctx) => handleAirtimeNetwork(ctx, 'GLO', users, sessions, CONFIG),
      'airtime_9mobile': async (ctx) => handleAirtimeNetwork(ctx, '9MOBILE', users, sessions, CONFIG),
      'airtime_airtel': async (ctx) => handleAirtimeNetwork(ctx, 'AIRTEL', users, sessions, CONFIG),
      'back_to_airtime_networks': async (ctx) => handleBackToNetworks(ctx, users, sessions, CONFIG)
    };
  },

  handleText: async (ctx, text, users, transactions, sessions, NETWORK_CODES, CONFIG) => {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    const session = sessions[userId];
    
    console.log(`📱 Text router: User ${userId} sent "${text}"`);
    console.log(`📊 Current session:`, session);
    
    // Check if this is an amount entry for airtime
    if (session && session.action === 'airtime' && session.step === 1) {
      console.log(`✅ Processing amount for airtime session`);
      return await processAirtimeAmount(ctx, text, session, user, users, sessions, CONFIG);
    }
    
    // Check if this is a phone number entry
    if (session && session.action === 'airtime' && session.step === 2) {
      console.log(`✅ Processing phone for airtime session`);
      return await processAirtimePhone(ctx, text, session, user, users, sessions, CONFIG);
    }
    
    // Check if this is a PIN entry
    if (session && session.action === 'airtime' && session.step === 3) {
      console.log(`✅ Processing PIN for airtime session`);
      return await processAirtimePIN(ctx, text, session, user, users, transactions, sessions, NETWORK_CODES, CONFIG);
    }
    
    // If no session but text looks like a number, show main menu
    if (!session && !isNaN(text) && text.trim() !== '') {
      console.log(`⚠️ No active session for amount "${text}", showing main menu`);
      return await ctx.reply(
        '⚠️ *NO ACTIVE TRANSACTION*\n\n' +
        'Please select a service first:\n\n' +
        '📞 *Buy Airtime*\n' +
        '📡 *Buy Data*\n' +
        '🏦 *Send Money*\n\n' +
        'Use the menu buttons to start a transaction.',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    // If it's just text with no session
    console.log(`❌ No matching session for text "${text}"`);
  }
};

// ========== PROCESSING FUNCTIONS ==========

async function processAirtimeAmount(ctx, text, session, user, users, sessions, CONFIG) {
  const amount = parseFloat(text);
  
  if (isNaN(amount) || amount < CONFIG.MIN_AIRTIME || amount > CONFIG.MAX_AIRTIME) {
    return await ctx.reply(
      `❌ *INVALID AMOUNT*\n\n` +
      `💰 Minimum\\: ${formatCurrency(CONFIG.MIN_AIRTIME)}\n` +
      `💎 Maximum\\: ${formatCurrency(CONFIG.MAX_AIRTIME)}\n\n` +
      `📝 Try again\\:`,
      { parse_mode: 'MarkdownV2' }
    );
  }
  
  if (user.wallet < amount) {
    delete sessions[ctx.from.id.toString()];
    return await ctx.reply(
      `❌ *INSUFFICIENT BALANCE*\n\n` +
      `💵 Your Balance\\: ${formatCurrency(user.wallet)}\n` +
      `💰 Required\\: ${formatCurrency(amount)}`,
      { parse_mode: 'MarkdownV2' }
    );
  }
  
  // Update session
  sessions[ctx.from.id.toString()].step = 2;
  sessions[ctx.from.id.toString()].amount = amount;
  
  console.log(`✅ Amount ${amount} accepted for user ${ctx.from.id.toString()}`);
  
  await ctx.reply(
    `✅ *Amount Confirmed\\:* ${formatCurrency(amount)}\n\n` +
    `📱 *Network\\:* ${escapeMarkdown(session.network)}\n\n` +
    `📝 *Enter phone number\\:*\n\n` +
    `📱 *Format\\:* 08012345678 \\(must start with 0 and be 11 digits\\)`,
    { parse_mode: 'MarkdownV2' }
  );
}

async function processAirtimePhone(ctx, text, session, user, users, sessions, CONFIG) {
  const phone = text.replace(/\s+/g, '');
  
  if (!validatePhoneNumber(phone)) {
    return await ctx.reply(
      '❌ *INVALID PHONE NUMBER*\n\n' +
      '📱 *Valid Formats\\:*\n' +
      '• 08012345678 \\(preferred\\)\n' +
      '• 2348012345678\n' +
      '• \\+2348012345678\n\n' +
      '📝 Try again\\:',
      { parse_mode: 'MarkdownV2' }
    );
  }
  
  // Update session
  sessions[ctx.from.id.toString()].step = 3;
  sessions[ctx.from.id.toString()].phone = phone;
  
  console.log(`✅ Phone ${phone} accepted for user ${ctx.from.id.toString()}`);
  
  await ctx.reply(
    `📋 *AIRTIME ORDER SUMMARY*\n\n` +
    `📱 *Phone\\:* ${escapeMarkdown(formatPhoneNumberForVTU(phone))}\n` +
    `📶 *Network\\:* ${escapeMarkdown(session.network)}\n` +
    `💰 *Amount\\:* ${formatCurrency(session.amount)}\n\n` +
    `💳 *Your Balance\\:* ${formatCurrency(user.wallet)}\n` +
    `💵 *After Purchase\\:* ${formatCurrency(user.wallet - session.amount)}\n\n` +
    `🔐 *Enter your 4\\-digit PIN to confirm\\:*`,
    { parse_mode: 'MarkdownV2' }
  );
}

async function processAirtimePIN(ctx, text, session, user, users, transactions, sessions, NETWORK_CODES, CONFIG) {
  if (text !== user.pin) {
    user.pinAttempts = (user.pinAttempts || 0) + 1;
    
    if (user.pinAttempts >= 3) {
      user.pinLocked = true;
      delete sessions[ctx.from.id.toString()];
      return await ctx.reply(
        '❌ *ACCOUNT LOCKED*\n\n' +
        '🔒 Too many wrong PIN attempts\\.\n\n' +
        '📞 Contact admin to unlock\\.',
        { parse_mode: 'MarkdownV2' }
      );
    }
    
    return await ctx.reply(
      `❌ *WRONG PIN*\n\n` +
      `⚠️ Attempts left\\: ${3 - user.pinAttempts}\n\n` +
      `🔐 Enter correct PIN\\:`,
      { parse_mode: 'MarkdownV2' }
    );
  }
  
  user.pinAttempts = 0;
  
  const { amount, phone, network } = session;
  const networkCode = NETWORK_CODES[network];
  const requestId = `AIR${Date.now()}_${ctx.from.id.toString()}`;
  const transactionId = requestId; // Use same ID for tracking
  
  const processingMsg = await ctx.reply(
    `🔄 *PROCESSING AIRTIME PURCHASE\\.\\.\\.*\n\n` +
    `⏳ Please wait while we connect to VTU service\\.\n` +
    `This may take up to 30 seconds\\.`,
    { parse_mode: 'MarkdownV2' }
  );
  
  try {
    console.log('📤 Processing airtime purchase for user:', ctx.from.id.toString());
    
    // ========== ENHANCED API CALL WITH TRACKING ==========
    const apiResult = await buyAirtime(
      networkCode,
      phone,
      amount,
      requestId,
      CONFIG,
      transactionId  // Pass transactionId for API tracking
    );
    
    console.log('📊 API Result:', apiResult);
    
    const isSuccessful = apiResult && (apiResult.Status === 'successful' || apiResult.status === 'success');
    const status = isSuccessful ? 'completed' : 'pending';
    
    // ===== RECORD TRANSACTION USING ENHANCED DATABASE FUNCTION =====
    const userId = ctx.from.id.toString();
    
    // Try to use the new recordTransaction function if available
    try {
      const { recordTransaction } = require('../database');
      if (typeof recordTransaction === 'function') {
        // Use the new unified recording function
        await recordTransaction(userId, {
          id: transactionId,
          type: 'airtime',
          amount: amount,
          network: network,
          phone: phone,
          reference: requestId,
          api_reference: apiResult.id || apiResult.ident || requestId,
          status: status,
          description: `Airtime purchase for ${phone} (${network})`,
          error: !isSuccessful ? (apiResult.message || 'Pending') : null,
          metadata: {
            api_response: apiResult,
            timestamp: Date.now()
          }
        });
        console.log(`✅ Transaction recorded using unified function: ${transactionId}`);
      } else {
        // Fallback to manual recording
        throw new Error('recordTransaction not available');
      }
    } catch (dbError) {
      // Manual recording fallback
      console.warn('⚠️ Using manual transaction recording fallback');
      
      // 1. Add to user's transaction history
      if (!transactions[userId]) {
        transactions[userId] = [];
      }
      transactions[userId].push({
        id: requestId,
        type: 'airtime',
        amount: amount,
        network: network,
        phone: phone,
        reference: requestId,
        api_reference: apiResult.id || apiResult.ident || requestId,
        date: new Date().toLocaleString(),
        status: status,
        message: apiResult.api_response || 'Airtime purchase',
        api_response: apiResult,
        timestamp: Date.now(),
        user_id: userId
      });
      
      // 2. Record to system transaction tracking
      const { systemTransactionManager } = getSystemManagers();
      if (systemTransactionManager) {
        await systemTransactionManager.recordAnyTransaction(
          userId,
          {
            id: transactionId,
            type: 'airtime',
            amount: amount,
            status: status,
            description: `Airtime purchase for ${phone} (${network})`,
            reference: requestId,
            phone: phone,
            network: network,
            error: !isSuccessful ? (apiResult.message || null) : null,
            apiData: apiResult
          }
        );
      }
    }
    
    if (isSuccessful) {
      // Deduct from wallet
      user.wallet -= amount;
      
      const escapedPhone = escapeMarkdown(formatPhoneNumberForVTU(phone));
      const escapedNetwork = escapeMarkdown(network);
      
      await ctx.reply(
        `✅ *AIRTIME PURCHASE SUCCESSFUL\\!*\n\n` +
        `📱 *Phone\\:* ${escapedPhone}\n` +
        `💰 *Amount\\:* ${formatCurrency(amount)}\n` +
        `📶 *Network\\:* ${escapedNetwork}\n` +
        `🔢 *Reference\\:* ${escapeMarkdown(requestId)}\n` +
        `💳 *New Balance\\:* ${formatCurrency(user.wallet)}\n\n` +
        `🎉 *Status\\:* ✅ Successful\n\n` +
        `💡 *Note\\:* Airtime should arrive within 1\\-3 minutes\\.\n` +
        `If not received, contact admin with your reference\\!`,
        { parse_mode: 'MarkdownV2' }
      );
      
    } else {
      const escapedPhone = escapeMarkdown(formatPhoneNumberForVTU(phone));
      const escapedNetwork = escapeMarkdown(network);
      
      await ctx.reply(
        `⚠️ *AIRTIME PURCHASE PENDING*\n\n` +
        `📱 *Phone\\:* ${escapedPhone}\n` +
        `💰 *Amount\\:* ${formatCurrency(amount)}\n` +
        `📶 *Network\\:* ${escapedNetwork}\n` +
        `🔢 *Reference\\:* ${escapeMarkdown(requestId)}\n\n` +
        `🔄 *Status\\:* Processing \\- Please wait 2\\-3 minutes\n\n` +
        `💡 *Note\\:* Your wallet has NOT been deducted\\.\n` +
        `If airtime is not received, contact admin\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    }
  } catch (apiError) {
    console.error('❌ Airtime API Error Details:', {
      message: apiError.message,
      response: apiError.response?.data,
      status: apiError.response?.status
    });
    
    const userId = ctx.from.id.toString();
    
    // ===== RECORD FAILED TRANSACTION =====
    try {
      const { recordTransaction } = require('../database');
      if (typeof recordTransaction === 'function') {
        await recordTransaction(userId, {
          id: transactionId,
          type: 'airtime',
          amount: amount,
          network: network,
          phone: phone,
          reference: requestId,
          status: 'failed',
          description: `Failed airtime purchase for ${phone} (${network})`,
          error: apiError.message,
          metadata: {
            api_error: apiError.response?.data || { message: apiError.message },
            timestamp: Date.now()
          }
        });
      } else {
        // Fallback
        if (!transactions[userId]) transactions[userId] = [];
        transactions[userId].push({
          id: requestId,
          type: 'airtime',
          amount: amount,
          network: network,
          phone: phone,
          date: new Date().toLocaleString(),
          status: 'failed',
          reason: apiError.message,
          timestamp: Date.now(),
          user_id: userId
        });
      }
    } catch (dbError) {
      console.error('❌ Failed to record failed transaction:', dbError);
    }
    
    const escapedPhone = escapeMarkdown(formatPhoneNumberForVTU(phone));
    const escapedNetwork = escapeMarkdown(network);
    
    await ctx.reply(
      `❌ *AIRTIME PURCHASE FAILED*\n\n` +
      `📱 *Phone\\:* ${escapedPhone}\n` +
      `💰 *Amount\\:* ${formatCurrency(amount)}\n` +
      `📶 *Network\\:* ${escapedNetwork}\n` +
      `🔢 *Reference\\:* ${escapeMarkdown(requestId)}\n\n` +
      `🚨 *Error\\:* ${escapeMarkdown(apiError.message || 'Unknown error')}\n\n` +
      `💡 *Note\\:* Your wallet has NOT been deducted\\.\n` +
      `Please try again or contact admin if problem persists\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  }
  
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
  } catch (e) {
    console.log('Could not delete processing message:', e.message);
  }
  
  // Clear session
  delete sessions[ctx.from.id.toString()];
  console.log(`✅ Transaction completed, session cleared for ${ctx.from.id.toString()}`);
}

// ========== HELPER FUNCTIONS ==========

async function handleAirtimeNetwork(ctx, network, users, sessions, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    
    // Clear any existing session first
    delete sessions[userId];
    
    // Create fresh session with proper state
    sessions[userId] = {
      action: 'airtime',
      step: 1,  // Step 1 = entering amount
      network: network,
      userId: userId,
      timestamp: Date.now()
    };
    
    console.log(`✅ Session created for ${userId}:`, sessions[userId]);
    
    await ctx.editMessageText(
      `📞 *BUY AIRTIME \\- ${escapeMarkdown(network)}*\n\n` +
      `💵 *Your Balance\\:* ${formatCurrency(user.wallet)}\n\n` +
      `💰 *Enter amount \\(${formatCurrency(CONFIG.MIN_AIRTIME)} \\- ${formatCurrency(CONFIG.MAX_AIRTIME)}\\)\\:*\n\n` +
      `📝 *Example\\:* 1000`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Back to Networks', 'back_to_airtime_networks')]
        ])
      }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Airtime network selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleBackToNetworks(ctx, users, sessions, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    
    // Clear session when going back
    delete sessions[userId];
    
    await ctx.editMessageText(
      `📞 *BUY AIRTIME*\n\n` +
      `💵 *Your Balance\\:* ${formatCurrency(user.wallet)}\n\n` +
      `📱 *Select Network\\:*`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🟢 MTN', 'airtime_mtn')],
          [Markup.button.callback('🔵 GLO', 'airtime_glo')],
          [Markup.button.callback('🔴 9MOBILE', 'airtime_9mobile')],
          [Markup.button.callback('🟡 AIRTEL', 'airtime_airtel')]
        ])
      }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Back to networks error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function buyAirtime(networkCode, phoneNumber, amount, requestId, CONFIG, transactionId) {
  try {
    console.log('🔍 VTU API AIRTIME CALL:');
    const formattedPhone = formatPhoneNumberForAPI(phoneNumber);
    const payload = {
      network: networkCode,
      mobile_number: formattedPhone,
      Ported_number: "true",
      "request-id": requestId,
      amount: amount.toString(),
      airtime_type: "VTU"
    };
    
    console.log('📤 API Request:', {
      url: `${CONFIG.VTU_BASE_URL}/topup/`,
      payload: payload,
      transactionId: transactionId
    });
    
    const response = await axios.post(`${CONFIG.VTU_BASE_URL}/topup/`, payload, {
      headers: {
        'Authorization': `Token ${CONFIG.VTU_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    const responseData = response.data;
    console.log('📥 API Response:', responseData);
    
    // Track API response using apiResponseManager
    const { apiResponseManager } = getSystemManagers();
    if (apiResponseManager && transactionId) {
      await apiResponseManager.saveResponse(
        transactionId,
        'VTU_AIRTIME_API',
        payload,
        responseData,
        'success'
      );
      console.log(`✅ API response tracked for transaction: ${transactionId}`);
    }
    
    return responseData;
  } catch (error) {
    console.error('❌ Airtime API Error:', error.message);
    
    // Track failed API call
    const { apiResponseManager } = getSystemManagers();
    if (apiResponseManager && transactionId) {
      await apiResponseManager.saveResponse(
        transactionId,
        'VTU_AIRTIME_API',
        {
          network: networkCode,
          phone: phoneNumber,
          amount: amount,
          requestId: requestId
        },
        {
          error: error.message,
          status: 'failed',
          response: error.response?.data || null
        },
        'failed'
      );
      console.log(`✅ Failed API response tracked for transaction: ${transactionId}`);
    }
    
    throw error;
  }
}

function formatCurrency(amount) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escapedText = text;
  specialChars.forEach(char => {
    const regex = new RegExp(`\\${char}`, 'g');
    escapedText = escapedText.replace(regex, `\\${char}`);
  });
  return escapedText;
}

function formatPhoneNumberForVTU(phone) {
  let cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+234')) {
    cleaned = '0' + cleaned.substring(4);
  } else if (cleaned.startsWith('234')) {
    cleaned = '0' + cleaned.substring(3);
  }
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  if (cleaned.length > 11) {
    cleaned = cleaned.substring(0, 11);
  }
  return cleaned;
}

function formatPhoneNumberForAPI(phone) {
  let cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('234')) {
    cleaned = '0' + cleaned.substring(3);
  }
  if (cleaned.startsWith('+234')) {
    cleaned = '0' + cleaned.substring(4);
  }
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  if (cleaned.length !== 11) {
    if (cleaned.length > 11) {
      cleaned = cleaned.substring(0, 11);
    }
  }
  return cleaned;
}

function validatePhoneNumber(phone) {
  const cleaned = phone.replace(/\s+/g, '');
  return /^(0|234)(7|8|9)(0|1)\d{8}$/.test(cleaned);
}