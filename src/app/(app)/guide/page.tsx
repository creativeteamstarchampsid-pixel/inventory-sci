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

import { KawaiiPageHeader } from "@/components/cartoon/kawaii-decor";
import { KawaiiMascotSvg, type KawaiiMascotType } from "@/components/cartoon/kawaii-icons";
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
  numberBg: string;
  roles: readonly Role[];
};

const GOLDEN_RULES: readonly GoldenRule[] = [
  {
    id: "owner-governance",
    title: "Kendali Penuh & Wewenang Khusus Owner",
    description:
      "Sebagai Owner, Anda memiliki akses operasional penuh ke seluruh 14 menu StarOps sekaligus wewenang eksklusif untuk Pengesahan Akhir pengajuan beranggaran, Penghapusan Aset (Hapus Buku), Penguncian Laporan Bulanan, Point-in-Time Restore database, Hapus Permanen Tempat Sampah, dan Manajemen akun Admin Operasional & Owner.",
    icon: ShieldCheck,
    color: "bg-[#FEF3C7] dark:bg-amber-950/40",
    iconColor: "bg-[#FFFDF7] text-amber-700 dark:bg-stone-900 dark:text-amber-300",
    numberBg: "bg-[#FDE68A] text-[#2C2623] dark:bg-amber-800 dark:text-amber-100",
    roles: ["OWNER"],
  },
  {
    id: "auto-code",
    title: "Kode Stiker Barang Dibuat Otomatis",
    description:
      "Saat mendaftarkan barang baru di Barang & Alat Terapi, aplikasi langsung membuatkan kode rapi seperti SC-SNS-R01-0001 (Star Champs · kategori Sensori · Ruang Terapi 1 · urutan ke-1) tanpa perlu mengarang kode manual.",
    icon: Barcode,
    color: "bg-[#FFE4E6] dark:bg-rose-950/35",
    iconColor: "bg-[#FFFDF7] text-rose-700 dark:bg-stone-900 dark:text-rose-300",
    numberBg: "bg-[#FECDD3] text-[#2C2623] dark:bg-rose-800 dark:text-rose-100",
    roles: ["OWNER", "SUPER_ADMIN"],
  },
  {
    id: "scan-borrow",
    title: "Biasakan Scan Saat Pinjam & Kembalikan",
    description:
      "Setiap mengambil mainan terapi atau Paket Alat (Kit) untuk sesi, scan stikernya di menu Pinjam & Kembalikan. Selesai sesi, hitung kepingannya (misalnya puzzle 10 keping) lalu scan kembalikan agar tidak ada bagian mainan yang tercecer.",
    icon: ArrowLeftRight,
    color: "bg-[#D1FAE5] dark:bg-emerald-950/35",
    iconColor: "bg-[#FFFDF7] text-emerald-700 dark:bg-stone-900 dark:text-emerald-300",
    numberBg: "bg-[#A7F3D0] text-[#2C2623] dark:bg-emerald-800 dark:text-emerald-100",
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  },
  {
    id: "hygiene-status",
    title: "Tandai Kebersihan Mainan Selesai Sesi",
    description:
      "Mainan terapi memiliki 3 tanda kebersihan: Steril (siap dipakai), Perlu Dicuci (baru selesai dipakai anak), dan Sedang Disanitasi. Perbarui tanda ini segera setelah sesi agar terapis berikutnya tahu mana alat yang siap pakai.",
    icon: Sparkles,
    color: "bg-[#E0F2FE] dark:bg-sky-950/35",
    iconColor: "bg-[#FFFDF7] text-sky-700 dark:bg-stone-900 dark:text-sky-300",
    numberBg: "bg-[#BAE6FD] text-[#2C2623] dark:bg-sky-800 dark:text-sky-100",
    roles: ["OWNER", "SUPER_ADMIN", "TEAM_LEADER", "STAFF"],
  },
  {
    id: "staff-requests",
    title: "Laporkan Kerusakan & Kebutuhan lewat Pengajuan Saya",
    description:
      "Butuh alat terapi baru, menemukan kerusakan, atau ada kepingan mainan yang hilang? Catat langsung di menu Pengajuan Saya agar mudah dipantau status prosesnya tanpa terlewat di chat.",
    icon: ClipboardCheck,
    color: "bg-[#FFE4E6] dark:bg-rose-950/35",
    iconColor: "bg-[#FFFDF7] text-rose-700 dark:bg-stone-900 dark:text-rose-300",
    numberBg: "bg-[#FECDD3] text-[#2C2623] dark:bg-rose-800 dark:text-rose-100",
    roles: ["STAFF"],
  },
  {
    id: "staff-sop",
    title: "Akses Panduan SOP Terapi Kapan Saja",
    description:
      "Seluruh panduan kerja dan SOP terapi terbaru yang dibagikan klinik tersedia rapi di menu Panduan SOP. Anda bisa membuka pratinjau langsung atau mengunduhnya saat dibutuhkan.",
    icon: Archive,
    color: "bg-[#EDE9FE] dark:bg-violet-950/35",
    iconColor: "bg-[#FFFDF7] text-violet-700 dark:bg-stone-900 dark:text-violet-300",
    numberBg: "bg-[#DDD6FE] text-[#2C2623] dark:bg-violet-800 dark:text-violet-100",
    roles: ["STAFF"],
  },
  {
    id: "tl-approval",
    title: "Periksa Pengajuan Tim Sebelum Diteruskan",
    description:
      "Pengajuan yang dikirim tim terapis masuk ke antrean tahap pertama di menu Pengajuan & Persetujuan. Periksa kelengkapannya lalu setujui agar diteruskan ke tahap berikutnya, atau tolak dengan alasan jelas.",
    icon: ClipboardCheck,
    color: "bg-[#FFE4E6] dark:bg-rose-950/35",
    iconColor: "bg-[#FFFDF7] text-rose-700 dark:bg-stone-900 dark:text-rose-300",
    numberBg: "bg-[#FECDD3] text-[#2C2623] dark:bg-rose-800 dark:text-rose-100",
    roles: ["TEAM_LEADER"],
  },
  {
    id: "tl-opname",
    title: "Cek Ruangan Akhir Bulan (Mulai Tanggal 24)",
    description:
      "Setiap tanggal 24 hingga akhir bulan, muncul pengingat cek ruangan di bagian atas layar. Lakukan stock opname fisik tiap ruangan terapi lalu tandai kelengkapannya di menu Cek Ruangan & Ekspor.",
    icon: CalendarClock,
    color: "bg-[#EDE9FE] dark:bg-violet-950/35",
    iconColor: "bg-[#FFFDF7] text-violet-700 dark:bg-stone-900 dark:text-violet-300",
    numberBg: "bg-[#DDD6FE] text-[#2C2623] dark:bg-violet-800 dark:text-violet-100",
    roles: ["TEAM_LEADER"],
  },
  {
    id: "admin-approval",
    title: "Alur Pengajuan Berjenjang & Pengesahan Owner",
    description:
      "Permintaan internal mengalir berjenjang dari Terapis → Kepala Terapis → Admin Operasional → Owner. Pengajuan pengadaan beranggaran dan penghapusan aset (Hapus Buku) wajib disahkan Owner.",
    icon: ClipboardCheck,
    color: "bg-[#FFEDD5] dark:bg-orange-950/35",
    iconColor: "bg-[#FFFDF7] text-orange-700 dark:bg-stone-900 dark:text-orange-300",
    numberBg: "bg-[#FED7AA] text-[#2C2623] dark:bg-orange-800 dark:text-orange-100",
    roles: ["OWNER", "SUPER_ADMIN"],
  },
  {
    id: "admin-recycle",
    title: "Salah Hapus? Pulihkan dari Tempat Sampah (30 Hari)",
    description:
      "Data yang dihapus masuk ke Tempat Sampah selama 30 hari dan dapat dipulihkan kapan saja. Penghapusan permanen sebelum masa retensi berakhir hanya dapat dilakukan oleh Owner demi keamanan data.",
    icon: Trash2,
    color: "bg-[#FEF3C7] dark:bg-amber-950/35",
    iconColor: "bg-[#FFFDF7] text-amber-700 dark:bg-stone-900 dark:text-amber-300",
    numberBg: "bg-[#FDE68A] text-[#2C2623] dark:bg-amber-800 dark:text-amber-100",
    roles: ["SUPER_ADMIN"],
  },
  {
    id: "owner-recycle",
    title: "Tempat Sampah 30 Hari, Cadangan & Restore Database",
    description:
      "Data yang dihapus lunak disimpan di Tempat Sampah selama 30 hari untuk pemulihan cepat. Hanya Owner yang berwenang melakukan hapus permanen (purge) maupun Point-in-Time Restore database dari snapshot backup.",
    icon: DatabaseBackup,
    color: "bg-[#EDE9FE] dark:bg-violet-950/35",
    iconColor: "bg-[#FFFDF7] text-violet-700 dark:bg-stone-900 dark:text-violet-300",
    numberBg: "bg-[#DDD6FE] text-[#2C2623] dark:bg-violet-800 dark:text-violet-100",
    roles: ["OWNER"],
  },
  {
    id: "admin-cutoff",
    title: "Rekonsiliasi & Cadangan Data Akhir Bulan",
    description:
      "Mulai tanggal 24 tiap bulan, verifikasi hasil stock opname seluruh ruangan dan buat snapshot cadangan data (Pre-Update / Cut-Off) di menu Laporan & Cadangan Data sebelum periode dikunci oleh Owner.",
    icon: CalendarClock,
    color: "bg-[#EDE9FE] dark:bg-violet-950/35",
    iconColor: "bg-[#FFFDF7] text-violet-700 dark:bg-stone-900 dark:text-violet-300",
    numberBg: "bg-[#DDD6FE] text-[#2C2623] dark:bg-violet-800 dark:text-violet-100",
    roles: ["SUPER_ADMIN"],
  },
];

