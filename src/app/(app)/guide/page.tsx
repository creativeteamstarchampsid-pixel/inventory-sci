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
  Truck,
  Users,
} from "lucide-react";

import { RoleBadge } from "@/components/layout/role-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRouteAccess } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Panduan Penggunaan",
};

const GOLDEN_RULES = [
  {
    title: "1. Kode Stiker Barang Dibuat Otomatis",
    description:
      "Saat Admin mendaftarkan barang baru, aplikasi langsung membuatkan kode rapi seperti SC-SNS-R01-0001 (artinya: barang Star Champs, kategori Sensori, di Ruang Terapi 1, urutan ke-1). Anda tidak perlu mengarang atau menghafal kode sendiri.",
    icon: Barcode,
    color: "border-fuchsia-200/80 bg-fuchsia-50/50 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20",
    iconColor: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-300",
  },
  {
    title: "2. Biasakan Scan Saat Pinjam & Kembalikan",
    description:
      "Setiap mengambil mainan terapi atau Paket Alat (Kit) untuk sesi, scan stikernya di menu Pinjam & Kembalikan. Selesai sesi, hitung kepingannya (misalnya puzzle 10 keping) lalu scan kembalikan agar tidak ada bagian mainan yang tercecer.",
    icon: ArrowLeftRight,
    color: "border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    iconColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  },
  {
    title: "3. Tandai Kebersihan Mainan Selesai Sesi",
    description:
      "Mainan terapi memiliki 3 tanda kebersihan: Steril (siap dipakai), Perlu Dicuci (baru selesai dipakai anak), dan Sedang Dibersihkan. Siapa pun boleh mengubah tanda ini supaya terapis berikutnya tahu mana alat yang siap pakai.",
    icon: Sparkles,
    color: "border-sky-200/80 bg-sky-50/50 dark:border-sky-900/40 dark:bg-sky-950/20",
    iconColor: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
  },
  {
    title: "4. Alur Pengajuan Berjenjang & Transparan",
    description:
      "Butuh beli alat baru, lapor mainan rusak, atau minta akses akun? Isi di menu Pengajuan & Persetujuan. Permintaan Anda akan diteruskan secara berurutan dari Terapis → Kepala Terapis → Admin Operasional → Owner.",
    icon: ClipboardCheck,
    color: "border-rose-200/80 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20",
    iconColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
  },
  {
    title: "5. Salah Hapus? Masuk Tempat Sampah 30 Hari",
    description:
      "Data yang dihapus tidak langsung hilang selamanya, melainkan disimpan dulu di menu Tempat Sampah selama 30 hari. Jika tidak sengaja terhapus, Admin Operasional atau Owner bisa mengembalikannya dalam 1 klik.",
    icon: Trash2,
    color: "border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20",
    iconColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  },
  {
    title: "6. Cek Ruangan Akhir Bulan (Mulai Tanggal 24)",
    description:
      "Setiap tanggal 24 sampai akhir bulan, muncul pengingat di bagian atas layar. Tim mengecek kesesuaian barang di tiap ruangan, Kepala Terapis & Admin memeriksa, lalu Owner mengesahkan laporan bulanan.",
    icon: CalendarClock,
    color: "border-indigo-200/80 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
    iconColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
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
      "Fokus utama Anda adalah kelancaran sesi terapi: meminjam & mengembalikan mainan terapi, menjaga kebersihan alat, membaca panduan SOP, serta melapor bila ada alat yang rusak atau kepingannya kurang.",
    cardBorder: "border-emerald-200 dark:border-emerald-900/50",
    headerBg: "bg-gradient-to-r from-emerald-50 via-teal-50/70 to-white dark:from-emerald-950/40 dark:to-slate-900",
    accentText: "text-emerald-800 dark:text-emerald-200",
    whatToKnow: [
      "Anda bisa melihat seluruh daftar mainan terapi dan paket alat, tetapi Anda tidak perlu khawatir salah menghapus barang karena tombol tambah/hapus barang hanya muncul di akun Admin.",
      "Setiap selesai memakai mainan, hitung dulu kepingannya. Kalau ada kepingan yang terselip, catat jumlah kepingan yang tersisa saat mengembalikan agar otomatis ditandai 'Part Kurang'.",
      "Jangan lupa ubah status kebersihan mainan menjadi 'Perlu Dicuci' setelah selesai dipakai terapi, dan ubah kembali ke 'Steril' sesudah dicuci/dibersihkan.",
      "Jika butuh alat baru atau menemukan alat yang rusak, buat laporan di menu Pengajuan & Persetujuan — tidak perlu lewat chat terpisah agar tidak terlupa.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Meminjam & Mengembalikan Alat Terapi",
        detail:
          "Buka menu Pinjam & Kembalikan. Anda bisa menyalakan kamera HP/laptop untuk scan stiker barcode pada mainan atau mengetik kodenya, pilih ruangan terapi, lalu klik Pinjam. Selesai sesi, scan kembali di halaman yang sama untuk mengembalikannya.",
        href: "/scan",
        buttonLabel: "Buka Pinjam & Kembalikan",
      },
      {
        step: "Langkah 2",
        title: "Meminjam Paket Alat (Kit) Sekaligus",
        detail:
          "Kalau Anda memakai satu kotak paket berisi beberapa mainan sekaligus (misalnya Paket Sensori Dasar), buka menu Paket Alat (Kit) lalu klik Pinjam Kit tanpa perlu scan satu per satu.",
        href: "/kits",
        buttonLabel: "Buka Paket Alat (Kit)",
      },
      {
        step: "Langkah 3",
        title: "Update Cuci Mainan & Lapor Kepingan Kurang",
        detail:
          "Buka menu Barang & Alat Terapi, klik salah satu mainan untuk memperbarui status kebersihannya (Steril / Perlu Dicuci / Sedang Dibersihkan) atau mencatat jumlah kepingan yang ada saat ini.",
        href: "/inventory",
        buttonLabel: "Buka Barang & Alat Terapi",
      },
      {
        step: "Langkah 4",
        title: "Membaca SOP & Membuat Pengajuan",
        detail:
          "Buka Lemari Arsip & SOP untuk membaca panduan kerja resmi yang dibagikan untuk staf. Jika ingin mengajukan pembelian alat atau lapor kerusakan, buka menu Pengajuan & Persetujuan.",
        href: "/requests",
        buttonLabel: "Buka Pengajuan & Persetujuan",
      },
    ],
    menusAllowed: [
      "Beranda",
      "Panduan Penggunaan",
      "Barang & Alat Terapi (Lihat, Update Kebersihan & Lapor Kepingan)",
      "Paket Alat / Kit (Lihat & Pinjam)",
      "Pinjam & Kembalikan (Scan Barcode)",
      "Lemari Arsip & SOP (Khusus Dokumen SOP Publik)",
      "Pengajuan & Persetujuan (Buat & Pantau Pengajuan Sendiri)",
      "Pengaturan & Tim (Ubah Profil Pribadi)",
    ],
  },
  TEAM_LEADER: {
    role: "TEAM_LEADER",
    badgeTitle: "Kepala Terapis (Koordinator Tim)",
    tagline:
      "Fokus utama Anda adalah mendampingi tim terapis, memeriksa & menyetujui pengajuan tahap pertama dari terapis, memastikan pengecekan ruangan terapi beres setiap akhir bulan, serta memantau laporan.",
    cardBorder: "border-sky-200 dark:border-sky-900/50",
    headerBg: "bg-gradient-to-r from-sky-50 via-cyan-50/70 to-white dark:from-sky-950/40 dark:to-slate-900",
    accentText: "text-sky-800 dark:text-sky-200",
    whatToKnow: [
      "Setiap pengajuan yang dibuat oleh Terapis akan masuk ke antrean Anda terlebih dahulu ('Menunggu Kepala Terapis'). Setelah Anda setujui, barulah pengajuan diteruskan ke Admin Operasional.",
      "Anda bisa melihat daftar akun aplikasi kantor di Brankas Akun Digital (siapa saja yang memakai akun tersebut dan kapan jatuh temponya), namun harga langganan dan kata sandi rahasia tetap disembunyikan.",
      "Setiap tanggal 24 hingga akhir bulan, Anda bertugas mengecek kelengkapan alat di tiap ruangan terapi (R01–R06) dan memberikan tanda persetujuan Kepala Terapis di menu Laporan & Cadangan Data.",
      "Anda dapat mengunduh laporan inventaris dalam bentuk Excel, CSV, atau PDF kapan saja.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Memeriksa & Menyetujui Pengajuan dari Terapis",
        detail:
          "Buka menu Pengajuan & Persetujuan. Periksa pengajuan berstatus 'Menunggu Team Leader'. Klik Setujui bila sudah sesuai agar diteruskan ke Admin Operasional, atau Tolak beserta alasannya.",
        href: "/requests",
        buttonLabel: "Periksa Pengajuan Tim",
      },
      {
        step: "Langkah 2",
        title: "Cek Kelengkapan Barang per Ruangan Terapi",
        detail:
          "Buka menu Pinjam & Kembalikan (tab Stock Opname) atau menu Laporan & Cadangan Data untuk mencentang ruangan terapi (R01 s/d R06) yang sudah diperiksa kelengkapan alatnya.",
        href: "/scan",
        buttonLabel: "Cek Ruangan Terapi",
      },
      {
        step: "Langkah 3",
        title: "Memantau Pengiriman, Arsip & Riwayat Aktivitas",
        detail:
          "Anda dapat melihat seluruh dokumen di Lemari Arsip & SOP, memantau status paket kiriman di menu Paket & Pengiriman, serta melihat siapa meminjam/mengubah apa di Riwayat Aktivitas.",
        href: "/audit-log",
        buttonLabel: "Lihat Riwayat Aktivitas",
      },
      {
        step: "Langkah 4",
        title: "Menyetujui Laporan Akhir Bulan & Unduh Excel/PDF",
        detail:
          "Menjelang akhir bulan (mulai tanggal 24), buka menu Laporan & Cadangan Data, pastikan progres cek ruangan mencapai 100%, lalu klik tombol Setujui sebagai Kepala Terapis.",
        href: "/backup",
        buttonLabel: "Buka Laporan Bulanan",
      },
    ],
    menusAllowed: [
      "Semua menu Terapis",
      "Pengajuan & Persetujuan (Lihat Semua & Setujui Tahap 1)",
      "Brankas Akun Digital (Lihat Daftar Akun & Pemakai, Tanpa Kata Sandi/Harga)",
      "Paket & Pengiriman (Lihat Status Paket Masuk/Keluar)",
      "Riwayat Aktivitas (Pantau Kegiatan Tim)",
      "Laporan & Cadangan Data (Unduh Excel/PDF & Setujui Cek Ruangan Bulanan)",
    ],
  },
  SUPER_ADMIN: {
    role: "SUPER_ADMIN",
    badgeTitle: "Admin Operasional (Pengelola Utama)",
    tagline:
      "Anda adalah pengelola harian seluruh operasional StarOps: mendaftarkan barang baru, mencetak stiker barcode, mencatat paket masuk/keluar, mengelola Brankas Akun Digital, membuat cadangan data, hingga mendaftarkan akun staf baru.",
    cardBorder: "border-violet-200 dark:border-violet-900/50",
    headerBg: "bg-gradient-to-r from-violet-50 via-indigo-50/70 to-white dark:from-violet-950/40 dark:to-slate-900",
    accentText: "text-violet-800 dark:text-violet-200",
    whatToKnow: [
      "Setiap ada barang atau mainan baru datang, daftarkan di Barang & Alat Terapi (atau langsung ubah Paket Masuk yang sudah diterima menjadi stok barang dalam 1 klik di menu Paket & Pengiriman!).",
      "Setelah barang terdaftar, buka Cetak Stiker Barcode untuk mencetak label stiker (bisa ukuran printer stiker thermal, kertas A4, atau punggung map arsip) lalu tempelkan pada barang.",
      "Di menu Pengajuan & Persetujuan, pengajuan biasa (seperti lapor rusak ringan atau akses akun) bisa langsung Anda selesaikan. Namun pengajuan Pembelian Barang Berbiaya dan Penghapusan Aset Rusak Berat wajib diteruskan ke Owner untuk persetujuan akhir.",
      "Jika ada staf yang keluar (resign), buka menu Pengaturan & Tim lalu klik 'Tandai Sudah Keluar'. Aplikasi akan otomatis memberi tahu Anda jika staf tersebut masih terdaftar memakai akun di Brankas Digital agar kata sandinya segera Anda ganti.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Mendaftarkan Barang Baru & Mencetak Stiker Barcode",
        detail:
          "Buka menu Barang & Alat Terapi → klik Tambah Item. Pilih kategori & ruangan, unggah foto bila ada, lalu simpan (kode dibuat otomatis). Setelah itu buka Cetak Stiker Barcode untuk mencetak stikernya.",
        href: "/inventory",
        buttonLabel: "Kelola Barang & Alat",
      },
      {
        step: "Langkah 2",
        title: "Mencatat Paket Kiriman & Cetak Surat Jalan",
        detail:
          "Buka menu Paket & Pengiriman untuk mencatat paket masuk atau keluar, mengunggah foto bukti terima, mencetak Surat Jalan / Berita Acara PDF, dan memasukkan isi paket masuk langsung ke daftar stok barang.",
        href: "/deliveries",
        buttonLabel: "Buka Paket & Pengiriman",
      },
      {
        step: "Langkah 3",
        title: "Mengelola Brankas Akun Digital & Lemari Arsip",
        detail:
          "Simpan email, kata sandi, dan tanggal jatuh tempo langganan aplikasi kantor (Zoom, Canva, Google Workspace, dll.) di Brankas Akun Digital. Simpan lokasi berkas lemari fisik & file PDF di Lemari Arsip & SOP.",
        href: "/vault",
        buttonLabel: "Buka Brankas Akun Digital",
      },
      {
        step: "Langkah 4",
        title: "Membuat Akun Staf Baru & Cadangan Data",
        detail:
          "Buka Pengaturan & Tim → klik Tambah / Undang Pengguna untuk membuatkan akun login Terapis atau Kepala Terapis. Buka Laporan & Cadangan Data untuk membuat cadangan data (backup) kapan saja.",
        href: "/settings",
        buttonLabel: "Kelola Akun Tim",
      },
    ],
    menusAllowed: [
      "Akses penuh ke seluruh 13 menu StarOps",
      "Tambah, Ubah & Hapus Barang, Paket Kit, Lemari Arsip, Paket Pengiriman, dan Brankas Akun Digital",
      "Cetak Stiker Barcode (Thermal, A4, Punggung Map)",
      "Buat & Pulihkan Cadangan Data (Backup) serta Kosongkan Tempat Sampah",
      "Tambah Akun Pengguna Baru, Ubah Jabatan (Staf / Kepala Terapis / Admin), & Nonaktifkan Staf Keluar",
    ],
  },
  OWNER: {
    role: "OWNER",
    badgeTitle: "Owner (Pemilik / Direktur)",
    tagline:
      "Anda memegang kendali tertinggi: memantau kesehatan aset & biaya langganan klinik, memberikan keputusan akhir untuk pembelian berbiaya dan penghapusan aset, serta mengunci laporan akhir bulan.",
    cardBorder: "border-amber-200 dark:border-amber-900/50",
    headerBg: "bg-gradient-to-r from-amber-50 via-yellow-50/70 to-white dark:from-amber-950/40 dark:to-slate-900",
    accentText: "text-amber-900 dark:text-amber-200",
    whatToKnow: [
      "Keputusan yang menyangkut anggaran dan nilai aset hanya bisa disahkan oleh akun Owner: (1) Pengajuan Pembelian Barang yang memiliki estimasi biaya, (2) Pengajuan Penghapusan Aset (barang rusak berat yang dikeluarkan dari daftar aset aktif), dan (3) Penguncian Laporan Akhir Bulan.",
      "Anda dapat membuka dan melihat kata sandi asli di Brankas Akun Digital (setiap kali kata sandi dibuka, sistem otomatis mencatatnya di Riwayat Aktivitas demi keamanan bersama).",
      "Hanya akun Owner yang dapat mengangkat atau mengubah seseorang menjadi Owner baru di menu Pengaturan & Tim.",
      "Jika ada data yang terhapus di Tempat Sampah (30 Hari), Anda juga dapat memulihkannya kembali kapan saja.",
    ],
    dailySteps: [
      {
        step: "Langkah 1",
        title: "Menyetujui Pengajuan Pembelian & Penghapusan Aset",
        detail:
          "Buka menu Pengajuan & Persetujuan, lalu filter status 'Menunggu Owner'. Ini adalah pengajuan yang sudah diperiksa oleh Kepala Terapis dan Admin Operasional serta membutuhkan persetujuan akhir Anda.",
        href: "/requests",
        buttonLabel: "Buka Persetujuan Owner",
      },
      {
        step: "Langkah 2",
        title: "Mengesahkan & Mengunci Laporan Akhir Bulan",
        detail:
          "Di akhir bulan, buka menu Laporan & Cadangan Data. Setelah Admin Operasional dan Kepala Terapis selesai memverifikasi pengecekan ruangan, klik 'Pengesahan Akhir Owner' untuk mengunci laporan bulan tersebut.",
        href: "/backup",
        buttonLabel: "Buka Laporan Akhir Bulan",
      },
      {
        step: "Langkah 3",
        title: "Memantau Biaya Langganan Digital & Riwayat Aktivitas",
        detail:
          "Buka Brankas Akun Digital untuk melihat total biaya bulanan/tahunan aplikasi kantor dan melihat kata sandi bila diperlukan. Buka Riwayat Aktivitas untuk memantau seluruh perubahan data.",
        href: "/vault",
        buttonLabel: "Cek Brankas & Tagihan",
      },
      {
        step: "Langkah 4",
        title: "Mengatur Peran & Akses Seluruh Tim",
        detail:
          "Buka menu Pengaturan & Tim untuk menambah akun baru, mengatur jabatan (Terapis, Kepala Terapis, Admin Operasional, atau Owner), maupun menonaktifkan akun.",
        href: "/settings",
        buttonLabel: "Buka Pengaturan & Tim",
      },
    ],
    menusAllowed: [
      "Akses ke seluruh menu & laporan StarOps",
      "Persetujuan Akhir (E-Approval) Pengadaan Barang Berbiaya & Penghapusan Aset",
      "Pengesahan Akhir & Penguncian Laporan Bulanan",
      "Lihat Biaya & Buka Kata Sandi di Brankas Akun Digital",
      "Pulihkan Data dari Tempat Sampah & Kelola Seluruh Peran Pengguna (Termasuk Owner)",
    ],
  },
};

