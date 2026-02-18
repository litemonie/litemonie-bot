// app/handlers/commandHandlers.js - UPDATED WITH CORRECT PARAMETERS
const { Markup } = require('telegraf');

module.exports = {
  // Handle start command - WITH ALL PARAMETERS INDEX.JS SENDS
  handleStart: async (ctx, users, initUser, isAdmin, CONFIG, isValidEmail) => {
    try {
      console.log('🔧 handleStart called');
      const userId = ctx.from.id.toString();
      
      // Initialize user
      const user = await initUser(userId);
      console.log(`✅ User initialized: ${userId}`);
      
      // Update user info
      user.firstName = ctx.from.first_name || '';
      user.lastName = ctx.from.last_name || '';
      user.username = ctx.from.username || null;
      
      // Check if admin
      const isUserAdmin = isAdmin(userId);
      user.isAdmin = isUserAdmin;
      
      // Simple welcome message
      const welcomeMessage = `🎉 *Welcome to LiteWay VTU Bot!*\n\n` +
        `👤 *Your Account:*\n` +
        `• User ID: \`${userId}\`\n` +
        `• Status: ${isUserAdmin ? '👑 ADMIN' : '👤 USER'}\n` +
        `• KYC: ${user.kycStatus.toUpperCase()}\n` +
        `• Wallet: ₦${user.wallet.toLocaleString()}\n\n` +
        `📱 *Select an option below:*`;
      
      // Simple keyboard
      const keyboard = [
        ['📞 Buy Airtime', '📡 Buy Data'],
        ['💰 Wallet Balance', '📜 Transaction History'],
        ['🛂 KYC Status', '🆘 Help & Support']
      ];
      
      // If admin, add admin panel
      if (isUserAdmin) {
        keyboard.push(['🛠️ Admin Panel']);
      }
      
      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: keyboard,
          resize_keyboard: true,
          one_time_keyboard: false
        }
      });
      
      console.log('✅ Start command completed successfully');
      
    } catch (error) {
      console.error('❌ Start error in handleStart:', error);
      console.error('Stack trace:', error.stack);
      
      // Fallback simple message
      await ctx.reply(
        `🎉 Welcome to LiteWay VTU Bot!\n\n` +
        `Use the buttons below to navigate.`,
        {
          reply_markup: {
            keyboard: [
              ['📞 Buy Airtime', '📡 Buy Data'],
              ['💰 Wallet Balance', '🆘 Help & Support']
            ],
            resize_keyboard: true
          }
        }
      );
    }
  },
  
  // Handle balance command
  handleBalance: async (ctx, users, initUser, CONFIG, isValidEmail) => {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      
      await ctx.reply(
        `💰 *YOUR WALLET BALANCE*\n\n` +
        `💵 *Available:* ₦${user.wallet.toLocaleString()}\n` +
        `🛂 *KYC Status:* ${user.kycStatus.toUpperCase()}\n\n` +
        `💡 Need more funds? Use deposit options.`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('❌ Balance command error:', error);
      ctx.reply('❌ Error checking balance. Please try again.');
    }
  },
  
  // Handle setpin command
  handleSetPin: async (ctx, users, initUser) => {
    try {
      const userId = ctx.from.id.toString();
      const args = ctx.message.text.split(' ');
      
      if (args.length !== 2) {
        return await ctx.reply('❌ Usage: /setpin [4 digits]\nExample: /setpin 1234');
      }
      
      const pin = args[1];
      
      if (!/^\d{4}$/.test(pin)) {
        return await ctx.reply('❌ PIN must be exactly 4 digits.');
      }
      
      const user = await initUser(userId);
      user.pin = pin;
      user.pinAttempts = 0;
      user.pinLocked = false;
      
      await ctx.reply('✅ PIN set successfully! Use this PIN to confirm transactions.');
      
    } catch (error) {
      console.error('❌ Setpin error:', error);
      ctx.reply('❌ Error setting PIN. Please try again.');
    }
  },
  
  // Add the missing functions that index.js is calling:
  handleReport: async (ctx, analyticsManager, isAdmin) => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only.');
        return;
      }
      
      await ctx.reply(
        `📊 Report\n\n` +
        `📅 Period: All time\n` +
        `👥 Total users: ${Object.keys(ctx.users || {}).length}\n` +
        `💰 Total transactions: ${Object.values(ctx.transactions || {}).flat().length}\n\n` +
        `Report generated: ${new Date().toLocaleString()}`
      );
      
    } catch (error) {
      console.error('❌ Report command error:', error);
      await ctx.reply('❌ Error generating report.');
    }
  },
  
  handleDevices: async (ctx, users, initUser, deviceHandler, checkKYCAndPIN) => {
    try {
      const userId = ctx.from.id.toString();
      await initUser(userId);
      
      await ctx.reply(
        `📱 Device Financing\n\n` +
        `Coming soon! This feature will be available shortly.\n\n` +
        `Check back soon or contact @opuenekeke for updates.`
      );
      
    } catch (error) {
      console.error('❌ Devices command error:', error);
      await ctx.reply('❌ Error loading device financing.');
    }
  },
  
  handleAddDevice: async (ctx, deviceHandler, isAdmin) => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only.');
        return;
      }
      
      await ctx.reply('❌ Device financing system not available.');
      
    } catch (error) {
      console.error('❌ Add device command error:', error);
      ctx.reply('❌ Error adding device.');
    }
  },
  
  handleMiniApp: async (ctx, users, initUser, deviceLockApp) => {
    try {
      const userId = ctx.from.id.toString();
      await initUser(userId);
      
      await ctx.reply(
        `📱 Device Lock App\n\n` +
        `Coming soon! This feature will be available shortly.`
      );
    } catch (error) {
      console.error('❌ Mini App command error:', error);
      ctx.reply('❌ Error loading Mini App.');
    }
  },
  
  handleStatus: async (ctx, users, initUser, deviceHandler, deviceLockApp) => {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      
      await ctx.reply(
        `📱 Device Status\n\n` +
        `You don't have any active devices.\n\n` +
        `Start by browsing available devices.`
      );
      
    } catch (error) {
      console.error('❌ Status command error:', error);
      ctx.reply('❌ Error checking device status.');
    }
  },
  
  handleUnlock: async (ctx, users, initUser, deviceHandler) => {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      
      await ctx.reply(
        `🔓 Device Unlock\n\n` +
        `You don't have any locked devices.\n\n` +
        `Devices are automatically unlocked when fully paid.`
      );
      
    } catch (error) {
      console.error('❌ Unlock command error:', error);
      ctx.reply('❌ Error loading unlock options.');
    }
  },
  
  handleDeviceFinancing: async (ctx, users, initUser, deviceHandler, checkKYCAndPIN) => {
    try {
      const userId = ctx.from.id.toString();
      await initUser(userId);
      
      await ctx.reply(
        `📱 Device Financing\n\n` +
        `Coming soon! This feature will be available shortly.\n\n` +
        `Check back soon or contact @opuenekeke for updates.`
      );
      
    } catch (error) {
      console.error('❌ Device financing error:', error);
      await ctx.reply('❌ Error loading device financing.');
    }
  },
  
  handleLiteLight: async (ctx) => {
    try {
      await ctx.reply(
        `⚡ Lite Light\n\n` +
        `Coming soon! This feature is currently under development.\n` +
        `Check back soon for updates!`
      );
    } catch (error) {
      console.error('❌ Lite light error:', error);
      ctx.reply('❌ Error loading Lite Light.');
    }
  },
  
  handleMoneyTransfer: async (ctx, users, initUser, checkKYCAndPIN, escapeMarkdownV2, formatCurrency) => {
    try {
      const userId = ctx.from.id.toString();
      await initUser(userId);
      
      await ctx.reply(
        `🏦 Send Money\n\n` +
        `💸 Choose transfer method:\n\n` +
        `🏦 BANK - Transfer to any Nigerian bank account\n` +
        `📱 LITEMONIE - Send to other bot users using phone number\n\n` +
        `Coming soon!`
      );
    } catch (error) {
      console.error('❌ Send money menu error:', error);
      ctx.reply('❌ Error loading send money options.');
    }
  },
  
  handleWalletBalance: async (ctx, users, initUser, CONFIG, isValidEmail) => {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      
      await ctx.reply(
        `💰 YOUR WALLET BALANCE\n\n` +
        `💵 Available: ₦${user.wallet.toLocaleString()}\n` +
        `🛂 KYC Status: ${user.kycStatus.toUpperCase()}\n\n` +
        `💡 Need more funds? Use deposit options.`
      );
      
    } catch (error) {
      console.error('❌ Balance error:', error);
      ctx.reply('❌ Error checking balance.');
    }
  },
  
  handleKYCStatus: async (ctx, users, initUser, escapeMarkdownV2) => {
    try {
      const userId = ctx.from.id.toString();
      const user = await initUser(userId);
      
      const kycStatus = user.kycStatus || 'pending';
      let statusEmoji = '⏳';
      if (kycStatus === 'approved') statusEmoji = '✅';
      else if (kycStatus === 'rejected') statusEmoji = '❌';
      else if (kycStatus === 'submitted') statusEmoji = '📋';
      
      await ctx.reply(
        `🛂 KYC STATUS\n\n` +
        `👤 User ID: ${userId}\n` +
        `📛 Name: ${user.firstName || ''} ${user.lastName || ''}\n` +
        `📧 Email: ${user.email || 'Not set'}\n` +
        `📱 Phone: ${user.phone || 'Not set'}\n\n` +
        `🛂 Status: ${statusEmoji} ${kycStatus.toUpperCase()}\n\n` +
        `📞 Support: @opuenekeke`
      );
      
    } catch (error) {
      console.error('❌ KYC status error:', error);
      ctx.reply('❌ Error checking KYC status.');
    }
  },
  
  handleHelpSupport: async (ctx) => {
    try {
      await ctx.reply(
        `🆘 HELP & SUPPORT\n\n` +
        `📱 Main Commands:\n` +
        `/start - Start bot\n` +
        `/setpin [1234] - Set transaction PIN\n` +
        `/balance - Check wallet balance\n\n` +
        `💡 Common Issues:\n\n` +
        `🔐 PIN Issues:\n` +
        `• Forgot PIN: Contact admin\n` +
        `• Wrong PIN: 3 attempts allowed\n` +
        `• PIN locked: Contact admin to unlock\n\n` +
        `💰 Wallet Issues:\n` +
        `• Missing deposit: Send proof to admin\n` +
        `• Wrong balance: Contact admin\n` +
        `• Can't deposit: Check KYC status\n\n` +
        `📞 Transaction Issues:\n` +
        `• Failed purchase: Check balance & network\n` +
        `• No airtime/data: Wait 5 minutes\n` +
        `• Wrong number: Double-check before confirm\n\n` +
        `⚡ Quick Contact:\n` +
        `@opuenekeke\n\n` +
        `⏰ Response Time:\n` +
        `Within 5-10 minutes`
      );
      
    } catch (error) {
      console.error('❌ Help error:', error);
      ctx.reply('❌ Error loading help.');
    }
  }
};