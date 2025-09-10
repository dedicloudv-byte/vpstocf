/**
 * DASBOR PROXY Configuration
 * This file contains configuration settings for the DASBOR PROXY application
 */

const path = require('path');
const fs = require('fs');

// Try to read worker.js to extract configuration
let workerConfig = {
  rootDomain: "foolvpn.me",
  serviceName: "nautica",
  protocols: ["trojan", "vless", "ss"],
  ports: [443, 80]
};

try {
  const workerPath = path.join(__dirname, '../_worker.js');
  if (fs.existsSync(workerPath)) {
    const workerContent = fs.readFileSync(workerPath, 'utf8');
    
    // Extract rootDomain
    const rootDomainMatch = workerContent.match(/const rootDomain = "([^"]+)"/);
    if (rootDomainMatch) workerConfig.rootDomain = rootDomainMatch[1];
    
    // Extract serviceName
    const serviceNameMatch = workerContent.match(/const serviceName = "([^"]+)"/);
    if (serviceNameMatch) workerConfig.serviceName = serviceNameMatch[1];
    
    console.log("Extracted configuration from worker.js:", workerConfig);
  } else {
    console.warn("_worker.js file not found. Using default configuration.");
  }
} catch (error) {
  console.error("Error reading worker.js:", error);
}

// Configuration object
const config = {
  // Server settings
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
  },
  
  // Application settings
  app: {
    name: 'DASBOR PROXY',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  
  // Storage settings
  storage: {
    configDir: path.join(__dirname, 'config'),
    accountsFile: path.join(__dirname, 'config', 'accounts.json'),
    proxiesFile: path.join(__dirname, 'config', 'proxies.json'),
  },
  
  // Worker configuration
  worker: workerConfig,
  
  // Proxy settings
  proxy: {
    // Default proxy list URL if not specified in worker.js
    proxyListUrl: process.env.PROXY_LIST_URL || 'https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/proxyList.txt',
    // How often to refresh the proxy list (in milliseconds)
    refreshInterval: 3600000, // 1 hour
  },
  
  // Security settings
  security: {
    // CORS settings
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    },
    // Rate limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  },
};

module.exports = config;
