// app/deviceCredit/models/Purchase.js
const fs = require('fs').promises;
const path = require('path');

class PurchaseModel {
  constructor(dataDir) {
    this.purchasesFile = path.join(dataDir, 'device_purchases.json');
    this.paymentsFile = path.join(dataDir, 'payments.json');
  }

  async getAllPurchases() {
    try {
      const data = await fs.readFile(this.purchasesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading purchases file:', error);
      return [];
    }
  }

  async getPurchaseById(purchaseId) {
    const purchases = await this.getAllPurchases();
    return purchases.find(p => p.purchaseId === purchaseId);
  }

  async getUserPurchases(userId, includeCompleted = false) {
    const purchases = await this.getAllPurchases();
    let filtered = purchases.filter(p => p.buyerId === userId);
    
    if (!includeCompleted) {
      filtered = filtered.filter(p => !p.completed);
    }
    
    return filtered;
  }

  async getActivePurchases() {
    const purchases = await this.getAllPurchases();
    return purchases.filter(p => !p.completed);
  }

  async addPurchase(purchaseData) {
    const purchases = await this.getAllPurchases();
    purchases.push(purchaseData);
    await fs.writeFile(this.purchasesFile, JSON.stringify(purchases, null, 2));
    return purchaseData;
  }

  async updatePurchase(purchaseId, updates) {
    const purchases = await this.getAllPurchases();
    const index = purchases.findIndex(p => p.purchaseId === purchaseId);
    
    if (index === -1) return null;
    
    purchases[index] = { ...purchases[index], ...updates };
    await fs.writeFile(this.purchasesFile, JSON.stringify(purchases, null, 2));
    return purchases[index];
  }

  async recordPayment(paymentData) {
    let payments = [];
    try {
      const data = await fs.readFile(this.paymentsFile, 'utf8');
      payments = JSON.parse(data);
    } catch (error) {
      console.log('Creating new payments file');
    }
    
    payments.push(paymentData);
    await fs.writeFile(this.paymentsFile, JSON.stringify(payments, null, 2));
    
    // Update purchase record
    const purchase = await this.getPurchaseById(paymentData.purchaseId);
    if (purchase) {
      const newAmountPaid = purchase.amountPaid + paymentData.amount;
      const newAmountDue = purchase.totalPrice - newAmountPaid;
      const paymentsMade = purchase.paymentsMade + 1;
      
      const updates = {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        paymentsMade: paymentsMade
      };
      
      if (newAmountPaid >= purchase.totalPrice) {
        updates.status = 'completed';
        updates.completed = true;
        updates.completedDate = new Date().toISOString();
      }
      
      await this.updatePurchase(paymentData.purchaseId, updates);
    }
    
    return paymentData;
  }

  async getPurchaseStats() {
    const purchases = await this.getAllPurchases();
    const activePurchases = purchases.filter(p => !p.completed);
    const completedPurchases = purchases.filter(p => p.completed);
    
    const totalRevenue = purchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
    const totalCost = purchases.reduce((sum, p) => sum + (p.costPrice || 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const totalAmountPaid = purchases.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    
    return {
      total: purchases.length,
      active: activePurchases.length,
      completed: completedPurchases.length,
      revenue: totalRevenue,
      cost: totalCost,
      profit: totalProfit,
      amountPaid: totalAmountPaid,
      amountDue: totalRevenue - totalAmountPaid
    };
  }

  async getPurchasesByStatus(status) {
    const purchases = await this.getAllPurchases();
    return purchases.filter(p => p.status === status);
  }

  async getPurchasesByMarketer(marketerId) {
    const purchases = await this.getAllPurchases();
    return purchases.filter(p => p.marketerId === marketerId);
  }
}

module.exports = PurchaseModel;