import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { Banner, Field } from "@/components/onboarding/formParts";

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));

describe("Field", () => {
  it("shows the label, the control and the hint", () => {
    render(
      <Field label="Address" hint="Street and number" testID="f">
        <Text>control</Text>
      </Field>
    );
    expect(screen.getByText("Address")).toBeTruthy();
    expect(screen.getByText("control")).toBeTruthy();
    expect(screen.getByText("Street and number")).toBeTruthy();
  });

  it("shows no hint and no error when it has none", () => {
    render(
      <Field label="Address" testID="f">
        <Text>control</Text>
      </Field>
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("f-error")).toBeNull();
  });

  it("announces a refusal about this field, under it", () => {
    render(
      <Field label="Address" error="Required." testID="f">
        <Text>control</Text>
      </Field>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Required.");
    expect(screen.getByTestId("f-error")).toBeTruthy();
  });

  it("announces a refusal even for a field with no test id", () => {
    render(
      <Field label="Address" error="Required.">
        <Text>control</Text>
      </Field>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Required.");
  });
});

describe("Banner", () => {
  it("is an alert for an error, the default", () => {
    render(<Banner testID="b">Nope.</Banner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Nope.");
  });

  it("is a status, not an alert, for a notice", () => {
    render(<Banner tone="warning">Suspended.</Banner>);
    expect(screen.getByRole("status")).toHaveTextContent("Suspended.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("is also a status for an informational one", () => {
    render(<Banner tone="info">FYI.</Banner>);
    expect(screen.getByRole("status")).toHaveTextContent("FYI.");
  });
});
