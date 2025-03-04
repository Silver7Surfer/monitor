// src/services/depositService.js
import axios from 'axios';
import 'dotenv/config';
import addressService from './addressService.js';
import bep20Service from './bep20Service.js';
import trc20Service from './trc20Service.js';
import btcService from './btcService.js';
const SECRET_KEY = process.env.MONITOR_SECRET_KEY;

// Interval timers
let monitoringInterval = null;
let addressRefreshInterval = null;

// Check interval (default 30 seconds)
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 30000;

// Address refresh interval (default 5 minutes)
const ADDRESS_REFRESH_INTERVAL = parseInt(process.env.ADDRESS_REFRESH_INTERVAL) || 5 * 60 * 1000;

/**
 * Process deposits by sending them to the main server
 * @param {Array} deposits Array of deposit objects
 * @returns {Promise<void>}
 */
async function processDeposits(deposits) {
  if (deposits.length === 0) return;
  
  try {
    console.log(`Processing ${deposits.length} deposits...`);
    
    const response = await axios.post(`${process.env.MAIN_SERVER_URL}/api/wallet/process-deposits`, {
      deposits,
      source: 'monitor'
    },{
      headers: { 'Authorization': `Bearer ${SECRET_KEY}` }
    });
    
    if (response.data.success) {
      console.log('✅ Deposits successfully processed by main server');
      console.log(`Updated ${response.data.processed} wallets`);
    } else {
      console.error('Error processing deposits:', response.data.message);
    }
  } catch (error) {
    console.error('Error sending deposits to main server:', error.message);
  }
}

/**
 * Check for deposits across all networks
 * @returns {Promise<Array>} Array of all deposits found
 * 
 */



async function checkDeposits() {
  // Get BEP20 deposits
  const bep20Deposits = await bep20Service.checkAllAddresses();
  
  // Get TRC20 deposits
  const trc20Deposits = await trc20Service.checkAllAddresses();

  // Get BTC deposits
  const btcDeposits = await btcService.checkAllAddresses();
  
  // Combine all deposits from different networks
  const allDeposits = [
    ...bep20Deposits,
    ...trc20Deposits,
    ...btcDeposits
    // Add more networks here as needed (btc, etc.)
  ];
  
  if (allDeposits.length > 0) {
    await processDeposits(allDeposits);
  }
  
  return allDeposits;
}

/**
 * Start monitoring for deposits
 */
function startMonitoring() {
  console.log('Starting deposit monitoring...');
  
  // Initial fetch and check
  addressService.fetchAddresses().then(() => {
    checkDeposits();
  });
  
  // Set up periodic checking
  monitoringInterval = setInterval(checkDeposits, CHECK_INTERVAL);
  
  // Set up periodic address refresh
  addressRefreshInterval = setInterval(() => {
    addressService.fetchAddresses();
  }, ADDRESS_REFRESH_INTERVAL);
}

/**
 * Stop monitoring for deposits
 */
function stopMonitoring() {
  console.log('Stopping deposit monitoring...');
  
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  
  if (addressRefreshInterval) {
    clearInterval(addressRefreshInterval);
    addressRefreshInterval = null;
  }
}

/**
 * Get monitoring status
 * @returns {Object} Status object
 */
function getStatus() {
  return {
    monitoring: !!monitoringInterval,
    addresses: addressService.getAddresses(),
    processedTransactions: {
      bep20: bep20Service.getProcessedCount(),
      trc20: trc20Service.getProcessedCount(),
      total: bep20Service.getProcessedCount() + trc20Service.getProcessedCount()
    }
  };
}

export default {
  startMonitoring,
  stopMonitoring,
  checkDeposits,
  getStatus
};