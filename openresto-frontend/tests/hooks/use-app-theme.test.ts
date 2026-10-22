import { renderHook } from "@testing-library/react-native";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useBrand } from "@/context/BrandContext";
import { getThemeColors } from "@/theme/theme";
import { brandPalette } from "@/theme/brandColors";

// Override the global jest.setup.ts mock (which returns a plain "light") with a
// controllable jest.fn() so each test can drive light/dark mode.
jest.mock("@/hooks/use-color-scheme", () => ({
  useColorScheme: jest.fn(),
}));
jest.mock("@/context/BrandContext");
jest.mock("@/theme/theme");
// What the palette does to a colour is pinned in brandColors.test.ts; here only that the hook
// hands it the chosen colour and the scheme, and returns what it gives back.
jest.mock("@/theme/brandColors");

describe("useAppTheme", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useBrand as jest.Mock).mockReturnValue({ primaryColor: "#007AFF" });
    (getThemeColors as jest.Mock).mockReturnValue({ text: "#000", card: "#fff" });
    (brandPalette as jest.Mock).mockImplementation((color: string, isDark: boolean) => ({
      primary: `${color}/${isDark ? "dark" : "light"}`,
      onPrimary: isDark ? "#111" : "#fff",
    }));
  });

  it("returns correctly for light mode", () => {
    (useColorScheme as jest.Mock).mockReturnValue("light");
    const { result } = renderHook(() => useAppTheme());

    expect(result.current.isDark).toBe(false);
    expect(brandPalette).toHaveBeenCalledWith("#007AFF", false);
    expect(result.current.primaryColor).toBe("#007AFF/light");
    expect(result.current.onPrimary).toBe("#fff");
    expect(result.current.colors).toEqual({ text: "#000", card: "#fff" });
    expect(getThemeColors).toHaveBeenCalledWith(false);
  });

  it("hands the brand colour as chosen, not as drawn, to the palette", () => {
    (useColorScheme as jest.Mock).mockReturnValue("light");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.brand.primaryColor).toBe("#007AFF");
  });

  it("returns correctly for dark mode", () => {
    (useColorScheme as jest.Mock).mockReturnValue("dark");
    const { result } = renderHook(() => useAppTheme());

    expect(result.current.isDark).toBe(true);
    expect(getThemeColors).toHaveBeenCalledWith(true);
    expect(brandPalette).toHaveBeenCalledWith("#007AFF", true);
    expect(result.current.primaryColor).toBe("#007AFF/dark");
    expect(result.current.onPrimary).toBe("#111");
  });

  it("uses default primary color if brand has none", () => {
    (useBrand as jest.Mock).mockReturnValue({ primaryColor: null });
    (useColorScheme as jest.Mock).mockReturnValue("light");
    const { result } = renderHook(() => useAppTheme());

    expect(brandPalette).toHaveBeenCalledWith("#0a7ea4", false);
    expect(result.current.primaryColor).toBe("#0a7ea4/light");
  });
});
