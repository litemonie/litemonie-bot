// app/deviceCredit/models/Device.js
const fs = require('fs').promises;
const path = require('path');

class DeviceModel {
  constructor(dataDir) {
    this.devicesFile = path.join(dataDir, 'devices.json');
  }

  async getAllDevices() {
    try {
      const data = await fs.readFile(this.devicesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading devices file:', error);
      return [];
    }
  }

  async getDeviceById(deviceId) {
    const devices = await this.getAllDevices();
    return devices.find(d => d.id === deviceId);
  }

  async getActiveDevices() {
    const devices = await this.getAllDevices();
    return devices.filter(d => d.status === 'active');
  }

  async addDevice(deviceData) {
    const devices = await this.getAllDevices();
    devices.push(deviceData);
    await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
    return deviceData;
  }

  async updateDevice(deviceId, updates) {
    const devices = await this.getAllDevices();
    const index = devices.findIndex(d => d.id === deviceId);
    
    if (index === -1) return null;
    
    devices[index] = { ...devices[index], ...updates };
    await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
    return devices[index];
  }

  async deleteDevice(deviceId) {
    const devices = await this.getAllDevices();
    const filteredDevices = devices.filter(d => d.id !== deviceId);
    await fs.writeFile(this.devicesFile, JSON.stringify(filteredDevices, null, 2));
    return true;
  }

  async getDeviceStats() {
    const devices = await this.getAllDevices();
    const activeDevices = devices.filter(d => d.status === 'active');
    
    return {
      total: devices.length,
      active: activeDevices.length,
      byCategory: this.groupBy(devices, 'category')
    };
  }

  groupBy(array, key) {
    return array.reduce((result, item) => {
      const groupKey = item[key] || 'uncategorized';
      if (!result[groupKey]) result[groupKey] = 0;
      result[groupKey]++;
      return result;
    }, {});
  }
}

module.exports = DeviceModel;