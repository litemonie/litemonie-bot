// ==================== UTILS.JS ====================
// Helper functions, formatters, validators
// ==================================================

const { CONFIG } = require('./config');
const { users, getUsers, setUsers, transactions, saveAllData } = require('./database');

// ==================== MARKDOWN ESCAPE ====================
function escapeMarkdownV2(text) {
  if (typeof text !== 'string') {
    if (text === null || text === undefined) return '';
    text = text.toString();
  }
  
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  
  let escaped = text;
  specialChars.forEach(char => {
    escaped = escaped.split(char).join('\\' + char);
  });
  
  return escaped;
}

function escapeMarkdown(text) {
  return escapeMarkdownV2(text);
}

// ==================== CURRENCY FORMATTER ====================
function formatCurrency(amount) {
  const formatted = `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return escapeMarkdownV2(formatted);
}

function formatCurrencyOld(amount) {
  return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ==================== PHONE FORMATTERS/VALIDATORS ====================
function formatPhoneNumberForVTU(phone) {
  let cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+234')) cleaned = '0' + cleaned.substring(4);
  else if (cleaned.startsWith('234')) cleaned = '0' + cleaned.substring(3);
  if (!cleaned.startsWith('0')) cleaned = '0' + cleaned;
  if (cleaned.length > 11) cleaned = cleaned.substring(0, 11);
  return cleaned;
}

function validatePhoneNumber(phone) {
  const cleaned = phone.replace(/\s+/g, '');
  return /^(0|234)(7|8|9)(0|1)\d{8}$/.test(cleaned);
}

// ==================== EMAIL VALIDATOR ====================
function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ==================== ADMIN CHECK ====================
function isAdmin(userId) {
  return userId.toString() === CONFIG.ADMIN_ID.toString();
}

// ==================== USER INITIALIZATION ====================
async function initUser(userId) {
  const users = getUsers();
  
  if (!users[userId]) {
    const isAdminUser = isAdmin(userId);
    
    users[userId] = {
      telegramId: userId,
      wallet: 0,
      kycStatus: isAdminUser ? 'approved' : 'pending',
      pin: null,
      pinAttempts: 0,
      pinLocked: false,
      joined: new Date().toLocaleString(),
      email: null,
      phone: null,
      firstName: null,
      lastName: null,
      username: null,
      virtualAccount: null,
      virtualAccountNumber: null,
      virtualAccountBank: null,
      dailyDeposit: 0,
      dailyTransfer: 0,
      lastDeposit: null,
      lastTransfer: null,
      kycSubmittedDate: null,
      kycApprovedDate: isAdminUser ? new Date().toISOString() : null,
      kycRejectedDate: null,
      kycRejectionReason: null,
      kycSubmitted: false,
      kycDocument: null,
      kycDocumentType: null,
      kycDocumentNumber: null,
      isMarketer: false,
      marketerId: null,
      totalDeviceSales: 0,
      totalDeviceCommission: 0
    };
    
    const transactions = require('./database').getTransactions();
    if (!transactions[userId]) {
      transactions[userId] = [];
      require('./database').setTransactions(transactions);
    }
    
    setUsers(users);
    await saveAllData();
  }
  
  return users[userId];
}

// ==================== KYC CHECK ====================
async function checkKYCAndPIN(userId, ctx) {
  try {
    const user = await initUser(userId);
    
    if (!user) {
      await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
      return false;
    }
    
    const kycStatus = user.kycStatus || 'pending';
    
    if (kycStatus !== 'approved') {
      await ctx.reply(
        '❌ \\*KYC VERIFICATION REQUIRED\\*\n\n' +
        '📝 Your account needs verification\\.\n\n' +
        `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
        '📞 \\*Contact admin\\:\\* @opuenekeke',
        { parse_mode: 'MarkdownV2' }
      );
      return false;
    }
    
    if (!user.pin) {
      await ctx.reply(
        '❌ \\*TRANSACTION PIN NOT SET\\*\n\n' +
        '🔐 \\*Set PIN\\:\\* `/setpin 1234`',
        { parse_mode: 'MarkdownV2' }
      );
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ KYC check error:', error);
    await ctx.reply('❌ Error checking account status\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    return false;
  }
}

// ==================== EXPORT ====================
module.exports = {
  escapeMarkdownV2,
  escapeMarkdown,
  formatCurrency,
  formatCurrencyOld,
  formatPhoneNumberForVTU,
  validatePhoneNumber,
  isValidEmail,
  isAdmin,
  initUser,
  checkKYCAndPIN
};