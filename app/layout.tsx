import type { Metadata } from "next"
import { Prompt } from "next/font/google"
import { Toaster } from "sonner"
import { headers } from "next/headers"
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="th" className={`${prompt.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/* Blocking script — runs before paint to prevent dark-mode flash */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s===null&&d)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
        {children}
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{ duration: 3000 }}
        />
      </body>
    </html>
  )
}
