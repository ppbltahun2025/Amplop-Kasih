# Amplop Kasih

Website buah tangan pernikahan untuk orang yang berhalangan hadir. Pengirim menulis ucapan (font bebas, tebal, miring, garis bawah, warna), menempelkan foto, menyelipkan bukti transfer di dalam amplop, lalu membagikan **satu link**. Mempelai membuka link dan melihat amplop terbuka dengan animasi, diiringi musik pernikahan dan kelopak bunga.

## Fitur

- **Beranda** bertema pernikahan: judul beranimasi, amplop yang membuka sendiri, kelopak bunga berjatuhan.
- **Kursor bunga** dengan jejak kelopak saat mouse bergerak. Ketuk atau klik memunculkan hamburan kelopak. Otomatis nonaktif jika perangkat memakai *reduced motion*.
- **Musik latar**: melodi piano lembut ala *Canon* yang dibuat langsung di browser (tanpa file audio). Mulai pada klik pertama, bisa dimatikan lewat tombol ♪ di kiri bawah (pilihan diingat).
- **Editor** untuk tulisan amplop dan isi ucapan, 6 warna amplop, foto polaroid bertape, bukti transfer yang naik dari amplop (ketuk untuk memperbesar).
- **Login** username, email, dan password dengan verifikasi email. Data di sheet master `Users`.
- **Penyimpanan di Drive**: tiap akun punya folder "Amplop Kasih — username" berisi file JSON per amplop.
- **Link penonton** `https://domainmu/v/ID`, tombol WhatsApp, kirim email otomatis ke mempelai, edit tanpa mengubah link, hapus.

## Struktur

```
amplop-kasih/
├── Code.gs            Backend Google Apps Script
├── worker.js          Cloudflare Worker (proxy /api, rute /v/ID, file statis)
├── wrangler.toml      Konfigurasi Worker
├── public/
│   ├── index.html     Seluruh frontend (beranda, generator, arsip, penonton)
│   └── music.mp3      (opsional) musik sendiri, lihat bagian Musik
└── README.md
```

Alur: `Browser → Cloudflare Worker (/api) → Apps Script → Sheet master + Drive`.
URL Apps Script disimpan sebagai secret Worker, sehingga tidak muncul di browser.

## Deploy

### 1. Apps Script

1. Buat project baru di script.google.com dan tempel isi `Code.gs`.
2. Cek `MASTER_SHEET_ID` di baris atas (sudah berisi ID sheet akun kamu). Tab `Users` dan `Cards` dibuat atau diperbarui otomatis.
3. **Project Settings → Script properties**, tambahkan:

   | Property | Isi |
   |---|---|
   | `SHARED_KEY` | teks acak panjang (rahasia, sama dengan di Worker) |
   | `APP_ORIGIN` | alamat Worker, tanpa slash akhir, contoh `https://amplop-kasih.namamu.workers.dev` |

4. Jalankan fungsi `authorize()` sekali dari editor dan setujui izin Drive, Mail, dan Sheets.
5. **Deploy → New deployment → Web app** dengan *Execute as: Me* dan *Who has access: Anyone*. Salin URL yang berakhiran `/exec`.

### 2. Cloudflare Worker

```bash
npm i -g wrangler          # atau pakai npx
wrangler login
wrangler secret put GAS_URL      # tempel URL /exec Apps Script
wrangler secret put SHARED_KEY   # nilai sama dengan Script property
wrangler deploy
```

Salin alamat Worker yang muncul. Jika berbeda dari `APP_ORIGIN`, perbarui property tersebut lalu buat **New version** pada deployment Apps Script.

Domain sendiri: Cloudflare Dashboard → Workers → amplop-kasih → Settings → Domains & Routes. Setelah itu perbarui `APP_ORIGIN`.

### 3. Uji

1. Buka beranda, klik **Mulai buat amplop**, lalu **Masuk / Daftar**.
2. Daftar, buka email verifikasi, dan klik tombol di dalamnya (kembali ke situs dan muncul jendela masuk).
3. Buat amplop, klik **Lihat animasi**, lalu **Simpan dan buat link**.
4. Buka link `/v/…` di perangkat lain.

## Musik sendiri (opsional)

Letakkan file `music.mp3` di folder `public/` lalu deploy ulang. Situs otomatis memakainya (loop, volume 50%) dan melewati musik bawaan. Pakai lagu bebas hak cipta atau yang kamu punya lisensinya.

Ubah musik bawaan di objek `Music` pada `index.html`: urutan akor di `CH`, tempo di `EIGHTH`, dan pola arpeggio di `ARP`.

## Kustomisasi

- **Warna amplop**: objek `THEMES` di `index.html` (`env`, `dk`, `lt`, `paper`, `seal`, `ink`, `bg`). Tambahkan juga `<option>` di `#theme`.
- **Font**: daftar `<option>` di `#fFont`, ditambah link Google Fonts di `<head>`.
- **Kursor**: aturan CSS di bagian "Kursor bunga". Ganti warna pada data URI SVG (`%23f4a6b5` adalah merah muda).
- **Kecepatan animasi buka**: fungsi `play()` (jeda 900 ms dan 2100 ms) dan transisi CSS `.flap`, `.slip`, `.letter`.

## Aksi API (`POST /api`, JSON)

| action | Butuh login | Fungsi |
|---|---|---|
| `register`, `verify`, `login` | tidak | Akun |
| `saveCard` | ya | Simpan atau perbarui amplop (`id` opsional, `emailTo` opsional) |
| `listCards`, `deleteCard`, `sendCard` | ya | Arsip |
| `getCard` | tidak | Dipakai halaman penonton lewat ID acak |

## Keamanan dan batasan

- Siapa pun yang memegang link bisa melihat foto dan bukti transfer. Tutupi nomor rekening dan saldo sebelum diunggah.
- Teks ucapan disaring (hanya tag dan gaya yang aman) sebelum ditampilkan, jadi tidak bisa menyisipkan skrip.
- Sesi berlaku satu perangkat per akun (login baru menggantikan token lama), sama seperti MoneyLedger.
- Belum ada fitur lupa password dan pembatasan percobaan login.
- Kuota email Apps Script akun biasa sekitar 100 per hari.
- Folder Drive dibuat di akun pemilik script lalu dibagikan ke email pengguna. Folder muncul di "Shared with me" miliknya.

## Troubleshooting

| Gejala | Penyebab dan solusi |
|---|---|
| "Backend tidak merespons dengan benar" | Deployment Apps Script belum *Anyone*, URL `GAS_URL` salah, atau belum membuat New version setelah mengubah kode. |
| "Akses ditolak" | `SHARED_KEY` di Worker tidak sama dengan Script property. |
| Link verifikasi mengarah ke alamat salah | `APP_ORIGIN` belum diisi atau salah. |
| Email tidak terkirim | Jalankan `authorize()`, cek kuota harian, dan cek folder spam. |
| Musik tidak mulai | Browser mewajibkan interaksi dulu. Klik di mana saja atau tekan tombol ♪. |
