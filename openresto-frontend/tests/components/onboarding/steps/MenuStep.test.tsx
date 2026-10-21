import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { MenuStep } from "@/components/onboarding/steps/MenuStep";
import { saveMenu, skipStep } from "@/api/onboarding";
import { ok, readyState, refused, state } from "@/tests/helpers/onboardingFixtures";
import { setActiveLocale } from "@/utils/locale";
import { stepProps } from "./stepHarness";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/onboarding", () => ({ saveMenu: jest.fn(), skipStep: jest.fn() }));

const mockSave = saveMenu as jest.Mock;
const mockSkip = skipStep as jest.Mock;

const SAVED = state({
  steps: [
    { key: "info", state: "Done", canSkip: false },
    { key: "hours", state: "Done", canSkip: false },
    { key: "layout", state: "Done", canSkip: false },
    { key: "menu", state: "Todo", canSkip: true },
    { key: "branding", state: "Todo", canSkip: true },
  ],
  menu: {
    menuId: 3,
    name: "Carte",
    categories: [
      {
        id: 1,
        name: "Entrées",
        items: [
          { id: 11, name: "Croquettes", description: "Maison", priceMinor: 1450 },
          { id: 12, name: "Soupe", description: null, priceMinor: null },
        ],
      },
      { id: 2, name: "Desserts", items: [] },
    ],
  },
});

const press = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("step-menu-continue"));
  });
};

/** A menu with one new, filled-in dish, ready to send. */
const withNewDish = (priceText: string) => {
  const props = stepProps();
  render(<MenuStep {...props} />);
  fireEvent.press(screen.getByTestId("menu-add-category"));
  fireEvent.changeText(screen.getByTestId("category-0-name"), "Plats");
  fireEvent.changeText(screen.getByTestId("category-0-dish-0-name"), "Stoemp");
  fireEvent.changeText(screen.getByTestId("category-0-dish-0-price"), priceText);
  return props;
};

beforeEach(() => {
  jest.clearAllMocks();
  setActiveLocale("fr");
});
afterEach(() => setActiveLocale(undefined));

