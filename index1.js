// ==================== INDEX.JS ====================
// MAIN BOT FILE - ALL FEATURES, HANDLERS, CALLBACKS
// ==================================================

const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { format } = require('@fast-csv/format');

// ========== IMPORTS FROM OTHER 3 FILES ==========
const { CONFIG, NETWORK_CODES, TV_PROVIDERS, ELECTRICITY_DISCOS, EXAM_TYPES } = require('./config');
const { 
  users, transactions, virtualAccountsData, sessions, systemTransactions, analytics, apiResponses,
  getUsers, setUsers, getTransactions, setTransactions, getVirtualAccounts, setVirtualAccounts,
  getSessions, setSessions, getSystemTransactions, setSystemTransactions,
  getAnalytics, setAnalytics, getApiResponses, setApiResponses,
  exportsDir, initStorage, loadData, saveAllData, setupAutoSave
} = require('./database');
const {
  escapeMarkdownV2, escapeMarkdown, formatCurrency, formatCurrencyOld,
  formatPhoneNumberForVTU, validatePhoneNumber, isValidEmail,
  isAdmin, initUser, checkKYCAndPIN
} = require('./utils');

// ========== FEATURE IMPORTS ==========
const buyAirtime = require('./app/buyAirtime');
const buyData = require('./app/buyData');
const depositFunds = require('./app/depositFunds');
const walletBalance = require('./app/walletBalance');
const transactionHistory = require('./app/transactionHistory');
const admin = require('./app/admin');
const kyc = require('./app/kyc');
const sendMoney = require('./app/sendmoney');
const buyTVSubscription = require('./app/Bill/tv');
const buyElectricity = require('./app/Bill/light');
const buyExamPins = require('./app/Bill/exam');
const buyCardPins = require('./app/Card pins/buyCardPins');
const liteLight = require('./app/litelight');
const DeviceLockApp = require('./app/deviceCredit/handlers/DeviceLockApp');

// ========== GLOBAL VARIABLES ==========
let deviceHandler = null;
let deviceCreditCallbacks = {};
let deviceLockApp = null;
let miniAppCallbacks = {};

console.log('🚀 VTU Bot Starting with API-RESPONSE ENHANCED TRANSACTION TRACKING + MINI APP...');

// Debug environment
console.log('\n🔍 ENVIRONMENT VARIABLES DEBUG:');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ SET' : '❌ NOT SET');
console.log('VTU_API_KEY:', process.env.VTU_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('MONNIFY_API_KEY:', process.env.MONNIFY_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('MONNIFY_SECRET_KEY:', process.env.MONNIFY_SECRET_KEY ? '✅ SET' : '❌ NOT SET');
console.log('MONNIFY_CONTRACT_CODE:', process.env.MONNIFY_CONTRACT_CODE ? '✅ SET' : '❌ NOT SET');
console.log('ADMIN_ID:', process.env.ADMIN_ID ? '✅ SET' : '❌ NOT SET');
// ==================== API RESPONSE STORAGE ====================
const apiResponseManager = {
  saveResponse: async (transactionId, apiName, requestData, responseData, status = 'success') => {
    try {
      const apiResponses = getApiResponses();
      if (!apiResponses[transactionId]) {
        apiResponses[transactionId] = [];
      }
      
      const apiResponse = {
        id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        transactionId: transactionId,
        apiName: apiName,
        request: requestData,
        response: responseData,
        status: status,
        timestamp: new Date().toISOString()
      };
      
      apiResponses[transactionId].push(apiResponse);
      setApiResponses(apiResponses);
      
      const systemTransactions = getSystemTransactions();
      const txIndex = systemTransactions.findIndex(tx => tx.id === transactionId);
      if (txIndex !== -1) {
        if (!systemTransactions[txIndex].apiResponses) {
          systemTransactions[txIndex].apiResponses = [];
        }
        systemTransactions[txIndex].apiResponses.push(apiResponse);
        setSystemTransactions(systemTransactions);
      }
      
      await saveAllData();
      console.log(`📡 API Response saved for transaction: ${transactionId} - ${apiName}`);
      return apiResponse;
    } catch (error) {
      console.error('❌ Error saving API response:', error);
      return null;
    }
  },
  
  getResponses: (transactionId) => {
    const apiResponses = getApiResponses();
    return apiResponses[transactionId] || [];
  },
  
  getResponseDetails: (transactionId, apiName = null) => {
    const apiResponses = getApiResponses();
    const responses = apiResponses[transactionId] || [];
    if (apiName) {
      return responses.filter(r => r.apiName === apiName);
    }
    return responses;
  },
  
  clearResponses: async (transactionId) => {
    try {
      const apiResponses = getApiResponses();
      delete apiResponses[transactionId];
      setApiResponses(apiResponses);
      await saveAllData();
      return true;
    } catch (error) {
      console.error('❌ Error clearing API responses:', error);
      return false;
    }
  }
};

// ==================== ENHANCED TRANSACTION TRACKING SYSTEM ====================
const systemTransactionManager = {
  recordTransaction: async (transactionData) => {
    try {
      const systemTransactions = getSystemTransactions();
      const txId = transactionData.id || `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const transaction = {
        id: txId,
        timestamp: new Date().toISOString(),
        ...transactionData,
        id: txId,
        apiResponses: []
      };
      
      systemTransactions.push(transaction);
      
      if (systemTransactions.length > 5000) {
        setSystemTransactions(systemTransactions.slice(-5000));
      } else {
        setSystemTransactions(systemTransactions);
      }
      
      await saveAllData();
      console.log(`📊 System transaction recorded: ${txId} - ${transactionData.type || 'unknown'} - ${transactionData.status || 'pending'}`);
      
      return transaction;
    } catch (error) {
      console.error('❌ Error recording system transaction:', error);
      return null;
    }
  },
  
  recordTransactionWithApiResponse: async (transactionData, apiName, requestData, responseData, apiStatus = 'success') => {
    try {
      const transaction = await systemTransactionManager.recordTransaction(transactionData);
      if (transaction) {
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
  
  recordAnyTransaction: async (userId, txData) => {
    const users = getUsers();
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
  
  getTransactionWithDetails: (transactionId) => {
    const systemTransactions = getSystemTransactions();
    const transaction = systemTransactions.find(tx => tx.id === transactionId);
    if (!transaction) return null;
    
    const apiResponseDetails = apiResponseManager.getResponses(transactionId);
    
    return {
      ...transaction,
      apiResponses: apiResponseDetails,
      hasApiResponses: apiResponseDetails.length > 0
    };
  },
  
  getTransactionWithApiDetails: (transactionId) => {
    const systemTransactions = getSystemTransactions();
    const users = getUsers();
    const transaction = systemTransactions.find(tx => tx.id === transactionId);
    if (!transaction) return null;
    
    const apiResponses = apiResponseManager.getResponses(transactionId);
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
  
  searchTransactions: (filters = {}) => {
    const systemTransactions = getSystemTransactions();
    let results = [...systemTransactions];
    
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
    
    if (filters.type) results = results.filter(tx => tx.type === filters.type);
    if (filters.category) results = results.filter(tx => tx.category === filters.category);
    if (filters.status) results = results.filter(tx => tx.status === filters.status);
    if (filters.userId) results = results.filter(tx => tx.userId === filters.userId || tx.telegramId === filters.userId);
    if (filters.phone) results = results.filter(tx => tx.phone === filters.phone);
    if (filters.network) results = results.filter(tx => tx.network === filters.network);
    
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      results = results.filter(tx => new Date(tx.timestamp) >= start);
    }
    
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      results = results.filter(tx => new Date(tx.timestamp) <= end);
    }
    
    if (filters.minAmount) results = results.filter(tx => (tx.amount || 0) >= parseFloat(filters.minAmount));
    if (filters.maxAmount) results = results.filter(tx => (tx.amount || 0) <= parseFloat(filters.maxAmount));
    
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
    
    if (filters.page && filters.pageSize) {
      const page = parseInt(filters.page) || 1;
      const pageSize = parseInt(filters.pageSize) || 50;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      results = results.slice(startIndex, endIndex);
    }
    
    return results;
  },
  
  getTransactionStats: () => {
    const systemTransactions = getSystemTransactions();
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
    
    systemTransactions.forEach(tx => {
      const category = tx.category || 'general';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
      
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
  
  exportTransactions: async (transactions, format = 'csv', options = {}) => {
    try {
      const timestamp = moment().format('YYYYMMDD_HHmmss');
      const fileName = `transactions_export_${timestamp}`;
      const filePath = path.join(exportsDir, `${fileName}.${format}`);
      
      switch (format.toLowerCase()) {
        case 'csv': return await systemTransactionManager.exportToCSV(transactions, filePath, options);
        case 'excel': return await systemTransactionManager.exportToExcel(transactions, filePath, options);
        case 'json': return await systemTransactionManager.exportToJSON(transactions, filePath, options);
        case 'pdf': return await systemTransactionManager.exportToPDF(transactions, filePath, options);
        default: throw new Error(`Unsupported format: ${format}`);
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
      const users = getUsers();
      const exportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          transactionCount: transactions.length,
          exportOptions: options
        },
        transactions: transactions.map(tx => {
          const txCopy = { ...tx };
          
          if (options.includeApiResponses !== false && tx.apiResponses) {
            txCopy.apiResponses = apiResponseManager.getResponses(tx.id);
          }
          
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
        
        doc.fontSize(20).text('VTU BOT TRANSACTION REPORT', { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(12).text(`Report Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        doc.text(`Transaction Count: ${transactions.length}`);
        doc.moveDown();
        
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
        
        doc.fontSize(16).text('TRANSACTION DETAILS', { underline: true });
        doc.moveDown();
        
        let y = doc.y;
        
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
        
        doc.end();
        
        writeStream.on('finish', () => resolve({ path: filePath, format: 'pdf', count: transactions.length }));
        writeStream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  },
  
  viewTransactionDetails: async (ctx, transactionId) => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
      
      if (!transactionDetails) {
        await ctx.reply(`❌ Transaction not found: ${transactionId}`);
        return;
      }
      
      const { transaction, user, apiResponses } = transactionDetails;
      const formattedDate = new Date(transaction.timestamp).toLocaleString();
      
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
          const responseTime = new Date(response.timestamp).toLocaleTimeString();
          message += `   ⏰ Time: ${responseTime}\n`;
          message += `\n`;
        });
      } else {
        message += `No API responses recorded for this transaction.\n`;
      }
      
      if (transaction.error) {
        message += `\n🚨 ERROR DETAILS\n`;
        message += `${transaction.error}\n`;
      }
      
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
  
  viewRawApiData: async (ctx, transactionId) => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const apiResponses = apiResponseManager.getResponses(transactionId);
      
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
  
  updateTransactionStatus: async (ctx, transactionId, newStatus, notes = '') => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      const systemTransactions = getSystemTransactions();
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
      
      setSystemTransactions(systemTransactions);
      await saveAllData();
      
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

// ==================== ENHANCED EXPORT MANAGER ====================
const exportManager = {
  generateExport: async (ctx, filters = {}, format = 'csv') => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      await ctx.reply(`🔄 Generating ${format.toUpperCase()} export\\.\\.\\.`, { parse_mode: 'MarkdownV2' });
      
      const transactions = systemTransactionManager.searchTransactions(filters);
      
      if (transactions.length === 0) {
        await ctx.reply('❌ No transactions found for export\\.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      const result = await systemTransactionManager.exportTransactions(transactions, format, {
        includeApiResponses: true
      });
      
      await ctx.reply(
        `✅ \\*Export Generated Successfully\\!\\*\n\n` +
        `📊 \\*Format\\:\\* ${escapeMarkdownV2(format.toUpperCase())}\n` +
        `📋 \\*Transactions\\:\\* ${result.count}\n` +
        `💾 \\*File\\:\\* ${escapeMarkdownV2(path.basename(result.path))}\n\n` +
        `📁 \\*Path\\:\\* \`${escapeMarkdownV2(result.path)}\``,
        { parse_mode: 'MarkdownV2' }
      );
      
      try {
        await ctx.replyWithDocument({
          source: result.path,
          filename: path.basename(result.path)
        });
      } catch (error) {
        console.log('⚠️ Could not send file via Telegram, providing download path instead');
      }
      
      return result;
    } catch (error) {
      console.error('❌ Export generation error:', error);
      await ctx.reply(`❌ Error generating export\\: ${escapeMarkdownV2(error.message)}`, { parse_mode: 'MarkdownV2' });
      return null;
    }
  },
  
  quickExport: async (ctx, type = 'today') => {
    try {
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Admin access only');
        return;
      }
      
      let filters = {};
      const today = new Date().toISOString().split('T')[0];
      
      switch (type) {
        case 'today':
          filters.startDate = today;
          filters.endDate = today;
          break;
        case 'failed':
          filters.status = 'failed';
          break;
        case 'pending':
          filters.status = 'pending';
          break;
        case 'all':
          break;
      }
      
      await ctx.reply(
        `📁 \\*QUICK EXPORT\\: ${escapeMarkdownV2(type.toUpperCase())}\\*\n\n` +
        `Select export format\\:`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 CSV', `admin_export_${type}_csv`),
             Markup.button.callback('📈 Excel', `admin_export_${type}_excel`)],
            [Markup.button.callback('📋 JSON', `admin_export_${type}_json`),
             Markup.button.callback('📄 PDF', `admin_export_${type}_pdf`)],
            [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
          ])
        }
      );
      
      const sessions = getSessions();
      sessions[userId] = {
        ...sessions[userId],
        exportFilters: filters,
        exportType: type
      };
      setSessions(sessions);
      await saveAllData();
    } catch (error) {
      console.error('❌ Quick export error:', error);
      await ctx.answerCbQuery('❌ Error starting export');
    }
  }
};

