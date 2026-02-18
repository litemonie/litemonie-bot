// app/deviceHandler.js - COMPLETE FIXED VERSION WITH PROPER MARKDOWN ESCAPING
const path = require('path');
const fs = require('fs').promises;

class DeviceHandler {
  constructor(dataDir, users) {
    this.dataDir = dataDir;
    this.users = users || {};
    this.deviceSystem = new DeviceCreditSystem(dataDir, this.users);
  }

  // Get session from index.js
  getSession(userId) {
    try {
      const index = require('../index');
      if (!index.sessions) {
        index.sessions = {};
      }
      return index.sessions[userId] || { action: null, step: null, data: null };
    } catch (error) {
      console.error('❌ Get session error:', error);
      return { action: null, step: null, data: null };
    }
  }

  // Update session in index.js
  updateSession(userId, session) {
    try {
      const index = require('../index');
      if (!index.sessions) {
        index.sessions = {};
      }
      index.sessions[userId] = session;
      console.log(`✅ Updated session for user ${userId}:`, session);
      return true;
    } catch (error) {
      console.error('❌ Update session error:', error);
      return false;
    }
  }

  // Clear session in index.js
  clearSession(userId) {
    try {
      const index = require('../index');
      if (index.sessions && index.sessions[userId]) {
        delete index.sessions[userId];
      }
      console.log(`✅ Cleared session for user ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Clear session error:', error);
      return false;
    }
  }

  // FIXED: Safe admin check method
  isUserAdmin(userId) {
    try {
      const ADMIN_ID = '1279640125';
      return userId.toString() === ADMIN_ID;
    } catch (error) {
      console.error('Admin check error:', error);
      return false;
    }
  }

  // Helper function to save users data
  async saveUsersData() {
    try {
      const index = require('../index');
      if (index && typeof index.saveUsersData === 'function') {
        await index.saveUsersData();
        return true;
      } else if (index && index.usersFile && index.users) {
        await fs.writeFile(index.usersFile, JSON.stringify(index.users, null, 2));
        return true;
      } else {
        console.error('❌ Cannot save users data: No save method found');
        return false;
      }
    } catch (error) {
      console.error('❌ Save users data error:', error);
      return false;
    }
  }

  // Helper function to escape MarkdownV2 text
  escapeMarkdown(text) {
    if (typeof text !== 'string') return text.toString();
    
    const specialChars = '_*[]()~`>#+-=|{}.!';
    let escaped = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (specialChars.includes(char)) {
        escaped += '\\' + char;
      } else {
        escaped += char;
      }
    }
    
    return escaped;
  }

  // Smart device matching function
  async findDeviceByInput(input) {
    try {
      const searchText = input.trim().toLowerCase();
      console.log(`🔍 Smart device search for: "${searchText}"`);
      
      const allDevices = await this.deviceSystem.getAllDevices();
      
      // Multiple matching strategies
      const matches = [];
      
      for (const device of allDevices) {
        const deviceIdLower = device.id.toLowerCase();
        const makeLower = device.make.toLowerCase();
        const modelLower = device.model.toLowerCase();
        const simpleId = deviceIdLower.replace(/_/g, '');
        
        // 1. Exact ID match
        if (deviceIdLower === searchText) {
          matches.push({ device, score: 100 });
        }
        // 2. ID without underscores (tecnocamon001 -> tecno_camon_001)
        else if (simpleId === searchText) {
          matches.push({ device, score: 95 });
        }
        // 3. Partial ID match
        else if (deviceIdLower.includes(searchText) || simpleId.includes(searchText)) {
          matches.push({ device, score: 80 });
        }
        // 4. Make + Model combination
        else if (`${makeLower}_${modelLower.replace(/\s+/g, '_')}`.includes(searchText.replace(/\s+/g, '_'))) {
          matches.push({ device, score: 70 });
        }
        // 5. Make + Model without spaces/underscores
        else if (`${makeLower}${modelLower}`.replace(/\s+|_/g, '').includes(searchText.replace(/\s+/g, ''))) {
          matches.push({ device, score: 60 });
        }
        // 6. Just model match
        else if (modelLower.includes(searchText)) {
          matches.push({ device, score: 50 });
        }
        // 7. Just make match
        else if (makeLower === searchText) {
          matches.push({ device, score: 40 });
        }
      }
      
      // Sort by score and return best match
      matches.sort((a, b) => b.score - a.score);
      
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} possible matches, best score: ${matches[0].score}`);
        return matches[0].device;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Smart device search error:', error);
      return null;
    }
  }

  async handleDeviceMenu(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const { Markup } = require('telegraf');
      
      const user = this.users[userId];
      const isMarketer = user && user.isMarketer === true;
      const isAdminUser = this.isUserAdmin(userId);
      
      const keyboard = [];
      
      keyboard.push([Markup.button.callback('📱 View Available Brands', 'device_view_brands')]);
      
      if (isMarketer || isAdminUser) {
        keyboard.push([Markup.button.callback('💰 My Device Sales', 'device_my_sales')]);
      }
      
      keyboard.push([Markup.button.callback('🛒 Buy Device on Credit', 'device_buy')]);
      keyboard.push([Markup.button.callback('💳 Make Device Payment', 'device_payment')]);
      keyboard.push([Markup.button.callback('📊 My Device History', 'device_my_history')]);
      
      if (isAdminUser) {
        keyboard.push([Markup.button.callback('⚙️ Device Admin', 'device_admin')]);
        keyboard.push([Markup.button.callback('👥 Manage Marketers', 'device_manage_marketers')]);
      }
      
      keyboard.push([Markup.button.callback('⬅️ Back to Main Menu', 'start')]);
      
      await ctx.reply(
        '📱 *DEVICE CREDIT SYSTEM*\n\n' +
        'Buy smartphones on credit and pay small small\\!\n\n' +
        '*Features\\:*\n' +
        '• 🛒 Buy devices on credit\n' +
        '• 💳 Pay daily/weekly/monthly\n' +
        '• ⏰ 2\\-6 months payment plans\n' +
        '• 📈 30% profit margin\n' +
        '• 👥 10% marketer commission\n' +
        '• 🔒 Automatic device locking\n\n' +
        '*Your Status\\:*\n' +
        (isMarketer ? '• 🎯 You are a Marketer \\(10% commission\\)\n' : '') +
        (isAdminUser ? '• 👑 You are an Admin\n' : '') +
        '\nSelect an option below:',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        }
      );
    } catch (error) {
      console.error('❌ Device menu error:', error);
      await ctx.reply('❌ Error loading device menu\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  async handleTextMessage(ctx, text, userSession) {
    try {
      const userId = ctx.from.id.toString();
      console.log(`📱 DeviceHandler: Processing text "${text}" for user ${userId}`);
      
      const currentSession = this.getSession(userId);
      console.log(`📱 Current session:`, currentSession);
      
      // Check active sessions first
      if (currentSession && currentSession.action === 'device_buy') {
        console.log(`✅ Handling device_buy session for user ${userId}, step: ${currentSession.step}`);
        return await this.handleDeviceBuyText(ctx, text, currentSession);
      }
      
      if (currentSession && currentSession.action === 'device_payment') {
        console.log(`✅ Handling device_payment session for user ${userId}, step: ${currentSession.step}`);
        return await this.handleDevicePaymentText(ctx, text, currentSession);
      }
      
      if (currentSession && currentSession.action === 'assign_marketer') {
        console.log(`✅ Handling assign_marketer session for user ${userId}, step: ${currentSession.step}`);
        return await this.handleAssignMarketerText(ctx, text, currentSession);
      }
      
      if (currentSession && currentSession.action === 'device_admin_add') {
        console.log(`✅ Handling device_admin_add session for user ${userId}, step: ${currentSession.step}`);
        return await this.handleDeviceAdminAddText(ctx, text, currentSession);
      }
      
      // Check for Telegram ID for marketer assignment
      const isNumericId = /^\d+$/.test(text.trim()) && text.trim().length >= 8;
      if (isNumericId && currentSession.action === 'assign_marketer') {
        console.log(`📝 Text "${text}" is numeric ID for marketer assignment`);
        return await this.handleAssignMarketerText(ctx, text, currentSession);
      }
      
      // Try to find device by any identifier
      const device = await this.findDeviceByInput(text);
      
      if (device) {
        console.log(`✅ Found device: ${device.make} ${device.model} (ID: ${device.id})`);
        
        // Create new device session
        const newSession = {
          action: 'device_buy',
          step: 1,
          data: {}
        };
        
        this.updateSession(userId, newSession);
        console.log(`✅ Created device_buy session for user ${userId}`);
        
        // Now handle the device ID with the new session
        return await this.handleDeviceBuyText(ctx, device.id, newSession);
      }
      
      console.log(`⚠️  No session or text not recognized`);
      return false;
      
    } catch (error) {
      console.error('❌ Device text handler error:', error);
      return false;
    }
  }

  async handleDeviceBuyText(ctx, text, session) {
    try {
      const userId = ctx.from.id.toString();
      console.log(`🛒 handleDeviceBuyText: step ${session.step}, text: "${text}"`);
      
      if (session.step === 1) {
        // Use smart device matching
        const device = await this.findDeviceByInput(text);
        
        if (!device) {
          // Get available devices to show suggestions
          const availableDevices = await this.deviceSystem.getAvailableDevices();
          const { Markup } = require('telegraf');
          
          let message = '❌ *Device not found*\n\n';
          message += '*Try these device IDs:*\n\n';
          
          availableDevices.slice(0, 5).forEach((device, index) => {
            const simpleId = device.id.replace(/_/g, '');
            message += `*${index + 1}\\. ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}*\n`;
            message += `   Price\\: ₦${device.sellingPrice.toLocaleString()}\n`;
            message += `   ID\\: ${this.escapeMarkdown(simpleId)}\n\n`;
          });
          
          message += '*Accepted formats:*\n';
          message += '• Simple ID\\: `tecnocamon001`\n';
          message += '• Full ID\\: `tecno\\_camon\\_001`\n';
          message += '• Make \\+ Model\\: `tecno camon 19`\n\n';
          message += 'Enter Device ID again\\:';
          
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 View All Devices', 'device_view_brands')],
              [Markup.button.callback('❌ Cancel', 'device_back')]
            ])
          });
          return true;
        }
        
        if (device.status !== 'available' || device.quantity <= 0) {
          await ctx.reply(`❌ Device ${this.escapeMarkdown(device.id)} is not available\\. Please select another device\\:`, { parse_mode: 'MarkdownV2' });
          return true;
        }
        
        // Store selected device
        session.data = {
          deviceId: device.id,
          deviceMake: device.make,
          deviceModel: device.model,
          devicePrice: device.sellingPrice,
          deviceCost: device.costPrice
        };
        session.step = 2;
        
        // Update session
        this.updateSession(userId, session);
        
        // Ask for payment plan
        const { Markup } = require('telegraf');
        await ctx.reply(
          `✅ *Device Verified\\:* ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}\n` +
          `💰 *Price\\:* ₦${device.sellingPrice.toLocaleString()}\n` +
          `📦 *Stock\\:* ${device.quantity} available\n\n` +
          '*Select payment plan\\:*\n\n' +
          '• *Daily\\:* 60 days\n' +
          '• *Weekly\\:* 12 weeks\n' +
          '• *Monthly\\:* 6 months\n\n' +
          '*Enter payment plan \\(daily/weekly/monthly\\)\\:*',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📅 Daily \\(60 days\\)', 'device_plan_daily')],
              [Markup.button.callback('📅 Weekly \\(12 weeks\\)', 'device_plan_weekly')],
              [Markup.button.callback('📅 Monthly \\(6 months\\)', 'device_plan_monthly')],
              [Markup.button.callback('⬅️ Back', 'device_back')]
            ])
          }
        );
        return true;
      }
      
      if (session.step === 2) {
        const plan = text.toLowerCase().trim();
        const validPlans = ['daily', 'weekly', 'monthly'];
        
        if (!validPlans.includes(plan)) {
          await ctx.reply('❌ Invalid plan\\. Please enter daily, weekly, or monthly\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        
        const devicePrice = session.data.devicePrice;
        let duration, paymentFrequency, totalPayments;
        
        switch (plan) {
          case 'daily':
            duration = 60;
            paymentFrequency = 'daily';
            totalPayments = 60;
            break;
          case 'weekly':
            duration = 12;
            paymentFrequency = 'weekly';
            totalPayments = 12;
            break;
          case 'monthly':
            duration = 6;
            paymentFrequency = 'monthly';
            totalPayments = 6;
            break;
        }
        
        const dailyPayment = devicePrice / totalPayments;
        
        // Store payment plan
        session.data = {
          ...session.data,
          paymentPlan: plan,
          duration: duration,
          paymentFrequency: paymentFrequency,
          totalPayments: totalPayments,
          dailyPayment: dailyPayment,
          remainingPayments: totalPayments,
          amountPaid: 0,
          amountDue: devicePrice
        };
        session.step = 3;
        
        this.updateSession(userId, session);
        
        const { Markup } = require('telegraf');
        await ctx.reply(
          `📋 *PURCHASE SUMMARY*\n\n` +
          `📱 *Device\\:* ${this.escapeMarkdown(session.data.deviceMake)} ${this.escapeMarkdown(session.data.deviceModel)}\n` +
          `💰 *Total Price\\:* ₦${devicePrice.toLocaleString()}\n` +
          `📅 *Payment Plan\\:* ${this.escapeMarkdown(plan.toUpperCase())}\n` +
          `⏰ *Duration\\:* ${duration} ${this.escapeMarkdown(plan)}s\n` +
          `💵 *${this.escapeMarkdown(plan.charAt(0).toUpperCase() + plan.slice(1))} Payment\\:* ₦${Math.ceil(dailyPayment).toLocaleString()}\n` +
          `📊 *Total Payments\\:* ${totalPayments}\n\n` +
          `*Note\\:*\n` +
          `• Device will be locked until fully paid\n` +
          `• Missed payments may lead to device lock\n` +
          `• 30% profit margin included\n\n` +
          `Do you want to proceed with this purchase\\?\n\n` +
          `Reply with YES to confirm or NO to cancel\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Purchase', `device_confirm_${session.data.deviceId}_${plan}`)],
              [Markup.button.callback('❌ Cancel', 'device_back')]
            ])
          }
        );
        return true;
      }
      
      if (session.step === 3) {
        const confirmation = text.toLowerCase().trim();
        
        if (confirmation === 'yes') {
          const result = await this.deviceSystem.processDevicePurchase(
            userId,
            session.data.deviceId,
            session.data
          );
          
          if (result.success) {
            await ctx.reply(
              `✅ *DEVICE PURCHASE SUCCESSFULLY COMPLETED\\!*\n\n` +
              `📱 *Device\\:* ${this.escapeMarkdown(session.data.deviceMake)} ${this.escapeMarkdown(session.data.deviceModel)}\n` +
              `💰 *Total Price\\:* ₦${session.data.devicePrice.toLocaleString()}\n` +
              `📅 *Payment Plan\\:* ${this.escapeMarkdown(session.data.paymentPlan.toUpperCase())}\n` +
              `💵 *Payment Amount\\:* ₦${Math.ceil(session.data.dailyPayment).toLocaleString()} ${this.escapeMarkdown(session.data.paymentFrequency)}\n` +
              `📊 *Total Payments\\:* ${session.data.totalPayments}\n\n` +
              `*Next Steps\\:*\n` +
              `1\\. Device will be delivered within 24 hours\n` +
              `2\\. Make payments using "💳 Make Device Payment"\n` +
              `3\\. Device unlocks after full payment\n` +
              `4\\. Contact support for any issues\n\n` +
              `Thank you for your purchase\\! 🎉`,
              { parse_mode: 'MarkdownV2' }
            );
            
            this.clearSession(userId);
            
          } else {
            await ctx.reply(`❌ Purchase failed\\: ${this.escapeMarkdown(result.message)}`, { parse_mode: 'MarkdownV2' });
          }
        } else if (confirmation === 'no') {
          await ctx.reply('❌ Purchase cancelled\\.', { parse_mode: 'MarkdownV2' });
          this.clearSession(userId);
        } else {
          await ctx.reply('❌ Please reply with YES or NO\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Device buy text error:', error);
      await ctx.reply('❌ Error processing device purchase\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      this.clearSession(userId);
      return true;
    }
  }

  async handleAssignMarketerText(ctx, text, session) {
    try {
      const userId = ctx.from.id.toString();
      
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        this.clearSession(userId);
        return true;
      }
      
      console.log(`👥 Assign marketer: step ${session.step}, text: "${text}", session data:`, session.data);
      
      if (session.step === 1) {
        const marketerId = text.trim();
        
        if (!this.users[marketerId]) {
          await ctx.reply('❌ User not found\\. Please enter a valid Telegram ID\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        
        session.data = {
          marketerId: marketerId,
          marketerName: `${this.users[marketerId].firstName || ''} ${this.users[marketerId].lastName || ''}`.trim()
        };
        session.step = 2;
        
        this.updateSession(userId, session);
        
        await ctx.reply(
          `📝 *Marketer Found\\:*\n\n` +
          `👤 *Name\\:* ${this.escapeMarkdown(session.data.marketerName)}\n` +
          `🆔 *Telegram ID\\:* ${marketerId}\n\n` +
          `Do you want to assign this user as a marketer\\?\n\n` +
          `Reply with YES to confirm or NO to cancel\\:`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      if (session.step === 2) {
        const confirmation = text.toLowerCase().trim();
        
        if (confirmation === 'yes') {
          this.users[session.data.marketerId].isMarketer = true;
          
          const saved = await this.saveUsersData();
          
          if (saved) {
            await ctx.reply(
              `✅ *MARKETER ASSIGNED SUCCESSFULLY\\!*\n\n` +
              `👤 *Name\\:* ${this.escapeMarkdown(session.data.marketerName)}\n` +
              `🆔 *Telegram ID\\:* ${session.data.marketerId}\n` +
              `💼 *Commission Rate\\:* 10%\n\n` +
              `The user can now access marketer features\\!`,
              { parse_mode: 'MarkdownV2' }
            );
          } else {
            await ctx.reply('❌ Error saving marketer data\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
          }
          
          this.clearSession(userId);
          
        } else if (confirmation === 'no') {
          await ctx.reply('❌ Marketer assignment cancelled\\.', { parse_mode: 'MarkdownV2' });
          this.clearSession(userId);
        } else {
          await ctx.reply('❌ Please reply with YES or NO\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Assign marketer text error:', error);
      await ctx.reply('❌ Error processing marketer assignment\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      this.clearSession(userId);
      return true;
    }
  }

  async handleDeviceAdminAddText(ctx, text, session) {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = this.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
        return true;
      }
      
      if (session.step === 1) {
        session.data = {
          ...session.data,
          make: text.trim()
        };
        session.step = 2;
        
        this.updateSession(userId, session);
        
        await ctx.reply('📝 Enter device model \\(e\\.g\\. "S22", "iPhone 13"\\)\\:', { parse_mode: 'MarkdownV2' });
        return true;
      }
      
      if (session.step === 2) {
        session.data = {
          ...session.data,
          model: text.trim()
        };
        session.step = 3;
        
        this.updateSession(userId, session);
        
        await ctx.reply('💰 Enter cost price \\(amount you paid for the device\\)\\:', { parse_mode: 'MarkdownV2' });
        return true;
      }
      
      if (session.step === 3) {
        const costPrice = parseFloat(text.trim());
        if (isNaN(costPrice) || costPrice <= 0) {
          await ctx.reply('❌ Invalid cost price\\. Please enter a valid number\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        
        session.data = {
          ...session.data,
          costPrice: costPrice,
          sellingPrice: Math.round(costPrice * 1.3)
        };
        session.step = 4;
        
        this.updateSession(userId, session);
        
        await ctx.reply(
          `✅ Cost price\\: ₦${costPrice.toLocaleString()}\n` +
          `💰 Selling price \\(with 30% profit\\)\\: ₦${session.data.sellingPrice.toLocaleString()}\n\n` +
          `Enter quantity to add\\:`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      if (session.step === 4) {
        const quantity = parseInt(text.trim());
        if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
          await ctx.reply('❌ Invalid quantity\\. Please enter a number between 1 and 100\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        
        session.data = {
          ...session.data,
          quantity: quantity,
          addedBy: userId
        };
        session.step = 5;
        
        this.updateSession(userId, session);
        
        const { Markup } = require('telegraf');
        await ctx.reply(
          `📋 *DEVICE ADD SUMMARY*\n\n` +
          `📱 *Make\\:* ${this.escapeMarkdown(session.data.make)}\n` +
          `📱 *Model\\:* ${this.escapeMarkdown(session.data.model)}\n` +
          `💰 *Cost Price\\:* ₦${session.data.costPrice.toLocaleString()}\n` +
          `💰 *Selling Price\\:* ₦${session.data.sellingPrice.toLocaleString()}\n` +
          `📦 *Quantity\\:* ${quantity}\n` +
          `📈 *Profit Per Unit\\:* ₦${(session.data.sellingPrice - session.data.costPrice).toLocaleString()}\n` +
          `💰 *Total Profit\\:* ₦${((session.data.sellingPrice - session.data.costPrice) * quantity).toLocaleString()}\n\n` +
          `Add this device\\?\n\n` +
          `Reply with YES to confirm or NO to cancel\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Add', `device_admin_confirm_add`)],
              [Markup.button.callback('❌ Cancel', 'device_admin')]
            ])
          }
        );
        return true;
      }
      
      if (session.step === 5) {
        const confirmation = text.toLowerCase().trim();
        
        if (confirmation === 'yes') {
          const result = await this.deviceSystem.addDevice(session.data);
          
          if (result.success) {
            await ctx.reply(
              `✅ *DEVICE ADDED SUCCESSFULLY\\!*\n\n` +
              `📱 *${this.escapeMarkdown(session.data.make)} ${this.escapeMarkdown(session.data.model)}*\n` +
              `📦 *Quantity\\:* ${session.data.quantity}\n` +
              `💰 *Selling Price\\:* ₦${session.data.sellingPrice.toLocaleString()}\n` +
              `📈 *Profit Per Unit\\:* ₦${(session.data.sellingPrice - session.data.costPrice).toLocaleString()}\n\n` +
              `Devices are now available for purchase\\!`,
              { parse_mode: 'MarkdownV2' }
            );
            
            this.clearSession(userId);
          } else {
            await ctx.reply(`❌ Failed to add device\\: ${this.escapeMarkdown(result.message)}`, { parse_mode: 'MarkdownV2' });
          }
        } else if (confirmation === 'no') {
          await ctx.reply('❌ Device addition cancelled\\.', { parse_mode: 'MarkdownV2' });
          this.clearSession(userId);
        } else {
          await ctx.reply('❌ Please reply with YES or NO\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Device admin add text error:', error);
      await ctx.reply('❌ Error adding device\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      this.clearSession(userId);
      return true;
    }
  }

  async handleDevicePaymentText(ctx, text, session) {
    try {
      const userId = ctx.from.id.toString();
      
      if (session.step === 1) {
        const deviceId = text.trim();
        const userDevices = await this.deviceSystem.getUserDevices(userId);
        
        const device = userDevices.find(d => 
          (d.deviceId === deviceId || 
           d.deviceId.replace(/_/g, '') === deviceId.replace(/_/g, '')) && 
          !d.completed
        );
        
        if (!device) {
          await ctx.reply('❌ Invalid device or device already paid off\\. Please enter a valid device ID\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        
        session.data = {
          ...session.data,
          deviceId: device.deviceId,
          deviceMake: device.make,
          deviceModel: device.model,
          amountDue: device.amountDue,
          nextPayment: device.nextPaymentAmount
        };
        session.step = 2;
        
        this.updateSession(userId, session);
        
        await ctx.reply(
          `📱 *Device\\:* ${this.escapeMarkdown(device.make)} ${this.escapeMarkdown(device.model)}\n` +
          `💰 *Amount Due\\:* ₦${device.amountDue.toLocaleString()}\n` +
          `💵 *Next Payment\\:* ₦${device.nextPaymentAmount.toLocaleString()}\n\n` +
          `Enter payment amount \\(or type "full" to pay full amount\\)\\:`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      if (session.step === 2) {
        const amountText = text.toLowerCase().trim();
        let amount;
        
        if (amountText === 'full') {
          amount = session.data.amountDue;
        } else {
          amount = parseFloat(amountText.replace(/[^0-9.]/g, ''));
          if (isNaN(amount) || amount <= 0) {
            await ctx.reply('❌ Invalid amount\\. Please enter a valid number or "full"\\:', { parse_mode: 'MarkdownV2' });
            return true;
          }
          
          if (amount > session.data.amountDue) {
            await ctx.reply(`❌ Amount exceeds balance due \\(₦${session.data.amountDue.toLocaleString()}\\)\\. Please enter a smaller amount\\:`, { parse_mode: 'MarkdownV2' });
            return true;
          }
        }
        
        session.data = {
          ...session.data,
          paymentAmount: amount
        };
        session.step = 3;
        
        this.updateSession(userId, session);
        
        const { Markup } = require('telegraf');
        await ctx.reply(
          `📋 *PAYMENT CONFIRMATION*\n\n` +
          `📱 *Device\\:* ${this.escapeMarkdown(session.data.deviceMake)} ${this.escapeMarkdown(session.data.deviceModel)}\n` +
          `💰 *Payment Amount\\:* ₦${amount.toLocaleString()}\n` +
          `💵 *Remaining Balance\\:* ₦${(session.data.amountDue - amount).toLocaleString()}\n\n` +
          `Confirm this payment\\?\n\n` +
          `Reply with YES to confirm or NO to cancel\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Confirm Payment', `device_pay_${session.data.deviceId}_${amount}`)],
              [Markup.button.callback('❌ Cancel', 'device_back')]
            ])
          }
        );
        return true;
      }
      
      if (session.step === 3) {
        const confirmation = text.toLowerCase().trim();
        
        if (confirmation === 'yes') {
          const result = await this.deviceSystem.processDevicePayment(
            userId,
            session.data.deviceId,
            session.data.paymentAmount
          );
          
          if (result.success) {
            const newBalance = session.data.amountDue - session.data.paymentAmount;
            
            await ctx.reply(
              `✅ *PAYMENT SUCCESSFUL\\!*\n\n` +
              `📱 *Device\\:* ${this.escapeMarkdown(session.data.deviceMake)} ${this.escapeMarkdown(session.data.deviceModel)}\n` +
              `💰 *Amount Paid\\:* ₦${session.data.paymentAmount.toLocaleString()}\n` +
              `💵 *New Balance\\:* ₦${newBalance.toLocaleString()}\n` +
              `📊 *Payments Made\\:* ${result.paymentsMade}\n` +
              `📅 *Next Payment Due\\:* ${result.nextPaymentDate ? this.escapeMarkdown(new Date(result.nextPaymentDate).toLocaleDateString()) : 'N/A'}\n\n` +
              (newBalance <= 0 ? `🎉 *Device fully paid\\! Unlocking device\\.\\.\\.*\n` : '') +
              `Thank you for your payment\\! 💰`,
              { parse_mode: 'MarkdownV2' }
            );
            
            this.clearSession(userId);
          } else {
            await ctx.reply(`❌ Payment failed\\: ${this.escapeMarkdown(result.message)}`, { parse_mode: 'MarkdownV2' });
          }
        } else if (confirmation === 'no') {
          await ctx.reply('❌ Payment cancelled\\.', { parse_mode: 'MarkdownV2' });
          this.clearSession(userId);
        } else {
          await ctx.reply('❌ Please reply with YES or NO\\:', { parse_mode: 'MarkdownV2' });
          return true;
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Device payment text error:', error);
      await ctx.reply('❌ Error processing payment\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      this.clearSession(userId);
      return true;
    }
  }

  async handleBackButton(ctx) {
    return this.handleDeviceMenu(ctx);
  }

  getCallbacks(bot, users) {
    const callbacks = {};
    const self = this;
    
    if (users) {
      self.users = users;
    }
    
    if (!self.users) {
      self.users = {};
      console.warn('⚠️  DeviceHandler: users object was undefined, initialized as empty object');
    }
    
    async function checkKYCAndPIN(userId, ctx) {
      try {
        if (!self.users || typeof self.users !== 'object') {
          console.error('❌ KYC CHECK: users object is invalid:', self.users);
          await ctx.reply('❌ System error\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
          return false;
        }
        
        const user = self.users[userId];
        if (!user) {
          await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
          return false;
        }
        
        const kycStatus = user.kycStatus || 'pending';
        
        if (kycStatus !== 'approved') {
          await ctx.reply(
            '❌ *KYC VERIFICATION REQUIRED*\n\n' +
            '📝 Your account needs verification\\.\n\n' +
            `🛂 *KYC Status\\:* ${self.escapeMarkdown(kycStatus.toUpperCase())}\n` +
            '📞 *Contact admin\\:* @opuenekeke',
            { parse_mode: 'MarkdownV2' }
          );
          return false;
        }
        
        if (!user.pin) {
          await ctx.reply(
            '❌ *TRANSACTION PIN NOT SET*\n\n' +
            '🔐 *Set PIN\\:* `/setpin 1234`',
            { parse_mode: 'MarkdownV2' }
          );
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('❌ KYC check error:', error);
        await ctx.reply('❌ Error checking account status\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
        return false;
      }
    }
    
    // View available brands
    callbacks['device_view_brands'] = async (ctx) => {
      try {
        const devices = await self.deviceSystem.getAvailableDevices();
        const { Markup } = require('telegraf');
        
        if (devices.length === 0) {
          await ctx.editMessageText(
            '📱 *AVAILABLE BRANDS*\n\n' +
            '❌ No devices available at the moment\\.\n\n' +
            'Check back later or contact admin to add devices\\.',
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh', 'device_view_brands')],
                [Markup.button.callback('⬅️ Back', 'device_back')]
              ])
            }
          );
          return;
        }
        
        const brands = {};
        devices.forEach(device => {
          if (!brands[device.make]) {
            brands[device.make] = [];
          }
          brands[device.make].push(device);
        });
        
        let message = '📱 *AVAILABLE BRANDS*\n\n';
        const keyboard = [];
        
        Object.keys(brands).sort().forEach((brand, index) => {
          const brandDevices = brands[brand];
          const totalStock = brandDevices.reduce((sum, device) => sum + device.quantity, 0);
          const modelsCount = brandDevices.length;
          
          // FIXED: Single backslash for the plus sign
          message += `*${index + 1}\\. ${self.escapeMarkdown(brand)}*\n`;
          message += `   📦 Total Stock\\: ${totalStock}\n`;
          message += `   📋 Models Available\\: ${modelsCount}\n\n`;
          
          keyboard.push([Markup.button.callback(
            `📱 ${brand} \\(${totalStock} available\\)`,
            `device_brand_${brand}`
          )]);
        });
        
        keyboard.push([Markup.button.callback('🔄 Refresh', 'device_view_brands')]);
        keyboard.push([Markup.button.callback('⬅️ Back', 'device_back')]);
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard(keyboard)
          }
        );
        
      } catch (error) {
        console.error('❌ View brands error:', error);
        ctx.answerCbQuery('❌ Error loading brands');
      }
    };
    
    // View devices by brand
    callbacks['device_brand_(.+)'] = async (ctx) => {
      try {
        const brand = ctx.match[1];
        const devices = await self.deviceSystem.getAvailableDevices();
        const brandDevices = devices.filter(device => device.make === brand);
        
        if (brandDevices.length === 0) {
          await ctx.answerCbQuery(`❌ No ${brand} devices available`);
          return;
        }
        
        const { Markup } = require('telegraf');
        let message = `📱 *${self.escapeMarkdown(brand.toUpperCase())} DEVICES*\n\n`;
        const keyboard = [];
        
        brandDevices.forEach((device, index) => {
          const profit = device.sellingPrice - device.costPrice;
          const profitPercentage = ((profit / device.costPrice) * 100).toFixed(1);
          
          // FIXED: Single backslash for the plus sign
          message += `*${index + 1}\\. ${self.escapeMarkdown(device.model)}*\n`;
          message += `   📦 Stock\\: ${device.quantity}\n`;
          message += `   💰 Price\\: ₦${device.sellingPrice.toLocaleString()}\n`;
          message += `   📈 Profit\\: ₦${profit.toLocaleString()} \\(${self.escapeMarkdown(profitPercentage)}%\\)\n`;
          message += `   🔑 ID\\: ${self.escapeMarkdown(device.id)}\n\n`;
          
          keyboard.push([Markup.button.callback(
            `📱 ${device.model} \\- ₦${device.sellingPrice.toLocaleString()}`,
            `device_select_${device.id}`
          )]);
        });
        
        keyboard.push([Markup.button.callback('⬅️ Back to Brands', 'device_view_brands')]);
        keyboard.push([Markup.button.callback('⬅️ Back to Menu', 'device_back')]);
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard(keyboard)
          }
        );
        
      } catch (error) {
        console.error('❌ View brand devices error:', error);
        ctx.answerCbQuery('❌ Error loading devices');
      }
    };
    
    // Select device for purchase
    callbacks['device_select_(.+)'] = async (ctx) => {
      try {
        const deviceId = ctx.match[1];
        const userId = ctx.from.id.toString();
        
        const session = {
          action: 'device_buy',
          step: 1,
          data: {}
        };
        
        self.updateSession(userId, session);
        
        console.log(`✅ Created device_buy session for user ${userId}, device: ${deviceId}`);
        
        const device = await self.deviceSystem.getDeviceById(deviceId);
        
        if (!device) {
          await ctx.answerCbQuery('❌ Device not found');
          return;
        }
        
        if (device.status !== 'available') {
          await ctx.answerCbQuery('❌ Device not available');
          return;
        }
        
        const { Markup } = require('telegraf');
        
        const simplifiedId = device.id.replace(/_/g, '');
        
        await ctx.editMessageText(
          `📱 *SELECTED DEVICE*\n\n` +
          `*Make\\:* ${self.escapeMarkdown(device.make)}\n` +
          `*Model\\:* ${self.escapeMarkdown(device.model)}\n` +
          `*Price\\:* ₦${device.sellingPrice.toLocaleString()}\n` +
          `*Stock\\:* ${device.quantity}\n\n` +
          `*Accepted Device IDs\\:*\n` +
          `• ${self.escapeMarkdown(simplifiedId)}\n` +
          `• ${self.escapeMarkdown(device.id)}\n\n` +
          `*Enter Device ID to proceed\\:*`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⬅️ Back to Devices', `device_brand_${device.make}`)],
              [Markup.button.callback('❌ Cancel', 'device_back')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Select device error:', error);
        ctx.answerCbQuery('❌ Error selecting device');
      }
    };
    
    // Plan selection callbacks
    callbacks['device_plan_daily'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const session = self.getSession(userId);
        
        if (session && session.action === 'device_buy') {
          session.step = 2;
          self.updateSession(userId, session);
          await ctx.answerCbQuery('📅 Daily plan selected');
          
          const fakeCtx = {
            from: ctx.from,
            reply: async (text, options) => {
              await ctx.reply(text, options);
            }
          };
          
          await self.handleDeviceBuyText(fakeCtx, 'daily', session);
        } else {
          await ctx.answerCbQuery('❌ No active device purchase session');
        }
      } catch (error) {
        console.error('❌ Device plan daily error:', error);
        ctx.answerCbQuery('❌ Error selecting plan');
      }
    };
    
    callbacks['device_plan_weekly'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const session = self.getSession(userId);
        
        if (session && session.action === 'device_buy') {
          session.step = 2;
          self.updateSession(userId, session);
          await ctx.answerCbQuery('📅 Weekly plan selected');
          
          const fakeCtx = {
            from: ctx.from,
            reply: async (text, options) => {
              await ctx.reply(text, options);
            }
          };
          
          await self.handleDeviceBuyText(fakeCtx, 'weekly', session);
        } else {
          await ctx.answerCbQuery('❌ No active device purchase session');
        }
      } catch (error) {
        console.error('❌ Device plan weekly error:', error);
        ctx.answerCbQuery('❌ Error selecting plan');
      }
    };
    
    callbacks['device_plan_monthly'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const session = self.getSession(userId);
        
        if (session && session.action === 'device_buy') {
          session.step = 2;
          self.updateSession(userId, session);
          await ctx.answerCbQuery('📅 Monthly plan selected');
          
          const fakeCtx = {
            from: ctx.from,
            reply: async (text, options) => {
              await ctx.reply(text, options);
            }
          };
          
          await self.handleDeviceBuyText(fakeCtx, 'monthly', session);
        } else {
          await ctx.answerCbQuery('❌ No active device purchase session');
        }
      } catch (error) {
        console.error('❌ Device plan monthly error:', error);
        ctx.answerCbQuery('❌ Error selecting plan');
      }
    };
    
    // Confirm purchase callback
    callbacks['device_confirm_(.+)_(.+)'] = async (ctx) => {
      try {
        const deviceId = ctx.match[1];
        const plan = ctx.match[2];
        const userId = ctx.from.id.toString();
        
        const session = self.getSession(userId);
        if (!session || session.action !== 'device_buy') {
          await ctx.answerCbQuery('❌ No active purchase session');
          return;
        }
        
        session.step = 3;
        self.updateSession(userId, session);
        
        const fakeCtx = {
          from: ctx.from,
          reply: async (text, options) => {
            await ctx.reply(text, options);
          }
        };
        
        await self.handleDeviceBuyText(fakeCtx, 'yes', session);
        
      } catch (error) {
        console.error('❌ Confirm purchase error:', error);
        ctx.answerCbQuery('❌ Error confirming purchase');
      }
    };
    
    // Start device purchase flow - FIXED MARKDOWN ESCAPING
    callbacks['device_buy'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        
        if (!await checkKYCAndPIN(userId, ctx)) {
          return;
        }
        
        const session = {
          action: 'device_buy',
          step: 1,
          data: {}
        };
        
        self.updateSession(userId, session);
        
        console.log(`✅ Started device purchase flow for user ${userId}`);
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(
          '🛒 *BUY DEVICE ON CREDIT*\n\n' +
          'You can enter a Device ID in multiple formats\\:\n\n' +
          '*Example for Tecno Camon 19\\:*\n' +
          '• Simple ID\\: `tecnocamon001`\n' +
          '• Full ID\\: `tecno\\_camon\\_001`\n' +
          '• Make \\+ Model\\: `tecno camon`\n' +
          '• Just Model\\: `camon 19`\n\n' +
          '*Enter Device ID or view available brands\\:*',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📱 View Available Brands', 'device_view_brands')],
              [Markup.button.callback('⬅️ Back', 'device_back')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Device buy error:', error);
        ctx.answerCbQuery('❌ Error starting purchase');
      }
    };
    
    // Make device payment
    callbacks['device_payment'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        
        if (!await checkKYCAndPIN(userId, ctx)) {
          return;
        }
        
        const userDevices = await self.deviceSystem.getUserDevices(userId);
        const activeDevices = userDevices.filter(d => !d.completed);
        
        if (activeDevices.length === 0) {
          const { Markup } = require('telegraf');
          await ctx.editMessageText(
            '💳 *MAKE DEVICE PAYMENT*\n\n' +
            '❌ You don\\\'t have any active device payments\\.\n\n' +
            'Buy a device first to make payments\\.',
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🛒 Buy Device', 'device_buy')],
                [Markup.button.callback('⬅️ Back', 'device_back')]
              ])
            }
          );
          return;
        }
        
        const session = {
          action: 'device_payment',
          step: 1,
          data: {}
        };
        
        self.updateSession(userId, session);
        
        const { Markup } = require('telegraf');
        let message = '💳 *MAKE DEVICE PAYMENT*\n\n';
        message += 'Select a device to make payment\\:\n\n';
        
        const keyboard = [];
        
        activeDevices.forEach((device, index) => {
          // FIXED: Single backslash for the plus sign
          message += `*${index + 1}\\. ${self.escapeMarkdown(device.make)} ${self.escapeMarkdown(device.model)}*\n`;
          message += `   💰 Balance\\: ₦${device.amountDue.toLocaleString()}\n`;
          message += `   💵 Next Payment\\: ₦${device.nextPaymentAmount.toLocaleString()}\n`;
          message += `   🔑 ID\\: ${self.escapeMarkdown(device.deviceId)}\n`;
          message += `   🔑 Simple ID\\: ${self.escapeMarkdown(device.deviceId.replace(/_/g, ''))}\n\n`;
          
          keyboard.push([Markup.button.callback(
            `📱 ${device.make} ${device.model} \\- ₦${device.amountDue.toLocaleString()}`,
            `device_pay_select_${device.deviceId}`
          )]);
        });
        
        keyboard.push([Markup.button.callback('⬅️ Back', 'device_back')]);
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard(keyboard)
          }
        );
        
      } catch (error) {
        console.error('❌ Device payment error:', error);
        ctx.answerCbQuery('❌ Error starting payment');
      }
    };
    
    // Select device for payment
    callbacks['device_pay_select_(.+)'] = async (ctx) => {
      try {
        const deviceId = ctx.match[1];
        const userId = ctx.from.id.toString();
        
        const session = {
          action: 'device_payment',
          step: 1,
          data: {}
        };
        
        self.updateSession(userId, session);
        
        const userDevices = await self.deviceSystem.getUserDevices(userId);
        const device = userDevices.find(d => d.deviceId === deviceId && !d.completed);
        
        if (!device) {
          await ctx.answerCbQuery('❌ Device not found or already paid');
          return;
        }
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(
          `💳 *MAKE PAYMENT*\n\n` +
          `*Device\\:* ${self.escapeMarkdown(device.make)} ${self.escapeMarkdown(device.model)}\n` +
          `*Balance Due\\:* ₦${device.amountDue.toLocaleString()}\n` +
          `*Next Payment\\:* ₦${device.nextPaymentAmount.toLocaleString()}\n` +
          `*Payments Made\\:* ${device.paymentsMade}/${device.totalPayments}\n\n` +
          `To proceed, please enter the Device ID\\:\n\n` +
          `Enter\\: *${self.escapeMarkdown(device.deviceId.replace(/_/g, ''))}*  \\(or *${self.escapeMarkdown(device.deviceId)}*\\)`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⬅️ Back to Payments', 'device_payment')],
              [Markup.button.callback('❌ Cancel', 'device_back')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Select payment device error:', error);
        ctx.answerCbQuery('❌ Error selecting device');
      }
    };
    
    // Confirm payment callback
    callbacks['device_pay_(.+)_(.+)'] = async (ctx) => {
      try {
        const deviceId = ctx.match[1];
        const amount = parseFloat(ctx.match[2]);
        const userId = ctx.from.id.toString();
        
        const session = self.getSession(userId);
        if (!session || session.action !== 'device_payment') {
          await ctx.answerCbQuery('❌ No active payment session');
          return;
        }
        
        session.step = 3;
        session.data = session.data || {};
        session.data.paymentAmount = amount;
        self.updateSession(userId, session);
        
        const fakeCtx = {
          from: ctx.from,
          reply: async (text, options) => {
            await ctx.reply(text, options);
          }
        };
        
        await self.handleDevicePaymentText(fakeCtx, 'yes', session);
        
      } catch (error) {
        console.error('❌ Confirm payment error:', error);
        ctx.answerCbQuery('❌ Error confirming payment');
      }
    };
    
    // My device history
    callbacks['device_my_history'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const userDevices = await self.deviceSystem.getUserDevices(userId);
        
        if (userDevices.length === 0) {
          const { Markup } = require('telegraf');
          await ctx.editMessageText(
            '📊 *MY DEVICE HISTORY*\n\n' +
            '❌ You don\\\'t have any device history\\.\n\n' +
            'Buy a device to get started\\!',
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('🛒 Buy Device', 'device_buy')],
                [Markup.button.callback('⬅️ Back', 'device_back')]
              ])
            }
          );
          return;
        }
        
        const { Markup } = require('telegraf');
        let message = '📊 *MY DEVICE HISTORY*\n\n';
        
        userDevices.forEach((device, index) => {
          const status = device.completed ? '✅ PAID' : '⏳ ACTIVE';
          const progress = Math.round((device.paymentsMade / device.totalPayments) * 100);
          const purchaseDate = new Date(device.purchaseDate);
          const formattedDate = `${purchaseDate.getMonth() + 1}/${purchaseDate.getDate()}/${purchaseDate.getFullYear()}`;
          
          // FIXED: Single backslash for the plus sign
          message += `*${index + 1}\\. ${self.escapeMarkdown(device.make)} ${self.escapeMarkdown(device.model)}*\n`;
          message += `   📱 Status\\: ${status}\n`;
          message += `   💰 Total\\: ₦${device.totalPrice.toLocaleString()}\n`;
          message += `   💵 Paid\\: ₦${device.amountPaid.toLocaleString()}\n`;
          message += `   📊 Progress\\: ${progress}%\n`;
          message += `   📅 Plan\\: ${self.escapeMarkdown(device.paymentPlan)}\n`;
          message += `   🕐 Purchased\\: ${self.escapeMarkdown(formattedDate)}\n\n`;
        });
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Refresh', 'device_my_history')],
              [Markup.button.callback('⬅️ Back', 'device_back')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Device history error:', error);
        ctx.answerCbQuery('❌ Error loading history');
      }
    };
    
    // My device sales
    callbacks['device_my_sales'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        
        if (!self.users || typeof self.users !== 'object') {
          console.error('❌ Device sales error: users object is undefined or invalid:', self.users);
          await ctx.answerCbQuery('❌ System error - users not loaded');
          return;
        }
        
        const user = self.users[userId];
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!user) {
          await ctx.answerCbQuery('❌ User not found');
          return;
        }
        
        if (!user.isMarketer && !isAdminUser) {
          await ctx.answerCbQuery('❌ Marketer or Admin access only');
          return;
        }
        
        const sales = await self.deviceSystem.getMarketerSales(userId);
        
        if (sales.length === 0) {
          const { Markup } = require('telegraf');
          await ctx.editMessageText(
            '💰 *MY DEVICE SALES*\n\n' +
            '❌ You haven\\\'t sold any devices yet\\.\n\n' +
            'Start selling to earn 10% commission\\!',
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📱 View Devices', 'device_view_brands')],
                [Markup.button.callback('⬅️ Back', 'device_back')]
              ])
            }
          );
          return;
        }
        
        const { Markup } = require('telegraf');
        let message = '💰 *MY DEVICE SALES*\n\n';
        
        let totalCommission = 0;
        let totalSales = 0;
        
        sales.forEach((sale, index) => {
          const commission = sale.commission || (sale.sellingPrice - sale.costPrice) * 0.1;
          totalCommission += commission;
          totalSales += sale.totalPrice || sale.sellingPrice;
          const soldDate = new Date(sale.purchaseDate || sale.soldDate);
          const formattedDate = `${soldDate.getMonth() + 1}/${soldDate.getDate()}/${soldDate.getFullYear()}`;
          
          // FIXED: Single backslash for the plus sign
          message += `*${index + 1}\\. ${self.escapeMarkdown(sale.make)} ${self.escapeMarkdown(sale.model)}*\n`;
          message += `   👤 Buyer\\: ${self.escapeMarkdown(sale.buyerId || 'Unknown')}\n`;
          message += `   💰 Price\\: ₦${(sale.totalPrice || sale.sellingPrice).toLocaleString()}\n`;
          message += `   💵 Commission\\: ₦${Math.round(commission).toLocaleString()}\n`;
          message += `   📅 Sold\\: ${self.escapeMarkdown(formattedDate)}\n\n`;
        });
        
        message += `*SUMMARY*\n`;
        message += `Total Sales\\: ₦${totalSales.toLocaleString()}\n`;
        message += `Total Commission\\: ₦${Math.round(totalCommission).toLocaleString()}\n`;
        message += `Commission Rate\\: 10%\n\n`;
        message += `*Note\\:* Commission is paid when device is fully paid\\.`;
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Refresh', 'device_my_sales')],
              [Markup.button.callback('⬅️ Back', 'device_back')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Device sales error:', error);
        ctx.answerCbQuery('❌ Error loading sales');
      }
    };
    
    // Device admin panel
    callbacks['device_admin'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const stats = await self.deviceSystem.getDeviceStats();
        const { Markup } = require('telegraf');
        
        let message = '⚙️ *DEVICE ADMIN PANEL*\n\n';
        message += `📱 Total Devices\\: ${stats.totalDevices}\n`;
        message += `🟢 Available\\: ${stats.available}\n`;
        message += `💰 Sold\\: ${stats.sold}\n`;
        message += `💵 Revenue\\: ₦${stats.totalRevenue.toLocaleString()}\n`;
        message += `📈 Profit\\: ₦${stats.totalProfit.toLocaleString()}\n\n`;
        
        if (stats.byMake && Object.keys(stats.byMake).length > 0) {
          message += '*By Brand\\:*\n';
          for (const [make, makeStats] of Object.entries(stats.byMake)) {
            const profit = makeStats.revenue - (makeStats.revenue / 1.3 * 0.3);
            message += `• ${self.escapeMarkdown(make)}\\: ${makeStats.total} total, ${makeStats.sold} sold\n`;
            message += `  Revenue\\: ₦${makeStats.revenue.toLocaleString()}\n`;
            message += `  Profit\\: ₦${Math.round(profit).toLocaleString()}\n\n`;
          }
        }
        
        const currentText = ctx.update.callback_query.message.text;
        if (currentText === message) {
          ctx.answerCbQuery('✅ Stats refreshed');
          return;
        }
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Add Device', 'device_admin_add')],
              [Markup.button.callback('📊 View All Devices', 'device_admin_view')],
              [Markup.button.callback('👥 View Marketers', 'device_admin_marketers')],
              [Markup.button.callback('🔄 Refresh Stats', 'device_admin')],
              [Markup.button.callback('⬅️ Back', 'device_back')]
            ])
          }
        );
        
      } catch (error) {
        if (error.response && error.response.description && error.response.description.includes('message is not modified')) {
          ctx.answerCbQuery('✅ Stats already up to date');
        } else {
          console.error('❌ Device admin error:', error);
          ctx.answerCbQuery('❌ Error loading admin panel');
        }
      }
    };
    
    // Add device admin
    callbacks['device_admin_add'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const session = {
          action: 'device_admin_add',
          step: 1,
          data: {}
        };
        
        self.updateSession(userId, session);
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(
          '➕ *ADD NEW DEVICE*\n\n' +
          'Enter device brand \\(e\\.g\\. "Samsung", "iPhone", "Tecno"\\)\\:',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('❌ Cancel', 'device_admin')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Device admin add error:', error);
        ctx.answerCbQuery('❌ Error starting device addition');
      }
    };
    
    // Confirm add device
    callbacks['device_admin_confirm_add'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const session = self.getSession(userId);
        if (!session || session.action !== 'device_admin_add') {
          await ctx.answerCbQuery('❌ No active device addition session');
          return;
        }
        
        session.step = 5;
        self.updateSession(userId, session);
        
        const fakeCtx = {
          from: ctx.from,
          reply: async (text, options) => {
            await ctx.reply(text, options);
          }
        };
        
        await self.handleDeviceAdminAddText(fakeCtx, 'yes', session);
        
      } catch (error) {
        console.error('❌ Confirm add device error:', error);
        ctx.answerCbQuery('❌ Error confirming device addition');
      }
    };
    
    // View all devices (admin)
    callbacks['device_admin_view'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const devices = await self.deviceSystem.getAllDevices();
        const { Markup } = require('telegraf');
        
        if (devices.length === 0) {
          await ctx.editMessageText(
            '📊 *ALL DEVICES*\n\n' +
            '❌ No devices in inventory\\.',
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('➕ Add Device', 'device_admin_add')],
                [Markup.button.callback('⬅️ Back', 'device_admin')]
              ])
            }
          );
          return;
        }
        
        let message = '📊 *ALL DEVICES IN INVENTORY*\n\n';
        
        devices.forEach((device, index) => {
          const profit = device.sellingPrice - device.costPrice;
          const profitPercentage = ((profit / device.costPrice) * 100).toFixed(1);
          const status = device.status === 'available' ? '🟢' : '🔴';
          
          // FIXED: Single backslash for the plus sign
          message += `*${index + 1}\\. ${self.escapeMarkdown(device.make)} ${self.escapeMarkdown(device.model)}*\n`;
          message += `   ${status} Status\\: ${self.escapeMarkdown(device.status)}\n`;
          message += `   📦 Stock\\: ${device.quantity}\n`;
          message += `   💰 Price\\: ₦${device.sellingPrice.toLocaleString()}\n`;
          message += `   📈 Profit\\: ₦${profit.toLocaleString()} \\(${self.escapeMarkdown(profitPercentage)}%\\)\n`;
          message += `   🔑 ID\\: ${self.escapeMarkdown(device.id)}\n\n`;
        });
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Refresh', 'device_admin_view')],
              [Markup.button.callback('⬅️ Back', 'device_admin')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Device admin view error:', error);
        ctx.answerCbQuery('❌ Error viewing all devices');
      }
    };
    
    // View marketers (admin)
    callbacks['device_admin_marketers'] = async (ctx) => {
      try {
        return callbacks['device_manage_marketers'](ctx);
      } catch (error) {
        console.error('❌ Device admin marketers error:', error);
        ctx.answerCbQuery('❌ Error loading marketers');
      }
    };
    
    // Manage marketers
    callbacks['device_manage_marketers'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const marketers = [];
        if (self.users && typeof self.users === 'object') {
          for (const [userId, user] of Object.entries(self.users)) {
            if (user && user.isMarketer) {
              let joinedDate = 'Unknown';
              if (user.joined) {
                try {
                  const date = new Date(user.joined);
                  if (!isNaN(date.getTime())) {
                    joinedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                  }
                } catch (e) {
                  joinedDate = 'Unknown';
                }
              }
              
              marketers.push({
                id: userId,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${userId}`,
                email: user.email || 'No email',
                joined: joinedDate
              });
            }
          }
        }
        
        const { Markup } = require('telegraf');
        
        if (marketers.length === 0) {
          await ctx.editMessageText(
            '👥 *MANAGE MARKETERS*\n\n' +
            '❌ No marketers assigned yet\\.\n\n' +
            'You can assign users as marketers to give them access to sales features\\.',
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('➕ Assign New Marketer', 'device_assign_marketer')],
                [Markup.button.callback('⬅️ Back', 'device_admin')]
              ])
            }
          );
          return;
        }
        
        let message = '👥 *MANAGE MARKETERS*\n\n';
        
        marketers.forEach((marketer, index) => {
          const escapedName = self.escapeMarkdown(marketer.name);
          const escapedEmail = self.escapeMarkdown(marketer.email);
          const escapedJoined = self.escapeMarkdown(marketer.joined);
          
          // FIXED: Single backslash for the plus sign
          message += `*${index + 1}\\. ${escapedName}*\n`;
          message += `   🆔 ID\\: ${marketer.id}\n`;
          message += `   📧 Email\\: ${escapedEmail}\n`;
          message += `   📅 Joined\\: ${escapedJoined}\n\n`;
        });
        
        message += `*Total Marketers\\:* ${marketers.length}\n\n`;
        message += `Marketers earn 10% commission on devices they sell\\.`;
        
        await ctx.editMessageText(
          message,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('➕ Assign New Marketer', 'device_assign_marketer')],
              [Markup.button.callback('🗑️ Remove Marketer', 'device_remove_marketer')],
              [Markup.button.callback('🔄 Refresh', 'device_manage_marketers')],
              [Markup.button.callback('⬅️ Back', 'device_admin')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Manage marketers error:', error);
        ctx.answerCbQuery('❌ Error loading marketers');
      }
    };
    
    // Assign new marketer
    callbacks['device_assign_marketer'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const session = {
          action: 'assign_marketer',
          step: 1,
          data: {}
        };
        
        self.updateSession(userId, session);
        
        console.log(`✅ Created assign_marketer session for user ${userId}:`, session);
        
        const { Markup } = require('telegraf');
        await ctx.editMessageText(
          '👥 *ASSIGN NEW MARKETER*\n\n' +
          'To assign a user as a marketer, please enter their Telegram ID\\.\n\n' +
          '*How to find Telegram ID\\:*\n' +
          '1\\. Ask the user to forward a message from @userinfobot\n' +
          '2\\. Or ask them to use /id command if available\n' +
          '3\\. The ID is usually a 9\\-10 digit number\n\n' +
          'Enter Telegram ID\\:',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('❌ Cancel', 'device_manage_marketers')]
            ])
          }
        );
        
      } catch (error) {
        console.error('❌ Assign marketer error:', error);
        ctx.answerCbQuery('❌ Error starting marketer assignment');
      }
    };
    
    // Remove marketer
    callbacks['device_remove_marketer'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const marketers = [];
        if (self.users && typeof self.users === 'object') {
          for (const [userId, user] of Object.entries(self.users)) {
            if (user && user.isMarketer) {
              marketers.push({
                id: userId,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${userId}`
              });
            }
          }
        }
        
        if (marketers.length === 0) {
          await ctx.answerCbQuery('❌ No marketers to remove');
          return;
        }
        
        const { Markup } = require('telegraf');
        const keyboard = [];
        
        marketers.forEach(marketer => {
          keyboard.push([Markup.button.callback(
            `🗑️ Remove ${marketer.name}`,
            `device_remove_marketer_${marketer.id}`
          )]);
        });
        
        keyboard.push([Markup.button.callback('⬅️ Back', 'device_manage_marketers')]);
        
        await ctx.editMessageText(
          '🗑️ *REMOVE MARKETER*\n\n' +
          'Select a marketer to remove\\:',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard(keyboard)
          }
        );
        
      } catch (error) {
        console.error('❌ Remove marketer error:', error);
        ctx.answerCbQuery('❌ Error loading marketer removal');
      }
    };
    
    // Remove specific marketer
    callbacks['device_remove_marketer_(.+)'] = async (ctx) => {
      try {
        const marketerId = ctx.match[1];
        const userId = ctx.from.id.toString();
        const isAdminUser = self.isUserAdmin(userId);
        
        if (!isAdminUser) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        if (!self.users[marketerId]) {
          await ctx.answerCbQuery('❌ Marketer not found');
          return;
        }
        
        self.users[marketerId].isMarketer = false;
        
        await self.saveUsersData();
        
        await ctx.answerCbQuery(`✅ Marketer removed successfully`);
        
        return callbacks['device_manage_marketers'](ctx);
        
      } catch (error) {
        console.error('❌ Remove specific marketer error:', error);
        ctx.answerCbQuery('❌ Error removing marketer');
      }
    };
    
    // Back button
    callbacks['device_back'] = async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        
        self.clearSession(userId);
        
        await self.handleDeviceMenu(ctx);
      } catch (error) {
        console.error('❌ Device back error:', error);
        ctx.answerCbQuery('❌ Error going back');
      }
    };
    
    return callbacks;
  }
}

