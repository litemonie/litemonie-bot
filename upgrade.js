// ==================== upgrade.js ====================
// Manual Account Recovery - Restores user data after updates
// =====================================================

const { Markup } = require('telegraf');
const { getUsers, setUsers, saveAllData, loadFromBackup, getVirtualAccounts, setVirtualAccounts, getTransactions, setTransactions } = require('./database');
const { initUser, formatCurrency } = require('./utils');
const fs = require('fs');
const path = require('path');

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

// ============ IMPROVED: LOAD BACKUP FROM MULTIPLE LOCATIONS ============
async function loadBackupData() {
    console.log('🔍 Searching for backup data...');
    
    // Try multiple backup sources
    let backupData = null;
    
    // 1. Try loadFromBackup from database module
    try {
        backupData = await loadFromBackup();
        if (backupData && backupData.users && Object.keys(backupData.users).length > 0) {
            console.log(`✅ Found backup via loadFromBackup(): ${Object.keys(backupData.users).length} users`);
            return backupData;
        }
    } catch (error) {
        console.log('loadFromBackup() failed:', error.message);
    }
    
    // 2. Try reading from backups directory
    const backupDirs = [
        path.join(process.cwd(), 'backups'),
        path.join(process.cwd(), 'data', 'backups'),
        path.join(__dirname, '..', 'backups'),
        path.join(__dirname, 'backups')
    ];
    
    for (const backupDir of backupDirs) {
        if (fs.existsSync(backupDir)) {
            console.log(`📁 Checking backup directory: ${backupDir}`);
            const files = fs.readdirSync(backupDir);
            const backupFiles = files.filter(f => f.endsWith('.json') && (f.includes('backup') || f.includes('users')));
            
            // Sort by most recent (assuming timestamp in filename)
            backupFiles.sort().reverse();
            
            for (const file of backupFiles) {
                try {
                    const filePath = path.join(backupDir, file);
                    console.log(`📄 Reading backup file: ${file}`);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);
                    
                    if (data.users && Object.keys(data.users).length > 0) {
                        console.log(`✅ Found backup in ${file}: ${Object.keys(data.users).length} users`);
                        return data;
                    }
                    if (data.data && data.data.users && Object.keys(data.data.users).length > 0) {
                        console.log(`✅ Found backup in ${file} (nested): ${Object.keys(data.data.users).length} users`);
                        return data.data;
                    }
                } catch (err) {
                    console.log(`Error reading ${file}:`, err.message);
                }
            }
        }
    }
    
    // 3. Try reading from main data files (users.json, virtualAccounts.json, transactions.json)
    const dataFiles = [
        { path: path.join(process.cwd(), 'data', 'users.json'), type: 'users' },
        { path: path.join(process.cwd(), 'users.json'), type: 'users' },
        { path: path.join(process.cwd(), 'data', 'virtual_accounts.json'), type: 'virtualAccounts' },
        { path: path.join(process.cwd(), 'data', 'transactions.json'), type: 'transactions' }
    ];
    
    let combinedData = { users: {}, virtualAccounts: {}, transactions: {} };
    
    for (const file of dataFiles) {
        if (fs.existsSync(file.path)) {
            try {
                console.log(`📄 Reading data file: ${file.path}`);
                const content = fs.readFileSync(file.path, 'utf8');
                const data = JSON.parse(content);
                
                if (file.type === 'users') {
                    combinedData.users = { ...combinedData.users, ...data };
                } else if (file.type === 'virtualAccounts') {
                    combinedData.virtualAccounts = { ...combinedData.virtualAccounts, ...data };
                } else if (file.type === 'transactions') {
                    combinedData.transactions = { ...combinedData.transactions, ...data };
                }
            } catch (err) {
                console.log(`Error reading ${file.path}:`, err.message);
            }
        }
    }
    
    if (Object.keys(combinedData.users).length > 0) {
        console.log(`✅ Found ${Object.keys(combinedData.users).length} users in data files`);
        return combinedData;
    }
    
    console.log('❌ No backup data found anywhere');
    return null;
}

// ============ ALWAYS SHOW RESTORE BUTTON ============
function isFreshDeployment() {
    return true;
}

function getUpgradeButton() {
    return [Markup.button.callback('🔄 RESTORE MY ACCOUNT', 'upgrade_recovery')];
}

// ============ MAIN RECOVERY HANDLER ============
async function handleUpgradeRecovery(ctx) {
    const userId = ctx.from.id.toString();
    console.log(`🔧 Upgrade recovery triggered by user: ${userId}`);
    
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
    
    await setUpgradeSession(userId, { action: 'upgrade_recovery', step: 'waiting_for_input' });
}

