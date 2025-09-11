# Panduan Konfigurasi DASBOR PROXY

Dokumen ini menjelaskan cara mengkonfigurasi variabel yang diperlukan dalam proyek **DASBOR PROXY**, terutama pada berkas `_worker.js`.

## Konfigurasi Utama: `_worker.js`

Berkas `_worker.js` adalah inti dari fungsionalitas proksi dan harus dikonfigurasi dengan benar agar aplikasi dapat berjalan. Buka berkas `_worker.js` dan isi variabel-variabel berikut dengan informasi akun Cloudflare Anda.

```javascript
// Variabel yang perlu diisi
const rootDomain = "example.workers.dev"; // Ganti dengan domain utama Cloudflare Workers Anda
const serviceName = "dasbor-proxy";      // Ganti dengan nama Worker Anda
const apiKey = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // Ganti dengan Global API Key Cloudflare Anda
const apiEmail = "user@example.com";       // Ganti dengan email Cloudflare Anda
const accountID = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // Ganti dengan Account ID Cloudflare Anda
const zoneID = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";    // Ganti dengan Zone ID Cloudflare Anda
```

### Di Mana Menemukan Informasi Ini?

1.  **`rootDomain`**:
    *   Masuk ke dasbor Cloudflare.
    *   Di menu sebelah kanan, klik **Workers & Pages**.
    *   Di halaman ikhtisar, Anda akan melihat subdomain Workers Anda (contoh: `nama-anda.workers.dev`). Itulah `rootDomain` Anda.

2.  **`serviceName`**:
    *   Ini adalah nama yang Anda berikan untuk skrip Worker Anda saat membuatnya. Anda bisa memilih nama apa saja (misalnya, "proxy", "layanan-saya", dll).

3.  **`apiKey` (Global API Key)**:
    *   Masuk ke dasbor Cloudflare.
    *   Klik ikon profil Anda di kanan atas, lalu pilih **My Profile**.
    *   Navigasi ke tab **API Tokens**.
    *   Di bawah **Global API Key**, klik **View** untuk melihat dan menyalin kunci Anda. **PERINGATAN: Jaga kerahasiaan kunci ini!**

4.  **`apiEmail`**:
    *   Ini adalah alamat email yang Anda gunakan untuk masuk ke akun Cloudflare Anda.

5.  **`accountID`**:
    *   Masuk ke dasbor Cloudflare.
    *   Pilih salah satu domain Anda.
    *   Di halaman ringkasan domain, gulir ke bawah. Anda akan menemukan **Account ID** di bilah sisi kanan.

6.  **`zoneID`**:
    *   Masuk ke dasbor Cloudflare.
    *   Pilih domain yang ingin Anda gunakan.
    *   Di halaman ringkasan domain, gulir ke bawah. Anda akan menemukan **Zone ID** di bilah sisi kanan.

Setelah Anda mengisi semua variabel ini, simpan berkas `_worker.js` dan jalankan skrip instalasi (`setup.sh`) atau mulai ulang layanan jika sudah terpasang.

## Konfigurasi Tambahan (Opsional)

Aplikasi ini dirancang untuk bekerja secara otomatis setelah `_worker.js` dikonfigurasi. Namun, Anda dapat menyesuaikan beberapa pengaturan lebih lanjut menggunakan variabel lingkungan jika diperlukan:

*   `PORT`: Port tempat server backend berjalan (default: `3000`).
*   `HOST`: Host tempat server backend mengikat (default: `0.0.0.0`).
*   `PROXY_LIST_URL`: URL alternatif untuk mengambil daftar proksi.

Variabel-variabel ini dapat diatur saat menjalankan aplikasi atau dalam berkas layanan systemd.
