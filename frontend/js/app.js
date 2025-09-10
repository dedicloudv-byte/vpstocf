// DASBOR PROXY - Frontend Application Logic

// API Base URL - Change this to match your server configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Global state
let currentAccounts = [];
let availableProxies = [];
let selectedAccount = null;

// DOM Elements
const accountsContainer = document.getElementById('accounts-container');
const proxiesTableBody = document.getElementById('proxies-table-body');
const proxySelect = document.getElementById('account-proxy');
const createAccountForm = document.getElementById('create-account-form');
const createAccountBtn = document.getElementById('create-account-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const copyConfigBtn = document.getElementById('copy-config-btn');
const notificationToast = document.getElementById('notification-toast');
const toastTitle = document.getElementById('toast-title');
const toastMessage = document.getElementById('toast-message');

// Bootstrap Toast instance
const toast = new bootstrap.Toast(notificationToast);

// Navigation elements
const navAccounts = document.getElementById('nav-accounts');
const navProxies = document.getElementById('nav-proxies');
const navStatus = document.getElementById('nav-status');
const accountsSection = document.getElementById('accounts-section');
const proxiesSection = document.getElementById('proxies-section');
const statusSection = document.getElementById('status-section');

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Load initial data
    fetchAccounts();
    fetchProxies();
    
    // Set up event listeners
    setupEventListeners();
});

// Set up all event listeners
function setupEventListeners() {
    // Navigation
    navAccounts.addEventListener('click', (e) => {
        e.preventDefault();
        showSection('accounts');
    });
    
    navProxies.addEventListener('click', (e) => {
        e.preventDefault();
        showSection('proxies');
    });
    
    navStatus.addEventListener('click', (e) => {
        e.preventDefault();
        showSection('status');
        fetchServerStatus();
    });
    
    // Create account form
    createAccountBtn.addEventListener('click', handleCreateAccount);
    
    // Delete account button
    deleteAccountBtn.addEventListener('click', handleDeleteAccount);
    
    // Copy configuration button
    copyConfigBtn.addEventListener('click', () => {
        const configInput = document.getElementById('account-config');
        configInput.select();
        document.execCommand('copy');
        
        // Visual feedback
        copyConfigBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
        copyConfigBtn.classList.add('copy-success');
        
        setTimeout(() => {
            copyConfigBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
            copyConfigBtn.classList.remove('copy-success');
        }, 2000);
        
        showNotification('Success', 'Configuration copied to clipboard');
    });
}

// Show the selected section and hide others
function showSection(section) {
    // Update navigation active state
    [navAccounts, navProxies, navStatus].forEach(nav => {
        nav.classList.remove('active');
    });
    
    // Hide all sections
    accountsSection.style.display = 'none';
    proxiesSection.style.display = 'none';
    statusSection.style.display = 'none';
    
    // Show selected section and update nav
    switch (section) {
        case 'accounts':
            accountsSection.style.display = 'block';
            navAccounts.classList.add('active');
            break;
        case 'proxies':
            proxiesSection.style.display = 'block';
            navProxies.classList.add('active');
            break;
        case 'status':
            statusSection.style.display = 'block';
            navStatus.classList.add('active');
            break;
    }
}

