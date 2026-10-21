/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SiteSocialLinks } from "@/components/admin/site/SiteSocialLinks";
import { SOCIAL_KINDS } from "@/constants/site";
import type { SocialRow } from "@/utils/siteForm";

jest.setTimeout(20_000);

jest.mock("@/context/BrandContext", () => ({
  useBrand: () => ({ appName: "Open Resto", primaryColor: "#0a7ea4" }),
}));
jest.mock("@/utils/haptics", () => ({
  haptics: { selection: jest.fn(), press: jest.fn(), outcome: jest.fn() },
}));
// The dropdown has its own suite; here it lists its options as pressable rows.
jest.mock("@/components/common/Select", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    __esModule: true,
    default: ({
      options,
      selectedValue,
      onSelect,
    }: {
      options: { label: string; value: string }[];
      selectedValue: string;
      onSelect: (value: string) => void;
    }) => (
      <View>
        <Text testID={`selected-${selectedValue}`}>{selectedValue}</Text>
        {options.map((option) => (
          <Pressable
            key={option.value}
            testID={`${selectedValue}-to-${option.value}`}
            onPress={() => onSelect(option.value)}
          >
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const renderLinks = (rows: SocialRow[]) => {
  const onChange = jest.fn();
  render(<SiteSocialLinks rows={rows} onChange={onChange} />);
  return onChange;
};

describe("SiteSocialLinks", () => {
  it("lists a row per network with its address", () => {
    renderLinks([
      { kind: "Facebook", url: "https://facebook.com/a" },
      { kind: "Instagram", url: "" },
    ]);
    expect(screen.getByTestId("site-social-url-0").props.value).toBe("https://facebook.com/a");
    expect(screen.getByTestId("site-social-url-1").props.value).toBe("");
    expect(screen.getByLabelText("Address of the Facebook page")).toBeTruthy();
  });

  it("starts a new row on the first network not yet listed", () => {
    const onChange = renderLinks([{ kind: "Facebook", url: "https://facebook.com/a" }]);
    fireEvent.press(screen.getByTestId("site-social-add"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "Facebook", url: "https://facebook.com/a" },
      { kind: "Instagram", url: "" },
    ]);
  });

  it("offers the add button until the last network has its row", () => {
    const all = SOCIAL_KINDS.map((kind) => ({ kind, url: "" }));
    renderLinks(all.slice(0, -1));
    expect(screen.getByTestId("site-social-add")).toBeTruthy();
  });

  it("no longer offers the add button once every network has a row", () => {
    renderLinks(SOCIAL_KINDS.map((kind) => ({ kind, url: "" })));
    expect(screen.queryByTestId("site-social-add")).toBeNull();
  });

  it("edits only the row typed in", () => {
    const rows: SocialRow[] = [
      { kind: "Facebook", url: "" },
      { kind: "X", url: "" },
    ];
    const onChange = renderLinks(rows);
    fireEvent.changeText(screen.getByTestId("site-social-url-1"), "https://x.com/me");
    expect(onChange).toHaveBeenCalledWith([
      { kind: "Facebook", url: "" },
      { kind: "X", url: "https://x.com/me" },
    ]);
  });

  it("changes a row's network without touching its address", () => {
    const onChange = renderLinks([{ kind: "Facebook", url: "https://example.com" }]);
    fireEvent.press(screen.getByTestId("Facebook-to-TikTok"));
    expect(onChange).toHaveBeenCalledWith([{ kind: "TikTok", url: "https://example.com" }]);
  });

  it("removes only its own row, by network name", () => {
    const onChange = renderLinks([
      { kind: "Facebook", url: "a" },
      { kind: "X", url: "b" },
    ]);
    expect(screen.getByLabelText("Remove X")).toBeTruthy();
    fireEvent.press(screen.getByTestId("site-social-remove-0"));
    expect(onChange).toHaveBeenCalledWith([{ kind: "X", url: "b" }]);
  });
});
