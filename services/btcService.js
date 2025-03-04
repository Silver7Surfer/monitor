// src/services/btcService.js
import axios from 'axios';
import 'dotenv/config';
import addressService from './addressService.js';

// Store processed transactions to avoid duplicates
const processedTxs = new Set();

// Delay between API requests
const REQUEST_DELAY = 200;

/**
 * Check for BTC deposits for a specific address
 * @param {string} address The wallet address to check
 * @returns {Promise<Array>} Array of deposit transactions
 */
async function checkAddress(address) {
  try {
    console.log(`Checking BTC address: ${address}`);
    
    // Use BlockCypher API to check BTC transactions
    const response = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${address}/full`, {
      params: {
        limit: 50,
        confirmations: 1  // Only include confirmed transactions
      }
    });
    
    if (!response.data || !response.data.txs) {
      console.log(`API returned invalid data for ${address}`);
      return [];
    }

    const transactions = response.data.txs || [];
    console.log(`Found ${transactions.length} BTC transactions for address ${address}`);

    const deposits = [];
    
    // Process transactions for this address
    for (const tx of transactions) {
      // Skip if we've already processed this transaction
      if (processedTxs.has(tx.hash)) {
        continue;
      }
      
      // Find outputs that were sent to our address
      const receivedOutputs = tx.outputs.filter(output => 
        output.addresses && 
        output.addresses.includes(address)
      );
      
      // Skip if no outputs were sent to our address
      if (receivedOutputs.length === 0) {
        continue;
      }
      
      // Calculate total BTC received in this transaction
      const totalReceived = receivedOutputs.reduce((sum, output) => sum + output.value, 0);
      
      // Convert from satoshis to BTC (1 BTC = 100,000,000 satoshis)
      const amountBtc = totalReceived / 100000000;
      
      // Find user ID for this address
      const userId = addressService.getUserIdForAddress(address, 'btc');
      
      if (userId) {
        console.log(`
📝 New BTC Deposit Found:
   User ID: ${userId}
   Amount: ${amountBtc} BTC
   To: ${address}
   Hash: ${tx.hash}
   Block: ${tx.block_height}
   Time: ${new Date(tx.received).toISOString()}
        `);
        
        const deposit = {
          userId,
          type: 'deposit',
          asset: 'btc',
          network: 'btc',
          amount: amountBtc,
          txHash: tx.hash,
          from: tx.inputs[0]?.addresses?.[0] || 'unknown', // First input address or "unknown"
          to: address,
          timestamp: new Date(tx.received).toISOString(),
          confirmations: tx.confirmations || 1
        };
        
        deposits.push(deposit);
        processedTxs.add(tx.hash);
      }
    }
    
    return deposits;
  } catch (error) {
    console.error(`Error checking BTC address ${address}:`, error.message);
    return [];
  }
}

/**
 * Check all BTC addresses for deposits
 * @returns {Promise<Array>} Array of all deposits found
 */
async function checkAllAddresses() {
  try {
    console.log('\n🔍 Checking BTC deposits...');
    
    const addresses = addressService.getAddresses().btc;
    console.log("btc address mf", addresses);
    if (addresses.length === 0) {
      console.log('No BTC addresses to monitor');
      return [];
    }
    
    const allDeposits = [];
    
    // Check each address individually
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      console.log(`Checking BTC address ${i+1}/${addresses.length}: ${address}`);
      
      const deposits = await checkAddress(address);
      allDeposits.push(...deposits);
      
      // Add a small delay between requests to avoid rate limits
      if (i < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
      }
    }
    
    if (allDeposits.length === 0) {
      console.log('😴 No new BTC deposits found');
    } else {
      console.log(`🎉 Found ${allDeposits.length} new BTC deposits!`);
    }
    
    return allDeposits;
  } catch (error) {
    console.error('Error checking BTC deposits:', error.message);
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
  getProcessedCount
};