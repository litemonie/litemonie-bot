// app/Bill/exam.js - FIXED WITH PROPER IMPORTS AND TRANSACTION TRACKING
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
      console.log('✅ Loaded transaction managers for exam module');
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

const EXAMS = {
  '1': { name: 'WAEC', price: 2500 },
  '2': { name: 'NECO', price: 1500 },
  '3': { name: 'NABTEB', price: 1200 },
  '4': { name: 'JAMB', price: 3500 },
  '5': { name: 'WAEC REGISTRATION', price: 18000 },
  '6': { name: 'NBAIS', price: 1000 }
};

module.exports = {
  handleExamPins: async (ctx, users, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    await sessionManager.setSession(userId, {
      action: 'exam_pins',
      step: 1,
      data: {}
    });
    
    await ctx.reply(
      '📝 *EXAM PINS*\n\n' +
      'Select exam type\\:\n\n' +
      '1️⃣ WAEC Result Checker \\- ₦2\\,500\n' +
      '2️⃣ NECO Result Checker \\- ₦1\\,500\n' +
      '3️⃣ NABTEB Result Checker \\- ₦1\\,200\n' +
      '4️⃣ JAMB Result Checker \\- ₦3\\,500\n' +
      '5️⃣ WAEC Registration \\- ₦18\\,000\n' +
      '6️⃣ NBAIS Result Checker \\- ₦1\\,000\n\n' +
      '_Use the buttons below to select\\:_',
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📘 WAEC \\(₦2,500\\)', 'exam_waec')],
          [Markup.button.callback('📗 NECO \\(₦1,500\\)', 'exam_neco')],
          [Markup.button.callback('📙 NABTEB \\(₦1,200\\)', 'exam_nabteb')],
          [Markup.button.callback('📕 JAMB \\(₦3,500\\)', 'exam_jamb')],
          [Markup.button.callback('📓 WAEC REG \\(₦18,000\\)', 'exam_waec_reg')],
          [Markup.button.callback('📔 NBAIS \\(₦1,000\\)', 'exam_nbais')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  },

  handleText: async (ctx, text, userSession, user, users, transactions, sessionManager, CONFIG) => {
    const userId = ctx.from.id.toString();
    
    if (userSession && userSession.action === 'exam_pins') {
      if (userSession.step === 2) {
        const quantity = parseInt(text);
        if (isNaN(quantity) || quantity < 1) {
          await ctx.reply('❌ Please enter a valid quantity \\(minimum 1\\)', { parse_mode: 'MarkdownV2' });
          return true;
        }
        
        userSession.data.quantity = quantity;
        userSession.step = 3;
        await sessionManager.updateSession(userId, userSession);
        
        const exam = EXAMS[userSession.data.exam_name];
        const totalCost = quantity * exam.price;
        const userBalance = users[userId]?.wallet || 0;
        
        await ctx.reply(
          `📝 *CONFIRM PURCHASE*\n\n` +
          `📋 *Exam\\:* ${escapeMarkdown(exam.name)}\n` +
          `🔢 *Quantity\\:* ${quantity}\n` +
          `💰 *Price per pin\\:* ${formatCurrency(exam.price)}\n` +
          `💵 *Total cost\\:* ${formatCurrency(totalCost)}\n\n` +
          `💳 *Your balance\\:* ${formatCurrency(userBalance)}\n\n` +
          `_Confirm purchase\\?_`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Purchase', 'exam_confirm')],
              [Markup.button.callback('↩️ Change Quantity', 'exam_back')],
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
    exam_waec: async (ctx) => await handleExamSelection(ctx, '1', users, sessionManager),
    exam_neco: async (ctx) => await handleExamSelection(ctx, '2', users, sessionManager),
    exam_nabteb: async (ctx) => await handleExamSelection(ctx, '3', users, sessionManager),
    exam_jamb: async (ctx) => await handleExamSelection(ctx, '4', users, sessionManager),
    exam_waec_reg: async (ctx) => await handleExamSelection(ctx, '5', users, sessionManager),
    exam_nbais: async (ctx) => await handleExamSelection(ctx, '6', users, sessionManager),
    exam_confirm: async (ctx) => await handleExamConfirmation(ctx, users, sessionManager, CONFIG),
    exam_show: async (ctx) => {
      // Show exam pins menu again
      const userId = ctx.from.id.toString();
      await sessionManager.setSession(userId, {
        action: 'exam_pins',
        step: 1,
        data: {}
      });
      
      await ctx.editMessageText(
        '📝 *EXAM PINS*\n\n' +
        'Select exam type\\:\n\n' +
        '1️⃣ WAEC Result Checker \\- ₦2\\,500\n' +
        '2️⃣ NECO Result Checker \\- ₦1\\,500\n' +
        '3️⃣ NABTEB Result Checker \\- ₦1\\,200\n' +
        '4️⃣ JAMB Result Checker \\- ₦3\\,500\n' +
        '5️⃣ WAEC Registration \\- ₦18\\,000\n' +
        '6️⃣ NBAIS Result Checker \\- ₦1\\,000\n\n' +
        '_Use the buttons below to select\\:_',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📘 WAEC \\(₦2,500\\)', 'exam_waec')],
            [Markup.button.callback('📗 NECO \\(₦1,500\\)', 'exam_neco')],
            [Markup.button.callback('📙 NABTEB \\(₦1,200\\)', 'exam_nabteb')],
            [Markup.button.callback('📕 JAMB \\(₦3,500\\)', 'exam_jamb')],
            [Markup.button.callback('📓 WAEC REG \\(₦18,000\\)', 'exam_waec_reg')],
            [Markup.button.callback('📔 NBAIS \\(₦1,000\\)', 'exam_nbais')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  })
};

async function handleExamSelection(ctx, examId, users, sessionManager) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  
  if (session && session.action === 'exam_pins') {
    session.data.exam_name = examId;
    session.data.examName = EXAMS[examId].name;
    session.step = 2;
    await sessionManager.updateSession(userId, session);
    
    await ctx.editMessageText(
      `📝 *${EXAMS[examId].name} PINS*\n\n` +
      `Enter quantity \\(minimum 1\\)\\:\n\n` +
      `📝 *Example\\:* 1, 2, 5\n\n` +
      `_Total cost\\: ${formatCurrency(EXAMS[examId].price)} × quantity_`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('↩️ Back', 'exam_back')],
          [Markup.button.callback('❌ Cancel', 'start')]
        ])
      }
    );
  }
}

async function handleExamConfirmation(ctx, users, sessionManager, CONFIG) {
  const userId = ctx.from.id.toString();
  const session = await sessionManager.getSession(userId);
  const user = users[userId];
  
  if (session && session.action === 'exam_pins') {
    try {
      const quantity = parseInt(session.data.quantity);
      const exam = EXAMS[session.data.exam_name];
      const totalCost = quantity * exam.price;
      const requestId = `EXAM${Date.now()}_${userId}`;
      const transactionId = requestId;
      
      // Check user balance
      if (user.wallet < totalCost) {
        await ctx.editMessageText(
          `❌ *INSUFFICIENT BALANCE*\n\n` +
          `💰 *Required\\:* ${formatCurrency(totalCost)}\n` +
          `💰 *Available\\:* ${formatCurrency(user.wallet)}\n\n` +
          `💡 *Deposit funds to continue*`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💳 Deposit Funds', 'deposit')],
              [Markup.button.callback('↩️ Back', 'exam_back')]
            ])
          }
        );
        return;
      }
      
      await ctx.editMessageText(
        `🔄 *Processing purchase\\.\\.\\.*\n\n` +
        `📋 *Exam\\:* ${escapeMarkdown(exam.name)}\n` +
        `🔢 *Quantity\\:* ${quantity}\n` +
        `💵 *Total\\:* ${formatCurrency(totalCost)}\n\n` +
        `Please wait\\.\\.\\.`,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Prepare API request data
      const apiRequestData = {
        exam_name: session.data.exam_name,
        quantity: session.data.quantity.toString()
      };
      
      console.log('📤 Exam API Request:', apiRequestData);
      
      // Make API call to purchase exam pins
      const response = await axios.post(
        `${CONFIG.VTU_BASE_URL}/exam/`,
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
      console.log('📥 Exam API Response:', apiResponse);
      
      const isSuccessful = apiResponse.status === 'success' || apiResponse.Status === 'successful';
      const status = isSuccessful ? 'completed' : (apiResponse.status === 'pending' ? 'pending' : 'failed');
      const apiStatus = isSuccessful ? 'success' : (status === 'pending' ? 'pending' : 'failed');
      
      // ===== USE UNIFIED TRANSACTION RECORDING =====
      try {
        // Try to use the unified recordTransaction function
        const { recordTransaction } = require('../../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(userId, {
            id: transactionId,
            type: 'exam_pins',
            amount: exam.price,
            quantity: quantity,
            total_amount: totalCost,
            exam_type: exam.name,
            exam_id: session.data.exam_name,
            status: status,
            description: `Exam pin purchase: ${quantity} × ${exam.name}`,
            category: 'exam_pins',
            reference: apiResponse.reference || apiResponse.id || requestId,
            pins: apiResponse.pins || [],
            error: !isSuccessful ? (apiResponse.message || 'Processing') : null,
            metadata: {
              api_response: apiResponse,
              api_status: apiStatus,
              timestamp: Date.now()
            }
          });
          console.log(`✅ Exam transaction recorded using unified function: ${transactionId}`);
        } else {
          // Fallback to manual recording
          throw new Error('recordTransaction not available');
        }
      } catch (dbError) {
        console.warn('⚠️ Using manual transaction recording fallback for exam pins');
        
        // Manual recording fallback
        const transactionData = {
          id: requestId,
          type: 'exam_pins',
          exam_type: exam.name,
          quantity: quantity,
          amount: totalCost,
          reference: apiResponse.reference || apiResponse.id || requestId,
          status: status,
          pins: apiResponse.pins || [],
          date: new Date().toISOString(),
          user_id: userId
        };
        
        // Record to system transaction tracking
        const managers = getTransactionManagers();
        if (managers.systemTransactionManager) {
          await managers.systemTransactionManager.recordAnyTransaction(userId, {
            ...transactionData,
            description: `Exam pin purchase: ${quantity} × ${exam.name}`,
            apiData: apiResponse
          });
        }
      }
      
      // Track API response separately
      const managers = getTransactionManagers();
      if (managers.apiResponseManager) {
        await managers.apiResponseManager.saveResponse(
          transactionId,
          'VTU_EXAM_API',
          apiRequestData,
          apiResponse,
          apiStatus
        );
        console.log(`✅ Exam API response tracked: ${transactionId}`);
      }
      
      if (isSuccessful) {
        // Deduct from wallet
        user.wallet -= totalCost;
        
        // Save transaction to user history (if not already done by recordTransaction)
        if (!transactions[userId]) {
          transactions[userId] = [];
        }
        
        const transaction = {
          id: requestId,
          type: 'exam_pins',
          exam_type: exam.name,
          quantity: quantity,
          amount: totalCost,
          reference: apiResponse.reference || apiResponse.id || requestId,
          status: 'success',
          pins: apiResponse.pins || [],
          date: new Date().toISOString(),
          user_id: userId
        };
        
        transactions[userId].push(transaction);
        
        // Format pins for display
        let pinsDisplay = '';
        if (apiResponse.pins && apiResponse.pins.length > 0) {
          pinsDisplay = '📋 *Pins\\:*\n' + 
            apiResponse.pins.map((pin, index) => `${index + 1}\\. \`${escapeMarkdown(pin)}\``).join('\n') + 
            '\n\n';
        } else {
          pinsDisplay = '📋 *Pins will be delivered shortly*\n\n';
        }
        
        await ctx.editMessageText(
          `✅ *PURCHASE SUCCESSFUL\\!*\n\n` +
          `📋 *Exam\\:* ${escapeMarkdown(exam.name)}\n` +
          `🔢 *Quantity\\:* ${quantity} pins\n` +
          `💵 *Total\\:* ${formatCurrency(totalCost)}\n` +
          `📦 *Transaction ID\\:* ${escapeMarkdown(requestId)}\n\n` +
          `${pinsDisplay}` +
          `💡 *Save these pins in a secure place\\!*`,
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
          `⚠️ *PURCHASE ${status.toUpperCase()}*\n\n` +
          `📋 *Exam\\:* ${escapeMarkdown(exam.name)}\n` +
          `🔢 *Quantity\\:* ${quantity} pins\n` +
          `💵 *Total\\:* ${formatCurrency(totalCost)}\n` +
          `📦 *Transaction ID\\:* ${escapeMarkdown(requestId)}\n\n` +
          `🔄 *Status\\:* ${escapeMarkdown(apiMessage)}\n\n` +
          `💡 *Note\\:* Your wallet has NOT been deducted\\.\n` +
          `Pins will be delivered if transaction succeeds\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('↩️ Try Again', 'exam_back')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Exam pin purchase error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // ===== RECORD FAILED TRANSACTION =====
      const quantity = parseInt(session.data.quantity);
      const exam = EXAMS[session.data.exam_name];
      const totalCost = quantity * exam.price;
      const transactionId = `EXAM${Date.now()}_${userId}`;
      
      try {
        const { recordTransaction } = require('../../database');
        if (typeof recordTransaction === 'function') {
          await recordTransaction(userId, {
            id: transactionId,
            type: 'exam_pins',
            amount: exam.price,
            quantity: quantity,
            total_amount: totalCost,
            exam_type: exam.name,
            exam_id: session.data.exam_name,
            status: 'failed',
            description: `Failed exam pin purchase for ${exam.name}`,
            category: 'exam_pins',
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
          'VTU_EXAM_API',
          {
            exam_name: session.data.exam_name,
            quantity: session.data.quantity.toString()
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
        `❌ *PURCHASE FAILED*\n\n` +
        `Error\\: ${escapeMarkdown(errorMessage)}\n\n` +
        `Please try again or contact support\\.`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('↩️ Try Again', 'exam_back')],
            [Markup.button.callback('❌ Cancel', 'start')]
          ])
        }
      );
    }
  }
}