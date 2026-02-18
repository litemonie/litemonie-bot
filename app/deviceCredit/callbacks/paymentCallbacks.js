// /app/deviceCredit/callbacks/paymentCallbacks.js
module.exports = (paymentController) => {
  return {
    'device_payment_plans': async (ctx) => {
      try {
        await ctx.answerCbQuery('Loading payment plans...');
        await ctx.editMessageText(
          '📋 *PAYMENT PLANS*\n\n• 6-Month Plan\n• Weekly Plan\n• Custom Plan',
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('Payment plans error:', error);
        await ctx.answerCbQuery('❌ Error');
      }
    }
  };
};