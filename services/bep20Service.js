// src/services/bep20Service.js
import axios from 'axios';
import 'dotenv/config';
import WebSocket from 'ws';
import addressService from './addressService.js';

// Store processed transactions to avoid duplicates
const processedTxs = new Set();

// USDT contract address on BSC
const USDT_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';

// Delay between API requests
const REQUEST_DELAY = 200;

// WebSocket connection
let wsConnection = null;
let wsReconnectTimeout = null;
const WS_RECONNECT_DELAY = 5000;

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
 * Process a BEP20 transaction from real-time data
 * @param {Object} tx Transaction data
 * @returns {Array} Array of deposit objects
 */
function processRealTimeTransaction(tx) {
  try {
    // Only process new transactions
    if (processedTxs.has(tx.hash)) {
      return [];
    }
    
    const deposits = [];
    
    // Check if this is a BEP20 USDT transaction
    if (tx.contractAddress && 
        tx.contractAddress.toLowerCase() === USDT_CONTRACT.toLowerCase()) {
      
      // Find user ID for this address
      const userId = addressService.getUserIdForAddress(tx.to, 'bep20');
      
      if (userId) {
        // Convert amount from wei to USDT (18 decimals)
        const amount = tx.value / 1e18;
        
        console.log(`
📝 New BEP20 Deposit Found (Real-time):
   User ID: ${userId}
   Amount: ${amount} USDT
   To: ${tx.to}
   From: ${tx.from}
   Hash: ${tx.hash}
   Time: ${new Date().toISOString()}
        `);
        
        const deposit = {
          userId,
          type: 'deposit',
          asset: 'usdt',
          network: 'bep20',
          amount,
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          timestamp: new Date().toISOString(),
          confirmations: 1  // Real-time notification
        };
        
        deposits.push(deposit);
        processedTxs.add(tx.hash);
      }
    }
    
    return deposits;
  } catch (error) {
    console.error('Error processing real-time BEP20 transaction:', error.message);
    return [];
  }
}

/**
 * Start WebSocket connection for real-time monitoring
 * Uses BSC WebSocket API or alternatives like Moralis
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
    
    // Check whether to use Moralis WebSocket API
    if (process.env.MORALIS_API_KEY) {
      console.log('Starting BEP20 WebSocket monitoring with Moralis...');
      
      // Connect to Moralis WebSocket
      const wsUrl = 'wss://stream.moralis.io/bsc';
      wsConnection = new WebSocket(wsUrl);
      
      wsConnection.on('open', () => {
        console.log('BEP20 WebSocket connection established');
        
        // Get all addresses to monitor
        const addresses = addressService.getAddresses().bep20;
        
        if (addresses.length > 0) {
          // Subscribe to token transfers for these addresses
          const subscription = {
            id: "moralis-bep20-sub",
            jsonrpc: "2.0",
            method: "subscribe",
            params: {
              apiKey: process.env.MORALIS_API_KEY,
              type: "erc20transfers",
              address: addresses,
              contract: [USDT_CONTRACT]
            }
          };
          
          wsConnection.send(JSON.stringify(subscription));
        }
      });
      
      wsConnection.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          
          // Process token transfer events
          if (event && event.data) {
            const tx = {
              hash: event.data.transactionHash,
              from: event.data.from,
              to: event.data.to,
              contractAddress: event.data.token,
              value: event.data.value
            };
            
            // Only process if this is to one of our addresses
            const addresses = addressService.getAddresses().bep20;
            if (addresses.includes(tx.to.toLowerCase())) {
              const deposits = processRealTimeTransaction(tx);
              
              // If deposits found, they will be processed by the main service
            }
          }
        } catch (error) {
          console.error('Error processing BEP20 WebSocket message:', error.message);
        }
      });
      
      wsConnection.on('error', (error) => {
        console.error('BEP20 WebSocket error:', error.message);
        reconnectWebSocket();
      });
      
      wsConnection.on('close', () => {
        console.log('BEP20 WebSocket connection closed');
        reconnectWebSocket();
      });
    } 
    // Alternative: Use BSC-Scan WebSocket if available
    else if (process.env.BSCSCAN_WS_KEY) {
      console.log('Starting BEP20 WebSocket monitoring with BSCScan...');
      
      const wsUrl = `wss://api.bscscan.com/ws/${process.env.BSCSCAN_WS_KEY}`;
      wsConnection = new WebSocket(wsUrl);
      
      wsConnection.on('open', () => {
        console.log('BEP20 WebSocket connection established');
        
        // Get all addresses to monitor
        const addresses = addressService.getAddresses().bep20;
        
        if (addresses.length > 0) {
          // Subscribe to token transfers
          addresses.forEach(address => {
            const subscription = {
              type: "tokentx",
              address: address,
              contract: USDT_CONTRACT
            };
            
            wsConnection.send(JSON.stringify(subscription));
          });
        }
      });
      
      // Processing similar to Moralis
      wsConnection.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          
          if (event && event.hash) {
            const deposits = processRealTimeTransaction(event);
            // Deposits would be processed by main service
          }
        } catch (error) {
          console.error('Error processing BEP20 WebSocket message:', error.message);
        }
      });
      
      wsConnection.on('error', reconnectWebSocket);
      wsConnection.on('close', reconnectWebSocket);
    } 
    else {
      console.log('No WebSocket API key available for BEP20, using polling only');
    }
  } catch (error) {
    console.error('Failed to start BEP20 WebSocket monitoring:', error.message);
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
    console.log('Attempting to reconnect BEP20 WebSocket...');
    startWebSocketMonitoring();
  }, WS_RECONNECT_DELAY);
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
 * Initialize the BEP20 monitoring service
 */
function init() {
  // Start WebSocket monitoring for real-time updates
  startWebSocketMonitoring();
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
  CONTRACT: USDT_CONTRACT,
  init
};