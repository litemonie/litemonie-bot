// app/deviceCredit/utils/formatters.js - CORRECTED VERSION
class Formatters {
  static escapeMarkdown(text) {
    if (typeof text !== 'string') return String(text);
    
    // Escape all MarkdownV2 special characters
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    
    let escaped = text;
    specialChars.forEach(char => {
      escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
    });
    
    return escaped;
  }

  static formatCurrency(amount) {
    if (!amount && amount !== 0) return '₦0';
    return `₦${parseFloat(amount).toLocaleString('en-US')}`;
  }

  static generateIMEI() {
    const random14 = Array.from({length: 14}, () => Math.floor(Math.random() * 10)).join('');
    const luhnDigit = this.calculateLuhnCheckDigit(random14);
    return random14 + luhnDigit;
  }

  static calculateLuhnCheckDigit(number) {
    const digits = number.split('').map(Number);
    let sum = 0;
    let alternate = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits[i];
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    
    return (10 - (sum % 10)) % 10;
  }

  static generateSerial() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let serial = '';
    for (let i = 0; i < 10; i++) {
      serial += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return serial;
  }

  static formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  }

  static formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  }

  static calculatePercentage(part, total) {
    if (!total || total === 0) return 0;
    return Math.round((part / total) * 100);
  }

  static truncateText(text, maxLength = 50) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

module.exports = Formatters;