type RoleGuide = {
  role: Role;
  badgeTitle: string;
  tagline: string;
  mascot: KawaiiMascotType;
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
    mascot: "dino",
    headerBg:
      "bg-gradient-to-r from-[#D1FAE5] via-[#FEF3C7]/70 to-[#FFFDF7] dark:from-emerald-950/55 dark:via-amber-950/25 dark:to-stone-900",
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
    mascot: "cat",
    headerBg:
      "bg-gradient-to-r from-[#E0F2FE] via-[#D1FAE5]/70 to-[#FFFDF7] dark:from-sky-950/55 dark:via-emerald-950/25 dark:to-stone-900",
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
    mascot: "chiikawa",
    headerBg:
      "bg-gradient-to-r from-[#EDE9FE] via-[#FFE4E6]/70 to-[#FFFDF7] dark:from-violet-950/55 dark:via-rose-950/25 dark:to-stone-900",
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
    mascot: "star",
    headerBg:
      "bg-gradient-to-r from-[#FEF3C7] via-[#FFEDD5]/75 to-[#FFFDF7] dark:from-amber-950/55 dark:via-orange-950/25 dark:to-stone-900",
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

const STEP_STICKER_STYLES = [
  {
    circle: "bg-[#D1FAE5] text-[#2C2623] dark:bg-emerald-900 dark:text-emerald-100",
    pill: "bg-[#D1FAE5]/80 text-[#2C2623] dark:bg-emerald-950/70 dark:text-emerald-100",
    tint: "bg-gradient-to-br from-[#D1FAE5]/35 via-[#FFFDF7] to-[#FFFDF7] dark:from-emerald-950/25 dark:via-stone-900 dark:to-stone-900",
  },
  {
    circle: "bg-[#E0F2FE] text-[#2C2623] dark:bg-sky-900 dark:text-sky-100",
    pill: "bg-[#E0F2FE]/80 text-[#2C2623] dark:bg-sky-950/70 dark:text-sky-100",
    tint: "bg-gradient-to-br from-[#E0F2FE]/35 via-[#FFFDF7] to-[#FFFDF7] dark:from-sky-950/25 dark:via-stone-900 dark:to-stone-900",
  },
  {
    circle: "bg-[#FEF3C7] text-[#2C2623] dark:bg-amber-900 dark:text-amber-100",
    pill: "bg-[#FEF3C7]/80 text-[#2C2623] dark:bg-amber-950/70 dark:text-amber-100",
    tint: "bg-gradient-to-br from-[#FEF3C7]/45 via-[#FFFDF7] to-[#FFFDF7] dark:from-amber-950/25 dark:via-stone-900 dark:to-stone-900",
  },
  {
    circle: "bg-[#FFE4E6] text-[#2C2623] dark:bg-rose-900 dark:text-rose-100",
    pill: "bg-[#FFE4E6]/80 text-[#2C2623] dark:bg-rose-950/70 dark:text-rose-100",
    tint: "bg-gradient-to-br from-[#FFE4E6]/35 via-[#FFFDF7] to-[#FFFDF7] dark:from-rose-950/25 dark:via-stone-900 dark:to-stone-900",
  },
] as const;

const GLOSSARY_ICON_STYLES = [
  "bg-[#D1FAE5] text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200",
  "bg-[#E0F2FE] text-sky-800 dark:bg-sky-950/70 dark:text-sky-200",
  "bg-[#FEF3C7] text-amber-800 dark:bg-amber-950/70 dark:text-amber-200",
  "bg-[#FFE4E6] text-rose-800 dark:bg-rose-950/70 dark:text-rose-200",
  "bg-[#EDE9FE] text-violet-800 dark:bg-violet-950/70 dark:text-violet-200",
  "bg-[#FFEDD5] text-orange-800 dark:bg-orange-950/70 dark:text-orange-200",
] as const;

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
    <div className="space-y-8 pb-4">
      {/* 2D Japanese Cartoon Kawaii Page Header */}
      <KawaiiPageHeader
        mascot="book"
        accent="butter"
        badge={`Panduan Khusus ${ROLE_LABELS[user.role].title} · Star Champs Indonesia`}
        title="Cara Mudah Menggunakan StarOps"
        description={`Panduan ini disusun khusus untuk peran ${ROLE_LABELS[user.role].title} (${ROLE_LABELS[user.role].subtitle}) agar seluruh tugas harian Anda di StarOps berjalan cepat, jelas, dan rapi.`}
        actions={
          <div className="flex flex-col items-start gap-1.5 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] px-3.5 py-2.5 shadow-[3px_3px_0px_0px_#2C2623] sm:items-end dark:border-stone-500 dark:bg-stone-900">
            <span className="text-muted-foreground text-[11px] font-bold">
              Anda sedang masuk sebagai:
            </span>
            <RoleBadge
              role={user.role}
              showSubtitle
              className="border-2 border-[#2C2623] px-3 py-1 text-xs font-bold dark:border-stone-500"
            />
          </div>
        }
      />

      {/* Section 1: Role-Filtered Golden Rules */}
      <section className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] px-3 py-0.5 text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-100">
              <Sparkles className="size-3.5" />
              <span>Aturan Emas</span>
            </span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-[#2C2623] dark:text-stone-100">
            🌟 Hal Penting untuk {ROLE_LABELS[user.role].title}
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            Aturan dasar yang relevan dengan pekerjaan Anda sehari-hari di StarOps.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRules.map((rule, idx) => (
            <Card
              key={rule.id}
              className={`group gap-3 rounded-3xl border-2 border-[#2C2623] py-5 shadow-[4px_4px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#2C2623] dark:border-stone-500 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)] ${rule.color}`}
            >
              <CardHeader className="px-5 pb-0">
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <span
                      className={`flex size-11 items-center justify-center rounded-2xl border-2 border-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-transform group-hover:-rotate-3 dark:border-stone-500 ${rule.iconColor}`}
                    >
                      <rule.icon className="size-5" />
                    </span>
                    <span
                      className={`absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full border-2 border-[#2C2623] text-[11px] font-black shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500 ${rule.numberBg}`}
                    >
                      {idx + 1}
                    </span>
                  </div>
                  <CardTitle className="pt-0.5 text-sm leading-snug font-black text-[#2C2623] dark:text-stone-100">
                    {rule.title}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-5 text-xs leading-relaxed font-medium text-[#463F3A] dark:text-stone-200">
                {rule.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Section 2: Current User's Role Guide ONLY */}
      <section className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#D1FAE5] px-3 py-0.5 text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-emerald-950/70 dark:text-emerald-100">
              <BookOpen className="size-3.5" />
              <span>Buku Saku Peran</span>
            </span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-[#2C2623] dark:text-stone-100">
            👤 Panduan Lengkap Peran Anda ({ROLE_LABELS[user.role].title})
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            Ringkasan hak akses, langkah kerja harian, dan daftar menu yang tersedia di akun Anda.
          </p>
        </div>

        <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] py-0 shadow-[5px_5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[5px_5px_0px_0px_rgba(0,0,0,0.45)]">
          <CardHeader
            className={`border-b-2 border-[#2C2623] px-5 py-5 sm:px-6 dark:border-stone-500 ${currentRoleGuide.headerBg}`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex size-16 shrink-0 -rotate-2 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1.5 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
                <KawaiiMascotSvg type={currentRoleGuide.mascot} className="size-13" />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge
                    role={currentRoleGuide.role}
                    showSubtitle
                    className="border-2 border-[#2C2623] font-bold dark:border-stone-500"
                  />
                  <Badge
                    variant="secondary"
                    className="border-2 border-[#2C2623] bg-[#FFFDF7] text-[11px] font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    Peran Anda Saat Ini
                  </Badge>
                </div>
                <CardTitle className="text-xl font-black text-[#2C2623] dark:text-stone-100">
                  {currentRoleGuide.badgeTitle}
                </CardTitle>
                <CardDescription className="text-sm leading-relaxed font-medium text-[#463F3A] dark:text-stone-200">
                  {currentRoleGuide.tagline}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-7 p-5 sm:p-6">
            {/* Apa Saja yang Perlu Diketahui */}
            <div className="space-y-3">
              <h3
                className={`flex items-center gap-2 text-sm font-black tracking-wide uppercase ${currentRoleGuide.accentText}`}
              >
                <span className="flex size-7 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-emerald-950/70 dark:text-emerald-200">
                  <CheckCircle2 className="size-4" />
                </span>
                <span>Apa Saja yang Perlu Anda Ketahui?</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {currentRoleGuide.whatToKnow.map((point, idx) => {
                  const style = STEP_STICKER_STYLES[idx % STEP_STICKER_STYLES.length];
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 text-xs leading-relaxed font-medium text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 dark:border-stone-500 dark:bg-stone-800/80 dark:text-stone-100"
                    >
                      <span
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] text-xs font-black shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500 ${style.circle}`}
                      >
                        {idx + 1}
                      </span>
                      <span>{point}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Langkah Cara Penggunaan Sehari-hari (Comic-Book Step Cards) */}
            <div className="space-y-3">
              <h3
                className={`flex items-center gap-2 text-sm font-black tracking-wide uppercase ${currentRoleGuide.accentText}`}
              >
                <span className="flex size-7 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-200">
                  <Sparkles className="size-4" />
                </span>
                <span>Cara Penggunaan Sehari-hari (Langkah Demi Langkah)</span>
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {visibleSteps.map((step, idx) => {
                  const style = STEP_STICKER_STYLES[idx % STEP_STICKER_STYLES.length];
                  return (
                    <div
                      key={step.step}
                      className={`group flex flex-col justify-between gap-4 rounded-2xl border-2 border-[#2C2623] p-4 shadow-[4px_4px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#2C2623] dark:border-stone-500 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)] ${style.tint}`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-3">
                          {/* Numbered Pastel Sticker Circle */}
                          <span
                            className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[#2C2623] text-base font-black shadow-[2px_2px_0px_0px_#2C2623] transition-transform group-hover:scale-105 group-hover:-rotate-6 dark:border-stone-500 ${style.circle}`}
                          >
                            {idx + 1}
                          </span>
                          <div className="space-y-0.5">
                            <Badge
                              variant="outline"
                              className={`border-2 border-[#2C2623] text-[11px] font-black dark:border-stone-500 ${style.pill}`}
                            >
                              {step.step}
                            </Badge>
                            <h4 className="text-sm leading-snug font-black text-[#2C2623] dark:text-stone-100">
                              {step.title}
                            </h4>
                          </div>
                        </div>
                        <p className="text-xs leading-relaxed font-medium text-[#463F3A] dark:text-stone-300">
                          {step.detail}
                        </p>
                      </div>
                      <div>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-extrabold text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#FEF3C7] sm:w-auto dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                        >
                          <Link href={step.href}>
                            <span>{step.buttonLabel}</span>
                            <ArrowRight className="ml-1.5 size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Menu yang Bisa Diakses */}
            <div className="rounded-2xl border-2 border-dashed border-[#2C2623]/65 bg-[#FEF3C7]/40 p-4 dark:border-stone-500 dark:bg-stone-800/50">
              <h4 className="mb-3 flex items-center gap-2 text-xs font-black tracking-wide text-[#2C2623] uppercase dark:text-stone-100">
                <span className="flex size-6 items-center justify-center rounded-lg border-2 border-[#2C2623] bg-[#FFFDF7] dark:border-stone-500 dark:bg-stone-900">
                  <Users className="size-3.5" />
                </span>
                <span>Daftar Menu yang Terbuka untuk {ROLE_LABELS[user.role].title}:</span>
              </h4>
              <div className="flex flex-wrap gap-2">
                {currentRoleGuide.menusAllowed.map((m) => (
                  <Badge
                    key={m}
                    variant="secondary"
                    className="rounded-full border-2 border-[#2C2623] bg-[#FFFDF7] px-3 py-1 text-xs font-bold whitespace-normal text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] px-3 py-0.5 text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-sky-950/70 dark:text-sky-100">
              <HelpCircle className="size-3.5" />
              <span>Kamus Mini</span>
            </span>
          </div>
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-[#2C2623] dark:text-stone-100">
            <span>Kamus Istilah Sederhana</span>
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            Penjelasan singkat untuk istilah yang muncul di menu aplikasi Anda.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleGlossary.map((item, idx) => {
            const iconStyle = GLOSSARY_ICON_STYLES[idx % GLOSSARY_ICON_STYLES.length];
            return (
              <Card
                key={item.term}
                className="group gap-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] py-4 shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:shadow-[3px_3px_0px_0px_rgba(0,0,0,0.45)]"
              >
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="flex items-center gap-2.5 text-sm font-black text-[#2C2623] dark:text-stone-100">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform group-hover:-rotate-6 dark:border-stone-500 ${iconStyle}`}
                    >
                      <item.icon className="size-4" />
                    </span>
                    <span>{item.term}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 text-xs leading-relaxed font-medium text-[#574E49] dark:text-stone-300">
                  {item.meaning}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Footer Callout */}
      <Card className="gap-0 overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-gradient-to-r from-[#D1FAE5] via-[#FEF3C7]/85 to-[#E0F2FE] py-0 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:from-emerald-950/50 dark:via-amber-950/30 dark:to-sky-950/50 dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-15 shrink-0 rotate-2 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1.5 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
              <KawaiiMascotSvg type="chiikawa" className="size-12" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-[#2C2623] dark:text-stone-100">
                Siap Mulai Bekerja Hari Ini? ♪
              </h3>
              <p className="max-w-xl text-xs leading-relaxed font-medium text-[#463F3A] dark:text-stone-200">
                Anda bisa membuka kembali halaman panduan ini kapan saja lewat tombol{" "}
                <strong>Panduan</strong> di pojok kanan atas layar atau dari menu sebelah kiri.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
            >
              <Link href="/dashboard">Kembali ke Beranda</Link>
            </Button>
            {primaryStep && (
              <Button
                asChild
                size="sm"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[2.5px_2.5px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#239c62] dark:border-stone-500"
              >
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
