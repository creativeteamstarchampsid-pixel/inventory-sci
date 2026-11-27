"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { useLocations } from "@/components/providers/locations-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { createKitAction, updateKitAction } from "@/lib/actions/kits";
import { KIT_STATUS_LABELS } from "@/lib/constants";
import type { ItemKit, ItemMaster, KitStatus, LocationCode } from "@/types/database";

const NO_ROOM_VALUE = "__GENERAL__";

type KitFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingKit?: ItemKit | null;
  availableItems: ItemMaster[];
  onSaved?: (kit: ItemKit, message?: string) => void;
};

export function KitFormDialog({
  open,
  onOpenChange,
  editingKit = null,
  availableItems,
  onSaved,
}: KitFormDialogProps) {
  const { runWithFeedback } = useCartoonFeedback();
  const { inventoryOptions, getOptionWithCurrent } = useLocations();
  const isEditing = Boolean(editingKit);

  const [kitName, setKitName] = useState(editingKit?.kit_name ?? "");
  const [description, setDescription] = useState(editingKit?.description ?? "");
  const [assignedRoom, setAssignedRoom] = useState<string>(
    editingKit?.assigned_room ?? NO_ROOM_VALUE,
  );
  const [status, setStatus] = useState<KitStatus>(editingKit?.status ?? "TERSEDIA");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    editingKit?.bundled_item_ids ?? [],
  );
  const [itemSearch, setItemSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const list = availableItems.filter((item) => {
      if (!q) return true;
      return (
        item.item_code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.room_code.toLowerCase().includes(q)
      );
    });
    // Sort selected items to the top for convenience
    return [...list].sort((a, b) => {
      const aSel = selectedSet.has(a.id) ? 0 : 1;
      const bSel = selectedSet.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.item_code.localeCompare(b.item_code);
    });
  }, [availableItems, itemSearch, selectedSet]);

  const toggleItem = (itemId: string) => {
    setSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!kitName.trim()) {
      setError("Nama kit wajib diisi.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Pilih minimal satu item inventaris untuk dimasukkan ke dalam kit.");
      return;
    }

    const roomValue: LocationCode | null =
      assignedRoom === NO_ROOM_VALUE ? null : (assignedRoom as LocationCode);

    startTransition(async () => {
      const payload = {
        kit_name: kitName.trim(),
        description: description.trim() || null,
        bundled_item_ids: selectedIds,
        assigned_room: roomValue,
        ...(isEditing ? { status } : {}),
      };

      try {
        const res = await runWithFeedback(
          {
            mode: "working",
            workingTitle: isEditing ? "Menyimpan Perubahan Kit..." : "Merangkai Paket Kit Baru...",
            workingMessage: isEditing
              ? `Dino Joguman lagi memperbarui komposisi ${editingKit?.kit_code ?? "kit"} (${selectedIds.length} item) nih~`
              : `Dino Joguman lagi membungkus ${selectedIds.length} item jadi paket kit terapi baru~`,
            successTitle: isEditing ? "Paket Kit Diperbarui! ✨" : "Kit Baru Siap Dipakai! 🎉",
            successMessage: (result) =>
              result.ok
                ? result.message ??
                  (isEditing ? "Data kit berhasil diperbarui!" : "Kit baru berhasil dibuat!")
                : "",
            errorTitle: isEditing ? "Gagal Memperbarui Kit..." : "Gagal Membuat Kit...",
            isResultError: (result) => (!result.ok ? result.error : null),
          },
          () => (editingKit ? updateKitAction(editingKit.id, payload) : createKitAction(payload)),
        );

        if (!res.ok) {
          setError(res.error);
          return;
        }

        onOpenChange(false);
        onSaved?.(res.data, res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan kit.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-[1.5px] border-[#2C2623] bg-[#EDE9FE] px-2.5 py-0.5 text-[11px] font-extrabold text-[#4C1D95] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-stone-400 dark:bg-violet-950/70 dark:text-violet-200"
            >
              <Sparkles className="size-3" />
              {isEditing ? editingKit?.kit_code : "Paket Kit Baru"}
            </Badge>
          </div>
          <DialogTitle className="text-xl font-extrabold">
            {isEditing ? `Edit Kit (${editingKit?.kit_code})` : "Buat Kit Baru"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Perbarui daftar barang dalam paket kit atau lokasi ruangan."
              : "Gabungkan beberapa alat/mainan menjadi satu paket kit (kode KIT-[RUANG]-XX dibuat otomatis)."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#881337] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-100"
            >
              <AlertDescription className="font-semibold">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="kit-name" className="font-bold">
                Nama Paket Kit *
              </Label>
              <Input
                id="kit-name"
                value={kitName}
                onChange={(e) => setKitName(e.target.value)}
                placeholder="Contoh: Kit Terapi Sensori Pagi R01"
                required
                disabled={isPending}
                className="bg-white dark:bg-stone-900"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kit-room" className="font-bold">
                Ruangan Penempatan
              </Label>
              <Select
                value={assignedRoom}
                onValueChange={setAssignedRoom}
                disabled={isPending}
              >
                <SelectTrigger id="kit-room" className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROOM_VALUE}>Umum / Lintas Ruang</SelectItem>
                  {getOptionWithCurrent(
                    inventoryOptions,
                    assignedRoom === NO_ROOM_VALUE ? null : assignedRoom,
                  ).map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="kit-status" className="font-bold">
                  Status Kit
                </Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as KitStatus)}
                  disabled={isPending}
                >
                  <SelectTrigger id="kit-status" className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIT_STATUS_LABELS) as KitStatus[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {KIT_STATUS_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="kit-desc" className="font-bold">
                Deskripsi Paket
              </Label>
              <Textarea
                id="kit-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Catatan penggunaan kit atau sesi terapi…"
                disabled={isPending}
                className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
              />
            </div>
          </div>

          <div className="space-y-2.5 rounded-2xl border-2 border-[#2C2623] bg-[#EDE9FE]/40 p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-violet-950/25">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-extrabold">
                Pilih Item dalam Kit ({selectedIds.length} dipilih) *
              </Label>
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
                <Input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Cari item…"
                  className="h-8 bg-white pl-8 text-xs dark:bg-stone-900"
                />
              </div>
            </div>

            <div className="max-h-56 divide-y divide-[#2C2623]/10 overflow-y-auto rounded-xl border-2 border-[#2C2623]/25 bg-white dark:divide-stone-800 dark:border-stone-600 dark:bg-stone-900">
              {filteredItems.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-xs font-medium">
                  Tidak ada item inventaris yang cocok.
                </p>
              ) : (
                filteredItems.map((item) => {
                  const checked = selectedSet.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${
                        checked
                          ? "bg-[#D1FAE5]/55 dark:bg-emerald-950/35"
                          : "hover:bg-[#FEF3C7]/35 dark:hover:bg-stone-800/50"
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleItem(item.id)}
                          disabled={isPending}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold leading-tight">{item.name}</p>
                          <p className="text-muted-foreground truncate font-mono text-xs">
                            {item.item_code} · {item.room_code}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="rounded-full border-[1.5px] border-[#2C2623] bg-[#FFFDF7] font-mono text-[11px] font-bold dark:border-stone-400 dark:bg-stone-900"
                        >
                          {item.current_parts}/{item.total_parts} {item.unit_label}
                        </Badge>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Simpan Perubahan" : "Simpan Kit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