// ==================== ENHANCED ANALYTICS TRACKING ====================
const analyticsManager = {
  updateAnalytics: async (transaction) => {
    try {
      const analytics = getAnalytics();
      const date = moment(transaction.timestamp);
      const dayKey = date.format('YYYY-MM-DD');
      const weekKey = date.format('YYYY-[W]WW');
      const monthKey = date.format('YYYY-MM');
      const hour = date.hour();
      
      if (!analytics.daily) analytics.daily = {};
      if (!analytics.weekly) analytics.weekly = {};
      if (!analytics.monthly) analytics.monthly = {};
      if (!analytics.hourly) analytics.hourly = {};
      if (!analytics.userStats) analytics.userStats = {};
      if (!analytics.categoryStats) analytics.categoryStats = {};
      
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
      
      const category = transaction.category || 'general';
      if (!daily.byCategory[category]) daily.byCategory[category] = 0;
      daily.byCategory[category]++;
      
      const type = transaction.type || 'unknown';
      if (!daily.byType[type]) daily.byType[type] = 0;
      daily.byType[type]++;
      
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
      
      if (!analytics.hourly[hour]) {
        analytics.hourly[hour] = 0;
      }
      analytics.hourly[hour]++;
      
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
      
      setAnalytics(analytics);
      await saveAllData();
    } catch (error) {
      console.error('❌ Analytics update error:', error);
    }
  },
  
  getAnalyticsReport: (period = 'daily', startDate = null, endDate = null) => {
    const analytics = getAnalytics();
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
    }
    
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
        const users = getUsers();
        const user = users[topSpender];
        const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${topSpender}` : `User ${topSpender}`;
        report.insights.push(`👑 Top spender: ${userName} (₦${topSpendAmount.toLocaleString()})`);
      }
      
      report.insights.push(`👥 Total unique users: ${totalUsers}`);
    }
    
    return report;
  }
};
// ==================== ENHANCED USER METHODS ====================
const userMethods = {
  creditWallet: async (telegramId, amount) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    
    const oldBalance = user.wallet || 0;
    user.wallet = (user.wallet || 0) + parseFloat(amount);
    setUsers(users);
    await saveAllData();
    
    await systemTransactionManager.recordAnyTransaction(telegramId, {
      type: 'wallet_credit',
      amount: amount,
      status: 'completed',
      description: `Wallet credited with ₦${amount}`,
      metadata: { oldBalance, newBalance: user.wallet, action: 'manual_credit' }
    });
    
    return user.wallet;
  },

  debitWallet: async (telegramId, amount, description = 'Wallet debit') => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    
    if (user.wallet < amount) {
      throw new Error('Insufficient balance');
    }
    
    const oldBalance = user.wallet || 0;
    user.wallet = (user.wallet || 0) - parseFloat(amount);
    setUsers(users);
    await saveAllData();
    
    await systemTransactionManager.recordAnyTransaction(telegramId, {
      type: 'wallet_debit',
      amount: amount,
      status: 'completed',
      description: description,
      metadata: { oldBalance, newBalance: user.wallet, action: 'manual_debit' }
    });
    
    return user.wallet;
  },

  findById: async (telegramId) => {
    const users = getUsers();
    return users[telegramId] || null;
  },

  update: async (telegramId, updateData) => {
    const users = getUsers();
    let user = users[telegramId];
    if (!user) await initUser(telegramId);
    
    Object.assign(users[telegramId], updateData);
    setUsers(users);
    await saveAllData();
    return users[telegramId];
  },

  getKycStatus: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) {
      await initUser(telegramId);
      return 'pending';
    }
    return user.kycStatus || 'pending';
  },

  checkKyc: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) {
      await initUser(telegramId);
      return false;
    }
    return (user.kycStatus || 'pending') === 'approved';
  },

  approveKyc: async (telegramId, adminId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    
    user.kycStatus = 'approved';
    user.kycApprovedDate = new Date().toISOString();
    setUsers(users);
    await saveAllData();
    
    await systemTransactionManager.recordTransaction({
      type: 'kyc_approval',
      userId: telegramId,
      telegramId: telegramId,
      amount: 0,
      status: 'completed',
      description: `KYC approved for user ${telegramId}`,
      adminId: adminId,
      user: { telegramId, firstName: user.firstName, lastName: user.lastName, username: user.username }
    });
    
    return user;
  },

  rejectKyc: async (telegramId, reason) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    
    user.kycStatus = 'rejected';
    user.kycRejectedDate = new Date().toISOString();
    user.kycRejectionReason = reason;
    setUsers(users);
    await saveAllData();
    
    await systemTransactionManager.recordTransaction({
      type: 'kyc_rejection',
      userId: telegramId,
      telegramId: telegramId,
      amount: 0,
      status: 'completed',
      description: `KYC rejected for user ${telegramId}: ${reason}`,
      user: { telegramId, firstName: user.firstName, lastName: user.lastName, username: user.username }
    });
    
    return user;
  },

  submitKyc: async (telegramId, kycData) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) throw new Error('User not found');
    
    user.kycStatus = 'submitted';
    user.kycSubmitted = true;
    user.kycSubmittedDate = new Date().toISOString();
    user.kycDocument = kycData.document;
    user.kycDocumentType = kycData.documentType;
    user.kycDocumentNumber = kycData.documentNumber;
    
    if (kycData.firstName) user.firstName = kycData.firstName;
    if (kycData.lastName) user.lastName = kycData.lastName;
    if (kycData.email) user.email = kycData.email;
    if (kycData.phone) user.phone = kycData.phone;
    
    setUsers(users);
    await saveAllData();
    
    await systemTransactionManager.recordTransaction({
      type: 'kyc_submission',
      userId: telegramId,
      telegramId: telegramId,
      amount: 0,
      status: 'pending',
      description: `KYC submitted by user ${telegramId}`,
      user: { telegramId, firstName: user.firstName, lastName: user.lastName, username: user.username }
    });
    
    return user;
  },
  
  getUserWithTransactions: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (!user) return null;
    
    const userTransactions = systemTransactionManager.searchTransactions({ userId: telegramId });
    
    return {
      ...user,
      transactions: userTransactions,
      transactionCount: userTransactions.length,
      totalSpent: userTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
    };
  }
};

// ==================== ENHANCED TRANSACTION METHODS ====================
const transactionMethods = {
  create: async (txData) => {
    const userId = txData.user_id || txData.telegramId;
    const users = getUsers();
    if (!users[userId]) await initUser(userId);
    
    const transactions = getTransactions();
    if (!transactions[userId]) {
      transactions[userId] = [];
    }
    
    const transaction = {
      ...txData,
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString()
    };
    
    transactions[userId].push(transaction);
    setTransactions(transactions);
    await saveAllData();
    
    await systemTransactionManager.recordAnyTransaction(userId, {
      ...transaction,
      source: 'transaction_methods_create'
    });
    
    return transaction;
  },

  findByReference: async (reference) => {
    const transactions = getTransactions();
    for (const userId in transactions) {
      const userTransactions = transactions[userId];
      const found = userTransactions.find(tx => tx.reference === reference);
      if (found) return found;
    }
    return null;
  },
  
  getTransactionWithSync: async (userId, transactionId) => {
    const transactions = getTransactions();
    if (transactions[userId]) {
      const userTx = transactions[userId].find(tx => tx.id === transactionId);
      if (userTx) return userTx;
    }
    
    const systemTx = systemTransactionManager.getTransactionWithDetails(transactionId);
    if (systemTx) return systemTx;
    
    return null;
  },
  
  updateTransactionWithSync: async (userId, transactionId, updates) => {
    const transactions = getTransactions();
    if (transactions[userId]) {
      const index = transactions[userId].findIndex(tx => tx.id === transactionId);
      if (index !== -1) {
        Object.assign(transactions[userId][index], updates);
        setTransactions(transactions);
      }
    }
    
    const systemTransactions = getSystemTransactions();
    const systemTx = systemTransactions.find(tx => tx.id === transactionId);
    if (systemTx) {
      Object.assign(systemTx, updates);
      systemTx.updatedAt = new Date().toISOString();
      setSystemTransactions(systemTransactions);
    }
    
    await saveAllData();
    return true;
  }
};

// ==================== VIRTUAL ACCOUNTS ====================
const virtualAccounts = {
  findByUserId: async (telegramId) => {
    const users = getUsers();
    const user = users[telegramId];
    if (user && user.virtualAccount) {
      return {
        user_id: telegramId,
        bank_name: user.virtualAccount.bank_name,
        account_number: user.virtualAccount.account_number,
        account_name: user.virtualAccount.account_name,
        reference: user.virtualAccount.reference,
        provider: user.virtualAccount.provider || 'billstack',
        created_at: user.virtualAccount.created_at || new Date(),
        is_active: user.virtualAccount.is_active !== undefined ? user.virtualAccount.is_active : true
      };
    }
    return null;
  },

  create: async (accountData) => {
    const userId = accountData.user_id;
    const users = getUsers();
    if (!users[userId]) await initUser(userId);
    
    users[userId].virtualAccount = {
      bank_name: accountData.bank_name,
      account_number: accountData.account_number,
      account_name: accountData.account_name,
      reference: accountData.reference,
      provider: accountData.provider || 'billstack',
      created_at: accountData.created_at || new Date(),
      is_active: accountData.is_active !== undefined ? accountData.is_active : true
    };
    
    users[userId].virtualAccountNumber = accountData.account_number;
    users[userId].virtualAccountBank = accountData.bank_name;
    
    const virtualAccountsData = getVirtualAccounts();
    virtualAccountsData[userId] = users[userId].virtualAccount;
    setVirtualAccounts(virtualAccountsData);
    setUsers(users);
    await saveAllData();
    
    await systemTransactionManager.recordTransaction({
      type: 'virtual_account_creation',
      userId: userId,
      telegramId: userId,
      amount: 0,
      status: 'completed',
      description: `Virtual account created for user ${userId}`,
      accountNumber: accountData.account_number,
      bankName: accountData.bank_name,
      user: {
        telegramId: userId,
        firstName: users[userId].firstName,
        lastName: users[userId].lastName,
        username: users[userId].username
      }
    });
    
    return users[userId].virtualAccount;
  },

  findByAccountNumber: async (accountNumber) => {
    const virtualAccountsData = getVirtualAccounts();
    for (const userId in virtualAccountsData) {
      const account = virtualAccountsData[userId];
      if (account.account_number === accountNumber) {
        return {
          user_id: userId,
          ...account
        };
      }
    }
    return null;
  }
};

// ==================== SESSION MANAGER ====================
const sessionManager = {
  getSession: (userId) => {
    const sessions = getSessions();
    return sessions[userId] || null;
  },
  
  setSession: async (userId, sessionData) => {
    const sessions = getSessions();
    sessions[userId] = sessionData;
    setSessions(sessions);
    await saveAllData();
  },
  
  clearSession: async (userId) => {
    const sessions = getSessions();
    delete sessions[userId];
    setSessions(sessions);
    await saveAllData();
  },
  
  updateSession: async (userId, updates) => {
    const sessions = getSessions();
    if (sessions[userId]) {
      Object.assign(sessions[userId], updates);
      setSessions(sessions);
      await saveAllData();
    }
  }
};
// ==================== DEVICE HANDLER INITIALIZATION ====================
async function initializeDeviceHandler(bot) {
  try {
    if (deviceHandler) {
      deviceHandler.bot = bot;
      deviceHandler.users = getUsers();
      console.log('✅ Device Handler updated with bot instance');
      
      if (!deviceLockApp) {
        deviceLockApp = new DeviceLockApp(bot, deviceHandler);
        miniAppCallbacks = deviceLockApp.getCallbacks();
        console.log('✅ Device Lock Mini App initialized');
      }
      
      return deviceHandler;
    }
    
    console.log('📱 Initializing Device Handler...');
    
    try {
      const DeviceHandler = require('./app/deviceCredit/handlers/DeviceHandler');
      
      const saveDataCallback = async () => {
        try {
          await saveAllData();
          console.log('💾 Device data saved via callback');
        } catch (error) {
          console.error('❌ Error saving data via callback:', error);
        }
      };
      
      const depositSystem = {
        getVirtualAccount: async (userId) => {
          return await virtualAccounts.findByUserId(userId);
        },
        createVirtualAccount: async (userId, accountData) => {
          try {
            const accountNumber = `7${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 10)}`;
            const reference = `VA${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            
            const virtualAccountData = {
              user_id: userId,
              bank_name: 'WEMA BANK',
              account_number: accountNumber,
              account_name: accountData.firstName ? 
                `${accountData.firstName} ${accountData.lastName || ''}`.trim() : 
                `User ${userId}`,
              reference: reference,
              provider: 'billstack',
              created_at: new Date().toISOString(),
              is_active: true
            };
            
            const result = await virtualAccounts.create(virtualAccountData);
            return { success: true, ...virtualAccountData };
          } catch (error) {
            console.error('❌ Error creating virtual account:', error);
            return { success: false, error: error.message };
          }
        },
        virtualAccounts: virtualAccounts
      };
      
      deviceHandler = new DeviceHandler(
        './data', 
        bot, 
        getUsers(), 
        saveDataCallback,
        depositSystem
      );
      
      await deviceHandler.initialize();
      console.log('✅ Device Handler initialized successfully');
      
      deviceLockApp = new DeviceLockApp(bot, deviceHandler);
      miniAppCallbacks = deviceLockApp.getCallbacks();
      console.log('✅ Device Lock Mini App initialized');
      
      deviceCreditCallbacks = deviceHandler.getCallbacks();
      console.log(`📱 Loaded ${Object.keys(deviceCreditCallbacks).length} device financing callbacks`);
      
      return deviceHandler;
    } catch (error) {
      console.error('❌ Failed to initialize device handler:', error);
      console.error('Stack trace:', error.stack);
      return null;
    }
  } catch (error) {
    console.error('❌ Device handler initialization error:', error);
    deviceHandler = null;
    return null;
  }
}

// ==================== ADMIN TRANSACTION TRACKING HANDLERS ====================
async function handleAdminTransactionTracking(ctx) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
      await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
      return;
    }
    
    const stats = systemTransactionManager.getTransactionStats();
    
    await ctx.reply(
      '📊 \\*ADVANCED TRANSACTION TRACKING WITH API RESPONSES\\*\n\n' +
      '📈 \\*System Statistics\\:\\*\n' +
      `📊 \\*Total Transactions\\:\\* ${stats.total}\n` +
      `✅ \\*Completed\\:\\* ${stats.completed}\n` +
      `⏳ \\*Pending\\:\\* ${stats.pending}\n` +
      `❌ \\*Failed\\:\\* ${stats.failed}\n` +
      `📅 \\*Today\\:\\* ${stats.today}\n` +
      `💰 \\*Total Amount\\:\\* ${formatCurrency(stats.totalAmount)}\n` +
      `💵 \\*Today\\'s Amount\\:\\* ${formatCurrency(stats.todayAmount)}\n` +
      `📡 \\*Transactions with API Responses\\:\\* ${stats.withApiResponses}\n\n` +
      '🔍 \\*Advanced Features\\:\\*\n' +
      '👇 \\*Select an option\\:\\*',
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Search Transaction by ID', 'admin_search_tx_id')],
          [Markup.button.callback('🔍 Advanced Search', 'admin_advanced_search')],
          [Markup.button.callback('📁 Quick Export', 'admin_quick_export')],
          [Markup.button.callback('📈 Analytics Dashboard', 'admin_analytics_dashboard')],
          [Markup.button.callback('📋 View All Transactions', 'admin_view_all_transactions')],
          [Markup.button.callback('❌ Failed Transactions', 'admin_view_failed_transactions')],
          [Markup.button.callback('⏳ Pending Transactions', 'admin_view_pending_transactions')],
          [Markup.button.callback('📡 Transactions with API Data', 'admin_view_api_transactions')],
          [Markup.button.callback('🏠 Back to Admin', 'admin_panel')]
        ])
      }
    );
  } catch (error) {
    console.error('❌ Admin transaction tracking error:', error);
    await ctx.reply('❌ Error loading transaction tracking\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function handleSearchTransactionById(ctx) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
      await ctx.answerCbQuery('❌ Admin access only');
      return;
    }
    
    await ctx.reply(
      '🔍 \\*SEARCH TRANSACTION BY ID\\*\n\n' +
      'Enter the Transaction ID to search\\:\n' +
      '\\(Example\\: TX123456789\\)',
      { parse_mode: 'MarkdownV2' }
    );
    
    const sessions = getSessions();
    sessions[userId] = { action: 'admin_search_tx_id', step: 'enter_tx_id' };
    setSessions(sessions);
    await saveAllData();
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('❌ Search transaction by ID error:', error);
    await ctx.answerCbQuery('❌ Error starting search');
  }
}

