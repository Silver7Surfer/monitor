// src/routes/apiRoutes.js
import express from 'express';
import depositService from '../services/depositService.js';
import addressService from '../services/addressService.js';
import bep20Service from '../services/bep20Service.js';
import trc20Service from '../services/trc20Service.js';
import btcService from '../services/btcService.js';

const router = express.Router();

// Get monitor status
router.get('/status', (req, res) => {
  const status = depositService.getStatus();
  
  res.json({
    success: true,
    status
  });
});

// Force check for deposits
router.get('/check', async (req, res) => {
  try {
    // Refresh addresses first
    await addressService.fetchAddresses();
    
    // Check for deposits
    const deposits = await depositService.checkDeposits();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: deposits.length,
      deposits
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check a specific BEP20 address
router.get('/check-bep20/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const deposits = await bep20Service.checkAddress(address);
    
    res.json({
      success: true,
      network: 'bep20',
      address,
      count: deposits.length,
      deposits
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check a specific TRC20 address
router.get('/check-trc20/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const deposits = await trc20Service.checkAddress(address);
    
    res.json({
      success: true,
      network: 'trc20',
      address,
      count: deposits.length,
      deposits
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/check-btc/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const deposits = await btcService.checkAddress(address);
    
    res.json({
      success: true,
      network: 'btc',
      address,
      count: deposits.length,
      deposits
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generic address check (for backward compatibility)
router.get('/check-address/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const network = req.query.network || 'bep20'; // Default to BEP20
    
    let deposits = [];
    
    if (network === 'bep20') {
      deposits = await bep20Service.checkAddress(address);
    } else if (network === 'trc20') {
      deposits = await trc20Service.checkAddress(address);
    } else if (network === 'btc') {
      deposits = await btcService.checkAddress(address);
    } else {
      return res.status(400).json({
        success: false,
        error: `Unsupported network: ${network}`
      });
    }
    
    res.json({
      success: true,
      network,
      address,
      count: deposits.length,
      deposits
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Refresh addresses from main server
router.get('/refresh', async (req, res) => {
  try {
    const success = await addressService.fetchAddresses();
    const addresses = addressService.getAddresses();
    
    res.json({
      success,
      addresses: {
        bep20: addresses.bep20.length,
        trc20: addresses.trc20.length,
        btc: addresses.btc.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start monitoring
router.post('/start', (req, res) => {
  depositService.startMonitoring();
  res.json({
    success: true,
    message: 'Monitoring started'
  });
});

// Stop monitoring
router.post('/stop', (req, res) => {
  depositService.stopMonitoring();
  res.json({
    success: true,
    message: 'Monitoring stopped'
  });
});

export default router;