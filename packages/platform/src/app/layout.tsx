import type { Metadata } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nomi — 쓸수록 나를 닮아가는 나만의 AI",
  description:
    "하루에 한 번, 내가 열지 않아도 먼저 찾아오는 개인 AI 에이전트. Telegram으로 연결하고 5분 만에 나만의 AI를 키워보세요.",
  keywords: [
    "AI 에이전트",
    "개인 AI",
    "Telegram AI",
    "Nomi",
    "AI 비서",
    "능동적 AI",
  ],
  openGraph: {
    title: "Nomi — 나만의 AI를 키워보세요",
    description:
      "쓸수록 나를 닮아가는 AI. 먼저 말 걸어오는 AI. 나만의 독립 인스턴스로 5분 만에 시작하세요.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${inter.variable} ${playfair.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
