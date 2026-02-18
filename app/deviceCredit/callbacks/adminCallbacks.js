const { Markup } = require('telegraf');
const { escapeMarkdown, formatCurrency } = require('../utils/formatters');

module.exports = function adminCallbacks(handler) {
  const callbacks = {};

  // Device admin panel
  callbacks['device_admin'] = async (ctx) => {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const stats = await handler.creditSystem.getDeviceStats();
      const { Markup } = require('telegraf');
      
      let message = '⚙️ *DEVICE ADMIN PANEL*\n\n';
      message += `📱 Total Devices\\: ${stats.totalDevices}\n`;
      message += `🟢 Available\\: ${stats.available}\n`;
      message += `💰 Sold\\: ${stats.sold}\n`;
      message += `💵 Revenue\\: ${escapeMarkdown(formatCurrency(stats.totalRevenue))}\n`;
      message += `📈 Profit\\: ${escapeMarkdown(formatCurrency(stats.totalProfit))}\n\n`;
      
      if (stats.byMake && Object.keys(stats.byMake).length > 0) {
        message += '*By Brand\\:*\n';
        for (const [make, makeStats] of Object.entries(stats.byMake)) {
          const profit = makeStats.revenue - (makeStats.revenue / 1.3 * 0.3);
          message += `• ${escapeMarkdown(make)}\\: ${makeStats.total} total, ${makeStats.sold} sold\n`;
          message += `  Revenue\\: ${escapeMarkdown(formatCurrency(makeStats.revenue))}\n`;
          message += `  Profit\\: ${escapeMarkdown(formatCurrency(Math.round(profit)))}\n\n`;
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
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      handler.sessionManager.createAdminAddSession(userId);
      
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
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const session = handler.sessionManager.getSession(userId);
      if (!session || session.action !== 'device_admin_add') {
        await ctx.answerCbQuery('❌ No active device addition session');
        return;
      }
      
      handler.sessionManager.updateStep(userId, 5);
      
      const fakeCtx = {
        from: ctx.from,
        reply: async (text, options) => {
          await ctx.reply(text, options);
        }
      };
      
      const adminController = handler.adminController;
      if (adminController) {
        await adminController.handleText(fakeCtx, 'yes', session);
      }
      
    } catch (error) {
      console.error('❌ Confirm add device error:', error);
      ctx.answerCbQuery('❌ Error confirming device addition');
    }
  };

  // View all devices (admin)
  callbacks['device_admin_view'] = async (ctx) => {
    try {
      const userId = ctx.from.id.toString();
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const devices = await handler.creditSystem.getAllDevices();
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
        
        message += `*${index + 1}\\. ${escapeMarkdown(device.make)} ${escapeMarkdown(device.model)}*\n`;
        message += `   ${status} Status\\: ${escapeMarkdown(device.status)}\n`;
        message += `   📦 Stock\\: ${device.quantity}\n`;
        message += `   💰 Price\\: ${escapeMarkdown(formatCurrency(device.sellingPrice))}\n`;
        message += `   📈 Profit\\: ${escapeMarkdown(formatCurrency(profit))} \\(${escapeMarkdown(profitPercentage)}%\\)\n`;
        message += `   🔑 ID\\: ${escapeMarkdown(device.id)}\n\n`;
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
      const userId = ctx.from.id.toString();
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
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
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const marketers = [];
      if (handler.users && typeof handler.users === 'object') {
        for (const [userId, user] of Object.entries(handler.users)) {
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
        const escapedName = escapeMarkdown(marketer.name);
        const escapedEmail = escapeMarkdown(marketer.email);
        const escapedJoined = escapeMarkdown(marketer.joined);
        
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
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      handler.sessionManager.createAssignMarketerSession(userId);
      
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
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const marketers = [];
      if (handler.users && typeof handler.users === 'object') {
        for (const [userId, user] of Object.entries(handler.users)) {
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
      const isAdminUser = handler.isUserAdmin(userId);
      
      if (!isAdminUser) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      if (!handler.users[marketerId]) {
        await ctx.answerCbQuery('❌ Marketer not found');
        return;
      }
      
      handler.users[marketerId].isMarketer = false;
      
      // Note: This would need to save to users.json - handled by main bot
      await ctx.answerCbQuery(`✅ Marketer removed successfully`);
      
      return callbacks['device_manage_marketers'](ctx);
      
    } catch (error) {
      console.error('❌ Remove specific marketer error:', error);
      ctx.answerCbQuery('❌ Error removing marketer');
    }
  };

  return callbacks;
};