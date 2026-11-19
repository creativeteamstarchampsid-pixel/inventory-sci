"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2, LogIn } from "lucide-react";

import { signIn, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  next,
  configured,
  initialError,
}: {
  next?: string;
  configured: boolean;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {
    error: initialError,
  });

  return (
    <Card className="border-indigo-100/80 bg-white/95 shadow-lg shadow-indigo-500/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Masuk ke Akun Anda</CardTitle>
        <CardDescription>
          Masukkan email dan kata sandi yang sudah diberikan oleh Admin Operasional.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {!configured && (
            <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Koneksi pusat data belum aktif. Hubungi Admin untuk memeriksa pengaturan aplikasi.
              </p>
            </div>
          )}
          {state.error && (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive flex gap-2 rounded-xl border p-3 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{state.error}</p>
            </div>
          )}
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-2">
            <Label htmlFor="email">Alamat Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nama@starchamps.id"
              defaultValue={state.email}
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Kata Sandi</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              required
              disabled={pending}
            />
          </div>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-indigo-600 to-sky-600 text-white shadow-sm hover:from-indigo-700 hover:to-sky-700"
            disabled={pending || !configured}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogIn className="size-4" aria-hidden />
            )}
            {pending ? "Sedang masuk…" : "Masuk Sekarang"}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Lupa kata sandi atau belum punya akun? Hubungi Admin Operasional.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
