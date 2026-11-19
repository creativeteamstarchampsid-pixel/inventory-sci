import {
  Archive,
  ArrowLeftRight,
  Barcode,
  ClipboardCheck,
  DatabaseBackup,
  History,
  KeyRound,
  LayoutDashboard,
  Package,
  Settings,
  Trash2,
  Truck,
  Boxes,
  type LucideIcon,
} from "lucide-react";

import { ROUTE_PERMISSIONS, type Role } from "@/lib/rbac";

export type NavItem = {
  title: string;
  /** Short Indonesian description, used as tooltip and page subtitle. */
  description: string;
  href: string;
  icon: LucideIcon;
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
): NavItem {
  return { href, title, description, icon, roles: ROUTE_PERMISSIONS[href] };
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Utama",
    items: [
      item("/dashboard", "Dashboard", "Ringkasan operasional Star Champs", LayoutDashboard),
    ],
  },
  {
    label: "Inventaris",
    items: [
      item(
        "/inventory",
        "Inventaris & Alat Terapi",
        "Alat terapi, aset kantor & barang habis pakai",
        Package,
      ),
      item("/kits", "Kit", "Paket beberapa item untuk check-out 1 klik", Boxes),
      item(
        "/barcode-studio",
        "Barcode Studio",
        "Cetak label barcode & QR (thermal, A4, spine)",
        Barcode,
      ),
      item("/scan", "Scan Pinjam/Kembali", "Scan barcode untuk pinjam & kembalikan", ArrowLeftRight),
    ],
  },
  {
    label: "Operasional",
    items: [
      item(
        "/vault",
        "Subscription Vault",
        "Langganan digital, kata sandi terenkripsi & tagihan",
        KeyRound,
      ),
      item("/archives", "Arsip Hybrid", "Arsip fisik (lemari/laci) & file digital", Archive),
      item("/deliveries", "Pengiriman", "Paket masuk/keluar, Surat Jalan & BAST", Truck),
      item(
        "/requests",
        "Permintaan & Persetujuan",
        "Tiket permintaan internal & e-approval",
        ClipboardCheck,
      ),
    ],
  },
  {
    label: "Manajemen",
    items: [
      item("/audit-log", "Log Aktivitas", "Jejak audit seluruh aktivitas", History),
      item(
        "/backup",
        "Ekspor & Backup",
        "Ekspor CSV/XLSX/PDF, rekonsiliasi & backup bulanan",
        DatabaseBackup,
      ),
      item("/recycle-bin", "Recycle Bin", "Data terhapus (dipulihkan ≤ 30 hari)", Trash2),
      item("/settings", "Pengaturan", "Profil & pengaturan sistem", Settings),
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
