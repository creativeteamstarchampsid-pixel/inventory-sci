"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserX,
  Users,
} from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createSubscriptionAction,
  revealSecretAction,
  rotateSubscriptionPasswordAction,
  softDeleteSubscriptionAction,
  updateSubscriptionAction,
  type AssignedVaultUser,
  type RevealedSecret,
} from "@/lib/actions/vault";
import {
  BILLING_CYCLE_LABELS,
  PAYMENT_METHOD_LABELS,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import type { BillingCycle, PaymentMethod } from "@/types/database";
import {
  findOffboardedUsersForSub,
  getRenewalAlert,
  type OffboardedUserFlag,
  type VaultProfileOption,
  type VaultSubscriptionItem,
} from "./vault-types";

type VaultClientProps = {
  subscriptions: VaultSubscriptionItem[];
  profiles: VaultProfileOption[];
  vaultKeyConfigured: boolean;
  schemaError?: string | null;
};

type FormState = {
  id?: string;
  service_name: string;
  plan_name: string;
  login_email: string;
  password_plain: string;
  pin_recovery_plain: string;
  clear_pin_recovery: boolean;
  billing_cycle: BillingCycle;
  cost: string;
  payment_method: PaymentMethod;
  payment_account_label: string;
  renewal_date: string;
  auto_renew: boolean;
  max_slots: string;
  assigned_user_ids: string[];
  notes: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  service_name: "",
  plan_name: "",
  login_email: "",
  password_plain: "",
  pin_recovery_plain: "",
  clear_pin_recovery: false,
  billing_cycle: "BULANAN",
  cost: "0",
  payment_method: "TRANSFER_BANK",
  payment_account_label: "",
  renewal_date: "",
  auto_renew: true,
  max_slots: "1",
  assigned_user_ids: [],
  notes: "",
  is_active: true,
};

function generateStrongPassword(length = 16): string {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += charset[bytes[i] % charset.length];
  }
  return output;
}

