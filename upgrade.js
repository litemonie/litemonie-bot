// ==================== upgrade.js ====================
// Manual Account Recovery - Restores user data after updates
// =====================================================

const { Markup } = require('telegraf');
const { getUsers, setUsers, saveAllData, loadFromBackup, getVirtualAccounts, setVirtualAccounts, getTransactions, setTransactions } = require('./database');
const { initUser, formatCurrency } = require('./utils');

// Check if this is a fresh deployment (no users or very few)
function isFreshDeployment() {
    const users = getUsers();
    const userCount = Object.keys(users).length;
    
    // If there are 0 or only 1 user (maybe just admin), consider it fresh
    return userCount <= 1;
}

// Get menu button
function getUpgradeButton() {
    if (isFreshDeployment()) {
        return [Markup.button.callback('🔄 RESTORE MY ACCOUNT', 'upgrade_recovery')];
    }
    return [];
}

// Main recovery handler
async function handleUpgradeRecovery(ctx) {
    const userId = ctx.from.id.toString();
    console.log(`🔧 Upgrade recovery triggered by user: ${userId}`);
    
    // Check if user already has data
    const users = getUsers();
    if (users[userId] && users[userId].wallet > 0) {
        await ctx.reply(
            `✅ *ACCOUNT ALREADY HAS DATA*\n\n` +
            `💰 Balance: ${formatCurrency(users[userId].wallet || 0)}\n` +
            `📧 Email: ${users[userId].email || 'Not set'}\n\n` +
            `Your account already has data. No recovery needed.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    await ctx.reply(
        `🔄 *ACCOUNT RECOVERY*\n\n` +
        `It seems your account data may have been lost after a recent update.\n\n` +
        `📝 *To restore your account, please enter:*\n` +
        `• Your registered email address OR\n` +
        `• Your registered phone number\n\n` +
        `💡 *Example:* keketobou@gmail.com or 08012345678\n\n` +
        `⚠️ Use the same email/phone you used when you first registered.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel', 'cancel_recovery')]
            ])
        }
    );
    
    // Set session for recovery
    const { setSession } = require('./database');
    await setSession(userId, { action: 'upgrade_recovery', step: 'waiting_for_input' });
}

