// app/deviceCredit/handlers/AdminHandler.js
const { Markup } = require('telegraf');

class AdminHandler {
  constructor(deviceHandler) {
    this.deviceHandler = deviceHandler;
    this.escapeMarkdown = deviceHandler.escapeMarkdown;
    this.formatCurrency = deviceHandler.formatCurrency;
  }

  async handleAdminPanel(ctx, analytics, isUserAdmin) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isUserAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const stats = await analytics.getFullAnalytics();
      const message = this.buildAdminMessage(ctx, stats);
      const keyboard = this.buildAdminKeyboard();
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      }
      
    } catch (error) {
      console.error('❌ Admin panel error:', error);
      throw error;
    }
  }

  async handleViewAllPurchases(ctx, filter, purchaseModel, isUserAdmin) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isUserAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const purchases = await purchaseModel.getAllPurchases();
      const filteredPurchases = this.filterPurchases(purchases, filter);
      const message = this.buildPurchasesMessage(filteredPurchases, filter);
      const keyboard = this.buildPurchasesKeyboard(filter);
      
      await ctx.editMessageText(message, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
      
    } catch (error) {
      console.error('❌ View all purchases error:', error);
      throw error;
    }
  }

  // Helper methods for building messages and keyboards
  buildAdminMessage(ctx, stats) {
    let message = `*⚙️ DEVICE ADMIN PANEL*\n\n`;
    message += `*👑 Admin:* ${this.escapeMarkdown(ctx.from.first_name || 'Admin')}\n`;
    message += `*🆔 User ID:* ${ctx.from.id}\n\n`;
    
    // Add stats to message
    if (stats) {
      message += `*📊 SYSTEM OVERVIEW*\n`;
      message += `📱 Device Models: ${stats.devices.total || 0}\n`;
      // ... rest of stats
    }
    
    return message;
  }

  buildAdminKeyboard() {
    return [
      [
        Markup.button.callback('➕ Add Device', 'device_admin_add'),
        Markup.button.callback('📊 Manage Devices', 'device_admin_view')
      ],
      // ... rest of keyboard
    ];
  }

  filterPurchases(purchases, filter) {
    switch (filter) {
      case 'active':
        return purchases.filter(p => p.status === 'active' && !p.completed);
      case 'completed':
        return purchases.filter(p => p.completed);
      // ... other filters
      default:
        return purchases;
    }
  }

  buildPurchasesMessage(purchases, filter) {
    let message = `*📋 ALL PURCHASES*\n\n`;
    message += `*Filter:* ${this.escapeMarkdown(filter.toUpperCase())}\n`;
    message += `*Total:* ${purchases.length} purchases\n\n`;
    
    // Add purchase details
    purchases.slice(0, 10).forEach((purchase, index) => {
      message += `*${index + 1}\\. ${this.escapeMarkdown(purchase.make)} ${this.escapeMarkdown(purchase.model)}*\n`;
      // ... more details
    });
    
    return message;
  }

  buildPurchasesKeyboard(filter) {
    return [
      [
        Markup.button.callback('📋 All', 'device_admin_view_purchases_all'),
        Markup.button.callback('📅 Active', 'device_admin_view_purchases_active')
      ],
      // ... more buttons
    ];
  }
}

module.exports = AdminHandler;