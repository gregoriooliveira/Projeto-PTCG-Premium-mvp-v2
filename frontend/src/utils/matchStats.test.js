import { describe, it, expect, vi } from 'vitest'
import {
  wlCounts,
  winRateFromCounts,
  topDeckByWinRate,
  mostUsedDeckOf,
  byKey,
  dateKeyMDY,
} from './matchStats.js'

describe('matchStats utilities', () => {
  it('wlCounts counts wins, losses and ties', () => {
    const matches = [
      { result: 'W' },
      { result: 'L' },
      { result: 'T' },
      { result: 'W' }
    ]
    expect(wlCounts(matches)).toEqual({ W: 2, L: 1, T: 1, total: 4 })
  })

  it('wlCounts ignores unknown results', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const matches = [
      { result: 'W' },
      { result: 'X' },
      { result: 'L' },
      { result: 'unknown' }
    ]
    expect(wlCounts(matches)).toEqual({ W: 1, L: 1, T: 0, total: 2 })
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('winRateFromCounts returns percentage with one decimal', () => {
    const counts = { W: 7, L: 3, T: 0 }
    expect(winRateFromCounts(counts)).toBe(70)
  })

  it('byKey groups matches using provided key function', () => {
    const matches = [
      { playerDeck: 'A' },
      { playerDeck: 'A' },
      { playerDeck: 'B' }
    ]
    const grouped = byKey(matches, m => m.playerDeck)
    expect(grouped.get('A')?.length).toBe(2)
    expect(grouped.get('B')?.length).toBe(1)
  })

  it('topDeckByWinRate finds deck with highest win rate', () => {
    const matches = [
      // Deck A: 5W 1L -> 83.3%
      { playerDeck: 'A', result: 'W' },
      { playerDeck: 'A', result: 'L' },
      { playerDeck: 'A', result: 'W' },
      { playerDeck: 'A', result: 'W' },
      { playerDeck: 'A', result: 'W' },
      { playerDeck: 'A', result: 'W' },
      // Deck B: 6W 0L -> 100%
      { playerDeck: 'B', result: 'W' },
      { playerDeck: 'B', result: 'W' },
      { playerDeck: 'B', result: 'W' },
      { playerDeck: 'B', result: 'W' },
      { playerDeck: 'B', result: 'W' },
      { playerDeck: 'B', result: 'W' }
    ]
    expect(topDeckByWinRate(matches)).toEqual({ deckKey: 'B', winRate: 100, games: 6 })
  })

  it('mostUsedDeckOf returns deck with most matches', () => {
    const matches = [
      { playerDeck: 'A' },
      { playerDeck: 'B' },
      { playerDeck: 'B' }
    ]
    expect(mostUsedDeckOf(matches)).toBe('B')
  })

  it('dateKeyMDY formats dates correctly', () => {
    const d = new Date('2024-05-06T00:00:00Z')
    expect(dateKeyMDY(d)).toBe('05/06/2024')
  })
})
