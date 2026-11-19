"use server";

import { revalidatePath } from "next/cache";

import { requireAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type RecycleTable =
  | "items_master"
  | "item_kits"
  | "subscriptions_vault"
  | "archives_hybrid"
  | "deliveries_log"
  | "internal_requests";

const ALLOWED_TABLES = new Set<RecycleTable>([
  "items_master",
  "item_kits",
  "subscriptions_vault",
  "archives_hybrid",
  "deliveries_log",
  "internal_requests",
]);

const REVALIDATE_MAP: Record<RecycleTable, string> = {
  items_master: "/inventory",
  item_kits: "/kits",
  subscriptions_vault: "/vault",
  archives_hybrid: "/archives",
  deliveries_log: "/deliveries",
  internal_requests: "/requests",
};

export type RecycleActionResult<T = unknown> =
  | { ok: true; data: T; message: string }
  | { ok: false; error: string };

export async function restoreDeletedRecordAction(input: {
  table: RecycleTable;
  id: string;
}): Promise<RecycleActionResult<{ table: RecycleTable; id: string }>> {
  const user = await requireAction("recycle.restore");

  if (!ALLOWED_TABLES.has(input.table)) {
    return { ok: false, error: "Tabel tidak valid untuk pemulihan." };
  }

  const supabase = await createClient();

  let errorMessage: string | null = null;
  let restored = false;

  switch (input.table) {
    case "items_master": {
      const { data, error } = await supabase
        .from("items_master")
        .update({ deleted_at: null, deleted_by: null, updated_by: user.id })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      restored = Boolean(data);
      break;
    }
    case "item_kits": {
      const { data, error } = await supabase
        .from("item_kits")
        .update({ deleted_at: null, deleted_by: null, updated_by: user.id })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      restored = Boolean(data);
      break;
    }
    case "subscriptions_vault": {
      const { data, error } = await supabase
        .from("subscriptions_vault")
        .update({ deleted_at: null, deleted_by: null, updated_by: user.id })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      restored = Boolean(data);
      break;
    }
    case "archives_hybrid": {
      const { data, error } = await supabase
        .from("archives_hybrid")
        .update({ deleted_at: null, deleted_by: null, updated_by: user.id })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      restored = Boolean(data);
      break;
    }
    case "deliveries_log": {
      const { data, error } = await supabase
        .from("deliveries_log")
        .update({ deleted_at: null, deleted_by: null, updated_by: user.id })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      restored = Boolean(data);
      break;
    }
    case "internal_requests": {
      const { data, error } = await supabase
        .from("internal_requests")
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      restored = Boolean(data);
      break;
    }
  }

  if (errorMessage) {
    return {
      ok: false,
      error: `Gagal memulihkan data: ${errorMessage}`,
    };
  }

  if (!restored) {
    return {
      ok: false,
      error: "Data tidak ditemukan di Recycle Bin atau sudah dipulihkan.",
    };
  }

  revalidatePath("/recycle-bin");
  revalidatePath(REVALIDATE_MAP[input.table]);
  revalidatePath("/audit-log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: { table: input.table, id: input.id },
    message: "Data berhasil dipulihkan dari Recycle Bin.",
  };
}

export async function purgeDeletedRecordAction(input: {
  table: RecycleTable;
  id: string;
}): Promise<RecycleActionResult<{ table: RecycleTable; id: string }>> {
  await requireAction("recycle.purge");

  if (!ALLOWED_TABLES.has(input.table)) {
    return { ok: false, error: "Tabel tidak valid untuk penghapusan permanen." };
  }

  const supabase = await createClient();
  let errorMessage: string | null = null;
  let purged = false;

  switch (input.table) {
    case "items_master": {
      const { data, error } = await supabase
        .from("items_master")
        .delete()
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      purged = Boolean(data);
      break;
    }
    case "item_kits": {
      const { data, error } = await supabase
        .from("item_kits")
        .delete()
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      purged = Boolean(data);
      break;
    }
    case "subscriptions_vault": {
      const { data, error } = await supabase
        .from("subscriptions_vault")
        .delete()
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      purged = Boolean(data);
      break;
    }
    case "archives_hybrid": {
      const { data, error } = await supabase
        .from("archives_hybrid")
        .delete()
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      purged = Boolean(data);
      break;
    }
    case "deliveries_log": {
      const { data, error } = await supabase
        .from("deliveries_log")
        .delete()
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      purged = Boolean(data);
      break;
    }
    case "internal_requests": {
      const { data, error } = await supabase
        .from("internal_requests")
        .delete()
        .eq("id", input.id)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();
      errorMessage = error?.message ?? null;
      purged = Boolean(data);
      break;
    }
  }

  if (errorMessage) {
    return {
      ok: false,
      error: `Gagal menghapus permanen: ${errorMessage}`,
    };
  }

  if (!purged) {
    return {
      ok: false,
      error: "Data tidak ditemukan atau tidak berstatus soft-deleted.",
    };
  }

  revalidatePath("/recycle-bin");
  revalidatePath("/audit-log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: { table: input.table, id: input.id },
    message: "Data berhasil dihapus secara permanen.",
  };
}

export async function purgeExpiredRecycleBinAction(): Promise<
  RecycleActionResult<Json>
> {
  await requireAction("recycle.purge");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("purge_expired_recycle_bin", {
    p_days: 30,
  });

  if (error) {
    return {
      ok: false,
      error: `Gagal membersihkan data kadaluarsa (> 30 hari): ${error.message}`,
    };
  }

  revalidatePath("/recycle-bin");
  revalidatePath("/audit-log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: data ?? {},
    message: "Pembersihan data Recycle Bin (> 30 hari) berhasil dijalankan.",
  };
}
