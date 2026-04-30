import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seaport WMS",
  description: "Warehouse Management System — Seaport Logistics Mumbai",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
