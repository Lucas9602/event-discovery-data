import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface ThemeColors {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  onAccent: string;
}

export const lightColors: ThemeColors = {
  background: "#e9e9e9",
  surface: "#ffffff",
  border: "#efefef",
  text: "#171717",
  textMuted: "#8e8e8e",
  accent: "#171717",
  onAccent: "#ffffff",
};

export const darkColors: ThemeColors = {
  background: "#0b0b0c",
  surface: "#1c1c1e",
  border: "#2c2c2e",
  text: "#f2f2f2",
  textMuted: "#9a9a9a",
  accent: "#f2f2f2",
  onAccent: "#171717",
};

const STORAGE_KEY = "demo.darkMode";

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "dark") setIsDark(true);
      })
      .catch(() => {});
  }, []);

  const toggle = () => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? "dark" : "light").catch(() => {});
      return next;
    });
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: isDark ? darkColors : lightColors, isDark, toggle }),
    [isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
