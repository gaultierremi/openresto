import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { InfoStep } from "@/components/onboarding/steps/InfoStep";
import { saveInfo } from "@/api/onboarding";
import { ok, readyState, refused, state } from "@/tests/helpers/onboardingFixtures";
import { stepProps } from "./stepHarness";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
jest.mock("@/api/onboarding", () => ({ saveInfo: jest.fn() }));

const mockSave = saveInfo as jest.Mock;

const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

const fillValid = () => {
  type("Restaurant name", "  Chez Paul ");
  type("Address", "Rue Haute 1, 1000 Bruxelles");
  type("Phone", "+32 2 123 45 67");
  type("Contact e-mail", "paul@chezpaul.be");
  type("Legal name", "Chez Paul SRL");
  type("Enterprise number (BCE/KBO)", "0123.456.749");
};

const press = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId("step-info-continue"));
  });
};

beforeEach(() => jest.clearAllMocks());

describe("InfoStep", () => {
  it("starts from what is saved, and from 12 months when nothing is", () => {
    const props = stepProps({ state: readyState() });
    render(<InfoStep {...props} />);
    expect(screen.getByLabelText("Restaurant name").props.value).toBe("Chez Paul");
    expect(screen.getByLabelText("Address").props.value).toBe("Rue Haute 1, 1000 Bruxelles");
    expect(screen.getByLabelText("Enterprise number (BCE/KBO)").props.value).toBe("0123.456.749");
    expect(screen.getByLabelText("Booking data retention (in months)").props.value).toBe("12");
  });

  it("explains the hints: address format, enterprise number format, VAT optional, retention", () => {
    render(<InfoStep {...stepProps()} />);
    expect(screen.getByText("Street and number, postcode, town")).toBeTruthy();
    expect(screen.getByText("Format 0123.456.749")).toBeTruthy();
    expect(screen.getByText("Optional")).toBeTruthy();
    expect(screen.getByText(/erased automatically/)).toBeTruthy();
  });

  it("saves what was typed, trimmed, and then moves on with the answer", async () => {
    const saved = readyState();
    mockSave.mockResolvedValue(ok(saved));
    const props = stepProps();
    render(<InfoStep {...props} />);
    fillValid();
    type("Booking data retention (in months)", "24");

    await press();

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(7, {
      name: "Chez Paul",
      address: "Rue Haute 1, 1000 Bruxelles",
      phoneNumber: "+32 2 123 45 67",
      emailAddress: "paul@chezpaul.be",
      legalName: "Chez Paul SRL",
      companyNumber: "0123.456.749",
      vatNumber: null,
      bookingRetentionMonths: 24,
    });
    expect(props.onState).toHaveBeenCalledWith(saved);
    expect(props.onAdvance).toHaveBeenCalledTimes(1);
  });

  it("sends the VAT number when there is one", async () => {
    mockSave.mockResolvedValue(ok(readyState()));
    render(<InfoStep {...stepProps()} />);
    fillValid();
    type("VAT number", "BE0123.456.749");
    await press();
    expect(mockSave.mock.calls[0][1].vatNumber).toBe("BE0123.456.749");
  });

  describe("what the server would refuse on sight", () => {
    it("names every blank required field, sends nothing and does not advance", async () => {
      const props = stepProps();
      render(<InfoStep {...props} />);
      type("Restaurant name", "");

      await press();

      expect(mockSave).not.toHaveBeenCalled();
      expect(props.onAdvance).not.toHaveBeenCalled();
      expect(props.onState).not.toHaveBeenCalled();
      expect(screen.getByTestId("info-name-error")).toHaveTextContent(
        "The restaurant name is required."
      );
      expect(screen.getByTestId("info-address-error")).toHaveTextContent(
        "The address is required."
      );
      expect(screen.getByTestId("info-phone-error")).toHaveTextContent(
        "The phone number is required."
      );
      expect(screen.getByTestId("info-email-error")).toHaveTextContent(
        "The contact e-mail address is required."
      );
      expect(screen.getByTestId("info-legalName-error")).toHaveTextContent(
        "The legal name is required."
      );
      expect(screen.getByTestId("info-companyNumber-error")).toHaveTextContent(
        "The enterprise number is required."
      );
      expect(screen.queryByTestId("info-vatNumber-error")).toBeNull();
    });

    it("calls a mistyped e-mail address invalid", async () => {
      render(<InfoStep {...stepProps()} />);
      fillValid();
      type("Contact e-mail", "paul-at-chezpaul");
      await press();
      expect(mockSave).not.toHaveBeenCalled();
      expect(screen.getByTestId("info-email-error")).toHaveTextContent(
        "Email address must be a valid email address."
      );
    });

    it.each(["0", "61", "", "abc"])(
      "refuses %p months, with the range in the message",
      async (months) => {
        render(<InfoStep {...stepProps()} />);
        fillValid();
        type("Booking data retention (in months)", months);
        await press();
        expect(mockSave).not.toHaveBeenCalled();
        expect(screen.getByTestId("info-retention-error")).toHaveTextContent(
          "The retention period must be between 1 and 60 months."
        );
      }
    );

    it.each(["1", "60"])("sends %p months", async (months) => {
      mockSave.mockResolvedValue(ok(readyState()));
      render(<InfoStep {...stepProps()} />);
      fillValid();
      type("Booking data retention (in months)", months);
      await press();
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave.mock.calls[0][1].bookingRetentionMonths).toBe(Number(months));
    });

    it("takes the message away from a field as soon as it is edited", async () => {
      render(<InfoStep {...stepProps()} />);
      await press();
      expect(screen.getByTestId("info-address-error")).toBeTruthy();

      type("Address", "Rue Haute 1");

      expect(screen.queryByTestId("info-address-error")).toBeNull();
      expect(screen.getByTestId("info-phone-error")).toBeTruthy();
    });

    it("clears a server refusal the next time the form is refused on sight", async () => {
      mockSave.mockResolvedValueOnce(refused("Bad.", 400, "onboarding.company_number_invalid"));
      render(<InfoStep {...stepProps()} />);
      fillValid();
      await press();
      expect(screen.getByTestId("info-companyNumber-error")).toBeTruthy();

      type("Phone", "");
      await press();

      expect(screen.getByTestId("info-phone-error")).toBeTruthy();
      expect(screen.queryByTestId("info-companyNumber-error")).toBeNull();
    });
  });

  describe("what only the server can judge", () => {
    it("shows its message beside the field its code names, and stays on the step", async () => {
      mockSave.mockResolvedValue(
        refused("Not a valid number.", 400, "onboarding.company_number_invalid")
      );
      const props = stepProps();
      render(<InfoStep {...props} />);
      fillValid();

      await press();

      expect(screen.getByTestId("info-companyNumber-error")).toHaveTextContent(
        "Not a valid number."
      );
      expect(screen.queryByTestId("step-info-banner")).toBeNull();
      expect(props.onAdvance).not.toHaveBeenCalled();
      expect(props.onState).not.toHaveBeenCalled();
    });

    it("keeps what was typed after a refusal", async () => {
      mockSave.mockResolvedValue(refused("Bad.", 400, "onboarding.vat_invalid"));
      render(<InfoStep {...stepProps()} />);
      fillValid();
      type("VAT number", "BE123");
      await press();
      expect(screen.getByTestId("info-vatNumber-error")).toHaveTextContent("Bad.");
      expect(screen.getByLabelText("VAT number").props.value).toBe("BE123");
      expect(screen.getByLabelText("Address").props.value).toBe("Rue Haute 1, 1000 Bruxelles");
    });

    it("shows a refusal that names no field above the form", async () => {
      mockSave.mockResolvedValue(refused("Suspended.", 409, "onboarding.suspended"));
      const props = stepProps();
      render(<InfoStep {...props} />);
      fillValid();

      await press();

      expect(screen.getByTestId("step-info-banner")).toHaveTextContent("Suspended.");
      expect(screen.queryByTestId("info-name-error")).toBeNull();
      expect(props.onAdvance).not.toHaveBeenCalled();
    });

    it("shows an unreachable server above the form too", async () => {
      mockSave.mockResolvedValue(refused("Server unreachable.", 0));
      render(<InfoStep {...stepProps()} />);
      fillValid();
      await press();
      expect(screen.getByTestId("step-info-banner")).toHaveTextContent("Server unreachable.");
    });

    it("ends the session on a 401 and shows nothing", async () => {
      mockSave.mockResolvedValue(refused("x", 401));
      const props = stepProps();
      render(<InfoStep {...props} />);
      fillValid();

      await press();

      expect(props.onExpired).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("step-info-banner")).toBeNull();
      expect(props.onAdvance).not.toHaveBeenCalled();
    });
  });

  it("does not offer to skip: the details are required", () => {
    render(<InfoStep {...stepProps({ state: state() })} />);
    expect(screen.queryByTestId("step-info-skip")).toBeNull();
  });

  it("offers no Back on the first stage and Back when there is a stage before", () => {
    const { unmount } = render(<InfoStep {...stepProps({ onBack: undefined })} />);
    expect(screen.queryByTestId("step-info-back")).toBeNull();
    unmount();
    const props = stepProps();
    render(<InfoStep {...props} />);
    fireEvent.press(screen.getByTestId("step-info-back"));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  describe("on a suspended restaurant", () => {
    it("takes no input and saves nothing, moving on without a call", async () => {
      const props = stepProps({ readOnly: true, state: readyState({ status: "Suspended" }) });
      render(<InfoStep {...props} />);

      expect(screen.getByLabelText("Restaurant name").props.editable).toBe(false);
      expect(screen.getByLabelText("Address").props.editable).toBe(false);
      expect(screen.getByLabelText("Booking data retention (in months)").props.editable).toBe(
        false
      );
      expect(screen.queryByTestId("step-info-continue")).toBeNull();

      fireEvent.press(screen.getByTestId("step-info-next"));
      await waitFor(() => expect(props.onAdvance).toHaveBeenCalledTimes(1));
      expect(mockSave).not.toHaveBeenCalled();
    });
  });
});
