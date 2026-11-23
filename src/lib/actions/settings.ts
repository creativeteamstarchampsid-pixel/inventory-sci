"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import {
  ROLE_LABELS,
  canManageTargetRole,
  isRole,
  type Role,
} from "@/lib/rbac";
import {
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeTextInput,
} from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TablesUpdate } from "@/types/database";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasServiceRoleKey(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function validatePasswordStrength(password: string): string | null {
  if (typeof password !== "string" || password.length < 8 || password.trim().length < 8) {
    return "Kata sandi minimal 8 karakter (tidak boleh hanya spasi).";
  }
  if (password.length > 128) {
    return "Kata sandi maksimal 128 karakter.";
  }
  return null;
}

async function countActiveOwners(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "OWNER")
    .eq("is_active", true);

  if (error) {
    return {
      count: 0,
      error: sanitizeSafeError(
        error,
        "Gagal memverifikasi jumlah Owner aktif.",
        "settings/countActiveOwners",
      ),
    };
  }

  return { count: count ?? 0, error: null };
}

async function forceGlobalSignOut(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      await supabase.auth.signOut({ scope: "local" });
    }
  } catch {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Best-effort session cookie cleanup.
    }
  }
}

export type SettingsActionResult<T = unknown> =
  | {
      ok: true;
      data: T;
      message: string;
      requireRelogin?: boolean;
      redirectTo?: string;
    }
  | {
      ok: false;
      error: string;
      missingServiceRoleKey?: boolean;
      hasBlockingHistory?: boolean;
      borrowCount?: number;
      requestCount?: number;
    };

export async function updateOwnProfileAction(input: {
  fullName: string;
  phone?: string | null;
  jobTitle?: string | null;
}): Promise<SettingsActionResult<Profile>> {
  const user = await requireAction("settings.profile");
  const fullName = sanitizeTextInput(input.fullName, 120);
  if (fullName.length < 2) {
    return { ok: false, error: "Nama lengkap minimal 2 karakter." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: sanitizeOptionalText(input.phone, 40),
      job_title: sanitizeOptionalText(input.jobTitle, 120),
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(error, "Gagal memperbarui profil.", "settings/updateOwnProfile"),
    };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");

  return {
    ok: true,
    data,
    message: "Profil pribadi berhasil diperbarui.",
  };
}

export async function changeOwnEmailAction(input: {
  currentPassword: string;
  newEmail: string;
}): Promise<SettingsActionResult<{ email: string }>> {
  const actor = await requireAction("settings.profile");

  const rawNewEmail =
    typeof input.newEmail === "string" ? input.newEmail.trim() : "";
  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";

  if (!rawNewEmail || rawNewEmail.length > 254) {
    return {
      ok: false,
      error: "Format email baru tidak valid (maksimal 254 karakter).",
    };
  }
  const newEmail = sanitizeTextInput(rawNewEmail, 254).toLowerCase();
  if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
    return { ok: false, error: "Format email baru tidak valid." };
  }
  if (!currentPassword || currentPassword.trim().length === 0) {
    return { ok: false, error: "Kata sandi saat ini wajib diisi." };
  }
  if (currentPassword.length > 128) {
    return { ok: false, error: "Kata sandi saat ini maksimal 128 karakter." };
  }

  const currentEmail = (actor.email ?? "").trim().toLowerCase();
  if (!currentEmail) {
    return {
      ok: false,
      error:
        "Alamat email akun Anda saat ini tidak ditemukan. Hubungi administrator.",
    };
  }
  if (newEmail === currentEmail) {
    return {
      ok: false,
      error: "Email baru sama dengan email Anda saat ini.",
    };
  }

  try {
    const supabase = await createClient();

    const { data: reauthData, error: reauthErr } =
      await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword,
      });

    if (reauthErr || !reauthData.user || reauthData.user.id !== actor.id) {
      return { ok: false, error: "Kata sandi saat ini tidak sesuai." };
    }

    const useServiceRole = hasServiceRoleKey();
    const lookupClient = useServiceRole ? createAdminClient() : supabase;

    const { data: existingWithEmail, error: emailCheckErr } = await lookupClient
      .from("profiles")
      .select("id")
      .eq("email", newEmail)
      .neq("id", actor.id)
      .maybeSingle();

    if (emailCheckErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          emailCheckErr,
          "Gagal memverifikasi ketersediaan email.",
          "settings/changeOwnEmailCheck",
        ),
      };
    }
    if (existingWithEmail) {
      return {
        ok: false,
        error: "Email tersebut sudah digunakan oleh akun lain.",
      };
    }

    if (useServiceRole) {
      const admin = createAdminClient();
      const { error: authErr } = await admin.auth.admin.updateUserById(
        actor.id,
        {
          email: newEmail,
          email_confirm: true,
        },
      );

      if (authErr) {
        return {
          ok: false,
          error: sanitizeSafeError(
            authErr,
            "Gagal memperbarui alamat email autentikasi.",
            "settings/changeOwnEmailAuth",
          ),
        };
      }

      const { error: profileErr } = await admin
        .from("profiles")
        .update({ email: newEmail })
        .eq("id", actor.id);

      if (profileErr) {
        try {
          await admin.auth.admin.updateUserById(actor.id, {
            email: currentEmail,
            email_confirm: true,
          });
        } catch {
          // Best-effort rollback if profile update failed after auth email mutation.
        }
        return {
          ok: false,
          error: sanitizeSafeError(
            profileErr,
            "Gagal menyinkronkan alamat email pada profil akun.",
            "settings/changeOwnEmailProfile",
          ),
        };
      }
    } else {
      const { error: authErr } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (authErr) {
        return {
          ok: false,
          error: sanitizeSafeError(
            authErr,
            "Gagal memperbarui alamat email akun.",
            "settings/changeOwnEmailFallback",
          ),
        };
      }
    }

    try {
      const auditClient = useServiceRole ? createAdminClient() : supabase;
      await auditClient.from("audit_logs").insert({
        actor_id: actor.id,
        actor_name: actor.fullName,
        actor_role: actor.role,
        action: "USER_EMAIL_CHANGED",
        entity_type: "profiles",
        entity_id: actor.id,
        entity_code: newEmail,
        summary: `Mengubah email akun pribadi dari ${currentEmail} menjadi ${newEmail}`,
        metadata: {
          previous_email: currentEmail,
          new_email: newEmail,
          self_service: true,
        },
      });
    } catch {
      // Best-effort audit log; do not block email change completion.
    }

    await forceGlobalSignOut(supabase);

    revalidatePath("/settings");
    revalidatePath("/audit-log");
    revalidatePath("/", "layout");

    return {
      ok: true,
      data: { email: newEmail },
      message:
        "Email berhasil diperbarui! Anda akan otomatis keluar untuk masuk kembali dengan email baru.",
      requireRelogin: true,
      redirectTo: "/login?notice=email-changed",
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal memperbarui alamat email akun.",
        "settings/changeOwnEmailCatch",
      ),
    };
  }
}

