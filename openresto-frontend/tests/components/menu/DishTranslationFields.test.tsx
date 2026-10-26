import { fireEvent, render, screen } from "@testing-library/react-native";
import { DishTranslationFields } from "@/components/menu/DishTranslationFields";

it("lets the restaurateur identify Dutch as the original without erasing entered translations", () => {
  const change = jest.fn();
  const translations = { en: { name: "Soup", description: "Vegetables" } };
  render(
    <DishTranslationFields primaryLanguage="fr" translations={translations} onChange={change} />
  );
  fireEvent.press(screen.getByText("Français", { exact: true }));
  fireEvent.press(screen.getByText("Nederlands", { exact: true }));
  expect(change).toHaveBeenCalledWith("nl", translations);
});

it("keeps the original out of the optional fields and edits each translated field independently", () => {
  const change = jest.fn();
  render(
    <DishTranslationFields
      primaryLanguage="fr"
      translations={{ en: { name: "Soup", description: "Vegetables" } }}
      onChange={change}
    />
  );
  expect(screen.queryByTestId("dish-translation-fr-name")).toBeNull();
  fireEvent.changeText(screen.getByTestId("dish-translation-nl-name"), "Soep");
  expect(change).toHaveBeenLastCalledWith("fr", {
    nl: { name: "Soep", description: null },
    en: { name: "Soup", description: "Vegetables" },
  });
  fireEvent.changeText(screen.getByTestId("dish-translation-en-description"), "");
  expect(change).toHaveBeenLastCalledWith("fr", { en: { name: "Soup", description: null } });
});

it("makes a read-only dish and its original language non-editable", () => {
  render(
    <DishTranslationFields primaryLanguage="nl" translations={{}} onChange={jest.fn()} disabled />
  );
  expect(screen.getByTestId("dish-translation-fr-name").props.editable).toBe(false);
  expect(screen.queryByRole("combobox")).toBeNull();
});

it("keeps an editable proposal private until explicitly confirmed", () => {
  const change = jest.fn();
  render(
    <DishTranslationFields
      primaryLanguage="fr"
      sourceName="Soupe du jour"
      sourceDescription="Légumes de saison"
      translations={{}}
      onChange={change}
    />
  );
  fireEvent.press(screen.getByTestId("dish-suggest-nl"));
  expect(screen.getByTestId("dish-proposal-name").props.value).toBe("Soep van de dag");
  expect(change).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId("dish-proposal-name"), "Huissoep");
  expect(change).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId("dish-validate-nl"));
  expect(change).toHaveBeenCalledWith("fr", {
    nl: { name: "Huissoep", description: "Seizoensgroenten" },
  });
});

it("refuses to confirm an incomplete suggestion and invalidates it when the original changes", () => {
  const change = jest.fn();
  const props = {
    primaryLanguage: "fr" as const,
    sourceName: "Soupe du jour",
    sourceDescription: "Recette inconnue",
    translations: {},
    onChange: change,
  };
  const view = render(<DishTranslationFields {...props} />);
  fireEvent.press(screen.getByTestId("dish-suggest-en"));
  fireEvent.press(screen.getByTestId("dish-validate-en"));
  expect(change).not.toHaveBeenCalled();
  view.rerender(<DishTranslationFields {...props} sourceName="Poisson du jour" />);
  expect(screen.queryByTestId("dish-proposal-en")).toBeNull();
});

it("never guesses an unknown name and cannot propose for a read-only dish", () => {
  const change = jest.fn();
  const view = render(
    <DishTranslationFields
      primaryLanguage="fr"
      sourceName="Inconnu"
      translations={{}}
      onChange={change}
    />
  );
  fireEvent.press(screen.getByTestId("dish-suggest-en"));
  expect(screen.queryByTestId("dish-proposal-en")).toBeNull();
  expect(change).not.toHaveBeenCalled();
  view.rerender(
    <DishTranslationFields
      primaryLanguage="fr"
      sourceName="Soupe du jour"
      translations={{}}
      onChange={change}
      disabled
    />
  );
  fireEvent.press(screen.getByTestId("dish-suggest-en"));
  expect(screen.queryByTestId("dish-proposal-en")).toBeNull();
});
