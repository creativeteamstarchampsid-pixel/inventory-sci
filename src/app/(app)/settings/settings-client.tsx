"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  KeyRound,
  Mail,
  Phone,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
import { RoleBadge } from "@/components/layout/role-badge";
import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createOrInviteUserAction,
  toggleUserActiveAction,
  toggleUserOffboardAction,
  updateOwnProfileAction,
  updateUserRoleAction,
} from "@/lib/actions/settings";
import { formatDateWIB } from "@/lib/constants";
import {
  canManageTargetRole,
  getAssignableRoles,
  ROLE_LABELS,
  type Role,
} from "@/lib/rbac";
import type { Profile } from "@/types/database";

export type OffboardVaultWarning = {
  userId: string;
  subscriptionCodes: string[];
};

type SettingsClientProps = {
  ownProfile: Profile;
  users: Profile[];
  serviceRoleConfigured: boolean;
  offboardVaultWarnings: OffboardVaultWarning[];
};

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.trim() || "SC").replace(/\s+/g, " ");
  const parts = source.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function getRolePastelTheme(role: Role, offboarded: boolean): {
  headerBg: string;
  avatarBg: string;
} {
  if (offboarded) {
    return {
      headerBg: "bg-[#FFE4E6]/80 dark:bg-rose-950/35",
      avatarBg: "bg-[#FDA4AF] text-[#2C2623]",
    };
  }
  switch (role) {
    case "OWNER":
      return {
        headerBg: "bg-[#FFFBE6]/90 dark:bg-amber-950/35",
        avatarBg: "bg-[#FDE68A] text-[#2C2623]",
      };
    case "SUPER_ADMIN":
      return {
        headerBg: "bg-[#F3EEFF]/85 dark:bg-violet-950/35",
        avatarBg: "bg-[#DDD6FE] text-[#2C2623]",
      };
    case "TEAM_LEADER":
      return {
        headerBg: "bg-[#E8F6FF]/85 dark:bg-sky-950/35",
        avatarBg: "bg-[#BAE6FD] text-[#2C2623]",
      };
    default:
      return {
        headerBg: "bg-[#E8FBF1]/85 dark:bg-emerald-950/35",
        avatarBg: "bg-[#A7F3D0] text-[#2C2623]",
      };
  }
}

