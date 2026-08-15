"use client";

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
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-base font-medium leading-snug">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Email and password from your YNAPB account.
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
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
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
