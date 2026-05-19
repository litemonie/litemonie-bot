// app/buyData.js - WITH SAVED PHONE NUMBERS FEATURE
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Markup } = require('telegraf');

// ========== SAVED PHONE NUMBERS STORAGE ==========
const SAVED_NUMBERS_FILE = path.join(__dirname, '..', 'data', 'saved_numbers.json');

// Load saved numbers from file
function loadSavedNumbers() {
  try {
    if (fs.existsSync(SAVED_NUMBERS_FILE)) {
      const data = fs.readFileSync(SAVED_NUMBERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('❌ Error loading saved numbers:', error.message);
  }
  return {};
}

// Save numbers to file
function saveSavedNumbers(savedNumbers) {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(SAVED_NUMBERS_FILE, JSON.stringify(savedNumbers, null, 2), 'utf8');
    console.log('✅ Saved numbers updated');
  } catch (error) {
    console.error('❌ Error saving numbers:', error.message);
  }
}

// Add a phone number for a user
function addSavedNumber(userId, phoneNumber, network) {
  const savedNumbers = loadSavedNumbers();
  
  if (!savedNumbers[userId]) {
    savedNumbers[userId] = [];
  }
  
  // Format the phone number nicely for display
  const formattedNumber = formatPhoneNumberForVTU(phoneNumber);
  
  // Check if number already exists
  const existing = savedNumbers[userId].find(n => n.phone === formattedNumber);
  if (!existing) {
    savedNumbers[userId].push({
      phone: formattedNumber,
      network: network,
      lastUsed: new Date().toISOString(),
      useCount: 1
    });
  } else {
    // Update existing entry
    existing.lastUsed = new Date().toISOString();
    existing.useCount = (existing.useCount || 0) + 1;
    existing.network = network;
  }
  
  // Sort by last used (most recent first)
  savedNumbers[userId].sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
  
  // Keep only last 10 numbers per user
  if (savedNumbers[userId].length > 10) {
    savedNumbers[userId] = savedNumbers[userId].slice(0, 10);
  }
  
  saveSavedNumbers(savedNumbers);
  return savedNumbers[userId];
}

// Get saved numbers for a user
function getSavedNumbers(userId) {
  const savedNumbers = loadSavedNumbers();
  return savedNumbers[userId] || [];
}

// ========== IMPORT SYSTEM MANAGERS ==========
let systemTransactionManager = null;
let apiResponseManager = null;

function getTransactionManagers() {
  if (!systemTransactionManager || !apiResponseManager) {
    try {
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

const { getUsers, getTransactions, recordTransaction } = require('../database');

// ========== HELPER FUNCTIONS ==========

async function recordApiResponseToSystem(transactionId, apiName, requestData, responseData, status = 'success') {
  try {
    const managers = getTransactionManagers();
    if (managers.apiResponseManager) {
      return await managers.apiResponseManager.saveResponse(
        transactionId, apiName, requestData, responseData, status
      );
    }
    return null;
  } catch (error) {
    console.error('❌ Error recording API response:', error);
    return null;
  }
}

function formatCurrency(amount) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text.toString();
  return text
    .replace(/\_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~').replace(/\`/g, '\\`').replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#').replace(/\+/g, '\\+').replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=').replace(/\|/g, '\\|').replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}').replace(/\./g, '\\.').replace(/\!/g, '\\!');
}

function formatPhoneNumberForVTU(phone) {
  let cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+234')) cleaned = '0' + cleaned.substring(4);
  else if (cleaned.startsWith('234')) cleaned = '0' + cleaned.substring(3);
  if (!cleaned.startsWith('0')) cleaned = '0' + cleaned;
  if (cleaned.length > 11) cleaned = cleaned.substring(0, 11);
  return cleaned;
}

function formatPhoneNumberForAPI(phone) {
  let cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('234')) cleaned = '0' + cleaned.substring(3);
  if (cleaned.startsWith('+234')) cleaned = '0' + cleaned.substring(4);
  if (!cleaned.startsWith('0')) cleaned = '0' + cleaned;
  if (cleaned.length !== 11 && cleaned.length > 11) cleaned = cleaned.substring(0, 11);
  return cleaned;
}

function validatePhoneNumber(phone) {
  const cleaned = phone.replace(/\s+/g, '');
  return /^(0|234|\+234)(7|8|9)(0|1)\d{8}$/.test(cleaned);
}

function normalizeApiResponse(apiResponse, isError = false) {
  if (!apiResponse) return { status: 'unknown', message: 'No response' };
  
  let normalized = { status: 'pending', message: '', reference: '', transactionId: '', ident: '', id: '' };
  
  if (isError) {
    normalized.status = 'failed';
    normalized.message = apiResponse.message || apiResponse.error || 'API Error';
    return normalized;
  }
  
  const responseString = JSON.stringify(apiResponse).toLowerCase();
  
  if (responseString.includes('success') || responseString.includes('delivered') || responseString.includes('completed')) {
    normalized.status = 'successful';
  } else if (responseString.includes('pending') || responseString.includes('processing')) {
    normalized.status = 'pending';
  } else if (responseString.includes('failed') || responseString.includes('error') || responseString.includes('declined')) {
    normalized.status = 'failed';
  }
  
  normalized.reference = apiResponse.reference || apiResponse.transaction_id || apiResponse.transactionId || apiResponse.request_id || '';
  normalized.transactionId = apiResponse.id || apiResponse.transaction_id || apiResponse.transactionId || '';
  normalized.ident = apiResponse.ident || apiResponse.transaction_ident || '';
  normalized.message = apiResponse.message || apiResponse.response || apiResponse.api_response || '';
  normalized.original = apiResponse;
  
  return normalized;
}

function saveTransactionToFile(transaction) {
  try {
    const transactionDir = path.join(__dirname, 'transactions');
    if (!fs.existsSync(transactionDir)) fs.mkdirSync(transactionDir, { recursive: true });
    
    const today = new Date().toISOString().split('T')[0];
    const transactionFile = path.join(transactionDir, `transactions_${today}.json`);
    
    let existingTransactions = [];
    if (fs.existsSync(transactionFile)) {
      existingTransactions = JSON.parse(fs.readFileSync(transactionFile, 'utf8'));
    }
    existingTransactions.push(transaction);
    fs.writeFileSync(transactionFile, JSON.stringify(existingTransactions, null, 2), 'utf8');
  } catch (error) {
    console.error('❌ Error saving transaction to file:', error);
  }
}

// ========== API FUNCTIONS ==========

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
      headers: { 'Authorization': `Token ${CONFIG.VTU_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    console.log('📥 API Response:', JSON.stringify(response.data, null, 2));
    const normalizedResponse = normalizeApiResponse(response.data);
    
    const { apiResponseManager } = getTransactionManagers();
    if (apiResponseManager && transactionId) {
      await apiResponseManager.saveResponse(transactionId, 'VTU_DATA_API', payload, response.data, 'success');
    }
    
    return normalizedResponse;
  } catch (error) {
    console.error('❌ Data API Error:', error.message);
    if (error.response) {
      const { apiResponseManager } = getTransactionManagers();
      if (apiResponseManager && transactionId) {
        await apiResponseManager.saveResponse(transactionId, 'VTU_DATA_API', {
          network: networkCode, mobile_number: formatPhoneNumberForAPI(phoneNumber),
          plan: planId.toString(), requestId: requestId
        }, error.response.data, 'failed');
      }
      const errorResponse = normalizeApiResponse(error.response.data, true);
      error.response.data = errorResponse;
    }
    throw error;
  }
}

// ========== DATA PLAN FUNCTIONS ==========

function getAvailableNetworks() {
  try {
    const networks = [];
    const basePath = process.cwd();
    if (fs.existsSync(path.join(basePath, 'MTN'))) networks.push('MTN');
    if (fs.existsSync(path.join(basePath, 'Glo')) || fs.existsSync(path.join(basePath, 'GLO'))) networks.push('Glo');
    if (fs.existsSync(path.join(basePath, 'AIRTEL'))) networks.push('AIRTEL');
    if (fs.existsSync(path.join(basePath, '9MOBILE'))) networks.push('9MOBILE');
    return networks.length ? networks : ['MTN', 'Glo', 'AIRTEL', '9MOBILE'];
  } catch (error) {
    return ['MTN', 'Glo', 'AIRTEL', '9MOBILE'];
  }
}

function getAvailableValidities(network) {
  try {
    const validities = [];
    let networkFolder = network;
    if (network === 'Glo') {
      if (fs.existsSync(path.join(process.cwd(), 'Glo'))) networkFolder = 'Glo';
      else if (fs.existsSync(path.join(process.cwd(), 'GLO'))) networkFolder = 'GLO';
    }
    
    const networkPath = path.join(process.cwd(), networkFolder);
    if (!fs.existsSync(networkPath)) return ['Monthly'];
    
    const files = fs.readdirSync(networkPath);
    const validityFiles = { 'daily.json': 'Daily', 'weekly.json': 'Weekly', 'monthly.json': 'Monthly' };
    
    for (const [file, validity] of Object.entries(validityFiles)) {
      if (files.includes(file)) validities.push(validity);
    }
    return validities.length ? validities : ['Monthly'];
  } catch (error) {
    return ['Monthly'];
  }
}

function getDataPlans(network, validityType = null, CONFIG) {
  try {
    let networkFolder = network;
    if (network === 'Glo') {
      if (fs.existsSync(path.join(process.cwd(), 'Glo'))) networkFolder = 'Glo';
      else if (fs.existsSync(path.join(process.cwd(), 'GLO'))) networkFolder = 'GLO';
    }
    
    if (validityType) {
      const filePath = path.join(process.cwd(), networkFolder, validityType.toLowerCase() + '.json');
      if (!fs.existsSync(filePath)) return [];
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      let plans = JSON.parse(fileContent);
      let planArray = [];
      
      if (Array.isArray(plans)) planArray = plans;
      else if (plans?.data && Array.isArray(plans.data)) planArray = plans.data;
      else if (plans?.plans && Array.isArray(plans.plans)) planArray = plans.plans;
      else if (plans?.products && Array.isArray(plans.products)) planArray = plans.products;
      else {
        for (const key in plans) {
          if (Array.isArray(plans[key])) { planArray = plans[key]; break; }
        }
      }
      
      return planArray.map((plan, index) => ({
        Network: network,
        Plan: plan.data || plan.Plan || plan.name || plan.description || plan.product_name || plan.plan_name || `Plan ${index + 1}`,
        Validity: plan.validity || plan.Validity || plan.duration || validityType,
        Price: parseFloat(plan.price || plan.Price || plan.amount || plan.product_amount || plan.plan_price || 0),
        PlanID: (plan.id || plan.PlanID || plan.plan_id || plan.product_id || plan.code || (index + 1).toString()).toString(),
        DisplayPrice: parseFloat(plan.price || plan.Price || plan.amount || plan.product_amount || plan.plan_price || 0) + CONFIG.SERVICE_FEE
      })).sort((a, b) => a.Price - b.Price);
    }
    return [];
  } catch (error) {
    console.error(`❌ Error loading ${network} ${validityType} plans:`, error.message);
    return [];
  }
}

// ========== NEW: PHONE NUMBER SELECTION HANDLER ==========

async function handlePhoneNumberSelection(ctx, network, validityType, planId, plan, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    const savedNumbers = getSavedNumbers(userId);
    
    console.log(`📱 Saved numbers for user ${userId}:`, savedNumbers.length);
    
    if (savedNumbers.length === 0) {
      // No saved numbers, go to manual entry
      const session = {
        action: 'data', step: 2, network: network, validityType: validityType,
        planId: plan.PlanID, selectedPlan: plan, amount: plan.DisplayPrice,
        userId: userId, timestamp: Date.now()
      };
      sessionManager.setSession(userId, session);
      
      await ctx.editMessageText(
        `✅ *Plan Selected:* ${escapeMarkdown(plan.Plan)}\n\n` +
        `📊 *Plan Details:*\n` +
        `📱 Network: ${escapeMarkdown(plan.Network)}\n` +
        `📅 Validity: ${escapeMarkdown(plan.Validity)}\n` +
        `💰 Price: ${formatCurrency(plan.DisplayPrice)}\n\n` +
        `📱 *Enter phone number:*\n\n` +
        `📝 Format: 08012345678 (must start with 0 and be 11 digits)\n\n` +
        `Type the phone number below:`,
        { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)]
        ]) }
      );
      return ctx.answerCbQuery();
    }
    
    // Create keyboard with saved numbers
    const buttons = [];
    
    // Add section header
    buttons.push([Markup.button.callback('📱 SAVED NUMBERS', 'no_action')]);
    
    // Add up to 5 most recent saved numbers
    savedNumbers.slice(0, 5).forEach(saved => {
      buttons.push([Markup.button.callback(
        `📞 ${saved.phone} ${saved.network ? `(${saved.network})` : ''}`,
        `use_saved_number_${network}_${validityType}_${plan.PlanID}_${saved.phone.replace(/[^0-9]/g, '')}`
      )]);
    });
    
    // Add manual entry option
    buttons.push([Markup.button.callback('✏️ Enter New Number', `manual_number_${network}_${validityType}_${plan.PlanID}`)]);
    buttons.push([Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)]);
    
    await ctx.editMessageText(
      `✅ *Plan Selected:* ${escapeMarkdown(plan.Plan)}\n\n` +
      `📊 *Plan Details:*\n` +
      `📱 Network: ${escapeMarkdown(plan.Network)}\n` +
      `📅 Validity: ${escapeMarkdown(plan.Validity)}\n` +
      `💰 Price: ${formatCurrency(plan.DisplayPrice)}\n\n` +
      `📱 *Select a saved phone number or enter a new one:*`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(buttons) }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Phone number selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleUseSavedNumber(ctx, network, validityType, planId, phoneNumber, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    const savedNumbers = getSavedNumbers(userId);
    const savedNumber = savedNumbers.find(n => n.phone === phoneNumber);
    
    if (!savedNumber) {
      await ctx.answerCbQuery('❌ Number not found');
      return handlePhoneNumberSelection(ctx, network, validityType, planId, null, users, sessionManager, CONFIG);
    }
    
    // Get plan details
    const formattedValidity = validityType.charAt(0).toUpperCase() + validityType.slice(1);
    const dataPlans = getDataPlans(network, formattedValidity, CONFIG);
    const selectedPlan = dataPlans.find(p => p.PlanID.toString() === planId || p.PlanID.toString().replace(/[^a-zA-Z0-9]/g, '_') === planId);
    
    if (!selectedPlan) {
      await ctx.editMessageText('❌ Plan not found. Please try again.', { parse_mode: 'MarkdownV2' });
      return ctx.answerCbQuery();
    }
    
    // Create session with the saved number
    const session = {
      action: 'data',
      step: 3, // Go directly to PIN confirmation
      network: network,
      validityType: formattedValidity,
      planId: selectedPlan.PlanID,
      selectedPlan: selectedPlan,
      amount: selectedPlan.DisplayPrice,
      phone: savedNumber.phone,
      userId: userId,
      timestamp: Date.now()
    };
    sessionManager.setSession(userId, session);
    
    await ctx.editMessageText(
      `📋 *DATA ORDER SUMMARY*\n\n` +
      `📱 *Phone:* ${escapeMarkdown(savedNumber.phone)}\n` +
      `📶 *Network:* ${escapeMarkdown(selectedPlan.Network)}\n` +
      `📊 *Plan:* ${escapeMarkdown(selectedPlan.Plan)}\n` +
      `📅 *Validity:* ${escapeMarkdown(selectedPlan.Validity)}\n` +
      `💰 *Price:* ${formatCurrency(selectedPlan.DisplayPrice)}\n\n` +
      `💳 *Your Balance:* ${formatCurrency(user.wallet)}\n` +
      `💵 *After Purchase:* ${formatCurrency(user.wallet - selectedPlan.DisplayPrice)}\n\n` +
      `🔐 *Enter your 4-digit PIN to confirm:*`,
      { parse_mode: 'MarkdownV2' }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Error using saved number:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleManualNumberEntry(ctx, network, validityType, planId, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    
    // Get plan details
    const formattedValidity = validityType.charAt(0).toUpperCase() + validityType.slice(1);
    const dataPlans = getDataPlans(network, formattedValidity, CONFIG);
    const selectedPlan = dataPlans.find(p => p.PlanID.toString() === planId || p.PlanID.toString().replace(/[^a-zA-Z0-9]/g, '_') === planId);
    
    if (!selectedPlan) {
      await ctx.editMessageText('❌ Plan not found. Please try again.', { parse_mode: 'MarkdownV2' });
      return ctx.answerCbQuery();
    }
    
    // Create session for manual phone entry
    const session = {
      action: 'data', step: 2, network: network, validityType: formattedValidity,
      planId: selectedPlan.PlanID, selectedPlan: selectedPlan, amount: selectedPlan.DisplayPrice,
      userId: userId, timestamp: Date.now()
    };
    sessionManager.setSession(userId, session);
    
    await ctx.editMessageText(
      `✅ *Plan Selected:* ${escapeMarkdown(selectedPlan.Plan)}\n\n` +
      `📊 *Plan Details:*\n` +
      `📱 Network: ${escapeMarkdown(selectedPlan.Network)}\n` +
      `📅 Validity: ${escapeMarkdown(selectedPlan.Validity)}\n` +
      `💰 Price: ${formatCurrency(selectedPlan.DisplayPrice)}\n\n` +
      `📱 *Enter phone number:*\n\n` +
      `📝 Format: 08012345678 (must start with 0 and be 11 digits)\n\n` +
      `Type the phone number below:`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)]
      ]) }
    );
    
    ctx.answerCbQuery();
    
  } catch (error) {
    console.error('❌ Error in manual number entry:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

// ========== MAIN MODULE EXPORTS ==========

module.exports = {
  handleData: async (ctx, users, sessionManager, CONFIG, NETWORK_CODES) => {
    try {
      const userId = ctx.from.id.toString();
      const user = users[userId] || { wallet: 0, kycStatus: 'pending', pin: null };
      
      if (user.kycStatus !== 'approved') {
        return await ctx.reply(
          '❌ *KYC VERIFICATION REQUIRED*\n\n📝 Your account needs verification.\n\n🛂 Complete your KYC using the 🛂 KYC Status menu option.',
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      if (!user.pin) {
        return await ctx.reply('❌ *TRANSACTION PIN NOT SET*\n\n🔐 Set PIN: `/setpin 1234`', { parse_mode: 'MarkdownV2' });
      }
      
      const availableNetworks = getAvailableNetworks();
      if (availableNetworks.length === 0) {
        return await ctx.reply('❌ *NO DATA PLANS AVAILABLE*\n\nNo data plans loaded. Please contact admin.', { parse_mode: 'MarkdownV2' });
      }
      
      const uniqueNetworks = [...new Set(availableNetworks)];
      const networkButtons = uniqueNetworks.map(network => [
        Markup.button.callback(`📱 ${network}`, `data_${network.toLowerCase().replace(/\s+/g, '_')}`)
      ]);
      networkButtons.push([Markup.button.callback('🏠 Home', 'start')]);
      
      await ctx.reply(
        `📡 *BUY DATA BUNDLE*\n\n💵 *Your Balance:* ${formatCurrency(user.wallet)}\n\n📱 *Select Network:*`,
        { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(networkButtons) }
      );
      
    } catch (error) {
      console.error('❌ Buy Data error:', error);
      await ctx.reply('❌ An error occurred. Please try again.', { parse_mode: 'MarkdownV2' });
    }
  },

  getCallbacks: (bot, users, sessionManager, CONFIG) => {
    return {
      'data_mtn': async (ctx) => handleDataNetwork(ctx, 'MTN', users, sessionManager, CONFIG),
      'data_glo': async (ctx) => handleDataNetwork(ctx, 'Glo', users, sessionManager, CONFIG),
      'data_airtel': async (ctx) => handleDataNetwork(ctx, 'AIRTEL', users, sessionManager, CONFIG),
      'data_9mobile': async (ctx) => handleDataNetwork(ctx, '9MOBILE', users, sessionManager, CONFIG),
      
      '^validity_(.+)_(.+)$': async (ctx) => {
        const network = ctx.match[1];
        const validity = ctx.match[2];
        return handleValiditySelection(ctx, network, validity, users, sessionManager, CONFIG);
      },
      
      '^plan_(.+)_(.+)_(.+)$': async (ctx) => {
        const network = ctx.match[1];
        const validity = ctx.match[2];
        const planId = ctx.match[3];
        return handlePlanSelection(ctx, network, validity, planId, users, sessionManager, CONFIG);
      },
      
      // NEW: Use saved number
      '^use_saved_number_(.+)_(.+)_(.+)_(.+)$': async (ctx) => {
        const network = ctx.match[1];
        const validity = ctx.match[2];
        const planId = ctx.match[3];
        const phoneNumber = ctx.match[4];
        return handleUseSavedNumber(ctx, network, validity, planId, phoneNumber, users, sessionManager, CONFIG);
      },
      
      // NEW: Manual number entry
      '^manual_number_(.+)_(.+)_(.+)$': async (ctx) => {
        const network = ctx.match[1];
        const validity = ctx.match[2];
        const planId = ctx.match[3];
        return handleManualNumberEntry(ctx, network, validity, planId, users, sessionManager, CONFIG);
      },
      
      'back_to_data_networks': async (ctx) => handleBackToDataNetworks(ctx, users, sessionManager, CONFIG),
      'enter_phone_for_data': async (ctx) => {
        const userId = ctx.from.id.toString();
        const session = sessionManager.getSession(userId);
        if (session && session.action === 'data' && session.selectedPlan) {
          await ctx.editMessageText(
            `📱 *Enter Phone Number*\n\n📝 Format: 08012345678 (11 digits starting with 0)\n\nType the phone number below:`,
            { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
              [Markup.button.callback('⬅️ Back', `validity_${session.network}_${session.validityType.toLowerCase()}`)]
            ]) }
          );
        }
        ctx.answerCbQuery();
      }
    };
  },

  handleText: async (ctx, text, session, user, users, transactions, sessionManager, NETWORK_CODES, CONFIG) => {
    const userId = ctx.from.id.toString();
    const currentSession = sessionManager.getSession(userId);
    
    // DATA: Phone entry
    if (currentSession && currentSession.action === 'data' && currentSession.step === 2) {
      const phone = text.replace(/\s+/g, '');
      
      if (!validatePhoneNumber(phone)) {
        return await ctx.reply(
          '❌ *INVALID PHONE NUMBER*\n\n📱 Valid formats: 08012345678, 2348012345678, +2348012345678\n\n📝 Try again:',
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      const formattedPhone = formatPhoneNumberForVTU(phone);
      
      // Save the phone number for future use
      addSavedNumber(userId, formattedPhone, currentSession.network);
      console.log(`✅ Saved phone number ${formattedPhone} for user ${userId}`);
      
      currentSession.step = 3;
      currentSession.phone = formattedPhone;
      sessionManager.setSession(userId, currentSession);
      
      const selectedPlan = currentSession.selectedPlan;
      const amount = currentSession.amount;
      
      await ctx.reply(
        `📋 *DATA ORDER SUMMARY*\n\n` +
        `📱 *Phone:* ${escapeMarkdown(formattedPhone)}\n` +
        `📶 *Network:* ${escapeMarkdown(selectedPlan.Network)}\n` +
        `📊 *Plan:* ${escapeMarkdown(selectedPlan.Plan)}\n` +
        `📅 *Validity:* ${escapeMarkdown(selectedPlan.Validity)}\n` +
        `💰 *Price:* ${formatCurrency(amount)}\n\n` +
        `💳 *Your Balance:* ${formatCurrency(user.wallet)}\n` +
        `💵 *After Purchase:* ${formatCurrency(user.wallet - amount)}\n\n` +
        `🔐 *Enter your 4-digit PIN to confirm:*`,
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }
    
    // DATA: PIN confirmation (same as before)
    else if (currentSession && currentSession.action === 'data' && currentSession.step === 3) {
      if (text !== user.pin) {
        user.pinAttempts = (user.pinAttempts || 0) + 1;
        if (user.pinAttempts >= 3) {
          user.pinLocked = true;
          sessionManager.clearSession(userId);
          return await ctx.reply('❌ *ACCOUNT LOCKED*\n\nToo many wrong PIN attempts. Contact admin.', { parse_mode: 'MarkdownV2' });
        }
        return await ctx.reply(`❌ *WRONG PIN*\n\n⚠️ Attempts left: ${3 - user.pinAttempts}\n\n🔐 Enter correct PIN:`, { parse_mode: 'MarkdownV2' });
      }
      
      user.pinAttempts = 0;
      const { selectedPlan, amount, phone, network } = currentSession;
      const networkCode = NETWORK_CODES[network.toUpperCase()] || '2';
      const requestId = `DATA${Date.now()}_${userId}`;
      const transactionId = requestId;
      
      const processingMsg = await ctx.reply('🔄 *PROCESSING DATA PURCHASE...*\n\n⏳ Please wait...', { parse_mode: 'MarkdownV2' });
      
      try {
        const apiResult = await buyData(networkCode, phone, selectedPlan.PlanID, requestId, CONFIG, transactionId);
        const isSuccessful = apiResult.status === 'successful';
        
        if (isSuccessful) {
          user.wallet -= amount;
          
          await ctx.reply(
            `✅ *DATA PURCHASE SUCCESSFUL!*\n\n` +
            `📱 *Phone:* ${escapeMarkdown(phone)}\n` +
            `📶 *Network:* ${escapeMarkdown(network)}\n` +
            `📊 *Plan:* ${escapeMarkdown(selectedPlan.Plan)}\n` +
            `💰 *Amount:* ${formatCurrency(amount)}\n` +
            `🔢 *Reference:* ${escapeMarkdown(requestId)}\n` +
            `💳 *New Balance:* ${formatCurrency(user.wallet)}`,
            { parse_mode: 'MarkdownV2' }
          );
        } else {
          await ctx.reply(
            `❌ *DATA PURCHASE FAILED*\n\n` +
            `📱 *Phone:* ${escapeMarkdown(phone)}\n` +
            `📶 *Network:* ${escapeMarkdown(network)}\n` +
            `📊 *Plan:* ${escapeMarkdown(selectedPlan.Plan)}\n` +
            `🚨 *Error:* ${escapeMarkdown(apiResult.message || 'Unknown error')}\n\n` +
            `💡 Your wallet has NOT been deducted.`,
            { parse_mode: 'MarkdownV2' }
          );
        }
      } catch (apiError) {
        await ctx.reply(
          `❌ *DATA PURCHASE FAILED*\n\n🚨 *Error:* ${escapeMarkdown(apiError.message)}\n\n💡 Please try again later.`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      try { await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch (e) {}
      sessionManager.clearSession(userId);
      return true;
    }
    
    return false;
  },
  
  // Export helper functions
  addSavedNumber, getSavedNumbers, loadSavedNumbers
};

// ========== NETWORK HANDLER FUNCTIONS ==========

async function handleDataNetwork(ctx, network, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    const validities = getAvailableValidities(network);
    
    if (validities.length === 0) {
      await ctx.editMessageText(`❌ *NO DATA PLANS AVAILABLE*\n\nNo data plans found for ${escapeMarkdown(network)}.`, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Networks', 'back_to_data_networks')]])
      });
      return ctx.answerCbQuery();
    }
    
    sessionManager.setSession(userId, { action: 'data', step: 1, network: network, userId: userId, timestamp: Date.now() });
    
    const validityButtons = validities.map(validity => [
      Markup.button.callback(`📅 ${validity}`, `validity_${network}_${validity.toLowerCase().replace(/\s+/g, '_')}`)
    ]);
    validityButtons.push([Markup.button.callback('⬅️ Back to Networks', 'back_to_data_networks')]);
    
    await ctx.editMessageText(
      `📡 *BUY DATA - ${escapeMarkdown(network)}*\n\n💵 *Your Balance:* ${formatCurrency(user.wallet)}\n\n📅 *Select Validity Type:*`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(validityButtons) }
    );
    ctx.answerCbQuery();
  } catch (error) {
    console.error('❌ Data network selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleValiditySelection(ctx, network, validityType, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    const formattedValidity = validityType.charAt(0).toUpperCase() + validityType.slice(1);
    const dataPlans = getDataPlans(network, formattedValidity, CONFIG);
    
    if (dataPlans.length === 0) {
      await ctx.editMessageText(`❌ *NO ${formattedValidity.toUpperCase()} PLANS AVAILABLE*`, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', `data_${network.toLowerCase().replace(/\s+/g, '_')}`)]])
      });
      return ctx.answerCbQuery();
    }
    
    const session = sessionManager.getSession(userId) || {};
    session.network = network;
    session.validityType = formattedValidity;
    sessionManager.setSession(userId, session);
    
    const planButtons = [];
    for (let i = 0; i < dataPlans.length; i += 2) {
      const row = [];
      for (let j = 0; j < 2 && (i + j) < dataPlans.length; j++) {
        const plan = dataPlans[i + j];
        const planName = plan.Plan.length > 20 ? plan.Plan.substring(0, 20) + '...' : plan.Plan;
        row.push(Markup.button.callback(`${planName} - ${formatCurrency(plan.DisplayPrice)}`, `plan_${network}_${validityType.toLowerCase()}_${plan.PlanID.toString().replace(/[^a-zA-Z0-9]/g, '_')}`));
      }
      planButtons.push(row);
    }
    planButtons.push([Markup.button.callback('⬅️ Back', `data_${network.toLowerCase().replace(/\s+/g, '_')}`)]);
    
    await ctx.editMessageText(
      `📡 *BUY DATA - ${escapeMarkdown(network)} ${escapeMarkdown(formattedValidity)}*\n\n💵 *Your Balance:* ${formatCurrency(user.wallet)}\n\n📊 *Select Data Plan:*`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(planButtons) }
    );
    ctx.answerCbQuery();
  } catch (error) {
    console.error('❌ Data validity selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handlePlanSelection(ctx, network, validityType, planId, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    const formattedValidity = validityType.charAt(0).toUpperCase() + validityType.slice(1);
    const dataPlans = getDataPlans(network, formattedValidity, CONFIG);
    const selectedPlan = dataPlans.find(p => p.PlanID.toString().replace(/[^a-zA-Z0-9]/g, '_') === planId || p.PlanID.toString() === planId);
    
    if (!selectedPlan) {
      await ctx.editMessageText('❌ *PLAN NOT FOUND*\n\nThe selected plan is no longer available.', {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)]])
      });
      return ctx.answerCbQuery();
    }
    
    const totalPrice = selectedPlan.DisplayPrice;
    
    if (user.wallet < totalPrice) {
      await ctx.editMessageText(`❌ *INSUFFICIENT BALANCE*\n\n💵 Your Balance: ${formatCurrency(user.wallet)}\n💰 Required: ${formatCurrency(totalPrice)}`, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back', `validity_${network}_${validityType.toLowerCase()}`)]])
      });
      return ctx.answerCbQuery();
    }
    
    // Go to phone number selection with saved numbers
    await handlePhoneNumberSelection(ctx, network, validityType, planId, selectedPlan, users, sessionManager, CONFIG);
    
  } catch (error) {
    console.error('❌ Data plan selection error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}

async function handleBackToDataNetworks(ctx, users, sessionManager, CONFIG) {
  try {
    const userId = ctx.from.id.toString();
    const user = users[userId] || { wallet: 0 };
    sessionManager.clearSession(userId);
    
    const availableNetworks = getAvailableNetworks();
    const uniqueNetworks = [...new Set(availableNetworks)];
    const networkButtons = uniqueNetworks.map(network => [
      Markup.button.callback(`📱 ${network}`, `data_${network.toLowerCase().replace(/\s+/g, '_')}`)
    ]);
    networkButtons.push([Markup.button.callback('🏠 Home', 'start')]);
    
    await ctx.editMessageText(
      `📡 *BUY DATA BUNDLE*\n\n💵 *Your Balance:* ${formatCurrency(user.wallet)}\n\n📱 *Select Network:*`,
      { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard(networkButtons) }
    );
    ctx.answerCbQuery();
  } catch (error) {
    console.error('❌ Back to data networks error:', error);
    ctx.answerCbQuery('❌ Error occurred');
  }
}
