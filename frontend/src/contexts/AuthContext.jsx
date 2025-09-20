import { createContext, useContext } from "react";

const defaultValue = {
  user: null,
  signOut: async () => {},
};

const AuthContext = createContext(defaultValue);

export function AuthProvider({ value, children }) {
  return <AuthContext.Provider value={{ ...defaultValue, ...(value || {}) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