export async function changeOwnPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<SettingsActionResult<{ id: string }>> {
  const actor = await requireAction("settings.profile");

  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";
  const newPassword =
    typeof input.newPassword === "string" ? input.newPassword : "";
  const confirmPassword =
    typeof input.confirmPassword === "string" ? input.confirmPassword : "";

  if (!currentPassword || currentPassword.trim().length === 0) {
    return { ok: false, error: "Kata sandi saat ini wajib diisi." };
  }
  if (currentPassword.length > 128) {
    return { ok: false, error: "Kata sandi saat ini maksimal 128 karakter." };
  }

  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) {
    return { ok: false, error: pwErr };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Konfirmasi kata sandi baru tidak cocok." };
  }
  if (newPassword === currentPassword) {
    return {
      ok: false,
      error: "Kata sandi baru harus berbeda dari kata sandi saat ini.",
    };
  }

  const currentEmail = (actor.email ?? "").trim().toLowerCase();
  if (!currentEmail) {
    return {
      ok: false,
      error:
        "Alamat email akun Anda saat ini tidak ditemukan. Hubungi administrator.",
    };
  }

  try {
    const supabase = await createClient();

    const { data: reauthData, error: reauthErr } =
      await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword,
      });

    if (reauthErr || !reauthData.user || reauthData.user.id !== actor.id) {
      return { ok: false, error: "Kata sandi saat ini tidak sesuai." };
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          updateErr,
          "Gagal memperbarui kata sandi akun.",
          "settings/changeOwnPassword",
        ),
      };
    }

    try {
      const auditClient = hasServiceRoleKey() ? createAdminClient() : supabase;
      await auditClient.from("audit_logs").insert({
        actor_id: actor.id,
        actor_name: actor.fullName,
        actor_role: actor.role,
        action: "USER_PASSWORD_CHANGED",
        entity_type: "profiles",
        entity_id: actor.id,
        entity_code: currentEmail,
        summary: `Mengubah kata sandi akun pribadi (${actor.fullName})`,
        metadata: {
          self_service: true,
        },
      });
    } catch {
      // Best-effort audit log; never blocks password change completion.
    }

    await forceGlobalSignOut(supabase);

    revalidatePath("/settings");
    revalidatePath("/audit-log");
    revalidatePath("/", "layout");

    return {
      ok: true,
      data: { id: actor.id },
      message:
        "Kata sandi berhasil diperbarui! Anda akan otomatis keluar untuk masuk kembali dengan kata sandi baru.",
      requireRelogin: true,
      redirectTo: "/login?notice=password-changed",
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal memperbarui kata sandi akun.",
        "settings/changeOwnPasswordCatch",
      ),
    };
  }
}

