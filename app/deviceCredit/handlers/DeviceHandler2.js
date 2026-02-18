// app/deviceCredit/handlers/DeviceHandler2.js - PART 2 (SECOND HALF)
const DeviceHandler = require('./DeviceHandler');
const { Markup } = require('telegraf');

// ==================== DEVICE HANDLER CONTINUATION ====================

class DeviceHandler2 extends DeviceHandler {
  constructor(dataDir, bot, users, saveDataCallback) {
    super(dataDir, bot, users, saveDataCallback);
  }

  // ==================== DEVICE SELECTION ====================
  async handleDeviceSelection(ctx, deviceId) {
    try {
      console.log(`📱 Selecting device: ${deviceId}`);
      
      const device = await this.deviceModel.getDeviceById(deviceId);
      
      if (!device) {
        await ctx.answerCbQuery('❌ Device not found');
        return;
      }
      
      const profit = device.sellingPrice - device.costPrice;
      const profitPercentage = ((profit / device.costPrice) * 100).toFixed(1);
      
      let message = `*🎯 DEVICE DETAILS*\n\n`;
      message += `*${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n\n`;
      
      message += `*📊 SPECIFICATIONS*\n`;
      if (device.specs) {
        for (const [key, value] of Object.entries(device.specs)) {
          message += `• ${this.escapeMarkdown(key.charAt(0).toUpperCase() + key.slice(1))}\\: ${this.escapeMarkdown(value)}\n`;
        }
      }
      message += `\n`;
      
      message += `*💰 PRICING*\n`;
      message += `• Cost Price\\: ${this.formatCurrency(device.costPrice)}\n`;
      message += `• Selling Price\\: ${this.formatCurrency(device.sellingPrice)}\n`;
      message += `• Profit\\: ${this.formatCurrency(profit)} \\(${this.escapeMarkdown(profitPercentage)}%\\)\n\n`;
      
      message += `*📅 Select payment plan:*`;
      
      const userId = ctx.from.id.toString();
      const user = this.users[userId];
      const walletBalance = await this.getUserWalletBalance(userId);
      
      const session = {
        action: 'device_buy',
        step: 1,
        data: {
          deviceId: device.id,
          deviceMake: device.make,
          deviceModel: device.model,
          devicePrice: device.sellingPrice,
          userBalance: walletBalance
        }
      };
      
      this.sessionManager.updateSession(userId, session);
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('📅 Daily (60 days)', 'device_plan_daily'),
          Markup.button.callback('📅 Weekly (12 weeks)', 'device_plan_weekly')
        ],
        [
          Markup.button.callback('📅 Monthly (6 months)', 'device_plan_monthly')
        ],
        [
          Markup.button.callback('🛒 Browse More', 'device_view_devices'),
          Markup.button.callback('📱 Menu', 'device_menu')
        ]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle device selection error:', error);
      throw error;
    }
  }

  // ==================== MY HISTORY ====================
  async handleMyHistory(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = this.users[userId];
      
      if (!user) {
        await ctx.reply('❌ User not found');
        return;
      }
      
      const userPurchases = await this.purchaseModel.getUserPurchases(userId);
      const walletBalance = await this.getUserWalletBalance(userId);
      
      if (userPurchases.length === 0) {
        const message = `*📊 MY DEVICE HISTORY*\n\n` +
          `You haven't made any purchases yet\\.\n\n` +
          `*What you can do\\:*\n` +
          `• 🛒 Buy a device first\n` +
          `• 💳 Make payments\n` +
          `• 📱 View device status\n\n` +
          `*Your Balance\\:* ${this.formatCurrency(walletBalance)}\n\n` +
          `Start by buying a device\\!`;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🛒 Buy Device', 'device_buy')],
          [Markup.button.callback('💳 Make Payment', 'device_payment')],
          [Markup.button.callback('⬅️ Back', 'device_menu')]
        ]);
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        }
        return;
      }
      
      let message = `*📊 MY DEVICE HISTORY*\n\n`;
      message += `*Total Purchases\\:* ${userPurchases.length}\n`;
      message += `*Your Balance\\:* ${this.formatCurrency(walletBalance)}\n\n`;
      
      let totalSpent = 0;
      let completedPurchases = 0;
      
      userPurchases.forEach((purchase, index) => {
        totalSpent += purchase.amountPaid || 0;
        if (purchase.completed) completedPurchases++;
        
        const progress = Math.round(((purchase.amountPaid || 0) / purchase.totalPrice) * 100);
        const status = purchase.completed ? '✅ COMPLETED' : 
                      purchase.status === 'active' ? '📅 ACTIVE' : 
                      purchase.status === 'pending_downpayment' ? '💰 DOWN PAYMENT REQUIRED' : '⏳ PENDING';
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}*\n`;
        message += `   📱 ID\\: ${this.escapeMarkdown(purchase.purchaseId)}\n`;
        message += `   💰 Total\\: ${this.formatCurrency(purchase.totalPrice)}\n`;
        message += `   💵 Paid\\: ${this.formatCurrency(purchase.amountPaid || 0)} \\(${progress}%\\)\n`;
        message += `   📊 Status\\: ${status}\n`;
        message += `   📅 Date\\: ${new Date(purchase.createdAt).toLocaleDateString()}\n\n`;
      });
      
      message += `*📈 STATISTICS*\n`;
      message += `Total Spent\\: ${this.formatCurrency(totalSpent)}\n`;
      message += `Completed Purchases\\: ${completedPurchases}\n`;
      message += `Active Purchases\\: ${userPurchases.length - completedPurchases}\n\n`;
      
      message += `*💳 To make payment\\:*\n`;
      message += `\`/paydevice purchaseId:amount\``;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 My Purchases', 'device_my_purchases')],
        [Markup.button.callback('📱 My Devices', 'device_my_devices')],
        [Markup.button.callback('⬅️ Back', 'device_menu')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle my history error:', error);
      throw error;
    }
  }

  // ==================== MY SALES ====================
  async handleMySales(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const user = this.users[userId];
      
      if (!user) {
        await ctx.answerCbQuery('❌ User not found');
        return;
      }
      
      const isMarketer = user.isMarketer === true;
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isMarketer && !isAdminUser) {
        await ctx.answerCbQuery('❌ Marketer or Admin access only');
        return;
      }
      
      const message = `*💰 MY DEVICE SALES*\n\n` +
        `*🎯 Marketer Commission\\: 10\\%*\n\n` +
        `*How it works\\:*\n` +
        `1\\. You refer customers to buy devices\n` +
        `2\\. They mention you during purchase\n` +
        `3\\. You earn 10\\% commission on each sale\n` +
        `4\\. Commission is paid when device is fully paid\n\n` +
        `*Your Marketer ID\\:* \`${userId}\`\n\n` +
        `*To start earning\\:*\n` +
        `• Share your marketer ID with customers\n` +
        `• Ask them to mention you when buying\n` +
        `• Track your sales here\n\n` +
        `*Current Status\\:* ${isMarketer ? '✅ ACTIVE MARKETER' : '👑 ADMIN ACCESS'}`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📱 View Devices', 'device_view_devices')],
        [Markup.button.callback('🔄 Refresh', 'device_my_sales')],
        [Markup.button.callback('⬅️ Back', 'device_menu')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle my sales error:', error);
      throw error;
    }
  }

  // ==================== DEVICE PAYMENT ====================
  async handleDevicePayment(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const walletBalance = await this.getUserWalletBalance(userId);
      
      const message = `*💳 MAKE DEVICE PAYMENT*\n\n` +
        `*How to make payments\\:*\n\n` +
        `*1\\. Using Your Main Bot Balance*\n` +
        `   • Your current balance\\: ${this.formatCurrency(walletBalance)}\n` +
        `   • Use command\\: \`/paydevice purchaseId:amount\`\n` +
        `   • Example\\: \`/paydevice DEV123456:50000\`\n\n` +
        
        `*2\\. Bank Transfer \\(if balance is low\\)*\n` +
        `   • Transfer to\\: Liteway Ventures\n` +
        `   • Account\\: 0123456789\n` +
        `   • Bank\\: Wema Bank\n` +
        `   • Send proof to\\: @opuenekeke\n` +
        `   • Funds will be added to your bot balance\n\n` +
        
        `*💎 YOUR BALANCE\\:* ${this.formatCurrency(walletBalance)}\n\n` +
        
        `*📋 View your purchases\\:*\n` +
        `\`/mypurchases\` or click "📋 My Purchases"\n\n` +
        
        `*💳 Deposit more funds\\:*\n` +
        `Use "💳 Deposit Funds" in main menu`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 My Purchases', 'device_my_purchases')],
        [Markup.button.callback('📱 My Devices', 'device_my_devices')],
        [Markup.button.callback('⬅️ Back', 'device_menu')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle device payment error:', error);
      throw error;
    }
  }

  async handlePaymentSelection(ctx, purchaseId, amount) {
    try {
      console.log(`💳 Payment selection for purchase: ${purchaseId}, amount: ${amount}`);
      
      const userId = ctx.from.id.toString();
      const user = this.users[userId];
      
      if (!user) {
        await ctx.reply('❌ User not found');
        return;
      }
      
      const purchases = await this.purchaseModel.getAllPurchases();
      const purchase = purchases.find(p => p.purchaseId === purchaseId && p.userId === userId);
      
      if (!purchase) {
        await ctx.reply('❌ Purchase not found or does not belong to you', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const remaining = purchase.totalPrice - (purchase.amountPaid || 0);
      const suggestedAmount = amount || Math.min(remaining, Math.max(10000, Math.floor(remaining / 10)));
      const walletBalance = await this.getUserWalletBalance(userId);
      
      const message = `*💳 MAKE PAYMENT*\n\n` +
        `*Purchase ID\\:* ${this.escapeMarkdown(purchaseId)}\n` +
        `*Device\\:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*Total Price\\:* ${this.formatCurrency(purchase.totalPrice)}\n` +
        `*Already Paid\\:* ${this.formatCurrency(purchase.amountPaid || 0)}\n` +
        `*Remaining\\:* ${this.formatCurrency(remaining)}\n` +
        `*Your Balance\\:* ${this.formatCurrency(walletBalance)}\n\n` +
        
        `*💰 SUGGESTED PAYMENT\\:* ${this.formatCurrency(suggestedAmount)}\n\n` +
        
        `*To pay from your balance\\:*\n` +
        `\`/paydevice ${purchaseId}:${suggestedAmount}\`\n\n` +
        
        `*Or choose custom amount\\:*\n` +
        `\`/paydevice ${purchaseId}:amount\`\n\n` +
        
        `*Need to fund your account\\?*\n` +
        `Use "💳 Deposit Funds" in main menu\n` +
        `or transfer to Liteway Ventures\\:\n` +
        `Account\\: 0123456789\n` +
        `Bank\\: Wema Bank\n` +
        `Send proof to @opuenekeke`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(`💳 Pay ${this.formatCurrency(suggestedAmount)}`, `device_confirm_paid_${purchaseId}_${suggestedAmount}`),
          Markup.button.callback('💰 Custom Amount', 'device_payment')
        ],
        [
          Markup.button.callback('📋 My Purchases', 'device_my_purchases'),
          Markup.button.callback('⬅️ Back', 'device_menu')
        ]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle payment selection error:', error);
      throw error;
    }
  }

  async handleDirectPayment(ctx, purchaseId, amount) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!amount || amount <= 0) {
        await ctx.reply('❌ Invalid amount');
        return;
      }
      
      const paymentResult = await this.processDevicePayment(purchaseId, userId, amount);
      
      if (!paymentResult.success) {
        if (paymentResult.error === 'Insufficient balance') {
          const walletBalance = await this.getUserWalletBalance(userId);
          await ctx.reply(
            `❌ *INSUFFICIENT BALANCE*\n\n` +
            `*Required\\:* ${this.formatCurrency(amount)}\n` +
            `*Your Balance\\:* ${this.formatCurrency(walletBalance)}\n\n` +
            `*Fund your account via\\:*\n` +
            `1\\. Use "💳 Deposit Funds" in main menu\n` +
            `2\\. Or transfer to Liteway Ventures\n` +
            `3\\. Account\\: 0123456789\n` +
            `4\\. Bank\\: Wema Bank\n` +
            `5\\. Send proof to @opuenekeke`,
            { parse_mode: 'MarkdownV2' }
          );
        } else {
          await ctx.reply(
            `❌ *PAYMENT FAILED*\n\n` +
            `*Error\\:* ${this.escapeMarkdown(paymentResult.error)}\n\n` +
            `Please try again or contact support\\.`,
            { parse_mode: 'MarkdownV2' }
          );
        }
        return;
      }
      
      const purchase = paymentResult.purchase;
      const progress = paymentResult.progress;
      const newBalance = paymentResult.deduction.newBalance;
      
      await ctx.reply(
        `✅ *PAYMENT SUCCESSFUL\\!*\n\n` +
        `*Purchase ID\\:* ${this.escapeMarkdown(purchaseId)}\n` +
        `*Device\\:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n` +
        `*Amount Paid\\:* ${this.formatCurrency(amount)}\n` +
        `*Total Paid\\:* ${this.formatCurrency(purchase.amountPaid)}\n` +
        `*Progress\\:* ${progress}%\n` +
        `*Your New Balance\\:* ${this.formatCurrency(newBalance)}\n\n` +
        `*Payment Status\\:* ${purchase.status === 'completed' ? '✅ DEVICE UNLOCKED' : '📅 PAYMENT RECORDED'}\n\n` +
        (purchase.status === 'completed' ? 
          `*Your device is now unlocked\\!*\n` +
          `Check "📱 My Devices" to view your device details\\.` : 
          `*Keep making payments to unlock your device\\.*`),
        { parse_mode: 'MarkdownV2' }
      );
      
      await ctx.answerCbQuery('✅ Payment processed');
      
    } catch (error) {
      console.error('❌ Handle direct payment error:', error);
      await ctx.reply(`❌ Error processing payment\\: ${this.escapeMarkdown(error.message)}`, { parse_mode: 'MarkdownV2' });
    }
  }

  async handleViewPurchaseDetails(ctx, purchaseId) {
    try {
      console.log(`📋 View purchase details: ${purchaseId}`);
      
      const userId = ctx.from.id.toString();
      const purchases = await this.purchaseModel.getAllPurchases();
      const purchase = purchases.find(p => p.purchaseId === purchaseId && p.userId === userId);
      
      if (!purchase) {
        await ctx.reply('❌ Purchase not found or does not belong to you', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const progress = Math.round(((purchase.amountPaid || 0) / purchase.totalPrice) * 100);
      const remaining = purchase.totalPrice - (purchase.amountPaid || 0);
      const walletBalance = await this.getUserWalletBalance(userId);
      
      let message = `*📋 PURCHASE DETAILS*\n\n`;
      message += `*Purchase ID\\:* ${this.escapeMarkdown(purchaseId)}\n`;
      message += `*Device\\:* ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}\n`;
      message += `*Total Price\\:* ${this.formatCurrency(purchase.totalPrice)}\n`;
      message += `*Amount Paid\\:* ${this.formatCurrency(purchase.amountPaid || 0)}\n`;
      message += `*Remaining\\:* ${this.formatCurrency(remaining)}\n`;
      message += `*Progress\\:* ${progress}%\n`;
      message += `*Your Balance\\:* ${this.formatCurrency(walletBalance)}\n`;
      message += `*Status\\:* ${purchase.completed ? '✅ COMPLETED' : purchase.status || 'PENDING'}\n`;
      message += `*Purchase Date\\:* ${new Date(purchase.createdAt).toLocaleDateString()}\n\n`;
      
      if (purchase.imei) {
        message += `*🔐 SECURITY DETAILS*\n`;
        message += `• IMEI\\: ${this.escapeMarkdown(purchase.imei)}\n`;
        message += `• Serial\\: ${this.escapeMarkdown(purchase.serial)}\n`;
        message += `• Device Status\\: ${purchase.completed ? '✅ UNLOCKED' : '🔒 LOCKED'}\n\n`;
      }
      
      if (purchase.payments && purchase.payments.length > 0) {
        message += `*📅 PAYMENT HISTORY*\n`;
        purchase.payments.forEach((payment, index) => {
          message += `${index + 1}\\. ${this.formatCurrency(payment.amount)} - ${new Date(payment.date).toLocaleDateString()} \\(${payment.type}\\)\n`;
        });
        message += `\n`;
      }
      
      message += `*NEXT STEPS\\:*\n`;
      if (purchase.completed) {
        message += `✅ Your device is fully paid and unlocked\\!\n`;
        message += `Check "📱 My Devices" to view your device\\.`;
      } else {
        message += `1\\. Make payment using your bot balance\n`;
        message += `2\\. Device unlocks as you pay\n`;
        message += `3\\. Fully unlocked when paid\n\n`;
        message += `*To make payment\\:*\n`;
        const suggestedAmount = Math.min(remaining, Math.max(10000, Math.floor(remaining / 10)));
        message += `\`/paydevice ${purchaseId}:${suggestedAmount}\``;
      }
      
      const keyboard = Markup.inlineKeyboard([
        !purchase.completed ? [Markup.button.callback('💳 Make Payment', `device_pay_select_${purchaseId}`)] : [],
        [Markup.button.callback('📋 My Purchases', 'device_my_purchases')],
        [Markup.button.callback('⬅️ Back', 'device_menu')]
      ].filter(row => row.length > 0));
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle view purchase details error:', error);
      throw error;
    }
  }

  // ==================== PLAN SELECTION ====================
  async handlePlanSelection(ctx, planType) {
    try {
      const userId = ctx.from.id.toString();
      const session = this.sessionManager.getSession(userId);
      const walletBalance = await this.getUserWalletBalance(userId);
      
      if (!session || session.action !== 'device_buy') {
        await ctx.answerCbQuery('❌ No active purchase session');
        return;
      }
      
      const deviceId = session.data.deviceId;
      const device = await this.deviceModel.getDeviceById(deviceId);
      
      if (!device) {
        await ctx.answerCbQuery('❌ Device not found');
        return;
      }
      
      let planName = '';
      let downPaymentPercent = 0;
      let interestRate = 0;
      let paymentCount = 0;
      
      switch (planType) {
        case 'daily':
          planName = 'Daily \\(60 days\\)';
          downPaymentPercent = 10;
          interestRate = 5;
          paymentCount = 60;
          break;
        case 'weekly':
          planName = 'Weekly \\(12 weeks\\)';
          downPaymentPercent = 15;
          interestRate = 8;
          paymentCount = 12;
          break;
        case 'monthly':
          planName = 'Monthly \\(6 months\\)';
          downPaymentPercent = 20;
          interestRate = 12;
          paymentCount = 6;
          break;
        default:
          await ctx.answerCbQuery('❌ Invalid plan type');
          return;
      }
      
      const downPayment = device.sellingPrice * (downPaymentPercent / 100);
      const totalWithInterest = device.sellingPrice * (1 + (interestRate / 100));
      const regularPayment = (totalWithInterest - downPayment) / paymentCount;
      
      session.data.selectedPlan = planType;
      session.data.planDetails = {
        planName,
        downPayment,
        regularPayment,
        totalWithInterest,
        paymentCount,
        interestRate,
        downPaymentPercent
      };
      session.step = 2;
      this.sessionManager.updateSession(userId, session);
      
      let message = `*📅 PAYMENT PLAN DETAILS*\n\n`;
      message += `*Device\\:* ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}\n`;
      message += `*Plan\\:* ${planName}\n\n`;
      
      message += `*💰 PRICING BREAKDOWN*\n`;
      message += `• Selling Price\\: ${this.formatCurrency(device.sellingPrice)}\n`;
      message += `• Interest Rate\\: ${interestRate}%\n`;
      message += `• Total with Interest\\: ${this.formatCurrency(totalWithInterest)}\n\n`;
      
      message += `*💳 PAYMENT SCHEDULE*\n`;
      message += `• Down Payment\\: ${this.formatCurrency(downPayment)} \\(${downPaymentPercent}%\\)\n`;
      message += `• Regular Payments\\: ${this.formatCurrency(regularPayment)}\n`;
      message += `• Number of Payments\\: ${paymentCount}\n`;
      message += `• Payment Interval\\: ${planType}\n\n`;
      
      message += `*💰 YOUR BALANCE\\:* ${this.formatCurrency(walletBalance)}\n`;
      if (walletBalance >= downPayment) {
        message += `✅ You have enough for down payment\\!\n\n`;
      } else {
        message += `⚠️ You need ${this.formatCurrency(downPayment - walletBalance)} more for down payment\n\n`;
      }
      
      message += `*📱 IMEI LOCK SECURITY*\n`;
      message += `• Device locked until down payment\n`;
      message += `• Partial unlock with each payment\n`;
      message += `• Fully unlocked when paid\n`;
      message += `• Defaulters get IMEI blacklisted\n\n`;
      
      message += `*Do you want to proceed with this plan\\?*`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ CONFIRM PURCHASE', `device_confirm_purchase_${deviceId}_${planType}`),
          Markup.button.callback('🔄 Choose Another Plan', `device_select_${deviceId}`)
        ],
        [Markup.button.callback('⬅️ Cancel', 'device_menu')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle plan selection error:', error);
      throw error;
    }
  }

  async handleConfirmPurchase(ctx, deviceId, planType) {
    try {
      const userId = ctx.from.id.toString();
      const user = this.users[userId];
      
      if (!user) {
        await ctx.answerCbQuery('❌ User not found');
        return;
      }
      
      if (user.kycStatus !== 'approved') {
        const message = `*❌ KYC VERIFICATION REQUIRED*\n\n` +
          `Your account needs verification before purchasing devices\\.\n\n` +
          `*KYC Status\\:* ${this.escapeMarkdown(user.kycStatus || 'pending').toUpperCase()}\n` +
          `*Contact admin\\:* @opuenekeke`;
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' });
        } else {
          await ctx.reply(message, { parse_mode: 'MarkdownV2' });
        }
        return;
      }
      
      if (!user.pin) {
        const message = `*❌ TRANSACTION PIN REQUIRED*\n\n` +
          `Please set your transaction PIN first\\:\n\n` +
          `\`/setpin 1234\`\n\n` +
          `Then try again\\.`;
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' });
        } else {
          await ctx.reply(message, { parse_mode: 'MarkdownV2' });
        }
        return;
      }
      
      const device = await this.deviceModel.getDeviceById(deviceId);
      if (!device) {
        await ctx.answerCbQuery('❌ Device not found');
        return;
      }
      
      const session = this.sessionManager.getSession(userId);
      if (!session || !session.data.planDetails) {
        await ctx.answerCbQuery('❌ No plan selected');
        return;
      }
      
      const planDetails = session.data.planDetails;
      const downPayment = planDetails.downPayment;
      const totalPrice = planDetails.totalWithInterest;
      
      const walletBalance = await this.getUserWalletBalance(userId);
      if (walletBalance < downPayment) {
        const message = `*❌ INSUFFICIENT BALANCE FOR DOWN PAYMENT*\n\n` +
          `*Required\\:* ${this.formatCurrency(downPayment)}\n` +
          `*Your Balance\\:* ${this.formatCurrency(walletBalance)}\n` +
          `*Short by\\:* ${this.formatCurrency(downPayment - walletBalance)}\n\n` +
          `*Fund your account via\\:*\n` +
          `1\\. Use "💳 Deposit Funds" in main menu\n` +
          `2\\. Or transfer to Liteway Ventures\n` +
          `3\\. Account\\: 0123456789\n` +
          `4\\. Bank\\: Wema Bank\n` +
          `5\\. Send proof to @opuenekeke`;
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' });
        } else {
          await ctx.reply(message, { parse_mode: 'MarkdownV2' });
        }
        return;
      }
      
      const downPaymentResult = await this.processDownPayment(userId, downPayment, device, planDetails);
      
      if (!downPaymentResult.success) {
        const message = `*❌ DOWN PAYMENT FAILED*\n\n` +
          `*Error\\:* ${this.escapeMarkdown(downPaymentResult.error)}\n\n` +
          `Please try again or contact support\\.`;
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' });
        } else {
          await ctx.reply(message, { parse_mode: 'MarkdownV2' });
        }
        return;
      }
      
      const purchaseId = `DEV${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      const imei = this.generateIMEI();
      const serial = this.generateSerial();
      
      const purchaseData = {
        purchaseId,
        userId,
        deviceId: device.id,
        make: device.make,
        model: device.model,
        totalPrice,
        amountPaid: downPayment,
        downPayment,
        planType,
        interestRate: planDetails.interestRate,
        paymentCount: planDetails.paymentCount,
        regularPayment: planDetails.regularPayment,
        imei,
        serial,
        status: 'active',
        completed: false,
        createdAt: new Date().toISOString(),
        payments: [{
          amount: downPayment,
          date: new Date().toISOString(),
          type: 'down_payment',
          userId: userId,
          balanceAfter: downPaymentResult.deduction.newBalance
        }]
      };
      
      await this.purchaseModel.addPurchase(purchaseData);
      
      this.sessionManager.clearSession(userId);
      
      let message = `✅ *PURCHASE SUCCESSFUL\\!*\n\n`;
      message += `*Device\\:* ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}\n`;
      message += `*Purchase ID\\:* ${this.escapeMarkdown(purchaseId)}\n`;
      message += `*Plan\\:* ${planDetails.planName}\n`;
      message += `*Total Price\\:* ${this.formatCurrency(totalPrice)}\n`;
      message += `*Down Payment\\:* ${this.formatCurrency(downPayment)}\n`;
      message += `*Remaining\\:* ${this.formatCurrency(totalPrice - downPayment)}\n`;
      message += `*Your New Balance\\:* ${this.formatCurrency(downPaymentResult.deduction.newBalance)}\n\n`;
      
      message += `*🔐 SECURITY DETAILS*\n`;
      message += `• IMEI\\: ${this.escapeMarkdown(imei)}\n`;
      message += `• Serial\\: ${this.escapeMarkdown(serial)}\n`;
      message += `• Device is currently locked\n`;
      message += `• Will unlock as you make payments\n\n`;
      
      message += `*📱 NEXT STEPS*\n`;
      message += `1\\. Make regular payments of ${this.formatCurrency(planDetails.regularPayment)}\n`;
      message += `2\\. Device unlocks with each payment\n`;
      message += `3\\. Fully unlocked when paid\n\n`;
      
      message += `*💳 MAKE PAYMENTS\\:*\n`;
      message += `Use command\\: \`/paydevice ${purchaseId}:amount\`\n`;
      message += `Or click "📋 My Purchases" to view and pay`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💳 Make Next Payment', `device_pay_select_${purchaseId}`)],
        [Markup.button.callback('📋 My Purchases', 'device_my_purchases')],
        [Markup.button.callback('📱 My Devices', 'device_my_devices')],
        [Markup.button.callback('⬅️ Main Menu', 'device_menu')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
      await ctx.answerCbQuery('✅ Purchase completed');
      
    } catch (error) {
      console.error('❌ Handle confirm purchase error:', error);
      
      const errorMessage = `*❌ PURCHASE FAILED*\n\n` +
        `An error occurred while processing your purchase\\.\n\n` +
        `*Error\\:* ${this.escapeMarkdown(error.message)}\n\n` +
        `Please try again or contact support\\.`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Try Again', `device_select_${deviceId}`)],
        [Markup.button.callback('📱 Main Menu', 'device_menu')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(errorMessage, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(errorMessage, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
    }
  }

  // ==================== ADMIN PANEL ====================
  async handleAdminPanel(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      console.log(`👑 Admin ${userId} accessing admin panel`);
      
      let message = `*⚙️ DEVICE ADMIN PANEL*\n\n`;
      message += `*👑 Admin\\:* ${this.escapeMarkdown(ctx.from.first_name || 'Admin')}\n`;
      message += `*🆔 User ID\\:* ${userId}\n\n`;
      
      message += `*📊 SYSTEM STATUS*\n`;
      message += `✅ Device Handler\\: ${this.isInitialized ? 'ACTIVE' : 'INACTIVE'}\n`;
      message += `✅ Models Loaded\\: YES\n`;
      message += `✅ Session Manager\\: ACTIVE\n\n`;
      
      message += `*🔧 ADMIN ACTIONS*\n`;
      message += `Use the buttons below to manage the system\\.`;
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Add Device', 'device_admin_add'),
          Markup.button.callback('📊 Manage Devices', 'device_admin_view')
        ],
        [
          Markup.button.callback('📦 Inventory', 'device_admin_inventory'),
          Markup.button.callback('👥 Marketers', 'device_manage_marketers')
        ],
        [
          Markup.button.callback('📋 All Purchases', 'device_admin_purchases'),
          Markup.button.callback('👤 User Devices', 'device_admin_user_devices')
        ],
        [
          Markup.button.callback('🔄 Refresh Stats', 'device_admin'),
          Markup.button.callback('⬅️ Back', 'device_menu')
        ]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
      await ctx.answerCbQuery('✅ Admin panel loaded');
      
    } catch (error) {
      console.error('❌ Handle admin panel error:', error);
      
      try {
        const errorMessage = `*❌ ERROR LOADING ADMIN PANEL*\n\n` +
          `An error occurred while loading the admin panel\\.\n\n` +
          `*Error\\:* ${this.escapeMarkdown(error.message)}\n\n` +
          `Please try again or contact support\\.`;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Try Again', 'device_admin')],
          [Markup.button.callback('⬅️ Back', 'device_menu')]
        ]);
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(errorMessage, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        } else {
          await ctx.reply(errorMessage, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        }
      } catch (fallbackError) {
        console.error('❌ Fallback error handling failed:', fallbackError);
        await ctx.answerCbQuery('❌ Critical error in admin panel');
      }
    }
  }

  async handleManageMarketers(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const message = `*👥 MANAGE MARKETERS*\n\n` +
        `*Marketer System Features\\:*\n\n` +
        `1\\. *Assign Marketers*\n` +
        `   • Set users as marketers\n` +
        `   • 10\\% commission rate\n` +
        `   • Track sales performance\n\n` +
        `2\\. *Commission Tracking*\n` +
        `   • Automatic calculation\n` +
        `   • Pending vs paid commissions\n` +
        `   • Payment history\n\n` +
        `3\\. *Performance Metrics*\n` +
        `   • Sales volume\n` +
        `   • Commission earned\n` +
        `   • Customer referrals\n\n` +
        `*Current Status\\:*\n` +
        `• System\\: ✅ ACTIVE\n` +
        `• Commission Rate\\: 10\\%\n` +
        `• Payout\\: When device fully paid\n\n` +
        `*To assign a marketer\\:*\n` +
        `1\\. User must have KYC approved\n` +
        `2\\. Use the button below\n` +
        `3\\. Enter user ID and details`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Assign New Marketer', 'device_assign_marketer')],
        [Markup.button.callback('📊 View Performance', 'device_admin_marketers')],
        [
          Markup.button.callback('🔄 Refresh', 'device_manage_marketers'),
          Markup.button.callback('⬅️ Back', 'device_admin')
        ]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle manage marketers error:', error);
      throw error;
    }
  }

  async handleAddDevice(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const message = `*➕ ADD NEW DEVICE*\n\n` +
        `*To add a new device, use this format\\:*\n\n` +
        `\`/adddevice make:model:costPrice:sellingPrice\`\n\n` +
        `*Example Commands\\:*\n` +
        `• \`/adddevice iPhone:15 Pro Max:900000:1050000\`\n` +
        `• \`/adddevice Tecno:Camon 20:150000:180000\`\n` +
        `• \`/adddevice Samsung:S23 Ultra:850000:950000\`\n\n` +
        `*Required Fields\\:*\n` +
        `• make \\(brand\\)\n` +
        `• model\n` +
        `• costPrice \\(number\\)\n` +
        `• sellingPrice \\(number\\)\n\n` +
        `*Example\\:*\n` +
        `\`/adddevice iPhone:15 Pro:800000:950000\``;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle add device error:', error);
      throw error;
    }
  }

  async handleAdminViewDevices(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const devices = await this.deviceModel.getAllDevices();
      
      if (devices.length === 0) {
        const message = `*📊 MANAGE DEVICES*\n\n` +
          `❌ No devices in the system\\.\n\n` +
          `Add devices first to manage them\\.`;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('➕ Add Device', 'device_admin_add')],
          [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
        ]);
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        }
        return;
      }
      
      let message = `*📊 MANAGE DEVICES*\n\n`;
      message += `*Total Devices\\:* ${devices.length}\n\n`;
      
      devices.forEach((device, index) => {
        const status = device.isActive ? '🟢 ACTIVE' : '🔴 INACTIVE';
        const profit = device.sellingPrice - device.costPrice;
        const profitPercentage = ((profit / device.costPrice) * 100).toFixed(1);
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n`;
        message += `   📱 ID\\: ${this.escapeMarkdown(device.id)}\n`;
        message += `   💰 Price\\: ${this.formatCurrency(device.sellingPrice)}\n`;
        message += `   📈 Profit\\: ${this.formatCurrency(profit)} \\(${this.escapeMarkdown(profitPercentage)}%\\)\n`;
        message += `   📊 Status\\: ${status}\n\n`;
      });
      
      message += `*Admin Actions\\:*\n`;
      message += `• Edit device\\: Use device ID\n`;
      message += `• Toggle status\\: Use /toggledevice \\<deviceId\\>\n`;
      message += `• Delete device\\: Use /deletedevice \\<deviceId\\>`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add New Device', 'device_admin_add')],
        [Markup.button.callback('🔄 Refresh', 'device_admin_view')],
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle admin view devices error:', error);
      throw error;
    }
  }

  async handleAdminInventory(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const inventory = await this.inventoryModel.getAllInventory();
      
      if (inventory.length === 0) {
        const message = `*📦 DEVICE INVENTORY*\n\n` +
          `❌ No inventory items\\.\n\n` +
          `Add devices first, then add inventory for those devices\\.`;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('➕ Add Device', 'device_admin_add')],
          [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
        ]);
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        }
        return;
      }
      
      let message = `*📦 DEVICE INVENTORY*\n\n`;
      
      const inventoryByDevice = {};
      inventory.forEach(item => {
        if (!inventoryByDevice[item.deviceId]) {
          inventoryByDevice[item.deviceId] = [];
        }
        inventoryByDevice[item.deviceId].push(item);
      });
      
      for (const [deviceId, items] of Object.entries(inventoryByDevice)) {
        const device = await this.deviceModel.getDeviceById(deviceId);
        const deviceName = device ? `${device.make} ${device.model}` : `Device ${deviceId}`;
        
        const totalItems = items.length;
        const available = items.filter(item => item.status === 'available').length;
        const reserved = items.filter(item => item.status === 'reserved').length;
        const sold = items.filter(item => item.status === 'sold').length;
        
        message += `*${this.escapeMarkdown(deviceName)}*\n`;
        message += `   📱 Device ID\\: ${this.escapeMarkdown(deviceId)}\n`;
        message += `   📊 Total\\: ${totalItems}\n`;
        message += `   🟢 Available\\: ${available}\n`;
        message += `   🟡 Reserved\\: ${reserved}\n`;
        message += `   🔴 Sold\\: ${sold}\n\n`;
      }
      
      message += `*Inventory Management\\:*\n`;
      message += `• Add inventory\\: /addinventory \\<deviceId\\> \\<quantity\\>\n`;
      message += `• View specific\\: /viewinventory \\<deviceId\\>\n`;
      message += `• Update status\\: /updateinventory \\<inventoryId\\> \\<status\\>`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'device_admin_inventory')],
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle admin inventory error:', error);
      throw error;
    }
  }

  async handleAdminPurchases(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const purchases = await this.purchaseModel.getAllPurchases();
      
      if (purchases.length === 0) {
        const message = `*📋 ALL PURCHASES*\n\n` +
          `❌ No purchases recorded yet\\.\n\n` +
          `Customers need to buy devices first\\.`;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📱 View Devices', 'device_view_devices')],
          [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
        ]);
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        }
        return;
      }
      
      let message = `*📋 ALL PURCHASES*\n\n`;
      message += `*Total Purchases\\:* ${purchases.length}\n\n`;
      
      let totalRevenue = 0;
      let completedPurchases = 0;
      let activePurchases = 0;
      let pendingPurchases = 0;
      
      purchases.forEach((purchase, index) => {
        totalRevenue += purchase.totalPrice || 0;
        
        if (purchase.completed) {
          completedPurchases++;
        } else if (purchase.status === 'active') {
          activePurchases++;
        } else {
          pendingPurchases++;
        }
        
        const progress = purchase.totalPrice ? Math.round(((purchase.amountPaid || 0) / purchase.totalPrice) * 100) : 0;
        
        if (index < 5) {
          const buyerId = purchase.userId || 'Unknown';
          message += `*${index + 1}\\. ${this.escapeMarkdown(purchase.make || 'Unknown')} ${this.escapeMarkdown(purchase.model || 'Device')}*\n`;
          message += `   👤 Buyer\\: ${this.escapeMarkdown(buyerId)}\n`;
          message += `   📱 Purchase ID\\: ${this.escapeMarkdown(purchase.purchaseId || 'N/A')}\n`;
          message += `   💰 Total\\: ${this.formatCurrency(purchase.totalPrice || 0)}\n`;
          message += `   💵 Paid\\: ${this.formatCurrency(purchase.amountPaid || 0)} \\(${progress}%\\)\n`;
          message += `   📊 Status\\: ${purchase.completed ? '✅ COMPLETED' : purchase.status || 'PENDING'}\n\n`;
        }
      });
      
      if (purchases.length > 5) {
        message += `*... and ${purchases.length - 5} more purchases*\n\n`;
      }
      
      message += `*📊 PURCHASE STATISTICS*\n`;
      message += `Total Revenue\\: ${this.formatCurrency(totalRevenue)}\n`;
      message += `Completed\\: ${completedPurchases}\n`;
      message += `Active\\: ${activePurchases}\n`;
      message += `Pending\\: ${pendingPurchases}\n\n`;
      
      message += `*Admin Actions\\:*\n`;
      message += `• View details\\: /viewpurchase \\<purchaseId\\>\n`;
      message += `• Update payment\\: /updatepayment \\<purchaseId\\> \\<amount\\>\n`;
      message += `• Mark complete\\: /completepurchase \\<purchaseId\\>`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'device_admin_purchases')],
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle admin purchases error:', error);
      throw error;
    }
  }

  async handleAdminUserDevices(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let userDevices = [];
      try {
        await this.userDeviceModel.initialize();
        userDevices = await this.userDeviceModel.getAllUserDevices();
      } catch (error) {
        console.error('Error reading user devices file:', error);
        userDevices = [];
      }
      
      if (userDevices.length === 0) {
        const message = `*👤 USER DEVICES*\n\n` +
          `❌ No user devices found\\.\n\n` +
          `Customers need to purchase devices first\\.`;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📱 View Devices', 'device_view_devices')],
          [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
        ]);
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        }
        return;
      }
      
      let message = `*👤 USER DEVICES*\n\n`;
      message += `*Total User Devices\\:* ${userDevices.length}\n\n`;
      
      const devicesByUser = {};
      userDevices.forEach(device => {
        if (!devicesByUser[device.userId]) {
          devicesByUser[device.userId] = [];
        }
        devicesByUser[device.userId].push(device);
      });
      
      let userCount = 0;
      for (const [userId, devices] of Object.entries(devicesByUser)) {
        if (userCount >= 5) break;
        
        const user = this.users[userId];
        const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${userId}` : `User ${userId}`;
        
        message += `*👤 ${this.escapeMarkdown(userName)}*\n`;
        message += `   🆔 User ID\\: ${this.escapeMarkdown(userId)}\n`;
        message += `   📱 Total Devices\\: ${devices.length}\n`;
        
        devices.forEach((device, index) => {
          if (index < 3) {
            message += `   ${index + 1}\\. ${this.escapeMarkdown(device.make || 'Unknown')} ${this.escapeMarkdown(device.model || 'Device')} - ${this.escapeMarkdown(device.status || 'unknown')}\n`;
          }
        });
        
        if (devices.length > 3) {
          message += `   ... and ${devices.length - 3} more devices\n`;
        }
        
        message += `\n`;
        userCount++;
      }
      
      if (Object.keys(devicesByUser).length > 5) {
        message += `*... and ${Object.keys(devicesByUser).length - 5} more users*\n\n`;
      }
      
      message += `*Admin Actions\\:*\n`;
      message += `• View user\\: /viewuserdevices \\<userId\\>\n`;
      message += `• Update status\\: /updatedevicestatus \\<deviceId\\> \\<status\\>\n`;
      message += `• Add device\\: /adduserdevice \\<userId\\> \\<deviceId\\>`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'device_admin_user_devices')],
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle admin user devices error:', error);
      
      const errorMessage = `*❌ ERROR LOADING USER DEVICES*\n\n` +
        `An error occurred while loading user devices\\.\n\n` +
        `*Error\\:* ${this.escapeMarkdown(error.message)}\n\n` +
        `The system will create a new user devices file\\.`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Try Again', 'device_admin_user_devices')],
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(errorMessage, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(errorMessage, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
    }
  }

  async handleAssignMarketer(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const message = `*👥 ASSIGN MARKETER*\n\n` +
        `*To assign a user as a marketer\\:*\n\n` +
        `\`/assignmarketer \\<userId\\> \\<name\\> \\<email\\>\`\n\n` +
        `*Example\\:*\n` +
        `\`/assignmarketer 1234567890 John Doe john@example.com\`\n\n` +
        `*What happens\\:*\n` +
        `1\\. User becomes a marketer\n` +
        `2\\. Can view sales dashboard\n` +
        `3\\. Earns 10\\% commission on sales\n` +
        `4\\. Gets marketer ID for referrals\n\n` +
        `*To remove marketer status\\:*\n` +
        `\`/removemarketer \\<userId\\>\`\n\n` +
        `*To view all marketers\\:*\n` +
        `\`/viewmarketers\``;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📊 View Marketers', 'device_manage_marketers')],
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle assign marketer error:', error);
      throw error;
    }
  }

  async handleAdminMarketersPerformance(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const marketers = await this.marketerModel.getAllMarketers();
      
      if (marketers.length === 0) {
        const message = `*📊 MARKETERS PERFORMANCE*\n\n` +
          `❌ No marketers assigned yet\\.\n\n` +
          `Assign users as marketers to track their performance\\.`;
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('👥 Assign Marketer', 'device_assign_marketer')],
          [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
        ]);
        
        if (ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            ...keyboard
          });
        }
        return;
      }
      
      let message = `*📊 MARKETERS PERFORMANCE*\n\n`;
      message += `*Total Marketers\\:* ${marketers.length}\n\n`;
      
      let totalSales = 0;
      let totalCommission = 0;
      let activeMarketers = 0;
      
      marketers.forEach((marketer, index) => {
        totalSales += marketer.totalSales || 0;
        totalCommission += marketer.totalCommission || 0;
        if (marketer.status === 'active') activeMarketers++;
        
        const status = marketer.status === 'active' ? '🟢 ACTIVE' : '🔴 INACTIVE';
        
        message += `*${index + 1}\\. ${this.escapeMarkdown(marketer.name || 'Unknown')}*\n`;
        message += `   🆔 ID\\: ${this.escapeMarkdown(marketer.id || 'N/A')}\n`;
        message += `   📧 Email\\: ${this.escapeMarkdown(marketer.email || 'Not set')}\n`;
        message += `   💰 Total Sales\\: ${this.formatCurrency(marketer.totalSales || 0)}\n`;
        message += `   💸 Commission Due\\: ${this.formatCurrency(marketer.totalCommission || 0)}\n`;
        message += `   📊 Status\\: ${status}\n\n`;
      });
      
      message += `*📈 OVERALL STATISTICS*\n`;
      message += `Total Sales Value\\: ${this.formatCurrency(totalSales)}\n`;
      message += `Total Commission Due\\: ${this.formatCurrency(totalCommission)}\n`;
      message += `Active Marketers\\: ${activeMarketers}\n`;
      message += `Commission Rate\\: 10\\%\n\n`;
      
      message += `*Admin Actions\\:*\n`;
      message += `• Pay commission\\: /paycommission \\<marketerId\\> \\<amount\\>\n`;
      message += `• Update marketer\\: /updatemarketer \\<marketerId\\> \\<status\\>\n`;
      message += `• View details\\: /viewmarketer \\<marketerId\\>`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('👥 Assign New', 'device_assign_marketer')],
        [Markup.button.callback('🔄 Refresh', 'device_admin_marketers')],
        [Markup.button.callback('⬅️ Back to Admin', 'device_admin')]
      ]);
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...keyboard
        });
      }
      
    } catch (error) {
      console.error('❌ Handle admin marketers performance error:', error);
      throw error;
    }
  }
}

module.exports = DeviceHandler2;