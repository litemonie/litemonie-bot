// app/core/sessionManager.js
const { saveData, sessionsFile } = require('../storage/loaders');

module.exports = function createSessionManager(sessions) {
  return {
    getSession: (userId) => sessions[userId] || null,
    
    setSession: async (userId, sessionData) => {
      sessions[userId] = sessionData;
      await saveData(sessionsFile, sessions);
    },
    
    clearSession: async (userId) => {
      delete sessions[userId];
      await saveData(sessionsFile, sessions);
    },
    
    updateSession: async (userId, updates) => {
      if (sessions[userId]) {
        Object.assign(sessions[userId], updates);
        await saveData(sessionsFile, sessions);
      }
    }
  };
};