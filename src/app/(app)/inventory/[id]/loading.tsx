import { RouteLoadingView } from "@/components/cartoon/route-loading-view";

export default function InventoryItemDetailLoading() {
  return (
    <RouteLoadingView
      pageName="Detail Barang"
      hint="Mengambil catatan lengkap & riwayat barang~"
    />
  );
}
