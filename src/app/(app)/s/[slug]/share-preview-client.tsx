"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  MapPin,
  Package,
  QrCode,
  Share2,
  ShieldAlert,
  Truck,
} from "lucide-react";

import { KawaiiPageHeader } from "@/components/cartoon/kawaii-decor";
import {
  SharePreviewDialog,
  type ShareDialogTarget,
} from "@/components/share/share-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DeliveryPayloadItem } from "@/lib/actions/deliveries";
import {
  ASSET_TYPE_LABELS,
  ARCHIVE_STATUS_LABELS,
  BORROW_STATUS_LABELS,
  CATEGORY_PREFIX_LABELS,
  CONDITION_LABELS,
  DELIVERY_DIRECTION_LABELS,
  DELIVERY_STATUS_LABELS,
  formatDateWIB,
  formatRupiah,
} from "@/lib/constants";
import { buildShortSharePath } from "@/lib/share-links";
import {
  AssetTypeBadge,
  ConditionBadge,
  HygieneBadge,
  PartProgressIndicator,
} from "@/app/(app)/inventory/inventory-badges";
import type {
  ArchiveHybrid,
  BorrowStatus,
  DeliveryLog,
  ItemMaster,
} from "@/types/database";

export type ArchiveFilePreviewKind = "pdf" | "image" | "other";

type SharePreviewClientProps =
  | {
      mode: "ITEM";
      slug: string;
      canCustomize: boolean;
      item: ItemMaster;
      roomLabel: string;
      parentItem: Pick<ItemMaster, "id" | "item_code" | "name"> | null;
      childCount: number;
      activeBorrow: {
        transactionCode: string;
        borrowerName: string;
        borrowedAt: string;
        status: BorrowStatus;
      } | null;
      signedPhotoUrl: string | null;
      canViewValuation: boolean;
      bookValue: number;
      todayWib: string;
    }
  | {
      mode: "ARCHIVE";
      slug: string;
      canCustomize: boolean;
      archive: ArchiveHybrid;
      cabinetLabel: string;
      borrowerName: string | null;
      signedPreviewUrl: string | null;
      signedDownloadUrl: string | null;
      previewKind: ArchiveFilePreviewKind;
      safeDriveLink: string | null;
    }
  | {
      mode: "DELIVERY";
      slug: string;
      canCustomize: boolean;
      delivery: DeliveryLog;
      payloadItems: DeliveryPayloadItem[];
      signedProofUrl: string | null;
    }
  | {
      mode: "RESTRICTED_ARCHIVE";
      slug: string;
    }
  | {
      mode: "RESTRICTED_DELIVERY";
      slug: string;
    };

