// app/handlers/callbackHandlers.js
const { Markup } = require('telegraf');
const { escapeMarkdownV2 } = require('../utils/markdownHelpers');
const { formatCurrency } = require('../utils/formatters');

module.exports = function createCallbackHandlers(
  bot,
  users,
  sessions,
  systemTransactionManager,
  userMethods,
  transactionMethods,
  virtualAccounts,
  depositFunds,
  buyAirtime,
  buyData,
  buyTVSubscription,
  buyElectricity,
  buyExamPins,
  buyCardPins,
  sendMoney,
  adminModule,
  kycModule,
  transactionHistory,
  deviceHandler,
  deviceLockApp,
  deviceCreditCallbacks,
  miniAppCallbacks,
  CONFIG,
  NETWORK_CODES,
  saveData,
  sessionsFile,
  usersFile,
  exportsDir,
  transactionTrackingHandlers,
  exportHandlers,
  adminPanelHandlers
) {
  
  // Helper functions
  function isAdmin(userId) {
    return userId.toString() === CONFIG.ADMIN_ID.toString();
  }
  
  async function initUser(userId) {
    if (!users[userId]) {
      const isAdminUser = userId.toString() === CONFIG.ADMIN_ID.toString();
      
      users[userId] = {
        telegramId: userId,
        wallet: 0,
        kycStatus: isAdminUser ? 'approved' : 'pending',
        pin: null,
        pinAttempts: 0,
        pinLocked: false,
        joined: new Date().toLocaleString(),
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        username: null,
        virtualAccount: null,
        virtualAccountNumber: null,
        virtualAccountBank: null,
        dailyDeposit: 0,
        dailyTransfer: 0,
        lastDeposit: null,
        lastTransfer: null,
        kycSubmittedDate: null,
        kycApprovedDate: isAdminUser ? new Date().toISOString() : null,
        kycRejectedDate: null,
        kycRejectionReason: null,
        kycSubmitted: false,
        kycDocument: null,
        kycDocumentType: null,
        kycDocumentNumber: null,
        isMarketer: false,
        marketerId: null,
        totalDeviceSales: 0,
        totalDeviceCommission: 0
      };
      
      await saveData(usersFile, users);
    }
    return users[userId];
  }
  
  // ==================== DEVICE FINANCING CALLBACKS ====================
  async function handleDeviceMiniApp(ctx) {
    try {
      const userId = ctx.from.id.toString();
      await initUser(userId);
      
      if (!deviceLockApp) {
        await ctx.reply(
          '📱 \\*DEVICE LOCK APP\\*\n\n' +
          '❌ \\*System Not Ready\\*\n\n' +
          'The device lock app system is still initializing\\.\n' +
          'Please try again in a few seconds\\.',
          { parse_mode: 'MarkdownV2' }
        );
        await ctx.answerCbQuery();
        return;
      }
      
      await deviceLockApp.handleMiniAppCommand(ctx);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Mini App button error:', error);
      await ctx.answerCbQuery('❌ Error loading Mini App');
    }
  }
  
  async function handleUnlockCommandCallback(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      
      if (!deviceHandler) {
        await ctx.answerCbQuery('❌ System not ready');
        return;
      }
      
      deviceHandler.users = users;
      const imeiMappings = await deviceHandler.getUserIMEIMappings(userId);
      const lockedDevices = imeiMappings.filter(m => m.imeiStatus === 'locked');
      
      if (lockedDevices.length === 0) {
        await ctx.reply(
          `🔓 \\*DEVICE UNLOCK\\*\n\n` +
          `You don't have any locked devices\\.\n\n` +
          `Devices are automatically unlocked when fully paid\\.\n\n` +
          `\\*To check your devices\\:\\*`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 Check Status', 'status')],
              [Markup.button.callback('📱 Open App', 'device_mini_app')]
            ])
          }
        );
        return;
      }
      
      let message = `🔓 \\*LOCKED DEVICES\\*\n\n`;
      message += `\\*You have ${lockedDevices.length} locked device${lockedDevices.length !== 1 ? 's' : ''}\\:\\*\n\n`;
      
      const buttons = [];
      
      lockedDevices.forEach((mapping, index) => {
        message += `\\*${index + 1}\\. ${mapping.deviceMake} ${mapping.deviceModel}\\*\n`;
        message += `   📱 \\*IMEI\\:\\* ${mapping.imei}\n`;
        message += `   🆔 \\*Installment ID\\:\\* ${mapping.installmentId}\n\n`;
        
        buttons.push([
          Markup.button.callback(
            `🔓 Request Unlock - ${mapping.deviceMake}`,
            `request_unlock_${mapping.imei}`
          )
        ]);
      });
      
      message += `\\*To unlock a device\\:\\*\n`;
      message += `1\\. Ensure all payments are completed ✅\n`;
      message += `2\\. Click the request button below\n`;
      message += `3\\. Admin will process within 1\\-2 hours ⏰\n`;
      message += `4\\. You'll be notified when unlocked 📲\n\n`;
      message += `📞 \\*Support\\:\\* @opuenekeke`;
      
      buttons.push([
        Markup.button.callback('📱 Open Full App', 'device_mini_app'),
        Markup.button.callback('💰 Check Payments', 'device_make_payment')
      ]);
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(buttons)
      });
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      console.error('❌ Unlock callback error:', error);
      await ctx.answerCbQuery('❌ Error loading unlock');
    }
  }
  
  // ==================== ENHANCED TRANSACTION CALLBACKS ====================
  async function handleAdminTransactionTracking(ctx) {
    try {
      if (transactionTrackingHandlers && transactionTrackingHandlers.handleAdminTransactionTracking) {
        await transactionTrackingHandlers.handleAdminTransactionTracking(ctx);
      } else {
        await ctx.reply('❌ Transaction tracking system not available\\.', { parse_mode: 'MarkdownV2' });
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Admin transaction tracking callback error:', error);
      await ctx.answerCbQuery('❌ Error loading transaction tracking');
    }
  }
  
  async function handleAdminSearchTxId(ctx) {
    try {
      if (transactionTrackingHandlers && transactionTrackingHandlers.handleSearchTransactionById) {
        await transactionTrackingHandlers.handleSearchTransactionById(ctx);
      } else {
        await ctx.reply('❌ Search system not available\\.', { parse_mode: 'MarkdownV2' });
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Search transaction by ID callback error:', error);
      await ctx.answerCbQuery('❌ Error starting search');
    }
  }
  
  async function handleAdminAdvancedSearch(ctx) {
    try {
      if (transactionTrackingHandlers && transactionTrackingHandlers.handleAdvancedSearch) {
        await transactionTrackingHandlers.handleAdvancedSearch(ctx);
      } else {
        await ctx.reply('❌ Advanced search system not available\\.', { parse_mode: 'MarkdownV2' });
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Advanced search callback error:', error);
      await ctx.answerCbQuery('❌ Error loading advanced search');
    }
  }
  
  async function handleAdminQuickExport(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply(
        '📁 \\*QUICK EXPORT\\*\n\n' +
        'Select what to export\\:\n\n' +
        '📅 \\*Today\\\'s Transactions\\*\n' +
        '❌ \\*Failed Transactions\\*\n' +
        '⏳ \\*Pending Transactions\\*\n' +
        '📡 \\*Transactions with API Data\\*\n' +
        '📊 \\*All Transactions\\*\n\n' +
        '👇 \\*Select an option\\:\\*',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Today', 'admin_export_today_menu')],
            [Markup.button.callback('❌ Failed', 'admin_export_failed_menu')],
            [Markup.button.callback('⏳ Pending', 'admin_export_pending_menu')],
            [Markup.button.callback('📡 API Data', 'admin_export_api_menu')],
            [Markup.button.callback('📊 All', 'admin_export_all_menu')],
            [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Quick export callback error:', error);
      await ctx.answerCbQuery('❌ Error loading quick export');
    }
  }
  
  async function handleAdminViewAllTransactions(ctx, page = 0) {
    try {
      if (transactionTrackingHandlers && transactionTrackingHandlers.handleViewAllTransactions) {
        await transactionTrackingHandlers.handleViewAllTransactions(ctx, page);
      } else {
        await ctx.reply('❌ Transaction view system not available\\.', { parse_mode: 'MarkdownV2' });
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ View all transactions callback error:', error);
      await ctx.answerCbQuery('❌ Error loading transactions');
    }
  }
  
  async function handleAdminViewFailedTransactions(ctx, page = 0) {
    try {
      if (transactionTrackingHandlers && transactionTrackingHandlers.handleViewFailedTransactions) {
        await transactionTrackingHandlers.handleViewFailedTransactions(ctx, page);
      } else {
        await ctx.reply('❌ Failed transactions system not available\\.', { parse_mode: 'MarkdownV2' });
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ View failed transactions callback error:', error);
      await ctx.answerCbQuery('❌ Error loading failed transactions');
    }
  }
  
  async function handleAdminViewPendingTransactions(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const pendingTransactions = systemTransactionManager.searchTransactions({ status: 'pending' });
      
      let message = `⏳ \\*PENDING TRANSACTIONS\\*\n\n`;
      message += `📊 \\*Total Pending\\:\\* ${pendingTransactions.length} transactions\n`;
      message += `💰 \\*Total Amount\\:\\* ${formatCurrency(pendingTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n\n`;
      
      if (pendingTransactions.length === 0) {
        message += 'No pending transactions\\.';
      } else {
        pendingTransactions.slice(0, 10).forEach((tx, index) => {
          const amountText = formatCurrency(tx.amount || 0);
          const date = new Date(tx.timestamp).toLocaleString();
          const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
          const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
          
          message += `⏳ \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
          message += `💰 \\*Amount\\:\\* ${amountText}\n`;
          message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
          message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
          message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
          message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
        });
      }
      
      await ctx.reply(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
        ])
      });
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ View pending transactions callback error:', error);
      await ctx.answerCbQuery('❌ Error loading pending transactions');
    }
  }
  
  async function handleAdminViewApiTransactions(ctx, page = 0) {
    try {
      if (transactionTrackingHandlers && transactionTrackingHandlers.handleViewApiTransactions) {
        await transactionTrackingHandlers.handleViewApiTransactions(ctx, page);
      } else {
        await ctx.reply('❌ API transactions system not available\\.', { parse_mode: 'MarkdownV2' });
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ View API transactions callback error:', error);
      await ctx.answerCbQuery('❌ Error loading API transactions');
    }
  }
  
  // ==================== TRANSACTION DETAILS CALLBACKS ====================
  async function handleAdminViewTx(ctx) {
    try {
      const transactionId = ctx.match[1];
      await systemTransactionManager.viewTransactionDetails(ctx, transactionId);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ View transaction callback error:', error);
      await ctx.answerCbQuery('❌ Error loading transaction details');
    }
  }
  
  async function handleAdminViewApiRaw(ctx) {
    try {
      const transactionId = ctx.match[1];
      await systemTransactionManager.viewRawApiData(ctx, transactionId, isAdmin, escapeMarkdownV2);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ View raw API data callback error:', error);
      await ctx.answerCbQuery('❌ Error loading raw API data');
    }
  }
  
  async function handleAdminExportTx(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const transactionId = ctx.match[1];
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply(
        '📁 \\*EXPORT TRANSACTION\\*\n\n' +
        'Select export format\\:\n\n' +
        '📋 \\*JSON\\* \\- Full transaction details with API responses\n' +
        '📄 \\*TEXT\\* \\- Human\\-readable format\n\n' +
        '👇 \\*Select format\\:\\*',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 JSON', `admin_export_tx_json_${transactionId}`),
             Markup.button.callback('📄 TEXT', `admin_export_tx_txt_${transactionId}`)],
            [Markup.button.callback('🏠 Back', `admin_view_tx_${transactionId}`)]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export transaction callback error:', error);
      await ctx.answerCbQuery('❌ Error loading export options');
    }
  }
  
  async function handleAdminExportTxJson(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const transactionId = ctx.match[1];
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply('🔄 Generating JSON export\\.\\.\\.', { parse_mode: 'MarkdownV2' });
      
      const result = await systemTransactionManager.exportTransaction(transactionId, 'json');
      
      await ctx.reply(
        `✅ \\*Transaction Exported Successfully\\!\\*\n\n` +
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
      console.error('❌ Export transaction JSON error:', error);
      await ctx.answerCbQuery('❌ Error exporting transaction');
    }
  }
  
  async function handleAdminExportTxTxt(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const transactionId = ctx.match[1];
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply('🔄 Generating TEXT export\\.\\.\\.', { parse_mode: 'MarkdownV2' });
      
      const result = await systemTransactionManager.exportTransaction(transactionId, 'txt');
      
      await ctx.reply(
        `✅ \\*Transaction Exported Successfully\\!\\*\n\n` +
        `📄 \\*Format\\:\\* TEXT\n` +
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
      console.error('❌ Export transaction TEXT error:', error);
      await ctx.answerCbQuery('❌ Error exporting transaction');
    }
  }
  
  async function handleAdminUpdateTx(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const transactionId = ctx.match[1];
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply(
        `🔄 \\*UPDATE TRANSACTION STATUS\\*\n\n` +
        `📋 \\*Transaction ID\\:\\* \`${escapeMarkdownV2(transactionId)}\`\n\n` +
        `Select new status\\:`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Complete', `admin_update_tx_complete_${transactionId}`),
             Markup.button.callback('❌ Fail', `admin_update_tx_fail_${transactionId}`)],
            [Markup.button.callback('⏳ Pending', `admin_update_tx_pending_${transactionId}`)],
            [Markup.button.callback('🏠 Back', `admin_view_tx_${transactionId}`)]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Update transaction status callback error:', error);
      await ctx.answerCbQuery('❌ Error loading update options');
    }
  }
  
  async function handleAdminUpdateTxComplete(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const transactionId = ctx.match[1];
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await systemTransactionManager.updateTransactionStatus(ctx, transactionId, 'completed', 'Manually completed by admin', isAdmin, escapeMarkdownV2);
      await ctx.answerCbQuery('✅ Transaction completed');
    } catch (error) {
      console.error('❌ Update to complete error:', error);
      await ctx.answerCbQuery('❌ Error updating transaction');
    }
  }
  
  async function handleAdminUpdateTxFail(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const transactionId = ctx.match[1];
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await systemTransactionManager.updateTransactionStatus(ctx, transactionId, 'failed', 'Manually failed by admin', isAdmin, escapeMarkdownV2);
      await ctx.answerCbQuery('❌ Transaction failed');
    } catch (error) {
      console.error('❌ Update to failed error:', error);
      await ctx.answerCbQuery('❌ Error updating transaction');
    }
  }
  
  async function handleAdminUpdateTxPending(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const transactionId = ctx.match[1];
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await systemTransactionManager.updateTransactionStatus(ctx, transactionId, 'pending', 'Manually set to pending by admin', isAdmin, escapeMarkdownV2);
      await ctx.answerCbQuery('⏳ Transaction pending');
    } catch (error) {
      console.error('❌ Update to pending error:', error);
      await ctx.answerCbQuery('❌ Error updating transaction');
    }
  }
  
  // ==================== PAGINATION CALLBACKS ====================
  async function handleAdminTransactionsPage(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const page = parseInt(ctx.match[1]);
      await handleAdminViewAllTransactions(ctx, page);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Transactions page callback error:', error);
      await ctx.answerCbQuery('❌ Error loading page');
    }
  }
  
  async function handleAdminFailedPage(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const page = parseInt(ctx.match[1]);
      await handleAdminViewFailedTransactions(ctx, page);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Failed transactions page callback error:', error);
      await ctx.answerCbQuery('❌ Error loading page');
    }
  }
  
  async function handleAdminApiPage(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const page = parseInt(ctx.match[1]);
      await handleAdminViewApiTransactions(ctx, page);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ API transactions page callback error:', error);
      await ctx.answerCbQuery('❌ Error loading page');
    }
  }
  
  // ==================== EXPORT CALLBACKS ====================
  async function handleAdminExportTodayMenu(ctx) {
    try {
      if (exportHandlers && exportHandlers.handleExportTodayMenu) {
        await exportHandlers.handleExportTodayMenu(ctx);
      } else {
        await ctx.answerCbQuery('❌ Export system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export today menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleAdminExportFailedMenu(ctx) {
    try {
      if (exportHandlers && exportHandlers.handleExportFailedMenu) {
        await exportHandlers.handleExportFailedMenu(ctx);
      } else {
        await ctx.answerCbQuery('❌ Export system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export failed menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleAdminExportPendingMenu(ctx) {
    try {
      if (exportHandlers && exportHandlers.handleExportPendingMenu) {
        await exportHandlers.handleExportPendingMenu(ctx);
      } else {
        await ctx.answerCbQuery('❌ Export system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export pending menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleAdminExportApiMenu(ctx) {
    try {
      if (exportHandlers && exportHandlers.handleExportApiMenu) {
        await exportHandlers.handleExportApiMenu(ctx);
      } else {
        await ctx.answerCbQuery('❌ Export system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export API menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleAdminExportAllMenu(ctx) {
    try {
      if (exportHandlers && exportHandlers.handleExportAllMenu) {
        await exportHandlers.handleExportAllMenu(ctx);
      } else {
        await ctx.answerCbQuery('❌ Export system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export all menu error:', error);
      await ctx.answerCbQuery('❌ Error loading export menu');
    }
  }
  
  async function handleAdminExportSearch(ctx) {
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
  
  async function handleAdminExportSearchJson(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || !userSession.lastSearch) {
        await ctx.answerCbQuery('❌ No search results to export');
        return;
      }
      
      // Use export manager if available
      if (exportHandlers && exportHandlers.exportManager) {
        await exportHandlers.exportManager.generateExport(ctx, userSession.lastSearch, 'json');
      } else {
        await ctx.reply('❌ Export system not available', { parse_mode: 'MarkdownV2' });
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export search JSON error:', error);
      await ctx.answerCbQuery('❌ Error exporting');
    }
  }
  
  async function handleAdminExportSearchCsv(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || !userSession.lastSearch) {
        await ctx.answerCbQuery('❌ No search results to export');
        return;
      }
      
      // Use export manager if available
      if (exportHandlers && exportHandlers.exportManager) {
        await exportHandlers.exportManager.generateExport(ctx, userSession.lastSearch, 'csv');
      } else {
        await ctx.reply('❌ Export system not available', { parse_mode: 'MarkdownV2' });
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export search CSV error:', error);
      await ctx.answerCbQuery('❌ Error exporting');
    }
  }
  
  async function handleAdminExportSearchExcel(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || !userSession.lastSearch) {
        await ctx.answerCbQuery('❌ No search results to export');
        return;
      }
      
      // Use export manager if available
      if (exportHandlers && exportHandlers.exportManager) {
        await exportHandlers.exportManager.generateExport(ctx, userSession.lastSearch, 'excel');
      } else {
        await ctx.reply('❌ Export system not available', { parse_mode: 'MarkdownV2' });
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export search Excel error:', error);
      await ctx.answerCbQuery('❌ Error exporting');
    }
  }
  
  async function handleAdminExportSearchPdf(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const userSession = sessions[userId];
      
      if (!userSession || !userSession.lastSearch) {
        await ctx.answerCbQuery('❌ No search results to export');
        return;
      }
      
      // Use export manager if available
      if (exportHandlers && exportHandlers.exportManager) {
        await exportHandlers.exportManager.generateExport(ctx, userSession.lastSearch, 'pdf');
      } else {
        await ctx.reply('❌ Export system not available', { parse_mode: 'MarkdownV2' });
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Export search PDF error:', error);
      await ctx.answerCbQuery('❌ Error exporting');
    }
  }
  
  // ==================== BANK TRANSFER CALLBACKS ====================
  async function handleBankTransfer(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const usersForSendMoney = { ...users, ...userMethods };
      
      // Record system transaction
      await systemTransactionManager.recordTransaction({
        type: 'bank_transfer_started',
        userId: userId,
        telegramId: userId,
        status: 'started',
        description: 'User started bank transfer process'
      });
      
      // Call the original send money function
      await sendMoney.handleSendMoney(ctx, usersForSendMoney, transactionMethods);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Bank transfer callback error:', error);
      await ctx.answerCbQuery('❌ Error loading bank transfer');
    }
  }
  
  async function handleLitemonieTransfer(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      
      // Check KYC
      const kycStatus = user.kycStatus || 'pending';
      if (kycStatus !== 'approved') {
        await ctx.reply(
          '❌ \\*KYC VERIFICATION REQUIRED\\*\n\n' +
          '📝 Your account needs verification\\.\n\n' +
          `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
          '📞 \\*Contact admin\\:\\* @opuenekeke',
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }
      
      // Check if user has phone number registered
      if (!user.phone) {
        await ctx.reply(
          '📱 \\*LITEMONIE TRANSFER\\*\n\n' +
          '❌ \\*Phone Number Required\\*\n\n' +
          'You need to register a phone number to use Litemonie transfer\\.\n\n' +
          '📞 \\*How to register\\:\\*\n' +
          '1\\. Go to "🛂 KYC Status"\n' +
          '2\\. Complete your KYC with phone number\n' +
          '3\\. Wait for admin approval\n\n' +
          'Once approved, your phone number will be your Litemonie account number\\.',
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }
      
      await ctx.reply(
        '📱 \\*LITEMONIE TRANSFER\\*\n\n' +
        '💸 \\*Send money to other bot users\\*\n\n' +
        '📞 \\*Your Litemonie Account\\:\\* ' + escapeMarkdownV2(user.phone || 'Not registered') + '\n' +
        '💵 \\*Available Balance\\:\\* ' + formatCurrency(user.wallet) + '\n\n' +
        '📝 \\*Enter recipient\\\'s registered phone number\\:\\*\n' +
        '\\(Example\\: 08012345678\\)',
        { parse_mode: 'MarkdownV2' }
      );
      
      // Set session for Litemonie transfer
      sessions[userId] = {
        action: 'litemonie_transfer',
        step: 'enter_phone'
      };
      await saveData(sessionsFile, sessions);
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Litemonie transfer callback error:', error);
      await ctx.answerCbQuery('❌ Error loading Litemonie transfer');
    }
  }
  
  // ==================== ADMIN PANEL CALLBACKS ====================
  async function handleAdminUsers(ctx) {
    try {
      if (adminPanelHandlers && adminPanelHandlers.handleAdminUsers) {
        await adminPanelHandlers.handleAdminUsers(ctx);
      } else {
        await ctx.answerCbQuery('❌ Admin panel not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Admin users callback error:', error);
      await ctx.answerCbQuery('❌ Error loading user management');
    }
  }
  
  async function handleAdminKyc(ctx) {
    try {
      if (adminPanelHandlers && adminPanelHandlers.handleAdminKyc) {
        await adminPanelHandlers.handleAdminKyc(ctx);
      } else {
        await ctx.answerCbQuery('❌ KYC system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Admin KYC callback error:', error);
      await ctx.answerCbQuery('❌ Error loading KYC approvals');
    }
  }
  
  async function handleAdminDeviceFinancing(ctx) {
    try {
      if (adminPanelHandlers && adminPanelHandlers.handleAdminDeviceFinancing) {
        await adminPanelHandlers.handleAdminDeviceFinancing(ctx);
      } else {
        await ctx.answerCbQuery('❌ Device financing admin not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Device financing admin callback error:', error);
      await ctx.answerCbQuery('❌ Error loading device financing admin');
    }
  }
  
  async function handleAdminBalance(ctx) {
    try {
      if (adminPanelHandlers && adminPanelHandlers.handleAdminBalance) {
        await adminPanelHandlers.handleAdminBalance(ctx);
      } else {
        await ctx.answerCbQuery('❌ Balance system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ System balance callback error:', error);
      await ctx.answerCbQuery('❌ Error loading system balance');
    }
  }
  
  async function handleAdminStats(ctx) {
    try {
      if (adminPanelHandlers && adminPanelHandlers.handleAdminStats) {
        await adminPanelHandlers.handleAdminStats(ctx);
      } else {
        await ctx.answerCbQuery('❌ Stats system not available');
      }
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ System stats callback error:', error);
      await ctx.answerCbQuery('❌ Error loading system stats');
    }
  }
  
  // ==================== HOME/BACK CALLBACKS ====================
  async function handleHome(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      const isUserAdmin = isAdmin(userId);
      
      let keyboard = isUserAdmin ? [
        ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
        ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
        ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
        ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
        ['🛂 KYC Status', '🛠️ Admin Panel', '🆘 Help & Support']
      ] : [
        ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
        ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
        ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
        ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
        ['🛂 KYC Status', '🆘 Help & Support']
      ];
      
      const kycStatus = user.kycStatus || 'pending';
      
      let emailStatus = '';
      let virtualAccountStatus = '';
      const billstackConfigured = CONFIG.BILLSTACK_API_KEY && CONFIG.BILLSTACK_SECRET_KEY;
      
      if (billstackConfigured) {
        if (!user.email || !isValidEmail(user.email)) {
          emailStatus = `\n📧 \\*Email Status\\:\\* ❌ NOT SET\n\\_Set email via deposit process for virtual account\\_`;
        } else {
          emailStatus = `\n📧 \\*Email Status\\:\\* ✅ SET`;
        }
        
        if (!user.virtualAccount) {
          virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ❌ NOT CREATED\n\\_Create virtual account via deposit process\\_`;
        } else {
          virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ✅ ACTIVE`;
        }
      } else {
        emailStatus = `\n📧 \\*Email Status\\:\\* ${user.email ? '✅ SET' : '❌ NOT SET'}`;
        virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ⏳ CONFIG PENDING\n\\_Admin configuring Billstack API\\_`;
      }
      
      // Device financing status
      let deviceFinancingStatus = '';
      if (user.isMarketer) {
        deviceFinancingStatus = `\n👥 \\*Device Marketer\\:\\* ✅ ACTIVE`;
      }
      
      // Delete the original message if it exists
      try {
        await ctx.deleteMessage();
      } catch (e) {
        // Ignore if message can't be deleted
      }
      
      await ctx.reply(
        `🌟 \\*Welcome to Liteway VTU Bot\\!\\*\n\n` +
        `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
        `💵 \\*Wallet Balance\\:\\* ${formatCurrency(user.wallet)}\n` +
        `${emailStatus}` +
        `${virtualAccountStatus}` +
        `${deviceFinancingStatus}\n\n` +
        `📱 \\*Available Services\\:\\*\n` +
        `• 📱 Device Financing \\(Buy smartphones on credit\\)\n` +
        `• 📺 TV Subscription\n` +
        `• 💡 Electricity Bill\n` +
        `• 📞 Buy Airtime\n` +
        `• 📡 Buy Data\n` +
        `• 🎫 Card Pins\n` +
        `• 📝 Exam Pins\n` +
        `• ⚡ Lite Light\n` +
        `• 🏦 Money Transfer \\(NEW\\: Bank \\+ Litemonie\\)\n` +
        `• 💰 Wallet Balance\n` +
        `• 💳 Deposit Funds\n` +
        `• 📜 Transaction History\n` +
        `• 🛂 KYC Status\n` +
        `${isUserAdmin ? '• 🛠️ Admin Panel \\(ENHANCED with API Response Tracking\\)\n' : ''}` +
        `• 🆘 Help & Support\n\n` +
        `📞 \\*Support\\:\\* @opuenekeke`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.keyboard(keyboard).resize()
        }
      );
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      console.error('❌ Home callback error:', error);
      await ctx.answerCbQuery('❌ Error going home');
    }
  }
  
  async function handleNoAction(ctx) {
    ctx.answerCbQuery();
  }
  
  async function handleDeviceBack(ctx) {
    try {
      const userId = ctx.from.id.toString();
      if (deviceHandler) {
        deviceHandler.users = users;
        await deviceHandler.handleDeviceMenu(ctx);
      } else {
        await ctx.answerCbQuery('❌ Device system unavailable');
      }
    } catch (error) {
      console.error('❌ Device back button error:', error);
      ctx.answerCbQuery('❌ Error going back');
    }
  }
  
  // ==================== RETURN ALL CALLBACK HANDLERS ====================
  return {
    // Device financing callbacks
    handleDeviceMiniApp,
    handleUnlockCommandCallback,
    handleDeviceBack,
    
    // Transaction tracking callbacks
    handleAdminTransactionTracking,
    handleAdminSearchTxId,
    handleAdminAdvancedSearch,
    handleAdminQuickExport,
    handleAdminViewAllTransactions,
    handleAdminViewFailedTransactions,
    handleAdminViewPendingTransactions,
    handleAdminViewApiTransactions,
    
    // Transaction details callbacks
    handleAdminViewTx,
    handleAdminViewApiRaw,
    handleAdminExportTx,
    handleAdminExportTxJson,
    handleAdminExportTxTxt,
    handleAdminUpdateTx,
    handleAdminUpdateTxComplete,
    handleAdminUpdateTxFail,
    handleAdminUpdateTxPending,
    
    // Pagination callbacks
    handleAdminTransactionsPage,
    handleAdminFailedPage,
    handleAdminApiPage,
    
    // Export callbacks
    handleAdminExportTodayMenu,
    handleAdminExportFailedMenu,
    handleAdminExportPendingMenu,
    handleAdminExportApiMenu,
    handleAdminExportAllMenu,
    handleAdminExportSearch,
    handleAdminExportSearchJson,
    handleAdminExportSearchCsv,
    handleAdminExportSearchExcel,
    handleAdminExportSearchPdf,
    
    // Bank transfer callbacks
    handleBankTransfer,
    handleLitemonieTransfer,
    
    // Admin panel callbacks
    handleAdminUsers,
    handleAdminKyc,
    handleAdminDeviceFinancing,
    handleAdminBalance,
    handleAdminStats,
    
    // Home/back callbacks
    handleHome,
    handleNoAction
  };
};