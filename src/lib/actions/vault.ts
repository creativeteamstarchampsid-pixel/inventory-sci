"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BillingCycle, Json, PaymentMethod, UserRole } from "@/types/database";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AssignedVaultUser = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role?: UserRole;
};

export type RevealedSecret = {
  passwordPlain: string;
  pinRecoveryPlain: string | null;
};

export type CreateSubscriptionInput = {
  service_name: string;
  plan_name?: string | null;
  login_email: string;
  password_plain: string;
  pin_recovery_plain?: string | null;
  billing_cycle: BillingCycle;
  cost: number;
  currency?: string;
  payment_method: PaymentMethod;
  payment_account_label?: string | null;
  renewal_date?: string | null;
  auto_renew: boolean;
  max_slots: number;
  assigned_users: AssignedVaultUser[];
  notes?: string | null;
  is_active?: boolean;
};

export type UpdateSubscriptionInput = {
  id: string;
  service_name: string;
  plan_name?: string | null;
  login_email: string;
  password_plain?: string | null;
  pin_recovery_plain?: string | null;
  clear_pin_recovery?: boolean;
  billing_cycle: BillingCycle;
  cost: number;
  currency?: string;
  payment_method: PaymentMethod;
  payment_account_label?: string | null;
  renewal_date?: string | null;
  auto_renew: boolean;
  max_slots: number;
  assigned_users: AssignedVaultUser[];
  notes?: string | null;
  is_active: boolean;
};

export type RotatePasswordInput = {
  id: string;
  new_password: string;
  new_pin_recovery?: string | null;
  clear_pin_recovery?: boolean;
  remove_user_ids?: string[];
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_BILLING_CYCLES: readonly BillingCycle[] = [
  "BULANAN",
  "TAHUNAN",
  "SEKALI_BAYAR",
];

const VALID_PAYMENT_METHODS: readonly PaymentMethod[] = [
  "GOPAY",
  "KARTU_DEBIT",
  "KARTU_KREDIT",
  "TRANSFER_BANK",
  "VA",
  "LAINNYA",
];

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getVaultEncryptionKey():
  | { ok: true; key: string }
  | { ok: false; error: string } {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    return {
      ok: false,
      error:
        "Kunci enkripsi vault (VAULT_ENCRYPTION_KEY) belum dikonfigurasi di server. Hubungi administrator sistem untuk mengatur environment variable tersebut.",
    };
  }
  const key = raw.trim();
  if (key.length < 16) {
    return {
      ok: false,
      error:
        "Kunci enkripsi vault (VAULT_ENCRYPTION_KEY) minimal harus 16 karakter agar memenuhi standar AES-256.",
    };
  }
  return { ok: true, key };
}

function mapDecryptError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("wrong key") ||
    lower.includes("corrupt") ||
    lower.includes("decrypt")
  ) {
    return "Gagal mendekripsi kredensial. Kunci enkripsi server (VAULT_ENCRYPTION_KEY) tidak cocok dengan data tersimpan.";
  }
  return message;
}

function sanitizeAssignedUsers(
  users: AssignedVaultUser[] | undefined,
): AssignedVaultUser[] {
  if (!Array.isArray(users)) return [];
  const seen = new Set<string>();
  const clean: AssignedVaultUser[] = [];

  for (const item of users) {
    if (!item || typeof item.user_id !== "string" || !isValidUuid(item.user_id)) {
      continue;
    }
    if (seen.has(item.user_id)) continue;
    seen.add(item.user_id);
    clean.push({
      user_id: item.user_id,
      full_name: normalizeOptionalText(item.full_name),
      email: normalizeOptionalText(item.email),
      ...(item.role ? { role: item.role } : {}),
    });
  }

  return clean;
}

function validateSubscriptionFields(input: {
  service_name: string;
  login_email: string;
  billing_cycle: BillingCycle;
  cost: number;
  payment_method: PaymentMethod;
  renewal_date?: string | null;
  max_slots: number;
  assigned_users: AssignedVaultUser[];
}): string | null {
  if (!input.service_name || input.service_name.trim().length === 0) {
    return "Nama layanan wajib diisi.";
  }
  if (!input.login_email || input.login_email.trim().length === 0) {
    return "Email atau username login wajib diisi.";
  }
  if (!VALID_BILLING_CYCLES.includes(input.billing_cycle)) {
    return "Siklus tagihan tidak valid.";
  }
  if (typeof input.cost !== "number" || !Number.isFinite(input.cost) || input.cost < 0) {
    return "Biaya langganan harus berupa angka >= 0.";
  }
  if (!VALID_PAYMENT_METHODS.includes(input.payment_method)) {
    return "Metode pembayaran tidak valid.";
  }
  if (
    !Number.isInteger(input.max_slots) ||
    input.max_slots < 1
  ) {
    return "Jumlah slot maksimal minimal 1.";
  }
  if (input.assigned_users.length > input.max_slots) {
    return `Jumlah pengguna terassign (${input.assigned_users.length}) melebihi kapasitas slot (${input.max_slots}).`;
  }
  const renewalDate = normalizeOptionalText(input.renewal_date);
  if (renewalDate && !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) {
    return "Format tanggal perpanjangan harus YYYY-MM-DD.";
  }
  return null;
}

