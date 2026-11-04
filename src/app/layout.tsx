import "./globals.css";
import type { Metadata } from "next";
import { Albert_Sans, Gabarito, Spline_Sans_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

const display = Gabarito({ weight: ["500", "600", "700"], subsets: ["latin"], variable: "--nf-display" });
const body = Albert_Sans({ subsets: ["latin"], variable: "--nf-body" });
const data = Spline_Sans_Mono({ subsets: ["latin"], variable: "--nf-data" });

export const metadata: Metadata = {
  title: { default: "Reorder desk | Freshroots", template: "%s | Freshroots reorder desk" },
  description: "Twice-weekly reorder recommendations for Freshroots. The system recommends, Raghav decides.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
