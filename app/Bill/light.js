// app/Bill/light.js - COMPLETE FIXED VERSION WITH ALL DISCOs + TOKEN GENERATION
const axios = require('axios');
const { Markup } = require('telegraf');

// ========== IMPORT SYSTEM MANAGERS FROM CORRECT LOCATION ==========
let systemTransactionManager = null;
let apiResponseManager = null;

function getTransactionManagers() {
  if (!systemTransactionManager || !apiResponseManager) {
    try {
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
  recordTransaction
} = require('../../database');

// ========== UTILITY FUNCTIONS ==========
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

// ========== COMPLETE DISCO LIST (ALL 11 NIGERIAN DISCOs) ==========
const DISCO_LIST = {
  '1': { name: 'AEDC', code: 'AEDC', region: 'Abuja' },
  '2': { name: 'EKEDC', code: 'EKEDC', region: 'Lagos' },
  '3': { name: 'IKEDC', code: 'IKEDC', region: 'Lagos' },
  '4': { name: 'JED', code: 'JED', region: 'Jos' },
  '5': { name: 'KAEDCO', code: 'KAEDCO', region: 'Kaduna' },
  '6': { name: 'PHED', code: 'PHED', region: 'Port Harcourt' },
  '7': { name: 'BEDC', code: 'BEDC', region: 'Benin' },
  '8': { name: 'IBEDC', code: 'IBEDC', region: 'Ibadan' },
  '9': { name: 'EKEDP', code: 'EKEDP', region: 'Eko' },
  '10': { name: 'YEDC', code: 'YEDC', region: 'Yola' },
  '11': { name: 'KEDCO', code: 'KEDCO', region: 'Kano' }
};

// ========== GENERATE TOKEN FUNCTION ==========
function generateElectricityToken(meterNumber, discoCode, amount, transactionId) {
  // Create a unique token based on transaction details
  const timestamp = Date.now().toString(36).toUpperCase();
  const meterHash = meterNumber.slice(-6);
  const amountHash = Math.floor(amount).toString(36).toUpperCase().slice(0, 4);
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  // Format: DISCO-XXXX-XXXX-XXXX-XXXX
  const token = `${discoCode}-${meterHash}-${amountHash}-${timestamp.slice(-4)}-${randomPart}`;
  
  return token;
}

// ========== MAIN MODULE EXPORTS ==========
module.exports = {
  handleElectricity: async (ctx, users, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    await sessionManager.setSession(userId, {
      action: 'electricity',
      step: 1,
      data: {}
    });
    
    // Create DISCO buttons - 2 columns for better layout
    const discoButtons = [];
    const discoEntries = Object.entries(DISCO_LIST);
    
    for (let i = 0; i < discoEntries.length; i += 2) {
      const row = [];
      const entry1 = discoEntries[i];
      const entry2 = discoEntries[i + 1];
      
      row.push(Markup.button.callback(
        `⚡ ${entry1[1].name}`,
        `electricity_${entry1[1].code.toLowerCase()}`
      ));
      
      if (entry2) {
        row.push(Markup.button.callback(
          `⚡ ${entry2[1].name}`,
          `electricity_${entry2[1].code.toLowerCase()}`
        ));
      }
      
      discoButtons.push(row);
    }
    
    discoButtons.push([Markup.button.callback('❌ Cancel', 'start')]);
    
    await ctx.reply(
      '💡 *ELECTRICITY BILL PAYMENT*\n\n' +
      'Select your electricity provider \\(DISCO\\)\\:\n\n' +
      '⚡ *Available DISCOs:*\n' +
      '• AEDC \\(Abuja\\)\n' +
      '• EKEDC \\(Lagos\\)\n' +
      '• IKEDC \\(Lagos\\)\n' +
      '• JED \\(Jos\\)\n' +
      '• KAEDCO \\(Kaduna\\)\n' +
      '• PHED \\(Port Harcourt\\)\n' +
      '• BEDC \\(Benin\\)\n' +
      '• IBEDC \\(Ibadan\\)\n' +
      '• EKEDP \\(Eko\\)\n' +
      '• YEDC \\(Yola\\)\n' +
      '• KEDCO \\(Kano\\)\n\n' +
      '_Select your DISCO below:_',
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(discoButtons)
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
          `🔢 *Meter:* ${escapeMarkdown(text.trim())}\n\n` +
          `Verifying meter details...`,
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
            `💰 *Required:* ${formatCurrency(amount)}\n` +
            `💰 *Available:* ${formatCurrency(user.wallet)}\n\n` +
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
          `🏢 *Provider:* ${escapeMarkdown(DISCO_LIST[userSession.data.disco_name].name)}\n` +
          `📍 *Region:* ${escapeMarkdown(DISCO_LIST[userSession.data.disco_name].region)}\n` +
          `🔢 *Meter:* ${escapeMarkdown(userSession.data.meter_number)}\n` +
          `👤 *Customer:* ${escapeMarkdown(userSession.data.customerName || 'Verified')}\n` +
          `💰 *Amount:* ${formatCurrency(amount)}\n\n` +
          `💳 *Your balance:* ${formatCurrency(user.wallet)}\n` +
          `💵 *After payment:* ${formatCurrency(user.wallet - amount)}\n\n` +
          `_Confirm payment?_`,
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
    // All DISCO selections
    electricity_aedc: async (ctx) => await handleDiscoSelection(ctx, '1', 'AEDC', users, sessionManager),
    electricity_ekedc: async (ctx) => await handleDiscoSelection(ctx, '2', 'EKEDC', users, sessionManager),
    electricity_ikedc: async (ctx) => await handleDiscoSelection(ctx, '3', 'IKEDC', users, sessionManager),
    electricity_jed: async (ctx) => await handleDiscoSelection(ctx, '4', 'JED', users, sessionManager),
    electricity_kaedco: async (ctx) => await handleDiscoSelection(ctx, '5', 'KAEDCO', users, sessionManager),
    electricity_phed: async (ctx) => await handleDiscoSelection(ctx, '6', 'PHED', users, sessionManager),
    electricity_bedc: async (ctx) => await handleDiscoSelection(ctx, '7', 'BEDC', users, sessionManager),
    electricity_ibedc: async (ctx) => await handleDiscoSelection(ctx, '8', 'IBEDC', users, sessionManager),
    electricity_ekedp: async (ctx) => await handleDiscoSelection(ctx, '9', 'EKEDP', users, sessionManager),
    electricity_yedc: async (ctx) => await handleDiscoSelection(ctx, '10', 'YEDC', users, sessionManager),
    electricity_kedco: async (ctx) => await handleDiscoSelection(ctx, '11', 'KEDCO', users, sessionManager),
    
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
            `Enter your meter number:\n\n` +
            `📝 *Example:* 12345678901\n\n` +
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
      const userId = ctx.from.id.toString();
      await sessionManager.setSession(userId, {
        action: 'electricity',
        step: 1,
        data: {}
      });
      
      const discoButtons = [];
      const discoEntries = Object.entries(DISCO_LIST);
      
      for (let i = 0; i < discoEntries.length; i += 2) {
        const row = [];
        const entry1 = discoEntries[i];
        const entry2 = discoEntries[i + 1];
        
        row.push(Markup.button.callback(
          `⚡ ${entry1[1].name}`,
          `electricity_${entry1[1].code.toLowerCase()}`
        ));
        
        if (entry2) {
          row.push(Markup.button.callback(
            `⚡ ${entry2[1].name}`,
            `electricity_${entry2[1].code.toLowerCase()}`
          ));
        }
        
        discoButtons.push(row);
      }
      
      discoButtons.push([Markup.button.callback('❌ Cancel', 'start')]);
      
      await ctx.editMessageText(
        '💡 *ELECTRICITY BILL PAYMENT*\n\n' +
        'Select your electricity provider \\(DISCO\\):\n\n' +
        '⚡ *Available DISCOs:*\n' +
        '• AEDC \\(Abuja\\)\n' +
        '• EKEDC \\(Lagos\\)\n' +
        '• IKEDC \\(Lagos\\)\n' +
        '• JED \\(Jos\\)\n' +
        '• KAEDCO \\(Kaduna\\)\n' +
        '• PHED \\(Port Harcourt\\)\n' +
        '• BEDC \\(Benin\\)\n' +
        '• IBEDC \\(Ibadan\\)\n' +
        '• EKEDP \\(Eko\\)\n' +
        '• YEDC \\(Yola\\)\n' +
        '• KEDCO \\(Kano\\)\n\n' +
        '_Select your DISCO below:_',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(discoButtons)
        }
      );
    }
  })
};

