// app/handlers/autoSave.js

module.exports = {
  setupAutoSave: (saveDataCallback) => {
    // Set up auto-save interval
    setInterval(async () => {
      try {
        await saveDataCallback();
        console.log('💾 Auto-saved all data');
      } catch (error) {
        console.error('❌ Auto-save error:', error);
      }
    }, 30000); // Save every 30 seconds
    
    console.log('✅ Auto-save system initialized');
  }
};