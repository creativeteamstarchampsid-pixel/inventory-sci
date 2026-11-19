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
    <Card>
      <CardHeader>
        <CardTitle>Masuk</CardTitle>
        <CardDescription>Gunakan email dan kata sandi akun StarOps Anda.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {!configured && (
            <div className="border-amber-300 bg-amber-50 text-amber-900 flex gap-2 rounded-md border p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Supabase belum dikonfigurasi. Salin <code>.env.example</code> menjadi{" "}
                <code>.env.local</code> lalu isi URL dan anon key proyek Supabase.
              </p>
            </div>
          )}
          {state.error && (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive flex gap-2 rounded-md border p-3 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{state.error}</p>
            </div>
          )}
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
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
            <Label htmlFor="password">Kata sandi</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </div>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending || !configured}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogIn className="size-4" aria-hidden />
            )}
            {pending ? "Memproses…" : "Masuk"}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Akun dibuat oleh Admin Ops. Hubungi admin jika lupa kata sandi.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
