// ==================== INDEX.JS ====================
// BOOTSTRAPPER - Just starts the bot with Render support
// ==================================================

require('dotenv').config();
const express = require('express');

console.log('🚀 VTU Bot Starting...');
console.log('\n🔍 ENVIRONMENT CHECK:');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ SET' : '❌ NOT SET');
console.log('VTU_API_KEY:', process.env.VTU_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('ADMIN_ID:', process.env.ADMIN_ID ? '✅ SET' : '❌ NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

// Initialize Express app for health checks and webhooks
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    bot: 'running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: '🚀 Litemonie Bot is running!',
    docs: {
      health: '/health',
      botInfo: '/bot-info',
      webhook: '/webhook',
      billstack: '/billstack-webhook'
    },
    timestamp: new Date().toISOString()
  });
});

// Bot info endpoint
app.get('/bot-info', async (req, res) => {
  try {
    const { getBotInfo } = require('./bot-core');
    const botInfo = await getBotInfo();
    res.status(200).json(botInfo);
  } catch (error) {
    res.status(500).json({ error: 'Bot info unavailable', message: error.message });
  }
});


// Debug endpoint - check user by ID
app.get('/debug/user/:id', (req, res) => {
  const { getUsers } = require('./database');
  const users = getUsers();
  const user = users[req.params.id];
  res.json({ 
    userId: req.params.id, 
    user: user ? { email: user.email, wallet: user.wallet, firstName: user.firstName } : null,
    allUserIds: Object.keys(users)
  });
});

// Temporary endpoint to update user email
app.post('/debug/update-email/:id/:email', (req, res) => {
  try {
    const { getUsers, setUsers, saveAllData } = require('./database');
    const users = getUsers();
    const userId = req.params.id;
    const email = req.params.email;
    
    if (users[userId]) {
      users[userId].email = email;
      setUsers(users);
      saveAllData();
      res.json({ success: true, userId: userId, email: email });
    } else {
      res.json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for Telegram (if using webhooks)
app.post('/webhook', (req, res) => {
  try {
    // Your webhook handling logic here
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// ========== BILLSTACK WEBHOOK ENDPOINT ==========
app.post('/billstack-webhook', async (req, res) => {
  console.log('💰 Billstack webhook received:', new Date().toISOString());
  console.log('📦 Body:', JSON.stringify(req.body));
  
  try {
    const { transactionReference, amount, customerReference, status } = req.body;
    
    if (status === 'success' && customerReference) {
      const { getUsers, setUsers, saveAllData, recordTransaction } = require('./database');
      const users = getUsers();
      
      if (users[customerReference]) {
        const previousBalance = users[customerReference].wallet || 0;
        users[customerReference].wallet = previousBalance + parseFloat(amount);
        setUsers(users);
        await saveAllData();
        
        await recordTransaction(customerReference, {
          type: 'deposit',
          amount: parseFloat(amount),
          status: 'completed',
          description: 'Billstack deposit',
          reference: transactionReference,
          previousBalance: previousBalance,
          newBalance: users[customerReference].wallet
        });
        
        console.log(`✅ Credited ₦${amount} to user ${customerReference}`);
        
        // Notify user on Telegram
        try {
          const { bot } = require('./bot-core');
          await bot.telegram.sendMessage(
            customerReference,
            `💰 *DEPOSIT SUCCESSFUL!*\n\n` +
            `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
            `Reference: ${transactionReference}\n\n` +
            `New Balance: ₦${users[customerReference].wallet.toLocaleString()}`,
            { parse_mode: 'Markdown' }
          );
        } catch (notifyErr) {
          console.log('Could not notify user:', customerReference);
        }
      } else {
        console.log(`⚠️ User ${customerReference} not found`);
      }
    }
    
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('❌ Billstack error:', error);
    res.status(200).json({ status: 'received' });
  }
});

// Start the Express server first
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📡 Health check server running on port ${PORT}`);
  console.log(`🔗 Health check URL: http://localhost:${PORT}/health`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌍 Public URL: https://${process.env.RENDER_EXTERNAL_URL || 'litemonie-bot.onrender.com'}/health`);
  }
});

// Import bot launcher
const { launchBot } = require('./bot-core');

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Save all data
    console.log('💾 Saving data...');
    const { saveAllData } = require('./database');
    await saveAllData();
    console.log('✅ Data saved successfully');
    
    // Stop the bot
    console.log('🤖 Stopping bot...');
    const { stopBot } = require('./bot-core');
    if (stopBot) {
      await stopBot();
    }
    
    // Close server
    console.log('📡 Closing server...');
    server.close(() => {
      console.log('✅ Server closed');
      console.log('👋 Bot stopped successfully');
      process.exit(0);
    });
    
    // Force exit after timeout
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  await gracefulShutdown('unhandledRejection');
});

// Start the bot with webhook support in production
async function startBot() {
  try {
    if (process.env.NODE_ENV === 'production') {
      // In production, use webhooks
      console.log('\n🌐 Configuring for production with webhooks...');
      
      // Get the bot instance
      const { bot, setupWebhook } = require('./bot-core');
      
      if (setupWebhook) {
        const webhookUrl = `https://${process.env.RENDER_EXTERNAL_URL || 'litemonie-bot.onrender.com'}/webhook`;
        await setupWebhook(webhookUrl);
        console.log(`✅ Webhook configured: ${webhookUrl}`);
      }
      
      // Launch bot in webhook mode
      await launchBot(true); // Pass true for webhook mode
    } else {
      // In development, use polling
      console.log('\n📱 Configuring for development with polling...');
      await launchBot(false);
    }
    
    console.log('\n✅ Bot is fully operational!');
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    
    // Check for 404 error (invalid token)
    if (error.code === 404 || (error.response && error.response.error_code === 404)) {
      console.error('\n🔴 CRITICAL: Bot token is invalid or bot does not exist!');
      console.error('Please check:');
      console.error('1. BOT_TOKEN environment variable is set correctly');
      console.error('2. The bot exists on Telegram (check with @BotFather)');
      console.error('3. No hidden characters in the token');
      console.error('\nCurrent BOT_TOKEN starts with:', process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 5) + '...' : 'NOT SET');
    }
    
    process.exit(1);
  }
}

// Start everything
startBot();

// Export for use in other modules
module.exports = { 
  launchBot: startBot,
  app,
  server
};
