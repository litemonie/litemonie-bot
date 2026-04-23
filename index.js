// ==================== INDEX.JS ====================
// Working version - Polling mode with full menu
// ==================================================

require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');

console.log('🚀 VTU Bot Starting...');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ SET' : '❌ NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

// Create bot
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// ========== BOT COMMANDS ==========
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    console.log(`User ${userId} started the bot`);
    
    const keyboard = [
        ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
        ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
        ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
        ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
        ['🛂 KYC Status', '🆘 Help & Support']
    ];
    
    await ctx.reply(
        `🌟 *Welcome to Liteway VTU Bot!*\n\n` +
        `💵 *Wallet Balance:* $0.00\n\n` +
        `📱 *Available Services:*\n` +
        `Select an option below:`,
        {
            parse_mode: 'Markdown',
            reply_markup: { keyboard: keyboard, resize_keyboard: true }
        }
    );
});

// Menu handlers
bot.hears('💰 Wallet Balance', async (ctx) => {
    await ctx.reply(`💰 *Your Balance:* $0.00\n\nUse /deposit to add funds.`, { parse_mode: 'Markdown' });
});

bot.hears('💳 Deposit Funds', async (ctx) => {
    await ctx.reply(`💳 *Deposit Funds*\n\nComing soon!`, { parse_mode: 'Markdown' });
});

bot.hears('📜 Transaction History', async (ctx) => {
    await ctx.reply(`📜 *Transaction History*\n\nNo transactions yet.`, { parse_mode: 'Markdown' });
});

bot.hears('🆘 Help & Support', async (ctx) => {
    await ctx.reply(
        `🆘 *Help & Support*\n\n` +
        `📞 Contact: @opuenekeke\n` +
        `📱 Commands: /start, /help, /balance`,
        { parse_mode: 'Markdown' }
    );
});

// Help command
bot.help(async (ctx) => {
    await ctx.reply(`Available commands:\n/start - Main menu\n/balance - Check balance\n/help - This message`);
});

// Balance command
bot.command('balance', async (ctx) => {
    await ctx.reply(`💰 *Balance:* $0.00`, { parse_mode: 'Markdown' });
});

// ========== EXPRESS SERVER FOR HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Server running on port ${PORT}`);
});

// ========== LAUNCH BOT IN POLLING MODE ==========
bot.launch();
console.log('✅ Bot is running in POLLING mode with full menu!');

// Graceful shutdown
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
