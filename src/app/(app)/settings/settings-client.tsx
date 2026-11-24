"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Briefcase,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlink,
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
  changeOwnEmailAction,
  changeOwnPasswordAction,
  createOrInviteUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
  toggleUserOffboardAction,
  updateOwnProfileAction,
  updateUserAction,
  updateUserRoleAction,
} from "@/lib/actions/settings";
import { formatDateWIB } from "@/lib/constants";
import {
  canManageTargetRole,
  getAssignableRoles,
  ROLES,
  ROLE_LABELS,
  type Role,
} from "@/lib/rbac";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export type OffboardVaultWarning = {
  userId: string;
  subscriptionCodes: string[];
};

export type GoogleConnectionState = {
  connected: boolean;
  email: string | null;
  identityId: string | null;
  linkedAt: string | null;
  canUnlink: boolean;
  providers: string[];
};

type SettingsClientProps = {
  ownProfile: Profile;
  users: Profile[];
  serviceRoleConfigured: boolean;
  offboardVaultWarnings: OffboardVaultWarning[];
  googleConnection: GoogleConnectionState;
};

type StatusFilter = "all" | "active" | "inactive" | "offboard";

type BlockingHistoryState = {
  borrowCount: number;
  requestCount: number;
  message: string;
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

function GoogleGIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.54-5.17 3.54-8.89Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.27V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.78c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4.01 3.11C6.23 6.89 8.88 4.78 12 4.78Z"
      />
    </svg>
  );
}

function mapGoogleLinkError(rawMessage?: string | null): string {
  const msg = (rawMessage ?? "").toLowerCase();
  if (
    msg.includes("manual linking") ||
    msg.includes("manual_linking") ||
    msg.includes("linking is disabled")
  ) {
    return "Fitur Manual Linking belum diaktifkan di Supabase Dashboard (Authentication → Settings → Enable Manual Linking). Hubungi administrator sistem.";
  }
  if (
    msg.includes("provider is not enabled") ||
    msg.includes("unsupported provider") ||
    (msg.includes("google") && msg.includes("disabled"))
  ) {
    return "Provider Login Google (Google OAuth) belum diaktifkan di Supabase Dashboard (Authentication → Providers → Google). Hubungi administrator sistem.";
  }
  if (
    msg.includes("already linked") ||
    msg.includes("identity_already_exists") ||
    msg.includes("already belongs") ||
    msg.includes("another user")
  ) {
    return "Akun Google ini sudah terhubung dengan akun pengguna lain di StarOps.";
  }
  if (msg.includes("at least 2") || msg.includes("single identity")) {
    return "Akun Google tidak dapat diputuskan karena merupakan satu-satunya metode masuk akun Anda.";
  }
  return rawMessage?.trim()
    ? `Koneksi akun Google belum dapat diproses: ${rawMessage.trim()}`
    : "Terjadi kendala saat memproses koneksi akun Google. Silakan coba lagi beberapa saat.";
}