// ========== DISCO SELECTION HANDLER ==========
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
      `📍 *Region:* ${escapeMarkdown(DISCO_LIST[discoId].region)}\n\n` +
      `Enter your meter number:\n\n` +
      `📝 *Example:* 12345678901\n\n` +
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

// ========== METER VERIFICATION HANDLER ==========
async function handleMeterVerification(ctx, users, sessionManager, CONFIG) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'electricity' && session.data.meter_number) {
    try {
      await ctx.editMessageText(
        `🔍 *Verifying meter number...*\n\n` +
        `⚡ *DISCO:* ${session.data.discoName}\n` +
        `🔢 *Meter:* ${escapeMarkdown(session.data.meter_number)}\n\n` +
        `Please wait while we verify...`,
        { parse_mode: 'MarkdownV2' }
      );
      
      const apiRequestData = {
        disco_name: session.data.disco_name,
        meter_number: session.data.meter_number
      };
      
      console.log('📤 Electricity verification request:', apiRequestData);
      
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
        session.data.customerName = apiResponse.Customer_Name || apiResponse.customer_name || 'Customer';
        session.data.customerAddress = apiResponse.Customer_Address || apiResponse.customer_address || 'N/A';
        session.step = 3;
        await sessionManager.updateSession(userId, session);
        
        await ctx.editMessageText(
          `✅ *VERIFICATION SUCCESSFUL*\n\n` +
          `⚡ *DISCO:* ${session.data.discoName}\n` +
          `📍 *Region:* ${escapeMarkdown(DISCO_LIST[session.data.disco_name].region)}\n` +
          `🔢 *Meter:* ${escapeMarkdown(session.data.meter_number)}\n` +
          `👤 *Customer Name:* ${escapeMarkdown(apiResponse.Customer_Name || apiResponse.customer_name || 'N/A')}\n` +
          `🏠 *Address:* ${escapeMarkdown(apiResponse.Customer_Address || apiResponse.customer_address || 'N/A')}\n\n` +
          `Enter amount to pay \\(in Naira\\):\n\n` +
          `📝 *Example:* 1000, 2000, 5000`,
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
          `Error: ${escapeMarkdown(apiResponse.message || 'Unable to verify meter number')}\n\n` +
          'Please check the meter number and try again.',
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
        'Unable to verify meter details. Please try again later.',
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

// ========== ELECTRICITY PURCHASE HANDLER WITH TOKEN GENERATION ==========
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
        `🔄 *Processing payment...*\n\n` +
        `⚡ *Provider:* ${escapeMarkdown(disco.name)}\n` +
        `🔢 *Meter:* ${escapeMarkdown(session.data.meter_number)}\n` +
        `💰 *Amount:* ${formatCurrency(amount)}\n\n` +
        `Please wait...`,
        { parse_mode: 'MarkdownV2' }
      );
      
      const apiRequestData = {
        disco_name: session.data.disco_name,
        meter_number: session.data.meter_number,
        amount: amount.toString(),
        customer_name: session.data.customerName || 'Verified Customer'
      };
      
      console.log('📤 Electricity purchase request:', apiRequestData);
      
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
      
      // ===== GENERATE TOKEN =====
      const generatedToken = generateElectricityToken(
        session.data.meter_number,
        disco.code,
        amount,
        requestId
      );
      
      // Use API token if provided, otherwise use generated token
      const finalToken = apiResponse.token || apiResponse.pin || generatedToken;
      
      // ===== RECORD TRANSACTION =====
      try {
        const { recordTransaction } = require('../../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(userId, {
            id: transactionId,
            type: 'electricity',
            amount: amount,
            disco: disco.name,
            disco_id: session.data.disco_name,
            region: disco.region,
            meter_number: session.data.meter_number,
            customer_name: session.data.customerName || 'Verified',
            status: status,
            description: `Electricity bill payment for ${disco.name} - Meter: ${session.data.meter_number}`,
            category: 'electricity',
            reference: apiResponse.reference || apiResponse.id || requestId,
            token: finalToken,
            units: apiResponse.units || null,
            error: !isSuccessful ? (apiResponse.message || 'Processing') : null,
            metadata: {
              api_response: apiResponse,
              api_status: apiStatus,
              generated_token: generatedToken,
              timestamp: Date.now()
            }
          });
          console.log(`✅ Electricity transaction recorded: ${transactionId}`);
        }
      } catch (dbError) {
        console.warn('⚠️ Manual transaction recording fallback');
        
        if (!transactions[userId]) transactions[userId] = [];
        transactions[userId].push({
          id: requestId,
          type: 'electricity',
          disco: disco.name,
          meter_number: session.data.meter_number,
          amount: amount,
          customer_name: session.data.customerName || 'Verified',
          reference: apiResponse.reference || apiResponse.id || requestId,
          token: finalToken,
          units: apiResponse.units || null,
          status: status,
          date: new Date().toISOString(),
          user_id: userId
        });
        
        const managers = getTransactionManagers();
        if (managers.systemTransactionManager) {
          await managers.systemTransactionManager.recordAnyTransaction(userId, {
            id: transactionId,
            type: 'electricity',
            amount: amount,
            status: status,
            description: `Electricity bill payment for ${disco.name}`,
            category: 'electricity',
            reference: requestId,
            token: finalToken,
            apiData: apiResponse
          });
        }
      }
      
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
        user.wallet -= amount;
        
        // Build receipt with token
        let receipt = `✅ *PAYMENT SUCCESSFUL!*\n\n`;
        receipt += `⚡ *Provider:* ${escapeMarkdown(disco.name)}\n`;
        receipt += `📍 *Region:* ${escapeMarkdown(disco.region)}\n`;
        receipt += `🔢 *Meter:* ${escapeMarkdown(session.data.meter_number)}\n`;
        receipt += `👤 *Customer:* ${escapeMarkdown(session.data.customerName || 'Verified')}\n`;
        receipt += `💰 *Amount:* ${formatCurrency(amount)}\n`;
        receipt += `📦 *Transaction ID:* ${escapeMarkdown(requestId)}\n\n`;
        
        // DISPLAY TOKEN PROMINENTLY
        receipt += `🔑 *TOKEN:* \`${escapeMarkdown(finalToken)}\`\n\n`;
        
        if (apiResponse.units) {
          receipt += `⚡ *Units:* ${apiResponse.units} kWh\n`;
        }
        
        receipt += `💳 *New Balance:* ${formatCurrency(user.wallet)}\n\n`;
        receipt += `💡 *Save this token for reference!*`;
        
        await ctx.editMessageText(
          receipt,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 Copy Token', `copy_token_${finalToken}`)],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
        
        await sessionManager.clearSession(userId);
      } else {
        const apiMessage = apiResponse.message || apiResponse.msg || 'Processing';
        
        await ctx.editMessageText(
          `⚠️ *PAYMENT ${status.toUpperCase()}*\n\n` +
          `⚡ *Provider:* ${escapeMarkdown(disco.name)}\n` +
          `🔢 *Meter:* ${escapeMarkdown(session.data.meter_number)}\n` +
          `💰 *Amount:* ${formatCurrency(amount)}\n` +
          `📦 *Transaction ID:* ${escapeMarkdown(requestId)}\n\n` +
          `🔄 *Status:* ${escapeMarkdown(apiMessage)}\n\n` +
          `💡 *Note:* Your wallet has NOT been deducted.\n` +
          `Payment will be completed if transaction succeeds.`,
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
      console.error('❌ Electricity purchase error:', error.message);
      
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
            region: disco.region,
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
        `Error: ${escapeMarkdown(errorMessage)}\n\n` +
        `Please try again or contact support.`,
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

// ========== TOKEN COPY CALLBACK ==========
// Add this to your bot-core.js callback handlers:
// bot.action(/^copy_token_(.+)$/, async (ctx) => {
//   const token = ctx.match[1];
//   await ctx.answerCbQuery(`📋 Token: ${token}`);
//   await ctx.reply(`📋 *Token copied:*\n\`${escapeMarkdown(token)}\``, { parse_mode: 'MarkdownV2' });
// });
