import { useEffect, useState } from "react";
import { adminGetRestaurants, type AdminRestaurantSummary } from "@/api/admin";
import { usePersistedState } from "@/hooks/use-persisted-state";

/** One remembered pick for every menu screen, so Menus, Service and QR codes open on the same location. */
const STORAGE_KEY = "menus:locationId";

/**
 * The location an admin menu screen is working on. Archived locations are left out: they are off
 * the public site, so there is nothing to put a menu or a QR code on. The remembered pick is
 * used only while that location still exists; otherwise the first one stands in.
 *
 * @see [use-admin-location.test.tsx](../tests/hooks/use-admin-location.test.tsx) — pins that
 * archived locations are dropped, that the remembered pick wins, and that a stale one falls back.
 */
export function useAdminLocation() {
  const [restaurants, setRestaurants] = useState<AdminRestaurantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [persistedId, select] = usePersistedState<number | null>(STORAGE_KEY, null);

  useEffect(() => {
    let cancelled = false;
    adminGetRestaurants().then((all) => {
      if (cancelled) return;
      setRestaurants(all.filter((r) => !r.isArchived));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = restaurants.find((r) => r.id === persistedId) ?? restaurants[0] ?? null;

  return { restaurants, loading, selected, select };
}
