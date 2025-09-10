/**
 * DASBOR PROXY - Test Script
 * This script tests the basic functionality of the DASBOR PROXY application
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const TEST_ACCOUNT = {
  name: 'Test Account',
  protocol: 'trojan',
  port: 443,
  proxyIP: '1.1.1.1',
  proxyPort: '443',
  country: 'SG'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Helper function to log with colors
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Helper function to log test results
function logResult(testName, success, message = '') {
  if (success) {
    log(`✓ ${testName}`, colors.green);
  } else {
    log(`✗ ${testName}: ${message}`, colors.red);
  }
}

// Helper function to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
async function runTests() {
  log('\n=== DASBOR PROXY TEST SUITE ===\n', colors.blue);
  
  let createdAccountId = null;
  
  try {
    // Test 1: Check server status
    try {
      log('Testing server status API...', colors.yellow);
      const statusResponse = await axios.get(`${API_BASE_URL}/status`);
      logResult('Server status API', statusResponse.status === 200, 'Failed to get server status');
      log(`  Server uptime: ${statusResponse.data.uptime}`);
      log(`  Node.js version: ${statusResponse.data.nodejs}`);
    } catch (error) {
      logResult('Server status API', false, `Error: ${error.message}`);
    }
    
    // Test 2: Get proxies
    try {
      log('\nTesting proxies API...', colors.yellow);
      const proxiesResponse = await axios.get(`${API_BASE_URL}/proxies`);
      logResult('Proxies API', proxiesResponse.status === 200 && Array.isArray(proxiesResponse.data), 'Failed to get proxies');
      log(`  Found ${proxiesResponse.data.length} proxies`);
    } catch (error) {
      logResult('Proxies API', false, `Error: ${error.message}`);
    }
    
    // Test 3: Create account
    try {
      log('\nTesting account creation...', colors.yellow);
      const createResponse = await axios.post(`${API_BASE_URL}/accounts`, TEST_ACCOUNT);
      createdAccountId = createResponse.data.id;
      logResult('Account creation', createResponse.status === 201 && createResponse.data.id, 'Failed to create account');
      log(`  Created account ID: ${createResponse.data.id}`);
      log(`  UUID: ${createResponse.data.uuid}`);
      log(`  Config: ${createResponse.data.config.substring(0, 50)}...`);
    } catch (error) {
      logResult('Account creation', false, `Error: ${error.message}`);
    }
    
    // Test 4: Get accounts
    try {
      log('\nTesting accounts list API...', colors.yellow);
      const accountsResponse = await axios.get(`${API_BASE_URL}/accounts`);
      logResult('Accounts list API', accountsResponse.status === 200 && Array.isArray(accountsResponse.data), 'Failed to get accounts');
      log(`  Found ${accountsResponse.data.length} accounts`);
    } catch (error) {
      logResult('Accounts list API', false, `Error: ${error.message}`);
    }
    
    // Test 5: Get specific account
    if (createdAccountId) {
      try {
        log('\nTesting get account by ID...', colors.yellow);
        const accountResponse = await axios.get(`${API_BASE_URL}/accounts/${createdAccountId}`);
        logResult('Get account by ID', accountResponse.status === 200 && accountResponse.data.id === createdAccountId, 'Failed to get account');
        log(`  Account name: ${accountResponse.data.name}`);
      } catch (error) {
        logResult('Get account by ID', false, `Error: ${error.message}`);
      }
    }
    
    // Test 6: Update account
    if (createdAccountId) {
      try {
        log('\nTesting account update...', colors.yellow);
        const updateResponse = await axios.put(`${API_BASE_URL}/accounts/${createdAccountId}`, {
          name: 'Updated Test Account'
        });
        logResult('Account update', updateResponse.status === 200 && updateResponse.data.name === 'Updated Test Account', 'Failed to update account');
        log(`  Updated name: ${updateResponse.data.name}`);
      } catch (error) {
        logResult('Account update', false, `Error: ${error.message}`);
      }
    }
    
    // Test 7: Check proxy health
    try {
      log('\nTesting proxy health check...', colors.yellow);
      const healthResponse = await axios.get(`${API_BASE_URL}/check/1.1.1.1/443`);
      logResult('Proxy health check', healthResponse.status === 200, 'Failed to check proxy health');
      log(`  Proxy active: ${healthResponse.data.proxyip}`);
      log(`  Delay: ${healthResponse.data.delay}ms`);
    } catch (error) {
      logResult('Proxy health check', false, `Error: ${error.message}`);
    }
    
    // Test 8: Delete account
    if (createdAccountId) {
      try {
        log('\nTesting account deletion...', colors.yellow);
        const deleteResponse = await axios.delete(`${API_BASE_URL}/accounts/${createdAccountId}`);
        logResult('Account deletion', deleteResponse.status === 200, 'Failed to delete account');
        
        // Verify deletion
        try {
          await axios.get(`${API_BASE_URL}/accounts/${createdAccountId}`);
          logResult('Verify deletion', false, 'Account still exists after deletion');
        } catch (error) {
          if (error.response && error.response.status === 404) {
            logResult('Verify deletion', true);
          } else {
            logResult('Verify deletion', false, `Unexpected error: ${error.message}`);
          }
        }
      } catch (error) {
        logResult('Account deletion', false, `Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    log(`\nTest suite error: ${error.message}`, colors.red);
  }
  
  log('\n=== TEST SUITE COMPLETED ===\n', colors.blue);
}

// Check if server is running before starting tests
async function checkServerAndRunTests() {
  try {
    log('Checking if server is running...', colors.yellow);
    await axios.get(`${API_BASE_URL}/status`);
    log('Server is running. Starting tests...', colors.green);
    await runTests();
  } catch (error) {
    log('Server is not running. Please start the server before running tests.', colors.red);
    log(`Error: ${error.message}`, colors.red);
  }
}

// Run the tests
checkServerAndRunTests();