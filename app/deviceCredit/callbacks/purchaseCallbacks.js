// /app/deviceCredit/callbacks/purchaseCallbacks.js
module.exports = (purchaseController) => {
  return {
    'device_select_monthly': async (ctx) => {
      try {
        await ctx.answerCbQuery('Selecting monthly plan...');
        await ctx.editMessageText(
          '📅 *MONTHLY PLAN SELECTED*\n\nProceeding to payment...',
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('Select monthly error:', error);
        await ctx.answerCbQuery('❌ Error');
      }
    },
    
    'device_select_weekly': async (ctx) => {
      try {
        await ctx.answerCbQuery('Selecting weekly plan...');
        await ctx.editMessageText(
          '📅 *WEEKLY PLAN SELECTED*\n\nProceeding to payment...',
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('Select weekly error:', error);
        await ctx.answerCbQuery('❌ Error');
      }
    }
  };
};