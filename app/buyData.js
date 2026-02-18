// app/buyData.js - FIXED VERSION WITH CORRECT KYC INTEGRATION
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Markup } = require('telegraf');

// ========== IMPORT SYSTEM MANAGERS FROM CORRECT LOCATION ==========
let systemTransactionManager = null;
let apiResponseManager = null;

// Function to get system transaction manager (prevents circular dependency)
function getTransactionManagers() {
  if (!systemTransactionManager || !apiResponseManager) {
    try {
      // Import from transaction-system.js instead of index.js
      const transactionSystem = require('../transaction-system');
      systemTransactionManager = transactionSystem.systemTransactionManager;
      apiResponseManager = transactionSystem.apiResponseManager;
      console.log('✅ Loaded transaction managers for buyData module');
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

// Function to record API response to system tracking
async function recordApiResponseToSystem(transactionId, apiName, requestData, responseData, status = 'success') {
  try {
    const managers = getTransactionManagers();
    if (managers.apiResponseManager) {
      return await managers.apiResponseManager.saveResponse(
        transactionId,
        apiName,
        requestData,
        responseData,
        status
      );
    }
    return null;
  } catch (error) {
    console.error('❌ Error recording API response:', error);
    return null;
  }
}

// Function to record system transaction with API data
async function recordSystemTransactionWithApi(userId, transactionData, apiName, requestData, responseData, apiStatus = 'success') {
  try {
    const managers = getTransactionManagers();
    
    if (managers.systemTransactionManager) {
      // First record the transaction
      const transaction = await managers.systemTransactionManager.recordAnyTransaction(userId, transactionData);
      
      if (transaction) {
        // Then record the API response
        await recordApiResponseToSystem(
          transaction.id,
          apiName,
          requestData,
          responseData,
          apiStatus
        );
        
        console.log(`✅ Recorded transaction with API response: ${transaction.id}`);
        return transaction;
      }
    }
    return null;
  } catch (error) {
    console.error('❌ Error recording system transaction with API:', error);
    return null;
  }
}

// NEW FUNCTION: Normalize API response
function normalizeApiResponse(apiResponse, isError = false) {
  if (!apiResponse) return { status: 'unknown', message: 'No response' };
  
  // Common VTU API response formats
  let normalized = {
    status: 'pending',
    message: '',
    reference: '',
    transactionId: '',
    ident: '',
    id: ''
  };
  
  if (isError) {
    normalized.status = 'failed';
    normalized.message = apiResponse.message || apiResponse.error || 'API Error';
    return normalized;
  }
  
  // Check for common success indicators
  const responseString = JSON.stringify(apiResponse).toLowerCase();
  
  // Status detection
  if (responseString.includes('success') || 
      responseString.includes('delivered') || 
      responseString.includes('completed')) {
    normalized.status = 'successful';
  } else if (responseString.includes('pending') || 
             responseString.includes('processing')) {
    normalized.status = 'pending';
  } else if (responseString.includes('failed') || 
             responseString.includes('error') || 
             responseString.includes('declined')) {
    normalized.status = 'failed';
  }
  
  // Extract reference/ID from common fields
  normalized.reference = apiResponse.reference || 
                        apiResponse.transaction_id || 
                        apiResponse.transactionId || 
                        apiResponse.request_id || 
                        apiResponse['request-id'] || 
                        '';
  
  normalized.transactionId = apiResponse.id || 
                            apiResponse.transaction_id || 
                            apiResponse.transactionId || 
                            '';
  
  normalized.ident = apiResponse.ident || apiResponse.transaction_ident || '';
  
  normalized.message = apiResponse.message || 
                      apiResponse.response || 
                      apiResponse.api_response || 
                      '';
  
  // Copy all original fields
  normalized.original = apiResponse;
  
  return normalized;
}

// NEW FUNCTION: Save transaction to file for persistence
function saveTransactionToFile(transaction) {
  try {
    const transactionDir = path.join(__dirname, 'transactions');
    if (!fs.existsSync(transactionDir)) {
      fs.mkdirSync(transactionDir, { recursive: true });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const transactionFile = path.join(transactionDir, `transactions_${today}.json`);
    
    let existingTransactions = [];
    if (fs.existsSync(transactionFile)) {
      const fileContent = fs.readFileSync(transactionFile, 'utf8');
      existingTransactions = JSON.parse(fileContent);
    }
    
    existingTransactions.push(transaction);
    
    fs.writeFileSync(
      transactionFile, 
      JSON.stringify(existingTransactions, null, 2),
      'utf8'
    );
    
    console.log(`✅ Transaction saved to file: ${transaction.id}`);
  } catch (error) {
    console.error('❌ Error saving transaction to file:', error);
  }
}

module.exports = {
  handleData: async (ctx, users, sessionManager, CONFIG, NETWORK_CODES) => {
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
          '❌ \\*KYC VERIFICATION REQUIRED\\*\n\n' +
          '📝 Your account needs verification\\.\n\n' +
          '🛂 \\*To Get Verified\\:\\*\n' +
          'Complete your KYC using the 🛂 KYC Status menu option\n' +
          'or contact @opuenekeke with your User ID',
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      if (!user.pin) {
        return await ctx.reply(
          '❌ \\*TRANSACTION PIN NOT SET\\*\n\n' +
          '🔐 Set PIN\\: `/setpin 1234`',
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      if (user.wallet < 100) {
        return await ctx.reply(
          `❌ \\*INSUFFICIENT BALANCE\\*\n\n` +
          `💵 Your Balance\\: ${formatCurrency(user.wallet)}\n` +
          `💰 Minimum Data Plan\\: ${formatCurrency(100)}\n\n` +
          `💳 Use "💳 Deposit Funds" to add money`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      const availableNetworks = getAvailableNetworks();
      
      if (availableNetworks.length === 0) {
        return await ctx.reply(
          '❌ \\*NO DATA PLANS AVAILABLE\\*\n\n' +
          'No data plans loaded\\. Please contact admin\\.',
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      const uniqueNetworks = [...new Set(availableNetworks)];
      const networkButtons = uniqueNetworks.map(network => [
        Markup.button.callback(`📱 ${network}`, `data_${network.toLowerCase().replace(/\s+/g, '_')}`)
      ]);
      
      networkButtons.push([Markup.button.callback('🏠 Home', 'start')]);
      
      await ctx.reply(
        `📡 \\*BUY DATA BUNDLE\\*\n\n` +
        `💵 \\*Your Balance\\:\\* ${formatCurrency(user.wallet)}\n\n` +
        `📱 \\*Select Network\\:\\*`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(networkButtons)
        }
      );
      
    } catch (error) {
      console.error('❌ Buy Data error:', error);
      await ctx.reply('❌ An error occurred\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  },

  getCallbacks: (bot, users, sessionManager, CONFIG) => {
    return {
      'data_mtn': async (ctx) => handleDataNetwork(ctx, 'MTN', users, sessionManager, CONFIG),
      'data_glo': async (ctx) => handleDataNetwork(ctx, 'Glo', users, sessionManager, CONFIG),
      'data_airtel': async (ctx) => handleDataNetwork(ctx, 'AIRTEL', users, sessionManager, CONFIG),
      'data_9mobile': async (ctx) => handleDataNetwork(ctx, '9MOBILE', users, sessionManager, CONFIG),
      
      '^validity_(.+)_(.+)$': async (ctx) => {
        console.log('📞 Validity callback triggered:', ctx.callbackQuery.data);
        const network = ctx.match[1];
        const validity = ctx.match[2];
        return handleValiditySelection(ctx, network, validity, users, sessionManager, CONFIG);
      },
      
      '^plan_(.+)_(.+)_(.+)$': async (ctx) => {
        console.log('📞 Plan callback triggered:', ctx.callbackQuery.data);
        const network = ctx.match[1];
        const validity = ctx.match[2];
        const planId = ctx.match[3];
        return handlePlanSelection(ctx, network, validity, planId, users, sessionManager, CONFIG);
      },
      
      'back_to_data_networks': async (ctx) => handleBackToDataNetworks(ctx, users, sessionManager, CONFIG),
      
      'enter_phone_for_data': async (ctx) => {
        const userId = ctx.from.id.toString();
        const session = sessionManager.getSession(userId);
        
        if (session && session.action === 'data') {
          await ctx.editMessageText(
            `📱 \\*Enter Phone Number\\*\n\n` +
            `📝 \\*Format\\:\\* 08012345678 \\(must be 11 digits starting with 0\\)\n\n` +
            `Type the phone number below\\:`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Back', `validity_${session.network}_${session.validityType.toLowerCase()}`)]
              ])
            }
          );
        }
        ctx.answerCbQuery();
      }
    };
  },

  handleText: async (ctx, text, session, user, users, transactions, sessionManager, NETWORK_CODES, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    // Check if session exists using sessionManager
    const currentSession = sessionManager.getSession(userId);
    
    // DATA: Phone entry
    if (currentSession && currentSession.action === 'data' && currentSession.step === 2) {
      const phone = text.replace(/\s+/g, '');
      
      if (!validatePhoneNumber(phone)) {
        return await ctx.reply(
          '❌ \\*INVALID PHONE NUMBER\\*\n\n' +
          '📱 \\*Valid Formats\\:\\*\n' +
          '• 08012345678 \\(preferred\\)\n' +
          '• 2348012345678\n' +
          '• \\+2348012345678\n\n' +
          '📝 Try again\\:',
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      // Update session
      currentSession.step = 3;
      currentSession.phone = phone;
      sessionManager.setSession(userId, currentSession);
      
      const selectedPlan = currentSession.selectedPlan;
      const amount = currentSession.amount;
      
      await ctx.reply(
        `📋 \\*DATA ORDER SUMMARY\\*\n\n` +
        `📱 \\*Phone\\:\\* ${escapeMarkdown(formatPhoneNumberForVTU(phone))}\n` +
        `📶 \\*Network\\:\\* ${escapeMarkdown(selectedPlan.Network)}\n` +
        `📊 \\*Plan\\:\\* ${escapeMarkdown(selectedPlan.Plan)}\n` +
        `📅 \\*Validity\\:\\* ${escapeMarkdown(selectedPlan.Validity)}\n` +
        `💰 \\*Price\\:\\* ${formatCurrency(amount)}\n\n` +
        `💳 \\*Your Balance\\:\\* ${formatCurrency(user.wallet)}\n` +
        `💵 \\*After Purchase\\:\\* ${formatCurrency(user.wallet - amount)}\n\n` +
        `🔐 \\*Enter your 4\\-digit PIN to confirm\\:\\*`,
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }
    
    // DATA: PIN confirmation
    else if (currentSession && currentSession.action === 'data' && currentSession.step === 3) {
      if (text !== user.pin) {
        user.pinAttempts = (user.pinAttempts || 0) + 1;
        
        if (user.pinAttempts >= 3) {
          user.pinLocked = true;
          sessionManager.clearSession(userId);
          return await ctx.reply(
            '❌ \\*ACCOUNT LOCKED\\*\n\n' +
            '🔒 Too many wrong PIN attempts\\.\n\n' +
            '📞 Contact admin to unlock\\.',
            { parse_mode: 'MarkdownV2' }
          );
        }
        
        return await ctx.reply(
          `❌ \\*WRONG PIN\\*\n\n` +
          `⚠️ Attempts left\\: ${3 - user.pinAttempts}\n\n` +
          `🔐 Enter correct PIN\\:`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      user.pinAttempts = 0;
      
      const { selectedPlan, amount, phone, network } = currentSession;
      const networkCode = NETWORK_CODES[network.toUpperCase()] || '2';
      const requestId = `DATA${Date.now()}_${userId}`;
      const transactionId = requestId;
      
      const processingMsg = await ctx.reply(
        `🔄 \\*PROCESSING DATA PURCHASE\\.\\.\\.\\*\n\n` +
        `⏳ Please wait while we connect to VTU service\\.\n` +
        `This may take up to 30 seconds\\.`,
        { parse_mode: 'MarkdownV2' }
      );
      
      try {
        console.log('📤 Processing data purchase for user:', userId);
        
        // Prepare API request data for recording
        const apiRequestData = {
          network: networkCode,
          mobile_number: formatPhoneNumberForAPI(phone),
          Ported_number: "true",
          "request-id": requestId,
          plan: selectedPlan.PlanID.toString()
        };
        
        const apiResult = await buyData(
          networkCode,
          phone,
          selectedPlan.PlanID,
          requestId,
          CONFIG,
          transactionId  // Pass transactionId for API tracking
        );
        
        console.log('📊 API Result:', apiResult);
        
        // FIXED: Use normalized response
        const normalizedResponse = apiResult;
        
        // FIXED: Determine transaction status properly
        const isSuccessful = normalizedResponse.status === 'successful';
        const isFailed = normalizedResponse.status === 'failed';
        const isPending = normalizedResponse.status === 'pending';
        
        // Determine transaction status
        let transactionStatus, apiStatus;
        if (isSuccessful) {
          transactionStatus = 'completed';
          apiStatus = 'success';
        } else if (isFailed) {
          transactionStatus = 'failed';
          apiStatus = 'failed';
        } else {
          transactionStatus = 'pending';
          apiStatus = 'pending';
        }
        
        const apiReference = normalizedResponse.reference || 
                           normalizedResponse.transactionId || 
                           normalizedResponse.ident || 
                           requestId;
        
        const apiMessage = normalizedResponse.message || 'Data purchase successful';
        
        // ===== USE UNIFIED TRANSACTION RECORDING =====
        try {
          // Try to use the unified recordTransaction function
          const { recordTransaction } = require('../database');
          if (typeof recordTransaction === 'function') {
            await recordTransaction(userId, {
              id: transactionId,
              type: 'data',
              amount: amount,
              network: network,
              plan: selectedPlan.Plan,
              validity: selectedPlan.Validity,
              phone: phone,
              reference: requestId,
              api_reference: apiReference,
              status: transactionStatus,
              description: `Data purchase for ${phone} (${network}) - ${selectedPlan.Plan}`,
              category: 'data',
              error: !isSuccessful ? (apiMessage || null) : null,
              metadata: {
                api_response: normalizedResponse,
                api_status: apiStatus,
                plan_details: selectedPlan,
                timestamp: Date.now()
              }
            });
            console.log(`✅ Data transaction recorded using unified function: ${transactionId}`);
          } else {
            // Fallback to manual recording
            throw new Error('recordTransaction not available');
          }
        } catch (dbError) {
          // Manual recording fallback
          console.warn('⚠️ Using manual transaction recording fallback for data');
          
          // 1. Add to user's transaction history
          if (!transactions[userId]) {
            transactions[userId] = [];
          }
          transactions[userId].push({
            id: requestId,
            type: 'data',
            amount: amount,
            network: network,
            plan: selectedPlan.Plan,
            validity: selectedPlan.Validity,
            phone: phone,
            reference: requestId,
            api_reference: apiReference,
            date: new Date().toLocaleString(),
            status: transactionStatus,
            message: apiMessage,
            api_response: normalizedResponse,
            timestamp: Date.now(),
            user_id: userId,
            api_status: apiStatus
          });
          
          // 2. Save to file for persistence
          saveTransactionToFile({
            id: requestId,
            type: 'data',
            amount: amount,
            network: network,
            plan: selectedPlan.Plan,
            phone: phone,
            status: transactionStatus,
            timestamp: Date.now()
          });
          
          // 3. Record to system transaction tracking
          const { systemTransactionManager } = getTransactionManagers();
          if (systemTransactionManager) {
            await systemTransactionManager.recordAnyTransaction(
              userId,
              {
                id: transactionId,
                type: 'data',
                amount: amount,
                status: transactionStatus,
                description: `Data purchase for ${phone} (${network}) - ${selectedPlan.Plan}`,
                category: 'data',
                reference: requestId,
                phone: phone,
                network: network,
                error: !isSuccessful ? (apiMessage || null) : null,
                apiData: normalizedResponse,
                user: {
                  telegramId: userId,
                  firstName: user.firstName || 'User',
                  lastName: user.lastName || '',
                  username: user.username
                }
              }
            );
          }
        }
        
        // Track API response separately
        await recordApiResponseToSystem(
          transactionId,
          'VTU_DATA_API',
          apiRequestData,
          normalizedResponse,
          apiStatus
        );
        
        console.log(`✅ Data transaction recorded with API response: ${requestId}`);
        
        if (isSuccessful) {
          // Deduct from wallet
          user.wallet -= amount;
          
          const escapedPhone = escapeMarkdown(formatPhoneNumberForVTU(phone));
          const escapedNetwork = escapeMarkdown(network);
          const escapedPlan = escapeMarkdown(selectedPlan.Plan);
          const escapedValidity = escapeMarkdown(selectedPlan.Validity);
          
          await ctx.reply(
            `✅ \\*DATA PURCHASE SUCCESSFUL\\!\\*\n\n` +
            `📱 \\*Phone\\:\\* ${escapedPhone}\n` +
            `📶 \\*Network\\:\\* ${escapedNetwork}\n` +
            `📊 \\*Plan\\:\\* ${escapedPlan}\n` +
            `📅 \\*Validity\\:\\* ${escapedValidity}\n` +
            `💰 \\*Amount\\:\\* ${formatCurrency(amount)}\n` +
            `🔢 \\*Reference\\:\\* ${escapeMarkdown(requestId)}\n` +
            `🔢 \\*API Reference\\:\\* ${escapeMarkdown(apiReference)}\n` +
            `💳 \\*New Balance\\:\\* ${formatCurrency(user.wallet)}\n\n` +
            `🎉 \\*Status\\:\\* ✅ Successful\n\n` +
            `💡 \\*Note\\:\\* Data should arrive within 1\\-3 minutes\\.\n` +
            `If not received, contact admin with your reference\\!`,
            { parse_mode: 'MarkdownV2' }
          );
          
        } else if (isPending) {
          const escapedPhone = escapeMarkdown(formatPhoneNumberForVTU(phone));
          const escapedNetwork = escapeMarkdown(network);
          const escapedPlan = escapeMarkdown(selectedPlan.Plan);
          
          await ctx.reply(
            `⚠️ \\*DATA PURCHASE PENDING\\*\n\n` +
            `📱 \\*Phone\\:\\* ${escapedPhone}\n` +
            `📶 \\*Network\\:\\* ${escapedNetwork}\n` +
            `📊 \\*Plan\\:\\* ${escapedPlan}\n` +
            `💰 \\*Amount\\:\\* ${formatCurrency(amount)}\n` +
            `🔢 \\*Reference\\:\\* ${escapeMarkdown(requestId)}\n` +
            `🔢 \\*API Reference\\:\\* ${escapeMarkdown(apiReference)}\n\n` +
            `🔄 \\*Status\\:\\* Processing \\- Please wait 2\\-3 minutes\n\n` +
            `💡 \\*Note\\:\\* Your wallet has NOT been deducted\\.\n` +
            `If data is not received, contact admin\\.`,
            { parse_mode: 'MarkdownV2' }
          );
        } else {
          // Failed case
          const escapedPhone = escapeMarkdown(formatPhoneNumberForVTU(phone));
          const escapedNetwork = escapeMarkdown(network);
          const escapedPlan = escapeMarkdown(selectedPlan.Plan);
          
          await ctx.reply(
            `❌ \\*DATA PURCHASE FAILED\\*\n\n` +
            `📱 \\*Phone\\:\\* ${escapedPhone}\n` +
            `📶 \\*Network\\:\\* ${escapedNetwork}\n` +
            `📊 \\*Plan\\:\\* ${escapedPlan}\n` +
            `💰 \\*Amount\\:\\* ${formatCurrency(amount)}\n` +
            `🔢 \\*Reference\\:\\* ${escapeMarkdown(requestId)}\n\n` +
            `🚨 \\*Error\\:\\* ${escapeMarkdown(apiMessage)}\n\n` +
            `💡 \\*Note\\:\\* Your wallet has NOT been deducted\\.\n` +
            `Please try again or contact admin if problem persists\\.`,
            { parse_mode: 'MarkdownV2' }
          );
        }
      } catch (apiError) {
        console.error('❌ Data API Error Details:', apiError.message);
        
        // Prepare failed transaction data
        const errorResponse = apiError.response?.data || { error: apiError.message };
        
        // FIXED: Normalize error response
        const normalizedError = normalizeApiResponse(errorResponse, true);
        
        // ===== RECORD FAILED TRANSACTION =====
        try {
          const { recordTransaction } = require('../database');
          if (typeof recordTransaction === 'function') {
            await recordTransaction(userId, {
              id: transactionId,
              type: 'data',
              amount: amount,
              network: network,
              plan: selectedPlan.Plan,
              validity: selectedPlan.Validity,
              phone: phone,
              reference: requestId,
              status: 'failed',
              description: `Failed data purchase for ${phone} (${network}) - ${selectedPlan.Plan}`,
              category: 'data',
              error: apiError.message,
              metadata: {
                api_error: normalizedError,
                timestamp: Date.now()
              }
            });
          } else {
            // Fallback
            if (!transactions[userId]) transactions[userId] = [];
            transactions[userId].push({
              id: requestId,
              type: 'data',
              amount: amount,
              network: network,
              plan: selectedPlan.Plan,
              phone: phone,
              date: new Date().toLocaleString(),
              status: 'failed',
              reason: apiError.message,
              timestamp: Date.now(),
              user_id: userId,
              error: apiError.message,
              api_response: normalizedError
            });
          }
        } catch (dbError) {
          console.error('❌ Failed to record failed transaction:', dbError);
        }
        
        // Track API error response
        await recordApiResponseToSystem(
          transactionId,
          'VTU_DATA_API',
          {
            network: networkCode,
            mobile_number: formatPhoneNumberForAPI(phone),
            Ported_number: "true",
            "request-id": requestId,
            plan: selectedPlan.PlanID.toString()
          },
          normalizedError,
          'failed'
        );
        
        const escapedPhone = escapeMarkdown(formatPhoneNumberForVTU(phone));
        const escapedNetwork = escapeMarkdown(network);
        const escapedPlan = escapeMarkdown(selectedPlan.Plan);
        
        await ctx.reply(
          `❌ \\*DATA PURCHASE FAILED\\*\n\n` +
          `📱 \\*Phone\\:\\* ${escapedPhone}\n` +
          `📶 \\*Network\\:\\* ${escapedNetwork}\n` +
          `📊 \\*Plan\\:\\* ${escapedPlan}\n` +
          `💰 \\*Amount\\:\\* ${formatCurrency(amount)}\n` +
          `🔢 \\*Reference\\:\\* ${escapeMarkdown(requestId)}\n\n` +
          `🚨 \\*Error\\:\\* ${escapeMarkdown(normalizedError.message || 'Unknown error')}\n\n` +
          `💡 \\*Note\\:\\* Your wallet has NOT been deducted\\.\n` +
          `Please try again or contact admin if problem persists\\.`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
      } catch (e) {
        console.error('Error deleting processing message:', e);
      }
      
      sessionManager.clearSession(userId);
      return true;
    }
    
    return false;
  },

  // New helper function for direct phone handling
  handlePhoneNumber: async (ctx, phoneNumber, users, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    console.log(`📱 [BUYDATA] Direct phone number handling: ${phoneNumber}`);
    
    // Check if user has an active data session
    const session = sessionManager.getSession(userId);
    if (session && session.action === 'data' && session.selectedPlan) {
      // User is in data purchase flow
      session.phoneNumber = phoneNumber;
      session.step = 3; // Move to confirmation
      sessionManager.setSession(userId, session);
      
      const plan = session.selectedPlan;
      const user = users[userId];
      
      if (!user) {
        await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
        return true;
      }
      
      // Show confirmation
      await ctx.reply(
        `📋 \\*DATA PURCHASE CONFIRMATION\\*\n\n` +
        `📡 \\*Network\\:\\* ${escapeMarkdown(session.network)}\n` +
        `📦 \\*Plan\\:\\* ${escapeMarkdown(plan.Plan)}\n` +
        `💰 \\*Price\\:\\* ${escapeMarkdown(formatCurrency(plan.DisplayPrice))}\n` +
        `📅 \\*Validity\\:\\* ${escapeMarkdown(plan.Validity)}\n` +
        `📱 \\*Phone\\:\\* ${escapeMarkdown(phoneNumber)}\n\n` +
        `💵 \\*Your Balance\\:\\* ${escapeMarkdown(formatCurrency(user.wallet))}\n\n` +
        `🔐 \\*Enter your 4\\-digit PIN to confirm\\:\\*`,
        { parse_mode: 'MarkdownV2' }
      );
      
      return true;
    }
    
    return false;
  },
  
  // Export helper functions for testing
  getTransactionManagers,
  recordApiResponseToSystem,
  recordSystemTransactionWithApi,
  normalizeApiResponse,
  saveTransactionToFile
};

// ==================== HELPER FUNCTIONS ====================

async function handleDataNetwork(ctx, network, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    
    const validities = getAvailableValidities(network);
    
    console.log(`📅 Validities for ${network}:`, validities);
    
    if (validities.length === 0) {
      await ctx.editMessageText(
        `❌ \\*NO DATA PLANS AVAILABLE\\*\n\n` +
        `No data plans found for ${escapeMarkdown(network)}\\.\n` +
        `Please try another network\\.`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Back to Networks', 'back_to_data_networks')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      return ctx.answerCbQuery();
    }
    
    // Create data session using sessionManager
    sessionManager.setSession(userId, {
      action: 'data',
      step: 1,
      network: network,
      userId: userId,
      timestamp: Date.now()
    });
    
    const validityButtons = validities.map(validity => [
      Markup.button.callback(
        `📅 ${validity}`,
        `validity_${network}_${validity.toLowerCase().replace(/\s+/g, '_')}`
      )
    ]);
    
    validityButtons.push([
      Markup.button.callback('⬅️ Back to Networks', 'back_to_data_networks')
    ]);
    
    await ctx.editMessageText(
      `📡 \\*BUY DATA \\- ${escapeMarkdown(network)}\\*\n\n` +
      `💵 \\*Your Balance\\:\\* ${formatCurrency(user.wallet)}\n\n` +
      `📅 \\*Select Validity Type\\:\\*`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(validityButtons)
      }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Data network selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleValiditySelection(ctx, network, validityType, users, sessionManager, CONFIG) {
  try {
    console.log(`📞 Validity selection: ${network} - ${validityType}`);
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    
    // Convert validityType to proper case (daily -> Daily)
    const formattedValidity = validityType.charAt(0).toUpperCase() + validityType.slice(1);
    
    const dataPlans = getDataPlans(network, formattedValidity, CONFIG);
    
    console.log(`📊 Loading ${network} ${formattedValidity} plans...`);
    console.log(`📁 Found ${dataPlans.length} plans`);
    
    if (dataPlans.length === 0) {
      await ctx.editMessageText(
        `❌ \\*NO ${escapeMarkdown(formattedValidity.toUpperCase())} PLANS AVAILABLE\\*\n\n` +
        `No ${escapeMarkdown(formattedValidity)} plans found for ${escapeMarkdown(network)}\\.\n` +
        `Please try another validity type\\.`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Back', `data_${network.toLowerCase().replace(/\s+/g, '_')}`)]
          ])
        }
      );
      return ctx.answerCbQuery();
    }
    
    // Update session with validity type
    const session = {
      action: 'data',
      step: 1,
      network: network,
      validityType: formattedValidity,
      userId: userId,
      timestamp: Date.now()
    };
    sessionManager.setSession(userId, session);
    
    // Create plan buttons
    const planButtons = [];
    
    for (let i = 0; i < dataPlans.length; i += 2) {
      const row = [];
      for (let j = 0; j < 2 && (i + j) < dataPlans.length; j++) {
        const plan = dataPlans[i + j];
        // Truncate long plan names
        const planName = plan.Plan.length > 20 ? plan.Plan.substring(0, 20) + '...' : plan.Plan;
        const buttonText = `${planName} - ${formatCurrency(plan.DisplayPrice)}`;
        row.push(
          Markup.button.callback(
            buttonText,
            `plan_${network}_${validityType.toLowerCase()}_${plan.PlanID.toString().replace(/[^a-zA-Z0-9]/g, '_')}`
          )
        );
      }
      planButtons.push(row);
    }
    
    // Add back button
    planButtons.push([
      Markup.button.callback('⬅️ Back', `data_${network.toLowerCase().replace(/\s+/g, '_')}`)
    ]);
    
    await ctx.editMessageText(
      `📡 \\*BUY DATA \\- ${escapeMarkdown(network)} ${escapeMarkdown(formattedValidity)}\\*\n\n` +
      `💵 \\*Your Balance\\:\\* ${formatCurrency(user.wallet)}\n\n` +
      `📊 \\*Select Data Plan\\:\\*\n` +
      `💡 Price includes ${formatCurrency(CONFIG.SERVICE_FEE)} service fee`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(planButtons)
      }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Data validity selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handlePlanSelection(ctx, network, validityType, planId, users, sessionManager, CONFIG) {
  try {
    console.log(`📞 Plan selection: ${network} - ${validityType} - ${planId}`);
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    
    // Convert validityType to proper case
    const formattedValidity = validityType.charAt(0).toUpperCase() + validityType.slice(1);
    
    // Replace underscores with original characters
    const originalPlanId = planId.replace(/_/g, ' ');
    
    const dataPlans = getDataPlans(network, formattedValidity, CONFIG);
    const selectedPlan = dataPlans.find(plan => 
      plan.PlanID.toString().replace(/[^a-zA-Z0-9]/g, '_') === planId || 
      plan.PlanID.toString() === originalPlanId
    );
    
    if (!selectedPlan) {
      console.log(`❌ Plan not found: ${planId}`);
      await ctx.editMessageText(
        '❌ \\*PLAN NOT FOUND\\*\n\n' +
        'The selected plan is no longer available\\.\n' +
        'Please select another plan\\.',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)]
          ])
        }
      );
      return ctx.answerCbQuery();
    }
    
    const totalPrice = selectedPlan.DisplayPrice;
    
    if (user.wallet < totalPrice) {
      await ctx.editMessageText(
        `❌ \\*INSUFFICIENT BALANCE\\*\n\n` +
        `💵 Your Balance\\: ${formatCurrency(user.wallet)}\n` +
        `💰 Required\\: ${formatCurrency(totalPrice)}\n\n` +
        `💳 Deposit funds and try again\\.`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)]
          ])
        }
      );
      return ctx.answerCbQuery();
    }
    
    // Update session with selected plan and move to step 2 (phone entry)
    const session = {
      action: 'data',
      step: 2, // PHONE NUMBER ENTRY STEP
      network: network,
      validityType: formattedValidity,
      planId: selectedPlan.PlanID,
      selectedPlan: selectedPlan,
      amount: totalPrice,
      userId: userId,
      timestamp: Date.now()
    };
    sessionManager.setSession(userId, session);
    
    console.log(`✅ Data session updated for ${userId}, step: 2 (phone entry)`);
    
    await ctx.editMessageText(
      `✅ \\*Plan Selected\\:\\* ${escapeMarkdown(selectedPlan.Plan)}\n\n` +
      `📊 \\*Plan Details\\:\\*\n` +
      `📱 Network\\: ${escapeMarkdown(selectedPlan.Network)}\n` +
      `📅 Validity\\: ${escapeMarkdown(selectedPlan.Validity)}\n` +
      `💰 Price\\: ${formatCurrency(totalPrice)}\n\n` +
      `📱 \\*Enter phone number\\:\\*\n\n` +
      `📝 \\*Format\\:\\* 08012345678 \\(must start with 0 and be 11 digits\\)\n\n` +
      `Type the phone number below\\:`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)],
          [Markup.button.callback('📱 Enter Phone', 'enter_phone_for_data')]
        ])
      }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Data plan selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleBackToDataNetworks(ctx, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    
    // Clear the session
    sessionManager.clearSession(userId);
    
    const availableNetworks = getAvailableNetworks();
    const uniqueNetworks = [...new Set(availableNetworks)];
    
    if (uniqueNetworks.length === 0) {
      await ctx.editMessageText(
        '❌ \\*NO DATA PLANS AVAILABLE\\*\n\n' +
        'No data plans loaded\\. Please contact admin\\.',
        { parse_mode: 'MarkdownV2' }
      );
      return ctx.answerCbQuery();
    }
    
    const networkButtons = uniqueNetworks.map(network => [
      Markup.button.callback(`📱 ${network}`, `data_${network.toLowerCase().replace(/\s+/g, '_')}`)
    ]);
    
    networkButtons.push([Markup.button.callback('🏠 Home', 'start')]);
    
    await ctx.editMessageText(
      `📡 \\*BUY DATA BUNDLE\\*\n\n` +
      `💵 \\*Your Balance\\:\\* ${formatCurrency(user.wallet)}\n\n` +
      `📱 \\*Select Network\\:\\*`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(networkButtons)
      }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Back to data networks error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

// ==================== API & UTILITY FUNCTIONS ====================

async function buyData(networkCode, phoneNumber, planId, requestId, CONFIG, transactionId) {
  try {
    const formattedPhone = formatPhoneNumberForAPI(phoneNumber);
    const payload = {
      network: networkCode,
      mobile_number: formattedPhone,
      Ported_number: "true",
      "request-id": requestId,
      plan: planId.toString()
    };
    
    console.log('📤 Data API Payload:', payload);
    
    const response = await axios.post(`${CONFIG.VTU_BASE_URL}/data/`, payload, {
      headers: {
        'Authorization': `Token ${CONFIG.VTU_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('📥 Full API Response:', JSON.stringify(response.data, null, 2));
    
    // FIXED: Normalize the API response
    const normalizedResponse = normalizeApiResponse(response.data);
    
    // Track API response
    const { apiResponseManager } = getTransactionManagers();
    if (apiResponseManager && transactionId) {
      await apiResponseManager.saveResponse(
        transactionId,
        'VTU_DATA_API',
        payload,
        response.data,
        'success'
      );
    }
    
    return normalizedResponse;
    
  } catch (error) {
    console.error('❌ Data API Error:', error.message);
    
    // Enhance error with response data if available
    if (error.response) {
      console.error('❌ API Error Response:', JSON.stringify(error.response.data, null, 2));
      console.error('❌ API Error Status:', error.response.status);
      
      // Track failed API response
      const { apiResponseManager } = getTransactionManagers();
      if (apiResponseManager && transactionId) {
        await apiResponseManager.saveResponse(
          transactionId,
          'VTU_DATA_API',
          {
            network: networkCode,
            mobile_number: formatPhoneNumberForAPI(phoneNumber),
            plan: planId.toString(),
            requestId: requestId
          },
          error.response.data,
          'failed'
        );
      }
      
      // Create normalized error response
      const errorResponse = normalizeApiResponse(error.response.data, true);
      error.response.data = errorResponse;
    }
    
    throw error;
  }
}

function getAvailableNetworks() {
  try {
    const networks = [];
    const basePath = process.cwd();
    
    if (fs.existsSync(path.join(basePath, 'MTN'))) networks.push('MTN');
    if (fs.existsSync(path.join(basePath, 'Glo'))) networks.push('Glo');
    if (fs.existsSync(path.join(basePath, 'GLO'))) networks.push('Glo');
    if (fs.existsSync(path.join(basePath, 'AIRTEL'))) networks.push('AIRTEL');
    if (fs.existsSync(path.join(basePath, '9MOBILE'))) networks.push('9MOBILE');
    
    console.log(`📱 Found networks: ${networks.join(', ')}`);
    return networks;
  } catch (error) {
    console.error('Error getting networks:', error);
    return ['MTN', 'Glo', 'AIRTEL', '9MOBILE'];
  }
}

function getAvailableValidities(network) {
  try {
    const validities = [];
    let networkFolder = network;
    
    if (network === 'Glo') {
      if (fs.existsSync(path.join(process.cwd(), 'Glo'))) {
        networkFolder = 'Glo';
      } else if (fs.existsSync(path.join(process.cwd(), 'GLO'))) {
        networkFolder = 'GLO';
      }
    }
    
    const basePath = process.cwd();
    const networkPath = path.join(basePath, networkFolder);
    
    console.log(`📁 Checking network path: ${networkPath}`);
    
    if (!fs.existsSync(networkPath)) {
      console.log(`❌ Network folder not found: ${networkPath}`);
      return ['Monthly'];
    }
    
    const files = fs.readdirSync(networkPath);
    console.log(`📄 Files in ${networkFolder}:`, files);
    
    const validityFiles = {
      'daily.json': 'Daily',
      'weekly.json': 'Weekly',
      'monthly.json': 'Monthly'
    };
    
    for (const [file, validity] of Object.entries(validityFiles)) {
      if (files.includes(file)) {
        validities.push(validity);
      }
    }
    
    console.log(`📅 Validities for ${network}: ${validities.join(', ')}`);
    return validities.length > 0 ? validities : ['Monthly'];
  } catch (error) {
    console.error(`Error getting validities for ${network}:`, error);
    return ['Monthly'];
  }
}

function getDataPlans(network, validityType = null, CONFIG) {
  try {
    let networkFolder = network;
    
    if (network === 'Glo') {
      if (fs.existsSync(path.join(process.cwd(), 'Glo'))) {
        networkFolder = 'Glo';
      } else if (fs.existsSync(path.join(process.cwd(), 'GLO'))) {
        networkFolder = 'GLO';
      }
    }
    
    const basePath = process.cwd();
    
    if (validityType) {
      const fileName = validityType.toLowerCase() + '.json';
      const filePath = path.join(basePath, networkFolder, fileName);
      
      console.log(`📂 Looking for data plans at: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`❌ Data plan file not found: ${filePath}`);
        return [];
      }
      
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        console.log(`📄 File content length: ${fileContent.length} characters`);
        
        let plans;
        try {
          plans = JSON.parse(fileContent);
        } catch (parseError) {
          console.error(`❌ JSON parse error: ${parseError.message}`);
          return [];
        }
        
        let planArray = [];
        
        if (Array.isArray(plans)) {
          planArray = plans;
        } else if (plans && typeof plans === 'object') {
          if (plans.data && Array.isArray(plans.data)) {
            planArray = plans.data;
          } else if (plans.plans && Array.isArray(plans.plans)) {
            planArray = plans.plans;
          } else if (plans.products && Array.isArray(plans.products)) {
            planArray = plans.products;
          } else {
            for (const key in plans) {
              if (Array.isArray(plans[key])) {
                planArray = plans[key];
                break;
              }
            }
          }
        }
        
        console.log(`✅ Parsed ${planArray.length} ${network} ${validityType} plans`);
        
        if (planArray.length === 0) {
          console.log(`⚠️ No plans found in the parsed data`);
          return [];
        }
        
        const formattedPlans = planArray.map((plan, index) => {
          const planName = plan.data || plan.Plan || plan.name || 
                          plan.description || plan.product_name || 
                          plan.plan_name || `Plan ${index + 1}`;
          
          const planPrice = parseFloat(plan.price || plan.Price || 
                                      plan.amount || plan.product_amount || 
                                      plan.plan_price || 0);
          
          const planId = (plan.id || plan.PlanID || plan.plan_id || 
                         plan.product_id || plan.code || 
                         (index + 1).toString()).toString();
          
          const planValidity = plan.validity || plan.Validity || 
                              plan.duration || validityType;
          
          return {
            Network: network,
            Plan: planName,
            Validity: planValidity,
            Price: planPrice,
            PlanID: planId,
            DisplayPrice: planPrice + CONFIG.SERVICE_FEE
          };
        });
        
        formattedPlans.sort((a, b) => a.Price - b.Price);
        
        return formattedPlans;
      } catch (parseError) {
        console.error(`❌ Error processing ${filePath}:`, parseError);
        return [];
      }
    }
    
    console.log(`⚠️ No validity type specified for ${network}`);
    return [];
  } catch (error) {
    console.error(`❌ Error loading ${network} ${validityType} plans:`, error.message);
    return [];
  }
}

function formatCurrency(amount) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text.toString();
  
  // Escape all special characters for MarkdownV2
  return text
    .replace(/\_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!');
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
  return /^(0|234|\+234)(7|8|9)(0|1)\d{8}$/.test(cleaned);
}