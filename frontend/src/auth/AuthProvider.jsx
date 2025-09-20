import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import PropTypes from "prop-types"
import { initializeApp, getApp, getApps } from "firebase/app"
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth"

const noop = async () => null
const noopVoid = async () => {}

const stubAuthValue = {
  user: null,
  isAuthenticated: false,
  signInWithGoogle: noop,
  signOut: noopVoid,
}

export const AuthContext = createContext(stubAuthValue)

const isGoogleAuthEnabled = String(import.meta.env?.VITE_ENABLE_GOOGLE_AUTH || "").toLowerCase() === "true"

const buildFirebaseConfig = () => {
  const config = {
    apiKey: import.meta.env?.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env?.VITE_FIREBASE_APP_ID,
    storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID,
  }

  return Object.fromEntries(Object.entries(config).filter(([, value]) => value))
}

const normalizeFirebaseUser = (firebaseUser) => {
  if (!firebaseUser) return null
  const { uid, email, displayName, photoURL } = firebaseUser
  return {
    uid: uid || "",
    email: email || "",
    displayName: displayName || "",
    photoURL: photoURL || "",
  }
}

export function AuthProvider({ children = null, value = null }) {
  const overrideValue = useMemo(() => {
    if (!value) return null
    return { ...stubAuthValue, ...value }
  }, [value])

  const [user, setUser] = useState(stubAuthValue.user)
  const authRef = useRef(null)

  useEffect(() => {
    if (overrideValue) return undefined
    if (!isGoogleAuthEnabled) return undefined

    const config = buildFirebaseConfig()
    if (!config || Object.keys(config).length === 0) {
      console.warn("Firebase config is missing. Google authentication is disabled.")
      return undefined
    }

    let isSubscribed = true
    let unsubscribe = () => {}

    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(config)
      const auth = getAuth(app)
      authRef.current = auth

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (!isSubscribed) return
        setUser(normalizeFirebaseUser(firebaseUser))
      })
    } catch (error) {
      console.error("Failed to initialize Firebase authentication", error)
    }

    return () => {
      isSubscribed = false
      if (typeof unsubscribe === "function") {
        unsubscribe()
      }
    }
  }, [overrideValue])

  const signInWithGoogle = useCallback(async () => {
    if (!isGoogleAuthEnabled || overrideValue) {
      return overrideValue?.user ?? null
    }

    if (!authRef.current) {
      console.warn("Google authentication is not ready")
      return null
    }

    const provider = new GoogleAuthProvider()
    const credential = await signInWithPopup(authRef.current, provider)
    const normalized = normalizeFirebaseUser(credential?.user)
    if (normalized) {
      setUser(normalized)
    }
    return normalized
  }, [overrideValue])

  const signOut = useCallback(async () => {
    if (!isGoogleAuthEnabled || overrideValue) {
      return undefined
    }

    if (!authRef.current) {
      setUser(null)
      return undefined
    }

    await firebaseSignOut(authRef.current)
    setUser(null)
    return undefined
  }, [overrideValue])

  const contextValue = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      signInWithGoogle,
      signOut,
    }),
    [signInWithGoogle, signOut, user],
  )

  if (overrideValue) {
    return <AuthContext.Provider value={overrideValue}>{children}</AuthContext.Provider>
  }

  if (!isGoogleAuthEnabled) {
    return <AuthContext.Provider value={stubAuthValue}>{children}</AuthContext.Provider>
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node,
  value: PropTypes.shape({
    user: PropTypes.shape({
      uid: PropTypes.string,
      email: PropTypes.string,
      displayName: PropTypes.string,
      photoURL: PropTypes.string,
    }),
    isAuthenticated: PropTypes.bool,
    signInWithGoogle: PropTypes.func,
    signOut: PropTypes.func,
  }),
}

export function useAuth() {
  return useContext(AuthContext)
}

export default AuthContext
