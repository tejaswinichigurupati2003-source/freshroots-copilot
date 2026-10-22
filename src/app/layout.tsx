import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Freshroots Demand Planning Copilot" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
