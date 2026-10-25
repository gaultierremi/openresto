import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { DishServiceControls } from "@/components/onboarding/DishServiceControls";
import { setMenuAvailability, uploadMenuPhoto, deleteMenuPhoto } from "@/api/onboarding";
import { pickFile } from "@/utils/pickFile";

jest.mock("@/api/onboarding", () => ({
  setMenuAvailability: jest.fn(),
  uploadMenuPhoto: jest.fn(),
  deleteMenuPhoto: jest.fn(),
}));
jest.mock("@/utils/pickFile", () => ({ pickFile: jest.fn() }));
jest.mock("@/context/BrandContext", () => ({ useBrand: () => ({ primaryColor: "#0a7ea4" }) }));
const props = { restaurantId: 1, itemId: 2, disabled: false, onExpired: jest.fn() };
beforeEach(() => jest.clearAllMocks());

it("updates service availability immediately and leaves an API refusal visible", async () => {
  (setMenuAvailability as jest.Mock)
    .mockResolvedValueOnce({ ok: true, value: { availability: "SoldOut" } })
    .mockResolvedValueOnce({ ok: false, status: 409, message: "Suspendu" });
  render(<DishServiceControls {...props} />);
  fireEvent.press(screen.getByTestId("dish-2-SoldOut"));
  await waitFor(() => expect(setMenuAvailability).toHaveBeenCalledWith(1, 2, "SoldOut"));
  await waitFor(() =>
    expect(screen.getByTestId("dish-2-SoldOut").props.accessibilityState.disabled).toBeFalsy()
  );
  fireEvent.press(screen.getByTestId("dish-2-Hidden"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Suspendu"));
});

it("uploads and removes a saved dish photo", async () => {
  (pickFile as jest.Mock).mockResolvedValue(
    new File(["photo"], "fictif.png", { type: "image/png" })
  );
  (uploadMenuPhoto as jest.Mock).mockResolvedValue({
    ok: true,
    value: { imageUrl: "/media/fictif.png" },
  });
  (deleteMenuPhoto as jest.Mock).mockResolvedValue({ ok: true, value: { imageUrl: null } });
  render(<DishServiceControls {...props} />);
  fireEvent.press(screen.getByTestId("dish-2-photo"));
  await waitFor(() => expect(uploadMenuPhoto).toHaveBeenCalledWith(1, 2, expect.any(File)));
  const remove = await screen.findByText("Remove photo");
  fireEvent.press(remove);
  await waitFor(() => expect(deleteMenuPhoto).toHaveBeenCalledWith(1, 2));
});

it("refuses unsupported files before sending and never writes for a suspended restaurant", async () => {
  (pickFile as jest.Mock).mockResolvedValue(
    new File(["html"], "fictif.html", { type: "text/html" })
  );
  const view = render(<DishServiceControls {...props} />);
  fireEvent.press(screen.getByTestId("dish-2-photo"));
  await screen.findByRole("alert");
  expect(uploadMenuPhoto).not.toHaveBeenCalled();
  view.rerender(<DishServiceControls {...props} disabled />);
  fireEvent.press(screen.getByTestId("dish-2-Hidden"));
  expect(setMenuAvailability).not.toHaveBeenCalled();
});
