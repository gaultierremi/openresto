/**
 * The ids with the one at `index` swapped with its neighbour, or null at an end. The server
 * wants every sibling's id in the new order, so a move is always the whole list.
 *
 * @see [reorder.test.ts](../tests/utils/reorder.test.ts) — pins both ends and the swap.
 */
export function moveId<T extends number | string>(
  ids: readonly T[],
  index: number,
  direction: -1 | 1
): T[] | null {
  const target = index + direction;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
