// app/admin/handlers/adminPanelHandlers.js
const { Markup } = require('telegraf');
const { escapeMarkdownV2 } = require('../../utils/markdownHelpers');
const { formatCurrency } = require('../../utils/formatters');

module.exports = function createAdminPanelHandlers(users, systemTransactionManager, isAdmin) {
  
  async function handleAdminUsers(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const totalUsers = Object.keys(users).length;
      const activeUsers = Object.values(users).filter(user => 
        user.wallet > 0 || (user.kycStatus === 'approved' && user.phone)
      ).length;
      const kycPending = Object.values(users).filter(user => user.kycStatus === 'pending').length;
      const kycApproved = Object.values(users).filter(user => user.kycStatus === 'approved').length;
      const kycRejected = Object.values(users).filter(user => user.kycStatus === 'rejected').length;
      
      await ctx.reply(
        '👥 \\*USER MANAGEMENT\\*\n\n' +
        `📊 \\*Total Users\\:\\* ${totalUsers}\n` +
        `👤 \\*Active Users\\:\\* ${activeUsers}\n` +
        `⏳ \\*KYC Pending\\:\\* ${kycPending}\n` +
        `✅ \\*KYC Approved\\:\\* ${kycApproved}\n` +
        `❌ \\*KYC Rejected\\:\\* ${kycRejected}\n\n` +
        '👇 \\*Select an option\\:\\*',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 List All Users', 'admin_list_users')],
            [Markup.button.callback('🔄 KYC Approvals', 'admin_kyc')],
            [Markup.button.callback('💰 Fund User Wallet', 'admin_fund_user')],
            [Markup.button.callback('📊 User Statistics', 'admin_user_stats')],
            [Markup.button.callback('🏠 Back', 'admin_panel')]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Admin users callback error:', error);
      await ctx.answerCbQuery('❌ Error loading user management');
    }
  }
  
  async function handleAdminKyc(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const pendingKycUsers = Object.entries(users)
        .filter(([uid, user]) => user.kycStatus === 'submitted' || user.kycStatus === 'pending')
        .map(([uid, user]) => ({ userId: uid, ...user }));
      
      if (pendingKycUsers.length === 0) {
        await ctx.reply(
          '🛂 \\*KYC APPROVALS\\*\n\n' +
          '✅ \\*No pending KYC applications\\*\n\n' +
          'All users have been processed\\.',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🏠 Back', 'admin_panel')]
            ])
          }
        );
      } else {
        let message = '🛂 \\*KYC APPROVALS\\*\n\n';
        message += `📋 \\*Pending Applications\\:\\* ${pendingKycUsers.length}\n\n`;
        
        pendingKycUsers.slice(0, 5).forEach((user, index) => {
          const submittedDate = user.kycSubmittedDate ? 
            new Date(user.kycSubmittedDate).toLocaleDateString() : 'Not submitted';
          
          message += `${index + 1}\\. \\*${escapeMarkdownV2(user.firstName || '')} ${escapeMarkdownV2(user.lastName || '')}\\*\n`;
          message += `   👤 User ID\\: ${user.userId}\n`;
          message += `   📧 Email\\: ${escapeMarkdownV2(user.email || 'Not set')}\n`;
          message += `   📱 Phone\\: ${escapeMarkdownV2(user.phone || 'Not set')}\n`;
          message += `   📅 Submitted\\: ${escapeMarkdownV2(submittedDate)}\n`;
          message += `   🔗 \\*Action\\:\\* \`/approvekyc ${user.userId}\` or \`/rejectkyc ${user.userId} reason\`\n\n`;
        });
        
        if (pendingKycUsers.length > 5) {
          message += `\\.\\.\\. and ${pendingKycUsers.length - 5} more pending applications\\.`;
        }
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh List', 'admin_kyc')],
            [Markup.button.callback('🏠 Back', 'admin_panel')]
          ])
        });
      }
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Admin KYC callback error:', error);
      await ctx.answerCbQuery('❌ Error loading KYC approvals');
    }
  }
  
  async function handleAdminDeviceFinancing(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply(
        '💼 \\*DEVICE FINANCING ADMIN\\*\n\n' +
        '📱 \\*Device Financing System\\*\n\n' +
        '👇 \\*Available Commands\\:\\*\n\n' +
        '📱 \\*/adddevice\\* \\[make\\] \\[model\\] \\[cost\\] \\[price\\] \\[description\\]\n' +
        '📦 \\*/addinventory\\* \\[device\\_id\\] \\[imei\\] \\[color\\] \\[storage\\]\n' +
        '👥 \\*/addmarketer\\* \\[user\\_id\\] \\[commission\\_rate\\]\n' +
        '🗑️ \\*/removedevice\\* \\[device\\_id\\]\n' +
        '💰 \\*/verifypayment\\* \\[payment\\_id\\]\n' +
        '✅ \\*/completepayment\\* \\[payment\\_id\\]\n' +
        '❌ \\*/failpayment\\* \\[payment\\_id\\]\n\n' +
        'Use the commands above to manage the device financing system\\.',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Back', 'admin_panel')]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Device financing admin callback error:', error);
      await ctx.answerCbQuery('❌ Error loading device financing admin');
    }
  }
  
  async function handleAdminBalance(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let totalWalletBalance = 0;
      let totalVirtualAccounts = 0;
      let pendingTransactions = 0;
      let completedTransactions = 0;
      
      Object.values(users).forEach(user => {
        totalWalletBalance += user.wallet || 0;
        if (user.virtualAccount) {
          totalVirtualAccounts += 1;
        }
      });
      
      // Count transactions from system tracking
      const pendingSystem = systemTransactionManager.searchTransactions({ status: 'pending' });
      const completedSystem = systemTransactionManager.searchTransactions({ status: 'completed' });
      pendingTransactions = pendingSystem.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      completedTransactions = completedSystem.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      
      await ctx.reply(
        '💰 \\*SYSTEM BALANCE\\*\n\n' +
        `💵 \\*Total Wallet Balance\\:\\* ${formatCurrency(totalWalletBalance)}\n` +
        `🏦 \\*Virtual Accounts\\:\\* ${totalVirtualAccounts}\n` +
        `⏳ \\*Pending Transactions\\:\\* ${formatCurrency(pendingTransactions)}\n` +
        `✅ \\*Completed Today\\:\\* ${formatCurrency(completedTransactions)}\n\n` +
        `👥 \\*Total Users\\:\\* ${Object.keys(users).length}\n` +
        `📊 \\*Active Today\\:\\* ${systemTransactionManager.searchTransactions({ 
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        }).length}\n\n` +
        '\\*Note\\:\\* This is the total of all user wallets in the system\\.',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', 'admin_balance')],
            [Markup.button.callback('🏠 Back', 'admin_panel')]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ System balance callback error:', error);
      await ctx.answerCbQuery('❌ Error loading system balance');
    }
  }
  
  async function handleAdminStats(ctx) {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const totalUsers = Object.keys(users).length;
      let totalBalance = 0;
      Object.values(users).forEach(user => {
        totalBalance += user.wallet || 0;
      });
      
      const stats = systemTransactionManager.getTransactionStats();
      
      await ctx.reply(
        `📈 \\*SYSTEM STATISTICS\\*\n\n` +
        `👥 \\*Total Users\\:\\* ${totalUsers}\n` +
        `💰 \\*Total Balance\\:\\* ${formatCurrency(totalBalance)}\n` +
        `📊 \\*Total Transactions\\:\\* ${stats.total}\n` +
        `📅 \\*Today\\'s Transactions\\:\\* ${stats.today}\n\n` +
        `🛂 \\*KYC Status\\:\\*\n` +
        `✅ Approved\\: ${Object.values(users).filter(u => u.kycStatus === 'approved').length}\n` +
        `⏳ Pending\\: ${Object.values(users).filter(u => u.kycStatus === 'pending').length}\n` +
        `❌ Rejected\\: ${Object.values(users).filter(u => u.kycStatus === 'rejected').length}\n\n` +
        `📱 \\*Device Financing\\:\\*\n` +
        `Marketers\\: ${Object.values(users).filter(u => u.isMarketer).length}`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Back', 'admin_panel')]
          ])
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ System stats callback error:', error);
      await ctx.answerCbQuery('❌ Error loading system stats');
    }
  }
  
  return {
    handleAdminUsers,
    handleAdminKyc,
    handleAdminDeviceFinancing,
    handleAdminBalance,
    handleAdminStats
  };
};