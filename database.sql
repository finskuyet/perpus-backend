-- ============================================================
-- DATABASE PERPUSTAKAAN DIGITAL
-- Jalankan file ini di MySQL untuk membuat semua tabel
-- ============================================================

CREATE DATABASE IF NOT EXISTS perpustakaan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE perpustakaan;

-- Tabel Kategori Buku
CREATE TABLE IF NOT EXISTS kategori (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Koleksi Buku
CREATE TABLE IF NOT EXISTS buku (
    id VARCHAR(20) PRIMARY KEY,
    judul VARCHAR(255) NOT NULL,
    penulis VARCHAR(255) NOT NULL,
    kategori VARCHAR(100),
    isbn VARCHAR(50),
    penerbit VARCHAR(255),
    halaman INT DEFAULT 0,
    lokasi VARCHAR(100),
    stok INT DEFAULT 1,
    terpinjam INT DEFAULT 0,
    sinopsis TEXT,
    sampul LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabel Pengguna (Pengunjung & Petugas)
CREATE TABLE IF NOT EXISTS pengguna (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('pengunjung', 'petugas') DEFAULT 'pengunjung',
    member_id VARCHAR(20) UNIQUE,
    avatar LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Log Sirkulasi (Peminjaman & Pengembalian)
CREATE TABLE IF NOT EXISTS sirkulasi (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_nama VARCHAR(255) NOT NULL,
    member_email VARCHAR(255),
    buku_id VARCHAR(20),
    buku_judul VARCHAR(255) NOT NULL,
    tgl_pinjam DATE NOT NULL,
    tgl_kembali DATE NOT NULL,
    tgl_realisasi DATE NULL,
    denda INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buku_id) REFERENCES buku(id) ON DELETE SET NULL
);

-- Tabel Kode Otorisasi Petugas
CREATE TABLE IF NOT EXISTS konfigurasi (
    kunci VARCHAR(100) PRIMARY KEY,
    nilai TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- DATA AWAL (SEED)
-- ============================================================

-- Kategori default
INSERT IGNORE INTO kategori (nama) VALUES
    ('Sains'), ('Sejarah'), ('Psikologi'), ('Fiksi'), ('Bisnis');

-- Kode otorisasi petugas default
INSERT IGNORE INTO konfigurasi (kunci, nilai) VALUES
    ('kode_otorisasi_petugas', 'PUSTAKA2026');

-- Akun admin default (password: admin123)
INSERT IGNORE INTO pengguna (nama, email, password, role) VALUES
    ('Admin Perpus', 'admin@pustaka.id', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'petugas');

-- Akun pengunjung contoh (password: 123)
INSERT IGNORE INTO pengguna (nama, email, password, role, member_id) VALUES
    ('Budi Santoso', 'budi@pustaka.id', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'pengunjung', 'M-001'),
    ('Siti Aminah', 'siti@pustaka.id', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'pengunjung', 'M-002');

-- ============================================================
-- CATATAN PENTING:
-- Password di atas menggunakan hash bcrypt untuk "password"
-- Ganti password admin dengan menjalankan endpoint /api/auth/reset-password
-- atau generate hash baru dengan bcrypt.hash("password_anda", 10)
-- ============================================================
