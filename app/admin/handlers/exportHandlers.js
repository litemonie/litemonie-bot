// app/admin/handlers/exportHandlers.js
const { Markup } = require('telegraf');
const { escapeMarkdownV2 } = require('../../utils/markdownHelpers');
const { formatCurrency } = require('../../utils/formatters');

module.exports = function createExportHandlers(systemTransactionManager, sessions, saveData, sessionsFile) {
  
  const exportManager = {
    generateExport: async (ctx, filters = {}, format = 'csv') => {
      try {
        const userId = ctx.from.id.toString();
        
        // isAdmin function needs to be passed
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        await ctx.reply(`🔄 Generating ${format.toUpperCase()} export\\.\\.\\.`, { parse_mode: 'MarkdownV2' });
        
        const transactions = systemTransactionManager.searchTransactions(filters);
        
        if (transactions.length === 0) {
          await ctx.reply('❌ No transactions found for export\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        const result = await systemTransactionManager.exportTransactions(transactions, format, {
          includeApiResponses: true
        });
        
        await ctx.reply(
          `✅ \\*Export Generated Successfully\\!\\*\n\n` +
          `📊 \\*Format\\:\\* ${escapeMarkdownV2(format.toUpperCase())}\n` +
          `📋 \\*Transactions\\:\\* ${result.count}\n` +
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
        
        return result;
      } catch (error) {
        console.error('❌ Export generation error:', error);
        await ctx.reply(`❌ Error generating export\\: ${escapeMarkdownV2(error.message)}`, { parse_mode: 'MarkdownV2' });
        return null;
      }
    },
    
    quickExport: async (ctx, type = 'today') => {
      try {
        const userId = ctx.from.id.toString();
        
        // isAdmin function needs to be passed
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        let filters = {};
        const today = new Date().toISOString().split('T')[0];
        
        switch (type) {
          case 'today':
            filters.startDate = today;
            filters.endDate = today;
            break;
          case 'failed':
            filters.status = 'failed';
            break;
          case 'pending':
            filters.status = 'pending';
            break;
          case 'api':
            filters.hasApiResponse = true;
            break;
          case 'all':
            // No filters for all
            break;
        }
        
        await ctx.reply(
          `📁 \\*QUICK EXPORT\\: ${escapeMarkdownV2(type.toUpperCase())}\\*\n\n` +
          `Select export format\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📊 CSV', `admin_export_${type}_csv`),
               Markup.button.callback('📈 Excel', `admin_export_${type}_excel`)],
              [Markup.button.callback('📋 JSON', `admin_export_${type}_json`),
               Markup.button.callback('📄 PDF', `admin_export_${type}_pdf`)],
              [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
            ])
          }
        );
        
        // Save export filters in session
        sessions[userId] = {
          ...sessions[userId],
          exportFilters: filters,
          exportType: type
        };
        await saveData(sessionsFile, sessions);
        
      } catch (error) {
        console.error('❌ Quick export error:', error);
        await ctx.answerCbQuery('❌ Error starting export');
      }
    }
  };
  
  async function handleExportSearch(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || !userSession.lastSearch) {
        await ctx.answerCbQuery('❌ No search results to export');
        return;
      }
      
      await ctx.reply(
        '📁 \\*EXPORT SEARCH RESULTS\\*\n\n' +
        'Select export format\\:\n\n' +
        '📊 \\*JSON\\* \\- Raw data for analysis\n' +
        '📈 \\*CSV\\* \\- Spreadsheet format\n' +
        '📉 \\*Excel\\* \\- Advanced Excel file\n' +
        '📋 \\*PDF\\* \\- Printable report\n\n' +
        '👇 \\*Select format\\:\\*',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 JSON', 'admin_export_search_json')],
            [Markup.button.callback('📈 CSV', 'admin_export_search_csv')],
            [Markup.button.callback('📉 Excel', 'admin_export_search_excel')],
            [Markup.button.callback('📋 PDF', 'admin_export_search_pdf')],
            [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export search callback error:', error);
      await ctx.answerCbQuery('❌ Error loading export options');
    }
  }
  
  async function handleExportTodayMenu(ctx) {
    try {
      await exportManager.quickExport(ctx, 'today');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export today menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleExportFailedMenu(ctx) {
    try {
      await exportManager.quickExport(ctx, 'failed');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export failed menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleExportPendingMenu(ctx) {
    try {
      await exportManager.quickExport(ctx, 'pending');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export pending menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleExportApiMenu(ctx) {
    try {
      await exportManager.quickExport(ctx, 'api');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export API menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleExportAllMenu(ctx) {
    try {
      await exportManager.quickExport(ctx, 'all');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export all menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  // Note: isAdmin function needs to be passed from main file
  // For now, we'll leave it as a placeholder
  
  return {
    exportManager,
    handleExportSearch,
    handleExportTodayMenu,
    handleExportFailedMenu,
    handleExportPendingMenu,
    handleExportApiMenu,
    handleExportAllMenu
  };
};