// ==================== BOT-CORE.JS ====================
// Complete working version - Exports launchBot function
// =====================================================

const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');

// Global bot instance
let botInstance = null;
let serverInstance = null;

// ========== CREATE BOT FUNCTION ==========
async function createBot() {
    console.log('🚀 Creating bot instance...');
    
    if (!process.env.BOT_TOKEN) {
        console.error('❌ BOT_TOKEN not set');
        process.exit(1);
    }
    
    const bot = new Telegraf(process.env.BOT_TOKEN);
    
    // Fetch bot username
    try {
        const botInfo = await bot.telegram.getMe();
        bot.options = bot.options || {};
        bot.options.username = botInfo.username;
        bot.botInfo = botInfo;
        console.log(`✅ Bot username set to: @${botInfo.username}`);
    } catch (error) {
        console.error('❌ Could not fetch bot username:', error.message);
        bot.options = bot.options || {};
        bot.options.username = 'litepayltd_bot';
    }
    
    return bot;
}

// ========== SETUP EXPRESS SERVER ==========
function setupExpressServer(bot) {
    const app = express();
    
    // Middleware
    app.use(express.json());
    app.set('trust proxy', true);
    
    // CORS
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });
    
    // ========== HEALTH CHECK ENDPOINTS ==========
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            bot: bot.options?.username || 'running'
        });
    });
    
    app.get('/', (req, res) => {
        res.status(200).json({
            message: '🚀 Litemonie Bot is running!',
            docs: {
                health: '/health',
                botInfo: '/bot-info',
                webhook: '/webhook'
            },
            timestamp: new Date().toISOString()
        });
    });
    
    app.get('/bot-info', async (req, res) => {
        try {
            res.status(200).json({
                username: bot.options?.username,
                isRunning: true,
                uptime: process.uptime()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // ========== CRITICAL: WEBHOOK ENDPOINT ==========
    app.post('/webhook', (req, res) => {
        console.log('📩 Webhook received at:', new Date().toISOString());
        console.log('📦 Update ID:', req.body?.update_id);
        console.log('💬 Message:', req.body?.message?.text);
        
        try {
            bot.handleUpdate(req.body);
            console.log('✅ Update handled successfully');
            res.status(200).send('OK');
        } catch (error) {
            console.error('❌ Webhook error:', error);
            res.status(200).send('OK');
        }
    });
    
    // ========== DEBUG ENDPOINTS ==========
    app.get('/ping', (req, res) => {
        res.send('pong');
    });
    
    app.post('/test-webhook', (req, res) => {
        console.log('🧪 Test webhook received');
        res.json({ received: true, body: req.body });
    });
    
    return app;
}

// ========== SETUP BOT COMMANDS ==========
async function setupCommands(bot) {
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
    
    // Error handler
    bot.catch((err, ctx) => {
        console.error('❌ Bot error:', err);
        ctx.reply('An error occurred. Please try again.').catch(() => {});
    });
}

// ========== WEBHOOK SETUP FUNCTION ==========
async function setupWebhook(bot, webhookUrl) {
    try {
        console.log(`🌐 Setting up webhook: ${webhookUrl}`);
        
        await bot.telegram.deleteWebhook();
        await bot.telegram.setWebhook(webhookUrl);
        
        const webhookInfo = await bot.telegram.getWebhookInfo();
        console.log('✅ Webhook configured successfully:');
        console.log(`   URL: ${webhookInfo.url}`);
        console.log(`   Pending updates: ${webhookInfo.pending_update_count || 0}`);
        console.log(`   Max connections: ${webhookInfo.max_connections || 40}`);
        
        return true;
    } catch (error) {
        console.error('❌ Failed to setup webhook:', error.message);
        return false;
    }
}

// ========== STOP BOT FUNCTION ==========
async function stopBot() {
    console.log('🛑 Stopping bot...');
    try {
        if (botInstance) {
            await botInstance.stop();
            if (process.env.NODE_ENV === 'production') {
                await botInstance.telegram.deleteWebhook();
                console.log('✅ Webhook deleted');
            }
            console.log('✅ Bot stopped');
        }
        
        if (serverInstance) {
            await new Promise((resolve) => {
                serverInstance.close(() => {
                    console.log('✅ Server closed');
                    resolve();
                });
            });
        }
    } catch (error) {
        console.error('❌ Error stopping bot:', error);
    }
}

// ========== GET BOT INFO FUNCTION ==========
async function getBotInfo() {
    if (!botInstance) return null;
    try {
        const me = await botInstance.telegram.getMe();
        const webhookInfo = await botInstance.telegram.getWebhookInfo();
        return {
            username: me.username,
            id: me.id,
            isBot: me.is_bot,
            firstName: me.first_name,
            webhook: webhookInfo,
            uptime: process.uptime()
        };
    } catch (error) {
        return { error: error.message };
    }
}

// ========== MAIN LAUNCH FUNCTION ==========
async function launchBot(useWebhook = false) {
    try {
        // Create bot instance
        botInstance = await createBot();
        
        // Setup Express server
        const app = setupExpressServer(botInstance);
        
        // Setup bot commands
        await setupCommands(botInstance);
        
        // Error handler
        botInstance.catch((err, ctx) => {
            console.error('❌ Global Error:', err);
            ctx.reply('❌ An error occurred', { parse_mode: 'Markdown' }).catch(() => {});
        });
        
        // Start server
        const PORT = process.env.PORT || 3000;
        serverInstance = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n📡 Server running on port ${PORT}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            if (process.env.RENDER_EXTERNAL_URL) {
                console.log(`🌍 Public URL: ${process.env.RENDER_EXTERNAL_URL}`);
            }
        });
        
        // Launch bot (webhook or polling)
        if (useWebhook || process.env.NODE_ENV === 'production') {
            const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
            const webhookUrl = `${baseUrl}/webhook`;
            
            const webhookSuccess = await setupWebhook(botInstance, webhookUrl);
            
            if (webhookSuccess) {
                console.log('\n✅ Bot running in PRODUCTION mode with webhook');
            } else {
                console.log('\n⚠️ Webhook setup failed, falling back to polling');
                await botInstance.launch();
            }
        } else {
            await botInstance.launch();
            console.log('\n✅ Bot running in DEVELOPMENT mode with polling');
        }
        
        console.log(`🤖 Bot Username: @${botInstance.options?.username || 'unknown'}`);
        
        return botInstance;
        
    } catch (error) {
        console.error('❌ Failed to launch bot:', error);
        throw error;
    }
}

// Export all functions for index.js
module.exports = {
    launchBot,
    stopBot,
    getBotInfo,
    setupWebhook,
    bot: botInstance
};
