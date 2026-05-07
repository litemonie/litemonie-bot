// ==================== billstack-webhook.js ====================
// Separate webhook handler for Billstack payments - COMPLETE FIX
// =============================================================

const express = require('express');
const { getUsers, setUsers, saveAllData, recordTransaction, getVirtualAccounts, setVirtualAccounts } = require('./database');

const router = express.Router();

// Billstack webhook endpoint
router.post('/', async (req, res) => {
    console.log('💰 Billstack webhook received:', new Date().toISOString());
    console.log('📦 Body:', JSON.stringify(req.body));
    
    try {
        const payload = req.body;
        
        // Check if this is a payment notification
        if (payload.event === 'PAYMENT_NOTIFICATION' && payload.data?.type === 'RESERVED_ACCOUNT_TRANSACTION') {
            const paymentData = payload.data;
            const amount = parseFloat(paymentData.amount);
            const transactionRef = paymentData.transaction_ref || paymentData.reference;
            const accountNumber = paymentData.account?.account_number;
            const customerEmail = paymentData.customer?.email;
            const merchantReference = paymentData.merchant_reference;
            
            console.log(`💰 Deposit: ₦${amount}`);
            console.log(`🏦 Account: ${accountNumber}`);
            console.log(`📧 Email: ${customerEmail}`);
            console.log(`📝 Merchant Ref: ${merchantReference}`);
            
            let userId = null;
            let user = null;
            const users = getUsers();
            
            // METHOD 1: Extract user ID from merchant_reference (MOST RELIABLE)
            if (merchantReference) {
                const match = merchantReference.match(/VTU-(\d+)-/);
                if (match && match[1]) {
                    userId = match[1];
                    user = users[userId];
                    if (user) {
                        console.log(`✅✅✅ User found by merchant reference: ${userId}`);
                    } else {
                        console.log(`⚠️ User ID ${userId} extracted but not found in database`);
                    }
                }
            }
            
            // METHOD 2: Find by email
            if (!user && customerEmail) {
                for (const [id, userData] of Object.entries(users)) {
                    if (userData.email === customerEmail) {
                        userId = id;
                        user = userData;
                        console.log(`✅ User found by email: ${userId}`);
                        break;
                    }
                }
            }
            
            // METHOD 3: Find by virtual account number
            if (!user && accountNumber) {
                try {
                    const virtualAccounts = getVirtualAccounts();
                    for (const [id, va] of Object.entries(virtualAccounts)) {
                        if (va.account_number === accountNumber && va.user_id) {
                            userId = va.user_id;
                            user = users[userId];
                            console.log(`✅ User found by account number: ${userId}`);
                            break;
                        }
                    }
                } catch (vaError) {
                    console.log('Could not check virtual accounts');
                }
            }
            
            // CREDIT THE USER IF FOUND
            if (user && userId) {
                const previousBalance = user.wallet || 0;
                const newBalance = previousBalance + amount;
                
                user.wallet = newBalance;
                users[userId] = user;
                setUsers(users);
                await saveAllData();
                
                console.log(`✅✅✅✅✅ SUCCESS: Credited ₦${amount} to user ${userId} ✅✅✅✅✅`);
                console.log(`   Balance: ₦${previousBalance} → ₦${newBalance}`);
                
                // Record transaction
                try {
                    await recordTransaction(userId, {
                        type: 'deposit',
                        amount: amount,
                        status: 'completed',
                        description: 'Billstack deposit',
                        reference: transactionRef,
                        previousBalance: previousBalance,
                        newBalance: newBalance,
                        metadata: {
                            account_number: accountNumber,
                            customer_email: customerEmail
                        }
                    });
                    console.log(`✅ Transaction recorded`);
                } catch (err) {
                    console.warn('Transaction record error:', err.message);
                }
                
                // Notify user on Telegram
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
                    console.log(`✅ User ${userId} notified on Telegram`);
                } catch (notifyErr) {
                    console.log('Could not notify user:', notifyErr.message);
                }
            } else {
                console.log(`❌❌❌❌❌ CRITICAL: USER NOT FOUND! ❌❌❌❌❌`);
                console.log(`   Account: ${accountNumber}`);
                console.log(`   Email: ${customerEmail}`);
                console.log(`   Merchant Ref: ${merchantReference}`);
                console.log(`   Extracted User ID: ${merchantReference?.match(/VTU-(\d+)-/)?.[1] || 'N/A'}`);
                console.log(`   Available Users in DB: ${Object.keys(users).join(', ')}`);
            }
        } else {
            console.log('📋 Webhook received - not a deposit notification');
        }
        
        res.status(200).json({ status: 'success' });
        
    } catch (error) {
        console.error('❌ Billstack error:', error);
        res.status(200).json({ status: 'received' });
    }
});

// Test endpoint (GET)
router.get('/', (req, res) => {
    res.json({ 
        status: 'Billstack webhook is ready', 
        method: 'POST only',
        info: 'Send POST requests to this endpoint for payment notifications'
    });
});

module.exports = router;
