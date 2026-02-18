// app/deviceCredit/models/ImeiLock.js
const fs = require('fs').promises;
const path = require('path');

class ImeiLockModel {
  constructor(dataDir) {
    this.imeiLocksFile = path.join(dataDir, 'imei_locks.json');
  }

  async initialize() {
    try {
      await fs.mkdir(path.dirname(this.imeiLocksFile), { recursive: true });
      try {
        await fs.access(this.imeiLocksFile);
        console.log('✅ IMEI locks file exists');
      } catch {
        await fs.writeFile(this.imeiLocksFile, JSON.stringify([]));
        console.log('📄 Created IMEI locks file');
      }
    } catch (error) {
      console.error('❌ Error initializing IMEI locks:', error);
      throw error;
    }
  }

  async getAllLocks() {
    try {
      const data = await fs.readFile(this.imeiLocksFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading IMEI locks file:', error);
      return [];
    }
  }

  async getLockByImei(imei) {
    const locks = await this.getAllLocks();
    return locks.find(lock => lock.imei === imei);
  }

  async getLocksByUserId(userId) {
    const locks = await this.getAllLocks();
    return locks.filter(lock => lock.userId === userId);
  }

  async getLocksByStatus(status) {
    const locks = await this.getAllLocks();
    return locks.filter(lock => lock.status === status);
  }

  async addLock(lockData) {
    const locks = await this.getAllLocks();
    locks.push(lockData);
    await fs.writeFile(this.imeiLocksFile, JSON.stringify(locks, null, 2));
    return lockData;
  }

  async updateLock(imei, updates) {
    const locks = await this.getAllLocks();
    const index = locks.findIndex(lock => lock.imei === imei);
    
    if (index === -1) return null;
    
    locks[index] = { ...locks[index], ...updates, lastUpdated: new Date().toISOString() };
    await fs.writeFile(this.imeiLocksFile, JSON.stringify(locks, null, 2));
    return locks[index];
  }

  async lockDevice(imei, purchaseId, userId) {
    const lockData = {
      imei,
      purchaseId,
      userId,
      status: 'locked',
      lockedAt: new Date().toISOString(),
      unlockDate: null,
      lastUpdated: new Date().toISOString()
    };
    
    return this.addLock(lockData);
  }

  async unlockDevice(imei) {
    return this.updateLock(imei, {
      status: 'unlocked',
      unlockDate: new Date().toISOString()
    });
  }

  async getLockStats() {
    const locks = await this.getAllLocks();
    
    return {
      total: locks.length,
      locked: locks.filter(l => l.status === 'locked').length,
      unlocked: locks.filter(l => l.status === 'unlocked').length,
      pending: locks.filter(l => l.status === 'pending').length
    };
  }

  async isDeviceLocked(imei) {
    const lock = await this.getLockByImei(imei);
    return lock && lock.status === 'locked';
  }

  async getActiveLocks() {
    const locks = await this.getAllLocks();
    return locks.filter(lock => lock.status === 'locked' || lock.status === 'pending');
  }
}

module.exports = ImeiLockModel;