// Fetch all accounts from the API
async function fetchAccounts() {
    try {
        const response = await fetch(`${API_BASE_URL}/accounts`);
        if (!response.ok) throw new Error('Failed to fetch accounts');
        
        const accounts = await response.json();
        currentAccounts = accounts;
        renderAccounts(accounts);
    } catch (error) {
        console.error('Error fetching accounts:', error);
        showNotification('Error', 'Failed to load accounts');
        
        // Show error state in the accounts container
        accountsContainer.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-exclamation-triangle text-danger" style="font-size: 3rem;"></i>
                <p class="mt-3">Failed to load accounts. Please try again.</p>
                <button class="btn btn-primary mt-2" onclick="fetchAccounts()">Retry</button>
            </div>
        `;
    }
}

// Render accounts to the UI
function renderAccounts(accounts) {
    if (accounts.length === 0) {
        accountsContainer.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-person-x" style="font-size: 3rem;"></i>
                <p class="mt-3">No accounts found. Create your first account to get started.</p>
                <button class="btn btn-primary mt-2" data-bs-toggle="modal" data-bs-target="#createAccountModal">
                    <i class="bi bi-plus-circle me-2"></i>Create Account
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    accounts.forEach(account => {
        const protocolClass = getProtocolClass(account.protocol);
        const countryFlag = getFlagEmoji(account.country);
        
        html += `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card account-card shadow-sm">
                    <div class="card-header bg-${protocolClass}">
                        <div class="country-flag">
                            <img src="https://hatscripts.github.io/circle-flags/flags/${account.country.toLowerCase()}.svg" 
                                 alt="${account.country}" width="100%">
                        </div>
                        <span class="protocol-badge badge bg-light text-dark">
                            ${account.protocol.toUpperCase()} - Port ${account.port}
                        </span>
                        <h5 class="card-title text-white text-center mb-0">${account.name}</h5>
                    </div>
                    <div class="card-body">
                        <div class="details-row">
                            <span class="details-label">Proxy:</span>
                            <span class="details-value">${account.proxyIP}:${account.proxyPort}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">Created:</span>
                            <span class="details-value">${formatDate(account.createdAt)}</span>
                        </div>
                        <div class="mt-3 d-grid">
                            <button class="btn btn-primary" onclick="showAccountDetails('${account.id}')">
                                <i class="bi bi-eye me-2"></i>View Details
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    accountsContainer.innerHTML = html;
}

// Fetch available proxies
async function fetchProxies() {
    try {
        const response = await fetch(`${API_BASE_URL}/proxies`);
        if (!response.ok) throw new Error('Failed to fetch proxies');
        
        const proxies = await response.json();
        availableProxies = proxies;
        
        // Update proxy select in the create account form
        updateProxySelect(proxies);
        
        // Update proxies table if visible
        if (proxiesSection.style.display !== 'none') {
            renderProxiesTable(proxies);
        }
    } catch (error) {
        console.error('Error fetching proxies:', error);
        showNotification('Error', 'Failed to load proxies');
    }
}

// Update the proxy select dropdown
function updateProxySelect(proxies) {
    let options = '';
    proxies.forEach(proxy => {
        const flag = getFlagEmoji(proxy.country);
        options += `<option value="${proxy.proxyIP}:${proxy.proxyPort}" data-country="${proxy.country}">
            ${proxy.proxyIP}:${proxy.proxyPort} - ${flag} ${proxy.org}
        </option>`;
    });
    
    proxySelect.innerHTML = options || '<option value="">No proxies available</option>';
}

// Render proxies to the table
function renderProxiesTable(proxies) {
    if (proxies.length === 0) {
        proxiesTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">No proxies available</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    proxies.forEach(proxy => {
        const flag = getFlagEmoji(proxy.country);
        html += `
            <tr>
                <td>${proxy.proxyIP}</td>
                <td>${proxy.proxyPort}</td>
                <td>
                    <img src="https://hatscripts.github.io/circle-flags/flags/${proxy.country.toLowerCase()}.svg" 
                         alt="${proxy.country}" class="flag-icon"> ${proxy.country}
                </td>
                <td>${proxy.org}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="useProxyForNewAccount('${proxy.proxyIP}:${proxy.proxyPort}')">
                        <i class="bi bi-plus-circle me-1"></i>Use
                    </button>
                </td>
            </tr>
        `;
    });
    
    proxiesTableBody.innerHTML = html;
}

// Use a proxy for a new account
function useProxyForNewAccount(proxyString) {
    // Select the proxy in the dropdown
    proxySelect.value = proxyString;
    
    // Show the create account modal
    const createAccountModal = new bootstrap.Modal(document.getElementById('createAccountModal'));
    createAccountModal.show();
}

