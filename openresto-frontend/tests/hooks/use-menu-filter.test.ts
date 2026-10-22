import { act, renderHook } from "@testing-library/react-native";
import { MENU_FILTER_STORAGE_KEY, useMenuFilter } from "@/hooks/use-menu-filter";
import { StorageService } from "@/services/storage";
import { NO_FILTER, type MenuFilter } from "@/utils/menuFilter";

// An in-memory device: the real service is a no-op off web, which would hide the behaviour.
const mockStore = new Map<string, string>();
jest.mock("@/services/storage", () => ({
  StorageService: {
    getItem: jest.fn((key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => void mockStore.set(key, value)),
    removeItem: jest.fn((key: string) => void mockStore.delete(key)),
  },
}));

describe("useMenuFilter", () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it("starts with no filter on a device that has none remembered", () => {
    const { result } = renderHook(() => useMenuFilter());
    expect(result.current[0]).toEqual(NO_FILTER);
  });

  it("hands a remounted screen the filter the guest left on, on its first render", () => {
    const first = renderHook(() => useMenuFilter());
    act(() => first.result.current[1]({ avoid: ["Gluten", "Eggs"], diets: ["Vegetarian"] }));
    first.unmount();

    // Every value the hook returned, so the very first render is the one checked: a menu that
    // drew unfiltered and corrected itself a frame later would still end on the right value.
    const renders: MenuFilter[] = [];
    renderHook(() => {
      const result = useMenuFilter();
      renders.push(result[0]);
      return result;
    });
    expect(renders[0]).toEqual({ avoid: ["Gluten", "Eggs"], diets: ["Vegetarian"] });
  });

  it("forgets the filter once the guest clears it", () => {
    const first = renderHook(() => useMenuFilter());
    act(() => first.result.current[1]({ avoid: ["Fish"], diets: [] }));
    act(() => first.result.current[1](NO_FILTER));
    first.unmount();

    expect(StorageService.removeItem).toHaveBeenCalledWith(MENU_FILTER_STORAGE_KEY);
    expect(renderHook(() => useMenuFilter()).result.current[0]).toEqual(NO_FILTER);
  });

  it("writes nothing until the guest changes something", () => {
    renderHook(() => useMenuFilter());
    expect(StorageService.setItem).not.toHaveBeenCalled();
    expect(StorageService.removeItem).not.toHaveBeenCalled();
  });

  it("reads corrupt storage as no filter instead of failing the screen", () => {
    mockStore.set(MENU_FILTER_STORAGE_KEY, "{not json");
    expect(renderHook(() => useMenuFilter()).result.current[0]).toEqual(NO_FILTER);
  });

  it("drops what a different build left behind but keeps what it can read", () => {
    mockStore.set(
      MENU_FILTER_STORAGE_KEY,
      JSON.stringify({ avoid: ["Gluten", "Quarks"], diets: [] })
    );
    expect(renderHook(() => useMenuFilter()).result.current[0]).toEqual({
      avoid: ["Gluten"],
      diets: [],
    });
  });
});
