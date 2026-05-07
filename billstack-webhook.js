// ==================== billstack-webhook.js ====================
// SIMPLE WORKING VERSION - Replace your old file with this
// =============================================================

const express = require('express');
const { getUsers, setUsers, saveAllData, recordTransaction } = require('./database');

const router = express.Router();

router.post('/', async (req, res) => {
    console.log('💰 Billstack webhook received:', new Date().toISOString());
    
    try {
        const payload = req.body;
        
        // Check if this is a payment notification
        if (payload.event === 'PAYMENT_NOTIFICATION' && payload.data?.type === 'RESERVED_ACCOUNT_TRANSACTION') {
            const paymentData = payload.data;
            const amount = parseFloat(paymentData.amount);
            const transactionRef = paymentData.transaction_ref || paymentData.reference;
            const merchantReference = paymentData.merchant_reference;
            
            console.log(`💰 Deposit Amount: ₦${amount}`);
            console.log(`📝 Merchant Reference: ${merchantReference}`);
            
            // Extract User ID from merchant_reference (VTU-7197363326-xxx)
            let userId = null;
            if (merchantReference) {
                const match = merchantReference.match(/VTU-(\d+)-/);
                if (match && match[1]) {
                    userId = match[1];
                    console.log(`✅ Extracted User ID: ${userId}`);
                }
            }
            
            if (userId) {
                const users = getUsers();
                const user = users[userId];
                
                if (user) {
                    const previousBalance = user.wallet || 0;
                    const newBalance = previousBalance + amount;
                    
                    user.wallet = newBalance;
                    users[userId] = user;
                    setUsers(users);
                    await saveAllData();
                    
                    console.log(`✅✅✅ CREDITED: ₦${amount} to user ${userId}`);
                    console.log(`   Old Balance: ₦${previousBalance} → New Balance: ₦${newBalance}`);
                    
                    // Record transaction
                    await recordTransaction(userId, {
                        type: 'deposit',
                        amount: amount,
                        status: 'completed',
                        description: 'Billstack deposit',
                        reference: transactionRef,
                        previousBalance: previousBalance,
                        newBalance: newBalance
                    });
                    
                    // Notify user
                    try {
                        const { bot } = require('./bot-core');
                        await bot.telegram.sendMessage(
                            userId,
                            `💰 *DEPOSIT SUCCESSFUL!*\n\n` +
                            `Amount: ₦${amount.toLocaleString()}\n` +
                            `Reference: ${transactionRef}\n\n` +
                            `New Balance: ₦${newBalance.toLocaleString()}`,
                            { parse_mode: 'Markdown' }
                        );
                        console.log(`✅ User notified on Telegram`);
                    } catch (notifyErr) {
                        console.log('Could not notify user');
                    }
                } else {
                    console.log(`❌ User ${userId} not found in database`);
                }
            } else {
                console.log(`❌ Could not extract user ID from merchant reference`);
            }
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
