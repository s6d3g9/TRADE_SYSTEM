import { createContext, useContext, useState, ReactNode } from 'react'

interface AuthModalContextType {
  isOpen: boolean
  openAuthModal: () => void
  closeAuthModal: () => void
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined)

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <AuthModalContext.Provider
      value={{
        isOpen,
        openAuthModal: () => setIsOpen(true),
        closeAuthModal: () => setIsOpen(false),
      }}
    >
      {children}
    </AuthModalContext.Provider>
  )
}

export function useAuthModal() {
  const context = useContext(AuthModalContext)
  if (!context) {
    throw new Error('useAuthModal must be used within AuthModalProvider')
  }
  return context
}
