import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Encore — Your living room. Center stage.", description: "A free karaoke night with your favorite people. No accounts, just a song and a link." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
