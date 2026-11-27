"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import {
  normalizeBarcodeStudioConfig,
  type BarcodeStudioConfigSnapshot,
} from "@/lib/barcode";
import {
  isValidUuid,
  sanitizeOptionalText,
  sanitizeSafeError,
  sanitizeTextInput,
} from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import type { BarcodeLabelPreset, Json } from "@/types/database";

import type { ActionResult } from "./inventory";

export type BarcodePresetRecord = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  config: BarcodeStudioConfigSnapshot;
  created_at: string;
  updated_at: string;
};

function mapPresetRow(row: BarcodeLabelPreset): BarcodePresetRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    is_default: Boolean(row.is_default),
    config: normalizeBarcodeStudioConfig(row.config_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Creates a new Barcode & Label Print Studio preset or updates an existing one.
 * Restricted to active OWNER & SUPER_ADMIN users via `barcode.print` + RLS.
 */
export async function saveBarcodePresetAction(input: {
  id?: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  config: BarcodeStudioConfigSnapshot;
}): Promise<ActionResult<BarcodePresetRecord>> {
  const user = await requireAction("barcode.print");

  const name = sanitizeTextInput(input.name, 80);
  if (name.length < 2 || name.length > 80) {
    return {
      ok: false,
      error: "Nama preset harus terdiri dari 2 hingga 80 karakter.",
    };
  }

  const description = sanitizeOptionalText(input.description, 300, {
    multiline: true,
  });

  const editId =
    typeof input.id === "string" && input.id.trim().length > 0
      ? input.id.trim()
      : undefined;

  if (editId && !isValidUuid(editId)) {
    return { ok: false, error: "ID preset tidak valid." };
  }

  const normalizedConfig = normalizeBarcodeStudioConfig(input.config);
  const configJson = normalizedConfig as unknown as Json;
  const isDefault = Boolean(input.isDefault);

  const supabase = await createClient();

  if (editId) {
    const { data: existing, error: existingErr } = await supabase
      .from("barcode_label_presets")
      .select("id, name, description, is_default, config_json")
      .eq("id", editId)
      .maybeSingle();

    if (existingErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          existingErr,
          "Gagal memeriksa preset label yang akan diperbarui.",
          "barcode-presets/fetchExisting",
        ),
      };
    }

    if (!existing) {
      return { ok: false, error: "Preset label tidak ditemukan." };
    }

    if (isDefault) {
      const { error: clearErr } = await supabase
        .from("barcode_label_presets")
        .update({ is_default: false, updated_by: user.id })
        .eq("is_default", true)
        .neq("id", editId);

      if (clearErr) {
        return {
          ok: false,
          error: sanitizeSafeError(
            clearErr,
            "Gagal mengatur ulang preset default sebelumnya.",
            "barcode-presets/clearDefaultOnUpdate",
          ),
        };
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from("barcode_label_presets")
      .update({
        name,
        description,
        is_default: isDefault,
        config_json: configJson,
        updated_by: user.id,
      })
      .eq("id", editId)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return {
        ok: false,
        error: sanitizeSafeError(
          updateErr,
          "Gagal memperbarui preset label.",
          "barcode-presets/update",
        ),
      };
    }

    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_name: user.fullName,
      actor_role: user.role,
      action: "UPDATE",
      entity_type: "barcode_label_presets",
      entity_id: updated.id,
      entity_code: updated.name.slice(0, 60),
      summary: `Memperbarui preset Barcode Studio "${updated.name}"${updated.is_default ? " (Default)" : ""}`,
      old_data: {
        name: existing.name,
        description: existing.description,
        is_default: existing.is_default,
        config_json: existing.config_json,
      },
      new_data: {
        name: updated.name,
        description: updated.description,
        is_default: updated.is_default,
        config_json: updated.config_json,
      },
      metadata: {
        template: normalizedConfig.template,
        symbology: normalizedConfig.symbology,
        is_default: updated.is_default,
      },
    });

    revalidatePath("/barcode-studio");
    revalidatePath("/audit-log");
    return {
      ok: true,
      data: mapPresetRow(updated),
      message: `Preset "${updated.name}" berhasil diperbarui.`,
    };
  }

  if (isDefault) {
    const { error: clearErr } = await supabase
      .from("barcode_label_presets")
      .update({ is_default: false, updated_by: user.id })
      .eq("is_default", true);

    if (clearErr) {
      return {
        ok: false,
        error: sanitizeSafeError(
          clearErr,
          "Gagal mengatur ulang preset default sebelumnya.",
          "barcode-presets/clearDefaultOnInsert",
        ),
      };
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("barcode_label_presets")
    .insert({
      name,
      description,
      is_default: isDefault,
      config_json: configJson,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return {
      ok: false,
      error: sanitizeSafeError(
        insertErr,
        "Gagal menyimpan preset label baru.",
        "barcode-presets/insert",
      ),
    };
  }

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    actor_name: user.fullName,
    actor_role: user.role,
    action: "CREATE",
    entity_type: "barcode_label_presets",
    entity_id: inserted.id,
    entity_code: inserted.name.slice(0, 60),
    summary: `Menyimpan preset Barcode Studio baru "${inserted.name}"${inserted.is_default ? " (Default)" : ""}`,
    new_data: {
      name: inserted.name,
      description: inserted.description,
      is_default: inserted.is_default,
      config_json: inserted.config_json,
    },
    metadata: {
      template: normalizedConfig.template,
      symbology: normalizedConfig.symbology,
      is_default: inserted.is_default,
    },
  });

  revalidatePath("/barcode-studio");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data: mapPresetRow(inserted),
    message: `Preset "${inserted.name}" berhasil disimpan.`,
  };
}

