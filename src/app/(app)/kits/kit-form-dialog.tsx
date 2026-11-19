"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";

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
import { INVENTORY_LOCATION_OPTIONS, KIT_STATUS_LABELS } from "@/lib/constants";
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

      const res = editingKit
        ? await updateKitAction(editingKit.id, payload)
        : await createKitAction(payload);

      if (!res.ok) {
        setError(res.error);
        return;
      }

      onOpenChange(false);
      onSaved?.(res.data, res.message);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
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
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="kit-name">Nama Paket Kit *</Label>
              <Input
                id="kit-name"
                value={kitName}
                onChange={(e) => setKitName(e.target.value)}
                placeholder="Contoh: Kit Terapi Sensori Pagi R01"
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kit-room">Ruangan Penempatan</Label>
              <Select
                value={assignedRoom}
                onValueChange={setAssignedRoom}
                disabled={isPending}
              >
                <SelectTrigger id="kit-room" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROOM_VALUE}>Umum / Lintas Ruang</SelectItem>
                  {INVENTORY_LOCATION_OPTIONS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="kit-status">Status Kit</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as KitStatus)}
                  disabled={isPending}
                >
                  <SelectTrigger id="kit-status" className="w-full">
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
              <Label htmlFor="kit-desc">Deskripsi Paket</Label>
              <Textarea
                id="kit-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Catatan penggunaan kit atau sesi terapi…"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-medium">
                Pilih Item dalam Kit ({selectedIds.length} dipilih) *
              </Label>
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
                <Input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Cari item…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
              {filteredItems.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-xs">
                  Tidak ada item inventaris yang cocok.
                </p>
              ) : (
                filteredItems.map((item) => {
                  const checked = selectedSet.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className="hover:bg-muted/50 flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleItem(item.id)}
                          disabled={isPending}
                        />
                        <div>
                          <p className="font-medium leading-tight">{item.name}</p>
                          <p className="text-muted-foreground font-mono text-xs">
                            {item.item_code} · {item.room_code}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="font-mono text-[11px]">
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