export async function createOrInviteUserAction(input: {
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  jobTitle?: string;
  mode: "invite" | "password";
  password?: string;
}): Promise<SettingsActionResult<Profile>> {
  const actor = await requireAction("users.manage");

  const email = sanitizeTextInput(input.email, 254).toLowerCase();
  const fullName = sanitizeTextInput(input.fullName, 120);

  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "Format email tidak valid." };
  }
  if (fullName.length < 2) {
    return { ok: false, error: "Nama lengkap minimal 2 karakter." };
  }
  if (!isRole(input.role)) {
    return { ok: false, error: "Peran pengguna tidak valid." };
  }
  if (input.mode !== "invite" && input.mode !== "password") {
    return { ok: false, error: "Mode pembuatan akun tidak valid." };
  }
  if (!canManageTargetRole(actor.role, input.role)) {
    return {
      ok: false,
      error:
        "Hanya Owner yang dapat membuat akun dengan peran Owner atau Admin Operasional.",
    };
  }

  if (input.mode === "password") {
    const pwErr = validatePasswordStrength(input.password ?? "");
    if (pwErr) {
      return { ok: false, error: pwErr };
    }
  }

  if (!hasServiceRoleKey()) {
    return {
      ok: false,
      missingServiceRoleKey: true,
      error:
        "Layanan manajemen akun server belum aktif. Hubungi administrator sistem untuk mengaktifkan konfigurasi server.",
    };
  }

  try {
    const admin = createAdminClient();
    let createdUserId: string | null = null;

    if (input.mode === "password") {
      const { data: created, error: authErr } = await admin.auth.admin.createUser({
        email,
        password: input.password!,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (authErr || !created.user) {
        return {
          ok: false,
          error: sanitizeSafeError(
            authErr,
            "Gagal membuat akun pengguna.",
            "settings/createUser",
          ),
        };
      }
      createdUserId = created.user.id;
    } else {
      const { data: invited, error: inviteErr } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
        });
      if (inviteErr || !invited.user) {
        return {
          ok: false,
          error: sanitizeSafeError(
            inviteErr,
            "Gagal mengirim undangan email pengguna.",
            "settings/inviteUser",
          ),
        };
      }
      createdUserId = invited.user.id;
    }

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: createdUserId,
          email,
          full_name: fullName,
          role: input.role,
          phone: sanitizeOptionalText(input.phone, 40),
          job_title: sanitizeOptionalText(input.jobTitle, 120),
          is_active: true,
          offboarded_at: null,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (profileErr || !profile) {
      return {
        ok: false,
        error: sanitizeSafeError(
          profileErr,
          "Akun dibuat, namun gagal memperbarui profil peran.",
          "settings/upsertProfile",
        ),
      };
    }

    const userClient = await createClient();
    await userClient.from("audit_logs").insert({
      actor_id: actor.id,
      actor_name: actor.fullName,
      actor_role: actor.role,
      action: input.mode === "invite" ? "USER_INVITED" : "USER_CREATED",
      entity_type: "profiles",
      entity_id: profile.id,
      entity_code: profile.email,
      summary: `${input.mode === "invite" ? "Mengundang" : "Membuat"} pengguna ${fullName} (${email}) sebagai ${ROLE_LABELS[input.role].title}`,
    });

    revalidatePath("/settings");
    revalidatePath("/audit-log");
    return {
      ok: true,
      data: profile,
      message:
        input.mode === "invite"
          ? `Undangan email berhasil dikirim ke ${email}.`
          : `Akun ${fullName} (${email}) berhasil dibuat.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal menambahkan pengguna baru.",
        "settings/createOrInviteCatch",
      ),
    };
  }
}

export async function updateUserAction(input: {
  targetUserId: string;
  fullName: string;
  email: string;
  role: Role;
  phone?: string | null;
  jobTitle?: string | null;
  isActive: boolean;
}): Promise<SettingsActionResult<Profile>> {
  const actor = await requireAction("users.manage");

  const targetUserId = typeof input.targetUserId === "string" ? input.targetUserId.trim() : "";
  const fullName = sanitizeTextInput(input.fullName, 120);
  const normalizedEmail = sanitizeTextInput(input.email, 254).toLowerCase();
  const phone = sanitizeOptionalText(input.phone, 40);
  const jobTitle = sanitizeOptionalText(input.jobTitle, 120);

  if (!isValidUuid(targetUserId)) {
    return { ok: false, error: "ID pengguna tidak valid." };
  }
  if (fullName.length < 2) {
    return { ok: false, error: "Nama lengkap minimal 2 karakter." };
  }
  if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
    return { ok: false, error: "Format email tidak valid." };
  }
  if (!isRole(input.role)) {
    return { ok: false, error: "Peran pengguna tidak valid." };
  }

  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .maybeSingle();

  if (fetchErr || !target) {
    return { ok: false, error: "Pengguna tidak ditemukan." };
  }

  if (
    !canManageTargetRole(actor.role, target.role) ||
    !canManageTargetRole(actor.role, input.role)
  ) {
    return {
      ok: false,
      error:
        "Hanya Owner yang dapat mengelola atau menetapkan peran Owner maupun Admin Operasional.",
    };
  }

  if (targetUserId === actor.id) {
    if (input.role !== target.role) {
      return {
        ok: false,
        error: "Anda tidak dapat mengubah peran akun Anda sendiri.",
      };
    }
    if (!input.isActive) {
      return {
        ok: false,
        error: "Anda tidak dapat menonaktifkan akun Anda sendiri.",
      };
    }
  }

  const isDeactivatingOrDemotingActiveOwner =
    target.role === "OWNER" &&
    target.is_active &&
    (!input.isActive || input.role !== "OWNER");

  if (isDeactivatingOrDemotingActiveOwner) {
    const ownerCheck = await countActiveOwners(supabase);
    if (ownerCheck.error) {
      return { ok: false, error: ownerCheck.error };
    }
    if (ownerCheck.count <= 1) {
      return {
        ok: false,
        error:
          "Tidak dapat menonaktifkan atau menurunkan peran Owner aktif terakhir di sistem.",
      };
    }
  }

  const currentEmail = (target.email ?? "").trim().toLowerCase();
  const emailChanged = normalizedEmail !== currentEmail;
  const nameChanged = fullName !== (target.full_name ?? "").trim();

  if (emailChanged && !hasServiceRoleKey()) {
    return {
      ok: false,
      missingServiceRoleKey: true,
      error:
        "Layanan manajemen akun server belum aktif. Hubungi administrator sistem untuk mengubah alamat email akun.",
    };
  }

  const profilePatch: TablesUpdate<"profiles"> = {
    full_name: fullName,
    role: input.role,
    phone,
    job_title: jobTitle,
    is_active: input.isActive,
  };

  if (emailChanged) {
    profilePatch.email = normalizedEmail;
  }

  if (input.isActive && target.offboarded_at) {
    profilePatch.offboarded_at = null;
  }

  try {
    let updated: Profile | null = null;

    if (hasServiceRoleKey()) {
      const admin = createAdminClient();

      if (emailChanged) {
        const { data: existingWithEmail, error: emailCheckErr } = await admin
          .from("profiles")
          .select("id")
          .eq("email", normalizedEmail)
          .neq("id", targetUserId)
          .maybeSingle();

        if (emailCheckErr) {
          return {
            ok: false,
            error: sanitizeSafeError(
              emailCheckErr,
              "Gagal memverifikasi ketersediaan email.",
              "settings/checkEmail",
            ),
          };
        }
        if (existingWithEmail) {
          return {
            ok: false,
            error: `Email ${normalizedEmail} sudah digunakan oleh akun lain.`,
          };
        }

        const { error: authErr } = await admin.auth.admin.updateUserById(
          targetUserId,
          {
            email: normalizedEmail,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          },
        );
        if (authErr) {
          return {
            ok: false,
            error: sanitizeSafeError(
              authErr,
              "Gagal memperbarui alamat email autentikasi pengguna.",
              "settings/updateAuthEmail",
            ),
          };
        }
      } else if (nameChanged) {
        try {
          await admin.auth.admin.updateUserById(targetUserId, {
            user_metadata: { full_name: fullName },
          });
        } catch {
          // Best-effort metadata sync; profiles table update stays authoritative.
        }
      }

      const { data, error } = await admin
        .from("profiles")
        .update(profilePatch)
        .eq("id", targetUserId)
        .select("*")
        .single();

      if (error || !data) {
        if (emailChanged && currentEmail) {
          try {
            await admin.auth.admin.updateUserById(targetUserId, {
              email: currentEmail,
              email_confirm: true,
            });
          } catch {
            // Best-effort rollback if profile update failed after auth email mutation.
          }
        }
        return {
          ok: false,
          error: sanitizeSafeError(
            error,
            "Gagal memperbarui data pengguna.",
            "settings/updateProfileAdmin",
          ),
        };
      }
      updated = data;
    } else {
      const { data, error } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("id", targetUserId)
        .select("*")
        .single();

      if (error || !data) {
        return {
          ok: false,
          error: sanitizeSafeError(
            error,
            "Gagal memperbarui data pengguna.",
            "settings/updateProfile",
          ),
        };
      }
      updated = data;
    }

    const changedFields: string[] = [];
    if (nameChanged) changedFields.push("nama");
    if (emailChanged) changedFields.push("email");
    if (input.role !== target.role) changedFields.push("peran");
    if (phone !== (target.phone ?? null)) changedFields.push("telepon");
    if (jobTitle !== (target.job_title ?? null)) changedFields.push("jabatan");
    if (input.isActive !== target.is_active) changedFields.push("status aktif");
    if (input.isActive && target.offboarded_at) {
      changedFields.push("status offboarding");
    }

    const changeNote =
      changedFields.length > 0 ? ` (${changedFields.join(", ")})` : "";

    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      actor_name: actor.fullName,
      actor_role: actor.role,
      action: "USER_UPDATED",
      entity_type: "profiles",
      entity_id: updated.id,
      entity_code: updated.email,
      summary: `Memperbarui data pengguna ${updated.full_name || updated.email || updated.id}${changeNote}`,
      metadata: {
        changed_fields: changedFields,
        previous_role: target.role,
        new_role: updated.role,
        previous_email: target.email,
        new_email: updated.email,
        is_active: updated.is_active,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/audit-log");
    revalidatePath("/vault");
    if (targetUserId === actor.id) {
      revalidatePath("/", "layout");
    }

    if (targetUserId === actor.id && emailChanged) {
      await forceGlobalSignOut(supabase);
      return {
        ok: true,
        data: updated,
        message:
          "Email akun Anda berhasil diperbarui! Anda akan otomatis keluar untuk masuk kembali dengan email baru.",
        requireRelogin: true,
        redirectTo: "/login?notice=email-changed",
      };
    }

    return {
      ok: true,
      data: updated,
      message: `Data pengguna ${updated.full_name || updated.email} berhasil diperbarui.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal memperbarui data pengguna.",
        "settings/updateUserCatch",
      ),
    };
  }
}

