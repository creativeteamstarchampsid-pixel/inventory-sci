"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, PackagePlus, Plus, Trash2 } from "lucide-react";

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
  INVENTORY_LOCATION_OPTIONS,
  THERAPY_CATEGORIES,
} from "@/lib/constants";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
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

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

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

  const [direction, setDirection] = useState<DeliveryDirection>(initialDirection);
  const [packageType, setPackageType] = useState<string>(PACKAGE_TYPE_PRESETS[0]);
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
  const [removeExistingProof, setRemoveExistingProof] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setProofFile(null);
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
      const parsed = parseDeliveryPayloadItems(editingDelivery.items_payload_json);
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

  function handleProofFileChange(file: File | null) {
    if (!file) return;
    if (file.size > MAX_PROOF_BYTES) {
      setErrorMsg("Ukuran foto bukti maksimal 5 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setErrorMsg("File bukti foto harus berupa gambar (JPG, PNG, WebP, GIF).");
      return;
    }
    setErrorMsg(null);
    setProofFile(file);
    setRemoveExistingProof(false);
    const localUrl = URL.createObjectURL(file);
    setProofPreviewUrl(localUrl);
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
    setPayloadItems((prev) => [...prev, createEmptyPayloadItem(prev.length + 1)]);
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
      const validItems = payloadItems.filter((it) => it.name.trim().length > 0);
      if (validItems.length === 0) {
        setErrorMsg("Tambahkan minimal 1 barang pada daftar isi paket.");
        setSubmitting(false);
        return;
      }

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

      const res = isEditing && editingDelivery
        ? await updateDeliveryAction(editingDelivery.id, payload)
        : await createDeliveryAction(payload);

      if (!res.ok) {
        setErrorMsg(res.error);
        setSubmitting(false);
        return;
      }

      let savedDelivery = res.data.delivery;
      let latestProofUrl: string | null | undefined = undefined;

      if (removeExistingProof && !proofFile && savedDelivery.proof_photo_url) {
        const rmRes = await removeDeliveryProofPhotoAction(savedDelivery.id);
        if (!rmRes.ok) {
          setErrorMsg(
            `Data tersimpan, tetapi gagal menghapus bukti foto: ${rmRes.error}`,
          );
          setSubmitting(false);
          return;
        }
        savedDelivery = { ...savedDelivery, proof_photo_url: null };
        latestProofUrl = null;
      }

      if (proofFile) {
        const signRes = await createDeliveryProofUploadUrlAction(
          savedDelivery.id,
          proofFile.name,
          proofFile.type,
        );
        if (!signRes.ok) {
          setErrorMsg(
            `Data pengiriman tersimpan (${savedDelivery.delivery_code}), tetapi gagal mengunggah bukti foto: ${signRes.error}`,
          );
          onSaved(savedDelivery);
          setSubmitting(false);
          return;
        }

        const browserSupabase = createBrowserClient();
        const { error: uploadErr } = await browserSupabase.storage
          .from("delivery-proofs")
          .uploadToSignedUrl(signRes.data.path, signRes.data.token, proofFile, {
            contentType: proofFile.type,
          });

        if (uploadErr) {
          setErrorMsg(
            `Data tersimpan (${savedDelivery.delivery_code}), tetapi unggahan foto gagal: ${uploadErr.message}`,
          );
          onSaved(savedDelivery);
          setSubmitting(false);
          return;
        }

        const savePhotoRes = await saveDeliveryProofPhotoAction(
          savedDelivery.id,
          signRes.data.path,
        );
        if (!savePhotoRes.ok) {
          setErrorMsg(
            `Foto terunggah, tetapi gagal menautkan path foto: ${savePhotoRes.error}`,
          );
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
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menyimpan pengiriman.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? `Ubah Pengiriman (${editingDelivery?.delivery_code})`
              : "Buat Catatan Pengiriman / BAST Baru"}
          </DialogTitle>
          <DialogDescription>
            Catat paket masuk (Inbound), pengiriman keluar (Outbound), atau serah
            terima aset/kunci (BAST). Paket Inbound dapat dikonversi 1-klik menjadi
            stok inventaris.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMsg && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {/* Basic Logistics Metadata */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Arah Pengiriman</Label>
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
              <Label>Jenis Paket / Dokumen</Label>
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
              <Label>Status Pengiriman</Label>
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
              <Label htmlFor="courier_name">Kurir / Ekspedisi</Label>
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
                    className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 text-[11px] transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tracking_number">Nomor Resi (Opsional)</Label>
              <Input
                id="tracking_number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Contoh: JP1234567890"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shipping_cost">Biaya Kirim (Rp)</Label>
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
          <div className="grid gap-4 rounded-lg border p-3.5 sm:grid-cols-2">
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pengirim / Pihak Pertama
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="sender_name">Nama Pengirim</Label>
                <Input
                  id="sender_name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Nama vendor / toko / staf menyerahkan"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sender_address">Alamat / Unit Asal</Label>
                <Input
                  id="sender_address"
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                  placeholder="Alamat pengirim atau unit kerja"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Penerima / Pihak Kedua
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="receiver_name">Nama Penerima</Label>
                <Input
                  id="receiver_name"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  placeholder="Star Champs Indonesia / nama penerima"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receiver_address">Alamat / Ruang Tujuan</Label>
                <Input
                  id="receiver_address"
                  value={receiverAddress}
                  onChange={(e) => setReceiverAddress(e.target.value)}
                  placeholder="Alamat tujuan atau ruang"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pic_name">PIC / Penanggung Jawab</Label>
              <Input
                id="pic_name"
                value={picName}
                onChange={(e) => setPicName(e.target.value)}
                placeholder="Nama staf PIC penerima/pengirim"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={isFragile}
                  onCheckedChange={(checked) => setIsFragile(checked === true)}
                />
                <span>
                  Tandai <strong>Fragile / Alat Terapi</strong> pada label pengiriman
                </span>
              </label>
            </div>
          </div>

          {/* Item Payload Builder */}
          <div className="space-y-3 rounded-lg border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
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
                  className="bg-muted/25 space-y-2.5 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <PackagePlus className="size-3.5 text-primary" />
                      Baris #{idx + 1}
                      {item.item_code ? (
                        <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                          {item.item_code}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePayloadRow(idx)}
                      className="text-destructive h-7 px-2"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-5">
                      <Label className="text-xs">Nama Barang / Aset / Kunci</Label>
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
                      <Label className="text-xs">Qty</Label>
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
                      <Label className="text-xs">Satuan</Label>
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
                      <Label className="text-xs">Kondisi</Label>
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
                          {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map(
                            (c) => (
                              <SelectItem key={c} value={c}>
                                {CONDITION_LABELS[c]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Inventory mapping fields (crucial for Inbound 1-Click Stock Conversion) */}
                  <div className="grid gap-2.5 border-t pt-2.5 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-3">
                      <Label className="text-xs">Prefix Kode</Label>
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
                      <Label className="text-xs">Kategori</Label>
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
                      <Label className="text-xs">Tipe Aset</Label>
                      <Select
                        value={item.asset_type}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, { asset_type: v as AssetType })
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
                      <Label className="text-xs">Lokasi Simpan</Label>
                      <Select
                        value={item.room_code}
                        onValueChange={(v) =>
                          updatePayloadItem(idx, { room_code: v as LocationCode })
                        }
                      >
                        <SelectTrigger className="w-full">
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

                    {direction === "INBOUND" && (
                      <>
                        <div className="space-y-1 sm:col-span-3">
                          <Label className="text-xs">Harga Beli / Unit (Rp)</Label>
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
                          <Label className="text-xs">Total Keping</Label>
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
                          <Label className="text-xs">Min. Stok</Label>
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
                          <Label className="text-xs">Catatan Item</Label>
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
                            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                              <Checkbox
                                checked={Boolean(item.split_units)}
                                onCheckedChange={(checked) =>
                                  updatePayloadItem(idx, {
                                    split_units: checked === true,
                                  })
                                }
                              />
                              <span>
                                Buat kode barcode terpisah per unit ({item.qty} baris
                                inventaris unik saat konversi)
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
              <Label htmlFor="delivery_notes">Catatan Umum</Label>
              <Textarea
                id="delivery_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan pengiriman, resi, atau instruksi serah terima..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Foto Bukti Pengiriman / Penerimaan (Private Bucket)</Label>
              <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium">
                    <ImagePlus className="size-3.5" />
                    <span>{proofPreviewUrl ? "Ganti Foto" : "Pilih Foto Bukti"}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) =>
                        handleProofFileChange(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {proofPreviewUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setProofFile(null);
                        setProofPreviewUrl(null);
                        setRemoveExistingProof(true);
                      }}
                      className="text-destructive h-7 text-xs"
                    >
                      Hapus Foto
                    </Button>
                  )}
                </div>
                {proofPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proofPreviewUrl}
                    alt="Pratinjau bukti pengiriman"
                    className="max-h-32 w-auto self-start rounded border object-contain"
                  />
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Format JPG, PNG, WebP, atau GIF (maks. 5 MB). Disimpan aman di
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
              disabled={submitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Simpan Perubahan" : "Simpan Pengiriman"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