export function SettingsClient({
  ownProfile,
  users: initialUsers,
  serviceRoleConfigured,
  offboardVaultWarnings,
  googleConnection,
}: SettingsClientProps) {
  const router = useRouter();
  const { runWithFeedback, showWorking, showSuccess, showError } =
    useCartoonFeedback();
  const { user, role, can } = useRole();
  const canManageUsers = can("users.manage");
  const canManageAdmins = can("users.manage_admins");
  const [isPending, startTransition] = useTransition();

  // Personal profile state
  const [fullName, setFullName] = useState(ownProfile.full_name ?? "");
  const [phone, setPhone] = useState(ownProfile.phone ?? "");
  const [jobTitle, setJobTitle] = useState(ownProfile.job_title ?? "");

  // Google account linking state (available for all 4 authenticated roles)
  const [googleState, setGoogleState] =
    useState<GoogleConnectionState>(googleConnection);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const handledGoogleQueryRef = useRef(false);

  // Self-service Change Email state (Auto-Relogin)
  const [nextLoginEmail, setNextLoginEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [showEmailCurrentPassword, setShowEmailCurrentPassword] =
    useState(false);
  const [emailFormError, setEmailFormError] = useState<string | null>(null);

  // Self-service Change Password state (Auto-Relogin)
  const [ownCurrentPassword, setOwnCurrentPassword] = useState("");
  const [ownNewPassword, setOwnNewPassword] = useState("");
  const [ownConfirmPassword, setOwnConfirmPassword] = useState("");
  const [showOwnCurrentPassword, setShowOwnCurrentPassword] = useState(false);
  const [showOwnNewPassword, setShowOwnNewPassword] = useState(false);
  const [showOwnConfirmPassword, setShowOwnConfirmPassword] = useState(false);
  const [passwordFormError, setPasswordFormError] = useState<string | null>(
    null,
  );

  // User management directory & filter state
  const [users, setUsers] = useState<Profile[]>(initialUsers);
  const [teamQuery, setTeamQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Create user dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<Role>("STAFF");
  const [newPhone, setNewPhone] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [createMode, setCreateMode] = useState<"password" | "invite">("password");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Edit user dialog state
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<Role>("STAFF");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Reset password dialog state
  const [resetPasswordUser, setResetPasswordUser] = useState<Profile | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const [resetFormError, setResetFormError] = useState<string | null>(null);

  // Delete user dialog state
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);
  const [blockingHistory, setBlockingHistory] =
    useState<BlockingHistoryState | null>(null);
  const [deleteFormError, setDeleteFormError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  const activeUserIdSet = useMemo(
    () => new Set(users.map((u) => u.id)),
    [users],
  );

  const visibleVaultWarnings = useMemo(
    () => offboardVaultWarnings.filter((w) => activeUserIdSet.has(w.userId)),
    [offboardVaultWarnings, activeUserIdSet],
  );

  const vaultWarnMap = useMemo(
    () =>
      new Map<string, string[]>(
        visibleVaultWarnings.map((w) => [w.userId, w.subscriptionCodes]),
      ),
    [visibleVaultWarnings],
  );

  const activeUsersCount = useMemo(
    () => users.filter((u) => u.is_active && !u.offboarded_at).length,
    [users],
  );

  const inactiveUsersCount = useMemo(
    () => users.filter((u) => !u.is_active && !u.offboarded_at).length,
    [users],
  );

  const offboardedUsersCount = useMemo(
    () => users.filter((u) => Boolean(u.offboarded_at)).length,
    [users],
  );

  const roleCounts = useMemo(() => {
    const counts: Record<Role, number> = {
      OWNER: 0,
      SUPER_ADMIN: 0,
      TEAM_LEADER: 0,
      STAFF: 0,
    };
    for (const member of users) {
      counts[member.role] += 1;
    }
    return counts;
  }, [users]);

  const hasActiveFilters =
    teamQuery.trim().length > 0 ||
    roleFilter !== "ALL" ||
    statusFilter !== "all";

  const filteredUsers = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    return users.filter((member) => {
      if (roleFilter !== "ALL" && member.role !== roleFilter) {
        return false;
      }
      if (
        statusFilter === "active" &&
        (!member.is_active || Boolean(member.offboarded_at))
      ) {
        return false;
      }
      if (
        statusFilter === "inactive" &&
        (member.is_active || Boolean(member.offboarded_at))
      ) {
        return false;
      }
      if (statusFilter === "offboard" && !member.offboarded_at) {
        return false;
      }
      if (q) {
        const hay = [
          member.full_name,
          member.email,
          member.job_title,
          member.phone,
          ROLE_LABELS[member.role]?.title,
          ROLE_LABELS[member.role]?.subtitle,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, teamQuery, roleFilter, statusFilter]);

  const openEditDialog = (member: Profile) => {
    setEditingUser(member);
    setEditFullName(member.full_name ?? "");
    setEditEmail(member.email ?? "");
    setEditJobTitle(member.job_title ?? "");
    setEditPhone(member.phone ?? "");
    setEditRole(member.role);
    setEditIsActive(member.is_active);
    setEditFormError(null);
  };

  const closeEditDialog = () => {
    setEditingUser(null);
    setEditFormError(null);
  };

  const openResetPasswordDialog = (member: Profile) => {
    setResetPasswordUser(member);
    setResetPassword("");
    setResetPasswordConfirm("");
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
    setResetFormError(null);
  };

  const closeResetPasswordDialog = () => {
    setResetPasswordUser(null);
    setResetPassword("");
    setResetPasswordConfirm("");
    setShowResetPassword(false);
    setShowResetPasswordConfirm(false);
    setResetFormError(null);
  };

  const openDeleteDialog = (member: Profile) => {
    setDeletingUser(member);
    setBlockingHistory(null);
    setDeleteFormError(null);
  };

  const closeDeleteDialog = () => {
    setDeletingUser(null);
    setBlockingHistory(null);
    setDeleteFormError(null);
  };

  useEffect(() => {
    setGoogleState(googleConnection);
  }, [googleConnection]);

  useEffect(() => {
    if (handledGoogleQueryRef.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get("google");
    if (!googleStatus) return;

    handledGoogleQueryRef.current = true;

    if (googleStatus === "linked") {
      const successMsg =
        "Akun Google berhasil dihubungkan! Kini Anda bisa masuk dengan Google atau email, dan siap untuk integrasi layanan Google lainnya ♪";
      showSuccess({
        title: "Akun Google Terhubung! ✨",
        message: successMsg,
        durationMs: 4200,
      });
      setFeedback({ type: "success", message: successMsg });
      window.history.replaceState({}, "", "/settings");
      router.refresh();
    } else if (googleStatus === "error") {
      const rawReason = params.get("reason") ?? params.get("message");
      const errorMsg = rawReason
        ? mapGoogleLinkError(rawReason)
        : "Gagal menghubungkan akun Google. Pastikan akun Google belum tertaut pada akun lain dan layanan Google OAuth aktif.";
      showError({
        title: "Gagal Menghubungkan Akun Google",
        message: errorMsg,
      });
      setFeedback({ type: "error", message: errorMsg });
      window.history.replaceState({}, "", "/settings");
    }
  }, [router, showError, showSuccess]);

  const triggerAutoRelogin = (redirectTo: string) => {
    window.setTimeout(() => {
      window.location.assign(redirectTo);
    }, 900);
  };

  const handleConnectGoogle = async () => {
    setFeedback(null);
    setGoogleBusy(true);
    showWorking({
      title: "Menghubungkan Akun Google... ✨",
      message:
        "Dino Joguman lagi mengarahkan Anda ke halaman verifikasi Google untuk menautkan akun~",
    });

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings?google=linked")}`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        const friendly = mapGoogleLinkError(error.message);
        showError({
          title: "Gagal Menghubungkan Google",
          message: friendly,
        });
        setFeedback({ type: "error", message: friendly });
        setGoogleBusy(false);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : null;
      const friendly = mapGoogleLinkError(raw);
      showError({
        title: "Gagal Menghubungkan Google",
        message: friendly,
      });
      setFeedback({ type: "error", message: friendly });
      setGoogleBusy(false);
    }
  };

  const handleUnlinkGoogle = () => {
    setFeedback(null);
    setGoogleBusy(true);
    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Memutuskan Koneksi Google... 🔗",
          workingMessage:
            "Dino Joguman lagi melepas tautan akun Google dari profil Anda dengan aman~",
          successTitle: "Koneksi Google Diputuskan! ♪",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Memutuskan Akun Google",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        async (): Promise<
          { ok: true; message: string } | { ok: false; error: string }
        > => {
          try {
            const supabase = createClient();
            const { data: authData, error: userErr } =
              await supabase.auth.getUser();
            if (userErr || !authData.user) {
              return {
                ok: false,
                error:
                  "Sesi login Anda tidak ditemukan. Silakan muat ulang halaman dan coba lagi.",
              };
            }

            const identities = authData.user.identities ?? [];
            const googleIdentity = identities.find(
              (id) => id.provider === "google",
            );
            if (!googleIdentity) {
              return {
                ok: false,
                error: "Akun Google tidak ditemukan pada profil Anda.",
              };
            }
            if (identities.length < 2) {
              return {
                ok: false,
                error:
                  "Akun Google adalah satu-satunya metode masuk Anda sehingga tidak dapat diputuskan.",
              };
            }

            const { error: unlinkErr } =
              await supabase.auth.unlinkIdentity(googleIdentity);
            if (unlinkErr) {
              return {
                ok: false,
                error: mapGoogleLinkError(unlinkErr.message),
              };
            }

            return {
              ok: true,
              message:
                "Koneksi akun Google berhasil diputuskan. Anda tetap dapat masuk menggunakan email dan kata sandi terdaftar.",
            };
          } catch (err) {
            const raw = err instanceof Error ? err.message : null;
            return {
              ok: false,
              error: mapGoogleLinkError(raw),
            };
          }
        },
      );

      setGoogleBusy(false);
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        return;
      }

      setGoogleState((prev) => ({
        connected: false,
        email: null,
        identityId: null,
        linkedAt: null,
        canUnlink: false,
        providers: prev.providers.filter((p) => p !== "google"),
      }));
      setUnlinkDialogOpen(false);
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleChangeOwnEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = nextLoginEmail.trim().toLowerCase();
    const currentEmail = (ownProfile.email ?? user.email ?? "")
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailFormError("Format alamat email baru tidak valid.");
      return;
    }
    if (trimmedEmail === currentEmail) {
      setEmailFormError(
        "Email baru tidak boleh sama dengan alamat email saat ini.",
      );
      return;
    }
    if (!emailCurrentPassword) {
      setEmailFormError(
        "Masukkan kata sandi saat ini untuk memverifikasi perubahan email.",
      );
      return;
    }

    setEmailFormError(null);
    setFeedback(null);

    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Memperbarui Email Login... 📧",
          workingMessage:
            "Dino Joguman lagi memverifikasi kata sandi dan memperbarui alamat email masuk Anda~",
          successTitle: "Email Login Diperbarui! ✨",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Mengubah Email Login",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          changeOwnEmailAction({
            currentPassword: emailCurrentPassword,
            newEmail: trimmedEmail,
          }),
      );

      if (!res.ok) {
        setEmailFormError(res.error);
        setFeedback({ type: "error", message: res.error });
        return;
      }

      setNextLoginEmail("");
      setEmailCurrentPassword("");
      setShowEmailCurrentPassword(false);
      setFeedback({ type: "success", message: res.message });

      if (res.requireRelogin) {
        triggerAutoRelogin(res.redirectTo ?? "/login?notice=email-changed");
        return;
      }
      router.refresh();
    });
  };

  const handleChangeOwnPassword = (e: React.FormEvent) => {
    e.preventDefault();

    if (!ownCurrentPassword) {
      setPasswordFormError("Masukkan kata sandi saat ini terlebih dahulu.");
      return;
    }
    if (ownNewPassword.length < 8) {
      setPasswordFormError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (ownNewPassword !== ownConfirmPassword) {
      setPasswordFormError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setPasswordFormError(null);
    setFeedback(null);

    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mengubah Kata Sandi... 🔐",
          workingMessage:
            "Dino Joguman lagi memverifikasi sandi lama dan memasang kata sandi baru yang lebih aman~",
          successTitle: "Kata Sandi Berhasil Diubah! 🔐",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Mengubah Kata Sandi",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          changeOwnPasswordAction({
            currentPassword: ownCurrentPassword,
            newPassword: ownNewPassword,
            confirmPassword: ownConfirmPassword,
          }),
      );

      if (!res.ok) {
        setPasswordFormError(res.error);
        setFeedback({ type: "error", message: res.error });
        return;
      }

      setOwnCurrentPassword("");
      setOwnNewPassword("");
      setOwnConfirmPassword("");
      setShowOwnCurrentPassword(false);
      setShowOwnNewPassword(false);
      setShowOwnConfirmPassword(false);
      setFeedback({ type: "success", message: res.message });

      if (res.requireRelogin) {
        triggerAutoRelogin(res.redirectTo ?? "/login?notice=password-changed");
        return;
      }
      router.refresh();
    });
  };

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
      setUsers((prev) =>
        prev.map((item) => (item.id === ownProfile.id ? res.data : item)),
      );
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
      setShowNewPassword(false);
      setNewRole("STAFF");
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const trimmedName = editFullName.trim();
    const effectiveEmail = serviceRoleConfigured
      ? editEmail.trim()
      : (editingUser.email ?? editEmail).trim();

    if (trimmedName.length < 2) {
      setEditFormError("Nama lengkap minimal 2 karakter.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveEmail)) {
      setEditFormError("Format email tidak valid.");
      return;
    }

    const target = editingUser;
    const isEditingSelf = target.id === ownProfile.id;
    const effectiveRole = isEditingSelf ? target.role : editRole;
    const effectiveIsActive = isEditingSelf ? true : editIsActive;

    setEditFormError(null);
    setFeedback(null);

    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Memperbarui Data Pengguna... ✏️",
          workingMessage: `Dino Joguman lagi menyimpan pembaruan profil ${trimmedName} di StarOps~`,
          successTitle: "Data Pengguna Diperbarui! ✨",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Memperbarui Data Pengguna",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          updateUserAction({
            targetUserId: target.id,
            fullName: trimmedName,
            email: effectiveEmail,
            role: effectiveRole,
            phone: editPhone.trim() || null,
            jobTitle: editJobTitle.trim() || null,
            isActive: effectiveIsActive,
          }),
      );

      if (!res.ok) {
        setEditFormError(res.error);
        setFeedback({
          type: res.missingServiceRoleKey ? "warning" : "error",
          message: res.error,
        });
        return;
      }

      setUsers((prev) =>
        prev.map((item) => (item.id === target.id ? res.data : item)),
      );
      if (isEditingSelf) {
        setFullName(res.data.full_name ?? "");
        setPhone(res.data.phone ?? "");
        setJobTitle(res.data.job_title ?? "");
      }
      closeEditDialog();
      setFeedback({ type: "success", message: res.message });
      if (res.requireRelogin) {
        triggerAutoRelogin(res.redirectTo ?? "/login?notice=email-changed");
        return;
      }
      router.refresh();
    });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;

    if (!serviceRoleConfigured) {
      setResetFormError(
        "Kunci admin server (SUPABASE_SERVICE_ROLE_KEY) belum terpasang sehingga kata sandi belum dapat diatur ulang.",
      );
      return;
    }
    if (resetPassword.length < 8) {
      setResetFormError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetFormError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    const target = resetPasswordUser;
    const labelTarget = target.full_name || target.email || "pengguna";

    setResetFormError(null);
    setFeedback(null);

    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mengatur Ulang Kata Sandi... 🔑",
          workingMessage: `Dino Joguman lagi memperbarui kunci masuk baru untuk ${labelTarget}~`,
          successTitle: "Kata Sandi Berhasil Diatur Ulang! 🔐",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Mengatur Ulang Kata Sandi",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          resetUserPasswordAction({
            targetUserId: target.id,
            newPassword: resetPassword,
          }),
      );

      if (!res.ok) {
        setResetFormError(res.error);
        setFeedback({
          type: res.missingServiceRoleKey ? "warning" : "error",
          message: res.error,
        });
        return;
      }

      closeResetPasswordDialog();
      setFeedback({ type: "success", message: res.message });
      if (res.requireRelogin) {
        triggerAutoRelogin(res.redirectTo ?? "/login?notice=password-changed");
        return;
      }
      router.refresh();
    });
  };

  const handleDeleteUser = (reassignHistory = false) => {
    if (!deletingUser) return;
    if (deletingUser.id === ownProfile.id) return;
    if (reassignHistory && ownProfile.role !== "OWNER") return;

    const target = deletingUser;
    const labelTarget = target.full_name || target.email || "pengguna";

    setDeleteFormError(null);
    setFeedback(null);

    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: reassignHistory
            ? "Mengalihkan Riwayat & Menghapus Akun... 🔄"
            : "Menghapus Akun Pengguna... 🗑️",
          workingMessage: reassignHistory
            ? `Dino Joguman lagi memindahkan riwayat ${labelTarget} ke akun Anda sebelum menghapus akunnya~`
            : `Dino Joguman lagi memeriksa riwayat dan menghapus akun ${labelTarget} dengan aman~`,
          successTitle: "Akun Pengguna Dihapus ✨",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: reassignHistory
            ? "Gagal Mengalihkan & Menghapus Akun"
            : "Akun Belum Dapat Dihapus",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () =>
          deleteUserAction({
            targetUserId: target.id,
            reassignHistory: reassignHistory || undefined,
          }),
      );

      if (!res.ok) {
        if (res.hasBlockingHistory) {
          setBlockingHistory({
            borrowCount: res.borrowCount ?? 0,
            requestCount: res.requestCount ?? 0,
            message: res.error,
          });
          setDeleteFormError(null);
          return;
        }
        setDeleteFormError(res.error);
        setFeedback({
          type: res.missingServiceRoleKey ? "warning" : "error",
          message: res.error,
        });
        return;
      }

      setUsers((prev) => prev.filter((item) => item.id !== target.id));
      closeDeleteDialog();
      setFeedback({ type: "success", message: res.message });
      router.refresh();
    });
  };

  const handleOffboardFromDeleteDialog = () => {
    if (!deletingUser || deletingUser.id === ownProfile.id) return;
    const target = deletingUser;

    setDeleteFormError(null);
    setFeedback(null);

    startTransition(async () => {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mencatat Status Keluar... 📦",
          workingMessage:
            "Dino Joguman lagi menandai staf sebagai keluar dan menonaktifkan aksesnya agar seluruh riwayat tetap utuh~",
          successTitle: "Staf Di-Offboard & Dinonaktifkan! ♪",
          successMessage: (result) => (result.ok ? result.message : ""),
          errorTitle: "Gagal Menandai Offboard",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => toggleUserOffboardAction({ targetUserId: target.id, offboarded: true }),
      );

      if (!res.ok) {
        setDeleteFormError(res.error);
        setFeedback({ type: "error", message: res.error });
        return;
      }

      setUsers((prev) =>
        prev.map((item) => (item.id === target.id ? res.data : item)),
      );
      closeDeleteDialog();
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
  const currentLoginEmail = ownProfile.email ?? user.email ?? "";
  const isEditingSelf = editingUser?.id === ownProfile.id;
  const resetPasswordValidLength = resetPassword.length >= 8;
  const resetPasswordMatches =
    resetPasswordConfirm.length > 0 && resetPassword === resetPasswordConfirm;
  const ownNewPasswordValidLength = ownNewPassword.length >= 8;
  const ownNewPasswordMatches =
    ownConfirmPassword.length > 0 && ownNewPassword === ownConfirmPassword;

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        accent="mint"
        mascot="gear"
        badge={canManageUsers ? "Pengaturan & Manajemen Tim" : "Profil & Keamanan Akun"}
        title={canManageUsers ? "Pengaturan Akun & Manajemen Tim" : "Profil & Keamanan Saya"}
        description={
          canManageUsers
            ? "Kelola profil pribadi, keamanan akun & koneksi Google, serta manajemen lengkap anggota tim Star Champs Indonesia."
            : "Perbarui profil pribadi, hubungkan akun Google, serta ubah alamat email atau kata sandi masuk Anda."
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
              visibleVaultWarnings.length > 0
                ? `${visibleVaultWarnings.length} perlu rotasi sandi vault`
                : "Semua akses brankas aman bersih"
            }
            accent={visibleVaultWarnings.length > 0 ? "coral" : "lavender"}
            icon={<KeyRound className="size-4" />}
          />
          <KawaiiStatCard
            label="Pendaftaran & Admin Auth"
            value={serviceRoleConfigured ? "Aktif" : "Terbatas"}
            hint={
              serviceRoleConfigured
                ? "Siap tambah akun, ubah email, reset sandi & hapus"
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

      {/* Keamanan Akun & Koneksi Google (Tersedia untuk SEMUA peran aktif) */}
      <section aria-labelledby="account-security-heading" className="space-y-5">
        <div className="flex flex-col gap-2.5 rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] px-5 py-4 shadow-[4px_4px_0px_0px_#2C2623] sm:flex-row sm:items-center sm:justify-between dark:border-[#F5E9D6]/40 dark:bg-card">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#DDD6FE] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2
                id="account-security-heading"
                className="text-base font-black tracking-tight text-[#2C2623] dark:text-foreground"
              >
                Keamanan Akun &amp; Koneksi Google
              </h2>
              <p className="text-muted-foreground text-xs font-medium">
                Hubungkan akun Google untuk login cepat &amp; integrasi, serta ubah
                email atau kata sandi masuk Anda dengan aman.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#2C2623] bg-[#E8F6FF] px-2.5 py-1 text-[11px] font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:bg-sky-950/50 dark:text-sky-100">
              <Mail className="size-3" />
              Email Login
            </span>
            {googleState.connected && (
              <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#2C2623] bg-[#A7F3D0] px-2.5 py-1 text-[11px] font-extrabold text-[#14532D] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:bg-emerald-950/60 dark:text-emerald-200">
                <GoogleGIcon className="size-3" />
                Google Aktif
              </span>
            )}
          </div>
        </div>

        {/* A. Koneksi Akun Google Card */}
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
          <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-gradient-to-r from-[#E8F6FF]/90 via-[#E8FBF1]/85 to-[#FFFDF7] dark:from-sky-950/35 dark:via-emerald-950/30 dark:to-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-white shadow-[3px_3px_0px_0px_#2C2623]">
                  <GoogleGIcon className="size-6" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-extrabold">
                    Koneksi Akun Google
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Tautkan akun Google untuk masuk sekali klik dan kesiapan integrasi
                    layanan Google di StarOps.
                  </CardDescription>
                </div>
              </div>

              {googleState.connected ? (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#A7F3D0] px-3.5 py-1 text-xs font-black text-[#14532D] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-emerald-900/70 dark:text-emerald-100">
                  <CheckCircle2 className="size-3.5" />
                  Terhubung ✓
                </span>
              ) : (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FFFBE6] px-3.5 py-1 text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/50 dark:text-amber-100">
                  <Link2 className="size-3.5" />
                  Belum Terhubung
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-5">
            {googleState.connected ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="inline-flex items-center gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] px-3.5 py-2 text-sm font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/35 dark:bg-muted/30 dark:text-foreground">
                      <GoogleGIcon className="size-4 shrink-0" />
                      <span>
                        {googleState.email ??
                          currentLoginEmail ??
                          "Akun Google Terhubung"}
                      </span>
                    </div>
                    {googleState.linkedAt && (
                      <span className="text-muted-foreground rounded-full border-[1.5px] border-[#2C2623]/30 bg-[#E8F6FF]/70 px-3 py-1 text-xs font-bold dark:border-[#F5E9D6]/25 dark:bg-sky-950/35">
                        Terhubung sejak {formatDateWIB(googleState.linkedAt)}
                      </span>
                    )}
                  </div>

                  <div className="inline-flex items-start gap-2 rounded-2xl border-2 border-[#2C2623]/25 bg-[#E8FBF1]/75 px-3.5 py-2 text-xs font-bold text-[#14532D] dark:border-emerald-400/25 dark:bg-emerald-950/35 dark:text-emerald-200">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Bisa dipakai untuk login cepat &amp; siap dihubungkan ke
                      integrasi sistem Google lainnya
                    </span>
                  </div>

                  {!googleState.canUnlink && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                      <Info className="size-3.5 shrink-0" />
                      Google adalah satu-satunya metode masuk akun Anda saat ini
                      sehingga tidak dapat diputuskan agar akun tetap dapat diakses.
                    </p>
                  )}
                </div>

                {googleState.canUnlink && (
                  <div className="shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending || googleBusy}
                      onClick={() => setUnlinkDialogOpen(true)}
                      className="bg-[#FFE4E6] font-extrabold text-[#9F1239] hover:bg-[#FECDD3] dark:bg-rose-950/60 dark:text-rose-200 dark:hover:bg-rose-900/70"
                    >
                      <Unlink className="size-4" />
                      Putuskan Koneksi
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl space-y-2">
                  <p className="text-sm font-semibold text-[#2C2623] dark:text-foreground">
                    Hubungkan akun Google Anda agar bisa masuk lewat tombol Google
                    selain email terdaftar, sekaligus siap untuk integrasi
                    data/layanan Google ke depannya.
                  </p>
                  <p className="text-muted-foreground text-xs font-medium">
                    Email &amp; kata sandi StarOps Anda tetap aktif dan bisa dipakai
                    seperti biasa kapan saja.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || googleBusy}
                  onClick={handleConnectGoogle}
                  className="shrink-0 border-2 border-[#2C2623] bg-[#FFFDF7] px-4 font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#E8F6FF] dark:border-[#F5E9D6]/40 dark:bg-background dark:text-foreground dark:hover:bg-sky-950/40"
                >
                  <GoogleGIcon className="size-4" />
                  {googleBusy ? "Mengarahkan..." : "Hubungkan Akun Google"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* B & C. Self-Service Change Email & Change Password Cards (Auto-Relogin) */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* B. Ubah Alamat Email Login Card */}
          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
            <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#F3EEFF]/80 dark:bg-violet-950/25">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#DDD6FE] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                    <Mail className="size-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-extrabold">
                      Ubah Alamat Email Login
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      Perbarui alamat email utama untuk masuk ke akun StarOps Anda.
                    </CardDescription>
                  </div>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FFFBE6] px-3 py-1 text-[11px] font-extrabold text-[#92400E] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/60 dark:text-amber-200">
                  <LogOut className="size-3.5 shrink-0" />
                  Otomatis keluar &amp; masuk ulang setelah disimpan
                </span>
              </div>
            </CardHeader>

            <CardContent className="pt-5">
              <form onSubmit={handleChangeOwnEmail} className="space-y-4">
                <div className="rounded-2xl border-2 border-[#2C2623]/20 bg-[#FFFDF7] px-3.5 py-2.5 dark:border-[#F5E9D6]/20 dark:bg-muted/20">
                  <p className="text-muted-foreground text-[11px] font-extrabold uppercase">
                    Email Saat Ini
                  </p>
                  <p className="mt-0.5 truncate text-sm font-extrabold text-[#2C2623] dark:text-foreground">
                    {currentLoginEmail || "-"}
                  </p>
                </div>

                {emailFormError && (
                  <Alert
                    variant="destructive"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Periksa Perubahan Email
                    </AlertTitle>
                    <AlertDescription>{emailFormError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="own-new-email" className="font-bold">
                    Email Baru
                  </Label>
                  <Input
                    id="own-new-email"
                    type="email"
                    autoComplete="email"
                    value={nextLoginEmail}
                    onChange={(e) => {
                      setNextLoginEmail(e.target.value);
                      if (emailFormError) setEmailFormError(null);
                    }}
                    required
                    disabled={isPending}
                    placeholder="nama.baru@starchamps.id"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="own-email-current-pw" className="font-bold">
                    Kata Sandi Saat Ini
                  </Label>
                  <div className="relative">
                    <Input
                      id="own-email-current-pw"
                      type={showEmailCurrentPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={emailCurrentPassword}
                      onChange={(e) => {
                        setEmailCurrentPassword(e.target.value);
                        if (emailFormError) setEmailFormError(null);
                      }}
                      required
                      disabled={isPending}
                      placeholder="Masukkan kata sandi saat ini untuk verifikasi"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowEmailCurrentPassword((prev) => !prev)
                      }
                      aria-label={
                        showEmailCurrentPassword
                          ? "Sembunyikan kata sandi saat ini"
                          : "Tampilkan kata sandi saat ini"
                      }
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 transition-colors"
                    >
                      {showEmailCurrentPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full font-extrabold sm:w-auto"
                  disabled={
                    isPending || !nextLoginEmail.trim() || !emailCurrentPassword
                  }
                >
                  <Mail className="size-4" />
                  {isPending ? "Memproses..." : "Simpan Email & Masuk Ulang"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* C. Ubah Kata Sandi Card */}
          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40">
            <CardHeader className="border-b-2 border-dashed border-[#2C2623]/20 bg-[#FFFBE6]/90 dark:bg-amber-950/25">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                    <Lock className="size-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-extrabold">
                      Ubah Kata Sandi
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      Ganti kata sandi akun Anda secara berkala agar akses tetap aman.
                    </CardDescription>
                  </div>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#FFFBE6] px-3 py-1 text-[11px] font-extrabold text-[#92400E] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/60 dark:text-amber-200">
                  <LogOut className="size-3.5 shrink-0" />
                  Otomatis keluar &amp; masuk ulang setelah disimpan
                </span>
              </div>
            </CardHeader>

            <CardContent className="pt-5">
              <form onSubmit={handleChangeOwnPassword} className="space-y-4">
                {passwordFormError && (
                  <Alert
                    variant="destructive"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Periksa Kata Sandi
                    </AlertTitle>
                    <AlertDescription>{passwordFormError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="own-current-password" className="font-bold">
                    Kata Sandi Saat Ini
                  </Label>
                  <div className="relative">
                    <Input
                      id="own-current-password"
                      type={showOwnCurrentPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={ownCurrentPassword}
                      onChange={(e) => {
                        setOwnCurrentPassword(e.target.value);
                        if (passwordFormError) setPasswordFormError(null);
                      }}
                      required
                      disabled={isPending}
                      placeholder="Masukkan kata sandi saat ini"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowOwnCurrentPassword((prev) => !prev)
                      }
                      aria-label={
                        showOwnCurrentPassword
                          ? "Sembunyikan kata sandi saat ini"
                          : "Tampilkan kata sandi saat ini"
                      }
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 transition-colors"
                    >
                      {showOwnCurrentPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="own-new-password" className="font-bold">
                    Kata Sandi Baru (min. 8 karakter)
                  </Label>
                  <div className="relative">
                    <Input
                      id="own-new-password"
                      type={showOwnNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={ownNewPassword}
                      onChange={(e) => {
                        setOwnNewPassword(e.target.value);
                        if (passwordFormError) setPasswordFormError(null);
                      }}
                      required
                      minLength={8}
                      disabled={isPending}
                      placeholder="Minimal 8 karakter"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOwnNewPassword((prev) => !prev)}
                      aria-label={
                        showOwnNewPassword
                          ? "Sembunyikan kata sandi baru"
                          : "Tampilkan kata sandi baru"
                      }
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 transition-colors"
                    >
                      {showOwnNewPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="own-confirm-password" className="font-bold">
                    Konfirmasi Kata Sandi Baru
                  </Label>
                  <div className="relative">
                    <Input
                      id="own-confirm-password"
                      type={showOwnConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={ownConfirmPassword}
                      onChange={(e) => {
                        setOwnConfirmPassword(e.target.value);
                        if (passwordFormError) setPasswordFormError(null);
                      }}
                      required
                      minLength={8}
                      disabled={isPending}
                      placeholder="Ulangi kata sandi baru"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOwnConfirmPassword((prev) => !prev)}
                      aria-label={
                        showOwnConfirmPassword
                          ? "Sembunyikan konfirmasi kata sandi baru"
                          : "Tampilkan konfirmasi kata sandi baru"
                      }
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 transition-colors"
                    >
                      {showOwnConfirmPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] px-2.5 py-0.5 ${
                      ownNewPasswordValidLength
                        ? "bg-[#E8FBF1] text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                        : "bg-[#FFFDF7] text-muted-foreground dark:bg-muted/40"
                    }`}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Minimal 8 karakter
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] px-2.5 py-0.5 ${
                      ownNewPasswordMatches
                        ? "bg-[#E8FBF1] text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                        : "bg-[#FFFDF7] text-muted-foreground dark:bg-muted/40"
                    }`}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Kata sandi cocok
                  </span>
                </div>

                <Button
                  type="submit"
                  className="w-full font-extrabold sm:w-auto"
                  disabled={
                    isPending ||
                    !ownCurrentPassword ||
                    !ownNewPasswordValidLength ||
                    !ownNewPasswordMatches
                  }
                >
                  <KeyRound className="size-4" />
                  {isPending ? "Memproses..." : "Simpan Sandi & Masuk Ulang"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Master Ruangan & Lemari Arsip Shortcut (OWNER & Admin Operasional) */}
      <Can action="locations.manage">
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-gradient-to-r from-[#CCFBF1]/70 via-[#FFFDF7] to-[#FEF3C7]/65 shadow-[4px_4px_0px_0px_#2C2623] dark:border-[#F5E9D6]/40 dark:from-[#1B3330]/75 dark:via-[#28221F] dark:to-[#3A311E]/55">
          <CardContent className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3.5 sm:items-center">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#99F6E4] text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-[#1E443E] dark:text-[#CCFBF1]">
                <MapPin className="size-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold tracking-tight text-[#2C2623] dark:text-[#FDF8F0]">
                    Master Ruangan &amp; Lemari Arsip
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-[#2C2623] bg-[#FFFDF7] text-[11px] font-extrabold text-[#115E59] dark:border-[#6D5D54] dark:bg-[#1B3330] dark:text-[#99F6E4]"
                  >
                    Dinamis
                  </Badge>
                </div>
                <p className="max-w-2xl text-xs font-medium text-[#5A4D46] dark:text-[#D5C6BA]">
                  Ubah nama Ruang Terapi 1–6, Gudang, Kantor, maupun Lemari Arsip
                  1–4, tambah lokasi baru, dan atur ruangan cek opname bulanan.
                  Semua data barang, arsip, stiker barcode, dan laporan otomatis
                  mengikuti nama terbaru.
                </p>
              </div>
            </div>

            <Button asChild className="shrink-0 font-extrabold">
              <Link href="/rooms">
                <MapPin className="size-4" />
                Kelola Ruangan &amp; Lemari Arsip
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </Can>

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
                    ? "Tambah anggota tim baru (seluruh peran termasuk Owner & Admin Operasional), ubah profil, atur ulang kata sandi, offboarding, hingga hapus akun."
                    : `Kelola akun ${ROLE_LABELS.TEAM_LEADER.title} serta ${ROLE_LABELS.STAFF.title}. Pengelolaan akun ${ROLE_LABELS.OWNER.title} dan ${ROLE_LABELS.SUPER_ADMIN.title} hanya dapat dilakukan oleh ${ROLE_LABELS.OWNER.title}.`}
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
                  Mode Admin Auth Terbatas (Kunci Server Belum Aktif)
                </AlertTitle>
                <AlertDescription>
                  Fitur tambah akun baru, ubah email, atur ulang kata sandi, dan hapus
                  permanen membutuhkan <code>SUPABASE_SERVICE_ROLE_KEY</code> di server.
                  Anda tetap bisa mengubah nama, jabatan, telepon, peran, status aktif,
                  dan status offboard anggota tim.
                </AlertDescription>
              </Alert>
            )}

            {visibleVaultWarnings.length > 0 && (
              <Alert
                variant="warning"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF3E8] shadow-[3px_3px_0px_0px_#2C2623] dark:bg-orange-950/40"
              >
                <KeyRound className="size-4" />
                <AlertTitle className="font-extrabold">
                  Pengingat Ganti Kata Sandi Akun Kantor
                </AlertTitle>
                <AlertDescription>
                  Ada {visibleVaultWarnings.length} staf yang sudah keluar tetapi namanya
                  masih tercatat memakai akun di Brankas Akun Digital. Segera ganti kata
                  sandi akun tersebut di menu Brankas Akun Digital.
                </AlertDescription>
              </Alert>
            )}

            {/* Team Filter Controls: Search + Role Filter + Status Filter Pills */}
            <div className="space-y-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#F5E9D6]/35 dark:bg-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                  <Input
                    value={teamQuery}
                    onChange={(e) => setTeamQuery(e.target.value)}
                    placeholder="Cari nama, email, jabatan, telepon, atau peran tim..."
                    className="pl-9"
                  />
                </div>

                <div className="w-full sm:w-56">
                  <Select
                    value={roleFilter}
                    onValueChange={(val) => setRoleFilter(val as "ALL" | Role)}
                  >
                    <SelectTrigger
                      aria-label="Filter berdasarkan peran"
                      className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold dark:border-[#F5E9D6]/40 dark:bg-background"
                    >
                      <SelectValue placeholder="Semua Peran" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">
                        Semua Peran ({users.length})
                      </SelectItem>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r].title} ({roleCounts[r]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div
                  role="tablist"
                  aria-label="Filter status pengguna"
                  className="inline-flex flex-wrap items-center gap-1 rounded-xl border-2 border-[#2C2623] bg-[#FFFBE6]/70 p-1 dark:border-[#F5E9D6]/35 dark:bg-muted/40"
                >
                  {(
                    [
                      {
                        key: "all",
                        label: `Semua (${users.length})`,
                        activeClass:
                          "bg-[#A7F3D0] text-[#2C2623] dark:bg-emerald-300 dark:text-[#2C2623]",
                      },
                      {
                        key: "active",
                        label: `Aktif (${activeUsersCount})`,
                        activeClass:
                          "bg-[#BAE6FD] text-[#2C2623] dark:bg-sky-300 dark:text-[#2C2623]",
                      },
                      {
                        key: "inactive",
                        label: `Nonaktif (${inactiveUsersCount})`,
                        activeClass:
                          "bg-[#FDE68A] text-[#2C2623] dark:bg-amber-300 dark:text-[#2C2623]",
                      },
                      {
                        key: "offboard",
                        label: `Offboard (${offboardedUsersCount})`,
                        activeClass:
                          "bg-[#FDA4AF] text-[#2C2623] dark:bg-rose-300 dark:text-[#2C2623]",
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === tab.key}
                      onClick={() => setStatusFilter(tab.key)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition-all ${
                        statusFilter === tab.key
                          ? `border-2 border-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] ${tab.activeClass}`
                          : "border-2 border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                  <span>
                    Menampilkan {filteredUsers.length} dari {users.length} anggota
                  </span>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setTeamQuery("");
                        setRoleFilter("ALL");
                        setStatusFilter("all");
                      }}
                      className="rounded-lg border-2 border-[#2C2623] bg-[#FFF0F5] px-2 py-0.5 text-[11px] font-extrabold text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-[#F5E9D6]/40 dark:bg-rose-950/50 dark:text-rose-100"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <KawaiiEmptyState
                mascot="gear"
                title="Tidak Ada Anggota Tim yang Cocok"
                description="Coba ubah kata kunci pencarian, filter peran, atau pilih status Semua untuk menampilkan seluruh anggota tim."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTeamQuery("");
                      setRoleFilter("ALL");
                      setStatusFilter("all");
                    }}
                  >
                    Tampilkan Semua Tim
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredUsers.map((member) => {
                  const isSelf = member.id === ownProfile.id;
                  const canManageTarget = canManageTargetRole(role, member.role);
                  const canManageOther = !isSelf && canManageTarget;
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
                          variant={
                            member.offboarded_at
                              ? "destructive"
                              : member.is_active
                                ? "secondary"
                                : "destructive"
                          }
                          className={
                            member.offboarded_at
                              ? "shrink-0 border-[#2C2623] bg-[#FDA4AF] font-extrabold text-[#2C2623] dark:bg-rose-900/70 dark:text-rose-100"
                              : member.is_active
                                ? "shrink-0 border-[#2C2623] bg-[#E8FBF1] font-extrabold text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                                : "shrink-0 font-extrabold"
                          }
                        >
                          {member.offboarded_at
                            ? "Offboard"
                            : member.is_active
                              ? "Aktif"
                              : "Nonaktif"}
                        </Badge>
                      </div>

                      {/* Member Body & Quick Controls */}
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
                              {canManageOther ? (
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
                              {canManageOther ? (
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
                            Status kerja:{" "}
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">
                              Masih aktif bekerja
                            </span>
                          </p>
                        )}
                      </div>

                      {/* Card Footer: CRUD Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-dashed border-[#2C2623]/15 bg-[#FFFDF7]/80 px-4 py-3 dark:bg-muted/20">
                        {canManageTarget ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() => openEditDialog(member)}
                                className="bg-[#E8F6FF] font-extrabold text-[#2C2623] hover:bg-[#BAE6FD] dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-900/70"
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() => openResetPasswordDialog(member)}
                                className="bg-[#FFFBE6] font-extrabold text-[#2C2623] hover:bg-[#FDE68A] dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/70"
                              >
                                <KeyRound className="size-3.5" />
                                Reset Sandi
                              </Button>
                            </div>

                            {canManageOther ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending}
                                  onClick={() =>
                                    handleToggleOffboard(
                                      member.id,
                                      !member.offboarded_at,
                                    )
                                  }
                                  className={
                                    member.offboarded_at
                                      ? "bg-[#E8FBF1] font-extrabold text-[#14532D] hover:bg-[#A7F3D0] dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900/70"
                                      : "bg-[#FFF3E8] font-extrabold text-[#9A3412] hover:bg-[#FED7AA] dark:bg-orange-950/60 dark:text-orange-200 dark:hover:bg-orange-900/70"
                                  }
                                >
                                  {member.offboarded_at ? (
                                    <>
                                      <UserCheck className="size-3.5" />
                                      Aktifkan
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="size-3.5" />
                                      Offboard
                                    </>
                                  )}
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending}
                                  onClick={() => openDeleteDialog(member)}
                                  className="bg-[#FFE4E6] font-extrabold text-[#9F1239] hover:bg-[#FECDD3] dark:bg-rose-950/60 dark:text-rose-200 dark:hover:bg-rose-900/70"
                                >
                                  <Trash2 className="size-3.5" />
                                  Hapus
                                </Button>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-[#2C2623]/50 bg-[#FFFBE6] text-[11px] font-bold text-[#2C2623] dark:bg-amber-950/40 dark:text-amber-100"
                              >
                                Akun Anda
                              </Badge>
                            )}
                          </>
                        ) : (
                          <div className="ml-auto">
                            <Badge
                              variant="outline"
                              className="border-[#2C2623]/50 bg-[#FFFBE6] text-[11px] font-bold text-[#2C2623] dark:bg-amber-950/40 dark:text-amber-100"
                            >
                              {isSelf
                                ? "Akun Anda"
                                : `Dikelola ${ROLE_LABELS.OWNER.title}`}
                            </Badge>
                          </div>
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
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <UserPlus className="size-4" />
                </span>
                Tambah Anggota Tim Baru
              </DialogTitle>
              <DialogDescription>
                {canManageAdmins
                  ? "Buat akun masuk baru untuk seluruh peran tim Star Champs Indonesia."
                  : `Buat akun masuk baru untuk ${ROLE_LABELS.TEAM_LEADER.title} atau ${ROLE_LABELS.STAFF.title}.`}
              </DialogDescription>
            </DialogHeader>

            {!serviceRoleConfigured && (
              <Alert
                variant="warning"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/40"
              >
                <AlertTriangle className="size-4" />
                <AlertTitle className="font-extrabold">
                  Kunci Admin Belum Aktif
                </AlertTitle>
                <AlertDescription>
                  Hubungi pengelola server untuk memasang{" "}
                  <code>SUPABASE_SERVICE_ROLE_KEY</code> agar pendaftaran pengguna
                  baru dapat dijalankan.
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
                    minLength={2}
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
                  <div className="relative">
                    <Input
                      id="new-user-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Minimal 8 karakter"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={
                        showNewPassword
                          ? "Sembunyikan password"
                          : "Tampilkan password"
                      }
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 transition-colors"
                    >
                      {showNewPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <DialogFooter className="pt-2">
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

      {/* Edit User Modal Dialog */}
      {canManageUsers && (
        <Dialog
          open={Boolean(editingUser)}
          onOpenChange={(open) => {
            if (!open) closeEditDialog();
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#BAE6FD] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Pencil className="size-4" />
                </span>
                Edit Data Pengguna
              </DialogTitle>
              <DialogDescription>
                Perbarui informasi lengkap, peran akses, dan status aktif anggota tim.
              </DialogDescription>
            </DialogHeader>

            {editingUser && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#E8F6FF]/80 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-sky-950/35 dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#BAE6FD] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                      {getInitials(editingUser.full_name, editingUser.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">
                        {editingUser.full_name || "Tanpa Nama"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {editingUser.email ?? "-"}
                      </p>
                    </div>
                  </div>
                  <RoleBadge role={editingUser.role} />
                </div>

                {editFormError && (
                  <Alert
                    variant="destructive"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Periksa Input
                    </AlertTitle>
                    <AlertDescription>{editFormError}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleUpdateUser} className="space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-user-name" className="font-bold">
                        Nama Lengkap
                      </Label>
                      <Input
                        id="edit-user-name"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        required
                        minLength={2}
                        placeholder="Nama lengkap anggota"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="edit-user-email" className="font-bold">
                        Email
                      </Label>
                      <Input
                        id="edit-user-email"
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        required
                        disabled={!serviceRoleConfigured || isPending}
                        placeholder="nama@starchamps.id"
                      />
                    </div>
                  </div>

                  {!serviceRoleConfigured && (
                    <div className="flex items-start gap-2 rounded-xl border-2 border-[#2C2623]/70 bg-[#FFFBE6] px-3 py-2 text-xs font-medium text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-amber-950/40 dark:text-amber-100">
                      <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
                      <span>
                        Pengubahan alamat email membutuhkan{" "}
                        <code>SUPABASE_SERVICE_ROLE_KEY</code> di server. Kolom nama,
                        jabatan, nomor telepon, peran, dan status aktif tetap dapat
                        diperbarui normal.
                      </span>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-user-job" className="font-bold">
                        Jabatan
                      </Label>
                      <Input
                        id="edit-user-job"
                        value={editJobTitle}
                        onChange={(e) => setEditJobTitle(e.target.value)}
                        placeholder="Terapis Okupasi / Koordinator Ruang"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="edit-user-phone" className="font-bold">
                        Nomor Telepon
                      </Label>
                      <Input
                        id="edit-user-phone"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="081234567890"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-2xl border-2 border-[#2C2623]/25 bg-[#FFFDF7] p-3.5 sm:grid-cols-2 dark:border-[#F5E9D6]/25 dark:bg-muted/25">
                    <div className="space-y-1.5">
                      <Label className="font-bold">Peran</Label>
                      <Select
                        value={editRole}
                        disabled={isPending || isEditingSelf}
                        onValueChange={(val) => setEditRole(val as Role)}
                      >
                        <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold dark:border-[#F5E9D6]/40 dark:bg-background">
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
                      <Label className="font-bold">Status Aktif</Label>
                      <div className="flex h-9 items-center gap-2.5 rounded-xl border-2 border-[#2C2623]/25 bg-[#FFFBE6]/50 px-3 dark:border-[#F5E9D6]/25 dark:bg-muted/30">
                        <Switch
                          checked={editIsActive}
                          disabled={isPending || isEditingSelf}
                          onCheckedChange={setEditIsActive}
                        />
                        <span className="text-xs font-extrabold">
                          {editIsActive
                            ? "Aktif (Bisa Masuk)"
                            : "Nonaktif (Dibekukan)"}
                        </span>
                      </div>
                    </div>

                    {isEditingSelf && (
                      <p className="text-muted-foreground text-[11px] font-semibold sm:col-span-2">
                        Peran dan status aktif akun Anda sendiri dikunci demi keamanan
                        akses sistem.
                      </p>
                    )}
                  </div>

                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeEditDialog}
                      disabled={isPending}
                    >
                      Batal
                    </Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending ? "Menyimpan..." : "Simpan Perubahan"}
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Reset Password Modal Dialog */}
      {canManageUsers && (
        <Dialog
          open={Boolean(resetPasswordUser)}
          onOpenChange={(open) => {
            if (!open) closeResetPasswordDialog();
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <KeyRound className="size-4" />
                </span>
                Atur Ulang Kata Sandi
              </DialogTitle>
              <DialogDescription>
                Tetapkan kata sandi baru untuk akun anggota tim ini. Sampaikan sandi
                baru secara pribadi dan aman.
              </DialogDescription>
            </DialogHeader>

            {resetPasswordUser && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6]/90 p-3 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-amber-950/35 dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDE68A] text-xs font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                      {getInitials(
                        resetPasswordUser.full_name,
                        resetPasswordUser.email,
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">
                        {resetPasswordUser.full_name || "Tanpa Nama"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {resetPasswordUser.email ?? "-"}
                      </p>
                    </div>
                  </div>
                  <RoleBadge role={resetPasswordUser.role} />
                </div>

                {!serviceRoleConfigured && (
                  <Alert
                    variant="warning"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/40"
                  >
                    <Info className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Kunci Admin Server Belum Aktif
                    </AlertTitle>
                    <AlertDescription>
                      Atur ulang kata sandi membutuhkan{" "}
                      <code>SUPABASE_SERVICE_ROLE_KEY</code> pada environment server.
                      Silakan hubungi pengelola server untuk mengaktifkannya.
                    </AlertDescription>
                  </Alert>
                )}

                {resetFormError && (
                  <Alert
                    variant="destructive"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Kata Sandi Belum Valid
                    </AlertTitle>
                    <AlertDescription>{resetFormError}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleResetPassword} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-password-new" className="font-bold">
                      Kata Sandi Baru (min. 8 karakter)
                    </Label>
                    <div className="relative">
                      <Input
                        id="reset-password-new"
                        type={showResetPassword ? "text" : "password"}
                        value={resetPassword}
                        onChange={(e) => {
                          setResetPassword(e.target.value);
                          if (resetFormError) setResetFormError(null);
                        }}
                        required
                        minLength={8}
                        disabled={!serviceRoleConfigured || isPending}
                        autoComplete="new-password"
                        placeholder="Masukkan kata sandi baru (min. 8 karakter)"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((prev) => !prev)}
                        aria-label={
                          showResetPassword
                            ? "Sembunyikan kata sandi baru"
                            : "Tampilkan kata sandi baru"
                        }
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 transition-colors"
                      >
                        {showResetPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reset-password-confirm" className="font-bold">
                      Konfirmasi Kata Sandi Baru
                    </Label>
                    <div className="relative">
                      <Input
                        id="reset-password-confirm"
                        type={showResetPasswordConfirm ? "text" : "password"}
                        value={resetPasswordConfirm}
                        onChange={(e) => {
                          setResetPasswordConfirm(e.target.value);
                          if (resetFormError) setResetFormError(null);
                        }}
                        required
                        minLength={8}
                        disabled={!serviceRoleConfigured || isPending}
                        autoComplete="new-password"
                        placeholder="Ulangi kata sandi baru"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowResetPasswordConfirm((prev) => !prev)
                        }
                        aria-label={
                          showResetPasswordConfirm
                            ? "Sembunyikan konfirmasi kata sandi"
                            : "Tampilkan konfirmasi kata sandi"
                        }
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 transition-colors"
                      >
                        {showResetPasswordConfirm ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] px-2.5 py-0.5 ${
                        resetPasswordValidLength
                          ? "bg-[#E8FBF1] text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                          : "bg-[#FFFDF7] text-muted-foreground dark:bg-muted/40"
                      }`}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Minimal 8 karakter
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] px-2.5 py-0.5 ${
                        resetPasswordMatches
                          ? "bg-[#E8FBF1] text-[#14532D] dark:bg-emerald-950/60 dark:text-emerald-200"
                          : "bg-[#FFFDF7] text-muted-foreground dark:bg-muted/40"
                      }`}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Kata sandi cocok
                    </span>
                  </div>

                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeResetPasswordDialog}
                      disabled={isPending}
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        isPending ||
                        !serviceRoleConfigured ||
                        !resetPasswordValidLength ||
                        !resetPasswordMatches
                      }
                    >
                      {isPending ? "Memproses..." : "Simpan Kata Sandi Baru"}
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete User Confirmation Modal Dialog */}
      {canManageUsers && (
        <Dialog
          open={Boolean(deletingUser)}
          onOpenChange={(open) => {
            if (!open) closeDeleteDialog();
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-extrabold text-[#9F1239] dark:text-rose-300">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDA4AF] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Trash2 className="size-4" />
                </span>
                Hapus Akun Pengguna
              </DialogTitle>
              <DialogDescription>
                Tindakan hapus permanen akan menghapus akun login serta data profil
                pengguna ini secara permanen dan tidak dapat dibatalkan.
              </DialogDescription>
            </DialogHeader>

            {deletingUser && (
              <div className="space-y-4">
                {/* Target User Summary Card */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-rose-950/35 dark:shadow-[2px_2px_0px_0px_#0E0B0A]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDA4AF] text-sm font-black text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                      {getInitials(deletingUser.full_name, deletingUser.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">
                        {deletingUser.full_name || "Tanpa Nama"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {deletingUser.email ?? "-"}
                      </p>
                      {deletingUser.job_title && (
                        <p className="text-muted-foreground mt-0.5 truncate text-[11px] font-semibold">
                          {deletingUser.job_title}
                        </p>
                      )}
                    </div>
                  </div>
                  <RoleBadge role={deletingUser.role} />
                </div>

                {/* Permanent Warning */}
                {!blockingHistory && (
                  <div className="flex items-start gap-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6]/85 p-3 text-xs font-semibold text-[#881337] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-rose-950/50 dark:text-rose-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>
                      <strong>Peringatan:</strong> Menghapus akun bersifat{" "}
                      <strong>permanen dan tidak dapat dikembalikan</strong>. Jika
                      ingin menonaktifkan akses tanpa menghapus rekam jejak kerja,
                      pilih fitur <strong>Offboard</strong>.
                    </p>
                  </div>
                )}

                {!serviceRoleConfigured && (
                  <Alert
                    variant="warning"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-amber-950/40"
                  >
                    <Info className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Kunci Admin Server Belum Aktif
                    </AlertTitle>
                    <AlertDescription>
                      Hapus akun permanen membutuhkan{" "}
                      <code>SUPABASE_SERVICE_ROLE_KEY</code> di server. Sebagai
                      alternatif aman, Anda tetap dapat menandai akun ini sebagai{" "}
                      <strong>Offboard &amp; Nonaktif</strong>.
                    </AlertDescription>
                  </Alert>
                )}

                {deleteFormError && (
                  <Alert
                    variant="destructive"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF0F5] shadow-[2px_2px_0px_0px_#2C2623] dark:bg-rose-950/40"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Tidak Dapat Menghapus Akun
                    </AlertTitle>
                    <AlertDescription>{deleteFormError}</AlertDescription>
                  </Alert>
                )}

                {/* Warm Pastel Blocking History Warning Card */}
                {blockingHistory && (
                  <div className="space-y-3.5 rounded-2xl border-2 border-[#2C2623] bg-[#FFF8E7] p-4 shadow-[3px_3px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-amber-950/45 dark:shadow-[3px_3px_0px_0px_#0E0B0A]">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]">
                        <AlertTriangle className="size-4" />
                      </span>
                      <div className="space-y-1">
                        <h4 className="text-sm font-extrabold text-[#2C2623] dark:text-amber-100">
                          Akun Masih Terhubung dengan Riwayat Operasional
                        </h4>
                        <p className="text-xs font-medium text-[#57493F] dark:text-amber-200/90">
                          {blockingHistory.message}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border-2 border-[#2C2623] bg-[#E8F6FF] px-3 py-2 text-center shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-sky-950/55">
                        <p className="text-lg font-black text-[#2C2623] dark:text-sky-100">
                          {blockingHistory.borrowCount}
                        </p>
                        <p className="text-[11px] font-extrabold text-[#334155] dark:text-sky-200">
                          Riwayat Peminjaman
                        </p>
                      </div>
                      <div className="rounded-xl border-2 border-[#2C2623] bg-[#F3EEFF] px-3 py-2 text-center shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-violet-950/55">
                        <p className="text-lg font-black text-[#2C2623] dark:text-violet-100">
                          {blockingHistory.requestCount}
                        </p>
                        <p className="text-[11px] font-extrabold text-[#3B2F63] dark:text-violet-200">
                          Riwayat Pengajuan
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isPending}
                        onClick={handleOffboardFromDeleteDialog}
                        className="w-full bg-[#E8FBF1] font-extrabold text-[#14532D] hover:bg-[#A7F3D0] dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900/70"
                      >
                        <UserX className="size-4" />
                        Offboard &amp; Nonaktifkan Saja
                      </Button>

                      {ownProfile.role === "OWNER" && (
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={isPending || !serviceRoleConfigured}
                          onClick={() => handleDeleteUser(true)}
                          className="w-full font-extrabold"
                        >
                          <ArrowRightLeft className="size-4" />
                          Alihkan Riwayat ke Akun Saya &amp; Hapus Permanen
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <DialogFooter className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeDeleteDialog}
                    disabled={isPending}
                  >
                    Batal
                  </Button>

                  {!blockingHistory && !serviceRoleConfigured && !deletingUser.offboarded_at && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={handleOffboardFromDeleteDialog}
                      className="bg-[#FFF3E8] font-extrabold text-[#9A3412] hover:bg-[#FED7AA] dark:bg-orange-950/60 dark:text-orange-200"
                    >
                      <UserX className="size-4" />
                      Offboard &amp; Nonaktifkan Saja
                    </Button>
                  )}

                  {!blockingHistory && (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isPending || !serviceRoleConfigured}
                      onClick={() => handleDeleteUser(false)}
                      className="font-extrabold"
                    >
                      <Trash2 className="size-4" />
                      {isPending ? "Menghapus..." : "Ya, Hapus Permanen"}
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Unlink Google Confirmation Dialog (tersedia untuk semua peran) */}
      <Dialog
        open={unlinkDialogOpen}
        onOpenChange={(open) => {
          if (!isPending && !googleBusy) {
            setUnlinkDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-extrabold text-[#9F1239] dark:text-rose-300">
              <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDA4AF] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                <Unlink className="size-4" />
              </span>
              Putuskan Koneksi Akun Google?
            </DialogTitle>
            <DialogDescription>
              Anda akan melepas tautan akun Google dari profil StarOps Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="flex items-center gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#E8F6FF]/80 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-sky-950/35">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-white shadow-[2px_2px_0px_0px_#2C2623]">
                <GoogleGIcon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">
                  {googleState.email ?? currentLoginEmail ?? "Akun Google"}
                </p>
                <p className="text-muted-foreground text-xs font-medium">
                  Terhubung dengan akun StarOps Anda
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBE6] p-3 text-xs font-semibold text-[#57493F] shadow-[2px_2px_0px_0px_#2C2623] dark:border-[#6D5D54] dark:bg-amber-950/40 dark:text-amber-100">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
              <p>
                Setelah diputuskan, Anda tidak dapat masuk menggunakan tombol
                Google untuk akun ini, namun tetap bisa masuk dengan alamat email{" "}
                <strong>{currentLoginEmail || "terdaftar"}</strong> dan kata
                sandi Anda. Anda dapat menghubungkannya kembali kapan saja.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUnlinkDialogOpen(false)}
              disabled={isPending || googleBusy}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleUnlinkGoogle}
              disabled={isPending || googleBusy}
              className="font-extrabold"
            >
              <Unlink className="size-4" />
              {isPending || googleBusy ? "Memutuskan..." : "Ya, Putuskan Google"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
