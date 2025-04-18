// src/services/btcService.js
import axios from 'axios';
import 'dotenv/config';
import WebSocket from 'ws';
import addressService from './addressService.js';
import depositService from './depositService.js';

// Store processed transactions to avoid duplicates
const processedTxs = new Set();

// Delay between API requests
const REQUEST_DELAY = 200;

// WebSocket connection
let wsConnection = null;
let wsReconnectTimeout = null;
const WS_RECONNECT_DELAY = 5000;


async function getBtcPrice() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    return response.data.bitcoin.usd;
  } catch (error) {
    console.error('Error fetching BTC price:', error.message);
    return null;
  }
}



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
    const btcPrice = await getBtcPrice();
    
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
      const amountBt = totalReceived / 100000000;

      const amountBtc = amountBt * btcPrice;
      
      // Find user ID for this address
      const userId = addressService.getUserIdForAddress(address, 'btc');
      
      if (userId) {
        console.log(`
📝 New BTC Deposit Found:
   User ID: ${userId}
   Amount: ${amountBt} BTC (~$${amountBtc.toFixed(2)})
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
 * Process a BTC transaction from real-time data
 * @param {Object} tx Transaction data
 * @returns {Array} Array of deposit objects
 */
function processRealTimeTransaction(tx) {
  try {
    // Skip if we've already processed this transaction
    if (processedTxs.has(tx.hash)) {
      return [];
    }
    
    const deposits = [];
    const addresses = addressService.getAddresses().btc;
    
    // Find outputs to our addresses
    if (tx.out && Array.isArray(tx.out)) {
      for (const output of tx.out) {
        const outputAddress = output.addr;
        
        // Check if this output is to one of our addresses
        if (outputAddress && addresses.includes(outputAddress)) {
          // Find user ID for this address
          const userId = addressService.getUserIdForAddress(outputAddress, 'btc');
          
          if (userId) {
            // Convert from satoshis to BTC
            const amountBt = output.value / 100000000;
            const amountBtc = amountBt * btcPrice;
            
            console.log(`
📝 New BTC Deposit Found (Real-time):
   User ID: ${userId}
   Amount: ${amountBt} BTC (~$${amountBtc.toFixed(2)})
   To: ${outputAddress}
   Hash: ${tx.hash}
   Time: ${new Date().toISOString()}
            `);
            
            const deposit = {
              userId,
              type: 'deposit',
              asset: 'btc',
              network: 'btc',
              amount: amountBtc,
              txHash: tx.hash,
              from: tx.inputs && tx.inputs[0]?.prev_out?.addr || 'unknown',
              to: outputAddress,
              timestamp: new Date().toISOString(),
              confirmations: 0  // Real-time notification, not confirmed yet
            };
            
            deposits.push(deposit);
          }
        }
      }
    }
    
    // Mark transaction as processed if we found deposits
    if (deposits.length > 0) {
      processedTxs.add(tx.hash);
    }
    
    return deposits;
  } catch (error) {
    console.error('Error processing real-time BTC transaction:', error.message);
    return [];
  }
}

/**
 * Start WebSocket connection for real-time monitoring
 */
function startWebSocketMonitoring() {
  try {
    // Close existing connection if any
    if (wsConnection) {
      try {
        wsConnection.terminate();
      } catch (error) {
        // Ignore errors on close
      }
    }
    
    // Clear any pending reconnect
    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = null;
    }
    
    // Connect to blockchain.info WebSocket
    wsConnection = new WebSocket('wss://ws.blockchain.info/inv');
    
    wsConnection.on('open', () => {
      console.log('BTC WebSocket connection established');
      
      // Subscribe to address notifications for all monitored addresses
      const addresses = addressService.getAddresses().btc;
      
      if (addresses.length > 0) {
        console.log(`Subscribing to ${addresses.length} BTC addresses via WebSocket`);
        
        // First subscribe to new transactions
        wsConnection.send(JSON.stringify({
          "op": "unconfirmed_sub"
        }));
        
        // Then subscribe to each address
        addresses.forEach(address => {
          wsConnection.send(JSON.stringify({
            "op": "addr_sub",
            "addr": address
          }));
        });
      }
    });
    
    wsConnection.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.op === 'utx' || message.op === 'tx') {
          const tx = message.x;
          console.log(`BTC WebSocket notification received for transaction: ${tx.hash}`);
          
          const deposits = processRealTimeTransaction(tx);
          
          // If deposits found, send them to the main service for processing
          if (deposits.length > 0) {
            await depositService.processDeposits(deposits);
          }
        }
      } catch (error) {
        console.error('Error processing BTC WebSocket message:', error.message);
      }
    });
    
    wsConnection.on('error', (error) => {
      console.error('BTC WebSocket error:', error.message);
      reconnectWebSocket();
    });
    
    wsConnection.on('close', () => {
      console.log('BTC WebSocket connection closed');
      reconnectWebSocket();
    });
  } catch (error) {
    console.error('Failed to start BTC WebSocket monitoring:', error.message);
    reconnectWebSocket();
  }
}

/**
 * Reconnect WebSocket after a delay
 */
function reconnectWebSocket() {
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
  }
  
  wsReconnectTimeout = setTimeout(() => {
    console.log('Attempting to reconnect BTC WebSocket...');
    startWebSocketMonitoring();
  }, WS_RECONNECT_DELAY);
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
 * Initialize the BTC monitoring service
 * @param {Array} addresses BTC addresses to monitor (optional)
 */
function init(addresses) {
  // Start WebSocket monitoring
  startWebSocketMonitoring();
  
  console.log('BTC monitoring service initialized with WebSocket');
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
  init
};