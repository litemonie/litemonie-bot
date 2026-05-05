// ==================== billstack-webhook.js ====================
// Separate webhook handler for Billstack payments
// =============================================================

const express = require('express');
const { getUsers, setUsers, saveAllData, recordTransaction } = require('./database');

const router = express.Router();

// Billstack webhook endpoint
router.post('/', async (req, res) => {
    console.log('💰 Billstack webhook received:', new Date().toISOString());
    console.log('📦 Body:', JSON.stringify(req.body));
    
    try {
        const { transactionReference, amount, customerReference, status } = req.body;
        
        if (status === 'success' && customerReference) {
            const users = getUsers();
            
            if (users[customerReference]) {
                const previousBalance = users[customerReference].wallet || 0;
                users[customerReference].wallet = previousBalance + parseFloat(amount);
                setUsers(users);
                await saveAllData();
                
                await recordTransaction(customerReference, {
                    type: 'deposit',
                    amount: parseFloat(amount),
                    status: 'completed',
                    description: 'Billstack deposit',
                    reference: transactionReference,
                    previousBalance: previousBalance,
                    newBalance: users[customerReference].wallet
                });
                
                console.log(`✅ Credited ₦${amount} to user ${customerReference}`);
                console.log(`   Old: ₦${previousBalance} → New: ₦${users[customerReference].wallet}`);
                
                // Try to notify user on Telegram (optional - requires bot instance)
                try {
                    const { bot } = require('./bot-core');
                    await bot.telegram.sendMessage(
                        customerReference,
                        `💰 *DEPOSIT SUCCESSFUL!*\n\n` +
                        `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
                        `Reference: ${transactionReference}\n\n` +
                        `New Balance: ₦${users[customerReference].wallet.toLocaleString()}`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (notifyErr) {
                    console.log('Could not notify user (bot not ready)');
                }
            } else {
                console.log(`⚠️ User ${customerReference} not found`);
            }
        }
        
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('❌ Billstack error:', error);
        res.status(200).json({ status: 'received' });
    }
});

// Test endpoint (GET) - DELETE after testing
router.get('/', (req, res) => {
    res.json({ 
        status: 'Billstack webhook is ready', 
        method: 'POST only',
        info: 'Send POST requests to this endpoint for payment notifications'
    });
});

module.exports = router;
