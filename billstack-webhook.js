// ==================== billstack-webhook.js ====================
// SIMPLIFIED WORKING VERSION - Uses both merchant_reference and email
// =============================================================

const express = require('express');
const { getUsers, setUsers, saveAllData, recordTransaction } = require('./database');

const router = express.Router();

router.post('/', async (req, res) => {
    console.log('💰 Billstack webhook received:', new Date().toISOString());
    
    try {
        const payload = req.body;
        console.log('📦 Payload received');
        
        // Check if this is a payment notification
        if (payload.event === 'PAYMENT_NOTIFICATION' && payload.data?.type === 'RESERVED_ACCOUNT_TRANSACTION') {
            const paymentData = payload.data;
            const amount = parseFloat(paymentData.amount);
            const transactionRef = paymentData.transaction_ref || paymentData.reference;
            const merchantReference = paymentData.merchant_reference;
            const customerEmail = paymentData.customer?.email;
            
            console.log(`💰 Amount: ₦${amount}`);
            console.log(`📧 Customer Email: ${customerEmail}`);
            console.log(`📝 Merchant Ref: ${merchantReference}`);
            
            // Get all users
            const users = getUsers();
            let userId = null;
            let user = null;
            
            // METHOD 1: Extract from merchant_reference (BEST)
            if (merchantReference) {
                const match = merchantReference.match(/VTU-(\d+)-/);
                if (match && match[1]) {
                    userId = match[1];
                    user = users[userId];
                    console.log(`🔍 Found by merchant reference: ${userId}`);
                }
            }
            
            // METHOD 2: Find by email (BACKUP)
            if (!user && customerEmail) {
                for (const [id, userData] of Object.entries(users)) {
                    if (userData.email === customerEmail) {
                        userId = id;
                        user = userData;
                        console.log(`🔍 Found by email: ${userId}`);
                        break;
                    }
                }
            }
            
            // CREDIT THE USER
            if (user && userId) {
                const oldBalance = user.wallet || 0;
                const newBalance = oldBalance + amount;
                
                user.wallet = newBalance;
                users[userId] = user;
                setUsers(users);
                await saveAllData();
                
                console.log(`✅✅✅ CREDITED: ₦${amount} to user ${userId}`);
                console.log(`   Balance: ₦${oldBalance} → ₦${newBalance}`);
                
                // Record transaction
                await recordTransaction(userId, {
                    type: 'deposit',
                    amount: amount,
                    status: 'completed',
                    description: 'Billstack deposit',
                    reference: transactionRef,
                    previousBalance: oldBalance,
                    newBalance: newBalance
                });
                
                // Send Telegram notification
                try {
                    const { bot } = require('./bot-core');
                    await bot.telegram.sendMessage(
                        userId,
                        `💰 *DEPOSIT SUCCESSFUL!*\n\nAmount: ₦${amount.toLocaleString()}\nReference: ${transactionRef}\n\nNew Balance: ₦${newBalance.toLocaleString()}`,
                        { parse_mode: 'Markdown' }
                    );
                    console.log(`📱 User notified on Telegram`);
                } catch (err) {
                    console.log(`⚠️ Could not notify user: ${err.message}`);
                }
            } else {
                console.log(`❌❌❌ USER NOT FOUND!`);
                console.log(`   Email in webhook: ${customerEmail}`);
                console.log(`   Email in DB for 7197363326: ${users['7197363326']?.email}`);
                console.log(`   Available users: ${Object.keys(users).join(', ')}`);
            }
        }
        
        res.status(200).json({ status: 'success' });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(200).json({ status: 'received' });
    }
});

router.get('/', (req, res) => {
    res.json({ status: 'Billstack webhook is ready', method: 'POST only' });
});

module.exports = router;
