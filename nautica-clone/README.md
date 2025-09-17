# Nautica Clone (Node.js)

Clone perilaku Cloudflare Worker `_worker.js` dari `FoolVPN-ID/Nautica` menggunakan Node.js + Express, termasuk:
- Endpoint `/api/v1/sub`, `/api/v1/myip`, `/check`
- Fallback reverse proxy
- WebSocket proxy (Trojan/VLESS/SS) dan UDP relay
- UI modern (Tailwind) untuk generate subscription dan cek health

## Prasyarat
- Node.js 18+ (wajib, karena memakai global `fetch`)

## Menjalankan
```bash
cd nautica-clone
npm install
npm start
```
Aplikasi berjalan di `http://localhost:3000`.

## Lingkungan (Env Vars)
- `PRX_BANK_URL` (opsional) – sumber daftar proxy CSV `ip,port,CC,ORG`
- `KV_PRX_URL` (opsional) – sumber KV proxy (JSON mapping `CC -> ["ip:port", ...]`)
- `REVERSE_PRX_TARGET` (opsional) – target reverse proxy default, contoh `example.com` atau `example.com:80`

## Endpoint
- `GET /sub` → redirect ke halaman subscription original dengan parameter `host`
- `GET /check?target=ip:port` → ping health proxy via API upstream
- `GET /api/v1/myip` → info IP (best effort tanpa header CF)
- `GET /api/v1/sub` → generate daftar link (raw/v2ray/clash/sfa/bfr)
  - query: `cc`, `port`, `vpn`, `limit`, `format`, `domain`, `prx-list`

## Catatan
- Skema SS mengikuti logika worker (plugin v2ray ws, tls bila port 443)
- UDP memakai relay TCP (`udp-relay.hobihaus.space:7300`)
- Untuk environment non-Cloudflare, beberapa header CF mungkin tidak tersedia

## UI
Halaman utama `http://localhost:3000/` menyediakan form untuk generate subscription dan cek kesehatan proxy.

## Lisensi
For demo/educational purposes; cek lisensi proyek asli untuk ketentuan.