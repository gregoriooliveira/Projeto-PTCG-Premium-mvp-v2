import { cleanup, renderHook, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalEnv = { ...import.meta.env }

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unmock("firebase/app")
    vi.unmock("firebase/auth")
    Object.keys(import.meta.env).forEach((key) => {
      delete import.meta.env[key]
    })
    Object.assign(import.meta.env, originalEnv)
  })

  it("mantém estado não autenticado quando o Google Auth está desativado", async () => {
    import.meta.env.VITE_ENABLE_GOOGLE_AUTH = "false"

    const { AuthProvider, useAuth } = await import("./AuthProvider.jsx")

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)

    let signInResult = null
    await act(async () => {
      signInResult = await result.current.signInWithGoogle()
      await result.current.signOut()
    })

    expect(signInResult).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it("exibe usuário autenticado e permite logout quando habilitado", async () => {
    import.meta.env.VITE_ENABLE_GOOGLE_AUTH = "true"
    import.meta.env.VITE_FIREBASE_API_KEY = "key"
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN = "domain"
    import.meta.env.VITE_FIREBASE_PROJECT_ID = "project"
    import.meta.env.VITE_FIREBASE_APP_ID = "app"

    const mockInitializeApp = vi.fn(() => ({ app: true }))
    const mockGetApps = vi.fn(() => [])
    const mockGetApp = vi.fn(() => ({ app: true }))
    const mockGetAuth = vi.fn(() => ({ auth: true }))
    const mockSignInWithPopup = vi.fn(async () => ({
      user: {
        uid: "user-123",
        email: "trainer@example.com",
        displayName: "Trainer",
        photoURL: "avatar.png",
      },
    }))
    const mockSignOut = vi.fn(async () => {})
    let authStateCallback = null
    const mockOnAuthStateChanged = vi.fn((auth, callback) => {
      authStateCallback = callback
      callback(null)
      return vi.fn()
    })

    vi.doMock("firebase/app", () => ({
      initializeApp: mockInitializeApp,
      getApps: mockGetApps,
      getApp: mockGetApp,
    }))

    vi.doMock("firebase/auth", () => ({
      getAuth: mockGetAuth,
      GoogleAuthProvider: class GoogleAuthProvider {},
      onAuthStateChanged: mockOnAuthStateChanged,
      signInWithPopup: mockSignInWithPopup,
      signOut: mockSignOut,
    }))

    const { AuthProvider, useAuth } = await import("./AuthProvider.jsx")

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    })

    expect(mockInitializeApp).toHaveBeenCalled()
    expect(mockOnAuthStateChanged).toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(false)

    await act(async () => {
      authStateCallback?.({
        uid: "abc",
        email: "preexisting@example.com",
      })
    })

    expect(result.current.user).toMatchObject({
      uid: "abc",
      email: "preexisting@example.com",
    })
    expect(result.current.isAuthenticated).toBe(true)

    let signInResult = null
    await act(async () => {
      signInResult = await result.current.signInWithGoogle()
    })

    expect(mockSignInWithPopup).toHaveBeenCalled()
    expect(signInResult).toMatchObject({
      uid: "user-123",
      email: "trainer@example.com",
      displayName: "Trainer",
      photoURL: "avatar.png",
    })
    expect(result.current.user).toMatchObject({ email: "trainer@example.com" })
    expect(result.current.isAuthenticated).toBe(true)

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })
})
