// ==================== backup.js ====================
// Automatic Backup System for User Data
// ===================================================

const fs = require('fs');
const path = require('path');

// Backup file paths
const BACKUP_DIR = path.join(__dirname, 'backups');
const USERS_BACKUP = path.join(BACKUP_DIR, 'users_backup.json');
const VIRTUAL_ACCOUNTS_BACKUP = path.join(BACKUP_DIR, 'virtual_accounts_backup.json');
const TRANSACTIONS_BACKUP = path.join(BACKUP_DIR, 'transactions_backup.json');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('📁 Backup directory created');
}

// Create timestamped backup
function createTimestampedBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const timestampedDir = path.join(BACKUP_DIR, `backup_${timestamp}`);
    
    if (!fs.existsSync(timestampedDir)) {
        fs.mkdirSync(timestampedDir, { recursive: true });
    }
    
    return timestampedDir;
}

// Save backup of current data
async function saveBackup(users, virtualAccounts, transactions) {
    try {
        const timestampedDir = createTimestampedBackup();
        
        // Save to timestamped backup
        fs.writeFileSync(
            path.join(timestampedDir, 'users.json'),
            JSON.stringify(users, null, 2)
        );
        fs.writeFileSync(
            path.join(timestampedDir, 'virtual_accounts.json'),
            JSON.stringify(virtualAccounts, null, 2)
        );
        fs.writeFileSync(
            path.join(timestampedDir, 'transactions.json'),
            JSON.stringify(transactions, null, 2)
        );
        
        // Also save to main backup files (overwrite)
        fs.writeFileSync(USERS_BACKUP, JSON.stringify(users, null, 2));
        fs.writeFileSync(VIRTUAL_ACCOUNTS_BACKUP, JSON.stringify(virtualAccounts, null, 2));
        fs.writeFileSync(TRANSACTIONS_BACKUP, JSON.stringify(transactions, null, 2));
        
        console.log(`💾 Backup saved to: ${timestampedDir}`);
        console.log(`💾 Main backup files updated`);
        
        return true;
    } catch (error) {
        console.error('❌ Backup failed:', error);
        return false;
    }
}

// Load from backup
function loadFromBackup() {
    try {
        if (fs.existsSync(USERS_BACKUP)) {
            const users = JSON.parse(fs.readFileSync(USERS_BACKUP, 'utf8'));
            const virtualAccounts = fs.existsSync(VIRTUAL_ACCOUNTS_BACKUP) 
                ? JSON.parse(fs.readFileSync(VIRTUAL_ACCOUNTS_BACKUP, 'utf8'))
                : {};
            const transactions = fs.existsSync(TRANSACTIONS_BACKUP)
                ? JSON.parse(fs.readFileSync(TRANSACTIONS_BACKUP, 'utf8'))
                : {};
            
            console.log(`📂 Loaded from backup: ${Object.keys(users).length} users`);
            return { users, virtualAccounts, transactions };
        } else {
            console.log('⚠️ No backup files found');
            return null;
        }
    } catch (error) {
        console.error('❌ Failed to load backup:', error);
        return null;
    }
}

// Get list of available backups
function getAvailableBackups() {
    try {
        const backups = fs.readdirSync(BACKUP_DIR)
            .filter(dir => dir.startsWith('backup_'))
            .sort()
            .reverse();
        return backups;
    } catch (error) {
        return [];
    }
}

// Restore specific backup by timestamp
function restoreBackup(timestamp) {
    try {
        const backupDir = path.join(BACKUP_DIR, `backup_${timestamp}`);
        if (!fs.existsSync(backupDir)) {
            console.log(`❌ Backup ${timestamp} not found`);
            return null;
        }
        
        const users = JSON.parse(fs.readFileSync(path.join(backupDir, 'users.json'), 'utf8'));
        const virtualAccounts = JSON.parse(fs.readFileSync(path.join(backupDir, 'virtual_accounts.json'), 'utf8'));
        const transactions = JSON.parse(fs.readFileSync(path.join(backupDir, 'transactions.json'), 'utf8'));
        
        console.log(`📂 Restored from backup: ${timestamp}`);
        return { users, virtualAccounts, transactions };
    } catch (error) {
        console.error('❌ Restore failed:', error);
        return null;
    }
}

module.exports = {
    saveBackup,
    loadFromBackup,
    getAvailableBackups,
    restoreBackup
};
