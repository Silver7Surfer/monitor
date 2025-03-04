import express from 'express';
import 'dotenv/config';
import apiRoutes from './routes/apiRoutes.js';
import depositService from './services/depositService.js';
import bep20Service from './services/bep20Service.js';
import trc20Service from './services/trc20Service.js';

// Initialize express
const app = express();
app.use(express.json());

// API routes
app.use('/api', apiRoutes);

// Get port from env
const PORT = process.env.PORT || 4000;

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Deposit Monitor Started
📍 Port: ${PORT}
🔗 Connected to: ${process.env.MAIN_SERVER_URL}
💰 Supported contracts:
   - USDT (BEP20): ${bep20Service.CONTRACT}
   - USDT (TRC20): ${trc20Service.CONTRACT}
   - BTC
⏰ Checking every ${parseInt(process.env.CHECK_INTERVAL || 30000) / 1000} seconds
  `);
  
  // Start monitoring
  depositService.startMonitoring();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  depositService.stopMonitoring();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  depositService.stopMonitoring();
  process.exit(0);
});