"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, PackagePlus, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import { useLocations } from "@/components/providers/locations-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  createDeliveryAction,
  createDeliveryProofUploadUrlAction,
  removeDeliveryProofPhotoAction,
  saveDeliveryProofPhotoAction,
  updateDeliveryAction,
  type DeliveryPayloadItem,
} from "@/lib/actions/deliveries";
import {
  ASSET_TYPE_LABELS,
  CATEGORY_PREFIX_OPTIONS,
  CONDITION_LABELS,
  DELIVERY_DIRECTION_LABELS,
  DELIVERY_STATUS_LABELS,
  THERAPY_CATEGORIES,
} from "@/lib/constants";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  formatBytes,
  prepareSecureImageUpload,
  sanitizeStorageFilename,
} from "@/lib/upload-security";
import type {
  AssetType,
  CodeCategoryPrefix,
  DeliveryDirection,
  DeliveryLog,
  DeliveryStatus,
  ItemCondition,
  LocationCode,
} from "@/types/database";
import {
  COURIER_PRESETS,
  PACKAGE_TYPE_PRESETS,
  UNIT_LABEL_PRESETS,
  createEmptyPayloadItem,
  parseDeliveryPayloadItems,
  type InventoryPickerItem,
} from "./helpers";

type DeliveryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDelivery: DeliveryLog | null;
  initialDirection: DeliveryDirection;
  existingProofUrl: string | null;
  inventoryItems: InventoryPickerItem[];
  onSaved: (
    delivery: DeliveryLog,
    updatedProofSignedUrl?: string | null,
  ) => void;
};

