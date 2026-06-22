import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './_components/login-form'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    redirect(assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2' ? '/mfa' : '/rooms')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">ระบบจัดการห้องเช่า</h1>
          <p className="text-sm text-slate-500">เข้าสู่ระบบเพื่อจัดการ</p>
        </div>
        <LoginForm />
      </div>
    </main>
  )
}
