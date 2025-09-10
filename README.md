# DASBOR PROXY

A web-based dashboard for managing VLESS Trojan accounts on Ubuntu 20.04, designed to work with Cloudflare Workers.

![DASBOR PROXY](https://i.imgur.com/placeholder.jpg)

## Features

- Create and manage VLESS Trojan accounts
- Support for multiple protocols: Trojan, VLESS, and Shadowsocks
- QR code generation for easy mobile configuration
- Proxy server selection
- Server status monitoring
- Clean, responsive user interface

## System Requirements

- Ubuntu 20.04 LTS
- Node.js 20.x
- Nginx
- Internet connection for proxy fetching

## Installation

### Automatic Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/dasbor-proxy.git
   cd dasbor-proxy
   ```

2. Make the setup script executable:
   ```bash
   chmod +x setup.sh
   ```

3. Run the setup script as root:
   ```bash
   sudo ./setup.sh
   ```

4. Access the dashboard at `http://YOUR_SERVER_IP`

### Manual Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/dasbor-proxy.git
   cd dasbor-proxy
   ```

2. Install dependencies:
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js 20.x
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Install Nginx
   sudo apt install -y nginx
   ```

3. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

4. Configure Nginx:
   ```bash
   sudo nano /etc/nginx/sites-available/dasbor-proxy
   ```
   
   Add the following configuration:
   ```nginx
   server {
       listen 80;
       server_name _;

       location / {
           root /path/to/dasbor-proxy/frontend;
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

5. Enable the site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/dasbor-proxy /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo systemctl restart nginx
   ```

6. Create a systemd service:
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
   WorkingDirectory=/path/to/dasbor-proxy/backend
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   Environment=NODE_ENV=production
   Environment=PORT=3000

   [Install]
   WantedBy=multi-user.target
   ```

7. Start and enable the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable dasbor-proxy
   sudo systemctl start dasbor-proxy
   ```

8. Access the dashboard at `http://YOUR_SERVER_IP`

## Securing with HTTPS

It's recommended to secure your dashboard with HTTPS. You can use Certbot to obtain and install a free SSL certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Configuration

The application reads configuration from the `_worker.js` file to extract settings like domain and service name. Make sure this file is present in the root directory of the application.

## API Endpoints

The backend provides the following API endpoints:

- `GET /api/accounts` - Get all accounts
- `POST /api/accounts` - Create a new account
- `DELETE /api/accounts/:id` - Delete an account
- `GET /api/proxies` - Get available proxies
- `GET /api/status` - Get server status

## Integration with Cloudflare Workers

This dashboard is designed to work with the VLESS Trojan configuration in Cloudflare Workers. The `_worker.js` file contains the worker code that handles the actual proxying of traffic.

## Troubleshooting

If you encounter issues:

1. Check the backend logs:
   ```bash
   sudo journalctl -u dasbor-proxy
   ```

2. Check Nginx logs:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

3. Ensure the correct permissions:
   ```bash
   sudo chown -R www-data:www-data /path/to/dasbor-proxy
   sudo chmod -R 755 /path/to/dasbor-proxy
   ```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- This project integrates with Cloudflare Workers for VLESS Trojan functionality
- Built with Node.js, Express, and Bootstrap