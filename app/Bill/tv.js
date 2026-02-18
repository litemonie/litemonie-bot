// app/Bill/tv.js - FIXED WITH PROPER IMPORTS AND TRANSACTION TRACKING
const axios = require('axios');
const { Markup } = require('telegraf');

// ========== IMPORT SYSTEM MANAGERS FROM CORRECT LOCATION ==========
let systemTransactionManager = null;
let apiResponseManager = null;

// Function to get system transaction manager (prevents circular dependency)
function getTransactionManagers() {
  if (!systemTransactionManager || !apiResponseManager) {
    try {
      // Import from transaction-system.js
      const transactionSystem = require('../../transaction-system');
      systemTransactionManager = transactionSystem.systemTransactionManager;
      apiResponseManager = transactionSystem.apiResponseManager;
      console.log('✅ Loaded transaction managers for tv module');
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
} = require('../../database');

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text.toString();
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

function formatCurrency(amount) {
  return `₦${parseFloat(amount).toLocaleString('en-NG')}`;
}

// Cable providers mapping
const CABLE_PROVIDERS = {
  '1': { name: 'GOTV', code: 'GOTV' },
  '2': { name: 'DSTV', code: 'DSTV' },
  '3': { name: 'STARTIMES', code: 'STARTIMES' },
  '4': { name: 'SHOWMAX', code: 'SHOWMAX' }
};

// Package mapping (simplified - you'd typically fetch these from API or config)
const PACKAGES = {
  'gotv_3300': { provider: '1', name: 'GOTV Jinja', amount: 3300, code: 'jinja' },
  'dstv_10500': { provider: '2', name: 'DSTV Compact', amount: 10500, code: 'compact' },
  'startimes_1900': { provider: '3', name: 'STARTIMES Nova', amount: 1900, code: 'nova' },
  'showmax_1200': { provider: '4', name: 'SHOWMAX Mobile', amount: 1200, code: 'mobile' }
};

module.exports = {
  handleTVSubscription: async (ctx, users, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    // Create TV subscription session
    await sessionManager.setSession(userId, {
      action: 'tv_subscription',
      step: 1,
      data: {}
    });
    
    await ctx.reply(
      '📺 *TV SUBSCRIPTION*\n\n' +
      'Select your cable provider:\n\n' +
      '1️⃣ GOTV\n' +
      '2️⃣ DSTV\n' +
      '3️⃣ STARTIMES\n' +
      '4️⃣ SHOWMAX\n\n' +
      '_Use the buttons below to select:_',
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📺 GOTV', 'tv_gotv')],
          [Markup.button.callback('📡 DSTV', 'tv_dstv')],
          [Markup.button.callback('⭐ STARTIMES', 'tv_startimes')],
          [Markup.button.callback('🎬 SHOWMAX', 'tv_showmax')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  },

  handleText: async (ctx, text, userSession, user, users, transactions, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    if (userSession && userSession.action === 'tv_subscription') {
      // Step 2: Smart Card number entry
      if (userSession.step === 2) {
        userSession.data.smartCardNumber = text.trim();
        userSession.step = 2.5;
        await sessionManager.updateSession(userId, userSession);
        
        await ctx.reply(
          `📺 *CARD NUMBER RECEIVED*\n\n` +
          `🔢 *Card Number:* ${escapeMarkdown(text.trim())}\n\n` +
          `Verifying card details...`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Verify', 'tv_verify')],
              [Markup.button.callback('↩️ Change Card', 'tv_back')]
            ])
          }
        );
        return true;
      }
      
      // Step 4: Amount entry (if custom amount needed)
      if (userSession.step === 4) {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount < 100) {
          await ctx.reply(
            '❌ *INVALID AMOUNT*\n\n' +
            'Please enter a valid amount (minimum ₦100).',
            { parse_mode: 'MarkdownV2' }
          );
          return true;
        }
        
        userSession.data.amount = amount;
        userSession.step = 5;
        await sessionManager.updateSession(userId, userSession);
        
        // Check user balance
        if (user.wallet < amount) {
          await ctx.reply(
            `❌ *INSUFFICIENT BALANCE*\n\n` +
            `💰 *Required:* ${formatCurrency(amount)}\n` +
            `💰 *Available:* ${formatCurrency(user.wallet)}\n\n` +
            `💡 *Deposit funds to continue*`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💳 Deposit Funds', 'deposit')],
                [Markup.button.callback('↩️ Back', 'tv_back')]
              ])
            }
          );
          return true;
        }
        
        // Confirm purchase
        await ctx.reply(
          `📺 *CONFIRM TV SUBSCRIPTION*\n\n` +
          `📡 *Provider:* ${escapeMarkdown(CABLE_PROVIDERS[userSession.data.cablename].name)}\n` +
          `🔢 *Card Number:* ${escapeMarkdown(userSession.data.smartCardNumber)}\n` +
          `👤 *Customer:* ${escapeMarkdown(userSession.data.customerName || 'Verified')}\n` +
          `💰 *Amount:* ${formatCurrency(amount)}\n\n` +
          `💳 *Your balance:* ${formatCurrency(user.wallet)}\n` +
          `💵 *After payment:* ${formatCurrency(user.wallet - amount)}\n\n` +
          `_Confirm payment?_`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Payment', 'tv_purchase')],
              [Markup.button.callback('↩️ Change Amount', 'tv_back')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
        return true;
      }
    }
    return false;
  },

  getCallbacks: (bot, users, sessionManager, CONFIG) => ({
    tv_gotv: async (ctx) => {
      await handleCableSelection(ctx, '1', 'GOTV', users, sessionManager);
    },
    tv_dstv: async (ctx) => {
      await handleCableSelection(ctx, '2', 'DSTV', users, sessionManager);
    },
    tv_startimes: async (ctx) => {
      await handleCableSelection(ctx, '3', 'STARTIMES', users, sessionManager);
    },
    tv_showmax: async (ctx) => {
      await handleCableSelection(ctx, '4', 'SHOWMAX', users, sessionManager);
    },
    tv_verify: async (ctx) => {
      await handleVerification(ctx, users, sessionManager, CONFIG);
    },
    tv_purchase: async (ctx) => {
      await handlePurchase(ctx, users, transactions, sessionManager, CONFIG);
    },
    tv_back: async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = await sessionManager.getSession(userId);
      
      if (session && session.action === 'tv_subscription') {
        if (session.step >= 2) {
          session.step = 2;
          session.data.smartCardNumber = null;
          session.data.customerName = null;
          session.data.fullDetails = null;
          session.data.amount = null;
          session.data.package = null;
          await sessionManager.updateSession(userId, session);
          
          await ctx.editMessageText(
            `📺 *${session.data.cableName} SUBSCRIPTION*\n\n` +
            `Enter your Smart Card/IUC/ICU Number:\n\n` +
            `📝 *Example:* 1234567890\n\n` +
            `_For GOTV/DSTV: IUC number_\n` +
            `_For STARTIMES: ICU number_\n` +
            `_For SHOWMAX: Phone number_`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Back', 'tv_show')],
                [Markup.button.callback('❌ Cancel', 'start')]
              ])
            }
          );
        }
      }
    },
    tv_show: async (ctx) => {
      // Show TV menu again
      const userId = ctx.from.id.toString();
      await sessionManager.setSession(userId, {
        action: 'tv_subscription',
        step: 1,
        data: {}
      });
      
      await ctx.editMessageText(
        '📺 *TV SUBSCRIPTION*\n\n' +
        'Select your cable provider:\n\n' +
        '1️⃣ GOTV\n' +
        '2️⃣ DSTV\n' +
        '3️⃣ STARTIMES\n' +
        '4️⃣ SHOWMAX\n\n' +
        '_Use the buttons below to select:_',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📺 GOTV', 'tv_gotv')],
            [Markup.button.callback('📡 DSTV', 'tv_dstv')],
            [Markup.button.callback('⭐ STARTIMES', 'tv_startimes')],
            [Markup.button.callback('🎬 SHOWMAX', 'tv_showmax')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  })
};