export async function resetUserPasswordAction(input: {
  targetUserId: string;
  newPassword: string;
}): Promise<SettingsActionResult<{ id: string }>> {
  const actor = await requireAction("users.manage");

  const targetUserId = typeof input.targetUserId === "string" ? input.targetUserId.trim() : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";

  if (!isValidUuid(targetUserId)) {
    return { ok: false, error: "ID pengguna tidak valid." };
  }
  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) {
    return { ok: false, error: pwErr };
  }

  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .maybeSingle();

  if (fetchErr || !target) {
    return { ok: false, error: "Pengguna tidak ditemukan." };
  }

  const canReset =
    targetUserId === actor.id || canManageTargetRole(actor.role, target.role);
  if (!canReset) {
    return {
      ok: false,
      error:
        "Hanya Owner yang dapat mengatur ulang kata sandi akun Owner atau Admin Operasional.",
    };
  }

  if (!hasServiceRoleKey()) {
    return {
      ok: false,
      missingServiceRoleKey: true,
      error:
        "Layanan manajemen akun server belum aktif. Hubungi administrator sistem untuk mengatur ulang kata sandi.",
    };
  }

  try {
    const admin = createAdminClient();
    const { error: authErr } = await admin.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword },
    );

    if (authErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          authErr,
          "Gagal mengatur ulang kata sandi pengguna.",
          "settings/resetPassword",
        ),
      };
    }

    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      actor_name: actor.fullName,
      actor_role: actor.role,
      action: "USER_PASSWORD_RESET",
      entity_type: "profiles",
      entity_id: target.id,
      entity_code: target.email,
      summary: `Mengatur ulang kata sandi akun ${target.full_name || target.email || target.id}`,
      metadata: {
        target_role: target.role,
        self_reset: targetUserId === actor.id,
      },
    });

    revalidatePath("/audit-log");

    if (targetUserId === actor.id) {
      await forceGlobalSignOut(supabase);
      revalidatePath("/", "layout");
      return {
        ok: true,
        data: { id: target.id },
        message:
          "Kata sandi akun Anda berhasil diatur ulang! Anda akan otomatis keluar untuk masuk kembali dengan kata sandi baru.",
        requireRelogin: true,
        redirectTo: "/login?notice=password-changed",
      };
    }

    return {
      ok: true,
      data: { id: target.id },
      message: `Kata sandi untuk ${target.full_name || target.email || "pengguna"} berhasil diatur ulang.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal mengatur ulang kata sandi pengguna.",
        "settings/resetPasswordCatch",
      ),
    };
  }
}

export async function deleteUserAction(input: {
  targetUserId: string;
  reassignHistory?: boolean;
}): Promise<SettingsActionResult<{ id: string }>> {
  const actor = await requireAction("users.manage");

  const targetUserId = typeof input.targetUserId === "string" ? input.targetUserId.trim() : "";
  if (!isValidUuid(targetUserId)) {
    return { ok: false, error: "ID pengguna tidak valid." };
  }
  if (targetUserId === actor.id) {
    return {
      ok: false,
      error: "Anda tidak dapat menghapus akun Anda sendiri.",
    };
  }

  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .maybeSingle();

  if (fetchErr || !target) {
    return { ok: false, error: "Pengguna tidak ditemukan." };
  }

  if (!canManageTargetRole(actor.role, target.role)) {
    return {
      ok: false,
      error:
        "Hanya Owner yang dapat menghapus akun Owner atau Admin Operasional.",
    };
  }

  if (target.role === "OWNER" && target.is_active) {
    const ownerCheck = await countActiveOwners(supabase);
    if (ownerCheck.error) {
      return { ok: false, error: ownerCheck.error };
    }
    if (ownerCheck.count <= 1) {
      return {
        ok: false,
        error: "Tidak dapat menghapus Owner aktif terakhir di sistem.",
      };
    }
  }

  if (!hasServiceRoleKey()) {
    return {
      ok: false,
      missingServiceRoleKey: true,
      error:
        "Layanan manajemen akun server belum aktif. Hubungi administrator sistem untuk menghapus akun secara permanen.",
    };
  }

  try {
    const admin = createAdminClient();

    const [borrowRes, requestRes] = await Promise.all([
      admin
        .from("borrow_transactions")
        .select("id", { count: "exact", head: true })
        .eq("borrower_id", targetUserId),
      admin
        .from("internal_requests")
        .select("id", { count: "exact", head: true })
        .eq("requested_by", targetUserId),
    ]);

    if (borrowRes.error || requestRes.error) {
      return {
        ok: false,
        error: sanitizeSafeError(
          borrowRes.error ?? requestRes.error,
          "Gagal memeriksa keterkaitan riwayat pengguna.",
          "settings/deleteCheckHistory",
        ),
      };
    }

    const borrowCount = borrowRes.count ?? 0;
    const requestCount = requestRes.count ?? 0;
    let historyReassigned = false;

    if (borrowCount > 0 || requestCount > 0) {
      if (!input.reassignHistory) {
        return {
          ok: false,
          hasBlockingHistory: true,
          borrowCount,
          requestCount,
          error: `Akun ini masih terhubung dengan ${borrowCount} riwayat peminjaman dan ${requestCount} pengajuan. Anda bisa menonaktifkan/offboard akun agar riwayat tetap utuh, atau (khusus Owner) alihkan riwayat lalu hapus permanen.`,
        };
      }

      if (actor.role !== "OWNER") {
        return {
          ok: false,
          hasBlockingHistory: true,
          borrowCount,
          requestCount,
          error:
            "Hanya Owner yang berwenang mengalihkan riwayat transaksi untuk menghapus akun secara permanen.",
        };
      }

      if (borrowCount > 0) {
        const { error: reassignBorrowErr } = await admin
          .from("borrow_transactions")
          .update({ borrower_id: actor.id })
          .eq("borrower_id", targetUserId);

        if (reassignBorrowErr) {
          return {
            ok: false,
            error: sanitizeSafeError(
              reassignBorrowErr,
              "Gagal mengalihkan riwayat peminjaman sebelum penghapusan akun.",
              "settings/reassignBorrows",
            ),
          };
        }
      }

      if (requestCount > 0) {
        const { error: reassignRequestErr } = await admin
          .from("internal_requests")
          .update({ requested_by: actor.id })
          .eq("requested_by", targetUserId);

        if (reassignRequestErr) {
          return {
            ok: false,
            error: sanitizeSafeError(
              reassignRequestErr,
              "Gagal mengalihkan riwayat pengajuan sebelum penghapusan akun.",
              "settings/reassignRequests",
            ),
          };
        }
      }

      historyReassigned = true;
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          deleteErr,
          "Gagal menghapus akun pengguna dari sistem autentikasi.",
          "settings/deleteAuthUser",
        ),
      };
    }

    const targetDisplay = target.full_name || target.email || target.id;
    const reassignSummary = historyReassigned
      ? ` (riwayat dialihkan ke ${actor.fullName}: ${borrowCount} peminjaman, ${requestCount} pengajuan)`
      : "";

    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      actor_name: actor.fullName,
      actor_role: actor.role,
      action: "USER_DELETED",
      entity_type: "profiles",
      entity_id: target.id,
      entity_code: target.email,
      summary: `Menghapus permanen pengguna ${targetDisplay} (${target.email ?? "-"}, ${ROLE_LABELS[target.role].title})${reassignSummary}`,
      metadata: {
        deleted_full_name: target.full_name,
        deleted_email: target.email,
        deleted_role: target.role,
        history_reassigned: historyReassigned,
        reassigned_borrow_count: historyReassigned ? borrowCount : 0,
        reassigned_request_count: historyReassigned ? requestCount : 0,
        reassigned_to: historyReassigned ? actor.id : null,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/vault");
    revalidatePath("/audit-log");
    if (historyReassigned) {
      revalidatePath("/scan");
      revalidatePath("/requests");
    }

    return {
      ok: true,
      data: { id: target.id },
      message: historyReassigned
        ? `Riwayat dialihkan dan akun ${targetDisplay} berhasil dihapus permanen.`
        : `Akun ${targetDisplay} berhasil dihapus permanen.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizeSafeError(
        err,
        "Gagal menghapus akun pengguna secara permanen.",
        "settings/deleteUserCatch",
      ),
    };
  }
}

