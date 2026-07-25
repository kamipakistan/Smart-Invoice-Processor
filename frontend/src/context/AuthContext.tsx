import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  apiFetch,
  setAccessToken,
  getApiBaseUrl,
  setOnUnauthenticated,
} from '../api/client';

export interface User {
  id: number;
  username: string;
  is_active: boolean;
  last_login_at?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/auth/me');
      if (res.ok) {
        const userData: User = await res.json();
        setUser(userData);
        return true;
      } else {
        setUser(null);
        setAccessToken(null);
        return false;
      }
    } catch (err) {
      setUser(null);
      setAccessToken(null);
      return false;
    }
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.access_token);
        await fetchUserProfile();
        return true;
      } else {
        setUser(null);
        setAccessToken(null);
        return false;
      }
    } catch (err) {
      setUser(null);
      setAccessToken(null);
      return false;
    }
  }, [fetchUserProfile]);

  useEffect(() => {
    setOnUnauthenticated(() => {
      setUser(null);
      setIsLoading(false);
    });

    // Check if user has valid session on mount
    const initAuth = async () => {
      setIsLoading(true);
      await refreshToken();
      setIsLoading(false);
    };
    initAuth();
  }, [refreshToken]);

  // Periodic token refresh timer (every 10 minutes)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshToken();
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, refreshToken]);

  const login = async (username: string, password: string) => {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      let errorMsg = 'Invalid username or password';
      try {
        const data = await res.json();
        if (data.detail) errorMsg = data.detail;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    setAccessToken(data.access_token);
    await fetchUserProfile();
  };

  const logout = async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
