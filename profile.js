// ==================== profile.js ====================
// User Profile Feature - Works with existing JSON database
// ====================================================

const { Markup } = require('telegraf');
const { getUsers, getTransactions, getVirtualAccounts } = require('./database');
const { formatCurrency, isAdmin } = require('./utils');

// Helper function to get virtual account for a user
async function getVirtualAccountByUserId(userId, virtualAccounts) {
    try {
        // If virtualAccounts module has findByUserId method
        if (virtualAccounts && virtualAccounts.findByUserId) {
            return await virtualAccounts.findByUserId(userId);
        }
        // Otherwise, get from the virtualAccounts object directly
        const allVirtualAccounts = virtualAccounts.getAll ? await virtualAccounts.getAll() : require('./database').getVirtualAccounts();
        if (allVirtualAccounts && allVirtualAccounts[userId]) {
            return allVirtualAccounts[userId];
        }
        return null;
    } catch (error) {
        console.error('Error getting virtual account:', error.message);
        return null;
    }
}

// Helper function to get user transactions
async function getUserTransactions(userId, limit = 5) {
    try {
        const allTransactions = getTransactions();
        const userTransactions = [];
        
        for (const [txId, tx] of Object.entries(allTransactions)) {
            if (tx.userId === userId || tx.user_id === userId) {
                userTransactions.push(tx);
            }
            if (userTransactions.length >= limit) break;
        }
        
        return userTransactions;
    } catch (error) {
        console.error('Error getting transactions:', error.message);
        return [];
    }
}

// Show user profile
async function showProfile(ctx, virtualAccounts = null) {
    try {
        const telegramId = ctx.from.id.toString();
        const users = getUsers();
        const user = users[telegramId];
        
        if (!user) {
            await ctx.reply('❌ Profile not found. Please /start first.');
            return;
        }
        
        // Get virtual account
        let virtualAccount = null;
        if (virtualAccounts && virtualAccounts.findByUserId) {
            virtualAccount = await virtualAccounts.findByUserId(telegramId);
        } else {
            const allVirtualAccounts = require('./database').getVirtualAccounts();
            if (allVirtualAccounts && allVirtualAccounts[telegramId]) {
                virtualAccount = allVirtualAccounts[telegramId];
            }
        }
        
        // Get recent transactions
        const recentTransactions = await getUserTransactions(telegramId, 5);
        
        let message = `👤 *YOUR PROFILE*\n\n`;
        message += `📛 *Name:* ${user.firstName || 'Not set'} ${user.lastName || ''}\n`;
        message += `🆔 *Telegram ID:* \`${telegramId}\`\n`;
        message += `📧 *Email:* ${user.email || 'Not set'}\n`;
        message += `📱 *Phone:* ${user.phone || 'Not set'}\n`;
        message += `🔐 *PIN:* ${user.pin ? '✅ Set' : '❌ Not set'}\n`;
        message += `💰 *Wallet:* ${formatCurrency(user.wallet || 0)}\n`;
        message += `✅ *KYC:* ${(user.kycStatus || 'pending').toUpperCase()}\n\n`;
        
        if (virtualAccount) {
            message += `🏦 *Virtual Account*\n`;
            message += `   Bank: ${virtualAccount.bank_name || 'N/A'}\n`;
            message += `   Account: \`${virtualAccount.account_number || 'N/A'}\`\n`;
            message += `   Name: ${virtualAccount.account_name || 'N/A'}\n\n`;
        }
        
        if (recentTransactions && recentTransactions.length > 0) {
            message += `📜 *Recent Transactions*\n`;
            recentTransactions.slice(0, 3).forEach(tx => {
                const emoji = tx.type === 'deposit' ? '💰' : 
                             tx.type === 'admin_credit' ? '✨' : '💸';
                const amount = tx.amount || 0;
                message += `${emoji} ${tx.type?.toUpperCase() || 'TRANSACTION'}: ${formatCurrency(amount)} - ${tx.status || 'completed'}\n`;
            });
        } else {
            message += `📜 *Recent Transactions*\nNo transactions yet.\n`;
        }
        
        const keyboard = [
            [Markup.button.callback('🔄 Refresh', 'refresh_profile')],
            [Markup.button.callback('🏠 Home', 'start')]
        ];
        
        // Check if user is admin to show admin actions
        if (isAdmin(telegramId)) {
            keyboard.unshift([Markup.button.callback('👥 Admin View', 'admin_view_all_users')]);
        }
        
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        await ctx.reply('❌ An error occurred while loading your profile. Please try again later.');
    }
}

// Refresh profile callback handler
async function handleRefreshProfile(ctx, virtualAccounts = null) {
    try {
        await ctx.answerCbQuery('Refreshing...');
        await showProfile(ctx, virtualAccounts);
    } catch (error) {
        console.error('Refresh profile error:', error);
        await ctx.answerCbQuery('Error refreshing');
    }
}

// Admin view all users (simple version)
async function adminViewAllUsers(ctx) {
    try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
            await ctx.answerCbQuery('Admin only');
            return;
        }
        
        const users = getUsers();
        let message = `👥 *ALL USERS* (${Object.keys(users).length})\n\n`;
        
        let count = 0;
        for (const [id, user] of Object.entries(users)) {
            count++;
            message += `${count}. ${user.firstName || 'Unknown'} - ID: \`${id}\`\n`;
            message += `   💰 ${formatCurrency(user.wallet || 0)}\n`;
            if (count >= 10) break;
        }
        
        message += `\n🔍 Use /searchuser <name> to search`;
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Back to Profile', 'refresh_profile')],
                [Markup.button.callback('🏠 Home', 'start')]
            ])
        });
        
    } catch (error) {
        console.error('Admin view error:', error);
        await ctx.answerCbQuery('Error');
    }
}

module.exports = {
    showProfile,
    handleRefreshProfile,
    adminViewAllUsers
};
