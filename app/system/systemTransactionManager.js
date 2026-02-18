// app/system/systemTransactionManager.js
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { format } = require('@fast-csv/format');

const { saveData, systemTransactionsFile } = require('../storage/loaders');
const { escapeMarkdownV2 } = require('../utils/markdownHelpers');

module.exports = function createSystemTransactionManager(
  systemTransactions, 
  apiResponseManager, 
  users,
  exportsDir
) {
  
  // Helper function for this module
  function formatCurrency(amount) {
    const formatted = `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return escapeMarkdownV2(formatted);
  }
  
  const systemTransactionManager = {
    // Record a new system transaction with API responses
    recordTransaction: async (transactionData) => {
      try {
        const txId = transactionData.id || `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const transaction = {
          id: txId,
          timestamp: new Date().toISOString(),
          ...transactionData,
          id: txId,
          apiResponses: []
        };
        
        systemTransactions.push(transaction);
        
        // Keep only last 5000 transactions to prevent memory bloat
        if (systemTransactions.length > 5000) {
          systemTransactions = systemTransactions.slice(-5000);
        }
        
        await saveData(systemTransactionsFile, systemTransactions);
        console.log(`📊 System transaction recorded: ${txId} - ${transactionData.type || 'unknown'} - ${transactionData.status || 'pending'}`);
        
        return transaction;
      } catch (error) {
        console.error('❌ Error recording system transaction:', error);
        return null;
      }
    },
    
    // Record transaction with API response
    recordTransactionWithApiResponse: async (transactionData, apiName, requestData, responseData, apiStatus = 'success') => {
      try {
        const transaction = await systemTransactionManager.recordTransaction(transactionData);
        if (transaction && apiResponseManager) {
          await apiResponseManager.saveResponse(
            transaction.id,
            apiName,
            requestData,
            responseData,
            apiStatus
          );
        }
        return transaction;
      } catch (error) {
        console.error('❌ Error recording transaction with API response:', error);
        return null;
      }
    },
    
    // ========== SYNCHRONIZED TRANSACTION RECORDING ==========
    recordAnyTransaction: async (userId, txData) => {
      const user = users[userId];
      if (!user) return null;
      
      const txId = txData.id || `TX${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      let category = 'general';
      let description = txData.description || 'User transaction';
      
      const typeLower = (txData.type || '').toLowerCase();
      
      if (typeLower.includes('airtime')) {
        category = 'airtime';
        description = `Airtime purchase for ${txData.phone || 'unknown'} (${txData.network || 'unknown'})`;
      } else if (typeLower.includes('data')) {
        category = 'data';
        description = `Data purchase for ${txData.phone || 'unknown'} (${txData.network || 'unknown'}) - ${txData.planName || txData.dataPlan || ''}`;
      } else if (typeLower.includes('deposit') || typeLower.includes('credit')) {
        category = 'deposit';
        description = `Wallet deposit - ${txData.method || 'unknown method'}`;
      } else if (typeLower.includes('litemonie') || typeLower.includes('transfer')) {
        category = 'p2p_transfer';
      } else if (typeLower.includes('bank')) {
        category = 'bank_transfer';
      } else if (typeLower.includes('tv')) {
        category = 'tv_subscription';
      } else if (typeLower.includes('electricity') || typeLower.includes('light')) {
        category = 'electricity';
      } else if (typeLower.includes('exam')) {
        category = 'exam_pin';
      } else if (typeLower.includes('card')) {
        category = 'card_purchase';
      } else if (typeLower.includes('device')) {
        category = 'device_financing';
      }
      
      const transaction = {
        id: txId,
        timestamp: new Date().toISOString(),
        type: txData.type || category,
        category: category,
        userId: userId,
        telegramId: userId,
        amount: parseFloat(txData.amount) || 0,
        status: txData.status || 'completed',
        description: description,
        reference: txData.reference || txData.id || txId,
        phone: txData.phone,
        network: txData.network,
        dataPlan: txData.planName || txData.dataPlan,
        user: {
          telegramId: userId,
          firstName: user.firstName || 'User',
          lastName: user.lastName || '',
          username: user.username
        },
        apiResponses: txData.apiResponses || [],
        metadata: {
          ...txData,
          recordedAt: new Date().toISOString(),
          source: 'transaction_history_sync'
        }
      };
      
      return await systemTransactionManager.recordTransaction(transaction);
    },
    
    // ========== ADVANCED TRANSACTION QUERY METHODS ==========
    getTransactionWithDetails: (transactionId) => {
      const transaction = systemTransactions.find(tx => tx.id === transactionId);
      if (!transaction) return null;
      
      let apiResponseDetails = [];
      if (apiResponseManager) {
        apiResponseDetails = apiResponseManager.getResponses(transactionId);
      }
      
      return {
        ...transaction,
        apiResponses: apiResponseDetails,
        hasApiResponses: apiResponseDetails.length > 0
      };
    },
    
    getTransactionWithApiDetails: (transactionId) => {
      const transaction = systemTransactions.find(tx => tx.id === transactionId);
      if (!transaction) return null;
      
      const apiResponses = apiResponseManager ? apiResponseManager.getResponses(transactionId) : [];
      const user = users[transaction.userId] || users[transaction.telegramId];
      
      return {
        transaction: transaction,
        user: user ? {
          id: user.telegramId,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          username: user.username,
          phone: user.phone,
          email: user.email,
          wallet: user.wallet,
          kycStatus: user.kycStatus
        } : null,
        apiResponses: apiResponses,
        apiResponseCount: apiResponses.length,
        rawApiResponses: JSON.stringify(apiResponses, null, 2)
      };
    },
    
    // ========== ENHANCED SEARCH WITH API RESPONSE FILTERING ==========
    searchTransactions: (filters = {}) => {
      let results = [...systemTransactions];
      
      // Apply filters
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toString().toLowerCase();
        results = results.filter(tx => {
          return (
            (tx.id && tx.id.toString().toLowerCase().includes(searchTerm)) ||
            (tx.description && tx.description.toString().toLowerCase().includes(searchTerm)) ||
            (tx.phone && tx.phone.toString().toLowerCase().includes(searchTerm)) ||
            (tx.reference && tx.reference.toString().toLowerCase().includes(searchTerm)) ||
            (tx.userId && tx.userId.toString().includes(searchTerm)) ||
            (tx.user && tx.user.firstName && tx.user.firstName.toString().toLowerCase().includes(searchTerm)) ||
            (tx.user && tx.user.lastName && tx.user.lastName.toString().toLowerCase().includes(searchTerm)) ||
            (tx.type && tx.type.toString().toLowerCase().includes(searchTerm)) ||
            (tx.category && tx.category.toString().toLowerCase().includes(searchTerm)) ||
            (tx.network && tx.network.toString().toLowerCase().includes(searchTerm))
          );
        });
      }
      
      if (filters.type) {
        results = results.filter(tx => tx.type === filters.type);
      }
      
      if (filters.category) {
        results = results.filter(tx => tx.category === filters.category);
      }
      
      if (filters.status) {
        results = results.filter(tx => tx.status === filters.status);
      }
      
      if (filters.userId) {
        results = results.filter(tx => tx.userId === filters.userId || tx.telegramId === filters.userId);
      }
      
      if (filters.phone) {
        results = results.filter(tx => tx.phone === filters.phone);
      }
      
      if (filters.network) {
        results = results.filter(tx => tx.network === filters.network);
      }
      
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        results = results.filter(tx => new Date(tx.timestamp) >= start);
      }
      
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        results = results.filter(tx => new Date(tx.timestamp) <= end);
      }
      
      if (filters.minAmount) {
        results = results.filter(tx => (tx.amount || 0) >= parseFloat(filters.minAmount));
      }
      
      if (filters.maxAmount) {
        results = results.filter(tx => (tx.amount || 0) <= parseFloat(filters.maxAmount));
      }
      
      if (filters.hasApiResponse === true) {
        results = results.filter(tx => tx.apiResponses && tx.apiResponses.length > 0);
      } else if (filters.hasApiResponse === false) {
        results = results.filter(tx => !tx.apiResponses || tx.apiResponses.length === 0);
      }
      
      if (filters.apiName) {
        results = results.filter(tx => {
          if (!tx.apiResponses) return false;
          return tx.apiResponses.some(r => r.apiName === filters.apiName);
        });
      }
      
      // Sorting
      const sortField = filters.sortBy || 'timestamp';
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
      
      results.sort((a, b) => {
        if (sortField === 'amount') {
          return (a.amount - b.amount) * sortOrder;
        } else if (sortField === 'timestamp') {
          return (new Date(b.timestamp) - new Date(a.timestamp)) * sortOrder * -1;
        }
        return 0;
      });
      
      // Pagination
      if (filters.page && filters.pageSize) {
        const page = parseInt(filters.page) || 1;
        const pageSize = parseInt(filters.pageSize) || 50;
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        results = results.slice(startIndex, endIndex);
      }
      
      return results;
    },
    
    // ========== TRANSACTION STATISTICS ==========
    getTransactionStats: () => {
      const stats = {
        total: systemTransactions.length,
        completed: systemTransactions.filter(tx => tx.status === 'completed').length,
        pending: systemTransactions.filter(tx => tx.status === 'pending').length,
        failed: systemTransactions.filter(tx => tx.status === 'failed').length,
        byCategory: {},
        byType: {},
        today: systemTransactions.filter(tx => 
          tx.timestamp.startsWith(new Date().toISOString().split('T')[0])
        ).length,
        totalAmount: systemTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
        todayAmount: systemTransactions.filter(tx => 
          tx.timestamp.startsWith(new Date().toISOString().split('T')[0])
        ).reduce((sum, tx) => sum + (tx.amount || 0), 0),
        withApiResponses: systemTransactions.filter(tx => tx.apiResponses && tx.apiResponses.length > 0).length,
        apiCallsByType: {},
        apiSuccessRate: {}
      };
      
      // Count by category and type
      systemTransactions.forEach(tx => {
        const category = tx.category || 'general';
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
        stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
        
        // API call statistics
        if (tx.apiResponses && tx.apiResponses.length > 0) {
          tx.apiResponses.forEach(response => {
            const apiName = response.apiName || 'unknown';
            stats.apiCallsByType[apiName] = (stats.apiCallsByType[apiName] || 0) + 1;
            
            if (!stats.apiSuccessRate[apiName]) {
              stats.apiSuccessRate[apiName] = { success: 0, total: 0 };
            }
            stats.apiSuccessRate[apiName].total++;
            if (response.status === 'success') {
              stats.apiSuccessRate[apiName].success++;
            }
          });
        }
      });
      
      return stats;
    },
    
    // ========== EXPORT FUNCTIONALITY ==========
    exportTransactions: async (transactions, format = 'csv', options = {}) => {
      try {
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const fileName = `transactions_export_${timestamp}`;
        const filePath = path.join(exportsDir, `${fileName}.${format}`);
        
        switch (format.toLowerCase()) {
          case 'csv':
            return await systemTransactionManager.exportToCSV(transactions, filePath, options);
            
          case 'excel':
            return await systemTransactionManager.exportToExcel(transactions, filePath, options);
            
          case 'json':
            return await systemTransactionManager.exportToJSON(transactions, filePath, options);
            
          case 'pdf':
            return await systemTransactionManager.exportToPDF(transactions, filePath, options);
            
          default:
            throw new Error(`Unsupported format: ${format}`);
        }
      } catch (error) {
        console.error('❌ Export error:', error);
        throw error;
      }
    },
    
    exportToCSV: async (transactions, filePath, options = {}) => {
      return new Promise((resolve, reject) => {
        try {
          const csvStream = format({ headers: true });
          const writeStream = fs.createWriteStream(filePath);
          
          csvStream.pipe(writeStream);
          
          const includeApiResponses = options.includeApiResponses !== false;
          
          transactions.forEach(tx => {
            const row = {
              'Transaction ID': tx.id || '',
              'Date': tx.timestamp || '',
              'Type': tx.type || '',
              'Category': tx.category || '',
              'Amount': tx.amount || 0,
              'Status': tx.status || '',
              'User ID': tx.userId || tx.telegramId || '',
              'User Name': tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() : '',
              'Phone': tx.phone || '',
              'Network': tx.network || '',
              'Plan': tx.dataPlan || tx.planName || '',
              'Description': tx.description || '',
              'Reference': tx.reference || '',
              'API Calls': tx.apiResponses ? tx.apiResponses.length : 0,
              'Error': tx.error || ''
            };
            
            if (includeApiResponses && tx.apiResponses && tx.apiResponses.length > 0) {
              row['API Response Summary'] = tx.apiResponses.map(r => `${r.apiName}:${r.status}`).join('; ');
            }
            
            csvStream.write(row);
          });
          
          csvStream.end();
          writeStream.on('finish', () => resolve({ path: filePath, format: 'csv', count: transactions.length }));
          writeStream.on('error', reject);
          
        } catch (error) {
          reject(error);
        }
      });
    },
    
    exportToExcel: async (transactions, filePath, options = {}) => {
      try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Transactions');
        
        // Add headers
        worksheet.columns = [
          { header: 'Transaction ID', key: 'id', width: 25 },
          { header: 'Date', key: 'timestamp', width: 25 },
          { header: 'Type', key: 'type', width: 15 },
          { header: 'Category', key: 'category', width: 15 },
          { header: 'Amount (₦)', key: 'amount', width: 15 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'User ID', key: 'userId', width: 15 },
          { header: 'User Name', key: 'userName', width: 20 },
          { header: 'Phone', key: 'phone', width: 15 },
          { header: 'Network', key: 'network', width: 10 },
          { header: 'Plan', key: 'plan', width: 20 },
          { header: 'Description', key: 'description', width: 30 },
          { header: 'Reference', key: 'reference', width: 25 },
          { header: 'API Calls', key: 'apiCalls', width: 10 },
          { header: 'Error', key: 'error', width: 30 }
        ];
        
        // Add data
        transactions.forEach(tx => {
          const userName = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() : '';
          worksheet.addRow({
            id: tx.id || '',
            timestamp: tx.timestamp || '',
            type: tx.type || '',
            category: tx.category || '',
            amount: tx.amount || 0,
            status: tx.status || '',
            userId: tx.userId || tx.telegramId || '',
            userName: userName,
            phone: tx.phone || '',
            network: tx.network || '',
            plan: tx.dataPlan || tx.planName || '',
            description: tx.description || '',
            reference: tx.reference || '',
            apiCalls: tx.apiResponses ? tx.apiResponses.length : 0,
            error: tx.error || ''
          });
        });
        
        // Add summary sheet
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
          { header: 'Metric', key: 'metric', width: 25 },
          { header: 'Value', key: 'value', width: 20 }
        ];
        
        const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
        const completed = transactions.filter(tx => tx.status === 'completed').length;
        const failed = transactions.filter(tx => tx.status === 'failed').length;
        const pending = transactions.filter(tx => tx.status === 'pending').length;
        const withApiCalls = transactions.filter(tx => tx.apiResponses && tx.apiResponses.length > 0).length;
        
        summarySheet.addRow({ metric: 'Total Transactions', value: transactions.length });
        summarySheet.addRow({ metric: 'Total Amount (₦)', value: totalAmount });
        summarySheet.addRow({ metric: 'Completed', value: completed });
        summarySheet.addRow({ metric: 'Failed', value: failed });
        summarySheet.addRow({ metric: 'Pending', value: pending });
        summarySheet.addRow({ metric: 'Success Rate', value: `${((completed / transactions.length) * 100).toFixed(2)}%` });
        summarySheet.addRow({ metric: 'Transactions with API Calls', value: withApiCalls });
        summarySheet.addRow({ metric: 'API Call Rate', value: `${((withApiCalls / transactions.length) * 100).toFixed(2)}%` });
        
        // Add API Responses sheet if needed
        if (options.includeApiResponses !== false) {
          const apiSheet = workbook.addWorksheet('API Responses');
          apiSheet.columns = [
            { header: 'Transaction ID', key: 'transactionId', width: 25 },
            { header: 'API Name', key: 'apiName', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Timestamp', key: 'timestamp', width: 25 },
            { header: 'Request Summary', key: 'requestSummary', width: 40 },
            { header: 'Response Summary', key: 'responseSummary', width: 40 }
          ];
          
          transactions.forEach(tx => {
            if (tx.apiResponses && tx.apiResponses.length > 0) {
              tx.apiResponses.forEach(response => {
                const requestSummary = response.request ? 
                  JSON.stringify(response.request).substring(0, 100) : '';
                const responseSummary = response.response ? 
                  JSON.stringify(response.response).substring(0, 100) : '';
                
                apiSheet.addRow({
                  transactionId: tx.id,
                  apiName: response.apiName || 'unknown',
                  status: response.status || 'unknown',
                  timestamp: response.timestamp || '',
                  requestSummary: requestSummary,
                  responseSummary: responseSummary
                });
              });
            }
          });
        }
        
        await workbook.xlsx.writeFile(filePath);
        return { path: filePath, format: 'excel', count: transactions.length };
        
      } catch (error) {
        throw error;
      }
    },
    
    exportToJSON: async (transactions, filePath, options = {}) => {
      try {
        const exportData = {
          metadata: {
            exportedAt: new Date().toISOString(),
            transactionCount: transactions.length,
            exportOptions: options
          },
          transactions: transactions.map(tx => {
            const txCopy = { ...tx };
            
            // Include API responses if requested
            if (options.includeApiResponses !== false && tx.apiResponses && apiResponseManager) {
              txCopy.apiResponses = apiResponseManager.getResponses(tx.id);
            }
            
            // Include user details if available
            const userId = tx.userId || tx.telegramId;
            if (userId && users[userId]) {
              txCopy.userDetails = {
                firstName: users[userId].firstName,
                lastName: users[userId].lastName,
                username: users[userId].username,
                phone: users[userId].phone,
                email: users[userId].email,
                wallet: users[userId].wallet
              };
            }
            
            return txCopy;
          }),
          summary: {
            totalAmount: transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
            completed: transactions.filter(tx => tx.status === 'completed').length,
            failed: transactions.filter(tx => tx.status === 'failed').length,
            pending: transactions.filter(tx => tx.status === 'pending').length,
            byType: {},
            byCategory: {}
          }
        };
        
        // Calculate summary statistics
        transactions.forEach(tx => {
          exportData.summary.byType[tx.type] = (exportData.summary.byType[tx.type] || 0) + 1;
          exportData.summary.byCategory[tx.category] = (exportData.summary.byCategory[tx.category] || 0) + 1;
        });
        
        await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
        return { path: filePath, format: 'json', count: transactions.length };
        
      } catch (error) {
        throw error;
      }
    },
    
    exportToPDF: async (transactions, filePath, options = {}) => {
      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ margin: 50 });
          const writeStream = fs.createWriteStream(filePath);
          
          doc.pipe(writeStream);
          
          // Header
          doc.fontSize(20).text('VTU BOT TRANSACTION REPORT', { align: 'center' });
          doc.moveDown();
          
          doc.fontSize(12).text(`Report Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
          doc.text(`Transaction Count: ${transactions.length}`);
          doc.moveDown();
          
          // Summary Section
          doc.fontSize(16).text('SUMMARY', { underline: true });
          doc.moveDown();
          
          const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
          const completed = transactions.filter(tx => tx.status === 'completed').length;
          const failed = transactions.filter(tx => tx.status === 'failed').length;
          const pending = transactions.filter(tx => tx.status === 'pending').length;
          const withApiCalls = transactions.filter(tx => tx.apiResponses && tx.apiResponses.length > 0).length;
          
          doc.fontSize(12).text(`Total Transactions: ${transactions.length}`);
          doc.text(`Total Amount: ₦${totalAmount.toLocaleString()}`);
          doc.text(`Completed: ${completed}`);
          doc.text(`Failed: ${failed}`);
          doc.text(`Pending: ${pending}`);
          doc.text(`With API Calls: ${withApiCalls}`);
          doc.moveDown();
          
          // Transactions Table
          doc.fontSize(16).text('TRANSACTION DETAILS', { underline: true });
          doc.moveDown();
          
          let y = doc.y;
          const startY = y;
          const rowHeight = 60;
          
          transactions.slice(0, 20).forEach((tx, index) => {
            if (y > doc.page.height - 100) {
              doc.addPage();
              y = 50;
            }
            
            doc.fontSize(10).text(`Transaction ${index + 1}:`, 50, y, { width: 500, lineGap: 2 });
            y += 15;
            doc.text(`ID: ${tx.id || 'N/A'}`, 60, y);
            y += 12;
            doc.text(`Type: ${tx.type || 'Unknown'} | Amount: ₦${tx.amount || 0} | Status: ${tx.status || 'Unknown'}`, 60, y);
            y += 12;
            doc.text(`User: ${tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() : 'Unknown'}`, 60, y);
            y += 12;
            doc.text(`Date: ${new Date(tx.timestamp).toLocaleString()}`, 60, y);
            
            y += 20;
          });
          
          if (transactions.length > 20) {
            doc.addPage();
            doc.fontSize(16).text('CONTINUED...', { align: 'center' });
            doc.moveDown();
            y = doc.y;
            
            transactions.slice(20, 40).forEach((tx, index) => {
              if (y > doc.page.height - 100) {
                doc.addPage();
                y = 50;
              }
              
              doc.fontSize(10).text(`Transaction ${index + 21}:`, 50, y, { width: 500, lineGap: 2 });
              y += 15;
              doc.text(`ID: ${tx.id || 'N/A'}`, 60, y);
              y += 12;
              doc.text(`Type: ${tx.type || 'Unknown'} | Amount: ₦${tx.amount || 0} | Status: ${tx.status || 'Unknown'}`, 60, y);
              y += 12;
              doc.text(`User: ${tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() : 'Unknown'}`, 60, y);
              y += 12;
              doc.text(`Date: ${new Date(tx.timestamp).toLocaleString()}`, 60, y);
              
              y += 20;
            });
          }
          
          doc.end();
          
          writeStream.on('finish', () => resolve({ path: filePath, format: 'pdf', count: transactions.length }));
          writeStream.on('error', reject);
          
        } catch (error) {
          reject(error);
        }
      });
    },
    
    // ========== VIEW TRANSACTION DETAILS ==========
    viewTransactionDetails: async (ctx, transactionId) => {
      try {
        const userId = ctx.from.id.toString();
        
        // isAdmin function needs to be passed or imported
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
        
        if (!transactionDetails) {
          // Use simple text without Markdown for error messages
          await ctx.reply(`❌ Transaction not found: ${transactionId}`);
          return;
        }
        
        const { transaction, user, apiResponses } = transactionDetails;
        
        // Format date properly
        const formattedDate = new Date(transaction.timestamp).toLocaleString();
        
        // SIMPLE VERSION - NO MARKDOWN, just plain text
        let message = `🔍 TRANSACTION DETAILS\n\n`;
        message += `📋 Transaction ID: ${transaction.id}\n`;
        message += `📅 Date: ${formattedDate}\n`;
        message += `💰 Amount: ₦${parseFloat(transaction.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        message += `📝 Type: ${transaction.type || 'Unknown'}\n`;
        message += `📂 Category: ${transaction.category || 'General'}\n`;
        message += `📊 Status: ${transaction.status || 'Unknown'}\n`;
        message += `📱 Phone: ${transaction.phone || 'N/A'}\n`;
        message += `📶 Network: ${transaction.network || 'N/A'}\n`;
        message += `📄 Reference: ${transaction.reference || 'N/A'}\n`;
        message += `📝 Description: ${transaction.description || 'N/A'}\n\n`;
        
        if (user) {
          message += `👤 USER DETAILS\n`;
          message += `🆔 User ID: ${user.id || 'N/A'}\n`;
          message += `👤 Name: ${user.name || 'N/A'}\n`;
          message += `📧 Email: ${user.email || 'N/A'}\n`;
          message += `📱 Phone: ${user.phone || 'N/A'}\n`;
          message += `💰 Wallet Balance: ₦${parseFloat(user.wallet || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          message += `🛂 KYC Status: ${user.kycStatus || 'pending'}\n\n`;
        }
        
        message += `📡 API RESPONSES: ${apiResponses.length}\n\n`;
        
        if (apiResponses.length > 0) {
          apiResponses.forEach((response, index) => {
            message += `${index + 1}. ${response.apiName || 'Unknown API'}\n`;
            message += `   📊 Status: ${response.status}\n`;
            
            // Format time properly
            const responseTime = new Date(response.timestamp).toLocaleTimeString();
            message += `   ⏰ Time: ${responseTime}\n`;
            
            // Just show that data exists, not the actual data
            if (response.request) {
              message += `   📥 Request: [JSON data available]\n`;
            }
            
            if (response.response) {
              message += `   📤 Response: [JSON data available]\n`;
            }
            
            message += `\n`;
          });
        } else {
          message += `No API responses recorded for this transaction.\n`;
        }
        
        // Add error if present
        if (transaction.error) {
          message += `\n🚨 ERROR DETAILS\n`;
          message += `${transaction.error}\n`;
        }
        
        // Send as plain text, NO Markdown
        const { Markup } = require('telegraf');
        await ctx.reply(message, {
          parse_mode: undefined,
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📁 Export Full Details', `admin_export_tx_${transaction.id}`)],
            [Markup.button.callback('🔍 View Raw API Data', `admin_view_api_raw_${transaction.id}`)],
            [Markup.button.callback('🔄 Update Status', `admin_update_tx_${transaction.id}`)],
            [Markup.button.callback('🏠 Back to Transactions', 'admin_transaction_tracking')]
          ])
        });
        
      } catch (error) {
        console.error('❌ View transaction details error:', error);
        await ctx.reply('❌ Error loading transaction details.', { parse_mode: undefined });
      }
    },
    
    // ========== VIEW RAW API DATA ==========
    viewRawApiData: async (ctx, transactionId, isAdmin, escapeMarkdownV2) => {
      try {
        const userId = ctx.from.id.toString();
        
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const apiResponses = apiResponseManager ? apiResponseManager.getResponses(transactionId) : [];
        
        if (apiResponses.length === 0) {
          await ctx.reply(`❌ No API responses found for transaction\\: ${escapeMarkdownV2(transactionId)}`, { parse_mode: 'MarkdownV2' });
          return;
        }
        
        let message = `📡 \\*RAW API DATA FOR TRANSACTION\\:\\* \`${escapeMarkdownV2(transactionId)}\`\n\n`;
        
        apiResponses.forEach((response, index) => {
          message += `🔵 \\*API Response ${index + 1}\\:\\* ${escapeMarkdownV2(response.apiName || 'Unknown')}\n\n`;
          message += `📊 \\*Status\\:\\* ${escapeMarkdownV2(response.status)}\n`;
          message += `⏰ \\*Timestamp\\:\\* ${escapeMarkdownV2(response.timestamp)}\n\n`;
          
          message += `📥 \\*REQUEST DATA\\:\\*\n`;
          message += '```json\n';
          message += escapeMarkdownV2(JSON.stringify(response.request || {}, null, 2));
          message += '\n```\n\n';
          
          message += `📤 \\*RESPONSE DATA\\:\\*\n`;
          message += '```json\n';
          message += escapeMarkdownV2(JSON.stringify(response.response || {}, null, 2));
          message += '\n```\n\n';
          
          message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        });
        
        // Split message if too long
        const maxLength = 4000;
        if (message.length > maxLength) {
          const parts = [];
          while (message.length > 0) {
            parts.push(message.substring(0, maxLength));
            message = message.substring(maxLength);
          }
          
          for (let i = 0; i < parts.length; i++) {
            await ctx.reply(parts[i], {
              parse_mode: 'MarkdownV2',
              disable_web_page_preview: true
            });
          }
        } else {
          const { Markup } = require('telegraf');
          await ctx.reply(message, {
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 Back to Summary', `admin_view_tx_${transactionId}`)],
              [Markup.button.callback('🏠 Back to Transactions', 'admin_transaction_tracking')]
            ])
          });
        }
        
      } catch (error) {
        console.error('❌ View raw API data error:', error);
        await ctx.reply('❌ Error loading raw API data\\.', { parse_mode: 'MarkdownV2' });
      }
    },
    
    // ========== UPDATE TRANSACTION STATUS ==========
    updateTransactionStatus: async (ctx, transactionId, newStatus, notes = '', isAdmin, escapeMarkdownV2) => {
      try {
        const userId = ctx.from.id.toString();
        
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const transaction = systemTransactions.find(tx => tx.id === transactionId);
        if (!transaction) {
          await ctx.reply(`❌ Transaction not found: ${escapeMarkdownV2(transactionId)}`, { parse_mode: 'MarkdownV2' });
          return;
        }
        
        const oldStatus = transaction.status;
        transaction.status = newStatus;
        transaction.updatedAt = new Date().toISOString();
        transaction.updatedBy = userId;
        
        if (notes) {
          transaction.adminNotes = transaction.adminNotes ? 
            `${transaction.adminNotes}\n${notes}` : notes;
        }
        
        await saveData(systemTransactionsFile, systemTransactions);
        
        await ctx.reply(
          `✅ \\*Transaction Status Updated\\*\n\n` +
          `📋 \\*Transaction ID\\:\\* \`${escapeMarkdownV2(transactionId)}\`\n` +
          `📊 \\*Old Status\\:\\* ${escapeMarkdownV2(oldStatus)}\n` +
          `📊 \\*New Status\\:\\* ${escapeMarkdownV2(newStatus)}\n` +
          `👤 \\*Updated by\\:\\* Admin\n` +
          `📝 \\*Notes\\:\\* ${escapeMarkdownV2(notes || 'No notes provided')}`,
          { parse_mode: 'MarkdownV2' }
        );
        
        return transaction;
      } catch (error) {
        console.error('❌ Update transaction status error:', error);
        throw error;
      }
    },
    
    // ========== EXPORT SINGLE TRANSACTION ==========
    exportTransaction: async (transactionId, format = 'json') => {
      try {
        const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
        if (!transactionDetails) {
          throw new Error('Transaction not found');
        }
        
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const fileName = `transaction_${transactionId}_${timestamp}`;
        const filePath = path.join(exportsDir, `${fileName}.${format}`);
        
        switch (format.toLowerCase()) {
          case 'json':
            await fs.writeFile(filePath, JSON.stringify(transactionDetails, null, 2));
            return { path: filePath, format: 'json' };
            
          case 'txt':
            let textContent = `TRANSACTION DETAILS\n`;
            textContent += `===================\n\n`;
            textContent += `Transaction ID: ${transactionDetails.transaction.id}\n`;
            textContent += `Date: ${transactionDetails.transaction.timestamp}\n`;
            textContent += `Type: ${transactionDetails.transaction.type}\n`;
            textContent += `Amount: ${transactionDetails.transaction.amount}\n`;
            textContent += `Status: ${transactionDetails.transaction.status}\n\n`;
            
            if (transactionDetails.user) {
              textContent += `USER DETAILS\n`;
              textContent += `============\n`;
              textContent += `User ID: ${transactionDetails.user.id}\n`;
              textContent += `Name: ${transactionDetails.user.name}\n`;
              textContent += `Phone: ${transactionDetails.user.phone}\n`;
              textContent += `Email: ${transactionDetails.user.email}\n\n`;
            }
            
            textContent += `API RESPONSES\n`;
            textContent += `=============\n`;
            transactionDetails.apiResponses.forEach((response, index) => {
              textContent += `API ${index + 1}: ${response.apiName}\n`;
              textContent += `Status: ${response.status}\n`;
              textContent += `Request: ${JSON.stringify(response.request, null, 2)}\n`;
              textContent += `Response: ${JSON.stringify(response.response, null, 2)}\n\n`;
            });
            
            await fs.writeFile(filePath, textContent);
            return { path: filePath, format: 'txt' };
            
          default:
            throw new Error(`Unsupported format: ${format}`);
        }
      } catch (error) {
        console.error('❌ Export transaction error:', error);
        throw error;
      }
    }
  };
  
  // Note: isAdmin function needs to be passed or imported separately
  // For now, we'll leave it as a placeholder and it should be set from the main file
  
  return systemTransactionManager;
};