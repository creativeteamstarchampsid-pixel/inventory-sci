"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  Sparkles,
  Upload,
} from "lucide-react";

import { useCartoonFeedback } from "@/components/cartoon/feedback-provider";
import {
  KawaiiEmptyState,
  KawaiiPageHeader,
} from "@/components/cartoon/kawaii-decor";
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
  const { showWorking, showError, runWithFeedback } = useCartoonFeedback();

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
  const [isPending, setIsPending] = useState(false);

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

  const performLookup = async (rawCode: string, clearInputAfter = false) => {
    const trimmed = rawCode.trim();
    if (!trimmed) {
      const emptyMsg = "Masukkan atau scan kode barcode/QR terlebih dahulu.";
      setFeedback({ type: "error", text: emptyMsg });
      showError({
        title: "Kode Masih Kosong!",
        message: "Yuk ketik kode SC-/KIT- atau arahkan pemindai ke stiker barcode dulu ya~",
      });
      return;
    }

    setFeedback(null);
    setLastScannedCode(trimmed);
    setIsPending(true);

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mencari Data Barcode...",
          workingMessage: `Dino Joguman lagi ngecek kode "${trimmed}" di rak inventaris & paket kit nih! Tunggu sebentar ya~`,
          successTitle: "Ketemu! ✨",
          successMessage: (result) => {
            if (!result.ok) return "Data ditemukan!";
            if (result.data.kind === "item") {
              return `Yeay! Barang "${result.data.item.name}" (${result.data.item.item_code}) berhasil ditemukan dan siap diproses ♪`;
            }
            return `Yeay! Paket Kit "${result.data.kit.kit_name}" (${result.data.kit.kit_code}) berhasil ditemukan ♪`;
          },
          errorTitle: "Barcode Tidak Ditemukan...",
          errorMessage: (err) =>
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : `Yah, kode "${trimmed}" belum ketemu di database. Coba cek ulang stikernya ya!`,
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        () => lookupScanTargetAction(trimmed),
      );

      if (clearInputAfter) {
        setCodeInput("");
      }
      if (!res.ok) {
        setMatched(null);
        setFeedback({ type: "error", text: res.error });
        return;
      }
      applyLookupState(res.data);
    } catch (err) {
      setMatched(null);
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Terjadi kendala saat mencari kode barcode.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void performLookup(codeInput, true);
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
        const msg = "Tidak ada kamera yang terdeteksi pada perangkat ini.";
        setCameraError(msg);
        showError({
          title: "Kamera Tidak Terdeteksi",
          message: "Yah, tidak ada kamera yang ditemukan di perangkat ini. Kamu bisa pakai USB Scanner atau unggah foto barcode ya!",
        });
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
          void performLookup(decodedText, true);
        },
        () => {
          // Per-frame decode miss is expected while aiming
        },
      );

      setCameraActive(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Gagal mengakses kamera: ${err.message}`
          : "Gagal mengaktifkan kamera pemindai.";
      setCameraError(msg);
      showError({
        title: "Kamera Gagal Dibuka...",
        message: `${msg} Pastikan izin kamera browser sudah diaktifkan ya!`,
      });
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
    showWorking({
      title: "Membaca Foto Barcode...",
      message: "Dino Joguman lagi menerawang kode QR / barcode dari gambar yang kamu unggah nih! Tunggu sebentar ya~",
    });
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
      await performLookup(decodedText, true);
    } catch {
      const msg = "Barcode / QR Code tidak terbaca pada gambar tersebut.";
      setCameraError(msg);
      showError({
        title: "Foto Tidak Terbaca...",
        message: "Yah, barcode atau QR Code kurang jelas pada foto itu. Coba unggah foto yang lebih terang dan fokus ya!",
      });
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

  const handleBorrowItem = async () => {
    if (matched?.kind !== "item") return;
    const item = matched.item;
    setFeedback(null);
    setIsPending(true);
    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Mencatat Peminjaman...",
          workingMessage: `Dino Joguman lagi nyatet peminjaman "${item.name}" ke ruangan ${borrowRoom} nih! Tunggu sebentar ya~`,
          successTitle: "Berhasil Dipinjam! ♪",
          successMessage: (result) =>
            result.ok && result.message
              ? result.message
              : `Yeay! "${item.name}" siap dipakai di ruangan ${borrowRoom}. Jangan lupa dikembalikan setelah sesi ya~`,
          errorTitle: "Gagal Mencatat Peminjaman...",
          errorMessage: (err) =>
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : "Yah, peminjaman gagal dicatat kali ini. Coba ulangi lagi ya!",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        async () => {
          const actionRes = await borrowItemViaScanAction({
            itemId: item.id,
            roomCode: borrowRoom,
            notes: borrowNotes.trim() || null,
          });
          if (actionRes.ok) {
            await refreshMatched(item.item_code);
          }
          return actionRes;
        },
      );

      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Peminjaman berhasil dicatat." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal mencatat peminjaman.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleReturnItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (matched?.kind !== "item") return;
    const item = matched.item;
    const activeBorrowId = matched.activeBorrow?.id ?? null;
    setFeedback(null);
    setIsPending(true);

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Menyimpan Pengembalian...",
          workingMessage: `Dino Joguman lagi ngecek kelengkapan part & sanitasi untuk "${item.name}" nih! Sebentar ya~`,
          successTitle: "Pengembalian Tercatat! ✨",
          successMessage: (result) =>
            result.ok && result.message
              ? result.message
              : `Yeay! Pengembalian "${item.name}" dan verifikasi kondisinya sudah tersimpan rapi ♪`,
          errorTitle: "Gagal Simpan Pengembalian...",
          errorMessage: (err) =>
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : "Yah, pengembalian gagal disimpan. Coba cek datanya lagi ya!",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        async () => {
          const actionRes = await returnItemViaScanAction({
            itemId: item.id,
            transactionId: activeBorrowId,
            partsAfter: returnPartsAfter,
            hygieneStatus: returnHygiene,
            conditionOverride: returnCondition,
            notes: returnNotes.trim() || null,
          });
          if (actionRes.ok) {
            await refreshMatched(item.item_code);
          }
          return actionRes;
        },
      );

      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Pengembalian berhasil dicatat." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal mencatat pengembalian.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleQuickOpname = async (event: React.FormEvent) => {
    event.preventDefault();
    if (matched?.kind !== "item") return;
    const item = matched.item;
    setFeedback(null);
    setIsPending(true);

    try {
      const res = await runWithFeedback(
        {
          mode: "working",
          workingTitle: "Menyimpan Stock Opname...",
          workingMessage: `Dino Joguman lagi nyatet hasil verifikasi fisik & stok untuk "${item.name}" biar buku inventaris makin rapi~`,
          successTitle: "Stock Opname Selesai! ♪",
          successMessage: (result) =>
            result.ok && result.message
              ? result.message
              : `Yeay! Hasil Stock Opname "${item.name}" sudah tercatat aman!`,
          errorTitle: "Gagal Simpan Stock Opname...",
          errorMessage: (err) =>
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : "Yah, hasil stock opname gagal tersimpan. Coba ulangi lagi ya!",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        async () => {
          const actionRes = await quickStockOpnameAction({
            itemId: item.id,
            currentParts: opnameParts,
            stockQty: opnameStock,
            hygieneStatus: opnameHygiene,
            condition: opnameCondition,
            notes: opnameNotes.trim() || null,
          });
          if (actionRes.ok) {
            await refreshMatched(item.item_code);
          }
          return actionRes;
        },
      );

      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Stock Opname berhasil dicatat." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal mencatat Stock Opname.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleCheckoutKit = async () => {
    if (matched?.kind !== "kit") return;
    const kit = matched.kit;
    const bundleCount = matched.bundledItems.length;
    const isMultiItemKit = bundleCount > 1;
    setFeedback(null);
    setIsPending(true);

    try {
      const res = await runWithFeedback(
        {
          mode: isMultiItemKit ? "batch" : "working",
          workingTitle: isMultiItemKit
            ? "Check-Out Paket Kit..."
            : "Mencatat Check-Out Kit...",
          workingMessage: isMultiItemKit
            ? `Tim mini lagi ngebut nyiapin & nyatet check-out paket "${kit.kit_name}" (${bundleCount} item sekaligus) ke ruangan ${borrowRoom}~`
            : `Dino Joguman lagi nyatet check-out kit "${kit.kit_name}" ke ruangan ${borrowRoom} nih~`,
          successTitle: "Kit Siap Dipakai! ✨",
          successMessage: (result) =>
            result.ok && result.message
              ? result.message
              : `Yeay! Paket Kit "${kit.kit_name}" berhasil di-check-out ke ${borrowRoom} ♪`,
          errorTitle: "Gagal Check-Out Kit...",
          errorMessage: (err) =>
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : "Yah, kit gagal di-check-out kali ini. Coba cek status kitnya lagi ya!",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        async () => {
          const actionRes = await checkoutKitAction(kit.id, {
            roomCode: borrowRoom,
            notes: borrowNotes.trim() || null,
          });
          if (actionRes.ok) {
            await refreshMatched(kit.kit_code);
          }
          return actionRes;
        },
      );

      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Kit berhasil di-check-out." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal melakukan check-out kit.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleReturnKit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (matched?.kind !== "kit") return;
    const kit = matched.kit;
    const bundleCount = matched.bundledItems.length;
    const isMultiItemKit = bundleCount > 1;
    setFeedback(null);

    const itemUpdates = matched.bundledItems.map((item) => ({
      itemId: item.id,
      currentParts: kitReturnParts[item.id] ?? item.current_parts,
      hygieneStatus: item.asset_type === "THERAPY_TOY" ? returnHygiene : undefined,
    }));

    setIsPending(true);
    try {
      const res = await runWithFeedback(
        {
          mode: isMultiItemKit ? "batch" : "working",
          workingTitle: isMultiItemKit
            ? "Verifikasi Pengembalian Kit..."
            : "Mencatat Pengembalian Kit...",
          workingMessage: isMultiItemKit
            ? `Tim mini lagi ngecek kelengkapan ${bundleCount} item & status sanitasi dalam "${kit.kit_name}" sekaligus nih, santai sebentar ya~`
            : `Dino Joguman lagi mencatat pengembalian kit "${kit.kit_name}" nih~`,
          successTitle: "Kit Berhasil Dikembalikan! ♪",
          successMessage: (result) =>
            result.ok && result.message
              ? result.message
              : `Yeay! Semua item di paket "${kit.kit_name}" sudah terverifikasi kembali dengan rapi ✨`,
          errorTitle: "Gagal Kembalikan Kit...",
          errorMessage: (err) =>
            typeof err === "string"
              ? err
              : err instanceof Error
                ? err.message
                : "Yah, pengembalian kit gagal dicatat. Coba cek kembali datanya ya!",
          isResultError: (result) => (!result.ok ? result.error : null),
        },
        async () => {
          const actionRes = await returnKitAction(kit.id, {
            hygieneStatus: returnHygiene,
            itemUpdates,
            notes: returnNotes.trim() || null,
          });
          if (actionRes.ok) {
            await refreshMatched(kit.kit_code);
          }
          return actionRes;
        },
      );

      if (!res.ok) {
        setFeedback({ type: "error", text: res.error });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Kit berhasil dikembalikan." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal mencatat pengembalian kit.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const focusScannerInput = () => {
    setCodeInput("");
    scannerInputRef.current?.focus();
  };

  return (
    <div className="space-y-6">
      <KawaiiPageHeader
        badge={canValidateOpname ? "POS Pemindai & Opname" : "POS Pemindai Alat"}
        title={
          canValidateOpname
            ? "Scan Pinjam, Kembali & Stock Opname"
            : "Scan Pinjam & Kembalikan Alat"
        }
        description="Mendukung Kamera QR/Barcode, USB Laser Scanner Gun (Enter otomatis), dan input manual kode SC-/KIT-/URL."
        accent="mint"
        mascot="scan"
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={focusScannerInput}
            className="rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] font-bold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#FDE68A] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-100"
          >
            <ScanLine className="size-4" />
            Fokus Scanner USB
          </Button>
        }
      />

      {feedback && (
        <Alert
          variant={feedback.type === "error" ? "destructive" : "default"}
          className={
            feedback.type === "success"
              ? "rounded-2xl border-2 border-[#2C2623] bg-[#ECFDF5] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100"
              : "rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] shadow-[3px_3px_0px_0px_#2C2623] dark:border-rose-500 dark:bg-rose-950/50"
          }
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 text-[#2AB673]" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          <AlertDescription className="font-semibold">{feedback.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Scanner Input & Camera */}
        <div className="space-y-5 lg:col-span-5">
          {/* USB / Manual Input Card */}
          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#FEF3C7]/75 pb-4 dark:border-stone-600 dark:bg-amber-950/35">
              <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <Barcode className="size-4" />
                </span>
                Input Scanner USB / Manual
              </CardTitle>
              <CardDescription className="text-[#2C2623]/75 dark:text-stone-300">
                Arahkan kursor di kotak ini lalu tembak barcode dengan USB Scanner, atau ketik kode / tempel URL <code>/inventory/[id]</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <Input
                  ref={scannerInputRef}
                  autoFocus
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="SC-SNS-R01-0001 / KIT-R01-01 / URL…"
                  className="rounded-xl border-2 border-[#2C2623] bg-white font-mono text-sm font-semibold shadow-[2px_2px_0px_0px_#2C2623] focus-visible:ring-[#2AB673] dark:border-stone-500 dark:bg-stone-900"
                  disabled={isPending}
                />
                <Button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl border-2 border-[#2C2623] bg-[#2AB673] px-5 font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#229c61] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : "Cari"}
                </Button>
              </form>
              {lastScannedCode && (
                <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] px-3 py-1 text-xs font-semibold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-sky-950/60 dark:text-sky-100">
                  <Sparkles className="size-3.5 text-[#0284C7] dark:text-sky-300" />
                  <span>Terakhir dicari:</span>
                  <span className="font-mono font-extrabold">{lastScannedCode}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2D Cartoon Camera Viewfinder Card */}
          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE]/80 pb-4 dark:border-stone-600 dark:bg-sky-950/35">
              <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FDE68A] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
                  <QrCode className="size-4" />
                </span>
                Kamera Pemindai QR / Barcode
              </CardTitle>
              <CardDescription className="text-[#2C2623]/75 dark:text-stone-300">
                Gunakan kamera perangkat atau unggah foto barcode untuk verifikasi cepat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4">
              {cameraError && (
                <Alert
                  variant="destructive"
                  className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] shadow-[2px_2px_0px_0px_#2C2623] dark:border-rose-500 dark:bg-rose-950/40"
                >
                  <AlertDescription className="font-semibold">{cameraError}</AlertDescription>
                </Alert>
              )}

              {cameras.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wide text-[#2C2623]/80 dark:text-stone-300">
                    Pilih Kamera
                  </Label>
                  <Select
                    value={selectedCameraId}
                    onValueChange={setSelectedCameraId}
                    disabled={cameraActive || cameraBusy}
                  >
                    <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white font-semibold dark:border-stone-500 dark:bg-stone-900">
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

              {/* Charming 2D Cartoon Viewfinder Frame */}
              <div className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF8EB] p-2.5 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900/90">
                {/* Viewfinder Top Mini Status Strip */}
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        cameraActive
                          ? "size-2.5 animate-pulse rounded-full border border-[#2C2623] bg-[#2AB673]"
                          : cameraBusy
                            ? "size-2.5 animate-bounce rounded-full border border-[#2C2623] bg-[#7CC4FA]"
                            : "size-2.5 rounded-full border border-[#2C2623] bg-[#FDE68A]"
                      }
                    />
                    <span className="text-[11px] font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                      {cameraActive
                        ? "Kamera Aktif · Memindai"
                        : cameraBusy
                          ? "Menyiapkan Lensa..."
                          : "Viewfinder Siap ✨"}
                    </span>
                  </div>
                  <span className="rounded-full border border-[#2C2623] bg-[#FFE4E6] px-2 py-0.5 font-mono text-[10px] font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-200">
                    QR · CODE-128
                  </span>
                </div>

                {/* Inner Lens Viewport — #starops-html5-qrcode-reader stays child-free for html5-qrcode */}
                <div className="relative overflow-hidden rounded-xl border-2 border-[#2C2623] bg-[#F5EFE6] dark:border-stone-600 dark:bg-stone-950">
                  <div
                    id={QR_READER_ELEMENT_ID}
                    className="min-h-[215px] w-full overflow-hidden"
                  />

                  {/* Cartoon Corner Brackets Overlay */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-3 z-10"
                  >
                    <span
                      className={
                        cameraActive
                          ? "absolute top-0 left-0 size-6 rounded-tl-xl border-t-4 border-l-4 border-[#2AB673]"
                          : "absolute top-0 left-0 size-6 rounded-tl-xl border-t-4 border-l-4 border-[#2C2623]/75 dark:border-stone-400"
                      }
                    />
                    <span
                      className={
                        cameraActive
                          ? "absolute top-0 right-0 size-6 rounded-tr-xl border-t-4 border-r-4 border-[#2AB673]"
                          : "absolute top-0 right-0 size-6 rounded-tr-xl border-t-4 border-r-4 border-[#2C2623]/75 dark:border-stone-400"
                      }
                    />
                    <span
                      className={
                        cameraActive
                          ? "absolute bottom-0 left-0 size-6 rounded-bl-xl border-b-4 border-l-4 border-[#2AB673]"
                          : "absolute bottom-0 left-0 size-6 rounded-bl-xl border-b-4 border-l-4 border-[#2C2623]/75 dark:border-stone-400"
                      }
                    />
                    <span
                      className={
                        cameraActive
                          ? "absolute right-0 bottom-0 size-6 rounded-br-xl border-r-4 border-b-4 border-[#2AB673]"
                          : "absolute right-0 bottom-0 size-6 rounded-br-xl border-r-4 border-b-4 border-[#2C2623]/75 dark:border-stone-400"
                      }
                    />
                    {cameraActive && (
                      <div className="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 animate-pulse rounded-full bg-[#2AB673]/85 shadow-[0_0_10px_#2AB673]" />
                    )}
                  </div>

                  {/* Friendly Standby Placeholder Overlay */}
                  {!cameraActive && !cameraBusy && (
                    <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 p-5 text-center">
                      <div className="flex size-12 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-emerald-950/70 dark:text-emerald-200">
                        <Camera className="size-6" />
                      </div>
                      <p className="text-xs font-extrabold text-[#2C2623] dark:text-stone-200">
                        Arahkan kamera ke stiker QR / Barcode
                      </p>
                      <p className="max-w-[220px] text-[11px] font-medium text-[#2C2623]/70 dark:text-stone-400">
                        Klik tombol Mulai Kamera atau unggah foto stiker di bawah ini!
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Playful Mode Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {!cameraActive ? (
                  <Button
                    type="button"
                    onClick={startCamera}
                    disabled={cameraBusy}
                    className="flex-1 rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#229c61] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
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
                    className="flex-1 rounded-xl border-2 border-[#2C2623] bg-[#FB7185] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#F43F5E] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                  >
                    <CameraOff className="size-4" />
                    Hentikan Kamera
                  </Button>
                )}

                <Label
                  htmlFor="scan-file-upload"
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#2C2623] bg-[#EDE9FE] px-3.5 text-xs font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#DDD6FE] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none dark:border-stone-500 dark:bg-violet-950/70 dark:text-violet-100"
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
            <Card className="flex min-h-[380px] flex-col items-center justify-center rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] p-6 shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <KawaiiEmptyState
                mascot="scan"
                title="Siap Memindai Barang atau Kit!"
                description={
                  canValidateOpname
                    ? "Scan stiker barcode / QR Code pada mainan terapi, aset kantor, atau kit untuk mencatat peminjaman, pengembalian, status sanitasi, atau stock opname."
                    : "Scan stiker barcode / QR Code pada mainan terapi atau paket kit untuk mencatat peminjaman, pengembalian, dan status kebersihan."
                }
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <Button
                      type="button"
                      onClick={focusScannerInput}
                      className="rounded-xl border-2 border-[#2C2623] bg-[#A7F3D0] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#6EE7B7] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                    >
                      <ScanLine className="size-4" />
                      Fokus Kotak Scan
                    </Button>
                    {!cameraActive && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={startCamera}
                        disabled={cameraBusy}
                        className="rounded-xl border-2 border-[#2C2623] bg-[#E0F2FE] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#BAE6FD] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                      >
                        <Camera className="size-4" />
                        Buka Kamera
                      </Button>
                    )}
                  </div>
                }
                className="w-full border-0 bg-transparent shadow-none"
              />
            </Card>
          ) : matched.kind === "item" ? (
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-gradient-to-r from-[#D1FAE5]/80 via-[#FFFDF7] to-[#E0F2FE]/75 pb-4 dark:border-stone-600 dark:from-emerald-950/45 dark:via-card dark:to-sky-950/35">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    {matched.photoSignedUrl ? (
                      <div className="size-16 shrink-0 overflow-hidden rounded-2xl border-2 border-[#2C2623] bg-white shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={matched.photoSignedUrl}
                          alt={matched.item.name}
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] text-xs font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-amber-950/70 dark:text-amber-100">
                        {matched.item.category_prefix}
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="rounded-full border-2 border-[#2C2623] bg-white font-mono text-xs font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                        >
                          {matched.item.item_code}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="rounded-full border-2 border-[#2C2623] bg-[#FFE4E6] text-xs font-bold text-[#2C2623] dark:border-stone-500 dark:bg-rose-950/60 dark:text-rose-100"
                        >
                          {ASSET_TYPE_LABELS[matched.item.asset_type]}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl font-black text-[#2C2623] dark:text-stone-100">
                        {matched.item.name}
                      </CardTitle>
                      <CardDescription className="font-medium text-[#2C2623]/75 dark:text-stone-300">
                        {matched.item.category} · {matched.item.room_code} (
                        {LOCATION_LABELS[matched.item.room_code]})
                        {matched.item.rack_location ? ` · ${matched.item.rack_location}` : ""}
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="rounded-xl border-2 border-[#2C2623] bg-white font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <Link href={`/inventory/${matched.item.id}`}>
                      Detail
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-stone-900/60">
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
                  <Alert
                    variant="warning"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFEDD5] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
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
                      canValidateOpname
                        ? "grid h-auto w-full grid-cols-3 gap-1.5 rounded-2xl border-2 border-[#2C2623] bg-[#F5EFE6] p-1.5 dark:border-stone-500 dark:bg-stone-800"
                        : "grid h-auto w-full grid-cols-2 gap-1.5 rounded-2xl border-2 border-[#2C2623] bg-[#F5EFE6] p-1.5 dark:border-stone-500 dark:bg-stone-800"
                    }
                  >
                    <TabsTrigger
                      value="borrow"
                      className="rounded-xl py-2 font-extrabold transition-all data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#A7F3D0] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      <ArrowLeftRight className="size-3.5" />
                      Pinjam
                    </TabsTrigger>
                    <TabsTrigger
                      value="return"
                      className="rounded-xl py-2 font-extrabold transition-all data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#BAE6FD] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                    >
                      <CheckCircle2 className="size-3.5" />
                      Kembalikan
                    </TabsTrigger>
                    {canValidateOpname && (
                      <TabsTrigger
                        value="opname"
                        className="rounded-xl py-2 font-extrabold transition-all data-[state=active]:border-2 data-[state=active]:border-[#2C2623] data-[state=active]:bg-[#DDD6FE] data-[state=active]:text-[#2C2623] data-[state=active]:shadow-[2px_2px_0px_0px_#2C2623]"
                      >
                        <ClipboardCheck className="size-3.5" />
                        Stock Opname
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="borrow" className="space-y-4 pt-3">
                    <div className="space-y-2">
                      <Label className="font-bold">Ruangan Penggunaan</Label>
                      <Select
                        value={borrowRoom}
                        onValueChange={(v) => setBorrowRoom(v as LocationCode)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
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
                      <Label htmlFor="scan-borrow-notes" className="font-bold">
                        Catatan Peminjaman (Opsional)
                      </Label>
                      <Textarea
                        id="scan-borrow-notes"
                        rows={2}
                        value={borrowNotes}
                        onChange={(e) => setBorrowNotes(e.target.value)}
                        placeholder="Contoh: Sesi terapi pukul 14.00…"
                        disabled={isPending}
                        className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-11 w-full rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#229c61] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                      onClick={() => void handleBorrowItem()}
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
                    <form onSubmit={(e) => void handleReturnItem(e)} className="space-y-4">
                      {matched.activeBorrow && !matched.canReturnActiveBorrow && (
                        <Alert
                          variant="destructive"
                          className="rounded-2xl border-2 border-[#2C2623] bg-[#FFF1F2] shadow-[2px_2px_0px_0px_#2C2623]"
                        >
                          <AlertDescription className="font-semibold">
                            Transaksi ini dipinjam oleh {matched.activeBorrow.borrower_name}. Hanya
                            peminjam atau {ROLE_LABELS.TEAM_LEADER.title}/
                            {ROLE_LABELS.SUPER_ADMIN.title} yang dapat menyelesaikan pengembalian
                            ini.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="return-parts-after" className="font-bold">
                            Verifikasi Part Kembali ({matched.item.unit_label})
                          </Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full border-2 border-[#2C2623] bg-[#D1FAE5] px-2.5 text-xs font-extrabold text-[#2C2623] hover:bg-[#A7F3D0]"
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
                            className="rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FECDD3]"
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
                            className="rounded-xl border-2 border-[#2C2623] bg-white text-center font-mono font-bold dark:border-stone-500 dark:bg-stone-900"
                            disabled={isPending}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="rounded-xl border-2 border-[#2C2623] bg-[#D1FAE5] font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#A7F3D0]"
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
                            <Alert
                              variant="warning"
                              className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]"
                            >
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
                          <Label className="font-bold">Status Kebersihan Setelah Sesi</Label>
                          <Select
                            value={returnHygiene}
                            onValueChange={(v) => setReturnHygiene(v as HygieneStatus)}
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
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
                          <Label className="font-bold">Kondisi Barang</Label>
                          <Select
                            value={returnCondition}
                            onValueChange={(v) => setReturnCondition(v as ItemCondition)}
                            disabled={
                              isPending ||
                              (matched.item.condition === "DIHAPUSBUKU" && !canApproveWriteoff)
                            }
                          >
                            <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
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
                        <Label htmlFor="scan-return-notes" className="font-bold">
                          Catatan Pengembalian (Opsional)
                        </Label>
                        <Textarea
                          id="scan-return-notes"
                          rows={2}
                          value={returnNotes}
                          onChange={(e) => setReturnNotes(e.target.value)}
                          placeholder="Catat bagian yang hilang atau kerusakan…"
                          disabled={isPending}
                          className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="h-11 w-full rounded-xl border-2 border-[#2C2623] bg-[#7CC4FA] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#60B6F8] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
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
                      <form onSubmit={(e) => void handleQuickOpname(e)} className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="opname-parts" className="font-bold">
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
                              className="rounded-xl border-2 border-[#2C2623] bg-white font-mono font-bold dark:border-stone-500 dark:bg-stone-900"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="opname-stock" className="font-bold">
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
                              className="rounded-xl border-2 border-[#2C2623] bg-white font-mono font-bold dark:border-stone-500 dark:bg-stone-900"
                            />
                            {!canEditMasterStock && (
                              <p className="text-muted-foreground text-[11px]">
                                Selisih stok akan dicatat ke log audit untuk peninjauan{" "}
                                {ROLE_LABELS.SUPER_ADMIN.title}.
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label className="font-bold">Status Sanitasi</Label>
                            <Select
                              value={opnameHygiene}
                              onValueChange={(v) => setOpnameHygiene(v as HygieneStatus)}
                              disabled={isPending}
                            >
                              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
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
                            <Label className="font-bold">Kondisi Fisik</Label>
                            <Select
                              value={opnameCondition}
                              onValueChange={(v) => setOpnameCondition(v as ItemCondition)}
                              disabled={
                                isPending ||
                                (matched.item.condition === "DIHAPUSBUKU" && !canApproveWriteoff)
                              }
                            >
                              <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
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
                          <Label htmlFor="opname-notes" className="font-bold">
                            Catatan Stock Opname
                          </Label>
                          <Textarea
                            id="opname-notes"
                            rows={2}
                            value={opnameNotes}
                            onChange={(e) => setOpnameNotes(e.target.value)}
                            placeholder="Catatan lokasi aktual atau hasil pemeriksaan fisik…"
                            disabled={isPending}
                            className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                          />
                        </div>

                        <Button
                          type="submit"
                          variant="secondary"
                          className="h-11 w-full rounded-xl border-2 border-[#2C2623] bg-[#DDD6FE] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#C4B5FD] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
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
            <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
              <CardHeader className="border-b-2 border-[#2C2623] bg-gradient-to-r from-[#EDE9FE]/85 via-[#FFFDF7] to-[#FFE4E6]/75 pb-4 dark:border-stone-600 dark:from-violet-950/45 dark:via-card dark:to-rose-950/35">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="rounded-full border-2 border-[#2C2623] bg-white font-mono text-xs font-extrabold text-[#2C2623] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                      >
                        <Package className="mr-1 size-3" />
                        {matched.kit.kit_code}
                      </Badge>
                      <KitStatusBadge status={matched.kit.status} />
                      {matched.kit.assigned_room && (
                        <Badge
                          variant="secondary"
                          className="rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] font-bold text-[#2C2623] dark:border-stone-500 dark:bg-sky-950/60 dark:text-sky-100"
                        >
                          {matched.kit.assigned_room} · {LOCATION_LABELS[matched.kit.assigned_room]}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl font-black text-[#2C2623] dark:text-stone-100">
                      {matched.kit.kit_name}
                    </CardTitle>
                    {matched.kit.description && (
                      <CardDescription className="text-[#2C2623]/75 dark:text-stone-300">
                        {matched.kit.description}
                      </CardDescription>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="rounded-xl border-2 border-[#2C2623] bg-white font-bold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:-translate-y-0.5 hover:bg-[#FEF3C7] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <Link href="/kits">
                      Lihat Semua Kit
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-5">
                {matched.activeBorrow && (
                  <Alert
                    variant="warning"
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#FFEDD5] text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100"
                  >
                    <AlertTriangle className="size-4" />
                    <AlertTitle className="font-extrabold">
                      Kit Sedang Dipinjam ({matched.activeBorrow.transaction_code})
                    </AlertTitle>
                    <AlertDescription>
                      Oleh <strong>{matched.activeBorrow.borrower_name || "Terapis"}</strong> sejak{" "}
                      {formatDateWIB(matched.activeBorrow.borrowed_at, true)}.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFFBEB] p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-stone-900/60">
                  <p className="text-xs font-extrabold tracking-wide text-[#2C2623] uppercase dark:text-stone-200">
                    Item dalam Kit ({matched.bundledItems.length} item)
                  </p>
                  <ul className="divide-y-2 divide-dashed divide-[#2C2623]/15 dark:divide-stone-700">
                    {matched.bundledItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                      >
                        <div>
                          <p className="font-bold text-[#2C2623] dark:text-stone-100">
                            {item.name}
                          </p>
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
                      <Label className="font-bold">Ruangan Penggunaan</Label>
                      <Select
                        value={borrowRoom}
                        onValueChange={(v) => setBorrowRoom(v as LocationCode)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
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
                      <Label htmlFor="kit-borrow-notes" className="font-bold">
                        Catatan Check-Out (Opsional)
                      </Label>
                      <Textarea
                        id="kit-borrow-notes"
                        rows={2}
                        value={borrowNotes}
                        onChange={(e) => setBorrowNotes(e.target.value)}
                        className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-11 w-full rounded-xl border-2 border-[#2C2623] bg-[#2AB673] font-extrabold text-white shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#229c61] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
                      onClick={() => void handleCheckoutKit()}
                      disabled={isPending || matched.kit.status === "NONAKTIF"}
                    >
                      {isPending && <Loader2 className="size-4 animate-spin" />}
                      Check-Out Kit (1 Klik)
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={(e) => void handleReturnKit(e)} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="font-bold">Status Kebersihan Mainan Setelah Sesi</Label>
                      <Select
                        value={returnHygiene}
                        onValueChange={(v) => setReturnHygiene(v as HygieneStatus)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900">
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
                      <div className="space-y-2.5 rounded-2xl border-2 border-[#2C2623] bg-white p-3.5 shadow-[2px_2px_0px_0px_#2C2623] dark:border-stone-600 dark:bg-stone-900">
                        <Label className="text-xs font-extrabold uppercase tracking-wide">
                          Verifikasi Part Kembali Per Item
                        </Label>
                        <div className="space-y-2.5">
                          {matched.bundledItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-bold">{item.name}</p>
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
                                className="h-8 w-20 rounded-xl border-2 border-[#2C2623] text-right font-mono font-bold dark:border-stone-500"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="kit-return-notes-scan" className="font-bold">
                        Catatan Pengembalian
                      </Label>
                      <Textarea
                        id="kit-return-notes-scan"
                        rows={2}
                        value={returnNotes}
                        onChange={(e) => setReturnNotes(e.target.value)}
                        className="rounded-xl border-2 border-[#2C2623] bg-white dark:border-stone-500 dark:bg-stone-900"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="h-11 w-full rounded-xl border-2 border-[#2C2623] bg-[#7CC4FA] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#60B6F8] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none"
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

      {/* Recent Activity Feed */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card dark:shadow-[4px_4px_0px_0px_#0c0a09]">
        <CardHeader className="border-b-2 border-[#2C2623] bg-[#FFEDD5]/75 pb-4 dark:border-stone-600 dark:bg-orange-950/35">
          <CardTitle className="flex items-center gap-2.5 text-base font-extrabold text-[#2C2623] dark:text-stone-100">
            <span className="inline-flex size-8 items-center justify-center rounded-xl border-2 border-[#2C2623] bg-[#FFE4E6] text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623]">
              <History className="size-4" />
            </span>
            Aktivitas Peminjaman & Pengembalian Terbaru
          </CardTitle>
          <CardDescription className="text-[#2C2623]/75 dark:text-stone-300">
            Klik stiker kode untuk memuat barang atau kit langsung ke panel pemindai.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentFeed.length === 0 ? (
            <div className="p-6">
              <KawaiiEmptyState
                mascot="history"
                title="Belum Ada Riwayat Peminjaman"
                description="Setelah ada alat atau kit yang dipinjam atau dikembalikan lewat pemindai, riwayatnya akan tampil rapi di sini!"
                className="border-0 bg-transparent shadow-none"
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-[#2C2623] bg-[#FEF3C7]/70 dark:border-stone-600 dark:bg-stone-800/80">
                  <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                    Kode Trx
                  </TableHead>
                  <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                    Item / Kit
                  </TableHead>
                  <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                    Peminjam
                  </TableHead>
                  <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                    Part
                  </TableHead>
                  <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                    Waktu
                  </TableHead>
                  <TableHead className="font-extrabold text-[#2C2623] dark:text-stone-100">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFeed.map((row) => (
                  <TableRow
                    key={row.id}
                    className="transition-colors hover:bg-[#FEF3C7]/35 dark:hover:bg-stone-800/50"
                  >
                    <TableCell className="font-mono text-xs font-semibold">
                      {row.transaction_code}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {row.target_code !== "-" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCodeInput(row.target_code);
                            void performLookup(row.target_code, false);
                          }}
                          className="mb-1 inline-flex items-center rounded-lg border-2 border-[#2C2623] bg-[#E0F2FE] px-2 py-0.5 text-left font-mono text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] transition-all hover:-translate-y-0.5 hover:bg-[#BAE6FD] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none dark:border-stone-500 dark:bg-sky-950/70 dark:text-sky-100"
                        >
                          {row.target_code}
                        </button>
                      ) : (
                        <span className="font-mono text-xs">-</span>
                      )}
                      <p className="text-muted-foreground text-xs font-medium">
                        {row.target_name}
                      </p>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {row.borrower_name || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold">
                      {row.parts_before ?? "-"} → {row.parts_after ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">
                      <div className="font-semibold">
                        Pinjam: {formatDateWIB(row.borrowed_at, true)}
                      </div>
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
                        className="rounded-full border-[1.5px] border-[#2C2623] font-bold dark:border-stone-500"
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
