import { describe, it, expect } from 'vitest'
import { parseTcgliveLog } from './parseTcgliveLog.js'

const sampleLog = [
  'Setup',
  "- Alice's Active is Pikachu",
  ' \u2022 Lightning Energy',
  "Turn #1 - Alice's Turn",
  "Alice plays Professor's Research",
  '- Alice draws 7 cards',
  ' \u2022 Pikachu',
  "Turn #2 - Bob's Turn",
  'Bob passes',
  'Alice wins.',
].join('\n')

describe('parseTcgliveLog', () => {
  it('parses a valid log structure', () => {
    const result = parseTcgliveLog(sampleLog)
    expect(result).toMatchInlineSnapshot(`
{
  "finalLine": "Alice wins.",
  "firstPlayer": "Alice",
  "players": {
    "opponent": {
      "name": "Bob",
    },
    "user": {
      "name": "Alice",
    },
  },
  "setup": [
    {
      "children": [
        {
          "text": "Lightning Energy",
          "type": "reveal",
        },
      ],
      "text": "Alice's Active is Pikachu",
    },
  ],
  "turns": [
    {
      "actions": [
        {
          "results": [
            {
              "children": [
                {
                  "text": "Pikachu",
                  "type": "reveal",
                },
              ],
              "text": "Alice draws 7 cards",
            },
          ],
          "text": "Alice plays Professor's Research",
        },
      ],
      "no": 1,
      "player": "Alice",
    },
    {
      "actions": [
        {
          "results": [],
          "text": "Bob passes",
        },
      ],
      "no": 2,
      "player": "Bob",
    },
  ],
  "winner": "Alice",
}
`)
  })

  it('extracts winner and final line with wins', () => {
    const result = parseTcgliveLog(sampleLog)
    expect(result.winner).toBe('Alice')
    expect(result.finalLine).toBe('Alice wins.')
  })

  it('parses reveal lines starting with bullets', () => {
    const result = parseTcgliveLog(sampleLog)
    expect(result.setup[0].children).toEqual([
      { type: 'reveal', text: 'Lightning Energy' },
    ])
    expect(result.turns[0].actions[0].results[0].children).toEqual([
      { type: 'reveal', text: 'Pikachu' },
    ])
  })

  it('returns null for invalid input', () => {
    expect(parseTcgliveLog()).toBeNull()
    expect(parseTcgliveLog('')).toBeNull()
    expect(parseTcgliveLog(123)).toBeNull()
  })
})
