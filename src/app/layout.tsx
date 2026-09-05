import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "RecoverAI",
  description: "AI-powered revenue recovery foundation for Razorpay merchants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
