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
  MapPin,
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

type RoleOverride = {
  title?: string;
  description?: string;
};

type NavItemDefinition = NavItem & {
  overrides?: Partial<Record<Role, RoleOverride>>;
};

type NavGroupDefinition = {
  label: string;
  labelByRole?: Partial<Record<Role, string>>;
  items: NavItemDefinition[];
};

function item(
  href: keyof typeof ROUTE_PERMISSIONS,
  title: string,
  description: string,
  icon: LucideIcon,
  colorClass: string,
  overrides?: Partial<Record<Role, RoleOverride>>,
): NavItemDefinition {
  return {
    href,
    title,
    description,
    icon,
    colorClass,
    roles: ROUTE_PERMISSIONS[href],
    overrides,
  };
}

function resolveItemForRole(def: NavItemDefinition, role?: Role): NavItem {
  const override = role ? def.overrides?.[role] : undefined;
  return {
    href: def.href,
    title: override?.title ?? def.title,
    description: override?.description ?? def.description,
    icon: def.icon,
    colorClass: def.colorClass,
    roles: def.roles,
  };
}

const NAV_GROUP_DEFINITIONS: NavGroupDefinition[] = [
  {
    label: "Utama",
    items: [
      item(
        "/dashboard",
        "Beranda",
        "Ringkasan kegiatan operasional hari ini",
        LayoutDashboard,
        "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300",
        {
          STAFF: { description: "Ringkasan kegiatan terapi hari ini" },
          TEAM_LEADER: { description: "Ringkasan operasional tim terapis hari ini" },
          OWNER: { description: "Ringkasan eksekutif & pengesahan Owner" },
        },
      ),
      item(
        "/guide",
        "Panduan Penggunaan",
        "Cara pakai aplikasi sesuai peran Anda",
        BookOpen,
        "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
        {
          STAFF: { description: "Panduan praktis penggunaan harian untuk Terapis" },
          TEAM_LEADER: { description: "Panduan koordinasi & opname untuk Kepala Terapis" },
          SUPER_ADMIN: { description: "Panduan pengelolaan harian untuk Admin Operasional" },
          OWNER: { description: "Panduan kendali penuh & pengesahan untuk Owner" },
        },
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
        {
          STAFF: {
            description: "Lihat daftar alat terapi, status kebersihan & kelengkapan kepingan",
          },
          TEAM_LEADER: {
            description: "Pantau daftar alat terapi, kebersihan & kelengkapan kepingan",
          },
        },
      ),
      item(
        "/kits",
        "Paket Alat (Kit)",
        "Gabungan beberapa alat untuk dipinjam sekaligus",
        Boxes,
        "bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
        {
          STAFF: { description: "Lihat & pinjam paket alat terapi sekaligus" },
          TEAM_LEADER: { description: "Pinjam, kembalikan & pantau paket alat terapi" },
        },
      ),
      item(
        "/scan",
        "Pinjam, Kembali & Opname",
        "Scan stiker barang untuk pinjam, kembalikan & stock opname",
        ArrowLeftRight,
        "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
        {
          STAFF: {
            title: "Pinjam & Kembalikan",
            description: "Scan stiker barang untuk pinjam & kembalikan alat terapi",
          },
        },
      ),
      item(
        "/barcode-studio",
        "Cetak Stiker Barcode",
        "Buat dan cetak label stiker untuk ditempel di barang & map arsip",
        Barcode,
        "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
      ),
      item(
        "/rooms",
        "Ruangan & Lemari",
        "Atur nama ruangan terapi, gudang & lemari arsip",
        MapPin,
        "bg-teal-100 text-teal-600 dark:bg-teal-950/60 dark:text-teal-300",
      ),
    ],
  },
  {
    label: "Kegiatan Kantor",
    labelByRole: {
      STAFF: "Kegiatan Harian",
      TEAM_LEADER: "Kegiatan Tim",
    },
    items: [
      item(
        "/requests",
        "Pengajuan & Persetujuan",
        "Ajukan beli barang, lapor rusak & persetujuan berjenjang",
        ClipboardCheck,
        "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
        {
          STAFF: {
            title: "Pengajuan Saya",
            description: "Buat pengajuan alat atau lapor kerusakan & pantau statusnya",
          },
          TEAM_LEADER: {
            description: "Periksa pengajuan tim terapis & ajukan kebutuhan ruang",
          },
          OWNER: {
            description: "Tinjau & berikan pengesahan akhir pengajuan tim",
          },
        },
      ),
      item(
        "/archives",
        "Lemari Arsip & SOP",
        "Panduan SOP terapi, berkas di lemari & dokumen digital",
        Archive,
        "bg-teal-100 text-teal-600 dark:bg-teal-950/60 dark:text-teal-300",
        {
          STAFF: {
            title: "Panduan SOP",
            description: "Baca panduan SOP terapi yang dibagikan untuk tim",
          },
          TEAM_LEADER: {
            description: "Baca panduan SOP terapi & dokumen operasional klinik",
          },
        },
      ),
      item(
        "/deliveries",
        "Paket & Pengiriman",
        "Catat paket masuk/keluar, cetak surat jalan & konversi stok",
        Truck,
        "bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300",
      ),
      item(
        "/vault",
        "Brankas Akun Digital",
        "Kelola akun langganan, tagihan & kata sandi terenkripsi",
        KeyRound,
        "bg-cyan-100 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-300",
      ),
    ],
  },
  {
    label: "Laporan & Pengaturan",
    labelByRole: {
      STAFF: "Akun",
      TEAM_LEADER: "Opname & Akun",
    },
    items: [
      item(
        "/backup",
        "Laporan & Cadangan Data",
        "Unduh laporan Excel/PDF, rekonsiliasi akhir bulan & cadangan data",
        DatabaseBackup,
        "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
        {
          TEAM_LEADER: {
            title: "Cek Ruangan & Ekspor",
            description: "Checklist opname ruangan akhir bulan & ekspor data operasional",
          },
          OWNER: {
            description: "Ekspor laporan, kunci akhir bulan, cadangan data & restore",
          },
        },
      ),
      item(
        "/audit-log",
        "Riwayat Aktivitas",
        "Catatan real-time siapa mengubah data dan kapan",
        History,
        "bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300",
      ),
      item(
        "/recycle-bin",
        "Tempat Sampah (30 Hari)",
        "Kembalikan data yang terhapus dalam 30 hari",
        Trash2,
        "bg-pink-100 text-pink-600 dark:bg-pink-950/60 dark:text-pink-300",
        {
          OWNER: {
            description: "Pulihkan data terhapus atau hapus permanen",
          },
        },
      ),
      item(
        "/settings",
        "Pengaturan & Tim",
        "Ubah profil diri & kelola akun anggota tim",
        Settings,
        "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        {
          STAFF: {
            title: "Profil Saya",
            description: "Perbarui nama, telepon & data profil pribadi Anda",
          },
          TEAM_LEADER: {
            title: "Profil Saya",
            description: "Perbarui nama, telepon & data profil pribadi Anda",
          },
        },
      ),
    ],
  },
];

