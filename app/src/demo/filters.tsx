import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ZeitraumOption } from "../lib/dateRange";

interface FilterContextValue {
  selectedCategories: string[];
  zeitraum: ZeitraumOption;
  customFrom: string;
  customTo: string;
  toggleCategory: (value: string) => void;
  setZeitraum: (value: ZeitraumOption) => void;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  resetFilters: () => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [zeitraum, setZeitraum] = useState<ZeitraumOption>("alle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function toggleCategory(value: string) {
    if (value === "alle") {
      setSelectedCategories([]);
      return;
    }
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function resetFilters() {
    setSelectedCategories([]);
    setZeitraum("alle");
    setCustomFrom("");
    setCustomTo("");
  }

  const value = useMemo<FilterContextValue>(
    () => ({
      selectedCategories,
      zeitraum,
      customFrom,
      customTo,
      toggleCategory,
      setZeitraum,
      setCustomFrom,
      setCustomTo,
      resetFilters,
    }),
    [selectedCategories, zeitraum, customFrom, customTo],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within a FilterProvider");
  return ctx;
}
