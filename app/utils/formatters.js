// app/utils/formatters.js
const { escapeMarkdownV2 } = require('./markdownHelpers');

function formatCurrency(amount) {
  const formatted = `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return escapeMarkdownV2(formatted);
}

function formatCurrencyOld(amount) {
  return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPhoneNumberForVTU(phone) {
  let cleaned = phone.replace(/\s+/g, '');
  if (cleaned.startsWith('+234')) cleaned = '0' + cleaned.substring(4);
  else if (cleaned.startsWith('234')) cleaned = '0' + cleaned.substring(3);
  if (!cleaned.startsWith('0')) cleaned = '0' + cleaned;
  if (cleaned.length > 11) cleaned = cleaned.substring(0, 11);
  return cleaned;
}

module.exports = {
  formatCurrency,
  formatCurrencyOld,
  formatPhoneNumberForVTU
};