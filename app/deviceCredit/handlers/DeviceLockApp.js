// ==================== DEVICE LOCK APP - PRODUCTION READY ====================
// DeviceLockApp.js - NO MOCK DATA, REAL DEVICES ONLY
// ============================================================================

const { Markup } = require('telegraf');
const crypto = require('crypto');
const QRCode = require('qrcode');

class DeviceLockApp {
  constructor(bot, deviceHandler) {
    console.log('📱 DeviceLockApp: Initializing Telegram Mini App system...');
    
    this.bot = bot;
    this.deviceHandler = deviceHandler;
    
    // Store sessions
    this.appSessions = new Map();
    this.deviceUnlockSessions = new Map();
    
    // App configuration
    this.appName = "EasyBuy Device Lock";
    this.appDescription = "Monitor and unlock your installment device";
    this.appVersion = "1.0.0";
    
    // ✅ YOUR LIVE GITHUB PAGES MINI APP URL
    this.miniAppUrl = "https://litemonie-device.onrender.com/";
    
    // Admin settings
    this.ADMIN_IDS = ['1279640125', '8055762920'];
    
    // Cache for bot username
    this.botUsername = null;
    
    console.log('✅ DeviceLockApp initialized');
    console.log(`📱 Mini App URL: ${this.miniAppUrl}`);
  }

  // ==================== BOT USERNAME DETECTION ====================
  async getBotUsername() {
    if (this.botUsername) return this.botUsername;
    try {
      if (this.bot.options && this.bot.options.username) {
        this.botUsername = this.bot.options.username;
        return this.botUsername;
      }
      const botInfo = await this.bot.telegram.getMe();
      this.botUsername = botInfo.username;
      if (!this.bot.options) this.bot.options = {};
      this.bot.options.username = this.botUsername;
      return this.botUsername;
    } catch (error) {
      console.error('❌ Could not fetch bot username:', error.message);
      const FALLBACK_USERNAME = 'LitewayVtuBot'; // CHANGE THIS!
      this.botUsername = FALLBACK_USERNAME;
      return this.botUsername;
    }
  }

  // ==================== HELPER METHODS ====================
  isUserAdmin(userId) {
    return this.ADMIN_IDS.includes(userId.toString());
  }

  generateSessionId(userId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    const hash = crypto.createHash('md5').update(`${userId}${timestamp}${random}`).digest('hex').substr(0, 8);
    return `app_${timestamp}_${hash}`.toUpperCase();
  }

  generateToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  formatCurrency(amount) {
    if (!amount) return '₦0';
    return `₦${parseInt(amount).toLocaleString('en-NG')}`;
  }

  async generateQRCode(url) {
    try {
      return await QRCode.toDataURL(url);
    } catch (error) {
      console.error('❌ Error generating QR code:', error);
      return null;
    }
  }

