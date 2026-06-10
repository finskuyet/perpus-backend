// ============================================================
// SERVER BACKEND PERPUSTAKAAN — Node.js + Express + Supabase (PostgreSQL)
// Deploy ke Railway / Render / Fly.io
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_jwt_default';

// ===================== MIDDLEWARE =====================
app.use(cors({
    origin: '*',
    credentials: false
}));
app.use(express.json({ limit: '20mb' }));

// ===================== DATABASE CONNECTION (Supabase PostgreSQL) =====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test koneksi
(async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Berhasil terhubung ke Supabase PostgreSQL');
        client.release();
    } catch (err) {
        console.error('❌ Gagal koneksi ke database:', err.message);
        process.exit(1);
    }
})();

// ===================== MIDDLEWARE AUTH =====================
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(403).json({ error: 'Token tidak valid atau kadaluarsa' });
    }
}

function petugasOnly(req, res, next) {
    if (req.user.role !== 'petugas') return res.status(403).json({ error: 'Akses ditolak: hanya petugas' });
    next();
}

// ===================== HELPER =====================
async function generateMemberId(client) {
    const { rows } = await client.query('SELECT COUNT(*) AS total FROM pengguna WHERE role = $1', ['pengunjung']);
    const num = String(parseInt(rows[0].total) + 1).padStart(3, '0');
    return `M-${num}`;
}

