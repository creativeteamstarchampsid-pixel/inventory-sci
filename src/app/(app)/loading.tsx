import { RouteLoadingView } from "@/components/cartoon/route-loading-view";

export default function AuthenticatedAppLoading() {
  return (
    <RouteLoadingView
      pageName="Halaman StarOps"
      hint="Menyiapkan data StarOps terbaru untukmu~"
    />
  );
}
