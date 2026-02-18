// app/handlers/kycCheck.js
const { escapeMarkdownV2 } = require('../utils/markdownHelpers');

module.exports = function createKycCheck(users, userMethods) {
  
  async function checkKYCAndPIN(userId, ctx) {
    try {
      const user = users[userId];
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
  
  return {
    checkKYCAndPIN
  };
};