export async function updateUserRoleAction(input: {
  targetUserId: string;
  role: Role;
}): Promise<SettingsActionResult<Profile>> {
  const actor = await requireAction("users.manage");
  if (!isValidUuid(input.targetUserId)) {
    return { ok: false, error: "ID pengguna tidak valid." };
  }
  if (!isRole(input.role)) {
    return { ok: false, error: "Peran tidak valid." };
  }
  if (input.targetUserId === actor.id) {
    return {
      ok: false,
      error: "Anda tidak dapat mengubah peran akun Anda sendiri.",
    };
  }

  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", input.targetUserId)
    .maybeSingle();

  if (fetchErr || !target) {
    return { ok: false, error: "Pengguna tidak ditemukan." };
  }

  if (
    !canManageTargetRole(actor.role, target.role) ||
    !canManageTargetRole(actor.role, input.role)
  ) {
    return {
      ok: false,
      error:
        "Hanya Owner yang dapat mengubah atau menetapkan peran Owner maupun Admin Operasional.",
    };
  }

  if (
    target.role === "OWNER" &&
    target.is_active &&
    input.role !== "OWNER"
  ) {
    const ownerCheck = await countActiveOwners(supabase);
    if (ownerCheck.error) {
      return { ok: false, error: ownerCheck.error };
    }
    if (ownerCheck.count <= 1) {
      return {
        ok: false,
        error: "Tidak dapat menurunkan peran Owner aktif terakhir di sistem.",
      };
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: input.role })
    .eq("id", input.targetUserId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(error, "Gagal mengubah peran pengguna.", "settings/updateRole"),
    };
  }

  revalidatePath("/settings");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data,
    message: `Peran ${data.full_name || data.email} diperbarui menjadi ${ROLE_LABELS[input.role].title}.`,
  };
}

