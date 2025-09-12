import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('./utils/storage.js', () => ({
  getItem: vi.fn()
}))

import { getMatchesCount, listEventsByDate } from './eventsRepo.js'
import { getItem } from './utils/storage.js'

describe('getMatchesCount', () => {
  it('uses rounds length when available', () => {
    const ev = { rounds: [{}, {}, {}] }
    expect(getMatchesCount(ev)).toBe(3)
  })

  it('uses stats.totalMatches when rounds not provided', () => {
    const ev = { stats: { totalMatches: '4' } }
    expect(getMatchesCount(ev)).toBe(4)
  })

  it('sums V, D, E when no rounds or stats', () => {
    const ev = { V: 2, D: 1, E: 1 }
    expect(getMatchesCount(ev)).toBe(4)
  })

  it('returns 0 when no match info', () => {
    const ev = {}
    expect(getMatchesCount(ev)).toBe(0)
  })
})

describe('listEventsByDate', () => {
  afterEach(() => {
    getItem.mockReset()
  })

  it('filters events by date', () => {
    const events = [
      { id: 1, dia: '2024-05-10', createdAt: '2024-05-10T10:00:00Z' },
      { id: 2, date: '2024-05-10', createdAt: '2024-05-10T11:00:00Z' },
      { id: 3, dia: '2024-05-11', createdAt: '2024-05-11T12:00:00Z' }
    ]
    getItem.mockReturnValue(events)
    const result = listEventsByDate('2024-05-10')
    expect(result).toHaveLength(2)
    expect(result.every(ev => ev.dia === '2024-05-10' || ev.date === '2024-05-10')).toBe(true)
  })

  it('orders events by createdAt descending', () => {
    const events = [
      { id: 1, dia: '2024-05-10', createdAt: '2024-05-10T10:00:00Z' },
      { id: 2, dia: '2024-05-10', createdAt: '2024-05-10T12:00:00Z' },
      { id: 3, dia: '2024-05-10', createdAt: '2024-05-10T09:00:00Z' }
    ]
    getItem.mockReturnValue(events)
    const result = listEventsByDate('2024-05-10')
    expect(result.map(ev => ev.id)).toEqual([2, 1, 3])
  })
})
