import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ client: vi.fn(), sign: vi.fn(), remove: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/require-admin', () => ({ getAuthedUser: async () => ({ id: 'admin-test' }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/storage-urls', () => ({ createSignedStorageUrl: mocks.sign }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { uploadContractImages } from '@/app/actions/tenants'

beforeEach(() => {
  mocks.remove.mockReset().mockResolvedValue({ error: null })
  mocks.update.mockReset().mockResolvedValue({ error: { message: 'response lost' } })
  mocks.sign.mockReset().mockResolvedValue('https://signed.example/document')
  mocks.client.mockResolvedValue({
    storage: { from: () => ({ upload: async () => ({ data: { path: 'tenant/doc.jpg' }, error: null }), remove: mocks.remove }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { contract_images: [] }, error: null }) }) }),
      update: () => ({ eq: mocks.update }),
    }),
  })
})
function upload() {
  const data = new FormData()
  data.append('contract_images', new File(['test-image'], 'document.jpg', { type: 'image/jpeg' }))
  return uploadContractImages('00000000-0000-4000-8000-000000000001', data)
}
describe('document upload recovery', () => {
  it('retains uploaded evidence when the DB result is ambiguous', async () => {
    expect((await upload()).success).toBe(false)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('cleans up when failure occurred before any database update', async () => {
    mocks.sign.mockResolvedValue(null)
    expect((await upload()).success).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).toHaveBeenCalledWith(['tenant/doc.jpg'])
  })
})
