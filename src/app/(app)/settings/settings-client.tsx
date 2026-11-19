"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Settings,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createOrInviteUserAction,
  toggleUserActiveAction,
  toggleUserOffboardAction,
  updateOwnProfileAction,
  updateUserRoleAction,
} from "@/lib/actions/settings";
import { formatDateWIB } from "@/lib/constants";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/rbac";
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

export function SettingsClient({
  ownProfile,
  users: initialUsers,
  serviceRoleConfigured,
  offboardVaultWarnings,
}: SettingsClientProps) {
  const router = useRouter();
  const { user, role } = useRole();
  const [isPending, startTransition] = useTransition();

  // Personal profile state
  const [fullName, setFullName] = useState(ownProfile.full_name ?? "");
  const [phone, setPhone] = useState(ownProfile.phone ?? "");
  const [jobTitle, setJobTitle] = useState(ownProfile.job_title ?? "");

  // User management state
  const [users, setUsers] = useState<Profile[]>(initialUsers);
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

  const vaultWarnMap = new Map<string, string[]>(
    offboardVaultWarnings.map((w) => [w.userId, w.subscriptionCodes]),
  );

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await updateOwnProfileAction({
        fullName,
        phone,
        jobTitle,
      });
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
    startTransition(async () => {
      const res = await createOrInviteUserAction({
        email: newEmail,
        fullName: newFullName,
        role: newRole,
        phone: newPhone,
        jobTitle: newJobTitle,
        mode: createMode,
        password: createMode === "password" ? newPassword : undefined,
      });
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
      const res = await updateUserRoleAction({ targetUserId, role: nextRole });
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
      const res = await toggleUserActiveAction({ targetUserId, isActive });
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
      const res = await toggleUserOffboardAction({ targetUserId, offboarded });
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

  const assignableRoles: readonly Role[] =
    role === "OWNER" ? ROLES : ROLES.filter((r) => r !== "OWNER");

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Pengaturan Akun & Manajemen Pengguna
          </h1>
          <p className="text-muted-foreground text-sm">
            Kelola profil pribadi serta peran, status aktif, dan offboarding tim
            Star Champs Indonesia.
          </p>
        </div>
        <RoleBadge role={role} showSubtitle />
      </div>

      {feedback && (
        <Alert
          variant={
            feedback.type === "error"
              ? "destructive"
              : feedback.type === "warning"
                ? "warning"
                : "default"
          }
        >
          {feedback.type === "error" || feedback.type === "warning" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600" />
          )}
          <AlertTitle>
            {feedback.type === "error"
              ? "Terjadi Kesalahan"
              : feedback.type === "warning"
                ? "Konfigurasi Diperlukan"
                : "Berhasil"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Personal Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="size-4" />
            Profil Pribadi
          </CardTitle>
          <CardDescription>
            Perbarui nama tampilan, nomor telepon, dan jabatan operasional Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email Akun</Label>
              <Input
                id="profile-email"
                value={ownProfile.email ?? user.email ?? ""}
                disabled
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-role">Jabatan / Peran</Label>
              <Input
                id="profile-role"
                value={`${ROLE_LABELS[ownProfile.role].title} — ${ROLE_LABELS[ownProfile.role].subtitle}`}
                disabled
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-fullname">Nama Lengkap</Label>
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
              <Label htmlFor="profile-phone">Nomor Telepon / WhatsApp</Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="profile-job">Jabatan / Spesialisasi</Label>
              <Input
                id="profile-job"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Contoh: Terapis Okupasi / Admin Operasional"
              />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Menyimpan..." : "Simpan Profil"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* User Management (OWNER & SUPER_ADMIN) */}
      <Can action="users.manage">
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4" />
                  Daftar Anggota Tim & Hak Akses
                </CardTitle>
                <CardDescription>
                  Tambah anggota tim baru, atur jabatan, aktifkan/nonaktifkan akun, dan tandai
                  bila ada staf yang sudah keluar agar kata sandi akun kantor segera diganti.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <UserPlus className="mr-1.5 size-4" />
                Tambah Anggota Tim
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!serviceRoleConfigured && (
              <Alert variant="warning">
                <ShieldAlert className="size-4" />
                <AlertTitle>Fitur Tambah Akun Baru Belum Aktif</AlertTitle>
                <AlertDescription>
                  Server belum dilengkapi kunci admin untuk mendaftarkan email baru. Anda tetap
                  bisa mengubah jabatan dan status aktif anggota tim yang sudah ada.
                </AlertDescription>
              </Alert>
            )}

            {offboardVaultWarnings.length > 0 && (
              <Alert variant="warning">
                <KeyRound className="size-4" />
                <AlertTitle>Pengingat Ganti Kata Sandi Akun Kantor</AlertTitle>
                <AlertDescription>
                  Ada {offboardVaultWarnings.length} staf yang sudah keluar tetapi namanya masih
                  tercatat memakai akun di Brankas Akun Digital. Segera ganti kata sandi akun
                  tersebut di menu Brankas Akun Digital.
                </AlertDescription>
              </Alert>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama & Jabatan</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Status Akun</TableHead>
                  <TableHead>Status Kerja</TableHead>
                  <TableHead className="text-right">Status Staf</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((member) => {
                  const isSelf = member.id === user.id;
                  const targetIsOwner = member.role === "OWNER";
                  const lockedByHierarchy = targetIsOwner && role !== "OWNER";
                  const disabledManage = isSelf || lockedByHierarchy || isPending;
                  const assignedVaultCodes = vaultWarnMap.get(member.id) ?? [];

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="font-medium">
                          {member.full_name || "Tanpa Nama"}
                          {isSelf && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              Anda
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {member.job_title || "Belum ada jabatan"}
                          {member.phone ? ` · ${member.phone}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{member.email ?? "-"}</TableCell>
                      <TableCell>
                        <Select
                          value={member.role}
                          disabled={disabledManage}
                          onValueChange={(val) =>
                            handleChangeRole(member.id, val as Role)
                          }
                        >
                          <SelectTrigger size="sm" className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(targetIsOwner ? ROLES : assignableRoles).map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r].title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={member.is_active}
                            disabled={disabledManage}
                            onCheckedChange={(val) =>
                              handleToggleActive(member.id, val)
                            }
                          />
                          <Badge
                            variant={member.is_active ? "secondary" : "destructive"}
                          >
                            {member.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {member.offboarded_at ? (
                          <div className="space-y-1">
                            <Badge variant="destructive">
                              Sudah Keluar · {formatDateWIB(member.offboarded_at)}
                            </Badge>
                            {assignedVaultCodes.length > 0 && (
                              <div className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                Masih terdaftar di Akun: {assignedVaultCodes.join(", ")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Masih aktif bekerja
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={member.offboarded_at ? "outline" : "destructive"}
                          disabled={disabledManage}
                          onClick={() =>
                            handleToggleOffboard(member.id, !member.offboarded_at)
                          }
                        >
                          {member.offboarded_at ? (
                            <>
                              <UserCheck className="mr-1 size-3.5" />
                              Aktifkan Kembali
                            </>
                          ) : (
                            <>
                              <UserX className="mr-1 size-3.5" />
                              Tandai Sudah Keluar
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Can>

      {/* Create / Invite User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Tambah Anggota Tim Baru
            </DialogTitle>
            <DialogDescription>
              Buat akun masuk baru untuk terapis, kepala terapis, atau admin operasional.
            </DialogDescription>
          </DialogHeader>

          {!serviceRoleConfigured && (
            <Alert variant="warning">
              <AlertTriangle className="size-4" />
              <AlertTitle>Kunci Admin Belum Aktif</AlertTitle>
              <AlertDescription>
                Hubungi pengelola server untuk mengaktifkan kunci pendaftaran pengguna baru.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Metode Pembuatan Akun</Label>
              <Select
                value={createMode}
                onValueChange={(val) =>
                  setCreateMode(val as "password" | "invite")
                }
              >
                <SelectTrigger className="w-full">
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
                <Label htmlFor="new-user-name">Nama Lengkap</Label>
                <Input
                  id="new-user-name"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                  placeholder="Nama terapis / admin"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-user-email">Email</Label>
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
                <Label>Peran RBAC</Label>
                <Select
                  value={newRole}
                  onValueChange={(val) => setNewRole(val as Role)}
                >
                  <SelectTrigger className="w-full">
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
                <Label htmlFor="new-user-phone">Telepon (Opsional)</Label>
                <Input
                  id="new-user-phone"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="08..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-user-job">Jabatan (Opsional)</Label>
              <Input
                id="new-user-job"
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="Terapis Wicara / Koordinator Ruang"
              />
            </div>

            {createMode === "password" && (
              <div className="space-y-1.5">
                <Label htmlFor="new-user-password">Password Awal (min. 8 karakter)</Label>
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
    </div>
  );
}