async function handleCableSelection(ctx, cableId, cableName, users, sessionManager) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'tv_subscription') {
    session.data.cablename = cableId;
    session.data.cableName = cableName;
    session.step = 2;
    await sessionManager.updateSession(userId, session);
    
    await ctx.editMessageText(
      `📺 *${cableName} SUBSCRIPTION*\n\n` +
      `Enter your Smart Card/IUC/ICU Number:\n\n` +
      `📝 *Example:* 1234567890\n\n` +
      `_For GOTV/DSTV: IUC number_\n` +
      `_For STARTIMES: ICU number_\n` +
      `_For SHOWMAX: Phone number_`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('↩️ Back', 'tv_show')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  }
}

async function handleVerification(ctx, users, sessionManager, CONFIG) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'tv_subscription' && session.data.smartCardNumber) {
    try {
      await ctx.editMessageText(
        `🔍 *Verifying card number...*\n\n` +
        `📺 *Provider:* ${session.data.cableName}\n` +
        `🔢 *Card Number:* ${escapeMarkdown(session.data.smartCardNumber)}\n\n` +
        `Please wait while we verify...`,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Prepare API request data
      const apiRequestData = {
        cablename: session.data.cablename,
        smart_card_number: session.data.smartCardNumber
      };
      
      console.log('📤 TV verification request:', apiRequestData);
      
      // Verify cable details via API
      const response = await axios.post(
        `${CONFIG.VTU_BASE_URL}/cablesub/verify/`,
        apiRequestData,
        {
          headers: {
            'Authorization': `Token ${CONFIG.VTU_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      const apiResponse = response.data;
      console.log('📥 TV verification response:', apiResponse);
      
      // Track verification API response
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          `VERIFY_TV_${Date.now()}`,
          'VTU_TV_VERIFY_API',
          apiRequestData,
          apiResponse,
          apiResponse.status === 'success' ? 'success' : 'failed'
        );
      }
      
      if (apiResponse.status === 'success') {
        session.data.customerName = apiResponse.Customer_Name;
        session.data.fullDetails = apiResponse.Full_Details;
        session.step = 3;
        await sessionManager.updateSession(userId, session);
        
        // Show package selection or amount entry based on provider
        if (session.data.cableName === 'SHOWMAX') {
          // For SHOWMAX, go directly to amount entry
          session.step = 4;
          await sessionManager.updateSession(userId, session);
          
          await ctx.editMessageText(
            `✅ *VERIFICATION SUCCESSFUL*\n\n` +
            `📺 *Provider:* ${session.data.cableName}\n` +
            `🔢 *Card Number:* ${escapeMarkdown(session.data.smartCardNumber)}\n` +
            `👤 *Customer Name:* ${escapeMarkdown(apiResponse.Customer_Name || 'N/A')}\n\n` +
            `Enter amount to pay (in Naira):\n\n` +
            `📝 *Example:* 1200, 2500, 5000`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Back', 'tv_back')],
                [Markup.button.callback('❌ Cancel', 'start')]
              ])
            }
          );
        } else {
          // For other providers, show package selection
          await ctx.editMessageText(
            `✅ *VERIFICATION SUCCESSFUL*\n\n` +
            `📺 *Provider:* ${session.data.cableName}\n` +
            `🔢 *Card Number:* ${escapeMarkdown(session.data.smartCardNumber)}\n` +
            `👤 *Customer Name:* ${escapeMarkdown(apiResponse.Customer_Name || 'N/A')}\n\n` +
            `Select package to purchase:`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💰 GOTV Jinja (₦3,300)', 'tv_package_3300')],
                [Markup.button.callback('💰 DSTV Compact (₦10,500)', 'tv_package_10500')],
                [Markup.button.callback('💰 STARTIMES Nova (₦1,900)', 'tv_package_1900')],
                [Markup.button.callback('↩️ Back', 'tv_back')],
                [Markup.button.callback('❌ Cancel', 'start')]
              ])
            }
          );
        }
      } else {
        await ctx.editMessageText(
          '❌ *VERIFICATION FAILED*\n\n' +
          `Error: ${escapeMarkdown(apiResponse.message || 'Unable to verify card number')}\n\n` +
          'Please check the card number and try again.',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Try Again', 'tv_back')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
      }
    } catch (error) {
      console.error('❌ TV verification error:', error.message);
      
      // Track failed verification
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          `VERIFY_TV_${Date.now()}`,
          'VTU_TV_VERIFY_API',
          {
            cablename: session.data.cablename,
            smart_card_number: session.data.smartCardNumber
          },
          { error: error.message },
          'failed'
        );
      }
      
      await ctx.editMessageText(
        '❌ *VERIFICATION ERROR*\n\n' +
        'Unable to verify card details. Please try again later.',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Back', 'tv_back')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  }
}

async function handlePurchase(ctx, users, transactions, sessionManager, CONFIG) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  const user = users[userId];
  
  if (session && session.action === 'tv_subscription' && session.data.smartCardNumber) {
    try {
      const amount = session.data.amount || session.data.package?.amount || 0;
      const provider = CABLE_PROVIDERS[session.data.cablename];
      const requestId = `TV${Date.now()}_${userId}`;
      const transactionId = requestId;
      
      if (amount <= 0) {
        await ctx.editMessageText(
          '❌ *INVALID AMOUNT*\n\n' +
          'Please select a package or enter a valid amount.',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Back', 'tv_back')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
        return;
      }
      
      // Check user balance
      if (user.wallet < amount) {
        await ctx.editMessageText(
          `❌ *INSUFFICIENT BALANCE*\n\n` +
          `💰 *Required:* ${formatCurrency(amount)}\n` +
          `💰 *Available:* ${formatCurrency(user.wallet)}\n\n` +
          `💡 *Deposit funds to continue*`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💳 Deposit Funds', 'deposit')],
              [Markup.button.callback('↩️ Back', 'tv_back')]
            ])
          }
        );
        return;
      }
      
      await ctx.editMessageText(
        `🔄 *Processing subscription...*\n\n` +
        `📺 *Provider:* ${provider.name}\n` +
        `🔢 *Card Number:* ${escapeMarkdown(session.data.smartCardNumber)}\n` +
        `💰 *Amount:* ${formatCurrency(amount)}\n\n` +
        `Please wait...`,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Prepare API request data
      const apiRequestData = {
        cablename: session.data.cablename,
        smart_card_number: session.data.smartCardNumber,
        amount: amount.toString(),
        customer_name: session.data.customerName || 'Verified Customer'
      };
      
      console.log('📤 TV purchase request:', apiRequestData);
      
      // Make API call to purchase subscription
      const response = await axios.post(
        `${CONFIG.VTU_BASE_URL}/cablesub/pay/`,
        apiRequestData,
        {
          headers: {
            'Authorization': `Token ${CONFIG.VTU_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      const apiResponse = response.data;
      console.log('📥 TV purchase response:', apiResponse);
      
      const isSuccessful = apiResponse.status === 'success' || apiResponse.Status === 'successful';
      const status = isSuccessful ? 'completed' : (apiResponse.status === 'pending' ? 'pending' : 'failed');
      const apiStatus = isSuccessful ? 'success' : (status === 'pending' ? 'pending' : 'failed');
      
      // ===== USE UNIFIED TRANSACTION RECORDING =====
      try {
        const { recordTransaction } = require('../../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(userId, {
            id: transactionId,
            type: 'tv_subscription',
            amount: amount,
            provider: provider.name,
            provider_id: session.data.cablename,
            smart_card_number: session.data.smartCardNumber,
            customer_name: session.data.customerName || 'Verified',
            package: session.data.package?.name || 'Standard',
            status: status,
            description: `TV subscription for ${provider.name} - Card: ${session.data.smartCardNumber}`,
            category: 'tv_subscription',
            reference: apiResponse.reference || apiResponse.id || requestId,
            error: !isSuccessful ? (apiResponse.message || 'Processing') : null,
            metadata: {
              api_response: apiResponse,
              api_status: apiStatus,
              timestamp: Date.now()
            }
          });
          console.log(`✅ TV transaction recorded using unified function: ${transactionId}`);
        } else {
          // Fallback to manual recording
          throw new Error('recordTransaction not available');
        }
      } catch (dbError) {
        console.warn('⚠️ Using manual transaction recording fallback for tv');
        
        // Manual recording fallback
        const transactionData = {
          id: requestId,
          type: 'tv_subscription',
          provider: provider.name,
          smart_card_number: session.data.smartCardNumber,
          amount: amount,
          customer_name: session.data.customerName || 'Verified',
          package: session.data.package?.name || 'Standard',
          reference: apiResponse.reference || apiResponse.id || requestId,
          status: status,
          date: new Date().toISOString(),
          user_id: userId
        };
        
        // Add to user's transaction history
        if (!transactions[userId]) {
          transactions[userId] = [];
        }
        transactions[userId].push(transactionData);
        
        // Record to system transaction tracking
        const managers = getTransactionManagers();
        if (managers.systemTransactionManager) {
          await managers.systemTransactionManager.recordAnyTransaction(userId, {
            ...transactionData,
            description: `TV subscription for ${provider.name}`,
            apiData: apiResponse
          });
        }
      }
      
      // Track API response
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          transactionId,
          'VTU_TV_PAY_API',
          apiRequestData,
          apiResponse,
          apiStatus
        );
      }
      
      if (isSuccessful) {
        // Deduct from wallet
        user.wallet -= amount;
        
        let tokenDisplay = '';
        if (apiResponse.token || apiResponse.pin) {
          tokenDisplay = `🔑 *Token:* \`${escapeMarkdown(apiResponse.token || apiResponse.pin)}\`\n`;
        }
        
        await ctx.editMessageText(
          `✅ *SUBSCRIPTION SUCCESSFUL!*\n\n` +
          `📺 *Provider:* ${escapeMarkdown(provider.name)}\n` +
          `🔢 *Card Number:* ${escapeMarkdown(session.data.smartCardNumber)}\n` +
          `👤 *Customer:* ${escapeMarkdown(session.data.customerName || 'Verified')}\n` +
          `💰 *Amount:* ${formatCurrency(amount)}\n` +
          `📦 *Transaction ID:* ${escapeMarkdown(requestId)}\n` +
          `${tokenDisplay}\n` +
          `💳 *New Balance:* ${formatCurrency(user.wallet)}\n\n` +
          `💡 *Save this receipt for reference!*`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
        
        // Clear session
        await sessionManager.clearSession(userId);
      } else {
        const apiMessage = apiResponse.message || apiResponse.msg || 'Processing';
        
        await ctx.editMessageText(
          `⚠️ *SUBSCRIPTION ${status.toUpperCase()}*\n\n` +
          `📺 *Provider:* ${escapeMarkdown(provider.name)}\n` +
          `🔢 *Card Number:* ${escapeMarkdown(session.data.smartCardNumber)}\n` +
          `💰 *Amount:* ${formatCurrency(amount)}\n` +
          `📦 *Transaction ID:* ${escapeMarkdown(requestId)}\n\n` +
          `🔄 *Status:* ${escapeMarkdown(apiMessage)}\n\n` +
          `💡 *Note:* Your wallet has NOT been deducted.\n` +
          `Subscription will be activated if transaction succeeds.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Try Again', 'tv_back')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
      }
      
    } catch (error) {
      console.error('❌ TV purchase error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // ===== RECORD FAILED TRANSACTION =====
      const amount = session.data.amount || session.data.package?.amount || 0;
      const provider = CABLE_PROVIDERS[session.data.cablename];
      const transactionId = `TV${Date.now()}_${userId}`;
      
      try {
        const { recordTransaction } = require('../../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(userId, {
            id: transactionId,
            type: 'tv_subscription',
            amount: amount,
            provider: provider.name,
            provider_id: session.data.cablename,
            smart_card_number: session.data.smartCardNumber,
            customer_name: session.data.customerName || 'Verified',
            status: 'failed',
            description: `Failed TV subscription for ${provider.name}`,
            category: 'tv_subscription',
            error: error.message,
            metadata: {
              api_error: error.response?.data || { message: error.message },
              timestamp: Date.now()
            }
          });
        }
      } catch (dbError) {
        console.error('❌ Failed to record failed transaction:', dbError);
      }
      
      // Track failed API response
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          transactionId,
          'VTU_TV_PAY_API',
          {
            cablename: session.data.cablename,
            smart_card_number: session.data.smartCardNumber,
            amount: amount.toString()
          },
          error.response?.data || { error: error.message },
          'failed'
        );
      }
      
      let errorMessage = error.message || 'Unknown error';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      await ctx.editMessageText(
        `❌ *SUBSCRIPTION FAILED*\n\n` +
        `Error: ${escapeMarkdown(errorMessage)}\n\n` +
        `Please try again or contact support.`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Try Again', 'tv_back')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  }
}