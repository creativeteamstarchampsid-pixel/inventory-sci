"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { isRole } from "@/lib/rbac";
import {
  isValidIsoDate,
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeTextInput,
} from "@/lib/security";
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

function getVaultEncryptionKey():
  | { ok: true; key: string }
  | { ok: false; error: string } {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    console.error("[security:vault] VAULT_ENCRYPTION_KEY is missing.");
    return {
      ok: false,
      error:
        "Kunci enkripsi vault belum dikonfigurasi di server. Hubungi administrator sistem.",
    };
  }
  const key = raw.trim();
  if (key.length < 16) {
    console.error("[security:vault] VAULT_ENCRYPTION_KEY length below 16 chars.");
    return {
      ok: false,
      error:
        "Konfigurasi kunci enkripsi vault belum memenuhi standar keamanan AES-256.",
    };
  }
  return { ok: true, key };
}

function mapDecryptError(error: { code?: string; message?: string }): string {
  const lower = (error.message ?? "").toLowerCase();
  if (
    lower.includes("wrong key") ||
    lower.includes("corrupt") ||
    lower.includes("decrypt")
  ) {
    console.error("[security:vault] Decrypt failed due to key mismatch or corrupt ciphertext.");
    return "Gagal mendekripsi kredensial. Kunci enkripsi server tidak cocok dengan data tersimpan.";
  }
  return sanitizeSafeError(
    error,
    "Gagal mendekripsi kredensial langganan.",
    "vault/reveal",
  );
}

