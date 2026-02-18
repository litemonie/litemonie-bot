// setup-device-files.js
const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, 'data', 'deviceCredit');

const files = {
  'devices.json': `[
  {
    "id": "TEC-CAMON19-001",
    "make": "Tecno",
    "model": "Camon 19",
    "category": "mid-range",
    "variants": [
      {
        "id": "TEC-CAMON19-001-6GB",
        "ram": "6GB",
        "storage": "128GB",
        "color": "Black",
        "cashPrice": 120000,
        "creditPrice": 156000,
        "costPrice": 100000,
        "specs": {
          "display": "6.8\\" AMOLED",
          "camera": "64MP + 8MP + 2MP",
          "battery": "5000mAh",
          "processor": "Helio G96",
          "os": "Android 12",
          "warranty": "12 months"
        }
      }
    ]
  },
  {
    "id": "INF-HOT12-002",
    "make": "Infinix",
    "model": "Hot 12",
    "category": "budget",
    "variants": [
      {
        "id": "INF-HOT12-002-4GB",
        "ram": "4GB",
        "storage": "64GB",
        "color": "Green",
        "cashPrice": 75000,
        "creditPrice": 97500,
        "costPrice": 62000,
        "specs": {
          "display": "6.78\\" IPS",
          "camera": "50MP + 2MP",
          "battery": "5000mAh",
          "processor": "Helio G85",
          "os": "Android 11",
          "warranty": "12 months"
        }
      }
    ]
  },
  {
    "id": "SAM-A14-003",
    "make": "Samsung",
    "model": "Galaxy A14",
    "category": "mid-range",
    "variants": [
      {
        "id": "SAM-A14-003-4GB",
        "ram": "4GB",
        "storage": "128GB",
        "color": "Black",
        "cashPrice": 95000,
        "creditPrice": 123500,
        "costPrice": 78000,
        "specs": {
          "display": "6.6\\" PLS LCD",
          "camera": "50MP + 5MP + 2MP",
          "battery": "5000mAh",
          "processor": "Exynos 850",
          "os": "Android 13",
          "warranty": "12 months"
        }
      }
    ]
  }
]`,
  
  'inventory.json': '[]',
  
  'imei_locks.json': '[]',
  
  'marketers.json': `[
  {
    "id": "MARK-ADMIN-001",
    "userId": "admin",
    "name": "System Admin",
    "phone": "+2348000000000",
    "email": "admin@litedevice.com",
    "commissionRate": 5,
    "status": "active",
    "assignedDevices": [],
    "assignedClients": [],
    "totalSales": 0,
    "totalCommission": 0,
    "joinDate": "${new Date().toISOString()}",
    "performance": {
      "monthlyTarget": 10000000,
      "currentMonthSales": 0,
      "conversionRate": 0
    }
  }
]`,
  
  'purchases.json': '[]',
  
  'payments.json': '[]',
  
  'transactions.json': '[]',
  
  'config.json': `{
  "settings": {
    "downPaymentPercentage": 30,
    "creditPriceMultiplier": 1.3,
    "defaultCommissionRate": 5,
    "reservationTimeoutMinutes": 30,
    "paymentGracePeriodDays": 7,
    "defaultCurrency": "NGN"
  },
  "bankDetails": {
    "bankName": "Zenith Bank",
    "accountNumber": "1234567890",
    "accountName": "LiteDevice Ltd"
  },
  "notifications": {
    "adminTelegramId": "@opuenekeke",
    "supportContact": "@opuenekeke"
  }
}`
};

async function setupFiles() {
  try {
    // Create directory if it doesn't exist
    await fs.mkdir(dataDir, { recursive: true });
    console.log('✅ Created directory:', dataDir);
    
    // Create each file
    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(dataDir, filename);
      
      try {
        // Check if file exists
        await fs.access(filePath);
        console.log(`📁 ${filename} already exists, skipping...`);
      } catch (error) {
        // File doesn't exist, create it
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`✅ Created ${filename}`);
      }
    }
    
    console.log('\n🎉 All device files have been set up successfully!');
    console.log('📍 Location:', dataDir);
    console.log('\n📋 Files created:');
    Object.keys(files).forEach(file => console.log(`  • ${file}`));
    
  } catch (error) {
    console.error('❌ Error setting up files:', error);
  }
}

setupFiles();