export function SettingsClient({
  ownProfile,
  users: initialUsers,
  serviceRoleConfigured,
  offboardVaultWarnings,
}: SettingsClientProps) {
  const router = useRouter();
  const { runWithFeedback } = useCartoonFeedback();
  const { user, role, can } = useRole();
  const canManageUsers = can("users.manage");
  const canManageAdmins = can("users.manage_admins");
  const [isPending, startTransition] = useTransition();

  // Personal profile state
  const [fullName, setFullName] = useState(ownProfile.full_name ?? "");
  const [phone, setPhone] = useState(ownProfile.phone ?? "");
  const [jobTitle, setJobTitle] = useState(ownProfile.job_title ?? "");

  // User management state
  const [users, setUsers] = useState<Profile[]>(initialUsers);
  const [teamQuery, setTeamQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<"all" | "active" | "inactive">("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<Role>("STAFF");
  const [newPhone, setNewPhone] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [createMode, setCreateMode] = useState<"password" | "invite">("password");
  const [newPassword, setNewPassword] = useState("");

  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  const vaultWarnMap = useMemo(
    () =>
      new Map<string, string[]>(
        offboardVaultWarnings.map((w) => [w.userId, w.subscriptionCodes]),
      ),
    [offboardVaultWarnings],
  );

  const activeUsersCount = useMemo(
    () => users.filter((u) => u.is_active && !u.offboarded_at).length,
    [users],
  );

  const offboardedUsersCount = useMemo(
    () => users.filter((u) => Boolean(u.offboarded_at)).length,
    [users],
  );

  const filteredUsers = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    return users.filter((member) => {
      if (teamFilter === "active" && (!member.is_active || member.offboarded_at)) {
        return false;
      }
      if (teamFilter === "inactive" && member.is_active && !member.offboarded_at) {
        return false;
      }
      if (q) {
        const hay = [
          member.full_name,
          member.email,
          member.job_title,
          member.phone,
          ROLE_LABELS[member.role]?.title,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, teamQuery, teamFilter]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Menyimpan Profil Pribadi... ✏️",
          workingMessage:
            "Dino Joguman lagi memperbarui kartu profil pribadimu biar tampil makin rapi dan akurat~",
          successTitle: "Profil Tersimpan! ✨",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Yah, Profil Gagal Disimpan...",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          updateOwnProfileAction({
            fullName,
            phone,
            jobTitle,
          }),
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const labelTarget = newFullName.trim() || newEmail.trim() || "anggota baru";
    const isInvite = createMode === "invite";
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: isInvite
            ? "Mengirim Undangan Tim... 💌"
            : "Membuat Akun Anggota Baru... 🌟",
          workingMessage: `Dino Joguman lagi menyiapkan akun ${labelTarget} sebagai ${ROLE_LABELS[newRole].title} di tim Star Champs~`,
          successTitle: isInvite
            ? "Undangan Terkirim! ♪"
            : "Anggota Tim Baru Bergabung! 🎉",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Menambahkan Anggota",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          createOrInviteUserAction({
            email: newEmail,
            fullName: newFullName,
            role: newRole,
            phone: newPhone,
            jobTitle: newJobTitle,
            mode: createMode,
            password: createMode === "password" ? newPassword : undefined,
          }),
      );
      if (!res.ok) {
        setFeedback({
          type: res.missingServiceRoleKey ? "warning" : "error",
          message: res.error,
        });
        return;
      }
      setUsers((prev) => [res.data, ...prev.filter((u) => u.id !== res.data.id)]);
      setCreateDialogOpen(false);
      setNewEmail("");
      setNewFullName("");
      setNewPhone("");
      setNewJobTitle("");
      setNewPassword("");
      setNewRole("STAFF");
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleChangeRole = (targetUserId: string, nextRole: Role) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Memperbarui Peran Anggota... 🏷️",
          workingMessage: `Dino Joguman lagi menyesuaikan hak akses menjadi ${ROLE_LABELS[nextRole].title} nih~`,
          successTitle: "Peran Berhasil Diubah! ✨",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Mengubah Peran",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => updateUserRoleAction({ targetUserId, role: nextRole }),
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setUsers((prev) =>
        prev.map((item) => (item.id === targetUserId ? res.data : item)),
      );
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleToggleActive = (targetUserId: string, isActive: boolean) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: isActive
            ? "Mengaktifkan Akun... 🟢"
            : "Menonaktifkan Akun... 🔒",
          workingMessage: isActive
            ? "Dino Joguman lagi membuka kembali akses masuk untuk anggota tim ini~"
            : "Dino Joguman lagi menonaktifkan akses akun anggota tim ini dengan aman~",
          successTitle: isActive ? "Akun Aktif Kembali! ♪" : "Akun Dinonaktifkan",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Mengubah Status Akun",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => toggleUserActiveAction({ targetUserId, isActive }),
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setUsers((prev) =>
        prev.map((item) => (item.id === targetUserId ? res.data : item)),
      );
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleToggleOffboard = (targetUserId: string, offboarded: boolean) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: offboarded
            ? "Mencatat Status Keluar... 📦"
            : "Mengaktifkan Staf Kembali... 🌈",
          workingMessage: offboarded
            ? "Dino Joguman lagi menandai staf sebagai keluar dan menonaktifkan akses akunnya~"
            : "Dino Joguman lagi mengaktifkan kembali status kerja dan akses staf ini~",
          successTitle: offboarded
            ? "Status Keluar Tercatat"
            : "Staf Aktif Kembali! 🎉",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Memperbarui Status Staf",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => toggleUserOffboardAction({ targetUserId, offboarded }),
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }
      setUsers((prev) =>
        prev.map((item) => (item.id === targetUserId ? res.data : item)),
      );
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const assignableRoles = getAssignableRoles(role);
  const jobTitlePlaceholder =
    role === "STAFF"
      ? "Contoh: Terapis Okupasi / Terapis Wicara"
      : role === "TEAM_LEADER"
        ? "Contoh: Kepala Terapis / Koordinator Ruang"
        : "Contoh: Admin Operasional / Direktur";

  const ownInitials = getInitials(fullName || ownProfile.full_name, ownProfile.email);

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        accent="mint"
        mascot="gear"
        badge={canManageUsers ? "Pengaturan & Manajemen Tim" : "Kartu Profil Saya"}
        title={canManageUsers ? "Pengaturan Akun & Manajemen Tim" : "Profil Saya"}
        description={
          canManageUsers
            ? "Kelola profil pribadi serta peran, status aktif, dan offboarding tim Star Champs Indonesia."
            : "Perbarui nama tampilan, nomor telepon, dan informasi jabatan pribadi Anda."
        }
        actions={<RoleBadge role={role} showSubtitle />}
      />

      {/* Team KPI Strip (for Admin & Owner) */}
      <Can action="users.manage">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KawaiiStatCard
            label="Total Anggota Tim"
            value={users.length}
            hint="Terdaftar di ruang kerja StarOps"
            accent="mint"
            icon={<Users className="size-4" />}
          />
          <KawaiiStatCard
            label="Akun Aktif Bekerja"
            value={activeUsersCount}
            hint="Dapat masuk & menggunakan sistem"
            accent="sky"
            icon={<UserCheck className="size-4" />}
          />
          <KawaiiStatCard
            label="Staf Keluar (Offboard)"
            value={offboardedUsersCount}
            hint={
              offboardVaultWarnings.length > 0
                ? `${offboardVaultWarnings.length} perlu rotasi sandi vault`
                : "Semua akses brankas aman bersih"
            }
            accent={offboardVaultWarnings.length > 0 ? "coral" : "lavender"}
            icon={<KeyRound className="size-4" />}
          />
          <KawaiiStatCard
            label="Pendaftaran Akun Baru"
            value={serviceRoleConfigured ? "Aktif" : "Manual"}
            hint={
              serviceRoleConfigured
                ? "Kunci admin siap undang & buat akun"
                : "Kunci admin server belum terpasang"
            }
            accent={serviceRoleConfigured ? "butter" : "peach"}
            icon={
              serviceRoleConfigured ? (
                <ShieldCheck className="size-4" />
              ) : (
                <ShieldAlert className="size-4" />
              )
            }
          />
        </div>
      </Can>

      {feedback && (
        <Alert
          variant={
            feedback.type === "error"
              ? "destructive"
              : feedback.type === "warning"
                ? "warning"
                : "default"
          }
          className={
            feedback.type === "error"
              ? "rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-rose-950/40"
              : feedback.type === "warning"
                ? "rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-amber-950/40"
                : "rounded-2xl border-2 border-[#2C2623] bg-[#E8FBF1] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-emerald-950/40"
          }
        >
          {feedback.type === "error" || feedback.type === "warning" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
          <AlertTitle className="font-extrabold">
            {feedback.type === "error"
              ? "Terjadi Kesalahan"
              : feedback.type === "warning"
                ? "Konfigurasi Diperlukan"
                : "Berhasil! ♪"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Personal Profile Card */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
        <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#E8FBF1]/75 dark:bg-emerald-950/25">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#A7F3D0] text-lg font-black text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623]">
                {ownInitials}
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                  <Settings className="size-4" />
                  Profil Pribadi
                </CardTitle>
                <CardDescription className="mt-0.5">
                  Perbarui nama tampilan, nomor telepon, dan jabatan operasional Anda.
                </CardDescription>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FFFBE6] px-3 py-1 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/50 dark:text-amber-100">
              <Sparkles className="size-3.5" />
              {fullName.trim() || ownProfile.full_name || "Anggota Star Champs"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleSaveProfile} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-email" className="font-bold">
                Email Akun
              </Label>
              <Input
                id="profile-email"
                value={ownProfile.email ?? user.email ?? ""}
                disabled
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-role" className="font-bold">
                Jabatan / Peran
              </Label>
              <Input
                id="profile-role"
                value={`${ROLE_LABELS[ownProfile.role].title} — ${ROLE_LABELS[ownProfile.role].subtitle}`}
                disabled
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-fullname" className="font-bold">
                Nama Lengkap
              </Label>
              <Input
                id="profile-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                placeholder="Masukkan nama lengkap"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-phone" className="font-bold">
                Nomor Telepon / WhatsApp
              </Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-job" className="font-bold">
                Jabatan / Spesialisasi
              </Label>
              <Input
                id="profile-job"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder={jobTitlePlaceholder}
              />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" className="font-extrabold" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Simpan Profil"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* User Management (OWNER & Admin Operasional) */}
      <Can action="users.manage">
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
          <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#E8F6FF]/70 dark:bg-sky-950/25">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                  <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#7CC4FA] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                    <Users className="size-4" />
                  </span>
                  Daftar Anggota Tim &amp; Hak Akses
                </CardTitle>
                <CardDescription className="mt-1">
                  {canManageAdmins
                    ? "Tambah anggota tim baru (seluruh peran termasuk Owner & Admin Operasional), atur jabatan, status aktif, dan offboarding."
                    : `Tambah dan kelola akun ${ROLE_LABELS.TEAM_LEADER.title} serta ${ROLE_LABELS.STAFF.title}. Pengelolaan akun ${ROLE_LABELS.OWNER.title} dan ${ROLE_LABELS.SUPER_ADMIN.title} hanya dapat dilakukan oleh ${ROLE_LABELS.OWNER.title}.`}
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="font-extrabold"
                onClick={() => setCreateDialogOpen(true)}
              >
                <UserPlus className="mr-1.5 size-4" />
                Tambah Anggota Tim
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-5">
            {!serviceRoleConfigured && (
              <Alert
                variant="warning"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-amber-950/40"
              >
                <ShieldAlert className="size-4" />
                <AlertTitle className="font-extrabold">
                  Fitur Tambah Akun Baru Belum Aktif
                </AlertTitle>
                <AlertDescription>
                  Server belum dilengkapi kunci admin untuk mendaftarkan email baru. Anda
                  tetap bisa mengubah jabatan dan status aktif anggota tim yang sudah ada.
                </AlertDescription>
              </Alert>
            )}

            {offboardVaultWarnings.length > 0 && (
              <Alert
                variant="warning"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF3E8] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-orange-950/40"
              >
                <KeyRound className="size-4" />
                <AlertTitle className="font-extrabold">
                  Pengingat Ganti Kata Sandi Akun Kantor
                </AlertTitle>
                <AlertDescription>
                  Ada {offboardVaultWarnings.length} staf yang sudah keluar tetapi namanya
                  masih tercatat memakai akun di Brankas Akun Digital. Segera ganti kata
                  sandi akun tersebut di menu Brankas Akun Digital.
                </AlertDescription>
              </Alert>
            )}

            {/* Team Filter Controls */}
            <div className="flex flex-col gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-3 shadow-[2px_2px_0px_0px_#2C2623] sm:flex-row sm:items-center dark:border-[#F5E9D6]/35 dark:bg-card">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  value={teamQuery}
                  onChange={(e) => setTeamQuery(e.target.value)}
                  placeholder="Cari nama, email, jabatan, atau peran tim..."
                  className="pl-9"
                />
              </div>
              <div className="inline-flex rounded-xl border-2 border-[#2C2623] bg-[#FFFBE6]/70 p-1 dark:border-[#F5E9D6]/35 dark:bg-muted/40">
                {(
                  [
                    { key: "all", label: `Semua (${users.length})` },
                    { key: "active", label: `Aktif (${activeUsersCount})` },
                    {
                      key: "inactive",
                      label: `Nonaktif (${users.length - activeUsersCount})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTeamFilter(tab.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition-all ${
                      teamFilter === tab.key
                        ? "border-2 border-[#2C2623] bg-[#A7F3D0] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <KawaiiEmptyState
                mascot="gear"
                title="Tidak Ada Anggota Tim yang Cocok"
                description="Coba ubah kata kunci pencarian atau pilih filter Semua untuk menampilkan seluruh anggota tim."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTeamQuery("");
                      setTeamFilter("all");
                    }}
                  >
                    Tampilkan Semua Tim
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredUsers.map((member) => {
                  const isSelf = member.id === user.id;
                  const canManageMember =
                    !isSelf && canManageTargetRole(role, member.role);
                  const assignedVaultCodes = vaultWarnMap.get(member.id) ?? [];
                  const theme = getRolePastelTheme(
                    member.role,
                    Boolean(member.offboarded_at),
                  );
                  const memberInitials = getInitials(member.full_name, member.email);

                  return (
                    <div
                      key={member.id}
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[3px_3px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/40 dark:bg-card"
                    >
                      {/* Pastel Member Header */}
                      <div
                        className={`flex items-start justify-between gap-3 border-b-2 border-dashed border-[#2C2623]/20 p-4 ${theme.headerBg}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] text-sm font-black shadow-[2px_2px_0px_0px_#2C2623] ${theme.avatarBg}`}
                          >
                            {memberInitials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-extrabold">
                                {member.full_name || "Tanpa Nama"}
                              </span>
                              {isSelf && (
                                <Badge
                                  variant="outline"
                                  className="border-[#2C2623] bg-[#FFFDF7] px-1.5 py-0 text-[10px] font-extrabold text-[#2C2623] dark:bg-background dark:text-foreground"
                                >
                                  Anda
                                </Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground mt-0.5 flex items-center gap-1 truncate text-xs">
                              <Mail className="size-3 shrink-0" />
                              <span className="truncate">{member.email ?? "-"}</span>
                            </p>
                          </div>
                        </div>

                        <Badge
                          variant={member.is_active ? "secondary" : "destructive"}
                          className={
                            member.is_active
                              ? "shrink-0 border-[#2C2623] bg-[#E8FBF1] font-extrabold text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                              : "shrink-0 font-extrabold"
                          }
                        >
                          {member.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>

                      {/* Member Body & Controls */}
                      <div className="space-y-3 p-4">
                        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Briefcase className="size-3.5" />
                            {member.job_title || "Belum ada jabatan"}
                          </span>
                          {member.phone && (
                            <span className="inline-flex items-center gap-1 font-medium">
                              <Phone className="size-3.5" />
                              {member.phone}
                            </span>
                          )}
                        </div>

                        {/* Role & Active Controls */}
                        <div className="grid gap-3 rounded-xl border-2 border-[#2C2623]/20 bg-[#FFFDF7] p-3 sm:grid-cols-2 dark:border-[#F5E9D6]/20 dark:bg-muted/20">
                          <div className="space-y-1">
                            <span className="text-muted-foreground text-[11px] font-extrabold uppercase">
                              Peran Akses
                            </span>
                            <div>
                              {canManageMember ? (
                                <Select
                                  value={member.role}
                                  disabled={isPending}
                                  onValueChange={(val) =>
                                    handleChangeRole(member.id, val as Role)
                                  }
                                >
                                  <SelectTrigger
                                    size="sm"
                                    className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold dark:bg-background"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {assignableRoles.map((r) => (
                                      <SelectItem key={r} value={r}>
                                        {ROLE_LABELS[r].title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <RoleBadge role={member.role} />
                              )}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-muted-foreground text-[11px] font-extrabold uppercase">
                              Status Login
                            </span>
                            <div className="flex items-center gap-2 pt-1">
                              {canManageMember ? (
                                <>
                                  <Switch
                                    checked={member.is_active}
                                    disabled={isPending}
                                    onCheckedChange={(val) =>
                                      handleToggleActive(member.id, val)
                                    }
                                  />
                                  <span className="text-xs font-bold">
                                    {member.is_active ? "Diizinkan Masuk" : "Dibekukan"}
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground text-xs font-semibold">
                                  {member.is_active ? "Aktif" : "Nonaktif"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Offboard Status & Vault Reminder */}
                        {member.offboarded_at ? (
                          <div className="space-y-1.5 rounded-xl border-2 border-[#2C2623]/30 bg-[#FFF0F5] p-2.5 dark:bg-rose-950/30">
                            <Badge variant="destructive" className="font-bold">
                              Sudah Keluar · {formatDateWIB(member.offboarded_at)}
                            </Badge>
                            {assignedVaultCodes.length > 0 && (
                              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                                ⚠ Masih terdaftar di Akun Vault:{" "}
                                {assignedVaultCodes.join(", ")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-xs font-medium">
                            Status kerja: <span className="font-bold text-emerald-700 dark:text-emerald-300">Masih aktif bekerja</span>
                          </p>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="flex items-center justify-end border-t-2 border-dashed border-[#2C2623]/15 bg-[#FFFDF7]/80 px-4 py-3 dark:bg-muted/20">
                        {canManageMember ? (
                          <Button
                            size="sm"
                            variant={member.offboarded_at ? "outline" : "destructive"}
                            className="font-bold"
                            disabled={isPending}
                            onClick={() =>
                              handleToggleOffboard(member.id, !member.offboarded_at)
                            }
                          >
                            {member.offboarded_at ? (
                              <>
                                <UserCheck className="mr-1.5 size-3.5" />
                                Aktifkan Kembali
                              </>
                            ) : (
                              <>
                                <UserX className="mr-1.5 size-3.5" />
                                Tandai Sudah Keluar
                              </>
                            )}
                          </Button>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-[#2C2623]/50 bg-[#FFFBE6] text-[11px] font-bold text-[#2C2623] dark:bg-amber-950/40 dark:text-amber-100"
                          >
                            {isSelf
                              ? "Akun Anda"
                              : `Dikelola ${ROLE_LABELS.OWNER.title}`}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </Can>

      {/* Create / Invite User Dialog */}
      {canManageUsers && (
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold">
                <UserPlus className="size-4" />
                Tambah Anggota Tim Baru
              </DialogTitle>
              <DialogDescription>
                {canManageAdmins
                  ? "Buat akun masuk baru untuk seluruh peran tim Star Champs Indonesia."
                  : `Buat akun masuk baru untuk ${ROLE_LABELS.TEAM_LEADER.title} atau ${ROLE_LABELS.STAFF.title}.`}
              </DialogDescription>
            </DialogHeader>

            {!serviceRoleConfigured && (
              <Alert variant="warning">
                <AlertTriangle className="size-4" />
                <AlertTitle>Kunci Admin Belum Aktif</AlertTitle>
                <AlertDescription>
                  Hubungi pengelola server untuk mengaktifkan kunci pendaftaran pengguna
                  baru.
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="font-bold">Metode Pembuatan Akun</Label>
                <Select
                  value={createMode}
                  onValueChange={(val) =>
                    setCreateMode(val as "password" | "invite")
                  }
                >
                  <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="password">
                      Buat Langsung dengan Password Awal
                    </SelectItem>
                    <SelectItem value="invite">Kirim Undangan Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-name" className="font-bold">
                    Nama Lengkap
                  </Label>
                  <Input
                    id="new-user-name"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    required
                    placeholder="Nama anggota tim"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-user-email" className="font-bold">
                    Email
                  </Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    placeholder="nama@starchamps.id"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="font-bold">Peran</Label>
                  <Select
                    value={newRole}
                    onValueChange={(val) => setNewRole(val as Role)}
                  >
                    <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] dark:border-[#F5E9D6]/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r].title} ({ROLE_LABELS[r].subtitle})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-user-phone" className="font-bold">
                    Telepon (Opsional)
                  </Label>
                  <Input
                    id="new-user-phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="08..."
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-user-job" className="font-bold">
                  Jabatan (Opsional)
                </Label>
                <Input
                  id="new-user-job"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  placeholder="Terapis Wicara / Koordinator Ruang"
                />
              </div>

              {createMode === "password" && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-password" className="font-bold">
                    Password Awal (min. 8 karakter)
                  </Label>
                  <Input
                    id="new-user-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Minimal 8 karakter"
                  />
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={isPending}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? "Memproses..."
                    : createMode === "invite"
                      ? "Kirim Undangan"
                      : "Buat Akun"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
