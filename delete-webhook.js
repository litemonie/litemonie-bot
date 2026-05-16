// delete-webhook.js
const { Telegraf } = require('telegraf');

const BOT_TOKEN = '8545228537:AAHwwHfnASnlhe_oC2QjpDfWAoKpiXjAWjQ'; // Replace with your actual token

const bot = new Telegraf(BOT_TOKEN);

async function deleteWebhook() {
  try {
    // Delete webhook
    await bot.telegram.deleteWebhook();
    console.log('✅ Webhook deleted successfully');
    
    // Get webhook info to verify
    const info = await bot.telegram.getWebhookInfo();
    console.log('📊 Webhook info:', info);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

deleteWebhook();
