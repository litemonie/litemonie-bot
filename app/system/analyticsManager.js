// app/system/analyticsManager.js
const moment = require('moment');
const { saveData, analyticsFile } = require('../storage/loaders');
const { formatCurrency } = require('../utils/formatters');

module.exports = function createAnalyticsManager(analytics, users) {
  
  const analyticsManager = {
    updateAnalytics: async (transaction) => {
      try {
        const date = moment(transaction.timestamp);
        const dayKey = date.format('YYYY-MM-DD');
        const weekKey = date.format('YYYY-[W]WW');
        const monthKey = date.format('YYYY-MM');
        const hour = date.hour();
        
        // Initialize analytics structure
        if (!analytics.daily) analytics.daily = {};
        if (!analytics.weekly) analytics.weekly = {};
        if (!analytics.monthly) analytics.monthly = {};
        if (!analytics.hourly) analytics.hourly = {};
        if (!analytics.userStats) analytics.userStats = {};
        if (!analytics.categoryStats) analytics.categoryStats = {};
        
        // Update daily stats
        if (!analytics.daily[dayKey]) {
          analytics.daily[dayKey] = {
            totalTransactions: 0,
            totalAmount: 0,
            completed: 0,
            failed: 0,
            pending: 0,
            byCategory: {},
            byType: {},
            userCount: 0,
            peakHour: null
          };
        }
        
        const daily = analytics.daily[dayKey];
        daily.totalTransactions++;
        daily.totalAmount += transaction.amount || 0;
        
        if (transaction.status === 'completed') daily.completed++;
        else if (transaction.status === 'failed') daily.failed++;
        else if (transaction.status === 'pending') daily.pending++;
        
        // Update category stats
        const category = transaction.category || 'general';
        if (!daily.byCategory[category]) daily.byCategory[category] = 0;
        daily.byCategory[category]++;
        
        // Update type stats
        const type = transaction.type || 'unknown';
        if (!daily.byType[type]) daily.byType[type] = 0;
        daily.byType[type]++;
        
        // Update weekly stats
        if (!analytics.weekly[weekKey]) {
          analytics.weekly[weekKey] = {
            totalTransactions: 0,
            totalAmount: 0,
            dailyAverage: 0,
            growthRate: 0
          };
        }
        analytics.weekly[weekKey].totalTransactions++;
        analytics.weekly[weekKey].totalAmount += transaction.amount || 0;
        
        // Update monthly stats
        if (!analytics.monthly[monthKey]) {
          analytics.monthly[monthKey] = {
            totalTransactions: 0,
            totalAmount: 0,
            averageDaily: 0,
            peakDay: null
          };
        }
        analytics.monthly[monthKey].totalTransactions++;
        analytics.monthly[monthKey].totalAmount += transaction.amount || 0;
        
        // Update hourly stats
        if (!analytics.hourly[hour]) {
          analytics.hourly[hour] = 0;
        }
        analytics.hourly[hour]++;
        
        // Update user stats
        const userId = transaction.userId || transaction.telegramId;
        if (userId && !analytics.userStats[userId]) {
          analytics.userStats[userId] = {
            totalTransactions: 0,
            totalAmount: 0,
            firstTransaction: date.toISOString(),
            lastTransaction: date.toISOString(),
            favoriteCategory: null,
            categories: {}
          };
        }
        if (analytics.userStats[userId]) {
          const userStat = analytics.userStats[userId];
          userStat.totalTransactions++;
          userStat.totalAmount += transaction.amount || 0;
          userStat.lastTransaction = date.toISOString();
          
          if (!userStat.categories[category]) userStat.categories[category] = 0;
          userStat.categories[category]++;
          
          // Update favorite category
          let maxCount = 0;
          let favorite = null;
          for (const [cat, count] of Object.entries(userStat.categories)) {
            if (count > maxCount) {
              maxCount = count;
              favorite = cat;
            }
          }
          userStat.favoriteCategory = favorite;
        }
        
        // Update category stats globally
        if (!analytics.categoryStats[category]) {
          analytics.categoryStats[category] = {
            totalTransactions: 0,
            totalAmount: 0,
            successRate: 0,
            averageAmount: 0,
            users: new Set()
          };
        }
        const catStat = analytics.categoryStats[category];
        catStat.totalTransactions++;
        catStat.totalAmount += transaction.amount || 0;
        if (userId) catStat.users.add(userId);
        
        await saveData(analyticsFile, analytics);
        
      } catch (error) {
        console.error('❌ Analytics update error:', error);
      }
    },
    
    getAnalyticsReport: (period = 'daily', startDate = null, endDate = null) => {
      let report = {
        period: period,
        dateRange: { start: startDate, end: endDate },
        summary: {},
        trends: {},
        insights: []
      };
      
      switch (period) {
        case 'daily':
          const today = moment().format('YYYY-MM-DD');
          const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
          
          report.summary = analytics.daily[today] || {
            totalTransactions: 0,
            totalAmount: 0,
            completed: 0,
            failed: 0,
            pending: 0
          };
          
          if (analytics.daily[yesterday]) {
            report.trends = {
              transactionChange: ((report.summary.totalTransactions - analytics.daily[yesterday].totalTransactions) / 
                                (analytics.daily[yesterday].totalTransactions || 1)) * 100,
              amountChange: ((report.summary.totalAmount - analytics.daily[yesterday].totalAmount) / 
                            (analytics.daily[yesterday].totalAmount || 1)) * 100
            };
          }
          break;
          
        case 'weekly':
          const thisWeek = moment().format('YYYY-[W]WW');
          const lastWeek = moment().subtract(1, 'week').format('YYYY-[W]WW');
          
          report.summary = analytics.weekly[thisWeek] || {
            totalTransactions: 0,
            totalAmount: 0
          };
          
          if (analytics.weekly[lastWeek]) {
            report.trends = {
              transactionChange: ((report.summary.totalTransactions - analytics.weekly[lastWeek].totalTransactions) / 
                                (analytics.weekly[lastWeek].totalTransactions || 1)) * 100,
              amountChange: ((report.summary.totalAmount - analytics.weekly[lastWeek].totalAmount) / 
                            (analytics.weekly[lastWeek].totalAmount || 1)) * 100
            };
          }
          break;
          
        case 'monthly':
          const thisMonth = moment().format('YYYY-MM');
          const lastMonth = moment().subtract(1, 'month').format('YYYY-MM');
          
          report.summary = analytics.monthly[thisMonth] || {
            totalTransactions: 0,
            totalAmount: 0
          };
          
          if (analytics.monthly[lastMonth]) {
            report.trends = {
              transactionChange: ((report.summary.totalTransactions - analytics.monthly[lastMonth].totalTransactions) / 
                                (analytics.monthly[lastMonth].totalTransactions || 1)) * 100,
              amountChange: ((report.summary.totalAmount - analytics.monthly[lastMonth].totalAmount) / 
                            (analytics.monthly[lastMonth].totalAmount || 1)) * 100
            };
          }
          break;
          
        case 'custom':
          if (startDate && endDate) {
            const start = moment(startDate);
            const end = moment(endDate);
            let totalTransactions = 0;
            let totalAmount = 0;
            let completed = 0;
            let failed = 0;
            let pending = 0;
            const categoryBreakdown = {};
            
            for (const [dateKey, dailyData] of Object.entries(analytics.daily || {})) {
              const date = moment(dateKey);
              if (date.isBetween(start, end, 'day', '[]')) {
                totalTransactions += dailyData.totalTransactions || 0;
                totalAmount += dailyData.totalAmount || 0;
                completed += dailyData.completed || 0;
                failed += dailyData.failed || 0;
                pending += dailyData.pending || 0;
                
                for (const [category, count] of Object.entries(dailyData.byCategory || {})) {
                  categoryBreakdown[category] = (categoryBreakdown[category] || 0) + count;
                }
              }
            }
            
            report.summary = {
              totalTransactions,
              totalAmount,
              completed,
              failed,
              pending,
              categoryBreakdown
            };
          }
          break;
      }
      
      // Generate insights
      if (analytics.categoryStats) {
        let topCategory = null;
        let topAmount = 0;
        
        for (const [category, stats] of Object.entries(analytics.categoryStats)) {
          if (stats.totalAmount > topAmount) {
            topAmount = stats.totalAmount;
            topCategory = category;
          }
        }
        
        if (topCategory) {
          report.insights.push(`💰 Top category by revenue: ${topCategory} (₦${topAmount.toLocaleString()})`);
        }
      }
      
      if (analytics.hourly) {
        let peakHour = null;
        let peakCount = 0;
        
        for (const [hour, count] of Object.entries(analytics.hourly)) {
          if (count > peakCount) {
            peakCount = count;
            peakHour = hour;
          }
        }
        
        if (peakHour) {
          report.insights.push(`📈 Peak transaction hour: ${peakHour}:00 (${peakCount} transactions)`);
        }
      }
      
      if (analytics.userStats) {
        const totalUsers = Object.keys(analytics.userStats).length;
        let topSpender = null;
        let topSpendAmount = 0;
        
        for (const [userId, stats] of Object.entries(analytics.userStats)) {
          if (stats.totalAmount > topSpendAmount) {
            topSpendAmount = stats.totalAmount;
            topSpender = userId;
          }
        }
        
        if (topSpender) {
          const user = users[topSpender];
          const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${topSpender}` : `User ${topSpender}`;
          report.insights.push(`👑 Top spender: ${userName} (₦${topSpendAmount.toLocaleString()})`);
        }
        
        report.insights.push(`👥 Total unique users: ${totalUsers}`);
      }
      
      return report;
    },
    
    getUserLifetimeValue: (userId) => {
      const userStat = analytics.userStats[userId];
      if (!userStat) return null;
      
      const firstTransaction = moment(userStat.firstTransaction);
      const lastTransaction = moment(userStat.lastTransaction);
      const daysActive = lastTransaction.diff(firstTransaction, 'days') + 1;
      
      return {
        totalValue: userStat.totalAmount,
        averageOrderValue: userStat.totalAmount / userStat.totalTransactions,
        frequency: userStat.totalTransactions / (daysActive || 1),
        daysActive: daysActive,
        favoriteCategory: userStat.favoriteCategory,
        categoryBreakdown: userStat.categories
      };
    },
    
    getRevenueForecast: () => {
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
        last7Days.push({
          date,
          revenue: analytics.daily[date]?.totalAmount || 0,
          transactions: analytics.daily[date]?.totalTransactions || 0
        });
      }
      
      const avgDailyRevenue = last7Days.reduce((sum, day) => sum + day.revenue, 0) / 7;
      const avgDailyTransactions = last7Days.reduce((sum, day) => sum + day.transactions, 0) / 7;
      
      return {
        last7Days,
        averageDailyRevenue: avgDailyRevenue,
        averageDailyTransactions: avgDailyTransactions,
        projectedMonthlyRevenue: avgDailyRevenue * 30,
        growthRate: last7Days[6].revenue > last7Days[0].revenue ? 
          ((last7Days[6].revenue - last7Days[0].revenue) / last7Days[0].revenue) * 100 : 0
      };
    },
    
    getCategoryPerformance: () => {
      const categories = [];
      for (const [category, stats] of Object.entries(analytics.categoryStats || {})) {
        const successRate = stats.totalTransactions > 0 ? 
          ((stats.completed || 0) / stats.totalTransactions) * 100 : 0;
        
        categories.push({
          category,
          totalTransactions: stats.totalTransactions,
          totalAmount: stats.totalAmount,
          averageAmount: stats.totalTransactions > 0 ? stats.totalAmount / stats.totalTransactions : 0,
          uniqueUsers: stats.users ? stats.users.size : 0,
          successRate
        });
      }
      
      // Sort by total amount (descending)
      categories.sort((a, b) => b.totalAmount - a.totalAmount);
      
      return categories;
    },
    
    getUserSegmentation: () => {
      const segments = {
        highValue: [], // Top 20% by spending
        mediumValue: [], // Middle 60%
        lowValue: [], // Bottom 20%
        newUsers: [],
        inactiveUsers: []
      };
      
      const allUsers = Object.entries(analytics.userStats || {});
      
      // Sort users by total amount
      allUsers.sort((a, b) => b[1].totalAmount - a[1].totalAmount);
      
      // Segment by spending
      const highValueCount = Math.ceil(allUsers.length * 0.2);
      const mediumValueCount = Math.ceil(allUsers.length * 0.6);
      
      allUsers.forEach(([userId, stats], index) => {
        const userData = {
          userId,
          totalAmount: stats.totalAmount,
          totalTransactions: stats.totalTransactions,
          lastTransaction: stats.lastTransaction,
          favoriteCategory: stats.favoriteCategory
        };
        
        if (index < highValueCount) {
          segments.highValue.push(userData);
        } else if (index < highValueCount + mediumValueCount) {
          segments.mediumValue.push(userData);
        } else {
          segments.lowValue.push(userData);
        }
        
        // Check for new users (first transaction within last 7 days)
        const firstTransaction = moment(stats.firstTransaction);
        const daysSinceFirst = moment().diff(firstTransaction, 'days');
        if (daysSinceFirst <= 7) {
          segments.newUsers.push(userData);
        }
        
        // Check for inactive users (no transaction in last 30 days)
        const lastTransaction = moment(stats.lastTransaction);
        const daysSinceLast = moment().diff(lastTransaction, 'days');
        if (daysSinceLast > 30) {
          segments.inactiveUsers.push(userData);
        }
      });
      
      return segments;
    },
    
    generatePerformanceReport: (startDate, endDate) => {
      const start = moment(startDate);
      const end = moment(endDate);
      const days = end.diff(start, 'days') + 1;
      
      const report = {
        period: `${startDate} to ${endDate}`,
        days: days,
        summary: {
          totalTransactions: 0,
          totalAmount: 0,
          completed: 0,
          failed: 0,
          pending: 0,
          averageDailyTransactions: 0,
          averageTransactionValue: 0
        },
        dailyBreakdown: [],
        categoryBreakdown: {},
        userActivity: {
          activeUsers: 0,
          newUsers: 0,
          returningUsers: 0
        },
        recommendations: []
      };
      
      // Collect data for the period
      for (let i = 0; i < days; i++) {
        const currentDate = moment(start).add(i, 'days').format('YYYY-MM-DD');
        const dailyData = analytics.daily[currentDate] || {
          totalTransactions: 0,
          totalAmount: 0,
          completed: 0,
          failed: 0,
          pending: 0
        };
        
        report.dailyBreakdown.push({
          date: currentDate,
          ...dailyData
        });
        
        report.summary.totalTransactions += dailyData.totalTransactions;
        report.summary.totalAmount += dailyData.totalAmount;
        report.summary.completed += dailyData.completed;
        report.summary.failed += dailyData.failed;
        report.summary.pending += dailyData.pending;
      }
      
      // Calculate averages
      report.summary.averageDailyTransactions = report.summary.totalTransactions / days;
      report.summary.averageTransactionValue = report.summary.totalTransactions > 0 ? 
        report.summary.totalAmount / report.summary.totalTransactions : 0;
      
      // Get category breakdown for the period
      for (const dailyData of report.dailyBreakdown) {
        if (dailyData.byCategory) {
          for (const [category, count] of Object.entries(dailyData.byCategory)) {
            report.categoryBreakdown[category] = (report.categoryBreakdown[category] || 0) + count;
          }
        }
      }
      
      // User activity analysis
      const activeUsers = new Set();
      const newUsers = new Set();
      const returningUsers = new Set();
      
      for (const [userId, userStats] of Object.entries(analytics.userStats || {})) {
        const lastTransaction = moment(userStats.lastTransaction);
        if (lastTransaction.isBetween(start, end, 'day', '[]')) {
          activeUsers.add(userId);
          
          const firstTransaction = moment(userStats.firstTransaction);
          if (firstTransaction.isBetween(start, end, 'day', '[]')) {
            newUsers.add(userId);
          } else {
            returningUsers.add(userId);
          }
        }
      }
      
      report.userActivity.activeUsers = activeUsers.size;
      report.userActivity.newUsers = newUsers.size;
      report.userActivity.returningUsers = returningUsers.size;
      
      // Generate recommendations
      const successRate = report.summary.totalTransactions > 0 ? 
        (report.summary.completed / report.summary.totalTransactions) * 100 : 0;
      
      if (successRate < 80) {
        report.recommendations.push(`⚠️ Low success rate (${successRate.toFixed(1)}%). Investigate failed transactions.`);
      }
      
      if (report.summary.failed > report.summary.completed * 0.1) {
        report.recommendations.push(`⚠️ High failure rate. Consider improving system reliability.`);
      }
      
      if (report.userActivity.newUsers < report.userActivity.activeUsers * 0.1) {
        report.recommendations.push(`📈 Low new user acquisition. Consider marketing campaigns.`);
      }
      
      if (report.userActivity.returningUsers < report.userActivity.activeUsers * 0.3) {
        report.recommendations.push(`🔄 Low user retention. Consider loyalty programs or engagement campaigns.`);
      }
      
      return report;
    },
    
    exportAnalyticsData: async (format = 'json', options = {}) => {
      try {
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const fileName = `analytics_export_${timestamp}`;
        const fs = require('fs').promises;
        const path = require('path');
        const ExcelJS = require('exceljs');
        
        const filePath = path.join(options.exportsDir || __dirname, `${fileName}.${format}`);
        
        switch (format.toLowerCase()) {
          case 'json':
            const exportData = {
              metadata: {
                exportedAt: new Date().toISOString(),
                period: 'all_time',
                userCount: Object.keys(analytics.userStats || {}).length,
                totalTransactions: Object.values(analytics.daily || {}).reduce((sum, day) => sum + day.totalTransactions, 0)
              },
              daily: analytics.daily,
              weekly: analytics.weekly,
              monthly: analytics.monthly,
              userStats: analytics.userStats,
              categoryStats: Object.fromEntries(
                Object.entries(analytics.categoryStats || {}).map(([cat, stats]) => [
                  cat,
                  { ...stats, users: Array.from(stats.users || []) }
                ])
              ),
              forecast: analyticsManager.getRevenueForecast(),
              categories: analyticsManager.getCategoryPerformance(),
              segments: analyticsManager.getUserSegmentation()
            };
            
            await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
            return { path: filePath, format: 'json' };
            
          case 'csv':
            // Create CSV for daily stats
            let csvContent = 'Date,Transactions,Amount,Completed,Failed,Pending\n';
            
            const sortedDates = Object.keys(analytics.daily || {}).sort();
            for (const date of sortedDates) {
              const day = analytics.daily[date];
              csvContent += `${date},${day.totalTransactions},${day.totalAmount},${day.completed},${day.failed},${day.pending}\n`;
            }
            
            await fs.writeFile(filePath, csvContent);
            return { path: filePath, format: 'csv' };
            
          case 'excel':
            const workbook = new ExcelJS.Workbook();
            
            // Daily Stats Sheet
            const dailySheet = workbook.addWorksheet('Daily Stats');
            dailySheet.columns = [
              { header: 'Date', key: 'date', width: 15 },
              { header: 'Transactions', key: 'transactions', width: 12 },
              { header: 'Amount (₦)', key: 'amount', width: 15 },
              { header: 'Completed', key: 'completed', width: 10 },
              { header: 'Failed', key: 'failed', width: 10 },
              { header: 'Pending', key: 'pending', width: 10 }
            ];
            
            const sortedDaily = Object.entries(analytics.daily || {}).sort((a, b) => a[0].localeCompare(b[0]));
            sortedDaily.forEach(([date, data]) => {
              dailySheet.addRow({
                date,
                transactions: data.totalTransactions,
                amount: data.totalAmount,
                completed: data.completed,
                failed: data.failed,
                pending: data.pending
              });
            });
            
            // Category Performance Sheet
            const categorySheet = workbook.addWorksheet('Category Performance');
            categorySheet.columns = [
              { header: 'Category', key: 'category', width: 20 },
              { header: 'Transactions', key: 'transactions', width: 12 },
              { header: 'Amount (₦)', key: 'amount', width: 15 },
              { header: 'Avg Amount', key: 'avgAmount', width: 12 },
              { header: 'Unique Users', key: 'users', width: 12 },
              { header: 'Success Rate %', key: 'successRate', width: 12 }
            ];
            
            const categories = analyticsManager.getCategoryPerformance();
            categories.forEach(cat => {
              categorySheet.addRow({
                category: cat.category,
                transactions: cat.totalTransactions,
                amount: cat.totalAmount,
                avgAmount: cat.averageAmount,
                users: cat.uniqueUsers,
                successRate: cat.successRate.toFixed(2)
              });
            });
            
            // User Segmentation Sheet
            const userSheet = workbook.addWorksheet('User Segments');
            userSheet.columns = [
              { header: 'Segment', key: 'segment', width: 20 },
              { header: 'User Count', key: 'count', width: 12 },
              { header: 'Total Amount (₦)', key: 'amount', width: 15 },
              { header: 'Avg per User', key: 'avgPerUser', width: 15 }
            ];
            
            const segments = analyticsManager.getUserSegmentation();
            const segmentData = [
              { segment: 'High Value Users', data: segments.highValue },
              { segment: 'Medium Value Users', data: segments.mediumValue },
              { segment: 'Low Value Users', data: segments.lowValue },
              { segment: 'New Users', data: segments.newUsers },
              { segment: 'Inactive Users', data: segments.inactiveUsers }
            ];
            
            segmentData.forEach(segment => {
              const totalAmount = segment.data.reduce((sum, user) => sum + user.totalAmount, 0);
              userSheet.addRow({
                segment: segment.segment,
                count: segment.data.length,
                amount: totalAmount,
                avgPerUser: segment.data.length > 0 ? totalAmount / segment.data.length : 0
              });
            });
            
            await workbook.xlsx.writeFile(filePath);
            return { path: filePath, format: 'excel' };
            
          default:
            throw new Error(`Unsupported format: ${format}`);
        }
      } catch (error) {
        console.error('❌ Analytics export error:', error);
        throw error;
      }
    },
    
    clearAnalytics: async () => {
      try {
        analytics.daily = {};
        analytics.weekly = {};
        analytics.monthly = {};
        analytics.hourly = {};
        analytics.userStats = {};
        analytics.categoryStats = {};
        
        await saveData(analyticsFile, analytics);
        return true;
      } catch (error) {
        console.error('❌ Clear analytics error:', error);
        return false;
      }
    },
    
    getSystemHealth: () => {
      const now = moment();
      const today = now.format('YYYY-MM-DD');
      const yesterday = now.subtract(1, 'day').format('YYYY-MM-DD');
      
      const todayStats = analytics.daily[today] || {
        totalTransactions: 0,
        totalAmount: 0,
        completed: 0,
        failed: 0,
        pending: 0
      };
      
      const yesterdayStats = analytics.daily[yesterday] || {
        totalTransactions: 0,
        totalAmount: 0
      };
      
      const transactionGrowth = yesterdayStats.totalTransactions > 0 ?
        ((todayStats.totalTransactions - yesterdayStats.totalTransactions) / yesterdayStats.totalTransactions) * 100 : 0;
      
      const revenueGrowth = yesterdayStats.totalAmount > 0 ?
        ((todayStats.totalAmount - yesterdayStats.totalAmount) / yesterdayStats.totalAmount) * 100 : 0;
      
      const successRate = todayStats.totalTransactions > 0 ?
        (todayStats.completed / todayStats.totalTransactions) * 100 : 0;
      
      return {
        date: today,
        transactions: todayStats.totalTransactions,
        revenue: todayStats.totalAmount,
        successRate: successRate,
        failureRate: todayStats.totalTransactions > 0 ? (todayStats.failed / todayStats.totalTransactions) * 100 : 0,
        transactionGrowth: transactionGrowth,
        revenueGrowth: revenueGrowth,
        activeUsers: Object.keys(analytics.userStats || {}).filter(userId => {
          const lastTransaction = analytics.userStats[userId]?.lastTransaction;
          return lastTransaction && moment(lastTransaction).isAfter(now.subtract(30, 'days'));
        }).length,
        newUsers: Object.keys(analytics.userStats || {}).filter(userId => {
          const firstTransaction = analytics.userStats[userId]?.firstTransaction;
          return firstTransaction && moment(firstTransaction).isAfter(now.subtract(7, 'days'));
        }).length
      };
    }
  };
  
  return analyticsManager;
};