import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  ArrowLeftRight,
  ArrowRight,
  Barcode,
  BookOpen,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  DatabaseBackup,
  HelpCircle,
  KeyRound,
  Package,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { RoleBadge } from "@/components/layout/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth";
import { canAccessRoute, ROLE_LABELS, type Role } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Panduan Penggunaan",
};

type GoldenRule = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  iconColor: string;
  roles: readonly Role[];
};

const GOLDEN_RULES: readonly GoldenRule[] = [
  {
    id: "owner-governance",
    title: "Kendali Penuh & Wewenang Khusus Owner",
    description:
      "Sebagai Owner, Anda memiliki akses operasional penuh ke seluruh 14 menu StarOps sekaligus wewenang eksklusif untuk Pengesahan Akhir pengajuan beranggaran, Penghapusan Aset (Hapus Buku), Penguncian Laporan Bulanan, Point-in-Time Restore database, Hapus Permanen Tempat Sampah, dan Manajemen akun Admin Operasional & Owner.",
    icon: ShieldCheck,
    color: "border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20",
    iconColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    roles: ["OWNER"],
  },
  {
    id: "auto-code",
    title: "Kode Stiker Barang Dibuat Otomatis",
    description:
      "Saat mendaftarkan barang baru di Barang & Alat Terapi, aplikasi langsung membuatkan kode rapi seperti SC-SNS-R01-0001 (Star Champs · kategori Sensori · Ruang Terapi 1 · urutan ke-1) tanpa perlu mengarang kode manual.",
    icon: Barcode,
    color: "border-fuchsia-200/80 bg-fuchsia-50/50 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20",
    iconColor: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-300",
    roles: ["OWNER", "SUPER_ADMIN"],
  },
  {
    id: "scan-borrow",
    title: "Biasakan Scan Saat Pinjam & Kembalikan",
    description:
      "Setiap mengambil mainan terapi atau Paket Alat (Kit) untuk sesi, scan stikernya di menu Pinjam & Kembalikan. Selesai sesi, hitung kepingannya (misalnya puzzle 10 keping) lalu scan kembalikan agar tidak ada bagian mainan yang tercecer.",
    icon: ArrowLeftRight,
    color: "border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    iconColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  },
  {
    id: "hygiene-status",
    title: "Tandai Kebersihan Mainan Selesai Sesi",
    description:
      "Mainan terapi memiliki 3 tanda kebersihan: Steril (siap dipakai), Perlu Dicuci (baru selesai dipakai anak), dan Sedang Disanitasi. Perbarui tanda ini segera setelah sesi agar terapis berikutnya tahu mana alat yang siap pakai.",
    icon: Sparkles,
    color: "border-sky-200/80 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-950/20",
    iconColor: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  },
  {
    id: "staff-requests",
    title: "Laporkan Kerusakan & Kebutuhan lewat Pengajuan Saya",
    description:
      "Butuh alat terapi baru, menemukan kerusakan, atau ada kepingan mainan yang hilang? Catat langsung di menu Pengajuan Saya agar mudah dipantau status prosesnya tanpa terlewat di chat.",
    icon: ClipboardCheck,
    color: "border-rose-200/80 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20",
    iconColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    roles: ["STAFF"],
  },
  {
    id: "staff-sop",
    title: "Akses Panduan SOP Terapi Kapan Saja",
    description:
      "Seluruh panduan kerja dan SOP terapi terbaru yang dibagikan klinik tersedia rapi di menu Panduan SOP. Anda bisa membuka pratinjau langsung atau mengunduhnya saat dibutuhkan.",
    icon: Archive,
    color: "border-teal-200/80 bg-teal-50/50 dark:border-teal-900/40 dark:bg-teal-950/20",
    iconColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300",
    roles: ["STAFF"],
  },
  {
    id: "tl-approval",
    title: "Periksa Pengajuan Tim Sebelum Diteruskan",
    description:
      "Pengajuan yang dikirim tim terapis masuk ke antrean tahap pertama di menu Pengajuan & Persetujuan. Periksa kelengkapannya lalu setujui agar diteruskan ke tahap berikutnya, atau tolak dengan alasan jelas.",
    icon: ClipboardCheck,
    color: "border-rose-200/80 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20",
    iconColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    roles: ["TEAM_LEADER"],
  },
  {
    id: "tl-opname",
    title: "Cek Ruangan Akhir Bulan (Mulai Tanggal 24)",
    description:
      "Setiap tanggal 24 hingga akhir bulan, muncul pengingat cek ruangan di bagian atas layar. Lakukan stock opname fisik tiap ruangan terapi lalu tandai kelengkapannya di menu Cek Ruangan & Ekspor.",
    icon: CalendarClock,
    color: "border-indigo-200/80 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
    iconColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    roles: ["TEAM_LEADER"],
  },
  {
    id: "admin-approval",
    title: "Alur Pengajuan Berjenjang & Pengesahan Owner",
    description:
      "Permintaan internal mengalir berjenjang dari Terapis → Kepala Terapis → Admin Operasional → Owner. Pengajuan pengadaan beranggaran dan penghapusan aset (Hapus Buku) wajib disahkan Owner.",
    icon: ClipboardCheck,
    color: "border-rose-200/80 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20",
    iconColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
    roles: ["OWNER", "SUPER_ADMIN"],
  },
  {
    id: "admin-recycle",
    title: "Salah Hapus? Pulihkan dari Tempat Sampah (30 Hari)",
    description:
      "Data yang dihapus masuk ke Tempat Sampah selama 30 hari dan dapat dipulihkan kapan saja. Penghapusan permanen sebelum masa retensi berakhir hanya dapat dilakukan oleh Owner demi keamanan data.",
    icon: Trash2,
    color: "border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20",
    iconColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    roles: ["SUPER_ADMIN"],
  },
  {
    id: "owner-recycle",
    title: "Tempat Sampah 30 Hari, Cadangan & Restore Database",
    description:
      "Data yang dihapus lunak disimpan di Tempat Sampah selama 30 hari untuk pemulihan cepat. Hanya Owner yang berwenang melakukan hapus permanen (purge) maupun Point-in-Time Restore database dari snapshot backup.",
    icon: DatabaseBackup,
    color: "border-indigo-200/80 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
    iconColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    roles: ["OWNER"],
  },
  {
    id: "admin-cutoff",
    title: "Rekonsiliasi & Cadangan Data Akhir Bulan",
    description:
      "Mulai tanggal 24 tiap bulan, verifikasi hasil stock opname seluruh ruangan dan buat snapshot cadangan data (Pre-Update / Cut-Off) di menu Laporan & Cadangan Data sebelum periode dikunci oleh Owner.",
    icon: CalendarClock,
    color: "border-indigo-200/80 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
    iconColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
    roles: ["SUPER_ADMIN"],
  },
];

type RoleGuide = {
  role: Role;
  badgeTitle: string;
  tagline: string;
  cardBorder: string;
  headerBg: string;
  accentText: string;
  whatToKnow: string[];
  dailySteps: {
    step: string;
    title: string;
    detail: string;
    href: string;
    buttonLabel: string;
  }[];
  menusAllowed: string[];
};

const ROLE_GUIDES: Record<Role, RoleGuide> = {
  STAFF: {
    role: "STAFF",
    badgeTitle: "Terapis (Tim Terapis & Staf)",
    tagline:
      "Fokus utama Anda adalah kelancaran sesi terapi: meminjam & mengembalikan mainan terapi, menjaga kebersihan alat, membaca Panduan SOP, serta melaporkan alat yang rusak atau kepingannya kurang.",
    cardBorder: "border-emerald-200 dark:border-emerald-900/50",
    headerBg:
      "bg-gradient-to-r from-emerald-50 via-teal-50/70 to-white dark:from-emerald-950/40 dark:to-slate-900",
    accentText: "text-emerald-800 dark:text-emerald-200",
    whatToKnow: [
      "Anda dapat melihat seluruh daftar mainan terapi dan paket kit secara aman tanpa khawatir salah mengubah atau menghapus data master.",
      "Setiap selesai memakai mainan, hitung kepingannya. Bila ada yang terselip, catat jumlah kepingan saat mengembalikan agar otomatis ditandai 'Part Kurang'.",
      "Ubah status kebersihan mainan menjadi 'Perlu Dicuci' sesudah sesi, lalu ubah kembali menjadi 'Steril' setelah dicuci dan dibersihkan.",
      "Gunakan menu Pengajuan Saya untuk mengajukan kebutuhan alat baru atau melapor kerusakan, lalu pantau status prosesnya langsung di sana.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Meminjam & Mengembalikan Alat Terapi",
        detail:
          "Buka menu Pinjam & Kembalikan. Scan stiker barcode mainan dengan kamera atau ketik kodenya, pilih ruang terapi, lalu klik Pinjam. Selesai sesi, scan kembali untuk mencatat pengembalian dan kelengkapan kepingan.",
        href: "/scan",
        buttonLabel: "Buka Pinjam & Kembalikan",
      },
      {
        step: "Langkah 2",
        title: "Meminjam Paket Alat (Kit) Sekaligus",
        detail:
          "Jika menggunakan satu paket kotak berisi beberapa mainan sekaligus, buka menu Paket Alat (Kit) lalu klik Check-Out Kit. Selesai sesi, kembalikan paket yang Anda pinjam dari menu yang sama.",
        href: "/kits",
        buttonLabel: "Buka Paket Alat (Kit)",
      },
      {
        step: "Langkah 3",
        title: "Update Kebersihan & Kelengkapan Kepingan",
        detail:
          "Buka menu Barang & Alat Terapi untuk memperbarui status sanitasi (Steril / Perlu Dicuci / Sedang Disanitasi) atau mencatat jumlah kepingan mainan saat ini.",
        href: "/inventory",
        buttonLabel: "Buka Barang & Alat Terapi",
      },
      {
        step: "Langkah 4",
        title: "Membaca SOP & Mengirim Pengajuan",
        detail:
          "Buka menu Panduan SOP untuk membaca prosedur terapi resmi, dan gunakan menu Pengajuan Saya untuk melaporkan alat rusak atau mengajukan kebutuhan alat.",
        href: "/requests",
        buttonLabel: "Buka Pengajuan Saya",
      },
    ],
    menusAllowed: [
      "Beranda",
      "Panduan Penggunaan",
      "Barang & Alat Terapi (Lihat, Update Kebersihan & Lapor Kepingan)",
      "Paket Alat (Kit) (Lihat & Pinjam/Kembalikan Milik Sendiri)",
      "Pinjam & Kembalikan (Scan Barcode Pinjam & Kembali)",
      "Pengajuan Saya (Buat & Pantau Pengajuan Sendiri)",
      "Panduan SOP (Baca & Unduh Dokumen SOP Resmi)",
      "Profil Saya (Ubah Data Profil Pribadi)",
    ],
  },
  TEAM_LEADER: {
    role: "TEAM_LEADER",
    badgeTitle: "Kepala Terapis (Koordinator Tim)",
    tagline:
      "Fokus utama Anda adalah mendampingi tim terapis: meninjau & menyetujui pengajuan tahap pertama, memantau peminjaman dan kelengkapan alat, memvalidasi stock opname ruangan akhir bulan, serta mengekspor laporan operasional.",
    cardBorder: "border-sky-200 dark:border-sky-900/50",
    headerBg:
      "bg-gradient-to-r from-sky-50 via-cyan-50/70 to-white dark:from-sky-950/40 dark:to-slate-900",
    accentText: "text-sky-800 dark:text-sky-200",
    whatToKnow: [
      "Pengajuan yang dibuat oleh tim terapis masuk ke antrean tahap pertama Anda ('Menunggu Team Leader'). Setujui bila sesuai atau tolak beserta alasannya.",
      "Anda memiliki akses tab Stock Opname di menu Pinjam, Kembali & Opname untuk memvalidasi kelengkapan part, kondisi, dan kebersihan alat di tiap ruangan terapi.",
      "Setiap tanggal 24 hingga akhir bulan, centang ruangan terapi yang sudah dicek di menu Cek Ruangan & Ekspor lalu klik Persetujuan Kepala Terapis.",
      "Anda dapat mengunduh laporan operasional (inventaris non-harga, anomali part & sanitasi, arsip) dalam format CSV, Excel, atau PDF kapan saja.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Memeriksa & Menyetujui Pengajuan Tim Terapis",
        detail:
          "Buka menu Pengajuan & Persetujuan, pilih tab Perlu Tindakan, lalu tinjau pengajuan berstatus 'Menunggu Team Leader'. Klik Setujui untuk meneruskan ke tahap verifikasi berikutnya.",
        href: "/requests",
        buttonLabel: "Periksa Pengajuan Tim",
      },
      {
        step: "Langkah 2",
        title: "Stock Opname & Cek Kelengkapan Alat Ruangan",
        detail:
          "Buka menu Pinjam, Kembali & Opname lalu pilih tab Stock Opname untuk memeriksa kondisi fisik, jumlah kepingan, dan status sanitasi mainan terapi di setiap ruangan.",
        href: "/scan",
        buttonLabel: "Buka Scan & Opname",
      },
      {
        step: "Langkah 3",
        title: "Checklist Akhir Bulan & Ekspor Data Operasional",
        detail:
          "Buka menu Cek Ruangan & Ekspor untuk mencentang kelengkapan opname ruangan (R01–R06, ADM, GDG), memberikan persetujuan Kepala Terapis, dan mengunduh laporan operasional.",
        href: "/backup",
        buttonLabel: "Buka Cek Ruangan & Ekspor",
      },
      {
        step: "Langkah 4",
        title: "Memantau Dokumen SOP & Arsip Operasional",
        detail:
          "Buka Lemari Arsip & SOP untuk membaca seluruh panduan SOP terapi dan dokumen operasional klinik serta riwayat versinya.",
        href: "/archives",
        buttonLabel: "Buka Lemari Arsip & SOP",
      },
    ],
    menusAllowed: [
      "Beranda",
      "Panduan Penggunaan",
      "Barang & Alat Terapi (Pantau, Update Kebersihan & Kelengkapan Part)",
      "Paket Alat (Kit) (Lihat, Pinjam & Bantu Pengembalian Tim)",
      "Pinjam, Kembali & Opname (Pinjam, Kembalikan & Tab Stock Opname)",
      "Pengajuan & Persetujuan (Lihat Semua & Setujui Tahap 1)",
      "Lemari Arsip & SOP (Baca Seluruh Dokumen Operasional & SOP)",
      "Cek Ruangan & Ekspor (Checklist Opname, Persetujuan Tahap 1 & Ekspor Operasional)",
      "Profil Saya (Ubah Data Profil Pribadi)",
    ],
  },
  SUPER_ADMIN: {
    role: "SUPER_ADMIN",
    badgeTitle: "Admin Operasional (Pengelola Utama)",
    tagline:
      "Anda mengelola seluruh operasional harian StarOps: mendaftarkan barang & paket kit, mencetak stiker barcode, mencatat pengiriman & konversi stok, mengelola Brankas Akun Digital, membuat cadangan data, dan mengelola akun Terapis serta Kepala Terapis.",
    cardBorder: "border-violet-200 dark:border-violet-900/50",
    headerBg:
      "bg-gradient-to-r from-violet-50 via-indigo-50/70 to-white dark:from-violet-950/40 dark:to-slate-900",
    accentText: "text-violet-800 dark:text-violet-200",
    whatToKnow: [
      "Daftarkan barang baru di Barang & Alat Terapi atau langsung ubah paket masuk yang diterima menjadi stok barang dalam 1 klik di Paket & Pengiriman, lalu cetak stikernya di Cetak Stiker Barcode.",
      "Kelola Brankas Akun Digital (tambah, ubah, lihat sandi, dan rotasi sandi saat staf offboard), serta pantau seluruh aktivitas tim melalui Riwayat Aktivitas.",
      "Di Pengaturan & Tim, Anda dapat membuat, mengubah jabatan, menonaktifkan, dan offboard akun Terapis serta Kepala Terapis (akun Admin Operasional & Owner dikelola khusus oleh Owner).",
      "Keputusan tata kelola risiko tinggi tetap khusus Owner: Pengesahan Akhir pengajuan beranggaran/penghapusan aset, status Hapus Buku (DIHAPUSBUKU), Penguncian Laporan Bulanan, Point-in-Time Restore database, dan Hapus Permanen Tempat Sampah.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Kelola Barang, Kit & Cetak Stiker Barcode",
        detail:
          "Daftarkan barang baru di Barang & Alat Terapi (kode dibuat otomatis), susun Paket Alat (Kit), lalu buka Cetak Stiker Barcode untuk mencetak label thermal, A4 grid, atau punggung map arsip.",
        href: "/inventory",
        buttonLabel: "Kelola Barang & Alat",
      },
      {
        step: "Langkah 2",
        title: "Catat Paket Pengiriman & Konversi ke Stok",
        detail:
          "Buka Paket & Pengiriman untuk mencatat paket masuk/keluar, mencetak Surat Jalan & BAST PDF, dan mengubah paket masuk menjadi stok inventaris secara otomatis.",
        href: "/deliveries",
        buttonLabel: "Buka Paket & Pengiriman",
      },
      {
        step: "Langkah 3",
        title: "Kelola Brankas Akun Digital & Arsip Hybrid",
        detail:
          "Simpan akun langganan terenkripsi, jadwal tagihan, dan lakukan rotasi sandi di Brankas Akun Digital. Kelola lokasi lemari fisik & revisi file digital di Lemari Arsip & SOP.",
        href: "/vault",
        buttonLabel: "Buka Brankas Akun Digital",
      },
      {
        step: "Langkah 4",
        title: "Verifikasi Pengajuan, Backup & Kelola Tim",
        detail:
          "Verifikasi pengajuan tahap 2 di Pengajuan & Persetujuan, buat cadangan data manual/cut-off di Laporan & Cadangan Data, dan kelola akun Terapis & Kepala Terapis di Pengaturan & Tim.",
        href: "/backup",
        buttonLabel: "Buka Laporan & Cadangan",
      },
    ],
    menusAllowed: [
      "Akses operasional ke seluruh 14 menu StarOps",
      "Tambah, Ubah & Hapus Lunak Barang, Paket Kit, Arsip, Pengiriman (+ Konversi Stok), dan Brankas Akun Digital (+ Rotasi Sandi)",
      "Cetak Stiker Barcode (Thermal, A4 Grid, Punggung Map)",
      "Verifikasi Tahap 2 Pengajuan, Ekspor Laporan Lengkap, Buat & Unduh Cadangan Data, Riwayat Aktivitas, dan Pulihkan Tempat Sampah",
      "Kelola Akun Terapis & Kepala Terapis (Pengelolaan Admin/Owner, Hapus Permanen, Restore DB & Pengesahan Akhir khusus Owner)",
    ],
  },
  OWNER: {
    role: "OWNER",
    badgeTitle: "Owner (Pemilik / Direktur)",
    tagline:
      "Anda memegang kendali tertinggi dan akses penuh atas seluruh modul operasional StarOps sekaligus wewenang eksklusif untuk pengesahan anggaran, penghapusan aset, penguncian laporan bulanan, pemulihan database, hapus permanen, dan manajemen seluruh peran.",
    cardBorder: "border-amber-200 dark:border-amber-900/50",
    headerBg:
      "bg-gradient-to-r from-amber-50 via-yellow-50/70 to-white dark:from-amber-950/40 dark:to-slate-900",
    accentText: "text-amber-900 dark:text-amber-200",
    whatToKnow: [
      "Owner tidak pernah terkunci dari fungsi operasional: Anda dapat melakukan seluruh aksi Admin Operasional (termasuk kelola Brankas Digital & rotasi sandi, kelola Pengiriman & konversi stok, checklist opname, dan buat cadangan data).",
      "Wewenang eksklusif Owner: (1) Pengesahan Akhir pengajuan beranggaran & penghapusan aset (bisa langsung mengesahkan dari tahap Admin), (2) Menandai barang status Hapus Buku (DIHAPUSBUKU), dan (3) Mengesahkan serta Mengunci Laporan Akhir Bulan.",
      "Kontrol risiko tinggi khusus Owner: Point-in-Time Restore database di Laporan & Cadangan Data dan Hapus Permanen (Purge) di Tempat Sampah (30 Hari).",
      "Hanya Owner yang dapat membuat, mengubah peran, menonaktifkan, atau offboard akun Admin Operasional dan Owner di Pengaturan & Tim.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Pengesahan Akhir Pengajuan & Penghapusan Aset",
        detail:
          "Buka menu Pengajuan & Persetujuan lalu periksa antrean 'Menunggu Pengesahan Owner' (atau langsung sahkan dari tahap Admin) untuk pengadaan beranggaran dan penghapusan aset rusak berat.",
        href: "/requests",
        buttonLabel: "Buka Pengajuan & Persetujuan",
      },
      {
        step: "Langkah 2",
        title: "Kunci Laporan Bulanan, Cadangan & Point-in-Time Restore",
        detail:
          "Buka Laporan & Cadangan Data untuk meninjau opname ruangan, mengunduh laporan resmi Excel/PDF, membuat snapshot cadangan, mengunci periode bulanan, atau menjalankan Point-in-Time Restore bila diperlukan.",
        href: "/backup",
        buttonLabel: "Buka Laporan & Cadangan",
      },
      {
        step: "Langkah 3",
        title: "Kendali Brankas Digital, Logistik & Jejak Audit",
        detail:
          "Kelola penuh langganan, biaya, sandi, dan rotasi keamanan di Brankas Akun Digital, kelola Paket & Pengiriman, serta pantau seluruh perubahan sistem di Riwayat Aktivitas.",
        href: "/vault",
        buttonLabel: "Buka Brankas Akun Digital",
      },
      {
        step: "Langkah 4",
        title: "Kelola Seluruh Peran Tim & Tempat Sampah",
        detail:
          "Atur seluruh akun pengguna (Terapis, Kepala Terapis, Admin Operasional, dan Owner) di Pengaturan & Tim, serta pulihkan atau bersihkan permanen data di Tempat Sampah (30 Hari).",
        href: "/settings",
        buttonLabel: "Buka Pengaturan & Tim",
      },
    ],
    menusAllowed: [
      "Akses penuh ke seluruh 14 menu & seluruh fungsi operasional StarOps",
      "Eksklusif Owner: Pengesahan Akhir Pengadaan Beranggaran & Penghapusan Aset (DIHAPUSBUKU)",
      "Eksklusif Owner: Pengesahan Akhir & Penguncian Periode Laporan Bulanan",
      "Eksklusif Owner: Point-in-Time Restore Database & Hapus Permanen (Purge) Tempat Sampah",
      "Eksklusif Owner: Manajemen Seluruh Peran Pengguna (Termasuk Admin Operasional & Owner)",
    ],
  },
};

