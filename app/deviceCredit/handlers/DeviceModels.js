// app/deviceCredit/handlers/deviceModels.js - COMPLETE FIXED SCRIPT
const fs = require('fs').promises;
const path = require('path');

// ==================== FORMATTERS ====================
class Formatters {
  static formatCurrency(amount) {
    if (typeof amount !== 'number') {
      amount = parseFloat(amount) || 0;
    }
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(amount);
  }

  static formatDate(dateString) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString || 'Unknown date';
    }
  }

  static generateSessionId() {
    return `SESS${Date.now()}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }

  static generateTransactionId() {
    return `TXN${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}

// ==================== SESSION MANAGER ====================
class SessionManager {
  constructor() {
    this.sessions = {};
  }

  getSession(userId) {
    return this.sessions[userId];
  }

  setSession(userId, data) {
    this.sessions[userId] = {
      ...data,
      timestamp: Date.now()
    };
    return this.sessions[userId];
  }

  clearSession(userId) {
    delete this.sessions[userId];
  }

  cleanupOldSessions(maxAge = 3600000) { // 1 hour
    const now = Date.now();
    for (const userId in this.sessions) {
      if (now - this.sessions[userId].timestamp > maxAge) {
        delete this.sessions[userId];
      }
    }
  }
}

// ==================== BASE MODEL ====================
class BaseModel {
  constructor(dataDir, fileName) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, fileName);
    this.data = null;
    console.log(`📁 Initializing ${fileName} at: ${this.filePath}`);
  }

  async loadData() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(data);
      console.log(`📁 Loaded ${this.constructor.name} data: ${this.data ? this.data.length : 0} records`);
      return this.data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📁 Creating new ${path.basename(this.filePath)} file...`);
        this.data = [];
        await this.saveData();
        return this.data;
      }
      console.error(`❌ Error loading ${path.basename(this.filePath)}:`, error);
      this.data = [];
      return this.data;
    }
  }

  async saveData() {
    try {
      // Ensure directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      // Save data
      await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
      console.log(`💾 Saved ${path.basename(this.filePath)} with ${this.data.length} records`);
      return true;
    } catch (error) {
      console.error(`❌ Error saving ${path.basename(this.filePath)}:`, error);
      return false;
    }
  }

  async initialize() {
    await this.loadData();
    console.log(`✅ ${this.constructor.name} initialized`);
    return true;
  }

  getAll() {
    return this.data || [];
  }

  findById(id) {
    return (this.data || []).find(item => item.id === id);
  }

  findByField(field, value) {
    return (this.data || []).find(item => item[field] === value);
  }

  filterByField(field, value) {
    return (this.data || []).filter(item => item[field] === value);
  }
}

// ==================== DEVICE MODEL ====================
class DeviceModel extends BaseModel {
  constructor(dataDir) {
    super(dataDir, 'devices.json');
  }

  async addDevice(deviceData) {
    try {
      await this.loadData();
      
      // Generate device ID
      const deviceId = `DEV${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const device = {
        id: deviceId,
        make: deviceData.make || '',
        model: deviceData.model || '',
        costPrice: deviceData.costPrice || 0,
        sellingPrice: deviceData.sellingPrice || 0,
        specs: deviceData.specs || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      this.data.push(device);
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Device added: ${deviceId} - ${device.make} ${device.model}`);
        return device;
      } else {
        throw new Error('Failed to save device data');
      }
    } catch (error) {
      console.error('❌ Error adding device:', error);
      throw error;
    }
  }

  async removeDevice(deviceId) {
    try {
      await this.loadData();
      
      const initialLength = this.data.length;
      this.data = this.data.filter(device => device.id !== deviceId);
      
      if (this.data.length === initialLength) {
        return { success: false, error: 'Device not found' };
      }
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Device removed: ${deviceId}`);
        return { success: true };
      } else {
        throw new Error('Failed to save device data after removal');
      }
    } catch (error) {
      console.error('❌ Error removing device:', error);
      throw error;
    }
  }

  async updateDevice(deviceId, updates) {
    try {
      await this.loadData();
      
      const deviceIndex = this.data.findIndex(device => device.id === deviceId);
      if (deviceIndex === -1) {
        return { success: false, error: 'Device not found' };
      }
      
      this.data[deviceIndex] = {
        ...this.data[deviceIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Device updated: ${deviceId}`);
        return { success: true, device: this.data[deviceIndex] };
      } else {
        throw new Error('Failed to save device data');
      }
    } catch (error) {
      console.error('❌ Error updating device:', error);
      throw error;
    }
  }

  getAllDevices() {
    return this.getAll();
  }

  getDeviceById(deviceId) {
    return this.findById(deviceId);
  }

  getDevicesByBrand(brand) {
    const brandLower = brand.toLowerCase();
    return (this.data || []).filter(device => 
      device.make.toLowerCase().includes(brandLower)
    );
  }

  searchDevices(query) {
    const queryLower = query.toLowerCase();
    return (this.data || []).filter(device => 
      device.make.toLowerCase().includes(queryLower) ||
      device.model.toLowerCase().includes(queryLower) ||
      (device.specs?.rom && device.specs.rom.toLowerCase().includes(queryLower)) ||
      (device.specs?.ram && device.specs.ram.toLowerCase().includes(queryLower))
    );
  }
}

// ==================== INVENTORY MODEL ====================
class InventoryModel extends BaseModel {
  constructor(dataDir) {
    super(dataDir, 'inventory.json');
  }

  async addToInventory(deviceId, quantity) {
    try {
      await this.loadData();
      
      const existingIndex = this.data.findIndex(item => item.deviceId === deviceId);
      
      if (existingIndex >= 0) {
        // Update existing inventory
        this.data[existingIndex].quantity += quantity;
        this.data[existingIndex].updatedAt = new Date().toISOString();
        
        const saved = await this.saveData();
        if (saved) {
          console.log(`📦 Inventory updated: ${deviceId} +${quantity} = ${this.data[existingIndex].quantity}`);
          return this.data[existingIndex];
        } else {
          throw new Error('Failed to save inventory data');
        }
      } else {
        // Create new inventory entry
        const inventoryItem = {
          deviceId,
          quantity,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        this.data.push(inventoryItem);
        const saved = await this.saveData();
        
        if (saved) {
          console.log(`📦 New inventory created: ${deviceId} x ${quantity}`);
          return inventoryItem;
        } else {
          throw new Error('Failed to save inventory data');
        }
      }
    } catch (error) {
      console.error('❌ Error adding to inventory:', error);
      throw error;
    }
  }

  async removeInventory(deviceId) {
    try {
      await this.loadData();
      
      const initialLength = this.data.length;
      this.data = this.data.filter(item => item.deviceId !== deviceId);
      
      if (this.data.length === initialLength) {
        return { success: false, error: 'Inventory item not found' };
      }
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Inventory removed: ${deviceId}`);
        return { success: true };
      } else {
        throw new Error('Failed to save inventory data after removal');
      }
    } catch (error) {
      console.error('❌ Error removing inventory:', error);
      throw error;
    }
  }

  async updateInventoryQuantity(deviceId, newQuantity) {
    try {
      await this.loadData();
      
      const itemIndex = this.data.findIndex(item => item.deviceId === deviceId);
      if (itemIndex === -1) {
        return { success: false, error: 'Inventory item not found' };
      }
      
      this.data[itemIndex].quantity = newQuantity;
      this.data[itemIndex].updatedAt = new Date().toISOString();
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`📦 Inventory quantity updated: ${deviceId} = ${newQuantity}`);
        return { success: true, item: this.data[itemIndex] };
      } else {
        throw new Error('Failed to save inventory data');
      }
    } catch (error) {
      console.error('❌ Error updating inventory quantity:', error);
      throw error;
    }
  }

  getAllInventory() {
    return this.getAll();
  }

  getInventoryByDeviceId(deviceId) {
    return this.findByField('deviceId', deviceId);
  }

  getLowStockItems(threshold = 5) {
    return (this.data || []).filter(item => item.quantity <= threshold);
  }

  getOutOfStockItems() {
    return (this.data || []).filter(item => item.quantity === 0);
  }

  getTotalInventoryValue(devices) {
    let totalValue = 0;
    (this.data || []).forEach(invItem => {
      const device = devices.find(d => d.id === invItem.deviceId);
      if (device) {
        totalValue += device.costPrice * invItem.quantity;
      }
    });
    return totalValue;
  }
}

