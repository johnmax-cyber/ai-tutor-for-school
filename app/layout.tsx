import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cognita.ai — Academic AI Workspace",
  description: "A personal learning environment that teaches, practices, and tracks progress.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full antialiased`}>
       <head>
         {/* eslint-disable-next-line @next/next/no-page-custom-font */}
         <link
           rel="stylesheet"
           href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
         />
       </head>
      <body className="min-h-full flex flex-col bg-background text-on-surface font-sans">
        {children}
      </body>
    </html>
  );
}