type GlossaryTerm = {
  term: string;
  meaning: string;
  icon: LucideIcon;
  roles: readonly Role[];
};

const SIMPLE_GLOSSARY: readonly GlossaryTerm[] = [
  {
    term: "Paket Alat (Kit)",
    meaning:
      "Kumpulan beberapa alat terapi yang sering dipakai bersama dalam satu kotak/tas, sehingga saat dipinjam cukup 1 klik saja.",
    icon: Boxes,
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  },
  {
    term: "Part Kurang (Kepingan Kurang)",
    meaning:
      "Kondisi saat jumlah bagian/kepingan di dalam mainan (misal keping puzzle atau kartu flashcard) lebih sedikit dari jumlah seharusnya.",
    icon: Package,
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  },
  {
    term: "Status Kebersihan (Sanitasi)",
    meaning:
      "Penanda kondisi kebersihan mainan terapi (Steril, Perlu Dicuci, Sedang Disanitasi) agar setiap sesi terapi selalu higienis dan aman untuk anak.",
    icon: Sparkles,
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  },
  {
    term: "Panduan SOP",
    meaning:
      "Kumpulan dokumen prosedur terapi resmi yang dibagikan untuk seluruh terapis agar mudah dibaca dan diunduh kapan saja.",
    icon: Archive,
    roles: ["STAFF"],
  },
  {
    term: "Lemari Arsip & SOP",
    meaning:
      "Daftar dokumen penting kantor dan panduan SOP terapi — mencatat lokasi lemari & laci fisik sekaligus menyimpan lampiran file digital dan riwayat versinya.",
    icon: Archive,
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER"],
  },
  {
    term: "Cek Ruangan (Stock Opname)",
    meaning:
      "Kegiatan memeriksa kesesuaian barang fisik di tiap ruangan dengan catatan aplikasi (dilakukan rutin mulai tanggal 24 tiap bulan).",
    icon: CalendarClock,
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER"],
  },
  {
    term: "Brankas Akun Digital (Vault)",
    meaning:
      "Tempat aman terenkripsi AES-256 untuk menyimpan email, kata sandi, slot pemakai, dan jadwal bayar akun langganan kantor (Zoom, Canva, Google Workspace, dll.).",
    icon: KeyRound,
    roles: ["OWNER", "SUPER_ADMIN"],
  },
  {
    term: "Hapus Buku (Penghapusan Aset)",
    meaning:
      "Mengeluarkan barang yang rusak berat dan tidak dapat diperbaiki lagi dari daftar aset aktif (status DIHAPUSBUKU hanya dapat disahkan oleh Owner).",
    icon: ShieldCheck,
    roles: ["OWNER", "SUPER_ADMIN"],
  },
  {
    term: "Point-in-Time Restore & Purge Permanen",
    meaning:
      "Wewenang khusus Owner untuk memulihkan database ke snapshot backup tertentu (dengan cadangan pengaman otomatis) atau menghapus permanen data dari Tempat Sampah.",
    icon: DatabaseBackup,
    roles: ["OWNER"],
  },
];