const SIMPLE_GLOSSARY = [
  {
    term: "Paket Alat (Kit)",
    meaning:
      "Kumpulan beberapa alat terapi yang sering dipakai bersama dalam satu kotak/tas, sehingga saat dipinjam cukup 1 klik saja.",
    icon: Boxes,
  },
  {
    term: "Part Kurang (Kepingan Kurang)",
    meaning:
      "Kondisi saat jumlah bagian/kepingan di dalam mainan (misal keping puzzle atau kartu flashcard) jumlahnya lebih sedikit dari jumlah seharusnya.",
    icon: Package,
  },
  {
    term: "Brankas Akun Digital (Vault)",
    meaning:
      "Tempat aman di dalam aplikasi untuk menyimpan email, kata sandi, dan jadwal bayar akun langganan kantor (seperti Zoom, Canva, Wi-Fi, dll.).",
    icon: KeyRound,
  },
  {
    term: "Lemari Arsip & SOP",
    meaning:
      "Daftar dokumen penting kantor dan panduan SOP terapi — mencatat di lemari dan laci mana berkas fisiknya disimpan sekaligus menyimpan file PDF-nya.",
    icon: Archive,
  },
  {
    term: "Cek Ruangan (Stock Opname)",
    meaning:
      "Kegiatan memeriksa apakah barang fisik yang ada di ruangan terapi sudah cocok dengan catatan di aplikasi (dilakukan rutin mulai tanggal 24 tiap bulan).",
    icon: CalendarClock,
  },
  {
    term: "Hapus Buku (Penghapusan Aset)",
    meaning:
      "Mengeluarkan barang yang sudah rusak berat dan tidak bisa diperbaiki lagi dari daftar barang aktif (harus melalui persetujuan Owner).",
    icon: ShieldCheck,
  },
];

