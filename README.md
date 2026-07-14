# UjianKu

Prototipe web ujian sekolah berbasis brief produk yang diberikan. Aplikasi ini berjalan langsung di browser tanpa instalasi dependency dan menyimpan data nyata yang dimasukkan pengguna ke `localStorage`.

## Cara Membuka

Buka `index.html` di browser.

## Fitur Prototipe

- Halaman login sebagai pintu masuk pertama.
- Login menggunakan username dan password yang dibuat admin.
- Admin awal menggunakan `admin` / `admin123`.
- Admin mengunggah PDF data guru dan murid, lalu sistem membuat akun otomatis.
- Guru dapat membuat ujian dan mengunggah file soal berbasis teks.
- Sistem mencoba membaca PDF/TXT/CSV berformat nomor, pilihan A-D, dan `KUNCI:` menjadi soal pilihan ganda.
- Murid melihat ujian sesuai kelas, mengerjakan pilihan ganda, dan mengumpulkan ujian.
- Dashboard menghitung jumlah ujian, peserta, rata-rata nilai, hasil, dan pelanggaran dari data yang tersimpan.
- Ruang ujian dengan timer, navigasi soal, pilihan ganda, autosave jawaban, dan penilaian otomatis.
- Deteksi pelanggaran dasar: pindah tab, keluar fullscreen, kehilangan fokus, copy, paste, klik kanan, dan peringatan saat keluar halaman.

## Catatan Keamanan

Mode browser biasa hanya dapat mendeteksi dan mencatat pelanggaran. Penguncian penuh seperti blokir shortcut sistem, aplikasi lain, atau navigasi browser tetap membutuhkan Safe Exam Browser atau mode kiosk.

## Format Data Guru dan Murid

Upload dapat memakai PDF berbasis teks, TXT, atau CSV. Untuk pengujian paling stabil, gunakan TXT/CSV dengan format di bawah. PDF hasil scan/foto tidak bisa dibaca tanpa OCR.

Data guru per baris:

```text
Nama | Username | Password | NIP | Email | Telepon | Mapel | Kelas
Ratna Sari | ratna | ratna123 | 1987001 | ratna@sekolah.id | 08123456789 | Matematika | 8A, 8B
```

Data murid per baris:

```text
Nama | Username | Password | NISN | Kelas | Email
Andi Pratama | andi | andi123 | 0098123412 | 8A | andi@murid.id
```

## Format File Soal

Upload soal dapat memakai PDF berbasis teks, TXT, atau CSV. PDF yang hurufnya tersimpan sebagai gambar atau kode font khusus tidak bisa dibaca langsung oleh browser, jadi format TXT/CSV adalah pilihan paling stabil.

Kunci bisa ditulis di setiap soal:

```text
1. Bagian tumbuhan yang berfungsi menyerap air adalah ...
A. Daun
B. Akar
C. Batang
D. Bunga
KUNCI: B
```

Atau dikumpulkan di akhir file:

```text
KUNCI JAWABAN
1. B
2. A
3. D
```
