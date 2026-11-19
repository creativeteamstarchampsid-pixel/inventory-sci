"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import {
  AlertTriangle,
  ArrowLeftRight,
  Barcode,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  History,
  Loader2,
  Package,
  QrCode,
  ScanLine,
  Upload,
} from "lucide-react";

import { useRole } from "@/components/rbac/role-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { checkoutKitAction, returnKitAction } from "@/lib/actions/kits";
import {
  borrowItemViaScanAction,
  lookupScanTargetAction,
  quickStockOpnameAction,
  returnItemViaScanAction,
  type BorrowHistoryEntry,
  type ScanLookupResult,
} from "@/lib/actions/scan";
import {
  ASSET_TYPE_LABELS,
  BORROW_STATUS_LABELS,
  CONDITION_LABELS,
  HYGIENE_LABELS,
  INVENTORY_LOCATION_OPTIONS,
  LOCATION_LABELS,
  formatDateWIB,
} from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/rbac";
import type {
  HygieneStatus,
  ItemCondition,
  LocationCode,
} from "@/types/database";
import {
  ConditionBadge,
  HygieneBadge,
  KitStatusBadge,
  PartProgressIndicator,
} from "../inventory/inventory-badges";

const QR_READER_ELEMENT_ID = "starops-html5-qrcode-reader";

export type RecentScanFeedRow = BorrowHistoryEntry & {
  target_code: string;
  target_name: string;
  target_kind: "item" | "kit";
};

type CameraDeviceInfo = {
  id: string;
  label: string;
};

type ScanClientProps = {
  initialCode: string;
  initialLookup: ScanLookupResult | null;
  initialError: string | null;
  recentFeed: RecentScanFeedRow[];
  todayWib: string;
};