describe("MenuStep", () => {
  it("shows the saved menu with its prices written the way the language writes them", () => {
    render(<MenuStep {...stepProps({ state: SAVED })} />);
    expect(screen.getByTestId("menu-name").props.value).toBe("Carte");
    expect(screen.getByTestId("category-0-name").props.value).toBe("Entrées");
    expect(screen.getByTestId("category-0-dish-0-price").props.value).toBe("14,50");
    expect(screen.getByTestId("category-0-dish-1-price").props.value).toBe("");
    expect(screen.getByTestId("category-1-name").props.value).toBe("Desserts");
  });

  describe("prices", () => {
    it.each([
      ["12,50", 1250],
      ["12.5", 1250],
      ["9", 900],
    ])("sends %p as %p cents", async (typed, cents) => {
      mockSave.mockResolvedValue(ok(readyState()));
      withNewDish(typed);
      await press();
      expect(mockSave.mock.calls[0][1].categories[0].items[0].priceMinor).toBe(cents);
    });

    it("sends an empty price as none: price on request", async () => {
      mockSave.mockResolvedValue(ok(readyState()));
      withNewDish("");
      await press();
      expect(mockSave.mock.calls[0][1].categories[0].items[0].priceMinor).toBeNull();
    });

    it.each(["douze", "-4", "12,555", "12€"])(
      "refuses %p beside its dish, sending nothing and not advancing",
      async (typed) => {
        const props = withNewDish(typed);

        await press();

        expect(mockSave).not.toHaveBeenCalled();
        expect(props.onAdvance).not.toHaveBeenCalled();
        expect(props.onState).not.toHaveBeenCalled();
        expect(screen.getByTestId("category-0-dish-0-price-field-error")).toHaveTextContent(
          'Type a price in euros, for example 12.50, or leave it empty for "price on request".'
        );
      }
    );

    it("takes the message away once the price is edited", async () => {
      withNewDish("douze");
      await press();
      fireEvent.changeText(screen.getByTestId("category-0-dish-0-price"), "12");
      expect(screen.queryByTestId("category-0-dish-0-price-field-error")).toBeNull();
    });
  });

  it("saves the whole menu in the order of entry, with ids for what exists, then moves on", async () => {
    const saved = readyState();
    mockSave.mockResolvedValue(ok(saved));
    const props = stepProps({ state: SAVED });
    render(<MenuStep {...props} />);
    fireEvent.changeText(screen.getByTestId("menu-name"), "La carte");
    fireEvent.press(screen.getByTestId("category-1-add-dish"));
    fireEvent.changeText(screen.getByTestId("category-1-dish-0-name"), "Dame blanche");
    fireEvent.changeText(screen.getByTestId("category-1-dish-0-description"), "  ");
    fireEvent.changeText(screen.getByTestId("category-1-dish-0-price"), "8,5");

    await press();

    expect(mockSave).toHaveBeenCalledWith(7, {
      name: "La carte",
      categories: [
        {
          id: 1,
          name: "Entrées",
          items: [
            { id: 11, name: "Croquettes", description: "Maison", priceMinor: 1450 },
            { id: 12, name: "Soupe", description: null, priceMinor: null },
          ],
        },
        {
          id: 2,
          name: "Desserts",
          items: [{ name: "Dame blanche", description: null, priceMinor: 850 }],
        },
      ],
    });
    expect(props.onState).toHaveBeenCalledWith(saved);
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
  });

  describe("order of entry", () => {
    it("moves a category and a dish up and down", async () => {
      mockSave.mockResolvedValue(ok(readyState()));
      render(<MenuStep {...stepProps({ state: SAVED })} />);
      fireEvent.press(screen.getByTestId("category-1-up"));
      fireEvent.press(screen.getByTestId("category-1-dish-0-down"));
      await press();

      const sent = mockSave.mock.calls[0][1].categories;
      expect(sent.map((c: { id: number }) => c.id)).toEqual([2, 1]);
      expect(sent[1].items.map((i: { id: number }) => i.id)).toEqual([12, 11]);
    });

    it("moves a category down and a dish up too", async () => {
      mockSave.mockResolvedValue(ok(readyState()));
      render(<MenuStep {...stepProps({ state: SAVED })} />);
      fireEvent.press(screen.getByTestId("category-0-down"));
      fireEvent.press(screen.getByTestId("category-1-dish-1-up"));
      await press();

      const sent = mockSave.mock.calls[0][1].categories;
      expect(sent.map((c: { id: number }) => c.id)).toEqual([2, 1]);
      expect(sent[1].items.map((i: { id: number }) => i.id)).toEqual([12, 11]);
    });

    it("disables the arrows that would go past either end", () => {
      render(<MenuStep {...stepProps({ state: SAVED })} />);
      const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState.disabled;
      expect(disabled("category-0-up")).toBe(true);
      expect(disabled("category-0-down")).toBe(false);
      expect(disabled("category-1-down")).toBe(true);
      expect(disabled("category-0-dish-0-up")).toBe(true);
      expect(disabled("category-0-dish-1-down")).toBe(true);
    });
  });

  it("removes a dish and a category from the request", async () => {
    mockSave.mockResolvedValue(ok(readyState()));
    render(<MenuStep {...stepProps({ state: SAVED })} />);
    fireEvent.press(screen.getByTestId("category-0-dish-0-remove"));
    fireEvent.press(screen.getByTestId("category-1-remove"));
    await press();
    expect(mockSave.mock.calls[0][1].categories).toEqual([
      {
        id: 1,
        name: "Entrées",
        items: [{ id: 12, name: "Soupe", description: null, priceMinor: null }],
      },
    ]);
  });

  it("leaves out a dish row that was added and never filled in", async () => {
    mockSave.mockResolvedValue(ok(readyState()));
    render(<MenuStep {...stepProps({ state: SAVED })} />);
    fireEvent.press(screen.getByTestId("category-1-add-dish"));
    await press();
    expect(mockSave.mock.calls[0][1].categories[1].items).toEqual([]);
  });

  describe("names", () => {
    it("refuses a nameless category, naming it", async () => {
      const props = stepProps({ state: SAVED });
      render(<MenuStep {...props} />);
      fireEvent.changeText(screen.getByTestId("category-1-name"), " ");
      await press();
      expect(mockSave).not.toHaveBeenCalled();
      expect(props.onAdvance).not.toHaveBeenCalled();
      expect(screen.getByTestId("category-1-name-field-error")).toHaveTextContent(
        "Every category and every dish needs a name, and a price cannot be negative."
      );
      expect(screen.queryByTestId("category-0-name-field-error")).toBeNull();
    });

    it("refuses a nameless dish, naming it", async () => {
      render(<MenuStep {...stepProps({ state: SAVED })} />);
      fireEvent.changeText(screen.getByTestId("category-0-dish-1-name"), "");
      await press();
      expect(mockSave).not.toHaveBeenCalled();
      expect(screen.getByTestId("category-0-dish-1-name-field-error")).toBeTruthy();
      expect(screen.queryByTestId("category-0-dish-0-name-field-error")).toBeNull();
    });
  });

  it("cannot be continued without a category, since there is nothing to save", () => {
    render(<MenuStep {...stepProps()} />);
    expect(screen.getByTestId("step-menu-continue").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId("menu-add-category"));
    expect(screen.getByTestId("step-menu-continue").props.accessibilityState.disabled).toBe(false);
  });

  describe("the import card", () => {
    it("is there, disabled and marked as coming soon, while the server says it cannot import", () => {
      render(<MenuStep {...stepProps()} />);
      const card = screen.getByTestId("menu-import");
      expect(screen.getByText("Import from a photo or a PDF")).toBeTruthy();
      expect(card.props.accessibilityState.disabled).toBe(true);
      expect(screen.getByTestId("menu-import-soon")).toHaveTextContent("Soon");
    });

    it("does nothing when pressed", () => {
      const props = stepProps();
      render(<MenuStep {...props} />);
      fireEvent.press(screen.getByTestId("menu-import"));
      expect(mockSave).not.toHaveBeenCalled();
      expect(props.onAdvance).not.toHaveBeenCalled();
    });

    it("is enabled, and no longer soon, once the server says it can import", () => {
      render(<MenuStep {...stepProps({ state: state({ capabilities: { menuImport: true } }) })} />);
      expect(screen.getByTestId("menu-import").props.accessibilityState.disabled).toBe(false);
      expect(screen.queryByTestId("menu-import-soon")).toBeNull();
    });
  });

  describe("skipping", () => {
    it("is offered, because the server says the menu can be skipped", () => {
      render(<MenuStep {...stepProps({ state: SAVED })} />);
      expect(screen.getByTestId("step-menu-skip")).toBeTruthy();
    });

    it("is not offered when the server does not say so", () => {
      render(
        <MenuStep
          {...stepProps({
            state: state({ steps: [{ key: "menu", state: "Todo", canSkip: false }] }),
          })}
        />
      );
      expect(screen.queryByTestId("step-menu-skip")).toBeNull();
    });

    it("is not offered when the server leaves the step out altogether", () => {
      render(<MenuStep {...stepProps({ state: state({ steps: [] }) })} />);
      expect(screen.queryByTestId("step-menu-skip")).toBeNull();
    });

    it("calls the skip endpoint, saves no menu, and moves on with the answer", async () => {
      const skipped = readyState();
      mockSkip.mockResolvedValue(ok(skipped));
      const props = stepProps({ state: SAVED });
      render(<MenuStep {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId("step-menu-skip"));
      });

      expect(mockSkip).toHaveBeenCalledWith(7, "menu");
      expect(mockSave).not.toHaveBeenCalled();
      expect(props.onState).toHaveBeenCalledWith(skipped);
      expect(props.onAdvance).toHaveBeenCalledTimes(1);
    });

    it("stays on the step with the message when the server refuses", async () => {
      mockSkip.mockResolvedValue(refused("Cannot skip.", 400, "onboarding.step_required"));
      const props = stepProps({ state: SAVED });
      render(<MenuStep {...props} />);
      await act(async () => {
        fireEvent.press(screen.getByTestId("step-menu-skip"));
      });
      expect(screen.getByTestId("step-menu-banner")).toHaveTextContent("Cannot skip.");
      expect(props.onAdvance).not.toHaveBeenCalled();
    });
  });

  describe("a refused save", () => {
    it("shows the server's message, keeps the menu typed and does not advance", async () => {
      mockSave.mockResolvedValue(refused("Menu is not valid.", 400, "onboarding.menu_invalid"));
      const props = stepProps({ state: SAVED });
      render(<MenuStep {...props} />);
      fireEvent.changeText(screen.getByTestId("category-0-dish-0-name"), "Boulettes");

      await press();

      expect(screen.getByTestId("step-menu-banner")).toHaveTextContent("Menu is not valid.");
      expect(screen.getByTestId("category-0-dish-0-name").props.value).toBe("Boulettes");
      expect(props.onAdvance).not.toHaveBeenCalled();
      expect(props.onState).not.toHaveBeenCalled();
    });

    it("ends the session on a 401", async () => {
      mockSave.mockResolvedValue(refused("x", 401));
      const props = stepProps({ state: SAVED });
      render(<MenuStep {...props} />);
      await press();
      expect(props.onExpired).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("step-menu-banner")).toBeNull();
    });
  });

  it("goes back from its Back button", () => {
    const props = stepProps();
    render(<MenuStep {...props} />);
    fireEvent.press(screen.getByTestId("step-menu-back"));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("is read-only on a suspended restaurant: no save, no skip, only Next", () => {
    const props = stepProps({ readOnly: true, state: SAVED });
    render(<MenuStep {...props} />);
    expect(screen.getByTestId("category-0-name").props.editable).toBe(false);
    expect(screen.getByTestId("step-menu-form").props.pointerEvents).toBe("none");
    expect(screen.queryByTestId("step-menu-continue")).toBeNull();
    expect(screen.queryByTestId("step-menu-skip")).toBeNull();
    fireEvent.press(screen.getByTestId("step-menu-next"));
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSkip).not.toHaveBeenCalled();
  });
});
