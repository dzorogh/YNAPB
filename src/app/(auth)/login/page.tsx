"use client";

import { WalletCards } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing-in" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("signing-in");
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      const message = signInError.message;
      setError(message);
      setStatus("error");
      toast.error("Sign in failed", { description: message });
      return;
    }
    window.location.assign("/");
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
            <WalletCards className="size-6" aria-hidden="true" />
          </span>
          <p className="text-lg font-semibold tracking-[-0.02em]">YNAPB</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your financial plans, clearly mapped.
          </p>
        </div>
        <Card className="py-6">
          <CardHeader className="px-6">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">
              Sign in
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Use the email and password from your YNAPB account.
            </p>
          </CardHeader>
          <CardContent className="px-6">
            <form
              onSubmit={(event) => void handleSubmit(event)}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={status === "signing-in"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={status === "signing-in"}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={status === "signing-in"}
              >
                {status === "signing-in" ? "Signing in..." : "Sign in"}
              </Button>
              {process.env.NODE_ENV === "development" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.assign("/auth/dev-login")}
                >
                  Dev: quick sign in
                </Button>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
