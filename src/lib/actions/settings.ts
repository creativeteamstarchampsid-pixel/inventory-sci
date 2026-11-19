"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { isRole, type Role } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export type SettingsActionResult<T = unknown> =
  | { ok: true; data: T; message: string }
  | { ok: false; error: string; missingServiceRoleKey?: boolean };

export async function updateOwnProfileAction(input: {
  fullName: string;
  phone?: string | null;
  jobTitle?: string | null;
}): Promise<SettingsActionResult<Profile>> {
  const user = await requireAction("settings.profile");
  const fullName = input.fullName.trim();
  if (fullName.length < 2) {
    return { ok: false, error: "Nama lengkap minimal 2 karakter." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: input.phone?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Gagal memperbarui profil.",
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

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Format email tidak valid." };
  }
  if (fullName.length < 2) {
    return { ok: false, error: "Nama lengkap minimal 2 karakter." };
  }
  if (!isRole(input.role)) {
    return { ok: false, error: "Peran pengguna tidak valid." };
  }
  if (input.role === "OWNER" && actor.role !== "OWNER") {
    return {
      ok: false,
      error: "Hanya Owner yang dapat membuat akun dengan peran Owner.",
    };
  }

  if (input.mode === "password") {
    const pw = input.password ?? "";
    if (pw.length < 8) {
      return {
        ok: false,
        error: "Password awal minimal 8 karakter.",
      };
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      missingServiceRoleKey: true,
      error:
        "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di environment server (.env.local). Tambahkan key tersebut untuk membuat atau mengundang pengguna baru.",
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
          error: authErr?.message ?? "Gagal membuat akun auth pengguna.",
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
          error: inviteErr?.message ?? "Gagal mengirim undangan email pengguna.",
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
          phone: input.phone?.trim() || null,
          job_title: input.jobTitle?.trim() || null,
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
        error:
          profileErr?.message ??
          "Akun auth dibuat, namun gagal memperbarui profil peran.",
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
      summary: `${input.mode === "invite" ? "Mengundang" : "Membuat"} pengguna ${fullName} (${email}) sebagai ${input.role}`,
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
      error:
        err instanceof Error ? err.message : "Gagal menambahkan pengguna baru.",
    };
  }
}

export async function updateUserRoleAction(input: {
  targetUserId: string;
  role: Role;
}): Promise<SettingsActionResult<Profile>> {
  const actor = await requireAction("users.manage");
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
    actor.role !== "OWNER" &&
    (target.role === "OWNER" || input.role === "OWNER")
  ) {
    return {
      ok: false,
      error: "Hanya Owner yang dapat mengubah atau menetapkan peran Owner.",
    };
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
      error: error?.message ?? "Gagal mengubah peran pengguna.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data,
    message: `Peran ${data.full_name || data.email} diperbarui menjadi ${input.role}.`,
  };
}

export async function toggleUserActiveAction(input: {
  targetUserId: string;
  isActive: boolean;
}): Promise<SettingsActionResult<Profile>> {
  const actor = await requireAction("users.manage");
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

  if (actor.role !== "OWNER" && target.role === "OWNER") {
    return {
      ok: false,
      error: "Hanya Owner yang dapat mengubah status aktif akun Owner.",
    };
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
      error: error?.message ?? "Gagal memperbarui status aktif pengguna.",
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

  if (actor.role !== "OWNER" && target.role === "OWNER") {
    return {
      ok: false,
      error: "Hanya Owner yang dapat menandai offboarding akun Owner.",
    };
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
      error: error?.message ?? "Gagal memperbarui status offboarding pengguna.",
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
