"use client";

import { useState, useTransition } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { createItemAction, updateItemAction } from "@/lib/actions/inventory";
import {
  ASSET_TYPE_LABELS,
  BARCODE_FORMAT_LABELS,
  CATEGORY_PREFIX_OPTIONS,
  CONDITION_LABELS,
  HYGIENE_LABELS,
  INVENTORY_LOCATION_OPTIONS,
  THERAPY_CATEGORIES,
  calculateBookValue,
  formatRupiah,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type {
  AssetType,
  BarcodeFormat,
  CodeCategoryPrefix,
  HygieneStatus,
  ItemCondition,
  ItemMaster,
  LocationCode,
} from "@/types/database";

const NO_PARENT_VALUE = "__NONE__";
const CUSTOM_CATEGORY_VALUE = "__CUSTOM__";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type ItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem?: ItemMaster | null;
  initialSignedPhotoUrl?: string | null;
  defaultParentId?: string | null;
  parentCandidates: ItemMaster[];
  onSaved?: (saved: ItemMaster, message?: string) => void;
};

export function ItemFormDialog({
  open,
  onOpenChange,
  editingItem = null,
  initialSignedPhotoUrl = null,
  defaultParentId = null,
  parentCandidates,
  onSaved,
}: ItemFormDialogProps) {
  const isEditing = Boolean(editingItem);
  const defaultParent =
    !editingItem && defaultParentId
      ? parentCandidates.find((item) => item.id === defaultParentId) ?? null
      : null;

  const initialCategory = editingItem?.category ?? defaultParent?.category ?? THERAPY_CATEGORIES[0];
  const isPresetCategory = (THERAPY_CATEGORIES as readonly string[]).includes(initialCategory);

  const [parentItemId, setParentItemId] = useState<string>(
    editingItem?.parent_item_id ?? defaultParentId ?? "",
  );
  const [name, setName] = useState(editingItem?.name ?? "");
  const [categoryPrefix, setCategoryPrefix] = useState<CodeCategoryPrefix>(
    editingItem?.category_prefix ?? defaultParent?.category_prefix ?? "SNS",
  );
  const [categorySelect, setCategorySelect] = useState<string>(
    isPresetCategory ? initialCategory : CUSTOM_CATEGORY_VALUE,
  );
  const [customCategory, setCustomCategory] = useState<string>(
    isPresetCategory ? "" : initialCategory,
  );
  const [assetType, setAssetType] = useState<AssetType>(
    editingItem?.asset_type ?? defaultParent?.asset_type ?? "THERAPY_TOY",
  );
  const [roomCode, setRoomCode] = useState<LocationCode>(
    editingItem?.room_code ?? defaultParent?.room_code ?? "R01",
  );
  const [rackLocation, setRackLocation] = useState(editingItem?.rack_location ?? "");
  const [picName, setPicName] = useState(editingItem?.pic_name ?? "");
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>(
    editingItem?.barcode_format ?? "CODE128",
  );
  const [totalParts, setTotalParts] = useState(String(editingItem?.total_parts ?? 1));
  const [currentParts, setCurrentParts] = useState(String(editingItem?.current_parts ?? 1));
  const [unitLabel, setUnitLabel] = useState(editingItem?.unit_label ?? "Pcs");
  const [stockQty, setStockQty] = useState(String(editingItem?.stock_qty ?? 1));
  const [minStockThreshold, setMinStockThreshold] = useState(
    String(editingItem?.min_stock_threshold ?? 0),
  );
  const [condition, setCondition] = useState<ItemCondition>(editingItem?.condition ?? "BAIK");
  const [hygieneStatus, setHygieneStatus] = useState<HygieneStatus>(
    editingItem?.hygiene_status ?? "STERIL",
  );
  const [acquisitionDate, setAcquisitionDate] = useState(
    editingItem?.acquisition_date ?? "",
  );
  const [purchasePrice, setPurchasePrice] = useState(
    String(editingItem?.purchase_price ?? 0),
  );
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(
    editingItem?.useful_life_months ? String(editingItem.useful_life_months) : "",
  );
  const [residualValue, setResidualValue] = useState(
    String(editingItem?.residual_value ?? 0),
  );
  const [description, setDescription] = useState(editingItem?.description ?? "");

  const [photoPath, setPhotoPath] = useState<string | null>(editingItem?.photo_url ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialSignedPhotoUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableParents = parentCandidates.filter((candidate) => {
    if (!editingItem) return true;
    return candidate.id !== editingItem.id && candidate.parent_item_id !== editingItem.id;
  });

  const handleParentChange = (value: string) => {
    const nextParentId = value === NO_PARENT_VALUE ? "" : value;
    setParentItemId(nextParentId);
    if (!isEditing && nextParentId) {
      const parent = availableParents.find((p) => p.id === nextParentId);
      if (parent) {
        setCategoryPrefix(parent.category_prefix);
        setRoomCode(parent.room_code);
        setAssetType(parent.asset_type);
        if ((THERAPY_CATEGORIES as readonly string[]).includes(parent.category)) {
          setCategorySelect(parent.category);
          setCustomCategory("");
        } else {
          setCategorySelect(CUSTOM_CATEGORY_VALUE);
          setCustomCategory(parent.category);
        }
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Ukuran foto maksimal 5 MB.");
      return;
    }
    setError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setPhotoPath(null);
    setPreviewUrl(null);
  };

  const parsedPrice = Math.max(0, Number(purchasePrice) || 0);
  const parsedLife = Number(usefulLifeMonths) > 0 ? Math.trunc(Number(usefulLifeMonths)) : null;
  const parsedResidual = Math.max(0, Number(residualValue) || 0);
  const liveBookValue = calculateBookValue(
    parsedPrice,
    acquisitionDate || null,
    parsedLife,
    parsedResidual,
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const resolvedCategory =
      categorySelect === CUSTOM_CATEGORY_VALUE ? customCategory.trim() : categorySelect;

    if (!name.trim()) {
      setError("Nama item wajib diisi.");
      return;
    }
    if (!resolvedCategory) {
      setError("Kategori item wajib diisi.");
      return;
    }

    const totalPartsNum = Math.max(1, Math.trunc(Number(totalParts) || 1));
    const currentPartsNum = Math.min(
      totalPartsNum,
      Math.max(0, Math.trunc(Number(currentParts) || 0)),
    );

    startTransition(async () => {
      let nextPhotoPath = photoPath;

      if (selectedFile) {
        const supabase = createClient();
        const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const uploadPath = `items/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("inventory-photos")
          .upload(uploadPath, selectedFile, {
            contentType: selectedFile.type,
            upsert: true,
          });

        if (uploadError) {
          setError(`Gagal mengunggah foto ke bucket inventory-photos: ${uploadError.message}`);
          return;
        }
        nextPhotoPath = uploadPath;
      }

      const payload = {
        parent_item_id: parentItemId || null,
        barcode_format: barcodeFormat,
        name: name.trim(),
        description: description.trim() || null,
        category_prefix: categoryPrefix,
        category: resolvedCategory,
        asset_type: assetType,
        room_code: roomCode,
        rack_location: rackLocation.trim() || null,
        pic_name: picName.trim() || null,
        photo_url: nextPhotoPath,
        acquisition_date: acquisitionDate || null,
        purchase_price: parsedPrice,
        useful_life_months: parsedLife,
        residual_value: parsedResidual,
        total_parts: totalPartsNum,
        current_parts: currentPartsNum,
        unit_label: unitLabel.trim() || "Pcs",
        stock_qty: Math.max(0, Math.trunc(Number(stockQty) || 0)),
        min_stock_threshold: Math.max(0, Math.trunc(Number(minStockThreshold) || 0)),
        condition,
        hygiene_status: hygieneStatus,
      };

      const res = editingItem
        ? await updateItemAction(editingItem.id, payload)
        : await createItemAction(payload);

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
            {isEditing ? `Edit Item (${editingItem?.item_code})` : "Tambah Item Inventaris"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Perbarui informasi master inventaris. Kode unik item bersifat permanen."
              : "Kode item unik (SC-[KATEGORI]-[LOKASI]-XXXX atau sub-kode induk) akan dibuat otomatis."}
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
              <Label htmlFor="item-parent">Induk Item (Opsional — untuk Sub-Kode Anak)</Label>
              <Select
                value={parentItemId || NO_PARENT_VALUE}
                onValueChange={handleParentChange}
                disabled={isPending}
              >
                <SelectTrigger id="item-parent" className="w-full">
                  <SelectValue placeholder="Pilih item induk (jika sub-item)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT_VALUE}>
                    Tanpa Induk (Buat Kode Utama Baru)
                  </SelectItem>
                  {availableParents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.item_code} — {parent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parentItemId && (
                <p className="text-muted-foreground text-xs">
                  Item ini akan menjadi bagian/sub-komponen dengan akhiran otomatis (-A, -B, dst).
                </p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="item-name">Nama Barang / Mainan *</Label>
              <Input
                id="item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Balance Beam Kayu 6 Bagian"
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-prefix">Prefix Kode *</Label>
              <Select
                value={categoryPrefix}
                onValueChange={(v) => setCategoryPrefix(v as CodeCategoryPrefix)}
                disabled={isPending}
              >
                <SelectTrigger id="item-prefix" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_PREFIX_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-category">Kategori *</Label>
              <Select
                value={categorySelect}
                onValueChange={setCategorySelect}
                disabled={isPending}
              >
                <SelectTrigger id="item-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THERAPY_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_CATEGORY_VALUE}>Kategori Lainnya…</SelectItem>
                </SelectContent>
              </Select>
              {categorySelect === CUSTOM_CATEGORY_VALUE && (
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Tulis nama kategori"
                  className="mt-1.5"
                  required
                  disabled={isPending}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-asset-type">Tipe Aset *</Label>
              <Select
                value={assetType}
                onValueChange={(v) => setAssetType(v as AssetType)}
                disabled={isPending}
              >
                <SelectTrigger id="item-asset-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {ASSET_TYPE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-room">Lokasi Ruangan *</Label>
              <Select
                value={roomCode}
                onValueChange={(v) => setRoomCode(v as LocationCode)}
                disabled={isPending}
              >
                <SelectTrigger id="item-room" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_LOCATION_OPTIONS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-rack">Rak / Laci / Lemari</Label>
              <Input
                id="item-rack"
                value={rackLocation}
                onChange={(e) => setRackLocation(e.target.value)}
                placeholder="Contoh: Rak B2"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-pic">PIC / Penanggung Jawab</Label>
              <Input
                id="item-pic"
                value={picName}
                onChange={(e) => setPicName(e.target.value)}
                placeholder="Nama PIC ruangan"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-barcode">Format Barcode Label</Label>
              <Select
                value={barcodeFormat}
                onValueChange={(v) => setBarcodeFormat(v as BarcodeFormat)}
                disabled={isPending}
              >
                <SelectTrigger id="item-barcode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BARCODE_FORMAT_LABELS) as BarcodeFormat[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {BARCODE_FORMAT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-unit">Satuan (Unit Label)</Label>
              <Input
                id="item-unit"
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
                placeholder="Pcs / Keping / Set / Box"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-total-parts">Total Part / Kepingan</Label>
              <Input
                id="item-total-parts"
                type="number"
                min={1}
                value={totalParts}
                onChange={(e) => {
                  const val = e.target.value;
                  setTotalParts(val);
                  if (!isEditing) {
                    setCurrentParts(val);
                  }
                }}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-current-parts">Part Tersedia Saat Ini</Label>
              <Input
                id="item-current-parts"
                type="number"
                min={0}
                max={Math.max(1, Number(totalParts) || 1)}
                value={currentParts}
                onChange={(e) => setCurrentParts(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-stock">Jumlah Stok</Label>
              <Input
                id="item-stock"
                type="number"
                min={0}
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-min-stock">Batas Minimum Stok (Alert Low-Stock)</Label>
              <Input
                id="item-min-stock"
                type="number"
                min={0}
                value={minStockThreshold}
                onChange={(e) => setMinStockThreshold(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-condition">Kondisi</Label>
              <Select
                value={condition}
                onValueChange={(v) => setCondition(v as ItemCondition)}
                disabled={isPending}
              >
                <SelectTrigger id="item-condition" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {CONDITION_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-hygiene">Status Sanitasi / Kebersihan</Label>
              <Select
                value={hygieneStatus}
                onValueChange={(v) => setHygieneStatus(v as HygieneStatus)}
                disabled={isPending}
              >
                <SelectTrigger id="item-hygiene" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(HYGIENE_LABELS) as HygieneStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {HYGIENE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Nilai Perolehan & Penyusutan Aset</span>
              {parsedPrice > 0 && (
                <span className="text-muted-foreground text-xs">
                  Estimasi Nilai Buku: <strong className="text-foreground">{formatRupiah(liveBookValue)}</strong>
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="item-acq-date" className="text-xs">
                  Tanggal Beli
                </Label>
                <Input
                  id="item-acq-date"
                  type="date"
                  value={acquisitionDate}
                  onChange={(e) => setAcquisitionDate(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-price" className="text-xs">
                  Harga Beli (Rp)
                </Label>
                <Input
                  id="item-price"
                  type="number"
                  min={0}
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-life" className="text-xs">
                  Umur Manfaat (Bulan)
                </Label>
                <Input
                  id="item-life"
                  type="number"
                  min={1}
                  placeholder="Contoh: 36"
                  value={usefulLifeMonths}
                  onChange={(e) => setUsefulLifeMonths(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-residual" className="text-xs">
                  Nilai Residu (Rp)
                </Label>
                <Input
                  id="item-residual"
                  type="number"
                  min={0}
                  value={residualValue}
                  onChange={(e) => setResidualValue(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <Label htmlFor="item-photo-input" className="text-sm font-medium">
              Foto Barang (Bucket Privat inventory-photos)
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              {previewUrl ? (
                <div className="relative size-20 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Pratinjau item"
                    className="size-full object-cover"
                  />
                </div>
              ) : (
                <div className="bg-muted text-muted-foreground flex size-20 items-center justify-center rounded-md border text-xs">
                  Tanpa Foto
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label
                    htmlFor="item-photo-input"
                    className="bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium"
                  >
                    <ImagePlus className="size-3.5" />
                    {previewUrl ? "Ganti Foto" : "Unggah Foto"}
                  </Label>
                  <input
                    id="item-photo-input"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleFileChange}
                    disabled={isPending}
                  />
                  {previewUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePhoto}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5" />
                      Hapus Foto
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  Format JPG/PNG/WEBP, maksimal 5 MB. Disimpan aman dengan Signed URL.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-desc">Catatan / Deskripsi</Label>
            <Textarea
              id="item-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail spesifikasi, cara perawatan, atau catatan lainnya…"
              disabled={isPending}
            />
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
              {isEditing ? "Simpan Perubahan" : "Simpan Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
