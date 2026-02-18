// app/deviceCredit/index.js - MAIN ENTRY POINT
const path = require('path');
const DeviceHandler = require('./handlers/DeviceHandler');
const { Markup } = require('telegraf');

class DeviceCreditManager {
  constructor(bot, users, dataDir = './data') {
    console.log('🚀 Initializing Device Credit System...');
    
    this.bot = bot;
    this.users = users;
    this.dataDir = path.resolve(dataDir, 'deviceCredit');
    
    // Initialize main handler
    this.deviceHandler = new DeviceHandler(this.dataDir, this.bot, this.users);
    
    // Initialize all handlers
    this.handlers = {};
    this.initializeHandlers();
    
    // State tracking
    this.isInitialized = false;
    this.callbacks = null;
  }

  async initialize() {
    try {
      console.log('🔄 Setting up Device Credit System...');
      
      // Initialize main handler
      const success = await this.deviceHandler.initialize();
      if (!success) {
        throw new Error('Failed to initialize DeviceHandler');
      }
      
      // Load callbacks
      this.callbacks = this.deviceHandler.getCallbacks();
      
      // Set up text message handler
      this.setupTextHandler();
      
      // Set up callback query handler
      this.setupCallbackHandler();
      
      this.isInitialized = true;
      console.log('✅ Device Credit System ready!');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Device Credit System:', error);
      this.isInitialized = false;
      return false;
    }
  }

  initializeHandlers() {
    try {
      // Dynamically load all handlers
      const fs = require('fs');
      const handlersDir = path.join(__dirname, 'handlers');
      
      if (fs.existsSync(handlersDir)) {
        const handlerFiles = fs.readdirSync(handlersDir)
          .filter(file => file.endsWith('.js') && file !== 'DeviceHandler.js');
        
        handlerFiles.forEach(file => {
          const handlerName = path.basename(file, '.js');
          const HandlerClass = require(`./handlers/${handlerName}`);
          this.handlers[handlerName] = new HandlerClass(this.deviceHandler);
          console.log(`✅ Loaded handler: ${handlerName}`);
        });
      }
    } catch (error) {
      console.error('❌ Error loading handlers:', error);
    }
  }

  setupTextHandler() {
    this.bot.on('text', async (ctx, next) => {
      try {
        // Skip if it's a command (handled by main bot)
        if (ctx.message.text.startsWith('/')) {
          return next();
        }
        
        const userId = ctx.from.id.toString();
        
        // Check if user is in device credit mode
        if (await this.isInDeviceMode(userId)) {
          const handled = await this.deviceHandler.handleTextMessage(ctx, ctx.message.text);
          if (handled) return;
        }
        
        // Pass to next middleware
        next();
      } catch (error) {
        console.error('❌ Device text handler error:', error);
        next();
      }
    });
  }

  setupCallbackHandler() {
    this.bot.on('callback_query', async (ctx) => {
      try {
        const callbackData = ctx.callbackQuery.data;
        
        // Check if it's a device credit callback
        for (const [pattern, handler] of Object.entries(this.callbacks)) {
          const match = callbackData.match(new RegExp(`^${pattern}$`));
          if (match) {
            await handler(ctx);
            return;
          }
        }
        
        // Not a device credit callback
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Device callback handler error:', error);
        await ctx.answerCbQuery('❌ Error processing request');
      }
    });
  }

  async isInDeviceMode(userId) {
    // Check user session or state to determine if they're in device credit mode
    const userSession = this.users[userId]?.session || {};
    return userSession.mode === 'device' || userSession.action?.startsWith('device_');
  }

  // ==================== MAIN MENU INTEGRATION ====================
  getMainMenuOptions() {
    return {
      text: '📱 Device Financing',
      callback: 'device_menu',
      description: 'Buy smartphones on credit with flexible payment plans'
    };
  }

  async handleMainMenuSelection(ctx) {
    await this.deviceHandler.handleDeviceMenu(ctx);
  }

  // ==================== COMMAND HANDLERS ====================
  getCommands() {
    return {
      '/devices': 'Access device financing system',
      '/devicestats': 'View device statistics (admin only)',
      '/canceldevice': 'Cancel current device operation'
    };
  }

  async handleCommand(ctx, command) {
    const userId = ctx.from.id.toString();
    
    switch (command) {
      case '/devices':
        await this.deviceHandler.handleDeviceMenu(ctx);
        return true;
        
      case '/devicestats':
        if (this.deviceHandler.isUserAdmin(userId)) {
          await this.deviceHandler.handleAdminPanel(ctx);
        } else {
          await ctx.reply('❌ Admin access only', { parse_mode: 'MarkdownV2' });
        }
        return true;
        
      case '/canceldevice':
        const cancelled = await this.deviceHandler.handleCancelCommand(ctx);
        if (!cancelled) {
          await ctx.reply('❌ No active operation to cancel', { parse_mode: 'MarkdownV2' });
        }
        return true;
    }
    
    return false;
  }

