// logger.js - Custom logger that flushes immediately
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log file path
const logFile = path.join(logDir, `app_${new Date().toISOString().split('T')[0]}.log`);

// Custom logger
const logger = {
  log: (...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const logLine = `[${timestamp}] ${message}\n`;
    
    // Write to console
    process.stdout.write(logLine);
    
    // Write to file
    try {
      fs.appendFileSync(logFile, logLine);
    } catch (e) {
      // Ignore file write errors
    }
  },
  
  error: (...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const logLine = `[${timestamp}] ❌ ERROR: ${message}\n`;
    
    // Write to console
    process.stderr.write(logLine);
    
    // Write to file
    try {
      fs.appendFileSync(logFile, logLine);
    } catch (e) {
      // Ignore file write errors
    }
  },
  
  warn: (...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const logLine = `[${timestamp}] ⚠️ WARN: ${message}\n`;
    
    process.stdout.write(logLine);
    try {
      fs.appendFileSync(logFile, logLine);
    } catch (e) {
      // Ignore file write errors
    }
  },
  
  info: (...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const logLine = `[${timestamp}] ℹ️ INFO: ${message}\n`;
    
    process.stdout.write(logLine);
    try {
      fs.appendFileSync(logFile, logLine);
    } catch (e) {
      // Ignore file write errors
    }
  }
};

module.exports = logger;
