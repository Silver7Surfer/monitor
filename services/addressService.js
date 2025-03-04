import axios from 'axios';
import 'dotenv/config';

// Store addresses and user details
const state = {
  addresses: {
    bep20: [],
    trc20: [],
    btc: []
  },
  addressDetails: []
};

const SECRET_KEY = process.env.MONITOR_SECRET_KEY;

/**
 * Fetch all wallet addresses from the main server
 * @returns {Promise<boolean>} Success status
 */
async function fetchAddresses() {
  try {
    console.log('\n📋 Fetching wallet addresses from main server...');
    
    const response = await axios.get(`${process.env.MAIN_SERVER_URL}/api/wallet/admin/addresses`, {
      headers: { 'Authorization': `Bearer ${SECRET_KEY}` }
    });
    
    if (!response.data.success) {
      console.error('Failed to fetch addresses:', response.data);
      return false;
    }
    
    state.addresses = {
      bep20: response.data.data.grouped.bep20Addresses,
      trc20: response.data.data.grouped.trc20Addresses,
      btc: response.data.data.grouped.btcAddresses
    };
    
    state.addressDetails = response.data.data.detailed;
    
    console.log(`✅ Fetched ${state.addresses.bep20.length} BEP20 addresses`);
    console.log(`✅ Fetched ${state.addresses.trc20.length} TRC20 addresses`);
    console.log(`✅ Fetched ${state.addresses.btc.length} BTC addresses`);
    
    return true;
  } catch (error) {
    console.error('Error fetching addresses:', error.message);
    return false;
  }
}

/**
 * Get user ID for a specific address
 * @param {string} address The wallet address
 * @param {string} network The network type (bep20, trc20, btc)
 * @returns {string|null} User ID or null if not found
 */
function getUserIdForAddress(address, network) {
  const normalizedAddress = address.toLowerCase();
  
  const wallet = state.addressDetails.find(w => {
    if (network === 'bep20') {
      return w.addresses.bep20.toLowerCase() === normalizedAddress;
    } else if (network === 'trc20') {
      return w.addresses.trc20.toLowerCase() === normalizedAddress;
    } else if (network === 'btc') {
      return w.addresses.btc.toLowerCase() === normalizedAddress;
    }
    return false;
  });
  
  return wallet ? wallet.userId : null;
}

export default {
  fetchAddresses,
  getUserIdForAddress,
  getAddresses: () => state.addresses
};