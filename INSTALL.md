# DASBOR PROXY Installation Guide

This guide provides step-by-step instructions for installing and configuring the DASBOR PROXY application on Ubuntu 20.04.

## Prerequisites

- Ubuntu 20.04 LTS server
- Root or sudo access
- Domain name (optional, for HTTPS)
- _worker.js file from your Cloudflare Workers setup

## Quick Installation

For a quick installation, you can use the provided setup script:

```bash
# Clone the repository
git clone https://github.com/yourusername/dasbor-proxy.git
cd dasbor-proxy

# Make the setup script executable
chmod +x setup.sh

# Run the setup script as root
sudo ./setup.sh
```

After installation, you can access the dashboard at `http://YOUR_SERVER_IP`.

## Manual Installation

If you prefer to install the application manually, follow these steps:

### 1. Update System and Install Dependencies

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx and other dependencies
sudo apt install -y nginx certbot python3-certbot-nginx ufw
```

### 2. Clone the Repository

```bash
# Create application directory
sudo mkdir -p /opt/dasbor-proxy
cd /opt/dasbor-proxy

# Clone the repository or copy files
git clone https://github.com/yourusername/dasbor-proxy.git .
# OR copy your files to this directory
```

### 3. Copy Your _worker.js File

```bash
# Copy your _worker.js file to the application directory
cp /path/to/your/_worker.js /opt/dasbor-proxy/
```

### 4. Install Backend Dependencies

```bash
cd /opt/dasbor-proxy/backend
npm install
```

### 5. Create Systemd Service

Create a systemd service file to manage the application:

```bash
sudo nano /etc/systemd/system/dasbor-proxy.service
```

Add the following content:

```
[Unit]
Description=DASBOR PROXY - VLESS Trojan Management
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/dasbor-proxy/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

### 6. Configure Nginx

Create an Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/dasbor-proxy
```

Add the following content:

```nginx
server {
    listen 80;
    server_name _;  # Replace with your domain if you have one

    location / {
        root /opt/dasbor-proxy/frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and disable the default site:

```bash
sudo ln -s /etc/nginx/sites-available/dasbor-proxy /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 7. Set Permissions

```bash
sudo chown -R www-data:www-data /opt/dasbor-proxy
sudo chmod -R 755 /opt/dasbor-proxy
```

### 8. Configure Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable
```

### 9. Start Services

```bash
sudo systemctl daemon-reload
sudo systemctl enable dasbor-proxy
sudo systemctl start dasbor-proxy
sudo systemctl restart nginx
```

### 10. Verify Installation

Check if the services are running:

```bash
sudo systemctl status dasbor-proxy
sudo systemctl status nginx
```

You can now access the dashboard at `http://YOUR_SERVER_IP`.

## Securing with HTTPS (Optional)

If you have a domain name pointing to your server, you can secure your dashboard with HTTPS:

```bash
sudo certbot --nginx -d yourdomain.com
```

Follow the prompts to complete the HTTPS setup.

## Troubleshooting

### Check Service Status

```bash
sudo systemctl status dasbor-proxy
sudo systemctl status nginx
```

### View Logs

```bash
# Backend logs
sudo journalctl -u dasbor-proxy

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Common Issues

1. **Port 3000 is already in use**

   Change the port in `/opt/dasbor-proxy/backend/config.js` and update the Nginx configuration accordingly.

2. **Permission denied errors**

   Ensure proper ownership and permissions:
   ```bash
   sudo chown -R www-data:www-data /opt/dasbor-proxy
   sudo chmod -R 755 /opt/dasbor-proxy
   ```

3. **Nginx configuration errors**

   Check for syntax errors:
   ```bash
   sudo nginx -t
   ```

4. **Cannot connect to the dashboard**

   Ensure the firewall allows HTTP/HTTPS traffic:
   ```bash
   sudo ufw status
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

## Updating the Application

To update the application:

```bash
cd /opt/dasbor-proxy
git pull  # If you cloned from a repository

# Or copy your updated files
# cp -r /path/to/updated/files/* /opt/dasbor-proxy/

# Install any new dependencies
cd /opt/dasbor-proxy/backend
npm install

# Restart the service
sudo systemctl restart dasbor-proxy
```

## Uninstalling

To uninstall the application:

```bash
# Stop and disable services
sudo systemctl stop dasbor-proxy
sudo systemctl disable dasbor-proxy

# Remove service file
sudo rm /etc/systemd/system/dasbor-proxy.service

# Remove Nginx configuration
sudo rm /etc/nginx/sites-enabled/dasbor-proxy
sudo rm /etc/nginx/sites-available/dasbor-proxy

# Reload systemd and restart Nginx
sudo systemctl daemon-reload
sudo systemctl restart nginx

# Remove application files
sudo rm -rf /opt/dasbor-proxy
```