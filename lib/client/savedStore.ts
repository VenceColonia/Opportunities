"use client";

// Saved opportunities live in localStorage — per-browser, not synced across
// devices (ARCHITECTURE.md §9's documented tradeoff for the $0 system).
// Every read/write is wrapped so a private-browsing/blocked-storage
// environment degrades to "nothing saved" instead of throwing.

const STORAGE_KEY = "opportunity-dashboard:saved";

export function getSavedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function isSaved(id: string): boolean {
  return getSavedIds().includes(id);
}

export function toggleSaved(id: string): string[] {
  const current = getSavedIds();
  const next = current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — fail silently,
    // the UI just won't persist across reloads.
  }
  return next;
}

const LAST_VISIT_KEY = "opportunity-dashboard:last-visit";

export function getLastVisit(): string | null {
  try {
    return window.localStorage.getItem(LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

export function setLastVisitNow(): void {
  try {
    window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}
