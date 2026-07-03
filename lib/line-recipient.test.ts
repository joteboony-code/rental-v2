import { describe, expect, it } from 'vitest'
import { getEffectiveLineUserId } from './line-recipient'

describe('getEffectiveLineUserId', () => {
  it('uses the contract recipient before the tenant default', () => {
    expect(
      getEffectiveLineUserId(
        { line_recipient_user_id: 'line-child' },
        { line_user_id: 'line-parent' }
      )
    ).toBe('line-child')
  })

  it('falls back to the tenant LINE when the contract has no override', () => {
    expect(
      getEffectiveLineUserId(
        { line_recipient_user_id: null },
        { line_user_id: 'line-parent' }
      )
    ).toBe('line-parent')
  })

  it('returns null when the room has no LINE recipient', () => {
    expect(getEffectiveLineUserId(null, { line_user_id: null })).toBeNull()
  })
})