export default async function UserGuidePage() {
  const user = await requireRouteAccess("/guide");
  const currentRoleGuide = ROLE_GUIDES[user.role];
  const visibleRules = GOLDEN_RULES.filter((rule) => rule.roles.includes(user.role));
  const visibleSteps = currentRoleGuide.dailySteps.filter((step) =>
    canAccessRoute(user.role, step.href),
  );
  const visibleGlossary = SIMPLE_GLOSSARY.filter((item) => item.roles.includes(user.role));
  const primaryStep = visibleSteps[0];

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <Card className="overflow-hidden border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-sky-50/60 to-emerald-50/80 shadow-xs dark:border-indigo-900/50 dark:from-indigo-950/50 dark:via-slate-900 dark:to-emerald-950/30">
        <CardContent className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-indigo-300">
              <BookOpen className="size-3.5 text-amber-500" />
              <span>Panduan Khusus {ROLE_LABELS[user.role].title} · Star Champs Indonesia</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Cara Mudah Menggunakan StarOps
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Panduan ini disusun khusus untuk peran{" "}
              <strong>
                {ROLE_LABELS[user.role].title} ({ROLE_LABELS[user.role].subtitle})
              </strong>{" "}
              agar seluruh tugas harian Anda di StarOps berjalan cepat, jelas, dan rapi.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-muted-foreground text-xs">Anda sedang masuk sebagai:</span>
            <RoleBadge role={user.role} showSubtitle className="px-3 py-1 text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Role-Filtered Golden Rules */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            🌟 Hal Penting untuk {ROLE_LABELS[user.role].title}
          </h2>
          <p className="text-muted-foreground text-sm">
            Aturan dasar yang relevan dengan pekerjaan Anda sehari-hari di StarOps.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRules.map((rule, idx) => (
            <Card key={rule.id} className={rule.color}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${rule.iconColor}`}
                  >
                    <rule.icon className="size-4" />
                  </span>
                  <CardTitle className="text-sm leading-snug font-semibold">
                    {idx + 1}. {rule.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs leading-relaxed">
                {rule.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Section 2: Current User's Role Guide ONLY */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            👤 Panduan Lengkap Peran Anda ({ROLE_LABELS[user.role].title})
          </h2>
          <p className="text-muted-foreground text-sm">
            Ringkasan hak akses, langkah kerja harian, dan daftar menu yang tersedia di akun Anda.
          </p>
        </div>

        <Card className={currentRoleGuide.cardBorder}>
          <CardHeader className={`${currentRoleGuide.headerBg} border-b`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <RoleBadge role={currentRoleGuide.role} showSubtitle />
                  <Badge variant="secondary" className="text-[11px]">
                    Peran Anda Saat Ini
                  </Badge>
                </div>
                <CardTitle className="text-xl font-bold">{currentRoleGuide.badgeTitle}</CardTitle>
              </div>
            </div>
            <CardDescription className="text-foreground/80 pt-1 text-sm leading-relaxed">
              {currentRoleGuide.tagline}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-6">
            {/* Apa Saja yang Perlu Diketahui */}
            <div className="space-y-3">
              <h3
                className={`flex items-center gap-2 text-sm font-bold ${currentRoleGuide.accentText}`}
              >
                <CheckCircle2 className="size-4" />
                <span>Apa Saja yang Perlu Anda Ketahui?</span>
              </h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {currentRoleGuide.whatToKnow.map((point, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 rounded-xl border bg-slate-50/60 p-3 text-xs leading-relaxed dark:bg-slate-900/50"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {idx + 1}
                    </span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Langkah Cara Penggunaan Sehari-hari */}
            <div className="space-y-3">
              <h3
                className={`flex items-center gap-2 text-sm font-bold ${currentRoleGuide.accentText}`}
              >
                <Sparkles className="size-4" />
                <span>Cara Penggunaan Sehari-hari (Langkah Demi Langkah)</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleSteps.map((step) => (
                  <div
                    key={step.step}
                    className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 shadow-2xs dark:bg-slate-900"
                  >
                    <div className="space-y-1.5">
                      <Badge variant="outline" className="text-[11px] font-semibold">
                        {step.step}
                      </Badge>
                      <h4 className="text-sm font-semibold">{step.title}</h4>
                      <p className="text-muted-foreground text-xs leading-relaxed">{step.detail}</p>
                    </div>
                    <div>
                      <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                        <Link href={step.href}>
                          <span>{step.buttonLabel}</span>
                          <ArrowRight className="ml-1.5 size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Menu yang Bisa Diakses */}
            <div className="rounded-xl border bg-slate-50/70 p-4 dark:bg-slate-900/40">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase opacity-80">
                <Users className="size-3.5" />
                <span>Daftar Menu yang Terbuka untuk {ROLE_LABELS[user.role].title}:</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {currentRoleGuide.menusAllowed.map((m) => (
                  <Badge
                    key={m}
                    variant="secondary"
                    className="bg-white text-xs font-normal shadow-2xs dark:bg-slate-800"
                  >
                    ✓ {m}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 3: Role-Filtered Glossary */}
      <section className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <HelpCircle className="size-5 text-indigo-600" />
            <span>Kamus Istilah Sederhana</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Penjelasan singkat untuk istilah yang muncul di menu aplikasi Anda.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleGlossary.map((item) => (
            <Card key={item.term} className="bg-white/90 dark:bg-slate-900">
              <CardHeader className="pb-1.5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                    <item.icon className="size-4" />
                  </span>
                  <span>{item.term}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs leading-relaxed">
                {item.meaning}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer Callout */}
      <Card className="border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-sky-50/80 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-sky-950/30">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h3 className="text-sm font-bold">Siap Mulai Bekerja Hari Ini?</h3>
            <p className="text-muted-foreground text-xs">
              Anda bisa membuka kembali halaman panduan ini kapan saja lewat tombol{" "}
              <strong>Panduan</strong> di pojok kanan atas layar atau dari menu sebelah kiri.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="bg-white">
              <Link href="/dashboard">Kembali ke Beranda</Link>
            </Button>
            {primaryStep && (
              <Button asChild size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">
                <Link href={primaryStep.href}>
                  <span>{primaryStep.buttonLabel}</span>
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
