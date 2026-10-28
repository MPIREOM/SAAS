import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Thmanyah Sans covers Latin and Arabic, so one family serves both locales.
const thmanyahSans = localFont({
  src: [
    { path: "./fonts/thmanyahsans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/thmanyahsans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/thmanyahsans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

// Applies a saved light/dark choice before first paint. Without one the
// CSS follows the device setting (prefers-color-scheme).
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "MPIRE | Property Management System",
  description:
    "Professional property management system for MPIRE Property Management, Oman",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${thmanyahSans.variable} ${jetbrainsMono.variable} antialiased font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
