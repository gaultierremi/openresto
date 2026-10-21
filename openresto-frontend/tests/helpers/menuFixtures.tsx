/**
 * Builders and a tree host for the admin menu editor's tests. The editor patches one menu tree
 * in place as each call lands, so a test of any of its components needs that tree to exist and
 * to change when `onTree` is called: `TreeHost` is that, and `box.current` is how the test reads
 * what the tree became.
 */
import React, { useCallback, useState } from "react";
import type { MenuCategoryDto, MenuDto, MenuItemDto } from "@/api/menus";

export const item = (over: Partial<MenuItemDto> = {}): MenuItemDto => ({
  id: 1,
  name: "Soup",
  description: null,
  priceMinor: 850,
  imageUrl: null,
  availability: "Available",
  allergens: [],
  dietaryTags: [],
  sortOrder: 0,
  ...over,
});

export const category = (over: Partial<MenuCategoryDto> = {}): MenuCategoryDto => ({
  id: 10,
  name: "Starters",
  description: null,
  sortOrder: 0,
  isVisible: true,
  items: [],
  ...over,
});

export const menu = (over: Partial<MenuDto> = {}): MenuDto => ({
  id: 100,
  name: "Lunch",
  description: null,
  currency: "EUR",
  isPublished: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  categories: [],
  ...over,
});

export type TreePatch = (menus: MenuDto[]) => MenuDto[];

/** Holds the tree a component under test patches, and hands the current one back through `box`. */
export function TreeHost({
  initial,
  box,
  children,
}: {
  initial: MenuDto[];
  box: { current: MenuDto[] };
  children: (menus: MenuDto[], onTree: (patch: TreePatch) => void) => React.ReactNode;
}) {
  const [menus, setMenus] = useState(initial);
  const onTree = useCallback((patch: TreePatch) => setMenus((current) => patch(current)), []);
  box.current = menus;
  return <>{children(menus, onTree)}</>;
}

/**
 * Fake timers for the autosave debounce, for the `describe` that calls it. It has to be called
 * inside a `describe`, never at the top of the file: RNTL's own cleanup hook waits on a timer,
 * and a top-level `afterEach` restoring the real clock runs after it, so the cleanup waits on a
 * clock that never ticks and every test dies on a hook timeout.
 */
export function useFakeClock() {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });
}

/** A pre-made `ok` / refused result of the menu API's `MenuResult` shape. */
export const ok = <T,>(value: T) => ({ ok: true as const, value });
export const refused = (message: string) => ({ ok: false as const, message });
