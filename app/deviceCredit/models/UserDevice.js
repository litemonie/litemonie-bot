// app/deviceCredit/models/UserDevice.js
const fs = require('fs').promises;
const path = require('path');

class UserDeviceModel {
  constructor(dataDir) {
    this.dataDir = path.join(dataDir, 'deviceCredit');
    this.filePath = path.join(this.dataDir, 'user_devices.json');
    this.userDevices = [];
  }

  async initialize() {
    try {
      // Ensure directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Check if file exists, create if it doesn't
      try {
        await fs.access(this.filePath);
        // File exists, load it
        const data = await fs.readFile(this.filePath, 'utf8');
        this.userDevices = JSON.parse(data || '[]');
        console.log(`✅ UserDeviceModel: Loaded ${this.userDevices.length} user devices`);
      } catch (error) {
        if (error.code === 'ENOENT') {
          // File doesn't exist, create it with empty array
          await fs.writeFile(this.filePath, '[]');
          console.log('✅ UserDeviceModel: Created new user_devices.json file');
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ UserDeviceModel initialization error:', error);
      throw error;
    }
  }

  async getAllUserDevices() {
    try {
      // Ensure file exists before reading
      try {
        await fs.access(this.filePath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          // File doesn't exist, create it
          await this.initialize();
          return [];
        }
        throw error;
      }
      
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data || '[]');
    } catch (error) {
      console.error('❌ Error reading user devices:', error);
      // Return empty array if file doesn't exist
      if (error.code === 'ENOENT') {
        await this.initialize();
        return [];
      }
      throw error;
    }
  }

  async saveUserDevices() {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(this.userDevices, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Error saving user devices:', error);
      throw error;
    }
  }

  async addUserDevice(userDevice) {
    try {
      this.userDevices = await this.getAllUserDevices();
      this.userDevices.push(userDevice);
      await this.saveUserDevices();
      return userDevice;
    } catch (error) {
      console.error('❌ Error adding user device:', error);
      throw error;
    }
  }

  async getUserDevices(userId) {
    try {
      const userDevices = await this.getAllUserDevices();
      return userDevices.filter(device => device.userId === userId);
    } catch (error) {
      console.error('❌ Error getting user devices:', error);
      return [];
    }
  }

  async updateUserDevice(deviceId, updates) {
    try {
      const userDevices = await this.getAllUserDevices();
      const index = userDevices.findIndex(device => device.deviceId === deviceId);
      
      if (index !== -1) {
        userDevices[index] = { ...userDevices[index], ...updates };
        await fs.writeFile(this.filePath, JSON.stringify(userDevices, null, 2));
        return userDevices[index];
      }
      return null;
    } catch (error) {
      console.error('❌ Error updating user device:', error);
      throw error;
    }
  }

  async deleteUserDevice(deviceId) {
    try {
      const userDevices = await this.getAllUserDevices();
      const filteredDevices = userDevices.filter(device => device.deviceId !== deviceId);
      
      if (filteredDevices.length !== userDevices.length) {
        await fs.writeFile(this.filePath, JSON.stringify(filteredDevices, null, 2));
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error deleting user device:', error);
      throw error;
    }
  }
}

module.exports = UserDeviceModel;