// app/devices/utils/deviceLock.js
const DEVICE_CONFIG = {
  GRACE_PERIOD: 3,
  DAILY_LATE_FEE: 100,
  MAX_OVERDUE_DAYS: 30
};

async function checkOverduePayments(deviceFinancingDB) {
  const today = new Date();
  const overdueFinancing = [];
  
  Object.values(deviceFinancingDB).forEach(financing => {
    if (financing.status !== 'active') return;
    
    const nextPayment = new Date(financing.nextPaymentDate);
    const daysOverdue = Math.floor((today - nextPayment) / (1000 * 60 * 60 * 24));
    
    if (daysOverdue > DEVICE_CONFIG.GRACE_PERIOD) {
      financing.daysOverdue = daysOverdue;
      
      // Add late fees
      const lateFee = daysOverdue * DEVICE_CONFIG.DAILY_LATE_FEE;
      financing.lateFees = (financing.lateFees || 0) + lateFee;
      
      // Check if device should be locked
      if (daysOverdue >= DEVICE_CONFIG.MAX_OVERDUE_DAYS) {
        financing.status = 'locked';
        overdueFinancing.push({
          ...financing,
          action: 'lock'
        });
      } else if (daysOverdue >= 7) {
        financing.status = 'defaulted';
        overdueFinancing.push({
          ...financing,
          action: 'warning'
        });
      } else {
        overdueFinancing.push({
          ...financing,
          action: 'reminder'
        });
      }
    }
  });
  
  return overdueFinancing;
}

async function sendPaymentReminders(ctx, users, overdueFinancing) {
  for (const financing of overdueFinancing) {
    const user = users[financing.userId];
    if (!user) continue;
    
    let message = '';
    
    switch (financing.action) {
      case 'reminder':
        message = `⚠️ *PAYMENT REMINDER*\n\n` +
          `Your device payment is ${financing.daysOverdue} days overdue\\.\n` +
          `Device: ${financing.deviceDetails.model}\n` +
          `Amount Due: ₦${financing.installmentAmount.toLocaleString()}\n` +
          `Late Fee: ₦${financing.lateFees.toLocaleString()}\n\n` +
          `*Please pay within ${DEVICE_CONFIG.GRACE_PERIOD - financing.daysOverdue} days to avoid device lock\\.*`;
        break;
        
      case 'warning':
        message = `🚨 *FINAL WARNING*\n\n` +
          `Your device payment is ${financing.daysOverdue} days overdue\\.\n` +
          `Device: ${financing.deviceDetails.model}\n` +
          `Total Due: ₦${(financing.installmentAmount + financing.lateFees).toLocaleString()}\n\n` +
          `*DEVICE WILL BE LOCKED IN ${DEVICE_CONFIG.MAX_OVERDUE_DAYS - financing.daysOverdue} DAYS IF PAYMENT NOT MADE\\.*`;
        break;
        
      case 'lock':
        message = `🔒 *DEVICE LOCKED*\n\n` +
          `Your device has been locked due to non\\-payment\\.\n` +
          `Device: ${financing.deviceDetails.model}\n` +
          `Days Overdue: ${financing.daysOverdue}\n` +
          `Total Due: ₦${(financing.installmentAmount + financing.lateFees).toLocaleString()}\n\n` +
          `*To unlock, pay the full amount due plus a ₦5,000 unlocking fee\\.*`;
        break;
    }
    
    try {
      await ctx.telegram.sendMessage(userId, message, { parse_mode: 'MarkdownV2' });
    } catch (error) {
      console.error(`Failed to send reminder to ${financing.userId}:`, error.message);
    }
  }
}

module.exports = {
  checkOverduePayments,
  sendPaymentReminders
};