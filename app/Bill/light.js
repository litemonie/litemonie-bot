// app/Bill/light.js - FIXED WITH PROPER IMPORTS AND TRANSACTION TRACKING
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
      console.log('✅ Loaded transaction managers for electricity module');
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

// Electricity providers mapping
const DISCO_LIST = {
  '1': { name: 'AEDC', code: 'AEDC' },
  '2': { name: 'EKEDC', code: 'EKEDC' },
  '3': { name: 'IKEDC', code: 'IKEDC' },
  '4': { name: 'JED', code: 'JED' },
  '5': { name: 'KAEDCO', code: 'KAEDCO' },
  '6': { name: 'PHED', code: 'PHED' }
};

module.exports = {
  handleElectricity: async (ctx, users, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    await sessionManager.setSession(userId, {
      action: 'electricity',
      step: 1,
      data: {}
    });
    
    await ctx.reply(
      '💡 *ELECTRICITY BILL PAYMENT*\n\n' +
      'Select your electricity provider \\(DISCO\\)\\:\n\n' +
      '1️⃣ AEDC\n' +
      '2️⃣ EKEDC\n' +
      '3️⃣ IKEDC\n' +
      '4️⃣ JED\n' +
      '5️⃣ KAEDCO\n' +
      '6️⃣ PHED\n\n' +
      '_Use the buttons below to select\\:_',
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⚡ AEDC', 'electricity_aedc')],
          [Markup.button.callback('⚡ EKEDC', 'electricity_ekedc')],
          [Markup.button.callback('⚡ IKEDC', 'electricity_ikedc')],
          [Markup.button.callback('⚡ JED', 'electricity_jed')],
          [Markup.button.callback('⚡ KAEDCO', 'electricity_kaedco')],
          [Markup.button.callback('⚡ PHED', 'electricity_phed')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  },

  handleText: async (ctx, text, userSession, user, users, transactions, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    if (userSession && userSession.action === 'electricity') {
      // Step 2: Meter number entry
      if (userSession.step === 2) {
        userSession.data.meter_number = text.trim();
        userSession.step = 2.5;
        await sessionManager.updateSession(userId, userSession);
        
        await ctx.reply(
          `⚡ *METER NUMBER RECEIVED*\n\n` +
          `🔢 *Meter\\:* ${escapeMarkdown(text.trim())}\n\n` +
          `Verifying meter details\\.\\.\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Verify', 'electricity_verify')],
              [Markup.button.callback('↩️ Change Meter', 'electricity_back')]
            ])
          }
        );
        return true;
      }
      
      // Step 3: Amount entry
      if (userSession.step === 3) {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount < 100) {
          await ctx.reply(
            '❌ *INVALID AMOUNT*\n\n' +
            'Please enter a valid amount \\(minimum ₦100\\)\\.',
            { parse_mode: 'MarkdownV2' }
          );
          return true;
        }
        
        userSession.data.amount = amount;
        userSession.step = 4;
        await sessionManager.updateSession(userId, userSession);
        
        // Check user balance
        if (user.wallet < amount) {
          await ctx.reply(
            `❌ *INSUFFICIENT BALANCE*\n\n` +
            `💰 *Required\\:* ${formatCurrency(amount)}\n` +
            `💰 *Available\\:* ${formatCurrency(user.wallet)}\n\n` +
            `💡 *Deposit funds to continue*`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('💳 Deposit Funds', 'deposit')],
                [Markup.button.callback('↩️ Back', 'electricity_back')]
              ])
            }
          );
          return true;
        }
        
        // Confirm purchase
        await ctx.reply(
          `⚡ *CONFIRM ELECTRICITY PAYMENT*\n\n` +
          `🏢 *Provider\\:* ${escapeMarkdown(DISCO_LIST[userSession.data.disco_name].name)}\n` +
          `🔢 *Meter\\:* ${escapeMarkdown(userSession.data.meter_number)}\n` +
          `👤 *Customer\\:* ${escapeMarkdown(userSession.data.customerName || 'Verified')}\n` +
          `💰 *Amount\\:* ${formatCurrency(amount)}\n\n` +
          `💳 *Your balance\\:* ${formatCurrency(user.wallet)}\n` +
          `💵 *After payment\\:* ${formatCurrency(user.wallet - amount)}\n\n` +
          `_Confirm payment\\?_`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Payment', 'electricity_purchase')],
              [Markup.button.callback('↩️ Change Amount', 'electricity_back')],
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
    electricity_aedc: async (ctx) => await handleDiscoSelection(ctx, '1', 'AEDC', users, sessionManager),
    electricity_ekedc: async (ctx) => await handleDiscoSelection(ctx, '2', 'EKEDC', users, sessionManager),
    electricity_ikedc: async (ctx) => await handleDiscoSelection(ctx, '3', 'IKEDC', users, sessionManager),
    electricity_jed: async (ctx) => await handleDiscoSelection(ctx, '4', 'JED', users, sessionManager),
    electricity_kaedco: async (ctx) => await handleDiscoSelection(ctx, '5', 'KAEDCO', users, sessionManager),
    electricity_phed: async (ctx) => await handleDiscoSelection(ctx, '6', 'PHED', users, sessionManager),
    electricity_verify: async (ctx) => await handleMeterVerification(ctx, users, sessionManager, CONFIG),
    electricity_purchase: async (ctx) => await handleElectricityPurchase(ctx, users, transactions, sessionManager, CONFIG),
    electricity_back: async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = await sessionManager.getSession(userId);
      
      if (session && session.action === 'electricity') {
        if (session.step >= 2) {
          session.step = 2;
          session.data.meter_number = null;
          session.data.customerName = null;
          session.data.customerAddress = null;
          session.data.amount = null;
          await sessionManager.updateSession(userId, session);
          
          await ctx.editMessageText(
            `⚡ *${session.data.discoName} BILL PAYMENT*\n\n` +
            `Enter your meter number\\:\n\n` +
            `📝 *Example\\:* 12345678901\n\n` +
            `_Make sure to enter the correct meter number_`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('↩️ Back', 'electricity_show')],
                [Markup.button.callback('❌ Cancel', 'start')]
              ])
            }
          );
        }
      }
    },
    electricity_show: async (ctx) => {
      // Show electricity menu again
      const userId = ctx.from.id.toString();
      await sessionManager.setSession(userId, {
        action: 'electricity',
        step: 1,
        data: {}
      });
      
      await ctx.editMessageText(
        '💡 *ELECTRICITY BILL PAYMENT*\n\n' +
        'Select your electricity provider \\(DISCO\\)\\:\n\n' +
        '1️⃣ AEDC\n' +
        '2️⃣ EKEDC\n' +
        '3️⃣ IKEDC\n' +
        '4️⃣ JED\n' +
        '5️⃣ KAEDCO\n' +
        '6️⃣ PHED\n\n' +
        '_Use the buttons below to select\\:_',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ AEDC', 'electricity_aedc')],
            [Markup.button.callback('⚡ EKEDC', 'electricity_ekedc')],
            [Markup.button.callback('⚡ IKEDC', 'electricity_ikedc')],
            [Markup.button.callback('⚡ JED', 'electricity_jed')],
            [Markup.button.callback('⚡ KAEDCO', 'electricity_kaedco')],
            [Markup.button.callback('⚡ PHED', 'electricity_phed')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  })
};

async function handleDiscoSelection(ctx, discoId, discoName, users, sessionManager) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'electricity') {
    session.data.disco_name = discoId;
    session.data.discoName = discoName;
    session.step = 2;
    await sessionManager.updateSession(userId, session);
    
    await ctx.editMessageText(
      `⚡ *${discoName} BILL PAYMENT*\n\n` +
      `Enter your meter number\\:\n\n` +
      `📝 *Example\\:* 12345678901\n\n` +
      `_Make sure to enter the correct meter number_`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('↩️ Back', 'electricity_show')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  }
}

async function handleMeterVerification(ctx, users, sessionManager, CONFIG) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'electricity' && session.data.meter_number) {
    try {
      await ctx.editMessageText(
        `🔍 *Verifying meter number\\.\\.\\.*\n\n` +
        `⚡ *DISCO\\:* ${session.data.discoName}\n` +
        `🔢 *Meter\\:* ${escapeMarkdown(session.data.meter_number)}\n\n` +
        `Please wait while we verify\\.\\.\\.`,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Prepare API request data
      const apiRequestData = {
        disco_name: session.data.disco_name,
        meter_number: session.data.meter_number
      };
      
      console.log('📤 Electricity verification request:', apiRequestData);
      
      // Make API call to verify meter
      const response = await axios.post(
        `${CONFIG.VTU_BASE_URL}/billpayment/verify/`,
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
      console.log('📥 Electricity verification response:', apiResponse);
      
      // Track verification API response
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          `VERIFY_${Date.now()}`,
          'VTU_ELECTRICITY_VERIFY_API',
          apiRequestData,
          apiResponse,
          apiResponse.status === 'success' ? 'success' : 'failed'
        );
      }
      
      if (apiResponse.status === 'success') {
        session.data.customerName = apiResponse.Customer_Name;
        session.data.customerAddress = apiResponse.Customer_Address;
        session.step = 3;
        await sessionManager.updateSession(userId, session);
        
        await ctx.editMessageText(
          `✅ *VERIFICATION SUCCESSFUL*\n\n` +
          `⚡ *DISCO\\:* ${session.data.discoName}\n` +
          `🔢 *Meter\\:* ${escapeMarkdown(session.data.meter_number)}\n` +
          `👤 *Customer Name\\:* ${escapeMarkdown(apiResponse.Customer_Name || 'N/A')}\n` +
          `🏠 *Address\\:* ${escapeMarkdown(apiResponse.Customer_Address || 'N/A')}\n\n` +
          `Enter amount to pay \\(in Naira\\)\\:\n\n` +
          `📝 *Example\\:* 1000, 2000, 5000`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Back', 'electricity_back')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
      } else {
        await ctx.editMessageText(
          '❌ *VERIFICATION FAILED*\n\n' +
          `Error\\: ${escapeMarkdown(apiResponse.message || 'Unable to verify meter number')}\n\n` +
          'Please check the meter number and try again\\.',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Try Again', 'electricity_back')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
      }
    } catch (error) {
      console.error('❌ Electricity verification error:', error.message);
      
      // Track failed verification
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          `VERIFY_${Date.now()}`,
          'VTU_ELECTRICITY_VERIFY_API',
          {
            disco_name: session.data.disco_name,
            meter_number: session.data.meter_number
          },
          { error: error.message },
          'failed'
        );
      }
      
      await ctx.editMessageText(
        '❌ *VERIFICATION ERROR*\n\n' +
        'Unable to verify meter details\\. Please try again later\\.',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Back', 'electricity_back')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  }
}

async function handleElectricityPurchase(ctx, users, transactions, sessionManager, CONFIG) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  const user = users[userId];
  
  if (session && session.action === 'electricity' && session.data.amount) {
    try {
      const amount = session.data.amount;
      const disco = DISCO_LIST[session.data.disco_name];
      const requestId = `ELEC${Date.now()}_${userId}`;
      const transactionId = requestId;
      
      await ctx.editMessageText(
        `🔄 *Processing payment\\.\\.\\.*\n\n` +
        `⚡ *Provider\\:* ${escapeMarkdown(disco.name)}\n` +
        `🔢 *Meter\\:* ${escapeMarkdown(session.data.meter_number)}\n` +
        `💰 *Amount\\:* ${formatCurrency(amount)}\n\n` +
        `Please wait\\.\\.\\.`,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Prepare API request data
      const apiRequestData = {
        disco_name: session.data.disco_name,
        meter_number: session.data.meter_number,
        amount: amount.toString(),
        customer_name: session.data.customerName || 'Verified Customer'
      };
      
      console.log('📤 Electricity purchase request:', apiRequestData);
      
      // Make API call to purchase electricity
      const response = await axios.post(
        `${CONFIG.VTU_BASE_URL}/billpayment/pay/`,
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
      console.log('📥 Electricity purchase response:', apiResponse);
      
      const isSuccessful = apiResponse.status === 'success' || apiResponse.Status === 'successful';
      const status = isSuccessful ? 'completed' : (apiResponse.status === 'pending' ? 'pending' : 'failed');
      const apiStatus = isSuccessful ? 'success' : (status === 'pending' ? 'pending' : 'failed');
      
      // ===== USE UNIFIED TRANSACTION RECORDING =====
      try {
        const { recordTransaction } = require('../../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(userId, {
            id: transactionId,
            type: 'electricity',
            amount: amount,
            disco: disco.name,
            disco_id: session.data.disco_name,
            meter_number: session.data.meter_number,
            customer_name: session.data.customerName || 'Verified',
            status: status,
            description: `Electricity bill payment for ${disco.name} - Meter: ${session.data.meter_number}`,
            category: 'electricity',
            reference: apiResponse.reference || apiResponse.id || requestId,
            token: apiResponse.token || apiResponse.pin || null,
            units: apiResponse.units || null,
            error: !isSuccessful ? (apiResponse.message || 'Processing') : null,
            metadata: {
              api_response: apiResponse,
              api_status: apiStatus,
              timestamp: Date.now()
            }
          });
          console.log(`✅ Electricity transaction recorded using unified function: ${transactionId}`);
        } else {
          // Fallback to manual recording
          throw new Error('recordTransaction not available');
        }
      } catch (dbError) {
        console.warn('⚠️ Using manual transaction recording fallback for electricity');
        
        // Manual recording fallback
        const transactionData = {
          id: requestId,
          type: 'electricity',
          disco: disco.name,
          meter_number: session.data.meter_number,
          amount: amount,
          customer_name: session.data.customerName || 'Verified',
          reference: apiResponse.reference || apiResponse.id || requestId,
          status: status,
          token: apiResponse.token || apiResponse.pin || null,
          units: apiResponse.units || null,
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
            description: `Electricity bill payment for ${disco.name}`,
            apiData: apiResponse
          });
        }
      }
      
      // Track API response
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          transactionId,
          'VTU_ELECTRICITY_PAY_API',
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
          tokenDisplay = `🔑 *Token\\:* \`${escapeMarkdown(apiResponse.token || apiResponse.pin)}\`\n`;
        }
        if (apiResponse.units) {
          tokenDisplay += `⚡ *Units\\:* ${apiResponse.units} kWh\n`;
        }
        
        await ctx.editMessageText(
          `✅ *PAYMENT SUCCESSFUL\\!*\n\n` +
          `⚡ *Provider\\:* ${escapeMarkdown(disco.name)}\n` +
          `🔢 *Meter\\:* ${escapeMarkdown(session.data.meter_number)}\n` +
          `👤 *Customer\\:* ${escapeMarkdown(session.data.customerName || 'Verified')}\n` +
          `💰 *Amount\\:* ${formatCurrency(amount)}\n` +
          `📦 *Transaction ID\\:* ${escapeMarkdown(requestId)}\n` +
          `${tokenDisplay}\n` +
          `💳 *New Balance\\:* ${formatCurrency(user.wallet)}\n\n` +
          `💡 *Save this receipt for reference\\!*`,
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
          `⚠️ *PAYMENT ${status.toUpperCase()}*\n\n` +
          `⚡ *Provider\\:* ${escapeMarkdown(disco.name)}\n` +
          `🔢 *Meter\\:* ${escapeMarkdown(session.data.meter_number)}\n` +
          `💰 *Amount\\:* ${formatCurrency(amount)}\n` +
          `📦 *Transaction ID\\:* ${escapeMarkdown(requestId)}\n\n` +
          `🔄 *Status\\:* ${escapeMarkdown(apiMessage)}\n\n` +
          `💡 *Note\\:* Your wallet has NOT been deducted\\.\n` +
          `Payment will be completed if transaction succeeds\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Try Again', 'electricity_back')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Electricity purchase error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // ===== RECORD FAILED TRANSACTION =====
      const amount = session.data.amount;
      const disco = DISCO_LIST[session.data.disco_name];
      const transactionId = `ELEC${Date.now()}_${userId}`;
      
      try {
        const { recordTransaction } = require('../../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(userId, {
            id: transactionId,
            type: 'electricity',
            amount: amount,
            disco: disco.name,
            disco_id: session.data.disco_name,
            meter_number: session.data.meter_number,
            customer_name: session.data.customerName || 'Verified',
            status: 'failed',
            description: `Failed electricity payment for ${disco.name}`,
            category: 'electricity',
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
          'VTU_ELECTRICITY_PAY_API',
          {
            disco_name: session.data.disco_name,
            meter_number: session.data.meter_number,
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
        `❌ *PAYMENT FAILED*\n\n` +
        `Error\\: ${escapeMarkdown(errorMessage)}\n\n` +
        `Please try again or contact support\\.`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Try Again', 'electricity_back')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  }
}