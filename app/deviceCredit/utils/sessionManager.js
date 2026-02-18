// app/deviceCredit/utils/sessionManager.js
class SessionManager {
  constructor() {
    this.sessions = global.deviceSessions || {};
    if (!global.deviceSessions) {
      global.deviceSessions = this.sessions;
    }
  }

  getSession(userId) {
    try {
      if (this.sessions[userId]) {
        return this.sessions[userId];
      }
      return { action: null, step: null, data: {} };
    } catch (error) {
      console.error('❌ Get session error:', error);
      return { action: null, step: null, data: {} };
    }
  }

  updateSession(userId, session) {
    try {
      this.sessions[userId] = session;
      global.deviceSessions = this.sessions;
      return true;
    } catch (error) {
      console.error('❌ Update session error:', error);
      return false;
    }
  }

  clearSession(userId) {
    try {
      if (this.sessions[userId]) {
        delete this.sessions[userId];
        global.deviceSessions = this.sessions;
      }
      return true;
    } catch (error) {
      console.error('❌ Clear session error:', error);
      return false;
    }
  }

  setAction(userId, action, data = {}) {
    const session = {
      action,
      step: 1,
      data
    };
    return this.updateSession(userId, session);
  }

  getCurrentAction(userId) {
    const session = this.getSession(userId);
    return session.action;
  }

  isInAction(userId, action = null) {
    const session = this.getSession(userId);
    if (!session.action) return false;
    if (action) return session.action === action;
    return true;
  }

  getSessionData(userId) {
    const session = this.getSession(userId);
    return session.data || {};
  }

  updateSessionData(userId, updates) {
    const session = this.getSession(userId);
    session.data = { ...session.data, ...updates };
    return this.updateSession(userId, session);
  }

  incrementStep(userId) {
    const session = this.getSession(userId);
    session.step = (session.step || 1) + 1;
    return this.updateSession(userId, session);
  }

  setStep(userId, step) {
    const session = this.getSession(userId);
    session.step = step;
    return this.updateSession(userId, session);
  }

  clearAllSessions() {
    try {
      this.sessions = {};
      global.deviceSessions = {};
      return true;
    } catch (error) {
      console.error('❌ Clear all sessions error:', error);
      return false;
    }
  }

  getActiveSessionsCount() {
    return Object.keys(this.sessions).length;
  }

  getSessionsByAction(action) {
    return Object.entries(this.sessions)
      .filter(([_, session]) => session.action === action)
      .map(([userId, session]) => ({ userId, ...session }));
  }
}

module.exports = SessionManager;