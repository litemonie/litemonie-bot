// ==================== DEVICE-SYSTEM.JS ====================
// Device Financing Handler & Mini App
// ==========================================================

const DeviceLockApp = require('./app/deviceCredit/handlers/DeviceLockApp');

let deviceHandler = null;
let deviceCreditCallbacks = {};
let deviceLockApp = null;
let miniAppCallbacks = {};

async function initializeDeviceHandler(bot) {
  try {
    if (deviceHandler) {
      deviceHandler.bot = bot;
      deviceHandler.users = require('./database').getUsers();
      console.log('✅ Device Handler updated');
      
      if (!deviceLockApp) {
        deviceLockApp = new DeviceLockApp(bot, deviceHandler);
        miniAppCallbacks = deviceLockApp.getCallbacks();
        console.log('✅ Device Lock Mini App initialized');
      }
      return deviceHandler;
    }
    
    console.log('📱 Initializing Device Handler...');
    const DeviceHandler = require('./app/deviceCredit/handlers/DeviceHandler');
    const { getUsers, saveAllData } = require('./database');
    const virtualAccounts = require('./index').virtualAccounts; // Will be passed
    
    const saveDataCallback = async () => {
      try { await saveAllData(); console.log('💾 Device data saved'); } 
      catch (error) { console.error('❌ Error saving data:', error); }
    };
    
    const depositSystem = {
      getVirtualAccount: async (userId) => await virtualAccounts.findByUserId(userId),
      createVirtualAccount: async (userId, accountData) => {
        try {
          const accountNumber = `7${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 10)}`;
          const reference = `VA${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
          const virtualAccountData = {
            user_id: userId, bank_name: 'WEMA BANK', account_number: accountNumber,
            account_name: accountData.firstName ? `${accountData.firstName} ${accountData.lastName || ''}`.trim() : `User ${userId}`,
            reference, provider: 'billstack', created_at: new Date().toISOString(), is_active: true
          };
          const result = await virtualAccounts.create(virtualAccountData);
          return { success: true, ...virtualAccountData };
        } catch (error) {
          console.error('❌ Error creating virtual account:', error);
          return { success: false, error: error.message };
        }
      },
      virtualAccounts: virtualAccounts
    };
    
    deviceHandler = new DeviceHandler('./data', bot, getUsers(), saveDataCallback, depositSystem);
    await deviceHandler.initialize();
    console.log('✅ Device Handler initialized');
    
    deviceLockApp = new DeviceLockApp(bot, deviceHandler);
    miniAppCallbacks = deviceLockApp.getCallbacks();
    console.log('✅ Device Lock Mini App initialized');
    
    deviceCreditCallbacks = deviceHandler.getCallbacks();
    console.log(`📱 Loaded ${Object.keys(deviceCreditCallbacks).length} device callbacks`);
    
    return deviceHandler;
  } catch (error) {
    console.error('❌ Device handler init error:', error);
    deviceHandler = null;
    return null;
  }
}

function getDeviceHandler() { return deviceHandler; }
function getDeviceCallbacks() { return deviceCreditCallbacks; }
function getDeviceLockApp() { return deviceLockApp; }
function getMiniAppCallbacks() { return miniAppCallbacks; }

module.exports = {
  initializeDeviceHandler,
  getDeviceHandler,
  getDeviceCallbacks,
  getDeviceLockApp,
  getMiniAppCallbacks,
  deviceHandler,
  deviceLockApp
};