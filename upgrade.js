// ==================== upgrade.js ====================
// Manual Account Recovery - Restores user data after updates
// =====================================================

const { Markup } = require('telegraf');
const { getUsers, setUsers, saveAllData, loadFromBackup, getVirtualAccounts, setVirtualAccounts, getTransactions, setTransactions } = require('./database');
const { initUser, formatCurrency } = require('./utils');

// ============ SESSION MANAGEMENT FOR UPGRADE ============
const upgradeSessions = {};

async function getUpgradeSession(userId) {
    return upgradeSessions[userId] || null;
}

async function setUpgradeSession(userId, data) {
    upgradeSessions[userId] = data;
    return upgradeSessions[userId];
}

async function clearUpgradeSession(userId) {
    delete upgradeSessions[userId];
}
// ============ END SESSION MANAGEMENT ============

// ============ FIXED: ALWAYS SHOW RESTORE BUTTON ============
// Changed from checking user count to always showing the button
// This ensures all users can access account recovery
function isFreshDeployment() {
    // ALWAYS return true to show the restore button
    // Users can choose to restore if they lost data
    return true;
}

// Get menu button - NOW ALWAYS RETURNS BUTTON
function getUpgradeButton() {
    // Always return the restore button
    return [Markup.button.callback('🔄 RESTORE MY ACCOUNT', 'upgrade_recovery')];
}

// Main recovery handler
async function handleUpgradeRecovery(ctx) {
    const userId = ctx.from.id.toString();
    console.log(`🔧 Upgrade recovery triggered by user: ${userId}`);
    
    // Check if user already has data - don't block recovery, just inform
    const users = getUsers();
    const currentUser = users[userId];
    
    let warningMessage = '';
    if (currentUser && currentUser.wallet > 0) {
        warningMessage = `\n⚠️ *WARNING:* You already have ₦${currentUser.wallet.toLocaleString()} in your wallet.\nRestoring from backup will OVERWRITE your current balance.\n\n`;
    }
    
    await ctx.reply(
        `🔄 *ACCOUNT RECOVERY*\n\n` +
        `Use this if you lost your account data after an update.\n\n` +
        warningMessage +
        `📝 *To restore your account, please enter:*\n` +
        `• Your registered email address OR\n` +
        `• Your registered phone number\n\n` +
        `💡 *Example:* keketobou@gmail.com or 08012345678\n\n` +
        `⚠️ Use the same email/phone you used when you first registered.\n\n` +
        `❌ Type /cancel to abort.`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel Recovery', 'cancel_recovery')]
            ])
        }
    );
    
    // Set session for recovery
    await setUpgradeSession(userId, { action: 'upgrade_recovery', step: 'waiting_for_input' });
}

