// app/admin/handlers/transactionTracking.js
const { Markup } = require('telegraf');
const { escapeMarkdownV2 } = require('../../utils/markdownHelpers');
const { formatCurrency } = require('../../utils/formatters');

module.exports = function createTransactionTrackingHandlers(systemTransactionManager, isAdmin, sessions, saveData, sessionsFile) {
  
  async function handleAdminTransactionTracking(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const stats = systemTransactionManager.getTransactionStats();
      
      await ctx.reply(
        '📊 \\*ADVANCED TRANSACTION TRACKING WITH API RESPONSES\\*\n\n' +
        '📈 \\*System Statistics\\:\\*\n' +
        `📊 \\*Total Transactions\\:\\* ${stats.total}\n` +
        `✅ \\*Completed\\:\\* ${stats.completed}\n` +
        `⏳ \\*Pending\\:\\* ${stats.pending}\n` +
        `❌ \\*Failed\\:\\* ${stats.failed}\n` +
        `📅 \\*Today\\:\\* ${stats.today}\n` +
        `💰 \\*Total Amount\\:\\* ${formatCurrency(stats.totalAmount)}\n` +
        `💵 \\*Today\\'s Amount\\:\\* ${formatCurrency(stats.todayAmount)}\n` +
        `📡 \\*Transactions with API Responses\\:\\* ${stats.withApiResponses}\n\n` +
        '🔍 \\*Advanced Features\\:\\*\n' +
        '👇 \\*Select an option\\:\\*',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Search Transaction by ID', 'admin_search_tx_id')],
            [Markup.button.callback('🔍 Advanced Search', 'admin_advanced_search')],
            [Markup.button.callback('📁 Quick Export', 'admin_quick_export')],
            [Markup.button.callback('📈 Analytics Dashboard', 'admin_analytics_dashboard')],
            [Markup.button.callback('📋 View All Transactions', 'admin_view_all_transactions')],
            [Markup.button.callback('❌ Failed Transactions', 'admin_view_failed_transactions')],
            [Markup.button.callback('⏳ Pending Transactions', 'admin_view_pending_transactions')],
            [Markup.button.callback('📡 Transactions with API Data', 'admin_view_api_transactions')],
            [Markup.button.callback('🏠 Back to Admin', 'admin_panel')]
          ])
        }
      );
    } catch (error) {
      console.error('❌ Admin transaction tracking error:', error);
      await ctx.reply('❌ Error loading transaction tracking\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleSearchTransactionById(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply(
        '🔍 \\*SEARCH TRANSACTION BY ID\\*\n\n' +
        'Enter the Transaction ID to search\\:\n' +
        '\\(Example\\: TX123456789\\)',
        { parse_mode: 'MarkdownV2' }
      );
      
      sessions[userId] = {
        action: 'admin_search_tx_id',
        step: 'enter_tx_id'
      };
      await saveData(sessionsFile, sessions);
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Search transaction by ID error:', error);
      await ctx.answerCbQuery('❌ Error starting search');
    }
  }
  
  async function handleViewApiTransactions(ctx, page = 0) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const apiTransactions = systemTransactionManager.searchTransactions({ hasApiResponse: true });
      const pageSize = 10;
      const totalPages = Math.ceil(apiTransactions.length / pageSize);
      const startIndex = page * pageSize;
      const endIndex = startIndex + pageSize;
      const pageTransactions = apiTransactions.slice(startIndex, endIndex);
      
      let message = `📡 \\*TRANSACTIONS WITH API RESPONSES\\*\n\n`;
      message += `📊 \\*Total\\:\\* ${apiTransactions.length} transactions\n`;
      message += `💰 \\*Total Amount\\:\\* ${formatCurrency(apiTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
      message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
      
      if (pageTransactions.length === 0) {
        message += 'No transactions with API responses found\\.';
      } else {
        pageTransactions.forEach((tx, index) => {
          const statusEmoji = tx.status === 'completed' ? '✅' : 
                            tx.status === 'failed' ? '❌' : '⏳';
          const amountText = formatCurrency(tx.amount || 0);
          const date = new Date(tx.timestamp).toLocaleDateString();
          const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
          
          message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
          message += `💰 \\*Amount\\:\\* ${amountText}\n`;
          message += `📱 \\*Phone\\:\\* ${escapeMarkdownV2(tx.phone || 'N/A')}\n`;
          message += `📶 \\*Network\\:\\* ${escapeMarkdownV2(tx.network || 'N/A')}\n`;
          message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
          message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
          message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
        });
      }
      
      const keyboard = [];
      if (page > 0) {
        keyboard.push(Markup.button.callback('⬅️ Previous', `admin_api_page_${page - 1}`));
      }
      if (page < totalPages - 1 && pageTransactions.length === pageSize) {
        keyboard.push(Markup.button.callback('Next ➡️', `admin_api_page_${page + 1}`));
      }
      
      keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ View API transactions error:', error);
      await ctx.reply('❌ Error loading API transactions\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleViewAllTransactions(ctx, page = 0) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const allTransactions = systemTransactionManager.searchTransactions({});
      const pageSize = 10;
      const totalPages = Math.ceil(allTransactions.length / pageSize);
      const startIndex = page * pageSize;
      const endIndex = startIndex + pageSize;
      const pageTransactions = allTransactions.slice(startIndex, endIndex);
      
      let message = `📋 \\*ALL SYSTEM TRANSACTIONS\\*\n\n`;
      message += `📊 \\*Total\\:\\* ${allTransactions.length} transactions\n`;
      message += `💰 \\*Total Amount\\:\\* ${formatCurrency(allTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
      message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
      
      if (pageTransactions.length === 0) {
        message += 'No transactions found\\.';
      } else {
        pageTransactions.forEach((tx, index) => {
          const statusEmoji = tx.status === 'completed' ? '✅' : 
                            tx.status === 'failed' ? '❌' : '⏳';
          const amountText = formatCurrency(tx.amount || 0);
          const date = new Date(tx.timestamp).toLocaleDateString();
          const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
          const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
          
          message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
          message += `💰 \\*Amount\\:\\* ${amountText}\n`;
          message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
          message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
          message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
          message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
        });
      }
      
      const keyboard = [];
      if (page > 0) {
        keyboard.push(Markup.button.callback('⬅️ Previous', `admin_transactions_page_${page - 1}`));
      }
      if (page < totalPages - 1 && pageTransactions.length === pageSize) {
        keyboard.push(Markup.button.callback('Next ➡️', `admin_transactions_page_${page + 1}`));
      }
      
      keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ View all transactions error:', error);
      await ctx.reply('❌ Error loading transactions\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleViewFailedTransactions(ctx, page = 0) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const failedTransactions = systemTransactionManager.searchTransactions({ status: 'failed' });
      const pageSize = 10;
      const totalPages = Math.ceil(failedTransactions.length / pageSize);
      const startIndex = page * pageSize;
      const endIndex = startIndex + pageSize;
      const pageTransactions = failedTransactions.slice(startIndex, endIndex);
      
      let message = `❌ \\*FAILED TRANSACTIONS\\*\n\n`;
      message += `📊 \\*Total Failed\\:\\* ${failedTransactions.length} transactions\n`;
      message += `💸 \\*Total Amount\\:\\* ${formatCurrency(failedTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
      message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
      
      if (pageTransactions.length === 0) {
        message += 'No failed transactions found\\.';
      } else {
        pageTransactions.forEach((tx, index) => {
          const amountText = formatCurrency(tx.amount || 0);
          const date = new Date(tx.timestamp).toLocaleString();
          const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
          const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
          
          message += `❌ \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
          message += `💰 \\*Amount\\:\\* ${amountText}\n`;
          message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
          message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
          message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
          if (tx.error) {
            const escapedError = escapeMarkdownV2(tx.error.substring(0, 50));
            message += `🚨 \\*Error\\:\\* ${escapedError}${tx.error.length > 50 ? '\\.\\.\\.' : ''}\n`;
          }
          message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
        });
      }
      
      const keyboard = [];
      if (page > 0) {
        keyboard.push(Markup.button.callback('⬅️ Previous', `admin_failed_page_${page - 1}`));
      }
      if (page < totalPages - 1 && pageTransactions.length === pageSize) {
        keyboard.push(Markup.button.callback('Next ➡️', `admin_failed_page_${page + 1}`));
      }
      
      keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ View failed transactions error:', error);
      await ctx.reply('❌ Error loading failed transactions\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleSearchTransactionIdText(ctx, text) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || userSession.action !== 'admin_search_tx_id') {
        return false;
      }
      
      const transactionId = text.trim();
      const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
      
      if (!transactionDetails) {
        await ctx.reply(
          `❌ \\*Transaction Not Found\\*\n\n` +
          `Transaction ID\\: \`${escapeMarkdownV2(transactionId)}\`\n` +
          `No transaction found with this ID\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        
        sessions[userId].action = null;
        await saveData(sessionsFile, sessions);
        return true;
      }
      
      // Show transaction details
      await systemTransactionManager.viewTransactionDetails(ctx, transactionId);
      
      sessions[userId].action = null;
      await saveData(sessionsFile, sessions);
      return true;
      
    } catch (error) {
      console.error('❌ Search transaction ID text error:', error);
      await ctx.reply('❌ Error searching for transaction\\.', { parse_mode: 'MarkdownV2' });
      return true;
    }
  }
  
  async function handleAdvancedSearch(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      await ctx.reply(
        '🔍 \\*ADVANCED TRANSACTION SEARCH\\*\n\n' +
        'Enter search criteria in this format\\:\n\n' +
        '`search\\: \\[term\\]`\n' +
        '`type\\: \\[airtime\\|data\\|deposit\\|etc\\]`\n' +
        '`category\\: \\[category\\]`\n' +
        '`status\\: \\[completed\\|failed\\|pending\\]`\n' +
        '`user\\: \\[user\\_id\\]`\n' +
        '`phone\\: \\[phone\\_number\\]`\n' +
        '`network\\: \\[network\\]`\n' +
        '`date\\_from\\: YYYY\\-MM\\-DD`\n' +
        '`date\\_to\\: YYYY\\-MM\\-DD`\n' +
        '`amount\\_min\\: \\[amount\\]`\n' +
        '`amount\\_max\\: \\[amount\\]`\n' +
        '`has\\_api\\: \\[true\\|false\\]`\n' +
        '`api\\_name\\: \\[api\\_name\\]`\n' +
        '`sort\\_by\\: \\[amount\\|timestamp\\]`\n' +
        '`sort\\_order\\: \\[asc\\|desc\\]`\n' +
        '`page\\: \\[number\\]`\n' +
        '`page\\_size\\: \\[number\\]`\n\n' +
        '\\*Examples\\:\\*\n' +
        '`search\\: airtime type\\: airtime date\\_from\\: 2024\\-01\\-01`\n' +
        '`user\\: 123456789 status\\: failed has\\_api\\: true`\n' +
        '`phone\\: 08012345678 api\\_name\\: VTU\\_API`\n\n' +
        'Enter your search criteria\\:',
        { parse_mode: 'MarkdownV2' }
      );
      
      sessions[userId] = {
        action: 'admin_advanced_search',
        step: 'enter_criteria'
      };
      await saveData(sessionsFile, sessions);
      
    } catch (error) {
      console.error('❌ Advanced search error:', error);
      await ctx.reply('❌ Error starting advanced search\\.', { parse_mode: 'MarkdownV2' });
    }
  }
  
  async function handleAdvancedSearchText(ctx, text) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || userSession.action !== 'admin_advanced_search') {
        return false;
      }
      
      // Parse search criteria
      const filters = {};
      const lines = text.split('\n');
      
      lines.forEach(line => {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          const cleanKey = key.trim().toLowerCase().replace(/[^a-z]/g, '');
          
          switch (cleanKey) {
            case 'search':
              filters.searchTerm = value;
              break;
            case 'type':
              filters.type = value;
              break;
            case 'category':
              filters.category = value;
              break;
            case 'status':
              filters.status = value;
              break;
            case 'user':
              filters.userId = value;
              break;
            case 'phone':
              filters.phone = value;
              break;
            case 'network':
              filters.network = value;
              break;
            case 'datefrom':
              filters.startDate = value;
              break;
            case 'dateto':
              filters.endDate = value;
              break;
            case 'amountmin':
              filters.minAmount = parseFloat(value);
              break;
            case 'amountmax':
              filters.maxAmount = parseFloat(value);
              break;
            case 'hasapi':
              filters.hasApiResponse = value.toLowerCase() === 'true';
              break;
            case 'apiname':
              filters.apiName = value;
              break;
            case 'sortby':
              filters.sortBy = value;
              break;
            case 'sortorder':
              filters.sortOrder = value;
              break;
            case 'page':
              filters.page = parseInt(value) || 1;
              break;
            case 'pagesize':
              filters.pageSize = parseInt(value) || 50;
              break;
          }
        }
      });
      
      // Perform search
      const results = systemTransactionManager.searchTransactions(filters);
      const totalResults = systemTransactionManager.searchTransactions({ ...filters, page: null, pageSize: null }).length;
      
      let message = `🔍 \\*SEARCH RESULTS\\*\n\n`;
      message += `📊 Found\\: ${totalResults} transactions\n`;
      
      if (Object.keys(filters).length > 0) {
        message += `🔎 Filters applied\\:\n`;
        Object.entries(filters).forEach(([key, value]) => {
          if (!['page', 'pageSize', 'sortBy', 'sortOrder'].includes(key)) {
            message += `• ${key}\\: ${value}\n`;
          }
        });
      }
      
      message += `\n📄 Showing ${results.length} transactions\n\n`;
      
      if (results.length === 0) {
        message += 'No transactions found\\.';
      } else {
        results.slice(0, 5).forEach((tx, index) => {
          const statusEmoji = tx.status === 'completed' ? '✅' : 
                            tx.status === 'failed' ? '❌' : '⏳';
          const amountText = formatCurrency(tx.amount || 0);
          const date = new Date(tx.timestamp).toLocaleString();
          const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
          const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
          
          message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
          message += `💰 Amount\\: ${amountText}\n`;
          message += `👤 User\\: ${escapeMarkdownV2(userInfo)}\n`;
          message += `📅 Date\\: ${escapeMarkdownV2(date)}\n`;
          message += `📡 API Calls\\: ${apiCount}\n`;
          message += `🔗 ID\\: \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
        });
        
        if (results.length > 5) {
          message += `\\.\\.\\. and ${results.length - 5} more results\\.`;
        }
      }
      
      // Save search for export
      sessions[userId] = {
        ...sessions[userId],
        lastSearch: filters,
        searchResults: results
      };
      await saveData(sessionsFile, sessions);
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📁 Export Results', 'admin_export_search')],
          [Markup.button.callback('📊 Generate Report', 'admin_generate_search_report')],
          [Markup.button.callback('🔍 New Search', 'admin_advanced_search')],
          [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
        ])
      });
      
      return true;
      
    } catch (error) {
      console.error('❌ Advanced search text error:', error);
      await ctx.reply('❌ Error processing search\\. Please check your format\\.', { parse_mode: 'MarkdownV2' });
      return true;
    }
  }
  
  return {
    handleAdminTransactionTracking,
    handleSearchTransactionById,
    handleViewApiTransactions,
    handleViewAllTransactions,
    handleViewFailedTransactions,
    handleSearchTransactionIdText,
    handleAdvancedSearch,
    handleAdvancedSearchText
  };
};