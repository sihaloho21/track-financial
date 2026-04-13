# Track Financial Pro

Platform manajemen finansial pribadi berbasis `Next.js` untuk:

- melacak akun dan saldo real-time
- mencatat income / expense dengan rollback saldo otomatis
- memantau aset bertumbuh
- melihat net worth dan reporting bulanan

Frontend berjalan langsung dengan mode preview berbasis `localStorage`, lalu bisa dihubungkan ke backend `Google Apps Script + Google Sheets` saat siap production.

Catatan penting:
request ke Google Apps Script sekarang dilewatkan dulu ke proxy `Next.js` (`/api/financial`) supaya aman dari error CORS di browser.

## Stack

- `Next.js 16` + React 19
- `Tailwind CSS 4`
- `Google Apps Script` untuk backend API
- `Google Sheets` untuk storage
- `Netlify` / hosting static-capable frontend

## Fitur Yang Sudah Diimplementasikan

- Dashboard ringkasan cash, asset value, net worth, savings rate
- CRUD account
- CRUD transaction dengan update saldo otomatis
- CRUD asset
- Filter transaction berdasarkan bulan, tipe, akun, kategori, dan search
- Reporting bulanan
- Expense breakdown
- Asset distribution
- Preview mode untuk demo tanpa backend

## Menjalankan Frontend

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Secara default aplikasi akan memakai mode preview. Data disimpan di browser melalui `localStorage`.

## Menghubungkan Ke Google Apps Script

1. Buat file `.env.local`
2. Isi URL Web App Google Apps Script seperti ini:

```env
NEXT_PUBLIC_FINANCIAL_API_URL=https://script.google.com/macros/s/your-deployment-id/exec
```

3. Restart server Next.js

Jika ingin URL hanya dipakai di server, gunakan:

```env
FINANCIAL_API_URL=https://script.google.com/macros/s/your-deployment-id/exec
NEXT_PUBLIC_FINANCIAL_API_ENABLED=true
```

## Deploy Backend Google Apps Script

Folder backend tersedia di [google-apps-script](./google-apps-script).

Langkah deploy:

1. Buat Google Spreadsheet baru
2. Buka `Extensions -> Apps Script`
3. Paste isi [google-apps-script/Code.gs](./google-apps-script/Code.gs) ke file `Code.gs`
4. Ganti isi `appsscript.json` dengan versi di [google-apps-script/appsscript.json](./google-apps-script/appsscript.json)
5. Di `Project Settings -> Script Properties`, tambahkan:

```txt
SPREADSHEET_ID=<id spreadsheet anda>
```

6. Deploy sebagai `Web app`
7. Set akses sesuai kebutuhan
8. Copy URL deployment ke `NEXT_PUBLIC_FINANCIAL_API_URL`

Sheet yang dipakai akan dibuat otomatis:

- `Accounts`
- `Transactions`
- `Assets`

## Struktur Penting

- [src/app/page.tsx](./src/app/page.tsx) entry page
- [src/components/financial-platform.tsx](./src/components/financial-platform.tsx) UI utama
- [src/lib/financial-engine.ts](./src/lib/financial-engine.ts) business logic saldo dan reporting
- [src/lib/financial-client.ts](./src/lib/financial-client.ts) adapter preview / Apps Script
- [google-apps-script/Code.gs](./google-apps-script/Code.gs) backend API

## Catatan Arsitektur

- Account balance adalah source of truth untuk saldo real-time
- Transactions menjadi audit trail
- Edit transaksi: revert saldo lama, lalu apply saldo baru
- Delete transaksi: rollback efek transaksi
- Asset terpisah dari account agar net worth lebih jelas

## Verifikasi

Perintah yang relevan:

```bash
npm run lint
npm run build
```
