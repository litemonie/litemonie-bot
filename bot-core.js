// ==================== BOT-CORE.JS ====================
// Complete working version with webhook support
// =====================================================

const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// Middleware
app.use(express.json());

// ========== LOGGING MIDDLEWARE ==========
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ========== HEALTH CHECK ENDPOINTS ==========
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        bot: 'running'
    });
});

app.get('/', (req, res) => {
    res.status(200).json({
        message: '🚀 Litemonie Bot is running!',
        docs: {
            health: '/health',
            webhook: '/webhook'
        },
        timestamp: new Date().toISOString()
    });
});

// ========== CRITICAL: WEBHOOK ENDPOINT ==========
app.post('/webhook', (req, res) => {
    console.log('📩 Webhook received at:', new Date().toISOString());
    console.log('Update ID:', req.body?.update_id);
    console.log('Message:', req.body?.message?.text);
    console.log('From:', req.body?.message?.from?.id);
    
    try {
        // Process the update
        bot.handleUpdate(req.body);
        console.log('✅ Update handled successfully');
        res.status(200).send('OK');
    } catch (error) {
        console.error('❌ Webhook error:', error);
        // Always return 200 to Telegram
        res.status(200).send('OK');
    }
});

// ========== DEBUG ENDPOINTS ==========
app.get('/ping', (req, res) => {
    res.send('pong');
});

app.post('/test-webhook', (req, res) => {
    console.log('Test webhook received:', req.body);
    res.json({ received: true, body: req.body });
});

// ========== BOT COMMANDS ==========

// Start command
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    console.log(`User ${userId} started the bot`);
    
    await ctx.reply(
        `🌟 *Welcome to Litemonie Bot!*\n\n` +
        `I'm here to help you with:\n` +
        `• 📱 Device Financing\n` +
        `• 💳 VTU Services\n` +
        `• 🏦 Money Transfers\n\n` +
        `Send /help to see all commands.`,
        { parse_mode: 'Markdown' }
    );
});

// Help command
bot.help(async (ctx) => {
    await ctx.reply(
        `📱 *Available Commands*\n\n` +
        `/start - Welcome message\n` +
        `/help - Show this help\n` +
        `/balance - Check wallet balance\n` +
        `/status - Bot status\n\n` +
        `More commands coming soon!`,
        { parse_mode: 'Markdown' }
    );
});

// Balance command
bot.command('balance', async (ctx) => {
    await ctx.reply(`💰 *Your balance:* $0.00\n\nStart using our services to earn rewards!`, { parse_mode: 'Markdown' });
});

// Status command
bot.command('status', async (ctx) => {
    await ctx.reply(`✅ *Bot Status:* Online\n📡 *Uptime:* ${Math.floor(process.uptime())} seconds`, { parse_mode: 'Markdown' });
});

// Simple text response for non-commands
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    
    await ctx.reply(`You said: "${text}"\n\nType /help for available commands.`);
});

// ========== ERROR HANDLER ==========
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    ctx.reply('An error occurred. Please try again.').catch(() => {});
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n📡 Server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
    
    if (process.env.RENDER_EXTERNAL_URL) {
        console.log(`🌍 Public URL: ${process.env.RENDER_EXTERNAL_URL}`);
    }
});

// ========== SETUP WEBHOOK IN PRODUCTION ==========
if (process.env.NODE_ENV === 'production') {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const webhookUrl = `${baseUrl}/webhook`;
    
    console.log(`\n🔧 Setting up webhook: ${webhookUrl}`);
    
    bot.telegram.deleteWebhook()
        .then(() => bot.telegram.setWebhook(webhookUrl))
        .then(() => {
            console.log('✅ Webhook configured successfully!');
            return bot.telegram.getWebhookInfo();
        })
        .then(info => {
            console.log(`📡 Webhook info: ${info.url}`);
        })
        .catch(err => {
            console.error('❌ Webhook setup failed:', err.message);
        });
    
    console.log('🤖 Bot running in PRODUCTION mode with webhook\n');
} else {
    // Development mode - use polling
    bot.launch();
    console.log('🤖 Bot running in DEVELOPMENT mode with polling\n');
}

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    bot.stop();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    bot.stop();
    process.exit(0);
});

console.log('✅ Bot-core initialized successfully');

module.exports = { bot };