  // ==================== ADMIN INTEGRATION ====================
  async getAdminStats() {
    try {
      if (!this.isInitialized) {
        return null;
      }
      
      const stats = await this.deviceHandler.analytics.getFullAnalytics();
      return this.formatAdminStats(stats);
    } catch (error) {
      console.error('❌ Error getting admin stats:', error);
      return null;
    }
  }

  formatAdminStats(stats) {
    if (!stats) return '❌ Device stats unavailable';
    
    return `*📱 DEVICE FINANCING STATS*\n\n` +
      `*Devices:* ${stats.devices?.total || 0} models\n` +
      `*Inventory:* ${stats.inventory?.total || 0} items\n` +
      `*Purchases:* ${stats.purchases?.total || 0} total\n` +
      `*Revenue:* ₦${this.deviceHandler.formatCurrency(stats.purchases?.revenue || 0)}\n` +
      `*Profit:* ₦${this.deviceHandler.formatCurrency(stats.purchases?.profit || 0)}\n` +
      `*Active Locks:* ${stats.financing?.activeLocks || 0}`;
  }

  // ==================== USER PROFILE INTEGRATION ====================
  async getUserDeviceSummary(userId) {
    try {
      if (!this.isInitialized) return null;
      
      const userPurchases = await this.deviceHandler.purchaseModel.getUserPurchases(userId, true);
      const userDevices = await this.deviceHandler.userDeviceModel.getUserDevices(userId);
      
      if (userPurchases.length === 0 && userDevices.length === 0) {
        return null;
      }
      
      return {
        purchases: userPurchases.length,
        activePurchases: userPurchases.filter(p => !p.completed).length,
        devices: userDevices.length,
        lockedDevices: userDevices.filter(d => d.status === 'locked').length,
        totalValue: userPurchases.reduce((sum, p) => sum + p.totalPrice, 0)
      };
    } catch (error) {
      console.error('❌ Error getting user device summary:', error);
      return null;
    }
  }

  formatUserDeviceSummary(summary) {
    if (!summary) return '';
    
    return `*📱 Your Devices*\n` +
      `• Purchases: ${summary.purchases} total\n` +
      `• Active: ${summary.activePurchases} ongoing\n` +
      `• Attached Devices: ${summary.devices}\n` +
      `• Locked: ${summary.lockedDevices}\n` +
      `• Total Value: ₦${this.deviceHandler.formatCurrency(summary.totalValue)}`;
  }

  // ==================== WEBHOOK/API ENDPOINTS ====================
  async handleWebhookRequest(endpoint, data) {
    // This can be used for external integrations like payment webhooks
    switch (endpoint) {
      case '/webhook/device-payment':
        return await this.handlePaymentWebhook(data);
      case '/api/device-stats':
        return await this.getApiStats();
      default:
        return { error: 'Endpoint not found' };
    }
  }

  async handlePaymentWebhook(data) {
    // Handle payment confirmation from external payment processor
    console.log('Payment webhook received:', data);
    // Implement payment verification and purchase update logic
    return { success: true, message: 'Payment processed' };
  }

  async getApiStats() {
    try {
      const stats = await this.deviceHandler.analytics.getFullAnalytics();
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ==================== HEALTH CHECK ====================
  async healthCheck() {
    return {
      service: 'DeviceCredit',
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      timestamp: new Date().toISOString(),
      stats: await this.getQuickStats()
    };
  }

  async getQuickStats() {
    try {
      return {
        users: Object.keys(this.users).length,
        callbacks: this.callbacks ? Object.keys(this.callbacks).length : 0,
        handlers: Object.keys(this.handlers).length
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // ==================== ERROR HANDLING ====================
  async handleError(ctx, error) {
    console.error('Device Credit System Error:', error);
    
    // Send user-friendly error message
    await ctx.reply(
      `*❌ DEVICE SYSTEM ERROR*\n\n` +
      `Sorry, there was an error in the device financing system\\.\n\n` +
      `*Please try:*\n` +
      `• Restarting the operation\n` +
      `• Contacting support if it persists\n\n` +
      `*Support:* @opuenekeke`,
      { parse_mode: 'MarkdownV2' }
    );
    
    // Notify admin about critical errors
    if (error.critical) {
      await this.notifyAdmin(error);
    }
  }

  async notifyAdmin(error) {
    try {
      const adminId = '1279640125'; // Primary admin
      await this.bot.telegram.sendMessage(
        adminId,
        `*⚠️ DEVICE SYSTEM ALERT*\n\n` +
        `*Error:* ${error.message}\n` +
        `*Time:* ${new Date().toLocaleString()}\n` +
        `*Stack:* ${error.stack?.substring(0, 200)}...`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch (notifyError) {
      console.error('Failed to notify admin:', notifyError);
    }
  }
}

// Export factory function for easier initialization
module.exports = {
  createDeviceCreditManager: (bot, users, dataDir) => {
    return new DeviceCreditManager(bot, users, dataDir);
  },
  
  // Direct exports for manual initialization
  DeviceCreditManager,
  DeviceHandler: require('./handlers/DeviceHandler')
};