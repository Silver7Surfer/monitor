import axios from 'axios';
import 'dotenv/config';
import addressService from './addressService.js';

// Store processed transactions to avoid duplicates
const processedTxs = new Set();

// USDT contract address on BSC
const USDT_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';

// Delay between API requests
const REQUEST_DELAY = 200;

/**
 * Check for BEP20 USDT deposits for a specific address
 * @param {string} address The wallet address to check
 * @returns {Promise<Array>} Array of deposit transactions
 */
async function checkAddress(address) {
  try {
    console.log(`Checking address: ${address}`);
    
    const response = await axios.get('https://api.bscscan.com/api', {
      params: {
        module: 'account',
        action: 'tokentx',
        address: address,
        startblock: 0,
        endblock: 999999999,
        sort: 'desc',
        apikey: process.env.BSCSCAN_API_KEY
      }
    });
    
    if (response.data.status !== '1') {
      console.log(`API returned non-success status for ${address}: ${response.data.message}`);
      return [];
    }

    const transactions = Array.isArray(response.data.result) ? response.data.result : [];
    console.log(`Found ${transactions.length} transactions for address ${address}`);

    const deposits = [];
    
    // Process transactions for this address
    for (const tx of transactions) {
      // Only process USDT deposits to our address that we haven't seen before
      if (tx.contractAddress.toLowerCase() === USDT_CONTRACT.toLowerCase() && 
          tx.to.toLowerCase() === address.toLowerCase() && 
          !processedTxs.has(tx.hash)) {
        
        // Find user ID for this address
        const userId = addressService.getUserIdForAddress(address, 'bep20');
        
        if (userId) {
          console.log(`
📝 New Deposit Found:
   User ID: ${userId}
   Amount: ${tx.value / 1e18} ${tx.tokenSymbol}
   To: ${tx.to}
   From: ${tx.from}
   Hash: ${tx.hash}
   Time: ${new Date(tx.timeStamp * 1000).toISOString()}
          `);
          
          const deposit = {
            userId,
            type: 'deposit',
            asset: 'usdt',
            network: 'bep20',
            amount: tx.value / 1e18,
            txHash: tx.hash,
            from: tx.from,
            to: tx.to,
            timestamp: new Date(tx.timeStamp * 1000).toISOString(),
            confirmations: tx.confirmations
          };
          
          deposits.push(deposit);
          processedTxs.add(tx.hash);
        }
      }
    }
    
    return deposits;
  } catch (error) {
    console.error(`Error checking address ${address}:`, error.message);
    return [];
  }
}

/**
 * Check all BEP20 addresses for deposits
 * @returns {Promise<Array>} Array of all deposits found
 */
async function checkAllAddresses() {
  try {
    console.log('\n🔍 Checking USDT (BEP20) deposits...');
    
    const addresses = addressService.getAddresses().bep20;
    
    if (addresses.length === 0) {
      console.log('No BEP20 addresses to monitor');
      return [];
    }
    
    const allDeposits = [];
    
    // Check each address individually
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      console.log(`Checking address ${i+1}/${addresses.length}: ${address}`);
      
      const deposits = await checkAddress(address);
      allDeposits.push(...deposits);
      
      // Add a small delay between requests to avoid rate limits
      if (i < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
      }
    }
    
    if (allDeposits.length === 0) {
      console.log('😴 No new deposits found');
    } else {
      console.log(`🎉 Found ${allDeposits.length} new deposits!`);
    }
    
    return allDeposits;
  } catch (error) {
    console.error('Error checking BEP20 deposits:', error.message);
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