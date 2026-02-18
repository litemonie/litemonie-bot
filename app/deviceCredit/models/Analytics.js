// app/deviceCredit/models/Analytics.js
class Analytics {
  constructor(dataDir) {
    this.dataDir = dataDir;
  }

  async getFullAnalytics() {
    try {
      console.log('📊 Generating full analytics...');
      
      // Import models dynamically to avoid circular dependencies
      const DeviceModel = require('./Device');
      const InventoryModel = require('./Inventory');
      const PurchaseModel = require('./Purchase');
      const MarketerModel = require('./Marketer');
      const ImeiLockModel = require('./ImeiLock');
      const UserDeviceModel = require('./UserDevice');
      
      const deviceModel = new DeviceModel(this.dataDir);
      const inventoryModel = new InventoryModel(this.dataDir);
      const purchaseModel = new PurchaseModel(this.dataDir);
      const marketerModel = new MarketerModel(this.dataDir);
      const imeiLockModel = new ImeiLockModel(this.dataDir);
      const userDeviceModel = new UserDeviceModel(this.dataDir);
      
      // Get all data in parallel
      const [
        devices,
        inventory,
        purchases,
        marketers,
        locks,
        userDevices
      ] = await Promise.all([
        deviceModel.getAllDevices(),
        inventoryModel.getAllInventory(),
        purchaseModel.getAllPurchases(),
        marketerModel.getAllMarketers(),
        imeiLockModel.getAllLocks(),
        userDeviceModel.getAllUserDevices()
      ]);
      
      console.log(`✅ Loaded data: ${devices.length} devices, ${purchases.length} purchases`);
      
      // Calculate stats
      const activePurchases = purchases.filter(p => !p.completed);
      const completedPurchases = purchases.filter(p => p.completed);
      
      const totalRevenue = purchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
      const totalCost = purchases.reduce((sum, p) => sum + (p.costPrice || 0), 0);
      const totalProfit = totalRevenue - totalCost;
      const totalAmountPaid = purchases.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      
      const marketerStats = await marketerModel.getMarketerStats();
      const lockStats = await imeiLockModel.getLockStats();
      const inventoryStats = await inventoryModel.getInventoryStats();
      const deviceStats = await deviceModel.getDeviceStats();
      const purchaseStats = await purchaseModel.getPurchaseStats();
      const userDeviceStats = await userDeviceModel.getUserDeviceStats();
      
      const result = {
        devices: deviceStats,
        inventory: inventoryStats,
        purchases: purchaseStats,
        financing: {
          activeLocks: lockStats.locked,
          lockedValue: activePurchases.reduce((sum, p) => sum + (p.amountDue || 0), 0),
          totalLocks: lockStats.total
        },
        marketers: marketerStats,
        userMapping: userDeviceStats,
        summary: {
          totalValue: totalRevenue,
          totalProfit,
          totalCommission: marketerStats.totalCommission,
          activeCustomers: new Set(purchases.map(p => p.buyerId)).size,
          activeFinancing: activePurchases.length
        },
        timestamp: new Date().toISOString()
      };
      
      console.log('📊 Analytics generated successfully');
      return result;
      
    } catch (error) {
      console.error('❌ Error generating analytics:', error);
      console.error('Stack trace:', error.stack);
      
      // Return empty stats structure
      return this.getEmptyStats();
    }
  }

  getEmptyStats() {
    return {
      devices: { total: 0, active: 0, byCategory: {} },
      inventory: { total: 0, available: 0, reserved: 0, sold: 0 },
      purchases: { total: 0, active: 0, completed: 0, revenue: 0, cost: 0, profit: 0, amountPaid: 0, amountDue: 0 },
      financing: { activeLocks: 0, lockedValue: 0, totalLocks: 0 },
      marketers: { total: 0, active: 0, totalSales: 0, totalCommission: 0, totalClients: 0, averageCommissionRate: 0 },
      userMapping: { totalUsers: 0, totalDevices: 0, lockedDevices: 0, unlockedDevices: 0 },
      summary: { totalValue: 0, totalProfit: 0, totalCommission: 0, activeCustomers: 0, activeFinancing: 0 },
      timestamp: new Date().toISOString()
    };
  }

  async getQuickStats() {
    try {
      const PurchaseModel = require('./Purchase');
      const purchaseModel = new PurchaseModel(this.dataDir);
      
      const purchases = await purchaseModel.getAllPurchases();
      const activePurchases = purchases.filter(p => !p.completed);
      
      return {
        totalPurchases: purchases.length,
        activePurchases: activePurchases.length,
        totalRevenue: purchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0),
        activeValue: activePurchases.reduce((sum, p) => sum + (p.amountDue || 0), 0),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting quick stats:', error);
      return { error: error.message };
    }
  }
}

module.exports = Analytics;