async function handleViewApiTransactions(ctx, page = 0) {
  try {
    const userId = ctx.from.id.toString();
    
    if (!isAdmin(userId)) {
      await ctx.answerCbQuery('❌ Admin access only');
      return;
    }
    
    const apiTransactions = systemTransactionManager.searchTransactions({ hasApiResponse: true });
    const pageSize = 10;
    const totalPages = Math.ceil(apiTransactions.length / pageSize);
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;
    const pageTransactions = apiTransactions.slice(startIndex, endIndex);
    
    let message = `📡 \\*TRANSACTIONS WITH API RESPONSES\\*\n\n`;
    message += `📊 \\*Total\\:\\* ${apiTransactions.length} transactions\n`;
    message += `💰 \\*Total Amount\\:\\* ${formatCurrency(apiTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
    message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
    
    if (pageTransactions.length === 0) {
      message += 'No transactions with API responses found\\.';
    } else {
      pageTransactions.forEach((tx, index) => {
        const statusEmoji = tx.status === 'completed' ? '✅' : 
                           tx.status === 'failed' ? '❌' : '⏳';
        const amountText = formatCurrency(tx.amount || 0);
        const date = new Date(tx.timestamp).toLocaleDateString();
        const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
        
        message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
        message += `💰 \\*Amount\\:\\* ${amountText}\n`;
        message += `📱 \\*Phone\\:\\* ${escapeMarkdownV2(tx.phone || 'N/A')}\n`;
        message += `📶 \\*Network\\:\\* ${escapeMarkdownV2(tx.network || 'N/A')}\n`;
        message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
        message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
        message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
      });
    }
    
    const keyboard = [];
    if (page > 0) keyboard.push(Markup.button.callback('⬅️ Previous', `admin_api_page_${page - 1}`));
    if (page < totalPages - 1 && pageTransactions.length === pageSize) {
      keyboard.push(Markup.button.callback('Next ➡️', `admin_api_page_${page + 1}`));
    }
    keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
    
    await ctx.reply(message, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard(keyboard)
    });
  } catch (error) {
    console.error('❌ View API transactions error:', error);
    await ctx.reply('❌ Error loading API transactions\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function handleViewAllTransactions(ctx, page = 0) {
  try {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
      await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
      return;
    }
    
    const allTransactions = systemTransactionManager.searchTransactions({});
    const pageSize = 10;
    const totalPages = Math.ceil(allTransactions.length / pageSize);
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;
    const pageTransactions = allTransactions.slice(startIndex, endIndex);
    
    let message = `📋 \\*ALL SYSTEM TRANSACTIONS\\*\n\n`;
    message += `📊 \\*Total\\:\\* ${allTransactions.length} transactions\n`;
    message += `💰 \\*Total Amount\\:\\* ${formatCurrency(allTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
    message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
    
    if (pageTransactions.length === 0) {
      message += 'No transactions found\\.';
    } else {
      pageTransactions.forEach((tx, index) => {
        const statusEmoji = tx.status === 'completed' ? '✅' : 
                           tx.status === 'failed' ? '❌' : '⏳';
        const amountText = formatCurrency(tx.amount || 0);
        const date = new Date(tx.timestamp).toLocaleDateString();
        const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
        const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
        
        message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
        message += `💰 \\*Amount\\:\\* ${amountText}\n`;
        message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
        message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
        message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
        message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
      });
    }
    
    const keyboard = [];
    if (page > 0) keyboard.push(Markup.button.callback('⬅️ Previous', `admin_transactions_page_${page - 1}`));
    if (page < totalPages - 1 && pageTransactions.length === pageSize) {
      keyboard.push(Markup.button.callback('Next ➡️', `admin_transactions_page_${page + 1}`));
    }
    keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
    
    await ctx.reply(message, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard(keyboard)
    });
  } catch (error) {
    console.error('❌ View all transactions error:', error);
    await ctx.reply('❌ Error loading transactions\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function handleViewFailedTransactions(ctx, page = 0) {
  try {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
      await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
      return;
    }
    
    const failedTransactions = systemTransactionManager.searchTransactions({ status: 'failed' });
    const pageSize = 10;
    const totalPages = Math.ceil(failedTransactions.length / pageSize);
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;
    const pageTransactions = failedTransactions.slice(startIndex, endIndex);
    
    let message = `❌ \\*FAILED TRANSACTIONS\\*\n\n`;
    message += `📊 \\*Total Failed\\:\\* ${failedTransactions.length} transactions\n`;
    message += `💸 \\*Total Amount\\:\\* ${formatCurrency(failedTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n`;
    message += `📄 \\*Page\\:\\* ${page + 1}/${totalPages}\n\n`;
    
    if (pageTransactions.length === 0) {
      message += 'No failed transactions found\\.';
    } else {
      pageTransactions.forEach((tx, index) => {
        const amountText = formatCurrency(tx.amount || 0);
        const date = new Date(tx.timestamp).toLocaleString();
        const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
        const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
        
        message += `❌ \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
        message += `💰 \\*Amount\\:\\* ${amountText}\n`;
        message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
        message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
        message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
        if (tx.error) {
          const escapedError = escapeMarkdownV2(tx.error.substring(0, 50));
          message += `🚨 \\*Error\\:\\* ${escapedError}${tx.error.length > 50 ? '\\.\\.\\.' : ''}\n`;
        }
        message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
      });
    }
    
    const keyboard = [];
    if (page > 0) keyboard.push(Markup.button.callback('⬅️ Previous', `admin_failed_page_${page - 1}`));
    if (page < totalPages - 1 && pageTransactions.length === pageSize) {
      keyboard.push(Markup.button.callback('Next ➡️', `admin_failed_page_${page + 1}`));
    }
    keyboard.push(Markup.button.callback('🏠 Back', 'admin_transaction_tracking'));
    
    await ctx.reply(message, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard(keyboard)
    });
  } catch (error) {
    console.error('❌ View failed transactions error:', error);
    await ctx.reply('❌ Error loading failed transactions\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function handleAdvancedSearch(ctx) {
  try {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) {
      await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
      return;
    }
    
    await ctx.reply(
      '🔍 \\*ADVANCED TRANSACTION SEARCH\\*\n\n' +
      'Enter search criteria in this format\\:\n\n' +
      '`search\\: \\[term\\]`\n' +
      '`type\\: \\[airtime\\|data\\|deposit\\|etc\\]`\n' +
      '`category\\: \\[category\\]`\n' +
      '`status\\: \\[completed\\|failed\\|pending\\]`\n' +
      '`user\\: \\[user\\_id\\]`\n' +
      '`phone\\: \\[phone\\_number\\]`\n' +
      '`network\\: \\[network\\]`\n' +
      '`date\\_from\\: YYYY\\-MM\\-DD`\n' +
      '`date\\_to\\: YYYY\\-MM\\-DD`\n' +
      '`amount\\_min\\: \\[amount\\]`\n' +
      '`amount\\_max\\: \\[amount\\]`\n' +
      '`has\\_api\\: \\[true\\|false\\]`\n' +
      '`api\\_name\\: \\[api\\_name\\]`\n' +
      '`sort\\_by\\: \\[amount\\|timestamp\\]`\n' +
      '`sort\\_order\\: \\[asc\\|desc\\]`\n' +
      '`page\\: \\[number\\]`\n' +
      '`page\\_size\\: \\[number\\]`\n\n' +
      '\\*Examples\\:\\*\n' +
      '`search\\: airtime type\\: airtime date\\_from\\: 2024\\-01\\-01`\n' +
      '`user\\: 123456789 status\\: failed has\\_api\\: true`\n' +
      '`phone\\: 08012345678 api\\_name\\: VTU\\_API`\n\n' +
      'Enter your search criteria\\:',
      { parse_mode: 'MarkdownV2' }
    );
    
    const sessions = getSessions();
    sessions[userId] = { action: 'admin_advanced_search', step: 'enter_criteria' };
    setSessions(sessions);
    await saveAllData();
  } catch (error) {
    console.error('❌ Advanced search error:', error);
    await ctx.reply('❌ Error starting advanced search\\.', { parse_mode: 'MarkdownV2' });
  }
}

async function handleAdvancedSearchText(ctx, text) {
  try {
    const userId = ctx.from.id.toString();
    const sessions = getSessions();
    const userSession = sessions[userId];
    
    if (!userSession || userSession.action !== 'admin_advanced_search') {
      return false;
    }
    
    const filters = {};
    const lines = text.split('\n');
    
    lines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim();
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z]/g, '');
        
        switch (cleanKey) {
          case 'search': filters.searchTerm = value; break;
          case 'type': filters.type = value; break;
          case 'category': filters.category = value; break;
          case 'status': filters.status = value; break;
          case 'user': filters.userId = value; break;
          case 'phone': filters.phone = value; break;
          case 'network': filters.network = value; break;
          case 'datefrom': filters.startDate = value; break;
          case 'dateto': filters.endDate = value; break;
          case 'amountmin': filters.minAmount = parseFloat(value); break;
          case 'amountmax': filters.maxAmount = parseFloat(value); break;
          case 'hasapi': filters.hasApiResponse = value.toLowerCase() === 'true'; break;
          case 'apiname': filters.apiName = value; break;
          case 'sortby': filters.sortBy = value; break;
          case 'sortorder': filters.sortOrder = value; break;
          case 'page': filters.page = parseInt(value) || 1; break;
          case 'pagesize': filters.pageSize = parseInt(value) || 50; break;
        }
      }
    });
    
    const results = systemTransactionManager.searchTransactions(filters);
    const totalResults = systemTransactionManager.searchTransactions({ ...filters, page: null, pageSize: null }).length;
    
    let message = `🔍 \\*SEARCH RESULTS\\*\n\n`;
    message += `📊 Found\\: ${totalResults} transactions\n`;
    
    if (Object.keys(filters).length > 0) {
      message += `🔎 Filters applied\\:\n`;
      Object.entries(filters).forEach(([key, value]) => {
        if (!['page', 'pageSize', 'sortBy', 'sortOrder'].includes(key)) {
          message += `• ${key}\\: ${value}\n`;
        }
      });
    }
    
    message += `\n📄 Showing ${results.length} transactions\n\n`;
    
    if (results.length === 0) {
      message += 'No transactions found\\.';
    } else {
      results.slice(0, 5).forEach((tx, index) => {
        const statusEmoji = tx.status === 'completed' ? '✅' : 
                           tx.status === 'failed' ? '❌' : '⏳';
        const amountText = formatCurrency(tx.amount || 0);
        const date = new Date(tx.timestamp).toLocaleString();
        const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
        const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
        
        message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
        message += `💰 Amount\\: ${amountText}\n`;
        message += `👤 User\\: ${escapeMarkdownV2(userInfo)}\n`;
        message += `📅 Date\\: ${escapeMarkdownV2(date)}\n`;
        message += `📡 API Calls\\: ${apiCount}\n`;
        message += `🔗 ID\\: \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
      });
      
      if (results.length > 5) {
        message += `\\.\\.\\. and ${results.length - 5} more results\\.`;
      }
    }
    
    sessions[userId] = { ...sessions[userId], lastSearch: filters, searchResults: results };
    setSessions(sessions);
    await saveAllData();
    
    await ctx.reply(message, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📁 Export Results', 'admin_export_search')],
        [Markup.button.callback('📊 Generate Report', 'admin_generate_search_report')],
        [Markup.button.callback('🔍 New Search', 'admin_advanced_search')],
        [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
      ])
    });
    
    return true;
  } catch (error) {
    console.error('❌ Advanced search text error:', error);
    await ctx.reply('❌ Error processing search\\. Please check your format\\.', { parse_mode: 'MarkdownV2' });
    return true;
  }
}

async function handleSearchTransactionIdText(ctx, text) {
  try {
    const userId = ctx.from.id.toString();
    const sessions = getSessions();
    const userSession = sessions[userId];
    
    if (!userSession || userSession.action !== 'admin_search_tx_id') {
      return false;
    }
    
    const transactionId = text.trim();
    const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
    
    if (!transactionDetails) {
      await ctx.reply(
        `❌ \\*Transaction Not Found\\*\n\n` +
        `Transaction ID\\: \`${escapeMarkdownV2(transactionId)}\`\n` +
        `No transaction found with this ID\\.`,
        { parse_mode: 'MarkdownV2' }
      );
      
      sessions[userId].action = null;
      setSessions(sessions);
      await saveAllData();
      return true;
    }
    
    await systemTransactionManager.viewTransactionDetails(ctx, transactionId);
    
    sessions[userId].action = null;
    setSessions(sessions);
    await saveAllData();
    return true;
  } catch (error) {
    console.error('❌ Search transaction ID text error:', error);
    await ctx.reply('❌ Error searching for transaction\\.', { parse_mode: 'MarkdownV2' });
    return true;
  }
}

