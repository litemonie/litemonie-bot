// /app/deviceCredit/utils/validators.js
function validateDeviceId(id) {
  return /^[A-Z]{3}-[A-Z0-9]+-\d{3}$/.test(id);
}

function validatePaymentAmount(amount) {
  const num = parseInt(amount);
  return !isNaN(num) && num >= 5000 && num <= 1000000;
}

function validatePhoneNumber(phone) {
  return /^(\+234|0)[789][01]\d{8}$/.test(phone);
}

module.exports = {
  validateDeviceId,
  validatePaymentAmount,
  validatePhoneNumber
};