function sanitizeAssignedUsers(
  users: AssignedVaultUser[] | undefined,
): AssignedVaultUser[] {
  if (!Array.isArray(users)) return [];
  const seen = new Set<string>();
  const clean: AssignedVaultUser[] = [];

  for (const item of users) {
    if (!item || !isValidUuid(item.user_id)) {
      continue;
    }
    const uid = item.user_id.trim();
    if (seen.has(uid)) continue;
    seen.add(uid);
    clean.push({
      user_id: uid,
      full_name: sanitizeOptionalText(item.full_name, 120),
      email: sanitizeOptionalText(item.email, 254),
      ...(item.role && isRole(item.role) ? { role: item.role } : {}),
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
  if (!sanitizeTextInput(input.service_name, 150)) {
    return "Nama layanan wajib diisi.";
  }
  if (!sanitizeTextInput(input.login_email, 254)) {
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
    input.max_slots < 1 ||
    input.max_slots > 1000
  ) {
    return "Jumlah slot maksimal harus antara 1 dan 1000.";
  }
  if (input.assigned_users.length > input.max_slots) {
    return `Jumlah pengguna terassign (${input.assigned_users.length}) melebihi kapasitas slot (${input.max_slots}).`;
  }
  const renewalDate = sanitizeOptionalText(input.renewal_date, 20);
  if (renewalDate && !isValidIsoDate(renewalDate)) {
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

  if (!isValidUuid(subId)) {
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
    return { ok: false, error: mapDecryptError(error) };
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
 * Creates a new encrypted subscription entry in `subscriptions_vault` (OWNER & SUPER_ADMIN via `vault.manage`).
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
  if (input.password_plain.length > 500) {
    return { ok: false, error: "Kata sandi akun melebihi batas maksimal 500 karakter." };
  }
  if (input.pin_recovery_plain && input.pin_recovery_plain.length > 500) {
    return { ok: false, error: "PIN / kode pemulihan melebihi batas maksimal 500 karakter." };
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
      error: sanitizeSafeError(
        encPassError,
        "Gagal mengenkripsi kata sandi akun langganan.",
        "vault/encryptPassword",
      ),
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
        error: sanitizeSafeError(
          encPinError,
          "Gagal mengenkripsi PIN / kode pemulihan.",
          "vault/encryptPin",
        ),
      };
    }
    encryptedPin = pinData ?? null;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("subscriptions_vault")
    .insert({
      service_name: sanitizeTextInput(input.service_name, 150),
      plan_name: sanitizeOptionalText(input.plan_name, 120),
      login_email: sanitizeTextInput(input.login_email, 254),
      password_encrypted: encryptedPassword,
      pin_recovery_encrypted: encryptedPin,
      billing_cycle: input.billing_cycle,
      cost: Number(input.cost),
      currency: sanitizeOptionalText(input.currency, 10) ?? "IDR",
      payment_method: input.payment_method,
      payment_account_label: sanitizeOptionalText(input.payment_account_label, 150),
      renewal_date: sanitizeOptionalText(input.renewal_date, 20),
      auto_renew: Boolean(input.auto_renew),
      max_slots: Number(input.max_slots),
      assigned_users_json: assignedUsers as unknown as Json,
      password_rotated_at: nowIso,
      notes: sanitizeOptionalText(input.notes, 2000, { multiline: true }),
      is_active: input.is_active ?? true,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, sub_code")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal menyimpan akun langganan ke Vault.",
        "vault/create",
      ),
    };
  }

  revalidatePath("/vault");
  revalidatePath("/dashboard");
  return { ok: true, data };
}

/**
 * Updates an existing subscription in `subscriptions_vault` (OWNER & SUPER_ADMIN via `vault.manage`).
 * Re-encrypts password / PIN only when new plaintext values are supplied.
 */
export async function updateSubscriptionAction(
  input: UpdateSubscriptionInput,
): Promise<ActionResult<{ id: string; sub_code: string }>> {
  const user = await requireAction("vault.manage");

  if (!isValidUuid(input.id)) {
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

  if (input.password_plain && input.password_plain.length > 500) {
    return { ok: false, error: "Kata sandi akun melebihi batas maksimal 500 karakter." };
  }
  if (input.pin_recovery_plain && input.pin_recovery_plain.length > 500) {
    return { ok: false, error: "PIN / kode pemulihan melebihi batas maksimal 500 karakter." };
  }

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
          error: sanitizeSafeError(
            passErr,
            "Gagal mengenkripsi kata sandi baru.",
            "vault/updateEncryptPass",
          ),
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
          error: sanitizeSafeError(
            pinErr,
            "Gagal mengenkripsi PIN / kode pemulihan.",
            "vault/updateEncryptPin",
          ),
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
    service_name: sanitizeTextInput(input.service_name, 150),
    plan_name: sanitizeOptionalText(input.plan_name, 120),
    login_email: sanitizeTextInput(input.login_email, 254),
    billing_cycle: input.billing_cycle,
    cost: Number(input.cost),
    currency: sanitizeOptionalText(input.currency, 10) ?? "IDR",
    payment_method: input.payment_method,
    payment_account_label: sanitizeOptionalText(input.payment_account_label, 150),
    renewal_date: sanitizeOptionalText(input.renewal_date, 20),
    auto_renew: Boolean(input.auto_renew),
    max_slots: Number(input.max_slots),
    assigned_users_json: assignedUsers as unknown as Json,
    notes: sanitizeOptionalText(input.notes, 2000, { multiline: true }),
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
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui akun langganan.",
        "vault/update",
      ),
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
 * to clear Staff Offboarding security alerts (OWNER & SUPER_ADMIN via `vault.manage`).
 */
export async function rotateSubscriptionPasswordAction(
  input: RotatePasswordInput,
): Promise<ActionResult<{ id: string; rotatedAt: string }>> {
  const user = await requireAction("vault.manage");

  if (!isValidUuid(input.id)) {
    return { ok: false, error: "ID langganan tidak valid." };
  }
  if (!input.new_password || input.new_password.length === 0) {
    return { ok: false, error: "Kata sandi baru wajib diisi." };
  }
  if (input.new_password.length > 500) {
    return { ok: false, error: "Kata sandi baru melebihi batas maksimal 500 karakter." };
  }
  if (input.new_pin_recovery && input.new_pin_recovery.length > 500) {
    return { ok: false, error: "PIN pemulihan baru melebihi batas maksimal 500 karakter." };
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

  if (fetchErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        fetchErr,
        "Gagal memuat data akun langganan.",
        "vault/rotateFetch",
      ),
    };
  }
  if (!existing) {
    return { ok: false, error: "Akun langganan tidak ditemukan." };
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
      error: sanitizeSafeError(
        encErr,
        "Gagal mengenkripsi kata sandi baru.",
        "vault/rotateEncryptPass",
      ),
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
        error: sanitizeSafeError(
          pinErr,
          "Gagal mengenkripsi PIN pemulihan baru.",
          "vault/rotateEncryptPin",
        ),
      };
    }
    encryptedPin = pinData ?? null;
  }

  let nextAssigned: Json | undefined;
  if (Array.isArray(input.remove_user_ids) && input.remove_user_ids.length > 0) {
    const removeSet = new Set(
      input.remove_user_ids
        .filter((id): id is string => isValidUuid(id))
        .map((id) => id.trim()),
    );
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
      error: sanitizeSafeError(
        updateErr,
        "Gagal merotasi kata sandi akun.",
        "vault/rotateUpdate",
      ),
    };
  }

  revalidatePath("/vault");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: input.id, rotatedAt } };
}

/**
 * Soft-deletes a subscription (moves it to Recycle Bin for 30 days, OWNER & SUPER_ADMIN via `vault.manage`).
 */
export async function softDeleteSubscriptionAction(
  subId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAction("vault.manage");

  if (!isValidUuid(subId)) {
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
      error: sanitizeSafeError(
        error,
        "Gagal menghapus akun langganan.",
        "vault/softDelete",
      ),
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