// ==================== PURCHASE MODEL ====================
class PurchaseModel extends BaseModel {
  constructor(dataDir) {
    super(dataDir, 'purchases.json');
  }

  async addPurchase(purchaseData) {
    try {
      await this.loadData();
      
      const purchaseId = `PUR${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const purchase = {
        id: purchaseId,
        userId: purchaseData.userId,
        deviceId: purchaseData.deviceId,
        amount: purchaseData.amount || 0,
        amountPaid: purchaseData.amountPaid || 0,
        status: purchaseData.status || 'pending',
        paymentMethod: purchaseData.paymentMethod || '',
        transactionId: purchaseData.transactionId || '',
        deviceInfo: purchaseData.deviceInfo || {},
        userInfo: purchaseData.userInfo || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: purchaseData.completed || false,
        completedAt: purchaseData.completedAt || null
      };
      
      this.data.push(purchase);
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Purchase added: ${purchaseId} for user ${purchaseData.userId}`);
        return purchase;
      } else {
        throw new Error('Failed to save purchase data');
      }
    } catch (error) {
      console.error('❌ Error adding purchase:', error);
      throw error;
    }
  }

  async updatePurchase(purchaseId, updates) {
    try {
      await this.loadData();
      
      const purchaseIndex = this.data.findIndex(p => p.id === purchaseId);
      if (purchaseIndex === -1) {
        return { success: false, error: 'Purchase not found' };
      }
      
      this.data[purchaseIndex] = {
        ...this.data[purchaseIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Purchase updated: ${purchaseId}`);
        return { success: true, purchase: this.data[purchaseIndex] };
      } else {
        throw new Error('Failed to save purchase data');
      }
    } catch (error) {
      console.error('❌ Error updating purchase:', error);
      throw error;
    }
  }

  async completePurchase(purchaseId, amountPaid, transactionId = '') {
    return this.updatePurchase(purchaseId, {
      status: 'completed',
      completed: true,
      amountPaid,
      transactionId,
      completedAt: new Date().toISOString()
    });
  }

  async cancelPurchase(purchaseId) {
    return this.updatePurchase(purchaseId, {
      status: 'cancelled',
      completed: false
    });
  }

  getAllPurchases() {
    return this.getAll();
  }

  getPurchaseById(purchaseId) {
    return this.findById(purchaseId);
  }

  getPurchasesByUserId(userId) {
    return this.filterByField('userId', userId);
  }

  getPurchasesByDeviceId(deviceId) {
    return this.filterByField('deviceId', deviceId);
  }

  getPendingPurchases() {
    return (this.data || []).filter(p => p.status === 'pending');
  }

  getCompletedPurchases() {
    return (this.data || []).filter(p => p.completed);
  }

  getTotalRevenue() {
    return (this.data || []).reduce((total, purchase) => {
      return total + (purchase.amountPaid || 0);
    }, 0);
  }
}

// ==================== USER DEVICE MODEL ====================
class UserDeviceModel extends BaseModel {
  constructor(dataDir) {
    super(dataDir, 'userDevices.json');
  }

  async addUserDevice(userDeviceData) {
    try {
      await this.loadData();
      
      const userDeviceId = `UD${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const userDevice = {
        id: userDeviceId,
        userId: userDeviceData.userId,
        deviceId: userDeviceData.deviceId,
        purchaseId: userDeviceData.purchaseId,
        imei: userDeviceData.imei || this.generateIMEI(),
        serial: userDeviceData.serial || this.generateSerial(),
        status: userDeviceData.status || 'active',
        deviceInfo: userDeviceData.deviceInfo || {},
        purchaseInfo: userDeviceData.purchaseInfo || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unlocked: userDeviceData.unlocked || false,
        unlockedAt: userDeviceData.unlockedAt || null
      };
      
      this.data.push(userDevice);
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ User device added: ${userDeviceId} for user ${userDeviceData.userId}`);
        return userDevice;
      } else {
        throw new Error('Failed to save user device data');
      }
    } catch (error) {
      console.error('❌ Error adding user device:', error);
      throw error;
    }
  }

  generateIMEI() {
    const random15 = Array.from({length: 15}, () => Math.floor(Math.random() * 10)).join('');
    return random15;
  }

  generateSerial() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let serial = '';
    for (let i = 0; i < 10; i++) {
      serial += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return serial;
  }

  async unlockDevice(userDeviceId) {
    return this.updateUserDevice(userDeviceId, {
      unlocked: true,
      unlockedAt: new Date().toISOString(),
      status: 'unlocked'
    });
  }

  async updateUserDevice(userDeviceId, updates) {
    try {
      await this.loadData();
      
      const userDeviceIndex = this.data.findIndex(ud => ud.id === userDeviceId);
      if (userDeviceIndex === -1) {
        return { success: false, error: 'User device not found' };
      }
      
      this.data[userDeviceIndex] = {
        ...this.data[userDeviceIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ User device updated: ${userDeviceId}`);
        return { success: true, userDevice: this.data[userDeviceIndex] };
      } else {
        throw new Error('Failed to save user device data');
      }
    } catch (error) {
      console.error('❌ Error updating user device:', error);
      throw error;
    }
  }

  getAllUserDevices() {
    return this.getAll();
  }

  getUserDeviceById(userDeviceId) {
    return this.findById(userDeviceId);
  }

  getUserDevicesByUserId(userId) {
    return this.filterByField('userId', userId);
  }

  getActiveUserDevices() {
    return (this.data || []).filter(ud => ud.status === 'active');
  }

  getUnlockedDevices() {
    return (this.data || []).filter(ud => ud.unlocked);
  }

  getLockedDevices() {
    return (this.data || []).filter(ud => !ud.unlocked);
  }
}

