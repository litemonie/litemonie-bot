// app/core/initUser.js - CORRECTED VERSION
module.exports = {
  // Initialize user if not exists
  initUser: async (userId, users, transactions, adminId = null) => {
    // Convert to string for consistency
    const userIdStr = userId.toString();
    
    if (!users[userIdStr]) {
      // Default admin check - main file will provide adminId
      const isAdminUser = adminId ? userIdStr === adminId.toString() : false;
      
      // Create new user object
      const newUser = {
        telegramId: userIdStr,
        wallet: 0,
        kycStatus: 'pending',
        pin: null,
        pinAttempts: 0,
        pinLocked: false,
        joined: new Date().toLocaleString(),
        email: null,
        phone: null,
        firstName: null,
        lastName: null,
        username: null,
        virtualAccount: null,
        virtualAccountNumber: null,
        virtualAccountBank: null,
        dailyDeposit: 0,
        dailyTransfer: 0,
        lastDeposit: null,
        lastTransfer: null,
        kycSubmittedDate: null,
        kycApprovedDate: null,
        kycRejectedDate: null,
        kycRejectionReason: null,
        kycSubmitted: false,
        kycDocument: null,
        kycDocumentType: null,
        kycDocumentNumber: null,
        isMarketer: false,
        marketerId: null,
        totalDeviceSales: 0,
        totalDeviceCommission: 0,
        isAdmin: isAdminUser
      };
      
      users[userIdStr] = newUser;
      
      // Initialize transactions array if not exists
      if (!transactions[userIdStr]) {
        transactions[userIdStr] = [];
      }
      
      console.log(`✅ New user initialized: ${userIdStr} ${isAdminUser ? '(ADMIN)' : ''}`);
    }
    
    return users[userIdStr];
  },
  
  // Check if user is admin
  isAdmin: (userId, adminId = null) => {
    if (!adminId) return false;
    return userId.toString() === adminId.toString();
  }
};