// ============ IMPROVED: PROCESS RECOVERY INPUT ============
async function processRecoveryInput(ctx, text) {
    const userId = ctx.from.id.toString();
    const input = text.trim().toLowerCase();
    
    console.log(`🔍 Processing recovery input for ${userId}: ${input}`);
    
    if (text === '/cancel') {
        await handleCancelRecovery(ctx);
        return true;
    }
    
    // Load backup data
    const backupData = await loadBackupData();
    
    if (!backupData || !backupData.users || Object.keys(backupData.users).length === 0) {
        console.log('❌ No backup data available');
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
    
    console.log(`📊 Backup contains ${Object.keys(backupData.users).length} users`);
    
    // Search for user in backup by email or phone
    let foundUserId = null;
    let foundUserData = null;
    
    // Debug: Log all users in backup
    console.log('📋 Users in backup:');
    for (const [backupId, backupUser] of Object.entries(backupData.users)) {
        console.log(`   - ${backupId}: Email: ${backupUser.email || 'none'}, Phone: ${backupUser.phone || 'none'}, Name: ${backupUser.firstName || ''} ${backupUser.lastName || ''}`);
    }
    
    // Search by email OR phone (either one)
    for (const [backupId, backupUser] of Object.entries(backupData.users)) {
        const email = backupUser.email?.toLowerCase() || '';
        const phone = backupUser.phone || '';
        
        // Check if input matches email OR phone (not both required)
        if (email === input || phone === input) {
            foundUserId = backupId;
            foundUserData = backupUser;
            console.log(`✅ Found user in backup by ${email === input ? 'email' : 'phone'}: ${backupId}`);
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
        console.log(`🔄 Restoring user ${userId} from backup user ${foundUserId}`);
        
        const currentUsers = getUsers();
        const currentVirtualAccounts = getVirtualAccounts();
        
        const oldBalance = currentUsers[userId]?.wallet || 0;
        const restoredBalance = foundUserData.wallet || 0;
        
        // Restore user data
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
        console.log(`✅ User data restored: Balance ₦${restoredBalance}, Email: ${foundUserData.email}, Phone: ${foundUserData.phone}`);
        
        // Restore virtual account if exists
        if (backupData.virtualAccounts) {
            for (const [vaId, va] of Object.entries(backupData.virtualAccounts)) {
                if (va.user_id === foundUserId) {
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
                        console.log(`✅ Virtual account restored: ${va.account_number}`);
                    }
                    break;
                }
            }
        }
        
        // Restore transactions
        if (backupData.transactions && backupData.transactions[foundUserId]) {
            const currentTransactions = getTransactions();
            if (!currentTransactions[userId]) {
                currentTransactions[userId] = [];
            }
            const existingTxIds = new Set(currentTransactions[userId].map(tx => tx.date + tx.amount));
            const newTransactions = backupData.transactions[foundUserId].filter(tx => {
                const key = tx.date + tx.amount;
                return !existingTxIds.has(key);
            });
            currentTransactions[userId] = [...currentTransactions[userId], ...newTransactions];
            setTransactions(currentTransactions);
            console.log(`✅ Restored ${newTransactions.length} transactions`);
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
        
        await clearUpgradeSession(userId);
        return true;
        
    } else {
        console.log(`❌ No user found with email/phone: ${input}`);
        
        // Show available emails/phones from backup for debugging (remove in production)
        const availableContacts = [];
        for (const [backupId, backupUser] of Object.entries(backupData.users)) {
            if (backupUser.email) availableContacts.push(backupUser.email);
            if (backupUser.phone) availableContacts.push(backupUser.phone);
        }
        
        let debugInfo = '';
        if (process.env.NODE_ENV !== 'production') {
            debugInfo = `\n\n🔍 *Available in backup:*\n${availableContacts.slice(0, 5).join(', ')}`;
        }
        
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
            `🔄 Try again with a different email/phone:${debugInfo}`,
            { parse_mode: 'Markdown' }
        );
        return false;
    }
}

// ============ CANCEL RECOVERY ============
async function handleCancelRecovery(ctx) {
    const userId = ctx.from.id.toString();
    await clearUpgradeSession(userId);
    
    try {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(
                `❌ *Recovery Cancelled*\n\nYou can use /start to access the main menu.`,
                { parse_mode: 'Markdown' }
            );
            await ctx.answerCbQuery().catch(() => {});
        } else {
            await ctx.reply(
                `❌ *Recovery Cancelled*\n\nYou can use /start to access the main menu.`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        await ctx.reply(
            `❌ *Recovery Cancelled*\n\nYou can use /start to access the main menu.`,
            { parse_mode: 'Markdown' }
        );
    }
}

// ============ ADD UPGRADE BUTTON TO MENU ============
function addUpgradeButtonToMenu(keyboard) {
    const hasRestoreButton = keyboard.some(row => 
        row.includes('🔄 Restore My Account')
    );
    
    if (!hasRestoreButton) {
        return [...keyboard, ['🔄 Restore My Account']];
    }
    return keyboard;
}

async function handleRestoreButton(ctx) {
    await handleUpgradeRecovery(ctx);
}

// ============ EXPORTS ============
module.exports = {
    getUpgradeButton,
    handleUpgradeRecovery,
    processRecoveryInput,
    handleCancelRecovery,
    handleRestoreButton,
    addUpgradeButtonToMenu,
    isFreshDeployment,
    getUpgradeSession,
    loadBackupData  // Export for debugging
};