export function ScanClient({
  initialCode,
  initialLookup,
  initialError,
  recentFeed,
  todayWib,
}: ScanClientProps) {
  const { can } = useRole();
  const canEditMasterStock = can("inventory.update");
  const canValidateOpname = can("inventory.validate_opname");
  const canApproveWriteoff = can("writeoff.approve");

  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const qrInstanceRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<{ text: string; at: number } | null>(null);

  const [codeInput, setCodeInput] = useState(initialCode);
  const [lastScannedCode, setLastScannedCode] = useState(initialCode);
  const [matched, setMatched] = useState<ScanLookupResult | null>(initialLookup);
  const [activeTab, setActiveTab] = useState<"borrow" | "return" | "opname">(
    initialLookup?.activeBorrow ? "return" : "borrow",
  );

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Borrow form state
  const [borrowRoom, setBorrowRoom] = useState<LocationCode>(
    initialLookup?.kind === "item"
      ? initialLookup.item.room_code
      : initialLookup?.kind === "kit" && initialLookup.kit.assigned_room
        ? initialLookup.kit.assigned_room
        : "R01",
  );
  const [borrowNotes, setBorrowNotes] = useState("");

  // Return form state (Item)
  const [returnPartsAfter, setReturnPartsAfter] = useState<number>(
    initialLookup?.kind === "item" ? initialLookup.item.current_parts : 1,
  );
  const [returnHygiene, setReturnHygiene] = useState<HygieneStatus>("PERLU_DICUCI");
  const [returnCondition, setReturnCondition] = useState<ItemCondition>(
    initialLookup?.kind === "item" ? initialLookup.item.condition : "BAIK",
  );
  const [returnNotes, setReturnNotes] = useState("");

  // Return form state (Kit)
  const [kitReturnParts, setKitReturnParts] = useState<Record<string, number>>(() => {
    if (initialLookup?.kind !== "kit") return {};
    const map: Record<string, number> = {};
    for (const item of initialLookup.bundledItems) {
      map[item.id] = item.current_parts;
    }
    return map;
  });

  // Opname form state
  const [opnameParts, setOpnameParts] = useState<number>(
    initialLookup?.kind === "item" ? initialLookup.item.current_parts : 1,
  );
  const [opnameStock, setOpnameStock] = useState<number>(
    initialLookup?.kind === "item" ? initialLookup.item.stock_qty : 1,
  );
  const [opnameHygiene, setOpnameHygiene] = useState<HygieneStatus>(
    initialLookup?.kind === "item" ? initialLookup.item.hygiene_status : "STERIL",
  );
  const [opnameCondition, setOpnameCondition] = useState<ItemCondition>(
    initialLookup?.kind === "item" ? initialLookup.item.condition : "BAIK",
  );
  const [opnameNotes, setOpnameNotes] = useState("");

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(initialError ? { type: "error", text: initialError } : null);
  const [isPending, startTransition] = useTransition();

  const applyLookupState = (result: ScanLookupResult) => {
    setMatched(result);
    setActiveTab(result.activeBorrow ? "return" : "borrow");
    setBorrowNotes("");
    setReturnNotes("");
    setOpnameNotes("");

    if (result.kind === "item") {
      setBorrowRoom(result.item.room_code);
      setReturnPartsAfter(result.item.current_parts);
      setReturnHygiene("PERLU_DICUCI");
      setReturnCondition(result.item.condition);

      setOpnameParts(result.item.current_parts);
      setOpnameStock(result.item.stock_qty);
      setOpnameHygiene(result.item.hygiene_status);
      setOpnameCondition(result.item.condition);
    } else {
      setBorrowRoom(result.kit.assigned_room ?? "R01");
      setReturnHygiene("PERLU_DICUCI");
      const partsMap: Record<string, number> = {};
      for (const item of result.bundledItems) {
        partsMap[item.id] = item.current_parts;
      }
      setKitReturnParts(partsMap);
    }
  };

  const stopCamera = async () => {
    const instance = qrInstanceRef.current;
    if (!instance) {
      setCameraActive(false);
      return;
    }
    try {
      if (instance.isScanning) {
        await instance.stop();
      }
      instance.clear();
    } catch {
      // Ignore cleanup errors when camera wasn't fully started
    } finally {
      qrInstanceRef.current = null;
      setCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      const instance = qrInstanceRef.current;
      if (instance) {
        if (instance.isScanning) {
          void instance.stop().then(() => instance.clear()).catch(() => {});
        } else {
          try {
            instance.clear();
          } catch {
            // ignore
          }
        }
        qrInstanceRef.current = null;
      }
    };
  }, []);

  const performLookup = (rawCode: string, clearInputAfter = false) => {
    const trimmed = rawCode.trim();
    if (!trimmed) {
      setFeedback({ type: "error", text: "Masukkan atau scan kode barcode/QR terlebih dahulu." });
      return;
    }

    setFeedback(null);
    setLastScannedCode(trimmed);

    startTransition(async () => {
      const res = await lookupScanTargetAction(trimmed);
      if (clearInputAfter) {
        setCodeInput("");
      }
      if (!res.ok) {
        setMatched(null);
        setFeedback({ type: "error", text: res.error });
        return;
      }
      applyLookupState(res.data);
    });
  };

  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    performLookup(codeInput, true);
  };

  const startCamera = async () => {
    setCameraError(null);
    setCameraBusy(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      let availableCameras = cameras;
      if (availableCameras.length === 0) {
        const fetched = await Html5Qrcode.getCameras();
        availableCameras = fetched.map((c) => ({
          id: c.id,
          label: c.label || `Kamera ${c.id.slice(0, 6)}`,
        }));
        setCameras(availableCameras);
      }

      if (availableCameras.length === 0) {
        setCameraError("Tidak ada kamera yang terdeteksi pada perangkat ini.");
        setCameraBusy(false);
        return;
      }

      const preferredCamera =
        selectedCameraId ||
        availableCameras.find((c) => /back|rear|environment/i.test(c.label))?.id ||
        availableCameras[0].id;

      if (!selectedCameraId) {
        setSelectedCameraId(preferredCamera);
      }

      await stopCamera();

      const scanner = new Html5Qrcode(QR_READER_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.ITF,
        ],
      });
      qrInstanceRef.current = scanner;

      await scanner.start(
        preferredCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
        },
        (decodedText) => {
          const now = Date.now();
          if (
            lastDecodedRef.current &&
            lastDecodedRef.current.text === decodedText &&
            now - lastDecodedRef.current.at < 2500
          ) {
            return;
          }
          lastDecodedRef.current = { text: decodedText, at: now };
          void stopCamera();
          setCodeInput(decodedText);
          performLookup(decodedText, true);
        },
        () => {
          // Per-frame decode miss is expected while aiming
        },
      );

      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Gagal mengakses kamera: ${err.message}`
          : "Gagal mengaktifkan kamera pemindai.",
      );
      await stopCamera();
    } finally {
      setCameraBusy(false);
    }
  };

  const handleScanImageFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    setCameraBusy(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      await stopCamera();
      const scanner = new Html5Qrcode(QR_READER_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
        ],
      });
      const decodedText = await scanner.scanFile(file, false);
      scanner.clear();
      setCodeInput(decodedText);
      performLookup(decodedText, true);
    } catch {
      setCameraError("Barcode / QR Code tidak terbaca pada gambar tersebut.");
    } finally {
      setCameraBusy(false);
      event.target.value = "";
    }
  };

  const refreshMatched = async (codeToLookup: string) => {
    const res = await lookupScanTargetAction(codeToLookup);
    if (res.ok) {
      applyLookupState(res.data);
    }
  };

  const handleBorrowItem = () => {
    if (matched?.kind !== "item") return;
    const item = matched.item;
    setFeedback(null);
    startTransition(async () => {
      const res = await borrowItemViaScanAction({
        itemId: item.id,
        roomCode: borrowRoom,
        notes: borrowNotes.trim() || null,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Peminjaman berhasil dicatat." });
      await refreshMatched(item.item_code);
    });
  };

  const handleReturnItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (matched?.kind !== "item") return;
    const item = matched.item;
    setFeedback(null);
    startTransition(async () => {
      const res = await returnItemViaScanAction({
        itemId: item.id,
        transactionId: matched.activeBorrow?.id ?? null,
        partsAfter: returnPartsAfter,
        hygieneStatus: returnHygiene,
        conditionOverride: returnCondition,
        notes: returnNotes.trim() || null,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Pengembalian berhasil dicatat." });
      await refreshMatched(item.item_code);
    });
  };

  const handleQuickOpname = (event: React.FormEvent) => {
    event.preventDefault();
    if (matched?.kind !== "item") return;
    const item = matched.item;
    setFeedback(null);
    startTransition(async () => {
      const res = await quickStockOpnameAction({
        itemId: item.id,
        currentParts: opnameParts,
        stockQty: opnameStock,
        hygieneStatus: opnameHygiene,
        condition: opnameCondition,
        notes: opnameNotes.trim() || null,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Stock Opname berhasil dicatat." });
      await refreshMatched(item.item_code);
    });
  };

  const handleCheckoutKit = () => {
    if (matched?.kind !== "kit") return;
    const kit = matched.kit;
    setFeedback(null);
    startTransition(async () => {
      const res = await checkoutKitAction(kit.id, {
        roomCode: borrowRoom,
        notes: borrowNotes.trim() || null,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Kit berhasil di-check-out." });
      await refreshMatched(kit.kit_code);
    });
  };

  const handleReturnKit = (event: React.FormEvent) => {
    event.preventDefault();
    if (matched?.kind !== "kit") return;
    const kit = matched.kit;
    setFeedback(null);

    const itemUpdates = matched.bundledItems.map((item) => ({
      itemId: item.id,
      currentParts: kitReturnParts[item.id] ?? item.current_parts,
      hygieneStatus: item.asset_type === "THERAPY_TOY" ? returnHygiene : undefined,
    }));

    startTransition(async () => {
      const res = await returnKitAction(kit.id, {
        hygieneStatus: returnHygiene,
        itemUpdates,
        notes: returnNotes.trim() || null,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Kit berhasil dikembalikan." });
      await refreshMatched(kit.kit_code);
    });
  };

  const focusScannerInput = () => {
    setCodeInput("");
    scannerInputRef.current?.focus();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {canValidateOpname
              ? "Scan Pinjam, Kembali & Stock Opname"
              : "Scan Pinjam & Kembalikan Alat"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Mendukung Kamera QR/Barcode, USB Laser Scanner Gun (Enter otomatis), dan input manual kode SC-/KIT-/URL.
          </p>
        </div>
        <Button variant="outline" onClick={focusScannerInput}>
          <ScanLine className="size-4" />
          Fokus Scanner USB
        </Button>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          <AlertDescription>{feedback.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Scanner Input & Camera */}
        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Barcode className="size-4" />
                Input Scanner USB / Manual
              </CardTitle>
              <CardDescription>
                Arahkan kursor di kotak ini lalu tembak barcode dengan USB Scanner, atau ketik kode / tempel URL `/inventory/[id]`.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <Input
                  ref={scannerInputRef}
                  autoFocus
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="SC-SNS-R01-0001 / KIT-R01-01 / URL…"
                  className="font-mono"
                  disabled={isPending}
                />
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : "Cari"}
                </Button>
              </form>
              {lastScannedCode && (
                <p className="text-muted-foreground text-xs">
                  Kode terakhir dicari:{" "}
                  <span className="text-foreground font-mono font-medium">
                    {lastScannedCode}
                  </span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <QrCode className="size-4" />
                Kamera Pemindai QR / Barcode
              </CardTitle>
              <CardDescription>
                Gunakan kamera perangkat atau unggah foto barcode untuk verifikasi cepat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {cameraError && (
                <Alert variant="destructive">
                  <AlertDescription>{cameraError}</AlertDescription>
                </Alert>
              )}

              {cameras.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Pilih Kamera</Label>
                  <Select
                    value={selectedCameraId}
                    onValueChange={setSelectedCameraId}
                    disabled={cameraActive || cameraBusy}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih kamera" />
                    </SelectTrigger>
                    <SelectContent>
                      {cameras.map((cam) => (
                        <SelectItem key={cam.id} value={cam.id}>
                          {cam.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div
                id={QR_READER_ELEMENT_ID}
                className="bg-muted/40 min-h-[200px] w-full overflow-hidden rounded-lg border"
              />

              <div className="flex flex-wrap items-center gap-2">
                {!cameraActive ? (
                  <Button
                    type="button"
                    onClick={startCamera}
                    disabled={cameraBusy}
                    className="flex-1"
                  >
                    {cameraBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                    Mulai Kamera
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void stopCamera()}
                    className="flex-1"
                  >
                    <CameraOff className="size-4" />
                    Hentikan Kamera
                  </Button>
                )}

                <Label
                  htmlFor="scan-file-upload"
                  className="border-input bg-background hover:bg-accent inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium shadow-xs"
                >
                  <Upload className="size-3.5" />
                  Scan Gambar
                </Label>
                <input
                  id="scan-file-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleScanImageFile}
                  disabled={cameraBusy}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Matched Item / Kit Actions */}
        <div className="space-y-4 lg:col-span-7">
          {!matched ? (
            <Card className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
              <Package className="text-muted-foreground mb-3 size-12 opacity-40" />
              <h2 className="text-lg font-medium">Siap Memindai Barang atau Kit</h2>
              <p className="text-muted-foreground mt-1 max-w-md text-sm">
                {canValidateOpname
                  ? "Scan stiker barcode / QR Code pada mainan terapi, aset kantor, atau kit untuk mencatat peminjaman, pengembalian, status sanitasi, atau stock opname."
                  : "Scan stiker barcode / QR Code pada mainan terapi atau paket kit untuk mencatat peminjaman, pengembalian, dan status kebersihan."}
              </p>
            </Card>
          ) : matched.kind === "item" ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {matched.photoSignedUrl ? (
                      <div className="size-16 shrink-0 overflow-hidden rounded-md border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={matched.photoSignedUrl}
                          alt={matched.item.name}
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-md border text-xs font-semibold">
                        {matched.item.category_prefix}
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="font-mono">
                          {matched.item.item_code}
                        </Badge>
                        <Badge variant="secondary">
                          {ASSET_TYPE_LABELS[matched.item.asset_type]}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl">{matched.item.name}</CardTitle>
                      <CardDescription>
                        {matched.item.category} · {matched.item.room_code} (
                        {LOCATION_LABELS[matched.item.room_code]})
                        {matched.item.rack_location ? ` · ${matched.item.rack_location}` : ""}
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/inventory/${matched.item.id}`}>
                      Detail
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConditionBadge condition={matched.item.condition} />
                    <HygieneBadge
                      status={matched.item.hygiene_status}
                      assetType={matched.item.asset_type}
                      nextDue={matched.item.next_sanitization_due}
                      todayWib={todayWib}
                    />
                  </div>
                  <PartProgressIndicator
                    currentParts={matched.item.current_parts}
                    totalParts={matched.item.total_parts}
                    unitLabel={matched.item.unit_label}
                  />
                </div>

                {matched.activeBorrow && (
                  <Alert variant="warning">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>
                      Sedang Dipinjam ({matched.activeBorrow.transaction_code})
                    </AlertTitle>
                    <AlertDescription>
                      Oleh <strong>{matched.activeBorrow.borrower_name || "Terapis"}</strong> di{" "}
                      {matched.activeBorrow.room_code || "-"} sejak{" "}
                      {formatDateWIB(matched.activeBorrow.borrowed_at, true)}. Part awal:{" "}
                      {matched.activeBorrow.parts_before ?? matched.item.current_parts}.
                    </AlertDescription>
                  </Alert>
                )}

                <Tabs
                  value={activeTab === "opname" && !canValidateOpname ? "borrow" : activeTab}
                  onValueChange={(v) => {
                    if (v === "opname" && !canValidateOpname) return;
                    setActiveTab(v as "borrow" | "return" | "opname");
                  }}
                >
                  <TabsList
                    className={
                      canValidateOpname ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"
                    }
                  >
                    <TabsTrigger value="borrow">
                      <ArrowLeftRight className="size-3.5" />
                      Pinjam
                    </TabsTrigger>
                    <TabsTrigger value="return">
                      <CheckCircle2 className="size-3.5" />
                      Kembalikan
                    </TabsTrigger>
                    {canValidateOpname && (
                      <TabsTrigger value="opname">
                        <ClipboardCheck className="size-3.5" />
                        Stock Opname
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="borrow" className="space-y-4 pt-3">
                    <div className="space-y-2">
                      <Label>Ruangan Penggunaan</Label>
                      <Select
                        value={borrowRoom}
                        onValueChange={(v) => setBorrowRoom(v as LocationCode)}
                        disabled={isPending}
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
                    <div className="space-y-2">
                      <Label htmlFor="scan-borrow-notes">Catatan Peminjaman (Opsional)</Label>
                      <Textarea
                        id="scan-borrow-notes"
                        rows={2}
                        value={borrowNotes}
                        onChange={(e) => setBorrowNotes(e.target.value)}
                        placeholder="Contoh: Sesi terapi pukul 14.00…"
                        disabled={isPending}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleBorrowItem}
                      disabled={
                        isPending ||
                        (Boolean(matched.activeBorrow) &&
                          matched.item.asset_type !== "CONSUMABLE")
                      }
                    >
                      {isPending && <Loader2 className="size-4 animate-spin" />}
                      Pinjam Sekarang (1 Klik)
                    </Button>
                  </TabsContent>

                  <TabsContent value="return" className="pt-3">
                    <form onSubmit={handleReturnItem} className="space-y-4">
                      {matched.activeBorrow && !matched.canReturnActiveBorrow && (
                        <Alert variant="destructive">
                          <AlertDescription>
                            Transaksi ini dipinjam oleh {matched.activeBorrow.borrower_name}. Hanya
                            peminjam atau {ROLE_LABELS.TEAM_LEADER.title}/
                            {ROLE_LABELS.SUPER_ADMIN.title} yang dapat menyelesaikan pengembalian
                            ini.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="return-parts-after">
                            Verifikasi Part Kembali ({matched.item.unit_label})
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setReturnPartsAfter(matched.item.total_parts)}
                          >
                            Lengkap ({matched.item.total_parts})
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              setReturnPartsAfter((p) => Math.max(0, p - 1))
                            }
                            disabled={isPending}
                          >
                            -
                          </Button>
                          <Input
                            id="return-parts-after"
                            type="number"
                            min={0}
                            max={matched.item.total_parts}
                            value={returnPartsAfter}
                            onChange={(e) =>
                              setReturnPartsAfter(Math.trunc(Number(e.target.value) || 0))
                            }
                            className="text-center font-mono"
                            disabled={isPending}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              setReturnPartsAfter((p) =>
                                Math.min(matched.item.total_parts, p + 1),
                              )
                            }
                            disabled={isPending}
                          >
                            +
                          </Button>
                        </div>
                        {matched.item.total_parts > 1 &&
                          returnPartsAfter < matched.item.total_parts && (
                            <Alert variant="warning">
                              <AlertTriangle className="size-4" />
                              <AlertDescription>
                                Jumlah part ({returnPartsAfter}/{matched.item.total_parts}) tidak lengkap. Item akan otomatis ditandai{" "}
                                <strong>PART_KURANG</strong>.
                              </AlertDescription>
                            </Alert>
                          )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Status Kebersihan Setelah Sesi</Label>
                          <Select
                            value={returnHygiene}
                            onValueChange={(v) => setReturnHygiene(v as HygieneStatus)}
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-full">
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

                        <div className="space-y-2">
                          <Label>Kondisi Barang</Label>
                          <Select
                            value={returnCondition}
                            onValueChange={(v) => setReturnCondition(v as ItemCondition)}
                            disabled={
                              isPending ||
                              (matched.item.condition === "DIHAPUSBUKU" && !canApproveWriteoff)
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(CONDITION_LABELS) as ItemCondition[])
                                .filter(
                                  (k) =>
                                    k !== "DIHAPUSBUKU" ||
                                    canApproveWriteoff ||
                                    matched.item.condition === "DIHAPUSBUKU",
                                )
                                .map((key) => (
                                  <SelectItem
                                    key={key}
                                    value={key}
                                    disabled={key === "DIHAPUSBUKU" && !canApproveWriteoff}
                                  >
                                    {CONDITION_LABELS[key]}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="scan-return-notes">Catatan Pengembalian (Opsional)</Label>
                        <Textarea
                          id="scan-return-notes"
                          rows={2}
                          value={returnNotes}
                          onChange={(e) => setReturnNotes(e.target.value)}
                          placeholder="Catat bagian yang hilang atau kerusakan…"
                          disabled={isPending}
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={
                          isPending ||
                          (Boolean(matched.activeBorrow) && !matched.canReturnActiveBorrow)
                        }
                      >
                        {isPending && <Loader2 className="size-4 animate-spin" />}
                        {matched.activeBorrow
                          ? "Kembalikan & Simpan Verifikasi"
                          : "Simpan Verifikasi Kondisi & Sanitasi"}
                      </Button>
                    </form>
                  </TabsContent>

                  {canValidateOpname && (
                    <TabsContent value="opname" className="pt-3">
                      <form onSubmit={handleQuickOpname} className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="opname-parts">
                              Part Fisik ({matched.item.unit_label}, maks {matched.item.total_parts})
                            </Label>
                            <Input
                              id="opname-parts"
                              type="number"
                              min={0}
                              max={matched.item.total_parts}
                              value={opnameParts}
                              onChange={(e) =>
                                setOpnameParts(Math.trunc(Number(e.target.value) || 0))
                              }
                              disabled={isPending}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="opname-stock">
                              Stok Fisik ({matched.item.unit_label})
                            </Label>
                            <Input
                              id="opname-stock"
                              type="number"
                              min={0}
                              value={opnameStock}
                              onChange={(e) =>
                                setOpnameStock(Math.trunc(Number(e.target.value) || 0))
                              }
                              disabled={isPending}
                            />
                            {!canEditMasterStock && (
                              <p className="text-muted-foreground text-[11px]">
                                Selisih stok akan dicatat ke log audit untuk peninjauan{" "}
                                {ROLE_LABELS.SUPER_ADMIN.title}.
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Status Sanitasi</Label>
                            <Select
                              value={opnameHygiene}
                              onValueChange={(v) => setOpnameHygiene(v as HygieneStatus)}
                              disabled={isPending}
                            >
                              <SelectTrigger className="w-full">
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

                          <div className="space-y-2">
                            <Label>Kondisi Fisik</Label>
                            <Select
                              value={opnameCondition}
                              onValueChange={(v) => setOpnameCondition(v as ItemCondition)}
                              disabled={
                                isPending ||
                                (matched.item.condition === "DIHAPUSBUKU" && !canApproveWriteoff)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(CONDITION_LABELS) as ItemCondition[])
                                  .filter(
                                    (k) =>
                                      k !== "DIHAPUSBUKU" ||
                                      canApproveWriteoff ||
                                      matched.item.condition === "DIHAPUSBUKU",
                                  )
                                  .map((key) => (
                                    <SelectItem
                                      key={key}
                                      value={key}
                                      disabled={key === "DIHAPUSBUKU" && !canApproveWriteoff}
                                    >
                                      {CONDITION_LABELS[key]}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="opname-notes">Catatan Stock Opname</Label>
                          <Textarea
                            id="opname-notes"
                            rows={2}
                            value={opnameNotes}
                            onChange={(e) => setOpnameNotes(e.target.value)}
                            placeholder="Catatan lokasi aktual atau hasil pemeriksaan fisik…"
                            disabled={isPending}
                          />
                        </div>

                        <Button
                          type="submit"
                          variant="secondary"
                          className="w-full"
                          disabled={isPending}
                        >
                          {isPending && <Loader2 className="size-4 animate-spin" />}
                          Simpan Hasil Stock Opname
                        </Button>
                      </form>
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {matched.kit.kit_code}
                      </Badge>
                      <KitStatusBadge status={matched.kit.status} />
                      {matched.kit.assigned_room && (
                        <Badge variant="secondary">
                          {matched.kit.assigned_room} · {LOCATION_LABELS[matched.kit.assigned_room]}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl">{matched.kit.kit_name}</CardTitle>
                    {matched.kit.description && (
                      <CardDescription>{matched.kit.description}</CardDescription>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/kits">
                      Lihat Semua Kit
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {matched.activeBorrow && (
                  <Alert variant="warning">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>
                      Kit Sedang Dipinjam ({matched.activeBorrow.transaction_code})
                    </AlertTitle>
                    <AlertDescription>
                      Oleh <strong>{matched.activeBorrow.borrower_name || "Terapis"}</strong> sejak{" "}
                      {formatDateWIB(matched.activeBorrow.borrowed_at, true)}.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-muted-foreground text-xs font-medium">
                    Item dalam Kit ({matched.bundledItems.length} item)
                  </p>
                  <ul className="divide-y">
                    {matched.bundledItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                      >
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-muted-foreground font-mono text-[11px]">
                            {item.item_code}
                          </p>
                        </div>
                        <PartProgressIndicator
                          currentParts={item.current_parts}
                          totalParts={item.total_parts}
                          unitLabel={item.unit_label}
                        />
                      </li>
                    ))}
                  </ul>
                </div>

                {matched.kit.status !== "DIPINJAM" ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Ruangan Penggunaan</Label>
                      <Select
                        value={borrowRoom}
                        onValueChange={(v) => setBorrowRoom(v as LocationCode)}
                        disabled={isPending}
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
                    <div className="space-y-2">
                      <Label htmlFor="kit-borrow-notes">Catatan Check-Out (Opsional)</Label>
                      <Textarea
                        id="kit-borrow-notes"
                        rows={2}
                        value={borrowNotes}
                        onChange={(e) => setBorrowNotes(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleCheckoutKit}
                      disabled={isPending || matched.kit.status === "NONAKTIF"}
                    >
                      {isPending && <Loader2 className="size-4 animate-spin" />}
                      Check-Out Kit (1 Klik)
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleReturnKit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Status Kebersihan Mainan Setelah Sesi</Label>
                      <Select
                        value={returnHygiene}
                        onValueChange={(v) => setReturnHygiene(v as HygieneStatus)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full">
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

                    {matched.bundledItems.length > 0 && (
                      <div className="space-y-2 rounded-md border p-3">
                        <Label className="text-xs font-medium">
                          Verifikasi Part Kembali Per Item
                        </Label>
                        <div className="space-y-2">
                          {matched.bundledItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{item.name}</p>
                                <p className="text-muted-foreground font-mono text-[11px]">
                                  Maks: {item.total_parts} {item.unit_label}
                                </p>
                              </div>
                              <Input
                                type="number"
                                min={0}
                                max={item.total_parts}
                                value={kitReturnParts[item.id] ?? item.current_parts}
                                onChange={(e) =>
                                  setKitReturnParts((prev) => ({
                                    ...prev,
                                    [item.id]: Math.trunc(Number(e.target.value) || 0),
                                  }))
                                }
                                className="h-8 w-20 text-right font-mono"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="kit-return-notes-scan">Catatan Pengembalian</Label>
                      <Textarea
                        id="kit-return-notes-scan"
                        rows={2}
                        value={returnNotes}
                        onChange={(e) => setReturnNotes(e.target.value)}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isPending || !matched.canReturnActiveBorrow}
                    >
                      {isPending && <Loader2 className="size-4 animate-spin" />}
                      Kembalikan Kit Sekarang
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Aktivitas Peminjaman & Pengembalian Terbaru
          </CardTitle>
          <CardDescription>
            Klik kode untuk memuat langsung ke panel pemindai.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentFeed.length === 0 ? (
            <p className="text-muted-foreground px-6 pb-6 text-sm">
              Belum ada riwayat transaksi peminjaman.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode Trx</TableHead>
                  <TableHead>Item / Kit</TableHead>
                  <TableHead>Peminjam</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFeed.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.transaction_code}</TableCell>
                    <TableCell className="whitespace-normal">
                      {row.target_code !== "-" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCodeInput(row.target_code);
                            performLookup(row.target_code, false);
                          }}
                          className="text-primary text-left font-mono text-xs font-semibold hover:underline"
                        >
                          {row.target_code}
                        </button>
                      ) : (
                        <span className="font-mono text-xs">-</span>
                      )}
                      <p className="text-muted-foreground text-xs">{row.target_name}</p>
                    </TableCell>
                    <TableCell>{row.borrower_name || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.parts_before ?? "-"} → {row.parts_after ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">
                      <div>Pinjam: {formatDateWIB(row.borrowed_at, true)}</div>
                      {row.returned_at && (
                        <div className="text-muted-foreground">
                          Kembali: {formatDateWIB(row.returned_at, true)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "HILANG_PART" || row.status === "TERLAMBAT"
                            ? "destructive"
                            : row.status === "DIKEMBALIKAN"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {BORROW_STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
