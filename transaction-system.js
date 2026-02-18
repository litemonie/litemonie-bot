// ==================== TRANSACTION-SYSTEM.JS ====================
// API Response Manager, Transaction Tracking, Export Manager, Analytics
// ALL MARKDOWN ERRORS FIXED - PROPER ESCAPING EVERYWHERE
// ================================================================

const path = require('path');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { format } = require('@fast-csv/format');
const fs = require('fs').promises;

const { CONFIG } = require('./config');
const { 
  getUsers, getSystemTransactions, setSystemTransactions,
  getApiResponses, setApiResponses, exportsDir, saveAllData
} = require('./database');
const { escapeMarkdownV2, formatCurrency, isAdmin } = require('./utils');

// ==================== API RESPONSE STORAGE ====================
const apiResponseManager = {
  saveResponse: async (transactionId, apiName, requestData, responseData, status = 'success') => {
    try {
      const apiResponses = getApiResponses();
      if (!apiResponses[transactionId]) apiResponses[transactionId] = [];
      
      const apiResponse = {
        id: `api_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        transactionId, 
        apiName, 
        request: requestData, 
        response: responseData,
        status, 
        timestamp: new Date().toISOString()
      };
      
      apiResponses[transactionId].push(apiResponse);
      setApiResponses(apiResponses);
      
      const systemTransactions = getSystemTransactions();
      const txIndex = systemTransactions.findIndex(tx => tx.id === transactionId);
      if (txIndex !== -1) {
        if (!systemTransactions[txIndex].apiResponses) systemTransactions[txIndex].apiResponses = [];
        systemTransactions[txIndex].apiResponses.push(apiResponse);
        setSystemTransactions(systemTransactions);
      }
      
      await saveAllData();
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
    return apiName ? responses.filter(r => r.apiName === apiName) : responses;
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
      return transaction;
    } catch (error) {
      console.error('❌ Error recording system transaction:', error);
      return null;
    }
  },
  
  recordTransactionWithApiResponse: async (transactionData, apiName, requestData, responseData, apiStatus = 'success') => {
    const transaction = await systemTransactionManager.recordTransaction(transactionData);
    if (transaction) {
      await apiResponseManager.saveResponse(transaction.id, apiName, requestData, responseData, apiStatus);
    }
    return transaction;
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
    }
    else if (typeLower.includes('data')) { 
      category = 'data'; 
      description = `Data purchase for ${txData.phone || 'unknown'} (${txData.network || 'unknown'}) - ${txData.planName || txData.dataPlan || ''}`; 
    }
    else if (typeLower.includes('deposit') || typeLower.includes('credit')) { 
      category = 'deposit'; 
      description = `Wallet deposit - ${txData.method || 'unknown method'}`; 
    }
    else if (typeLower.includes('litemonie') || typeLower.includes('transfer')) { 
      category = 'p2p_transfer'; 
    }
    else if (typeLower.includes('bank')) { 
      category = 'bank_transfer'; 
    }
    else if (typeLower.includes('tv')) { 
      category = 'tv_subscription'; 
    }
    else if (typeLower.includes('electricity') || typeLower.includes('light')) { 
      category = 'electricity'; 
    }
    else if (typeLower.includes('exam')) { 
      category = 'exam_pin'; 
    }
    else if (typeLower.includes('card')) { 
      category = 'card_purchase'; 
    }
    else if (typeLower.includes('device')) { 
      category = 'device_financing'; 
    }
    
    const transaction = {
      id: txId, 
      timestamp: new Date().toISOString(),
      type: txData.type || category, 
      category,
      userId, 
      telegramId: userId,
      amount: parseFloat(txData.amount) || 0,
      status: txData.status || 'completed',
      description, 
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
      transaction,
      user: user ? {
        id: user.telegramId, 
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        username: user.username, 
        phone: user.phone, 
        email: user.email,
        wallet: user.wallet, 
        kycStatus: user.kycStatus
      } : null,
      apiResponses, 
      apiResponseCount: apiResponses.length,
      rawApiResponses: JSON.stringify(apiResponses, null, 2)
    };
  },
  
  searchTransactions: (filters = {}) => {
    const systemTransactions = getSystemTransactions();
    let results = [...systemTransactions];
    
    if (filters.searchTerm) {
      const searchTerm = filters.searchTerm.toString().toLowerCase();
      results = results.filter(tx => (
        (tx.id?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.description?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.phone?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.reference?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.userId?.toString().includes(searchTerm)) ||
        (tx.user?.firstName?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.user?.lastName?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.type?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.category?.toString().toLowerCase().includes(searchTerm)) ||
        (tx.network?.toString().toLowerCase().includes(searchTerm))
      ));
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
    
    if (filters.hasApiResponse === true) results = results.filter(tx => tx.apiResponses && tx.apiResponses.length > 0);
    else if (filters.hasApiResponse === false) results = results.filter(tx => !tx.apiResponses || tx.apiResponses.length === 0);
    
    if (filters.apiName) results = results.filter(tx => tx.apiResponses?.some(r => r.apiName === filters.apiName));
    
    const sortField = filters.sortBy || 'timestamp';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
    results.sort((a, b) => {
      if (sortField === 'amount') return (a.amount - b.amount) * sortOrder;
      if (sortField === 'timestamp') return (new Date(b.timestamp) - new Date(a.timestamp)) * sortOrder * -1;
      return 0;
    });
    
    if (filters.page && filters.pageSize) {
      const page = parseInt(filters.page) || 1;
      const pageSize = parseInt(filters.pageSize) || 50;
      results = results.slice((page - 1) * pageSize, page * pageSize);
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
      today: systemTransactions.filter(tx => tx.timestamp.startsWith(new Date().toISOString().split('T')[0])).length,
      totalAmount: systemTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
      todayAmount: systemTransactions.filter(tx => tx.timestamp.startsWith(new Date().toISOString().split('T')[0]))
        .reduce((sum, tx) => sum + (tx.amount || 0), 0),
      withApiResponses: systemTransactions.filter(tx => tx.apiResponses && tx.apiResponses.length > 0).length,
      apiCallsByType: {}, 
      apiSuccessRate: {}
    };
    
    systemTransactions.forEach(tx => {
      const category = tx.category || 'general';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
      
      if (tx.apiResponses) {
        tx.apiResponses.forEach(response => {
          const apiName = response.apiName || 'unknown';
          stats.apiCallsByType[apiName] = (stats.apiCallsByType[apiName] || 0) + 1;
          if (!stats.apiSuccessRate[apiName]) stats.apiSuccessRate[apiName] = { success: 0, total: 0 };
          stats.apiSuccessRate[apiName].total++;
          if (response.status === 'success') stats.apiSuccessRate[apiName].success++;
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
      throw error; 
    }
  },
  
  exportToCSV: async (transactions, filePath, options = {}) => {
    return new Promise((resolve, reject) => {
      const csvStream = format({ headers: true });
      const writeStream = fs.createWriteStream(filePath);
      csvStream.pipe(writeStream);
      
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
          'API Calls': tx.apiResponses?.length || 0, 
          'Error': tx.error || ''
        };
        if (options.includeApiResponses !== false && tx.apiResponses?.length) {
          row['API Response Summary'] = tx.apiResponses.map(r => `${r.apiName}:${r.status}`).join('; ');
        }
        csvStream.write(row);
      });
      
      csvStream.end();
      writeStream.on('finish', () => resolve({ path: filePath, format: 'csv', count: transactions.length }));
      writeStream.on('error', reject);
    });
  },
  
  exportToExcel: async (transactions, filePath, options = {}) => {
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
      worksheet.addRow({
        id: tx.id || '', 
        timestamp: tx.timestamp || '', 
        type: tx.type || '',
        category: tx.category || '', 
        amount: tx.amount || 0, 
        status: tx.status || '',
        userId: tx.userId || tx.telegramId || '',
        userName: tx.user ? `${tx.user.firstName || ''} ${tx.user.lastName || ''}`.trim() : '',
        phone: tx.phone || '', 
        network: tx.network || '', 
        plan: tx.dataPlan || tx.planName || '',
        description: tx.description || '', 
        reference: tx.reference || '',
        apiCalls: tx.apiResponses?.length || 0, 
        error: tx.error || ''
      });
    });
    
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 25 }, { header: 'Value', key: 'value', width: 20 }];
    
    const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const completed = transactions.filter(tx => tx.status === 'completed').length;
    const failed = transactions.filter(tx => tx.status === 'failed').length;
    const pending = transactions.filter(tx => tx.status === 'pending').length;
    const withApiCalls = transactions.filter(tx => tx.apiResponses?.length).length;
    
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
        if (tx.apiResponses) {
          tx.apiResponses.forEach(response => {
            apiSheet.addRow({
              transactionId: tx.id, 
              apiName: response.apiName || 'unknown',
              status: response.status || 'unknown', 
              timestamp: response.timestamp || '',
              requestSummary: JSON.stringify(response.request || {}).substring(0, 100),
              responseSummary: JSON.stringify(response.response || {}).substring(0, 100)
            });
          });
        }
      });
    }
    
    await workbook.xlsx.writeFile(filePath);
    return { path: filePath, format: 'excel', count: transactions.length };
  },
  
  exportToJSON: async (transactions, filePath, options = {}) => {
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
  },
  
  exportToPDF: async (transactions, filePath, options = {}) => {
    return new Promise((resolve, reject) => {
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
      const withApiCalls = transactions.filter(tx => tx.apiResponses?.length).length;
      
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
    });
  },
  
  // ========== FIXED: PROPER MARKDOWNV2 ESCAPING ==========
  viewTransactionDetails: async (ctx, transactionId) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin access only');
    
    const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
    if (!transactionDetails) {
      return ctx.reply(`❌ Transaction not found\\: ${escapeMarkdownV2(transactionId)}`, { parse_mode: 'MarkdownV2' });
    }
    
    const { transaction, user, apiResponses } = transactionDetails;
    const formattedDate = escapeMarkdownV2(new Date(transaction.timestamp).toLocaleString());
    const escapedTxId = escapeMarkdownV2(transaction.id || 'N/A');
    const escapedType = escapeMarkdownV2(transaction.type || 'Unknown');
    const escapedCategory = escapeMarkdownV2(transaction.category || 'General');
    const escapedStatus = escapeMarkdownV2(transaction.status || 'Unknown');
    const escapedPhone = escapeMarkdownV2(transaction.phone || 'N/A');
    const escapedNetwork = escapeMarkdownV2(transaction.network || 'N/A');
    const escapedReference = escapeMarkdownV2(transaction.reference || 'N/A');
    const escapedDescription = escapeMarkdownV2(transaction.description || 'N/A');
    
    let message = `🔍 *TRANSACTION DETAILS*\n\n`;
    message += `📋 *Transaction ID\\:* \`${escapedTxId}\`\n`;
    message += `📅 *Date\\:* ${formattedDate}\n`;
    message += `💰 *Amount\\:* ${formatCurrency(transaction.amount || 0)}\n`;
    message += `📝 *Type\\:* ${escapedType}\n`;
    message += `📂 *Category\\:* ${escapedCategory}\n`;
    message += `📊 *Status\\:* ${escapedStatus}\n`;
    message += `📱 *Phone\\:* ${escapedPhone}\n`;
    message += `📶 *Network\\:* ${escapedNetwork}\n`;
    message += `📄 *Reference\\:* ${escapedReference}\n`;
    message += `📝 *Description\\:* ${escapedDescription}\n\n`;
    
    if (user) {
      const escapedUserId = escapeMarkdownV2(user.id || 'N/A');
      const escapedUserName = escapeMarkdownV2(user.name || 'N/A');
      const escapedEmail = escapeMarkdownV2(user.email || 'N/A');
      const escapedUserPhone = escapeMarkdownV2(user.phone || 'N/A');
      const escapedKyc = escapeMarkdownV2(user.kycStatus || 'pending');
      
      message += `👤 *USER DETAILS*\n`;
      message += `🆔 *User ID\\:* ${escapedUserId}\n`;
      message += `👤 *Name\\:* ${escapedUserName}\n`;
      message += `📧 *Email\\:* ${escapedEmail}\n`;
      message += `📱 *Phone\\:* ${escapedUserPhone}\n`;
      message += `💰 *Wallet Balance\\:* ${formatCurrency(user.wallet || 0)}\n`;
      message += `🛂 *KYC Status\\:* ${escapedKyc}\n\n`;
    }
    
    message += `📡 *API RESPONSES\\:* ${apiResponses.length}\n\n`;
    if (apiResponses.length > 0) {
      apiResponses.forEach((response, index) => {
        const escapedApiName = escapeMarkdownV2(response.apiName || 'Unknown API');
        const escapedStatus = escapeMarkdownV2(response.status);
        const escapedTime = escapeMarkdownV2(new Date(response.timestamp).toLocaleTimeString());
        
        message += `${index + 1}\\. *${escapedApiName}*\n`;
        message += `   📊 *Status\\:* ${escapedStatus}\n`;
        message += `   ⏰ *Time\\:* ${escapedTime}\n\n`;
      });
    } else {
      message += `No API responses recorded for this transaction\\.\n`;
    }
    
    if (transaction.error) {
      message += `\n🚨 *ERROR DETAILS*\n${escapeMarkdownV2(transaction.error)}\n`;
    }
    
    const { Markup } = require('telegraf');
    await ctx.reply(message, {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📁 Export Full Details', `admin_export_tx_${transaction.id}`)],
        [Markup.button.callback('🔍 View Raw API Data', `admin_view_api_raw_${transaction.id}`)],
        [Markup.button.callback('🔄 Update Status', `admin_update_tx_${transaction.id}`)],
        [Markup.button.callback('🏠 Back to Transactions', 'admin_transaction_tracking')]
      ])
    });
  },
  
  // ========== FIXED: PROPER MARKDOWNV2 ESCAPING ==========
  viewRawApiData: async (ctx, transactionId) => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin access only');
    
    const apiResponses = apiResponseManager.getResponses(transactionId);
    if (apiResponses.length === 0) {
      return ctx.reply(`❌ No API responses found for transaction\\: ${escapeMarkdownV2(transactionId)}`, { parse_mode: 'MarkdownV2' });
    }
    
    let message = `📡 \\*RAW API DATA FOR TRANSACTION\\:\\* \`${escapeMarkdownV2(transactionId)}\`\n\n`;
    apiResponses.forEach((response, index) => {
      message += `🔵 \\*API Response ${index + 1}\\:\\* ${escapeMarkdownV2(response.apiName || 'Unknown')}\n\n`;
      message += `📊 \\*Status\\:\\* ${escapeMarkdownV2(response.status)}\n`;
      message += `⏰ \\*Timestamp\\:\\* ${escapeMarkdownV2(response.timestamp)}\n\n`;
      message += `📥 \\*REQUEST DATA\\:\\*\n\`\`\`json\n${escapeMarkdownV2(JSON.stringify(response.request || {}, null, 2))}\n\`\`\`\n\n`;
      message += `📤 \\*RESPONSE DATA\\:\\*\n\`\`\`json\n${escapeMarkdownV2(JSON.stringify(response.response || {}, null, 2))}\n\`\`\`\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    });
    
    const { Markup } = require('telegraf');
    const maxLength = 4000;
    if (message.length > maxLength) {
      const parts = [];
      while (message.length > 0) { 
        parts.push(message.substring(0, maxLength)); 
        message = message.substring(maxLength); 
      }
      for (const part of parts) {
        await ctx.reply(part, { 
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
  },
  
  // ========== FIXED: PROPER MARKDOWNV2 ESCAPING ==========
  updateTransactionStatus: async (ctx, transactionId, newStatus, notes = '') => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin access only');
    
    const systemTransactions = getSystemTransactions();
    const transaction = systemTransactions.find(tx => tx.id === transactionId);
    if (!transaction) {
      return ctx.reply(`❌ Transaction not found\\: ${escapeMarkdownV2(transactionId)}`, { parse_mode: 'MarkdownV2' });
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
  },
  
  exportTransaction: async (transactionId, format = 'json') => {
    const transactionDetails = systemTransactionManager.getTransactionWithApiDetails(transactionId);
    if (!transactionDetails) throw new Error('Transaction not found');
    
    const timestamp = moment().format('YYYYMMDD_HHmmss');
    const fileName = `transaction_${transactionId}_${timestamp}`;
    const filePath = path.join(exportsDir, `${fileName}.${format}`);
    
    switch (format.toLowerCase()) {
      case 'json':
        await fs.writeFile(filePath, JSON.stringify(transactionDetails, null, 2));
        return { path: filePath, format: 'json' };
      case 'txt':
        let textContent = `TRANSACTION DETAILS\n===================\n\n`;
        textContent += `Transaction ID: ${transactionDetails.transaction.id}\n`;
        textContent += `Date: ${transactionDetails.transaction.timestamp}\n`;
        textContent += `Type: ${transactionDetails.transaction.type}\n`;
        textContent += `Amount: ${transactionDetails.transaction.amount}\n`;
        textContent += `Status: ${transactionDetails.transaction.status}\n\n`;
        if (transactionDetails.user) {
          textContent += `USER DETAILS\n============\n`;
          textContent += `User ID: ${transactionDetails.user.id}\n`;
          textContent += `Name: ${transactionDetails.user.name}\n`;
          textContent += `Phone: ${transactionDetails.user.phone}\n`;
          textContent += `Email: ${transactionDetails.user.email}\n\n`;
        }
        textContent += `API RESPONSES\n=============\n`;
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
  }
};

// ==================== ENHANCED EXPORT MANAGER ====================
const exportManager = {
  generateExport: async (ctx, filters = {}, format = 'csv') => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin access only');
    
    await ctx.reply(`🔄 Generating ${format.toUpperCase()} export\\.\\.\\.`, { parse_mode: 'MarkdownV2' });
    const transactions = systemTransactionManager.searchTransactions(filters);
    
    if (transactions.length === 0) {
      return ctx.reply('❌ No transactions found for export\\.', { parse_mode: 'MarkdownV2' });
    }
    
    const result = await systemTransactionManager.exportTransactions(transactions, format, { includeApiResponses: true });
    
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
      console.log('⚠️ Could not send file via Telegram');
    }
    return result;
  },
  
  quickExport: async (ctx, type = 'today') => {
    const userId = ctx.from.id.toString();
    if (!isAdmin(userId)) return ctx.answerCbQuery('❌ Admin access only');
    
    let filters = {};
    const today = new Date().toISOString().split('T')[0];
    if (type === 'today') { 
      filters.startDate = today; 
      filters.endDate = today; 
    }
    else if (type === 'failed') filters.status = 'failed';
    else if (type === 'pending') filters.status = 'pending';
    
    const { Markup } = require('telegraf');
    await ctx.reply(
      `📁 \\*QUICK EXPORT\\: ${escapeMarkdownV2(type.toUpperCase())}\\*\n\nSelect export format\\:`,
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
    
    const { getSessions, setSessions } = require('./database');
    const sessions = getSessions();
    sessions[userId] = { 
      ...sessions[userId], 
      exportFilters: filters, 
      exportType: type 
    };
    setSessions(sessions);
    await saveAllData();
  }
};

// ==================== ENHANCED ANALYTICS TRACKING ====================
const analyticsManager = {
  updateAnalytics: async (transaction) => {
    try {
      const analytics = require('./database').getAnalytics();
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
      
      if (!analytics.hourly[hour]) analytics.hourly[hour] = 0;
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
        
        let maxCount = 0, favorite = null;
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
      
      require('./database').setAnalytics(analytics);
      await saveAllData();
    } catch (error) {
      console.error('❌ Analytics update error:', error);
    }
  },
  
  getAnalyticsReport: (period = 'daily', startDate = null, endDate = null) => {
    const analytics = require('./database').getAnalytics();
    const report = { 
      period, 
      dateRange: { start: startDate, end: endDate }, 
      summary: {}, 
      trends: {}, 
      insights: [] 
    };
    
    if (period === 'daily') {
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
    } else if (period === 'weekly') {
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
    } else if (period === 'monthly') {
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
    }
    
    if (analytics.categoryStats) {
      let topCategory = null, topAmount = 0;
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
      let peakHour = null, peakCount = 0;
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
      let topSpender = null, topSpendAmount = 0;
      for (const [userId, stats] of Object.entries(analytics.userStats)) {
        if (stats.totalAmount > topSpendAmount) { 
          topSpendAmount = stats.totalAmount; 
          topSpender = userId; 
        }
      }
      if (topSpender) {
        const users = getUsers();
        const user = users[topSpender];
        const userName = user ? 
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${topSpender}` : 
          `User ${topSpender}`;
        report.insights.push(`👑 Top spender: ${userName} (₦${topSpendAmount.toLocaleString()})`);
      }
      report.insights.push(`👥 Total unique users: ${totalUsers}`);
    }
    
    return report;
  }
};

module.exports = {
  apiResponseManager,
  systemTransactionManager,
  exportManager,
  analyticsManager
};