import {
  Archive,
  ArrowLeftRight,
  Barcode,
  BookOpen,
  Boxes,
  ClipboardCheck,
  DatabaseBackup,
  History,
  KeyRound,
  LayoutDashboard,
  Package,
  Settings,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { ROUTE_PERMISSIONS, type Role } from "@/lib/rbac";

export type NavItem = {
  title: string;
  /** Short Indonesian description, used as tooltip and page subtitle. */
  description: string;
  href: string;
  icon: LucideIcon;
  /** Soft colorful badge style for minimalist icon pill */
  colorClass: string;
  roles: readonly Role[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

function item(
  href: keyof typeof ROUTE_PERMISSIONS,
  title: string,
  description: string,
  icon: LucideIcon,
  colorClass: string,
): NavItem {
  return {
    href,
    title,
    description,
    icon,
    colorClass,
    roles: ROUTE_PERMISSIONS[href],
  };
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Utama",
    items: [
      item(
        "/dashboard",
        "Beranda",
        "Ringkasan kegiatan operasional hari ini",
        LayoutDashboard,
        "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300",
      ),
      item(
        "/guide",
        "Panduan Penggunaan",
        "Cara pakai aplikasi untuk setiap peran",
        BookOpen,
        "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
      ),
    ],
  },
  {
    label: "Alat & Barang",
    items: [
      item(
        "/inventory",
        "Barang & Alat Terapi",
        "Mainan terapi, perlengkapan kantor & stok habis pakai",
        Package,
        "bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300",
      ),
      item(
        "/kits",
        "Paket Alat (Kit)",
        "Gabungan beberapa alat untuk dipinjam sekaligus",
        Boxes,
        "bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
      ),
      item(
        "/scan",
        "Pinjam & Kembalikan",
        "Scan stiker barang untuk pinjam, kembalikan & cek ruangan",
        ArrowLeftRight,
        "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
      ),
      item(
        "/barcode-studio",
        "Cetak Stiker Barcode",
        "Buat dan cetak label stiker untuk ditempel di barang",
        Barcode,
        "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
      ),
    ],
  },
  {
    label: "Kegiatan Kantor",
    items: [
      item(
        "/requests",
        "Pengajuan & Persetujuan",
        "Ajukan beli barang, lapor rusak & persetujuan atasan",
        ClipboardCheck,
        "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
      ),
      item(
        "/archives",
        "Lemari Arsip & SOP",
        "Panduan SOP terapi, berkas di lemari & dokumen digital",
        Archive,
        "bg-teal-100 text-teal-600 dark:bg-teal-950/60 dark:text-teal-300",
      ),
      item(
        "/deliveries",
        "Paket & Pengiriman",
        "Catat paket masuk/keluar & cetak surat jalan",
        Truck,
        "bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300",
      ),
      item(
        "/vault",
        "Brankas Akun Digital",
        "Penyimpanan akun langganan, email & kata sandi kantor",
        KeyRound,
        "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-300",
      ),
    ],
  },
  {
    label: "Laporan & Pengaturan",
    items: [
      item(
        "/backup",
        "Laporan & Cadangan Data",
        "Unduh laporan Excel/PDF & pengecekan akhir bulan",
        DatabaseBackup,
        "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
      ),
      item(
        "/audit-log",
        "Riwayat Aktivitas",
        "Catatan siapa mengubah data dan kapan",
        History,
        "bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300",
      ),
      item(
        "/recycle-bin",
        "Tempat Sampah (30 Hari)",
        "Kembalikan data yang tidak sengaja terhapus",
        Trash2,
        "bg-pink-100 text-pink-600 dark:bg-pink-950/60 dark:text-pink-300",
      ),
      item(
        "/settings",
        "Pengaturan & Tim",
        "Ubah profil diri & kelola akun anggota tim",
        Settings,
        "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      ),
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function getNavGroupsForRole(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((i) => i.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function getNavItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.href === href);
}