// Process recovery input (email or phone)
async function processRecoveryInput(ctx, text) {
    const userId = ctx.from.id.toString();
    const input = text.trim().toLowerCase();
    
    console.log(`🔍 Processing recovery input for ${userId}: ${input}`);
    
    // Check for cancel command
    if (text === '/cancel') {
        await handleCancelRecovery(ctx);
        return true;
    }
    
    // Try to load from backup
    const backupData = await loadFromBackup();
    
    if (!backupData || !backupData.users || Object.keys(backupData.users).length === 0) {
        await ctx.reply(
            `❌ *NO BACKUP FOUND*\n\n` +
            `No backup data is available at this time.\n\n` +
            `📞 Please contact support @opuenekeke for manual recovery.\n\n` +
            `📝 *Your User ID:* \`${userId}\``,
            { parse_mode: 'Markdown' }
        );
        await clearUpgradeSession(userId);
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
        
        // Store old balance for message
        const oldBalance = currentUsers[userId]?.wallet || 0;
        
        // Restore user data
        const restoredBalance = foundUserData.wallet || 0;
        
        // Preserve existing data if any
        currentUsers[userId] = {
            ...currentUsers[userId],
            wallet: restoredBalance,
            email: foundUserData.email || currentUsers[userId]?.email,
            phone: foundUserData.phone || currentUsers[userId]?.phone,
            firstName: foundUserData.firstName || currentUsers[userId]?.firstName,
            lastName: foundUserData.lastName || currentUsers[userId]?.lastName,
            username: foundUserData.username || currentUsers[userId]?.username,
            pin: foundUserData.pin || currentUsers[userId]?.pin,
            kycStatus: foundUserData.kycStatus || currentUsers[userId]?.kycStatus || 'pending',
            pinAttempts: currentUsers[userId]?.pinAttempts || 0,
            pinLocked: currentUsers[userId]?.pinLocked || false
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
            if (!currentTransactions[userId]) {
                currentTransactions[userId] = [];
            }
            // Merge transactions, avoiding duplicates
            const existingTxIds = new Set(currentTransactions[userId].map(tx => tx.date + tx.amount));
            const newTransactions = backupData.transactions[foundUserId].filter(tx => {
                const key = tx.date + tx.amount;
                return !existingTxIds.has(key);
            });
            currentTransactions[userId] = [...currentTransactions[userId], ...newTransactions];
            setTransactions(currentTransactions);
            console.log(`✅ Restored ${newTransactions.length} transactions for user ${userId}`);
        }
        
        await saveAllData();
        
        // Send success message
        let message = `✅ *ACCOUNT RESTORED SUCCESSFULLY!*\n\n`;
        if (oldBalance > 0 && oldBalance !== restoredBalance) {
            message += `⚠️ *Balance Changed:* ₦${oldBalance.toLocaleString()} → ₦${restoredBalance.toLocaleString()}\n\n`;
        }
        message += `💰 *Current Balance:* ${formatCurrency(restoredBalance)}\n`;
        message += `📧 *Email:* ${foundUserData.email || 'Not set'}\n`;
        message += `📱 *Phone:* ${foundUserData.phone || 'Not set'}\n`;
        message += `🔐 *PIN:* ${foundUserData.pin ? '✅ Set' : '❌ Not set (Use /setpin 1234)'}\n\n`;
        message += `🎉 Your account has been restored from our backup system!\n\n`;
        message += `📱 Use /start to access the main menu.`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        
        // Clear recovery session
        await clearUpgradeSession(userId);
        
        return true;
    } else {
        await ctx.reply(
            `❌ *ACCOUNT NOT FOUND*\n\n` +
            `We couldn't find an account with:\n` +
            `🔍 "${text}"\n\n` +
            `💡 *Possible reasons:*\n` +
            `• The email/phone wasn't registered before\n` +
            `• There's a typo in what you entered\n` +
            `• No backup exists for this account\n\n` +
            `📞 Please contact support @opuenekeke for assistance.\n\n` +
            `📝 *Your User ID:* \`${userId}\`\n\n` +
            `🔄 Try again with a different email/phone:`,
            { parse_mode: 'Markdown' }
        );
        return false;
    }
}

// Cancel recovery
async function handleCancelRecovery(ctx) {
    const userId = ctx.from.id.toString();
    await clearUpgradeSession(userId);
    
    try {
        // Try to edit if it's a callback message
        if (ctx.callbackQuery) {
            await ctx.editMessageText(
                `❌ *Recovery Cancelled*\n\n` +
                `You can use /start to access the main menu.`,
                { parse_mode: 'Markdown' }
            );
            await ctx.answerCbQuery().catch(() => {});
        } else {
            await ctx.reply(
                `❌ *Recovery Cancelled*\n\n` +
                `You can use /start to access the main menu.`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        await ctx.reply(
            `❌ *Recovery Cancelled*\n\n` +
            `You can use /start to access the main menu.`,
            { parse_mode: 'Markdown' }
        );
    }
}

// Add the upgrade button to main menu
function addUpgradeButtonToMenu(keyboard) {
    // ALWAYS add the restore button to the bottom of the menu
    // Check if it already exists to avoid duplicates
    const hasRestoreButton = keyboard.some(row => 
        row.includes('🔄 Restore My Account')
    );
    
    if (!hasRestoreButton) {
        return [...keyboard, ['🔄 Restore My Account']];
    }
    return keyboard;
}

// Handle the "🔄 Restore My Account" button press
async function handleRestoreButton(ctx) {
    await handleUpgradeRecovery(ctx);
}

// Export functions
module.exports = {
    getUpgradeButton,
    handleUpgradeRecovery,
    processRecoveryInput,
    handleCancelRecovery,
    handleRestoreButton,
    addUpgradeButtonToMenu,
    isFreshDeployment,
    getUpgradeSession
};
