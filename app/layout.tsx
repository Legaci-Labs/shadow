import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "ShadowOSS — Generate Claude Skills from Any GitHub Repo",
  description:
    "Drop a GitHub repo. Get an AI skill file. Make Claude actually understand your code.",
  openGraph: {
    title: "ShadowOSS",
    description: "Drop a GitHub repo. Get an AI skill file.",
    url: "https://shadow-oss.info",
    siteName: "ShadowOSS",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ShadowOSS",
    description: "Drop a GitHub repo. Get an AI skill file.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased min-h-screen`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
