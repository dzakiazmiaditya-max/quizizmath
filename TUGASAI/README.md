# Latihan Soal Matematika

Aplikasi kuis Node.js (versi 18 atau lebih baru) yang menggunakan xAI Grok untuk membuat soal baru per sesi dan menganalisis hasil belajar. Aplikasi dapat dijalankan sebagai server Node.js biasa atau dipublikasikan ke Vercel.

## Konfigurasi lokal

Atur API key xAI dan secret enkripsi sesi di PowerShell dari folder `TUGASAI`:

```powershell
$env:XAI_API_KEY = "xai-..."
$env:SESSION_SECRET = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

Simpan secret yang dihasilkan jika ingin menjalankan server lagi dengan sesi yang masih berlaku. Jangan masukkan API key atau secret ke source code.

Jalankan server biasa:

```powershell
npm start
```

Atau jalankan dengan emulasi Vercel lokal setelah project ditautkan:

```powershell
npm run dev
```

Buka alamat lokal yang ditampilkan di terminal (server biasa menggunakan `http://localhost:5000`).

## Deploy ke Vercel

1. Pastikan akun xAI memiliki API key dan akun Vercel tersedia.
2. Buka terminal pada folder `TUGASAI`—folder ini yang harus dijadikan **Project Root Directory** di Vercel.
3. Login dan tautkan proyek:

   ```powershell
   vercel login
   vercel link
   ```

4. Di Vercel Dashboard, buka **Project Settings → Environment Variables**. Tambahkan `XAI_API_KEY` dan `SESSION_SECRET` untuk environment **Production** (tambahkan Preview/Development jika dibutuhkan). Buat `SESSION_SECRET` acak minimal 32 karakter, misalnya dengan perintah:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Model default adalah `grok-4.7`; tambahkan `XAI_MODEL` hanya jika ingin menggantinya. Jangan gunakan nilai API key sungguhan pada argumen terminal atau commit ke repository.

5. Deploy:

   ```powershell
   vercel --prod
   ```

Vercel akan memberikan URL live `*.vercel.app`. Perubahan environment variable berlaku pada deployment berikutnya, jadi deploy ulang setelah mengubah konfigurasi.

## Fitur dan catatan sesi

- Grok membuat 10 soal pilihan ganda sesuai jenjang dan kesulitan.
- Urutan soal dan pilihan diacak; kunci jawaban tidak dikirim ke browser.
- Skor dihitung objektif oleh server. Grok memberikan umpan balik dan saran belajar setelah kuis.
- Sesi kuis disimpan sebagai token terenkripsi yang berlaku selama tiga jam agar tetap berfungsi di serverless Vercel tanpa penyimpanan memori antar-request. Token yang sama dapat dikirim ulang selama masih berlaku; jangan gunakan mekanisme ini sebagai sistem ujian berhadiah atau pencatatan nilai resmi tanpa menambahkan penyimpanan sesi sekali-pakai.
- Jika analisis AI gagal, skor tetap ditampilkan dan kegagalan analisis diberitahukan.

Konfigurasi opsional: `XAI_MODEL` (default `grok-4.7`), `XAI_URL` (default `https://api.x.ai/v1/responses`), dan `PORT` untuk server lokal (default `5000`).
