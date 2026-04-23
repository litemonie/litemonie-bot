// ==================== BOT-CORE.JS ====================
// Bot initialization, server setup, launch
// Works with your index.js - Complete version with Naira currency
// =====================================================

const { Telegraf } = require('telegraf');
const { Markup } = require('telegraf');
const express = require('express');

// Global bot instance
let botInstance = null;
let serverInstance = null;

// Format currency in Naira
function formatNaira(amount) {
    return `₦${amount.toLocaleString('en-NG')}.00`;
}

// ========== CREATE BOT FUNCTION ==========
async function createBot() {
    console.log('🚀 Creating bot instance...');
    
    if (!process.env.BOT_TOKEN) {
        console.error('❌ BOT_TOKEN not set');
        process.exit(1);
    }
    
    const bot = new Telegraf(process.env.BOT_TOKEN);
    
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

// ========== SETUP BOT COMMANDS ==========
async function setupCommands(bot) {
    
    // Start command with full menu
    bot.start(async (ctx) => {
        const userId = ctx.from.id.toString();
        const isAdmin = userId === process.env.ADMIN_ID || userId === '1279640125';
        console.log(`User ${userId} started the bot`);
        
        let keyboard;
        if (isAdmin) {
            keyboard = [
                ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
                ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
                ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
                ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
                ['🛂 KYC Status', '🛠️ Admin Panel', '🆘 Help & Support']
            ];
        } else {
            keyboard = [
                ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
                ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
                ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
                ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
                ['🛂 KYC Status', '🆘 Help & Support']
            ];
        }
        
        await ctx.reply(
            `🌟 *Welcome to Liteway VTU Bot!*\n\n` +
            `💵 *Wallet Balance:* ${formatNaira(0)}\n\n` +
            `📱 *Select an option below:*`,
            {
                parse_mode: 'Markdown',
                ...Markup.keyboard(keyboard).resize()
            }
        );
    });
    
    // ========== MENU HANDLERS (Naira currency) ==========
    
    bot.hears('💰 Wallet Balance', async (ctx) => {
        await ctx.reply(`💰 *Your Wallet Balance*\n\n💵 Available: ${formatNaira(0)}\n\nUse 💳 Deposit Funds to add money.`, {
            parse_mode: 'Markdown'
        });
    });
    
    bot.hears('💳 Deposit Funds', async (ctx) => {
        await ctx.reply(
            `💳 *Deposit Funds*\n\n` +
            `💰 Minimum deposit: ${formatNaira(1000)}\n` +
            `💵 Maximum deposit: ${formatNaira(500000)}\n\n` +
            `Choose deposit method:\n\n` +
            `1️⃣ Bank Transfer\n` +
            `2️⃣ Card Payment\n` +
            `3️⃣ Crypto (USDT)\n\n` +
            `📞 Contact @opuenekeke for assistance.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('📜 Transaction History', async (ctx) => {
        await ctx.reply(`📜 *Transaction History*\n\nNo recent transactions.\n\n💰 Total spent: ${formatNaira(0)}\n💵 Total deposited: ${formatNaira(0)}`, {
            parse_mode: 'Markdown'
        });
    });
    
    bot.hears('🆘 Help & Support', async (ctx) => {
        await ctx.reply(
            `🆘 *Help & Support*\n\n` +
            `📞 *Customer Support:* @opuenekeke\n\n` +
            `📱 *Available Commands:*\n` +
            `/start - Main menu\n` +
            `/balance - Check balance\n` +
            `/help - This message\n\n` +
            `⏰ *Response Time:* Within 24 hours`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('🛂 KYC Status', async (ctx) => {
        await ctx.reply(
            `🛂 *KYC Verification*\n\n` +
            `📋 *Status:* ⏳ Not Verified\n\n` +
            `To verify, contact support with:\n` +
            `• Government ID\n` +
            `• Selfie with ID\n` +
            `• Proof of address`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('🛠️ Admin Panel', async (ctx) => {
        const userId = ctx.from.id.toString();
        const isAdmin = userId === process.env.ADMIN_ID || userId === '1279640125';
        
        if (!isAdmin) {
            await ctx.reply('❌ *Admin Access Only*', { parse_mode: 'Markdown' });
            return;
        }
        
        await ctx.reply(
            `🛠️ *Admin Panel*\n\n` +
            `📊 *System Status:* 🟢 Online\n\n` +
            `*Quick Actions:*\n` +
            `👥 /users - View all users\n` +
            `💰 /stats - View system stats\n` +
            `💸 /credituser - Credit a user\n\n` +
            `📈 *Today's Summary:*\n` +
            `• Transactions: 0\n` +
            `• Volume: ${formatNaira(0)}`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('📱 Device Financing', async (ctx) => {
        await ctx.reply(
            `📱 *Device Financing Program*\n\n` +
            `🚀 *Available Devices:*\n\n` +
            `📱 *iPhone 14 Pro* - ${formatNaira(899000)}\n` +
            `📱 *Samsung S23 Ultra* - ${formatNaira(799000)}\n` +
            `📱 *Google Pixel 7* - ${formatNaira(599000)}\n\n` +
            `📝 *Requirements:*\n` +
            `• ✅ KYC Verified\n` +
            `• 💰 Initial deposit: 30%\n\n` +
            `📞 Contact @opuenekeke to apply.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('📺 TV Subscription', async (ctx) => {
        await ctx.reply(
            `📺 *TV Subscriptions*\n\n` +
            `*DSTV:*\n` +
            `• Premium - ${formatNaira(37000)}\n` +
            `• Compact+ - ${formatNaira(25000)}\n\n` +
            `*GOtv:*\n` +
            `• Supa+ - ${formatNaira(18500)}\n` +
            `• Max - ${formatNaira(12500)}\n\n` +
            `Send /tv <plan> to subscribe.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('💡 Electricity Bill', async (ctx) => {
        await ctx.reply(
            `💡 *Electricity Bill Payment*\n\n` +
            `*Supported Providers:*\n` +
            `• Ikeja Electric\n` +
            `• Eko Electric\n` +
            `• Abuja Electric\n\n` +
            `💰 *Minimum Payment:* ${formatNaira(1000)}\n\n` +
            `Send /electricity <meter_number> to pay.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('📞 Buy Airtime', async (ctx) => {
        await ctx.reply(
            `📞 *Buy Airtime*\n\n` +
            `*Networks:* MTN, Glo, Airtel, 9mobile\n` +
            `💰 *Minimum:* ${formatNaira(100)}\n\n` +
            `Send /airtime <network> <amount> to purchase.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('📡 Buy Data', async (ctx) => {
        await ctx.reply(
            `📡 *Buy Data*\n\n` +
            `*MTN Plans:*\n` +
            `• 1GB - ${formatNaira(300)}\n` +
            `• 2GB - ${formatNaira(550)}\n` +
            `• 5GB - ${formatNaira(1300)}\n\n` +
            `Send /data <network> <plan> to buy.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('🎫 Card Pins', async (ctx) => {
        await ctx.reply(
            `🎫 *Gift Cards*\n\n` +
            `• Steam\n` +
            `• Amazon\n` +
            `• iTunes\n` +
            `• Google Play\n\n` +
            `Send /cards <type> <amount> to buy.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('📝 Exam Pins', async (ctx) => {
        await ctx.reply(
            `📝 *Exam Pins*\n\n` +
            `• WAEC - ${formatNaira(15000)}\n` +
            `• NECO - ${formatNaira(18000)}\n` +
            `• JAMB - ${formatNaira(12000)}\n\n` +
            `Send /exams <exam> to purchase.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.hears('⚡ Lite Light', async (ctx) => {
        await ctx.reply(`⚡ *Lite Light*\n\n🚧 Coming soon!`, { parse_mode: 'Markdown' });
    });
    
    bot.hears('🏦 Money Transfer', async (ctx) => {
        await ctx.reply(
            `🏦 *Money Transfer*\n\n` +
            `• Bank Accounts - Fee: ${formatNaira(50)}\n` +
            `• Litemonie Users - Free\n` +
            `• Mobile Wallets - Fee: ${formatNaira(30)}\n\n` +
            `Send /transfer <recipient> <amount> to continue.`,
            { parse_mode: 'Markdown' }
        );
    });
    
    // ========== TEXT COMMANDS ==========
    bot.command('balance', async (ctx) => {
        await ctx.reply(`💰 *Your Balance:* ${formatNaira(0)}`, { parse_mode: 'Markdown' });
    });
    
    bot.command('help', async (ctx) => {
        await ctx.reply(
            `📱 *Available Commands*\n\n` +
            `/start - Main menu\n` +
            `/balance - Check balance\n` +
            `/help - This message`,
            { parse_mode: 'Markdown' }
        );
    });
    
    // Error handler
    bot.catch((err, ctx) => {
        console.error('❌ Bot error:', err);
        ctx.reply('❌ An error occurred. Please try again.').catch(() => {});
    });
}

// ========== SETUP EXPRESS SERVER ==========
function setupExpressServer(bot) {
    const app = express();
    app.use(express.json());
    
    // Health check endpoint
    app.get('/health', (req, res) => {
        res.status(200).json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            bot: bot.options?.username || 'running'
        });
    });
    
    // Webhook endpoint
    app.post('/webhook', (req, res) => {
        try {
            bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(200).send('OK');
        }
    });
    
    return app;
}

// ========== WEBHOOK SETUP ==========
async function setupWebhook(bot, webhookUrl) {
    try {
        console.log(`🌐 Setting up webhook: ${webhookUrl}`);
        await bot.telegram.deleteWebhook();
        await bot.telegram.setWebhook(webhookUrl);
        const webhookInfo = await bot.telegram.getWebhookInfo();
        console.log('✅ Webhook configured successfully');
        return true;
    } catch (error) {
        console.error('❌ Webhook setup failed:', error.message);
        return false;
    }
}

// ========== STOP BOT ==========
async function stopBot() {
    console.log('🛑 Stopping bot...');
    try {
        if (botInstance) {
            await botInstance.stop();
            console.log('✅ Bot stopped');
        }
    } catch (error) {
        console.error('❌ Error stopping bot:', error);
    }
}

// ========== GET BOT INFO ==========
async function getBotInfo() {
    if (!botInstance) return null;
    try {
        const me = await botInstance.telegram.getMe();
        return {
            username: me.username,
            id: me.id,
            firstName: me.first_name,
            uptime: process.uptime()
        };
    } catch (error) {
        return { error: error.message };
    }
}

// ========== MAIN LAUNCH FUNCTION ==========
async function launchBot(useWebhook = false) {
    try {
        botInstance = await createBot();
        
        // Setup commands
        await setupCommands(botInstance);
        
        // Setup Express server
        const app = setupExpressServer(botInstance);
        
        // Start server
        const PORT = process.env.PORT || 3000;
        serverInstance = app.listen(PORT, '0.0.0.0', () => {
            console.log(`📡 Server running on port ${PORT}`);
        });
        
        // Launch bot
        if (useWebhook && process.env.NODE_ENV === 'production') {
            const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
            const webhookUrl = `${baseUrl}/webhook`;
            await setupWebhook(botInstance, webhookUrl);
            console.log('✅ Bot running in PRODUCTION mode with webhook');
        } else {
            await botInstance.launch();
            console.log('✅ Bot running in DEVELOPMENT mode with polling');
        }
        
        console.log(`🤖 Bot Username: @${botInstance.options?.username}`);
        return botInstance;
        
    } catch (error) {
        console.error('❌ Failed to launch bot:', error);
        throw error;
    }
}

module.exports = { 
    launchBot,
    stopBot,
    getBotInfo,
    setupWebhook,
    bot: botInstance
};
