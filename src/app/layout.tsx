import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { MobileNav } from "@/components/MobileNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ToastContainer } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAMS",
  description: "Shell Asset Management System — Assurance App",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen pb-16 md:pb-0">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-blue-800 focus:px-4 focus:py-2 focus:text-sm focus:text-white">
          Skip to main content
        </a>
        <OfflineBanner />
        <NavBar />
        <main id="main-content" tabIndex={-1} className="px-4 sm:px-6 lg:px-8">{children}</main>
        <MobileNav />
        <ToastContainer />
      </body>
    </html>
  );
}