export async function toggleUserActiveAction(input: {
  targetUserId: string;
  isActive: boolean;
}): Promise<SettingsActionResult<Profile>> {
  const actor = await requireAction("users.manage");
  if (!isValidUuid(input.targetUserId)) {
    return { ok: false, error: "ID pengguna tidak valid." };
  }
  if (input.targetUserId === actor.id && !input.isActive) {
    return {
      ok: false,
      error: "Anda tidak dapat menonaktifkan akun Anda sendiri.",
    };
  }

  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", input.targetUserId)
    .maybeSingle();

  if (fetchErr || !target) {
    return { ok: false, error: "Pengguna tidak ditemukan." };
  }

  if (!canManageTargetRole(actor.role, target.role)) {
    return {
      ok: false,
      error:
        "Hanya Owner yang dapat mengubah status aktif akun Owner atau Admin Operasional.",
    };
  }

  if (target.role === "OWNER" && target.is_active && !input.isActive) {
    const ownerCheck = await countActiveOwners(supabase);
    if (ownerCheck.error) {
      return { ok: false, error: ownerCheck.error };
    }
    if (ownerCheck.count <= 1) {
      return {
        ok: false,
        error: "Tidak dapat menonaktifkan Owner aktif terakhir di sistem.",
      };
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: input.isActive })
    .eq("id", input.targetUserId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui status aktif pengguna.",
        "settings/toggleActive",
      ),
    };
  }

  revalidatePath("/settings");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data,
    message: input.isActive
      ? `Akun ${data.full_name || data.email} diaktifkan.`
      : `Akun ${data.full_name || data.email} dinonaktifkan.`,
  };
}

