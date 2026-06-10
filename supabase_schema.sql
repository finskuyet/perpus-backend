-- ============================================================
-- SCHEMA PERPUSTAKAAN DIGITAL — Supabase (PostgreSQL)
-- Jalankan di Supabase > SQL Editor
-- ============================================================

-- Tabel Kategori Buku
CREATE TABLE IF NOT EXISTS kategori (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
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
    sampul TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger untuk auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS buku_updated_at ON buku;
CREATE TRIGGER buku_updated_at
    BEFORE UPDATE ON buku
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tabel Pengguna (Pengunjung & Petugas)
CREATE TABLE IF NOT EXISTS pengguna (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'pengunjung' CHECK (role IN ('pengunjung', 'petugas')),
    member_id VARCHAR(20) UNIQUE,
    avatar TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Log Sirkulasi (Peminjaman & Pengembalian)
CREATE TABLE IF NOT EXISTS sirkulasi (
    id SERIAL PRIMARY KEY,
    member_nama VARCHAR(255) NOT NULL,
    member_email VARCHAR(255),
    buku_id VARCHAR(20) REFERENCES buku(id) ON DELETE SET NULL,
    buku_judul VARCHAR(255) NOT NULL,
    tgl_pinjam DATE NOT NULL,
    tgl_kembali DATE NOT NULL,
    tgl_realisasi DATE,
    denda INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Kode Otorisasi Petugas
CREATE TABLE IF NOT EXISTS konfigurasi (
    kunci VARCHAR(100) PRIMARY KEY,
    nilai TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (Nonaktifkan dulu — akses via backend)
-- ============================================================
ALTER TABLE kategori DISABLE ROW LEVEL SECURITY;
ALTER TABLE buku DISABLE ROW LEVEL SECURITY;
ALTER TABLE pengguna DISABLE ROW LEVEL SECURITY;
ALTER TABLE sirkulasi DISABLE ROW LEVEL SECURITY;
ALTER TABLE konfigurasi DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DATA AWAL (SEED)
-- ============================================================
INSERT INTO kategori (nama) VALUES
    ('Sains'), ('Sejarah'), ('Psikologi'), ('Fiksi'), ('Bisnis')
ON CONFLICT (nama) DO NOTHING;

INSERT INTO konfigurasi (kunci, nilai) VALUES
    ('kode_otorisasi_petugas', 'PUSTAKA2026')
ON CONFLICT (kunci) DO NOTHING;

-- Akun admin default (password: admin123)
INSERT INTO pengguna (nama, email, password, role) VALUES
    ('Admin Perpus', 'admin@pustaka.id', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'petugas')
ON CONFLICT (email) DO NOTHING;

-- Akun pengunjung contoh (password: 123)
INSERT INTO pengguna (nama, email, password, role, member_id) VALUES
    ('Budi Santoso', 'budi@pustaka.id', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'pengunjung', 'M-001'),
    ('Siti Aminah', 'siti@pustaka.id', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'pengunjung', 'M-002')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- CATATAN: Password hash di atas = "password"
-- Ganti lewat endpoint /api/auth/reset-password setelah deploy
-- ============================================================
