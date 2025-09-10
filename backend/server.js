const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const bodyParser = require('body-parser');
const config = require('./config');

const app = express();
const PORT = config.server.port;

// Middleware
app.use(cors(config.security.cors));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Configuration
const CONFIG_DIR = config.storage.configDir;
const ACCOUNTS_FILE = config.storage.accountsFile;

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Ensure accounts file exists
if (!fs.existsSync(ACCOUNTS_FILE)) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ accounts: [] }), 'utf8');
}

// Get worker configuration
const workerConfig = config.worker;

// Helper function to read accounts
function getAccounts() {
  try {
    const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    return JSON.parse(data).accounts;
  } catch (error) {
    console.error("Error reading accounts file:", error);
    return [];
  }
}

// Helper function to save accounts
function saveAccounts(accounts) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ accounts }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error("Error saving accounts file:", error);
    return false;
  }
}

// Helper function to generate VLESS configuration
function generateVlessConfig(account, domain) {
  const { uuid, name, port, protocol } = account;
  const isSecure = port === 443;
  
  // Base URL construction
  let url = new URL(`${protocol}://${domain}`);
  url.username = uuid;
  url.port = port.toString();
  
  // Set parameters based on protocol
  url.searchParams.set("encryption", "none");
  url.searchParams.set("type", "ws");
  url.searchParams.set("host", domain);
  url.searchParams.set("path", `/${account.proxyIP}-${account.proxyPort}`);
  url.searchParams.set("security", isSecure ? "tls" : "none");
  url.searchParams.set("sni", isSecure ? domain : "");
  
  // Special handling for Shadowsocks
  if (protocol === "ss") {
    url.username = Buffer.from(`none:${uuid}`).toString('base64');
    url.searchParams.set(
      "plugin",
      `v2ray-plugin${isSecure ? ";tls" : ""};mux=0;mode=websocket;path=/${account.proxyIP}-${account.proxyPort};host=${domain}`
    );
  }
  
  // Add hash for identification
  url.hash = `${name} ${account.country} WS ${isSecure ? "TLS" : "NTLS"}`;
  
  return url.toString();
}