// Show account details in the modal
function showAccountDetails(accountId) {
    const account = currentAccounts.find(acc => acc.id === accountId);
    if (!account) return;
    
    selectedAccount = account;
    
    // Update modal content
    document.getElementById('account-details-title').textContent = account.name;
    document.getElementById('account-config').value = account.config;
    document.getElementById('account-uuid').textContent = account.uuid;
    document.getElementById('account-created').textContent = formatDate(account.createdAt);
    
    // Generate QR code
    const qrcodeContainer = document.getElementById('account-qrcode');
    qrcodeContainer.innerHTML = '';
    QRCode.toCanvas(qrcodeContainer, account.config, {
        width: 200,
        margin: 1,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    }, function (error) {
        if (error) console.error('Error generating QR code:', error);
    });
    
    // Show the modal
    const accountDetailsModal = new bootstrap.Modal(document.getElementById('accountDetailsModal'));
    accountDetailsModal.show();
}

// Handle create account form submission
async function handleCreateAccount() {
    try {
        // Get form values
        const name = document.getElementById('account-name').value;
        const protocol = document.getElementById('account-protocol').value;
        const port = document.getElementById('account-port').value;
        const proxyValue = document.getElementById('account-proxy').value;
        
        if (!name || !protocol || !port || !proxyValue) {
            showNotification('Error', 'Please fill in all fields');
            return;
        }
        
        const [proxyIP, proxyPort] = proxyValue.split(':');
        const country = document.querySelector(`#account-proxy option[value="${proxyValue}"]`)?.dataset.country || 'XX';
        
        // Create account data
        const accountData = {
            name,
            protocol,
            port,
            proxyIP,
            proxyPort,
            country
        };
        
        // Send request to create account
        const response = await fetch(`${API_BASE_URL}/accounts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(accountData)
        });
        
        if (!response.ok) throw new Error('Failed to create account');
        
        const newAccount = await response.json();
        
        // Add to current accounts and refresh UI
        currentAccounts.push(newAccount);
        renderAccounts(currentAccounts);
        
        // Close modal and show success notification
        const modal = bootstrap.Modal.getInstance(document.getElementById('createAccountModal'));
        modal.hide();
        
        // Reset form
        document.getElementById('account-name').value = '';
        
        showNotification('Success', 'Account created successfully');
    } catch (error) {
        console.error('Error creating account:', error);
        showNotification('Error', 'Failed to create account');
    }
}

// Handle delete account
async function handleDeleteAccount() {
    if (!selectedAccount) return;
    
    if (!confirm(`Are you sure you want to delete the account "${selectedAccount.name}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/accounts/${selectedAccount.id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete account');
        
        // Remove from current accounts and refresh UI
        currentAccounts = currentAccounts.filter(acc => acc.id !== selectedAccount.id);
        renderAccounts(currentAccounts);
        
        // Close modal and show success notification
        const modal = bootstrap.Modal.getInstance(document.getElementById('accountDetailsModal'));
        modal.hide();
        
        showNotification('Success', 'Account deleted successfully');
    } catch (error) {
        console.error('Error deleting account:', error);
        showNotification('Error', 'Failed to delete account');
    }
}

// Fetch server status
async function fetchServerStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`);
        if (!response.ok) throw new Error('Failed to fetch server status');
        
        const status = await response.json();
        
        // Update status UI
        document.getElementById('server-uptime').textContent = status.uptime;
        document.getElementById('server-memory').textContent = status.memory;
        
        // Format config as JSON
        const configFormatted = JSON.stringify(status.config, null, 2);
        document.getElementById('server-config').textContent = configFormatted;
    } catch (error) {
        console.error('Error fetching server status:', error);
        showNotification('Error', 'Failed to load server status');
    }
}

// Show notification toast
function showNotification(title, message) {
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toast.show();
}

// Helper function to get protocol class for styling
function getProtocolClass(protocol) {
    switch (protocol.toLowerCase()) {
        case 'trojan':
            return 'primary';
        case 'vless':
            return 'success';
        case 'ss':
            return 'info';
        default:
            return 'secondary';
    }
}

// Helper function to format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Helper function to get flag emoji from country code
function getFlagEmoji(countryCode) {
    if (!countryCode) return '🌐';
    return countryCode;
}