  // ==================== USER VALIDATION ====================
  async validateUserExists(userId) {
    try {
      if (!this.deviceHandler || !this.deviceHandler.users) {
        return { exists: false, error: 'System error: User data not available' };
      }
      const user = this.deviceHandler.users[userId];
      if (!user) {
        return { exists: false, error: 'User not found in database' };
      }
      return { 
        exists: true, 
        user: user,
        username: user.username || `User_${userId.substring(0, 6)}`,
        firstName: user.firstName || 'Customer',
        wallet: user.wallet || 0
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }

  // ==================== MINI APP LINK GENERATION - REAL DATA ONLY ====================
  async generateMiniAppLink(userId) {
    try {
      console.log(`🔗 Generating mini app link for user ${userId}`);
      
      const userValidation = await this.validateUserExists(userId);
      if (!userValidation.exists) {
        return { 
          success: false, 
          error: userValidation.error || 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      const user = userValidation.user;

      // ========== GET REAL DEVICE DATA - NO MOCK DATA ==========
      if (!this.deviceHandler.getUserIMEIMappings) {
        return { 
          success: false, 
          error: 'Device system not fully configured. Please contact support.',
          code: 'SYSTEM_NOT_READY'
        };
      }

      // Get user's devices with IMEI
      const imeiMappings = await this.deviceHandler.getUserIMEIMappings(userId);
      
      if (!imeiMappings || imeiMappings.length === 0) {
        return { 
          success: false, 
          error: 'No devices with IMEI found. Contact support to assign IMEI to your installment.',
          code: 'NO_DEVICES'
        };
      }

      // Get installments for these devices
      const installments = await this.deviceHandler.getUserInstallments(userId) || [];
      
      // Filter devices that have installments and IMEI
      const userDevices = imeiMappings.map(mapping => {
        const installment = installments.find(i => i && i.id === mapping.installmentId);
        return {
          imei: mapping.imei || 'Unknown',
          imeiStatus: mapping.imeiStatus || 'locked',
          installmentId: mapping.installmentId,
          deviceMake: mapping.deviceMake || 'Unknown',
          deviceModel: mapping.deviceModel || 'Device',
          installmentStatus: installment ? (installment.status || 'unknown') : 'unknown',
          lastPayment: mapping.unlockedAt || mapping.assignedAt || new Date().toISOString(),
          totalAmount: installment?.totalWithInterest || 0,
          totalInstallments: installment?.totalInstallments || 0,
          installmentsPaid: installment?.installmentsPaid || 0
        };
      }).filter(device => device.installmentStatus !== 'unknown' && device.imei !== 'Unknown');

      if (userDevices.length === 0) {
        return { 
          success: false, 
          error: 'No active devices found. Your installments may need processing.',
          code: 'NO_ACTIVE_DEVICES'
        };
      }

      // Create session
      const sessionId = this.generateSessionId(userId);
      const token = this.generateToken();
      
      this.appSessions.set(sessionId, {
        userId: userId,
        token: token,
        devices: userDevices,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        lastAccess: new Date().toISOString(),
        isMock: false,
        userData: {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          wallet: user.wallet
        }
      });

      const startParam = `session=${sessionId}&token=${token}`;
      const miniAppUrl = `${this.miniAppUrl}?startapp=${encodeURIComponent(startParam)}`;
      
      console.log(`✅ Mini app link generated successfully for user ${userId}`);
      console.log(`🔗 URL: ${miniAppUrl}`);
      console.log(`📱 Devices: ${userDevices.length} real devices`);

      return {
        success: true,
        sessionId: sessionId,
        token: token,
        miniAppUrl: miniAppUrl,
        webUrl: miniAppUrl,
        qrCodeUrl: await this.generateQRCode(miniAppUrl),
        devices: userDevices.map(d => `${d.deviceMake} ${d.deviceModel} (${d.imeiStatus})`),
        instructions: `Click the link below to open the Device Lock App`,
        user: {
          name: user.username || user.firstName || `User ${userId.substring(0, 6)}`,
          id: userId,
          wallet: this.formatCurrency(user.wallet || 0)
        },
        isMock: false
      };
      
    } catch (error) {
      console.error('❌ Error generating mini app link:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error generating app link',
        code: 'GENERATION_ERROR'
      };
    }
  }

  // ==================== SESSION VALIDATION ====================
  validateSession(sessionId, token) {
    try {
      if (!sessionId || !token) {
        return { valid: false, error: 'Missing session ID or token' };
      }
      const session = this.appSessions.get(sessionId);
      if (!session) {
        return { valid: false, error: 'Session not found or expired' };
      }
      if (session.token !== token) {
        return { valid: false, error: 'Invalid session token' };
      }
      if (new Date(session.expiresAt) < new Date()) {
        this.appSessions.delete(sessionId);
        return { valid: false, error: 'Session expired' };
      }
      session.lastAccess = new Date().toISOString();
      this.appSessions.set(sessionId, session);
      return { 
        valid: true, 
        session: session,
        userId: session.userId 
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // ==================== DEVICE DATA FOR APP - REAL DATA ONLY ====================
  async getDeviceData(sessionId, token) {
    try {
      const validation = this.validateSession(sessionId, token);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      
      const { userId, session } = validation;
      
      const userValidation = await this.validateUserExists(userId);
      if (!userValidation.exists) {
        return { success: false, error: 'User account not found' };
      }
      
      const devices = session.devices || [];
      
      // Get detailed real device info
      const detailedDevices = await Promise.all(
        devices.map(async (device) => {
          try {
            const installment = device.installmentId ? 
              await this.deviceHandler.getInstallmentById?.(device.installmentId) : null;
            
            const payments = await this.deviceHandler.getUserPayments?.(userId) || [];
            const installmentPayments = payments.filter(p => p && p.installmentId === device.installmentId);
            const pendingPayments = installmentPayments.filter(p => p && p.status === 'pending');
            const completedPayments = installmentPayments.filter(p => p && p.status === 'completed');
            
            // Calculate next payment due date
            let nextPayment = null;
            if (pendingPayments.length > 0) {
              const next = pendingPayments[0];
              nextPayment = {
                amount: this.formatCurrency(next.amount || 0),
                dueDate: next.dueDate ? 
                  new Date(next.dueDate).toLocaleDateString('en-NG') : 'N/A',
                overdue: next.dueDate ? new Date(next.dueDate) < new Date() : false
              };
            }
            
            // Calculate device status
            let status = {
              code: 'active',
              message: 'Installment active',
              icon: '📱',
              color: 'blue'
            };
            
            if (installment?.status === 'completed' && device.imeiStatus === 'unlocked') {
              status = {
                code: 'unlocked',
                message: 'Device unlocked & fully paid',
                icon: '🔓',
                color: 'green'
              };
            } else if (installment?.status === 'completed' && device.imeiStatus === 'locked') {
              status = {
                code: 'pending_unlock',
                message: 'Fully paid - contact support',
                icon: '⏳',
                color: 'orange'
              };
            } else if (pendingPayments.length > 0 && nextPayment?.overdue) {
              status = {
                code: 'overdue',
                message: 'Payment overdue',
                icon: '⚠️',
                color: 'red'
              };
            }
            
            return {
              imei: device.imei || 'N/A',
              make: device.deviceMake || 'Unknown',
              model: device.deviceModel || 'Device',
              installmentId: device.installmentId || 'N/A',
              status: status,
              details: {
                totalAmount: this.formatCurrency(installment?.totalWithInterest || 0),
                paymentsMade: completedPayments.length,
                totalPayments: installment ? (installment.totalInstallments || 0) + 1 : 0,
                progress: installment?.totalInstallments ? 
                  Math.round(((installment.installmentsPaid || 0) / installment.totalInstallments) * 100) : 0,
                nextPayment: nextPayment,
                imeiStatus: device.imeiStatus || 'unknown',
                unlockable: device.imeiStatus === 'locked' && installment?.status === 'completed'
              }
            };
          } catch (error) {
            console.error('❌ Error processing device:', error);
            return null;
          }
        })
      );
      
      // Filter out null devices
      const validDevices = detailedDevices.filter(d => d !== null);
      
      const user = this.deviceHandler.users[userId] || userValidation.user;
      
      return {
        success: true,
        user: {
          id: userId,
          name: user?.username || user?.firstName || `User ${userId}`,
          wallet: this.formatCurrency(user?.wallet || 0)
        },
        devices: validDevices,
        appInfo: {
          name: this.appName,
          version: this.appVersion,
          serverTime: new Date().toISOString(),
          support: '@opuenekeke',
          miniAppUrl: this.miniAppUrl
        }
      };
      
    } catch (error) {
      console.error('❌ Error getting device data:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== REQUEST DEVICE UNLOCK ====================
  async requestDeviceUnlock(sessionId, token, imei) {
    try {
      const validation = this.validateSession(sessionId, token);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      
      const { userId } = validation;
      
      // Check if device exists and belongs to user
      const mapping = await this.deviceHandler.getInstallmentByIMEI?.(imei);
      if (!mapping) {
        return { success: false, error: 'Device not found' };
      }
      
      if (mapping.userId !== userId.toString()) {
        return { success: false, error: 'Device does not belong to you' };
      }
      
      // Check if already unlocked
      if (mapping.imeiStatus === 'unlocked') {
        return { success: false, error: 'Device already unlocked' };
      }
      
      // Create unlock request
      const requestId = `UNLOCK${Date.now().toString().slice(-8)}`;
      this.deviceUnlockSessions.set(requestId, {
        userId: userId,
        imei: imei,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        sessionId: sessionId
      });
      
      // Notify admins
      await this.notifyAdminsOfUnlockRequest(requestId, userId, imei, mapping);
      
      return {
        success: true,
        requestId: requestId,
        message: 'Unlock request sent to admin! You will be notified when processed.'
      };
      
    } catch (error) {
      console.error('❌ Error requesting unlock:', error);
      return { success: false, error: error.message };
    }
  }

  async notifyAdminsOfUnlockRequest(requestId, userId, imei, mapping) {
    try {
      const userValidation = await this.validateUserExists(userId);
      const username = userValidation.exists ? 
        (userValidation.username || `User ${userId}`) : 
        `Unknown User ${userId}`;
      
      const message = `🔓 <b>NEW UNLOCK REQUEST</b>\n\n` +
        `<b>Request ID:</b> ${requestId}\n` +
        `<b>User:</b> ${username}\n` +
        `<b>User ID:</b> ${userId}\n` +
        `<b>IMEI:</b> ${imei}\n` +
        `<b>Device:</b> ${mapping?.deviceMake || 'Unknown'} ${mapping?.deviceModel || ''}\n` +
        `<b>Time:</b> ${new Date().toLocaleString()}\n\n` +
        `<b>Use command:</b>\n` +
        `<code>/unlockimei ${imei}</code>`;
      
      for (const adminId of this.ADMIN_IDS) {
        try {
          await this.bot.telegram.sendMessage(adminId, message, { 
            parse_mode: 'HTML' 
          });
        } catch (e) {}
      }
    } catch (error) {
      console.error('❌ Error notifying admins:', error);
    }
  }

  // ==================== TELEGRAM BOT HANDLERS ====================
  async handleMiniAppCommand(ctx) {
    try {
      const userId = ctx.from.id.toString();
      const result = await this.generateMiniAppLink(userId);
      
      if (!result.success) {
        let errorMessage = result.error;
        if (result.code === 'NO_DEVICES') {
          errorMessage = 'No devices with IMEI found. Contact support to assign IMEI to your installment.';
        }
        return await ctx.reply(`❌ ${errorMessage}`, { parse_mode: 'HTML' });
      }
      
      await ctx.reply(
        `📱 <b>${this.appName}</b>\n\n` +
        `<b>✅ Devices found:</b>\n` +
        `${result.devices.map(d => `• ${d}`).join('\n')}\n\n` +
        `<b>🔗 Click below to open Mini App:</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📱 OPEN MINI APP', result.miniAppUrl)],
            [Markup.button.callback('🔄 Refresh Link', 'refresh_miniapp_link')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error:', error);
      await ctx.reply('❌ Error generating link', { parse_mode: 'HTML' });
    }
  }

  async handleRefreshLink(ctx) {
    try {
      await ctx.answerCbQuery('🔄 Generating new link...');
      const userId = ctx.from.id.toString();
      const result = await this.generateMiniAppLink(userId);
      
      if (!result.success) {
        return await ctx.reply(`❌ ${result.error}`, { parse_mode: 'HTML' });
      }
      
      await ctx.editMessageText(
        `🔄 <b>New Link Generated</b>\n\n` +
        `<code>${result.miniAppUrl}</code>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📱 OPEN MINI APP', result.miniAppUrl)],
            [Markup.button.callback('🏠 Home', 'start')]
          ])
        }
      );
      
    } catch (error) {
      console.error('❌ Error:', error);
      await ctx.answerCbQuery('❌ Error refreshing link');
    }
  }

  // ==================== CALLBACKS ====================
  getCallbacks() {
    const self = this;
    return {
      'device_mini_app': async (ctx) => await self.handleMiniAppCommand(ctx),
      'refresh_miniapp_link': async (ctx) => await self.handleRefreshLink(ctx),
      'admin_mini_app_control': async (ctx) => await self.handleAdminAppControl(ctx),
      'admin_view_sessions': async (ctx) => await self.showActiveSessions(ctx),
      'admin_view_unlock_requests': async (ctx) => await self.showUnlockRequests(ctx),
      'admin_clear_expired': async (ctx) => await self.clearExpiredSessions(ctx),
      'admin_test_app': async (ctx) => await self.generateTestAppLink(ctx)
    };
  }

  // ==================== ADMIN METHODS ====================
  async handleAdminAppControl(ctx) {
    const userId = ctx.from.id.toString();
    if (!this.isUserAdmin(userId)) return ctx.reply('❌ Admin only', { parse_mode: 'HTML' });
    
    const activeSessions = Array.from(this.appSessions.values())
      .filter(s => new Date(s.expiresAt) > new Date());
    
    await ctx.reply(
      `⚙️ <b>Mini App Admin</b>\n\n` +
      `📱 URL: ${this.miniAppUrl}\n` +
      `📊 Active Sessions: ${activeSessions.length}\n` +
      `🔄 Total Sessions: ${this.appSessions.size}\n\n` +
      `<b>Quick Actions:</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📊 View Sessions', 'admin_view_sessions')],
          [Markup.button.callback('🔓 Unlock Requests', 'admin_view_unlock_requests')],
          [Markup.button.callback('🧹 Clear Expired', 'admin_clear_expired')],
          [Markup.button.callback('🧪 Test Link', 'admin_test_app')]
        ])
      }
    );
  }

  async showActiveSessions(ctx) {
    const userId = ctx.from.id.toString();
    if (!this.isUserAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const activeSessions = Array.from(this.appSessions.entries())
      .filter(([_, s]) => new Date(s.expiresAt) > new Date())
      .slice(0, 5);
    
    if (activeSessions.length === 0) {
      return ctx.reply('No active sessions', { parse_mode: 'HTML' });
    }
    
    let msg = '<b>📊 Active Sessions</b>\n\n';
    activeSessions.forEach(([id, s]) => {
      const user = s.userData?.username || `User ${s.userId.substring(0, 6)}`;
      msg += `• ${user}: ${id.substring(0, 8)}... (${s.devices.length} devices)\n`;
    });
    
    await ctx.reply(msg, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
  }

  async showUnlockRequests(ctx) {
    const userId = ctx.from.id.toString();
    if (!this.isUserAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const pending = Array.from(this.deviceUnlockSessions.entries())
      .filter(([_, r]) => r.status === 'pending');
    
    if (pending.length === 0) {
      return ctx.reply('No pending unlock requests', { parse_mode: 'HTML' });
    }
    
    let msg = '<b>🔓 Pending Unlock Requests</b>\n\n';
    pending.slice(0, 5).forEach(([id, r]) => {
      msg += `• ${id}: IMEI ${r.imei.substring(0, 8)}...\n`;
    });
    
    await ctx.reply(msg, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
  }

  async clearExpiredSessions(ctx) {
    const userId = ctx.from.id.toString();
    if (!this.isUserAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    let count = 0;
    const now = new Date();
    for (const [id, s] of this.appSessions.entries()) {
      if (new Date(s.expiresAt) < now) {
        this.appSessions.delete(id);
        count++;
      }
    }
    
    await ctx.answerCbQuery(`✅ Cleared ${count} expired sessions`);
  }

  async generateTestAppLink(ctx) {
    const userId = ctx.from.id.toString();
    if (!this.isUserAdmin(userId)) return ctx.answerCbQuery('❌ Admin only');
    
    const result = await this.generateMiniAppLink(userId);
    if (!result.success) {
      return ctx.reply(`❌ Error: ${result.error}`, { parse_mode: 'HTML' });
    }
    
    await ctx.reply(
      `🧪 <b>Test Link</b>\n\n<code>${result.miniAppUrl}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = DeviceLockApp;