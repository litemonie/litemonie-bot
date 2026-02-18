// app/devices/utils/paymentCalculator.js
const DEVICE_CONFIG = {
  PROFIT_MARGIN: 30,
  MARKETER_COMMISSION: 10,
  DOWN_PAYMENT_PERCENTAGE: 20
};

function calculateDevicePricing(originalPrice) {
  const sellingPrice = originalPrice * (1 + DEVICE_CONFIG.PROFIT_MARGIN / 100);
  const downPayment = sellingPrice * (DEVICE_CONFIG.DOWN_PAYMENT_PERCENTAGE / 100);
  const balance = sellingPrice - downPayment;
  const profit = sellingPrice - originalPrice;
  const marketerCommission = profit * (DEVICE_CONFIG.MARKETER_COMMISSION / 100);
  
  return {
    originalPrice,
    sellingPrice,
    downPayment,
    balance,
    profit,
    marketerCommission
  };
}

function calculatePaymentPlan(balance, planType, duration) {
  let installmentAmount, totalInstallments, paymentFrequency;
  
  switch (planType) {
    case 'monthly':
      installmentAmount = balance / duration;
      totalInstallments = duration;
      paymentFrequency = 'monthly';
      break;
    case 'weekly':
      installmentAmount = balance / (duration * 4);
      totalInstallments = duration * 4;
      paymentFrequency = 'weekly';
      break;
    case 'daily':
      installmentAmount = balance / (duration * 30);
      totalInstallments = duration * 30;
      paymentFrequency = 'daily';
      break;
    default:
      throw new Error('Invalid payment plan type');
  }
  
  return {
    installmentAmount: Math.round(installmentAmount * 100) / 100,
    totalInstallments,
    paymentFrequency
  };
}

module.exports = {
  calculateDevicePricing,
  calculatePaymentPlan
};