export function DeliveryFormDialog({
  open,
  onOpenChange,
  editingDelivery,
  initialDirection,
  existingProofUrl,
  inventoryItems,
  onSaved,
}: DeliveryFormDialogProps) {
  const isEditing = Boolean(editingDelivery);
  const { showWorking, showSuccess, showError } = useCartoonFeedback();
  const { inventoryOptions, getOptionWithCurrent } = useLocations();

  const [direction, setDirection] =
    useState<DeliveryDirection>(initialDirection);
  const [packageType, setPackageType] = useState<string>(
    PACKAGE_TYPE_PRESETS[0],
  );
  const [courierName, setCourierName] = useState<string>("Kurir Internal");
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [shippingCost, setShippingCost] = useState<string>("0");
  const [senderName, setSenderName] = useState<string>("");
  const [senderAddress, setSenderAddress] = useState<string>("");
  const [receiverName, setReceiverName] = useState<string>("");
  const [receiverAddress, setReceiverAddress] = useState<string>("");
  const [picName, setPicName] = useState<string>("");
  const [isFragile, setIsFragile] = useState<boolean>(true);
  const [status, setStatus] = useState<DeliveryStatus>("DRAFT");
  const [notes, setNotes] = useState<string>("");
  const [payloadItems, setPayloadItems] = useState<DeliveryPayloadItem[]>([
    createEmptyPayloadItem(1),
  ]);

  const [pickerItemId, setPickerItemId] = useState<string>("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [isScanningProof, setIsScanningProof] = useState<boolean>(false);
  const [proofSecurityNote, setProofSecurityNote] = useState<string | null>(null);
  const [removeExistingProof, setRemoveExistingProof] =
    useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setProofFile(null);
    setProofSecurityNote(null);
    setRemoveExistingProof(false);
    setPickerItemId("");

    if (editingDelivery) {
      setDirection(editingDelivery.direction);
      setPackageType(editingDelivery.package_type);
      setCourierName(editingDelivery.courier_name);
      setTrackingNumber(editingDelivery.tracking_number ?? "");
      setShippingCost(String(editingDelivery.shipping_cost ?? 0));
      setSenderName(editingDelivery.sender_name);
      setSenderAddress(editingDelivery.sender_address ?? "");
      setReceiverName(editingDelivery.receiver_name);
      setReceiverAddress(editingDelivery.receiver_address ?? "");
      setPicName(editingDelivery.pic_name ?? "");
      setIsFragile(editingDelivery.is_fragile);
      setStatus(editingDelivery.status);
      setNotes(editingDelivery.notes ?? "");
      const parsed = parseDeliveryPayloadItems(
        editingDelivery.items_payload_json,
      );
      setPayloadItems(parsed.length > 0 ? parsed : [createEmptyPayloadItem(1)]);
      setProofPreviewUrl(existingProofUrl);
    } else {
      setDirection(initialDirection);
      setPackageType(
        initialDirection === "INBOUND"
          ? "Paket Barang Masuk / Pembelian"
          : "Pengiriman Keluar / Cabang",
      );
      setCourierName("Kurir Internal");
      setTrackingNumber("");
      setShippingCost("0");
      setSenderName(
        initialDirection === "OUTBOUND" ? "Star Champs Indonesia" : "",
      );
      setSenderAddress("");
      setReceiverName(
        initialDirection === "INBOUND" ? "Star Champs Indonesia" : "",
      );
      setReceiverAddress("");
      setPicName("");
      setIsFragile(true);
      setStatus(initialDirection === "INBOUND" ? "DITERIMA" : "DRAFT");
      setNotes("");
      setPayloadItems([createEmptyPayloadItem(1)]);
      setProofPreviewUrl(null);
    }
  }, [open, editingDelivery, initialDirection, existingProofUrl]);

  useEffect(() => {
    return () => {
      if (proofPreviewUrl && proofPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [proofPreviewUrl]);

  async function handleProofFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const inputEl = event.target;
    const file = inputEl.files?.[0] ?? null;
    if (!file) return;

    setErrorMsg(null);
    setIsScanningProof(true);
    try {
      const prepared = await prepareSecureImageUpload(file);
      if (!prepared.ok) {
        inputEl.value = "";
        setErrorMsg(prepared.error);
        showError({
          title: "Foto Bukti Ditolak 🛡️",
          message: prepared.error,
        });
        return;
      }

      setProofFile(prepared.file);
      setRemoveExistingProof(false);
      const localUrl = URL.createObjectURL(prepared.file);
      setProofPreviewUrl(localUrl);
      const note =
        prepared.compressedBytes < prepared.originalBytes
          ? `Lolos scan keamanan · Dikompresi ${formatBytes(prepared.originalBytes)} → ${formatBytes(prepared.compressedBytes)} (EXIF dibersihkan)`
          : `Lolos scan keamanan · ${formatBytes(prepared.compressedBytes)} (EXIF dibersihkan)`;
      setProofSecurityNote(note);
    } finally {
      setIsScanningProof(false);
    }
  }

  function updatePayloadItem(
    idx: number,
    patch: Partial<DeliveryPayloadItem>,
  ) {
    setPayloadItems((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  }

  function addManualPayloadRow() {
    setPayloadItems((prev) => [
      ...prev,
      createEmptyPayloadItem(prev.length + 1),
    ]);
  }

  function addInventoryItemToPayload(itemId: string) {
    const found = inventoryItems.find((i) => i.id === itemId);
    if (!found) return;
    setPayloadItems((prev) => {
      const nextItem: DeliveryPayloadItem = {
        ...createEmptyPayloadItem(prev.length + 1),
        name: found.name,
        item_code: found.item_code,
        existing_item_id: found.id,
        qty: 1,
        unit_label: found.unit_label || "Pcs",
        condition: found.condition,
        category_prefix: found.category_prefix,
        category: found.category,
        asset_type: found.asset_type,
        room_code: found.room_code,
      };
      if (prev.length === 1 && !prev[0].name.trim()) {
        return [nextItem];
      }
      return [...prev, nextItem];
    });
    setPickerItemId("");
  }

  function removePayloadRow(idx: number) {
    setPayloadItems((prev) =>
      prev.length <= 1
        ? [createEmptyPayloadItem(1)]
        : prev.filter((_, i) => i !== idx),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const validItems = payloadItems.filter(
        (it) => it.name.trim().length > 0,
      );
      if (validItems.length === 0) {
        setErrorMsg("Tambahkan minimal 1 barang pada daftar isi paket.");
        setSubmitting(false);
        return;
      }

      showWorking({
        title: isEditing
          ? "Menyimpan Perubahan Paket..."
          : "Mencatat Pengiriman Baru...",
        message: proofFile
          ? "Dino Joguman lagi nyimpen data pengiriman sekaligus mengunggah foto bukti ke brankas aman~"
          : isEditing
            ? `Sedang merapikan perubahan log ${editingDelivery?.delivery_code ?? "pengiriman"} nih~`
            : "Dino Joguman lagi ngebut nyatet data pengiriman & menyiapkan kode resi internal baru!",
      });

      const payload = {
        direction,
        package_type: packageType.trim(),
        courier_name: courierName.trim(),
        tracking_number: trackingNumber.trim() || null,
        shipping_cost: Number(shippingCost) || 0,
        sender_name: senderName.trim(),
        sender_address: senderAddress.trim() || null,
        receiver_name: receiverName.trim(),
        receiver_address: receiverAddress.trim() || null,
        pic_name: picName.trim() || null,
        is_fragile: isFragile,
        items_payload_json: validItems,
        status,
        notes: notes.trim() || null,
      };

      const res =
        isEditing && editingDelivery
          ? await updateDeliveryAction(editingDelivery.id, payload)
          : await createDeliveryAction(payload);

      if (!res.ok) {
        setErrorMsg(res.error);
        showError({
          title: "Yah, Gagal Menyimpan Pengiriman...",
          message: res.error,
        });
        setSubmitting(false);
        return;
      }

      let savedDelivery = res.data.delivery;
      let latestProofUrl: string | null | undefined = undefined;

      if (removeExistingProof && !proofFile && savedDelivery.proof_photo_url) {
        const rmRes = await removeDeliveryProofPhotoAction(savedDelivery.id);
        if (!rmRes.ok) {
          const msg = `Data tersimpan, tetapi gagal menghapus bukti foto: ${rmRes.error}`;
          setErrorMsg(msg);
          showError({
            title: "Foto Bukti Gagal Dihapus...",
            message: msg,
          });
          setSubmitting(false);
          return;
        }
        savedDelivery = { ...savedDelivery, proof_photo_url: null };
        latestProofUrl = null;
      }

      if (proofFile) {
        const safeProofName = sanitizeStorageFilename(proofFile.name, "proof");
        const safeProofMime = proofFile.type || "image/webp";
        const signRes = await createDeliveryProofUploadUrlAction(
          savedDelivery.id,
          safeProofName,
          safeProofMime,
        );
        if (!signRes.ok) {
          const msg = `Data pengiriman tersimpan (${savedDelivery.delivery_code}), tetapi gagal mengunggah bukti foto: ${signRes.error}`;
          setErrorMsg(msg);
          showError({
            title: "Unggahan Foto Bukti Gagal...",
            message: msg,
          });
          onSaved(savedDelivery);
          setSubmitting(false);
          return;
        }

        const browserSupabase = createBrowserClient();
        const { error: uploadErr } = await browserSupabase.storage
          .from("delivery-proofs")
          .uploadToSignedUrl(signRes.data.path, signRes.data.token, proofFile, {
            contentType: safeProofMime,
          });

        if (uploadErr) {
          const msg = `Data tersimpan (${savedDelivery.delivery_code}), tetapi unggahan foto gagal: ${uploadErr.message}`;
          setErrorMsg(msg);
          showError({
            title: "Unggahan Foto Bukti Gagal...",
            message: msg,
          });
          onSaved(savedDelivery);
          setSubmitting(false);
          return;
        }

        const savePhotoRes = await saveDeliveryProofPhotoAction(
          savedDelivery.id,
          signRes.data.path,
        );
        if (!savePhotoRes.ok) {
          const msg = `Foto terunggah, tetapi gagal menautkan path foto: ${savePhotoRes.error}`;
          setErrorMsg(msg);
          showError({
            title: "Gagal Menautkan Foto Bukti...",
            message: msg,
          });
          onSaved(savedDelivery);
          setSubmitting(false);
          return;
        }

        savedDelivery = {
          ...savedDelivery,
          proof_photo_url: savePhotoRes.data.proofPhotoPath,
        };
        latestProofUrl = savePhotoRes.data.signedUrl;
      }

      onSaved(savedDelivery, latestProofUrl);
      onOpenChange(false);
      showSuccess({
        title: isEditing ? "Perubahan Tersimpan! ♪" : "Pengiriman Tercatat! ♪",
        message: isEditing
          ? `Catatan pengiriman ${savedDelivery.delivery_code} berhasil diperbarui dengan rapi!`
          : `Pengiriman baru ${savedDelivery.delivery_code} siap dilacak dan dicetak dokumennya!`,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menyimpan pengiriman.";
      setErrorMsg(msg);
      showError({
        title: "Yah, Terjadi Kesalahan...",
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-extrabold">
            {isEditing
              ? `Ubah Pengiriman (${editingDelivery?.delivery_code})`
              : "Buat Catatan Pengiriman / BAST Baru"}
          </DialogTitle>
          <DialogDescription>
            Catat paket masuk (Inbound), pengiriman keluar (Outbound), atau
            serah terima aset/kunci (BAST). Paket Inbound dapat dikonversi
            1-klik menjadi stok inventaris.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMsg && (
            <Alert
              variant="destructive"
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] dark:border-rose-400/50 dark:bg-rose-950/40"
            >
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {/* Basic Logistics Metadata */}
          <div className="grid gap-4 rounded-2xl border-2 border-[#2C2623]/60 bg-[#FFF8EE]/80 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-stone-600 dark:bg-muted/20">
            <div className="space-y-1.5">
              <Label className="font-bold">Arah Pengiriman</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as DeliveryDirection)}
                disabled={isEditing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">
                    {DELIVERY_DIRECTION_LABELS.INBOUND}
                  </SelectItem>
                  <SelectItem value="OUTBOUND">
                    {DELIVERY_DIRECTION_LABELS.OUTBOUND}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold">Jenis Paket / Dokumen</Label>
              <Select value={packageType} onValueChange={setPackageType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_TYPE_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {preset}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold">Status Pengiriman</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as DeliveryStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[]).map(
                    (st) => (
                      <SelectItem key={st} value={st}>
                        {DELIVERY_STATUS_LABELS[st]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="courier_name" className="font-bold">
                Kurir / Ekspedisi
              </Label>
              <Input
                id="courier_name"
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                placeholder="JNE, J&T, Kurir Internal..."
                required
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {COURIER_PRESETS.slice(0, 5).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCourierName(preset)}
                    className="rounded-full border border-[#2C2623]/40 bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold text-[#2C2623] transition-colors hover:bg-[#FDE68A] dark:border-stone-600 dark:bg-muted dark:text-foreground"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tracking_number" className="font-bold">
                Nomor Resi (Opsional)
              </Label>
              <Input
                id="tracking_number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Contoh: JP1234567890"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shipping_cost" className="font-bold">
                Biaya Kirim (Rp)
              </Label>
              <Input
                id="shipping_cost"
                type="number"
                min={0}
                step={500}
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
              />
            </div>
          </div>

          {/* Sender / Receiver / PIC */}
          <div className="grid gap-4 rounded-2xl border-2 border-[#2C2623]/60 bg-[#F0F9FF]/75 p-4 sm:grid-cols-2 dark:border-stone-600 dark:bg-sky-950/15">
            <div className="space-y-2.5">
              <p className="text-muted-foreground text-xs font-extrabold tracking-wide uppercase">
                Pengirim / Pihak Pertama
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="sender_name" className="font-semibold">
                  Nama Pengirim
                </Label>
                <Input
                  id="sender_name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Nama vendor / toko / staf menyerahkan"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sender_address" className="font-semibold">
                  Alamat / Unit Asal
                </Label>
                <Input
                  id="sender_address"
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                  placeholder="Alamat pengirim atau unit kerja"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-muted-foreground text-xs font-extrabold tracking-wide uppercase">
                Penerima / Pihak Kedua
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="receiver_name" className="font-semibold">
                  Nama Penerima
                </Label>
                <Input
                  id="receiver_name"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  placeholder="Star Champs Indonesia / nama penerima"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receiver_address" className="font-semibold">
                  Alamat / Ruang Tujuan
                </Label>
                <Input
                  id="receiver_address"
                  value={receiverAddress}
                  onChange={(e) => setReceiverAddress(e.target.value)}
                  placeholder="Alamat tujuan atau ruang"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pic_name" className="font-semibold">
                PIC / Penanggung Jawab
              </Label>
              <Input
                id="pic_name"
                value={picName}
                onChange={(e) => setPicName(e.target.value)}
                placeholder="Nama staf PIC penerima/pengirim"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border-2 border-[#2C2623]/70 bg-[#FFE4E6]/75 px-3 py-2 text-sm font-medium text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-rose-400/50 dark:bg-rose-950/35 dark:text-rose-100">
                <Checkbox
                  checked={isFragile}
                  onCheckedChange={(checked) => setIsFragile(checked === true)}
                />
                <span>
                  Tandai <strong>Fragile / Alat Terapi</strong> pada label
                  pengiriman
                </span>
              </label>
            </div>
          </div>

          {/* Item Payload Builder */}
          <div className="space-y-3 rounded-2xl border-2 border-[#2C2623]/60 bg-[#ECFDF5]/65 p-4 dark:border-stone-600 dark:bg-emerald-950/15">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold">
                  Daftar Barang dalam Paket (Payload)
                </h3>
                <p className="text-muted-foreground text-xs">
                  Digunakan untuk Surat Jalan, BAST, dan{" "}
                  {direction === "INBOUND"
                    ? "Konversi 1-Klik ke Master Inventaris."
                    : "pelacakan item keluar."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {inventoryItems.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={pickerItemId}
                      onValueChange={(val) => addInventoryItemToPayload(val)}
                    >
                      <SelectTrigger size="sm" className="w-[210px]">
                        <SelectValue placeholder="Ambil dari Inventaris..." />
                      </SelectTrigger>
                      <SelectContent>
                        {inventoryItems.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.item_code} · {inv.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addManualPayloadRow}
                  className="rounded-xl border-2 border-[#2C2623] bg-[#FEF9C3] font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FEF08A]"
                >
                  <Plus className="size-3.5" />
                  Tambah Barang
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {payloadItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="space-y-2.5 rounded-2xl border-2 border-[#2C2623]/40 bg-[#FFFDF7] p-3.5 shadow-[2px_2px_0px_0px_#2C2623]/20 dark:border-stone-700 dark:bg-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-extrabold">
                      <PackagePlus className="text-primary size-3.5" />
                      Baris #{idx + 1}
                      {item.item_code ? (
                        <span className="rounded-full border border-[#2C2623]/40 bg-[#FFF4D6] px-2 py-0.5 font-mono text-[11px] text-[#2C2623] dark:bg-muted dark:text-foreground">
                          {item.item_code}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePayloadRow(idx)}
                      className="text-destructive h-7 rounded-xl px-2 hover:bg-[#FFE4E6]"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-5">
                      <Label className="text-xs font-semibold">
                        Nama Barang / Aset / Kunci
                      </Label>
                      <Input
                        value={item.name}
                        onChange={(e) =>
                          updatePayloadItem(idx, { name: e.target.value })
                        }
                        placeholder="Contoh: Papan Keseimbangan Sensorik"
                        required
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-semibold">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) =>
                          updatePayloadItem(idx, {
                            qty: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-semibold">Satuan</Label>
                      <Select
                        value={item.unit_label}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, { unit_label: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIT_LABEL_PRESETS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs font-semibold">Kondisi</Label>
                      <Select
                        value={item.condition}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, {
                            condition: v as ItemCondition,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            Object.keys(CONDITION_LABELS) as ItemCondition[]
                          ).map((c) => (
                            <SelectItem key={c} value={c}>
                              {CONDITION_LABELS[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Inventory mapping fields (crucial for Inbound 1-Click Stock Conversion) */}
                  <div className="grid gap-2.5 border-t border-dashed border-[#2C2623]/20 pt-2.5 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs font-semibold">
                        Prefix Kode
                      </Label>
                      <Select
                        value={item.category_prefix}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, {
                            category_prefix: v as CodeCategoryPrefix,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_PREFIX_OPTIONS.filter(
                            (opt) => opt.value !== "SUB" && opt.value !== "DOC",
                          ).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs font-semibold">Kategori</Label>
                      <Select
                        value={item.category}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, { category: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {THERAPY_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs font-semibold">Tipe Aset</Label>
                      <Select
                        value={item.asset_type}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, {
                            asset_type: v as AssetType,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map(
                            (at) => (
                              <SelectItem key={at} value={at}>
                                {ASSET_TYPE_LABELS[at]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs font-semibold">
                        Lokasi Simpan
                      </Label>
                      <Select
                        value={item.room_code}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, {
                            room_code: v as LocationCode,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getOptionWithCurrent(
                            inventoryOptions,
                            item.room_code,
                          ).map((loc) => (
                            <SelectItem key={loc.value} value={loc.value}>
                              {loc.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {direction === "INBOUND" && (
                      <>
                        <div className="space-y-1 sm:col-span-3">
                          <Label className="text-xs font-semibold">
                            Harga Beli / Unit (Rp)
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={item.purchase_price ?? 0}
                            onChange={(e) =>
                              updatePayloadItem(idx, {
                                purchase_price: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs font-semibold">
                            Total Keping
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            value={item.total_parts ?? 1}
                            onChange={(e) =>
                              updatePayloadItem(idx, {
                                total_parts: Math.max(
                                  1,
                                  Number(e.target.value) || 1,
                                ),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs font-semibold">
                            Min. Stok
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={item.min_stock_threshold ?? 0}
                            onChange={(e) =>
                              updatePayloadItem(idx, {
                                min_stock_threshold: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-5">
                          <Label className="text-xs font-semibold">
                            Catatan Item
                          </Label>
                          <Input
                            value={item.notes ?? ""}
                            onChange={(e) =>
                              updatePayloadItem(idx, { notes: e.target.value })
                            }
                            placeholder="Opsional (warna, nomor seri, rak)"
                          />
                        </div>
                        {item.asset_type !== "CONSUMABLE" && item.qty > 1 && (
                          <div className="sm:col-span-12">
                            <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
                              <Checkbox
                                checked={Boolean(item.split_units)}
                                onCheckedChange={(checked) =>
                                  updatePayloadItem(idx, {
                                    split_units: checked === true,
                                  })
                                }
                              />
                              <span>
                                Buat kode barcode terpisah per unit ({item.qty}{" "}
                                baris inventaris unik saat konversi)
                              </span>
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Proof Photo & Notes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="delivery_notes" className="font-bold">
                Catatan Umum
              </Label>
              <Textarea
                id="delivery_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan pengiriman, resi, atau instruksi serah terima..."
                rows={4}
                className="rounded-xl border-2 border-[#2C2623]/60 dark:border-stone-600"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <Label className="font-bold">
                  Foto Bukti Pengiriman / Penerimaan (Private Bucket)
                </Label>
                <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-[#2C2623] bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-extrabold text-[#14532D] shadow-[1.5px_1.5px_0px_0px_#2C2623] dark:border-emerald-400/50 dark:bg-emerald-950/70 dark:text-emerald-200 dark:shadow-none">
                  <ShieldCheck className="size-3" />
                  Scan &amp; Kompresi Otomatis
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-[#2C2623]/60 bg-[#FAF5FF]/70 p-3.5 dark:border-stone-600 dark:bg-violet-950/15">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#EDE9FE] px-3 py-1.5 text-xs font-bold text-[#4C1D95] shadow-[2px_2px_0px_0px_#2C2623] transition-colors hover:bg-[#DDD6FE] dark:border-violet-400/50 dark:bg-violet-950/60 dark:text-violet-100">
                    {isScanningProof ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="size-3.5" />
                    )}
                    <span>
                      {isScanningProof
                        ? "Memindai & Mengompresi..."
                        : proofPreviewUrl
                          ? "Ganti Foto"
                          : "Pilih Foto Bukti"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={submitting || isScanningProof}
                      onChange={handleProofFileChange}
                    />
                  </label>
                  {proofPreviewUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={submitting || isScanningProof}
                      onClick={() => {
                        setProofFile(null);
                        setProofPreviewUrl(null);
                        setProofSecurityNote(null);
                        setRemoveExistingProof(true);
                      }}
                      className="text-destructive h-7 rounded-xl text-xs hover:bg-[#FFE4E6]"
                    >
                      Hapus Foto
                    </Button>
                  )}
                </div>
                {proofSecurityNote && (
                  <p className="inline-flex items-center gap-1 text-[11px] font-bold text-[#14532D] dark:text-emerald-300">
                    <ShieldCheck className="size-3.5 shrink-0" />
                    {proofSecurityNote}
                  </p>
                )}
                {proofPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proofPreviewUrl}
                    alt="Pratinjau bukti pengiriman"
                    className="max-h-32 w-auto self-start rounded-xl border-2 border-[#2C2623]/40 object-contain"
                  />
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Format asli JPG, PNG, atau WebP (maks. 5 MB). Dipindai
                    magic-byte, EXIF dibersihkan &amp; dikompresi otomatis ke
                    bucket privat <code>delivery-proofs</code>.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting || isScanningProof}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting || isScanningProof}
              className="rounded-xl border-2 border-[#2C2623] bg-[#FF9E6D] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#FF8C54] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
            >
              {(submitting || isScanningProof) && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Simpan Perubahan" : "Simpan Pengiriman"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
