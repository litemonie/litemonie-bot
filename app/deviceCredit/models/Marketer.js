// app/deviceCredit/models/Marketer.js
const fs = require('fs').promises;
const path = require('path');

class MarketerModel {
  constructor(dataDir) {
    this.marketersFile = path.join(dataDir, 'marketers.json');
  }

  async initialize() {
    try {
      await fs.mkdir(path.dirname(this.marketersFile), { recursive: true });
      try {
        await fs.access(this.marketersFile);
        console.log('✅ Marketers file exists');
      } catch {
        // Sample marketer data
        const sampleMarketers = [{
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
        }];
        
        await fs.writeFile(this.marketersFile, JSON.stringify(sampleMarketers, null, 2));
        console.log('📄 Created marketers file with sample data');
      }
    } catch (error) {
      console.error('❌ Error initializing marketers:', error);
      throw error;
    }
  }

  async getAllMarketers() {
    try {
      const data = await fs.readFile(this.marketersFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading marketers file:', error);
      return [];
    }
  }

  async getMarketerById(marketerId) {
    const marketers = await this.getAllMarketers();
    return marketers.find(m => m.id === marketerId);
  }

  async getMarketerByTelegramId(telegramId) {
    const marketers = await this.getAllMarketers();
    return marketers.find(m => m.telegramId === telegramId.toString());
  }

  async getActiveMarketers() {
    const marketers = await this.getAllMarketers();
    return marketers.filter(m => m.status === 'active');
  }

  async addMarketer(marketerData) {
    const marketers = await this.getAllMarketers();
    marketers.push(marketerData);
    await fs.writeFile(this.marketersFile, JSON.stringify(marketers, null, 2));
    return marketerData;
  }

  async updateMarketer(marketerId, updates) {
    const marketers = await this.getAllMarketers();
    const index = marketers.findIndex(m => m.id === marketerId);
    
    if (index === -1) return null;
    
    marketers[index] = { ...marketers[index], ...updates };
    await fs.writeFile(this.marketersFile, JSON.stringify(marketers, null, 2));
    return marketers[index];
  }

  async updateMarketerPerformance(marketerId, saleAmount) {
    const marketer = await this.getMarketerById(marketerId);
    if (!marketer) return null;
    
    const commission = saleAmount * (marketer.commissionRate / 100);
    
    const updates = {
      totalSales: marketer.totalSales + saleAmount,
      totalCommission: marketer.totalCommission + commission,
      performance: {
        ...marketer.performance,
        currentMonthSales: marketer.performance.currentMonthSales + saleAmount
      }
    };
    
    return this.updateMarketer(marketerId, updates);
  }

  async getMarketerStats() {
    const marketers = await this.getAllMarketers();
    const activeMarketers = marketers.filter(m => m.status === 'active');
    
    const totalSales = marketers.reduce((sum, m) => sum + m.totalSales, 0);
    const totalCommission = marketers.reduce((sum, m) => sum + m.totalCommission, 0);
    const totalClients = marketers.reduce((sum, m) => sum + m.assignedClients.length, 0);
    
    return {
      total: marketers.length,
      active: activeMarketers.length,
      totalSales,
      totalCommission,
      totalClients,
      averageCommissionRate: marketers.length > 0 
        ? marketers.reduce((sum, m) => sum + m.commissionRate, 0) / marketers.length 
        : 0
    };
  }

  async assignClientToMarketer(marketerId, clientId) {
    const marketer = await this.getMarketerById(marketerId);
    if (!marketer) return false;
    
    if (!marketer.assignedClients.includes(clientId)) {
      marketer.assignedClients.push(clientId);
      await this.updateMarketer(marketerId, { assignedClients: marketer.assignedClients });
    }
    
    return true;
  }
}

module.exports = MarketerModel;