"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "quizai_user_api_key";

interface ApiKeyContextValue {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  /** True when the user has saved their own key */
  hasCustomKey: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextValue>({
  apiKey: "",
  setApiKey: () => {},
  clearApiKey: () => {},
  hasCustomKey: false,
});

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState("");

  // Hydrate from localStorage on mount (client-side only)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) ?? "";
    setApiKeyState(stored);
  }, []);

  const setApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setApiKeyState(trimmed);
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState("");
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ApiKeyContext.Provider
      value={{ apiKey, setApiKey, clearApiKey, hasCustomKey: Boolean(apiKey) }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  return useContext(ApiKeyContext);
}
