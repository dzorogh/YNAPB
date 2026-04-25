"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signInError) {
      setError(signInError.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-base font-medium leading-snug">Sign in</h1>
          <p className="text-sm text-muted-foreground">Magic link via email.</p>
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
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={status === "sending" || status === "sent"}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={status === "sending" || status === "sent"}
            >
              {status === "sending"
                ? "Sending..."
                : status === "sent"
                  ? "Check your inbox"
                  : "Send magic link"}
            </Button>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
