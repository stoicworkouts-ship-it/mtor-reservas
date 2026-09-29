import type { Metadata } from "next";
import { Anton, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Work_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MTOR Reservas",
  description: "Agenda y reservas del gimnasio MTOR, Curicó",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-body`}
      >
        {children}
      </body>
    </html>
  );
}
