// app/deviceCredit/models/Inventory.js
const fs = require('fs').promises;
const path = require('path');

class InventoryModel {
  constructor(dataDir) {
    this.inventoryFile = path.join(dataDir, 'inventory.json');
  }

  async getAllInventory() {
    try {
      const data = await fs.readFile(this.inventoryFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading inventory file:', error);
      return [];
    }
  }

  async getAvailableInventory(deviceId = null) {
    const inventory = await this.getAllInventory();
    let filtered = inventory.filter(item => item.status === 'available');
    
    if (deviceId) {
      filtered = filtered.filter(item => item.deviceId === deviceId);
    }
    
    return filtered;
  }

  async getInventoryByStatus(status) {
    const inventory = await this.getAllInventory();
    return inventory.filter(item => item.status === status);
  }

  async addInventoryItem(itemData) {
    const inventory = await this.getAllInventory();
    inventory.push(itemData);
    await fs.writeFile(this.inventoryFile, JSON.stringify(inventory, null, 2));
    return itemData;
  }

  async addMultipleInventoryItems(items) {
    const inventory = await this.getAllInventory();
    inventory.push(...items);
    await fs.writeFile(this.inventoryFile, JSON.stringify(inventory, null, 2));
    return items.length;
  }

  async updateInventoryItem(inventoryId, updates) {
    const inventory = await this.getAllInventory();
    const index = inventory.findIndex(item => item.inventoryId === inventoryId);
    
    if (index === -1) return null;
    
    inventory[index] = { ...inventory[index], ...updates };
    await fs.writeFile(this.inventoryFile, JSON.stringify(inventory, null, 2));
    return inventory[index];
  }

  async reserveInventory(inventoryId, userId) {
    return this.updateInventoryItem(inventoryId, {
      status: 'reserved',
      reservedFor: userId,
      reservedAt: new Date().toISOString()
    });
  }

  async markInventoryAsSold(inventoryId, userId) {
    return this.updateInventoryItem(inventoryId, {
      status: 'sold',
      saleDate: new Date().toISOString(),
      currentOwner: userId
    });
  }

  async getInventoryStats() {
    const inventory = await this.getAllInventory();
    
    return {
      total: inventory.length,
      available: inventory.filter(i => i.status === 'available').length,
      reserved: inventory.filter(i => i.status === 'reserved').length,
      sold: inventory.filter(i => i.status === 'sold').length
    };
  }

  async getInventoryByDevice(deviceId) {
    const inventory = await this.getAllInventory();
    return inventory.filter(item => item.deviceId === deviceId);
  }
}

module.exports = InventoryModel;