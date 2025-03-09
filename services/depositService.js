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
 */
async function checkDeposits() {
  try {
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
    ];
    
    if (allDeposits.length > 0) {
      await processDeposits(allDeposits);
    }
    
    return allDeposits;
  } catch (error) {
    console.error('Error in checkDeposits:', error.message);
    return [];
  }
}

/**
 * Start monitoring for deposits
 */
function startMonitoring() {
  console.log('Starting deposit monitoring...');
  
  // Initial fetch and check
  addressService.fetchAddresses().then(() => {
    // Initialize real-time services
    bep20Service.init();
    trc20Service.init();
    
    // Initialize BTC service if it has an init function
    if (typeof btcService.init === 'function') {
      btcService.init(addressService.getAddresses().btc);
    }
    
    // Initial check for any missed deposits
    checkDeposits();
  }).catch(error => {
    console.error('Error fetching addresses:', error.message);
  });
  
  // Set up periodic checking (as backup to real-time monitoring)
  monitoringInterval = setInterval(checkDeposits, CHECK_INTERVAL);
  
  // Set up periodic address refresh
  addressRefreshInterval = setInterval(() => {
    const oldAddresses = {
      bep20: [...addressService.getAddresses().bep20],
      trc20: [...addressService.getAddresses().trc20],
      btc: [...addressService.getAddresses().btc]
    };
    
    addressService.fetchAddresses().then(() => {
      // Check for new addresses to monitor in real-time
      const newAddresses = addressService.getAddresses();
      
      // Restart monitoring services if address list has changed
      const bep20Changed = JSON.stringify(oldAddresses.bep20) !== JSON.stringify(newAddresses.bep20);
      const trc20Changed = JSON.stringify(oldAddresses.trc20) !== JSON.stringify(newAddresses.trc20);
      const btcChanged = JSON.stringify(oldAddresses.btc) !== JSON.stringify(newAddresses.btc);
      
      if (bep20Changed) bep20Service.init();
      if (trc20Changed) trc20Service.init();
      if (btcChanged && typeof btcService.init === 'function') btcService.init(newAddresses.btc);
    }).catch(error => {
      console.error('Error refreshing addresses:', error.message);
    });
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
  
  // Stop individual services if they have stop methods
  if (typeof bep20Service.stop === 'function') bep20Service.stop();
  if (typeof trc20Service.stop === 'function') trc20Service.stop();
  if (typeof btcService.stop === 'function') btcService.stop();
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
      btc: typeof btcService.getProcessedCount === 'function' ? btcService.getProcessedCount() : 0,
      total: bep20Service.getProcessedCount() + trc20Service.getProcessedCount() + 
             (typeof btcService.getProcessedCount === 'function' ? btcService.getProcessedCount() : 0)
    },
    realTimeEnabled: {
      bep20: !!process.env.MORALIS_API_KEY || !!process.env.BSCSCAN_WS_KEY,
      trc20: !!process.env.TRONGRID_API_KEY,
      btc: true // WebSocket monitoring always available for BTC
    }
  }
}

export default {
  startMonitoring,
  stopMonitoring,
  checkDeposits,
  processDeposits,  // Expose for real-time services to use
  getStatus
};