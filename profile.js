// ==================== profile.js ====================
// User Profile Feature
// ====================================================

const { Markup } = require('telegraf');
const { getUserProfile, updateUserEmail, getUserByTelegramId } = require('./database-sql');

function formatCurrency(amount) {
    return `₦${amount.toLocaleString('en-NG')}.00`;
}

async function showProfile(ctx) {
    const telegramId = ctx.from.id.toString();
    const profile = await getUserProfile(telegramId);
    
    if (!profile) {
        await ctx.reply('❌ Profile not found. Please /start first.');
        return;
    }
    
    const { user, virtualAccount, recentTransactions } = profile;
    
    let message = `👤 *YOUR PROFILE*\n\n`;
    message += `📛 *Name:* ${user.first_name || 'Not set'} ${user.last_name || ''}\n`;
    message += `🆔 *ID:* \`${user.telegram_id}\`\n`;
    message += `📧 *Email:* ${user.email || 'Not set'}\n`;
    message += `📱 *Phone:* ${user.phone || 'Not set'}\n`;
    message += `🔐 *PIN:* ${user.pin ? '✅ Set' : '❌ Not set'}\n`;
    message += `💰 *Wallet:* ${formatCurrency(user.wallet || 0)}\n`;
    message += `✅ *KYC:* ${user.kyc_status?.toUpperCase() || 'PENDING'}\n\n`;
    
    if (virtualAccount) {
        message += `🏦 *Virtual Account*\n`;
        message += `   Bank: ${virtualAccount.bank_name}\n`;
        message += `   Account: \`${virtualAccount.account_number}\`\n`;
        message += `   Name: ${virtualAccount.account_name}\n\n`;
    }
    
    if (recentTransactions && recentTransactions.length > 0) {
        message += `📜 *Recent Transactions*\n`;
        recentTransactions.slice(0, 3).forEach(tx => {
            const emoji = tx.type === 'deposit' ? '💰' : '💸';
            message += `${emoji} ${tx.type.toUpperCase()}: ${formatCurrency(tx.amount)} - ${tx.status}\n`;
        });
    }
    
    const keyboard = [
        [Markup.button.callback('✏️ Update Email', 'update_email')],
        [Markup.button.callback('📱 Update Phone', 'update_phone')],
        [Markup.button.callback('🔄 Refresh', 'refresh_profile')],
        [Markup.button.callback('🏠 Home', 'start')]
    ];
    
    await ctx.reply(message, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) });
}

async function updateUserEmailByTelegramId(telegramId, email) {
    return await updateUserEmail(telegramId, email);
}

module.exports = { showProfile, updateUserEmailByTelegramId, formatCurrency };
