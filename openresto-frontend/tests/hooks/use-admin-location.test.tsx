/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useAdminLocation } from "@/hooks/use-admin-location";
import { adminGetRestaurants, type AdminRestaurantSummary } from "@/api/admin";
import { StorageService } from "@/services/storage";

jest.mock("@/api/admin", () => ({ adminGetRestaurants: jest.fn() }));
jest.mock("@/services/storage", () => ({
  StorageService: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

const getRestaurants = adminGetRestaurants as jest.Mock;
const getItem = StorageService.getItem as jest.Mock;
const setItem = StorageService.setItem as jest.Mock;

const KEY = "menus:locationId";

const place = (id: number, over: Partial<AdminRestaurantSummary> = {}): AdminRestaurantSummary => ({
  id,
  name: `Place ${id}`,
  ...over,
});

const ready = async (result: { current: ReturnType<typeof useAdminLocation> }) => {
  await waitFor(() => expect(result.current.loading).toBe(false));
};

beforeEach(() => {
  jest.clearAllMocks();
  getItem.mockReturnValue(null);
});

describe("useAdminLocation", () => {
  it("is loading, with nothing selected, until the locations arrive", async () => {
    getRestaurants.mockResolvedValue([place(1)]);
    const { result } = renderHook(() => useAdminLocation());
    expect(result.current.loading).toBe(true);
    expect(result.current.selected).toBeNull();
    await ready(result);
  });

  it("leaves archived locations out", async () => {
    getRestaurants.mockResolvedValue([
      place(1, { isArchived: true }),
      place(2, { isArchived: false }),
      place(3),
    ]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    expect(result.current.restaurants.map((r) => r.id)).toEqual([2, 3]);
  });

  it("selects the first location when nothing was remembered", async () => {
    getRestaurants.mockResolvedValue([place(4), place(5)]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    expect(result.current.selected?.id).toBe(4);
  });

  it("selects the first active location when the first one listed is archived", async () => {
    getRestaurants.mockResolvedValue([place(1, { isArchived: true }), place(2)]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    expect(result.current.selected?.id).toBe(2);
  });

  it("reads the remembered pick from the one shared key, and it wins over the first location", async () => {
    getItem.mockImplementation((key: string) => (key === KEY ? "5" : null));
    getRestaurants.mockResolvedValue([place(4), place(5)]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    expect(getItem).toHaveBeenCalledWith(KEY);
    expect(result.current.selected?.id).toBe(5);
  });

  it("falls back to the first location when the remembered one no longer exists", async () => {
    getItem.mockReturnValue("99");
    getRestaurants.mockResolvedValue([place(4), place(5)]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    expect(result.current.selected?.id).toBe(4);
  });

  it("falls back to the first location when the remembered one has been archived", async () => {
    getItem.mockReturnValue("5");
    getRestaurants.mockResolvedValue([place(4), place(5, { isArchived: true })]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    expect(result.current.selected?.id).toBe(4);
  });

  it("selects nothing when there is no active location", async () => {
    getRestaurants.mockResolvedValue([place(1, { isArchived: true })]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    expect(result.current.restaurants).toEqual([]);
    expect(result.current.selected).toBeNull();
  });

  it("switches location and remembers the pick under the shared key", async () => {
    getRestaurants.mockResolvedValue([place(4), place(5)]);
    const { result } = renderHook(() => useAdminLocation());
    await ready(result);
    act(() => result.current.select(5));
    expect(result.current.selected?.id).toBe(5);
    expect(setItem).toHaveBeenLastCalledWith(KEY, "5");
  });

  it("ignores an answer that arrives after the screen has gone", async () => {
    let answer: (rows: AdminRestaurantSummary[]) => void = () => {};
    getRestaurants.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useAdminLocation());
    unmount();
    await act(async () => answer([place(1)]));
    expect(result.current.loading).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
