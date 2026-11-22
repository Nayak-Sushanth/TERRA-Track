import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase/config';
import type { AuthUser } from '../types/terra';

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  };
}

function extractAuthCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim().length > 0) {
      return code.trim();
    }
  }
  return null;
}

function mapAuthError(error: unknown): { code: string | null; message: string } {
  const code = extractAuthCode(error);
  if (code) {
    switch (code) {
      case 'auth/unauthorized-domain':
        return { code, message: "This site's address is not authorised in Firebase yet." };
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
        return {
          code,
          message: 'Incorrect email or password. Please check your credentials and try again.',
        };
      case 'auth/invalid-email':
        return { code, message: 'Please enter a valid email address.' };
      case 'auth/email-already-in-use':
        return {
          code,
          message: 'An account with this email already exists. Try signing in instead.',
        };
      case 'auth/weak-password':
        return { code, message: 'Password is too weak. Use at least 6 characters.' };
      case 'auth/network-request-failed':
        return {
          code,
          message:
            'Network error while contacting the sign-in service. Check your internet connection and try again.',
        };
      case 'auth/too-many-requests':
        return {
          code,
          message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
        };
      case 'auth/operation-not-allowed':
        return {
          code,
          message:
            'Email/Password sign-in is disabled in Firebase. Enable Email/Password under Authentication > Sign-in method in the Firebase console, or use Continue with Google.',
        };
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return { code, message: 'Sign-in popup was closed before completing authentication.' };
      case 'auth/popup-blocked':
        return {
          code,
          message: 'Sign-in popup was blocked by your browser. Please allow popups and try again.',
        };
      case 'auth/user-disabled':
        return { code, message: 'This account has been disabled.' };
      default:
        return { code, message: `Sign-in failed (${code}). Please try again.` };
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return { code: null, message: error.message };
  }
  return { code: 'unknown', message: 'Sign-in failed (unknown). Please try again.' };
}

interface AuthContextValue {
  user: AuthUser | null;
  isInitializing: boolean;
  isSubmitting: boolean;
  authError: string | null;
  authErrorCode: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, displayName: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(isFirebaseConfigured);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setIsInitializing(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? toAuthUser(firebaseUser) : null);
      setIsInitializing(false);
    });
    return () => unsub();
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAuthErrorCode(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!auth) {
      setAuthError('Firebase Auth is not initialized.');
      return false;
    }
    setIsSubmitting(true);
    setAuthError(null);
    setAuthErrorCode(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      setUser(toAuthUser(cred.user));
      return true;
    } catch (error) {
      const mapped = mapAuthError(error);
      setAuthError(mapped.message);
      setAuthErrorCode(mapped.code);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string): Promise<boolean> => {
      if (!auth) {
        setAuthError('Firebase Auth is not initialized.');
        return false;
      }
      setIsSubmitting(true);
      setAuthError(null);
      setAuthErrorCode(null);
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const trimmedName = displayName.trim();
        if (trimmedName.length > 0) {
          await updateProfile(cred.user, { displayName: trimmedName });
        }
        setUser({
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: trimmedName || cred.user.displayName,
          emailVerified: cred.user.emailVerified,
        });
        return true;
      } catch (error) {
        const mapped = mapAuthError(error);
        setAuthError(mapped.message);
        setAuthErrorCode(mapped.code);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    if (!auth) {
      setAuthError('Firebase Auth is not initialized.');
      return false;
    }
    setIsSubmitting(true);
    setAuthError(null);
    setAuthErrorCode(null);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      setUser(toAuthUser(cred.user));
      return true;
    } catch (error) {
      const mapped = mapAuthError(error);
      setAuthError(mapped.message);
      setAuthErrorCode(mapped.code);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (!auth) return;
    setIsSubmitting(true);
    setAuthError(null);
    setAuthErrorCode(null);
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      const mapped = mapAuthError(error);
      setAuthError(mapped.message);
      setAuthErrorCode(mapped.code);
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitializing,
      isSubmitting,
      authError,
      authErrorCode,
      clearAuthError,
      login,
      register,
      loginWithGoogle,
      logout,
    }),
    [
      user,
      isInitializing,
      isSubmitting,
      authError,
      authErrorCode,
      clearAuthError,
      login,
      register,
      loginWithGoogle,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