/**
 * Promotes an existing preset to be the single organization default preset.
 */
export async function setDefaultBarcodePresetAction(
  presetId: string,
): Promise<ActionResult<BarcodePresetRecord>> {
  const user = await requireAction("barcode.print");

  if (!isValidUuid(presetId)) {
    return { ok: false, error: "ID preset tidak valid." };
  }

  const supabase = await createClient();

  const { data: target, error: targetErr } = await supabase
    .from("barcode_label_presets")
    .select("*")
    .eq("id", presetId)
    .maybeSingle();

  if (targetErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        targetErr,
        "Gagal memuat preset label.",
        "barcode-presets/fetchForDefault",
      ),
    };
  }

  if (!target) {
    return { ok: false, error: "Preset label tidak ditemukan." };
  }

  if (target.is_default) {
    return {
      ok: true,
      data: mapPresetRow(target),
      message: `Preset "${target.name}" sudah menjadi default organisasi.`,
    };
  }

  const { error: clearErr } = await supabase
    .from("barcode_label_presets")
    .update({ is_default: false, updated_by: user.id })
    .eq("is_default", true)
    .neq("id", presetId);

  if (clearErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        clearErr,
        "Gagal mengatur ulang preset default sebelumnya.",
        "barcode-presets/clearOldDefault",
      ),
    };
  }

  const { data: updated, error: updateErr } = await supabase
    .from("barcode_label_presets")
    .update({ is_default: true, updated_by: user.id })
    .eq("id", presetId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return {
      ok: false,
      error: sanitizeSafeError(
        updateErr,
        "Gagal menetapkan preset default baru.",
        "barcode-presets/setDefault",
      ),
    };
  }

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    actor_name: user.fullName,
    actor_role: user.role,
    action: "UPDATE",
    entity_type: "barcode_label_presets",
    entity_id: updated.id,
    entity_code: updated.name.slice(0, 60),
    summary: `Menjadikan preset Barcode Studio "${updated.name}" sebagai default organisasi`,
    old_data: { is_default: false },
    new_data: { is_default: true },
    metadata: { is_default: true },
  });

  revalidatePath("/barcode-studio");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data: mapPresetRow(updated),
    message: `Preset "${updated.name}" dijadikan default organisasi.`,
  };
}

/**
 * Deletes a saved Barcode & Label Print Studio preset by ID.
 */
export async function deleteBarcodePresetAction(
  presetId: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAction("barcode.print");

  if (!isValidUuid(presetId)) {
    return { ok: false, error: "ID preset tidak valid." };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("barcode_label_presets")
    .select("id, name, description, is_default")
    .eq("id", presetId)
    .maybeSingle();

  if (fetchErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        fetchErr,
        "Gagal memeriksa preset yang akan dihapus.",
        "barcode-presets/fetchForDelete",
      ),
    };
  }

  if (!existing) {
    return { ok: false, error: "Preset label tidak ditemukan." };
  }

  const { error: deleteErr } = await supabase
    .from("barcode_label_presets")
    .delete()
    .eq("id", presetId);

  if (deleteErr) {
    return {
      ok: false,
      error: sanitizeSafeError(
        deleteErr,
        "Gagal menghapus preset label.",
        "barcode-presets/delete",
      ),
    };
  }

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    actor_name: user.fullName,
    actor_role: user.role,
    action: "DELETE",
    entity_type: "barcode_label_presets",
    entity_id: existing.id,
    entity_code: existing.name.slice(0, 60),
    summary: `Menghapus preset Barcode Studio "${existing.name}"`,
    old_data: {
      name: existing.name,
      description: existing.description,
      is_default: existing.is_default,
    },
    metadata: { was_default: existing.is_default },
  });

  revalidatePath("/barcode-studio");
  revalidatePath("/audit-log");
  return {
    ok: true,
    data: { id: presetId },
    message: `Preset "${existing.name}" berhasil dihapus.`,
  };
}
