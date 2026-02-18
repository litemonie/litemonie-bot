const { Markup } = require('telegraf');

class DeviceAdmin {
    constructor(deviceSystem, users) {
        this.deviceSystem = deviceSystem;
        this.users = users;
        this.adminRoles = new Set();
        this.marketerRole = null;
    }

    hasAdminPermission(userId) {
        const user = this.users[userId];
        return user && user.kycStatus === 'approved' && user.isDeviceAdmin === true;
    }

    hasMarketerPermission(userId) {
        const user = this.users[userId];
        return user && user.kycStatus === 'approved' && user.isMarketer === true;
    }

    setAdminRole(userId) {
        if (!this.users[userId]) return false;
        this.users[userId].isDeviceAdmin = true;
        return true;
    }

    setMarketerRole(userId) {
        if (!this.users[userId]) return false;
        this.users[userId].isMarketer = true;
        return true;
    }

    async handleDeviceAdmin(ctx, deviceSystem, users) {
        const userId = ctx.from.id.toString();
        
        if (!this.hasAdminPermission(userId)) {
            return ctx.reply(
                '❌ *ADMIN ACCESS ONLY*\n\n' +
                'You do not have permission to access the device admin panel\\.',
                { parse_mode: 'MarkdownV2' }
            );
        }

        await ctx.reply(
            '🛠️ *DEVICE ADMIN PANEL*\n\n' +
            'Select an option to manage devices\\:',
            {
                parse_mode: 'MarkdownV2',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Add Device', 'device_admin_add')],
                    [Markup.button.callback('📋 List Devices', 'device_admin_list')],
                    [Markup.button.callback('📊 Device Stats', 'device_admin_stats')],
                    [Markup.button.callback('👥 Manage Marketers', 'device_admin_marketers')],
                    [Markup.button.callback('🔓 Unlock Devices', 'device_admin_unlock')],
                    [Markup.button.callback('🏠 Back to Main', 'start')]
                ])
            }
        );
    }

    async handleAddDevice(ctx) {
        const userId = ctx.from.id.toString();
        
        if (!this.hasAdminPermission(userId)) {
            return ctx.reply('❌ Admin access only', { parse_mode: 'MarkdownV2' });
        }

        // Store session for adding device
        ctx.session = ctx.session || {};
        ctx.session.deviceAction = 'add_device';
        ctx.session.deviceStep = 1;

        await ctx.reply(
            '📱 *ADD NEW DEVICE*\n\n' +
            'Step 1 of 7\n\n' +
            '📝 *Enter device name\\:*\n' +
            '*Example\\:* Infinix Hot 30\n\n' +
            'Type "cancel" to stop',
            { parse_mode: 'MarkdownV2' }
        );
    }

    async handleText(ctx, text, session) {
        const userId = ctx.from.id.toString();
        
        if (!session || session.deviceAction !== 'add_device') {
            return false;
        }

        if (text.toLowerCase() === 'cancel') {
            delete session.deviceAction;
            delete session.deviceStep;
            await ctx.reply('❌ Device addition cancelled', { parse_mode: 'MarkdownV2' });
            return true;
        }

        if (!session.deviceData) {
            session.deviceData = {};
        }

        switch(session.deviceStep) {
            case 1: // Device name
                session.deviceData.name = text;
                session.deviceStep = 2;
                await ctx.reply(
                    'Step 2 of 7\n\n' +
                    '🏷️ *Enter device make\\:*\n' +
                    '*Options\\:* Infinix, Tecno, Itel, Samsung, iPhone, Nokia, etc\\.\n\n' +
                    'Type "cancel" to stop',
                    { parse_mode: 'MarkdownV2' }
                );
                break;

            case 2: // Device make
                session.deviceData.make = text;
                session.deviceStep = 3;
                await ctx.reply(
                    'Step 3 of 7\n\n' +
                    '📱 *Enter device model\\:*\n' +
                    '*Example\\:* Hot 30, Spark 20, A15, etc\\.\n\n' +
                    'Type "cancel" to stop',
                    { parse_mode: 'MarkdownV2' }
                );
                break;

            case 3: // Device model
                session.deviceData.model = text;
                session.deviceStep = 4;
                await ctx.reply(
                    'Step 4 of 7\n\n' +
                    '💰 *Enter original price \\(in Naira\\)\\:*\n' +
                    '*Example\\:* 80000\n\n' +
                    'Type "cancel" to stop',
                    { parse_mode: 'MarkdownV2' }
                );
                break;

            case 4: // Original price
                if (!/^\d+$/.test(text)) {
                    await ctx.reply('❌ Please enter a valid number', { parse_mode: 'MarkdownV2' });
                    return true;
                }
                session.deviceData.originalPrice = text;
                session.deviceStep = 5;
                await ctx.reply(
                    'Step 5 of 7\n\n' +
                    '⏰ *Enter minimum payment months \\(2\\-6\\)\\:*\n' +
                    '*Default\\:* 2 months\n\n' +
                    'Type "cancel" to stop',
                    { parse_mode: 'MarkdownV2' }
                );
                break;

            case 5: // Min months
                if (!/^[2-6]$/.test(text)) {
                    await ctx.reply('❌ Please enter a number between 2 and 6', { parse_mode: 'MarkdownV2' });
                    return true;
                }
                session.deviceData.minMonths = text;
                session.deviceStep = 6;
                await ctx.reply(
                    'Step 6 of 7\n\n' +
                    '⏰ *Enter maximum payment months \\(2\\-6\\)\\:*\n' +
                    '*Default\\:* 6 months\n\n' +
                    'Type "cancel" to stop',
                    { parse_mode: 'MarkdownV2' }
                );
                break;

            case 6: // Max months
                if (!/^[2-6]$/.test(text)) {
                    await ctx.reply('❌ Please enter a number between 2 and 6', { parse_mode: 'MarkdownV2' });
                    return true;
                }
                session.deviceData.maxMonths = text;
                session.deviceStep = 7;
                
                const sellingPrice = this.deviceSystem.calculateSellingPrice(session.deviceData.originalPrice);
                const profit = sellingPrice - parseInt(session.deviceData.originalPrice);
                
                await ctx.reply(
                    'Step 7 of 7\n\n' +
                    '✅ *Device Details Summary*\n\n' +
                    `📱 *Name\\:* ${session.deviceData.name}\n` +
                    `🏷️ *Make\\:* ${session.deviceData.make}\n` +
                    `📦 *Model\\:* ${session.deviceData.model}\n` +
                    `💰 *Original Price\\:* ₦${parseInt(session.deviceData.originalPrice).toLocaleString()}\n` +
                    `💵 *Selling Price\\:* ₦${sellingPrice.toLocaleString()}\n` +
                    `📈 *Profit\\:* ₦${profit.toLocaleString()}\n` +
                    `⏰ *Payment Months\\:* ${session.deviceData.minMonths}\\-${session.deviceData.maxMonths}\n\n` +
                    '📝 *Add a description \\(optional\\)\\:*\n' +
                    '*Example\\:* Brand new sealed box, 6GB RAM, 128GB storage, etc\\.\n\n' +
                    'Type "skip" to skip or "cancel" to stop',
                    { parse_mode: 'MarkdownV2' }
                );
                break;

            case 7: // Description
                if (text.toLowerCase() !== 'skip') {
                    session.deviceData.description = text;
                }
                
                // Complete device addition
                try {
                    const device = await this.deviceSystem.addDevice({
                        ...session.deviceData,
                        addedBy: userId,
                        paymentPlans: ['daily', 'weekly', 'monthly']
                    });

                    const profit = device.sellingPrice - device.originalPrice;
                    
                    await ctx.reply(
                        '✅ *DEVICE ADDED SUCCESSFULLY\\!*\n\n' +
                        `📱 *Device\\:* ${device.name}\n` +
                        `🏷️ *Make\\:* ${device.make}\n` +
                        `📦 *Model\\:* ${device.model}\n` +
                        `💰 *Original Price\\:* ₦${device.originalPrice.toLocaleString()}\n` +
                        `💵 *Selling Price\\:* ₦${device.sellingPrice.toLocaleString()}\n` +
                        `📈 *Profit\\:* ₦${profit.toLocaleString()}\n` +
                        `⏰ *Payment Plans\\:* Daily, Weekly, Monthly\n` +
                        `📅 *Months\\:* ${device.minMonths}\\-${device.maxMonths}\n\n` +
                        `🆔 *Device ID\\:* ${device.id}\n\n` +
                        '📝 *Description\\:* ' + (device.description || 'No description provided') + '\n\n' +
                        '🔄 *What next\\?*\n' +
                        '1\\. Assign a marketer for 10\\% commission\n' +
                        '2\\. Users can now purchase this device on credit',
                        { parse_mode: 'MarkdownV2' }
                    );

                } catch (error) {
                    await ctx.reply(
                        '❌ *Error adding device\\:* ' + error.message,
                        { parse_mode: 'MarkdownV2' }
                    );
                }
                
                // Clear session
                delete session.deviceAction;
                delete session.deviceStep;
                delete session.deviceData;
                break;
        }

        return true;
    }

    async handleListDevices(ctx, make = 'all') {
        const userId = ctx.from.id.toString();
        
        if (!this.hasAdminPermission(userId)) {
            return ctx.reply('❌ Admin access only', { parse_mode: 'MarkdownV2' });
        }

        const devices = await this.deviceSystem.getAvailableDevices(make);
        
        if (devices.length === 0) {
            return ctx.reply(
                '📭 *NO DEVICES FOUND*\n\n' +
                'No devices available in the selected category\\.',
                { parse_mode: 'MarkdownV2' }
            );
        }

        let message = '📱 *AVAILABLE DEVICES*\n\n';
        
        devices.forEach((device, index) => {
            const profit = device.sellingPrice - device.originalPrice;
            message += `${index + 1}\\. *${device.name}*\n`;
            message += `   🏷️ Make\\: ${device.make}\n`;
            message += `   📦 Model\\: ${device.model}\n`;
            message += `   💵 Price\\: ₦${device.sellingPrice.toLocaleString()}\n`;
            message += `   📈 Profit\\: ₦${profit.toLocaleString()}\n`;
            message += `   ⏰ Plans\\: ${device.paymentPlans.join(', ')}\n`;
            message += `   📅 Months\\: ${device.minMonths}\\-${device.maxMonths}\n`;
            message += `   🆔 ID\\: ${device.id}\n\n`;
        });

        await ctx.reply(message, { parse_mode: 'MarkdownV2' });
    }

    async handleDeviceStats(ctx) {
        const userId = ctx.from.id.toString();
        
        if (!this.hasAdminPermission(userId)) {
            return ctx.reply('❌ Admin access only', { parse_mode: 'MarkdownV2' });
        }

        const stats = await this.deviceSystem.getDeviceStats();
        
        let message = '📊 *DEVICE STATISTICS*\n\n';
        message += `📱 *Total Devices\\:* ${stats.totalDevices}\n`;
        message += `🟢 *Available\\:* ${stats.available}\n`;
        message += `💰 *Sold\\:* ${stats.sold}\n`;
        message += `💵 *Total Revenue\\:* ₦${stats.totalRevenue.toLocaleString()}\n`;
        message += `📈 *Total Profit\\:* ₦${stats.totalProfit.toLocaleString()}\n\n`;
        
        message += '*By Make\\:*\n';
        for (const [make, makeStats] of Object.entries(stats.byMake)) {
            message += `• *${make}\\:* ${makeStats.total} total, ${makeStats.sold} sold, ₦${makeStats.revenue.toLocaleString()} revenue\n`;
        }

        await ctx.reply(message, { parse_mode: 'MarkdownV2' });
    }

    async handleManageMarketers(ctx) {
        const userId = ctx.from.id.toString();
        
        if (!this.hasAdminPermission(userId)) {
            return ctx.reply('❌ Admin access only', { parse_mode: 'MarkdownV2' });
        }

        await ctx.reply(
            '👥 *MANAGE MARKETERS*\n\n' +
            'Select an option\\:',
            {
                parse_mode: 'MarkdownV2',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Set as Marketer', 'device_set_marketer')],
                    [Markup.button.callback('📊 Marketer Stats', 'device_marketer_stats')],
                    [Markup.button.callback('💰 Pay Commissions', 'device_pay_commissions')],
                    [Markup.button.callback('⬅️ Back', 'device_admin_panel')]
                ])
            }
        );
    }

    async handleSetMarketer(ctx) {
        const userId = ctx.from.id.toString();
        
        if (!this.hasAdminPermission(userId)) {
            return ctx.reply('❌ Admin access only', { parse_mode: 'MarkdownV2' });
        }

        // Store session for setting marketer
        ctx.session = ctx.session || {};
        ctx.session.deviceAction = 'set_marketer';
        ctx.session.deviceStep = 1;

        await ctx.reply(
            '👥 *SET USER AS MARKETER*\n\n' +
            'Enter the user\'s Telegram ID\\:\n\n' +
            '*How to find Telegram ID\\:*\n' +
            '1\\. User can use /id command\n' +
            '2\\. Or forward a message from them\n\n' +
            'Type "cancel" to stop',
            { parse_mode: 'MarkdownV2' }
        );
    }
}

module.exports = DeviceAdmin;