import type { ReactNode } from "react";

export const metadata = {
  title: "Paul-lite + PO/Invoice Matcher",
  description: "A proof of work for Trelium, by Depika Gupta",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fafafa", color: "#111" }}>
        {children}
      </body>
    </html>
  );
}