// ==================== TEXT HANDLER ====================
async function handleTextMessage(ctx, text) {
  try {
    const userId = ctx.from.id.toString();
    console.log(`📱 [TEXT ROUTER] User ${userId}: "${text}"`);
    
    await initUser(userId);
    
    if (text.startsWith('/')) return true;
    
    const sessions = getSessions();
    const userSession = sessions[userId];
    
    if (userSession && userSession.action === 'admin_search_tx_id') {
      return await handleSearchTransactionIdText(ctx, text);
    }
    
    if (userSession && userSession.action === 'admin_advanced_search') {
      return await handleAdvancedSearchText(ctx, text);
    }
    
    if (userSession && userSession.action === 'admin_search_transactions') {
      const results = systemTransactionManager.searchTransactions({ searchTerm: text });
      await ctx.reply(`Found ${results.length} transactions for "${text}"`, { parse_mode: 'MarkdownV2' });
      return true;
    }
    
    const sendMoneySession = sendMoney.sessionManager?.getSession?.(userId);
    if (sendMoneySession && sendMoneySession.action === 'send_money') {
      const usersWithMethods = { ...getUsers(), ...userMethods };
      const result = await sendMoney.handleText(ctx, text, usersWithMethods, transactionMethods);
      if (result) return true;
    }
    
    const usersWithMethods = { ...getUsers(), ...userMethods };
    const depositHandled = await depositFunds.handleDepositText(ctx, text, usersWithMethods, virtualAccounts);
    if (depositHandled) {
      console.log(`📱 Deposit text handled for user ${userId}`);
      return true;
    }
    
    if (deviceHandler) {
      deviceHandler.users = getUsers();
      const handledByDevice = await deviceHandler.handleTextMessage(ctx, text, userSession);
      if (handledByDevice) {
        console.log(`📱 Device handler handled text for user ${userId}`);
        return true;
      }
    }
    
    if (userSession && userSession.action === 'airtime') {
      try {
        const result = await buyAirtime.handleText(
          ctx, text, getUsers(), getTransactions(), sessions,
          NETWORK_CODES, CONFIG
        );
        return result !== false;
      } catch (error) {
        console.error('❌ Error in airtime text handler:', error);
      }
    }
    
    if (userSession && userSession.action === 'data') {
      const dataTextHandler = require('./app/buyData').handleText;
      if (dataTextHandler) {
        try {
          const result = await dataTextHandler(ctx, text, userSession, getUsers()[userId], 
            getUsers(), getTransactions(), sessionManager, NETWORK_CODES, CONFIG);
          if (result) return true;
        } catch (error) {
          console.error('❌ Error in data text handler:', error);
        }
      }
    }
    
    if (userSession && userSession.action === 'tv_subscription') {
      const tvTextHandler = buyTVSubscription.handleText;
      if (tvTextHandler) {
        try {
          const result = await tvTextHandler(ctx, text, userSession, getUsers()[userId], 
            getUsers(), getTransactions(), sessionManager, CONFIG);
          if (result) return true;
        } catch (error) {
          console.error('❌ Error in TV subscription text handler:', error);
        }
      }
    }
    
    if (userSession && userSession.action === 'electricity') {
      const electricityTextHandler = buyElectricity.handleText;
      if (electricityTextHandler) {
        try {
          const result = await electricityTextHandler(ctx, text, userSession, getUsers()[userId], 
            getUsers(), getTransactions(), sessionManager, CONFIG);
          if (result) return true;
        } catch (error) {
          console.error('❌ Error in electricity text handler:', error);
        }
      }
    }
    
    if (userSession && userSession.action === 'exam_pins') {
      const examTextHandler = buyExamPins.handleText;
      if (examTextHandler) {
        try {
          const result = await examTextHandler(ctx, text, userSession, getUsers()[userId], 
            getUsers(), getTransactions(), sessionManager, CONFIG);
          if (result) return true;
        } catch (error) {
          console.error('❌ Error in exam pins text handler:', error);
        }
      }
    }
    
    if (userSession && userSession.action === 'card_pins') {
      const cardPinsTextHandler = buyCardPins.handleText;
      if (cardPinsTextHandler) {
        try {
          const result = await cardPinsTextHandler(ctx, text, userSession, getUsers()[userId], 
            getUsers(), getTransactions(), sessionManager, CONFIG);
          if (result) return true;
        } catch (error) {
          console.error('❌ Error in card pins text handler:', error);
        }
      }
    }
    
    if (userSession && userSession.action === 'mini_app') {
      if (deviceLockApp && typeof deviceLockApp.handleText === 'function') {
        try {
          const result = await deviceLockApp.handleText(ctx, text, userSession);
          if (result) return true;
        } catch (error) {
          console.error('❌ Error in Mini App text handler:', error);
        }
      }
    }
    
    if (!userSession) {
      if (/^\d+$/.test(text) && parseInt(text) > 0 && parseInt(text) <= 50000) {
        const amount = parseInt(text);
        const formattedAmount = formatCurrency(amount);
        
        await ctx.reply(
          `💰 \\*Amount Detected\\:\\* ${formattedAmount}\n\n` +
          `Please select a service first\\:\n\n` +
          `📱 \\*Device Financing\\*\n` +
          `📞 \\*Buy Airtime\\*\n` +
          `📡 \\*Buy Data\\*\n` +
          `🎫 \\*Card Pins\\*\n` +
          `📝 \\*Exam Pins\\*\n` +
          `📺 \\*TV Subscription\\*\n` +
          `💡 \\*Electricity Bill\\*\n` +
          `🏦 \\*Send Money\\*\n\n` +
          `Use the menu buttons to start a transaction\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      if (/^0[7-9][0-1]\d{8}$/.test(text)) {
        const escapedPhone = escapeMarkdownV2(text);
        await ctx.reply(
          `📱 \\*Phone Number Detected\\:\\* ${escapedPhone}\n\n` +
          `Please select what you want to do with this number\\:\n\n` +
          `📞 \\*Buy Airtime\\*\n` +
          `📡 \\*Buy Data\\*\n\n` +
          `Use the menu buttons to select a service first\\.`,
          { parse_mode: 'MarkdownV2' }
        );
        return true;
      }
      
      await ctx.reply(
        '🤔 \\*I didn\'t understand that\\*\n\n' +
        'Please select an option from the menu or use /help for commands\\.',
        { parse_mode: 'MarkdownV2' }
      );
      return true;
    }
    
    console.log(`⚠️ Session exists but wasn't handled:`, userSession);
    return false;
  } catch (error) {
    console.error('❌ Text handler error:', error);
    await ctx.reply('❌ An error occurred\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    return true;
  }
}

// ==================== MAIN FUNCTION ====================
async function main() {
  try {
    console.log('🚀 VTU Bot Starting with API-RESPONSE ENHANCED TRANSACTION TRACKING + MINI APP...');
    
    await initStorage();
    await loadData();
    
    if (!process.env.BOT_TOKEN) {
      console.error('❌ BOT_TOKEN is not set in environment variables');
      process.exit(1);
    }
    
    const bot = new Telegraf(process.env.BOT_TOKEN);
    
    await initializeDeviceHandler(bot);
    setupAutoSave();
    
    // ==================== MINI APP COMMANDS ====================
    bot.command('app', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        
        if (!deviceLockApp) {
          await ctx.reply(
            '📱 \\*DEVICE LOCK APP\\*\n\n' +
            '❌ \\*System Not Ready\\*\n\n' +
            'The device lock app system is still initializing\\.\n' +
            'Please try again in a few seconds\\.',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        await deviceLockApp.handleMiniAppCommand(ctx);
      } catch (error) {
        console.error('❌ Mini App command error:', error);
        ctx.reply('❌ Error loading Mini App\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });

    bot.command('status', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        
        if (!deviceHandler) {
          await ctx.reply(
            '📱 \\*DEVICE STATUS\\*\n\n' +
            '❌ \\*System Not Ready\\*\n\n' +
            'The device financing system is still initializing\\.\n' +
            'Please try again in a few seconds\\.',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        deviceHandler.users = getUsers();
        const installments = await deviceHandler.getUserInstallments(userId);
        
        if (installments.length === 0) {
          await ctx.reply(
            `📱 \\*DEVICE STATUS\\*\n\n` +
            `You don't have any active devices\\.\n\n` +
            `Start by browsing available devices\\:`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📱 Browse Devices', 'device_view_devices')],
                [Markup.button.callback('📱 Open App', 'device_mini_app')]
              ])
            }
          );
          return;
        }
        
        let message = `📱 \\*YOUR DEVICES STATUS\\*\n\n`;
        installments.forEach((installment, index) => {
          message += `\\*${index + 1}\\. ${installment.deviceMake} ${installment.deviceModel}\\*\n`;
          message += `   🆔 \\*Installment ID\\:\\* ${installment.id}\n`;
          message += `   📱 \\*Status\\:\\* ${installment.status.toUpperCase()}\n`;
          message += `   🔒 \\*IMEI Status\\:\\* ${installment.imeiStatus || 'Pending'}\n`;
          message += `   💰 \\*Paid\\:\\* ${installment.installmentsPaid}/${installment.totalInstallments + 1}\n\n`;
        });
        
        message += `📱 \\*Open the Device Lock App for detailed control\\:\\*`;
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📱 Open Device Lock App', 'device_mini_app')],
            [Markup.button.callback('💰 Make Payment', 'device_make_payment')],
            [Markup.button.callback('📋 All Installments', 'device_my_installments')]
          ])
        });
      } catch (error) {
        console.error('❌ Status command error:', error);
        ctx.reply('❌ Error checking device status\\.', { parse_mode: 'MarkdownV2' });
      }
    });

    bot.command('unlock', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        
        if (!deviceHandler) {
          await ctx.reply(
            '🔓 \\*DEVICE UNLOCK\\*\n\n' +
            '❌ \\*System Not Ready\\*\n\n' +
            'The device financing system is still initializing\\.\n' +
            'Please try again in a few seconds\\.',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        deviceHandler.users = getUsers();
        const imeiMappings = await deviceHandler.getUserIMEIMappings(userId);
        const lockedDevices = imeiMappings.filter(m => m.imeiStatus === 'locked');
        
        if (lockedDevices.length === 0) {
          await ctx.reply(
            `🔓 \\*DEVICE UNLOCK\\*\n\n` +
            `You don't have any locked devices\\.\n\n` +
            `Devices are automatically unlocked when fully paid\\.\n\n` +
            `\\*To check your devices\\:\\*`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📱 Check Status', 'status')],
                [Markup.button.callback('📱 Open App', 'device_mini_app')]
              ])
            }
          );
          return;
        }
        
        let message = `🔓 \\*LOCKED DEVICES\\*\n\n`;
        message += `\\*You have ${lockedDevices.length} locked device${lockedDevices.length !== 1 ? 's' : ''}\\:\\*\n\n`;
        
        const buttons = [];
        lockedDevices.forEach((mapping, index) => {
          message += `\\*${index + 1}\\. ${mapping.deviceMake} ${mapping.deviceModel}\\*\n`;
          message += `   📱 \\*IMEI\\:\\* ${mapping.imei}\n`;
          message += `   🆔 \\*Installment ID\\:\\* ${mapping.installmentId}\n\n`;
          buttons.push([
            Markup.button.callback(`🔓 Request Unlock - ${mapping.deviceMake}`, `request_unlock_${mapping.imei}`)
          ]);
        });
        
        message += `\\*To unlock a device\\:\\*\n`;
        message += `1\\. Ensure all payments are completed ✅\n`;
        message += `2\\. Click the request button below\n`;
        message += `3\\. Admin will process within 1\\-2 hours ⏰\n`;
        message += `4\\. You'll be notified when unlocked 📲\n\n`;
        message += `📞 \\*Support\\:\\* @opuenekeke`;
        
        buttons.push([
          Markup.button.callback('📱 Open Full App', 'device_mini_app'),
          Markup.button.callback('💰 Check Payments', 'device_make_payment')
        ]);
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(buttons)
        });
      } catch (error) {
        console.error('❌ Unlock command error:', error);
        ctx.reply('❌ Error loading unlock options\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    // ==================== ANALYTICS COMMANDS ====================
    bot.command('analytics', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        const report = analyticsManager.getAnalyticsReport('daily');
        
        let message = '📊 \\*ANALYTICS DASHBOARD\\*\n\n';
        message += `📅 \\*Today\\'s Performance\\:\\*\n`;
        message += `📊 Transactions\\: ${report.summary.totalTransactions || 0}\n`;
        message += `💰 Revenue\\: ${formatCurrency(report.summary.totalAmount || 0)}\n`;
        
        if (report.trends) {
          message += `\n📈 \\*Trends\\:\\*\n`;
          if (report.trends.transactionChange !== undefined) {
            const trendIcon = report.trends.transactionChange >= 0 ? '📈' : '📉';
            message += `Transactions\\: ${trendIcon} ${report.trends.transactionChange.toFixed(2)}%\n`;
          }
          if (report.trends.amountChange !== undefined) {
            const trendIcon = report.trends.amountChange >= 0 ? '📈' : '📉';
            message += `Revenue\\: ${trendIcon} ${report.trends.amountChange.toFixed(2)}%\n`;
          }
        }
        
        if (report.insights && report.insights.length > 0) {
          message += `\n💡 \\*Insights\\:\\*\n`;
          report.insights.forEach(insight => {
            message += `• ${escapeMarkdownV2(insight)}\n`;
          });
        }
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📈 Detailed Report', 'admin_analytics_dashboard')],
            [Markup.button.callback('📊 Export Report', 'admin_export_analytics')],
            [Markup.button.callback('🏠 Back', 'admin_panel')]
          ])
        });
      } catch (error) {
        console.error('❌ Analytics command error:', error);
        await ctx.reply('❌ Error loading analytics\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.command('transactions', async (ctx) => {
      try {
        await handleAdminTransactionTracking(ctx);
      } catch (error) {
        console.error('❌ Transactions command error:', error);
        await ctx.reply('❌ Error loading transaction tracking\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.command('failedtransactions', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        await handleViewFailedTransactions(ctx);
      } catch (error) {
        console.error('❌ Failed transactions command error:', error);
        await ctx.reply('❌ Error loading failed transactions\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.command('todaysales', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        const todaysTransactions = systemTransactionManager.searchTransactions({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        });
        
        const stats = systemTransactionManager.getTransactionStats();
        
        let message = `📅 \\*TODAY\\'S TRANSACTIONS\\*\n\n`;
        message += `📊 \\*Total Today\\:\\* ${stats.today} transactions\n`;
        message += `💰 \\*Total Amount\\:\\* ${formatCurrency(stats.todayAmount)}\n\n`;
        
        if (todaysTransactions.length === 0) {
          message += 'No transactions today\\.';
        } else {
          todaysTransactions.slice(0, 10).forEach((tx, index) => {
            const statusEmoji = tx.status === 'completed' ? '✅' : 
                              tx.status === 'failed' ? '❌' : '⏳';
            const amountText = formatCurrency(tx.amount || 0);
            const time = new Date(tx.timestamp).toLocaleTimeString();
            const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
            const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
            
            message += `${statusEmoji} \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
            message += `💰 \\*Amount\\:\\* ${amountText}\n`;
            message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
            message += `⏰ \\*Time\\:\\* ${escapeMarkdownV2(time)}\n`;
            message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
            if (tx.phone) message += `📱 \\*Phone\\:\\* ${escapeMarkdownV2(tx.phone)}\n`;
            message += `\n`;
          });
        }
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 View All Today', 'admin_view_today_transactions')],
            [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
          ])
        });
      } catch (error) {
        console.error('❌ Today sales command error:', error);
        await ctx.reply('❌ Error loading today\'s sales\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.command('transactionstats', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        const stats = systemTransactionManager.getTransactionStats();
        
        let message = `📈 \\*TRANSACTION STATISTICS\\*\n\n`;
        message += `📊 \\*Total Transactions\\:\\* ${stats.total}\n`;
        message += `✅ \\*Completed\\:\\* ${stats.completed}\n`;
        message += `⏳ \\*Pending\\:\\* ${stats.pending}\n`;
        message += `❌ \\*Failed\\:\\* ${stats.failed}\n`;
        message += `📅 \\*Today\\:\\* ${stats.today}\n`;
        message += `💰 \\*Total Amount\\:\\* ${formatCurrency(stats.totalAmount)}\n`;
        message += `💵 \\*Today\\'s Amount\\:\\* ${formatCurrency(stats.todayAmount)}\n`;
        message += `📡 \\*With API Responses\\:\\* ${stats.withApiResponses}\n\n`;
        
        message += `📋 \\*By Category\\:\\*\n`;
        Object.entries(stats.byCategory).forEach(([category, count]) => {
          message += `• ${escapeMarkdownV2(category)}\\: ${count}\n`;
        });
        
        message += `\n📋 \\*By Type\\:\\*\n`;
        Object.entries(stats.byType).forEach(([type, count]) => {
          message += `• ${escapeMarkdownV2(type)}\\: ${count}\n`;
        });
        
        message += `\n📡 \\*API Statistics\\:\\*\n`;
        Object.entries(stats.apiCallsByType).forEach(([apiName, count]) => {
          const successRate = stats.apiSuccessRate[apiName];
          const rate = successRate ? ((successRate.success / successRate.total) * 100).toFixed(2) : 'N/A';
          message += `• ${escapeMarkdownV2(apiName)}\\: ${count} calls \\(${rate}% success\\)\n`;
        });
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📋 View Details', 'admin_transaction_tracking')],
            [Markup.button.callback('🏠 Back', 'admin_panel')]
          ])
        });
      } catch (error) {
        console.error('❌ Transaction stats command error:', error);
        await ctx.reply('❌ Error loading transaction statistics\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.command('synctransactions', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        await ctx.reply('🔄 Syncing transactions to system tracking\\.\\.\\.', { parse_mode: 'MarkdownV2' });
        
        let syncCount = 0;
        const transactions = getTransactions();
        for (const [userId, userTransactions] of Object.entries(transactions)) {
          if (Array.isArray(userTransactions)) {
            for (const tx of userTransactions) {
              const systemTransactions = getSystemTransactions();
              const existingTx = systemTransactions.find(stx => 
                stx.id === tx.id || 
                stx.reference === tx.reference ||
                (stx.metadata && stx.metadata.source === 'transaction_history_sync' && stx.metadata.originalId === tx.id)
              );
              
              if (!existingTx) {
                await systemTransactionManager.recordAnyTransaction(userId, {
                  ...tx,
                  id: tx.id || `sync_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                  source: 'transaction_history_sync',
                  originalId: tx.id
                });
                syncCount++;
              }
            }
          }
        }
        
        await ctx.reply(
          `✅ \\*Transaction Sync Complete\\*\n\n` +
          `📊 \\*Transactions Synced\\:\\* ${syncCount}\n` +
          `📈 \\*Total System Transactions\\:\\* ${getSystemTransactions().length}`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('❌ Sync transactions command error:', error);
        await ctx.reply('❌ Error syncing transactions\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    // ==================== LOCAL SERVER SETUP ====================
    const app = express();
    app.use(express.json());
    
    try {
      const usersForDeposit = { ...getUsers(), ...userMethods };
      depositFunds.setupDepositHandlers(bot, usersForDeposit, virtualAccounts);
      console.log('✅ Deposit handlers setup complete');
    } catch (error) {
      console.error('❌ Failed to setup deposit handlers:', error);
    }
    
    app.post('/billstack-webhook', depositFunds.handleBillstackWebhook(bot, getUsers(), getTransactions(), virtualAccounts));
    
    const LOCAL_PORT = process.env.PORT || 3000;
    app.listen(LOCAL_PORT, () => {
      console.log(`🔧 Local server running on port ${LOCAL_PORT}`);
      console.log(`📞 Billstack webhook: http://localhost:${LOCAL_PORT}/billstack-webhook`);
    });
    
    // ==================== START COMMAND ====================
    bot.start(async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        const isUserAdmin = isAdmin(userId);
        
        if (!user.firstName) {
          user.firstName = ctx.from.first_name || '';
          user.lastName = ctx.from.last_name || '';
          user.username = ctx.from.username || null;
          setUsers(getUsers());
          await saveAllData();
        }
        
        let keyboard = isUserAdmin ? [
          ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
          ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
          ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
          ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
          ['🛂 KYC Status', '🛠️ Admin Panel', '🆘 Help & Support']
        ] : [
          ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
          ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
          ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
          ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
          ['🛂 KYC Status', '🆘 Help & Support']
        ];
        
        let emailStatus = '';
        let virtualAccountStatus = '';
        const billstackConfigured = CONFIG.BILLSTACK_API_KEY && CONFIG.BILLSTACK_SECRET_KEY;
        
        if (billstackConfigured) {
          if (!user.email || !isValidEmail(user.email)) {
            emailStatus = `\n📧 \\*Email Status\\:\\* ❌ NOT SET\n\\_Set email via deposit process for virtual account\\_`;
          } else {
            emailStatus = `\n📧 \\*Email Status\\:\\* ✅ SET`;
          }
          
          if (!user.virtualAccount) {
            virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ❌ NOT CREATED\n\\_Create virtual account via deposit process\\_`;
          } else {
            virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ✅ ACTIVE`;
          }
        } else {
          emailStatus = `\n📧 \\*Email Status\\:\\* ${user.email ? '✅ SET' : '❌ NOT SET'}`;
          virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ⏳ CONFIG PENDING\n\\_Admin configuring Billstack API\\_`;
        }
        
        let deviceFinancingStatus = '';
        if (user.isMarketer) {
          deviceFinancingStatus = `\n👥 \\*Device Marketer\\:\\* ✅ ACTIVE`;
        }
        
        const kycStatus = user.kycStatus || 'pending';
        
        await ctx.reply(
          `🌟 \\*Welcome to Liteway VTU Bot\\!\\*\n\n` +
          `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
          `💵 \\*Wallet Balance\\:\\* ${formatCurrency(user.wallet)}\n` +
          `${emailStatus}` +
          `${virtualAccountStatus}` +
          `${deviceFinancingStatus}\n\n` +
          `📱 \\*Available Services\\:\\*\n` +
          `• 📱 Device Financing \\(Buy smartphones on credit\\)\n` +
          `• 📺 TV Subscription\n` +
          `• 💡 Electricity Bill\n` +
          `• 📞 Buy Airtime\n` +
          `• 📡 Buy Data\n` +
          `• 🎫 Card Pins\n` +
          `• 📝 Exam Pins\n` +
          `• ⚡ Lite Light\n` +
          `• 🏦 Money Transfer \\(NEW\\: Bank \\+ Litemonie\\)\n` +
          `• 💰 Wallet Balance\n` +
          `• 💳 Deposit Funds\n` +
          `• 📜 Transaction History\n` +
          `• 🛂 KYC Status\n` +
          `${isUserAdmin ? '• 🛠️ Admin Panel \\(ENHANCED with API Response Tracking\\)\n' : ''}` +
          `• 🆘 Help & Support\n\n` +
          `📞 \\*Support\\:\\* @opuenekeke`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.keyboard(keyboard).resize()
          }
        );
      } catch (error) {
        console.error('❌ Start error:', error);
        await ctx.reply('❌ Error initializing your account\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    // ==================== MENU HANDLERS ====================
    bot.hears('📱 Device Financing', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        
        if (!deviceHandler) {
          await initializeDeviceHandler(bot);
          if (!deviceHandler) {
            await ctx.reply(
              '📱 \\*DEVICE FINANCING\\*\n\n' +
              '❌ \\*System Error\\*\n\n' +
              'The device financing system encountered an error\\.\n' +
              'Please try again in a few minutes or contact admin\\.\n\n' +
              '\\*Admin\\:\\* @opuenekeke',
              { parse_mode: 'MarkdownV2' }
            );
            return;
          }
        }
        
        deviceHandler.users = getUsers();
        const user = getUsers()[userId];
        const installments = await deviceHandler.getUserInstallments(userId);
        const imeiMappings = await deviceHandler.getUserIMEIMappings(userId);
        const lockedDevices = imeiMappings.filter(m => m.imeiStatus === 'locked');
        
        let message = `📱 \\*DEVICE FINANCING WITH TELEGRAM MINI APP\\*\n\n`;
        message += `💵 \\*Your Wallet\\:\\* ${formatCurrency(user.wallet)}\n`;
        message += `📱 \\*Active Installments\\:\\* ${installments.length}\n`;
        message += `🔒 \\*Locked Devices\\:\\* ${lockedDevices.length}\n\n`;
        message += `🚀 \\*NEW\\: Telegram Mini App\\*\n`;
        message += `Access your device controls anywhere\\!\n\n`;
        message += `📱 \\*Features\\:\\*\n`;
        message += `• Browse devices for installment\n`;
        message += `• Track payment schedule\n`;
        message += `• Request device unlock\n`;
        message += `• Monitor device status\n`;
        message += `• Real\\-time notifications\n`;
        message += `• Support chat integration\n\n`;
        message += `👇 \\*Select an option\\:\\*`;
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📱 Browse Devices', 'device_view_devices')],
            [Markup.button.callback('🚀 Open Mini App', 'device_mini_app')],
            [Markup.button.callback('📋 My Installments', 'device_my_installments')],
            [Markup.button.callback('💰 Make Payment', 'device_make_payment')],
            [Markup.button.callback('🔓 Request Unlock', 'unlock_command')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        });
      } catch (error) {
        console.error('❌ Device financing error:', error);
        await ctx.reply('❌ Error loading device financing\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('📺 TV Subscription', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        return buyTVSubscription.handleTVSubscription(ctx, getUsers(), sessionManager, CONFIG);
      } catch (error) {
        console.error('❌ TV subscription error:', error);
        ctx.reply('❌ Error loading TV subscription\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('💡 Electricity Bill', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        return buyElectricity.handleElectricity(ctx, getUsers(), sessionManager, CONFIG);
      } catch (error) {
        console.error('❌ Electricity bill error:', error);
        ctx.reply('❌ Error loading electricity bill\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('📞 Buy Airtime', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        return buyAirtime.handleAirtime(ctx, getUsers(), getSessions(), CONFIG, NETWORK_CODES);
      } catch (error) {
        console.error('❌ Airtime handler error:', error);
        ctx.reply('❌ Error loading airtime purchase\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('📡 Buy Data', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        return buyData.handleData(ctx, getUsers(), sessionManager, CONFIG, NETWORK_CODES);
      } catch (error) {
        console.error('❌ Data handler error:', error);
        ctx.reply('❌ Error loading data purchase\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('🎫 Card Pins', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        return buyCardPins.handleCardPinsMenu(ctx, getUsers(), sessionManager, CONFIG);
      } catch (error) {
        console.error('❌ Card pins error:', error);
        ctx.reply('❌ Error loading card pins\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('📝 Exam Pins', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        return buyExamPins.handleExamPins(ctx, getUsers(), sessionManager, CONFIG);
      } catch (error) {
        console.error('❌ Exam pins error:', error);
        ctx.reply('❌ Error loading exam pins\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('⚡ Lite Light', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        await ctx.reply(
          '⚡ \\*LITE LIGHT\\*\n\n' +
          '🚧 \\*Coming Soon\\!\\*\n\n' +
          'This feature is currently under development\\.\n' +
          'Check back soon for updates\\!',
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('❌ Lite light error:', error);
        ctx.reply('❌ Error loading Lite Light\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('🏦 Money Transfer', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        if (!await checkKYCAndPIN(userId, ctx)) return;
        
        await ctx.reply(
          '🏦 \\*SEND MONEY\\*\n\n' +
          '💸 \\*Choose transfer method\\:\\*\n\n' +
          '🏦 \\*BANK\\* \\- Transfer to any Nigerian bank account\n' +
          '📱 \\*LITEMONIE\\* \\- Send to other bot users using phone number\n\n' +
          '👇 \\*Select an option\\:\\*',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🏦 BANK TRANSFER', 'bank_transfer')],
              [Markup.button.callback('📱 LITEMONIE', 'litemonie_transfer')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
      } catch (error) {
        console.error('❌ Send money menu error:', error);
        ctx.reply('❌ Error loading send money options\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('💰 Wallet Balance', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        if (!user) {
          await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        let emailStatus = '';
        let virtualAccountStatus = '';
        const billstackConfigured = CONFIG.BILLSTACK_API_KEY && CONFIG.BILLSTACK_SECRET_KEY;
        
        if (billstackConfigured) {
          if (!user.email || !isValidEmail(user.email)) {
            emailStatus = `📧 \\*Email Status\\:\\* ❌ NOT SET\n`;
          } else {
            emailStatus = `📧 \\*Email Status\\:\\* ✅ SET\n`;
          }
          
          if (!user.virtualAccount) {
            virtualAccountStatus = `💳 \\*Virtual Account\\:\\* ❌ NOT CREATED\n`;
          } else {
            virtualAccountStatus = `💳 \\*Virtual Account\\:\\* ✅ ACTIVE\n`;
          }
        } else {
          emailStatus = `📧 \\*Email Status\\:\\* ${user.email ? '✅ SET' : '❌ NOT SET'}\n`;
          virtualAccountStatus = `💳 \\*Virtual Account\\:\\* ⏳ CONFIG PENDING\n`;
        }
        
        let deviceFinancingStatus = '';
        if (user.isMarketer) {
          deviceFinancingStatus = `👥 \\*Device Marketer\\:\\* ✅ ACTIVE\n`;
        }
        
        const kycStatus = user.kycStatus || 'pending';
        
        await ctx.reply(
          `💰 \\*YOUR WALLET BALANCE\\*\n\n` +
          `💵 \\*Available\\:\\* ${formatCurrency(user.wallet)}\n` +
          `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
          `${emailStatus}` +
          `${virtualAccountStatus}` +
          `${deviceFinancingStatus}` +
          `💡 Need more funds\\? Use "💳 Deposit Funds" button`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('❌ Balance error:', error);
        ctx.reply('❌ Error checking balance\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('💳 Deposit Funds', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        
        if (!user) {
          await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        const kycStatus = user.kycStatus || 'pending';
        if (kycStatus !== 'approved') {
          await ctx.reply(
            '❌ \\*KYC VERIFICATION REQUIRED\\*\n\n' +
            '📝 Your account needs verification for deposit\\.\n\n' +
            `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
            '📞 \\*Contact admin\\:\\* @opuenekeke',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        const usersWithMethods = { ...getUsers(), ...userMethods };
        return depositFunds.handleDeposit(ctx, usersWithMethods, virtualAccounts);
      } catch (error) {
        console.error('❌ Deposit handler error:', error);
        ctx.reply('❌ Error loading deposit\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('📜 Transaction History', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        const user = getUsers()[userId];
        if (!user) {
          await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        return transactionHistory.handleHistory(ctx, getUsers(), getTransactions(), CONFIG);
      } catch (error) {
        console.error('❌ Transaction history error:', error);
        ctx.reply('❌ Error loading transaction history\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('🛂 KYC Status', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        if (!user) {
          await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        const kycStatus = user.kycStatus || 'pending';
        let statusEmoji = '⏳';
        if (kycStatus === 'approved') statusEmoji = '✅';
        else if (kycStatus === 'rejected') statusEmoji = '❌';
        else if (kycStatus === 'submitted') statusEmoji = '📋';
        
        let kycInfo = '';
        if (user.kycSubmittedDate) {
          kycInfo += `📅 \\*Submitted\\:\\* ${escapeMarkdownV2(user.kycSubmittedDate)}\n`;
        }
        if (user.kycApprovedDate) {
          kycInfo += `✅ \\*Approved\\:\\* ${escapeMarkdownV2(user.kycApprovedDate)}\n`;
        }
        if (user.kycRejectedDate) {
          kycInfo += `❌ \\*Rejected\\:\\* ${escapeMarkdownV2(user.kycRejectedDate)}\n`;
          if (user.kycRejectionReason) {
            kycInfo += `📝 \\*Reason\\:\\* ${escapeMarkdownV2(user.kycRejectionReason)}\n`;
          }
        }
        
        await ctx.reply(
          `🛂 \\*KYC STATUS\\*\n\n` +
          `👤 \\*User ID\\:\\* ${userId}\n` +
          `📛 \\*Name\\:\\* ${escapeMarkdownV2(user.firstName || '')} ${escapeMarkdownV2(user.lastName || '')}\n` +
          `📧 \\*Email\\:\\* ${escapeMarkdownV2(user.email || 'Not set')}\n` +
          `📱 \\*Phone\\:\\* ${escapeMarkdownV2(user.phone || 'Not set')}\n\n` +
          `🛂 \\*Status\\:\\* ${statusEmoji} ${escapeMarkdownV2(kycStatus.toUpperCase())}\n\n` +
          `${kycInfo}\n` +
          `📞 \\*Support\\:\\* @opuenekeke`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('❌ KYC status error:', error);
        ctx.reply('❌ Error checking KYC status\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('🛠️ Admin Panel', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        const user = getUsers()[userId];
        if (!user) {
          await ctx.reply('❌ User not found\\. Please use /start first\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        if (!isAdmin(userId)) {
          await ctx.reply('❌ Admin access only\\.', { parse_mode: 'MarkdownV2' });
          return;
        }
        
        await ctx.reply(
          '🛠️ \\*ADMIN PANEL\\*\n\n' +
          '👑 \\*Administrator Controls\\*\n\n' +
          '👇 \\*Select an option\\:\\*',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('👥 User Management', 'admin_users')],
              [Markup.button.callback('📊 Advanced Transaction Tracking', 'admin_transaction_tracking')],
              [Markup.button.callback('📈 Analytics Dashboard', 'admin_analytics_dashboard')],
              [Markup.button.callback('🛂 KYC Approvals', 'admin_kyc')],
              [Markup.button.callback('💼 Device Financing Admin', 'admin_device_financing')],
              [Markup.button.callback('💰 System Balance', 'admin_balance')],
              [Markup.button.callback('📈 System Stats', 'admin_stats')],
              [Markup.button.callback('🏠 Home', 'start')]
            ])
          }
        );
      } catch (error) {
        console.error('❌ Admin panel error:', error);
        ctx.reply('❌ Error loading admin panel\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.hears('🆘 Help & Support', async (ctx) => {
      try {
        await ctx.reply(
          `🆘 \\*HELP & SUPPORT\\*\n\n` +
          `📱 \\*Main Commands\\:\\*\n` +
          `/start \\- Start bot\n` +
          `/setpin \\[1234\\] \\- Set transaction PIN\n` +
          `/balance \\- Check wallet balance\n` +
          `/app \\- Open Device Lock Mini App\n` +
          `/status \\- Check device status\n` +
          `/unlock \\- Request device unlock\n` +
          `/devices \\- Browse available devices\n\n` +
          `💡 \\*Common Issues\\:\\*\n\n` +
          `🔐 \\*PIN Issues\\:\\*\n` +
          `• Forgot PIN\\: Contact admin\n` +
          `• Wrong PIN\\: 3 attempts allowed\n` +
          `• PIN locked\\: Contact admin to unlock\n\n` +
          `💰 \\*Wallet Issues\\:\\*\n` +
          `• Missing deposit\\: Send proof to admin\n` +
          `• Wrong balance\\: Contact admin\n` +
          `• Can't deposit\\: Check email & KYC status\n\n` +
          `📧 \\*Email Issues\\:\\*\n` +
          `• Email required for virtual account\n` +
          `• Use valid email address\n` +
          `• Contact admin if stuck\n\n` +
          `🏦 \\*Virtual Account Issues\\:\\*\n` +
          `• Funds not reflecting\\: Wait 5 minutes\n` +
          `• Wrong account details\\: Contact support\n` +
          `• Bank not accepting\\: Use WEMA BANK\n\n` +
          `📞 \\*Transaction Issues\\:\\*\n` +
          `• Failed purchase\\: Check balance & network\n` +
          `• No airtime/data\\: Wait 5 minutes\n` +
          `• Wrong number\\: Double-check before confirm\n\n` +
          `📱 \\*Device Financing\\:\\*\n` +
          `• Purchase issues\\: Contact admin\n` +
          `• Payment problems\\: Send proof to @opuenekeke\n` +
          `• Device delivery\\: Allow 24-48 hours\n\n` +
          `📱 \\*Mini App\\:\\*\n` +
          `• Use /app to open Device Lock App\n` +
          `• Check device status with /status\n` +
          `• Request unlock with /unlock\n\n` +
          `📱 \\*Litemonie Transfer\\:\\*\n` +
          `• Send money to other bot users\n` +
          `• Use registered phone number\n` +
          `• Both users must have KYC approved\n\n` +
          `⚡ \\*Quick Contact\\:\\*\n` +
          `@opuenekeke\n\n` +
          `⏰ \\*Response Time\\:\\*\n` +
          `Within 5-10 minutes`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('❌ Help error:', error);
        ctx.reply('❌ Error loading help\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    // ==================== COMMANDS ====================
    bot.command('setpin', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        const args = ctx.message.text.split(' ');
        
        if (args.length !== 2) {
          return await ctx.reply('❌ Usage\\: /setpin \\[4 digits\\]\nExample\\: /setpin 1234', { parse_mode: 'MarkdownV2' });
        }
        
        const pin = args[1];
        
        if (!/^\d{4}$/.test(pin)) {
          return await ctx.reply('❌ PIN must be exactly 4 digits\\.', { parse_mode: 'MarkdownV2' });
        }
        
        user.pin = pin;
        user.pinAttempts = 0;
        user.pinLocked = false;
        
        setUsers(getUsers());
        await saveAllData();
        
        await ctx.reply('✅ PIN set successfully\\! Use this PIN to confirm transactions\\.', { parse_mode: 'MarkdownV2' });
      } catch (error) {
        console.error('❌ Setpin error:', error);
        ctx.reply('❌ Error setting PIN\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.command('balance', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        
        let emailStatus = '';
        let virtualAccountStatus = '';
        const billstackConfigured = CONFIG.BILLSTACK_API_KEY && CONFIG.BILLSTACK_SECRET_KEY;
        
        if (billstackConfigured) {
          if (!user.email || !isValidEmail(user.email)) {
            emailStatus = `📧 \\*Email Status\\:\\* ❌ NOT SET\n`;
          } else {
            emailStatus = `📧 \\*Email Status\\:\\* ✅ SET\n`;
          }
          
          if (!user.virtualAccount) {
            virtualAccountStatus = `💳 \\*Virtual Account\\:\\* ❌ NOT CREATED\n`;
          } else {
            virtualAccountStatus = `💳 \\*Virtual Account\\:\\* ✅ ACTIVE\n`;
          }
        } else {
          emailStatus = `📧 \\*Email Status\\:\\* ${user.email ? '✅ SET' : '❌ NOT SET'}\n`;
          virtualAccountStatus = `💳 \\*Virtual Account\\:\\* ⏳ CONFIG PENDING\n`;
        }
        
        const kycStatus = user.kycStatus || 'pending';
        
        await ctx.reply(
          `💰 \\*YOUR WALLET BALANCE\\*\n\n` +
          `💵 \\*Available\\:\\* ${formatCurrency(user.wallet)}\n` +
          `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
          `${emailStatus}` +
          `${virtualAccountStatus}` +
          `💡 Need more funds\\? Use "💳 Deposit Funds" button`,
          { parse_mode: 'MarkdownV2' }
        );
      } catch (error) {
        console.error('❌ Balance command error:', error);
        ctx.reply('❌ Error checking balance\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    bot.command('devices', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        
        if (!deviceHandler) {
          await initializeDeviceHandler(bot);
          if (!deviceHandler) {
            await ctx.reply(
              '📱 \\*Device Financing\\*\n\n' +
              '❌ \\*System Error\\*\n\n' +
              'The device financing system encountered an error\\.\n' +
              'Please try again in a few minutes or contact admin\\.\n\n' +
              '\\*Admin\\:\\* @opuenekeke',
              { parse_mode: 'MarkdownV2' }
            );
            return;
          }
        }
        
        deviceHandler.users = getUsers();
        await deviceHandler.handleDeviceMenu(ctx);
      } catch (error) {
        console.error('❌ Devices command error:', error);
        await ctx.reply('❌ Error loading device financing\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    // ==================== DEVICE FINANCING ADMIN COMMANDS ====================
    bot.command('adddevice', async (ctx) => {
      console.log('📱 /adddevice command received');
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      if (!deviceHandler) await initializeDeviceHandler(bot);
      
      if (deviceHandler) {
        deviceHandler.users = getUsers();
        await deviceHandler.handleAdminAddDevice(ctx, args);
      } else {
        await ctx.reply('❌ Device financing system not available.', { parse_mode: 'MarkdownV2' });
      }
    });

    bot.command('addinventory', async (ctx) => {
      console.log('📦 /addinventory command received');
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      if (!deviceHandler) await initializeDeviceHandler(bot);
      
      if (deviceHandler) {
        deviceHandler.users = getUsers();
        await deviceHandler.handleAdminAddInventory(ctx, args);
      } else {
        await ctx.reply('❌ Device financing system not available.', { parse_mode: 'MarkdownV2' });
      }
    });

    bot.command('addmarketer', async (ctx) => {
      console.log('👥 /addmarketer command received');
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      if (!deviceHandler) await initializeDeviceHandler(bot);
      
      if (deviceHandler) {
        deviceHandler.users = getUsers();
        await deviceHandler.handleAdminAddMarketer(ctx, args);
      } else {
        await ctx.reply('❌ Device financing system not available.', { parse_mode: 'MarkdownV2' });
      }
    });

    bot.command('removedevice', async (ctx) => {
      console.log('🗑️ /removedevice command received');
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      const userId = ctx.from.id.toString();
      
      if (!isAdmin(userId)) {
        await ctx.reply('❌ Admin access only.', { parse_mode: 'MarkdownV2' });
        return;
      }
      
      if (!deviceHandler) await initializeDeviceHandler(bot);
      
      if (deviceHandler) {
        deviceHandler.users = getUsers();
        await deviceHandler.handleAdminRemoveDevice(ctx, args);
      } else {
        await ctx.reply('❌ Device financing system not available.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    // ==================== CALLBACK HANDLERS ====================
    console.log('\n📋 REGISTERING CALLBACK HANDLERS...');
    
    // Load callbacks from modules
    const airtimeCallbacks = buyAirtime.getCallbacks ? buyAirtime.getCallbacks(bot, getUsers(), getSessions(), CONFIG, NETWORK_CODES) : {};
    const dataCallbacks = buyData.getCallbacks ? buyData.getCallbacks(bot, getUsers(), sessionManager, CONFIG) : {};
    const adminCallbacks = admin.getCallbacks ? admin.getCallbacks(bot, getUsers(), getTransactions(), CONFIG) : {};
    const kycCallbacks = kyc.getCallbacks ? kyc.getCallbacks(bot, getUsers()) : {};
    
    const usersForSendMoney = { ...getUsers(), ...userMethods };
    const sendMoneyCallbacks = sendMoney.getCallbacks ? sendMoney.getCallbacks(bot, usersForSendMoney, transactionMethods, CONFIG) : {};
    
    const cardPinCallbacks = buyCardPins.getCallbacks ? buyCardPins.getCallbacks(bot, getUsers(), sessionManager, CONFIG) : {};
    const examPinCallbacks = buyExamPins.getCallbacks ? buyExamPins.getCallbacks(bot, getUsers(), sessionManager, CONFIG) : {};
    const electricityCallbacks = buyElectricity.getCallbacks ? buyElectricity.getCallbacks(bot, getUsers(), sessionManager, CONFIG) : {};
    const tvCallbacks = buyTVSubscription.getCallbacks ? buyTVSubscription.getCallbacks(bot, getUsers(), sessionManager, CONFIG) : {};
    
    function registerCallbackHandlers(bot, callbacks, moduleName) {
      console.log(`🔗 Registering ${moduleName} callbacks...`);
      Object.entries(callbacks).forEach(([pattern, handler]) => {
        try {
          if (pattern.includes(':') && pattern.includes('_')) {
            const regexPattern = pattern.replace(/:\w+/g, '(.+)');
            bot.action(new RegExp(`^${regexPattern}$`), handler);
            console.log(`   ✓ Regex: ${pattern} -> ^${regexPattern}$`);
          } else if (pattern.includes('(') || pattern.includes('.') || pattern.includes('+') || pattern.includes('*') || pattern.includes('?')) {
            bot.action(new RegExp(`^${pattern}$`), handler);
            console.log(`   ✓ Regex: ${pattern}`);
          } else {
            bot.action(pattern, handler);
            console.log(`   ✓ Simple: ${pattern}`);
          }
        } catch (error) {
          console.error(`   ❌ Failed to register "${pattern}": ${error.message}`);
        }
      });
    }
    
    // Register device callbacks
    if (deviceHandler && Object.keys(deviceCreditCallbacks).length > 0) {
      for (const [pattern, handler] of Object.entries(deviceCreditCallbacks)) {
        try {
          if (pattern.includes('(') || pattern.includes('.') || pattern.includes('+') || pattern.includes('*') || pattern.includes('?')) {
            bot.action(new RegExp(pattern), handler);
            console.log(`📱 Device callback (regex): ${pattern}`);
          } else if (pattern.includes(':') && pattern.includes('_')) {
            const regexPattern = pattern.replace(/:\w+/g, '(.+)');
            bot.action(new RegExp(`^${regexPattern}$`), handler);
            console.log(`📱 Device callback (dynamic): ${pattern} -> ^${regexPattern}$`);
          } else {
            bot.action(pattern, handler);
            console.log(`📱 Device callback (simple): ${pattern}`);
          }
        } catch (error) {
          console.error(`❌ Failed to register device callback "${pattern}":`, error.message);
        }
      }
    }
    
    // Register Mini App callbacks
    if (deviceLockApp && miniAppCallbacks) {
      console.log('📱 Registering Mini App callbacks...');
      Object.entries(miniAppCallbacks).forEach(([pattern, handler]) => {
        try {
          if (pattern.includes('(') || pattern.includes('.') || pattern.includes('+') || pattern.includes('*') || pattern.includes('?')) {
            bot.action(new RegExp(pattern), handler);
            console.log(`📱 Mini App callback (regex): ${pattern}`);
          } else {
            bot.action(pattern, handler);
            console.log(`📱 Mini App callback (simple): ${pattern}`);
          }
        } catch (error) {
          console.error(`❌ Failed to register Mini App callback "${pattern}":`, error.message);
        }
      });
    }
    
    // Register other callbacks
    registerCallbackHandlers(bot, airtimeCallbacks, 'Airtime');
    registerCallbackHandlers(bot, dataCallbacks, 'Data');
    registerCallbackHandlers(bot, adminCallbacks, 'Admin');
    registerCallbackHandlers(bot, kycCallbacks, 'KYC');
    registerCallbackHandlers(bot, sendMoneyCallbacks, 'Send Money');
    registerCallbackHandlers(bot, cardPinCallbacks, 'Card Pins');
    registerCallbackHandlers(bot, examPinCallbacks, 'Exam Pins');
    registerCallbackHandlers(bot, electricityCallbacks, 'Electricity');
    registerCallbackHandlers(bot, tvCallbacks, 'TV Subscription');
    
    // ==================== ENHANCED TRANSACTION CALLBACKS ====================
    bot.action('admin_transaction_tracking', async (ctx) => {
      try {
        await handleAdminTransactionTracking(ctx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Admin transaction tracking callback error:', error);
        await ctx.answerCbQuery('❌ Error loading transaction tracking');
      }
    });
    
    bot.action('admin_search_tx_id', async (ctx) => {
      try {
        await handleSearchTransactionById(ctx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Search transaction by ID callback error:', error);
        await ctx.answerCbQuery('❌ Error starting search');
      }
    });
    
    bot.action('admin_advanced_search', async (ctx) => {
      try {
        await handleAdvancedSearch(ctx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Advanced search callback error:', error);
        await ctx.answerCbQuery('❌ Error loading advanced search');
      }
    });
    
    bot.action('admin_quick_export', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        await ctx.reply(
          '📁 \\*QUICK EXPORT\\*\n\n' +
          'Select what to export\\:\n\n' +
          '📅 \\*Today\\\'s Transactions\\*\n' +
          '❌ \\*Failed Transactions\\*\n' +
          '⏳ \\*Pending Transactions\\*\n' +
          '📡 \\*Transactions with API Data\\*\n' +
          '📊 \\*All Transactions\\*\n\n' +
          '👇 \\*Select an option\\:\\*',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📅 Today', 'admin_export_today_menu')],
              [Markup.button.callback('❌ Failed', 'admin_export_failed_menu')],
              [Markup.button.callback('⏳ Pending', 'admin_export_pending_menu')],
              [Markup.button.callback('📡 API Data', 'admin_export_api_menu')],
              [Markup.button.callback('📊 All', 'admin_export_all_menu')],
              [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
            ])
          }
        );
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Quick export callback error:', error);
        await ctx.answerCbQuery('❌ Error loading quick export');
      }
    });
    
    bot.action('admin_view_all_transactions', async (ctx) => {
      try {
        await handleViewAllTransactions(ctx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ View all transactions callback error:', error);
        await ctx.answerCbQuery('❌ Error loading transactions');
      }
    });
    
    bot.action('admin_view_failed_transactions', async (ctx) => {
      try {
        await handleViewFailedTransactions(ctx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ View failed transactions callback error:', error);
        await ctx.answerCbQuery('❌ Error loading failed transactions');
      }
    });
    
    bot.action('admin_view_pending_transactions', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const pendingTransactions = systemTransactionManager.searchTransactions({ status: 'pending' });
        
        let message = `⏳ \\*PENDING TRANSACTIONS\\*\n\n`;
        message += `📊 \\*Total Pending\\:\\* ${pendingTransactions.length} transactions\n`;
        message += `💰 \\*Total Amount\\:\\* ${formatCurrency(pendingTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0))}\n\n`;
        
        if (pendingTransactions.length === 0) {
          message += 'No pending transactions\\.';
        } else {
          pendingTransactions.slice(0, 10).forEach((tx, index) => {
            const amountText = formatCurrency(tx.amount || 0);
            const date = new Date(tx.timestamp).toLocaleString();
            const userInfo = tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() || tx.user.telegramId : 'Unknown';
            const apiCount = tx.apiResponses ? tx.apiResponses.length : 0;
            
            message += `⏳ \\*${escapeMarkdownV2(tx.type || 'unknown')}\\*\n`;
            message += `💰 \\*Amount\\:\\* ${amountText}\n`;
            message += `👤 \\*User\\:\\* ${escapeMarkdownV2(userInfo)}\n`;
            message += `📅 \\*Date\\:\\* ${escapeMarkdownV2(date)}\n`;
            message += `📡 \\*API Calls\\:\\* ${apiCount}\n`;
            message += `🔗 \\*ID\\:\\* \`${escapeMarkdownV2(tx.id || 'N/A')}\`\n\n`;
          });
        }
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
          ])
        });
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ View pending transactions callback error:', error);
        await ctx.answerCbQuery('❌ Error loading pending transactions');
      }
    });
    
    bot.action('admin_view_api_transactions', async (ctx) => {
      try {
        await handleViewApiTransactions(ctx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ View API transactions callback error:', error);
        await ctx.answerCbQuery('❌ Error loading API transactions');
      }
    });
    
    bot.action(/^admin_view_tx_(.+)$/, async (ctx) => {
      try {
        const transactionId = ctx.match[1];
        await systemTransactionManager.viewTransactionDetails(ctx, transactionId);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ View transaction callback error:', error);
        await ctx.answerCbQuery('❌ Error loading transaction details');
      }
    });
    
    bot.action(/^admin_view_api_raw_(.+)$/, async (ctx) => {
      try {
        const transactionId = ctx.match[1];
        await systemTransactionManager.viewRawApiData(ctx, transactionId);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ View raw API data callback error:', error);
        await ctx.answerCbQuery('❌ Error loading raw API data');
      }
    });
    
    bot.action(/^admin_export_tx_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const transactionId = ctx.match[1];
        
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        await ctx.reply(
          '📁 \\*EXPORT TRANSACTION\\*\n\n' +
          'Select export format\\:\n\n' +
          '📋 \\*JSON\\* \\- Full transaction details with API responses\n' +
          '📄 \\*TEXT\\* \\- Human\\-readable format\n\n' +
          '👇 \\*Select format\\:\\*',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 JSON', `admin_export_tx_json_${transactionId}`),
               Markup.button.callback('📄 TEXT', `admin_export_tx_txt_${transactionId}`)],
              [Markup.button.callback('🏠 Back', `admin_view_tx_${transactionId}`)]
            ])
          }
        );
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export transaction callback error:', error);
        await ctx.answerCbQuery('❌ Error loading export options');
      }
    });
    
    bot.action(/^admin_export_tx_json_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const transactionId = ctx.match[1];
        
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        await ctx.reply('🔄 Generating JSON export\\.\\.\\.', { parse_mode: 'MarkdownV2' });
        
        const result = await systemTransactionManager.exportTransaction(transactionId, 'json');
        
        await ctx.reply(
          `✅ \\*Transaction Exported Successfully\\!\\*\n\n` +
          `📋 \\*Format\\:\\* JSON\n` +
          `💾 \\*File\\:\\* ${escapeMarkdownV2(path.basename(result.path))}\n\n` +
          `📁 \\*Path\\:\\* \`${escapeMarkdownV2(result.path)}\``,
          { parse_mode: 'MarkdownV2' }
        );
        
        try {
          await ctx.replyWithDocument({
            source: result.path,
            filename: path.basename(result.path)
          });
        } catch (error) {
          console.log('⚠️ Could not send file via Telegram, providing download path instead');
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export transaction JSON error:', error);
        await ctx.answerCbQuery('❌ Error exporting transaction');
      }
    });
    
    bot.action(/^admin_export_tx_txt_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const transactionId = ctx.match[1];
        
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        await ctx.reply('🔄 Generating TEXT export\\.\\.\\.', { parse_mode: 'MarkdownV2' });
        
        const result = await systemTransactionManager.exportTransaction(transactionId, 'txt');
        
        await ctx.reply(
          `✅ \\*Transaction Exported Successfully\\!\\*\n\n` +
          `📄 \\*Format\\:\\* TEXT\n` +
          `💾 \\*File\\:\\* ${escapeMarkdownV2(path.basename(result.path))}\n\n` +
          `📁 \\*Path\\:\\* \`${escapeMarkdownV2(result.path)}\``,
          { parse_mode: 'MarkdownV2' }
        );
        
        try {
          await ctx.replyWithDocument({
            source: result.path,
            filename: path.basename(result.path)
          });
        } catch (error) {
          console.log('⚠️ Could not send file via Telegram, providing download path instead');
        }
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export transaction TEXT error:', error);
        await ctx.answerCbQuery('❌ Error exporting transaction');
      }
    });
    
    bot.action(/^admin_update_tx_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const transactionId = ctx.match[1];
        
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        await ctx.reply(
          `🔄 \\*UPDATE TRANSACTION STATUS\\*\n\n` +
          `📋 \\*Transaction ID\\:\\* \`${escapeMarkdownV2(transactionId)}\`\n\n` +
          `Select new status\\:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Complete', `admin_update_tx_complete_${transactionId}`),
               Markup.button.callback('❌ Fail', `admin_update_tx_fail_${transactionId}`)],
              [Markup.button.callback('⏳ Pending', `admin_update_tx_pending_${transactionId}`)],
              [Markup.button.callback('🏠 Back', `admin_view_tx_${transactionId}`)]
            ])
          }
        );
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Update transaction status callback error:', error);
        await ctx.answerCbQuery('❌ Error loading update options');
      }
    });
    
    bot.action(/^admin_update_tx_complete_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const transactionId = ctx.match[1];
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        await systemTransactionManager.updateTransactionStatus(ctx, transactionId, 'completed', 'Manually completed by admin');
        await ctx.answerCbQuery('✅ Transaction completed');
      } catch (error) {
        console.error('❌ Update to complete error:', error);
        await ctx.answerCbQuery('❌ Error updating transaction');
      }
    });
    
    bot.action(/^admin_update_tx_fail_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const transactionId = ctx.match[1];
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        await systemTransactionManager.updateTransactionStatus(ctx, transactionId, 'failed', 'Manually failed by admin');
        await ctx.answerCbQuery('❌ Transaction failed');
      } catch (error) {
        console.error('❌ Update to failed error:', error);
        await ctx.answerCbQuery('❌ Error updating transaction');
      }
    });
    
    bot.action(/^admin_update_tx_pending_(.+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const transactionId = ctx.match[1];
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        await systemTransactionManager.updateTransactionStatus(ctx, transactionId, 'pending', 'Manually set to pending by admin');
        await ctx.answerCbQuery('⏳ Transaction pending');
      } catch (error) {
        console.error('❌ Update to pending error:', error);
        await ctx.answerCbQuery('❌ Error updating transaction');
      }
    });
    
    bot.action(/^admin_transactions_page_(\d+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        const page = parseInt(ctx.match[1]);
        await handleViewAllTransactions(ctx, page);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Transactions page callback error:', error);
        await ctx.answerCbQuery('❌ Error loading page');
      }
    });
    
    bot.action(/^admin_failed_page_(\d+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        const page = parseInt(ctx.match[1]);
        await handleViewFailedTransactions(ctx, page);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Failed transactions page callback error:', error);
        await ctx.answerCbQuery('❌ Error loading page');
      }
    });
    
    bot.action(/^admin_api_page_(\d+)$/, async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        const page = parseInt(ctx.match[1]);
        await handleViewApiTransactions(ctx, page);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ API transactions page callback error:', error);
        await ctx.answerCbQuery('❌ Error loading page');
      }
    });
    
    bot.action('admin_export_today_menu', async (ctx) => {
      try {
        await exportManager.quickExport(ctx, 'today');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export today menu error:', error);
        await ctx.answerCbQuery('❌ Error loading export menu');
      }
    });
    
    bot.action('admin_export_failed_menu', async (ctx) => {
      try {
        await exportManager.quickExport(ctx, 'failed');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export failed menu error:', error);
        await ctx.answerCbQuery('❌ Error loading export menu');
      }
    });
    
    bot.action('admin_export_pending_menu', async (ctx) => {
      try {
        await exportManager.quickExport(ctx, 'pending');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export pending menu error:', error);
        await ctx.answerCbQuery('❌ Error loading export menu');
      }
    });
    
    bot.action('admin_export_api_menu', async (ctx) => {
      try {
        await exportManager.quickExport(ctx, 'api');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export API menu error:', error);
        await ctx.answerCbQuery('❌ Error loading export menu');
      }
    });
    
    bot.action('admin_export_all_menu', async (ctx) => {
      try {
        await exportManager.quickExport(ctx, 'all');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export all menu error:', error);
        await ctx.answerCbQuery('❌ Error loading export menu');
      }
    });
    
    bot.action('admin_export_today_csv', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        const filters = userSession?.exportFilters || {};
        await exportManager.generateExport(ctx, filters, 'csv');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export today CSV error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    bot.action('admin_export_today_excel', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        const filters = userSession?.exportFilters || {};
        await exportManager.generateExport(ctx, filters, 'excel');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export today Excel error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    bot.action('admin_export_today_json', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        const filters = userSession?.exportFilters || {};
        await exportManager.generateExport(ctx, filters, 'json');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export today JSON error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    bot.action('admin_export_today_pdf', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        const filters = userSession?.exportFilters || {};
        await exportManager.generateExport(ctx, filters, 'pdf');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export today PDF error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    bot.action('admin_export_search', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        
        if (!userSession || !userSession.lastSearch) {
          await ctx.answerCbQuery('❌ No search results to export');
          return;
        }
        
        await ctx.reply(
          '📁 \\*EXPORT SEARCH RESULTS\\*\n\n' +
          'Select export format\\:\n\n' +
          '📊 \\*JSON\\* \\- Raw data for analysis\n' +
          '📈 \\*CSV\\* \\- Spreadsheet format\n' +
          '📉 \\*Excel\\* \\- Advanced Excel file\n' +
          '📋 \\*PDF\\* \\- Printable report\n\n' +
          '👇 \\*Select format\\:\\*',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📊 JSON', 'admin_export_search_json')],
              [Markup.button.callback('📈 CSV', 'admin_export_search_csv')],
              [Markup.button.callback('📉 Excel', 'admin_export_search_excel')],
              [Markup.button.callback('📋 PDF', 'admin_export_search_pdf')],
              [Markup.button.callback('🏠 Back', 'admin_transaction_tracking')]
            ])
          }
        );
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export search callback error:', error);
        await ctx.answerCbQuery('❌ Error loading export options');
      }
    });
    
    bot.action('admin_export_search_json', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        if (!userSession || !userSession.lastSearch) {
          await ctx.answerCbQuery('❌ No search results to export');
          return;
        }
        await exportManager.generateExport(ctx, userSession.lastSearch, 'json');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export search JSON error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    bot.action('admin_export_search_csv', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        if (!userSession || !userSession.lastSearch) {
          await ctx.answerCbQuery('❌ No search results to export');
          return;
        }
        await exportManager.generateExport(ctx, userSession.lastSearch, 'csv');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export search CSV error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    bot.action('admin_export_search_excel', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        if (!userSession || !userSession.lastSearch) {
          await ctx.answerCbQuery('❌ No search results to export');
          return;
        }
        await exportManager.generateExport(ctx, userSession.lastSearch, 'excel');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export search Excel error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    bot.action('admin_export_search_pdf', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessions = getSessions();
        const userSession = sessions[userId];
        if (!userSession || !userSession.lastSearch) {
          await ctx.answerCbQuery('❌ No search results to export');
          return;
        }
        await exportManager.generateExport(ctx, userSession.lastSearch, 'pdf');
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Export search PDF error:', error);
        await ctx.answerCbQuery('❌ Error exporting');
      }
    });
    
    // ==================== STANDARD ADMIN CALLBACKS ====================
    bot.action('admin_users', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const users = getUsers();
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
    });
    
    bot.action('admin_kyc', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const users = getUsers();
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
    });
    
    bot.action('admin_device_financing', async (ctx) => {
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
    });
    
    bot.action('admin_balance', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        const users = getUsers();
        let totalWalletBalance = 0;
        let totalVirtualAccounts = 0;
        let pendingTransactions = 0;
        let completedTransactions = 0;
        
        Object.values(users).forEach(user => {
          totalWalletBalance += user.wallet || 0;
          if (user.virtualAccount) totalVirtualAccounts += 1;
        });
        
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
    });
    
    bot.action('admin_stats', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (!isAdmin(userId)) {
          await ctx.answerCbQuery('❌ Admin access only');
          return;
        }
        
        if (adminCallbacks && adminCallbacks['admin_stats']) {
          await adminCallbacks['admin_stats'](ctx);
        } else {
          const users = getUsers();
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
        }
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ System stats callback error:', error);
        await ctx.answerCbQuery('❌ Error loading system stats');
      }
    });
    
    bot.action('start', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        const isUserAdmin = isAdmin(userId);
        
        let keyboard = isUserAdmin ? [
          ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
          ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
          ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
          ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
          ['🛂 KYC Status', '🛠️ Admin Panel', '🆘 Help & Support']
        ] : [
          ['📱 Device Financing', '📺 TV Subscription', '💡 Electricity Bill'],
          ['📞 Buy Airtime', '📡 Buy Data', '🎫 Card Pins'],
          ['📝 Exam Pins', '⚡ Lite Light', '🏦 Money Transfer'],
          ['💰 Wallet Balance', '💳 Deposit Funds', '📜 Transaction History'],
          ['🛂 KYC Status', '🆘 Help & Support']
        ];
        
        const kycStatus = user.kycStatus || 'pending';
        
        let emailStatus = '';
        let virtualAccountStatus = '';
        const billstackConfigured = CONFIG.BILLSTACK_API_KEY && CONFIG.BILLSTACK_SECRET_KEY;
        
        if (billstackConfigured) {
          if (!user.email || !isValidEmail(user.email)) {
            emailStatus = `\n📧 \\*Email Status\\:\\* ❌ NOT SET\n\\_Set email via deposit process for virtual account\\_`;
          } else {
            emailStatus = `\n📧 \\*Email Status\\:\\* ✅ SET`;
          }
          
          if (!user.virtualAccount) {
            virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ❌ NOT CREATED\n\\_Create virtual account via deposit process\\_`;
          } else {
            virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ✅ ACTIVE`;
          }
        } else {
          emailStatus = `\n📧 \\*Email Status\\:\\* ${user.email ? '✅ SET' : '❌ NOT SET'}`;
          virtualAccountStatus = `\n💳 \\*Virtual Account\\:\\* ⏳ CONFIG PENDING\n\\_Admin configuring Billstack API\\_`;
        }
        
        let deviceFinancingStatus = '';
        if (user.isMarketer) {
          deviceFinancingStatus = `\n👥 \\*Device Marketer\\:\\* ✅ ACTIVE`;
        }
        
        try { await ctx.deleteMessage(); } catch (e) {}
        
        await ctx.reply(
          `🌟 \\*Welcome to Liteway VTU Bot\\!\\*\n\n` +
          `🛂 \\*KYC Status\\:\\* ${escapeMarkdownV2(kycStatus.toUpperCase())}\n` +
          `💵 \\*Wallet Balance\\:\\* ${formatCurrency(user.wallet)}\n` +
          `${emailStatus}` +
          `${virtualAccountStatus}` +
          `${deviceFinancingStatus}\n\n` +
          `📱 \\*Available Services\\:\\*\n` +
          `• 📱 Device Financing \\(Buy smartphones on credit\\)\n` +
          `• 📺 TV Subscription\n` +
          `• 💡 Electricity Bill\n` +
          `• 📞 Buy Airtime\n` +
          `• 📡 Buy Data\n` +
          `• 🎫 Card Pins\n` +
          `• 📝 Exam Pins\n` +
          `• ⚡ Lite Light\n` +
          `• 🏦 Money Transfer \\(NEW\\: Bank \\+ Litemonie\\)\n` +
          `• 💰 Wallet Balance\n` +
          `• 💳 Deposit Funds\n` +
          `• 📜 Transaction History\n` +
          `• 🛂 KYC Status\n` +
          `${isUserAdmin ? '• 🛠️ Admin Panel \\(ENHANCED with API Response Tracking\\)\n' : ''}` +
          `• 🆘 Help & Support\n\n` +
          `📞 \\*Support\\:\\* @opuenekeke`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.keyboard(keyboard).resize()
          }
        );
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Home callback error:', error);
        await ctx.answerCbQuery('❌ Error going home');
      }
    });
    
    bot.action('no_action', async (ctx) => {
      ctx.answerCbQuery();
    });
    
    bot.action('device_back', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        if (deviceHandler) {
          deviceHandler.users = getUsers();
          await deviceHandler.handleDeviceMenu(ctx);
        } else {
          await ctx.answerCbQuery('❌ Device system unavailable');
        }
      } catch (error) {
        console.error('❌ Device back button error:', error);
        ctx.answerCbQuery('❌ Error going back');
      }
    });
    
    bot.action('device_mini_app', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        
        if (!deviceLockApp) {
          await ctx.reply(
            '📱 \\*DEVICE LOCK APP\\*\n\n' +
            '❌ \\*System Not Ready\\*\n\n' +
            'The device lock app system is still initializing\\.\n' +
            'Please try again in a few seconds\\.',
            { parse_mode: 'MarkdownV2' }
          );
          await ctx.answerCbQuery();
          return;
        }
        
        await deviceLockApp.handleMiniAppCommand(ctx);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Mini App button error:', error);
        await ctx.answerCbQuery('❌ Error loading Mini App');
      }
    });
    
    bot.action('unlock_command', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        await initUser(userId);
        
        if (!deviceHandler) {
          await ctx.answerCbQuery('❌ System not ready');
          return;
        }
        
        deviceHandler.users = getUsers();
        const imeiMappings = await deviceHandler.getUserIMEIMappings(userId);
        const lockedDevices = imeiMappings.filter(m => m.imeiStatus === 'locked');
        
        if (lockedDevices.length === 0) {
          await ctx.reply(
            `🔓 \\*DEVICE UNLOCK\\*\n\n` +
            `You don't have any locked devices\\.\n\n` +
            `Devices are automatically unlocked when fully paid\\.\n\n` +
            `\\*To check your devices\\:\\*`,
            {
              parse_mode: 'MarkdownV2',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📱 Check Status', 'status')],
                [Markup.button.callback('📱 Open App', 'device_mini_app')]
              ])
            }
          );
          return;
        }
        
        let message = `🔓 \\*LOCKED DEVICES\\*\n\n`;
        message += `\\*You have ${lockedDevices.length} locked device${lockedDevices.length !== 1 ? 's' : ''}\\:\\*\n\n`;
        
        const buttons = [];
        lockedDevices.forEach((mapping, index) => {
          message += `\\*${index + 1}\\. ${mapping.deviceMake} ${mapping.deviceModel}\\*\n`;
          message += `   📱 \\*IMEI\\:\\* ${mapping.imei}\n`;
          message += `   🆔 \\*Installment ID\\:\\* ${mapping.installmentId}\n\n`;
          buttons.push([
            Markup.button.callback(`🔓 Request Unlock - ${mapping.deviceMake}`, `request_unlock_${mapping.imei}`)
          ]);
        });
        
        message += `\\*To unlock a device\\:\\*\n`;
        message += `1\\. Ensure all payments are completed ✅\n`;
        message += `2\\. Click the request button below\n`;
        message += `3\\. Admin will process within 1\\-2 hours ⏰\n`;
        message += `4\\. You'll be notified when unlocked 📲\n\n`;
        message += `📞 \\*Support\\:\\* @opuenekeke`;
        
        buttons.push([
          Markup.button.callback('📱 Open Full App', 'device_mini_app'),
          Markup.button.callback('💰 Check Payments', 'device_make_payment')
        ]);
        
        await ctx.reply(message, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(buttons)
        });
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Unlock callback error:', error);
        await ctx.answerCbQuery('❌ Error loading unlock');
      }
    });
    
    bot.action('bank_transfer', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const usersForSendMoney = { ...getUsers(), ...userMethods };
        
        await systemTransactionManager.recordTransaction({
          type: 'bank_transfer_started',
          userId: userId,
          telegramId: userId,
          status: 'started',
          description: 'User started bank transfer process'
        });
        
        await sendMoney.handleSendMoney(ctx, usersForSendMoney, transactionMethods);
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Bank transfer callback error:', error);
        await ctx.answerCbQuery('❌ Error loading bank transfer');
      }
    });
    
    bot.action('litemonie_transfer', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const user = await initUser(userId);
        
        if (!await checkKYCAndPIN(userId, ctx)) return;
        
        if (!user.phone) {
          await ctx.reply(
            '📱 \\*LITEMONIE TRANSFER\\*\n\n' +
            '❌ \\*Phone Number Required\\*\n\n' +
            'You need to register a phone number to use Litemonie transfer\\.\n\n' +
            '📞 \\*How to register\\:\\*\n' +
            '1\\. Go to "🛂 KYC Status"\n' +
            '2\\. Complete your KYC with phone number\n' +
            '3\\. Wait for admin approval\n\n' +
            'Once approved, your phone number will be your Litemonie account number\\.',
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }
        
        await ctx.reply(
          '📱 \\*LITEMONIE TRANSFER\\*\n\n' +
          '💸 \\*Send money to other bot users\\*\n\n' +
          '📞 \\*Your Litemonie Account\\:\\* ' + escapeMarkdownV2(user.phone || 'Not registered') + '\n' +
          '💵 \\*Available Balance\\:\\* ' + formatCurrency(user.wallet) + '\n\n' +
          '📝 \\*Enter recipient\\\'s registered phone number\\:\\*\n' +
          '\\(Example\\: 08012345678\\)',
          { parse_mode: 'MarkdownV2' }
        );
        
        const sessions = getSessions();
        sessions[userId] = { action: 'litemonie_transfer', step: 'enter_phone' };
        setSessions(sessions);
        await saveAllData();
        
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('❌ Litemonie transfer callback error:', error);
        await ctx.answerCbQuery('❌ Error loading Litemonie transfer');
      }
    });
    
    console.log('✅ All callback handlers registered');
    
    // ==================== TEXT MESSAGE HANDLER ====================
    bot.on('text', async (ctx) => {
      try {
        const text = ctx.message.text.trim();
        const userId = ctx.from.id.toString();
        
        if (text.startsWith('/')) return;
        
        await initUser(userId);
        console.log(`📱 Text from user ${userId}: "${text}"`);
        
        const sessions = getSessions();
        const userSession = sessions[userId];
        
        if (userSession && userSession.action === 'admin_search_tx_id') {
          await handleSearchTransactionIdText(ctx, text);
          return;
        }
        
        if (userSession && userSession.action === 'admin_advanced_search') {
          await handleAdvancedSearchText(ctx, text);
          return;
        }
        
        if (deviceHandler) {
          deviceHandler.users = getUsers();
          const handled = await deviceHandler.handleTextMessage(ctx, text, userSession);
          if (handled) {
            console.log(`✅ Device handler handled text: "${text}"`);
            return;
          }
        }
        
        if (deviceLockApp && typeof deviceLockApp.handleText === 'function') {
          if (userSession && userSession.action === 'mini_app') {
            const handled = await deviceLockApp.handleText(ctx, text, userSession);
            if (handled) {
              console.log(`✅ Mini App handled text: "${text}"`);
              return;
            }
          }
        }
        
        const handled = await handleTextMessage(ctx, text);
        
        if (!handled) {
          console.log(`📱 Text not handled by any handler: "${text}"`);
        }
      } catch (error) {
        console.error('❌ Text handler error:', error);
        await ctx.reply('❌ An error occurred\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      }
    });
    
    // ==================== ERROR HANDLING ====================
    bot.catch((err, ctx) => {
      console.error(`❌ Global Error:`, err);
      try {
        ctx.reply('❌ An error occurred\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
      } catch (e) {
        console.error('❌ Error in error handler:', e);
      }
    });
    
    // ==================== LAUNCH BOT ====================
    console.log('\n🚀 Launching bot with API-RESPONSE ENHANCED TRANSACTION TRACKING + MINI APP...');
    
    bot.launch().then(() => {
      console.log('✅ VTU Bot Launched Successfully with API-RESPONSE ENHANCED TRANSACTION TRACKING + MINI APP!');
      console.log(`👑 Admin ID: ${CONFIG.ADMIN_ID}`);
      console.log(`🔑 VTU API Key: ${CONFIG.VTU_API_KEY ? '✅ SET' : '❌ NOT SET'}`);
      console.log(`🔑 Monnify API Key: ${CONFIG.MONNIFY_API_KEY ? '✅ SET' : '❌ NOT SET'}`);
      
      console.log('\n✅ ALL CORE FEATURES AVAILABLE:');
      console.log('• 📱 Device Financing (TOP FEATURE)');
      console.log('• 🚀 Telegram Mini App Integration');
      console.log('• 📺 TV Subscription');
      console.log('• 💡 Electricity Bill');
      console.log('• 📞 Buy Airtime');
      console.log('• 📡 Buy Data');
      console.log('• 🎫 Card Pins');
      console.log('• 📝 Exam Pins');
      console.log('• ⚡ Lite Light');
      console.log('• 🏦 Money Transfer (Bank + Litemonie)');
      console.log('• 💰 Wallet Balance');
      console.log('• 💳 Deposit Funds');
      console.log('• 📜 Transaction History');
      console.log('• 🛂 KYC Status');
      console.log('• 🛠️ Admin Panel (ENHANCED with API Response Tracking)');
      console.log('• 🆘 Help & Support');
      
      console.log('\n📱 TELEGRAM MINI APP FEATURES:');
      console.log('• ✅ /app command to open Mini App');
      console.log('• ✅ /status command to check device status');
      console.log('• ✅ /unlock command to request device unlock');
      console.log('• ✅ Interactive device monitoring');
      console.log('• ✅ Real-time payment tracking');
      console.log('• ✅ Device unlock requests');
      console.log('• ✅ Support contact integration');
      
      console.log('\n📊 ENHANCED TRANSACTION TRACKING FEATURES:');
      console.log('• ✅ Search transactions by ID');
      console.log('• 🔍 View API request/response data');
      console.log('• 📊 Export functionality (CSV, Excel, JSON, PDF)');
      console.log('• 📡 Track API call statistics');
      console.log('• 💾 Proper file export system');
      console.log('• 📋 Detailed transaction analysis');
      
      console.log('\n⚡ BOT IS RUNNING WITH MINI APP + ENHANCED TRANSACTION TRACKING!');
      console.log('🔧 Mode: POLLING (Offline/Local)');
      console.log('🚀 Ready for advanced transaction tracking with Mini App!');
    }).catch(err => {
      console.error('❌ Bot launch failed:', err);
    });
    
  } catch (error) {
    console.error('❌ Main initialization error:', error);
  }
}

// ==================== GRACEFUL SHUTDOWN ====================
process.once('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  console.log('💾 Saving all data before shutdown...');
  await saveAllData();
  console.log('✅ Bot stopped gracefully');
});

process.once('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  console.log('💾 Saving all data before shutdown...');
  await saveAllData();
  console.log('✅ Bot stopped gracefully');
});

// ==================== START APPLICATION ====================
main();

module.exports = {
  users: getUsers,
  transactions: getTransactions,
  userMethods,
  transactionMethods,
  virtualAccounts,
  systemTransactionManager,
  apiResponseManager,
  analyticsManager,
  exportManager,
  deviceHandler,
  deviceLockApp,
  saveAllData
};