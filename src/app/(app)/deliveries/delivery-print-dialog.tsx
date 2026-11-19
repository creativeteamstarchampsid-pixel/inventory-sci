"use client";

import "./print.css";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  Printer,
  Tag,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CONDITION_LABELS,
  DELIVERY_DIRECTION_LABELS,
  formatDateWIB,
} from "@/lib/constants";
import type { DeliveryLog } from "@/types/database";
import { DeliveryBarcode } from "./delivery-barcode";
import { parseDeliveryPayloadItems } from "./helpers";
import type { BastExtraMeta, DeliveryDocType } from "./pdf-documents";

type DeliveryPrintDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: DeliveryLog | null;
  initialTab?: DeliveryDocType;
};

function DocumentSheetContent({
  docType,
  delivery,
  bastMeta,
}: {
  docType: DeliveryDocType;
  delivery: DeliveryLog;
  bastMeta: BastExtraMeta;
}) {
  const items = parseDeliveryPayloadItems(delivery.items_payload_json);
  const briefItems =
    items.length > 0
      ? items
          .slice(0, 4)
          .map((it) => `${it.name} (${it.qty} ${it.unit_label})`)
          .join(", ") +
        (items.length > 4 ? ` +${items.length - 4} item lainnya` : "")
      : delivery.package_type;

  if (docType === "label") {
    return (
      <div className="mx-auto w-full max-w-[420px] rounded-sm border-2 border-slate-900 bg-white p-4 text-slate-900 shadow-xs print:max-w-none print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-300 pb-2.5">
          <div>
            <p className="text-sm font-bold tracking-wide text-slate-950">
              STAR CHAMPS INDONESIA
            </p>
            <p className="text-[11px] text-slate-600">
              Pusat Terapi &amp; Edukasi Anak · StarOps Logistik
            </p>
          </div>
          <span className="border border-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase">
            {delivery.direction === "INBOUND" ? "MASUK" : "KELUAR"}
          </span>
        </div>

        {delivery.is_fragile && (
          <div className="mt-2.5 flex items-center justify-center gap-1.5 border border-red-600 bg-red-50 px-2 py-1.5 text-center text-[11px] font-bold text-red-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>FRAGILE / ALAT TERAPI — TANGANI DENGAN HATI-HATI</span>
          </div>
        )}

        <div className="mt-3 space-y-2.5 text-xs">
          <div className="border-b border-slate-200 pb-2">
            <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Pengirim
            </p>
            <p className="font-semibold text-slate-950">{delivery.sender_name}</p>
            {delivery.sender_address && (
              <p className="text-[11px] text-slate-700">{delivery.sender_address}</p>
            )}
          </div>

          <div className="border-b border-slate-200 pb-2">
            <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Penerima
            </p>
            <p className="font-semibold text-slate-950">{delivery.receiver_name}</p>
            {delivery.receiver_address && (
              <p className="text-[11px] text-slate-700">
                {delivery.receiver_address}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Kurir &amp; Resi
              </p>
              <p className="text-[11px] font-medium text-slate-900">
                {delivery.courier_name}
                {delivery.tracking_number ? ` · ${delivery.tracking_number}` : ""}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                PIC / Penanggung Jawab
              </p>
              <p className="text-[11px] font-medium text-slate-900">
                {delivery.pic_name || "-"}
              </p>
            </div>
          </div>

          <div className="rounded border border-slate-300 bg-slate-50 p-2">
            <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Ringkasan Isi Paket
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-800">
              {briefItems}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col items-center border-t border-slate-900 pt-2.5">
          <DeliveryBarcode
            value={delivery.delivery_code}
            height={44}
            width={1.6}
            displayValue={false}
          />
          <p className="mt-1 font-mono text-sm font-bold tracking-wider text-slate-950">
            {delivery.delivery_code}
          </p>
          <p className="text-[10px] text-slate-500">
            {DELIVERY_DIRECTION_LABELS[delivery.direction]} ·{" "}
            {formatDateWIB(delivery.created_at)}
          </p>
        </div>
      </div>
    );
  }

  if (docType === "surat-jalan") {
    return (
      <div className="mx-auto w-full max-w-[780px] rounded-sm border border-slate-300 bg-white p-6 text-slate-900 shadow-xs print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div>
            <p className="text-lg font-bold tracking-tight text-slate-950">
              STAR CHAMPS INDONESIA
            </p>
            <p className="text-xs text-slate-600">
              Pusat Terapi &amp; Edukasi Anak · Operasional &amp; Logistik
            </p>
          </div>
          <div className="text-right">
            <p className="text-base font-bold tracking-wide text-slate-950">
              SURAT JALAN (DELIVERY ORDER)
            </p>
            <p className="font-mono text-xs font-semibold">
              No: SJ / {delivery.delivery_code}
            </p>
            <p className="text-[11px] text-slate-600">
              Tanggal: {formatDateWIB(delivery.shipped_at ?? delivery.created_at, true)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded border border-slate-300 p-3 text-xs">
            <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Pihak Pengirim
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {delivery.sender_name}
            </p>
            <p className="text-slate-700">{delivery.sender_address || "-"}</p>
            <p className="mt-1 text-slate-700">PIC: {delivery.pic_name || "-"}</p>
          </div>
          <div className="rounded border border-slate-300 p-3 text-xs">
            <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Pihak Penerima
            </p>
            <p className="mt-1 font-semibold text-slate-950">
              {delivery.receiver_name}
            </p>
            <p className="text-slate-700">{delivery.receiver_address || "-"}</p>
            <p className="mt-1 text-slate-700">
              Kurir: {delivery.courier_name}
              {delivery.tracking_number ? ` (${delivery.tracking_number})` : ""}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span>
              Jenis Paket: <strong>{delivery.package_type}</strong>
            </span>
            {delivery.is_fragile && (
              <Badge variant="destructive" className="text-[10px]">
                FRAGILE / ALAT TERAPI
              </Badge>
            )}
          </div>
          <DeliveryBarcode
            value={delivery.delivery_code}
            height={28}
            width={1.2}
            displayValue={false}
          />
        </div>

        <div className="mt-3 overflow-hidden rounded border border-slate-400">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-400 bg-slate-100 text-left">
                <th className="w-10 px-2.5 py-2 font-semibold">No</th>
                <th className="w-36 px-2.5 py-2 font-semibold">Kode Barang</th>
                <th className="px-2.5 py-2 font-semibold">Nama Barang</th>
                <th className="w-24 px-2.5 py-2 text-right font-semibold">Qty</th>
                <th className="w-28 px-2.5 py-2 font-semibold">Kondisi</th>
                <th className="w-32 px-2.5 py-2 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                    Tidak ada rincian item pada paket ini.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={item.id || idx} className="border-b border-slate-200 last:border-b-0">
                    <td className="px-2.5 py-2">{idx + 1}</td>
                    <td className="px-2.5 py-2 font-mono text-[11px]">
                      {item.item_code || "-"}
                    </td>
                    <td className="px-2.5 py-2 font-medium">{item.name}</td>
                    <td className="px-2.5 py-2 text-right">
                      {item.qty} {item.unit_label}
                    </td>
                    <td className="px-2.5 py-2">
                      {CONDITION_LABELS[item.condition] ?? item.condition}
                    </td>
                    <td className="px-2.5 py-2 text-slate-600">
                      {item.notes || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {delivery.notes && (
          <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-2.5 text-xs">
            <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Catatan Pengiriman
            </p>
            <p className="mt-0.5 text-slate-800">{delivery.notes}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-4 text-center text-xs">
          <div className="rounded border border-slate-200 p-3">
            <p className="font-semibold">Pengirim</p>
            <p className="text-[11px] text-slate-500">{delivery.sender_name}</p>
            <div className="h-14" />
            <p className="border-t border-slate-900 pt-1 text-[11px]">
              ( .............................. )
            </p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="font-semibold">Kurir / Pembawa</p>
            <p className="text-[11px] text-slate-500">{delivery.courier_name}</p>
            <div className="h-14" />
            <p className="border-t border-slate-900 pt-1 text-[11px]">
              ( .............................. )
            </p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="font-semibold">Penerima</p>
            <p className="text-[11px] text-slate-500">{delivery.receiver_name}</p>
            <div className="h-14" />
            <p className="border-t border-slate-900 pt-1 text-[11px]">
              ( .............................. )
            </p>
          </div>
        </div>
      </div>
    );
  }

  // BAST
  const docDate = formatDateWIB(delivery.received_at ?? delivery.created_at);
  return (
    <div className="mx-auto w-full max-w-[780px] rounded-sm border border-slate-300 bg-white p-6 text-slate-900 shadow-xs print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-slate-900 pb-3">
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-950">
            STAR CHAMPS INDONESIA
          </p>
          <p className="text-xs text-slate-600">
            Pusat Terapi &amp; Edukasi Anak · Dokumen Serah Terima Resmi
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold tracking-wide text-slate-950">
            BERITA ACARA SERAH TERIMA (BAST)
          </p>
          <p className="font-mono text-xs font-semibold">
            No: BAST / {delivery.delivery_code}
          </p>
          <p className="text-[11px] text-slate-600">Tanggal: {docDate}</p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-800">
        Pada hari ini, tanggal <strong>{docDate}</strong>, telah dilaksanakan serah
        terima inventaris / aset kantor / kunci / peralatan terapi Star Champs
        Indonesia antara:
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded border border-slate-300 p-3 text-xs">
          <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Pihak Pertama (Yang Menyerahkan)
          </p>
          <p className="mt-1 font-semibold text-slate-950">{delivery.sender_name}</p>
          <p className="text-slate-700">
            Jabatan / Unit:{" "}
            {bastMeta.senderRoleLabel || "Perwakilan Star Champs"}
          </p>
          <p className="text-slate-700">
            Alamat: {delivery.sender_address || "Star Champs Indonesia"}
          </p>
        </div>
        <div className="rounded border border-slate-300 p-3 text-xs">
          <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Pihak Kedua (Yang Menerima)
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {delivery.receiver_name}
          </p>
          <p className="text-slate-700">
            Jabatan / Pihak:{" "}
            {bastMeta.receiverRoleLabel || "Staf / Pihak Eksternal"}
          </p>
          <p className="text-slate-700">
            Alamat: {delivery.receiver_address || "-"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          Keperluan:{" "}
          <strong>{bastMeta.handoverPurpose || delivery.package_type}</strong>
        </span>
        <DeliveryBarcode
          value={delivery.delivery_code}
          height={28}
          width={1.2}
          displayValue={false}
        />
      </div>

      <div className="mt-3 overflow-hidden rounded border border-slate-400">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-400 bg-slate-100 text-left">
              <th className="w-10 px-2.5 py-2 font-semibold">No</th>
              <th className="w-36 px-2.5 py-2 font-semibold">Kode Aset / Item</th>
              <th className="px-2.5 py-2 font-semibold">
                Nama Barang / Aset / Kunci
              </th>
              <th className="w-24 px-2.5 py-2 text-right font-semibold">Jumlah</th>
              <th className="w-28 px-2.5 py-2 font-semibold">Kondisi</th>
              <th className="w-32 px-2.5 py-2 font-semibold">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                  Tidak ada daftar rincian barang tercatat.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={item.id || idx} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-2.5 py-2">{idx + 1}</td>
                  <td className="px-2.5 py-2 font-mono text-[11px]">
                    {item.item_code || "-"}
                  </td>
                  <td className="px-2.5 py-2 font-medium">{item.name}</td>
                  <td className="px-2.5 py-2 text-right">
                    {item.qty} {item.unit_label}
                  </td>
                  <td className="px-2.5 py-2">
                    {CONDITION_LABELS[item.condition] ?? item.condition}
                  </td>
                  <td className="px-2.5 py-2 text-slate-600">
                    {item.notes || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {delivery.notes && (
        <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-2.5 text-xs">
          <p className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Catatan Tambahan
          </p>
          <p className="mt-0.5 text-slate-800">{delivery.notes}</p>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-800">
        Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya untuk
        dipergunakan sebagaimana mestinya. Sejak ditandatangani, barang/aset/kunci
        tersebut berada dalam tanggung jawab pemeliharaan dan penggunaan Pihak
        Kedua.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-4 text-center text-xs">
        <div className="rounded border border-slate-200 p-3">
          <p className="font-semibold">Pihak Pertama (Yang Menyerahkan)</p>
          <p className="text-[11px] text-slate-500">{delivery.sender_name}</p>
          <div className="h-14" />
          <p className="border-t border-slate-900 pt-1 text-[11px]">
            ( {delivery.sender_name} )
          </p>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <p className="font-semibold">Saksi / PIC Operasional</p>
          <p className="text-[11px] text-slate-500">
            {bastMeta.witnessName || delivery.pic_name || "Admin Ops"}
          </p>
          <div className="h-14" />
          <p className="border-t border-slate-900 pt-1 text-[11px]">
            ( {bastMeta.witnessName || delivery.pic_name || ".................."} )
          </p>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <p className="font-semibold">Pihak Kedua (Yang Menerima)</p>
          <p className="text-[11px] text-slate-500">{delivery.receiver_name}</p>
          <div className="h-14" />
          <p className="border-t border-slate-900 pt-1 text-[11px]">
            ( {delivery.receiver_name} )
          </p>
        </div>
      </div>
    </div>
  );
}

export function DeliveryPrintDialog({
  open,
  onOpenChange,
  delivery,
  initialTab = "label",
}: DeliveryPrintDialogProps) {
  const [activeTab, setActiveTab] = useState<DeliveryDocType>(initialTab);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [bastPurpose, setBastPurpose] = useState("");
  const [senderRoleLabel, setSenderRoleLabel] = useState("Admin Operasional");
  const [receiverRoleLabel, setReceiverRoleLabel] = useState(
    "Staf / Pihak Eksternal",
  );
  const [witnessName, setWitnessName] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setPdfError(null);
      if (delivery) {
        setBastPurpose(delivery.package_type);
        setWitnessName(delivery.pic_name || "");
      }
    }
  }, [open, initialTab, delivery]);

  if (!delivery) return null;

  const bastMeta: BastExtraMeta = {
    handoverPurpose: bastPurpose.trim() || delivery.package_type,
    senderRoleLabel: senderRoleLabel.trim() || "Admin Operasional",
    receiverRoleLabel: receiverRoleLabel.trim() || "Staf / Pihak Eksternal",
    witnessName: witnessName.trim() || delivery.pic_name || "Admin Ops",
  };

  async function handleDownloadPdf() {
    if (!delivery) return;
    setDownloading(true);
    setPdfError(null);
    try {
      const { downloadDeliveryPdf } = await import("./pdf-documents");
      await downloadDeliveryPdf(activeTab, delivery, bastMeta);
    } catch (err) {
      setPdfError(
        err instanceof Error
          ? err.message
          : "Gagal membuat file PDF dokumen.",
      );
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Dokumen Logistik &amp; Cetak</span>
              <Badge variant="outline" className="font-mono">
                {delivery.delivery_code}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Pratinjau siap cetak (@page) dan unduh PDF untuk Label Pengiriman,
              Surat Jalan, atau Berita Acara Serah Terima (BAST).
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as DeliveryDocType)}
            className="mt-1"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="label" className="gap-1.5">
                  <Tag className="size-3.5" />
                  Label Barcode
                </TabsTrigger>
                <TabsTrigger value="surat-jalan" className="gap-1.5">
                  <FileText className="size-3.5" />
                  Surat Jalan
                </TabsTrigger>
                <TabsTrigger value="bast" className="gap-1.5">
                  <FileCheck2 className="size-3.5" />
                  BAST
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                >
                  <Printer className="size-4" />
                  Cetak (@page)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Unduh PDF
                </Button>
              </div>
            </div>

            {pdfError && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>{pdfError}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="bast" className="mt-3 space-y-3">
              <div className="bg-muted/40 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Keperluan BAST</Label>
                  <Input
                    value={bastPurpose}
                    onChange={(e) => setBastPurpose(e.target.value)}
                    placeholder="Serah terima aset / kunci"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Jabatan Pihak Pertama</Label>
                  <Input
                    value={senderRoleLabel}
                    onChange={(e) => setSenderRoleLabel(e.target.value)}
                    placeholder="Admin Operasional"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Jabatan Pihak Kedua</Label>
                  <Input
                    value={receiverRoleLabel}
                    onChange={(e) => setReceiverRoleLabel(e.target.value)}
                    placeholder="Terapis / Vendor"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Saksi / PIC</Label>
                  <Input
                    value={witnessName}
                    onChange={(e) => setWitnessName(e.target.value)}
                    placeholder="Nama saksi"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </TabsContent>

            <div className="bg-muted/50 mt-3 rounded-lg border p-4">
              <DocumentSheetContent
                docType={activeTab}
                delivery={delivery}
                bastMeta={bastMeta}
              />
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {mounted &&
        open &&
        createPortal(
          <div data-delivery-print-root="true" className="hidden print:block">
            <style>{`@page { size: ${
              activeTab === "label" ? "105mm 148mm" : "A4 portrait"
            }; margin: ${activeTab === "label" ? "5mm" : "12mm"}; }`}</style>
            <DocumentSheetContent
              docType={activeTab}
              delivery={delivery}
              bastMeta={bastMeta}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
