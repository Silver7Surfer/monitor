// src/services/trc20Service.js
import axios from 'axios';
import 'dotenv/config';
import addressService from './addressService.js';

// Store processed transactions to avoid duplicates
const processedTxs = new Set();

// USDT contract address on TRON (TRC20)
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Delay between API requests
const REQUEST_DELAY = 200;

/**
 * Check for TRC20 USDT deposits for a specific address
 * @param {string} address The wallet address to check
 * @returns {Promise<Array>} Array of deposit transactions
 */
async function checkAddress(address) {
  try {
    console.log(`Checking TRC20 address: ${address}`);
    
    // TronGrid requires an API key for authentication
    const headers = {};
    if (process.env.TRONGRID_API_KEY) {
      headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
    }
    
    // Get TRC20 token transfers for this address
    const response = await axios.get(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`, {
      headers,
      params: {
        limit: 100,
        only_confirmed: true,
        only_to: true  // Only get incoming transactions
      }
    });
    
    if (!response.data || !response.data.success) {
      console.log(`API returned non-success status for ${address}`);
      return [];
    }

    const transactions = response.data.data || [];
    console.log(`Found ${transactions.length} TRC20 transactions for address ${address}`);

    const deposits = [];
    
    // Process transactions for this address
    for (const tx of transactions) {
      // Check if this is USDT and we haven't processed it yet
      if (tx.token_info.address === USDT_CONTRACT && 
          tx.to === address && 
          !processedTxs.has(tx.transaction_id)) {
        
        // Find user ID for this address
        const userId = addressService.getUserIdForAddress(address, 'trc20');
        
        if (userId) {
          // Calculate amount based on decimals (USDT TRC20 has 6 decimals)
          const decimals = tx.token_info.decimals || 6;
          const amount = tx.value / Math.pow(10, decimals);
          
          console.log(`
📝 New TRC20 Deposit Found:
   User ID: ${userId}
   Amount: ${amount} ${tx.token_info.symbol}
   To: ${tx.to}
   From: ${tx.from}
   Hash: ${tx.transaction_id}
   Time: ${new Date(tx.block_timestamp).toISOString()}
          `);
          
          const deposit = {
            userId,
            type: 'deposit',
            asset: 'usdt',
            network: 'trc20',
            amount,
            txHash: tx.transaction_id,
            from: tx.from,
            to: tx.to,
            timestamp: new Date(tx.block_timestamp).toISOString(),
            confirmations: tx.confirmations || 1  // TronGrid might not provide this
          };
          
          deposits.push(deposit);
          processedTxs.add(tx.transaction_id);
        }
      }
    }
    
    return deposits;
  } catch (error) {
    console.error(`Error checking TRC20 address ${address}:`, error.message);
    return [];
  }
}

/**
 * Check all TRC20 addresses for deposits
 * @returns {Promise<Array>} Array of all deposits found
 */
async function checkAllAddresses() {
  try {
    console.log('\n🔍 Checking USDT (TRC20) deposits...');
    
    const addresses = addressService.getAddresses().trc20;
    
    if (addresses.length === 0) {
      console.log('No TRC20 addresses to monitor');
      return [];
    }
    
    const allDeposits = [];
    
    // Check each address individually
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      console.log(`Checking TRC20 address ${i+1}/${addresses.length}: ${address}`);
      
      const deposits = await checkAddress(address);
      allDeposits.push(...deposits);
      
      // Add a small delay between requests to avoid rate limits
      if (i < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
      }
    }
    
    if (allDeposits.length === 0) {
      console.log('😴 No new TRC20 deposits found');
    } else {
      console.log(`🎉 Found ${allDeposits.length} new TRC20 deposits!`);
    }
    
    return allDeposits;
  } catch (error) {
    console.error('Error checking TRC20 deposits:', error.message);
    return [];
  }
}

/**
 * Get the status of processed transactions
 * @returns {number} Number of processed transactions
 */
function getProcessedCount() {
  return processedTxs.size;
}

export default {
  checkAllAddresses,
  checkAddress,
  getProcessedCount,
  CONTRACT: USDT_CONTRACT
};