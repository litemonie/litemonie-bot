// /app/deviceCredit/DeviceCreditSystem.js
const fs = require('fs').promises;
const path = require('path');

class DeviceCreditSystem {
  constructor(dataDir, users = {}) {
    console.log('🔧 DeviceCreditSystem constructor called with:', { 
      dataDir: typeof dataDir, 
      hasUsers: !!users 
    });
    
    // Ensure dataDir is a string
    if (typeof dataDir !== 'string') {
      console.error('❌ dataDir must be a string, received:', typeof dataDir, dataDir);
      dataDir = './data'; // Default fallback
    }
    
    this.dataDir = dataDir;
    this.users = users;
    
    // Initialize paths AFTER ensuring dataDir is string
    this.devicesFile = path.join(this.dataDir, 'devices.json');
    this.purchasesFile = path.join(this.dataDir, 'purchases.json');
    
    this.devices = [];
    this.purchases = [];
  }
  
  async initialize() {
    try {
      console.log('📁 Initializing DeviceCreditSystem with dataDir:', this.dataDir);
      
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load or create devices
      await this.loadDevices();
      
      // Load or create purchases
      await this.loadPurchases();
      
      console.log(`✅ DeviceCreditSystem initialized with ${this.devices.length} devices and ${this.purchases.length} purchases`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize DeviceCreditSystem:', error.message);
      throw error;
    }
  }
  
  async loadDevices() {
    try {
      const data = await fs.readFile(this.devicesFile, 'utf8');
      this.devices = JSON.parse(data);
      console.log(`📦 Loaded ${this.devices.length} devices from file`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create with sample data
        await this.createSampleDevices();
      } else {
        console.error('❌ Error loading devices:', error.message);
        // Create empty array
        this.devices = [];
        await this.saveDevices();
      }
    }
  }
  
  async createSampleDevices() {
    this.devices = [
      {
        id: 'TEC-CAMON19-001',
        make: 'Tecno',
        model: 'Camon 19',
        costPrice: 80000,
        sellingPrice: 104000,
        quantity: 10,
        status: 'available',
        addedBy: 'system',
        createdAt: new Date().toISOString()
      },
      {
        id: 'IPH-13-001',
        make: 'iPhone',
        model: '13',
        costPrice: 300000,
        sellingPrice: 390000,
        quantity: 5,
        status: 'available',
        addedBy: 'system',
        createdAt: new Date().toISOString()
      },
      {
        id: 'SAM-S22-001',
        make: 'Samsung',
        model: 'S22',
        costPrice: 250000,
        sellingPrice: 325000,
        quantity: 8,
        status: 'available',
        addedBy: 'system',
        createdAt: new Date().toISOString()
      }
    ];
    
    await this.saveDevices();
    console.log('📦 Created sample devices');
  }
  
  async loadPurchases() {
    try {
      const data = await fs.readFile(this.purchasesFile, 'utf8');
      this.purchases = JSON.parse(data);
      console.log(`📋 Loaded ${this.purchases.length} purchases from file`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create empty file
        this.purchases = [];
        await this.savePurchases();
      } else {
        console.error('❌ Error loading purchases:', error.message);
        this.purchases = [];
      }
    }
  }
  
  async saveDevices() {
    try {
      await fs.writeFile(this.devicesFile, JSON.stringify(this.devices, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Error saving devices:', error.message);
      return false;
    }
  }
  
  async savePurchases() {
    try {
      await fs.writeFile(this.purchasesFile, JSON.stringify(this.purchases, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Error saving purchases:', error.message);
      return false;
    }
  }
  
  // ==================== PUBLIC METHODS ====================
  
  async getDeviceById(deviceId) {
    return this.devices.find(device => device.id === deviceId);
  }
  
  async getAvailableDevices() {
    return this.devices.filter(device => device.status === 'available' && device.quantity > 0);
  }
  
  async getAllDevices() {
    return this.devices;
  }
  
  async createPurchase(purchaseData) {
    try {
      const { deviceId, userId } = purchaseData;
      
      // Find device
      const device = await this.getDeviceById(deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      
      if (device.status !== 'available' || device.quantity <= 0) {
        return { success: false, error: 'Device not available' };
      }
      
      // Create purchase object
      const purchase = {
        id: `PUR${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
        deviceId: deviceId,
        userId: userId,
        deviceMake: device.make,
        deviceModel: device.model,
        totalPrice: device.sellingPrice,
        downPayment: purchaseData.downPayment || 0,
        remainingBalance: purchaseData.remainingBalance || device.sellingPrice,
        paymentPlan: purchaseData.paymentPlan || 'full',
        durationMonths: purchaseData.durationMonths || 1,
        monthlyPayment: purchaseData.monthlyPayment || device.sellingPrice,
        marketerId: purchaseData.marketerId || null,
        commission: purchaseData.commission || 0,
        status: 'active',
        purchaseDate: new Date().toISOString(),
        payments: []
      };
      
      // Add down payment if specified
      if (purchaseData.downPayment > 0) {
        purchase.payments.push({
          amount: purchaseData.downPayment,
          date: new Date().toISOString(),
          type: 'down_payment'
        });
      }
      
      // Reduce device quantity
      device.quantity -= 1;
      if (device.quantity === 0) {
        device.status = 'sold_out';
      }
      
      // Add to purchases
      this.purchases.push(purchase);
      
      // Save changes
      await this.saveDevices();
      await this.savePurchases();
      
      return { 
        success: true, 
        purchase: purchase,
        message: 'Purchase created successfully'
      };
      
    } catch (error) {
      console.error('❌ Error creating purchase:', error);
      return { success: false, error: error.message };
    }
  }
  
  async getPurchaseById(purchaseId) {
    return this.purchases.find(p => p.id === purchaseId);
  }
  
  async getUserPurchases(userId) {
    return this.purchases.filter(p => p.userId === userId);
  }
  
  async processPayment(userId, deviceId, amount) {
    try {
      // Find purchase
      const purchase = this.purchases.find(p => 
        p.userId === userId && 
        p.deviceId === deviceId && 
        p.status === 'active'
      );
      
      if (!purchase) {
        return { success: false, error: 'No active purchase found for this device' };
      }
      
      if (amount <= 0) {
        return { success: false, error: 'Amount must be greater than 0' };
      }
      
      if (amount > purchase.remainingBalance) {
        return { success: false, error: 'Amount exceeds remaining balance' };
      }
      
      // Add payment
      purchase.payments.push({
        amount: amount,
        date: new Date().toISOString(),
        type: 'installment'
      });
      
      // Update remaining balance
      purchase.remainingBalance -= amount;
      
      // Update status if fully paid
      if (purchase.remainingBalance <= 0) {
        purchase.remainingBalance = 0;
        purchase.status = 'paid';
      }
      
      // Save changes
      await this.savePurchases();
      
      return {
        success: true,
        purchase: purchase,
        message: `Payment of ₦${amount.toLocaleString()} processed successfully`
      };
      
    } catch (error) {
      console.error('❌ Error processing payment:', error);
      return { success: false, error: error.message };
    }
  }
  
  async getDeviceStats() {
    const stats = {
      totalDevices: this.devices.reduce((sum, device) => sum + device.quantity, 0),
      available: this.devices.reduce((sum, device) => {
        if (device.status === 'available') return sum + device.quantity;
        return sum;
      }, 0),
      sold: this.purchases.length,
      totalRevenue: this.purchases.reduce((sum, purchase) => sum + purchase.totalPrice, 0),
      totalProfit: this.purchases.reduce((sum, purchase) => {
        const device = this.devices.find(d => d.id === purchase.deviceId);
        if (device) {
          return sum + (purchase.totalPrice - device.costPrice);
        }
        return sum;
      }, 0),
      activePurchases: this.purchases.filter(p => p.status === 'active').length,
      completedPurchases: this.purchases.filter(p => p.status === 'paid').length,
      byMake: {}
    };
    
    // Calculate by brand
    this.devices.forEach(device => {
      if (!stats.byMake[device.make]) {
        const devicePurchases = this.purchases.filter(p => p.deviceId === device.id);
        stats.byMake[device.make] = {
          total: device.quantity,
          sold: devicePurchases.length,
          revenue: devicePurchases.reduce((sum, p) => sum + p.totalPrice, 0),
          profit: devicePurchases.reduce((sum, p) => {
            const device = this.devices.find(d => d.id === p.deviceId);
            return device ? sum + (p.totalPrice - device.costPrice) : sum;
          }, 0)
        };
      }
    });
    
    return stats;
  }
  
  async getMarketerSales(marketerId) {
    return this.purchases.filter(purchase => purchase.marketerId === marketerId);
  }
  
  async addDevice(deviceData) {
    try {
      const device = {
        id: deviceData.id || `${deviceData.make.substr(0, 3).toUpperCase()}-${deviceData.model.replace(/\s+/g, '-').toUpperCase()}-${Date.now().toString(36)}`,
        make: deviceData.make,
        model: deviceData.model,
        costPrice: deviceData.costPrice,
        sellingPrice: deviceData.sellingPrice || Math.ceil(deviceData.costPrice * 1.3),
        quantity: deviceData.quantity || 1,
        status: 'available',
        addedBy: deviceData.addedBy || 'admin',
        createdAt: new Date().toISOString()
      };
      
      this.devices.push(device);
      await this.saveDevices();
      
      return { success: true, device };
    } catch (error) {
      console.error('❌ Error adding device:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = DeviceCreditSystem;