export async function toggleUserOffboardAction(input: {
  targetUserId: string;
  offboarded: boolean;
}): Promise<SettingsActionResult<Profile>> {
  const actor = await requireAction("users.manage");
  if (!isValidUuid(input.targetUserId)) {
    return { ok: false, error: "ID pengguna tidak valid." };
  }
  if (input.targetUserId === actor.id) {
    return {
      ok: false,
      error: "Anda tidak dapat menandai akun Anda sendiri sebagai offboarded.",
    };
  }

  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", input.targetUserId)
    .maybeSingle();

  if (fetchErr || !target) {
    return { ok: false, error: "Pengguna tidak ditemukan." };
  }

  if (!canManageTargetRole(actor.role, target.role)) {
    return {
      ok: false,
      error:
        "Hanya Owner yang dapat menandai offboarding akun Owner atau Admin Operasional.",
    };
  }

  if (input.offboarded && target.role === "OWNER" && target.is_active) {
    const ownerCheck = await countActiveOwners(supabase);
    if (ownerCheck.error) {
      return { ok: false, error: ownerCheck.error };
    }
    if (ownerCheck.count <= 1) {
      return {
        ok: false,
        error:
          "Tidak dapat menandai offboard pada Owner aktif terakhir di sistem.",
      };
    }
  }

  const patch = input.offboarded
    ? { offboarded_at: new Date().toISOString(), is_active: false }
    : { offboarded_at: null, is_active: true };

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", input.targetUserId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: sanitizeSafeError(
        error,
        "Gagal memperbarui status offboarding pengguna.",
        "settings/toggleOffboard",
      ),
    };
  }

  revalidatePath("/settings");
  revalidatePath("/vault");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data,
    message: input.offboarded
      ? `${data.full_name || data.email} ditandai offboarded. Periksa Subscription Vault untuk rotasi akses.`
      : `Status offboarding ${data.full_name || data.email} dibatalkan dan akun diaktifkan kembali.`,
  };
}
