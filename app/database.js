/**
 * database.js - Simple JSON file storage for Render persistence
 * UPDATED WITH DEVICE FINANCING DATABASES
 */
const fs = require('fs').promises;
const path = require('path');

class Database {
  constructor() {
    this.dataDir = path.join(__dirname, 'data');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.transactionsFile = path.join(this.dataDir, 'transactions.json');
    this.virtualAccountsFile = path.join(this.dataDir, 'virtualAccounts.json');
    
    // NEW: Device financing databases
    this.devicesFile = path.join(this.dataDir, 'devices.json');
    this.deviceFinancingFile = path.join(this.dataDir, 'deviceFinancing.json');
    this.marketersFile = path.join(this.dataDir, 'marketers.json');
    this.deviceMakesFile = path.join(this.dataDir, 'deviceMakes.json'); // For brand-specific devices
    
    this.init();
  }

  async init() {
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Initialize files if they don't exist
      await this.ensureFile(this.usersFile, {});
      await this.ensureFile(this.transactionsFile, {});
      await this.ensureFile(this.virtualAccountsFile, {});
      
      // NEW: Initialize device financing files
      await this.ensureFile(this.devicesFile, {});
      await this.ensureFile(this.deviceFinancingFile, {});
      await this.ensureFile(this.marketersFile, {});
      await this.ensureFile(this.deviceMakesFile, {
        infinix: {},
        tecno: {},
        itel: {},
        samsung: {}
      });
      
      console.log('📁 Database initialized successfully (with device financing)');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
    }
  }

  async ensureFile(filePath, defaultData) {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
    }
  }

  // ========== USER METHODS ==========
  async getUsers() {
    try {
      const data = await fs.readFile(this.usersFile, 'utf8');
      const users = JSON.parse(data);
      
      // Ensure all users have device-related fields
      Object.keys(users).forEach(userId => {
        if (!users[userId].devices) users[userId].devices = [];
        if (!users[userId].role) users[userId].role = 'user';
        if (!users[userId].marketingCode) users[userId].marketingCode = null;
        if (!users[userId].referredBy) users[userId].referredBy = null;
        if (!users[userId].earnings) users[userId].earnings = 0;
        if (!users[userId].deviceAdminAccess) users[userId].deviceAdminAccess = false;
      });
      
      return users;
    } catch (error) {
      console.error('❌ Error reading users:', error);
      return {};
    }
  }

  async saveUsers(users) {
    try {
      await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
    } catch (error) {
      console.error('❌ Error saving users:', error);
    }
  }

  async getUser(userId) {
    const users = await this.getUsers();
    const user = users[userId] || null;
    
    // Ensure user has device fields
    if (user) {
      if (!user.devices) user.devices = [];
      if (!user.role) user.role = 'user';
      if (!user.marketingCode) user.marketingCode = null;
      if (!user.referredBy) user.referredBy = null;
      if (!user.earnings) user.earnings = 0;
      if (!user.deviceAdminAccess) user.deviceAdminAccess = false;
    }
    
    return user;
  }

  async saveUser(userId, userData) {
    const users = await this.getUsers();
    users[userId] = userData;
    await this.saveUsers(users);
    return userData;
  }

  async updateUser(userId, updateData) {
    const users = await this.getUsers();
    if (!users[userId]) {
      // Initialize new user with default device fields
      users[userId] = {
        devices: [],
        role: 'user',
        marketingCode: null,
        referredBy: null,
        earnings: 0,
        deviceAdminAccess: false
      };
    }
    users[userId] = { ...users[userId], ...updateData };
    await this.saveUsers(users);
    return users[userId];
  }

  // ========== DEVICE METHODS ==========
  async getDevices() {
    try {
      const data = await fs.readFile(this.devicesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading devices:', error);
      return {};
    }
  }

  async saveDevices(devices) {
    try {
      await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
    } catch (error) {
      console.error('❌ Error saving devices:', error);
    }
  }

  async getDevice(deviceId) {
    const devices = await this.getDevices();
    return devices[deviceId] || null;
  }

  async saveDevice(deviceId, deviceData) {
    const devices = await this.getDevices();
    devices[deviceId] = deviceData;
    await this.saveDevices(devices);
    return deviceData;
  }

  async updateDevice(deviceId, updateData) {
    const devices = await this.getDevices();
    if (!devices[deviceId]) {
      throw new Error(`Device ${deviceId} not found`);
    }
    devices[deviceId] = { ...devices[deviceId], ...updateData };
    await this.saveDevices(devices);
    return devices[deviceId];
  }

  async deleteDevice(deviceId) {
    const devices = await this.getDevices();
    if (devices[deviceId]) {
      delete devices[deviceId];
      await this.saveDevices(devices);
      return true;
    }
    return false;
  }

  async getDevicesByMake(make) {
    const devices = await this.getDevices();
    return Object.values(devices).filter(device => device.make === make);
  }

  async getAvailableDevices() {
    const devices = await this.getDevices();
    return Object.values(devices).filter(device => device.available > 0);
  }

  // ========== DEVICE MAKES METHODS ==========
  async getDeviceMakes() {
    try {
      const data = await fs.readFile(this.deviceMakesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading device makes:', error);
      return {
        infinix: {},
        tecno: {},
        itel: {},
        samsung: {}
      };
    }
  }

  async saveDeviceMakes(deviceMakes) {
    try {
      await fs.writeFile(this.deviceMakesFile, JSON.stringify(deviceMakes, null, 2));
    } catch (error) {
      console.error('❌ Error saving device makes:', error);
    }
  }

  async getDevicesByBrand(brand) {
    const deviceMakes = await this.getDeviceMakes();
    return deviceMakes[brand] || {};
  }

  async addDeviceToBrand(brand, deviceId, deviceData) {
    const deviceMakes = await this.getDeviceMakes();
    if (!deviceMakes[brand]) deviceMakes[brand] = {};
    deviceMakes[brand][deviceId] = deviceData;
    await this.saveDeviceMakes(deviceMakes);
    return deviceData;
  }

  // ========== DEVICE FINANCING METHODS ==========
  async getDeviceFinancing() {
    try {
      const data = await fs.readFile(this.deviceFinancingFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading device financing:', error);
      return {};
    }
  }

  async saveDeviceFinancing(financing) {
    try {
      await fs.writeFile(this.deviceFinancingFile, JSON.stringify(financing, null, 2));
    } catch (error) {
      console.error('❌ Error saving device financing:', error);
    }
  }

  async getFinancingById(financingId) {
    const financing = await this.getDeviceFinancing();
    return financing[financingId] || null;
  }

  async saveFinancing(financingId, financingData) {
    const financing = await this.getDeviceFinancing();
    financing[financingId] = financingData;
    await this.saveDeviceFinancing(financing);
    return financingData;
  }

  async updateFinancing(financingId, updateData) {
    const financing = await this.getDeviceFinancing();
    if (!financing[financingId]) {
      throw new Error(`Financing ${financingId} not found`);
    }
    financing[financingId] = { ...financing[financingId], ...updateData };
    financing[financingId].updatedAt = new Date().toISOString();
    await this.saveDeviceFinancing(financing);
    return financing[financingId];
  }

  async getUserFinancing(userId) {
    const financing = await this.getDeviceFinancing();
    return Object.values(financing).filter(f => f.userId === userId);
  }

  async getActiveFinancing() {
    const financing = await this.getDeviceFinancing();
    return Object.values(financing).filter(f => f.status === 'active');
  }

  async getOverdueFinancing() {
    const financing = await this.getDeviceFinancing();
    const now = new Date();
    return Object.values(financing).filter(f => {
      if (f.status !== 'active') return false;
      const nextPayment = new Date(f.nextPaymentDate);
      const daysOverdue = Math.floor((now - nextPayment) / (1000 * 60 * 60 * 24));
      return daysOverdue > 0;
    });
  }

  // ========== MARKETER METHODS ==========
  async getMarketers() {
    try {
      const data = await fs.readFile(this.marketersFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading marketers:', error);
      return {};
    }
  }

  async saveMarketers(marketers) {
    try {
      await fs.writeFile(this.marketersFile, JSON.stringify(marketers, null, 2));
    } catch (error) {
      console.error('❌ Error saving marketers:', error);
    }
  }

  async getMarketer(marketerId) {
    const marketers = await this.getMarketers();
    return marketers[marketerId] || null;
  }

  async getMarketerByCode(code) {
    const marketers = await this.getMarketers();
    return Object.values(marketers).find(m => m.code === code && m.isActive) || null;
  }

  async getMarketerByUserId(userId) {
    const marketers = await this.getMarketers();
    return Object.values(marketers).find(m => m.userId === userId) || null;
  }

  async saveMarketer(marketerId, marketerData) {
    const marketers = await this.getMarketers();
    marketers[marketerId] = marketerData;
    await this.saveMarketers(marketers);
    return marketerData;
  }

  async updateMarketer(marketerId, updateData) {
    const marketers = await this.getMarketers();
    if (!marketers[marketerId]) {
      throw new Error(`Marketer ${marketerId} not found`);
    }
    marketers[marketerId] = { ...marketers[marketerId], ...updateData };
    await this.saveMarketers(marketers);
    return marketers[marketerId];
  }

  async getActiveMarketers() {
    const marketers = await this.getMarketers();
    return Object.values(marketers).filter(m => m.isActive);
  }

  async addMarketerEarnings(marketerId, amount) {
    const marketer = await this.getMarketer(marketerId);
    if (marketer) {
      marketer.pendingEarnings += amount;
      marketer.totalEarnings += amount;
      await this.updateMarketer(marketerId, marketer);
    }
  }

  async processMarketerPayout(marketerId) {
    const marketer = await this.getMarketer(marketerId);
    if (marketer && marketer.pendingEarnings > 0) {
      const payoutAmount = marketer.pendingEarnings;
      marketer.pendingEarnings = 0;
      marketer.lastPayout = {
        amount: payoutAmount,
        date: new Date().toISOString()
      };
      await this.updateMarketer(marketerId, marketer);
      return payoutAmount;
    }
    return 0;
  }

  // ========== TRANSACTIONS METHODS ==========
  async getTransactions() {
    try {
      const data = await fs.readFile(this.transactionsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading transactions:', error);
      return {};
    }
  }

  async saveTransactions(transactions) {
    try {
      await fs.writeFile(this.transactionsFile, JSON.stringify(transactions, null, 2));
    } catch (error) {
      console.error('❌ Error saving transactions:', error);
    }
  }

  async getUserTransactions(userId) {
    const transactions = await this.getTransactions();
    return transactions[userId] || [];
  }

  async saveUserTransactions(userId, userTransactions) {
    const transactions = await this.getTransactions();
    transactions[userId] = userTransactions;
    await this.saveTransactions(transactions);
  }

  async addTransaction(userId, transaction) {
    const transactions = await this.getTransactions();
    if (!transactions[userId]) {
      transactions[userId] = [];
    }
    transactions[userId].push(transaction);
    await this.saveTransactions(transactions);
    return transaction;
  }

  // Add device-specific transaction
  async addDeviceTransaction(userId, transactionType, deviceId, amount, financingId = null) {
    const transaction = {
      id: `TRX-${Date.now()}-${userId}`,
      type: transactionType,
      amount: amount,
      description: `${transactionType} for device ${deviceId}`,
      financingId: financingId,
      status: 'completed',
      date: new Date().toISOString(),
      timestamp: Date.now()
    };
    
    return await this.addTransaction(userId, transaction);
  }

  // ========== VIRTUAL ACCOUNTS METHODS ==========
  async getVirtualAccounts() {
    try {
      const data = await fs.readFile(this.virtualAccountsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading virtual accounts:', error);
      return {};
    }
  }

  async saveVirtualAccounts(virtualAccounts) {
    try {
      await fs.writeFile(this.virtualAccountsFile, JSON.stringify(virtualAccounts, null, 2));
    } catch (error) {
      console.error('❌ Error saving virtual accounts:', error);
    }
  }

  async getVirtualAccountByUserId(userId) {
    const virtualAccounts = await this.getVirtualAccounts();
    const account = virtualAccounts[userId];
    if (account) {
      return { user_id: userId, ...account };
    }
    return null;
  }

  async saveVirtualAccount(userId, accountData) {
    const virtualAccounts = await this.getVirtualAccounts();
    virtualAccounts[userId] = accountData;
    await this.saveVirtualAccounts(virtualAccounts);
    return accountData;
  }

  async findVirtualAccountByNumber(accountNumber) {
    const virtualAccounts = await this.getVirtualAccounts();
    for (const [userId, account] of Object.entries(virtualAccounts)) {
      if (account.account_number === accountNumber) {
        return { user_id: userId, ...account };
      }
    }
    return null;
  }

  // ========== UTILITY METHODS ==========
  async getAllData() {
    return {
      users: await this.getUsers(),
      transactions: await this.getTransactions(),
      virtualAccounts: await this.getVirtualAccounts(),
      devices: await this.getDevices(),
      deviceFinancing: await this.getDeviceFinancing(),
      marketers: await this.getMarketers(),
      deviceMakes: await this.getDeviceMakes()
    };
  }

  async saveAllData(data) {
    try {
      await this.saveUsers(data.users || {});
      await this.saveTransactions(data.transactions || {});
      await this.saveVirtualAccounts(data.virtualAccounts || {});
      await this.saveDevices(data.devices || {});
      await this.saveDeviceFinancing(data.deviceFinancing || {});
      await this.saveMarketers(data.marketers || {});
      await this.saveDeviceMakes(data.deviceMakes || {});
      console.log('💾 All data saved successfully');
    } catch (error) {
      console.error('❌ Error saving all data:', error);
    }
  }

  // ========== BACKUP METHODS ==========
  async backupData() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.dataDir, 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      
      const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
      
      const backupData = {
        timestamp: new Date().toISOString(),
        users: await this.getUsers(),
        transactions: await this.getTransactions(),
        virtualAccounts: await this.getVirtualAccounts(),
        devices: await this.getDevices(),
        deviceFinancing: await this.getDeviceFinancing(),
        marketers: await this.getMarketers(),
        deviceMakes: await this.getDeviceMakes()
      };
      
      await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
      console.log(`📂 Backup created: ${backupFile}`);
    } catch (error) {
      console.error('❌ Backup error:', error);
    }
  }

  // Cleanup old backups (keep last 7 days)
  async cleanupOldBackups(daysToKeep = 7) {
    try {
      const backupDir = path.join(this.dataDir, 'backups');
      const files = await fs.readdir(backupDir);
      const now = Date.now();
      const cutoff = daysToKeep * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        if (file.startsWith('backup-')) {
          const filePath = path.join(backupDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > cutoff) {
            await fs.unlink(filePath);
            console.log(`🗑️ Deleted old backup: ${file}`);
          }
        }
      }
    } catch (error) {
      // Silently fail for cleanup
    }
  }

  // ========== DEVICE SPECIFIC UTILITIES ==========
  async getDeviceStats() {
    const devices = await this.getDevices();
    const financing = await this.getDeviceFinancing();
    const marketers = await this.getMarketers();
    
    const totalDevices = Object.keys(devices).length;
    const availableDevices = Object.values(devices).filter(d => d.available > 0).length;
    const activeFinancing = Object.values(financing).filter(f => f.status === 'active').length;
    const completedFinancing = Object.values(financing).filter(f => f.status === 'completed').length;
    const overdueFinancing = Object.values(financing).filter(f => f.status === 'active' && f.daysOverdue > 0).length;
    const activeMarketers = Object.values(marketers).filter(m => m.isActive).length;
    
    return {
      totalDevices,
      availableDevices,
      activeFinancing,
      completedFinancing,
      overdueFinancing,
      activeMarketers,
      totalRevenue: Object.values(financing)
        .filter(f => f.status === 'completed')
        .reduce((sum, f) => sum + f.totalAmount, 0),
      pendingEarnings: Object.values(marketers)
        .reduce((sum, m) => sum + (m.pendingEarnings || 0), 0)
    };
  }

  async initializeSampleDevices() {
    const devices = await this.getDevices();
    
    // Only initialize if no devices exist
    if (Object.keys(devices).length === 0) {
      const sampleDevices = {
        "DEV001": {
          id: "DEV001",
          make: "infinix",
          model: "Hot 30i",
          storage: "128GB + 4GB RAM",
          color: "Black",
          originalPrice: 85000,
          sellingPrice: 110500, // +30% profit
          quantity: 10,
          available: 10,
          images: [],
          description: "6.6\" HD+ Display, 50MP Camera, 5000mAh Battery",
          features: ["Face Unlock", "Fingerprint", "Dual SIM", "4G LTE"],
          warranty: "1 year",
          createdAt: new Date().toISOString(),
          adminId: "system"
        },
        "DEV002": {
          id: "DEV002",
          make: "tecno",
          model: "Spark 10 Pro",
          storage: "128GB + 8GB RAM",
          color: "Blue",
          originalPrice: 95000,
          sellingPrice: 123500,
          quantity: 8,
          available: 8,
          images: [],
          description: "6.8\" FHD+ 120Hz Display, 32MP Selfie, 5000mAh",
          features: ["Dynamic Port", "Memory Fusion", "DTS Audio"],
          warranty: "1 year",
          createdAt: new Date().toISOString(),
          adminId: "system"
        },
        "DEV003": {
          id: "DEV003",
          make: "samsung",
          model: "Galaxy A14",
          storage: "64GB + 4GB RAM",
          color: "Silver",
          originalPrice: 115000,
          sellingPrice: 149500,
          quantity: 5,
          available: 5,
          images: [],
          description: "6.6\" PLS LCD, 50MP Triple Camera, 5000mAh",
          features: ["Samsung Knox", "One UI", "Expandable Storage"],
          warranty: "1 year",
          createdAt: new Date().toISOString(),
          adminId: "system"
        }
      };
      
      // Save to devices database
      Object.entries(sampleDevices).forEach(([id, device]) => {
        devices[id] = device;
      });
      
      await this.saveDevices(devices);
      
      // Also save to device makes for easy categorization
      const deviceMakes = await this.getDeviceMakes();
      deviceMakes.infinix = { "DEV001": sampleDevices["DEV001"] };
      deviceMakes.tecno = { "DEV002": sampleDevices["DEV002"] };
      deviceMakes.samsung = { "DEV003": sampleDevices["DEV003"] };
      await this.saveDeviceMakes(deviceMakes);
      
      console.log('📱 Sample devices initialized');
    }
  }
}

// Create and export singleton instance
const database = new Database();

// Initialize sample devices on startup
database.initializeSampleDevices().catch(console.error);

// Schedule regular backups (every 6 hours)
setInterval(() => {
  database.backupData();
  database.cleanupOldBackups();
}, 6 * 60 * 60 * 1000);

// Auto-backup on startup
setTimeout(() => {
  database.backupData();
}, 10000);

module.exports = database;