class DeviceCreditSystem {
  constructor(dataDir, users) {
    this.dataDir = dataDir;
    this.devicesFile = path.join(dataDir, 'devices.json');
    this.devicePurchasesFile = path.join(dataDir, 'device_purchases.json');
    this.users = users || {};
  }

  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      try {
        await fs.access(this.devicesFile);
        console.log('✅ Devices file exists');
      } catch {
        await fs.writeFile(this.devicesFile, JSON.stringify([], null, 2));
        console.log('📄 Created devices file');
        
        const sampleDevices = [
          {
            id: 'tecno_camon_001',
            make: 'Tecno',
            model: 'Camon 19',
            costPrice: 80000,
            sellingPrice: 104000,
            quantity: 10,
            status: 'available',
            addedBy: 'system',
            addedAt: new Date().toISOString()
          },
          {
            id: 'iphone_13_001',
            make: 'iPhone',
            model: '13',
            costPrice: 300000,
            sellingPrice: 390000,
            quantity: 5,
            status: 'available',
            addedBy: 'system',
            addedAt: new Date().toISOString()
          },
          {
            id: 'samsung_s22_001',
            make: 'Samsung',
            model: 'S22',
            costPrice: 250000,
            sellingPrice: 325000,
            quantity: 3,
            status: 'available',
            addedBy: 'system',
            addedAt: new Date().toISOString()
          }
        ];
        
        await fs.writeFile(this.devicesFile, JSON.stringify(sampleDevices, null, 2));
        console.log('📦 Added sample devices');
      }
      