// ===================== ROUTES: AUTH =====================

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    try {
        const { rows } = await pool.query('SELECT * FROM pengguna WHERE email = $1 AND role = $2', [email, role]);
        if (rows.length === 0) return res.status(401).json({ error: 'Email belum terdaftar!' });
        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Password salah!' });
        const token = jwt.sign({ id: user.id, nama: user.nama, email: user.email, role: user.role, member_id: user.member_id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, nama: user.nama, email: user.email, role: user.role, member_id: user.member_id, avatar: user.avatar } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Register
app.post('/api/auth/register', async (req, res) => {
    const { nama, email, password, role, kodeOtorisasi } = req.body;
    const client = await pool.connect();
    try {
        if (role === 'petugas') {
            const { rows: kode } = await client.query('SELECT nilai FROM konfigurasi WHERE kunci = $1', ['kode_otorisasi_petugas']);
            const kodeValid = kode[0]?.nilai || 'PUSTAKA2026';
            if (kodeOtorisasi !== kodeValid) return res.status(400).json({ error: 'Kode otorisasi tidak valid!' });
        }
        const { rows: existing } = await client.query('SELECT id FROM pengguna WHERE email = $1', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email sudah digunakan!' });

        const hashedPassword = await bcrypt.hash(password, 10);
        let member_id = null;
        if (role === 'pengunjung') member_id = await generateMemberId(client);

        await client.query(
            'INSERT INTO pengguna (nama, email, password, role, member_id) VALUES ($1, $2, $3, $4, $5)',
            [nama, email, hashedPassword, role || 'pengunjung', member_id]
        );
        res.json({ message: 'Registrasi berhasil!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// Ganti Password
app.post('/api/auth/ganti-password', authMiddleware, async (req, res) => {
    const { passwordLama, passwordBaru } = req.body;
    try {
        const { rows } = await pool.query('SELECT * FROM pengguna WHERE id = $1', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
        const valid = await bcrypt.compare(passwordLama, rows[0].password);
        if (!valid) return res.status(401).json({ error: 'Password lama salah!' });
        const hashed = await bcrypt.hash(passwordBaru, 10);
        await pool.query('UPDATE pengguna SET password = $1 WHERE id = $2', [hashed, req.user.id]);
        res.json({ message: 'Password berhasil diperbarui!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, role, passwordBaru } = req.body;
    try {
        const { rows } = await pool.query('SELECT id FROM pengguna WHERE email = $1 AND role = $2', [email, role]);
        if (rows.length === 0) return res.status(404).json({ error: 'Email tidak ditemukan!' });
        const hashed = await bcrypt.hash(passwordBaru, 10);
        await pool.query('UPDATE pengguna SET password = $1 WHERE email = $2 AND role = $3', [hashed, email, role]);
        res.json({ message: 'Password berhasil direset!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update Avatar
app.post('/api/auth/avatar', authMiddleware, async (req, res) => {
    const { avatar } = req.body;
    try {
        await pool.query('UPDATE pengguna SET avatar = $1 WHERE id = $2', [avatar, req.user.id]);
        res.json({ message: 'Avatar diperbarui!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Cek email
app.post('/api/auth/cek-email', async (req, res) => {
    const { email, role } = req.body;
    try {
        const { rows } = await pool.query('SELECT id FROM pengguna WHERE email = $1 AND role = $2', [email, role]);
        if (rows.length === 0) return res.status(404).json({ error: 'Email tidak ditemukan!' });
        res.json({ message: 'Email ditemukan', found: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ===================== ROUTES: BUKU =====================

// GET semua buku
app.get('/api/buku', async (req, res) => {
    const { kategori, q } = req.query;
    try {
        let sql = 'SELECT * FROM buku WHERE 1=1';
        const params = [];
        let idx = 1;
        if (kategori && kategori !== 'Semua') { sql += ` AND kategori = $${idx++}`; params.push(kategori); }
        if (q) { sql += ` AND (judul ILIKE $${idx} OR penulis ILIKE $${idx+1})`; params.push(`%${q}%`, `%${q}%`); idx += 2; }
        sql += ' ORDER BY created_at DESC';
        const { rows } = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// GET satu buku
app.get('/api/buku/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM buku WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Buku tidak ditemukan' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Tambah buku (petugas only)
app.post('/api/buku', authMiddleware, petugasOnly, async (req, res) => {
    const { judul, penulis, kategori, isbn, penerbit, halaman, lokasi, stok, sinopsis, sampul } = req.body;
    try {
        const { rows: lastRow } = await pool.query('SELECT COUNT(*) AS total FROM buku');
        const newId = `BK-${String(parseInt(lastRow[0].total) + 1).padStart(4, '0')}`;
        await pool.query(
            'INSERT INTO buku (id, judul, penulis, kategori, isbn, penerbit, halaman, lokasi, stok, terpinjam, sinopsis, sampul) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11)',
            [newId, judul, penulis, kategori, isbn || '', penerbit || '', halaman || 0, lokasi || '', stok || 1, sinopsis || '', sampul || '']
        );
        const { rows: newBook } = await pool.query('SELECT * FROM buku WHERE id = $1', [newId]);
        res.json(newBook[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Edit buku (petugas only)
app.put('/api/buku/:id', authMiddleware, petugasOnly, async (req, res) => {
    const { judul, penulis, kategori, isbn, penerbit, halaman, lokasi, stok, sinopsis, sampul } = req.body;
    try {
        const { rows: existing } = await pool.query('SELECT id FROM buku WHERE id = $1', [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Buku tidak ditemukan' });

        if (sampul !== undefined) {
            await pool.query(
                'UPDATE buku SET judul=$1, penulis=$2, kategori=$3, isbn=$4, penerbit=$5, halaman=$6, lokasi=$7, stok=$8, sinopsis=$9, sampul=$10 WHERE id=$11',
                [judul, penulis, kategori, isbn, penerbit, halaman, lokasi, stok, sinopsis, sampul, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE buku SET judul=$1, penulis=$2, kategori=$3, isbn=$4, penerbit=$5, halaman=$6, lokasi=$7, stok=$8, sinopsis=$9 WHERE id=$10',
                [judul, penulis, kategori, isbn, penerbit, halaman, lokasi, stok, sinopsis, req.params.id]
            );
        }
        const { rows: updated } = await pool.query('SELECT * FROM buku WHERE id = $1', [req.params.id]);
        res.json(updated[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Hapus buku (petugas only)
app.delete('/api/buku/:id', authMiddleware, petugasOnly, async (req, res) => {
    try {
        await pool.query('DELETE FROM buku WHERE id = $1', [req.params.id]);
        res.json({ message: 'Buku dihapus!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ===================== ROUTES: ANGGOTA =====================

app.get('/api/anggota', authMiddleware, petugasOnly, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, nama, email, member_id, avatar FROM pengguna WHERE role = $1 ORDER BY created_at DESC', ['pengunjung']);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/anggota', authMiddleware, petugasOnly, async (req, res) => {
    const { nama, email } = req.body;
    const client = await pool.connect();
    try {
        const { rows: existing } = await client.query('SELECT id FROM pengguna WHERE email = $1', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email sudah digunakan!' });
        const member_id = await generateMemberId(client);
        const hashedPassword = await bcrypt.hash('123', 10);
        await client.query(
            'INSERT INTO pengguna (nama, email, password, role, member_id) VALUES ($1,$2,$3,$4,$5)',
            [nama, email, hashedPassword, 'pengunjung', member_id]
        );
        res.json({ message: 'Anggota berhasil ditambahkan!', member_id });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

app.delete('/api/anggota/:id', authMiddleware, petugasOnly, async (req, res) => {
    try {
        await pool.query('DELETE FROM pengguna WHERE id = $1 AND role = $2', [req.params.id, 'pengunjung']);
        res.json({ message: 'Anggota dihapus!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ===================== ROUTES: SIRKULASI =====================

app.get('/api/sirkulasi', authMiddleware, petugasOnly, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM sirkulasi ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/sirkulasi/saya', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM sirkulasi WHERE member_email = $1 ORDER BY created_at DESC', [req.user.email]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/sirkulasi/pinjam', authMiddleware, async (req, res) => {
    const { buku_id, tgl_pinjam, tgl_kembali } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: buku } = await client.query('SELECT * FROM buku WHERE id = $1 FOR UPDATE', [buku_id]);
        if (buku.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Buku tidak ditemukan' }); }
        const sisa = buku[0].stok - buku[0].terpinjam;
        if (sisa <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Stok buku habis!' }); }
        const { rows: cek } = await client.query('SELECT id FROM sirkulasi WHERE member_email = $1 AND buku_id = $2 AND tgl_realisasi IS NULL', [req.user.email, buku_id]);
        if (cek.length > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Anda sudah meminjam buku ini!' }); }

        const pinjam = tgl_pinjam || new Date().toISOString().split('T')[0];
        const kembali = tgl_kembali || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await client.query(
            'INSERT INTO sirkulasi (member_nama, member_email, buku_id, buku_judul, tgl_pinjam, tgl_kembali) VALUES ($1,$2,$3,$4,$5,$6)',
            [req.user.nama, req.user.email, buku_id, buku[0].judul, pinjam, kembali]
        );
        await client.query('UPDATE buku SET terpinjam = terpinjam + 1 WHERE id = $1', [buku_id]);
        await client.query('COMMIT');
        res.json({ message: `Berhasil meminjam "${buku[0].judul}"!` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

app.post('/api/sirkulasi/kembalikan', authMiddleware, async (req, res) => {
    const { buku_id, tgl_pinjam } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            'SELECT * FROM sirkulasi WHERE member_email = $1 AND buku_id = $2 AND tgl_pinjam = $3 AND tgl_realisasi IS NULL FOR UPDATE',
            [req.user.email, buku_id, tgl_pinjam]
        );
        if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transaksi tidak ditemukan' }); }
        const s = rows[0];
        const hari = new Date().toISOString().split('T')[0];
        const batas = new Date(s.tgl_kembali), realisasi = new Date(hari);
        const terlambat = realisasi > batas;
        const selisih = terlambat ? Math.ceil(Math.abs(realisasi - batas) / (1000 * 60 * 60 * 24)) : 0;
        const denda = selisih * 2000;
        await client.query('UPDATE sirkulasi SET tgl_realisasi = $1, denda = $2 WHERE id = $3', [hari, denda, s.id]);
        await client.query('UPDATE buku SET terpinjam = terpinjam - 1 WHERE id = $1 AND terpinjam > 0', [buku_id]);
        await client.query('COMMIT');
        res.json({ message: 'Buku berhasil dikembalikan!', denda, terlambat });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

app.post('/api/sirkulasi/kembalikan-admin', authMiddleware, petugasOnly, async (req, res) => {
    const { sirkulasi_id } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM sirkulasi WHERE id = $1 AND tgl_realisasi IS NULL FOR UPDATE', [sirkulasi_id]);
        if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transaksi tidak ditemukan' }); }
        const s = rows[0];
        const hari = new Date().toISOString().split('T')[0];
        const batas = new Date(s.tgl_kembali), realisasi = new Date(hari);
        const terlambat = realisasi > batas;
        const selisih = terlambat ? Math.ceil(Math.abs(realisasi - batas) / (1000 * 60 * 60 * 24)) : 0;
        const denda = selisih * 2000;
        await client.query('UPDATE sirkulasi SET tgl_realisasi = $1, denda = $2 WHERE id = $3', [hari, denda, s.id]);
        await client.query('UPDATE buku SET terpinjam = terpinjam - 1 WHERE id = $1 AND terpinjam > 0', [s.buku_id]);
        await client.query('COMMIT');
        res.json({ message: `Buku "${s.buku_judul}" berhasil dikembalikan!`, denda });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

app.post('/api/sirkulasi/manual', authMiddleware, petugasOnly, async (req, res) => {
    const { member_nama, buku_judul, tgl_pinjam, tgl_kembali, tgl_realisasi } = req.body;
    try {
        const { rows: buku } = await pool.query('SELECT id FROM buku WHERE judul = $1', [buku_judul]);
        const buku_id = buku[0]?.id || null;
        await pool.query(
            'INSERT INTO sirkulasi (member_nama, buku_id, buku_judul, tgl_pinjam, tgl_kembali, tgl_realisasi) VALUES ($1,$2,$3,$4,$5,$6)',
            [member_nama, buku_id, buku_judul, tgl_pinjam, tgl_kembali, tgl_realisasi || null]
        );
        if (buku_id && !tgl_realisasi) {
            await pool.query('UPDATE buku SET terpinjam = terpinjam + 1 WHERE id = $1', [buku_id]);
        }
        res.json({ message: 'Transaksi manual berhasil disimpan!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ===================== ROUTES: KATEGORI =====================
app.get('/api/kategori', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT nama FROM kategori ORDER BY nama');
        res.json(rows.map(r => r.nama));
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/kategori', authMiddleware, petugasOnly, async (req, res) => {
    const { nama } = req.body;
    try {
        await pool.query('INSERT INTO kategori (nama) VALUES ($1) ON CONFLICT (nama) DO NOTHING', [nama]);
        res.json({ message: 'Kategori ditambahkan!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/kategori/:nama', authMiddleware, petugasOnly, async (req, res) => {
    try {
        await pool.query('DELETE FROM kategori WHERE nama = $1', [req.params.nama]);
        res.json({ message: 'Kategori dihapus!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ===================== ROUTES: KONFIGURASI =====================
app.get('/api/konfigurasi/kode-otorisasi', authMiddleware, petugasOnly, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT nilai FROM konfigurasi WHERE kunci = $1', ['kode_otorisasi_petugas']);
        res.json({ kode: rows[0]?.nilai || 'PUSTAKA2026' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/konfigurasi/kode-otorisasi', authMiddleware, petugasOnly, async (req, res) => {
    const { kode } = req.body;
    try {
        await pool.query(
            'INSERT INTO konfigurasi (kunci, nilai) VALUES ($1, $2) ON CONFLICT (kunci) DO UPDATE SET nilai = $2',
            ['kode_otorisasi_petugas', kode]
        );
        res.json({ message: 'Kode otorisasi diperbarui!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ===================== ROUTES: DASHBOARD STATS =====================
app.get('/api/dashboard/stats', authMiddleware, petugasOnly, async (req, res) => {
    try {
        const { rows: [tb] } = await pool.query('SELECT COUNT(*) AS total FROM buku');
        const { rows: [ta] } = await pool.query('SELECT COUNT(*) AS total FROM pengguna WHERE role = $1', ['pengunjung']);
        const { rows: [tp] } = await pool.query('SELECT COUNT(*) AS total FROM sirkulasi WHERE tgl_realisasi IS NULL');
        const { rows: [tt] } = await pool.query("SELECT COUNT(*) AS total FROM sirkulasi WHERE tgl_realisasi IS NULL AND tgl_kembali < CURRENT_DATE");
        const { rows: recentActivity } = await pool.query('SELECT * FROM sirkulasi ORDER BY created_at DESC LIMIT 5');
        res.json({ totalBuku: tb.total, totalAnggota: ta.total, totalPinjaman: tp.total, totalTerlambat: tt.total, recentActivity });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ===================== HEALTH CHECK =====================
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'OK', database: 'Supabase Connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', database: 'Disconnected', error: err.message });
    }
});

// ===================== START SERVER =====================
app.listen(PORT, () => {
    console.log(`🚀 Server Perpustakaan berjalan di port ${PORT}`);
    console.log(`📚 API tersedia di /api`);
});