/**
 * Decrypts password and optional PIN/recovery code for a subscription.
 * Always enforces `vault.reveal_secret` (OWNER & SUPER_ADMIN) and logs VAULT_REVEAL via RPC.
 */
export async function revealSecretAction(
  subId: string,
): Promise<ActionResult<RevealedSecret>> {
  await requireAction("vault.reveal_secret");

  if (!subId || !isValidUuid(subId)) {
    return { ok: false, error: "ID langganan tidak valid." };
  }

  const keyRes = getVaultEncryptionKey();
  if (!keyRes.ok) {
    return { ok: false, error: keyRes.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_subscription_secret", {
    p_sub_id: subId,
    p_encryption_key: keyRes.key,
  });

  if (error) {
    return { ok: false, error: mapDecryptError(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      ok: false,
      error: "Akun langganan tidak ditemukan atau sudah dihapus.",
    };
  }

  return {
    ok: true,
    data: {
      passwordPlain: row.password_plain,
      pinRecoveryPlain: row.pin_recovery_plain ?? null,
    },
  };
}

/**
 * Creates a new encrypted subscription entry in `subscriptions_vault` (SUPER_ADMIN only).
 */
export async function createSubscriptionAction(
  input: CreateSubscriptionInput,
): Promise<ActionResult<{ id: string; sub_code: string }>> {
  const user = await requireAction("vault.manage");

  const assignedUsers = sanitizeAssignedUsers(input.assigned_users);
  const validationError = validateSubscriptionFields({
    service_name: input.service_name,
    login_email: input.login_email,
    billing_cycle: input.billing_cycle,
    cost: Number(input.cost),
    payment_method: input.payment_method,
    renewal_date: input.renewal_date,
    max_slots: Number(input.max_slots),
    assigned_users: assignedUsers,
  });
  if (validationError) {
    return { ok: false, error: validationError };
  }

  if (!input.password_plain || input.password_plain.length === 0) {
    return { ok: false, error: "Kata sandi akun wajib diisi." };
  }

  const keyRes = getVaultEncryptionKey();
  if (!keyRes.ok) {
    return { ok: false, error: keyRes.error };
  }

  const supabase = await createClient();

  const { data: encryptedPassword, error: encPassError } = await supabase.rpc(
    "encrypt_vault_secret",
    {
      p_plaintext: input.password_plain,
      p_encryption_key: keyRes.key,
    },
  );

  if (encPassError || !encryptedPassword) {
    return {
      ok: false,
      error:
        encPassError?.message ||
        "Gagal mengenkripsi kata sandi akun langganan.",
    };
  }

  let encryptedPin: string | null = null;
  if (input.pin_recovery_plain && input.pin_recovery_plain.length > 0) {
    const { data: pinData, error: encPinError } = await supabase.rpc(
      "encrypt_vault_secret",
      {
        p_plaintext: input.pin_recovery_plain,
        p_encryption_key: keyRes.key,
      },
    );
    if (encPinError) {
      return {
        ok: false,
        error:
          encPinError.message || "Gagal mengenkripsi PIN / kode pemulihan.",
      };
    }
    encryptedPin = pinData ?? null;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("subscriptions_vault")
    .insert({
      service_name: input.service_name.trim(),
      plan_name: normalizeOptionalText(input.plan_name),
      login_email: input.login_email.trim(),
      password_encrypted: encryptedPassword,
      pin_recovery_encrypted: encryptedPin,
      billing_cycle: input.billing_cycle,
      cost: Number(input.cost),
      currency: normalizeOptionalText(input.currency) ?? "IDR",
      payment_method: input.payment_method,
      payment_account_label: normalizeOptionalText(input.payment_account_label),
      renewal_date: normalizeOptionalText(input.renewal_date),
      auto_renew: Boolean(input.auto_renew),
      max_slots: Number(input.max_slots),
      assigned_users_json: assignedUsers as unknown as Json,
      password_rotated_at: nowIso,
      notes: normalizeOptionalText(input.notes),
      is_active: input.is_active ?? true,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, sub_code")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Gagal menyimpan akun langganan ke Vault.",
    };
  }

  revalidatePath("/vault");
  revalidatePath("/dashboard");
  return { ok: true, data };
}

/**
 * Updates an existing subscription in `subscriptions_vault` (SUPER_ADMIN only).
 * Re-encrypts password / PIN only when new plaintext values are supplied.
 */
export async function updateSubscriptionAction(
  input: UpdateSubscriptionInput,
): Promise<ActionResult<{ id: string; sub_code: string }>> {
  const user = await requireAction("vault.manage");

  if (!input.id || !isValidUuid(input.id)) {
    return { ok: false, error: "ID langganan tidak valid." };
  }

  const assignedUsers = sanitizeAssignedUsers(input.assigned_users);
  const validationError = validateSubscriptionFields({
    service_name: input.service_name,
    login_email: input.login_email,
    billing_cycle: input.billing_cycle,
    cost: Number(input.cost),
    payment_method: input.payment_method,
    renewal_date: input.renewal_date,
    max_slots: Number(input.max_slots),
    assigned_users: assignedUsers,
  });
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const hasNewPassword = Boolean(
    input.password_plain && input.password_plain.length > 0,
  );
  const hasNewPin = Boolean(
    input.pin_recovery_plain && input.pin_recovery_plain.length > 0,
  );

  const supabase = await createClient();
  let encryptedPassword: string | undefined;
  let encryptedPin: string | null | undefined;
  let newRotatedAt: string | undefined;

  if (hasNewPassword || hasNewPin) {
    const keyRes = getVaultEncryptionKey();
    if (!keyRes.ok) {
      return { ok: false, error: keyRes.error };
    }

    if (hasNewPassword && input.password_plain) {
      const { data: passData, error: passErr } = await supabase.rpc(
        "encrypt_vault_secret",
        {
          p_plaintext: input.password_plain,
          p_encryption_key: keyRes.key,
        },
      );
      if (passErr || !passData) {
        return {
          ok: false,
          error:
            passErr?.message || "Gagal mengenkripsi kata sandi baru.",
        };
      }
      encryptedPassword = passData;
      newRotatedAt = new Date().toISOString();
    }

    if (input.clear_pin_recovery) {
      encryptedPin = null;
    } else if (hasNewPin && input.pin_recovery_plain) {
      const { data: pinData, error: pinErr } = await supabase.rpc(
        "encrypt_vault_secret",
        {
          p_plaintext: input.pin_recovery_plain,
          p_encryption_key: keyRes.key,
        },
      );
      if (pinErr) {
        return {
          ok: false,
          error: pinErr.message || "Gagal mengenkripsi PIN / kode pemulihan.",
        };
      }
      encryptedPin = pinData ?? null;
    }
  } else if (input.clear_pin_recovery) {
    encryptedPin = null;
  }

  const updatePayload: {
    service_name: string;
    plan_name: string | null;
    login_email: string;
    billing_cycle: BillingCycle;
    cost: number;
    currency: string;
    payment_method: PaymentMethod;
    payment_account_label: string | null;
    renewal_date: string | null;
    auto_renew: boolean;
    max_slots: number;
    assigned_users_json: Json;
    notes: string | null;
    is_active: boolean;
    updated_by: string;
    password_encrypted?: string;
    password_rotated_at?: string;
    pin_recovery_encrypted?: string | null;
  } = {
    service_name: input.service_name.trim(),
    plan_name: normalizeOptionalText(input.plan_name),
    login_email: input.login_email.trim(),
    billing_cycle: input.billing_cycle,
    cost: Number(input.cost),
    currency: normalizeOptionalText(input.currency) ?? "IDR",
    payment_method: input.payment_method,
    payment_account_label: normalizeOptionalText(input.payment_account_label),
    renewal_date: normalizeOptionalText(input.renewal_date),
    auto_renew: Boolean(input.auto_renew),
    max_slots: Number(input.max_slots),
    assigned_users_json: assignedUsers as unknown as Json,
    notes: normalizeOptionalText(input.notes),
    is_active: Boolean(input.is_active),
    updated_by: user.id,
  };

  if (encryptedPassword !== undefined) {
    updatePayload.password_encrypted = encryptedPassword;
  }
  if (newRotatedAt !== undefined) {
    updatePayload.password_rotated_at = newRotatedAt;
  }
  if (encryptedPin !== undefined) {
    updatePayload.pin_recovery_encrypted = encryptedPin;
  }

  const { data, error } = await supabase
    .from("subscriptions_vault")
    .update(updatePayload)
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("id, sub_code")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: error.message || "Gagal memperbarui akun langganan.",
    };
  }

  if (!data) {
    return {
      ok: false,
      error: "Akun langganan tidak ditemukan atau sudah dihapus.",
    };
  }

  revalidatePath("/vault");
  revalidatePath("/dashboard");
  return { ok: true, data };
}