// ==================== MARKETER MODEL ====================
class MarketerModel extends BaseModel {
  constructor(dataDir) {
    super(dataDir, 'marketers.json');
  }

  async addMarketer(marketerData) {
    try {
      await this.loadData();
      
      const marketerId = `MKT${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const marketer = {
        id: marketerId,
        marketerId: marketerId,
        userId: marketerData.userId,
        name: marketerData.name || `Marketer ${marketerData.userId}`,
        commissionRate: marketerData.commissionRate || 10,
        isActive: marketerData.isActive !== undefined ? marketerData.isActive : true,
        joinedAt: marketerData.joinedAt || new Date().toISOString(),
        totalSales: marketerData.totalSales || 0,
        totalCommission: marketerData.totalCommission || 0,
        salesCount: marketerData.salesCount || 0,
        referrals: marketerData.referrals || [],
        bankDetails: marketerData.bankDetails || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      this.data.push(marketer);
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Marketer added: ${marketerId} - ${marketer.name}`);
        return marketer;
      } else {
        throw new Error('Failed to save marketer data');
      }
    } catch (error) {
      console.error('❌ Error adding marketer:', error);
      throw error;
    }
  }

  async updateMarketer(marketerId, updates) {
    try {
      await this.loadData();
      
      const marketerIndex = this.data.findIndex(m => m.marketerId === marketerId || m.id === marketerId);
      if (marketerIndex === -1) {
        return { success: false, error: 'Marketer not found' };
      }
      
      this.data[marketerIndex] = {
        ...this.data[marketerIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Marketer updated: ${marketerId}`);
        return { success: true, marketer: this.data[marketerIndex] };
      } else {
        throw new Error('Failed to save marketer data');
      }
    } catch (error) {
      console.error('❌ Error updating marketer:', error);
      throw error;
    }
  }

  async addSale(marketerId, saleAmount) {
    try {
      await this.loadData();
      
      const marketerIndex = this.data.findIndex(m => m.marketerId === marketerId || m.id === marketerId);
      if (marketerIndex === -1) {
        return { success: false, error: 'Marketer not found' };
      }
      
      const commissionRate = this.data[marketerIndex].commissionRate || 10;
      const commission = (saleAmount * commissionRate) / 100;
      
      this.data[marketerIndex].totalSales += saleAmount;
      this.data[marketerIndex].totalCommission += commission;
      this.data[marketerIndex].salesCount = (this.data[marketerIndex].salesCount || 0) + 1;
      this.data[marketerIndex].updatedAt = new Date().toISOString();
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`💰 Sale recorded for marketer ${marketerId}: ${saleAmount} (commission: ${commission})`);
        return { 
          success: true, 
          marketer: this.data[marketerIndex],
          commission: commission
        };
      } else {
        throw new Error('Failed to save marketer data');
      }
    } catch (error) {
      console.error('❌ Error adding sale:', error);
      throw error;
    }
  }

  getAllMarketers() {
    return this.getAll();
  }

  getMarketerById(marketerId) {
    return this.data.find(m => m.marketerId === marketerId || m.id === marketerId);
  }

  getMarketerByUserId(userId) {
    return this.findByField('userId', userId);
  }

  getActiveMarketers() {
    return (this.data || []).filter(m => m.isActive);
  }

  getTopMarketers(limit = 10) {
    return [...(this.data || [])]
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, limit);
  }

  getTotalCommissionPaid() {
    return (this.data || []).reduce((total, marketer) => total + (marketer.totalCommission || 0), 0);
  }
}

// ==================== TRANSACTION MODEL ====================
class TransactionModel extends BaseModel {
  constructor(dataDir) {
    super(dataDir, 'transactions.json');
  }

  async addTransaction(transactionData) {
    try {
      await this.loadData();
      
      const transactionId = transactionData.transactionId || `TXN${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const transaction = {
        id: transactionId,
        transactionId: transactionId,
        userId: transactionData.userId,
        amount: transactionData.amount || 0,
        type: transactionData.type || 'deposit', // deposit, withdrawal, purchase, commission
        status: transactionData.status || 'pending', // pending, completed, failed, cancelled
        paymentMethod: transactionData.paymentMethod || '',
        reference: transactionData.reference || '',
        description: transactionData.description || '',
        metadata: transactionData.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: transactionData.completedAt || null,
        failedAt: transactionData.failedAt || null
      };
      
      this.data.push(transaction);
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Transaction added: ${transactionId} - ${transaction.amount} (${transaction.status})`);
        return transaction;
      } else {
        throw new Error('Failed to save transaction data');
      }
    } catch (error) {
      console.error('❌ Error adding transaction:', error);
      throw error;
    }
  }

  async updateTransaction(transactionId, updates) {
    try {
      await this.loadData();
      
      const transactionIndex = this.data.findIndex(t => t.transactionId === transactionId || t.id === transactionId);
      if (transactionIndex === -1) {
        return { success: false, error: 'Transaction not found' };
      }
      
      this.data[transactionIndex] = {
        ...this.data[transactionIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      const saved = await this.saveData();
      
      if (saved) {
        console.log(`✅ Transaction updated: ${transactionId}`);
        return { success: true, transaction: this.data[transactionIndex] };
      } else {
        throw new Error('Failed to save transaction data');
      }
    } catch (error) {
      console.error('❌ Error updating transaction:', error);
      throw error;
    }
  }

  async completeTransaction(transactionId, reference = '') {
    return this.updateTransaction(transactionId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      reference: reference || this.data.find(t => t.transactionId === transactionId)?.reference || ''
    });
  }

  async failTransaction(transactionId, reason = '') {
    return this.updateTransaction(transactionId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      description: reason ? `Failed: ${reason}` : 'Transaction failed'
    });
  }

  getAllTransactions() {
    return this.getAll();
  }

  getTransactionById(transactionId) {
    return this.data.find(t => t.transactionId === transactionId || t.id === transactionId);
  }

  getTransactionsByUserId(userId) {
    return this.filterByField('userId', userId);
  }

  getPendingTransactions() {
    return (this.data || []).filter(t => t.status === 'pending');
  }

  getCompletedTransactions() {
    return (this.data || []).filter(t => t.status === 'completed');
  }

  getFailedTransactions() {
    return (this.data || []).filter(t => t.status === 'failed');
  }

  getTransactionsByType(type) {
    return (this.data || []).filter(t => t.type === type);
  }

  getTotalDeposits() {
    return (this.data || [])
      .filter(t => t.type === 'deposit' && t.status === 'completed')
      .reduce((total, t) => total + (t.amount || 0), 0);
  }

  getTotalWithdrawals() {
    return (this.data || [])
      .filter(t => t.type === 'withdrawal' && t.status === 'completed')
      .reduce((total, t) => total + (t.amount || 0), 0);
  }
}

// ==================== EXPORTS ====================
module.exports = {
  DeviceModel,
  InventoryModel,
  PurchaseModel,
  UserDeviceModel,
  MarketerModel,
  TransactionModel,
  Formatters,
  SessionManager
};