export function VaultClient({
  subscriptions,
  profiles,
  vaultKeyConfigured,
  schemaError,
}: VaultClientProps) {
  const { can } = useRole();
  const canViewBilling = can("vault.view_billing");
  const canReveal = can("vault.reveal_secret");
  const canManage = can("vault.manage");

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<
    "all" | "expiring" | "rotate" | "active" | "inactive"
  >("all");
  const [cycleFilter, setCycleFilter] = useState<"ALL" | BillingCycle>("ALL");

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyingSubId, setCopyingSubId] = useState<string | null>(null);

  // Form Dialog (Create / Edit)
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reveal Dialog
  const [revealTarget, setRevealTarget] = useState<VaultSubscriptionItem | null>(
    null,
  );
  const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(
    null,
  );
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [showPlainPassword, setShowPlainPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Rotate Password Dialog
  const [rotateTarget, setRotateTarget] = useState<{
    sub: VaultSubscriptionItem;
    flagged: OffboardedUserFlag[];
  } | null>(null);
  const [rotatePassword, setRotatePassword] = useState("");
  const [rotatePin, setRotatePin] = useState("");
  const [removeUserIds, setRemoveUserIds] = useState<string[]>([]);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [showRotatePassword, setShowRotatePassword] = useState(false);

  // Delete Confirmation Dialog
  const [deleteTarget, setDeleteTarget] =
    useState<VaultSubscriptionItem | null>(null);

  const profilesById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const profilesByEmail = useMemo(() => {
    const map = new Map<string, VaultProfileOption>();
    for (const p of profiles) {
      if (p.email) map.set(p.email.toLowerCase(), p);
    }
    return map;
  }, [profiles]);

  const enriched = useMemo(() => {
    return subscriptions.map((sub) => {
      const renewal = getRenewalAlert(sub.renewal_date, sub.is_active);
      const offboardedFlags = findOffboardedUsersForSub(
        sub.assigned_users,
        sub.password_rotated_at,
        profilesById,
        profilesByEmail,
      );
      return {
        sub,
        renewal,
        offboardedFlags,
      };
    });
  }, [subscriptions, profilesById, profilesByEmail]);

  const summary = useMemo(() => {
    let activeCount = 0;
    let expiringCount = 0;
    let mustRotateCount = 0;
    let monthlyBurn = 0;

    for (const item of enriched) {
      if (item.sub.is_active) activeCount += 1;
      if (
        item.sub.is_active &&
        item.renewal.daysLeft !== null &&
        item.renewal.daysLeft <= 7
      ) {
        expiringCount += 1;
      }
      if (item.sub.is_active && item.offboardedFlags.length > 0) {
        mustRotateCount += 1;
      }
      if (canViewBilling && item.sub.is_active && item.sub.cost !== null) {
        if (item.sub.billing_cycle === "BULANAN") {
          monthlyBurn += item.sub.cost;
        } else if (item.sub.billing_cycle === "TAHUNAN") {
          monthlyBurn += Math.round(item.sub.cost / 12);
        }
      }
    }

    return {
      activeCount,
      expiringCount,
      mustRotateCount,
      monthlyBurn,
    };
  }, [enriched, canViewBilling]);

  const offboardingAlerts = useMemo(
    () => enriched.filter((e) => e.sub.is_active && e.offboardedFlags.length > 0),
    [enriched],
  );

  const expiringAlerts = useMemo(
    () =>
      enriched.filter(
        (e) =>
          e.sub.is_active &&
          e.renewal.daysLeft !== null &&
          e.renewal.daysLeft <= 7,
      ),
    [enriched],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ sub, renewal, offboardedFlags }) => {
      if (filterTab === "expiring") {
        if (!sub.is_active || renewal.daysLeft === null || renewal.daysLeft > 7) {
          return false;
        }
      } else if (filterTab === "rotate") {
        if (!sub.is_active || offboardedFlags.length === 0) return false;
      } else if (filterTab === "active") {
        if (!sub.is_active) return false;
      } else if (filterTab === "inactive") {
        if (sub.is_active) return false;
      }

      if (cycleFilter !== "ALL" && sub.billing_cycle !== cycleFilter) {
        return false;
      }

      if (!q) return true;
      const haystack = [
        sub.sub_code,
        sub.service_name,
        sub.plan_name ?? "",
        sub.login_email,
        ...sub.assigned_users.map((u) => `${u.full_name ?? ""} ${u.email ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [enriched, filterTab, cycleFilter, search]);

  async function copyToClipboard(text: string, marker: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(marker);
      setTimeout(() => {
        setCopiedField((prev) => (prev === marker ? null : prev));
      }, 2500);
      return true;
    } catch {
      return false;
    }
  }

  function openCreateDialog() {
    setFormMode("create");
    setForm(EMPTY_FORM);
    setUserSearch("");
    setFormError(null);
    setShowFormPassword(false);
    setFormOpen(true);
  }

  function openEditDialog(sub: VaultSubscriptionItem) {
    setFormMode("edit");
    const matchedIds: string[] = [];
    for (const u of sub.assigned_users) {
      const byId = profilesById.get(u.user_id);
      if (byId) {
        matchedIds.push(byId.id);
      } else if (u.email) {
        const byEmail = profilesByEmail.get(u.email.toLowerCase());
        if (byEmail) matchedIds.push(byEmail.id);
      }
    }

    setForm({
      id: sub.id,
      service_name: sub.service_name,
      plan_name: sub.plan_name ?? "",
      login_email: sub.login_email,
      password_plain: "",
      pin_recovery_plain: "",
      clear_pin_recovery: false,
      billing_cycle: sub.billing_cycle,
      cost: String(sub.cost ?? 0),
      payment_method: sub.payment_method ?? "TRANSFER_BANK",
      payment_account_label: sub.payment_account_label ?? "",
      renewal_date: sub.renewal_date ?? "",
      auto_renew: sub.auto_renew,
      max_slots: String(sub.max_slots),
      assigned_user_ids: Array.from(new Set(matchedIds)),
      notes: sub.notes ?? "",
      is_active: sub.is_active,
    });
    setUserSearch("");
    setFormError(null);
    setShowFormPassword(false);
    setFormOpen(true);
  }

  async function handleRevealOpen(sub: VaultSubscriptionItem) {
    setRevealTarget(sub);
    setRevealedSecret(null);
    setRevealError(null);
    setShowPlainPassword(false);
    setRevealLoading(true);

    const res = await revealSecretAction(sub.id);
    setRevealLoading(false);
    if (!res.ok) {
      setRevealError(res.error);
      return;
    }
    setRevealedSecret(res.data);
  }

  async function handleOneClickCopyPassword(sub: VaultSubscriptionItem) {
    setCopyingSubId(sub.id);
    setFeedback(null);
    const res = await revealSecretAction(sub.id);
    setCopyingSubId(null);

    if (!res.ok) {
      setFeedback({ type: "error", message: res.error });
      return;
    }

    const copied = await copyToClipboard(res.data.passwordPlain, `row-${sub.id}`);
    if (copied) {
      setCopiedId(sub.id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === sub.id ? null : prev));
      }, 3000);
      setFeedback({
        type: "success",
        message: `Kata sandi ${sub.service_name} (${sub.sub_code}) berhasil disalin ke clipboard (tercatat di Audit Log).`,
      });
    } else {
      // Fallback: show modal so admin can copy manually
      setRevealTarget(sub);
      setRevealedSecret(res.data);
      setRevealError(null);
      setShowPlainPassword(false);
    }
  }

  function handleToggleAssignedUser(profileId: string, checked: boolean) {
    setForm((prev) => {
      if (checked) {
        if (prev.assigned_user_ids.includes(profileId)) return prev;
        return {
          ...prev,
          assigned_user_ids: [...prev.assigned_user_ids, profileId],
        };
      }
      return {
        ...prev,
        assigned_user_ids: prev.assigned_user_ids.filter((id) => id !== profileId),
      };
    });
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const maxSlotsNum = Number.parseInt(form.max_slots, 10);
    const costNum = Number(form.cost || 0);

    if (!Number.isInteger(maxSlotsNum) || maxSlotsNum < 1) {
      setFormError("Slot maksimal harus berupa bilangan bulat >= 1.");
      return;
    }
    if (!Number.isFinite(costNum) || costNum < 0) {
      setFormError("Biaya langganan harus berupa angka >= 0.");
      return;
    }
    if (form.assigned_user_ids.length > maxSlotsNum) {
      setFormError(
        `Pengguna terpilih (${form.assigned_user_ids.length}) melebihi kapasitas slot (${maxSlotsNum}).`,
      );
      return;
    }
    if (formMode === "create" && form.password_plain.length === 0) {
      setFormError("Kata sandi akun wajib diisi.");
      return;
    }

    const assignedUsers: AssignedVaultUser[] = form.assigned_user_ids.map(
      (id) => {
        const p = profilesById.get(id);
        return {
          user_id: id,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          role: p?.role,
        };
      },
    );

    startTransition(async () => {
      if (formMode === "create") {
        const res = await createSubscriptionAction({
          service_name: form.service_name,
          plan_name: form.plan_name || null,
          login_email: form.login_email,
          password_plain: form.password_plain,
          pin_recovery_plain: form.pin_recovery_plain || null,
          billing_cycle: form.billing_cycle,
          cost: costNum,
          payment_method: form.payment_method,
          payment_account_label: form.payment_account_label || null,
          renewal_date: form.renewal_date || null,
          auto_renew: form.auto_renew,
          max_slots: maxSlotsNum,
          assigned_users: assignedUsers,
          notes: form.notes || null,
          is_active: form.is_active,
        });

        if (!res.ok) {
          setFormError(res.error);
          return;
        }

        setFormOpen(false);
        setFeedback({
          type: "success",
          message: `Langganan ${form.service_name} (${res.data.sub_code}) berhasil ditambahkan ke Vault terenkripsi.`,
        });
      } else if (form.id) {
        const res = await updateSubscriptionAction({
          id: form.id,
          service_name: form.service_name,
          plan_name: form.plan_name || null,
          login_email: form.login_email,
          password_plain: form.password_plain || null,
          pin_recovery_plain: form.pin_recovery_plain || null,
          clear_pin_recovery: form.clear_pin_recovery,
          billing_cycle: form.billing_cycle,
          cost: costNum,
          payment_method: form.payment_method,
          payment_account_label: form.payment_account_label || null,
          renewal_date: form.renewal_date || null,
          auto_renew: form.auto_renew,
          max_slots: maxSlotsNum,
          assigned_users: assignedUsers,
          notes: form.notes || null,
          is_active: form.is_active,
        });

        if (!res.ok) {
          setFormError(res.error);
          return;
        }

        setFormOpen(false);
        setFeedback({
          type: "success",
          message: `Perubahan langganan ${form.service_name} (${res.data.sub_code}) berhasil disimpan.`,
        });
      }
    });
  }

  function openRotateDialog(
    sub: VaultSubscriptionItem,
    flagged: OffboardedUserFlag[],
  ) {
    setRotateTarget({ sub, flagged });
    setRotatePassword("");
    setRotatePin("");
    setRemoveUserIds(flagged.map((f) => f.userId));
    setRotateError(null);
    setShowRotatePassword(false);
  }

  function handleRotateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rotateTarget) return;
    setRotateError(null);

    if (!rotatePassword) {
      setRotateError("Kata sandi baru wajib diisi.");
      return;
    }

    startTransition(async () => {
      const res = await rotateSubscriptionPasswordAction({
        id: rotateTarget.sub.id,
        new_password: rotatePassword,
        new_pin_recovery: rotatePin || null,
        remove_user_ids: removeUserIds,
      });

      if (!res.ok) {
        setRotateError(res.error);
        return;
      }

      const name = rotateTarget.sub.service_name;
      setRotateTarget(null);
      setFeedback({
        type: "success",
        message: `Kata sandi ${name} berhasil dirotasi dan diperbarui.`,
      });
    });
  }

  function handleSoftDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await softDeleteSubscriptionAction(deleteTarget.id);
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        setDeleteTarget(null);
        return;
      }
      const deletedName = deleteTarget.service_name;
      setDeleteTarget(null);
      setFeedback({
        type: "success",
        message: `${deletedName} dipindahkan ke Recycle Bin (dapat dipulihkan dalam 30 hari).`,
      });
    });
  }

  const filteredProfiles = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return profiles.filter((p) => {
      if (!q) return true;
      return `${p.full_name ?? ""} ${p.email ?? ""} ${p.role}`
        .toLowerCase()
        .includes(q);
    });
  }, [profiles, userSearch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <KeyRound className="text-primary size-6" />
            Subscription Vault
          </h1>
          <p className="text-muted-foreground text-sm">
            {canViewBilling
              ? "Brankas akun digital operasional Star Champs (enkripsi AES-256), jadwal tagihan & keamanan offboarding."
              : "Direktori langganan aplikasi & slot pengguna (mode tampilan terbatas tanpa biaya, metode bayar, dan kata sandi)."}
          </p>
        </div>

        <Can action="vault.manage">
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            Tambah Langganan
          </Button>
        </Can>
      </div>

      {schemaError && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Gagal Memuat Data Subscription Vault</AlertTitle>
          <AlertDescription>{schemaError}</AlertDescription>
        </Alert>
      )}

      {!vaultKeyConfigured && canManage && (
        <Alert variant="warning">
          <Lock className="size-4" />
          <AlertTitle>Kunci Enkripsi Server Belum Dikonfigurasi</AlertTitle>
          <AlertDescription>
            Variabel environment <code>VAULT_ENCRYPTION_KEY</code> belum diatur atau kurang dari 16
            karakter. Tambah/ubah/buka kata sandi akan tertolak sampai kunci AES-256 dikonfigurasi di
            server.
          </AlertDescription>
        </Alert>
      )}

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Check className="size-4 text-emerald-600" />
          )}
          <AlertTitle>
            {feedback.type === "error" ? "Terjadi Kendala" : "Berhasil"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Staff Offboarding Warning Banner */}
      {offboardingAlerts.length > 0 && (
        <Alert variant="destructive" className="border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30">
          <ShieldAlert className="size-4" />
          <AlertTitle>
            Peringatan Keamanan Offboarding: {offboardingAlerts.length} Akun Wajib Rotasi Kata Sandi!
          </AlertTitle>
          <AlertDescription className="w-full space-y-2 pt-1">
            <p>
              Staf berikut berstatus nonaktif / offboarded setelah rotasi kata sandi terakhir,
              namun masih tercatat sebagai pengguna pada akun langganan di bawah ini:
            </p>
            <div className="w-full space-y-1.5">
              {offboardingAlerts.map(({ sub, offboardedFlags }) => (
                <div
                  key={sub.id}
                  className="bg-background/80 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 px-3 py-2 text-xs dark:border-red-900"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      {sub.service_name}{" "}
                      <span className="text-muted-foreground font-mono">({sub.sub_code})</span>
                    </div>
                    <div className="text-muted-foreground">
                      Mantan/Nonaktif:{" "}
                      {offboardedFlags
                        .map(
                          (f) =>
                            `${f.displayName}${
                              f.offboardedAt
                                ? ` (offboard ${formatDateWIB(f.offboardedAt)})`
                                : " (nonaktif)"
                            }`,
                        )
                        .join(", ")}{" "}
                      · Rotasi terakhir: {formatDateWIB(sub.password_rotated_at, true)}
                    </div>
                  </div>
                  <Can action="vault.manage">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => openRotateDialog(sub, offboardedFlags)}
                    >
                      <RefreshCw className="size-3.5" />
                      Rotasi Sandi Sekarang
                    </Button>
                  </Can>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Renewal H-7 / H-3 / H-1 Alert Banner */}
      {expiringAlerts.length > 0 && (
        <Alert variant="warning">
          <CalendarClock className="size-4" />
          <AlertTitle>
            Pengingat Perpanjangan: {expiringAlerts.length} Langganan Jatuh Tempo ≤ 7 Hari
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              {expiringAlerts.map(({ sub, renewal }) => (
                <Badge
                  key={sub.id}
                  variant={
                    renewal.tier === "overdue" || renewal.tier === "h1"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {sub.service_name}: {renewal.label} ({formatDateWIB(sub.renewal_date)})
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Langganan Aktif</span>
              <KeyRound className="text-muted-foreground size-4" />
            </CardDescription>
            <CardTitle className="text-2xl">{summary.activeCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Dari total {subscriptions.length} akun terdaftar di Vault
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Perpanjangan ≤ 7 Hari</span>
              <CalendarClock className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{summary.expiringCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Termasuk peringatan H-7, H-3, dan H-1
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Wajib Rotasi Sandi</span>
              <UserX className="size-4 text-red-600" />
            </CardDescription>
            <CardTitle className="text-2xl">{summary.mustRotateCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Terdampak staf offboarded / nonaktif
          </CardContent>
        </Card>

        <Can
          action="vault.view_billing"
          fallback={
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between">
                  <span>Akses Biaya & Sandi</span>
                  <Lock className="text-muted-foreground size-4" />
                </CardDescription>
                <CardTitle className="text-base">Mode Terbatas</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">
                Tagihan dan kredensial rahasia hanya dibuka untuk Owner & Super Admin
              </CardContent>
            </Card>
          }
        >
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Estimasi Biaya / Bulan</span>
                <CreditCard className="text-muted-foreground size-4" />
              </CardDescription>
              <CardTitle className="text-2xl">
                {formatRupiah(summary.monthlyBurn)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-xs">
              Akumulasi langganan bulanan & prorata tahunan aktif
            </CardContent>
          </Card>
        </Can>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs
              value={filterTab}
              onValueChange={(v) => setFilterTab(v as typeof filterTab)}
            >
              <TabsList className="flex-wrap">
                <TabsTrigger value="all">Semua ({subscriptions.length})</TabsTrigger>
                <TabsTrigger value="expiring">
                  H-7 Jatuh Tempo ({summary.expiringCount})
                </TabsTrigger>
                <TabsTrigger value="rotate">
                  Wajib Rotasi ({summary.mustRotateCount})
                </TabsTrigger>
                <TabsTrigger value="active">Aktif ({summary.activeCount})</TabsTrigger>
                <TabsTrigger value="inactive">Nonaktif</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari layanan, kode, email, staf..."
                  className="pl-8"
                />
              </div>
              <Select
                value={cycleFilter}
                onValueChange={(v) => setCycleFilter(v as "ALL" | BillingCycle)}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Semua Siklus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Siklus</SelectItem>
                  <SelectItem value="BULANAN">Bulanan</SelectItem>
                  <SelectItem value="TAHUNAN">Tahunan</SelectItem>
                  <SelectItem value="SEKALI_BAYAR">Sekali Bayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Layanan & Status</TableHead>
                <TableHead>Login & Slot Pengguna</TableHead>
                <TableHead>Jatuh Tempo</TableHead>
                {canViewBilling && <TableHead>Tagihan & Pembayaran</TableHead>}
                {canReveal && <TableHead>Kredensial</TableHead>}
                {canManage && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={
                      3 + (canViewBilling ? 1 : 0) + (canReveal ? 1 : 0) + (canManage ? 1 : 0)
                    }
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    Tidak ada akun langganan yang sesuai dengan filter saat ini.
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map(({ sub, renewal, offboardedFlags }) => {
                  const hasOffboardWarning =
                    sub.is_active && offboardedFlags.length > 0;
                  const offboardedIdSet = new Set(
                    offboardedFlags.map((f) => f.userId),
                  );

                  return (
                    <TableRow
                      key={sub.id}
                      className={
                        hasOffboardWarning
                          ? "bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/15 dark:hover:bg-red-950/25"
                          : undefined
                      }
                    >
                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold">{sub.service_name}</span>
                            {sub.plan_name && (
                              <Badge variant="outline" className="text-xs">
                                {sub.plan_name}
                              </Badge>
                            )}
                            {!sub.is_active && (
                              <Badge variant="secondary">Nonaktif</Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground font-mono text-xs">
                            {sub.sub_code}
                          </div>
                          {hasOffboardWarning && (
                            <Badge variant="destructive" className="mt-1">
                              <ShieldAlert className="size-3" />
                              Wajib Rotasi Sandi ({offboardedFlags.length} staf nonaktif)
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="font-mono text-xs break-all">
                              {sub.login_email}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 shrink-0"
                              title="Salin email login"
                              onClick={() =>
                                copyToClipboard(sub.login_email, `email-${sub.id}`)
                              }
                            >
                              {copiedField === `email-${sub.id}` ? (
                                <Check className="size-3 text-emerald-600" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </Button>
                          </div>

                          <div className="text-muted-foreground flex items-center gap-1 text-xs">
                            <Users className="size-3.5" />
                            <span>
                              {sub.assigned_users.length} / {sub.max_slots} slot terpakai
                            </span>
                          </div>

                          {sub.assigned_users.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sub.assigned_users.map((u) => {
                                const matchedProfile =
                                  profilesById.get(u.user_id) ??
                                  (u.email
                                    ? profilesByEmail.get(u.email.toLowerCase())
                                    : undefined);
                                const isFlagged =
                                  matchedProfile && offboardedIdSet.has(matchedProfile.id);
                                const label =
                                  matchedProfile?.full_name ||
                                  u.full_name ||
                                  u.email ||
                                  u.user_id;

                                return (
                                  <Badge
                                    key={u.user_id}
                                    variant={isFlagged ? "destructive" : "secondary"}
                                    className="text-[11px] font-normal"
                                  >
                                    {label}
                                    {isFlagged ? " (Offboarded)" : ""}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}

                          <div className="text-muted-foreground text-[11px]">
                            Rotasi sandi: {formatDateWIB(sub.password_rotated_at)}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top whitespace-normal">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {sub.renewal_date
                              ? formatDateWIB(sub.renewal_date)
                              : "Tidak ada jatuh tempo"}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[11px]">
                              {BILLING_CYCLE_LABELS[sub.billing_cycle]}
                            </Badge>
                            {sub.auto_renew && (
                              <Badge variant="secondary" className="text-[11px]">
                                Auto-Renew
                              </Badge>
                            )}
                          </div>
                          {renewal.tier === "overdue" || renewal.tier === "h1" ? (
                            <Badge variant="destructive">{renewal.label}</Badge>
                          ) : renewal.tier === "h3" ? (
                            <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                              {renewal.label}
                            </Badge>
                          ) : renewal.tier === "h7" ? (
                            <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                              {renewal.label}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>

                      {canViewBilling && (
                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1">
                            <div className="font-semibold">
                              {formatRupiah(sub.cost)}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {sub.payment_method
                                ? PAYMENT_METHOD_LABELS[sub.payment_method]
                                : "-"}
                            </div>
                            {sub.payment_account_label && (
                              <div className="text-muted-foreground text-xs">
                                {sub.payment_account_label}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      )}

                      {canReveal && (
                        <TableCell className="align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleRevealOpen(sub)}
                            >
                              <Eye className="size-3.5" />
                              Lihat Sandi
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={copyingSubId === sub.id}
                              onClick={() => handleOneClickCopyPassword(sub)}
                            >
                              {copiedId === sub.id ? (
                                <>
                                  <Check className="size-3.5 text-emerald-600" />
                                  Tersalin
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3.5" />
                                  {copyingSubId === sub.id
                                    ? "Menyalin..."
                                    : "Salin 1-Klik"}
                                </>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      )}

                      {canManage && (
                        <TableCell className="text-right align-top">
                          <div className="flex justify-end gap-1">
                            {hasOffboardWarning && (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                title="Rotasi kata sandi"
                                onClick={() =>
                                  openRotateDialog(sub, offboardedFlags)
                                }
                              >
                                <RefreshCw className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title="Edit langganan"
                              onClick={() => openEditDialog(sub)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title="Hapus langganan"
                              onClick={() => setDeleteTarget(sub)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Subscription Dialog (SUPER_ADMIN only) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create"
                ? "Tambah Langganan Baru ke Vault"
                : "Edit Langganan Vault"}
            </DialogTitle>
            <DialogDescription>
              Kata sandi dan PIN pemulihan akan dienkripsi menggunakan AES-256 (pgcrypto) di
              database Supabase.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Validasi Gagal</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sub-service">Nama Layanan *</Label>
                <Input
                  id="sub-service"
                  required
                  value={form.service_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, service_name: e.target.value }))
                  }
                  placeholder="cth. Canva Pro / Google Workspace"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-plan">Paket / Plan</Label>
                <Input
                  id="sub-plan"
                  value={form.plan_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, plan_name: e.target.value }))
                  }
                  placeholder="cth. Teams 5 User"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sub-email">Email / Username Login *</Label>
                <Input
                  id="sub-email"
                  required
                  value={form.login_email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, login_email: e.target.value }))
                  }
                  placeholder="ops@starchamps.id"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sub-pass">
                    Kata Sandi {formMode === "create" ? "*" : "(Opsional saat edit)"}
                  </Label>
                  <button
                    type="button"
                    className="text-primary flex items-center gap-1 text-xs hover:underline"
                    onClick={() => {
                      setForm((p) => ({
                        ...p,
                        password_plain: generateStrongPassword(),
                      }));
                      setShowFormPassword(true);
                    }}
                  >
                    <Sparkles className="size-3" />
                    Buat Acak
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="sub-pass"
                    type={showFormPassword ? "text" : "password"}
                    required={formMode === "create"}
                    value={form.password_plain}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, password_plain: e.target.value }))
                    }
                    placeholder={
                      formMode === "edit"
                        ? "Kosongkan untuk mempertahankan sandi lama"
                        : "Masukkan kata sandi"
                    }
                    className="pr-9"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5"
                    onClick={() => setShowFormPassword((s) => !s)}
                  >
                    {showFormPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sub-pin">PIN / Kode Pemulihan / Backup 2FA (Opsional)</Label>
              <Input
                id="sub-pin"
                value={form.pin_recovery_plain}
                disabled={form.clear_pin_recovery}
                onChange={(e) =>
                  setForm((p) => ({ ...p, pin_recovery_plain: e.target.value }))
                }
                placeholder={
                  formMode === "edit"
                    ? "Kosongkan jika tetap menggunakan PIN lama"
                    : "cth. 6-digit PIN atau kode backup MFA"
                }
              />
              {formMode === "edit" && (
                <label className="text-muted-foreground flex items-center gap-2 pt-1 text-xs">
                  <Checkbox
                    checked={form.clear_pin_recovery}
                    onCheckedChange={(checked) =>
                      setForm((p) => ({
                        ...p,
                        clear_pin_recovery: checked === true,
                        pin_recovery_plain:
                          checked === true ? "" : p.pin_recovery_plain,
                      }))
                    }
                  />
                  Hapus PIN / kode pemulihan yang tersimpan
                </label>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Siklus Tagihan</Label>
                <Select
                  value={form.billing_cycle}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, billing_cycle: v as BillingCycle }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BULANAN">Bulanan</SelectItem>
                    <SelectItem value="TAHUNAN">Tahunan</SelectItem>
                    <SelectItem value="SEKALI_BAYAR">Sekali Bayar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-cost">Biaya (IDR)</Label>
                <Input
                  id="sub-cost"
                  type="number"
                  min={0}
                  step="100"
                  value={form.cost}
                  onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-renewal">Tanggal Jatuh Tempo</Label>
                <Input
                  id="sub-renewal"
                  type="date"
                  value={form.renewal_date}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, renewal_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Metode Pembayaran</Label>
                <Select
                  value={form.payment_method}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, payment_method: v as PaymentMethod }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-pay-label">Label Rekening / Kartu</Label>
                <Input
                  id="sub-pay-label"
                  value={form.payment_account_label}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      payment_account_label: e.target.value,
                    }))
                  }
                  placeholder="cth. BCA Ops ****4821 / GoPay Klinik"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-slots">Maksimal Slot</Label>
                <Input
                  id="sub-slots"
                  type="number"
                  min={1}
                  value={form.max_slots}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, max_slots: e.target.value }))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="sub-autorenew" className="cursor-pointer">
                  Auto-Renew
                </Label>
                <Switch
                  id="sub-autorenew"
                  checked={form.auto_renew}
                  onCheckedChange={(v) =>
                    setForm((p) => ({ ...p, auto_renew: v }))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="sub-active" className="cursor-pointer">
                  Status Aktif
                </Label>
                <Switch
                  id="sub-active"
                  checked={form.is_active}
                  onCheckedChange={(v) =>
                    setForm((p) => ({ ...p, is_active: v }))
                  }
                />
              </div>
            </div>

            {/* Assigned Users Picker */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>
                  Pengguna Terassign ({form.assigned_user_ids.length} /{" "}
                  {form.max_slots || 1} slot)
                </Label>
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter staf..."
                  className="h-8 w-48"
                />
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {filteredProfiles.map((p) => {
                  const checked = form.assigned_user_ids.includes(p.id);
                  const isOffboarded = !p.is_active || p.offboarded_at !== null;
                  return (
                    <label
                      key={p.id}
                      className="hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) =>
                            handleToggleAssignedUser(p.id, val === true)
                          }
                        />
                        <span>
                          {p.full_name || p.email || p.id}{" "}
                          <span className="text-muted-foreground text-xs">
                            ({p.role})
                          </span>
                        </span>
                      </span>
                      {isOffboarded && (
                        <Badge variant="destructive" className="text-[10px]">
                          Nonaktif / Offboard
                        </Badge>
                      )}
                    </label>
                  );
                })}
                {filteredProfiles.length === 0 && (
                  <p className="text-muted-foreground py-2 text-center text-xs">
                    Tidak ada profil yang cocok.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sub-notes">Catatan Internal (Opsional)</Label>
              <Textarea
                id="sub-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Catatan penggunaan akun, pembagian seat, atau instruksi login"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Menyimpan..."
                  : formMode === "create"
                    ? "Simpan ke Vault"
                    : "Simpan Perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reveal Secret Dialog (OWNER & SUPER_ADMIN) */}
      <Dialog
        open={Boolean(revealTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRevealTarget(null);
            setRevealedSecret(null);
            setRevealError(null);
            setShowPlainPassword(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="text-primary size-5" />
              Kredensial {revealTarget?.service_name}
            </DialogTitle>
            <DialogDescription>
              Kode {revealTarget?.sub_code} · Aktivitas pembukaan sandi ini otomatis dicatat ke
              Audit Log (<code>VAULT_REVEAL</code>).
            </DialogDescription>
          </DialogHeader>

          {revealLoading && (
            <div className="text-muted-foreground py-6 text-center text-sm">
              Mendekripsi kredensial dari brankas AES-256...
            </div>
          )}

          {revealError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Gagal Membuka Kredensial</AlertTitle>
              <AlertDescription>{revealError}</AlertDescription>
            </Alert>
          )}

          {revealedSecret && revealTarget && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Email / Username</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={revealTarget.login_email} className="font-mono text-xs" />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(revealTarget.login_email, "modal-email")
                    }
                  >
                    {copiedField === "modal-email" ? (
                      <Check className="size-4 text-emerald-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Kata Sandi</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      readOnly
                      type={showPlainPassword ? "text" : "password"}
                      value={revealedSecret.passwordPlain}
                      className="pr-9 font-mono text-sm"
                    />
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5"
                      onClick={() => setShowPlainPassword((s) => !s)}
                    >
                      {showPlainPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(revealedSecret.passwordPlain, "modal-pass")
                    }
                  >
                    {copiedField === "modal-pass" ? (
                      <>
                        <Check className="size-4" />
                        Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" />
                        Salin
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {revealedSecret.pinRecoveryPlain && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">
                    PIN / Kode Pemulihan
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={revealedSecret.pinRecoveryPlain}
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyToClipboard(
                          revealedSecret.pinRecoveryPlain ?? "",
                          "modal-pin",
                        )
                      }
                    >
                      {copiedField === "modal-pin" ? (
                        <Check className="size-4 text-emerald-600" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-muted-foreground text-xs">
                Rotasi sandi terakhir:{" "}
                {formatDateWIB(revealTarget.password_rotated_at, true)}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevealTarget(null)}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate Password Dialog (SUPER_ADMIN only) */}
      <Dialog
        open={Boolean(rotateTarget)}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="text-primary size-5" />
              Rotasi Kata Sandi — {rotateTarget?.sub.service_name}
            </DialogTitle>
            <DialogDescription>
              Perbarui kata sandi terenkripsi dan cabut akses staf yang sudah offboarded agar akun
              tetap aman.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRotateSubmit} className="space-y-4">
            {rotateError && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{rotateError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="rot-pass">Kata Sandi Baru *</Label>
                <button
                  type="button"
                  className="text-primary flex items-center gap-1 text-xs hover:underline"
                  onClick={() => {
                    setRotatePassword(generateStrongPassword());
                    setShowRotatePassword(true);
                  }}
                >
                  <Sparkles className="size-3" />
                  Buat Acak
                </button>
              </div>
              <div className="relative">
                <Input
                  id="rot-pass"
                  required
                  type={showRotatePassword ? "text" : "password"}
                  value={rotatePassword}
                  onChange={(e) => setRotatePassword(e.target.value)}
                  placeholder="Masukkan kata sandi baru"
                  className="pr-9"
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground absolute top-2.5 right-2.5"
                  onClick={() => setShowRotatePassword((s) => !s)}
                >
                  {showRotatePassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rot-pin">PIN / Kode Pemulihan Baru (Opsional)</Label>
              <Input
                id="rot-pin"
                value={rotatePin}
                onChange={(e) => setRotatePin(e.target.value)}
                placeholder="Kosongkan jika PIN tidak berubah"
              />
            </div>

            {rotateTarget && rotateTarget.flagged.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs font-semibold">
                  Cabut akses staf nonaktif / offboarded dari daftar pengguna:
                </Label>
                <div className="space-y-1.5">
                  {rotateTarget.flagged.map((f) => {
                    const checked = removeUserIds.includes(f.userId);
                    return (
                      <label
                        key={f.userId}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) => {
                            setRemoveUserIds((prev) =>
                              val === true
                                ? Array.from(new Set([...prev, f.userId]))
                                : prev.filter((id) => id !== f.userId),
                            );
                          }}
                        />
                        <span>
                          {f.displayName}{" "}
                          <span className="text-muted-foreground text-xs">
                            ({f.email ?? "tanpa email"})
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRotateTarget(null)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Memproses..." : "Simpan & Rotasi Sandi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Soft Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Akun Langganan?</DialogTitle>
            <DialogDescription>
              Akun <strong>{deleteTarget?.service_name}</strong> ({deleteTarget?.sub_code})
              akan dipindahkan ke Recycle Bin dan masih dapat dipulihkan selama 30 hari.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleSoftDelete}
            >
              {isPending ? "Menghapus..." : "Hapus ke Recycle Bin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