      try {
        await fs.access(this.devicePurchasesFile);
        console.log('✅ Device purchases file exists');
      } catch {
        await fs.writeFile(this.devicePurchasesFile, JSON.stringify([], null, 2));
        console.log('📄 Created device purchases file');
      }
      
      console.log('✅ Device credit system initialized');
      return true;
    } catch (error) {
      console.error('❌ Device system initialization error:', error);
      return false;
    }
  }

  async getAllDevices() {
    try {
      const data = await fs.readFile(this.devicesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error getting all devices:', error);
      return [];
    }
  }

  async getAvailableDevices() {
    try {
      const data = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(data);
      return devices.filter(device => device.status === 'available' && device.quantity > 0);
    } catch (error) {
      console.error('❌ Error getting available devices:', error);
      return [];
    }
  }

  async getDeviceById(deviceId) {
    try {
      const data = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(data);
      
      let device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        const simplifiedId = deviceId.replace(/_/g, '');
        device = devices.find(d => d.id.replace(/_/g, '') === simplifiedId);
      }
      
      return device;
    } catch (error) {
      console.error('❌ Error getting device by ID:', error);
      return null;
    }
  }

  async processDevicePurchase(userId, deviceId, purchaseData) {
    try {
      console.log(`🛒 Processing device purchase for user ${userId}, device: ${deviceId}`);
      console.log(`📝 Purchase data:`, purchaseData);
      
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      
      const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(purchasesData);
      
      const deviceIndex = devices.findIndex(d => d.id === purchaseData.deviceId);
      console.log(`🔍 Looking for device with ID: ${purchaseData.deviceId}`);
      
      if (deviceIndex === -1) {
        console.error(`❌ Device not found: ${purchaseData.deviceId}`);
        return { success: false, message: `Device not found: ${purchaseData.deviceId}` };
      }
      
      const device = devices[deviceIndex];
      console.log(`✅ Found device: ${device.make} ${device.model}`);
      
      if (device.status !== 'available' || device.quantity <= 0) {
        return { success: false, message: 'Device not available' };
      }
      
      device.quantity -= 1;
      if (device.quantity <= 0) {
        device.status = 'sold_out';
      }
      
      const user = this.users[userId];
      const isMarketer = user && user.isMarketer === true;
      
      const nextPaymentDate = new Date();
      switch (purchaseData.paymentPlan) {
        case 'daily':
          nextPaymentDate.setDate(nextPaymentDate.getDate() + 1);
          break;
        case 'weekly':
          nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
          break;
        case 'monthly':
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
          break;
      }
      
      const purchase = {
        purchaseId: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        deviceId: device.id,
        buyerId: userId,
        make: device.make,
        model: device.model,
        totalPrice: device.sellingPrice,
        costPrice: device.costPrice,
        paymentPlan: purchaseData.paymentPlan,
        paymentFrequency: purchaseData.paymentFrequency,
        totalPayments: purchaseData.totalPayments,
        paymentsMade: 0,
        amountPaid: 0,
        amountDue: device.sellingPrice,
        nextPaymentAmount: Math.ceil(device.sellingPrice / purchaseData.totalPayments),
        nextPaymentDate: nextPaymentDate.toISOString(),
        completed: false,
        locked: true,
        purchaseDate: new Date().toISOString(),
        marketerId: isMarketer ? userId : null,
        commission: isMarketer ? (device.sellingPrice - device.costPrice) * 0.1 : 0
      };
      
      purchases.push(purchase);
      
      if (this.users[userId]) {
        if (!this.users[userId].deviceCredits) {
          this.users[userId].deviceCredits = [];
        }
        if (!this.users[userId].devicePayments) {
          this.users[userId].devicePayments = [];
        }
        if (!this.users[userId].deviceHistory) {
          this.users[userId].deviceHistory = [];
        }
        
        this.users[userId].deviceCredits.push({
          purchaseId: purchase.purchaseId,
          deviceId: device.id,
          make: device.make,
          model: device.model,
          amount: device.sellingPrice
        });
        
        this.users[userId].deviceHistory.push({
          type: 'purchase',
          amount: device.sellingPrice,
          deviceId: device.id,
          date: new Date().toISOString(),
          description: `Purchased ${device.make} ${device.model} on ${purchaseData.paymentPlan} plan`
        });
      }
      
      await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
      await fs.writeFile(this.devicePurchasesFile, JSON.stringify(purchases, null, 2));
      
      const deviceHandler = require('./deviceHandler');
      const handlerInstance = new deviceHandler(this.dataDir, this.users);
      await handlerInstance.saveUsersData();
      
      console.log(`✅ Device purchase processed: ${device.make} ${device.model} by user ${userId}`);
      
      return {
        success: true,
        message: 'Purchase successful',
        purchaseId: purchase.purchaseId
      };
    } catch (error) {
      console.error('❌ Process device purchase error:', error);
      return { success: false, message: 'Error processing purchase' };
    }
  }

  async getUserDevices(userId) {
    try {
      const data = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(data);
      return purchases.filter(purchase => purchase.buyerId === userId);
    } catch (error) {
      console.error('❌ Error getting user devices:', error);
      return [];
    }
  }

  async getDeviceStats() {
    try {
      const devicesData = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(devicesData);
      
      const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(purchasesData);
      
      const totalDevices = devices.reduce((sum, device) => sum + device.quantity, 0);
      const available = devices.reduce((sum, device) => {
        if (device.status === 'available') return sum + device.quantity;
        return sum;
      }, 0);
      
      const sold = purchases.length;
      const totalRevenue = purchases.reduce((sum, purchase) => sum + (purchase.totalPrice || purchase.sellingPrice || 0), 0);
      const totalProfit = purchases.reduce((sum, purchase) => {
        const device = devices.find(d => d.id === purchase.deviceId);
        if (device) {
          return sum + ((purchase.totalPrice || purchase.sellingPrice || 0) - device.costPrice);
        }
        return sum;
      }, 0);
      
      const byMake = {};
      devices.forEach(device => {
        if (!byMake[device.make]) {
          byMake[device.make] = {
            total: device.quantity,
            sold: purchases.filter(p => p.deviceId === device.id).length,
            revenue: purchases.filter(p => p.deviceId === device.id)
              .reduce((sum, p) => sum + (p.totalPrice || p.sellingPrice || 0), 0)
          };
        } else {
          byMake[device.make].total += device.quantity;
          byMake[device.make].sold += purchases.filter(p => p.deviceId === device.id).length;
          byMake[device.make].revenue += purchases.filter(p => p.deviceId === device.id)
            .reduce((sum, p) => sum + (p.totalPrice || p.sellingPrice || 0), 0);
        }
      });
      
      return {
        totalDevices,
        available,
        sold,
        totalRevenue,
        totalProfit,
        byMake
      };
    } catch (error) {
      console.error('❌ Error getting device stats:', error);
      return {
        totalDevices: 0,
        available: 0,
        sold: 0,
        totalRevenue: 0,
        totalProfit: 0,
        byMake: {}
      };
    }
  }

  async getMarketerSales(marketerId) {
    try {
      const data = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(data);
      return purchases.filter(purchase => purchase.marketerId === marketerId);
    } catch (error) {
      console.error('❌ Error getting marketer sales:', error);
      return [];
    }
  }

  async processDevicePayment(userId, deviceId, amount) {
    try {
      const purchasesData = await fs.readFile(this.devicePurchasesFile, 'utf8');
      const purchases = JSON.parse(purchasesData);
      
      const purchaseIndex = purchases.findIndex(p => 
        p.buyerId === userId && p.deviceId === deviceId && !p.completed
      );
      
      if (purchaseIndex === -1) {
        return { success: false, message: 'Purchase not found or already completed' };
      }
      
      const purchase = purchases[purchaseIndex];
      
      if (amount > purchase.amountDue) {
        return { success: false, message: 'Payment exceeds amount due' };
      }
      
      purchase.amountPaid += amount;
      purchase.amountDue -= amount;
      purchase.paymentsMade += 1;
      
      const paymentAmount = purchase.totalPrice / purchase.totalPayments;
      if (amount >= paymentAmount) {
        purchase.paymentsMade = Math.min(purchase.paymentsMade, purchase.totalPayments);
      }
      
      if (purchase.amountDue <= 0) {
        purchase.completed = true;
        purchase.locked = false;
        purchase.completedDate = new Date().toISOString();
      } else {
        const nextPaymentDate = new Date(purchase.nextPaymentDate);
        switch (purchase.paymentPlan) {
          case 'daily':
            nextPaymentDate.setDate(nextPaymentDate.getDate() + 1);
            break;
          case 'weekly':
            nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
            break;
          case 'monthly':
            nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
            break;
        }
        purchase.nextPaymentDate = nextPaymentDate.toISOString();
      }
      
      if (this.users[userId]) {
        if (!this.users[userId].devicePayments) {
          this.users[userId].devicePayments = [];
        }
        
        this.users[userId].devicePayments.push({
          purchaseId: purchase.purchaseId,
          deviceId: deviceId,
          amount: amount,
          date: new Date().toISOString(),
          remaining: purchase.amountDue
        });
        
        this.users[userId].deviceHistory.push({
          type: 'payment',
          amount: amount,
          deviceId: deviceId,
          date: new Date().toISOString(),
          description: `Payment for ${purchase.make} ${purchase.model}`
        });
      }
      
      await fs.writeFile(this.devicePurchasesFile, JSON.stringify(purchases, null, 2));
      
      const deviceHandler = require('./deviceHandler');
      const handlerInstance = new deviceHandler(this.dataDir, this.users);
      await handlerInstance.saveUsersData();
      
      console.log(`✅ Device payment processed: ₦${amount} for device ${deviceId} by user ${userId}`);
      
      return {
        success: true,
        message: 'Payment successful',
        paymentsMade: purchase.paymentsMade,
        nextPaymentDate: purchase.nextPaymentDate,
        amountDue: purchase.amountDue,
        completed: purchase.completed
      };
    } catch (error) {
      console.error('❌ Process device payment error:', error);
      return { success: false, message: 'Error processing payment' };
    }
  }

  async addDevice(deviceData) {
    try {
      const data = await fs.readFile(this.devicesFile, 'utf8');
      const devices = JSON.parse(data);
      
      const newDevices = [];
      for (let i = 0; i < deviceData.quantity; i++) {
        const deviceId = `${deviceData.make.toLowerCase().replace(/\s+/g, '_')}_${deviceData.model.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${i}`;
        
        newDevices.push({
          id: deviceId,
          make: deviceData.make,
          model: deviceData.model,
          costPrice: deviceData.costPrice,
          sellingPrice: deviceData.sellingPrice,
          quantity: 1,
          status: 'available',
          addedBy: deviceData.addedBy || 'admin',
          addedAt: new Date().toISOString()
        });
      }
      
      devices.push(...newDevices);
      await fs.writeFile(this.devicesFile, JSON.stringify(devices, null, 2));
      
      console.log(`✅ Added ${deviceData.quantity} ${deviceData.make} ${deviceData.model} devices`);
      
      return {
        success: true,
        addedCount: deviceData.quantity,
        devices: newDevices
      };
    } catch (error) {
      console.error('❌ Add device error:', error);
      return { success: false, message: 'Error adding device' };
    }
  }
}

module.exports = DeviceHandler;