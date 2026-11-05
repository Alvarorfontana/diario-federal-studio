import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diario Federal Studio",
  description: "Consola de producción audiovisual de Diario Federal"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
    </head>
    <body>{children}</body>
  </html>;
}
