import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";

import type { Metadata } from "next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YNAPB — Financial planning",
  description: "Plan long-term goals and monthly funding on top of YNAB.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
