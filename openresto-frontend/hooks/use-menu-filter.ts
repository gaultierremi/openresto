import { useCallback, useState } from "react";
import { StorageService } from "@/services/storage";
import { isFilterActive, NO_FILTER, sanitizeFilter, type MenuFilter } from "@/utils/menuFilter";

/**
 * Shared by every menu on this device rather than kept per restaurant: an allergy belongs to the
 * person holding the phone, not to the table they are sitting at.
 */
export const MENU_FILTER_STORAGE_KEY = "openresto.menu.filter";

function readStoredFilter(): MenuFilter {
  const stored = StorageService.getItem(MENU_FILTER_STORAGE_KEY);
  if (stored === null) return NO_FILTER;
  try {
    return sanitizeFilter(JSON.parse(stored));
  } catch {
    return NO_FILTER;
  }
}

/**
 * The guest's allergen and diet filter, remembered on the device so the next scan of a menu opens
 * with it already applied: a guest with an allergy should not have to find the panel and tick the
 * same boxes at every table. Read synchronously on the first render, so the menu is never drawn
 * unfiltered and then corrected. Only a change the guest makes is written; clearing the filter
 * forgets it.
 *
 * @see [use-menu-filter.test.ts](../tests/hooks/use-menu-filter.test.ts) — pins that a choice
 * survives a remount, that clearing it forgets it, and that corrupt storage reads as no filter.
 */
export function useMenuFilter(): [MenuFilter, (next: MenuFilter) => void] {
  const [filter, setFilter] = useState<MenuFilter>(readStoredFilter);

  const update = useCallback((next: MenuFilter) => {
    setFilter(next);
    if (isFilterActive(next)) {
      StorageService.setItem(MENU_FILTER_STORAGE_KEY, JSON.stringify(next));
    } else {
      StorageService.removeItem(MENU_FILTER_STORAGE_KEY);
    }
  }, []);

  return [filter, update];
}
