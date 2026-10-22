import { fireEvent, render, screen } from "@testing-library/react-native";
import { DishTranslationFields } from "@/components/menu/DishTranslationFields";

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
