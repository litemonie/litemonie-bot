const fs = require('fs').promises;
const path = require('path');

class DeviceSystem {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.devicesFile = path.join(dataDir, 'devices.json');
        this.deviceLoansFile = path.join(dataDir, 'deviceLoans.json');
        this.marketersFile = path.join(dataDir, 'marketers.json');
        this.devices = {};
        this.deviceLoans = {};
        this.marketers = {};
        this.paymentPlans = {
            daily: 'daily',
            weekly: 'weekly',
            monthly: 'monthly'
        };
        this.initialize();
    }

    async initialize() {
        try {
            // Ensure data directory exists
            await fs.mkdir(this.dataDir, { recursive: true });
            
            // Load or create data files
            this.devices = await this.loadData(this.devicesFile, {});
            this.deviceLoans = await this.loadData(this.deviceLoansFile, {});
            this.marketers = await this.loadData(this.marketersFile, {});
            
            console.log('✅ Device system initialized');
        } catch (error) {
            console.error('❌ Device system initialization error:', error);
        }
    }

    async loadData(filePath, defaultData = {}) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // If file doesn't exist, create it with default data
            await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
    }

    async saveData(filePath, data) {
        try {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`❌ Error saving ${path.basename(filePath)}:`, error);
        }
    }

    async addDevice(deviceData) {
        const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const device = {
            id: deviceId,
            name: deviceData.name,
            make: deviceData.make,
            model: deviceData.model,
            originalPrice: parseFloat(deviceData.originalPrice),
            profitMargin: 0.30,
            sellingPrice: this.calculateSellingPrice(deviceData.originalPrice),
            status: 'available',
            addedBy: deviceData.addedBy,
            addedAt: new Date().toISOString(),
            paymentPlans: deviceData.paymentPlans || ['monthly'],
            minMonths: parseInt(deviceData.minMonths) || 2,
            maxMonths: parseInt(deviceData.maxMonths) || 6,
            assignedMarketer: deviceData.assignedMarketer || null,
            imageUrl: deviceData.imageUrl || null,
            description: deviceData.description || '',
            specifications: deviceData.specifications || {},
            category: deviceData.category || 'smartphone',
            locked: false,
            location: deviceData.location || 'Lagos'
        };

        this.devices[deviceId] = device;
        await this.saveData(this.devicesFile, this.devices);
        return device;
    }

    calculateSellingPrice(originalPrice) {
        const profit = parseFloat(originalPrice) * 0.30;
        return Math.round(parseFloat(originalPrice) + profit);
    }

    calculatePaymentPlan(deviceId, planType, duration) {
        const device = this.devices[deviceId];
        if (!device) return null;

        const totalPrice = device.sellingPrice;
        let paymentAmount = 0;
        let paymentCount = 0;

        switch(planType) {
            case 'daily':
                paymentCount = duration * 30; // Approximate 30 days per month
                paymentAmount = totalPrice / paymentCount;
                break;
            case 'weekly':
                paymentCount = duration * 4; // Approximate 4 weeks per month
                paymentAmount = totalPrice / paymentCount;
                break;
            case 'monthly':
                paymentCount = duration;
                paymentAmount = totalPrice / paymentCount;
                break;
        }

        const commission = this.calculateCommission(totalPrice, device.originalPrice);

        return {
            planType,
            duration,
            totalAmount: totalPrice,
            installmentAmount: Math.round(paymentAmount),
            marketerCommission: Math.round(commission),
            totalInstallments: paymentCount,
            dailyPayment: planType === 'daily' ? Math.round(paymentAmount) : Math.round(paymentAmount / 30),
            weeklyPayment: planType === 'weekly' ? Math.round(paymentAmount) : Math.round(paymentAmount / 4)
        };
    }

    calculateCommission(sellingPrice, originalPrice) {
        const profit = sellingPrice - originalPrice;
        return profit * 0.10; // 10% commission for marketer
    }

    async getAvailableDevices(make = null) {
        let devices = Object.values(this.devices).filter(d => d.status === 'available');
        
        if (make && make !== 'all') {
            devices = devices.filter(d => d.make === make);
        }

        return devices;
    }

    async purchaseDevice(deviceId, userId, paymentPlan) {
        const device = this.devices[deviceId];
        if (!device || device.status !== 'available') {
            throw new Error('Device not available');
        }

        // Create loan record
        const loanId = `loan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const paymentSchedule = this.generatePaymentSchedule(device, paymentPlan);
        
        const loan = {
            id: loanId,
            deviceId,
            userId,
            deviceName: device.name,
            totalAmount: device.sellingPrice,
            paidAmount: 0,
            remainingAmount: device.sellingPrice,
            paymentPlan: paymentPlan.planType,
            duration: paymentPlan.duration,
            installmentAmount: paymentPlan.installmentAmount,
            status: 'active',
            startDate: new Date().toISOString(),
            nextPaymentDate: this.calculateNextPaymentDate(paymentPlan.planType),
            paymentSchedule,
            missedPayments: 0,
            completedPayments: 0,
            locked: false,
            marketerCommission: device.assignedMarketer ? paymentPlan.marketerCommission : 0,
            marketerId: device.assignedMarketer,
            marketerPaid: false
        };

        // Update device status
        device.status = 'sold';
        device.purchasedBy = userId;
        device.purchasedAt = new Date().toISOString();
        device.paymentPlan = paymentPlan.planType;

        // Store loan
        if (!this.deviceLoans[userId]) {
            this.deviceLoans[userId] = [];
        }
        this.deviceLoans[userId].push(loan);

        // Save data
        await this.saveData(this.devicesFile, this.devices);
        await this.saveData(this.deviceLoansFile, this.deviceLoans);

        return { device, loan };
    }

    generatePaymentSchedule(device, paymentPlan) {
        const schedule = [];
        const startDate = new Date();
        let paymentCount = 0;

        switch(paymentPlan.planType) {
            case 'daily':
                paymentCount = paymentPlan.duration * 30;
                break;
            case 'weekly':
                paymentCount = paymentPlan.duration * 4;
                break;
            case 'monthly':
                paymentCount = paymentPlan.duration;
                break;
        }

        for (let i = 1; i <= paymentCount; i++) {
            let dueDate = new Date(startDate);
            
            switch(paymentPlan.planType) {
                case 'daily':
                    dueDate.setDate(startDate.getDate() + i);
                    break;
                case 'weekly':
                    dueDate.setDate(startDate.getDate() + (i * 7));
                    break;
                case 'monthly':
                    dueDate.setMonth(startDate.getMonth() + i);
                    break;
            }

            schedule.push({
                installmentNumber: i,
                dueDate: dueDate.toISOString(),
                amount: paymentPlan.installmentAmount,
                paid: false,
                paidDate: null,
                late: false
            });
        }

        return schedule;
    }

    calculateNextPaymentDate(planType) {
        const nextDate = new Date();
        
        switch(planType) {
            case 'daily':
                nextDate.setDate(nextDate.getDate() + 1);
                break;
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
        }

        return nextDate.toISOString();
    }

    async getUserLoans(userId) {
        return this.deviceLoans[userId] || [];
    }

    async makePayment(loanId, userId, amount) {
        const userLoans = this.deviceLoans[userId];
        if (!userLoans) throw new Error('No loans found');

        const loan = userLoans.find(l => l.id === loanId);
        if (!loan) throw new Error('Loan not found');

        // Find next unpaid installment
        const nextInstallment = loan.paymentSchedule.find(s => !s.paid);
        if (!nextInstallment) throw new Error('All payments completed');

        // Check if payment matches installment amount (allow slight variation)
        if (Math.abs(amount - loan.installmentAmount) > 10) {
            throw new Error(`Payment amount must be approximately ₦${loan.installmentAmount}`);
        }

        // Update payment
        nextInstallment.paid = true;
        nextInstallment.paidDate = new Date().toISOString();
        loan.paidAmount += amount;
        loan.remainingAmount -= amount;
        loan.completedPayments += 1;

        // Check if payment is late
        const dueDate = new Date(nextInstallment.dueDate);
        const today = new Date();
        if (today > dueDate) {
            nextInstallment.late = true;
            loan.missedPayments += 1;
        }

        // Check if all payments completed
        if (loan.completedPayments === loan.paymentSchedule.length) {
            loan.status = 'completed';
            // Pay marketer commission if not paid
            if (loan.marketerId && !loan.marketerPaid) {
                await this.payMarketerCommission(loan.marketerId, loan.marketerCommission);
                loan.marketerPaid = true;
            }
        } else {
            // Update next payment date
            loan.nextPaymentDate = this.calculateNextPaymentDate(loan.paymentPlan);
        }

        await this.saveData(this.deviceLoansFile, this.deviceLoans);
        return loan;
    }

    async payMarketerCommission(marketerId, commission) {
        if (!this.marketers[marketerId]) {
            this.marketers[marketerId] = {
                userId: marketerId,
                totalCommission: 0,
                pendingCommission: 0,
                paidCommission: 0,
                totalSales: 0,
                createdAt: new Date().toISOString()
            };
        }

        this.marketers[marketerId].pendingCommission += commission;
        await this.saveData(this.marketersFile, this.marketers);
    }

    async getMarketerStats(marketerId) {
        const marketer = this.marketers[marketerId];
        if (!marketer) {
            return {
                userId: marketerId,
                totalCommission: 0,
                pendingCommission: 0,
                paidCommission: 0,
                totalSales: 0,
                devicesSold: 0
            };
        }

        // Count devices sold by this marketer
        const devicesSold = Object.values(this.devices).filter(d => 
            d.assignedMarketer === marketerId && d.status === 'sold'
        ).length;

        return {
            ...marketer,
            devicesSold
        };
    }

    async checkOverdueLoans() {
        const overdueLoans = [];
        const today = new Date();

        for (const userId in this.deviceLoans) {
            const userLoans = this.deviceLoans[userId];
            for (const loan of userLoans) {
                if (loan.status === 'active' && !loan.locked) {
                    const nextPayment = new Date(loan.nextPaymentDate);
                    const daysLate = Math.floor((today - nextPayment) / (1000 * 60 * 60 * 24));

                    if (daysLate > 7) { // 7 days grace period
                        loan.locked = true;
                        loan.lockedDate = today.toISOString();
                        loan.lockReason = `Overdue payment by ${daysLate} days`;
                        overdueLoans.push(loan);
                    }
                }
            }
        }

        if (overdueLoans.length > 0) {
            await this.saveData(this.deviceLoansFile, this.deviceLoans);
        }

        return overdueLoans;
    }

    async unlockDevice(loanId, userId) {
        const userLoans = this.deviceLoans[userId];
        if (!userLoans) throw new Error('No loans found');

        const loan = userLoans.find(l => l.id === loanId);
        if (!loan) throw new Error('Loan not found');

        loan.locked = false;
        loan.unlockedDate = new Date().toISOString();
        loan.unlockedBy = 'admin'; // This would be set by admin

        await this.saveData(this.deviceLoansFile, this.deviceLoans);
        return loan;
    }

    async assignMarketer(deviceId, marketerId) {
        const device = this.devices[deviceId];
        if (!device) throw new Error('Device not found');

        device.assignedMarketer = marketerId;
        await this.saveData(this.devicesFile, this.devices);
        return device;
    }

    async removeDevice(deviceId) {
        if (!this.devices[deviceId]) {
            throw new Error('Device not found');
        }

        delete this.devices[deviceId];
        await this.saveData(this.devicesFile, this.devices);
        return true;
    }

    async getDeviceStats() {
        const devices = Object.values(this.devices);
        
        const stats = {
            totalDevices: devices.length,
            available: devices.filter(d => d.status === 'available').length,
            sold: devices.filter(d => d.status === 'sold').length,
            totalRevenue: devices.filter(d => d.status === 'sold')
                              .reduce((sum, d) => sum + d.sellingPrice, 0),
            totalProfit: devices.filter(d => d.status === 'sold')
                            .reduce((sum, d) => sum + (d.sellingPrice - d.originalPrice), 0),
            byMake: {},
            byStatus: {}
        };

        // Group by make
        devices.forEach(device => {
            if (!stats.byMake[device.make]) {
                stats.byMake[device.make] = {
                    total: 0,
                    sold: 0,
                    revenue: 0,
                    profit: 0
                };
            }
            stats.byMake[device.make].total++;
            if (device.status === 'sold') {
                stats.byMake[device.make].sold++;
                stats.byMake[device.make].revenue += device.sellingPrice;
                stats.byMake[device.make].profit += (device.sellingPrice - device.originalPrice);
            }
        });

        // Group by status
        devices.forEach(device => {
            if (!stats.byStatus[device.status]) {
                stats.byStatus[device.status] = 0;
            }
            stats.byStatus[device.status]++;
        });

        return stats;
    }
}

module.exports = DeviceSystem;