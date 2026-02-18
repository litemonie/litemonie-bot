// app/deviceCredit/handlers/DeviceHandler.js - COMPLETE INSTALLMENT FINANCING SYSTEM WITH IMEI TRACKING
const { Markup } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');

// ==================== DEVICE HANDLER WITH INSTALLMENT FINANCING ====================

class DeviceHandler {
  constructor(dataDir, bot, users, saveDataCallback, depositSystem = null) {
    console.log('🚀 DeviceHandler: Initializing with installment financing and IMEI tracking...');
    
    this.dataDir = dataDir;
    this.bot = bot;
    this.users = users || {};
    this.saveDataCallback = saveDataCallback;
    this.depositSystem = depositSystem;
    
    // Store sessions
    this.adminSessions = {};
    this.purchaseSessions = {}; // For installment purchases
    this.userSelections = {};
    this.confirmationSessions = {};
    this.installmentSelections = {}; // Store user's installment choices
    this.imeiSessions = {}; // Store admin IMEI assignment sessions
    
    console.log('✅ DeviceHandler ready with installment financing + IMEI tracking');
  }

  // ==================== HELPER METHODS ====================
  async ensureDataDir() {
    try {
      await fs.access(this.dataDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(this.dataDir, { recursive: true });
        console.log(`📁 Created data directory: ${this.dataDir}`);
      } else {
        console.error('❌ Error accessing data directory:', error);
      }
    }
  }

  formatCurrency(amount) {
    if (!amount) return '₦0';
    return `₦${parseInt(amount).toLocaleString('en-NG')}`;
  }

