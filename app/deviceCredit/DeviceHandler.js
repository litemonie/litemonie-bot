// app/deviceCredit/DeviceHandler.js - COMPLETE SCRIPT WITH ADMIN IMPROVEMENTS
const path = require('path');
const fs = require('fs').promises;
const { Markup } = require('telegraf');

class DeviceHandler {
  constructor(dataDir, bot, users) {
    console.log('🚀 DeviceHandler: Initializing...');
    console.log('📊 Users passed to handler:', Object.keys(users || {}).length);
    
    this.dataDir = dataDir;
    this.bot = bot;
    
    this.users = users || global.users || {};
    
    if (!this.users || typeof this.users !== 'object') {
      console.warn('⚠️ DeviceHandler: users object was undefined, initializing as empty object');
      this.users = {};
    }
    
    console.log(`📊 DeviceHandler: Loaded ${Object.keys(this.users).length} users`);
    this.isInitialized = false;
    
    // File paths
    this.devicesFile = path.join(dataDir, 'devices.json');
    this.inventoryFile = path.join(dataDir, 'inventory.json');
    this.imeiLocksFile = path.join(dataDir, 'imei_locks.json');
    this.marketersFile = path.join(dataDir, 'marketers.json');
    this.devicePurchasesFile = path.join(dataDir, 'device_purchases.json');
    this.paymentsFile = path.join(dataDir, 'payments.json');
    this.deviceConfigsFile = path.join(dataDir, 'device_configs.json');
    this.userDevicesFile = path.join(dataDir, 'user_devices.json');
    
    console.log('🔧 DeviceHandler files initialized:', {
      devices: this.devicesFile,
      inventory: this.inventoryFile,
      imeiLocks: this.imeiLocksFile,
      marketers: this.marketersFile,
      purchases: this.devicePurchasesFile,
      userDevices: this.userDevicesFile
    });
  }

  // ==================== INITIALIZATION ====================
  async initialize() {
    try {
      console.log('🔄 Initializing DeviceHandler...');
      
      await fs.mkdir(this.dataDir, { recursive: true });
      
      await this.initializeDataFiles();
      
      this.isInitialized = true;
      console.log('✅ DeviceHandler ready');
      return true;
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.isInitialized = false;
      return false;
    }
  }

  async initializeDataFiles() {
    try {
      const files = {
        'devices.json': [],
        'inventory.json': [],
        'imei_locks.json': [],
        'marketers.json': [],
        'device_purchases.json': [],
        'payments.json': [],
        'device_configs.json': [],
        'user_devices.json': []
      };

      for (const [filename, defaultContent] of Object.entries(files)) {
        const filePath = path.join(this.dataDir, filename);
        try {
          await fs.access(filePath);
          console.log(`✅ ${filename} exists`);
        } catch {
          await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
          console.log(`📄 Created ${filename}`);
        }
      }

      await this.initializeSampleData();
      
    } catch (error) {
      console.error('❌ Error initializing data files:', error);
      throw error;
    }
  }

  async initializeSampleData() {
    try {
      // Sample devices
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      
      if (devices.length === 0) {
        const sampleDevices = [
          {
            id: 'tecno_camon_001',
            make: 'Tecno',
            model: 'Camon 19',
            category: 'mid-range',
            costPrice: 100000,
            sellingPrice: 130000,
            specs: {
              display: '6.8" AMOLED',
              camera: '64MP + 8MP + 2MP',
              battery: '5000mAh',
              processor: 'Helio G96',
              os: 'Android 12',
              warranty: '12 months'
            },
            status: 'active',
            addedAt: new Date().toISOString(),
            addedBy: 'system'
          },
          {
            id: 'infinix_hot12_002',
            make: 'Infinix',
            model: 'Hot 12',
            category: 'budget',
            costPrice: 75000,
            sellingPrice: 97500,
            specs: {
              display: '6.78" IPS',
              camera: '50MP + 2MP',
              battery: '5000mAh',
              processor: 'Helio G85',
              os: 'Android 11',
              warranty: '12 months'
            },
            status: 'active',
            addedAt: new Date().toISOString(),
            addedBy: 'system'
          }
        ];

        await fs.writeFile(this.devicesFile, JSON.stringify(sampleDevices, null, 2));
        console.log('📱 Added sample devices');
      }

      // Sample inventory
      const inventoryData = await fs.readFile(this.inventoryFile, 'utf8');
      const inventory = JSON.parse(inventoryData);
      
      if (inventory.length === 0) {
        const devices = JSON.parse(await fs.readFile(this.devicesFile, 'utf8'));
        
        for (const device of devices) {
          for (let i = 0; i < 3; i++) {
            inventory.push({
              inventoryId: `${device.id}_${Date.now()}_${i}`,
              deviceId: device.id,
              imei: this.generateIMEI(),
              serialNumber: this.generateSerial(),
              status: 'available',
              condition: 'new',
              location: 'warehouse',
              purchaseDate: null,
              saleDate: null,
              currentOwner: null,
              createdAt: new Date().toISOString()
            });
          }
        }
        
        await fs.writeFile(this.inventoryFile, JSON.stringify(inventory, null, 2));
        console.log(`📦 Created ${inventory.length} inventory items`);
      }

      // Sample marketers
      const marketersData = await fs.readFile(this.marketersFile, 'utf8');
      const marketers = JSON.parse(marketersData);
      
      if (marketers.length === 0) {
        marketers.push({
          id: 'MARK-ADMIN-001',
          telegramId: '1279640125',
          name: 'System Admin',
          phone: '+2348000000000',
          email: 'admin@litedevice.com',
          commissionRate: 10,
          status: 'active',
          assignedClients: [],
          totalSales: 0,
          totalCommission: 0,
          joinDate: new Date().toISOString(),
          performance: {
            monthlyTarget: 10000000,
            currentMonthSales: 0,
            conversionRate: 0
          }
        });
        
        await fs.writeFile(this.marketersFile, JSON.stringify(marketers, null, 2));
        console.log('👨‍💼 Added admin marketer');
      }

    } catch (error) {
      console.error('❌ Error initializing sample data:', error);
    }
  }

  // ==================== MAIN MENU ====================
  async handleDeviceMenu(ctx) {
    try {
      const userId = ctx.from.id.toString();
      console.log(`📱 Device menu requested by user ${userId}`);
      
      const user = this.users[userId] || {};
      const isAdminUser = this.isUserAdmin(userId);
      const isMarketer = user.isMarketer === true;
      
      const keyboard = [];
      
      keyboard.push([Markup.button.callback('📱 View Devices', 'device_view_devices')]);
      
      keyboard.push([
        Markup.button.callback('🛒 Buy Device', 'device_buy'),
        Markup.button.callback('💳 Make Payment', 'device_payment')
      ]);
      
      keyboard.push([Markup.button.callback('📊 My History', 'device_my_history')]);
      
      if (isMarketer || isAdminUser) {
        keyboard.push([Markup.button.callback('💰 My Sales', 'device_my_sales')]);
      }
      
      if (isAdminUser) {
        keyboard.push([
          Markup.button.callback('⚙️ Admin Panel', 'device_admin'),
          Markup.button.callback('👥 Marketers', 'device_manage_marketers')
        ]);
      }
      
      keyboard.push([Markup.button.callback('🏠 Main Menu', 'start')]);
      
      const message = 
        `*📱 LITEDEVICE FINANCING*\n\n` +
        `*Premium Smartphone Financing*\n` +
        `Instant Approval • Flexible Terms • IMEI Locked Security\n\n` +
        
        `🎯 *KEY FEATURES*\n` +
        `• ✅ IMEI Locked Security\n` +
        `• ✅ Instant Device Delivery\n` +
        `• ✅ 2\\-6 Month Flexible Terms\n` +
        `• ✅ Credit History Building\n` +
        `• ✅ Device Upgrade Program\n\n` +
        
        `🔐 *SECURITY*\n` +
        `• IMEI Blacklisting on default\n` +
        `• Remote device lock capability\n` +
        `• Real\\-time payment tracking\n\n` +
        
        (isMarketer ? `🎯 *You are a Marketer \\(10% commission\\)*\n` : '') +
        (isAdminUser ? `👑 *You are an Admin*\n` : '') +
        `\n` +
        `📞 *Support:* @opuenekeke`;
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      }
      
    } catch (error) {
      console.error('❌ Device menu error:', error);
      await ctx.reply('❌ Error loading device menu\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  // ==================== UTILITY METHODS ====================
  escapeMarkdown(text) {
    if (typeof text !== 'string') {
      if (text === null || text === undefined) return '';
      return String(text);
    }
    
    const specialChars = '_*[]()~`>#+\\-=|{}.!';
    let escaped = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (specialChars.includes(char)) {
        escaped += '\\' + char;
      } else {
        escaped += char;
      }
    }
    
    return escaped;
  }

  formatCurrency(amount) {
    if (!amount) return '0';
    return amount.toLocaleString('en-US');
  }

  generateIMEI() {
    const random14 = Array.from({length: 14}, () => Math.floor(Math.random() * 10)).join('');
    const luhnDigit = this.calculateLuhnCheckDigit(random14);
    return random14 + luhnDigit;
  }

  calculateLuhnCheckDigit(number) {
    const digits = number.split('').map(Number);
    let sum = 0;
    let alternate = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits[i];
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    
    return (10 - (sum % 10)) % 10;
  }

  generateSerial() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let serial = '';
    for (let i = 0; i < 10; i++) {
      serial += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return serial;
  }

  getSession(userId) {
    try {
      if (global.deviceSessions && global.deviceSessions[userId]) {
        return global.deviceSessions[userId];
      }
      return { action: null, step: null, data: {} };
    } catch (error) {
      console.error('❌ Get session error:', error);
      return { action: null, step: null, data: {} };
    }
  }

  updateSession(userId, session) {
    try {
      if (!global.deviceSessions) {
        global.deviceSessions = {};
      }
      global.deviceSessions[userId] = session;
      return true;
    } catch (error) {
      console.error('❌ Update session error:', error);
      return false;
    }
  }

  clearSession(userId) {
    try {
      if (global.deviceSessions && global.deviceSessions[userId]) {
        delete global.deviceSessions[userId];
      }
      return true;
    } catch (error) {
      console.error('❌ Clear session error:', error);
      return false;
    }
  }

  isUserAdmin(userId) {
    try {
      const ADMIN_IDS = ['1279640125', '8055762920'];
      return ADMIN_IDS.includes(userId.toString());
    } catch (error) {
      console.error('Admin check error:', error);
      return false;
    }
  }

  // ==================== CALLBACKS ====================
  getCallbacks() {
    console.log('🔧 DeviceHandler: Loading callbacks...');
    
    const self = this;
    
    const callbacks = {
      'device_menu': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleDeviceMenu(ctx);
      },
      
      'device_view_devices': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleViewDevices(ctx);
      },
      
      'device_buy': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleBuyDevice(ctx);
      },
      
