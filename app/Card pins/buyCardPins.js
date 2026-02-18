// app/Card pins/buyCardPins.js - FIXED WITH HTML PARSING MODE
const { Markup } = require('telegraf');
const axios = require('axios');

// Import transaction manager from index.js
let systemTransactionManager = null;
let transactionMethods = null;

// Function to get system transaction manager (prevents circular dependency)
function getSystemTransactionManager() {
  if (!systemTransactionManager) {
    try {
      // Use relative path from Card pins folder to index.js
      const { systemTransactionManager: stm, transactionMethods: tm } = require('../../index');
      systemTransactionManager = stm;
      transactionMethods = tm;
    } catch (error) {
      console.error('❌ Could not load systemTransactionManager:', error.message);
    }
  }
  return systemTransactionManager;
}

// No need for escapeMarkdown with HTML mode
function escapeHTML(text) {
  if (typeof text !== 'string') return text.toString();
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(amount) {
  return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Network mapping based on API documentation
const NETWORKS = {
  '1': { 
    name: 'MTN', 
    amounts: [100, 200, 500],
    numericId: '1'
  },
  '2': { 
    name: 'GLO', 
    amounts: [100, 200, 500],
    numericId: '2'
  },
  '3': { 
    name: '9MOBILE', 
    amounts: [100, 200, 500],
    numericId: '3'
  },
  '4': { 
    name: 'AIRTEL', 
    amounts: [100, 200, 500],
    numericId: '4'
  }
};

// Rate limiting
const rateLimit = new Map();

async function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = rateLimit.get(userId) || { count: 0, lastAttempt: 0 };
  
  if (now - userLimit.lastAttempt < 5000) { // 5 seconds between requests
    userLimit.count++;
    if (userLimit.count > 3) {
      return false; // Too many attempts
    }
  } else {
    userLimit.count = 1;
  }
  
  userLimit.lastAttempt = now;
  rateLimit.set(userId, userLimit);
  return true;
}

module.exports = {
  handleCardPinsMenu: async (ctx, users, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    await sessionManager.setSession(userId, {
      action: 'card_pins',
      step: 1,
      data: {}
    });
    
    await ctx.reply(
      '🎫 <b>RECHARGE CARD PINS</b>\n\n' +
      'Select network:\n\n' +
      '1️⃣ MTN\n' +
      '2️⃣ GLO\n' +
      '3️⃣ 9MOBILE\n' +
      '4️⃣ AIRTEL\n\n' +
      '<i>Minimum quantity: 1 pin per transaction</i>\n' +
      '<i>Available amounts: ₦100, ₦200, ₦500</i>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📱 MTN', 'card_mtn')],
          [Markup.button.callback('📶 GLO', 'card_glo')],
          [Markup.button.callback('9️⃣ 9MOBILE', 'card_9mobile')],
          [Markup.button.callback('📡 AIRTEL', 'card_airtel')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  },

  handleText: async (ctx, text, userSession, user, users, transactions, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    if (userSession && userSession.action === 'card_pins') {
      if (userSession.step === 3) {
        const quantity = parseInt(text.trim());
        
        // Validate quantity - minimum is 1
        if (isNaN(quantity) || quantity < 1) {
          await ctx.reply('❌ Minimum quantity is 1 pin. Please enter 1 or more.', { parse_mode: 'HTML' });
          return true;
        }
        
        // Reasonable maximum to prevent abuse
        if (quantity > 1000) {
          await ctx.reply('❌ Maximum quantity is 1000 pins per transaction. Please enter a smaller quantity.', { parse_mode: 'HTML' });
          return true;
        }
        
        // Warn if quantity is less than 10 but still allow it - FIXED WITH HTML
        if (quantity < 10) {
          const warningMessage = 
            `⚠️ <b>NOTE:</b> API documentation shows minimum of 10 pins.\n` +
            `Proceeding with ${quantity} pins...\n\n` +
            `Press "✅ Confirm Purchase" to continue.`;
          
          await ctx.reply(
            warningMessage,
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirm Purchase', 'card_confirm')],
                [Markup.button.callback('↩️ Change Quantity', 'card_back_quantity')],
                [Markup.button.callback('❌ Cancel', 'start')]
              ])
            }
          );
          
          userSession.data.quantity = quantity;
          userSession.step = 4;
          await sessionManager.updateSession(userId, userSession);
          return true;
        }
        
        userSession.data.quantity = quantity;
        userSession.step = 4;
        await sessionManager.updateSession(userId, userSession);
        
        const amount = parseInt(userSession.data.network_amount);
        const totalCost = quantity * amount;
        
        await ctx.reply(
          `🎫 <b>CONFIRM PURCHASE</b>\n\n` +
          `📱 <b>Network:</b> ${userSession.data.networkName}\n` +
          `💰 <b>Amount per pin:</b> ${formatCurrency(amount)}\n` +
          `🔢 <b>Quantity:</b> ${quantity} pins\n` +
          `💵 <b>Total cost:</b> ${formatCurrency(totalCost)}\n\n` +
          `💳 <b>Your balance:</b> ${formatCurrency(user.wallet)}\n\n` +
          `📛 <b>ENTER BUSINESS/INDIVIDUAL NAME FOR CARD:</b>\n` +
          `<i>This field is REQUIRED by the API</i>\n` +
          `<i>Example: John Doe, XYZ Enterprise</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Use My Username', 'card_use_username')],
              [Markup.button.callback('↩️ Change Quantity', 'card_back_quantity')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
        return true;
      } else if (userSession.step === 4) {
        // Handle name input - REQUIRED FIELD
        const name = text.trim();
        
        if (!name || name.length < 2) {
          await ctx.reply(
            '❌ <b>NAME IS REQUIRED!</b>\n\n' +
            'Please enter a valid business/individual name.\n' +
            'Minimum 2 characters, maximum 50 characters.\n\n' +
            '<i>Example: John Doe, XYZ Enterprise</i>',
            { parse_mode: 'HTML' }
          );
          return true;
        }
        
        if (name.length > 50) {
          await ctx.reply('❌ Name is too long. Maximum 50 characters. Please enter a shorter name.', { parse_mode: 'HTML' });
          return true;
        }
        
        userSession.data.name_on_card = name;
        userSession.step = 5;
        await sessionManager.updateSession(userId, userSession);
        
        const amount = parseInt(userSession.data.network_amount);
        const quantity = parseInt(userSession.data.quantity);
        const totalCost = quantity * amount;
        
        await ctx.reply(
          `🎫 <b>FINAL CONFIRMATION</b>\n\n` +
          `📱 <b>Network:</b> ${userSession.data.networkName}\n` +
          `💰 <b>Amount:</b> ${formatCurrency(amount)} per pin\n` +
          `🔢 <b>Quantity:</b> ${quantity} pins\n` +
          `💵 <b>Total:</b> ${formatCurrency(totalCost)}\n` +
          `📛 <b>Name on Card:</b> ${escapeHTML(userSession.data.name_on_card)}\n\n` +
          `<i>Proceed with purchase?</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ YES, Purchase Now', 'card_final_confirm')],
              [Markup.button.callback('↩️ Change Details', 'card_back_quantity')],
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
    card_mtn: async (ctx) => await handleNetworkSelection(ctx, '1', 'MTN', users, sessionManager),
    card_glo: async (ctx) => await handleNetworkSelection(ctx, '2', 'GLO', users, sessionManager),
    card_9mobile: async (ctx) => await handleNetworkSelection(ctx, '3', '9MOBILE', users, sessionManager),
    card_airtel: async (ctx) => await handleNetworkSelection(ctx, '4', 'AIRTEL', users, sessionManager),
    card_amount_100: async (ctx) => await handleAmountSelection(ctx, '100', users, sessionManager),
    card_amount_200: async (ctx) => await handleAmountSelection(ctx, '200', users, sessionManager),
    card_amount_500: async (ctx) => await handleAmountSelection(ctx, '500', users, sessionManager),
    card_back: async (ctx) => {
      // Go back to network selection
      const userId = ctx.from.id.toString();
      await sessionManager.setSession(userId, {
        action: 'card_pins',
        step: 1,
        data: {}
      });
      
      await ctx.editMessageText(
        '🎫 <b>RECHARGE CARD PINS</b>\n\n' +
        'Select network:\n\n' +
        '1️⃣ MTN\n' +
        '2️⃣ GLO\n' +
        '3️⃣ 9MOBILE\n' +
        '4️⃣ AIRTEL\n\n' +
        '<i>Minimum quantity: 1 pin per transaction</i>\n' +
        '<i>Available amounts: ₦100, ₦200, ₦500</i>',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📱 MTN', 'card_mtn')],
            [Markup.button.callback('📶 GLO', 'card_glo')],
            [Markup.button.callback('9️⃣ 9MOBILE', 'card_9mobile')],
            [Markup.button.callback('📡 AIRTEL', 'card_airtel')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    },
    card_back_amount: async (ctx) => {
      // Go back to amount selection
      const userId = ctx.from.id.toString();
      const session = await sessionManager.getSession(userId);
      
      if (session && session.action === 'card_pins') {
        session.step = 2;
        await sessionManager.updateSession(userId, session);
        
        await ctx.editMessageText(
          `🎫 <b>${session.data.networkName} RECHARGE PINS</b>\n\n` +
          `Select pin amount:\n\n` +
          `💰 ${formatCurrency(100)} per pin\n` +
          `💰 ${formatCurrency(200)} per pin\n` +
          `💰 ${formatCurrency(500)} per pin\n\n` +
          `<i>Minimum purchase: 1 pin</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(`💰 ${formatCurrency(100)}`, 'card_amount_100')],
              [Markup.button.callback(`💰 ${formatCurrency(200)}`, 'card_amount_200')],
              [Markup.button.callback(`💰 ${formatCurrency(500)}`, 'card_amount_500')],
              [Markup.button.callback('↩️ Back', 'card_back'), Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
      }
    },
    card_confirm: async (ctx) => await handleCardPurchase(ctx, users, sessionManager, CONFIG, true),
    card_final_confirm: async (ctx) => await handleCardPurchase(ctx, users, sessionManager, CONFIG, false),
    card_use_username: async (ctx) => {
      // Use username as name_on_card
      const userId = ctx.from.id.toString();
      const session = await sessionManager.getSession(userId);
      const user = users[userId];
      
      if (session && session.action === 'card_pins') {
        // Get a valid name - try username, first name, or create one
        let name = user.username || user.firstName || `User_${userId.substring(0, 6)}`;
        
        // Ensure name is valid
        if (name.length < 2) {
          name = `Customer_${userId.substring(0, 6)}`;
        }
        
        session.data.name_on_card = name;
        session.step = 5;
        await sessionManager.updateSession(userId, session);
        
        const amount = parseInt(session.data.network_amount);
        const quantity = parseInt(session.data.quantity) || 1;
        const totalCost = quantity * amount;
        
        await ctx.editMessageText(
          `🎫 <b>FINAL CONFIRMATION</b>\n\n` +
          `📱 <b>Network:</b> ${session.data.networkName}\n` +
          `💰 <b>Amount:</b> ${formatCurrency(amount)} per pin\n` +
          `🔢 <b>Quantity:</b> ${quantity} pins\n` +
          `💵 <b>Total:</b> ${formatCurrency(totalCost)}\n` +
          `📛 <b>Name on Card:</b> ${escapeHTML(session.data.name_on_card)}\n\n` +
          `<i>Proceed with purchase?</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ YES, Purchase Now', 'card_final_confirm')],
              [Markup.button.callback('↩️ Enter Custom Name', 'card_back_name')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
      }
    },
    card_back_name: async (ctx) => {
      // Go back to enter name
      const userId = ctx.from.id.toString();
      const session = await sessionManager.getSession(userId);
      const user = users[userId];
      
      if (session && session.action === 'card_pins') {
        session.step = 4;
        await sessionManager.updateSession(userId, session);
        
        const amount = parseInt(session.data.network_amount);
        const quantity = parseInt(session.data.quantity);
        const totalCost = quantity * amount;
        
        await ctx.editMessageText(
          `🎫 <b>CONFIRM PURCHASE</b>\n\n` +
          `📱 <b>Network:</b> ${session.data.networkName}\n` +
          `💰 <b>Amount per pin:</b> ${formatCurrency(amount)}\n` +
          `🔢 <b>Quantity:</b> ${quantity} pins\n` +
          `💵 <b>Total cost:</b> ${formatCurrency(totalCost)}\n\n` +
          `💳 <b>Your balance:</b> ${formatCurrency(user.wallet)}\n\n` +
          `📛 <b>ENTER BUSINESS/INDIVIDUAL NAME FOR CARD:</b>\n` +
          `<i>This field is REQUIRED by the API</i>\n` +
          `<i>Example: John Doe, XYZ Enterprise</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Use My Username', 'card_use_username')],
              [Markup.button.callback('↩️ Change Quantity', 'card_back_quantity')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
      }
    },
    card_back_quantity: async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = await sessionManager.getSession(userId);
      
      if (session && session.action === 'card_pins') {
        session.step = 3;
        await sessionManager.updateSession(userId, session);
        
        await ctx.editMessageText(
          `🎫 <b>${session.data.networkName} ${formatCurrency(session.data.network_amount)} PINS</b>\n\n` +
          `Enter quantity (minimum 1 pin):\n\n` +
          `📝 <b>Example:</b> 1, 5, 10, 20, 50, 100\n\n` +
          `<i>Total cost: ${formatCurrency(session.data.network_amount)} × quantity</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Back', 'card_back_amount')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
      }
    },
    card_show: async (ctx) => {
      // Show card pins menu again
      const userId = ctx.from.id.toString();
      await sessionManager.setSession(userId, {
        action: 'card_pins',
        step: 1,
        data: {}
      });
      
      await ctx.editMessageText(
        '🎫 <b>RECHARGE CARD PINS</b>\n\n' +
        'Select network:\n\n' +
        '1️⃣ MTN\n' +
        '2️⃣ GLO\n' +
        '3️⃣ 9MOBILE\n' +
        '4️⃣ AIRTEL\n\n' +
        '<i>Minimum quantity: 1 pin per transaction</i>\n' +
        '<i>Available amounts: ₦100, ₦200, ₦500</i>',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📱 MTN', 'card_mtn')],
            [Markup.button.callback('📶 GLO', 'card_glo')],
            [Markup.button.callback('9️⃣ 9MOBILE', 'card_9mobile')],
            [Markup.button.callback('📡 AIRTEL', 'card_airtel')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  })
};

async function handleNetworkSelection(ctx, networkId, networkName, users, sessionManager) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'card_pins') {
    session.data.network = networkId;
    session.data.networkName = networkName;
    session.step = 2;
    await sessionManager.updateSession(userId, session);
    
    await ctx.editMessageText(
      `🎫 <b>${networkName} RECHARGE PINS</b>\n\n` +
      `Select pin amount:\n\n` +
      `💰 ${formatCurrency(100)} per pin\n` +
      `💰 ${formatCurrency(200)} per pin\n` +
      `💰 ${formatCurrency(500)} per pin\n\n` +
      `<i>Minimum purchase: 1 pin</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`💰 ${formatCurrency(100)}`, 'card_amount_100')],
          [Markup.button.callback(`💰 ${formatCurrency(200)}`, 'card_amount_200')],
          [Markup.button.callback(`💰 ${formatCurrency(500)}`, 'card_amount_500')],
          [Markup.button.callback('↩️ Back', 'card_back'), Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  }
}

async function handleAmountSelection(ctx, amount, users, sessionManager) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'card_pins') {
    session.data.network_amount = amount;
    session.step = 3;
    await sessionManager.updateSession(userId, session);
    
    await ctx.editMessageText(
      `🎫 <b>${session.data.networkName} ${formatCurrency(amount)} PINS</b>\n\n` +
      `Enter quantity (minimum 1 pin):\n\n` +
      `📝 <b>Example:</b> 1, 5, 10, 20, 50, 100\n\n` +
      `<i>Total cost: ${formatCurrency(amount)} × quantity</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('↩️ Back', 'card_back_amount')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  }
}

async function handleCardPurchase(ctx, users, sessionManager, CONFIG, isEarlyConfirm = false) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  const user = users[userId];
  
  if (session && session.action === 'card_pins') {
    try {
      // Check rate limit
      if (!(await checkRateLimit(userId))) {
        await ctx.editMessageText(
          '⚠️ <b>TOO MANY REQUESTS</b>\n\n' +
          'Please wait 5 seconds between purchases.\n' +
          'Try again in a moment.',
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Try Again', 'card_back_quantity')],
              [Markup.button.callback('❌ Cancel', 'start')]
            ])
          }
        );
        return;
      }
      
      const quantity = parseInt(session.data.quantity);
      const amount = parseInt(session.data.network_amount);
      const totalCost = quantity * amount;
      const requestId = `CARD${Date.now()}_${userId}`;
      
      // Check if name_on_card is set - REQUIRED FIELD
      if (!session.data.name_on_card) {
        // If early confirm (from quantity < 10 warning), get a default name
        if (isEarlyConfirm) {
          // Get a valid name
          let defaultName = user.username || user.firstName || `User_${userId.substring(0, 6)}`;
          if (defaultName.length < 2) {
            defaultName = `Customer_${userId.substring(0, 6)}`;
          }
          session.data.name_on_card = defaultName;
          await sessionManager.updateSession(userId, session);
        } else {
          // Ask for name
          await ctx.editMessageText(
            '❌ <b>NAME REQUIRED</b>\n\n' +
            'Please enter a business/individual name for the card.\n' +
            'This field is required by the API.\n\n' +
            '<i>Example: John Doe, XYZ Enterprise</i>',
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Use My Username', 'card_use_username')],
                [Markup.button.callback('↩️ Back', 'card_back_quantity')]
              ])
            }
          );
          return;
        }
      }
      
      // Check user balance
      if (user.wallet < totalCost) {
        await ctx.editMessageText(
          `❌ <b>INSUFFICIENT BALANCE</b>\n\n` +
          `💰 <b>Required:</b> ${formatCurrency(totalCost)}\n` +
          `💰 <b>Available:</b> ${formatCurrency(user.wallet)}\n\n` +
          `💡 <b>Deposit funds to continue</b>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💳 Deposit Funds', 'deposit')],
              [Markup.button.callback('↩️ Back', 'card_back_quantity')]
            ])
          }
        );
        return;
      }
      
      await ctx.editMessageText(
        `🔄 <b>Processing purchase...</b>\n\n` +
        `📱 <b>Network:</b> ${session.data.networkName}\n` +
        `💰 <b>Amount:</b> ${formatCurrency(amount)} × ${quantity} pins\n` +
        `💵 <b>Total:</b> ${formatCurrency(totalCost)}\n\n` +
        `Please wait...`,
        { parse_mode: 'HTML' }
      );
      
      console.log('🔍 Sending API request with parameters:', {
        network: session.data.network,
        network_amount: amount.toString(),
        quantity: quantity.toString(),
        name_on_card: session.data.name_on_card
      });
      
      // Make API call with EXACT parameters from documentation
      const response = await axios.post(
        `${CONFIG.VTU_BASE_URL}/rechargepin/`,
        {
          network: session.data.network,
          network_amount: amount.toString(),
          quantity: quantity.toString(),
          name_on_card: session.data.name_on_card
        },
        {
          headers: {
            'Authorization': `Token ${CONFIG.VTU_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000,
          validateStatus: function (status) {
            return status >= 200 && status < 500;
          }
        }
      );
      
      const apiResponse = response.data;
      console.log('📊 Card Pin API Response:', apiResponse);
      
      // Check for success
      const isSuccessful = apiResponse && (
        apiResponse.Status === 'successful' || 
        apiResponse.status === 'success'
      );
      
      const status = isSuccessful ? 'completed' : 'pending';
      
      // Parse pins from API response
      let pinsArray = [];
      let serialsArray = [];
      
      if (apiResponse.pin && typeof apiResponse.pin === 'string') {
        pinsArray = apiResponse.pin.split(',').map(pin => pin.trim()).filter(pin => pin.length > 0);
      }
      
      if (apiResponse.serial && typeof apiResponse.serial === 'string') {
        serialsArray = apiResponse.serial.split(',').map(serial => serial.trim()).filter(serial => serial.length > 0);
      }
      
      // Create transaction data
      const transactionData = {
        id: requestId,
        type: 'card_pins',
        network: session.data.networkName,
        network_id: session.data.network,
        amount: amount,
        quantity: quantity,
        total_amount: totalCost,
        reference: apiResponse.id || apiResponse.ident || requestId,
        status: status,
        pins: pinsArray,
        serials: serialsArray,
        api_response: apiResponse,
        date: new Date().toISOString(),
        user_id: userId
      };
      
      // Record to system transaction tracking
      const stm = getSystemTransactionManager();
      if (stm) {
        await stm.recordAnyTransaction(userId, {
          ...transactionData,
          status: status,
          description: `Card pins purchase: ${quantity} × ${formatCurrency(amount)} ${session.data.networkName} pins`,
          apiResponse: apiResponse,
          apiData: apiResponse
        });
        console.log(`✅ Card pin transaction recorded to system tracking: ${requestId}`);
      } else {
        console.warn('⚠️ System transaction manager not available, skipping system tracking');
      }
      
      if (isSuccessful) {
        // Deduct from wallet
        user.wallet -= totalCost;
        
        // Format pins for display - SIMPLE FORMAT WITH HTML
        let pinsDisplay = '';
        if (pinsArray.length > 0) {
          pinsDisplay = '═══════════════════════════\n';
          pinsDisplay += '       🎫 RECHARGE CARD 🎫\n';
          pinsDisplay += '═══════════════════════════\n\n';
          
          if (serialsArray.length === pinsArray.length) {
            // Display each pin in simple format
            for (let i = 0; i < pinsArray.length; i++) {
              const pin = pinsArray[i];
              const serial = serialsArray[i] || `Serial ${i + 1}`;
              const name = session.data.name_on_card;
              const network = session.data.networkName;
              const amountValue = amount.toString();
              
              // Determine load code based on network
              let loadCode = '*311*Pin#'; // MTN default
              if (network === 'GLO') loadCode = '*123*Pin#';
              else if (network === '9MOBILE') loadCode = '*222*Pin#';
              else if (network === 'AIRTEL') loadCode = '*126*Pin#';
              
              // Replace "Pin" with actual pin
              const loadCodeWithPin = loadCode.replace('Pin', pin);
              
              pinsDisplay += 
                `Name: ${name}\n` +
                `--------------------\n` +
                `<b>PIN:</b> <code>${pin}</code>\n` +
                `Serial: ${serial}\n` +
                `Network: ${network}\n` +
                `Amount: ₦${amountValue}\n` +
                `Load Code: ${loadCodeWithPin}\n\n` +
                `═══════════════════════════\n\n`;
            }
          } else {
            // Display just pins if no serials
            for (let i = 0; i < pinsArray.length; i++) {
              const pin = pinsArray[i];
              const name = session.data.name_on_card;
              const network = session.data.networkName;
              const amountValue = amount.toString();
              
              // Determine load code based on network
              let loadCode = '*311*Pin#'; // MTN default
              if (network === 'GLO') loadCode = '*123*Pin#';
              else if (network === '9MOBILE') loadCode = '*222*Pin#';
              else if (network === 'AIRTEL') loadCode = '*126*Pin#';
              
              // Replace "Pin" with actual pin
              const loadCodeWithPin = loadCode.replace('Pin', pin);
              
              pinsDisplay += 
                `Name: ${name}\n` +
                `--------------------\n` +
                `<b>PIN:</b> <code>${pin}</code>\n` +
                `Serial: Not Available\n` +
                `Network: ${network}\n` +
                `Amount: ₦${amountValue}\n` +
                `Load Code: ${loadCodeWithPin}\n\n` +
                `═══════════════════════════\n\n`;
            }
          }
        } else {
          pinsDisplay = '📋 <b>Pins:</b> Will be delivered shortly\n\n';
        }
        
        await ctx.editMessageText(
          `✅ <b>PURCHASE SUCCESSFUL!</b>\n\n` +
          `📦 <b>Transaction ID:</b> ${requestId}\n` +
          `🔢 <b>Reference:</b> ${apiResponse.id || apiResponse.ident || requestId}\n\n` +
          `${pinsDisplay}` +
          `💳 <b>New Balance:</b> ${formatCurrency(user.wallet)}\n\n` +
          `💡 <b>How to use:</b>\n` +
          `1. Dial the Load Code\n` +
          `2. Follow voice prompts\n` +
          `3. Save this receipt\n` +
          `4. Store PIN securely`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
        
        // Clear session
        await sessionManager.clearSession(userId);
      } else {
        const apiMessage = apiResponse.api_response || apiResponse.message || apiResponse.msg || 'Processing';
        
        // Check for specific error about quantity
        let errorNote = '';
        if (apiMessage.toLowerCase().includes('quantity') || apiMessage.toLowerCase().includes('minimum')) {
          errorNote = '\n💡 <b>Tip:</b> Try quantity of 10 or more.';
        } else if (apiMessage.toLowerCase().includes('failed failed failed')) {
          errorNote = '\n💡 <b>Tip:</b> This is a generic API error. Try quantity 10+ or contact support.';
        }
        
        await ctx.editMessageText(
          `⚠️ <b>PURCHASE ${status.toUpperCase()}</b>\n\n` +
          `🎫 <b>Network:</b> ${session.data.networkName}\n` +
          `💰 <b>Amount:</b> ${formatCurrency(amount)} × ${quantity} pins\n` +
          `💵 <b>Total:</b> ${formatCurrency(totalCost)}\n` +
          `📦 <b>Transaction ID:</b> ${requestId}\n` +
          `🔢 <b>Reference:</b> ${apiResponse.id || apiResponse.ident || requestId}\n\n` +
          `🔄 <b>Status:</b> ${apiMessage}${errorNote}\n\n` +
          `💡 <b>Note:</b> Your wallet has NOT been deducted.\n` +
          `Pins will be delivered if transaction succeeds.`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔢 Try Quantity 10+', 'card_back_quantity')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Card pin purchase error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Record failed transaction
      const stm = getSystemTransactionManager();
      if (stm) {
        const requestId = `CARD${Date.now()}_${userId}`;
        await stm.recordAnyTransaction(userId, {
          id: requestId,
          type: 'card_pins',
          status: 'failed',
          network: session.data.networkName,
          amount: parseInt(session.data.network_amount),
          quantity: parseInt(session.data.quantity),
          total_amount: parseInt(session.data.network_amount) * parseInt(session.data.quantity),
          description: `Failed card pins purchase for ${session.data.networkName}`,
          error: error.message,
          apiResponse: error.response?.data
        });
        console.log(`✅ Failed card pin transaction recorded to system tracking`);
      }
      
      let errorMessage = error.message || 'Unknown error';
      
      // Provide more helpful error messages
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.msg) {
        errorMessage = error.response.data.msg;
      } else if (error.response?.data?.api_response) {
        errorMessage = error.response.data.api_response;
      } else if (error.response?.status === 400) {
        errorMessage = 'Bad request. Check parameters (network must be 1-4, name_on_card is required).';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'API request timeout. Please try again.';
      }
      
      await ctx.editMessageText(
        `❌ <b>PURCHASE FAILED</b>\n\n` +
        `Error: ${errorMessage}\n\n` +
        `📌 <b>Requirements:</b>\n` +
        `• Network ID: 1-4 (MTN, GLO, 9MOBILE, AIRTEL)\n` +
        `• Amount: ₦100, ₦200, or ₦500\n` +
        `• Name on Card: Required field\n\n` +
        `Please check your input and try again.`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Try Again', 'card_back_quantity')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  }
}