import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MfaForm } from './_components/mfa-form'

export default async function MfaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!assurance) redirect('/login')   // fail closed: cannot confirm AAL → re-auth
  if (assurance.currentLevel === 'aal2' || assurance.nextLevel !== 'aal2') redirect('/rooms')

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factorId = factors?.totp.find((factor) => factor.status === 'verified')?.id
  if (!factorId) redirect('/login')

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">ยืนยันตัวตน</h1>
          <p className="text-sm text-slate-500">กรอกรหัส 6 หลักจากแอป Authenticator</p>
        </div>
        <MfaForm factorId={factorId} />
      </div>
    </main>
  )
}