export function SharePreviewClient(props: SharePreviewClientProps) {
  const router = useRouter();
  const [shareOpen, setShareOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  if (props.mode === "RESTRICTED_ARCHIVE" || props.mode === "RESTRICTED_DELIVERY") {
    const isDeliveryRestricted = props.mode === "RESTRICTED_DELIVERY";
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-4">
        <KawaiiPageHeader
          badge="Akses Terbatas"
          title={
            isDeliveryRestricted
              ? "Surat Jalan & Pengiriman (Khusus Admin)"
              : "Dokumen Arsip Internal Manajemen"
          }
          description={
            isDeliveryRestricted
              ? "Link pendek ini menuju catatan Surat Jalan / BAST / Pengiriman yang hanya tersedia untuk Owner dan Admin Operasional."
              : "Link pendek ini menuju arsip internal yang hanya tersedia untuk Kepala Terapis, Admin Operasional, dan Owner."
          }
          accent="peach"
          mascot={isDeliveryRestricted ? "truck" : "folder"}
          actions={
            <Button
              asChild
              variant="outline"
              className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold"
            >
              <Link href={isDeliveryRestricted ? "/dashboard" : "/archives"}>
                <ArrowLeft className="size-4" />
                {isDeliveryRestricted ? "Kembali ke Beranda" : "Kembali ke Panduan SOP"}
              </Link>
            </Button>
          }
        />

        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#FFE4E6] px-5 py-4 dark:border-stone-500 dark:bg-rose-950/50">
            <CardTitle className="flex items-center gap-2 text-base font-black text-[#2C2623] dark:text-stone-100">
              <ShieldAlert className="size-5 text-rose-700 dark:text-rose-300" />
              {isDeliveryRestricted
                ? "Pratinjau Khusus Owner & Admin Operasional"
                : "Pratinjau Tidak Dapat Dibuka dengan Akun Terapis"}
            </CardTitle>
            <CardDescription className="text-xs font-medium text-[#574E49] dark:text-stone-300">
              Alamat singkat <span className="font-mono font-bold">/s/{props.slug}</span>{" "}
              tercatat aktif, namun dibatasi sesuai peran akun Anda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5 text-sm">
            <p className="leading-relaxed text-[#463F3A] dark:text-stone-200">
              {isDeliveryRestricted ? (
                <>
                  Hubungi <strong>Admin Operasional</strong> atau <strong>Owner</strong> jika Anda
                  membutuhkan salinan Surat Jalan atau BAST pengiriman ini.
                </>
              ) : (
                <>
                  Jika Anda membutuhkan dokumen ini untuk sesi terapi atau keperluan klinik, silakan
                  hubungi <strong>Kepala Terapis</strong>, <strong>Admin Operasional</strong>, atau{" "}
                  <strong>Owner</strong> untuk mengaktifkan akses SOP publik.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {!isDeliveryRestricted && (
                <Button
                  asChild
                  className="rounded-2xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623] hover:bg-[#34D399]"
                >
                  <Link href="/archives">Lihat Panduan SOP Publik</Link>
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-2 border-[#2C2623] bg-white font-bold"
              >
                <Link href="/dashboard">Ke Beranda</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const shortPath = buildShortSharePath(props.slug);
  const fullShareUrl = origin ? `${origin}${shortPath}` : shortPath;

  const dialogTarget: ShareDialogTarget =
    props.mode === "ITEM"
      ? {
          type: "ITEM",
          id: props.item.id,
          code: props.item.item_code,
          title: props.item.name,
          locationCode: props.item.room_code,
        }
      : props.mode === "DELIVERY"
        ? {
            type: "DELIVERY",
            id: props.delivery.id,
            code: props.delivery.delivery_code,
            title:
              props.delivery.package_type?.trim() ||
              `${props.delivery.sender_name} → ${props.delivery.receiver_name}`,
            locationCode: null,
          }
        : {
            type: "ARCHIVE",
            id: props.archive.id,
            code: props.archive.doc_code,
            title: props.archive.title,
            locationCode: props.archive.cabinet_code,
          };

  async function handleCopyShortUrl() {
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareOpen(true);
    }
  }

  const topShortBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-[#2C2623] bg-gradient-to-r from-[#CCFBF1]/85 via-[#FFFDF7] to-[#FEF3C7]/75 px-4 py-3 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:from-teal-950/50 dark:via-stone-900 dark:to-amber-950/40">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#2C2623] bg-white px-2.5 py-0.5 text-[11px] font-black text-[#2C2623] dark:border-stone-400 dark:bg-stone-900 dark:text-stone-100">
          <Link2 className="size-3 text-[#115E59] dark:text-teal-300" />
          Link Pendek Pratinjau
        </span>
        <span className="max-w-full truncate rounded-xl border border-[#2C2623]/30 bg-white px-2.5 py-1 font-mono text-xs font-extrabold text-[#14532D] dark:border-stone-600 dark:bg-stone-950 dark:text-emerald-300">
          {shortPath}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCopyShortUrl}
          className="h-8 rounded-xl border-2 border-[#2C2623] bg-white text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#D1FAE5] dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100"
        >
          {copied ? (
            <>
              <Check className="size-3.5" />
              Tersalin!
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Salin Link
            </>
          )}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={() => setShareOpen(true)}
          className="h-8 rounded-xl border-2 border-[#2C2623] bg-[#FEF3C7] text-xs font-extrabold text-[#2C2623] shadow-[2px_2px_0px_0px_#2C2623] hover:bg-[#FDE68A] dark:border-stone-500"
        >
          <Share2 className="size-3.5" />
          {props.canCustomize ? "Kustomisasi & Bagikan" : "Bagikan"}
        </Button>
      </div>
    </div>
  );

  if (props.mode === "ITEM") {
    const {
      item,
      roomLabel,
      parentItem,
      childCount,
      activeBorrow,
      signedPhotoUrl,
      canViewValuation,
      bookValue,
      todayWib,
    } = props;

    const headerAccent =
      item.asset_type === "THERAPY_TOY"
        ? "mint"
        : item.asset_type === "FIXED_ASSET"
          ? "lavender"
          : "peach";

    return (
      <div className="mx-auto max-w-5xl space-y-5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-full bg-[#FFFDF7] font-bold dark:bg-stone-900"
          >
            <Link href="/inventory">
              <ArrowLeft className="size-4" />
              Semua Inventaris
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-full bg-[#FFFDF7] font-bold dark:bg-stone-900"
          >
            <Link href={`/inventory/${item.id}`}>
              <Eye className="size-4" />
              Buka Halaman Detail Penuh
            </Link>
          </Button>
        </div>

        {topShortBar}

        <KawaiiPageHeader
          badge={item.item_code}
          title={item.name}
          description={`${CATEGORY_PREFIX_LABELS[item.category_prefix]} · ${item.category} · ${item.room_code} (${roomLabel})${item.rack_location ? ` · ${item.rack_location}` : ""}`}
          accent={headerAccent}
          mascot="box"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                className="rounded-2xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#34D399]"
              >
                <Link href={`/scan?code=${encodeURIComponent(item.item_code)}`}>
                  <QrCode className="size-4" />
                  Pinjam / Kembalikan
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold dark:bg-stone-900"
              >
                <Link href={`/inventory/${item.id}`}>Detail Lengkap →</Link>
              </Button>
            </div>
          }
        />

        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] px-4 py-3 shadow-[3px_3px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-card">
          <Badge
            variant="outline"
            className="rounded-full border-[1.5px] border-[#2C2623] bg-white font-mono text-xs font-extrabold dark:border-stone-400 dark:bg-stone-900"
          >
            {item.item_code}
          </Badge>
          <AssetTypeBadge assetType={item.asset_type} />
          <ConditionBadge condition={item.condition} />
          <HygieneBadge
            status={item.hygiene_status}
            assetType={item.asset_type}
            nextDue={item.next_sanitization_due}
            todayWib={todayWib}
          />
          {parentItem && (
            <Link
              href={`/inventory/${parentItem.id}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-[#2C2623] bg-[#EDE9FE] px-3 py-0.5 text-xs font-bold text-[#4C1D95] hover:-translate-y-0.5 sm:ml-auto dark:border-stone-400 dark:bg-violet-950/70 dark:text-violet-200"
            >
              <Layers className="size-3 shrink-0" />
              <span className="truncate">Induk: {parentItem.item_code}</span>
            </Link>
          )}
        </div>

        {/* Main Preview Card */}
        <div className="grid gap-5 lg:grid-cols-12 [&>*]:min-w-0">
          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] lg:col-span-5 dark:border-stone-500 dark:bg-stone-900">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#E0F2FE] px-5 py-3.5 dark:border-stone-500 dark:bg-sky-950/50">
              <CardTitle className="flex items-center gap-2 text-sm font-black text-[#2C2623] dark:text-stone-100">
                <ImageIcon className="size-4" />
                Foto &amp; Identitas Visual
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {signedPhotoUrl ? (
                <div className="overflow-hidden rounded-2xl border-2 border-[#2C2623] bg-white dark:border-stone-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedPhotoUrl}
                    alt={item.name}
                    className="aspect-square w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-[#FEF3C7]/45 p-6 text-center dark:border-stone-600 dark:bg-amber-950/20">
                  <Package className="size-12 text-[#574E49] dark:text-stone-300" />
                  <p className="font-mono text-sm font-black text-[#2C2623] dark:text-stone-100">
                    {item.item_code}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Belum ada foto barang terunggah.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] lg:col-span-7 dark:border-stone-500 dark:bg-stone-900">
            <CardHeader className="border-b-2 border-[#2C2623] bg-[#D1FAE5] px-5 py-3.5 dark:border-stone-500 dark:bg-emerald-950/50">
              <CardTitle className="flex items-center gap-2 text-sm font-black text-[#2C2623] dark:text-stone-100">
                <MapPin className="size-4" />
                Ringkasan Lokasi, Kelengkapan &amp; Peminjaman
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5 text-sm">
              {/* Active Borrow Banner */}
              {activeBorrow ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#FFE4E6] px-4 py-3 text-xs font-bold text-[#881337] dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200">
                  <span className="flex items-center gap-2">
                    <ArrowLeftRight className="size-4 shrink-0" />
                    <span>
                      Status: <strong>{BORROW_STATUS_LABELS[activeBorrow.status]}</strong> oleh{" "}
                      <strong>{activeBorrow.borrowerName}</strong> (
                      {formatDateWIB(activeBorrow.borrowedAt, true)})
                    </span>
                  </span>
                  <span className="font-mono text-[11px]">{activeBorrow.transactionCode}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border-2 border-[#2C2623] bg-[#D1FAE5]/70 px-4 py-2.5 text-xs font-extrabold text-[#115E3B] dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <Check className="size-4 shrink-0" />
                  <span>Tersedia di lokasi penyimpanan ({roomLabel})</span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3 dark:border-stone-700 dark:bg-stone-800/70">
                  <p className="text-muted-foreground text-[11px] font-semibold">
                    Lokasi Ruangan &amp; Rak
                  </p>
                  <p className="mt-0.5 font-extrabold text-[#2C2623] dark:text-stone-100">
                    {item.room_code} · {roomLabel}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {item.rack_location || "Rak belum ditentukan"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3 dark:border-stone-700 dark:bg-stone-800/70">
                  <p className="text-muted-foreground text-[11px] font-semibold">
                    Tipe &amp; Penanggung Jawab
                  </p>
                  <p className="mt-0.5 font-extrabold text-[#2C2623] dark:text-stone-100">
                    {ASSET_TYPE_LABELS[item.asset_type]}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    PIC: {item.pic_name || "Belum ditentukan"}
                    {childCount > 0 ? ` · ${childCount} sub-komponen` : ""}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3.5 dark:border-stone-700 dark:bg-stone-800/70">
                {item.asset_type === "CONSUMABLE" ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold">
                        Stok Habis Pakai Saat Ini
                      </p>
                      <p className="text-lg font-black text-[#2C2623] dark:text-stone-100">
                        {item.stock_qty} {item.unit_label}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full font-bold">
                      Min. Stok: {item.min_stock_threshold} {item.unit_label}
                    </Badge>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-[11px] font-semibold">
                      Kelengkapan Kepingan / Komponen
                    </p>
                    <PartProgressIndicator
                      currentParts={item.current_parts}
                      totalParts={item.total_parts}
                      unitLabel={item.unit_label}
                    />
                  </div>
                )}
              </div>

              {item.description && (
                <div className="rounded-2xl border border-dashed border-[#2C2623]/30 bg-[#FEF3C7]/40 p-3.5 text-xs leading-relaxed text-[#463F3A] dark:border-stone-600 dark:bg-amber-950/20 dark:text-stone-200">
                  <strong className="block text-[#2C2623] dark:text-stone-100">Catatan Item:</strong>
                  {item.description}
                </div>
              )}

              {canViewValuation && item.purchase_price > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#2C2623]/30 bg-[#EDE9FE]/55 px-4 py-3 text-xs dark:border-stone-600 dark:bg-violet-950/35">
                  <span className="flex items-center gap-1.5 font-bold text-[#4C1D95] dark:text-violet-200">
                    <Coins className="size-4" />
                    Valuasi Aset (Owner &amp; Admin):
                  </span>
                  <div className="text-left font-extrabold text-[#2C2623] sm:text-right dark:text-stone-100">
                    <span>Nilai Buku: {formatRupiah(bookValue)}</span>
                    <span className="text-muted-foreground ml-2 font-semibold">
                      (Beli: {formatRupiah(item.purchase_price)})
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <SharePreviewDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          target={dialogTarget}
          initialSlug={props.slug}
          initialCanCustomize={props.canCustomize}
          onSlugUpdated={(nextSlug) => {
            if (nextSlug !== props.slug) {
              router.replace(buildShortSharePath(nextSlug));
            }
          }}
        />
      </div>
    );
  }

  if (props.mode === "DELIVERY") {
    const { delivery, payloadItems, signedProofUrl } = props;
    return (
      <div className="mx-auto max-w-5xl space-y-5 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-full bg-[#FFFDF7] font-bold dark:bg-stone-900"
          >
            <Link href="/deliveries">
              <ArrowLeft className="size-4" />
              Semua Pengiriman &amp; Surat Jalan
            </Link>
          </Button>
        </div>

        {topShortBar}

        <KawaiiPageHeader
          badge={delivery.delivery_code}
          title={delivery.package_type || "Paket & Surat Jalan"}
          description={`${DELIVERY_DIRECTION_LABELS[delivery.direction]} · ${delivery.sender_name} → ${delivery.receiver_name} · Kurir: ${delivery.courier_name}`}
          accent="butter"
          mascot="truck"
          actions={
            <Button
              asChild
              className="rounded-2xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#34D399]"
            >
              <Link href="/deliveries">
                <Truck className="size-4" />
                Cetak Surat Jalan / BAST →
              </Link>
            </Button>
          }
        />

        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#FEF3C7] px-5 py-4 dark:border-stone-500 dark:bg-amber-950/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-black text-[#2C2623] dark:text-stone-100">
                <FileText className="size-4" />
                Ringkasan Surat Jalan &amp; Pengiriman
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="rounded-full border-2 border-[#2C2623] bg-white font-mono text-xs font-black"
                >
                  {delivery.delivery_code}
                </Badge>
                <Badge className="rounded-full border-2 border-[#2C2623] bg-[#BAE6FD] text-xs font-extrabold text-[#0C4A6E]">
                  {DELIVERY_STATUS_LABELS[delivery.status]}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3.5 dark:border-stone-700 dark:bg-stone-800/70">
                <p className="text-muted-foreground font-semibold">Pengirim</p>
                <p className="mt-0.5 text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                  {delivery.sender_name}
                </p>
                {delivery.sender_address && (
                  <p className="text-muted-foreground mt-0.5">{delivery.sender_address}</p>
                )}
              </div>

              <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3.5 dark:border-stone-700 dark:bg-stone-800/70">
                <p className="text-muted-foreground font-semibold">Penerima</p>
                <p className="mt-0.5 text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                  {delivery.receiver_name}
                </p>
                {delivery.receiver_address && (
                  <p className="text-muted-foreground mt-0.5">{delivery.receiver_address}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3 dark:border-stone-700 dark:bg-stone-800/70">
                <p className="text-muted-foreground font-semibold">Kurir &amp; Resi</p>
                <p className="mt-0.5 font-extrabold text-[#2C2623] dark:text-stone-100">
                  {delivery.courier_name}
                </p>
                <p className="text-muted-foreground font-mono text-[11px]">
                  {delivery.tracking_number || "Tanpa nomor resi"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3 dark:border-stone-700 dark:bg-stone-800/70">
                <p className="text-muted-foreground font-semibold">Tanggal &amp; PIC</p>
                <p className="mt-0.5 font-extrabold text-[#2C2623] dark:text-stone-100">
                  {formatDateWIB(delivery.created_at, true)}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  PIC: {delivery.pic_name || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3 dark:border-stone-700 dark:bg-stone-800/70">
                <p className="text-muted-foreground font-semibold">Biaya Kirim</p>
                <p className="mt-0.5 text-sm font-black text-[#14532D] dark:text-emerald-300">
                  {formatRupiah(Number(delivery.shipping_cost) || 0)}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {payloadItems.length} baris barang
                </p>
              </div>
            </div>

            {payloadItems.length > 0 && (
              <div className="space-y-2 rounded-2xl border-2 border-[#2C2623]/20 bg-white p-4 dark:border-stone-700 dark:bg-stone-800/70">
                <p className="font-black text-[#2C2623] dark:text-stone-100">
                  Rincian Barang dalam Surat Jalan / Paket ({payloadItems.length} item)
                </p>
                <ul className="divide-y divide-[#2C2623]/15 dark:divide-stone-700">
                  {payloadItems.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-[#2C2623] dark:text-stone-100">
                          {entry.name}
                          {entry.item_code ? (
                            <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                              ({entry.item_code})
                            </span>
                          ) : null}
                        </p>
                        {entry.notes && (
                          <p className="text-muted-foreground text-[11px]">{entry.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full font-mono font-bold">
                          {entry.qty} {entry.unit_label}
                        </Badge>
                        <Badge variant="secondary" className="rounded-full font-bold">
                          {CONDITION_LABELS[entry.condition]}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {delivery.notes && (
              <div className="rounded-2xl border border-dashed border-[#2C2623]/30 bg-[#FEF3C7]/45 p-3.5 leading-relaxed text-[#463F3A] dark:border-stone-600 dark:bg-amber-950/20 dark:text-stone-200">
                <strong className="block text-[#2C2623] dark:text-stone-100">
                  Catatan Pengiriman:
                </strong>
                {delivery.notes}
              </div>
            )}

            {signedProofUrl && (
              <div className="space-y-2">
                <p className="font-black text-[#2C2623] dark:text-stone-100">
                  Foto Bukti Pengiriman / Serah Terima
                </p>
                <div className="overflow-hidden rounded-2xl border-2 border-[#2C2623] bg-white p-2 dark:border-stone-600">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedProofUrl}
                    alt={`Bukti ${delivery.delivery_code}`}
                    className="max-h-[420px] w-full rounded-xl object-contain"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <SharePreviewDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          target={dialogTarget}
          initialSlug={props.slug}
          initialCanCustomize={props.canCustomize}
          onSlugUpdated={(nextSlug) => {
            if (nextSlug !== props.slug) {
              router.replace(buildShortSharePath(nextSlug));
            }
          }}
        />
      </div>
    );
  }

  // ARCHIVE Preview Mode
  const {
    archive,
    cabinetLabel,
    borrowerName,
    signedPreviewUrl,
    signedDownloadUrl,
    previewKind,
    safeDriveLink,
  } = props;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          asChild
          className="rounded-full bg-[#FFFDF7] font-bold dark:bg-stone-900"
        >
          <Link href="/archives">
            <ArrowLeft className="size-4" />
            Semua Dokumen Arsip
          </Link>
        </Button>

        <Button
          variant="outline"
          size="sm"
          asChild
          className="rounded-full bg-[#FFFDF7] font-bold dark:bg-stone-900"
        >
          <Link href={`/archives?code=${encodeURIComponent(archive.doc_code)}`}>
            <Archive className="size-4" />
            Lihat di Lemari Arsip
          </Link>
        </Button>
      </div>

      {topShortBar}

      <KawaiiPageHeader
        badge={`${archive.doc_code} · v${archive.version_no}`}
        title={archive.title}
        description={`${archive.category} · ${archive.branch_building} · ${cabinetLabel} · Laci ${archive.drawer_no}${archive.folder_code ? ` · Map ${archive.folder_code}` : ""}`}
        accent="lavender"
        mascot="folder"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {signedDownloadUrl && (
              <Button
                asChild
                className="rounded-2xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#2C2623] shadow-[3px_3px_0px_0px_#2C2623] hover:bg-[#34D399]"
              >
                <a href={signedDownloadUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="size-4" />
                  Unduh Dokumen
                </a>
              </Button>
            )}
            {signedPreviewUrl && (
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FFFDF7] font-bold dark:bg-stone-900"
              >
                <a href={signedPreviewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Buka Tab Baru
                </a>
              </Button>
            )}
            {safeDriveLink && (
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] font-bold text-[#78350F] hover:bg-[#FDE68A]"
              >
                <a href={safeDriveLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Buka Google Drive
                </a>
              </Button>
            )}
          </div>
        }
      />

      {/* Metadata & Location Summary */}
      <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-2 border-[#2C2623] bg-white font-mono text-xs font-black"
            >
              {archive.doc_code}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-2 border-[#2C2623] bg-[#FEF3C7] text-xs font-extrabold text-[#2C2623]"
            >
              {archive.category}
            </Badge>
            {archive.is_sop_public_to_staff ? (
              <Badge className="rounded-full border-2 border-[#2C2623] bg-[#2AB673] text-xs font-extrabold text-white">
                <Globe className="size-3" />
                SOP Publik Terapis
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="rounded-full border-2 border-[#2C2623] bg-white text-xs font-extrabold"
              >
                <Lock className="size-3" />
                Internal Manajemen
              </Badge>
            )}
            <Badge
              variant="secondary"
              className="rounded-full border-2 border-[#2C2623] bg-[#E0F2FE] text-xs font-extrabold text-[#0C4A6E]"
            >
              {ARCHIVE_STATUS_LABELS[archive.physical_status]}
              {archive.physical_status === "DIPINJAM" && borrowerName
                ? ` · oleh ${borrowerName}`
                : ""}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3.5 text-xs dark:border-stone-700 dark:bg-stone-800/70">
              <p className="text-muted-foreground font-semibold">Lokasi Penyimpanan Fisik</p>
              <p className="mt-0.5 text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                {archive.branch_building} · {cabinetLabel} ({archive.cabinet_code})
              </p>
              <p className="text-muted-foreground mt-0.5 font-medium">
                Laci {archive.drawer_no}
                {archive.folder_code ? ` · Map ${archive.folder_code}` : ""}
              </p>
            </div>

            <div className="rounded-2xl border border-[#2C2623]/20 bg-white p-3.5 text-xs dark:border-stone-700 dark:bg-stone-800/70">
              <p className="text-muted-foreground font-semibold">Status Berkas &amp; Revisi</p>
              <p className="mt-0.5 text-sm font-extrabold text-[#2C2623] dark:text-stone-100">
                Versi v{archive.version_no}
              </p>
              <p className="text-muted-foreground mt-0.5 font-medium">
                Diperbarui {formatDateWIB(archive.updated_at, true)}
              </p>
            </div>
          </div>

          {archive.notes && (
            <div className="rounded-2xl border border-dashed border-[#2C2623]/30 bg-[#FEF3C7]/45 p-3.5 text-xs leading-relaxed text-[#463F3A] dark:border-stone-600 dark:bg-amber-950/20 dark:text-stone-200">
              <strong className="block text-[#2C2623] dark:text-stone-100">
                Catatan Dokumen:
              </strong>
              {archive.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline Visual File Preview */}
      {signedPreviewUrl ? (
        <Card className="overflow-hidden rounded-3xl border-2 border-[#2C2623] bg-[#FFFDF7] shadow-[4px_4px_0px_0px_#2C2623] dark:border-stone-500 dark:bg-stone-900">
          <CardHeader className="border-b-2 border-[#2C2623] bg-[#D1FAE5] px-5 py-3.5 dark:border-stone-500 dark:bg-emerald-950/50">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-[#2C2623] dark:text-stone-100">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0" />
                <span className="truncate">
                  Pratinjau Dokumen: {archive.digital_file_name || archive.title}
                </span>
              </span>
              <span className="text-muted-foreground shrink-0 text-[11px] font-semibold">
                Tautan sementara 5 menit
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {previewKind === "pdf" ? (
              <iframe
                src={signedPreviewUrl}
                title={archive.title}
                className="h-[65dvh] min-h-[360px] w-full rounded-2xl border-2 border-[#2C2623] bg-white sm:h-[72dvh] sm:min-h-[460px] dark:border-stone-600"
              />
            ) : previewKind === "image" ? (
              <div className="flex justify-center overflow-hidden rounded-2xl border-2 border-[#2C2623] bg-white p-2 dark:border-stone-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signedPreviewUrl}
                  alt={archive.title}
                  className="max-h-[72vh] w-auto rounded-xl object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#2C2623]/30 bg-white p-6 text-center dark:border-stone-600 dark:bg-stone-800/60">
                <FileText className="size-10 text-[#115E3B] dark:text-emerald-300" />
                <p className="text-sm font-bold text-[#2C2623] dark:text-stone-100">
                  Format berkas ini tidak dipratinjau langsung di browser.
                </p>
                {signedDownloadUrl && (
                  <Button
                    asChild
                    className="rounded-2xl border-2 border-[#2C2623] bg-[#6EE7B7] font-extrabold text-[#2C2623] shadow-[2.5px_2.5px_0px_0px_#2C2623]"
                  >
                    <a href={signedDownloadUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="size-4" />
                      Unduh {archive.digital_file_name || "Dokumen"}
                    </a>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border-2 border-dashed border-[#2C2623]/35 bg-[#FFFDF7] p-6 text-center text-sm text-[#574E49] dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300">
          {safeDriveLink ? (
            <div className="space-y-3">
              <p className="font-bold text-[#2C2623] dark:text-stone-100">
                Dokumen digital tersedia melalui Google Drive terlampir.
              </p>
              <Button
                asChild
                className="rounded-2xl border-2 border-[#2C2623] bg-[#FEF3C7] font-extrabold text-[#78350F] shadow-[2.5px_2.5px_0px_0px_#2C2623]"
              >
                <a href={safeDriveLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Buka Dokumen di Google Drive
                </a>
              </Button>
            </div>
          ) : (
            <p className="font-medium">
              Dokumen ini berstatus arsip fisik saja (tidak ada lampiran berkas digital di bucket).
            </p>
          )}
        </Card>
      )}

      <SharePreviewDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        target={dialogTarget}
        initialSlug={props.slug}
        initialCanCustomize={props.canCustomize}
        onSlugUpdated={(nextSlug) => {
          if (nextSlug !== props.slug) {
            router.replace(buildShortSharePath(nextSlug));
          }
        }}
      />
    </div>
  );
}
