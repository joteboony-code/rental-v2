import React from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MeterPhoto } from '@/components/meter-photo'

const mock = vi.hoisted(() => ({
  sign: vi.fn(), from: vi.fn(), setters: [] as ReturnType<typeof vi.fn>[],
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const setter = vi.fn()
    mock.setters.push(setter)
    return [initial, setter]
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: mock.from } }),
}))

beforeEach(() => {
  vi.stubGlobal('React', React)
  mock.setters = []
  mock.sign.mockReset()
  mock.from.mockReset().mockReturnValue({ createSignedUrl: mock.sign })
})

function retryButton() {
  const element = MeterPhoto({ src: null, storedValue: 'room/water.jpg', alt: 'มิเตอร์น้ำ', className: 'w-full' })
  // Exercise the client event handler with isolated state setters; no DOM or credentials required.
  const render = element.type as (props: typeof element.props) => React.ReactElement<{ children: React.ReactElement[] }>
  const view = render(element.props)
  return view.props.children[1] as React.ReactElement<{ onClick: () => Promise<void> }>
}

it('retries only the selected object using the browser session and restores its preview', async () => {
  mock.sign.mockResolvedValue({ data: { signedUrl: 'https://signed.example/new' }, error: null })
  await retryButton().props.onClick()
  expect(mock.from).toHaveBeenCalledExactlyOnceWith('meter-photos')
  expect(mock.sign).toHaveBeenCalledExactlyOnceWith('room/water.jpg', 3600)
  expect(mock.setters[0]).toHaveBeenCalledWith('https://signed.example/new')
  expect(mock.setters[1]).toHaveBeenCalledWith(false)
  expect(mock.setters[2].mock.calls).toEqual([[true], [false]])
})

it('keeps the error visible when signing is denied, without falling back to public access', async () => {
  mock.sign.mockResolvedValue({ data: null, error: { message: 'Forbidden' } })
  await retryButton().props.onClick()
  expect(mock.setters[0]).not.toHaveBeenCalled()
  expect(mock.setters[1]).toHaveBeenCalledWith(true)
  expect(mock.sign).toHaveBeenCalledTimes(1)
})

it('resets component identity when a photo is replaced', () => {
  const base = { alt: 'มิเตอร์', className: 'w-full', src: null }
  expect(MeterPhoto({ ...base, storedValue: 'old.jpg' }).key)
    .not.toBe(MeterPhoto({ ...base, storedValue: 'new.jpg' }).key)
})
