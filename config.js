// ==================== CONFIG.JS ====================
// Configuration, environment variables, constants
// ===================================================

require('dotenv').config();

// ==================== CONFIGURATION ====================
const CONFIG = {
  VTU_API_KEY: process.env.VTU_API_KEY || 'your_vtu_naija_api_key_here',
  VTU_BASE_URL: 'https://vtunaija.com.ng/api',
  ADMIN_ID: process.env.ADMIN_ID || '1279640125',
  SERVICE_FEE: 100,
  MIN_AIRTIME: 50,
  MAX_AIRTIME: 50000,
  BILLSTACK_API_KEY: process.env.BILLSTACK_API_KEY,
  BILLSTACK_SECRET_KEY: process.env.BILLSTACK_SECRET_KEY,
  BILLSTACK_BASE_URL: process.env.BILLSTACK_BASE_URL || 'https://api.billstack.co',
  MONNIFY_API_KEY: process.env.MONNIFY_API_KEY,
  MONNIFY_SECRET_KEY: process.env.MONNIFY_SECRET_KEY,
  MONNIFY_CONTRACT_CODE: process.env.MONNIFY_CONTRACT_CODE,
  MONNIFY_BASE_URL: process.env.MONNIFY_BASE_URL || 'https://api.monnify.com',
  MONNIFY_SOURCE_ACCOUNT: process.env.MONNIFY_SOURCE_ACCOUNT,
  MONNIFY_SOURCE_NAME: process.env.MONNIFY_SOURCE_NAME,
  MONNIFY_SOURCE_BANK_CODE: process.env.MONNIFY_SOURCE_BANK_CODE
};

// ==================== NETWORK CODES ====================
const NETWORK_CODES = {
  'MTN': '1',
  'GLO': '2',
  '9MOBILE': '3',
  'AIRTEL': '4'
};

// ==================== TV PROVIDERS ====================
const TV_PROVIDERS = {
  'GOTV': '1',
  'DSTV': '2',
  'STARTIMES': '3',
  'SHOWMAX': '4'
};

// ==================== ELECTRICITY DISCOs ====================
const ELECTRICITY_DISCOS = {
  'AEDC': '1',
  'EKEDC': '2',
  'IKEDC': '3',
  'JED': '4',
  'KAEDCO': '5',
  'PHED': '6'
};

// ==================== EXAM TYPES ====================
const EXAM_TYPES = {
  'WAEC': '1',
  'NECO': '2',
  'NABTEB': '3',
  'JAMB': '4',
  'WAECREGISTRATION': '5',
  'NBAIS': '6'
};

module.exports = {
  CONFIG,
  NETWORK_CODES,
  TV_PROVIDERS,
  ELECTRICITY_DISCOS,
  EXAM_TYPES
};