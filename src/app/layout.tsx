import type { Metadata, Viewport } from "next";
import { Anton, Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Anton: títulos y horas (gruesa y angosta, como el logo).
const display = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Barlow({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
});

// Etiquetas en mayúsculas y botones.
const label = Barlow_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-label",
});

export const metadata: Metadata = {
  title: "MTOR Reservas",
  description: "Agenda y reservas del gimnasio MTOR, Curicó",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body
        className={`${display.variable} ${body.variable} ${label.variable} font-body`}
      >
        {children}
      </body>
    </html>
  );
}
