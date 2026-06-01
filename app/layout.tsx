import type { Metadata } from "next"
import { Prompt } from "next/font/google"
import "./globals.css"

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "ระบบจัดการห้องเช่า",
  description: "ระบบจัดการห้องพัก ผู้เช่า และการชำระเงิน",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${prompt.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  )
}