export const NAV_GROUPS: NavGroup[] = NAV_GROUP_DEFINITIONS.map((g) => ({
  label: g.label,
  items: g.items.map((def) => resolveItemForRole(def)),
}));

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function getNavGroupsForRole(role: Role): NavGroup[] {
  if (role === "TEAM_LEADER") {
    // Keep `/backup` ("Cek Ruangan & Ekspor") under Kegiatan Tim and `/settings` ("Profil Saya") cleanly under Akun.
    const groups: NavGroup[] = [];
    for (const def of NAV_GROUP_DEFINITIONS) {
      if (def.label === "Kegiatan Kantor") {
        const items = def.items
          .filter((i) => i.roles.includes(role))
          .map((i) => resolveItemForRole(i, role));
        const backupDef = NAV_GROUP_DEFINITIONS.flatMap((g) => g.items).find(
          (i) => i.href === "/backup",
        );
        if (backupDef && backupDef.roles.includes(role)) {
          items.push(resolveItemForRole(backupDef, role));
        }
        if (items.length > 0) {
          groups.push({ label: "Kegiatan Tim", items });
        }
        continue;
      }
      if (def.label === "Laporan & Pengaturan") {
        const settingsDef = def.items.find((i) => i.href === "/settings");
        if (settingsDef && settingsDef.roles.includes(role)) {
          groups.push({
            label: "Akun",
            items: [resolveItemForRole(settingsDef, role)],
          });
        }
        continue;
      }
      const items = def.items
        .filter((i) => i.roles.includes(role))
        .map((i) => resolveItemForRole(i, role));
      if (items.length > 0) {
        groups.push({
          label: def.labelByRole?.[role] ?? def.label,
          items,
        });
      }
    }
    return groups;
  }

  return NAV_GROUP_DEFINITIONS.map((group) => ({
    label: group.labelByRole?.[role] ?? group.label,
    items: group.items
      .filter((i) => i.roles.includes(role))
      .map((i) => resolveItemForRole(i, role)),
  })).filter((group) => group.items.length > 0);
}

export function getNavItem(href: string, role?: Role): NavItem | undefined {
  const def = NAV_GROUP_DEFINITIONS.flatMap((g) => g.items).find((i) => i.href === href);
  return def ? resolveItemForRole(def, role) : undefined;
}
