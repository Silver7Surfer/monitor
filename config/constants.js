export const CONTRACTS = {
    BEP20: {
      USDT: '0x55d398326f99059ff775485246999027b3197955'
    }
  };
export const API_ENDPOINTS = {
    BTC: 'https://api.blockcypher.com/v1/btc/main',
    TRON: 'https://api.trongrid.io',
    BSC: 'https://api.bscscan.com/api',
    MAIN_SERVER: process.env.MAIN_SERVER_URL || 'http://localhost:3000'
};

export const CHECK_INTERVAL = 30000;