/**
 * Rotates a subscription password (and optionally removes offboarded users)
 * to clear Staff Offboarding security alerts (SUPER_ADMIN only).
 */
export async function rotateSubscriptionPasswordAction(
  input: RotatePasswordInput,
): Promise<ActionResult<{ id: string; rotatedAt: string }>> {
  const user = await requireAction("vault.manage");

  if (!input.id || !isValidUuid(input.id)) {
    return { ok: false, error: "ID langganan tidak valid." };
  }
  if (!input.new_password || input.new_password.length === 0) {
    return { ok: false, error: "Kata sandi baru wajib diisi." };
  }

  const keyRes = getVaultEncryptionKey();
  if (!keyRes.ok) {
    return { ok: false, error: keyRes.error };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("subscriptions_vault")
    .select("id, assigned_users_json")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr || !existing) {
    return {
      ok: false,
      error: fetchErr?.message || "Akun langganan tidak ditemukan.",
    };
  }

  const { data: encryptedPassword, error: encErr } = await supabase.rpc(
    "encrypt_vault_secret",
    {
      p_plaintext: input.new_password,
      p_encryption_key: keyRes.key,
    },
  );

  if (encErr || !encryptedPassword) {
    return {
      ok: false,
      error: encErr?.message || "Gagal mengenkripsi kata sandi baru.",
    };
  }

  let encryptedPin: string | null | undefined;
  if (input.clear_pin_recovery) {
    encryptedPin = null;
  } else if (input.new_pin_recovery && input.new_pin_recovery.length > 0) {
    const { data: pinData, error: pinErr } = await supabase.rpc(
      "encrypt_vault_secret",
      {
        p_plaintext: input.new_pin_recovery,
        p_encryption_key: keyRes.key,
      },
    );
    if (pinErr) {
      return {
        ok: false,
        error: pinErr.message || "Gagal mengenkripsi PIN pemulihan baru.",
      };
    }
    encryptedPin = pinData ?? null;
  }

  let nextAssigned: Json | undefined;
  if (Array.isArray(input.remove_user_ids) && input.remove_user_ids.length > 0) {
    const removeSet = new Set(input.remove_user_ids);
    const currentList = Array.isArray(existing.assigned_users_json)
      ? existing.assigned_users_json
      : [];
    nextAssigned = currentList.filter((entry) => {
      if (typeof entry === "string") {
        return !removeSet.has(entry);
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        const uid =
          (typeof obj.user_id === "string" && obj.user_id) ||
          (typeof obj.id === "string" && obj.id) ||
          "";
        return !removeSet.has(uid);
      }
      return true;
    }) as Json;
  }

  const rotatedAt = new Date().toISOString();
  const payload: {
    password_encrypted: string;
    password_rotated_at: string;
    updated_by: string;
    pin_recovery_encrypted?: string | null;
    assigned_users_json?: Json;
  } = {
    password_encrypted: encryptedPassword,
    password_rotated_at: rotatedAt,
    updated_by: user.id,
  };

  if (encryptedPin !== undefined) {
    payload.pin_recovery_encrypted = encryptedPin;
  }
  if (nextAssigned !== undefined) {
    payload.assigned_users_json = nextAssigned;
  }

  const { error: updateErr } = await supabase
    .from("subscriptions_vault")
    .update(payload)
    .eq("id", input.id)
    .is("deleted_at", null);

  if (updateErr) {
    return {
      ok: false,
      error: updateErr.message || "Gagal merotasi kata sandi akun.",
    };
  }

  revalidatePath("/vault");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: input.id, rotatedAt } };
}

/**
 * Soft-deletes a subscription (moves it to Recycle Bin for 30 days, SUPER_ADMIN only).
 */
export async function softDeleteSubscriptionAction(
  subId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAction("vault.manage");

  if (!subId || !isValidUuid(subId)) {
    return { ok: false, error: "ID langganan tidak valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions_vault")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      updated_by: user.id,
    })
    .eq("id", subId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: error.message || "Gagal menghapus akun langganan.",
    };
  }

  if (!data) {
    return {
      ok: false,
      error: "Akun langganan tidak ditemukan atau sudah dihapus.",
    };
  }

  revalidatePath("/vault");
  revalidatePath("/dashboard");
  revalidatePath("/recycle-bin");
  return { ok: true, data: { id: data.id } };
}
