const { Markup } = require('telegraf');
const { escapeMarkdown, formatCurrency } = require('../utils/formatters');

module.exports = function marketerCallbacks(handler) {
  const callbacks = {};

  // My device sales
  callbacks['device_my_sales'] = async (ctx) => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!handler.users || typeof handler.users !== 'object') {
        console.error('❌ Device sales error: users object is undefined or invalid:', handler.users);
        await ctx.answerCbQuery('❌ System error - users not loaded');
        return;
      }
      
      const user = handler.users[userId];
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!user) {
        await ctx.answerCbQuery('❌ User not found');
        return;
      }
      
      if (!user.isMarketer && !isAdminUser) {
        await ctx.answerCbQuery('❌ Marketer or Admin access only');
        return;
      }
      
      const marketerController = handler.marketerController;
      if (!marketerController) {
        await ctx.answerCbQuery('❌ System error - marketer controller not found');
        return;
      }
      
      const salesData = await marketerController.getMarketerSales(userId);
      
      if (!salesData.hasSales) {
        const { Markup } = require('telegraf');
        await ctx.editMessageText(
          '💰 *MY DEVICE SALES*\n\n' +
          salesData.message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 View Devices', 'device_view_brands')],
              [Markup.button.callback('⬅️ Back', 'device_back')]
            ])
          }
        );
        return;
      }
      
      const { Markup } = require('telegraf');
      let message = '💰 *MY DEVICE SALES*\n\n';
      message += salesData.salesList;
      message += salesData.summary;
      
      await ctx.editMessageText(
        message,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', 'device_my_sales')],
            [Markup.button.callback('📊 Performance Stats', 'device_marketer_stats')],
            [Markup.button.callback('⬅️ Back', 'device_back')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Device sales error:', error);
      ctx.answerCbQuery('❌ Error loading sales');
    }
  };

  // Marketer performance stats
  callbacks['device_marketer_stats'] = async (ctx) => {
    try {
      const userId = ctx.from.id.toString();
      
      const user = handler.users[userId];
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!user) {
        await ctx.answerCbQuery('❌ User not found');
        return;
      }
      
      if (!user.isMarketer && !isAdminUser) {
        await ctx.answerCbQuery('❌ Marketer or Admin access only');
        return;
      }
      
      const marketerController = handler.marketerController;
      if (!marketerController) {
        await ctx.answerCbQuery('❌ System error - marketer controller not found');
        return;
      }
      
      const performance = await marketerController.getMarketerPerformance(userId);
      
      if (!performance) {
        await ctx.answerCbQuery('❌ Error loading performance data');
        return;
      }
      
      const { Markup } = require('telegraf');
      
      let message = '📊 *MARKETER PERFORMANCE*\n\n';
      message += `*Total Sales\\:* ${performance.totalSales}\n`;
      message += `*Total Revenue\\:* ${escapeMarkdown(formatCurrency(performance.totalRevenue))}\n`;
      message += `*Total Commission\\:* ${escapeMarkdown(formatCurrency(performance.totalCommission))}\n`;
      message += `*Completed Sales\\:* ${performance.completedSales}\n`;
      message += `*Active Sales\\:* ${performance.activeSales}\n`;
      message += `*Average Commission\\:* ${escapeMarkdown(formatCurrency(performance.averageCommission))}\n\n`;
      
      // Calculate performance rating
      let rating = 'Beginner';
      let level = '🌱';
      
      if (performance.totalSales >= 20) {
        rating = 'Elite';
        level = '🏆';
      } else if (performance.totalSales >= 10) {
        rating = 'Advanced';
        level = '⭐';
      } else if (performance.totalSales >= 5) {
        rating = 'Intermediate';
        level = '📈';
      }
      
      message += `*Performance Rating\\:* ${rating} ${level}\n`;
      message += `*Commission Rate\\:* 10%\n\n`;
      message += `*Note\\:* Commissions are paid when devices are fully paid\\.`;
      
      await ctx.editMessageText(
        message,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', 'device_marketer_stats')],
            [Markup.button.callback('💰 View Sales', 'device_my_sales')],
            [Markup.button.callback('⬅️ Back', 'device_back')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Marketer stats error:', error);
      ctx.answerCbQuery('❌ Error loading performance stats');
    }
  };

  // Back button
  callbacks['device_back'] = async (ctx) => {
    try {
      const userId = ctx.from.id.toString();
      
      handler.sessionManager.clearSession(userId);
      
      await handler.handleDeviceMenu(ctx);
    } catch (error) {
      console.error('❌ Device back error:', error);
      ctx.answerCbQuery('❌ Error going back');
    }
  };

  return callbacks;
};