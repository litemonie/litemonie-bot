// test-device.js
const { createDeviceCreditManager } = require('./app/deviceCredit');

async function testDeviceSystem() {
  console.log('🧪 Testing Device Credit System...');
  
  // Mock bot and users for testing
  const mockBot = {
    telegram: {
      sendMessage: async (userId, message, options) => {
        console.log(`🤖 Bot would send to ${userId}:`, message.substring(0, 100) + '...');
        return { message_id: 123 };
      }
    }
  };
  
  const mockUsers = {
    '1279640125': {
      firstName: 'Admin',
      lastName: 'User',
      isAdmin: true
    }
  };
  
  try {
    const deviceManager = createDeviceCreditManager(mockBot, mockUsers, './data');
    const initialized = await deviceManager.initialize();
    
    if (initialized) {
      console.log('✅ Device Credit System initialized successfully!');
      
      // Test analytics
      const stats = await deviceManager.getAdminStats();
      console.log('📊 Stats:', stats);
      
      // Test health check
      const health = await deviceManager.healthCheck();
      console.log('❤️ Health:', health);
      
      console.log('✅ All tests passed!');
    } else {
      console.error('❌ Failed to initialize Device Credit System');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

// Run test
testDeviceSystem();