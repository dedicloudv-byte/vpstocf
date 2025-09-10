#!/bin/bash

# DASBOR PROXY - Setup Script for Ubuntu 20.04
# This script installs and configures the DASBOR PROXY application

# Text colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
  echo -e "${GREEN}[DASBOR PROXY]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  print_error "Please run as root (use sudo)"
  exit 1
fi

# Check Ubuntu version
if [[ $(lsb_release -rs) != "20.04" ]]; then
  print_warning "This script is designed for Ubuntu 20.04. You're running $(lsb_release -ds)."
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Update system
print_message "Updating system packages..."
apt update && apt upgrade -y

# Install dependencies
print_message "Installing dependencies..."
apt install -y curl wget git nginx certbot python3-certbot-nginx ufw

# Install Node.js 20.x
print_message "Installing Node.js 20.x..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  print_message "Node.js $(node -v) installed"
else
  print_message "Node.js $(node -v) is already installed"
fi

# Create app directory
APP_DIR="/opt/dasbor-proxy"
print_message "Creating application directory at $APP_DIR..."
mkdir -p $APP_DIR

# Copy application files
print_message "Copying application files..."
cp -r backend frontend _worker.js $APP_DIR/

# Set permissions
print_message "Setting permissions..."
chown -R www-data:www-data $APP_DIR
chmod -R 755 $APP_DIR

# Install backend dependencies
print_message "Installing backend dependencies..."
cd $APP_DIR/backend
npm install

# Create systemd service
print_message "Creating systemd service..."
cat > /etc/systemd/system/dasbor-proxy.service << EOF
[Unit]
Description=DASBOR PROXY - VLESS Trojan Management
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR/backend
ExecStart=$(which node) server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

# Configure Nginx
print_message "Configuring Nginx..."
cat > /etc/nginx/sites-available/dasbor-proxy << EOF
server {
    listen 80;
    server_name _;

    location / {
        root $APP_DIR/frontend;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/dasbor-proxy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Configure firewall
print_message "Configuring firewall..."
ufw allow 'Nginx Full'
ufw allow 3000/tcp
ufw allow ssh

# Start services
print_message "Starting services..."
systemctl daemon-reload
systemctl enable dasbor-proxy
systemctl start dasbor-proxy
systemctl restart nginx

# Check if services are running
if systemctl is-active --quiet dasbor-proxy && systemctl is-active --quiet nginx; then
  print_message "DASBOR PROXY has been successfully installed and started!"
  print_message "You can access the dashboard at http://YOUR_SERVER_IP"
  
  # Get server IP
  SERVER_IP=$(hostname -I | awk '{print $1}')
  if [ ! -z "$SERVER_IP" ]; then
    print_message "Your server IP appears to be: $SERVER_IP"
    print_message "Dashboard URL: http://$SERVER_IP"
  fi
  
  print_message "To secure with HTTPS, run: certbot --nginx -d yourdomain.com"
else
  print_error "There was a problem starting the services. Please check the logs:"
  print_error "  - Backend logs: journalctl -u dasbor-proxy"
  print_error "  - Nginx logs: /var/log/nginx/error.log"
fi

print_message "Setup complete!"