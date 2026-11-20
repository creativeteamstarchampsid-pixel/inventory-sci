import { CartoonLoadingCard } from "@/components/cartoon/cartoon-loading-card";

export default function AuthenticatedAppLoading() {
  return (
    <div className="flex min-h-[65vh] w-full items-center justify-center px-4 py-12 print:hidden">
      <CartoonLoadingCard
        mode="navigating"
        title="Sebentar Ya, Membuka Halaman..."
        subMessage="Menyiapkan data StarOps terbaru untukmu~"
      />
    </div>
  );
}