  generatePurchaseId() {
    return `PUR${Date.now().toString().slice(-8)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  }

  generateInstallmentId() {
    return `INS${Date.now().toString().slice(-8)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  }

  // Safe method to answer callback queries
  async safeAnswerCbQuery(ctx, text = '') {
    try {
      if (ctx.callbackQuery) {
        return await ctx.answerCbQuery(text);
      }
      return Promise.resolve();
    } catch (error) {
      console.error('❌ Error answering callback query:', error);
      return Promise.resolve();
    }
  }

  // Calculate installment details
  calculateInstallment(devicePrice, planType, months = 6) {
    const interestRate = 0.35; // 35% interest
    const totalWithInterest = devicePrice * (1 + interestRate);
    const downPayment = devicePrice * 0.30; // 30% down payment
    
    let installmentAmount = 0;
    let totalInstallments = 0;
    
    switch(planType) {
      case 'daily':
        totalInstallments = months * 30; // Approx 30 days per month
        installmentAmount = (totalWithInterest - downPayment) / totalInstallments;
        break;
      case 'weekly':
        totalInstallments = months * 4; // Approx 4 weeks per month
        installmentAmount = (totalWithInterest - downPayment) / totalInstallments;
        break;
      case 'monthly':
        totalInstallments = months;
        installmentAmount = (totalWithInterest - downPayment) / totalInstallments;
        break;
      case 'full':
        totalInstallments = 1;
        installmentAmount = devicePrice; // Full payment, no interest
        break;
    }
    
    return {
      planType,
      months,
      devicePrice,
      interestRate,
      totalWithInterest,
      downPayment,
      installmentAmount: Math.round(installmentAmount),
      totalInstallments,
      remainingAmount: totalWithInterest - downPayment
    };
  }

  // ==================== FILE OPERATIONS ====================
  async loadDevices() {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'devices.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Creating new devices.json');
        return [];
      }
      console.error('❌ Error loading devices:', error);
      return [];
    }
  }

  async saveDevices(devices) {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'devices.json');
      await fs.writeFile(filePath, JSON.stringify(devices, null, 2));
      console.log(`💾 Saved ${devices.length} devices`);
      return true;
    } catch (error) {
      console.error('❌ Error saving devices:', error);
      return false;
    }
  }

  async loadInventory() {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'inventory.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Creating new inventory.json');
        return [];
      }
      console.error('❌ Error loading inventory:', error);
      return [];
    }
  }

  async saveInventory(inventory) {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'inventory.json');
      await fs.writeFile(filePath, JSON.stringify(inventory, null, 2));
      console.log(`💾 Saved ${inventory.length} inventory items`);
      return true;
    } catch (error) {
      console.error('❌ Error saving inventory:', error);
      return false;
    }
  }

  async loadInstallments() {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'installments.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Creating new installments.json');
        return [];
      }
      console.error('❌ Error loading installments:', error);
      return [];
    }
  }

  async saveInstallments(installments) {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'installments.json');
      await fs.writeFile(filePath, JSON.stringify(installments, null, 2));
      console.log(`💾 Saved ${installments.length} installments`);
      return true;
    } catch (error) {
      console.error('❌ Error saving installments:', error);
      return false;
    }
  }

  async loadPayments() {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'payments.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Creating new payments.json');
        return [];
      }
      console.error('❌ Error loading payments:', error);
      return [];
    }
  }

  async savePayments(payments) {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'payments.json');
      await fs.writeFile(filePath, JSON.stringify(payments, null, 2));
      console.log(`💾 Saved ${payments.length} payments`);
      return true;
    } catch (error) {
      console.error('❌ Error saving payments:', error);
      return false;
    }
  }

  // ==================== IMEI MANAGEMENT ====================
  async loadIMEIMappings() {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'imei_mappings.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📁 Creating new imei_mappings.json');
        return [];
      }
      console.error('❌ Error loading IMEI mappings:', error);
      return [];
    }
  }

  async saveIMEIMappings(mappings) {
    try {
      await this.ensureDataDir();
      const filePath = path.join(this.dataDir, 'imei_mappings.json');
      await fs.writeFile(filePath, JSON.stringify(mappings, null, 2));
      console.log(`💾 Saved ${mappings.length} IMEI mappings`);
      return true;
    } catch (error) {
      console.error('❌ Error saving IMEI mappings:', error);
      return false;
    }
  }

  async assignIMEIToInstallment(installmentId, imei, phoneDetails) {
    try {
      const mappings = await this.loadIMEIMappings();
      
      // Check if IMEI is already assigned
      const existingIMEI = mappings.find(m => m.imei === imei);
      if (existingIMEI) {
        return { 
          success: false, 
          error: 'IMEI already assigned to another installment',
          assignedTo: existingIMEI.installmentId
        };
      }
      
      // Check if installment already has an IMEI
      const existingInstallment = mappings.find(m => m.installmentId === installmentId);
      if (existingInstallment) {
        return { 
          success: false, 
          error: 'Installment already has an assigned IMEI',
          currentIMEI: existingInstallment.imei
        };
      }
      
      // Get installment details
      const installments = await this.loadInstallments();
      const installment = installments.find(i => i.id === installmentId);
      
      if (!installment) {
        return { success: false, error: 'Installment not found' };
      }
      
      // Create new IMEI mapping
      const newMapping = {
        id: `IMEI${Date.now().toString().slice(-8)}`,
        installmentId: installmentId,
        userId: installment.userId,
        deviceId: installment.deviceId,
        deviceMake: installment.deviceMake,
        deviceModel: installment.deviceModel,
        imei: imei,
        imeiStatus: 'locked', // locked, unlocked, blacklisted
        phoneDetails: phoneDetails || {},
        assignedBy: 'admin',
        assignedAt: new Date().toISOString(),
        unlockedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      mappings.push(newMapping);
      await this.saveIMEIMappings(mappings);
      
      console.log(`✅ IMEI ${imei} assigned to installment ${installmentId}`);
      return { success: true, mapping: newMapping };
      
    } catch (error) {
      console.error('❌ Error assigning IMEI:', error);
      return { success: false, error: error.message };
    }
  }

  async getIMEIByInstallmentId(installmentId) {
    try {
      const mappings = await this.loadIMEIMappings();
      return mappings.find(m => m.installmentId === installmentId);
    } catch (error) {
      console.error('❌ Error getting IMEI:', error);
      return null;
    }
  }

  async getInstallmentByIMEI(imei) {
    try {
      const mappings = await this.loadIMEIMappings();
      return mappings.find(m => m.imei === imei);
    } catch (error) {
      console.error('❌ Error getting installment by IMEI:', error);
      return null;
    }
  }

  async getUserIMEIMappings(userId) {
    try {
      const mappings = await this.loadIMEIMappings();
      return mappings.filter(m => m.userId === userId);
    } catch (error) {
      console.error('❌ Error getting user IMEI mappings:', error);
      return [];
    }
  }

  async updateIMEIStatus(imei, status, notes = '') {
    try {
      const mappings = await this.loadIMEIMappings();
      const mappingIndex = mappings.findIndex(m => m.imei === imei);
      
      if (mappingIndex === -1) {
        return { success: false, error: 'IMEI not found' };
      }
      
      mappings[mappingIndex].imeiStatus = status;
      mappings[mappingIndex].updatedAt = new Date().toISOString();
      
      if (status === 'unlocked') {
        mappings[mappingIndex].unlockedAt = new Date().toISOString();
      }
      
      if (notes) {
        mappings[mappingIndex].notes = notes;
      }
      
      await this.saveIMEIMappings(mappings);
      console.log(`✅ IMEI ${imei} status updated to ${status}`);
      return { success: true, mapping: mappings[mappingIndex] };
      
    } catch (error) {
      console.error('❌ Error updating IMEI status:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== DEVICE MANAGEMENT ====================
  async addSimpleDevice(deviceData) {
    try {
      console.log('📱 Adding device:', deviceData);
      
      const devices = await this.loadDevices();
      
      const deviceId = `DEV${Date.now().toString().slice(-8)}`;
      const newDevice = {
        id: deviceId,
        make: deviceData.make || 'Unknown',
        model: deviceData.model || 'Unknown',
        price: deviceData.price || 0,
        costPrice: deviceData.costPrice || deviceData.price || 0,
        specs: deviceData.specs || {},
        installmentAvailable: true, // All devices available for installment
        createdAt: new Date().toISOString()
      };
      
      devices.push(newDevice);
      await this.saveDevices(devices);
      
      // Create inventory entry
      await this.addToInventory(deviceId, deviceData.initialQuantity || 0);
      
      console.log(`✅ Device added: ${deviceId}`);
      return { success: true, deviceId, device: newDevice };
      
    } catch (error) {
      console.error('❌ Error adding device:', error);
      return { success: false, error: error.message };
    }
  }

  async addToInventory(deviceId, quantity) {
    try {
      const inventory = await this.loadInventory();
      
      const existingIndex = inventory.findIndex(item => item.deviceId === deviceId);
      
      if (existingIndex >= 0) {
        inventory[existingIndex].quantity += quantity;
        inventory[existingIndex].updatedAt = new Date().toISOString();
      } else {
        inventory.push({
          deviceId,
          quantity,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      await this.saveInventory(inventory);
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error adding to inventory:', error);
      return { success: false, error: error.message };
    }
  }

  async getDeviceById(deviceId) {
    try {
      const devices = await this.loadDevices();
      return devices.find(device => device.id === deviceId);
    } catch (error) {
      console.error('❌ Error getting device:', error);
      return null;
    }
  }

  async getInventoryForDevice(deviceId) {
    try {
      const inventory = await this.loadInventory();
      const item = inventory.find(item => item.deviceId === deviceId);
      return item ? item.quantity : 0;
    } catch (error) {
      console.error('❌ Error getting inventory:', error);
      return 0;
    }
  }

  // ==================== INSTALLMENT MANAGEMENT ====================
  async createInstallmentPurchase(userId, deviceId, installmentData) {
    try {
      const device = await this.getDeviceById(deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      
      const availableQty = await this.getInventoryForDevice(deviceId);
      if (availableQty <= 0) {
        return { success: false, error: 'Device out of stock' };
      }
      
      const installments = await this.loadInstallments();
      const payments = await this.loadPayments();
      
      const installmentId = this.generateInstallmentId();
      const purchaseId = this.generatePurchaseId();
      
      const newInstallment = {
        id: installmentId,
        purchaseId: purchaseId,
        userId: userId,
        deviceId: deviceId,
        deviceMake: device.make,
        deviceModel: device.model,
        devicePrice: device.price,
        planType: installmentData.planType,
        months: installmentData.months || 6,
        interestRate: 0.35, // 35% interest
        totalWithInterest: installmentData.totalWithInterest,
        downPayment: installmentData.downPayment,
        installmentAmount: installmentData.installmentAmount,
        totalInstallments: installmentData.totalInstallments,
        installmentsPaid: 0,
        status: 'pending', // pending, active, completed, defaulted
        imeiAssigned: false, // Track if IMEI is assigned
        imeiStatus: 'pending', // pending, assigned, locked, unlocked
        nextPaymentDate: new Date(Date.now() + (installmentData.planType === 'daily' ? 24 * 60 * 60 * 1000 : 
                         installmentData.planType === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 
                         30 * 24 * 60 * 60 * 1000)).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Create initial payment for down payment
      const downPaymentId = `PAY${Date.now().toString().slice(-8)}`;
      const downPaymentRecord = {
        id: downPaymentId,
        installmentId: installmentId,
        userId: userId,
        amount: installmentData.downPayment,
        paymentType: 'down_payment',
        status: 'pending',
        dueDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      installments.push(newInstallment);
      payments.push(downPaymentRecord);
      
      await this.saveInstallments(installments);
      await this.savePayments(payments);
      
      // Reduce inventory by 1
      await this.updateInventory(deviceId, -1);
      
      console.log(`✅ Installment created: ${installmentId} for user ${userId}`);
      return { 
        success: true, 
        installmentId, 
        purchaseId,
        installment: newInstallment,
        downPayment: downPaymentRecord
      };
      
    } catch (error) {
      console.error('❌ Error creating installment:', error);
      return { success: false, error: error.message };
    }
  }

  async updateInventory(deviceId, quantityChange) {
    try {
      const inventory = await this.loadInventory();
      const itemIndex = inventory.findIndex(item => item.deviceId === deviceId);
      
      if (itemIndex === -1) {
        return { success: false, error: 'Device not in inventory' };
      }
      
      inventory[itemIndex].quantity += quantityChange;
      if (inventory[itemIndex].quantity < 0) {
        inventory[itemIndex].quantity = 0;
      }
      
      inventory[itemIndex].updatedAt = new Date().toISOString();
      await this.saveInventory(inventory);
      
      return { success: true, newQuantity: inventory[itemIndex].quantity };
    } catch (error) {
      console.error('❌ Error updating inventory:', error);
      return { success: false, error: error.message };
    }
  }

  async processDownPayment(installmentId) {
    try {
      const installments = await this.loadInstallments();
      const payments = await this.loadPayments();
      
      const installmentIndex = installments.findIndex(i => i.id === installmentId);
      const paymentIndex = payments.findIndex(p => p.installmentId === installmentId && p.paymentType === 'down_payment');
      
      if (installmentIndex === -1 || paymentIndex === -1) {
        return { success: false, error: 'Installment or payment not found' };
      }
      
      // Update payment status
      payments[paymentIndex].status = 'completed';
      payments[paymentIndex].paidAt = new Date().toISOString();
      payments[paymentIndex].updatedAt = new Date().toISOString();
      
      // Update installment status
      installments[installmentIndex].status = 'active';
      installments[installmentIndex].installmentsPaid = 1;
      installments[installmentIndex].updatedAt = new Date().toISOString();
      
      // Generate first installment payment
      const nextPaymentDate = new Date(installments[installmentIndex].nextPaymentDate);
      const installmentPaymentId = `PAY${Date.now().toString().slice(-7)}`;
      const installmentPayment = {
        id: installmentPaymentId,
        installmentId: installmentId,
        userId: installments[installmentIndex].userId,
        amount: installments[installmentIndex].installmentAmount,
        paymentType: 'installment',
        installmentNumber: 1,
        status: 'pending',
        dueDate: nextPaymentDate.toISOString(),
        createdAt: new Date().toISOString()
      };
      
      payments.push(installmentPayment);
      
      await this.saveInstallments(installments);
      await this.savePayments(payments);
      
      console.log(`✅ Down payment processed for installment: ${installmentId}`);
      return { 
        success: true, 
        installment: installments[installmentIndex],
        payments: [payments[paymentIndex], installmentPayment]
      };
      
    } catch (error) {
      console.error('❌ Error processing down payment:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserInstallments(userId) {
    try {
      const installments = await this.loadInstallments();
      return installments.filter(installment => installment.userId === userId);
    } catch (error) {
      console.error('❌ Error getting user installments:', error);
      return [];
    }
  }

  async getUserPayments(userId) {
    try {
      const payments = await this.loadPayments();
      return payments.filter(payment => payment.userId === userId);
    } catch (error) {
      console.error('❌ Error getting user payments:', error);
      return [];
    }
  }

  async getInstallmentById(installmentId) {
    try {
      const installments = await this.loadInstallments();
      return installments.find(installment => installment.id === installmentId);
    } catch (error) {
      console.error('❌ Error getting installment:', error);
      return null;
    }
  }

  // ==================== VIEW DEVICES ====================
  async viewSimpleDevices(ctx, page = 0) {
    try {
      console.log('📱 Viewing devices page:', page);
      
      const devices = await this.loadDevices();
      const inventory = await this.loadInventory();
      
      if (devices.length === 0) {
        await ctx.reply(
          `📱 <b>AVAILABLE DEVICES</b>\n\n` +
          `No devices found yet.\n\n` +
          `Admins can add devices using /adddevice command\n\n` +
          `📞 Support: @opuenekeke`,
          { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 Menu', 'device_menu')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
        return;
      }
      
      // Sort devices by price (low to high)
      devices.sort((a, b) => a.price - b.price);
      
      // Pagination
      const itemsPerPage = 5;
      const totalPages = Math.ceil(devices.length / itemsPerPage);
      const startIndex = page * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, devices.length);
      const pageDevices = devices.slice(startIndex, endIndex);
      
      let message = `<b>📱 AVAILABLE DEVICES</b>\n\n`;
      message += `<b>Page ${page + 1} of ${totalPages}</b> | `;
      message += `<b>Total: ${devices.length} devices</b>\n\n`;
      
      pageDevices.forEach((device, index) => {
        const invItem = inventory.find(item => item.deviceId === device.id);
        const qty = invItem ? invItem.quantity : 0;
        const globalIndex = startIndex + index + 1;
        
        message += `<b>${globalIndex}. ${device.make} ${device.model}</b>\n`;
        message += `   💰 <b>Cash Price:</b> ${this.formatCurrency(device.price)}\n`;
        message += `   💳 <b>Installment Price (6 months):</b> ${this.formatCurrency(device.price * 1.35)}\n`;
        message += `   📦 <b>Stock:</b> ${qty} unit${qty !== 1 ? 's' : ''}\n`;
        
        // Show specs if available
        if (device.specs && Object.keys(device.specs).length > 0) {
          const specsStr = Object.entries(device.specs)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ');
          message += `   ⚙️ <b>Specs:</b> ${specsStr}\n`;
        }
        
        message += `   🆔 <b>ID:</b> <code>${device.id}</code>\n`;
        
        if (qty > 0) {
          message += `   🛒 <b>Buy Now:</b> Available\n\n`;
        } else {
          message += `   ⚠️ <b>Status:</b> Out of Stock\n\n`;
        }
      });
      
      message += `<b>💡 Installment Financing:</b>\n`;
      message += `• 30% Down Payment\n`;
      message += `• 35% Interest (6 months max)\n`;
      message += `• Daily/Weekly/Monthly payments\n`;
      message += `• IMEI locked until fully paid\n\n`;
      
      message += `<b>📞 Contact support for bulk orders or special requests:</b> @opuenekeke`;
      
      // Create keyboard
      const keyboard = [];
      
      // Buy buttons for in-stock devices
      pageDevices.forEach(device => {
        const invItem = inventory.find(item => item.deviceId === device.id);
        const qty = invItem ? invItem.quantity : 0;
        
        if (qty > 0) {
          keyboard.push([
            Markup.button.callback(
              `🛒 Buy ${device.make} ${device.model}`,
              `buy_device_${device.id}`
            )
          ]);
        }
      });
      
      // Pagination buttons
      const paginationButtons = [];
      if (page > 0) {
        paginationButtons.push(Markup.button.callback('⬅️ Previous', `devices_page_${page - 1}`));
      }
      if (page < totalPages - 1) {
        paginationButtons.push(Markup.button.callback('Next ➡️', `devices_page_${page + 1}`));
      }
      
      if (paginationButtons.length > 0) {
        keyboard.push(paginationButtons);
      }
      
      // Navigation buttons
      keyboard.push([
        Markup.button.callback('📋 My Installments', 'device_my_installments'),
        Markup.button.callback('💰 Make Payment', 'device_make_payment')
      ]);
      
      keyboard.push([
        Markup.button.callback('📱 Menu', 'device_menu'),
        Markup.button.callback('🏠 Home', 'start')
      ]);
      
      // Check if we're editing or sending new message
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(keyboard)
        });
      }
      
    } catch (error) {
      console.error('❌ Error viewing devices:', error);
      await ctx.reply(
        '❌ Error loading devices. Please try again.\n\n' +
        '📞 Support: @opuenekeke',
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Retry', 'device_view_devices')],
            [Markup.button.callback('📱 Menu', 'device_menu')]
          ])
        }
      );
    }
  }

  // ==================== BUY DEVICE FLOW ====================
  async handleBuyDevice(ctx, deviceId) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx);
      
      const device = await this.getDeviceById(deviceId);
      if (!device) {
        await ctx.reply('❌ Device not found. Please try again.', { parse_mode: 'HTML' });
        return;
      }
      
      const availableQty = await this.getInventoryForDevice(deviceId);
      if (availableQty <= 0) {
        await ctx.reply(
          `❌ <b>OUT OF STOCK</b>\n\n` +
          `<b>Device:</b> ${device.make} ${device.model}\n` +
          `<b>Status:</b> Currently unavailable\n\n` +
          `Please check back later.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      // Store device selection
      this.userSelections[userId] = {
        deviceId: deviceId,
        device: device,
        timestamp: Date.now()
      };
      
      // Calculate installment options
      const fullPrice = device.price;
      const installment6Months = this.calculateInstallment(fullPrice, 'monthly', 6);
      const installment3Months = this.calculateInstallment(fullPrice, 'monthly', 3);
      const weeklyPlan = this.calculateInstallment(fullPrice, 'weekly', 6);
      const dailyPlan = this.calculateInstallment(fullPrice, 'daily', 6);
      
      await ctx.reply(
        `🛒 <b>BUY ${device.make.toUpperCase()} ${device.model.toUpperCase()}</b>\n\n` +
        `<b>Device Details:</b>\n` +
        `• Brand: ${device.make}\n` +
        `• Model: ${device.model}\n` +
        `• Cash Price: ${this.formatCurrency(fullPrice)}\n` +
        `• Available: ${availableQty} unit${availableQty !== 1 ? 's' : ''}\n\n` +
        `<b>💳 PAYMENT OPTIONS:</b>\n\n` +
        `<b>1. Full Payment (No Interest)</b>\n` +
        `• Total: ${this.formatCurrency(fullPrice)}\n` +
        `• Pay once and own it\n` +
        `• Device unlocked immediately\n\n` +
        `<b>2. 6-Month Installment (35% Interest)</b>\n` +
        `• Down Payment (30%): ${this.formatCurrency(installment6Months.downPayment)}\n` +
        `• Monthly Payment: ${this.formatCurrency(installment6Months.installmentAmount)} × 6 months\n` +
        `• Total with Interest: ${this.formatCurrency(installment6Months.totalWithInterest)}\n` +
        `• Device: IMEI locked until fully paid\n\n` +
        `<b>3. 3-Month Installment (35% Interest)</b>\n` +
        `• Down Payment (30%): ${this.formatCurrency(installment3Months.downPayment)}\n` +
        `• Monthly Payment: ${this.formatCurrency(installment3Months.installmentAmount)} × 3 months\n` +
        `• Total with Interest: ${this.formatCurrency(installment3Months.totalWithInterest)}\n` +
        `• Device: IMEI locked until fully paid\n\n` +
        `<b>4. Weekly Installment (6 months)</b>\n` +
        `• Down Payment (30%): ${this.formatCurrency(weeklyPlan.downPayment)}\n` +
        `• Weekly Payment: ${this.formatCurrency(weeklyPlan.installmentAmount)} × 24 weeks\n` +
        `• Total with Interest: ${this.formatCurrency(weeklyPlan.totalWithInterest)}\n` +
        `• Device: IMEI locked until fully paid\n\n` +
        `<b>5. Daily Installment (6 months)</b>\n` +
        `• Down Payment (30%): ${this.formatCurrency(dailyPlan.downPayment)}\n` +
        `• Daily Payment: ${this.formatCurrency(dailyPlan.installmentAmount)} × 180 days\n` +
        `• Total with Interest: ${this.formatCurrency(dailyPlan.totalWithInterest)}\n` +
        `• Device: IMEI locked until fully paid\n\n` +
        `<b>📋 TERMS & CONDITIONS:</b>\n` +
        `• Device is IMEI locked until fully paid\n` +
        `• 30% down payment required to start\n` +
        `• Maximum 6 months repayment period\n` +
        `• 35% interest on installment plans\n` +
        `• Default may lead to device recovery\n\n` +
        `📞 <b>Support:</b> @opuenekeke`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('💰 Pay Full', `pay_full_${deviceId}`),
              Markup.button.callback('📅 6 Months', `installment_plan_${deviceId}_monthly_6`)
            ],
            [
              Markup.button.callback('📅 3 Months', `installment_plan_${deviceId}_monthly_3`),
              Markup.button.callback('📅 Weekly', `installment_plan_${deviceId}_weekly_6`)
            ],
            [
              Markup.button.callback('📅 Daily', `installment_plan_${deviceId}_daily_6`),
              Markup.button.callback('📱 Back', 'device_view_devices')
            ],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error in buy device:', error);
      await ctx.reply('❌ Error processing purchase. Please try again.', { parse_mode: 'HTML' });
    }
  }

  // ==================== INSTALLMENT PLAN SELECTION ====================
  async handleInstallmentPlan(ctx, deviceId, planType, months) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx);
      
      const device = await this.getDeviceById(deviceId);
      if (!device) {
        await ctx.reply('❌ Device not found.', { parse_mode: 'HTML' });
        return;
      }
      
      const user = this.users[userId] || {};
      const walletBalance = user.wallet || 0;
      
      // Calculate installment details
      const installmentDetails = this.calculateInstallment(device.price, planType, months);
      
      // Store installment selection
      this.installmentSelections[userId] = {
        deviceId,
        device,
        planType,
        months,
        ...installmentDetails
      };
      
      let planDescription = '';
      switch(planType) {
        case 'daily':
          planDescription = `Daily payments for ${months} months (approx ${installmentDetails.totalInstallments} days)`;
          break;
        case 'weekly':
          planDescription = `Weekly payments for ${months} months (${installmentDetails.totalInstallments} weeks)`;
          break;
        case 'monthly':
          planDescription = `Monthly payments for ${months} months`;
          break;
        case 'full':
          planDescription = 'One-time full payment';
          break;
      }
      
      let walletCheck = '';
      if (walletBalance >= installmentDetails.downPayment) {
        walletCheck = `✅ <b>Wallet Balance Sufficient</b>\n` +
                      `Your balance: ${this.formatCurrency(walletBalance)}\n` +
                      `Down payment needed: ${this.formatCurrency(installmentDetails.downPayment)}\n` +
                      `Remaining after payment: ${this.formatCurrency(walletBalance - installmentDetails.downPayment)}\n\n`;
      } else {
        walletCheck = `❌ <b>Insufficient Wallet Balance</b>\n` +
                      `Your balance: ${this.formatCurrency(walletBalance)}\n` +
                      `Down payment needed: ${this.formatCurrency(installmentDetails.downPayment)}\n` +
                      `Additional needed: ${this.formatCurrency(installmentDetails.downPayment - walletBalance)}\n\n`;
      }
      
      await ctx.reply(
        `📋 <b>INSTALLMENT PLAN SELECTED</b>\n\n` +
        `<b>Device:</b> ${device.make} ${device.model}\n` +
        `<b>Plan:</b> ${planDescription}\n\n` +
        `<b>💰 PAYMENT SUMMARY:</b>\n` +
        `• Device Price: ${this.formatCurrency(installmentDetails.devicePrice)}\n` +
        `• Interest (35%): ${this.formatCurrency(installmentDetails.totalWithInterest - installmentDetails.devicePrice)}\n` +
        `• Total with Interest: ${this.formatCurrency(installmentDetails.totalWithInterest)}\n` +
        `• Down Payment (30%): ${this.formatCurrency(installmentDetails.downPayment)}\n` +
        `• Installment Amount: ${this.formatCurrency(installmentDetails.installmentAmount)}\n` +
        `• Number of Installments: ${installmentDetails.totalInstallments}\n` +
        `• Total Installment Amount: ${this.formatCurrency(installmentDetails.remainingAmount)}\n\n` +
        `${walletCheck}` +
        `<b>📝 NEXT STEPS:</b>\n` +
        `1. Pay ${this.formatCurrency(installmentDetails.downPayment)} down payment\n` +
        `2. Contact support for device pickup/delivery\n` +
        `3. Support will assign IMEI to your installment\n` +
        `4. Device will be IMEI locked\n` +
        `5. Make ${installmentDetails.totalInstallments} payments\n` +
        `6. Device unlocked after final payment\n\n` +
        `<b>⚠️ IMPORTANT:</b>\n` +
        `• Device remains IMEI locked until fully paid\n` +
        `• Contact support after down payment for device\n` +
        `• Late payments attract penalties\n` +
        `• Contact support for payment issues\n\n` +
        `📞 <b>Support:</b> @opuenekeke`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            walletBalance >= installmentDetails.downPayment ? 
            [Markup.button.callback('💳 Pay Down Payment', `pay_down_${deviceId}_${planType}_${months}`)] : 
            [Markup.button.callback('💰 Deposit Funds', 'device_deposit_funds')],
            [
              Markup.button.callback('📱 Change Plan', `buy_device_${deviceId}`),
              Markup.button.callback('📱 View Devices', 'device_view_devices')
            ],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error in installment plan:', error);
      await ctx.reply('❌ Error processing installment plan. Please try again.', { parse_mode: 'HTML' });
    }
  }

  // ==================== PAY DOWN PAYMENT ====================
  async handlePayDownPayment(ctx, deviceId, planType, months) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx, 'Processing payment...');
      
      const user = this.users[userId] || {};
      const walletBalance = user.wallet || 0;
      
      // Get installment details from selection
      const installmentSelection = this.installmentSelections[userId];
      if (!installmentSelection || installmentSelection.deviceId !== deviceId) {
        await ctx.reply('❌ Installment selection expired. Please select plan again.', { parse_mode: 'HTML' });
        return;
      }
      
      const downPaymentAmount = installmentSelection.downPayment;
      
      if (walletBalance < downPaymentAmount) {
        await ctx.reply(
          `❌ <b>INSUFFICIENT BALANCE</b>\n\n` +
          `Your balance: ${this.formatCurrency(walletBalance)}\n` +
          `Down payment needed: ${this.formatCurrency(downPaymentAmount)}\n` +
          `Additional needed: ${this.formatCurrency(downPaymentAmount - walletBalance)}\n\n` +
          `Please deposit funds first.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      // Create installment purchase
      const installmentResult = await this.createInstallmentPurchase(
        userId, 
        deviceId, 
        installmentSelection
      );
      
      if (!installmentResult.success) {
        await ctx.reply(`❌ ${installmentResult.error}`, { parse_mode: 'HTML' });
        return;
      }
      
      // Deduct from wallet
      user.wallet = walletBalance - downPaymentAmount;
      
      // Save user data
      if (this.saveDataCallback) {
        await this.saveDataCallback();
      }
      
      // Process down payment
      const paymentResult = await this.processDownPayment(installmentResult.installmentId);
      
      if (!paymentResult.success) {
        await ctx.reply(`❌ Error: ${paymentResult.error}`, { parse_mode: 'HTML' });
        return;
      }
      
      // Notify admin about new installment for IMEI assignment
      await this.notifyAdminAboutNewInstallment(installmentResult.installmentId, userId);
      
      await ctx.reply(
        `✅ <b>DOWN PAYMENT SUCCESSFUL!</b>\n\n` +
        `<b>Transaction Details:</b>\n` +
        `• Installment ID: ${installmentResult.installmentId}\n` +
        `• Purchase ID: ${installmentResult.purchaseId}\n` +
        `• Device: ${installmentSelection.device.make} ${installmentSelection.device.model}\n` +
        `• Plan: ${installmentSelection.planType} for ${installmentSelection.months} months\n` +
        `• Down Payment: ${this.formatCurrency(downPaymentAmount)}\n` +
        `• New Balance: ${this.formatCurrency(user.wallet)}\n` +
        `• Status: Active - Awaiting IMEI Assignment\n\n` +
        `<b>📅 PAYMENT SCHEDULE:</b>\n` +
        `• Next Payment: ${this.formatCurrency(installmentSelection.installmentAmount)} due on ${new Date(paymentResult.installment.nextPaymentDate).toLocaleDateString()}\n` +
        `• Total Installments Remaining: ${installmentSelection.totalInstallments - 1}\n\n` +
        `<b>🚚 DEVICE COLLECTION:</b>\n` +
        `1. Contact support @opuenekeke\n` +
        `2. Provide your Installment ID: <code>${installmentResult.installmentId}</code>\n` +
        `3. Support will assign IMEI to your installment\n` +
        `4. Collect your device (IMEI locked)\n` +
        `5. Make regular payments to unlock device\n\n` +
        `<b>Support Hours:</b> 9AM - 9PM Daily\n` +
        `📞 <b>Contact:</b> @opuenekeke`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 My Installments', 'device_my_installments')],
            [Markup.button.callback('💰 Make Payment', 'device_make_payment')],
            [Markup.button.callback('📱 Buy Another', 'device_view_devices')]
          ])
        }
      );
      
      // Clear selections
      delete this.installmentSelections[userId];
      delete this.userSelections[userId];
      
    } catch (error) {
      console.error('❌ Error in down payment:', error);
      await ctx.reply('❌ Error processing down payment. Please try again.', { parse_mode: 'HTML' });
    }
  }

  // Notify admin about new installment needing IMEI assignment
  async notifyAdminAboutNewInstallment(installmentId, userId) {
    try {
      const installment = await this.getInstallmentById(installmentId);
      if (!installment) return;
      
      const user = this.users[userId] || {};
      const username = user.username ? `@${user.username}` : `User ${userId}`;
      
      const message = `📱 <b>NEW INSTALLMENT FOR IMEI ASSIGNMENT</b>\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>User:</b> ${username} (${userId})\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n` +
        `<b>Plan:</b> ${installment.planType} for ${installment.months} months\n` +
        `<b>Down Payment:</b> ${this.formatCurrency(installment.downPayment)}\n` +
        `<b>Installment Amount:</b> ${this.formatCurrency(installment.installmentAmount)}\n\n` +
        `<b>Assign IMEI using:</b>\n` +
        `<code>/assignimei ${installmentId} IMEI_NUMBER</code>\n\n` +
        `Or click button below:`;
      
      const adminIds = ['1279640125', '8055762920'];
      
      for (const adminId of adminIds) {
        try {
          await this.bot.telegram.sendMessage(adminId, message, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 Assign IMEI', `admin_assign_imei_${installmentId}`)],
              [Markup.button.callback('👤 View Installment', `admin_view_installment_${installmentId}`)]
            ])
          });
        } catch (error) {
          console.error(`❌ Error notifying admin ${adminId}:`, error);
        }
      }
      
    } catch (error) {
      console.error('❌ Error notifying admin:', error);
    }
  }

  // ==================== FULL PAYMENT ====================
  async handleFullPayment(ctx, deviceId) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx, 'Processing full payment...');
      
      const device = await this.getDeviceById(deviceId);
      if (!device) {
        await ctx.reply('❌ Device not found.', { parse_mode: 'HTML' });
        return;
      }
      
      const user = this.users[userId] || {};
      const walletBalance = user.wallet || 0;
      const devicePrice = device.price;
      
      if (walletBalance < devicePrice) {
        await ctx.reply(
          `❌ <b>INSUFFICIENT BALANCE</b>\n\n` +
          `Your balance: ${this.formatCurrency(walletBalance)}\n` +
          `Device price: ${this.formatCurrency(devicePrice)}\n` +
          `Additional needed: ${this.formatCurrency(devicePrice - walletBalance)}\n\n` +
          `Please deposit funds first.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      // Create installment record for full payment (no interest)
      const installmentDetails = this.calculateInstallment(devicePrice, 'full');
      const installmentResult = await this.createInstallmentPurchase(
        userId, 
        deviceId, 
        installmentDetails
      );
      
      if (!installmentResult.success) {
        await ctx.reply(`❌ ${installmentResult.error}`, { parse_mode: 'HTML' });
        return;
      }
      
      // Deduct from wallet
      user.wallet = walletBalance - devicePrice;
      
      // Save user data
      if (this.saveDataCallback) {
        await this.saveDataCallback();
      }
      
      // Mark as completed (full payment)
      const installments = await this.loadInstallments();
      const installmentIndex = installments.findIndex(i => i.id === installmentResult.installmentId);
      
      if (installmentIndex !== -1) {
        installments[installmentIndex].status = 'completed';
        installments[installmentIndex].installmentsPaid = 1;
        installments[installmentIndex].imeiStatus = 'unlocked';
        installments[installmentIndex].updatedAt = new Date().toISOString();
        await this.saveInstallments(installments);
      }
      
      // Notify admin about full payment for immediate IMEI assignment
      await this.notifyAdminAboutFullPayment(installmentResult.installmentId, userId);
      
      await ctx.reply(
        `✅ <b>FULL PAYMENT SUCCESSFUL!</b>\n\n` +
        `<b>Transaction Details:</b>\n` +
        `• Purchase ID: ${installmentResult.purchaseId}\n` +
        `• Installment ID: ${installmentResult.installmentId}\n` +
        `• Device: ${device.make} ${device.model}\n` +
        `• Amount: ${this.formatCurrency(devicePrice)}\n` +
        `• Payment Method: Wallet\n` +
        `• New Balance: ${this.formatCurrency(user.wallet)}\n` +
        `• Status: Completed - Ready for Unlocked Device\n\n` +
        `<b>Next Steps:</b>\n` +
        `1. Contact support @opuenekeke\n` +
        `2. Provide your Installment ID: <code>${installmentResult.installmentId}</code>\n` +
        `3. Support will assign IMEI to your installment\n` +
        `4. Collect your device (unlocked)\n\n` +
        `<b>Support Hours:</b> 9AM - 9PM Daily\n` +
        `📞 <b>Contact:</b> @opuenekeke`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 My Purchases', 'device_my_installments')],
            [Markup.button.callback('📱 Buy Another', 'device_view_devices')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      
      // Clear selection
      delete this.userSelections[userId];
      
    } catch (error) {
      console.error('❌ Error in full payment:', error);
      await ctx.reply('❌ Error processing payment. Please try again.', { parse_mode: 'HTML' });
    }
  }

  async notifyAdminAboutFullPayment(installmentId, userId) {
    try {
      const installment = await this.getInstallmentById(installmentId);
      if (!installment) return;
      
      const user = this.users[userId] || {};
      const username = user.username ? `@${user.username}` : `User ${userId}`;
      
      const message = `💰 <b>FULL PAYMENT RECEIVED - UNLOCKED DEVICE</b>\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>User:</b> ${username} (${userId})\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n` +
        `<b>Amount:</b> ${this.formatCurrency(installment.devicePrice)}\n` +
        `<b>Payment Type:</b> Full Payment\n\n` +
        `<b>Assign IMEI using:</b>\n` +
        `<code>/assignimei ${installmentId} IMEI_NUMBER</code>\n\n` +
        `Device should be delivered UNLOCKED.`;
      
      const adminIds = ['1279640125', '8055762920'];
      
      for (const adminId of adminIds) {
        try {
          await this.bot.telegram.sendMessage(adminId, message, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 Assign IMEI', `admin_assign_imei_${installmentId}`)],
              [Markup.button.callback('✅ Mark as Delivered', `admin_mark_delivered_${installmentId}`)]
            ])
          });
        } catch (error) {
          console.error(`❌ Error notifying admin ${adminId}:`, error);
        }
      }
      
    } catch (error) {
      console.error('❌ Error notifying admin about full payment:', error);
    }
  }

  // ==================== MY INSTALLMENTS ====================
  async handleMyInstallments(ctx) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx);
      
      const installments = await this.getUserInstallments(userId);
      const payments = await this.getUserPayments(userId);
      const imeiMappings = await this.getUserIMEIMappings(userId);
      
      if (installments.length === 0) {
        await ctx.reply(
          `📋 <b>MY INSTALLMENTS</b>\n\n` +
          `You don't have any active installments.\n\n` +
          `Browse devices and start an installment plan!`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 View Devices', 'device_view_devices')],
              [Markup.button.callback('📱 Menu', 'device_menu')]
            ])
          }
        );
        return;
      }
      
      let message = `<b>📋 MY INSTALLMENTS</b>\n\n`;
      message += `<b>Total Installments:</b> ${installments.length}\n\n`;
      
      installments.forEach((installment, index) => {
        const installmentPayments = payments.filter(p => p.installmentId === installment.id);
        const paidPayments = installmentPayments.filter(p => p.status === 'completed');
        const pendingPayments = installmentPayments.filter(p => p.status === 'pending');
        const imeiMapping = imeiMappings.find(m => m.installmentId === installment.id);
        
        message += `<b>${index + 1}. ${installment.deviceMake} ${installment.deviceModel}</b>\n`;
        message += `   🆔 <b>Installment ID:</b> <code>${installment.id}</code>\n`;
        message += `   💰 <b>Total Amount:</b> ${this.formatCurrency(installment.totalWithInterest)}\n`;
        message += `   📅 <b>Plan:</b> ${installment.planType} for ${installment.months} months\n`;
        message += `   🔄 <b>Status:</b> ${installment.status.toUpperCase()}\n`;
        
        // IMEI information
        if (imeiMapping) {
          message += `   📱 <b>IMEI Assigned:</b> ${imeiMapping.imeiStatus === 'locked' ? '🔒 Locked' : '🔓 Unlocked'}\n`;
          if (imeiMapping.imeiStatus === 'locked') {
            message += `   ⚠️ <b>Device Status:</b> IMEI Locked - Make payments to unlock\n`;
          } else if (imeiMapping.imeiStatus === 'unlocked') {
            message += `   ✅ <b>Device Status:</b> Fully Paid & Unlocked\n`;
          }
        } else {
          message += `   ⏳ <b>IMEI Status:</b> Awaiting assignment - Contact support\n`;
        }
        
        message += `   💳 <b>Payments Made:</b> ${paidPayments.length} of ${installment.totalInstallments + 1}\n`;
        message += `   ⏰ <b>Next Payment:</b> ${pendingPayments.length > 0 ? new Date(pendingPayments[0].dueDate).toLocaleDateString() : 'None'}\n`;
        message += `   💵 <b>Next Amount:</b> ${pendingPayments.length > 0 ? this.formatCurrency(pendingPayments[0].amount) : 'Completed'}\n\n`;
      });
      
      message += `<b>📞 Need help with payments or device collection?</b>\nContact support @opuenekeke`;
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💰 Make Payment', 'device_make_payment')],
          [Markup.button.callback('📱 View Devices', 'device_view_devices')],
          [Markup.button.callback('📱 Menu', 'device_menu')]
        ])
      });
      
    } catch (error) {
      console.error('❌ Error loading installments:', error);
      await ctx.reply('❌ Error loading your installments.', { parse_mode: 'HTML' });
    }
  }

  // ==================== MAKE PAYMENT ====================
  async handleMakePayment(ctx) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx);
      
      const installments = await this.getUserInstallments(userId);
      const payments = await this.getUserPayments(userId);
      
      const activeInstallments = installments.filter(i => i.status === 'active');
      
      if (activeInstallments.length === 0) {
        await ctx.reply(
          `💰 <b>MAKE PAYMENT</b>\n\n` +
          `You don't have any pending payments.\n\n` +
          `Start an installment plan to make payments.`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 View Devices', 'device_view_devices')],
              [Markup.button.callback('📱 Menu', 'device_menu')]
            ])
          }
        );
        return;
      }
      
      let message = `<b>💰 MAKE PAYMENT</b>\n\n`;
      message += `<b>Pending Payments:</b>\n\n`;
      
      const paymentButtons = [];
      
      activeInstallments.forEach((installment, index) => {
        const pendingPayments = payments.filter(p => 
          p.installmentId === installment.id && 
          p.status === 'pending'
        );
        
        if (pendingPayments.length > 0) {
          const nextPayment = pendingPayments[0];
          message += `<b>${index + 1}. ${installment.deviceMake} ${installment.deviceModel}</b>\n`;
          message += `   🆔 <b>Installment ID:</b> ${installment.id}\n`;
          message += `   💰 <b>Amount Due:</b> ${this.formatCurrency(nextPayment.amount)}\n`;
          message += `   📅 <b>Due Date:</b> ${new Date(nextPayment.dueDate).toLocaleDateString()}\n`;
          message += `   #️⃣ <b>Payment:</b> ${nextPayment.installmentNumber || (nextPayment.paymentType === 'down_payment' ? 'Down Payment' : 'Installment')}\n\n`;
          
          paymentButtons.push([
            Markup.button.callback(
              `💳 Pay ${this.formatCurrency(nextPayment.amount)} - ${installment.deviceMake}`,
              `pay_installment_${installment.id}_${nextPayment.id}`
            )
          ]);
        }
      });
      
      if (paymentButtons.length === 0) {
        message += `No pending payments at the moment.\n`;
      }
      
      message += `\n<b>💡 Payment Instructions:</b>\n`;
      message += `1. Click payment button below\n`;
      message += `2. Confirm payment from wallet\n`;
      message += `3. Payment processed instantly\n`;
      message += `4. Continue payments to unlock device\n`;
      message += `5. Contact support if issues\n\n`;
      message += `📞 <b>Support:</b> @opuenekeke`;
      
      const keyboard = [...paymentButtons];
      
      if (paymentButtons.length === 0) {
        keyboard.push([
          Markup.button.callback('📱 View Devices', 'device_view_devices'),
          Markup.button.callback('📋 My Installments', 'device_my_installments')
        ]);
      }
      
      keyboard.push([Markup.button.callback('📱 Menu', 'device_menu')]);
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ Error in make payment:', error);
      await ctx.reply('❌ Error loading payment information.', { parse_mode: 'HTML' });
    }
  }

  // ==================== PAY INSTALLMENT ====================
  async handlePayInstallment(ctx, installmentId, paymentId) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx, 'Processing payment...');
      
      const user = this.users[userId] || {};
      const payments = await this.loadPayments();
      const installments = await this.loadInstallments();
      
      const paymentIndex = payments.findIndex(p => p.id === paymentId && p.userId === userId);
      const installmentIndex = installments.findIndex(i => i.id === installmentId && i.userId === userId);
      
      if (paymentIndex === -1 || installmentIndex === -1) {
        await ctx.reply('❌ Payment not found.', { parse_mode: 'HTML' });
        return;
      }
      
      const payment = payments[paymentIndex];
      const installment = installments[installmentIndex];
      
      if (payment.status === 'completed') {
        await ctx.reply('❌ This payment has already been completed.', { parse_mode: 'HTML' });
        return;
      }
      
      if (user.wallet < payment.amount) {
        await ctx.reply(
          `❌ <b>INSUFFICIENT BALANCE</b>\n\n` +
          `Your balance: ${this.formatCurrency(user.wallet)}\n` +
          `Payment needed: ${this.formatCurrency(payment.amount)}\n` +
          `Additional needed: ${this.formatCurrency(payment.amount - user.wallet)}\n\n` +
          `Please deposit funds first.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      // Deduct from wallet
      user.wallet = user.wallet - payment.amount;
      
      // Update payment status
      payments[paymentIndex].status = 'completed';
      payments[paymentIndex].paidAt = new Date().toISOString();
      payments[paymentIndex].updatedAt = new Date().toISOString();
      
      // Update installment
      installments[installmentIndex].installmentsPaid += 1;
      installments[installmentIndex].updatedAt = new Date().toISOString();
      
      // Check if installment is completed
      const isCompleted = installments[installmentIndex].installmentsPaid >= installments[installmentIndex].totalInstallments + 1;
      
      if (isCompleted) {
        installments[installmentIndex].status = 'completed';
        installments[installmentIndex].imeiStatus = 'unlocked';
        
        // Update IMEI status to unlocked
        const imeiMapping = await this.getIMEIByInstallmentId(installmentId);
        if (imeiMapping) {
          await this.updateIMEIStatus(imeiMapping.imei, 'unlocked', 'Installment fully paid');
        }
        
        // Notify user about unlocked device
        await this.notifyUserAboutUnlockedDevice(userId, installmentId);
        
        // Notify admin about completed installment
        await this.notifyAdminAboutCompletedInstallment(installmentId, userId);
      } else {
        // Create next payment if not completed
        const nextPaymentNumber = installments[installmentIndex].installmentsPaid;
        const nextPaymentDate = new Date(Date.now() + 
          (installment.planType === 'daily' ? 24 * 60 * 60 * 1000 : 
           installment.planType === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 
           30 * 24 * 60 * 60 * 1000));
        
        const nextPaymentId = `PAY${Date.now().toString().slice(-7)}`;
        const nextPayment = {
          id: nextPaymentId,
          installmentId: installmentId,
          userId: userId,
          amount: installment.installmentAmount,
          paymentType: 'installment',
          installmentNumber: nextPaymentNumber,
          status: 'pending',
          dueDate: nextPaymentDate.toISOString(),
          createdAt: new Date().toISOString()
        };
        
        payments.push(nextPayment);
      }
      
      // Save all data
      await this.savePayments(payments);
      await this.saveInstallments(installments);
      
      if (this.saveDataCallback) {
        await this.saveDataCallback();
      }
      
      await ctx.reply(
        `✅ <b>PAYMENT SUCCESSFUL!</b>\n\n` +
        `<b>Transaction Details:</b>\n` +
        `• Payment ID: ${payment.id}\n` +
        `• Installment ID: ${installment.id}\n` +
        `• Device: ${installment.deviceMake} ${installment.deviceModel}\n` +
        `• Amount: ${this.formatCurrency(payment.amount)}\n` +
        `• Payment Type: ${payment.paymentType === 'down_payment' ? 'Down Payment' : `Installment ${payment.installmentNumber}`}\n` +
        `• New Balance: ${this.formatCurrency(user.wallet)}\n` +
        `• Status: Completed\n\n` +
        `<b>📊 INSTALLMENT PROGRESS:</b>\n` +
        `• Payments Made: ${installments[installmentIndex].installmentsPaid} of ${installment.totalInstallments + 1}\n` +
        `• Remaining Payments: ${installment.totalInstallments + 1 - installments[installmentIndex].installmentsPaid}\n` +
        `• Total Paid: ${this.formatCurrency(installments[installmentIndex].installmentsPaid * installment.installmentAmount)}\n` +
        `• Remaining Balance: ${this.formatCurrency(installment.totalWithInterest - (installments[installmentIndex].installmentsPaid * installment.installmentAmount))}\n\n` +
        `${isCompleted ? `🎉 <b>CONGRATULATIONS!</b> Your device is now fully paid and will be unlocked!\n\n` : ''}` +
        `<b>💡 Next Steps:</b>\n` +
        `${isCompleted ? `• Contact support to unlock your device\n` : `• Continue making regular payments\n`}` +
        `${isCompleted ? `• Device will be unlocked by support\n` : `• Device unlocks after final payment\n`}` +
        `• Contact support if issues\n\n` +
        `📞 <b>Support:</b> @opuenekeke`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💰 Make Another Payment', 'device_make_payment')],
            [Markup.button.callback('📋 My Installments', 'device_my_installments')],
            [Markup.button.callback('📱 Menu', 'device_menu')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error in installment payment:', error);
      await ctx.reply('❌ Error processing payment. Please try again.', { parse_mode: 'HTML' });
    }
  }

  async notifyUserAboutUnlockedDevice(userId, installmentId) {
    try {
      const installment = await this.getInstallmentById(installmentId);
      if (!installment) return;
      
      const imeiMapping = await this.getIMEIByInstallmentId(installmentId);
      
      const message = `🎉 <b>CONGRATULATIONS!</b>\n\n` +
        `Your device is now fully paid!\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n` +
        `<b>Status:</b> Fully Paid & Ready to Unlock\n\n` +
        `${imeiMapping ? `📱 <b>IMEI:</b> ${imeiMapping.imei}\n` : ''}` +
        `<b>Next Steps:</b>\n` +
        `1. Contact support @opuenekeke\n` +
        `2. Your device will be unlocked\n` +
        `3. Enjoy your fully owned device!\n\n` +
        `Thank you for your business!`;
      
      await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
      
    } catch (error) {
      console.error('❌ Error notifying user:', error);
    }
  }

  async notifyAdminAboutCompletedInstallment(installmentId, userId) {
    try {
      const installment = await this.getInstallmentById(installmentId);
      if (!installment) return;
      
      const user = this.users[userId] || {};
      const username = user.username ? `@${user.username}` : `User ${userId}`;
      const imeiMapping = await this.getIMEIByInstallmentId(installmentId);
      
      const message = `✅ <b>INSTALLMENT COMPLETED - UNLOCK DEVICE</b>\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>User:</b> ${username} (${userId})\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n` +
        `<b>Total Paid:</b> ${this.formatCurrency(installment.totalWithInterest)}\n` +
        `<b>Payment Type:</b> Installment Plan\n` +
        `<b>Status:</b> Fully Paid\n\n` +
        `${imeiMapping ? `📱 <b>IMEI:</b> ${imeiMapping.imei}\n` : `⚠️ <b>IMEI:</b> Not assigned yet\n`}` +
        `<b>Action Required:</b>\n` +
        `${imeiMapping ? `• Unlock IMEI for device\n` : `• Assign IMEI first, then unlock\n`}` +
        `• Notify user device is ready\n\n` +
        `Use /unlockimei ${imeiMapping ? imeiMapping.imei : installmentId}`;
      
      const adminIds = ['1279640125', '8055762920'];
      
      for (const adminId of adminIds) {
        try {
          await this.bot.telegram.sendMessage(adminId, message, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              imeiMapping ? 
              [Markup.button.callback('🔓 Unlock IMEI', `admin_unlock_imei_${imeiMapping.imei}`)] :
              [Markup.button.callback('📱 Assign IMEI', `admin_assign_imei_${installmentId}`)],
              [Markup.button.callback('✅ Mark as Delivered', `admin_mark_delivered_${installmentId}`)]
            ])
          });
        } catch (error) {
          console.error(`❌ Error notifying admin ${adminId}:`, error);
        }
      }
      
    } catch (error) {
      console.error('❌ Error notifying admin about completed installment:', error);
    }
  }

  // ==================== DEPOSIT FUNDS ====================
  async handleDepositFunds(ctx) {
    try {
      const userId = ctx.from.id.toString();
      await this.safeAnswerCbQuery(ctx);
      
      const user = this.users[userId] || {};
      
      await ctx.reply(
        `💰 <b>DEPOSIT FUNDS</b>\n\n` +
        `<b>To add funds to your wallet:</b>\n\n` +
        `1. Contact support @opuenekeke\n` +
        `2. Request deposit details\n` +
        `3. Make payment to provided account\n` +
        `4. Send proof of payment\n` +
        `5. Funds will be added within 1-2 hours\n\n` +
        `<b>Current Balance:</b> ${this.formatCurrency(user.wallet || 0)}\n\n` +
        `<b>Why deposit?</b>\n` +
        `• Pay device down payments\n` +
        `• Make installment payments\n` +
        `• Buy devices outright\n` +
        `• Secure and instant\n\n` +
        `📞 <b>Support:</b> @opuenekeke`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 My Installments', 'device_my_installments')],
            [Markup.button.callback('📱 View Devices', 'device_view_devices')],
            [Markup.button.callback('📱 Menu', 'device_menu')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error in deposit funds:', error);
      await ctx.reply('❌ Error loading deposit information.', { parse_mode: 'HTML' });
    }
  }

  // ==================== ADMIN IMEI ASSIGNMENT ====================
  async handleAdminAssignIMEI(ctx, args) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!this.isUserAdmin(userId)) {
        await ctx.reply('❌ Admin access only', { parse_mode: 'HTML' });
        return;
      }
      
      if (!args) {
        this.imeiSessions[userId] = { action: 'assign_imei' };
        
        // Get installments without IMEI
        const installments = await this.loadInstallments();
        const imeiMappings = await this.loadIMEIMappings();
        const installmentsWithoutIMEI = installments.filter(installment => 
          (installment.status === 'active' || installment.status === 'completed') && 
          !imeiMappings.find(m => m.installmentId === installment.id)
        );
        
        if (installmentsWithoutIMEI.length === 0) {
          await ctx.reply(
            `📱 <b>NO INSTALLMENTS NEEDING IMEI</b>\n\n` +
            `All installments have IMEI assigned.\n\n` +
            `To assign IMEI manually:\n` +
            `<code>/assignimei INSTALLMENT_ID IMEI_NUMBER</code>\n\n` +
            `Example: /assignimei INS12345 123456789012345`,
            { parse_mode: 'HTML' }
          );
          return;
        }
        
        let message = `<b>📱 ASSIGN IMEI TO INSTALLMENT</b>\n\n`;
        message += `<b>Installments needing IMEI:</b>\n\n`;
        
        installmentsWithoutIMEI.forEach((installment, index) => {
          const user = this.users[installment.userId] || {};
          const username = user.username ? `@${user.username}` : `User ${installment.userId}`;
          
          message += `<b>${index + 1}. ${installment.deviceMake} ${installment.deviceModel}</b>\n`;
          message += `   🆔 <b>Installment ID:</b> ${installment.id}\n`;
          message += `   👤 <b>User:</b> ${username}\n`;
          message += `   💰 <b>Amount:</b> ${this.formatCurrency(installment.totalWithInterest)}\n`;
          message += `   📅 <b>Status:</b> ${installment.status}\n`;
          message += `   📱 <b>IMEI Status:</b> Not assigned\n\n`;
        });
        
        message += `<b>To assign IMEI:</b>\n`;
        message += `<code>/assignimei INSTALLMENT_ID IMEI_NUMBER</code>\n\n`;
        message += `<b>Or click button below:</b>`;
        
        const keyboard = installmentsWithoutIMEI.slice(0, 5).map(installment => [
          Markup.button.callback(
            `📱 Assign to ${installment.deviceMake}`,
            `admin_assign_imei_${installment.id}`
          )
        ]);
        
        keyboard.push([Markup.button.callback('📋 All Installments', 'admin_view_all_installments')]);
        
        await ctx.reply(message, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(keyboard)
        });
        return;
      }
      
      const parts = args.split(' ');
      if (parts.length < 2) {
        await ctx.reply(
          '❌ Invalid format. Use: <code>/assignimei INSTALLMENT_ID IMEI_NUMBER</code>\n' +
          'Example: <code>/assignimei INS12345 123456789012345</code>',
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      const installmentId = parts[0].trim();
      const imei = parts[1].trim();
      
      // Validate IMEI (basic validation)
      if (!imei.match(/^\d{15}$/)) {
        await ctx.reply('❌ Invalid IMEI. Must be 15 digits.', { parse_mode: 'HTML' });
        return;
      }
      
      // Get phone details if provided
      const phoneDetails = {};
      if (parts.length > 2) {
        phoneDetails.notes = parts.slice(2).join(' ');
      }
      
      const result = await this.assignIMEIToInstallment(installmentId, imei, phoneDetails);
      
      if (!result.success) {
        await ctx.reply(`❌ Error: ${result.error}`, { parse_mode: 'HTML' });
        return;
      }
      
      // Update installment IMEI status
      const installments = await this.loadInstallments();
      const installmentIndex = installments.findIndex(i => i.id === installmentId);
      
      if (installmentIndex !== -1) {
        installments[installmentIndex].imeiAssigned = true;
        installments[installmentIndex].imeiStatus = 'locked';
        installments[installmentIndex].updatedAt = new Date().toISOString();
        await this.saveInstallments(installments);
      }
      
      const installment = installments[installmentIndex];
      const user = this.users[installment.userId] || {};
      const username = user.username ? `@${user.username}` : `User ${installment.userId}`;
      
      // Notify user
      const userMessage = `📱 <b>IMEI ASSIGNED TO YOUR DEVICE</b>\n\n` +
        `Your device IMEI has been assigned.\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n` +
        `<b>IMEI:</b> ${imei}\n` +
        `<b>Status:</b> ${installment.status === 'completed' ? '🔓 Unlocked' : '🔒 Locked'}\n\n` +
        `${installment.status === 'completed' ? 
          '✅ Your device is fully paid and unlocked!\nContact support for collection.\n\n' : 
          '⚠️ Device is IMEI locked until fully paid.\nContinue making payments to unlock.\n\n'}` +
        `📞 <b>Support:</b> @opuenekeke`;
      
      try {
        await this.bot.telegram.sendMessage(installment.userId, userMessage, { parse_mode: 'HTML' });
      } catch (error) {
        console.error(`❌ Error notifying user ${installment.userId}:`, error);
      }
      
      await ctx.reply(
        `✅ <b>IMEI ASSIGNED SUCCESSFULLY</b>\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>User:</b> ${username} (${installment.userId})\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n` +
        `<b>IMEI:</b> ${imei}\n` +
        `<b>Status:</b> ${installment.status === 'completed' ? 'Unlocked' : 'Locked'}\n\n` +
        `<b>User has been notified.</b>\n\n` +
        `<b>Next Steps:</b>\n` +
        `${installment.status === 'completed' ? 
          '• Deliver unlocked device to user\n' : 
          '• Deliver locked device to user\n'}` +
        `• User continues payments${installment.status === 'completed' ? '' : ' to unlock device'}\n\n` +
        `Use /unlockimei ${imei} to unlock when paid`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔓 Unlock IMEI', `admin_unlock_imei_${imei}`)],
            [Markup.button.callback('📋 View Installment', `admin_view_installment_${installmentId}`)],
            [Markup.button.callback('📱 Assign Another', 'admin_assign_imei')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error assigning IMEI:', error);
      await ctx.reply('❌ Error assigning IMEI.', { parse_mode: 'HTML' });
    }
  }

  // ==================== ADMIN UNLOCK IMEI ====================
  async handleAdminUnlockIMEI(ctx, args) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!this.isUserAdmin(userId)) {
        await ctx.reply('❌ Admin access only', { parse_mode: 'HTML' });
        return;
      }
      
      if (!args) {
        await ctx.reply(
          '🔓 <b>UNLOCK IMEI</b>\n\n' +
          'Use: <code>/unlockimei IMEI_NUMBER</code>\n\n' +
          'Example: <code>/unlockimei 123456789012345</code>',
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      const imei = args.trim();
      const mapping = await this.getInstallmentByIMEI(imei);
      
      if (!mapping) {
        await ctx.reply(`❌ IMEI ${imei} not found in system.`, { parse_mode: 'HTML' });
        return;
      }
      
      if (mapping.imeiStatus === 'unlocked') {
        await ctx.reply(`ℹ️ IMEI ${imei} is already unlocked.`, { parse_mode: 'HTML' });
        return;
      }
      
      const result = await this.updateIMEIStatus(imei, 'unlocked', 'Manually unlocked by admin');
      
      if (!result.success) {
        await ctx.reply(`❌ Error: ${result.error}`, { parse_mode: 'HTML' });
        return;
      }
      
      // Update installment status
      const installments = await this.loadInstallments();
      const installmentIndex = installments.findIndex(i => i.id === mapping.installmentId);
      
      if (installmentIndex !== -1) {
        installments[installmentIndex].imeiStatus = 'unlocked';
        installments[installmentIndex].updatedAt = new Date().toISOString();
        await this.saveInstallments(installments);
      }
      
      // Notify user
      const userMessage = `🎉 <b>DEVICE UNLOCKED!</b>\n\n` +
        `Your device has been unlocked!\n\n` +
        `<b>Installment ID:</b> ${mapping.installmentId}\n` +
        `<b>Device:</b> ${mapping.deviceMake} ${mapping.deviceModel}\n` +
        `<b>IMEI:</b> ${imei}\n` +
        `<b>Status:</b> 🔓 Unlocked\n\n` +
        `Your device is now fully functional.\n` +
        `Thank you for your business!\n\n` +
        `📞 <b>Support:</b> @opuenekeke`;
      
      try {
        await this.bot.telegram.sendMessage(mapping.userId, userMessage, { parse_mode: 'HTML' });
      } catch (error) {
        console.error(`❌ Error notifying user ${mapping.userId}:`, error);
      }
      
      await ctx.reply(
        `✅ <b>IMEI UNLOCKED SUCCESSFULLY</b>\n\n` +
        `<b>IMEI:</b> ${imei}\n` +
        `<b>Installment ID:</b> ${mapping.installmentId}\n` +
        `<b>Device:</b> ${mapping.deviceMake} ${mapping.deviceModel}\n` +
        `<b>User:</b> ${mapping.userId}\n` +
        `<b>Unlocked At:</b> ${new Date().toLocaleString()}\n\n` +
        `<b>User has been notified.</b>\n\n` +
        `✅ <b>Device is now fully functional.</b>`,
        { parse_mode: 'HTML' }
      );
      
    } catch (error) {
      console.error('❌ Error unlocking IMEI:', error);
      await ctx.reply('❌ Error unlocking IMEI.', { parse_mode: 'HTML' });
    }
  }

  // ==================== ADMIN VIEW INSTALLMENTS ====================
  async handleAdminViewInstallments(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!this.isUserAdmin(userId)) {
        await ctx.reply('❌ Admin access only', { parse_mode: 'HTML' });
        return;
      }
      
      const installments = await this.loadInstallments();
      const imeiMappings = await this.loadIMEIMappings();
      
      if (installments.length === 0) {
        await ctx.reply('❌ No installments found.', { parse_mode: 'HTML' });
        return;
      }
      
      // Group by status
      const pending = installments.filter(i => i.status === 'pending');
      const active = installments.filter(i => i.status === 'active');
      const completed = installments.filter(i => i.status === 'completed');
      const defaulted = installments.filter(i => i.status === 'defaulted');
      
      let message = `<b>📊 INSTALLMENT OVERVIEW</b>\n\n`;
      message += `<b>📈 Statistics:</b>\n`;
      message += `• Total Installments: ${installments.length}\n`;
      message += `• Pending: ${pending.length}\n`;
      message += `• Active: ${active.length}\n`;
      message += `• Completed: ${completed.length}\n`;
      message += `• Defaulted: ${defaulted.length}\n`;
      message += `• With IMEI: ${imeiMappings.length}\n\n`;
      
      message += `<b>🔧 Admin Commands:</b>\n`;
      message += `<code>/assignimei</code> - Assign IMEI to installment\n`;
      message += `<code>/unlockimei</code> - Unlock IMEI\n`;
      message += `<code>/viewimei INSTALLMENT_ID</code> - View IMEI details\n`;
      message += `<code>/adddevice</code> - Add new device\n`;
      message += `<code>/addinventory</code> - Add inventory\n\n`;
      
      message += `<b>📱 Quick Actions:</b>`;
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('📋 Pending', 'admin_view_pending'),
            Markup.button.callback('🔄 Active', 'admin_view_active')
          ],
          [
            Markup.button.callback('✅ Completed', 'admin_view_completed'),
            Markup.button.callback('📱 No IMEI', 'admin_view_no_imei')
          ],
          [
            Markup.button.callback('📊 Statistics', 'admin_stats'),
            Markup.button.callback('🏠 Admin Menu', 'admin_menu')
          ]
        ])
      });
      
    } catch (error) {
      console.error('❌ Error viewing installments:', error);
      await ctx.reply('❌ Error loading installments.', { parse_mode: 'HTML' });
    }
  }

  // ==================== ADMIN CHECK ====================
  isUserAdmin(userId) {
    const ADMIN_IDS = ['1279640125', '8055762920'];
    return ADMIN_IDS.includes(userId.toString());
  }

  // ==================== ADMIN ADD DEVICE ====================
  async handleAdminAddDevice(ctx, args) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!this.isUserAdmin(userId)) {
        await ctx.reply('❌ Admin access only', { parse_mode: 'HTML' });
        return;
      }
      
      if (!args) {
        this.adminSessions[userId] = { action: 'add_device' };
        
        await ctx.reply(
          `📱 <b>ADD NEW DEVICE</b>\n\n` +
          `Please send device details in format:\n\n` +
          `<code>make:model:price:quantity</code>\n\n` +
          `<b>Example:</b>\n` +
          `iPhone:15 Pro Max:1050000:5\n\n` +
          `<b>Optional specs (add after quantity):</b>\n` +
          `storage:256GB|ram:8GB|color:Black|os:iOS 17\n\n` +
          `<b>Full Example:</b>\n` +
          `iPhone:15 Pro Max:1050000:5:storage:256GB|ram:8GB|color:Black\n\n` +
          `<b>Send now:</b>`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      const parts = args.split(':');
      if (parts.length < 4) {
        await ctx.reply(
          '❌ Invalid format. Use: <code>make:model:price:quantity</code>\n' +
          'Example: <code>iPhone:15 Pro Max:1050000:5</code>',
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      const make = parts[0].trim();
      const model = parts[1].trim();
      const price = parseInt(parts[2].replace(/\D/g, ''));
      const quantity = parseInt(parts[3].replace(/\D/g, ''));
      
      if (!make || !model || isNaN(price) || price <= 0 || isNaN(quantity) || quantity < 0) {
        await ctx.reply('❌ Invalid data. Make, model, price and quantity required.', { parse_mode: 'HTML' });
        return;
      }
      
      // Parse specs if provided
      const specs = {};
      if (parts.length > 4) {
        const specParts = parts.slice(4).join(':');
        const specPairs = specParts.split('|');
        specPairs.forEach(pair => {
          const [key, value] = pair.split(':');
          if (key && value) {
            specs[key.trim()] = value.trim();
          }
        });
      }
      
      const result = await this.addSimpleDevice({
        make,
        model,
        price,
        costPrice: Math.round(price * 0.85), // Assuming 15% margin
        specs,
        initialQuantity: quantity
      });
      
      if (!result.success) {
        await ctx.reply(`❌ Error: ${result.error}`, { parse_mode: 'HTML' });
        return;
      }
      
      await ctx.reply(
        `✅ <b>DEVICE ADDED SUCCESSFULLY</b>\n\n` +
        `<b>Device:</b> ${make} ${model}\n` +
        `<b>Price:</b> ${this.formatCurrency(price)}\n` +
        `<b>Installment Price (6 months):</b> ${this.formatCurrency(price * 1.35)}\n` +
        `<b>Quantity:</b> ${quantity}\n` +
        `<b>Device ID:</b> ${result.deviceId}\n\n` +
        `<b>Specs:</b>\n` +
        `${Object.keys(specs).length > 0 ? Object.entries(specs).map(([k, v]) => `• ${k}: ${v}`).join('\n') : 'No additional specs'}\n\n` +
        `✅ <b>Inventory automatically updated</b>\n\n` +
        `Use /addinventory ${result.deviceId}:quantity to add more stock`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📱 View Devices', 'device_view_devices')],
            [Markup.button.callback('📦 Add More Inventory', 'admin_add_inventory_button')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error in admin add device:', error);
      await ctx.reply('❌ Error adding device', { parse_mode: 'HTML' });
    }
  }

  // ==================== ADD INVENTORY ====================
  async handleAdminAddInventory(ctx, args) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!this.isUserAdmin(userId)) {
        await ctx.reply('❌ Admin access only', { parse_mode: 'HTML' });
        return;
      }
      
      if (!args) {
        this.adminSessions[userId] = { action: 'add_inventory' };
        
        const devices = await this.loadDevices();
        
        if (devices.length === 0) {
          await ctx.reply('❌ No devices found. Add devices first.', { parse_mode: 'HTML' });
          return;
        }
        
        let deviceList = '<b>Available devices:</b>\n';
        devices.forEach(device => {
          deviceList += `• ${device.id} - ${device.make} ${device.model}\n`;
        });
        
        await ctx.reply(
          `📦 <b>ADD INVENTORY</b>\n\n` +
          `${deviceList}\n\n` +
          `Send: <code>deviceId:quantity</code>\n` +
          `Example: <code>DEV12345:5</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }
      
      const parts = args.split(':');
      if (parts.length < 2) {
        await ctx.reply('❌ Use: deviceId:quantity', { parse_mode: 'HTML' });
        return;
      }
      
      const deviceId = parts[0].trim();
      const quantity = parseInt(parts[1].replace(/\D/g, ''));
      
      if (!deviceId || isNaN(quantity) || quantity <= 0) {
        await ctx.reply('❌ Invalid device ID or quantity', { parse_mode: 'HTML' });
        return;
      }
      
      const devices = await this.loadDevices();
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        await ctx.reply(`❌ Device ${deviceId} not found`, { parse_mode: 'HTML' });
        return;
      }
      
      const result = await this.addToInventory(deviceId, quantity);
      
      if (!result.success) {
        await ctx.reply(`❌ Error: ${result.error}`, { parse_mode: 'HTML' });
        return;
      }
      
      await ctx.reply(
        `✅ <b>INVENTORY ADDED</b>\n\n` +
        `<b>Device:</b> ${device.make} ${device.model}\n` +
        `<b>Quantity:</b> ${quantity}\n` +
        `<b>Device ID:</b> ${deviceId}`,
        { parse_mode: 'HTML' }
      );
      
    } catch (error) {
      console.error('❌ Error adding inventory:', error);
      await ctx.reply('❌ Error adding inventory', { parse_mode: 'HTML' });
    }
  }

  // ==================== TEXT HANDLER ====================
  async handleTextMessage(ctx, text, userSession = null) {
    try {
      const userId = ctx.from.id.toString();
      const trimmedText = text.trim().toLowerCase();
      
      console.log(`📱 DeviceHandler handling text: "${text}" for user ${userId}`);
      
      // Check admin sessions
      if (this.adminSessions[userId]) {
        const session = this.adminSessions[userId];
        
        if (session.action === 'add_device') {
          await this.handleAdminAddDevice(ctx, text);
          delete this.adminSessions[userId];
          return true;
        }
        
        if (session.action === 'add_inventory') {
          await this.handleAdminAddInventory(ctx, text);
          delete this.adminSessions[userId];
          return true;
        }
      }
      
      // Check IMEI sessions
      if (this.imeiSessions[userId]) {
        const session = this.imeiSessions[userId];
        
        if (session.action === 'assign_imei') {
          await this.handleAdminAssignIMEI(ctx, text);
          delete this.imeiSessions[userId];
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ DeviceHandler text handler error:', error);
      return false;
    }
  }

  // ==================== COMMAND HANDLER ====================
  async handleCommand(ctx, command, args) {
    try {
      console.log(`🔧 Command: ${command} ${args}`);
      
      switch (command) {
        case 'adddevice':
          await this.handleAdminAddDevice(ctx, args);
          break;
          
        case 'addinventory':
          await this.handleAdminAddInventory(ctx, args);
          break;
          
        case 'devices':
          await this.viewSimpleDevices(ctx, 0);
          break;
          
        case 'mypurchases':
          await this.handleMyInstallments(ctx);
          break;
          
        case 'assignimei':
          await this.handleAdminAssignIMEI(ctx, args);
          break;
          
        case 'unlockimei':
          await this.handleAdminUnlockIMEI(ctx, args);
          break;
          
        case 'viewinstallments':
          await this.handleAdminViewInstallments(ctx);
          break;
          
        default:
          await this.showDeviceMenu(ctx);
          break;
      }
      
    } catch (error) {
      console.error('❌ Command handler error:', error);
      await ctx.reply('❌ Error processing command', { parse_mode: 'HTML' });
    }
  }

  // ==================== DEVICE MENU ====================
  async handleDeviceMenu(ctx) {
    try {
      await this.safeAnswerCbQuery(ctx);
      return await this.showDeviceMenu(ctx);
    } catch (error) {
      console.error('❌ handleDeviceMenu error:', error);
      await ctx.reply('❌ Error loading device menu.', { parse_mode: 'HTML' });
    }
  }

  async showDeviceMenu(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = this.users[userId] || {};
      const walletBalance = user.wallet || 0;
      
      const installments = await this.getUserInstallments(userId);
      const activeInstallments = installments.filter(i => i.status === 'active');
      const pendingPayments = (await this.getUserPayments(userId)).filter(p => p.status === 'pending');
      
      const keyboard = [
        [Markup.button.callback('📱 View Devices', 'device_view_devices')],
        [Markup.button.callback('📋 My Installments', 'device_my_installments')],
        [Markup.button.callback('💰 Make Payment', 'device_make_payment')],
        [Markup.button.callback('💳 Deposit Funds', 'device_deposit_funds')]
      ];
      
      if (this.isUserAdmin(userId)) {
        keyboard.unshift([
          Markup.button.callback('📱 Add Device', 'admin_add_device_button'),
          Markup.button.callback('📦 Add Inventory', 'admin_add_inventory_button')
        ]);
        keyboard.unshift([
          Markup.button.callback('🔧 Admin Panel', 'admin_view_installments'),
          Markup.button.callback('📱 Assign IMEI', 'admin_assign_imei')
        ]);
      }
      
      keyboard.push([Markup.button.callback('🏠 Home', 'start')]);
      
      let paymentInfo = '';
      if (pendingPayments.length > 0) {
        const totalDue = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
        paymentInfo = `\n💰 <b>Pending Payments:</b> ${pendingPayments.length} (${this.formatCurrency(totalDue)})`;
      }
      
      let imeiInfo = '';
      const imeiMappings = await this.getUserIMEIMappings(userId);
      const lockedDevices = imeiMappings.filter(m => m.imeiStatus === 'locked');
      if (lockedDevices.length > 0) {
        imeiInfo = `\n🔒 <b>Locked Devices:</b> ${lockedDevices.length}`;
      }
      
      await ctx.reply(
        `<b>📱 DEVICE FINANCING WITH IMEI LOCK</b>\n\n` +
        `<b>Your Wallet:</b> ${this.formatCurrency(walletBalance)}\n` +
        `<b>Active Installments:</b> ${activeInstallments.length}\n` +
        `${paymentInfo}` +
        `${imeiInfo}\n\n` +
        `<b>💡 HOW IT WORKS:</b>\n` +
        `1. Browse available devices\n` +
        `2. Choose payment plan (Full or Installment)\n` +
        `3. Pay 30% down payment for installment\n` +
        `4. Contact support for device collection\n` +
        `5. Support assigns IMEI to your installment\n` +
        `6. Device is IMEI locked\n` +
        `7. Make regular payments\n` +
        `8. Device unlocked after full payment\n\n` +
        `<b>📋 INSTALLMENT TERMS:</b>\n` +
        `• 30% Down Payment Required\n` +
        `• 35% Interest (6 months max)\n` +
        `• Daily/Weekly/Monthly options\n` +
        `• IMEI locked until fully paid\n\n` +
        `📞 <b>Support:</b> @opuenekeke`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(keyboard)
        }
      );
      
    } catch (error) {
      console.error('❌ Menu error:', error);
      await ctx.reply('❌ Error loading menu', { parse_mode: 'HTML' });
    }
  }

  // ==================== CALLBACKS ====================
  getCallbacks() {
    console.log('🔧 Creating callbacks for installment financing with IMEI tracking...');
    
    const self = this;
    
    const callbacks = {
      // Main menu
      'device_menu': async (ctx) => {
        await self.handleDeviceMenu(ctx);
      },
      
      // View devices
      'device_view_devices': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        await self.viewSimpleDevices(ctx, 0);
      },
      
      // Dynamic patterns
      'devices_page_(\\d+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/devices_page_(\d+)/);
        if (match) {
          const page = parseInt(match[1]);
          await self.safeAnswerCbQuery(ctx);
          await self.viewSimpleDevices(ctx, page);
        }
      },
      
      'buy_device_(.+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/buy_device_(.+)/);
        if (match) {
          const deviceId = match[1];
          await self.handleBuyDevice(ctx, deviceId);
        }
      },
      
      'installment_plan_(.+)_(.+)_(\\d+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/installment_plan_(.+)_(.+)_(\d+)/);
        if (match) {
          const deviceId = match[1];
          const planType = match[2];
          const months = parseInt(match[3]);
          await self.handleInstallmentPlan(ctx, deviceId, planType, months);
        }
      },
      
      'pay_full_(.+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/pay_full_(.+)/);
        if (match) {
          const deviceId = match[1];
          await self.handleFullPayment(ctx, deviceId);
        }
      },
      
      'pay_down_(.+)_(.+)_(\\d+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/pay_down_(.+)_(.+)_(\d+)/);
        if (match) {
          const deviceId = match[1];
          const planType = match[2];
          const months = parseInt(match[3]);
          await self.handlePayDownPayment(ctx, deviceId, planType, months);
        }
      },
      
      'pay_installment_(.+)_(.+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/pay_installment_(.+)_(.+)/);
        if (match) {
          const installmentId = match[1];
          const paymentId = match[2];
          await self.handlePayInstallment(ctx, installmentId, paymentId);
        }
      },
      
      // User features
      'device_my_installments': async (ctx) => {
        await self.handleMyInstallments(ctx);
      },
      
      'device_make_payment': async (ctx) => {
        await self.handleMakePayment(ctx);
      },
      
      'device_deposit_funds': async (ctx) => {
        await self.handleDepositFunds(ctx);
      },
      
      // Admin buttons
      'admin_add_device_button': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        const userId = ctx.from.id.toString();
        
        if (!self.isUserAdmin(userId)) {
          await self.safeAnswerCbQuery(ctx, '❌ Admin only');
          return;
        }
        
        self.adminSessions[userId] = { action: 'add_device' };
        
        await ctx.reply(
          `📱 <b>ADD NEW DEVICE</b>\n\n` +
          `Send device details in format:\n\n` +
          `<code>make:model:price:quantity</code>\n\n` +
          `<b>Example:</b>\n` +
          `iPhone:15 Pro Max:1050000:5\n\n` +
          `<b>Send now:</b>`,
          { parse_mode: 'HTML' }
        );
      },
      
      'admin_add_inventory_button': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        const userId = ctx.from.id.toString();
        
        if (!self.isUserAdmin(userId)) {
          await self.safeAnswerCbQuery(ctx, '❌ Admin only');
          return;
        }
        
        const devices = await self.loadDevices();
        
        if (devices.length === 0) {
          await ctx.reply('❌ No devices found. Add devices first.', { parse_mode: 'HTML' });
          return;
        }
        
        let deviceList = '<b>Available devices:</b>\n';
        devices.forEach(device => {
          deviceList += `• ${device.id} - ${device.make} ${device.model}\n`;
        });
        
        self.adminSessions[userId] = { action: 'add_inventory' };
        
        await ctx.reply(
          `📦 <b>ADD INVENTORY</b>\n\n` +
          `${deviceList}\n\n` +
          `Send: <code>deviceId:quantity</code>\n` +
          `Example: <code>DEV12345:5</code>\n\n` +
          `<b>Send now:</b>`,
          { parse_mode: 'HTML' }
        );
      },
      
      // Admin IMEI management
      'admin_assign_imei': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        const userId = ctx.from.id.toString();
        
        if (!self.isUserAdmin(userId)) {
          await self.safeAnswerCbQuery(ctx, '❌ Admin only');
          return;
        }
        
        self.imeiSessions[userId] = { action: 'assign_imei' };
        
        await ctx.reply(
          `📱 <b>ASSIGN IMEI</b>\n\n` +
          `Send installment ID and IMEI in format:\n\n` +
          `<code>INSTALLMENT_ID IMEI_NUMBER</code>\n\n` +
          `<b>Example:</b>\n` +
          `<code>INS12345 123456789012345</code>\n\n` +
          `<b>Send now:</b>`,
          { parse_mode: 'HTML' }
        );
      },
      
      'admin_assign_imei_(.+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/admin_assign_imei_(.+)/);
        if (match) {
          const installmentId = match[1];
          await self.safeAnswerCbQuery(ctx);
          
          const userId = ctx.from.id.toString();
          if (!self.isUserAdmin(userId)) {
            await ctx.reply('❌ Admin only', { parse_mode: 'HTML' });
            return;
          }
          
          self.imeiSessions[userId] = { 
            action: 'assign_imei',
            installmentId: installmentId
          };
          
          await ctx.reply(
            `📱 <b>ASSIGN IMEI TO INSTALLMENT</b>\n\n` +
            `<b>Installment ID:</b> ${installmentId}\n\n` +
            `Send IMEI number (15 digits):\n\n` +
            `<b>Example:</b>\n` +
            `<code>123456789012345</code>\n\n` +
            `<b>Send now:</b>`,
            { parse_mode: 'HTML' }
          );
        }
      },
      
      'admin_unlock_imei_(.+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/admin_unlock_imei_(.+)/);
        if (match) {
          const imei = match[1];
          await self.safeAnswerCbQuery(ctx);
          
          const userId = ctx.from.id.toString();
          if (!self.isUserAdmin(userId)) {
            await ctx.reply('❌ Admin only', { parse_mode: 'HTML' });
            return;
          }
          
          await self.handleAdminUnlockIMEI(ctx, imei);
        }
      },
      
      'admin_view_installment_(.+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/admin_view_installment_(.+)/);
        if (match) {
          const installmentId = match[1];
          await self.safeAnswerCbQuery(ctx);
          
          const userId = ctx.from.id.toString();
          if (!self.isUserAdmin(userId)) {
            await ctx.reply('❌ Admin only', { parse_mode: 'HTML' });
            return;
          }
          
          await self.showAdminInstallmentDetails(ctx, installmentId);
        }
      },
      
      'admin_view_installments': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        const userId = ctx.from.id.toString();
        
        if (!self.isUserAdmin(userId)) {
          await ctx.reply('❌ Admin only', { parse_mode: 'HTML' });
          return;
        }
        
        await self.handleAdminViewInstallments(ctx);
      },
      
      'admin_view_all_installments': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        await self.handleAdminViewInstallments(ctx);
      },
      
      'admin_view_pending': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        await self.showAdminInstallmentsByStatus(ctx, 'pending');
      },
      
      'admin_view_active': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        await self.showAdminInstallmentsByStatus(ctx, 'active');
      },
      
      'admin_view_completed': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        await self.showAdminInstallmentsByStatus(ctx, 'completed');
      },
      
      'admin_view_no_imei': async (ctx) => {
        await self.safeAnswerCbQuery(ctx);
        await self.showAdminInstallmentsWithoutIMEI(ctx);
      },
      
      'admin_mark_delivered_(.+)': async (ctx) => {
        const match = ctx.callbackQuery.data.match(/admin_mark_delivered_(.+)/);
        if (match) {
          const installmentId = match[1];
          await self.safeAnswerCbQuery(ctx);
          
          const userId = ctx.from.id.toString();
          if (!self.isUserAdmin(userId)) {
            await ctx.reply('❌ Admin only', { parse_mode: 'HTML' });
            return;
          }
          
          await self.markInstallmentAsDelivered(ctx, installmentId);
        }
      }
    };
    
    return callbacks;
  }

  // ==================== ADMIN HELPER METHODS ====================
  async showAdminInstallmentDetails(ctx, installmentId) {
    try {
      const installment = await this.getInstallmentById(installmentId);
      if (!installment) {
        await ctx.reply('❌ Installment not found.', { parse_mode: 'HTML' });
        return;
      }
      
      const user = this.users[installment.userId] || {};
      const payments = await this.getUserPayments(installment.userId);
      const installmentPayments = payments.filter(p => p.installmentId === installmentId);
      const imeiMapping = await this.getIMEIByInstallmentId(installmentId);
      
      let message = `<b>📋 INSTALLMENT DETAILS</b>\n\n`;
      message += `<b>Installment ID:</b> ${installment.id}\n`;
      message += `<b>Purchase ID:</b> ${installment.purchaseId}\n`;
      message += `<b>User:</b> ${user.username ? `@${user.username}` : `User ${installment.userId}`}\n`;
      message += `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n`;
      message += `<b>Plan:</b> ${installment.planType} for ${installment.months} months\n`;
      message += `<b>Status:</b> ${installment.status.toUpperCase()}\n`;
      message += `<b>Total Amount:</b> ${this.formatCurrency(installment.totalWithInterest)}\n`;
      message += `<b>Down Payment:</b> ${this.formatCurrency(installment.downPayment)}\n`;
      message += `<b>Installment Amount:</b> ${this.formatCurrency(installment.installmentAmount)}\n`;
      message += `<b>Payments Made:</b> ${installment.installmentsPaid} of ${installment.totalInstallments + 1}\n`;
      message += `<b>Created:</b> ${new Date(installment.createdAt).toLocaleString()}\n\n`;
      
      if (imeiMapping) {
        message += `<b>📱 IMEI DETAILS</b>\n`;
        message += `• IMEI: ${imeiMapping.imei}\n`;
        message += `• Status: ${imeiMapping.imeiStatus}\n`;
        message += `• Assigned: ${new Date(imeiMapping.assignedAt).toLocaleString()}\n`;
        message += `• Unlocked: ${imeiMapping.unlockedAt ? new Date(imeiMapping.unlockedAt).toLocaleString() : 'Not yet'}\n\n`;
      } else {
        message += `⚠️ <b>IMEI NOT ASSIGNED</b>\n\n`;
      }
      
      message += `<b>📊 PAYMENT HISTORY</b>\n`;
      installmentPayments.forEach(payment => {
        message += `• ${payment.paymentType === 'down_payment' ? 'Down Payment' : `Installment ${payment.installmentNumber}`}: `;
        message += `${this.formatCurrency(payment.amount)} - ${payment.status} `;
        message += payment.paidAt ? `(Paid: ${new Date(payment.paidAt).toLocaleDateString()})` : `(Due: ${new Date(payment.dueDate).toLocaleDateString()})`;
        message += `\n`;
      });
      
      const keyboard = [];
      
      if (!imeiMapping) {
        keyboard.push([Markup.button.callback('📱 Assign IMEI', `admin_assign_imei_${installmentId}`)]);
      } else if (imeiMapping.imeiStatus === 'locked' && installment.status === 'completed') {
        keyboard.push([Markup.button.callback('🔓 Unlock IMEI', `admin_unlock_imei_${imeiMapping.imei}`)]);
      }
      
      keyboard.push([
        Markup.button.callback('✅ Mark Delivered', `admin_mark_delivered_${installmentId}`),
        Markup.button.callback('📋 All Installments', 'admin_view_installments')
      ]);
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ Error showing installment details:', error);
      await ctx.reply('❌ Error loading installment details.', { parse_mode: 'HTML' });
    }
  }
  
  async showAdminInstallmentsByStatus(ctx, status) {
    try {
      const installments = await this.loadInstallments();
      const filtered = installments.filter(i => i.status === status);
      
      if (filtered.length === 0) {
        await ctx.reply(`No ${status} installments found.`, { parse_mode: 'HTML' });
        return;
      }
      
      let message = `<b>${status.toUpperCase()} INSTALLMENTS</b>\n\n`;
      message += `<b>Total: ${filtered.length}</b>\n\n`;
      
      filtered.slice(0, 10).forEach((installment, index) => {
        const user = this.users[installment.userId] || {};
        const username = user.username ? `@${user.username}` : `User ${installment.userId}`;
        
        message += `<b>${index + 1}. ${installment.deviceMake} ${installment.deviceModel}</b>\n`;
        message += `   🆔 ${installment.id}\n`;
        message += `   👤 ${username}\n`;
        message += `   💰 ${this.formatCurrency(installment.totalWithInterest)}\n`;
        message += `   📅 ${installment.planType} for ${installment.months} months\n`;
        message += `   📊 ${installment.installmentsPaid}/${installment.totalInstallments + 1} payments\n\n`;
      });
      
      if (filtered.length > 10) {
        message += `... and ${filtered.length - 10} more\n\n`;
      }
      
      const keyboard = filtered.slice(0, 5).map(installment => [
        Markup.button.callback(
          `📱 ${installment.deviceMake.substring(0, 10)}`,
          `admin_view_installment_${installment.id}`
        )
      ]);
      
      keyboard.push([Markup.button.callback('📋 All Installments', 'admin_view_installments')]);
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ Error showing installments by status:', error);
      await ctx.reply('❌ Error loading installments.', { parse_mode: 'HTML' });
    }
  }
  
  async showAdminInstallmentsWithoutIMEI(ctx) {
    try {
      const installments = await this.loadInstallments();
      const imeiMappings = await this.loadIMEIMappings();
      
      const withoutIMEI = installments.filter(installment => 
        (installment.status === 'active' || installment.status === 'completed') && 
        !imeiMappings.find(m => m.installmentId === installment.id)
      );
      
      if (withoutIMEI.length === 0) {
        await ctx.reply('✅ All installments have IMEI assigned.', { parse_mode: 'HTML' });
        return;
      }
      
      let message = `<b>📱 INSTALLMENTS WITHOUT IMEI</b>\n\n`;
      message += `<b>Total: ${withoutIMEI.length}</b>\n\n`;
      
      withoutIMEI.slice(0, 10).forEach((installment, index) => {
        const user = this.users[installment.userId] || {};
        const username = user.username ? `@${user.username}` : `User ${installment.userId}`;
        
        message += `<b>${index + 1}. ${installment.deviceMake} ${installment.deviceModel}</b>\n`;
        message += `   🆔 ${installment.id}\n`;
        message += `   👤 ${username}\n`;
        message += `   📅 ${installment.status.toUpperCase()}\n`;
        message += `   💰 ${this.formatCurrency(installment.totalWithInterest)}\n\n`;
      });
      
      const keyboard = withoutIMEI.slice(0, 5).map(installment => [
        Markup.button.callback(
          `📱 Assign to ${installment.deviceMake}`,
          `admin_assign_imei_${installment.id}`
        )
      ]);
      
      keyboard.push([Markup.button.callback('📋 All Installments', 'admin_view_installments')]);
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ Error showing installments without IMEI:', error);
      await ctx.reply('❌ Error loading installments.', { parse_mode: 'HTML' });
    }
  }
  
  async markInstallmentAsDelivered(ctx, installmentId) {
    try {
      const installment = await this.getInstallmentById(installmentId);
      if (!installment) {
        await ctx.reply('❌ Installment not found.', { parse_mode: 'HTML' });
        return;
      }
      
      const imeiMapping = await this.getIMEIByInstallmentId(installmentId);
      const user = this.users[installment.userId] || {};
      
      // Notify user
      const userMessage = `📦 <b>DEVICE DELIVERED</b>\n\n` +
        `Your device has been marked as delivered.\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n` +
        `${imeiMapping ? `<b>IMEI:</b> ${imeiMapping.imei}\n` : ''}` +
        `<b>Status:</b> ${imeiMapping?.imeiStatus === 'locked' ? '🔒 Locked' : '🔓 Unlocked'}\n\n` +
        `${imeiMapping?.imeiStatus === 'locked' ? 
          'Continue making payments to unlock your device.\n' : 
          'Your device is fully paid and unlocked. Enjoy!\n'}` +
        `📞 <b>Support:</b> @opuenekeke`;
      
      try {
        await this.bot.telegram.sendMessage(installment.userId, userMessage, { parse_mode: 'HTML' });
      } catch (error) {
        console.error(`❌ Error notifying user ${installment.userId}:`, error);
      }
      
      await ctx.reply(
        `✅ <b>MARKED AS DELIVERED</b>\n\n` +
        `<b>Installment ID:</b> ${installmentId}\n` +
        `<b>User:</b> ${installment.userId}\n` +
        `<b>Device:</b> ${installment.deviceMake} ${installment.deviceModel}\n\n` +
        `<b>User has been notified.</b>\n\n` +
        `✅ <b>Delivery process completed.</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 View Installment', `admin_view_installment_${installmentId}`)],
            [Markup.button.callback('📱 Next Installment', 'admin_view_installments')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error marking as delivered:', error);
      await ctx.reply('❌ Error updating delivery status.', { parse_mode: 'HTML' });
    }
  }

  // ==================== INITIALIZE ====================
  async initialize() {
    console.log('✅ DeviceHandler initialized with installment financing + IMEI tracking');
    return true;
  }
}

// ==================== EXPORT ====================
module.exports = DeviceHandler;