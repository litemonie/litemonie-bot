// app/transactionHistory.js
const { Markup } = require('telegraf');

// Fix the escapeMarkdown function to handle all special characters properly
function escapeMarkdown(text) {
  if (typeof text !== 'string') {
    if (text === null || text === undefined) return '';
    text = String(text);
  }
  
  // Escape all special characters for MarkdownV2
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Fix formatCurrency to escape properly
function formatCurrency(amount) {
  const formatted = `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return escapeMarkdown(formatted);
}

// Send a single transaction as separate message
async function sendSingleTransaction(ctx, transaction) {
  try {
    const details = generateTransactionDetails(transaction);
    
    await ctx.reply(details, {
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    });
    
  } catch (error) {
    console.error('❌ Error sending single transaction:', error);
  }
}

// Generate transaction details for single message
function generateTransactionDetails(tx) {
  const emoji = getStatusEmoji(tx.status);
  const typeEmoji = getTypeEmoji(tx.type);
  const isCredit = isTransactionCredit(tx.type, tx.status);
  const amountPrefix = isCredit ? '\\+' : '\\-';
  
  // Get user-friendly type name
  const typeName = getTransactionTypeName(tx.type, tx);
  
  // Format date
  const txDate = new Date(tx.created_at || tx.date || tx.timestamp);
  const formattedDate = txDate.toLocaleDateString('en-NG', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Start message with amount first, then line
  let message = `${emoji} *${escapeMarkdown(typeName)}*\n`;
  message += `💰 *Amount\\:* ${amountPrefix}${formatCurrency(tx.amount || 0)}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📅 *Date\\:* ${escapeMarkdown(formattedDate)}\n`;
  message += `📋 *Type\\:* ${typeEmoji} ${escapeMarkdown(getTransactionTypeName(tx.type, tx))}\n`;
  message += `📊 *Status\\:* ${emoji} ${escapeMarkdown((tx.status || 'pending').toUpperCase())}\n`;
  
  // Add key details based on transaction type
  const typeLower = (tx.type || '').toLowerCase();
  
  if (typeLower.includes('airtime') || typeLower.includes('data')) {
    if (tx.phone) message += `📞 *Phone\\:* ${escapeMarkdown(tx.phone)}\n`;
    if (tx.network) message += `📱 *Network\\:* ${escapeMarkdown(tx.network)}\n`;
    if (tx.plan || tx.dataPlan) message += `📦 *Plan\\:* ${escapeMarkdown(tx.plan || tx.dataPlan || '')}\n`;
  }
  
  if (typeLower.includes('litemonie') || typeLower.includes('transfer')) {
    if (tx.recipient && typeLower.includes('out')) {
      message += `👤 *To\\:* ${escapeMarkdown(tx.recipient_name || tx.recipient || 'User')}\n`;
    }
    if (tx.sender && typeLower.includes('in')) {
      message += `👤 *From\\:* ${escapeMarkdown(tx.sender_name || tx.sender || 'User')}\n`;
    }
    if (tx.phone) message += `📞 *Phone\\:* ${escapeMarkdown(tx.phone)}\n`;
  }
  
  if (typeLower.includes('bank')) {
    if (tx.bank_name) message += `🏦 *Bank\\:* ${escapeMarkdown(tx.bank_name)}\n`;
    if (tx.account_number) message += `🔢 *Account\\:* ${escapeMarkdown(tx.account_number)}\n`;
    if (tx.account_name) message += `👤 *Account Name\\:* ${escapeMarkdown(tx.account_name)}\n`;
  }
  
  if (typeLower.includes('tv')) {
    if (tx.tv_provider) message += `📺 *Provider\\:* ${escapeMarkdown(tx.tv_provider)}\n`;
    if (tx.package) message += `📦 *Package\\:* ${escapeMarkdown(tx.package)}\n`;
  }
  
  if (typeLower.includes('electricity')) {
    if (tx.meter_number) message += `⚡ *Meter\\:* ${escapeMarkdown(tx.meter_number)}\n`;
    if (tx.disco) message += `💡 *Disco\\:* ${escapeMarkdown(tx.disco)}\n`;
  }
  
  // Add Reference as clickable link
  if (tx.reference) {
    message += `🔗 *Reference\\:* [${escapeMarkdown(tx.reference)}](copy:${tx.reference})\n`;
  }
  
  // Add Transaction ID as clickable link
  if (tx.id) {
    message += `🔢 *Transaction ID\\:* [${escapeMarkdown(tx.id)}](copy:${tx.id})\n`;
  }
  
  // Add error/reason if failed
  if (tx.status === 'failed' && tx.reason) {
    message += `\n⚠️ *Reason\\:* ${escapeMarkdown(tx.reason)}\n`;
  }
  
  return message;
}

module.exports = {
  handleHistory: async (ctx, users, transactions, CONFIG) => {
    try {
      const userId = ctx.from.id.toString();
      const userTransactions = transactions[userId] || [];
      
      if (userTransactions.length === 0) {
        return await ctx.reply(
          `📭 *NO TRANSACTIONS YET*\n\n` +
          `💡 *Get started\\:*\n` +
          `1\\. Get KYC approved\n` +
          `2\\. Deposit funds\n` +
          `3\\. Start buying airtime/data`,
          { parse_mode: 'MarkdownV2' }
        );
      }
      
      // Calculate current month stats
      const currentMonthStats = calculateMonthlyStats(userTransactions);
      
      // Sort by date (newest first)
      const sortedTransactions = [...userTransactions]
        .sort((a, b) => new Date(b.created_at || b.date || b.timestamp) - new Date(a.created_at || a.date || a.timestamp));
      
      // Send monthly summary as first message
      const userName = users[userId]?.firstName || 'User';
      const userBalance = users[userId]?.wallet || 0;
      const netFlowEmoji = currentMonthStats.netFlow >= 0 ? '📈' : '📉';
      const netFlowAmount = Math.abs(currentMonthStats.netFlow);
      
      await ctx.reply(
        `💳 *TRANSACTION HISTORY*\n\n` +
        `👤 *Account\\:* ${escapeMarkdown(userName)}\n` +
        `💰 *Available Balance\\:* ${formatCurrency(userBalance)}\n` +
        `📊 *Total Transactions\\:* ${userTransactions.length}\n\n` +
        `📅 *${getCurrentMonthName()} Summary\\:*\n` +
        `   💰 *Money In\\:* ${formatCurrency(currentMonthStats.moneyIn)}\n` +
        `   💸 *Money Out\\:* ${formatCurrency(currentMonthStats.moneyOut)}\n` +
        `   ${netFlowEmoji} *Net Flow\\:* ${formatCurrency(netFlowAmount)}\n\n` +
        `👇 *Your recent transactions*\n` +
        `\\(Click on Reference or Transaction ID to copy\\)`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', 'tx_refresh')],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      
      // Send first 10 transactions as separate messages
      const transactionsToShow = sortedTransactions.slice(0, 10);
      
      for (let i = 0; i < transactionsToShow.length; i++) {
        const tx = transactionsToShow[i];
        
        // Add a small delay between messages to avoid rate limiting
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        await sendSingleTransaction(ctx, tx);
      }
      
      // If there are more transactions, show a summary
      if (sortedTransactions.length > 10) {
        await ctx.reply(
          `📄 *Showing 10 of ${sortedTransactions.length} transactions*\n\n` +
          `💡 *View all transactions in your account history*\\.`,
          {
            parse_mode: 'MarkdownV2'
          }
        );
      }
      
    } catch (error) {
      console.error('❌ History error:', error);
      await ctx.reply(
        '❌ Error loading transaction history\\. Please try again\\.',
        { parse_mode: 'MarkdownV2' }
      );
    }
  },

  // Get callbacks for transaction history
  getCallbacks: (bot, users, transactions, CONFIG) => {
    return {
      // Refresh transaction list
      async 'tx_refresh'(ctx) {
        await ctx.answerCbQuery('🔄 Refreshing...');
        await module.exports.handleHistory(ctx, users, transactions, CONFIG);
      }
    };
  }
};

// ==================== HELPER FUNCTIONS ====================

// Get user-friendly transaction type name
function getTransactionTypeName(type, transaction) {
  const typeStr = (type || '').toLowerCase();
  
  if (typeStr.includes('litemonie_out') || typeStr.includes('transfer_out')) {
    const recipient = transaction.recipient_name || transaction.recipient || 'User';
    return `Send to ${recipient}`;
  }
  
  if (typeStr.includes('litemonie_in') || typeStr.includes('transfer_in')) {
    const sender = transaction.sender_name || transaction.sender || 'User';
    return `Received from ${sender}`;
  }
  
  if (typeStr.includes('airtime')) return 'Airtime Purchase';
  if (typeStr.includes('data')) return 'Data Purchase';
  if (typeStr.includes('deposit') || typeStr.includes('credit')) return 'Wallet Deposit';
  if (typeStr.includes('bank')) return 'Bank Transfer';
  if (typeStr.includes('tv')) return 'TV Subscription';
  if (typeStr.includes('electricity') || typeStr.includes('light')) return 'Electricity Bill';
  if (typeStr.includes('exam')) return 'Exam Pin';
  if (typeStr.includes('card')) return 'Card Purchase';
  if (typeStr.includes('device')) return 'Device Purchase';
  
  return type || 'Transaction';
}

function calculateMonthlyStats(transactions) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const monthlyTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.created_at || tx.date || tx.timestamp);
    return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
  });
  
  let moneyIn = 0;
  let moneyOut = 0;
  let creditCount = 0;
  let debitCount = 0;
  
  monthlyTransactions.forEach(tx => {
    const amount = tx.amount || 0;
    const isCredit = isTransactionCredit(tx.type, tx.status);
    
    if (isCredit) {
      moneyIn += amount;
      creditCount++;
    } else {
      moneyOut += amount;
      debitCount++;
    }
  });
  
  return {
    moneyIn,
    moneyOut,
    netFlow: moneyIn - moneyOut,
    creditCount,
    debitCount,
    totalTransactions: monthlyTransactions.length
  };
}

function isTransactionCredit(type, status) {
  const creditTypes = [
    'credit', 'deposit', 'litemonie_in', 'transfer_in', 
    'refund', 'bonus', 'reward', 'commission', 'received'
  ];
  
  const typeStr = (type || '').toLowerCase();
  const statusStr = (status || '').toLowerCase();
  
  // If status is failed, it's neither credit nor debit
  if (statusStr === 'failed') return false;
  
  return creditTypes.some(creditType => typeStr.includes(creditType));
}

function getCurrentMonthName() {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[new Date().getMonth()];
}

function getStatusEmoji(status) {
  const statusStr = (status || '').toLowerCase();
  if (statusStr === 'success' || statusStr === 'completed') return '✅';
  if (statusStr === 'failed') return '❌';
  if (statusStr === 'pending') return '⏳';
  return '🔹';
}

function getTypeEmoji(type) {
  const typeStr = (type || '').toLowerCase();
  if (typeStr.includes('airtime')) return '📞';
  if (typeStr.includes('data')) return '📡';
  if (typeStr.includes('credit') || typeStr.includes('deposit') || typeStr.includes('received')) return '💰';
  if (typeStr.includes('transfer') || typeStr.includes('litemonie') || typeStr.includes('send')) return '💸';
  if (typeStr.includes('bank')) return '🏦';
  if (typeStr.includes('tv') || typeStr.includes('subscription')) return '📺';
  if (typeStr.includes('electricity') || typeStr.includes('light')) return '💡';
  if (typeStr.includes('exam')) return '📝';
  if (typeStr.includes('card')) return '💳';
  if (typeStr.includes('device')) return '📱';
  return '💳';
}