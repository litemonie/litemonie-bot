// app/handlers/deviceInitialization.js
module.exports = {
  initializeDeviceHandler: async (bot, users, virtualAccounts, systemTransactionManager) => {
    console.log('📱 Device initialization starting...');
    
    try {
      // Try to load the device handler
      const DeviceHandler = require('../deviceCredit/handlers/DeviceHandler');
      
      const saveDataCallback = async () => {
        // This callback will be used by the device handler to save data
        console.log('💾 Device data save requested');
      };
      
      const depositSystem = {
        getVirtualAccount: async (userId) => {
          return await virtualAccounts.findByUserId(userId);
        },
        createVirtualAccount: async (userId, accountData) => {
          try {
            return await virtualAccounts.create(accountData);
          } catch (error) {
            console.error('❌ Error creating virtual account:', error);
            return {
              success: false,
              error: error.message
            };
          }
        },
        virtualAccounts: virtualAccounts
      };
      
      // Create device handler instance
      const deviceHandler = new DeviceHandler(
        require('path').join(__dirname, '..', '..', 'data'), 
        bot, 
        users, 
        saveDataCallback,
        depositSystem
      );
      
      // Initialize the handler
      await deviceHandler.initialize();
      console.log('✅ Device Handler initialized successfully');
      
      return deviceHandler;
      
    } catch (error) {
      console.error('❌ Failed to initialize device handler:', error.message);
      console.log('⚠️ Device financing will be disabled');
      return null;
    }
  }
};