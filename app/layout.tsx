import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://caseworker-eta.vercel.app"),
  title: "Caseworker — your advocate for impossible paperwork",
  description:
    "Caseworker reads your benefits denials, insurance appeals, medical bills, and financial-aid letters, then drafts the response that gets them reversed.",
  applicationName: "Caseworker",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Caseworker",
    title: "Caseworker — your advocate for impossible paperwork",
    description:
      "Snap a photo of a denied claim, a benefits cut, or a surprise bill. Caseworker explains it, finds your rights and deadlines, and drafts the response that gets it reversed.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Caseworker — your advocate for impossible paperwork",
    description:
      "Snap a photo of a denied claim, a benefits cut, or a surprise bill. Caseworker finds your rights and deadlines, and drafts the response that gets it reversed.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
