// app/handlers/analyticsHandlers.js
const { Markup } = require('telegraf');
const { escapeMarkdownV2 } = require('../utils/markdownHelpers');
const { formatCurrency } = require('../utils/formatters');

module.exports = function createAnalyticsHandlers(analyticsManager, isAdmin) {
  
  async function handleAnalyticsDashboard(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const report = analyticsManager.getAnalyticsReport('daily');
      const health = analyticsManager.getSystemHealth();
      const forecast = analyticsManager.getRevenueForecast();
      
      let message = '📊 \\*ANALYTICS DASHBOARD\\*\n\n';
      message += `📅 \\*Today\\'s Performance\\:\\*\n`;
      message += `📊 Transactions\\: ${report.summary.totalTransactions || 0}\n`;
      message += `💰 Revenue\\: ${formatCurrency(report.summary.totalAmount || 0)}\n`;
      message += `✅ Success Rate\\: ${health.successRate.toFixed(1)}%\n`;
      message += `📈 Growth vs Yesterday\\: ${health.transactionGrowth.toFixed(1)}%\n\n`;
      
      if (report.trends) {
        message += `📈 \\*Trends\\:\\*\n`;
        if (report.trends.transactionChange !== undefined) {
          const trendIcon = report.trends.transactionChange >= 0 ? '📈' : '📉';
          message += `Transactions\\: ${trendIcon} ${report.trends.transactionChange.toFixed(2)}%\n`;
        }
        if (report.trends.amountChange !== undefined) {
          const trendIcon = report.trends.amountChange >= 0 ? '📈' : '📉';
          message += `Revenue\\: ${trendIcon} ${report.trends.amountChange.toFixed(2)}%\n`;
        }
      }
      
      message += `\n🔮 \\*Forecast\\:\\*\n`;
      message += `📅 Avg Daily Revenue\\: ${formatCurrency(forecast.averageDailyRevenue)}\n`;
      message += `📈 Projected Monthly\\: ${formatCurrency(forecast.projectedMonthlyRevenue)}\n`;
      message += `📊 Growth Rate\\: ${forecast.growthRate.toFixed(2)}%\n\n`;
      
      if (report.insights && report.insights.length > 0) {
        message += `💡 \\*Insights\\:\\*\n`;
        report.insights.forEach(insight => {
          message += `• ${escapeMarkdownV2(insight)}\n`;
        });
      }
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📈 Detailed Report', 'admin_analytics_detailed')],
          [Markup.button.callback('📊 Category Analysis', 'admin_analytics_categories')],
          [Markup.button.callback('👥 User Segments', 'admin_analytics_segments')],
          [Markup.button.callback('📁 Export Analytics', 'admin_export_analytics')],
          [Markup.button.callback('🏠 Back', 'admin_panel')]
        ])
      });
      
    } catch (error) {
      console.error('❌ Analytics dashboard error:', error);
      await ctx.reply('❌ Error loading analytics\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleAnalyticsDetailed(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const report = analyticsManager.generatePerformanceReport(
        moment().subtract(7, 'days').format('YYYY-MM-DD'),
        moment().format('YYYY-MM-DD')
      );
      
      let message = '📈 \\*DETAILED ANALYTICS REPORT\\*\n\n';
      message += `📅 \\*Period\\:\\* ${report.period}\n`;
      message += `📊 \\*Total Transactions\\:\\* ${report.summary.totalTransactions}\n`;
      message += `💰 \\*Total Revenue\\:\\* ${formatCurrency(report.summary.totalAmount)}\n`;
      message += `📈 \\*Avg Daily Transactions\\:\\* ${report.summary.averageDailyTransactions.toFixed(1)}\n`;
      message += `💵 \\*Avg Transaction Value\\:\\* ${formatCurrency(report.summary.averageTransactionValue)}\n\n`;
      
      message += `📋 \\*Category Breakdown\\:\\*\n`;
      Object.entries(report.categoryBreakdown).forEach(([category, count]) => {
        const percentage = (count / report.summary.totalTransactions * 100).toFixed(1);
        message += `• ${escapeMarkdownV2(category)}\\: ${count} \\(${percentage}%\\)\n`;
      });
      
      message += `\n👥 \\*User Activity\\:\\*\n`;
      message += `• Active Users\\: ${report.userActivity.activeUsers}\n`;
      message += `• New Users\\: ${report.userActivity.newUsers}\n`;
      message += `• Returning Users\\: ${report.userActivity.returningUsers}\n`;
      
      if (report.recommendations.length > 0) {
        message += `\n💡 \\*Recommendations\\:\\*\n`;
        report.recommendations.forEach(rec => {
          message += `• ${escapeMarkdownV2(rec)}\n`;
        });
      }
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📊 Last 30 Days', 'admin_analytics_30days')],
          [Markup.button.callback('📅 Custom Period', 'admin_analytics_custom')],
          [Markup.button.callback('🏠 Back', 'admin_analytics_dashboard')]
        ])
      });
      
    } catch (error) {
      console.error('❌ Detailed analytics error:', error);
      await ctx.reply('❌ Error loading detailed analytics\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleAnalyticsCategories(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const categories = analyticsManager.getCategoryPerformance();
      
      let message = '📊 \\*CATEGORY PERFORMANCE ANALYSIS\\*\n\n';
      
      if (categories.length === 0) {
        message += 'No category data available\\.';
      } else {
        categories.slice(0, 10).forEach((cat, index) => {
          message += `${index + 1}\\. \\*${escapeMarkdownV2(cat.category)}\\*\n`;
          message += `   📊 Transactions\\: ${cat.totalTransactions}\n`;
          message += `   💰 Revenue\\: ${formatCurrency(cat.totalAmount)}\n`;
          message += `   💵 Avg Value\\: ${formatCurrency(cat.averageAmount)}\n`;
          message += `   👥 Unique Users\\: ${cat.uniqueUsers}\n`;
          message += `   ✅ Success Rate\\: ${cat.successRate.toFixed(1)}%\n\n`;
        });
        
        if (categories.length > 10) {
          message += `\\.\\.\\. and ${categories.length - 10} more categories\\.`;
        }
      }
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📈 View All', 'admin_analytics_all_categories')],
          [Markup.button.callback('🏠 Back', 'admin_analytics_dashboard')]
        ])
      });
      
    } catch (error) {
      console.error('❌ Category analytics error:', error);
      await ctx.reply('❌ Error loading category analytics\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleAnalyticsSegments(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const segments = analyticsManager.getUserSegmentation();
      
      let message = '👥 \\*USER SEGMENTATION ANALYSIS\\*\n\n';
      
      message += `👑 \\*High Value Users\\:*\n`;
      message += `• Count\\: ${segments.highValue.length}\n`;
      const highValueTotal = segments.highValue.reduce((sum, user) => sum + user.totalAmount, 0);
      message += `• Total Revenue\\: ${formatCurrency(highValueTotal)}\n`;
      message += `• Avg per User\\: ${formatCurrency(segments.highValue.length > 0 ? highValueTotal / segments.highValue.length : 0)}\n\n`;
      
      message += `💰 \\*Medium Value Users\\:*\n`;
      message += `• Count\\: ${segments.mediumValue.length}\n`;
      const mediumValueTotal = segments.mediumValue.reduce((sum, user) => sum + user.totalAmount, 0);
      message += `• Total Revenue\\: ${formatCurrency(mediumValueTotal)}\n\n`;
      
      message += `📉 \\*Low Value Users\\:*\n`;
      message += `• Count\\: ${segments.lowValue.length}\n`;
      message += `• Potential for reactivation campaigns\\.\n\n`;
      
      message += `🎯 \\*New Users \\(Last 7 Days\\)\\:*\n`;
      message += `• Count\\: ${segments.newUsers.length}\n`;
      message += `• Focus on onboarding and retention\\.\n\n`;
      
      message += `💤 \\*Inactive Users \\(30\\+ Days\\)\\:*\n`;
      message += `• Count\\: ${segments.inactiveUsers.length}\n`;
      message += `• Consider re\\-engagement campaigns\\.\n\n`;
      
      message += `💡 \\*Recommendations\\:*\n`;
      message += `• Focus on high value user retention\\.\n`;
      message += `• Implement loyalty programs\\.\n`;
      message += `• Target reactivation of inactive users\\.\n`;
      message += `• Improve onboarding for new users\\.`;
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📊 Export Segments', 'admin_export_segments')],
          [Markup.button.callback('🏠 Back', 'admin_analytics_dashboard')]
        ])
      });
      
    } catch (error) {
      console.error('❌ Segmentation analytics error:', error);
      await ctx.reply('❌ Error loading segmentation analytics\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleExportAnalytics(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply(
        '📁 \\*EXPORT ANALYTICS DATA\\*\n\n' +
        'Select export format\\:\n\n' +
        '📊 \\*JSON\\* \\- Complete analytics data\n' +
        '📈 \\*CSV\\* \\- Daily statistics\n' +
        '📉 \\*Excel\\* \\- Comprehensive report with multiple sheets\n\n' +
        '👇 \\*Select format\\:\\*',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 JSON', 'admin_export_analytics_json')],
            [Markup.button.callback('📈 CSV', 'admin_export_analytics_csv')],
            [Markup.button.callback('📉 Excel', 'admin_export_analytics_excel')],
            [Markup.button.callback('🏠 Back', 'admin_analytics_dashboard')]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export analytics callback error:', error);
      await ctx.answerCbQuery('❌ Error loading export options');
    }
  }
  
  async function handleExportAnalyticsJson(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply('🔄 Generating JSON export\\.\\.\\.', { parse_mode: 'MarkdownV2' });
      
      const result = await analyticsManager.exportAnalyticsData('json', { exportsDir: exportsDir });
      
      await ctx.reply(
        `✅ \\*Analytics Exported Successfully\\!\\*\n\n` +
        `📋 \\*Format\\:\\* JSON\n` +
        `💾 \\*File\\:\\* ${escapeMarkdownV2(path.basename(result.path))}\n\n` +
        `📁 \\*Path\\:\\* \`${escapeMarkdownV2(result.path)}\``,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Send file if possible
      try {
        await ctx.replyWithDocument({
          source: result.path,
          filename: path.basename(result.path)
        });
      } catch (error) {
        console.log('⚠️ Could not send file via Telegram, providing download path instead');
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export analytics JSON error:', error);
      await ctx.answerCbQuery('❌ Error exporting analytics');
    }
  }
  
  async function handleExportAnalyticsCsv(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply('🔄 Generating CSV export\\.\\.\\.', { parse_mode: 'MarkdownV2' });
      
      const result = await analyticsManager.exportAnalyticsData('csv', { exportsDir: exportsDir });
      
      await ctx.reply(
        `✅ \\*Analytics Exported Successfully\\!\\*\n\n` +
        `📋 \\*Format\\:\\* CSV\n` +
        `💾 \\*File\\:\\* ${escapeMarkdownV2(path.basename(result.path))}\n\n` +
        `📁 \\*Path\\:\\* \`${escapeMarkdownV2(result.path)}\``,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Send file if possible
      try {
        await ctx.replyWithDocument({
          source: result.path,
          filename: path.basename(result.path)
        });
      } catch (error) {
        console.log('⚠️ Could not send file via Telegram, providing download path instead');
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export analytics CSV error:', error);
      await ctx.answerCbQuery('❌ Error exporting analytics');
    }
  }
  
  async function handleExportAnalyticsExcel(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply('🔄 Generating Excel export\\.\\.\\.', { parse_mode: 'MarkdownV2' });
      
      const result = await analyticsManager.exportAnalyticsData('excel', { exportsDir: exportsDir });
      
      await ctx.reply(
        `✅ \\*Analytics Exported Successfully\\!\\*\n\n` +
        `📋 \\*Format\\:\\* Excel\n` +
        `💾 \\*File\\:\\* ${escapeMarkdownV2(path.basename(result.path))}\n\n` +
        `📁 \\*Path\\:\\* \`${escapeMarkdownV2(result.path)}\``,
        { parse_mode: 'MarkdownV2' }
      );
      
      // Send file if possible
      try {
        await ctx.replyWithDocument({
          source: result.path,
          filename: path.basename(result.path)
        });
      } catch (error) {
        console.log('⚠️ Could not send file via Telegram, providing download path instead');
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export analytics Excel error:', error);
      await ctx.answerCbQuery('❌ Error exporting analytics');
    }
  }
  
  return {
    handleAnalyticsDashboard,
    handleAnalyticsDetailed,
    handleAnalyticsCategories,
    handleAnalyticsSegments,
    handleExportAnalytics,
    handleExportAnalyticsJson,
    handleExportAnalyticsCsv,
    handleExportAnalyticsExcel
  };
};