      'device_payment': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleDevicePayment(ctx);
      },
      
      'device_my_history': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleMyHistory(ctx);
      },
      
      'device_my_sales': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleMySales(ctx);
      },
      
      'device_admin': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleAdminPanel(ctx);
      },
      
      'device_manage_marketers': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleManageMarketers(ctx);
      },
      
      'device_select_(.+)': async (ctx) => {
        const deviceId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleDeviceSelection(ctx, deviceId);
      },
      
      'device_plan_(.+)': async (ctx) => {
        const planType = ctx.match[1];
        await ctx.answerCbQuery(`📅 ${planType} plan selected`);
        await self.handlePaymentPlan(ctx, planType);
      },
      
      'device_back': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleDeviceMenu(ctx);
      },
      
      'device_confirm_(.+)_(.+)': async (ctx) => {
        const deviceId = ctx.match[1];
        const planType = ctx.match[2];
        await ctx.answerCbQuery('Processing purchase...');
        await self.handleConfirmPurchase(ctx, deviceId, planType);
      },
      
      'device_pay_select_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handlePaymentSelection(ctx, purchaseId);
      },
      
      'device_payment_down_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleDownPayment(ctx, purchaseId);
      },
      
      'device_payment_confirmed_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handlePaymentConfirmed(ctx, purchaseId);
      },
      
      'device_payment_cancel_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery('Cancelling payment...');
        await self.handleCancelPurchase(ctx, purchaseId);
      },
      
      'device_payment_regular_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleRegularPayment(ctx, purchaseId);
      },
      
      'device_payment_bank_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.showBankDetails(ctx, purchaseId);
      },
      
      'device_payment_cash_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.showCashPaymentInstructions(ctx, purchaseId);
      },
      
      'device_view_details_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.showPurchaseDetails(ctx, purchaseId);
      },
      
      'device_admin_add': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleAddDevice(ctx);
      },
      
      'device_admin_edit_(.+)': async (ctx) => {
        const deviceId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleEditDevice(ctx, deviceId);
      },
      
      'device_admin_remove_(.+)': async (ctx) => {
        const deviceId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleRemoveDevice(ctx, deviceId);
      },
      
      'device_admin_view': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleAdminViewDevices(ctx);
      },
      
      'device_admin_marketers': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleAdminViewMarketers(ctx);
      },
      
      'device_assign_marketer': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleAssignMarketer(ctx);
      },
      
      'device_admin_configure_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleConfigureDevice(ctx, purchaseId);
      },
      
      'device_admin_attach_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleAttachToProfile(ctx, purchaseId);
      },
      
      'device_admin_inventory': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleInventoryManagement(ctx);
      },
      
      'device_admin_purchases': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleViewAllPurchases(ctx);
      },
      
      'device_admin_view_purchases_(.+)': async (ctx) => {
        const filter = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleViewAllPurchases(ctx, filter);
      },
      
      'device_admin_purchase_details_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleAdminPurchaseDetails(ctx, purchaseId);
      },
      
      'device_admin_update_status_(.+)_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        const status = ctx.match[2];
        await ctx.answerCbQuery();
        await self.handleUpdatePurchaseStatus(ctx, purchaseId, status);
      },
      
      'device_admin_add_inventory': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleAddInventory(ctx);
      },
      
      'device_admin_add_inventory_(.+)': async (ctx) => {
        const deviceId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleAddInventoryForDevice(ctx, deviceId);
      },
      
      'device_admin_view_inventory': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleDetailedInventory(ctx);
      },
      
      'device_admin_user_devices': async (ctx) => {
        await ctx.answerCbQuery();
        await self.handleViewUserDevices(ctx);
      },
      
      'device_admin_user_devices_(.+)': async (ctx) => {
        const userId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleViewUserDevices(ctx, userId);
      },
      
      'device_admin_unlock_device_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleUnlockDevice(ctx, purchaseId);
      },
      
      'device_admin_lock_device_(.+)': async (ctx) => {
        const purchaseId = ctx.match[1];
        await ctx.answerCbQuery();
        await self.handleLockDevice(ctx, purchaseId);
      },
      
      'device_support': async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.reply(
          `*📞 LITEDEVICE SUPPORT*\n\n` +
          `For any issues with device purchases or payments\\:\n\n` +
          `*👤 Admin:* @opuenekeke\n` +
          `*⏰ Response Time:* 1\\-2 hours\n\n` +
          `*🔧 Common Issues:*\n` +
          `• Payment verification\n` +
          `• Device delivery status\n` +
          `• Payment schedule questions\n` +
          `• Device unlocking requests`,
          { parse_mode: 'MarkdownV2' }
        );
      }
    };
    
    console.log(`✅ Loaded ${Object.keys(callbacks).length} callbacks`);
    return callbacks;
  }

  // ==================== DEVICE VIEWING & PURCHASING ====================
  async handleBuyDevice(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = this.users[userId];
      
      if (!user) {
        await this.handleViewDevices(ctx);
        return;
      }
      
      if (user.kycStatus !== 'approved') {
        await ctx.reply(
          `*KYC VERIFICATION REQUIRED*\n\n` +
          `📝 Your account needs verification before purchasing devices\\.\n\n` +
          `*KYC Status:* ${this.escapeMarkdown(user.kycStatus || 'pending').toUpperCase()}\n` +
          `*Contact admin:* @opuenekeke`,
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }
      
      if (!user.pin) {
        await ctx.reply(
          `*TRANSACTION PIN NOT SET*\n\n` +
          `*Set PIN:* \`/setpin 1234\`\n\n` +
          `You can browse devices, but will need PIN to complete purchase\\.`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      await this.handleViewDevices(ctx);
      
    } catch (error) {
      console.error('❌ Handle buy device error:', error);
      await ctx.reply('❌ Error loading devices\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  async handleViewDevices(ctx) {
    try {
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData).filter(d => d.status === 'active');
      
      if (devices.length === 0) {
        await ctx.editMessageText(
          `*📱 AVAILABLE DEVICES*\n\n` +
          `❌ No devices available at the moment\\.\n\n` +
          `Check back later or contact admin to add devices\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Refresh', 'device_view_devices')],
              [Markup.button.callback('⬅️ Back', 'device_menu')]
            ])
          }
        );
        return;
      }
      
      let message = `*📱 AVAILABLE DEVICES*\n\n`;
      const keyboard = [];
      
      devices.forEach((device, index) => {
        const profit = device.sellingPrice - device.costPrice;
        const profitPercentage = ((profit / device.costPrice) * 100).toFixed(1);
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n`;
        message += `   💰 Price\\: ₦${this.formatCurrency(device.sellingPrice)}\n`;
        message += `   📈 Profit\\: ₦${this.formatCurrency(profit)} \\(${this.escapeMarkdown(profitPercentage)}%\\)\n`;
        message += `   📱 ID\\: ${this.escapeMarkdown(device.id)}\n\n`;
        
        keyboard.push([Markup.button.callback(
          `📱 ${device.make} ${device.model} \\- ₦${this.formatCurrency(device.sellingPrice)}`,
          `device_select_${device.id}`
        )]);
      });
      
      keyboard.push([
        Markup.button.callback('🔄 Refresh', 'device_view_devices'),
        Markup.button.callback('⬅️ Back', 'device_menu')
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      }
      
    } catch (error) {
      console.error('❌ Handle view devices error:', error);
      throw error;
    }
  }

  async handleDeviceSelection(ctx, deviceId) {
    try {
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        await ctx.answerCbQuery('❌ Device not found');
        return;
      }
      
      const profit = device.sellingPrice - device.costPrice;
      const profitPercentage = ((profit / device.costPrice) * 100).toFixed(1);
      
      let message = `*🎯 DEVICE DETAILS*\n\n`;
      message += `*${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n\n`;
      
      message += `*📊 SPECIFICATIONS*\n`;
      if (device.specs) {
        for (const [key, value] of Object.entries(device.specs)) {
          message += `• ${this.escapeMarkdown(key.charAt(0).toUpperCase() + key.slice(1))}\\: ${this.escapeMarkdown(value)}\n`;
        }
      }
      message += `\n`;
      
      message += `*💰 PRICING*\n`;
      message += `• Cost Price\\: ₦${this.formatCurrency(device.costPrice)}\n`;
      message += `• Selling Price\\: ₦${this.formatCurrency(device.sellingPrice)}\n`;
      message += `• Profit\\: ₦${this.formatCurrency(profit)} \\(${this.escapeMarkdown(profitPercentage)}%\\)\n\n`;
      
      message += `*📅 Select payment plan:*`;
      
      const userId = ctx.from.id.toString();
      const session = {
        action: 'device_buy',
        step: 1,
        data: {
          deviceId: device.id,
          deviceMake: device.make,
          deviceModel: device.model,
          devicePrice: device.sellingPrice
        }
      };
      
      this.updateSession(userId, session);
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('📅 Daily (60 days)', 'device_plan_daily'),
          Markup.button.callback('📅 Weekly (12 weeks)', 'device_plan_weekly')
        ],
        [
          Markup.button.callback('📅 Monthly (6 months)', 'device_plan_monthly')
        ],
        [
          Markup.button.callback('🛒 Browse More', 'device_view_devices'),
          Markup.button.callback('📱 Menu', 'device_menu')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle device selection error:', error);
      throw error;
    }
  }

  async handlePaymentPlan(ctx, planType) {
    try {
      const userId = ctx.from.id.toString();
      const session = this.getSession(userId);
      
      if (!session || session.action !== 'device_buy') {
        await ctx.reply('❌ No active device purchase session\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      let duration, paymentFrequency, totalPayments, planName;
      
      switch (planType) {
        case 'daily':
          duration = 60;
          paymentFrequency = 'daily';
          totalPayments = 60;
          planName = 'Daily (60 days)';
          break;
        case 'weekly':
          duration = 12;
          paymentFrequency = 'weekly';
          totalPayments = 12;
          planName = 'Weekly (12 weeks)';
          break;
        case 'monthly':
          duration = 6;
          paymentFrequency = 'monthly';
          totalPayments = 6;
          planName = 'Monthly (6 months)';
          break;
        default:
          await ctx.reply('❌ Invalid payment plan\\.', { parse_mode: 'MarkdownV2' });
          return;
      }
      
      const devicePrice = session.data.devicePrice;
      const dailyPayment = Math.ceil(devicePrice / totalPayments);
      const downPayment = Math.ceil(devicePrice * 0.3);
      
      session.data.paymentPlan = planType;
      session.data.duration = duration;
      session.data.paymentFrequency = paymentFrequency;
      session.data.totalPayments = totalPayments;
      session.data.dailyPayment = dailyPayment;
      session.data.downPayment = downPayment;
      session.step = 2;
      
      this.updateSession(userId, session);
      
      let message = `*📋 PURCHASE SUMMARY*\n\n`;
      message += `*📱 Device:* ${this.escapeMarkdown(session.data.deviceMake)} ${this.escapeMarkdown(session.data.deviceModel)}\n`;
      message += `*💰 Total Price:* ₦${this.formatCurrency(devicePrice)}\n`;
      message += `*📅 Payment Plan:* ${this.escapeMarkdown(planName)}\n`;
      message += `*⏰ Duration:* ${duration} ${this.escapeMarkdown(paymentFrequency)}s\n`;
      message += `*💵 ${paymentFrequency.charAt(0).toUpperCase() + paymentFrequency.slice(1)} Payment:* ₦${this.formatCurrency(dailyPayment)}\n`;
      message += `*💰 Down Payment:* ₦${this.formatCurrency(downPayment)}\n`;
      message += `*📊 Total Payments:* ${totalPayments}\n\n`;
      
      message += `*✅ Confirm Purchase*`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Confirm Purchase', `device_confirm_${session.data.deviceId}_${planType}`),
          Markup.button.callback('❌ Cancel', 'device_menu')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle payment plan error:', error);
      throw error;
    }
  }

  async handleConfirmPurchase(ctx, deviceId, planType) {
    try {
      const userId = ctx.from.id.toString();
      const session = this.getSession(userId);
      
      if (!session || session.action !== 'device_buy') {
        await ctx.reply('❌ No active purchase session\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        await ctx.reply('❌ Device not found\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const inventoryData = await fs.readFile(this.inventoryFile, 'utf8');
      let inventory = JSON.parse(inventoryData);
      
      const availableItem = inventory.find(item => 
        item.deviceId === deviceId && 
        item.status === 'available'
      );
      
      if (!availableItem) {
        await ctx.reply(
          `*❌ DEVICE OUT OF STOCK*\n\n` +
          `Sorry, this device is currently out of stock\\.\n` +
          `Please try another device or check back later\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }
      
      const purchaseId = `purchase_${Date.now()}_${userId}`;
      const purchaseDate = new Date();
      const nextPaymentDate = new Date();
      
      switch (planType) {
        case 'daily':
          nextPaymentDate.setDate(nextPaymentDate.getDate() + 1);
          break;
        case 'weekly':
          nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
          break;
        case 'monthly':
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
          break;
      }
      
      let duration, paymentFrequency, totalPayments, planName;
      
      switch (planType) {
        case 'daily':
          duration = 60;
          paymentFrequency = 'daily';
          totalPayments = 60;
          planName = 'Daily (60 days)';
          break;
        case 'weekly':
          duration = 12;
          paymentFrequency = 'weekly';
          totalPayments = 12;
          planName = 'Weekly (12 weeks)';
          break;
        case 'monthly':
          duration = 6;
          paymentFrequency = 'monthly';
          totalPayments = 6;
          planName = 'Monthly (6 months)';
          break;
      }
      
      const dailyPayment = Math.ceil(device.sellingPrice / totalPayments);
      const downPayment = Math.ceil(device.sellingPrice * 0.3);
      
      const purchase = {
        purchaseId,
        buyerId: userId,
        buyerName: `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim(),
        deviceId: device.id,
        make: device.make,
        model: device.model,
        costPrice: device.costPrice,
        totalPrice: device.sellingPrice,
        paymentPlan: planType,
        planName: planName,
        duration: duration,
        paymentFrequency: paymentFrequency,
        totalPayments: totalPayments,
        dailyPayment: dailyPayment,
        downPayment: downPayment,
        amountPaid: 0,
        amountDue: device.sellingPrice,
        paymentsMade: 0,
        nextPaymentAmount: dailyPayment,
        nextPaymentDate: nextPaymentDate.toISOString(),
        purchaseDate: purchaseDate.toISOString(),
        inventoryId: availableItem.inventoryId,
        imei: availableItem.imei,
        serialNumber: availableItem.serialNumber,
        status: 'pending_downpayment',
        completed: false,
        marketerId: this.users[userId]?.isMarketer ? userId : null,
        commission: this.users[userId]?.isMarketer ? device.sellingPrice * 0.1 : 0
      };
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.log('Creating new purchases file');
      }
      
      purchasesData.push(purchase);
      await fs.writeFile(this.devicePurchasesFile, JSON.stringify(purchasesData, null, 2));
      
      availableItem.status = 'reserved';
      availableItem.reservedFor = userId;
      availableItem.reservedAt = new Date().toISOString();
      await fs.writeFile(this.inventoryFile, JSON.stringify(inventory, null, 2));
      
      let imeiLocks = [];
      try {
        const locksData = await fs.readFile(this.imeiLocksFile, 'utf8');
        imeiLocks = JSON.parse(locksData);
      } catch (error) {
        console.log('Creating new IMEI locks file');
      }
      
      imeiLocks.push({
        imei: availableItem.imei,
        purchaseId: purchaseId,
        userId: userId,
        status: 'pending',
        lockedAt: new Date().toISOString(),
        unlockDate: null,
        lastUpdated: new Date().toISOString()
      });
      
      await fs.writeFile(this.imeiLocksFile, JSON.stringify(imeiLocks, null, 2));
      
      if (!this.users[userId].deviceHistory) {
        this.users[userId].deviceHistory = [];
      }
      
      this.users[userId].deviceHistory.push({
        purchaseId: purchaseId,
        deviceId: device.id,
        make: device.make,
        model: device.model,
        price: device.sellingPrice,
        purchaseDate: purchaseDate.toISOString(),
        status: 'pending_downpayment'
      });
      
      const message = `*🎉 PURCHASE CONFIRMED\\!*\n\n` +
        `*📱 Device:* ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}\n` +
        `*💰 Total Price:* ₦${this.formatCurrency(device.sellingPrice)}\n` +
        `*📅 Payment Plan:* ${this.escapeMarkdown(planName)}\n` +
        `*⏰ Duration:* ${duration} ${this.escapeMarkdown(paymentFrequency)}s\n\n` +
        
        `*💵 PAYMENT DETAILS:*\n` +
        `• Down Payment \\(30%\\)\\: ₦${this.formatCurrency(downPayment)}\n` +
        `• ${paymentFrequency.charAt(0).toUpperCase() + paymentFrequency.slice(1)} Payment\\: ₦${this.formatCurrency(dailyPayment)}\n` +
        `• Total Payments\\: ${totalPayments}\n\n` +
        
        `*🔐 DEVICE SECURITY:*\n` +
        `• IMEI\\: ${availableItem.imei}\n` +
        `• Serial\\: ${availableItem.serialNumber}\n` +
        `• Status\\: 🔒 IMEI Locked until full payment\n\n` +
        
        `*📋 NEXT STEPS:*\n` +
        `1️⃣ *Make Down Payment*\n` +
        `   • Amount\\: ₦${this.formatCurrency(downPayment)}\n` +
        `   • Account details will be sent separately\n\n` +
        
        `2️⃣ *Receive Device*\n` +
        `   • After down payment confirmation\n` +
        `   • Device will be delivered within 24\\-48 hours\n\n` +
        
        `3️⃣ *Start Payment Plan*\n` +
        `   • Make ${paymentFrequency} payments of ₦${this.formatCurrency(dailyPayment)}\n` +
        `   • Use "💳 Make Payment" in LiteDevice menu\n\n` +
        
        `*🆔 Purchase ID:* ${purchaseId}\n` +
        `*📞 For payment instructions:* @opuenekeke`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('💳 Make Down Payment', `device_payment_down_${purchaseId}`),
          Markup.button.callback('📱 View My Devices', 'device_my_history')
        ],
        [
          Markup.button.callback('🏠 Main Menu', 'start'),
          Markup.button.callback('📞 Contact Support', 'device_support')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
      this.clearSession(userId);
      
    } catch (error) {
      console.error('❌ Handle confirm purchase error:', error);
      await ctx.reply(
        `*❌ ERROR PROCESSING PURCHASE*\n\n` +
        `An error occurred while processing your purchase\\.\n` +
        `Please try again or contact support\\: @opuenekeke`,
        { parse_mode: 'MarkdownV2' }
      );
    }
  }

  // ==================== PAYMENT HANDLING ====================
  async handleDevicePayment(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(purchasesData);
      const userPurchases = purchases.filter(p => p.buyerId === userId && !p.completed);
      
      if (userPurchases.length === 0) {
        await ctx.editMessageText(
          `*💳 MAKE DEVICE PAYMENT*\n\n` +
          `❌ You don't have any active device payments\\.\n\n` +
          `Buy a device first to make payments\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🛒 Buy Device', 'device_buy')],
              [Markup.button.callback('⬅️ Back', 'device_menu')]
            ])
          }
        );
        return;
      }
      
      let message = `*💳 MAKE DEVICE PAYMENT*\n\n`;
      message += `Select a device to make payment\\:\n\n`;
      
      const keyboard = [];
      
      userPurchases.forEach((purchase, index) => {
        const status = purchase.status === 'pending_downpayment' ? '💰 Down Payment' : '📅 Regular Payment';
        const amount = purchase.status === 'pending_downpayment' ? purchase.downPayment : purchase.nextPaymentAmount;
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}*\n`;
        message += `   💰 ${status}\\: ₦${this.formatCurrency(amount)}\n`;
        message += `   📊 Paid\\: ₦${this.formatCurrency(purchase.amountPaid)}/${this.formatCurrency(purchase.totalPrice)}\n\n`;
        
        keyboard.push([Markup.button.callback(
          `📱 ${purchase.make} ${purchase.model} \\- ₦${this.formatCurrency(amount)}`,
          `device_pay_select_${purchase.purchaseId}`
        )]);
      });
      
      keyboard.push([Markup.button.callback('⬅️ Back', 'device_menu')]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ Handle device payment error:', error);
      throw error;
    }
  }

  async handlePaymentSelection(ctx, purchaseId) {
    try {
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.editMessageText('❌ Purchase not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      let paymentStatus = '';
      let paymentButton = '';
      
      if (purchase.status === 'pending_downpayment') {
        paymentStatus = `*💰 Down Payment Due:* ₦${this.formatCurrency(purchase.downPayment)}\n`;
        paymentButton = Markup.button.callback('💳 Pay Down Payment', `device_payment_down_${purchaseId}`);
      } else if (purchase.status === 'active') {
        const dueDate = new Date(purchase.nextPaymentDate).toLocaleDateString();
        paymentStatus = `*📅 Next Payment:* ₦${this.formatCurrency(purchase.nextPaymentAmount)}\n`;
        paymentStatus += `   Due\\: ${this.escapeMarkdown(dueDate)}\n`;
        paymentButton = Markup.button.callback('💳 Make Payment', `device_payment_regular_${purchaseId}`);
      } else if (purchase.status === 'completed') {
        paymentStatus = `*✅ PAID IN FULL*\n`;
        paymentStatus += `   All payments completed\\!\n`;
        paymentButton = Markup.button.callback('📱 View Details', `device_view_details_${purchaseId}`);
      }
      
      const message = `*💳 MAKE PAYMENT*\n\n` +
        `*📱 Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*💰 Total Price:* ₦${this.formatCurrency(purchase.totalPrice)}\n` +
        `*📅 Plan:* ${this.escapeMarkdown(purchase.planName)}\n` +
        `*💵 Paid:* ₦${this.formatCurrency(purchase.amountPaid)}\n` +
        `*📊 Remaining:* ₦${this.formatCurrency(purchase.amountDue)}\n\n` +
        `${paymentStatus}\n` +
        `*🔧 Select payment method:*`;
      
      const keyboard = Markup.inlineKeyboard([
        [paymentButton],
        [
          Markup.button.callback('🏦 Bank Transfer', `device_payment_bank_${purchaseId}`),
          Markup.button.callback('💵 Cash', `device_payment_cash_${purchaseId}`)
        ],
        [
          Markup.button.callback('⬅️ Back', 'device_payment'),
          Markup.button.callback('🏠 Menu', 'device_menu')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle payment selection error:', error);
      throw error;
    }
  }

  async handleDownPayment(ctx, purchaseId) {
    try {
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.editMessageText('❌ Purchase not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const message = `*💰 DOWN PAYMENT REQUIRED*\n\n` +
        `*📱 Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*💵 Amount:* ₦${this.formatCurrency(purchase.downPayment)}\n\n` +
        
        `*🏦 BANK DETAILS:*\n` +
        `• Bank\\: WEMA BANK\n` +
        `• Account Name\\: OPUE CHINEDU NEKEKE\n` +
        `• Account Number\\: 0248676801\n\n` +
        
        `*📋 After Payment:*\n` +
        `1\\. Send screenshot to @opuenekeke\n` +
        `2\\. Include Purchase ID\\: ${purchaseId}\n` +
        `3\\. Include your Telegram ID\\: ${ctx.from.id}`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ I Have Paid', `device_payment_confirmed_${purchaseId}`),
          Markup.button.callback('❌ Cancel Payment', `device_payment_cancel_${purchaseId}`)
        ],
        [
          Markup.button.callback('📞 Contact Support', 'device_support'),
          Markup.button.callback('⬅️ Back', `device_pay_select_${purchaseId}`)
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle down payment error:', error);
      throw error;
    }
  }

  async handlePaymentConfirmed(ctx, purchaseId) {
    try {
      await ctx.editMessageText(
        `*✅ PAYMENT CONFIRMATION RECEIVED*\n\n` +
        `*📞 Please contact admin for payment verification:*\n` +
        `@opuenekeke\n\n` +
        `*🆔 Purchase ID:* ${purchaseId}\n` +
        `*⏰ Processing time:* 1\\-2 hours`,
        { parse_mode: 'MarkdownV2' }
      );
      
      await ctx.answerCbQuery('✅ Payment confirmation noted. Admin will verify.');
      
    } catch (error) {
      console.error('❌ Handle payment confirmed error:', error);
      throw error;
    }
  }

  async handleRegularPayment(ctx, purchaseId) {
    try {
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.editMessageText('❌ Purchase not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const message = `*💳 REGULAR PAYMENT*\n\n` +
        `*📱 Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*💵 Amount:* ₦${this.formatCurrency(purchase.nextPaymentAmount)}\n\n` +
        
        `*🏦 BANK DETAILS:*\n` +
        `• Bank\\: WEMA BANK\n` +
        `• Account Name\\: OPUE CHINEDU NEKEKE\n` +
        `• Account Number\\: 0248676801\n\n` +
        
        `*📋 PAYMENT STEPS:*\n` +
        `1\\. Transfer ₦${this.formatCurrency(purchase.nextPaymentAmount)}\n` +
        `2\\. Send screenshot to @opuenekeke\n` +
        `3\\. Include Purchase ID\\: ${purchaseId}\n` +
        `4\\. Include your Telegram ID\\: ${ctx.from.id}`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ I Have Paid', `device_payment_confirmed_${purchaseId}`),
          Markup.button.callback('📅 View Schedule', `device_schedule_${purchaseId}`)
        ],
        [
          Markup.button.callback('⬅️ Back', `device_pay_select_${purchaseId}`),
          Markup.button.callback('🏠 Menu', 'device_menu')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle regular payment error:', error);
      throw error;
    }
  }

  async showBankDetails(ctx, purchaseId) {
    await ctx.editMessageText(
      `*🏦 BANK TRANSFER DETAILS*\n\n` +
      `*🔧 Account Details:*\n` +
      `• Bank\\: WEMA BANK\n` +
      `• Account Name\\: OPUE CHINEDU NEKEKE\n` +
      `• Account Number\\: 0248676801\n\n` +
      
      `*📝 Payment Reference:*\n` +
      `DEVICE\\_${purchaseId}\n\n` +
      
      `*✅ After Payment:*\n` +
      `Send screenshot to @opuenekeke`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  async showCashPaymentInstructions(ctx, purchaseId) {
    await ctx.editMessageText(
      `*💵 CASH PAYMENT*\n\n` +
      `For cash payments\\:\n\n` +
      `1\\. *📞 Contact Admin:* @opuenekeke\n` +
      `2\\. *🤝 Arrange Meeting*\n` +
      `3\\. *💰 Bring Cash*\n` +
      `4\\. *🧾 Get Receipt*\n\n` +
      
      `*📢 Always contact admin first\\!*`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  async showPurchaseDetails(ctx, purchaseId) {
    try {
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.editMessageText('❌ Purchase not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const progress = Math.round((purchase.amountPaid / purchase.totalPrice) * 100);
      
      const message = `*📋 PURCHASE DETAILS*\n\n` +
        `*📱 Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*🆔 Purchase ID:* ${purchase.purchaseId}\n` +
        `*💰 Total Price:* ₦${this.formatCurrency(purchase.totalPrice)}\n` +
        `*💵 Paid:* ₦${this.formatCurrency(purchase.amountPaid)}\n` +
        `*📊 Remaining:* ₦${this.formatCurrency(purchase.amountDue)}\n` +
        `*📈 Progress:* ${progress}%\n\n` +
        
        `*📅 PAYMENT PLAN:*\n` +
        `• Plan\\: ${this.escapeMarkdown(purchase.planName)}\n` +
        `• Payments Made\\: ${purchase.paymentsMade}/${purchase.totalPayments}\n` +
        `• Payments Left\\: ${purchase.totalPayments - purchase.paymentsMade}\n\n` +
        
        `*🔐 DEVICE INFO:*\n` +
        `• IMEI\\: ${purchase.imei}\n` +
        `• Serial\\: ${purchase.serialNumber}\n` +
        `• Status\\: ${purchase.status === 'completed' ? '✅ UNLOCKED' : '🔒 LOCKED'}`;
      
      await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' });
      
    } catch (error) {
      console.error('❌ Show purchase details error:', error);
      throw error;
    }
  }

  async handleCancelPurchase(ctx, purchaseId) {
    try {
      await ctx.editMessageText(
        `*❌ PAYMENT CANCELLED*\n\n` +
        `The payment process has been cancelled\\.\n\n` +
        `*⚠️ Important:*\n` +
        `• Device reservation will expire in 24 hours\n` +
        `• To restart payment, select the device again\n` +
        `• Contact @opuenekeke for any questions`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch (error) {
      console.error('❌ Handle cancel purchase error:', error);
      throw error;
    }
  }

  // ==================== USER HISTORY & SALES ====================
  async handleMyHistory(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(purchasesData);
      const userPurchases = purchases.filter(p => p.buyerId === userId);
      
      if (userPurchases.length === 0) {
        await ctx.editMessageText(
          `*📊 MY DEVICE HISTORY*\n\n` +
          `❌ You don't have any device history\\.\n\n` +
          `Buy a device to get started\\!`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🛒 Buy Device', 'device_buy')],
              [Markup.button.callback('⬅️ Back', 'device_menu')]
            ])
          }
        );
        return;
      }
      
      let message = `*📊 MY DEVICE HISTORY*\n\n`;
      
      userPurchases.forEach((purchase, index) => {
        const status = purchase.completed ? '✅ PAID' : 
                      purchase.status === 'pending_downpayment' ? '💰 DOWN PAYMENT' : 
                      purchase.status === 'active' ? '📅 ACTIVE' : '⏳ PENDING';
        const progress = Math.round((purchase.amountPaid / purchase.totalPrice) * 100);
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}*\n`;
        message += `   📱 Status\\: ${status}\n`;
        message += `   💰 Total\\: ₦${this.formatCurrency(purchase.totalPrice)}\n`;
        message += `   💵 Paid\\: ₦${this.formatCurrency(purchase.amountPaid)}\n`;
        message += `   📊 Progress\\: ${progress}%\n`;
        message += `   📅 Plan\\: ${this.escapeMarkdown(purchase.planName)}\n\n`;
      });
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('💳 Make Payment', 'device_payment'),
          Markup.button.callback('📱 View Details', `device_view_details_${userPurchases[0].purchaseId}`)
        ],
        [
          Markup.button.callback('🔄 Refresh', 'device_my_history'),
          Markup.button.callback('⬅️ Back', 'device_menu')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle my history error:', error);
      throw error;
    }
  }

  async handleMySales(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = this.users[userId];
      
      if (!user) {
        await ctx.answerCbQuery('❌ User not found');
        return;
      }
      
      const isMarketer = user.isMarketer === true;
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isMarketer && !isAdminUser) {
        await ctx.answerCbQuery('❌ Marketer or Admin access only');
        return;
      }
      
      const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(purchasesData);
      
      let marketerSales = [];
      if (isAdminUser) {
        marketerSales = purchases;
      } else {
        marketerSales = purchases.filter(p => p.marketerId === userId);
      }
      
      if (marketerSales.length === 0) {
        await ctx.editMessageText(
          `*💰 MY DEVICE SALES*\n\n` +
          `❌ You haven't sold any devices yet\\.\n\n` +
          `Start selling to earn 10% commission\\!`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 View Devices', 'device_view_devices')],
              [Markup.button.callback('⬅️ Back', 'device_menu')]
            ])
          }
        );
        return;
      }
      
      let message = `*💰 MY DEVICE SALES*\n\n`;
      let totalCommission = 0;
      let totalSales = 0;
      
      marketerSales.forEach((sale, index) => {
        const commission = sale.commission || 0;
        totalCommission += commission;
        totalSales += sale.totalPrice;
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(sale.make)} ${this.escapeMarkdown(sale.model)}*\n`;
        message += `   👤 Buyer\\: ${this.escapeMarkdown(sale.buyerId || 'Unknown')}\n`;
        message += `   💰 Price\\: ₦${this.formatCurrency(sale.totalPrice)}\n`;
        message += `   💵 Commission\\: ₦${this.formatCurrency(Math.round(commission))}\n\n`;
      });
      
      message += `*📊 SUMMARY*\n`;
      message += `Total Sales\\: ₦${this.formatCurrency(totalSales)}\n`;
      message += `Total Commission\\: ₦${this.formatCurrency(Math.round(totalCommission))}\n`;
      message += `Commission Rate\\: 10%\n\n`;
      message += `*💡 Note:* Commission is paid when device is fully paid\\.`;
      
      await ctx.editMessageText(
        message,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', 'device_my_sales')],
            [Markup.button.callback('⬅️ Back', 'device_menu')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Handle my sales error:', error);
      throw error;
    }
  }

  // ==================== ADMIN FEATURES ====================
  async handleAdminPanel(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      console.log(`👑 Admin ${userId} accessing admin panel`);
      
      let analytics = null;
      try {
        analytics = await this.getDeviceAnalytics();
      } catch (analyticsError) {
        console.error('❌ Failed to get analytics:', analyticsError);
        analytics = null;
      }
      
      let message = `*⚙️ DEVICE ADMIN PANEL*\n\n`;
      message += `*👑 Admin:* ${this.escapeMarkdown(ctx.from.first_name || 'Admin')}\n`;
      message += `*🆔 User ID:* ${userId}\n\n`;
      
      if (analytics) {
        message += `*📊 SYSTEM OVERVIEW*\n`;
        message += `📱 Device Models\\: ${analytics.devices.total || 0}\n`;
        message += `📦 Inventory Items\\: ${analytics.inventory.total || 0}\n`;
        message += `🟢 Available\\: ${analytics.inventory.available || 0}\n`;
        message += `🟡 Reserved\\: ${analytics.inventory.reserved || 0}\n`;
        message += `🔴 Sold\\: ${analytics.inventory.sold || 0}\n\n`;
        
        message += `*💰 FINANCIAL SUMMARY*\n`;
        message += `💵 Total Revenue\\: ₦${this.formatCurrency(analytics.purchases.revenue || 0)}\n`;
        message += `📈 Total Profit\\: ₦${this.formatCurrency(analytics.purchases.profit || 0)}\n`;
        message += `📊 Total Purchases\\: ${analytics.purchases.total || 0}\n`;
        message += `✅ Completed\\: ${analytics.purchases.completed || 0}\n`;
        message += `📅 Active\\: ${analytics.purchases.active || 0}\n\n`;
        
        message += `*🔐 SECURITY STATUS*\n`;
        message += `🔒 Active IMEI Locks\\: ${analytics.financing.activeLocks || 0}\n`;
        message += `💰 Locked Value\\: ₦${this.formatCurrency(analytics.financing.lockedValue || 0)}\n\n`;
        
        message += `*👥 MARKETERS*\n`;
        message += `Total Marketers\\: ${analytics.marketers.total || 0}\n`;
        message += `Active Marketers\\: ${analytics.marketers.active || 0}\n`;
        message += `Total Commission Due\\: ₦${this.formatCurrency(analytics.marketers.totalCommission || 0)}\n\n`;
      } else {
        message += `*⚠️ ANALYTICS UNAVAILABLE*\n\n`;
        message += `System analytics could not be loaded\\.\n`;
        message += `This could be due to\\:\n`;
        message += `• Data files being created\n`;
        message += `• Permission issues\n`;
        message += `• Corrupted data files\n\n`;
        message += `Try refreshing or check the logs\\.\n\n`;
      }
      
      message += `*🔧 ADMIN ACTIONS*\n`;
      message += `Use the buttons below to manage the system\\.`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Add Device', 'device_admin_add'),
          Markup.button.callback('📊 Manage Devices', 'device_admin_view')
        ],
        [
          Markup.button.callback('📦 Inventory', 'device_admin_inventory'),
          Markup.button.callback('👥 Marketers', 'device_manage_marketers')
        ],
        [
          Markup.button.callback('📋 All Purchases', 'device_admin_purchases'),
          Markup.button.callback('👤 User Devices', 'device_admin_user_devices')
        ],
        [
          Markup.button.callback('🔄 Refresh Stats', 'device_admin'),
          Markup.button.callback('⚙️ Config', 'device_admin_config')
        ],
        [
          Markup.button.callback('⬅️ Back', 'device_menu'),
          Markup.button.callback('🏠 Main Menu', 'start')
        ]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
      await ctx.answerCbQuery('✅ Admin panel loaded');
      
    } catch (error) {
      console.error('❌ Handle admin panel error:', error);
      console.error('Stack trace:', error.stack);
      
      try {
        if (ctx.callbackQuery) {
          await ctx.editMessageText(
            `*❌ ERROR LOADING ADMIN PANEL*\n\n` +
            `An error occurred while loading the admin panel\\.\n\n` +
            `*Error:* ${this.escapeMarkdown(error.message)}\n\n` +
            `*Possible solutions:*\n` +
            `1\\. Check data files exist\n` +
            `2\\. Verify file permissions\n` +
            `3\\. Restart the bot\n\n` +
            `*Contact developer for support*\n` +
            `@opuenekeke`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Try Again', 'device_admin')],
                [Markup.button.callback('⬅️ Back', 'device_menu')]
              ])
            }
          );
        } else {
          await ctx.reply(
            `❌ Error loading admin panel\\. Please try again\\.`,
            { parse_mode: 'MarkdownV2' }
          );
        }
      } catch (fallbackError) {
        console.error('❌ Fallback error handling failed:', fallbackError);
        await ctx.answerCbQuery('❌ Critical error in admin panel');
      }
    }
  }

  // ==================== NEW: VIEW ALL PURCHASES ====================
  async handleViewAllPurchases(ctx, filter = 'all') {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      let filteredPurchases = [];
      switch (filter) {
        case 'all':
          filteredPurchases = purchasesData;
          break;
        case 'active':
          filteredPurchases = purchasesData.filter(p => p.status === 'active' && !p.completed);
          break;
        case 'completed':
          filteredPurchases = purchasesData.filter(p => p.completed);
          break;
        case 'pending':
          filteredPurchases = purchasesData.filter(p => p.status === 'pending_downpayment');
          break;
        case 'overdue':
          filteredPurchases = purchasesData.filter(p => {
            if (p.completed) return false;
            const dueDate = new Date(p.nextPaymentDate);
            const today = new Date();
            return dueDate < today;
          });
          break;
        default:
          filteredPurchases = purchasesData;
      }
      
      if (filteredPurchases.length === 0) {
        await ctx.editMessageText(
          `*📋 ALL PURCHASES*\n\n` +
          `❌ No purchases found for filter: ${this.escapeMarkdown(filter)}\\.\n\n` +
          `*Available filters:*\n` +
          `• All purchases\n` +
          `• Active payments\n` +
          `• Completed payments\n` +
          `• Pending down payments\n` +
          `• Overdue payments`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Back to Admin', 'device_admin')]
            ])
          }
        );
        return;
      }
      
      let message = `*📋 ALL PURCHASES*\n\n`;
      message += `*Filter:* ${this.escapeMarkdown(filter.toUpperCase())}\n`;
      message += `*Total:* ${filteredPurchases.length} purchases\n\n`;
      
      const totalRevenue = filteredPurchases.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      const totalDue = filteredPurchases.reduce((sum, p) => sum + (p.amountDue || 0), 0);
      
      message += `*💰 Financial Summary*\n`;
      message += `• Total Paid\\: ₦${this.formatCurrency(totalRevenue)}\n`;
      message += `• Total Due\\: ₦${this.formatCurrency(totalDue)}\n`;
      message += `• Total Value\\: ₦${this.formatCurrency(totalRevenue + totalDue)}\n\n`;
      
      const displayPurchases = filteredPurchases.slice(0, 10);
      displayPurchases.forEach((purchase, index) => {
        const status = purchase.completed ? '✅ PAID' : 
                      purchase.status === 'pending_downpayment' ? '💰 DOWN PAYMENT' : 
                      purchase.status === 'active' ? '📅 ACTIVE' : '⏳ PENDING';
        const progress = Math.round((purchase.amountPaid / purchase.totalPrice) * 100);
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}*\n`;
        message += `   👤 Buyer\\: ${this.escapeMarkdown(purchase.buyerName || purchase.buyerId)}\n`;
        message += `   💰 Price\\: ₦${this.formatCurrency(purchase.totalPrice)}\n`;
        message += `   💵 Paid\\: ₦${this.formatCurrency(purchase.amountPaid)} \\(${progress}%\\)\n`;
        message += `   📱 Status\\: ${status}\n`;
        message += `   🆔 ID\\: ${purchase.purchaseId.substring(0, 15)}...\n\n`;
      });
      
      if (filteredPurchases.length > 10) {
        message += `*... and ${filteredPurchases.length - 10} more purchases*\n\n`;
      }
      
      const filterButtons = [
        [
          Markup.button.callback('📋 All', 'device_admin_view_purchases_all'),
          Markup.button.callback('📅 Active', 'device_admin_view_purchases_active')
        ],
        [
          Markup.button.callback('✅ Completed', 'device_admin_view_purchases_completed'),
          Markup.button.callback('💰 Pending', 'device_admin_view_purchases_pending')
        ],
        [
          Markup.button.callback('⚠️ Overdue', 'device_admin_view_purchases_overdue')
        ],
        [
          Markup.button.callback('📊 Export Data', 'device_admin_export_purchases'),
          Markup.button.callback('🔄 Refresh', `device_admin_view_purchases_${filter}`)
        ],
        [
          Markup.button.callback('🔙 Back to Admin', 'device_admin')
        ]
      ];
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(filterButtons)
      });
      
    } catch (error) {
      console.error('❌ Handle view all purchases error:', error);
      throw error;
    }
  }

  // ==================== NEW: VIEW PURCHASE DETAILS (ADMIN) ====================
  async handleAdminPurchaseDetails(ctx, purchaseId) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.editMessageText('❌ Purchase not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const progress = Math.round((purchase.amountPaid / purchase.totalPrice) * 100);
      const dueDate = new Date(purchase.nextPaymentDate).toLocaleDateString();
      const purchaseDate = new Date(purchase.purchaseDate).toLocaleDateString();
      
      let userDevicesData = [];
      try {
        const userDevicesFileData = await fs.readFile(this.userDevicesFile, 'utf8');
        userDevicesData = JSON.parse(userDevicesFileData);
      } catch (error) {
        console.log('Creating new user devices file');
      }
      
      const userDevice = userDevicesData.find(ud => ud.purchaseId === purchaseId);
      const isAttached = !!userDevice;
      
      const message = `*📋 PURCHASE DETAILS \\- ADMIN*\n\n` +
        `*📱 Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*🆔 Purchase ID:* ${purchase.purchaseId}\n` +
        `*👤 Buyer:* ${this.escapeMarkdown(purchase.buyerName)} \\(${purchase.buyerId}\\)\n` +
        `*📅 Purchase Date:* ${this.escapeMarkdown(purchaseDate)}\n\n` +
        
        `*💰 FINANCIAL DETAILS*\n` +
        `• Total Price\\: ₦${this.formatCurrency(purchase.totalPrice)}\n` +
        `• Cost Price\\: ₦${this.formatCurrency(purchase.costPrice)}\n` +
        `• Profit\\: ₦${this.formatCurrency(purchase.totalPrice - purchase.costPrice)}\n` +
        `• Amount Paid\\: ₦${this.formatCurrency(purchase.amountPaid)}\n` +
        `• Amount Due\\: ₦${this.formatCurrency(purchase.amountDue)}\n` +
        `• Progress\\: ${progress}%\n\n` +
        
        `*📅 PAYMENT PLAN*\n` +
        `• Plan\\: ${this.escapeMarkdown(purchase.planName)}\n` +
        `• Next Payment\\: ₦${this.formatCurrency(purchase.nextPaymentAmount)}\n` +
        `• Due Date\\: ${this.escapeMarkdown(dueDate)}\n` +
        `• Payments Made\\: ${purchase.paymentsMade}/${purchase.totalPayments}\n\n` +
        
        `*🔐 DEVICE INFO*\n` +
        `• IMEI\\: ${purchase.imei}\n` +
        `• Serial\\: ${purchase.serialNumber}\n` +
        `• Inventory ID\\: ${purchase.inventoryId}\n` +
        `• Status\\: ${purchase.status.toUpperCase()}\n` +
        `• Attached to Profile\\: ${isAttached ? '✅ YES' : '❌ NO'}\n\n` +
        
        `*👨‍💼 MARKETING*\n` +
        `• Marketer ID\\: ${purchase.marketerId || 'None'}\n` +
        `• Commission\\: ₦${this.formatCurrency(purchase.commission || 0)}`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('👤 View User Devices', `device_admin_user_devices_${purchase.buyerId}`),
          Markup.button.callback('⚙️ Configure', `device_admin_configure_${purchaseId}`)
        ],
        [
          Markup.button.callback('✅ Mark as Paid', `device_admin_update_status_${purchaseId}_completed`),
          Markup.button.callback('🔓 Unlock Device', `device_admin_unlock_device_${purchaseId}`)
        ],
        [
          Markup.button.callback('🔒 Lock Device', `device_admin_lock_device_${purchaseId}`),
          Markup.button.callback('📋 Attach to Profile', `device_admin_attach_${purchaseId}`)
        ],
        [
          Markup.button.callback('🔙 Back to Purchases', 'device_admin_purchases'),
          Markup.button.callback('🏠 Admin Panel', 'device_admin')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle admin purchase details error:', error);
      throw error;
    }
  }

  // ==================== NEW: UPDATE PURCHASE STATUS ====================
  async handleUpdatePurchaseStatus(ctx, purchaseId, status) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchaseIndex = purchasesData.findIndex(p => p.purchaseId === purchaseId);
      
      if (purchaseIndex === -1) {
        await ctx.answerCbQuery('❌ Purchase not found');
        return;
      }
      
      const purchase = purchasesData[purchaseIndex];
      
      if (status === 'completed') {
        purchasesData[purchaseIndex].status = 'completed';
        purchasesData[purchaseIndex].completed = true;
        purchasesData[purchaseIndex].amountPaid = purchase.totalPrice;
        purchasesData[purchaseIndex].amountDue = 0;
        purchasesData[purchaseIndex].paymentsMade = purchase.totalPayments;
        
        let inventoryData = await fs.readFile(this.inventoryFile, 'utf8');
        let inventory = JSON.parse(inventoryData);
        const inventoryIndex = inventory.findIndex(i => i.inventoryId === purchase.inventoryId);
        if (inventoryIndex !== -1) {
          inventory[inventoryIndex].status = 'sold';
          inventory[inventoryIndex].saleDate = new Date().toISOString();
          inventory[inventoryIndex].currentOwner = purchase.buyerId;
          await fs.writeFile(this.inventoryFile, JSON.stringify(inventory, null, 2));
        }
        
        let imeiLocksData = await fs.readFile(this.imeiLocksFile, 'utf8');
        let imeiLocks = JSON.parse(imeiLocksData);
        const lockIndex = imeiLocks.findIndex(l => l.imei === purchase.imei);
        if (lockIndex !== -1) {
          imeiLocks[lockIndex].status = 'unlocked';
          imeiLocks[lockIndex].unlockDate = new Date().toISOString();
          await fs.writeFile(this.imeiLocksFile, JSON.stringify(imeiLocks, null, 2));
        }
        
        try {
          await this.bot.telegram.sendMessage(
            purchase.buyerId,
            `*🎉 CONGRATULATIONS\\!*\n\n` +
            `Your device *${purchase.make} ${purchase.model}* has been fully paid\\!\n\n` +
            `*✅ Status:* PAID IN FULL\n` +
            `*🔓 IMEI Lock:* REMOVED\n` +
            `*📱 Device:* Now fully unlocked and yours\\!\n\n` +
            `Thank you for using LiteDevice Financing\\!`,
            { parse_mode: 'MarkdownV2' }
          );
        } catch (notifyError) {
          console.error('Failed to notify buyer:', notifyError);
        }
      } else {
        purchasesData[purchaseIndex].status = status;
      }
      
      await fs.writeFile(this.devicePurchasesFile, JSON.stringify(purchasesData, null, 2));
      
      await ctx.answerCbQuery(`✅ Purchase status updated to ${status}`);
      await this.handleAdminPurchaseDetails(ctx, purchaseId);
      
    } catch (error) {
      console.error('❌ Handle update purchase status error:', error);
      throw error;
    }
  }

  // ==================== NEW: VIEW USER DEVICES ====================
  async handleViewUserDevices(ctx, userId = null) {
    try {
      const adminId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(adminId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      if (userId) {
        await this.showUserDevices(ctx, userId);
        return;
      }
      
      let userDevicesData = [];
      try {
        const userDevicesFileData = await fs.readFile(this.userDevicesFile, 'utf8');
        userDevicesData = JSON.parse(userDevicesFileData);
      } catch (error) {
        console.log('Creating new user devices file');
      }
      
      const userDevicesMap = {};
      userDevicesData.forEach(device => {
        if (!userDevicesMap[device.userId]) {
          userDevicesMap[device.userId] = [];
        }
        userDevicesMap[device.userId].push(device);
      });
      
      if (Object.keys(userDevicesMap).length === 0) {
        await ctx.editMessageText(
          `*👤 USER DEVICE MAPPING*\n\n` +
          `❌ No user devices mapped yet\\.\n\n` +
          `*Attach devices to user profiles to enable:*\n` +
          `• Remote device management\n` +
          `• Payment tracking\n` +
          `• IMEI lock/unlock\n` +
          `• Usage statistics`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 View All Purchases', 'device_admin_purchases')],
              [Markup.button.callback('🔙 Back to Admin', 'device_admin')]
            ])
          }
        );
        return;
      }
      
      let message = `*👤 USER DEVICE MAPPING*\n\n`;
      message += `*Total Users with Devices:* ${Object.keys(userDevicesMap).length}\n\n`;
      
      Object.keys(userDevicesMap).slice(0, 10).forEach((userId, index) => {
        const user = this.users[userId] || { firstName: 'Unknown', lastName: 'User' };
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${userId.substring(0, 8)}`;
        const deviceCount = userDevicesMap[userId].length;
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(userName)}*\n`;
        message += `   🆔 ID\\: ${userId}\n`;
        message += `   📱 Devices\\: ${deviceCount}\n`;
        message += `   🔒 Active Locks\\: ${userDevicesMap[userId].filter(d => d.status === 'locked').length}\n\n`;
      });
      
      if (Object.keys(userDevicesMap).length > 10) {
        message += `*... and ${Object.keys(userDevicesMap).length - 10} more users*\n\n`;
      }
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('👤 Search User', 'device_admin_search_user'),
          Markup.button.callback('📱 All Devices', 'device_admin_all_devices')
        ],
        [
          Markup.button.callback('🔄 Refresh', 'device_admin_user_devices'),
          Markup.button.callback('🔙 Back to Admin', 'device_admin')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle view user devices error:', error);
      throw error;
    }
  }

  // ==================== NEW: SHOW USER DEVICES ====================
  async showUserDevices(ctx, userId) {
    try {
      const adminId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(adminId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let userDevicesData = [];
      try {
        const userDevicesFileData = await fs.readFile(this.userDevicesFile, 'utf8');
        userDevicesData = JSON.parse(userDevicesFileData);
      } catch (error) {
        console.log('Creating new user devices file');
      }
      
      const userDevices = userDevicesData.filter(device => device.userId === userId);
      const user = this.users[userId] || { firstName: 'Unknown', lastName: 'User' };
      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${userId.substring(0, 8)}`;
      
      if (userDevices.length === 0) {
        await ctx.editMessageText(
          `*👤 USER DEVICES*\n\n` +
          `*User:* ${this.escapeMarkdown(userName)}\n` +
          `*ID:* ${userId}\n\n` +
          `❌ No devices attached to this user's profile\\.\n\n` +
          `*Attach devices from purchase details*`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 View Purchases', 'device_admin_purchases')],
              [Markup.button.callback('🔙 Back to User List', 'device_admin_user_devices')]
            ])
          }
        );
        return;
      }
      
      let message = `*👤 USER DEVICES*\n\n`;
      message += `*User:* ${this.escapeMarkdown(userName)}\n`;
      message += `*ID:* ${userId}\n`;
      message += `*Total Devices:* ${userDevices.length}\n\n`;
      
      const totalValue = userDevices.reduce((sum, device) => sum + (device.totalPrice || 0), 0);
      const totalPaid = userDevices.reduce((sum, device) => sum + (device.amountPaid || 0), 0);
      const lockedDevices = userDevices.filter(d => d.status === 'locked').length;
      
      message += `*💰 Financial Summary*\n`;
      message += `• Total Device Value\\: ₦${this.formatCurrency(totalValue)}\n`;
      message += `• Total Paid\\: ₦${this.formatCurrency(totalPaid)}\n`;
      message += `• Active Locks\\: ${lockedDevices}\n\n`;
      
      userDevices.forEach((device, index) => {
        const progress = device.totalPrice ? Math.round((device.amountPaid / device.totalPrice) * 100) : 0;
        const status = device.status === 'locked' ? '🔒 LOCKED' : '🔓 UNLOCKED';
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n`;
        message += `   📱 IMEI\\: ${device.imei}\n`;
        message += `   💰 Value\\: ₦${this.formatCurrency(device.totalPrice || 0)}\n`;
        message += `   💵 Paid\\: ₦${this.formatCurrency(device.amountPaid || 0)} \\(${progress}%\\)\n`;
        message += `   🔐 Status\\: ${status}\n\n`;
      });
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🔓 Unlock All', `device_admin_unlock_all_${userId}`),
          Markup.button.callback('🔒 Lock All', `device_admin_lock_all_${userId}`)
        ],
        [
          Markup.button.callback('📋 User Details', `device_admin_user_info_${userId}`),
          Markup.button.callback('💳 Payment History', `device_admin_payments_${userId}`)
        ],
        [
          Markup.button.callback('🔙 Back to User List', 'device_admin_user_devices'),
          Markup.button.callback('🏠 Admin Panel', 'device_admin')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Show user devices error:', error);
      throw error;
    }
  }

  // ==================== NEW: DEVICE LOCK/UNLOCK ====================
  async handleLockDevice(ctx, purchaseId) {
    try {
      const adminId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(adminId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.answerCbQuery('❌ Purchase not found');
        return;
      }
      
      let imeiLocksData = await fs.readFile(this.imeiLocksFile, 'utf8');
      let imeiLocks = JSON.parse(imeiLocksData);
      const lockIndex = imeiLocks.findIndex(l => l.imei === purchase.imei);
      
      if (lockIndex !== -1) {
        imeiLocks[lockIndex].status = 'locked';
        imeiLocks[lockIndex].lastUpdated = new Date().toISOString();
        await fs.writeFile(this.imeiLocksFile, JSON.stringify(imeiLocks, null, 2));
      }
      
      let userDevicesData = [];
      try {
        const userDevicesFileData = await fs.readFile(this.userDevicesFile, 'utf8');
        userDevicesData = JSON.parse(userDevicesFileData);
      } catch (error) {
        console.log('Creating new user devices file');
      }
      
      const deviceIndex = userDevicesData.findIndex(d => d.purchaseId === purchaseId);
      if (deviceIndex !== -1) {
        userDevicesData[deviceIndex].status = 'locked';
        userDevicesData[deviceIndex].lastUpdated = new Date().toISOString();
        await fs.writeFile(this.userDevicesFile, JSON.stringify(userDevicesData, null, 2));
      }
      
      try {
        await this.bot.telegram.sendMessage(
          purchase.buyerId,
          `*⚠️ DEVICE LOCKED*\n\n` +
          `Your device *${purchase.make} ${purchase.model}* has been locked\\.\n\n` +
          `*🔒 IMEI:* ${purchase.imei}\n` +
          `*📱 Status:* LOCKED\n` +
          `*💡 Reason:* Admin action\n\n` +
          `Contact admin @opuenekeke for more information\\.`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (notifyError) {
        console.error('Failed to notify user:', notifyError);
      }
      
      await ctx.answerCbQuery('✅ Device locked successfully');
      await this.handleAdminPurchaseDetails(ctx, purchaseId);
      
    } catch (error) {
      console.error('❌ Handle lock device error:', error);
      throw error;
    }
  }

  async handleUnlockDevice(ctx, purchaseId) {
    try {
      const adminId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(adminId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.answerCbQuery('❌ Purchase not found');
        return;
      }
      
      let imeiLocksData = await fs.readFile(this.imeiLocksFile, 'utf8');
      let imeiLocks = JSON.parse(imeiLocksData);
      const lockIndex = imeiLocks.findIndex(l => l.imei === purchase.imei);
      
      if (lockIndex !== -1) {
        imeiLocks[lockIndex].status = 'unlocked';
        imeiLocks[lockIndex].unlockDate = new Date().toISOString();
        imeiLocks[lockIndex].lastUpdated = new Date().toISOString();
        await fs.writeFile(this.imeiLocksFile, JSON.stringify(imeiLocks, null, 2));
      }
      
      let userDevicesData = [];
      try {
        const userDevicesFileData = await fs.readFile(this.userDevicesFile, 'utf8');
        userDevicesData = JSON.parse(userDevicesFileData);
      } catch (error) {
        console.log('Creating new user devices file');
      }
      
      const deviceIndex = userDevicesData.findIndex(d => d.purchaseId === purchaseId);
      if (deviceIndex !== -1) {
        userDevicesData[deviceIndex].status = 'unlocked';
        userDevicesData[deviceIndex].lastUpdated = new Date().toISOString();
        await fs.writeFile(this.userDevicesFile, JSON.stringify(userDevicesData, null, 2));
      }
      
      try {
        await this.bot.telegram.sendMessage(
          purchase.buyerId,
          `*✅ DEVICE UNLOCKED*\n\n` +
          `Your device *${purchase.make} ${purchase.model}* has been unlocked\\.\n\n` +
          `*🔓 IMEI:* ${purchase.imei}\n` +
          `*📱 Status:* UNLOCKED\n` +
          `*🎉 Enjoy your device\\!*\n\n` +
          `Thank you for using LiteDevice Financing\\.`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (notifyError) {
        console.error('Failed to notify user:', notifyError);
      }
      
      await ctx.answerCbQuery('✅ Device unlocked successfully');
      await this.handleAdminPurchaseDetails(ctx, purchaseId);
      
    } catch (error) {
      console.error('❌ Handle unlock device error:', error);
      throw error;
    }
  }

  // ==================== ANALYTICS ====================
  async getDeviceAnalytics() {
    try {
      console.log('📊 Getting device analytics...');
      
      let devices = [];
      try {
        const devicesData = await fs.readFile(this.devicesFile, 'utf8');
        devices = JSON.parse(devicesData);
        console.log(`✅ Loaded ${devices.length} devices`);
      } catch (error) {
        console.error('❌ Error reading devices file:', error);
        devices = [];
      }
      
      let inventory = [];
      try {
        const inventoryData = await fs.readFile(this.inventoryFile, 'utf8');
        inventory = JSON.parse(inventoryData);
        console.log(`✅ Loaded ${inventory.length} inventory items`);
      } catch (error) {
        console.error('❌ Error reading inventory file:', error);
        inventory = [];
      }
      
      let purchases = [];
      try {
        const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchases = JSON.parse(purchasesData);
        console.log(`✅ Loaded ${purchases.length} purchases`);
      } catch (error) {
        console.error('❌ Error reading purchases file:', error);
        purchases = [];
      }
      
      let locks = [];
      try {
        const locksData = await fs.readFile(this.imeiLocksFile, 'utf8');
        locks = JSON.parse(locksData);
        console.log(`✅ Loaded ${locks.length} IMEI locks`);
      } catch (error) {
        console.error('❌ Error reading IMEI locks file:', error);
        locks = [];
      }
      
      let marketers = [];
      try {
        const marketersData = await fs.readFile(this.marketersFile, 'utf8');
        marketers = JSON.parse(marketersData);
        console.log(`✅ Loaded ${marketers.length} marketers`);
      } catch (error) {
        console.error('❌ Error reading marketers file:', error);
        marketers = [];
      }
      
      let userDevices = [];
      try {
        const userDevicesData = await fs.readFile(this.userDevicesFile, 'utf8');
        userDevices = JSON.parse(userDevicesData);
        console.log(`✅ Loaded ${userDevices.length} user devices`);
      } catch (error) {
        console.error('❌ Error reading user devices file:', error);
        userDevices = [];
      }
      
      const activePurchases = purchases.filter(p => !p.completed);
      const completedPurchases = purchases.filter(p => p.completed);
      
      const totalRevenue = purchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
      const totalCost = purchases.reduce((sum, p) => sum + (p.costPrice || 0), 0);
      const totalProfit = totalRevenue - totalCost;
      
      const totalCommission = marketers.reduce((sum, m) => sum + (m.totalCommission || 0), 0);
      
      const activeLocks = locks.filter(l => l.status === 'active' || l.status === 'locked').length;
      
      const inventoryStats = {
        total: inventory.length,
        available: inventory.filter(i => i.status === 'available').length,
        reserved: inventory.filter(i => i.status === 'reserved').length,
        sold: inventory.filter(i => i.status === 'sold').length
      };
      
      const categoryStats = {};
      devices.forEach(device => {
        const category = device.category || 'uncategorized';
        if (!categoryStats[category]) {
          categoryStats[category] = 0;
        }
        categoryStats[category]++;
      });
      
      const result = {
        devices: {
          total: devices.length,
          active: devices.filter(d => d.status === 'active').length,
          byCategory: categoryStats
        },
        inventory: inventoryStats,
        purchases: {
          total: purchases.length,
          active: activePurchases.length,
          completed: completedPurchases.length,
          revenue: totalRevenue,
          cost: totalCost,
          profit: totalProfit
        },
        financing: {
          activeLocks,
          lockedValue: activePurchases.reduce((sum, p) => sum + (p.amountDue || 0), 0)
        },
        marketers: {
          total: marketers.length,
          totalCommission,
          active: marketers.filter(m => m.status === 'active').length
        },
        userMapping: {
          totalUsers: new Set(userDevices.map(ud => ud.userId)).size,
          totalDevices: userDevices.length,
          lockedDevices: userDevices.filter(ud => ud.status === 'locked').length
        }
      };
      
      console.log('📊 Analytics result:', {
        devices: result.devices.total,
        inventory: result.inventory.total,
        purchases: result.purchases.total,
        revenue: result.purchases.revenue,
        profit: result.purchases.profit,
        userMapping: result.userMapping.totalUsers
      });
      
      return result;
      
    } catch (error) {
      console.error('❌ Error getting device analytics:', error);
      console.error('Stack trace:', error.stack);
      
      return {
        devices: { total: 0, active: 0, byCategory: {} },
        inventory: { total: 0, available: 0, reserved: 0, sold: 0 },
        purchases: { total: 0, active: 0, completed: 0, revenue: 0, cost: 0, profit: 0 },
        financing: { activeLocks: 0, lockedValue: 0 },
        marketers: { total: 0, totalCommission: 0, active: 0 },
        userMapping: { totalUsers: 0, totalDevices: 0, lockedDevices: 0 }
      };
    }
  }

  // ==================== DEVICE ATTACHMENT TO USER PROFILE ====================
  async handleAttachToProfile(ctx, purchaseId) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.editMessageText('❌ Purchase not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const buyer = this.users[purchase.buyerId];
      if (!buyer) {
        await ctx.editMessageText(
          `*❌ USER NOT FOUND*\n\n` +
          `Buyer with ID ${purchase.buyerId} not found in system\\.\n` +
          `Ask user to start the bot first\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }
      
      let userDevicesData = [];
      try {
        const userDevicesFileData = await fs.readFile(this.userDevicesFile, 'utf8');
        userDevicesData = JSON.parse(userDevicesFileData);
      } catch (error) {
        console.log('Creating new user devices file');
      }
      
      const existingDevice = userDevicesData.find(ud => ud.purchaseId === purchaseId);
      if (existingDevice) {
        await ctx.editMessageText(
          `*⚠️ DEVICE ALREADY ATTACHED*\n\n` +
          `This device is already attached to the user's profile\\.\n\n` +
          `*User:* ${this.escapeMarkdown(purchase.buyerName)}\n` +
          `*Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
          `*Attached:* ${new Date(existingDevice.attachedAt).toLocaleDateString()}`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('👤 View User Devices', `device_admin_user_devices_${purchase.buyerId}`)],
              [Markup.button.callback('🔙 Back', `device_admin_purchase_details_${purchaseId}`)]
            ])
          }
        );
        return;
      }
      
      const deviceAttachment = {
        purchaseId: purchaseId,
        userId: purchase.buyerId,
        userName: purchase.buyerName,
        deviceId: purchase.deviceId,
        make: purchase.make,
        model: purchase.model,
        imei: purchase.imei,
        serialNumber: purchase.serialNumber,
        totalPrice: purchase.totalPrice,
        amountPaid: purchase.amountPaid,
        amountDue: purchase.amountDue,
        status: purchase.completed ? 'unlocked' : 'locked',
        purchaseDate: purchase.purchaseDate,
        attachedAt: new Date().toISOString(),
        attachedBy: userId,
        lastPaymentDate: purchase.purchaseDate,
        features: {
          remoteLock: true,
          paymentTracking: true,
          notifications: true,
          autoBlacklist: !purchase.completed
        }
      };
      
      userDevicesData.push(deviceAttachment);
      await fs.writeFile(this.userDevicesFile, JSON.stringify(userDevicesData, null, 2));
      
      if (!buyer.attachedDevices) {
        buyer.attachedDevices = [];
      }
      
      buyer.attachedDevices.push({
        purchaseId: purchaseId,
        deviceId: purchase.deviceId,
        make: purchase.make,
        model: purchase.model,
        imei: purchase.imei,
        attachedAt: new Date().toISOString(),
        status: 'attached'
      });
      
      await ctx.editMessageText(
        `*✅ DEVICE ATTACHED TO PROFILE*\n\n` +
        `*Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*User:* ${this.escapeMarkdown(purchase.buyerName)} \\(${purchase.buyerId}\\)\n` +
        `*IMEI:* ${purchase.imei}\n` +
        `*Serial:* ${purchase.serialNumber}\n\n` +
        
        `*✅ Features Enabled:*\n` +
        `• Remote device lock/unlock\n` +
        `• Payment tracking\n` +
        `• Automatic blacklisting on default\n` +
        `• Notification system\n\n` +
        
        `*📱 Device is now fully integrated with user profile\\!*`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('👤 View User Devices', `device_admin_user_devices_${purchase.buyerId}`)],
            [Markup.button.callback('🔙 Back to Purchase', `device_admin_purchase_details_${purchaseId}`)]
          ])
        }
      );
      
      try {
        await this.bot.telegram.sendMessage(
          purchase.buyerId,
          `*📱 DEVICE CONFIGURATION COMPLETE*\n\n` +
          `Your device *${purchase.make} ${purchase.model}* has been configured and attached to your profile\\.\n\n` +
          `*✅ Features Enabled:*\n` +
          `• Remote management\n` +
          `• Payment tracking\n` +
          `• Security monitoring\n\n` +
          `*🔐 IMEI:* ${purchase.imei}\n` +
          `*🆔 Purchase ID:* ${purchaseId}\n\n` +
          `Your device is now ready for use\\!`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (notifyError) {
        console.error('❌ Failed to notify buyer:', notifyError);
      }
      
    } catch (error) {
      console.error('❌ Handle attach to profile error:', error);
      throw error;
    }
  }

  // ==================== OTHER ADMIN METHODS ====================
  async handleAddDevice(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const session = {
        action: 'add_device',
        step: 1,
        data: {}
      };
      
      this.updateSession(userId, session);
      
      await ctx.editMessageText(
        `*➕ ADD NEW DEVICE*\n\n` +
        `*Step 1/6: Enter Device Make*\n` +
        `Example: Samsung, Tecno, Infinix\n\n` +
        `Type the device make\\:`,
        { parse_mode: 'MarkdownV2' }
      );
      
    } catch (error) {
      console.error('❌ Handle add device error:', error);
      throw error;
    }
  }

  async handleAdminViewDevices(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      
      if (devices.length === 0) {
        await ctx.editMessageText(
          `*📊 MANAGE DEVICES*\n\n` +
          `❌ No devices found\\.\n\n` +
          `Add devices to get started\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Add Device', 'device_admin_add')],
              [Markup.button.callback('⬅️ Back', 'device_admin')]
            ])
          }
        );
        return;
      }
      
      let message = `*📊 MANAGE DEVICES*\n\n`;
      const keyboard = [];
      
      devices.forEach((device, index) => {
        const status = device.status === 'active' ? '🟢 Active' : '🔴 Inactive';
        message += `*${index + 1}\\. ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n`;
        message += `   📱 ID\\: ${this.escapeMarkdown(device.id)}\n`;
        message += `   💰 Price\\: ₦${this.formatCurrency(device.sellingPrice)}\n`;
        message += `   📊 Status\\: ${status}\n\n`;
        
        keyboard.push([
          Markup.button.callback(`✏️ Edit ${device.make}`, `device_admin_edit_${device.id}`),
          Markup.button.callback(`🗑️ Remove ${device.make}`, `device_admin_remove_${device.id}`)
        ]);
      });
      
      keyboard.push([
        Markup.button.callback('➕ Add New Device', 'device_admin_add'),
        Markup.button.callback('🔄 Refresh', 'device_admin_view')
      ]);
      
      keyboard.push([
        Markup.button.callback('⬅️ Back', 'device_admin')
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ Handle admin view devices error:', error);
      throw error;
    }
  }

  async handleEditDevice(ctx, deviceId) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        await ctx.answerCbQuery('❌ Device not found');
        return;
      }
      
      const session = {
        action: 'edit_device',
        step: 1,
        data: { deviceId: device.id }
      };
      
      this.updateSession(userId, session);
      
      let message = `*✏️ EDIT DEVICE*\n\n`;
      message += `*Device:* ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}\n`;
      message += `*ID:* ${device.id}\n\n`;
      
      message += `*Current Details:*\n`;
      message += `• Make\\: ${this.escapeMarkdown(device.make)}\n`;
      message += `• Model\\: ${this.escapeMarkdown(device.model)}\n`;
      message += `• Cost Price\\: ₦${this.formatCurrency(device.costPrice)}\n`;
      message += `• Selling Price\\: ₦${this.formatCurrency(device.sellingPrice)}\n`;
      message += `• Category\\: ${this.escapeMarkdown(device.category)}\n`;
      message += `• Status\\: ${device.status}\n\n`;
      
      message += `*What would you like to edit?*\n`;
      message += `Type the field name \\(make, model, cost, selling, category, status\\)\\:`;
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel Edit', 'device_admin_view')]
        ])
      });
      
    } catch (error) {
      console.error('❌ Handle edit device error:', error);
      throw error;
    }
  }

  async handleRemoveDevice(ctx, deviceId) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      let devices = JSON.parse(devicesData);
      const deviceIndex = devices.findIndex(d => d.id === deviceId);
      
      if (deviceIndex === -1) {
        await ctx.answerCbQuery('❌ Device not found');
        return;
      }
      
      const device = devices[deviceIndex];
      
      const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(purchasesData);
      const activePurchases = purchases.filter(p => p.deviceId === deviceId && !p.completed);
      
      if (activePurchases.length > 0) {
        await ctx.editMessageText(
          `*❌ CANNOT REMOVE DEVICE*\n\n` +
          `*${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n\n` +
          `This device has ${activePurchases.length} active purchase\\(s\\)\\.\n` +
          `You must complete or cancel all purchases before removing\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 View Purchases', `device_admin_view_purchases_device_${deviceId}`)],
              [Markup.button.callback('⬅️ Back', 'device_admin_view')]
            ])
          }
        );
        return;
      }
      
      devices.splice(deviceIndex, 1);
      await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
      
      await ctx.editMessageText(
        `*✅ DEVICE REMOVED*\n\n` +
        `*${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n\n` +
        `has been successfully removed from the system\\.`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Manage Devices', 'device_admin_view')],
            [Markup.button.callback('⬅️ Back', 'device_admin')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Handle remove device error:', error);
      throw error;
    }
  }

  async handleInventoryManagement(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const inventoryData = await fs.readFile(this.inventoryFile, 'utf8');
      const inventory = JSON.parse(inventoryData);
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      
      let message = `*📦 INVENTORY MANAGEMENT*\n\n`;
      
      const deviceInventory = {};
      inventory.forEach(item => {
        if (!deviceInventory[item.deviceId]) {
          deviceInventory[item.deviceId] = {
            total: 0,
            available: 0,
            reserved: 0,
            sold: 0
          };
        }
        deviceInventory[item.deviceId][item.status]++;
        deviceInventory[item.deviceId].total++;
      });
      
      devices.forEach(device => {
        const stats = deviceInventory[device.id] || { total: 0, available: 0, reserved: 0, sold: 0 };
        message += `*${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n`;
        message += `   📦 Total\\: ${stats.total}\n`;
        message += `   🟢 Available\\: ${stats.available}\n`;
        message += `   🟡 Reserved\\: ${stats.reserved}\n`;
        message += `   🔴 Sold\\: ${stats.sold}\n\n`;
      });
      
      message += `*🔧 Actions:*\n`;
      message += `• Add inventory items for specific devices\n`;
      message += `• View detailed inventory\n`;
      message += `• Manage reserved devices`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Add Inventory', 'device_admin_add_inventory'),
          Markup.button.callback('📋 View Details', 'device_admin_view_inventory')
        ],
        [
          Markup.button.callback('🔄 Refresh', 'device_admin_inventory'),
          Markup.button.callback('⬅️ Back', 'device_admin')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle inventory management error:', error);
      throw error;
    }
  }

  async handleManageMarketers(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const marketersData = await fs.readFile(this.marketersFile, 'utf8');
      const marketers = JSON.parse(marketersData);
      
      if (marketers.length === 0) {
        await ctx.editMessageText(
          `*👥 MANAGE MARKETERS*\n\n` +
          `❌ No marketers assigned yet\\.\n\n` +
          `Assign users as marketers to give them access to sales features\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Assign Marketer', 'device_assign_marketer')],
              [Markup.button.callback('⬅️ Back', 'device_admin')]
            ])
          }
        );
        return;
      }
      
      let message = `*👥 MANAGE MARKETERS*\n\n`;
      
      marketers.forEach((marketer, index) => {
        const status = marketer.status === 'active' ? '🟢 Active' : '🔴 Inactive';
        message += `*${index + 1}\\. ${this.escapeMarkdown(marketer.name)}*\n`;
        message += `   🆔 ID\\: ${this.escapeMarkdown(marketer.id)}\n`;
        message += `   📧 Email\\: ${this.escapeMarkdown(marketer.email)}\n`;
        message += `   💰 Total Sales\\: ₦${this.formatCurrency(marketer.totalSales)}\n`;
        message += `   💸 Commission\\: ₦${this.formatCurrency(marketer.totalCommission)}\n`;
        message += `   📊 Status\\: ${status}\n\n`;
      });
      
      message += `*📊 Total Marketers:* ${marketers.length}\n`;
      message += `*💰 Total Commission Due:* ₦${marketers.reduce((sum, m) => sum + m.totalCommission, 0)}\n\n`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Assign New Marketer', 'device_assign_marketer')],
        [Markup.button.callback('📊 View Performance', 'device_admin_marketers')],
        [
          Markup.button.callback('🔄 Refresh', 'device_manage_marketers'),
          Markup.button.callback('⬅️ Back', 'device_admin')
        ]
      ]);
      
      await ctx.editMessageText(
        message,
        {
          parse_mode: 'MarkdownV2',
          ...keyboard
        }
      );
      
    } catch (error) {
      console.error('❌ Handle manage marketers error:', error);
      throw error;
    }
  }

  async handleAssignMarketer(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const session = {
        action: 'assign_marketer',
        step: 1,
        data: {}
      };
      
      this.updateSession(userId, session);
      
      await ctx.editMessageText(
        `*➕ ASSIGN MARKETER*\n\n` +
        `Enter the Telegram ID of the user to assign as marketer\\:\n\n` +
        `*Instructions:*\n` +
        `1\\. Ask the user for their Telegram ID\n` +
        `2\\. They can get it by sending /id command\n` +
        `3\\. Enter the ID below\n\n` +
        `*Example:* 1234567890\n\n` +
        `Type the Telegram ID\\:`,
        { parse_mode: 'MarkdownV2' }
      );
      
    } catch (error) {
      console.error('❌ Handle assign marketer error:', error);
      throw error;
    }
  }

  async handleAdminViewMarketers(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const marketersData = await fs.readFile(this.marketersFile, 'utf8');
      const marketers = JSON.parse(marketersData);
      
      let message = `*📊 MARKETER PERFORMANCE*\n\n`;
      
      marketers.forEach((marketer, index) => {
        const performance = Math.round((marketer.currentMonthSales / marketer.performance.monthlyTarget) * 100);
        message += `*${index + 1}\\. ${this.escapeMarkdown(marketer.name)}*\n`;
        message += `   📅 Month\\: ₦${this.formatCurrency(marketer.performance.currentMonthSales)}/${this.formatCurrency(marketer.performance.monthlyTarget)} \\(${performance}%\\)\n`;
        message += `   📈 Conversion\\: ${marketer.performance.conversionRate}%\n`;
        message += `   👥 Clients\\: ${marketer.assignedClients.length}\n`;
        message += `   💰 Commission Due\\: ₦${this.formatCurrency(marketer.totalCommission)}\n\n`;
      });
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Refresh', 'device_admin_marketers')],
          [Markup.button.callback('⬅️ Back', 'device_manage_marketers')]
        ])
      ]);
      
    } catch (error) {
      console.error('❌ Handle admin view marketers error:', error);
      throw error;
    }
  }

  async handleConfigureDevice(ctx, purchaseId) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let purchasesData = [];
      try {
        const purchasesFileData = await fs.readFile(this.devicePurchasesFile, 'utf8');
        purchasesData = JSON.parse(purchasesFileData);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
      
      const purchase = purchasesData.find(p => p.purchaseId === purchaseId);
      
      if (!purchase) {
        await ctx.editMessageText('❌ Purchase not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const session = {
        action: 'configure_device',
        step: 1,
        data: { purchaseId: purchaseId }
      };
      
      this.updateSession(userId, session);
      
      let message = `*⚙️ CONFIGURE DEVICE*\n\n`;
      message += `*Device:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n`;
      message += `*Buyer:* ${this.escapeMarkdown(purchase.buyerName)} \\(${purchase.buyerId}\\)\n`;
      message += `*IMEI:* ${purchase.imei}\n`;
      message += `*Serial:* ${purchase.serialNumber}\n\n`;
      
      message += `*Configuration Options:*\n`;
      message += `1\\. *Set Device Status*\n`;
      message += `   • Active\n`;
      message += `   • Locked\n`;
      message += `   • Unlocked\n\n`;
      
      message += `2\\. *Configure Payment Plan*\n`;
      message += `   • Update payment amounts\n`;
      message += `   • Extend duration\n`;
      message += `   • Mark as paid\n\n`;
      
      message += `3\\. *Attach to User Profile*\n`;
      message += `   • Link device to buyer's profile\n`;
      message += `   • Enable remote management\n\n`;
      
      message += `*Select an option:*`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('📱 Set Status', `device_admin_status_${purchaseId}`),
          Markup.button.callback('💰 Payment Plan', `device_admin_payment_${purchaseId}`)
        ],
        [
          Markup.button.callback('👤 Attach to Profile', `device_admin_attach_${purchaseId}`)
        ],
        [
          Markup.button.callback('⬅️ Back', 'device_admin')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle configure device error:', error);
      throw error;
    }
  }

  // ==================== TEXT MESSAGE HANDLING ====================
  async handleTextMessage(ctx, text, userSession) {
    try {
      const userId = ctx.from.id.toString();
      console.log(`📱 DeviceHandler: Processing text "${text}"`);
      
      const session = this.getSession(userId);
      const isAdminUser = this.isUserAdmin(userId);
      
      if (isAdminUser) {
        if (await this.handleAdminText(ctx, text, session)) {
          return true;
        }
      }
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      
      const device = devices.find(d => d.id === text);
      if (device) {
        await this.handleDeviceSelection(ctx, device.id);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Text message handler error:', error);
      return false;
    }
  }

  async handleAdminText(ctx, text, session) {
    const userId = ctx.from.id.toString();
    
    if (!session) return false;
    
    if (session.action === 'add_device') {
      return await this.handleAddDeviceFlow(ctx, text, session);
    }
    
    if (session.action === 'edit_device') {
      return await this.handleEditDeviceFlow(ctx, text, session);
    }
    
    if (session.action === 'assign_marketer') {
      return await this.handleAssignMarketerFlow(ctx, text, session);
    }
    
    if (session.action === 'configure_device') {
      return await this.handleConfigureDeviceFlow(ctx, text, session);
    }
    
    return false;
  }

  async handleAddDeviceFlow(ctx, text, session) {
    try {
      const step = session.step;
      
      switch (step) {
        case 1:
          session.data.make = text;
          session.step = 2;
          this.updateSession(ctx.from.id.toString(), session);
          
          await ctx.reply(
            `*Step 2/6: Enter Device Model*\n` +
            `Example: Galaxy S23, Camon 19, Hot 12\n\n` +
            `Type the device model\\:`,
            { parse_mode: 'MarkdownV2' }
          );
          return true;
          
        case 2:
          session.data.model = text;
          session.step = 3;
          this.updateSession(ctx.from.id.toString(), session);
          
          await ctx.reply(
            `*Step 3/6: Enter Cost Price*\n` +
            `Example: 100000\n\n` +
            `Type the cost price \\(in Naira\\)\\:`,
            { parse_mode: 'MarkdownV2' }
          );
          return true;
          
        case 3:
          const costPrice = parseInt(text);
          if (isNaN(costPrice) || costPrice <= 0) {
            await ctx.reply('❌ Invalid price\\. Please enter a valid number\\.', { parse_mode: 'MarkdownV2' });
            return true;
          }
          session.data.costPrice = costPrice;
          session.step = 4;
          this.updateSession(ctx.from.id.toString(), session);
          
          await ctx.reply(
            `*Step 4/6: Enter Selling Price*\n` +
            `Example: 130000\n\n` +
            `Type the selling price \\(in Naira\\)\\:`,
            { parse_mode: 'MarkdownV2' }
          );
          return true;
          
        case 4:
          const sellingPrice = parseInt(text);
          if (isNaN(sellingPrice) || sellingPrice <= 0) {
            await ctx.reply('❌ Invalid price\\. Please enter a valid number\\.', { parse_mode: 'MarkdownV2' });
            return true;
          }
          session.data.sellingPrice = sellingPrice;
          session.step = 5;
          this.updateSession(ctx.from.id.toString(), session);
          
          await ctx.reply(
            `*Step 5/6: Enter Category*\n` +
            `Options: budget, mid\\-range, premium, flagship\n\n` +
            `Type the device category\\:`,
            { parse_mode: 'MarkdownV2' }
          );
          return true;
          
        case 5:
          session.data.category = text;
          session.step = 6;
          this.updateSession(ctx.from.id.toString(), session);
          
          await ctx.reply(
            `*Step 6/6: Enter Key Specifications*\n` +
            `Format: key\\:value, separated by commas\n` +
            `Example: display\\:6\\.8\\" AMOLED, camera\\:64MP, battery\\:5000mAh\n\n` +
            `Type the specifications\\:`,
            { parse_mode: 'MarkdownV2' }
          );
          return true;
          
        case 6:
          const specs = {};
          const specPairs = text.split(',');
          specPairs.forEach(pair => {
            const [key, value] = pair.split(':').map(s => s.trim());
            if (key && value) {
              specs[key.toLowerCase()] = value;
            }
          });
          
          session.data.specs = specs;
          
          const deviceId = `${session.data.make.toLowerCase()}_${session.data.model.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString().slice(-6)}`;
          
          const device = {
            id: deviceId,
            make: session.data.make,
            model: session.data.model,
            category: session.data.category,
            costPrice: session.data.costPrice,
            sellingPrice: session.data.sellingPrice,
            specs: session.data.specs,
            status: 'active',
            addedAt: new Date().toISOString(),
            addedBy: ctx.from.id.toString()
          };
          
          const devicesData = await fs.readFile(this.devicesFile, 'utf8');
          const devices = JSON.parse(devicesData);
          devices.push(device);
          await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
          
          this.clearSession(ctx.from.id.toString());
          
          await ctx.reply(
            `*✅ DEVICE ADDED SUCCESSFULLY\\!*\n\n` +
            `*${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n\n` +
            `*Details:*\n` +
            `• ID\\: ${device.id}\n` +
            `• Category\\: ${this.escapeMarkdown(device.category)}\n` +
            `• Cost Price\\: ₦${this.formatCurrency(device.costPrice)}\n` +
            `• Selling Price\\: ₦${this.formatCurrency(device.sellingPrice)}\n` +
            `• Profit\\: ₦${this.formatCurrency(device.sellingPrice - device.costPrice)}\n\n` +
            `The device is now available for purchase\\!`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Inventory', `device_admin_add_inventory_${device.id}`)],
                [Markup.button.callback('📊 Manage Devices', 'device_admin_view')]
              ])
            }
          );
          return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Add device flow error:', error);
      await ctx.reply('❌ Error adding device\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      this.clearSession(ctx.from.id.toString());
      return true;
    }
  }

  async handleEditDeviceFlow(ctx, text, session) {
    try {
      const field = text.toLowerCase();
      const validFields = ['make', 'model', 'cost', 'selling', 'category', 'status'];
      
      if (!validFields.includes(field)) {
        await ctx.reply(
          `❌ Invalid field\\.\n\n` +
          `Valid fields: make, model, cost, selling, category, status\n\n` +
          `Type one of the field names\\:`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      session.data.field = field;
      session.step = 2;
      this.updateSession(ctx.from.id.toString(), session);
      
      let prompt = '';
      switch (field) {
        case 'make':
          prompt = 'Enter new device make:';
          break;
        case 'model':
          prompt = 'Enter new device model:';
          break;
        case 'cost':
          prompt = 'Enter new cost price (in Naira):';
          break;
        case 'selling':
          prompt = 'Enter new selling price (in Naira):';
          break;
        case 'category':
          prompt = 'Enter new category (budget, mid-range, premium, flagship):';
          break;
        case 'status':
          prompt = 'Enter new status (active, inactive):';
          break;
      }
      
      await ctx.reply(`*${prompt}*`, { parse_mode: 'MarkdownV2' });
      return true;
      
    } catch (error) {
      console.error('❌ Edit device flow error:', error);
      await ctx.reply('❌ Error editing device\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      this.clearSession(ctx.from.id.toString());
      return true;
    }
  }

  async handleAssignMarketerFlow(ctx, text, session) {
    try {
      const marketerId = text.trim();
      
      if (!this.users[marketerId]) {
        await ctx.reply(
          `*❌ USER NOT FOUND*\n\n` +
          `User with ID ${marketerId} not found in system\\.\n` +
          `Ask the user to start the bot first\\.\n\n` +
          `Try again or type /cancel to cancel\\:`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      this.users[marketerId].isMarketer = true;
      
      const marketersData = await fs.readFile(this.marketersFile, 'utf8');
      const marketers = JSON.parse(marketersData);
      
      const marketerName = `${this.users[marketerId].firstName || ''} ${this.users[marketerId].lastName || ''}`.trim();
      
      marketers.push({
        id: `MARK-${marketerId.substring(0, 5)}-${Date.now().toString().slice(-3)}`,
        telegramId: marketerId,
        name: marketerName,
        phone: this.users[marketerId].phone || '',
        email: this.users[marketerId].email || '',
        commissionRate: 10,
        status: 'active',
        assignedClients: [],
        totalSales: 0,
        totalCommission: 0,
        joinDate: new Date().toISOString(),
        performance: {
          monthlyTarget: 5000000,
          currentMonthSales: 0,
          conversionRate: 0
        }
      });
      
      await fs.writeFile(this.marketersFile, JSON.stringify(marketers, null, 2));
      
      this.clearSession(ctx.from.id.toString());
      
      await ctx.reply(
        `*✅ MARKETER ASSIGNED SUCCESSFULLY\\!*\n\n` +
        `*👤 Name:* ${this.escapeMarkdown(marketerName)}\n` +
        `*🆔 Telegram ID:* ${marketerId}\n` +
        `*💼 Commission Rate:* 10%\n\n` +
        `The user can now access marketer features\\!`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('👥 View Marketers', 'device_manage_marketers')],
            [Markup.button.callback('⬅️ Back', 'device_admin')]
          ])
        }
      );
      
      try {
        await this.bot.telegram.sendMessage(
          marketerId,
          `*🎉 CONGRATULATIONS\\!*\n\n` +
          `You have been assigned as a *Marketer* for LiteDevice Financing\\!\n\n` +
          `*💰 Commission Rate:* 10%\n` +
          `*📱 Access:* Full marketer features\n` +
          `*💼 Benefits:*\n` +
          `• Earn 10% commission on every sale\n` +
          `• Access to sales dashboard\n` +
          `• Performance tracking\n` +
          `• Client management\n\n` +
          `Start selling devices from the Device menu\\!`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (notifyError) {
        console.error('❌ Failed to notify marketer:', notifyError);
      }
      
      return true;
      
    } catch (error) {
      console.error('❌ Assign marketer flow error:', error);
      await ctx.reply('❌ Error assigning marketer\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      this.clearSession(ctx.from.id.toString());
      return true;
    }
  }

  async handleConfigureDeviceFlow(ctx, text, session) {
    this.clearSession(ctx.from.id.toString());
    await ctx.reply('Device configuration flow started. This feature is under development.', { parse_mode: 'MarkdownV2' });
    return true;
  }

  async handleCancelCommand(ctx) {
    const userId = ctx.from.id.toString();
    const session = this.getSession(userId);
    
    if (session) {
      this.clearSession(userId);
      await ctx.reply('✅ Operation cancelled\\.', { parse_mode: 'MarkdownV2' });
      return true;
    }
    
    return false;
  }

  // ==================== MISSING METHODS ====================
  async handleDetailedInventory(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const inventoryData = await fs.readFile(this.inventoryFile, 'utf8');
      const inventory = JSON.parse(inventoryData);
      
      if (inventory.length === 0) {
        await ctx.editMessageText(
          `*📋 DETAILED INVENTORY*\n\n` +
          `❌ No inventory items found\\.\n\n` +
          `Add inventory items to get started\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Add Inventory', 'device_admin_add_inventory')],
              [Markup.button.callback('⬅️ Back', 'device_admin_inventory')]
            ])
          }
        );
        return;
      }
      
      let message = `*📋 DETAILED INVENTORY*\n\n`;
      message += `*Total Items:* ${inventory.length}\n\n`;
      
      const displayItems = inventory.slice(0, 10);
      displayItems.forEach((item, index) => {
        message += `*${index + 1}\\. Item ${item.inventoryId}*\n`;
        message += `   📱 Device ID\\: ${item.deviceId}\n`;
        message += `   📱 IMEI\\: ${item.imei}\n`;
        message += `   📊 Status\\: ${item.status}\n`;
        message += `   📍 Location\\: ${item.location}\n`;
        message += `   📝 Condition\\: ${item.condition}\n\n`;
      });
      
      if (inventory.length > 10) {
        message += `*... and ${inventory.length - 10} more items*\n\n`;
      }
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🔄 Refresh', 'device_admin_view_inventory'),
          Markup.button.callback('⬅️ Back', 'device_admin_inventory')
        ]
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...keyboard
      });
      
    } catch (error) {
      console.error('❌ Handle detailed inventory error:', error);
      throw error;
    }
  }

  async handleAddInventory(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData).filter(d => d.status === 'active');
      
      if (devices.length === 0) {
        await ctx.editMessageText(
          `*➕ ADD INVENTORY*\n\n` +
          `❌ No active devices found\\.\n\n` +
          `Add devices first before adding inventory\\.`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Add Device', 'device_admin_add')],
              [Markup.button.callback('⬅️ Back', 'device_admin_inventory')]
            ])
          }
        );
        return;
      }
      
      let message = `*➕ ADD INVENTORY*\n\n`;
      message += `Select a device to add inventory items\\:\n\n`;
      
      const keyboard = [];
      
      devices.forEach((device, index) => {
        message += `*${index + 1}\\. ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n`;
        message += `   💰 Price\\: ₦${this.formatCurrency(device.sellingPrice)}\n`;
        message += `   📱 ID\\: ${device.id}\n\n`;
        
        keyboard.push([Markup.button.callback(
          `📱 ${device.make} ${device.model}`,
          `device_admin_add_inventory_${device.id}`
        )]);
      });
      
      keyboard.push([
        Markup.button.callback('⬅️ Back', 'device_admin_inventory')
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ Handle add inventory error:', error);
      throw error;
    }
  }

  async handleAddInventoryForDevice(ctx, deviceId) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        await ctx.editMessageText('❌ Device not found', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const session = {
        action: 'add_inventory',
        step: 1,
        data: { deviceId: deviceId }
      };
      
      this.updateSession(userId, session);
      
      await ctx.editMessageText(
        `*➕ ADD INVENTORY FOR ${this.escapeMarkdown(device.make.toUpperCase())} ${this.escapeMarkdown(device.model.toUpperCase())}*\n\n` +
        `*Step 1/3: Enter Quantity*\n` +
        `How many inventory items would you like to add\\?\n\n` +
        `Type the quantity \\(1\\-100\\)\\:`,
        { parse_mode: 'MarkdownV2' }
      );
      
    } catch (error) {
      console.error('❌ Handle add inventory for device error:', error);
      throw error;
    }
  }

  // ==================== HELPER METHODS ====================
  groupBy(array, key) {
    if (!array || !Array.isArray(array)) return {};
    
    return array.reduce((result, item) => {
      const groupKey = item[key] || 'unknown';
      if (!result[groupKey]) {
        result[groupKey] = 0;
      }
      result[groupKey]++;
      return result;
    }, {});
  }
}

module.exports = DeviceHandler;