export default async function UserGuidePage() {
  const user = await requireRouteAccess("/guide");
  const currentRoleGuide = ROLE_GUIDES[user.role];

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <Card className="overflow-hidden border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-sky-50/60 to-emerald-50/80 shadow-xs dark:border-indigo-900/50 dark:from-indigo-950/50 dark:via-slate-900 dark:to-emerald-950/30">
        <CardContent className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-2xs dark:bg-slate-800 dark:text-indigo-300">
              <BookOpen className="size-3.5 text-amber-500" />
              <span>Panduan Ramah Pengguna · Star Champs Indonesia</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Cara Mudah Menggunakan StarOps
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Panduan ini dibuat dengan bahasa sehari-hari agar seluruh tim — mulai dari{" "}
              <strong>Terapis</strong>, <strong>Kepala Terapis</strong>,{" "}
              <strong>Admin Operasional</strong>, hingga <strong>Owner</strong> — dapat langsung
              menggunakan aplikasi dengan nyaman.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-muted-foreground text-xs">Anda sedang masuk sebagai:</span>
            <RoleBadge role={user.role} showSubtitle className="px-3 py-1 text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Section 1: 6 Hal Penting yang Wajib Diketahui Semua Orang */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            🌟 6 Hal Penting yang Perlu Diketahui Setiap Pengguna
          </h2>
          <p className="text-muted-foreground text-sm">
            Aturan dasar sehari-hari supaya semua alat terapi, dokumen, dan laporan selalu rapi.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GOLDEN_RULES.map((rule) => (
            <Card key={rule.title} className={rule.color}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${rule.iconColor}`}
                  >
                    <rule.icon className="size-4" />
                  </span>
                  <CardTitle className="text-sm leading-snug font-semibold">
                    {rule.title}
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

      {/* Section 2: Panduan Lengkap per Jabatan (Tabs) */}
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              👥 Panduan Lengkap untuk Setiap Jabatan (Role)
            </h2>
            <p className="text-muted-foreground text-sm">
              Tab pertama yang terbuka di bawah ini sudah disesuaikan dengan jabatan Anda saat ini (
              <strong>{ROLE_LABELS[user.role].title}</strong>). Klik tab lain untuk melihat tugas
              jabatan lainnya.
            </p>
          </div>
        </div>

        <Tabs defaultValue={user.role} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 bg-slate-100/80 p-1.5 sm:grid-cols-4 dark:bg-slate-900">
            <TabsTrigger
              value="STAFF"
              className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
            >
              🟢 Terapis (Staf)
            </TabsTrigger>
            <TabsTrigger
              value="TEAM_LEADER"
              className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-sky-600 data-[state=active]:text-white"
            >
              🔵 Kepala Terapis
            </TabsTrigger>
            <TabsTrigger
              value="SUPER_ADMIN"
              className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-violet-600 data-[state=active]:text-white"
            >
              🟣 Admin Operasional
            </TabsTrigger>
            <TabsTrigger
              value="OWNER"
              className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-amber-600 data-[state=active]:text-white"
            >
              🟡 Owner (Pemilik)
            </TabsTrigger>
          </TabsList>

          {(["STAFF", "TEAM_LEADER", "SUPER_ADMIN", "OWNER"] as const).map((r) => {
            const g = ROLE_GUIDES[r];
            return (
              <TabsContent key={r} value={r} className="space-y-4">
                <Card className={g.cardBorder}>
                  <CardHeader className={`${g.headerBg} border-b`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={g.role} showSubtitle />
                          {g.role === user.role && (
                            <Badge variant="secondary" className="text-[11px]">
                              Jabatan Anda Saat Ini
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-xl font-bold">{g.badgeTitle}</CardTitle>
                      </div>
                    </div>
                    <CardDescription className="text-foreground/80 pt-1 text-sm leading-relaxed">
                      {g.tagline}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-6 pt-6">
                    {/* Apa Saja yang Perlu Diketahui */}
                    <div className="space-y-3">
                      <h3 className={`flex items-center gap-2 text-sm font-bold ${g.accentText}`}>
                        <CheckCircle2 className="size-4" />
                        <span>Apa Saja yang Perlu Anda Ketahui?</span>
                      </h3>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {g.whatToKnow.map((point, idx) => (
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
                      <h3 className={`flex items-center gap-2 text-sm font-bold ${g.accentText}`}>
                        <Sparkles className="size-4" />
                        <span>Cara Penggunaan Sehari-hari (Langkah Demi Langkah)</span>
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {g.dailySteps.map((step) => (
                          <div
                            key={step.step}
                            className="flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 shadow-2xs dark:bg-slate-900"
                          >
                            <div className="space-y-1.5">
                              <Badge variant="outline" className="text-[11px] font-semibold">
                                {step.step}
                              </Badge>
                              <h4 className="text-sm font-semibold">{step.title}</h4>
                              <p className="text-muted-foreground text-xs leading-relaxed">
                                {step.detail}
                              </p>
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
                        <span>Daftar Menu yang Terbuka untuk {ROLE_LABELS[g.role].title}:</span>
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {g.menusAllowed.map((m) => (
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
              </TabsContent>
            );
          })}
        </Tabs>
      </section>

      {/* Section 3: Kamus Istilah Sederhana */}
      <section className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <HelpCircle className="size-5 text-indigo-600" />
            <span>Kamus Istilah Sederhana (Biar Tidak Bingung)</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Penjelasan singkat untuk beberapa istilah yang ada di dalam menu aplikasi.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SIMPLE_GLOSSARY.map((item) => (
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
            <Button asChild size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">
              <Link href={ currentRoleGuide.dailySteps[0].href }>
                <span>{currentRoleGuide.dailySteps[0].buttonLabel}</span>
                <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
