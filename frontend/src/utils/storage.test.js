import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { safeParse, getItem, setItem } from './storage.js'

function createLocalStorageMock() {
  let store = {}
  return {
    getItem(key) {
      return store[key] ?? null
    },
    setItem(key, value) {
      store[key] = value
    },
    clear() {
      store = {}
    }
  }
}

beforeAll(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('safeParse', () => {
  it('returns fallback for invalid JSON', () => {
    expect(safeParse('not-json', 123)).toBe(123)
  })
})

describe('getItem', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns fallback when JSON is invalid', () => {
    localStorage.setItem('k', '{bad')
    expect(getItem('k', 5)).toBe(5)
  })
})

describe('setItem', () => {
  it('returns false when quota is exceeded', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const err = new Error('QuotaExceededError')
      err.name = 'QuotaExceededError'
      throw err
    })
    const res = setItem('k', { a: 1 })
    expect(res).toBe(false)
    spy.mockRestore()
  })
})