// Helper function to fetch proxies from the source
async function fetchProxiesFromSource() {
  try {
    const proxyListUrl = config.proxy.proxyListUrl;
    console.log(`Fetching proxies from: ${proxyListUrl}`);
    
    const response = await axios.get(proxyListUrl);
    if (response.status !== 200) {
      throw new Error(`Failed to fetch proxy list, status: ${response.status}`);
    }
    
    const proxyString = response.data.split("\n").filter(Boolean);
    const proxies = proxyString
      .map((entry) => {
        const [proxyIP, proxyPort, country, org] = entry.split(",");
        return {
          proxyIP: proxyIP || "Unknown",
          proxyPort: proxyPort || "Unknown",
          country: country || "Unknown",
          org: org || "Unknown Org",
        };
      })
      .filter(Boolean);
    
    // Cache the proxies
    const PROXIES_FILE = config.storage.proxiesFile;
    fs.writeFileSync(PROXIES_FILE, JSON.stringify({ proxies, lastUpdated: new Date().toISOString() }), 'utf8');
    
    return proxies;
  } catch (error) {
    console.error("Error fetching proxies:", error);
    
    // Try to load from cache if available
    const PROXIES_FILE = config.storage.proxiesFile;
    if (fs.existsSync(PROXIES_FILE)) {
      try {
        const data = fs.readFileSync(PROXIES_FILE, 'utf8');
        const { proxies } = JSON.parse(data);
        console.log(`Loaded ${proxies.length} proxies from cache`);
        return proxies;
      } catch (cacheError) {
        console.error("Error loading proxies from cache:", cacheError);
      }
    }
    
    // Return sample proxies as fallback
    return [
      { proxyIP: '1.1.1.1', proxyPort: '443', country: 'SG', org: 'Cloudflare Inc.' },
      { proxyIP: '8.8.8.8', proxyPort: '443', country: 'US', org: 'Google LLC' },
      { proxyIP: '103.152.118.164', proxyPort: '443', country: 'ID', org: 'PT Biznet Gio Nusantara' }
    ];
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// API endpoint to get all accounts
app.get('/api/accounts', (req, res) => {
  const accounts = getAccounts();
  res.json(accounts);
});

// API endpoint to create a new account
app.post('/api/accounts', async (req, res) => {
  try {
    const { name, protocol, port, proxyIP, proxyPort, country } = req.body;
    
    if (!name || !protocol || !port || !proxyIP || !proxyPort) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Generate UUID for the account
    const uuid = uuidv4();
    
    // Create new account
    const newAccount = {
      id: uuidv4(),
      uuid,
      name,
      protocol,
      port: parseInt(port),
      proxyIP,
      proxyPort,
      country: country || 'ID',
      createdAt: new Date().toISOString()
    };
    
    // Generate configuration
    const domain = `${workerConfig.serviceName}.${workerConfig.rootDomain}`;
    newAccount.config = generateVlessConfig(newAccount, domain);
    
    // Save account
    const accounts = getAccounts();
    accounts.push(newAccount);
    saveAccounts(accounts);
    
    res.status(201).json(newAccount);
  } catch (error) {
    console.error("Error creating account:", error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// API endpoint to delete an account
app.delete('/api/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    let accounts = getAccounts();
    
    const initialLength = accounts.length;
    accounts = accounts.filter(account => account.id !== id);
    
    if (accounts.length === initialLength) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    saveAccounts(accounts);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// API endpoint to get server status
app.get('/api/status', (req, res) => {
  exec('uptime', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: 'Failed to get server status' });
    }
    
    const uptimeOutput = stdout.trim();
    
    exec('free -m', (error, memoryOutput, stderr) => {
      if (error) {
        return res.status(500).json({ 
          uptime: uptimeOutput,
          memory: 'Unable to retrieve memory information'
        });
      }
      
      // Get Node.js version
      exec('node -v', (error, nodeVersion, stderr) => {
        const version = nodeVersion ? nodeVersion.trim() : 'Unknown';
        
        res.json({
          uptime: uptimeOutput,
          memory: memoryOutput.trim(),
          nodejs: version,
          config: workerConfig,
          app: config.app
        });
      });
    });
  });
});

// API endpoint to get proxy list
app.get('/api/proxies', async (req, res) => {
  try {
    const proxies = await fetchProxiesFromSource();
    res.json(proxies);
  } catch (error) {
    console.error("Error fetching proxies:", error);
    res.status(500).json({ error: 'Failed to fetch proxy list' });
  }
});

// API endpoint to get proxy list by country
app.get('/api/proxies/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const proxies = await fetchProxiesFromSource();
    
    const filteredProxies = proxies.filter(proxy => 
      proxy.country.toLowerCase() === country.toLowerCase()
    );
    
    res.json(filteredProxies);
  } catch (error) {
    console.error(`Error fetching proxies for country ${req.params.country}:`, error);
    res.status(500).json({ error: 'Failed to fetch proxy list' });
  }
});

// API endpoint to check proxy health
app.get('/api/check/:ip/:port', async (req, res) => {
  try {
    const { ip, port } = req.params;
    
    // This would typically call the worker's check endpoint
    // For now, we'll simulate a response
    const delay = Math.floor(Math.random() * 200) + 50; // Random delay between 50-250ms
    const isActive = Math.random() > 0.2; // 80% chance of being active
    
    res.json({
      proxyip: isActive,
      delay: delay,
      colo: ['SIN', 'HKG', 'NRT', 'LAX'][Math.floor(Math.random() * 4)],
      ip: ip,
      port: port
    });
  } catch (error) {
    console.error("Error checking proxy health:", error);
    res.status(500).json({ error: 'Failed to check proxy health' });
  }
});

// API endpoint to get account by ID
app.get('/api/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const accounts = getAccounts();
    const account = accounts.find(acc => acc.id === id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(account);
  } catch (error) {
    console.error("Error getting account:", error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// API endpoint to update an account
app.put('/api/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    let accounts = getAccounts();
    const accountIndex = accounts.findIndex(acc => acc.id === id);
    
    if (accountIndex === -1) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Update account
    accounts[accountIndex].name = name;
    
    // Regenerate configuration if needed
    const domain = `${workerConfig.serviceName}.${workerConfig.rootDomain}`;
    accounts[accountIndex].config = generateVlessConfig(accounts[accountIndex], domain);
    
    saveAccounts(accounts);
    res.json(accounts[accountIndex]);
  } catch (error) {
    console.error("Error updating account:", error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Start server
app.listen(PORT, config.server.host, () => {
  console.log(`
  ┌───────────────────────────────────────────────────┐
  │                                                   │
  │   DASBOR PROXY Server                             │
  │   Version: ${config.app.version}                          │
  │   Environment: ${config.app.environment}                │
  │   Running on: http://${config.server.host}:${PORT}           │
  │                                                   │
  └───────────────────────────────────────────────────┘
  `);
});