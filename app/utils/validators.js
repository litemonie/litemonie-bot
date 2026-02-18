// app/utils/validators.js

function validatePhoneNumber(phone) {
  const cleaned = phone.replace(/\s+/g, '');
  return /^(0|234)(7|8|9)(0|1)\d{8}$/.test(cleaned);
}

function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPin(pin) {
  return /^\d{4}$/.test(pin);
}

function isValidAmount(amount) {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

module.exports = {
  validatePhoneNumber,
  isValidEmail,
  isValidPin,
  isValidAmount
};