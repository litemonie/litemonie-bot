// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');
const token = urlParams.get('token');

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Your server URL
const SERVER_URL = 'https://your-server.com/api'; // Change to your server

async function loadDeviceData() {
    try {
        const response = await fetch(`${SERVER_URL}/device-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, token })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayDeviceData(data);
        } else {
            document.getElementById('deviceInfo').innerHTML = `
                <p style="color: red;">Error: ${data.error}</p>
                <button onclick="location.href='https://t.me/your_bot'">Open in Bot</button>
            `;
        }
    } catch (error) {
        document.getElementById('deviceInfo').innerHTML = `
            <p style="color: red;">Connection error</p>
            <button onclick="location.reload()">Retry</button>
        `;
    }
}

function displayDeviceData(data) {
    // Device info
    document.getElementById('deviceInfo').innerHTML = `
        <p><strong>Device:</strong> ${data.device.make} ${data.device.model}</p>
        <p><strong>IMEI:</strong> ${data.device.imei}</p>
        <p><strong>Installment:</strong> ${data.installment.id}</p>
    `;
    
    // Status
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = data.device.statusMessage;
    
    if (data.device.lockStatus === 'locked') {
        statusDiv.className = 'status locked';
        statusDiv.innerHTML = '🔒 ' + statusDiv.innerHTML;
    } else if (data.device.lockStatus === 'warning') {
        statusDiv.className = 'status warning';
        statusDiv.innerHTML = '⚠️ ' + statusDiv.innerHTML;
    } else {
        statusDiv.className = 'status unlocked';
        statusDiv.innerHTML = '✅ ' + statusDiv.innerHTML;
    }
    
    // Buttons
    const buttonsDiv = document.getElementById('buttons');
    buttonsDiv.innerHTML = '';
    
    if (data.device.lockStatus === 'locked') {
        buttonsDiv.innerHTML = `
            <button class="pay-btn" onclick="makePayment()">💳 Make Payment</button>
            <button class="support-btn" onclick="contactSupport()">📞 Contact Support</button>
        `;
    } else if (data.device.lockStatus === 'warning') {
        buttonsDiv.innerHTML = `
            <button class="pay-btn" onclick="makePayment()">💳 Pay Now (Urgent)</button>
            <button class="support-btn" onclick="contactSupport()">📞 Payment Plan</button>
        `;
    } else {
        buttonsDiv.innerHTML = `
            <button class="pay-btn" onclick="makePayment()">💳 Make Payment</button>
            <button class="info" onclick="viewSchedule()">📅 Payment Schedule</button>
        `;
    }
    
    // Payment info
    const paymentDiv = document.getElementById('paymentInfo');
    if (data.installment.nextPayment) {
        const dueDate = new Date(data.installment.nextPayment.dueDate).toLocaleDateString();
        paymentDiv.innerHTML = `
            <h3>Next Payment</h3>
            <p><strong>Amount:</strong> ₦${data.installment.nextPayment.amount.toLocaleString()}</p>
            <p><strong>Due Date:</strong> ${dueDate}</p>
            <p><strong>Progress:</strong> ${data.installment.paymentsMade}/${data.installment.totalPayments} payments made</p>
        `;
    }
}

function makePayment() {
    tg.openTelegramLink(`https://t.me/${tg.initDataUnsafe.user?.username || 'your_bot'}?start=payment`);
}

function contactSupport() {
    tg.openTelegramLink('https://t.me/opuenekeke');
}

function viewSchedule() {
    alert('Payment schedule feature coming soon!');
}

// Load data on start
loadDeviceData();

// Refresh every 5 minutes
setInterval(loadDeviceData, 5 * 60 * 1000);