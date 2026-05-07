// ==================== billstack-webhook.js ====================
// FINAL WORKING VERSION - Replace your entire file with this
// =============================================================

const express = require('express');
const { getUsers, setUsers, saveAllData, recordTransaction } = require('./database');

const router = express.Router();

router.post('/', async (req, res) => {
    console.log('💰 Billstack webhook received:', new Date().toISOString());
    
    try {
        const payload = req.body;
        
        // Extract data from payload (handles both nested and direct formats)
        let amount = null;
        let merchantReference = null;
        let transactionRef = null;
        let customerEmail = null;
        
        if (payload.event === 'PAYMENT_NOTIFICATION' && payload.data) {
            amount = payload.data.amount;
            merchantReference = payload.data.merchant_reference;
            transactionRef = payload.data.transaction_ref;
            customerEmail = payload.data.customer?.email;
        } else {
            amount = payload.amount;
            merchantReference = payload.merchant_reference;
            transactionRef = payload.transaction_ref;
            customerEmail = payload.customer?.email;
        }
        
        console.log(`💰 Amount: ₦${amount}`);
        console.log(`📝 Merchant Ref: ${merchantReference}`);
        console.log(`📧 Email: ${customerEmail}`);
        
        // Extract user ID from merchant_reference
        let userId = null;
        if (merchantReference) {
            const match = merchantReference.match(/VTU-(\d+)-/);
            if (match && match[1]) {
                userId = match[1];
                console.log(`✅ Extracted User ID from merchant reference: ${userId}`);
            }
        }
        
        // If not found by merchant ref, try by email
        if (!userId && customerEmail) {
            const users = getUsers();
            for (const [id, user] of Object.entries(users)) {
                if (user.email === customerEmail) {
                    userId = id;
                    console.log(`✅ Found User ID by email: ${userId}`);
                    break;
                }
            }
        }
        
        // Credit the user
        if (userId) {
            const users = getUsers();
            const user = users[userId];
            
            if (user) {
                const previousBalance = user.wallet || 0;
                const newBalance = previousBalance + parseFloat(amount);
                
                user.wallet = newBalance;
                users[userId] = user;
                setUsers(users);
                await saveAllData();
                
                console.log(`✅✅✅ SUCCESS: Credited ₦${amount} to user ${userId}`);
                console.log(`   Balance: ₦${previousBalance} → ₦${newBalance}`);
                
                // Record transaction
                await recordTransaction(userId, {
                    type: 'deposit',
                    amount: parseFloat(amount),
                    status: 'completed',
                    description: 'Billstack deposit',
                    reference: transactionRef || 'WEBHOOK',
                    previousBalance: previousBalance,
                    newBalance: newBalance
                });
                console.log(`✅ Transaction recorded`);
                
                // Notify user
                try {
                    const { bot } = require('./bot-core');
                    await bot.telegram.sendMessage(
                        userId,
                        `💰 *DEPOSIT SUCCESSFUL!*\n\n` +
                        `Amount: ₦${parseFloat(amount).toLocaleString()}\n` +
                        `Reference: ${transactionRef}\n\n` +
                        `New Balance: ₦${newBalance.toLocaleString()}`,
                        { parse_mode: 'Markdown' }
                    );
                    console.log(`✅ User notified on Telegram`);
                } catch (err) {
                    console.log(`⚠️ Could not notify user: ${err.message}`);
                }
            } else {
                console.log(`❌ User ${userId} not found in database`);
            }
        } else {
            console.log(`❌ Could not extract user ID from merchant reference`);
        }
        
        res.status(200).json({ status: 'success' });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(200).json({ status: 'received' });
    }
});

router.get('/', (req, res) => {
    res.json({ 
        status: 'Billstack webhook is ready', 
        method: 'POST only',
        info: 'Send POST requests to this endpoint for payment notifications'
    });
});

module.exports = router;
