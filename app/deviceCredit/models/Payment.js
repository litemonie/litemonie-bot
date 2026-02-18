module.exports = class Payment {
  constructor({
    paymentId,
    purchaseId,
    userId,
    deviceId,
    amount,
    paymentDate = new Date().toISOString(),
    paymentMethod = 'wallet',
    status = 'completed',
    reference
  }) {
    this.paymentId = paymentId || `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.purchaseId = purchaseId;
    this.userId = userId;
    this.deviceId = deviceId;
    this.amount = amount;
    this.paymentDate = paymentDate;
    this.paymentMethod = paymentMethod;
    this.status = status;
    this.reference = reference || `DEVPAY-${Date.now()}`;
  }

  static createFromPurchase(purchase, amount, userId) {
    return new Payment({
      purchaseId: purchase.purchaseId,
      userId: userId,
      deviceId: purchase.deviceId,
      amount: amount,
      paymentMethod: 'device_credit'
    });
  }

  toJSON() {
    return {
      paymentId: this.paymentId,
      purchaseId: this.purchaseId,
      userId: this.userId,
      deviceId: this.deviceId,
      amount: this.amount,
      paymentDate: this.paymentDate,
      paymentMethod: this.paymentMethod,
      status: this.status,
      reference: this.reference
    };
  }
};