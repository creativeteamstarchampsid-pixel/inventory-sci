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
  LayoutGrid,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  UserX,
  Users,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
  KawaiiStatCard,
} from "@/components/cartoon/kawaii-decor";
import { Can } from "@/components/rbac/can";
import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ROLE_LABELS } from "@/lib/rbac";
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

const VAULT_CARD_RIBBONS = [
  "bg-[#E0F2FE] dark:bg-sky-950/45",
  "bg-[#D1FAE5] dark:bg-emerald-950/45",
  "bg-[#FEF3C7] dark:bg-amber-950/45",
  "bg-[#EDE9FE] dark:bg-violet-950/45",
  "bg-[#FFE8D6] dark:bg-orange-950/45",
] as const;

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
  const { showWorking, showSuccess, showError } = useCartoonFeedback();

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<
    "all" | "expiring" | "rotate" | "active" | "inactive"
  >("all");
  const [cycleFilter, setCycleFilter] = useState<"ALL" | BillingCycle>("ALL");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

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
  const [revealTarget, setRevealTarget] =
    useState<VaultSubscriptionItem | null>(null);
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
    () =>
      enriched.filter((e) => e.sub.is_active && e.offboardedFlags.length > 0),
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
        if (
          !sub.is_active ||
          renewal.daysLeft === null ||
          renewal.daysLeft > 7
        ) {
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
        ...sub.assigned_users.map(
          (u) => `${u.full_name ?? ""} ${u.email ?? ""}`,
        ),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [enriched, filterTab, cycleFilter, search]);

  const hasActiveFilters =
    filterTab !== "all" || cycleFilter !== "ALL" || search.trim().length > 0;

  function resetFilters() {
    setFilterTab("all");
    setCycleFilter("ALL");
    setSearch("");
  }

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
    showWorking({
      title: "Membuka Kunci Brankas AES-256...",
      message: `Dino Joguman lagi mendekripsi kata sandi ${sub.service_name} (${sub.sub_code}) dan mencatat akses aman ke Audit Log~`,
    });

    try {
      const res = await revealSecretAction(sub.id);
      setRevealLoading(false);
      if (!res.ok) {
        setRevealError(res.error);
        showError({
          title: "Yah, Gagal Membuka Sandi...",
          message: res.error,
        });
        return;
      }
      setRevealedSecret(res.data);
      showSuccess({
        title: "Kredensial Terbuka! ♪",
        message: `Kata sandi ${sub.service_name} siap dilihat. Jaga kerahasiaannya ya~`,
        durationMs: 1350,
      });
    } catch (err) {
      setRevealLoading(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal mendekripsi kredensial dari brankas.";
      setRevealError(msg);
      showError({
        title: "Yah, Gagal Membuka Sandi...",
        message: msg,
      });
    }
  }

  async function handleOneClickCopyPassword(sub: VaultSubscriptionItem) {
    setCopyingSubId(sub.id);
    setFeedback(null);
    showWorking({
      title: "Mengambil & Menyalin Sandi...",
      message: `Dino Joguman lagi membuka kunci AES-256 ${sub.service_name} untuk disalin cepat ke clipboard~`,
    });

    try {
      const res = await revealSecretAction(sub.id);
      setCopyingSubId(null);

      if (!res.ok) {
        setFeedback({ type: "error", message: res.error });
        showError({
          title: "Yah, Gagal Menyalin Sandi...",
          message: res.error,
        });
        return;
      }

      const copied = await copyToClipboard(
        res.data.passwordPlain,
        `row-${sub.id}`,
      );
      if (copied) {
        setCopiedId(sub.id);
        setTimeout(() => {
          setCopiedId((prev) => (prev === sub.id ? null : prev));
        }, 3000);
        setFeedback({
          type: "success",
          message: `Kata sandi ${sub.service_name} (${sub.sub_code}) berhasil disalin ke clipboard (tercatat di Audit Log).`,
        });
        showSuccess({
          title: "Sandi Tersalin! ♪",
          message: `Kata sandi ${sub.service_name} (${sub.sub_code}) sudah siap ditempel & tercatat di Audit Log.`,
          durationMs: 1700,
        });
      } else {
        // Fallback: show modal so admin can copy manually
        setRevealTarget(sub);
        setRevealedSecret(res.data);
        setRevealError(null);
        setShowPlainPassword(false);
        showSuccess({
          title: "Sandi Siap Disalin Manual ♪",
          message: `Browser membatasi salin otomatis — silakan salin dari jendela kredensial ${sub.service_name}.`,
          durationMs: 1600,
        });
      }
    } catch (err) {
      setCopyingSubId(null);
      const msg =
        err instanceof Error ? err.message : "Gagal menyalin kata sandi.";
      setFeedback({ type: "error", message: msg });
      showError({
        title: "Yah, Gagal Menyalin Sandi...",
        message: msg,
      });
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
        assigned_user_ids: prev.assigned_user_ids.filter(
          (id) => id !== profileId,
        ),
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

    const serviceName = form.service_name;
    const isCreate = formMode === "create";

    showWorking({
      title: isCreate
        ? "Mengenkripsi & Menyimpan Akun..."
        : "Memperbarui Brankas Akun...",
      message: isCreate
        ? `Dino Joguman lagi mengunci kata sandi ${serviceName} dengan AES-256 dan menyimpannya ke brankas aman~`
        : `Dino Joguman lagi merapikan perubahan akun ${serviceName} di brankas terenkripsi~`,
    });

    startTransition(async () => {
      try {
        if (isCreate) {
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
            showError({
              title: "Yah, Gagal Menyimpan ke Brankas...",
              message: res.error,
            });
            return;
          }

          setFormOpen(false);
          const successMsg = `Langganan ${serviceName} (${res.data.sub_code}) berhasil ditambahkan ke Vault terenkripsi.`;
          setFeedback({ type: "success", message: successMsg });
          showSuccess({
            title: "Akun Aman di Brankas! ♪",
            message: successMsg,
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
            showError({
              title: "Yah, Gagal Memperbarui Akun...",
              message: res.error,
            });
            return;
          }

          setFormOpen(false);
          const successMsg = `Perubahan langganan ${serviceName} (${res.data.sub_code}) berhasil disimpan.`;
          setFeedback({ type: "success", message: successMsg });
          showSuccess({
            title: "Brankas Diperbarui! ♪",
            message: successMsg,
          });
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Gagal menyimpan data brankas akun.";
        setFormError(msg);
        showError({
          title: "Yah, Gagal Menyimpan ke Brankas...",
          message: msg,
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

    const targetSub = rotateTarget.sub;
    showWorking({
      title: "Merotasi Kata Sandi...",
      message: `Dino Joguman lagi mengenkripsi sandi baru untuk ${targetSub.service_name} dan memperbarui keamanan akses~`,
    });

    startTransition(async () => {
      try {
        const res = await rotateSubscriptionPasswordAction({
          id: targetSub.id,
          new_password: rotatePassword,
          new_pin_recovery: rotatePin || null,
          remove_user_ids: removeUserIds,
        });

        if (!res.ok) {
          setRotateError(res.error);
          showError({
            title: "Yah, Gagal Rotasi Sandi...",
            message: res.error,
          });
          return;
        }

        setRotateTarget(null);
        const successMsg = `Kata sandi ${targetSub.service_name} berhasil dirotasi dan diperbarui.`;
        setFeedback({ type: "success", message: successMsg });
        showSuccess({
          title: "Sandi Berhasil Dirotasi! ♪",
          message: successMsg,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Gagal merotasi kata sandi.";
        setRotateError(msg);
        showError({
          title: "Yah, Gagal Rotasi Sandi...",
          message: msg,
        });
      }
    });
  }

  function handleSoftDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    showWorking({
      title: "Memindahkan ke Recycle Bin...",
      message: `Dino Joguman lagi memindahkan akun ${target.service_name} (${target.sub_code}) ke Recycle Bin dengan aman~`,
    });

    startTransition(async () => {
      try {
        const res = await softDeleteSubscriptionAction(target.id);
        if (!res.ok) {
          setFeedback({ type: "error", message: res.error });
          setDeleteTarget(null);
          showError({
            title: "Yah, Gagal Menghapus Akun...",
            message: res.error,
          });
          return;
        }
        setDeleteTarget(null);
        const successMsg = `${target.service_name} dipindahkan ke Recycle Bin (dapat dipulihkan dalam 30 hari).`;
        setFeedback({ type: "success", message: successMsg });
        showSuccess({
          title: "Akun Dipindahkan! ♪",
          message: successMsg,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Gagal menghapus akun brankas.";
        setFeedback({ type: "error", message: msg });
        setDeleteTarget(null);
        showError({
          title: "Yah, Gagal Menghapus Akun...",
          message: msg,
        });
      }
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
      {/* 2D Japanese Cartoon Page Header */}
      <KawaiiPageHeader
        badge="Enkripsi AES-256"
        title="Brankas Akun Digital"
        description="Brankas akun digital operasional Star Champs (enkripsi AES-256), jadwal tagihan & keamanan offboarding."
        accent="sky"
        mascot="vault"
        actions={
          <Can action="vault.manage">
            <Button
              onClick={openCreateDialog}
              className="rounded-2xl border-2 border-[#2C2623] bg-[#7CC4FA] font-extrabold text-[#0C4A6E] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#5EB6F9] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-[#F5E9D6]/70"
            >
              <Plus className="size-4 stroke-[2.5]" />
              Tambah Langganan
            </Button>
          </Can>
        }
      />

      {schemaError && (
        <Alert
          variant="warning"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-400/50 dark:bg-amber-950/40"
        >
          <AlertTriangle className="size-4" />
          <AlertTitle className="font-extrabold">
            Gagal Memuat Data Brankas Akun Digital
          </AlertTitle>
          <AlertDescription>{schemaError}</AlertDescription>
        </Alert>
      )}

      {!vaultKeyConfigured && (canManage || canReveal) && (
        <Alert
          variant="warning"
          className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-400/50 dark:bg-amber-950/40"
        >
          <Lock className="size-4" />
          <AlertTitle className="font-extrabold">
            Kunci Enkripsi Server Belum Dikonfigurasi
          </AlertTitle>
          <AlertDescription>
            Variabel environment <code>VAULT_ENCRYPTION_KEY</code> belum diatur
            atau kurang dari 16 karakter. Tambah/ubah/buka kata sandi akan
            tertolak sampai kunci AES-256 dikonfigurasi di server.
          </AlertDescription>
        </Alert>
      )}

      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className={
            feedback.type === "error"
              ? "rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] shadow-[3px_3px_0px_0px_#2C2623] dark:border-rose-400/50 dark:bg-rose-950/40"
              : "rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#14532D] shadow-[3px_3px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/45 dark:text-emerald-100"
          }
        >
          {feedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Check className="size-4 text-emerald-700 dark:text-emerald-300" />
          )}
          <AlertTitle className="font-extrabold">
            {feedback.type === "error" ? "Terjadi Kendala" : "Berhasil"}
          </AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Staff Offboarding Warning Banner */}
      {offboardingAlerts.length > 0 && (
        <Alert
          variant="destructive"
          className="rounded-3xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#881337] shadow-[4px_4px_0px_0px_#2C2623] dark:border-rose-400/60 dark:bg-rose-950/40 dark:text-rose-100"
        >
          <ShieldAlert className="size-4" />
          <AlertTitle className="font-extrabold">
            Peringatan Keamanan Offboarding: {offboardingAlerts.length} Akun
            Wajib Rotasi Kata Sandi!
          </AlertTitle>
          <AlertDescription className="w-full space-y-2 pt-1">
            <p className="font-medium">
              Staf berikut berstatus nonaktif / offboarded setelah rotasi kata
              sandi terakhir, namun masih tercatat sebagai pengguna pada akun
              langganan di bawah ini:
            </p>
            <div className="w-full space-y-2">
              {offboardingAlerts.map(({ sub, offboardedFlags }) => (
                <div
                  key={sub.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/60 bg-[#FFFDF7] px-3.5 py-2.5 text-xs text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-rose-400/40 dark:bg-background/90 dark:text-foreground"
                >
                  <div className="space-y-0.5">
                    <div className="font-extrabold">
                      {sub.service_name}{" "}
                      <span className="text-muted-foreground font-mono font-bold">
                        ({sub.sub_code})
                      </span>
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
                      · Rotasi terakhir:{" "}
                      {formatDateWIB(sub.password_rotated_at, true)}
                    </div>
                  </div>
                  <Can action="vault.manage">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => openRotateDialog(sub, offboardedFlags)}
                      className="rounded-full border-2 border-[#2C2623] font-extrabold shadow-[2px_2px_0px_0px_#2C2623]"
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
        <Alert
          variant="warning"
          className="rounded-3xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#5C3D00] shadow-[4px_4px_0px_0px_#2C2623] dark:border-amber-400/50 dark:bg-amber-950/35 dark:text-amber-100"
        >
          <CalendarClock className="size-4" />
          <AlertTitle className="font-extrabold">
            Pengingat Perpanjangan: {expiringAlerts.length} Langganan Jatuh
            Tempo ≤ 7 Hari
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 pt-1.5">
              {expiringAlerts.map(({ sub, renewal }) => (
                <Badge
                  key={sub.id}
                  variant={
                    renewal.tier === "overdue" || renewal.tier === "h1"
                      ? "destructive"
                      : "secondary"
                  }
                  className={
                    renewal.tier === "overdue" || renewal.tier === "h1"
                      ? "rounded-full border-[1.5px] border-[#2C2623] bg-[#FECDD3] font-bold text-[#881337]"
                      : "rounded-full border-[1.5px] border-[#2C2623] bg-[#FFFDF7] font-bold text-[#5C3D00] dark:bg-amber-900/60 dark:text-amber-100"
                  }
                >
                  {sub.service_name}: {renewal.label} (
                  {formatDateWIB(sub.renewal_date)})
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KawaiiStatCard
          label="Langganan Aktif"
          value={summary.activeCount}
          hint={`Dari total ${subscriptions.length} akun terdaftar di Vault`}
          accent="sky"
          icon={<KeyRound className="size-4 text-sky-700 dark:text-sky-300" />}
        />

        <KawaiiStatCard
          label="Perpanjangan ≤ 7 Hari"
          value={summary.expiringCount}
          hint="Termasuk peringatan H-7, H-3, dan H-1"
          accent="butter"
          icon={
            <CalendarClock className="size-4 text-amber-700 dark:text-amber-300" />
          }
        />

        <KawaiiStatCard
          label="Wajib Rotasi Sandi"
          value={summary.mustRotateCount}
          hint="Terdampak staf offboarded / nonaktif"
          accent="pink"
          icon={<UserX className="size-4 text-rose-700 dark:text-rose-300" />}
        />

        <Can action="vault.view_billing">
          <KawaiiStatCard
            label="Estimasi Biaya / Bulan"
            value={formatRupiah(summary.monthlyBurn)}
            hint="Akumulasi langganan bulanan & prorata tahunan aktif"
            accent="mint"
            icon={
              <CreditCard className="size-4 text-emerald-700 dark:text-emerald-300" />
            }
          />
        </Can>
      </div>

      {/* Filters, View Toggle & Vault Listing */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-card dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)]">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-[#2C2623]/20 bg-[#F0F9FF]/85 p-3.5 lg:flex-row lg:items-center lg:justify-between dark:border-stone-700 dark:bg-sky-950/20">
            <Tabs
              value={filterTab}
              onValueChange={(v) => setFilterTab(v as typeof filterTab)}
            >
              <TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] p-1 shadow-[2px_2px_0px_0px_#2C2623] sm:w-auto dark:border-stone-600 dark:bg-background">
                <TabsTrigger
                  value="all"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#E0F2FE] data-[state=active]:text-[#0C4A6E]"
                >
                  Semua ({subscriptions.length})
                </TabsTrigger>
                <TabsTrigger
                  value="expiring"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FEF3C7] data-[state=active]:text-[#5C3D00]"
                >
                  H-7 Jatuh Tempo ({summary.expiringCount})
                </TabsTrigger>
                <TabsTrigger
                  value="rotate"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#FFE4E6] data-[state=active]:text-[#881337]"
                >
                  Wajib Rotasi ({summary.mustRotateCount})
                </TabsTrigger>
                <TabsTrigger
                  value="active"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#D1FAE5] data-[state=active]:text-[#14532D]"
                >
                  Aktif ({summary.activeCount})
                </TabsTrigger>
                <TabsTrigger
                  value="inactive"
                  className="rounded-xl font-bold data-[state=active]:border-[1.5px] data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#E2E8F0] data-[state=active]:text-[#334155]"
                >
                  Nonaktif
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-60">
                <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari layanan, kode, email, staf..."
                  className="rounded-xl border-2 border-[#2C2623] bg-white pl-9 dark:border-stone-600 dark:bg-background"
                />
              </div>
              <Select
                value={cycleFilter}
                onValueChange={(v) => setCycleFilter(v as "ALL" | BillingCycle)}
              >
                <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold sm:w-40 dark:border-stone-600 dark:bg-background">
                  <SelectValue placeholder="Semua Siklus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Siklus</SelectItem>
                  <SelectItem value="BULANAN">Bulanan</SelectItem>
                  <SelectItem value="TAHUNAN">Tahunan</SelectItem>
                  <SelectItem value="SEKALI_BAYAR">Sekali Bayar</SelectItem>
                </SelectContent>
              </Select>

              {/* Cute Card / Table View Toggle */}
              <div className="inline-flex items-center rounded-xl border-2 border-[#2C2623] bg-white p-0.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-background">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    viewMode === "cards"
                      ? "bg-[#7CC4FA] text-[#0C4A6E]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Tampilan Kartu Vault"
                >
                  <LayoutGrid className="size-3.5" />
                  Kartu
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    viewMode === "table"
                      ? "bg-[#7CC4FA] text-[#0C4A6E]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Tampilan Tabel Ringkas"
                >
                  <Table2 className="size-3.5" />
                  Tabel
                </button>
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <KawaiiEmptyState
              mascot="vault"
              title="Belum ada akun brankas yang cocok nih~"
              description={
                hasActiveFilters
                  ? "Coba ubah kata kunci pencarian atau reset filter untuk melihat semua akun langganan."
                  : canManage
                    ? "Klik tombol Tambah Langganan untuk menyimpan kredensial akun digital secara terenkripsi AES-256."
                    : "Belum ada akun langganan yang tercatat di brankas."
              }
              action={
                hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFilters}
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF9C3] font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF08A]"
                  >
                    <RotateCcw className="size-4" />
                    Reset Filter
                  </Button>
                ) : canManage ? (
                  <Button
                    type="button"
                    onClick={openCreateDialog}
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#7CC4FA] font-extrabold text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#5EB6F9]"
                  >
                    <Plus className="size-4" />
                    Tambah Langganan
                  </Button>
                ) : undefined
              }
            />
          ) : viewMode === "cards" ? (
            /* Kawaii Subscription Vault Cards Grid */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map(({ sub, renewal, offboardedFlags }, idx) => {
                const hasOffboardWarning =
                  sub.is_active && offboardedFlags.length > 0;
                const offboardedIdSet = new Set(
                  offboardedFlags.map((f) => f.userId),
                );
                const ribbonClass = hasOffboardWarning
                  ? "bg-[#FFE4E6] dark:bg-rose-950/50"
                  : !sub.is_active
                    ? "bg-[#E2E8F0] dark:bg-slate-800/70"
                    : VAULT_CARD_RIBBONS[idx % VAULT_CARD_RIBBONS.length];

                return (
                  <div
                    key={sub.id}
                    className={`flex min-w-0 flex-col overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] transition-transform hover:-translate-y-0.5 dark:border-stone-600 dark:bg-card dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.45)] ${
                      hasOffboardWarning ? "ring-2 ring-rose-400/50" : ""
                    }`}
                  >
                    {/* Pastel Header Ribbon */}
                    <div
                      className={`border-b-2 border-[#2C2623]/20 px-4 py-3 dark:border-stone-700 ${ribbonClass}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-base font-black text-[#2C2623] dark:text-foreground">
                              {sub.service_name}
                            </span>
                            {sub.plan_name && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-[1.5px] border-[#2C2623] bg-white/90 px-2 py-0 text-[11px] font-bold text-[#2C2623] dark:bg-background dark:text-foreground"
                              >
                                {sub.plan_name}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#2C2623]/50 bg-white/85 px-2 py-0.5 font-mono text-[11px] font-bold text-[#2C2623] dark:bg-background/80 dark:text-foreground">
                              <Lock className="size-2.5" />
                              {sub.sub_code}
                            </span>
                            {sub.is_active ? (
                              <Badge className="rounded-full border-[1.5px] border-[#2C2623] bg-[#A7F3D0] px-2 py-0 text-[10px] font-extrabold text-[#064E3B] hover:bg-[#A7F3D0]">
                                <ShieldCheck className="size-2.5" />
                                Aktif
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="rounded-full border-[1.5px] border-[#2C2623] bg-[#E2E8F0] px-2 py-0 text-[10px] font-bold text-[#334155]"
                              >
                                Nonaktif
                              </Badge>
                            )}
                          </div>
                        </div>

                        {canManage && (
                          <div className="flex shrink-0 items-center gap-1">
                            {hasOffboardWarning && (
                              <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="size-8 rounded-full border-2 border-[#2C2623] shadow-[1.5px_1.5px_0px_0px_#2C2623]"
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
                              size="icon"
                              variant="ghost"
                              className="size-8 rounded-full border border-[#2C2623]/25 bg-white/80 hover:bg-[#FEF3C7] dark:bg-background/60"
                              title="Edit langganan"
                              onClick={() => openEditDialog(sub)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive size-8 rounded-full border border-[#2C2623]/25 bg-white/80 hover:bg-[#FFE4E6] dark:bg-background/60"
                              title="Hapus langganan"
                              onClick={() => setDeleteTarget(sub)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {hasOffboardWarning && (
                        <div className="mt-2">
                          <Badge
                            variant="destructive"
                            className="rounded-full border-[1.5px] border-[#2C2623] bg-[#FDA4AF] text-[11px] font-extrabold text-[#881337]"
                          >
                            <ShieldAlert className="size-3" />
                            Wajib Rotasi Sandi ({offboardedFlags.length} staf
                            nonaktif)
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                      <div className="space-y-3">
                        {/* Login Email Box */}
                        <div className="flex items-center justify-between gap-2 rounded-2xl border-[1.5px] border-[#2C2623]/30 bg-[#F8FAFC] px-3 py-2 dark:border-stone-700 dark:bg-muted/35">
                          <div className="min-w-0">
                            <p className="text-muted-foreground text-[10px] font-extrabold tracking-wide uppercase">
                              Email / Username Login
                            </p>
                            <p className="truncate font-mono text-xs font-bold text-[#2C2623] dark:text-foreground">
                              {sub.login_email}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 rounded-full border border-[#2C2623]/25 bg-white hover:bg-[#E0F2FE] dark:bg-background"
                            title="Salin email login"
                            onClick={() =>
                              copyToClipboard(
                                sub.login_email,
                                `email-${sub.id}`,
                              )
                            }
                          >
                            {copiedField === `email-${sub.id}` ? (
                              <Check className="size-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                        </div>

                        {/* Renewal & Billing Grid */}
                        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 [&>*]:min-w-0">
                          <div className="rounded-2xl border-[1.5px] border-[#2C2623]/25 bg-[#FEFCE8]/80 p-2.5 dark:border-stone-700 dark:bg-amber-950/20">
                            <p className="text-muted-foreground text-[10px] font-extrabold uppercase">
                              Jatuh Tempo
                            </p>
                            <p className="mt-0.5 text-xs font-extrabold">
                              {sub.renewal_date
                                ? formatDateWIB(sub.renewal_date)
                                : "Tanpa batas"}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge
                                variant="outline"
                                className="rounded-full border border-[#2C2623]/40 bg-white px-1.5 py-0 text-[10px] font-bold text-[#2C2623] dark:bg-background dark:text-foreground"
                              >
                                {BILLING_CYCLE_LABELS[sub.billing_cycle]}
                              </Badge>
                              {sub.auto_renew && (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full border border-[#2C2623]/30 bg-[#E0F2FE] px-1.5 py-0 text-[10px] font-bold text-[#0C4A6E]"
                                >
                                  Auto
                                </Badge>
                              )}
                            </div>
                            {renewal.tier === "overdue" ||
                            renewal.tier === "h1" ? (
                              <Badge
                                variant="destructive"
                                className="mt-1.5 rounded-full border border-[#2C2623] text-[10px] font-extrabold"
                              >
                                {renewal.label}
                              </Badge>
                            ) : renewal.tier === "h3" ? (
                              <Badge className="mt-1.5 rounded-full border border-[#2C2623] bg-amber-500 text-[10px] font-extrabold text-white hover:bg-amber-500">
                                {renewal.label}
                              </Badge>
                            ) : renewal.tier === "h7" ? (
                              <Badge className="mt-1.5 rounded-full border border-[#2C2623] bg-[#FDE68A] text-[10px] font-extrabold text-[#5C3D00] hover:bg-[#FDE68A]">
                                {renewal.label}
                              </Badge>
                            ) : null}
                          </div>

                          {canViewBilling ? (
                            <div className="rounded-2xl border-[1.5px] border-[#2C2623]/25 bg-[#ECFDF5]/80 p-2.5 dark:border-stone-700 dark:bg-emerald-950/20">
                              <p className="text-muted-foreground text-[10px] font-extrabold uppercase">
                                Tagihan
                              </p>
                              <p className="mt-0.5 text-sm font-black text-[#065F46] dark:text-emerald-300">
                                {formatRupiah(sub.cost)}
                              </p>
                              <p className="text-muted-foreground mt-0.5 text-[11px] font-medium">
                                {sub.payment_method
                                  ? PAYMENT_METHOD_LABELS[sub.payment_method]
                                  : "-"}
                              </p>
                              {sub.payment_account_label && (
                                <p className="text-muted-foreground truncate text-[10px]">
                                  {sub.payment_account_label}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-2xl border-[1.5px] border-[#2C2623]/25 bg-[#F0F9FF]/80 p-2.5 dark:border-stone-700 dark:bg-sky-950/20">
                              <p className="text-muted-foreground text-[10px] font-extrabold uppercase">
                                Kapasitas Slot
                              </p>
                              <p className="mt-0.5 text-sm font-black text-[#0C4A6E] dark:text-sky-300">
                                {sub.assigned_users.length} / {sub.max_slots}
                              </p>
                              <p className="text-muted-foreground mt-0.5 text-[11px]">
                                Pengguna aktif
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Assigned Users & Password Rotation */}
                        <div className="space-y-1.5">
                          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-1 text-[11px] font-semibold">
                            <span className="flex items-center gap-1">
                              <Users className="size-3.5" />
                              {sub.assigned_users.length} / {sub.max_slots} slot
                              terpakai
                            </span>
                            <span>
                              Rotasi: {formatDateWIB(sub.password_rotated_at)}
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
                                  matchedProfile &&
                                  offboardedIdSet.has(matchedProfile.id);
                                const label =
                                  matchedProfile?.full_name ||
                                  u.full_name ||
                                  u.email ||
                                  u.user_id;

                                return (
                                  <Badge
                                    key={u.user_id}
                                    variant={
                                      isFlagged ? "destructive" : "secondary"
                                    }
                                    className={
                                      isFlagged
                                        ? "rounded-full border border-[#2C2623] text-[10px] font-bold"
                                        : "rounded-full border border-[#2C2623]/30 bg-[#F1F5F9] text-[10px] font-semibold text-[#334155] dark:bg-muted dark:text-foreground"
                                    }
                                  >
                                    {label}
                                    {isFlagged ? " (Offboarded)" : ""}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cute Secret-Reveal Pill Buttons */}
                      {canReveal && (
                        <div className="flex flex-wrap items-center gap-2 border-t-2 border-dashed border-[#2C2623]/15 pt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleRevealOpen(sub)}
                            className="flex-1 rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] font-extrabold text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#BAE6FD] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-sky-400/50 dark:bg-sky-950/60 dark:text-sky-100"
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
                            className="flex-1 rounded-full border-2 border-[#2C2623] bg-[#FEF08A] font-extrabold text-[#5C3D00] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE047] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-amber-400/50 dark:bg-amber-950/60 dark:text-amber-100"
                          >
                            {copiedId === sub.id ? (
                              <>
                                <Check className="size-3.5 text-emerald-700 dark:text-emerald-300" />
                                Tersalin!
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Compact Table View */
            <div className="overflow-x-auto rounded-2xl border-2 border-[#2C2623]/20 dark:border-stone-700">
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2 border-[#2C2623]/20 bg-[#E0F2FE]/70 hover:bg-[#E0F2FE]/70 dark:bg-sky-950/35">
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Layanan &amp; Status
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Login &amp; Slot Pengguna
                    </TableHead>
                    <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                      Jatuh Tempo
                    </TableHead>
                    {canViewBilling && (
                      <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                        Tagihan &amp; Pembayaran
                      </TableHead>
                    )}
                    {canReveal && (
                      <TableHead className="font-extrabold text-[#2C2623] dark:text-foreground">
                        Kredensial
                      </TableHead>
                    )}
                    {canManage && (
                      <TableHead className="text-right font-extrabold text-[#2C2623] dark:text-foreground">
                        Aksi
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map(({ sub, renewal, offboardedFlags }) => {
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
                            ? "bg-rose-50/60 hover:bg-rose-50/90 dark:bg-rose-950/20 dark:hover:bg-rose-950/30"
                            : "hover:bg-[#F0F9FF]/70 dark:hover:bg-sky-950/15"
                        }
                      >
                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-extrabold">
                                {sub.service_name}
                              </span>
                              {sub.plan_name && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full text-xs"
                                >
                                  {sub.plan_name}
                                </Badge>
                              )}
                              {!sub.is_active && (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full"
                                >
                                  Nonaktif
                                </Badge>
                              )}
                            </div>
                            <div className="text-muted-foreground font-mono text-xs">
                              {sub.sub_code}
                            </div>
                            {hasOffboardWarning && (
                              <Badge
                                variant="destructive"
                                className="mt-1 rounded-full"
                              >
                                <ShieldAlert className="size-3" />
                                Wajib Rotasi Sandi ({offboardedFlags.length}{" "}
                                staf nonaktif)
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
                                className="size-6 shrink-0 rounded-full"
                                title="Salin email login"
                                onClick={() =>
                                  copyToClipboard(
                                    sub.login_email,
                                    `email-${sub.id}`,
                                  )
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
                                {sub.assigned_users.length} / {sub.max_slots}{" "}
                                slot terpakai
                              </span>
                            </div>

                            {sub.assigned_users.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {sub.assigned_users.map((u) => {
                                  const matchedProfile =
                                    profilesById.get(u.user_id) ??
                                    (u.email
                                      ? profilesByEmail.get(
                                          u.email.toLowerCase(),
                                        )
                                      : undefined);
                                  const isFlagged =
                                    matchedProfile &&
                                    offboardedIdSet.has(matchedProfile.id);
                                  const label =
                                    matchedProfile?.full_name ||
                                    u.full_name ||
                                    u.email ||
                                    u.user_id;

                                  return (
                                    <Badge
                                      key={u.user_id}
                                      variant={
                                        isFlagged ? "destructive" : "secondary"
                                      }
                                      className="rounded-full text-[11px] font-normal"
                                    >
                                      {label}
                                      {isFlagged ? " (Offboarded)" : ""}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}

                            <div className="text-muted-foreground text-[11px]">
                              Rotasi sandi:{" "}
                              {formatDateWIB(sub.password_rotated_at)}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="align-top whitespace-normal">
                          <div className="space-y-1">
                            <div className="text-sm font-bold">
                              {sub.renewal_date
                                ? formatDateWIB(sub.renewal_date)
                                : "Tidak ada jatuh tempo"}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge
                                variant="outline"
                                className="rounded-full text-[11px]"
                              >
                                {BILLING_CYCLE_LABELS[sub.billing_cycle]}
                              </Badge>
                              {sub.auto_renew && (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full text-[11px]"
                                >
                                  Auto-Renew
                                </Badge>
                              )}
                            </div>
                            {renewal.tier === "overdue" ||
                            renewal.tier === "h1" ? (
                              <Badge
                                variant="destructive"
                                className="rounded-full"
                              >
                                {renewal.label}
                              </Badge>
                            ) : renewal.tier === "h3" ? (
                              <Badge className="rounded-full bg-amber-600 text-white hover:bg-amber-600">
                                {renewal.label}
                              </Badge>
                            ) : renewal.tier === "h7" ? (
                              <Badge className="rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                {renewal.label}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>

                        {canViewBilling && (
                          <TableCell className="align-top whitespace-normal">
                            <div className="space-y-1">
                              <div className="font-extrabold">
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
                                className="rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] font-bold text-[#0C4A6E] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#BAE6FD]"
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
                                className="rounded-full border-2 border-[#2C2623] bg-[#FEF08A] font-bold text-[#5C3D00] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE047]"
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
                                  className="rounded-xl"
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
                                className="rounded-xl"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive rounded-xl"
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
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Subscription Dialog (OWNER & Admin Operasional) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-extrabold">
              {formMode === "create"
                ? "Tambah Langganan Baru ke Vault"
                : "Edit Langganan Vault"}
            </DialogTitle>
            <DialogDescription>
              Kata sandi dan PIN pemulihan akan dienkripsi menggunakan AES-256
              (pgcrypto) di database Supabase.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <Alert
                variant="destructive"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] dark:border-rose-400/50 dark:bg-rose-950/40"
              >
                <AlertTriangle className="size-4" />
                <AlertTitle className="font-extrabold">
                  Validasi Gagal
                </AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sub-service" className="font-bold">
                  Nama Layanan *
                </Label>
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
                <Label htmlFor="sub-plan" className="font-bold">
                  Paket / Plan
                </Label>
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
                <Label htmlFor="sub-email" className="font-bold">
                  Email / Username Login *
                </Label>
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
                  <Label htmlFor="sub-pass" className="font-bold">
                    Kata Sandi{" "}
                    {formMode === "create" ? "*" : "(Opsional saat edit)"}
                  </Label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-[#2C2623]/40 bg-[#FEF08A] px-2 py-0.5 text-[11px] font-bold text-[#5C3D00] hover:bg-[#FDE047]"
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
              <Label htmlFor="sub-pin" className="font-bold">
                PIN / Kode Pemulihan / Backup 2FA (Opsional)
              </Label>
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
                <Label className="font-bold">Siklus Tagihan</Label>
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
                <Label htmlFor="sub-cost" className="font-bold">
                  Biaya (IDR)
                </Label>
                <Input
                  id="sub-cost"
                  type="number"
                  min={0}
                  step="100"
                  value={form.cost}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, cost: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-renewal" className="font-bold">
                  Tanggal Jatuh Tempo
                </Label>
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
                <Label className="font-bold">Metode Pembayaran</Label>
                <Select
                  value={form.payment_method}
                  onValueChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      payment_method: v as PaymentMethod,
                    }))
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
                <Label htmlFor="sub-pay-label" className="font-bold">
                  Label Rekening / Kartu
                </Label>
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
                <Label htmlFor="sub-slots" className="font-bold">
                  Maksimal Slot
                </Label>
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

              <div className="flex items-center justify-between rounded-2xl border-2 border-[#2C2623]/40 bg-[#F0F9FF]/70 px-3 py-2 dark:border-stone-600 dark:bg-sky-950/20">
                <Label
                  htmlFor="sub-autorenew"
                  className="cursor-pointer font-bold"
                >
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

              <div className="flex items-center justify-between rounded-2xl border-2 border-[#2C2623]/40 bg-[#ECFDF5]/70 px-3 py-2 dark:border-stone-600 dark:bg-emerald-950/20">
                <Label
                  htmlFor="sub-active"
                  className="cursor-pointer font-bold"
                >
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
            <div className="space-y-2 rounded-2xl border-2 border-[#2C2623]/40 bg-[#FEFCE8]/65 p-3.5 dark:border-stone-600 dark:bg-amber-950/15">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="font-extrabold">
                  Pengguna Terassign ({form.assigned_user_ids.length} /{" "}
                  {form.max_slots || 1} slot)
                </Label>
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter staf..."
                  className="h-8 w-full bg-white sm:w-48 dark:bg-background"
                />
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {filteredProfiles.map((p) => {
                  const checked = form.assigned_user_ids.includes(p.id);
                  const isOffboarded = !p.is_active || p.offboarded_at !== null;
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-1 text-sm hover:bg-white/80 dark:hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) =>
                            handleToggleAssignedUser(p.id, val === true)
                          }
                          className="shrink-0"
                        />
                        <span className="min-w-0 truncate">
                          {p.full_name || p.email || p.id}{" "}
                          <span className="text-muted-foreground text-xs">
                            ({ROLE_LABELS[p.role]?.title ?? p.role})
                          </span>
                        </span>
                      </span>
                      {isOffboarded && (
                        <Badge
                          variant="destructive"
                          className="shrink-0 rounded-full text-[10px]"
                        >
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
              <Label htmlFor="sub-notes" className="font-bold">
                Catatan Internal (Opsional)
              </Label>
              <Textarea
                id="sub-notes"
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="Catatan penggunaan akun, pembagian seat, atau instruksi login"
                className="rounded-xl border-2 border-[#2C2623]/50 dark:border-stone-600"
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
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl border-2 border-[#2C2623] bg-[#7CC4FA] font-extrabold text-[#0C4A6E] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#5EB6F9]"
              >
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
            <DialogTitle className="flex items-center gap-2 font-extrabold">
              <span className="inline-flex size-8 items-center justify-center rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] text-[#0C4A6E] shadow-[1.5px_1.5px_0px_0px_#2C2623]">
                <KeyRound className="size-4" />
              </span>
              Kredensial {revealTarget?.service_name}
            </DialogTitle>
            <DialogDescription>
              Kode {revealTarget?.sub_code} · Aktivitas pembukaan sandi ini
              otomatis dicatat ke Audit Log (<code>VAULT_REVEAL</code>).
            </DialogDescription>
          </DialogHeader>

          {revealLoading && (
            <div className="text-muted-foreground rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-[#F0F9FF]/70 py-6 text-center text-sm font-semibold">
              Mendekripsi kredensial dari brankas AES-256...
            </div>
          )}

          {revealError && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] dark:border-rose-400/50 dark:bg-rose-950/40"
            >
              <AlertTriangle className="size-4" />
              <AlertTitle className="font-extrabold">
                Gagal Membuka Kredensial
              </AlertTitle>
              <AlertDescription>{revealError}</AlertDescription>
            </Alert>
          )}

          {revealedSecret && revealTarget && (
            <div className="space-y-4">
              <div className="space-y-1.5 rounded-2xl border-2 border-[#2C2623]/35 bg-[#F0F9FF]/60 p-3 dark:border-stone-700 dark:bg-sky-950/20">
                <Label className="text-muted-foreground text-xs font-extrabold uppercase">
                  Email / Username
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={revealTarget.login_email}
                    className="bg-white font-mono text-xs dark:bg-background"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full border-2 border-[#2C2623] bg-white font-bold shadow-[1.5px_1.5px_0px_0px_#2C2623]"
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

              <div className="space-y-1.5 rounded-2xl border-2 border-[#2C2623]/35 bg-[#FEFCE8]/75 p-3 dark:border-stone-700 dark:bg-amber-950/20">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs font-extrabold uppercase">
                    Kata Sandi
                  </Label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#2C2623] hover:bg-[#E0F2FE] dark:bg-background dark:text-foreground"
                    onClick={() => setShowPlainPassword((s) => !s)}
                  >
                    {showPlainPassword ? (
                      <>
                        <EyeOff className="size-3" />
                        Sembunyikan
                      </>
                    ) : (
                      <>
                        <Eye className="size-3" />
                        Tampilkan
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      readOnly
                      type={showPlainPassword ? "text" : "password"}
                      value={revealedSecret.passwordPlain}
                      className="bg-white pr-9 font-mono text-sm dark:bg-background"
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
                    className="rounded-full border-2 border-[#2C2623] bg-[#FEF08A] font-extrabold text-[#5C3D00] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE047]"
                    onClick={() =>
                      copyToClipboard(
                        revealedSecret.passwordPlain,
                        "modal-pass",
                      )
                    }
                  >
                    {copiedField === "modal-pass" ? (
                      <>
                        <Check className="size-4 text-emerald-700" />
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
                <div className="space-y-1.5 rounded-2xl border-2 border-[#2C2623]/35 bg-[#EDE9FE]/65 p-3 dark:border-stone-700 dark:bg-violet-950/20">
                  <Label className="text-muted-foreground text-xs font-extrabold uppercase">
                    PIN / Kode Pemulihan
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={revealedSecret.pinRecoveryPlain}
                      className="bg-white font-mono text-sm dark:bg-background"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full border-2 border-[#2C2623] bg-white shadow-[1.5px_1.5px_0px_0px_#2C2623]"
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

      {/* Rotate Password Dialog (OWNER & Admin Operasional) */}
      <Dialog
        open={Boolean(rotateTarget)}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-extrabold">
              <RefreshCw className="text-primary size-5" />
              Rotasi Kata Sandi — {rotateTarget?.sub.service_name}
            </DialogTitle>
            <DialogDescription>
              Perbarui kata sandi terenkripsi dan cabut akses staf yang sudah
              offboarded agar akun tetap aman.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRotateSubmit} className="space-y-4">
            {rotateError && (
              <Alert
                variant="destructive"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] dark:border-rose-400/50 dark:bg-rose-950/40"
              >
                <AlertTriangle className="size-4" />
                <AlertDescription>{rotateError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="rot-pass" className="font-bold">
                  Kata Sandi Baru *
                </Label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-[#2C2623]/40 bg-[#FEF08A] px-2 py-0.5 text-[11px] font-bold text-[#5C3D00] hover:bg-[#FDE047]"
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
              <Label htmlFor="rot-pin" className="font-bold">
                PIN / Kode Pemulihan Baru (Opsional)
              </Label>
              <Input
                id="rot-pin"
                value={rotatePin}
                onChange={(e) => setRotatePin(e.target.value)}
                placeholder="Kosongkan jika PIN tidak berubah"
              />
            </div>

            {rotateTarget && rotateTarget.flagged.length > 0 && (
              <div className="space-y-2 rounded-2xl border-2 border-[#2C2623]/45 bg-[#FFE4E6]/60 p-3.5 dark:border-rose-400/40 dark:bg-rose-950/25">
                <Label className="text-xs font-extrabold">
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
              <Button
                type="submit"
                disabled={isPending}
                className="rounded-xl border-2 border-[#2C2623] bg-[#7CC4FA] font-extrabold text-[#0C4A6E] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#5EB6F9]"
              >
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
            <DialogTitle className="font-extrabold">
              Hapus Akun Langganan?
            </DialogTitle>
            <DialogDescription>
              Akun <strong>{deleteTarget?.service_name}</strong> (
              {deleteTarget?.sub_code}) akan dipindahkan ke Recycle Bin dan
              masih dapat dipulihkan selama 30 hari.
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
