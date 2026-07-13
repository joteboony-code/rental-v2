import { describe, expect, it } from 'vitest'
import { roomRow } from './room-utils'

describe('roomRow', () => {
  it.each([
    [1, 1],
    [10, 1],
    [11, 2],
    [20, 2],
    [21, 3],
    [30, 3],
  ])('maps room %i to row %i', (roomNumber, expectedRow) => {
    expect(roomRow(roomNumber)).toBe(expectedRow)
  })
})
