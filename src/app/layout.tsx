import "./globals.css";
import type { Metadata } from "next";
import { Schibsted_Grotesk, Spline_Sans_Mono, Young_Serif } from "next/font/google";
import type { ReactNode } from "react";

const display = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--nf-display" });
const body = Schibsted_Grotesk({ subsets: ["latin"], variable: "--nf-body" });
const data = Spline_Sans_Mono({ subsets: ["latin"], variable: "--nf-data" });

export const metadata: Metadata = {
  title: { default: "Reorder desk | Freshroots", template: "%s | Freshroots reorder desk" },
  description: "Twice-weekly reorder recommendations for Freshroots. The system recommends, Raghav decides.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body>{children}</body>
    </html>
  );
}