// Process recovery input (email or phone)
async function processRecoveryInput(ctx, text) {
    const userId = ctx.from.id.toString();
    const input = text.trim().toLowerCase();
    
    console.log(`🔍 Processing recovery input for ${userId}: ${input}`);
    
    // Try to load from backup
    const backupData = await loadFromBackup();
    
    if (!backupData || !backupData.users || Object.keys(backupData.users).length === 0) {
        await ctx.reply(
            `❌ *NO BACKUP FOUND*\n\n` +
            `No backup data is available at this time.\n\n` +
            `📞 Please contact support @opuenekeke for manual recovery.\n\n` +
            `Please provide your User ID: \`${userId}\``,
            { parse_mode: 'Markdown' }
        );
        return false;
    }
    
    // Search for user in backup by email or phone
    let foundUserId = null;
    let foundUserData = null;
    let foundVirtualAccount = null;
    
    for (const [backupId, backupUser] of Object.entries(backupData.users)) {
        const email = backupUser.email?.toLowerCase() || '';
        const phone = backupUser.phone || '';
        
        if (email === input || phone === input) {
            foundUserId = backupId;
            foundUserData = backupUser;
            console.log(`✅ Found user in backup: ${backupId} (Email: ${email}, Phone: ${phone})`);
            break;
        }
    }
    
    // Also search by User ID if input is numeric
    if (!foundUserData && /^\d+$/.test(input)) {
        if (backupData.users[input]) {
            foundUserId = input;
            foundUserData = backupData.users[input];
            console.log(`✅ Found user by ID in backup: ${input}`);
        }
    }
    
    if (foundUserData && foundUserId) {
        // Get current users
        const currentUsers = getUsers();
        const currentVirtualAccounts = getVirtualAccounts();
        
        // Restore user data
        const restoredBalance = foundUserData.wallet || 0;
        
        currentUsers[userId] = {
            ...currentUsers[userId],
            wallet: restoredBalance,
            email: foundUserData.email,
            phone: foundUserData.phone,
            firstName: foundUserData.firstName,
            lastName: foundUserData.lastName,
            username: foundUserData.username,
            pin: foundUserData.pin,
            kycStatus: foundUserData.kycStatus || 'pending'
        };
        
        setUsers(currentUsers);
        
        // Restore virtual account if exists
        if (backupData.virtualAccounts) {
            for (const [vaId, va] of Object.entries(backupData.virtualAccounts)) {
                if (va.user_id === foundUserId) {
                    // Check if virtual account already exists for this user
                    let existingVA = null;
                    for (const [existingId, existing] of Object.entries(currentVirtualAccounts)) {
                        if (existing.user_id === userId) {
                            existingVA = existing;
                            break;
                        }
                    }
                    
                    if (!existingVA) {
                        const newVA = {
                            user_id: userId,
                            account_number: va.account_number,
                            bank_name: va.bank_name,
                            account_name: va.account_name,
                            bank_code: va.bank_code,
                            reference: va.reference,
                            provider: va.provider,
                            is_active: true
                        };
                        
                        const allVAs = getVirtualAccounts();
                        const newId = `va_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                        allVAs[newId] = newVA;
                        setVirtualAccounts(allVAs);
                        console.log(`✅ Virtual account restored for user ${userId}`);
                    }
                    break;
                }
            }
        }
        
        // Restore user's transactions from backup
        if (backupData.transactions && backupData.transactions[foundUserId]) {
            const currentTransactions = getTransactions();
            currentTransactions[userId] = backupData.transactions[foundUserId];
            setTransactions(currentTransactions);
            console.log(`✅ Restored ${backupData.transactions[foundUserId].length} transactions for user ${userId}`);
        }
        
        await saveAllData();
        
        // Send success message
        let message = `✅ *ACCOUNT RESTORED SUCCESSFULLY!*\n\n`;
        message += `💰 *Balance Restored:* ${formatCurrency(restoredBalance)}\n`;
        message += `📧 *Email:* ${foundUserData.email || 'Not set'}\n`;
        message += `📱 *Phone:* ${foundUserData.phone || 'Not set'}\n`;
        message += `🔐 *PIN:* ${foundUserData.pin ? '✅ Set' : '❌ Not set'}\n\n`;
        message += `🎉 Your account has been restored from our backup system!\n\n`;
        message += `📱 Use /start to access the main menu.`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        
        // Clear recovery session
        const { clearSession } = require('./database');
        await clearSession(userId);
        
        return true;
    } else {
        await ctx.reply(
            `❌ *ACCOUNT NOT FOUND*\n\n` +
            `We couldn't find an account with:\n` +
            `🔍 "${input}"\n\n` +
            `💡 *Possible reasons:*\n` +
            `• The email/phone wasn't registered before\n` +
            `• There's a typo in what you entered\n` +
            `• No backup exists for this account\n\n` +
            `📞 Please contact support @opuenekeke for assistance.\n\n` +
            `📝 *Your User ID:* \`${userId}\``,
            { parse_mode: 'Markdown' }
        );
        return false;
    }
}

// Cancel recovery
async function handleCancelRecovery(ctx) {
    const userId = ctx.from.id.toString();
    const { clearSession } = require('./database');
    await clearSession(userId);
    
    await ctx.editMessageText(
        `❌ *Recovery Cancelled*\n\n` +
        `You can use /start to access the main menu.`,
        { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
}

// Add the upgrade button to main menu (to be called in bot-core.js)
function addUpgradeButtonToMenu(keyboard) {
    if (isFreshDeployment()) {
        // Add the restore button to the bottom of the menu
        return [...keyboard, ['🔄 Restore My Account']];
    }
    return keyboard;
}

// Handle the "🔄 Restore My Account" button press
async function handleRestoreButton(ctx) {
    await handleUpgradeRecovery(ctx);
}

module.exports = {
    getUpgradeButton,
    handleUpgradeRecovery,
    processRecoveryInput,
    handleCancelRecovery,
    handleRestoreButton,
    addUpgradeButtonToMenu,
    isFreshDeployment
};
