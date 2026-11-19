import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { getNavItem } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Akses Ditolak" };

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; reason?: string }>;
}) {
  const { from, reason } = await searchParams;
  const user = await getCurrentUser();
  const blockedAccount = reason === "inactive" || reason === "no-profile" || !user?.isActive;
  const target = from ? getNavItem(`/${from.split("/")[1] ?? ""}`) : undefined;

  let description: string;
  if (reason === "inactive" || (user && !user.isActive)) {
    description = "Akun Anda telah dinonaktifkan. Hubungi Admin Ops untuk mengaktifkannya kembali.";
  } else if (reason === "no-profile" || !user) {
    description =
      "Profil akun Anda belum tersedia atau belum memiliki peran. Hubungi Admin Ops untuk pengaturan akses.";
  } else {
    description = `Peran ${ROLE_LABELS[user.role].title} (${ROLE_LABELS[user.role].subtitle}) tidak memiliki akses ke ${
      target ? `menu “${target.title}”` : "halaman ini"
    }.`;
  }

  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <div className="bg-destructive/10 text-destructive mx-auto flex size-12 items-center justify-center rounded-full">
            <ShieldAlert className="size-6" aria-hidden />
          </div>
          <CardTitle className="text-xl">Akses Ditolak</CardTitle>
          <CardDescription>403 – Forbidden</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardContent>
        <CardFooter className="justify-center gap-2">
          {!blockedAccount && (
            <Button asChild>
              <Link href="/dashboard">Kembali ke Dashboard</Link>
            </Button>
          )}
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Keluar
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}
