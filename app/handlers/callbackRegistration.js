// app/handlers/callbackRegistration.js
module.exports = function registerCallbackHandlers(bot, callbacks, deviceCreditCallbacks = {}, miniAppCallbacks = {}) {
  console.log('📋 REGISTERING CALLBACK HANDLERS...');
  
  // Function to properly register callbacks
  function registerCallback(pattern, handler, moduleName = 'Custom') {
    try {
      // Check if pattern contains dynamic parameters like :deviceId
      if (pattern.includes(':') && pattern.includes('_')) {
        // Convert :deviceId patterns to proper regex
        const regexPattern = pattern.replace(/:\w+/g, '(.+)');
        bot.action(new RegExp(`^${regexPattern}$`), handler);
        console.log(`   ✓ ${moduleName} Regex: ${pattern} -> ^${regexPattern}$`);
      }
      // Check if already a regex pattern
      else if (pattern.includes('(') || pattern.includes('.') || pattern.includes('+') || pattern.includes('*') || pattern.includes('?')) {
        bot.action(new RegExp(`^${pattern}$`), handler);
        console.log(`   ✓ ${moduleName} Regex: ${pattern}`);
      }
      // Simple string callback
      else {
        bot.action(pattern, handler);
        console.log(`   ✓ ${moduleName} Simple: ${pattern}`);
      }
    } catch (error) {
      console.error(`   ❌ ${moduleName} Failed to register "${pattern}": ${error.message}`);
    }
  }
  
  // Register all callbacks from the main callback handler
  if (callbacks) {
    console.log('🔗 Registering main callbacks...');
    
    // Device financing callbacks
    if (callbacks.handleDeviceMiniApp) registerCallback('device_mini_app', callbacks.handleDeviceMiniApp, 'Device');
    if (callbacks.handleUnlockCommandCallback) registerCallback('unlock_command', callbacks.handleUnlockCommandCallback, 'Device');
    if (callbacks.handleDeviceBack) registerCallback('device_back', callbacks.handleDeviceBack, 'Device');
    
    // Transaction tracking callbacks
    if (callbacks.handleAdminTransactionTracking) registerCallback('admin_transaction_tracking', callbacks.handleAdminTransactionTracking, 'Admin');
    if (callbacks.handleAdminSearchTxId) registerCallback('admin_search_tx_id', callbacks.handleAdminSearchTxId, 'Admin');
    if (callbacks.handleAdminAdvancedSearch) registerCallback('admin_advanced_search', callbacks.handleAdminAdvancedSearch, 'Admin');
    if (callbacks.handleAdminQuickExport) registerCallback('admin_quick_export', callbacks.handleAdminQuickExport, 'Admin');
    
    // View callbacks
    if (callbacks.handleAdminViewAllTransactions) registerCallback('admin_view_all_transactions', callbacks.handleAdminViewAllTransactions, 'Admin');
    if (callbacks.handleAdminViewFailedTransactions) registerCallback('admin_view_failed_transactions', callbacks.handleAdminViewFailedTransactions, 'Admin');
    if (callbacks.handleAdminViewPendingTransactions) registerCallback('admin_view_pending_transactions', callbacks.handleAdminViewPendingTransactions, 'Admin');
    if (callbacks.handleAdminViewApiTransactions) registerCallback('admin_view_api_transactions', callbacks.handleAdminViewApiTransactions, 'Admin');
    
    // Transaction details regex callbacks (will be registered separately)
    // Export menu callbacks
    if (callbacks.handleAdminExportTodayMenu) registerCallback('admin_export_today_menu', callbacks.handleAdminExportTodayMenu, 'Export');
    if (callbacks.handleAdminExportFailedMenu) registerCallback('admin_export_failed_menu', callbacks.handleAdminExportFailedMenu, 'Export');
    if (callbacks.handleAdminExportPendingMenu) registerCallback('admin_export_pending_menu', callbacks.handleAdminExportPendingMenu, 'Export');
    if (callbacks.handleAdminExportApiMenu) registerCallback('admin_export_api_menu', callbacks.handleAdminExportApiMenu, 'Export');
    if (callbacks.handleAdminExportAllMenu) registerCallback('admin_export_all_menu', callbacks.handleAdminExportAllMenu, 'Export');
    if (callbacks.handleAdminExportSearch) registerCallback('admin_export_search', callbacks.handleAdminExportSearch, 'Export');
    
    // Export format callbacks
    if (callbacks.handleAdminExportSearchJson) registerCallback('admin_export_search_json', callbacks.handleAdminExportSearchJson, 'Export');
    if (callbacks.handleAdminExportSearchCsv) registerCallback('admin_export_search_csv', callbacks.handleAdminExportSearchCsv, 'Export');
    if (callbacks.handleAdminExportSearchExcel) registerCallback('admin_export_search_excel', callbacks.handleAdminExportSearchExcel, 'Export');
    if (callbacks.handleAdminExportSearchPdf) registerCallback('admin_export_search_pdf', callbacks.handleAdminExportSearchPdf, 'Export');
    
    // Bank transfer callbacks
    if (callbacks.handleBankTransfer) registerCallback('bank_transfer', callbacks.handleBankTransfer, 'Transfer');
    if (callbacks.handleLitemonieTransfer) registerCallback('litemonie_transfer', callbacks.handleLitemonieTransfer, 'Transfer');
    
    // Admin panel callbacks
    if (callbacks.handleAdminUsers) registerCallback('admin_users', callbacks.handleAdminUsers, 'Admin');
    if (callbacks.handleAdminKyc) registerCallback('admin_kyc', callbacks.handleAdminKyc, 'Admin');
    if (callbacks.handleAdminDeviceFinancing) registerCallback('admin_device_financing', callbacks.handleAdminDeviceFinancing, 'Admin');
    if (callbacks.handleAdminBalance) registerCallback('admin_balance', callbacks.handleAdminBalance, 'Admin');
    if (callbacks.handleAdminStats) registerCallback('admin_stats', callbacks.handleAdminStats, 'Admin');
    
    // Home/back callbacks
    if (callbacks.handleHome) registerCallback('start', callbacks.handleHome, 'Navigation');
    if (callbacks.handleNoAction) registerCallback('no_action', callbacks.handleNoAction, 'Navigation');
  }
  
  // Register device financing callbacks
  if (Object.keys(deviceCreditCallbacks).length > 0) {
    console.log('📱 Registering Device Financing callbacks...');
    for (const [pattern, handler] of Object.entries(deviceCreditCallbacks)) {
      registerCallback(pattern, handler, 'Device Financing');
    }
  }
  
  // Register Mini App callbacks
  if (Object.keys(miniAppCallbacks).length > 0) {
    console.log('📱 Registering Mini App callbacks...');
    Object.entries(miniAppCallbacks).forEach(([pattern, handler]) => {
      registerCallback(pattern, handler, 'Mini App');
    });
  }
  
  // Register regex patterns
  console.log('🔗 Registering regex pattern callbacks...');
  
  // Transaction details regex patterns
  if (callbacks && callbacks.handleAdminViewTx) {
    bot.action(/^admin_view_tx_(.+)$/, callbacks.handleAdminViewTx);
    console.log('   ✓ Admin: admin_view_tx_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminViewApiRaw) {
    bot.action(/^admin_view_api_raw_(.+)$/, callbacks.handleAdminViewApiRaw);
    console.log('   ✓ Admin: admin_view_api_raw_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminExportTx) {
    bot.action(/^admin_export_tx_(.+)$/, callbacks.handleAdminExportTx);
    console.log('   ✓ Admin: admin_export_tx_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminExportTxJson) {
    bot.action(/^admin_export_tx_json_(.+)$/, callbacks.handleAdminExportTxJson);
    console.log('   ✓ Admin: admin_export_tx_json_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminExportTxTxt) {
    bot.action(/^admin_export_tx_txt_(.+)$/, callbacks.handleAdminExportTxTxt);
    console.log('   ✓ Admin: admin_export_tx_txt_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminUpdateTx) {
    bot.action(/^admin_update_tx_(.+)$/, callbacks.handleAdminUpdateTx);
    console.log('   ✓ Admin: admin_update_tx_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminUpdateTxComplete) {
    bot.action(/^admin_update_tx_complete_(.+)$/, callbacks.handleAdminUpdateTxComplete);
    console.log('   ✓ Admin: admin_update_tx_complete_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminUpdateTxFail) {
    bot.action(/^admin_update_tx_fail_(.+)$/, callbacks.handleAdminUpdateTxFail);
    console.log('   ✓ Admin: admin_update_tx_fail_(.+)');
  }
  
  if (callbacks && callbacks.handleAdminUpdateTxPending) {
    bot.action(/^admin_update_tx_pending_(.+)$/, callbacks.handleAdminUpdateTxPending);
    console.log('   ✓ Admin: admin_update_tx_pending_(.+)');
  }
  
  // Pagination regex patterns
  if (callbacks && callbacks.handleAdminTransactionsPage) {
    bot.action(/^admin_transactions_page_(\d+)$/, callbacks.handleAdminTransactionsPage);
    console.log('   ✓ Admin: admin_transactions_page_(\\d+)');
  }
  
  if (callbacks && callbacks.handleAdminFailedPage) {
    bot.action(/^admin_failed_page_(\d+)$/, callbacks.handleAdminFailedPage);
    console.log('   ✓ Admin: admin_failed_page_(\\d+)');
  }
  
  if (callbacks && callbacks.handleAdminApiPage) {
    bot.action(/^admin_api_page_(\d+)$/, callbacks.handleAdminApiPage);
    console.log('   ✓ Admin: admin_api_page_(\\d+)');
  }
  
  console.log('✅ All callback handlers registered');
};