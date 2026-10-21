/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Platform, Share } from "react-native";
import BookingResultPanel from "@/components/booking/BookingResultPanel";
import { renderWithProviders } from "@/tests/helpers/renderWithProviders";
import { BookingDto } from "@/api/bookings";
import { RestaurantDto } from "@/api/restaurants";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

Object.defineProperty(Platform, "OS", { get: () => "web", configurable: true });

const mockBooking = {
  id: 1,
  bookingRef: "REF123",
  customerEmail: "test@test.com",
  restaurantId: 1,
  date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  seats: 2,
  isCancelled: false,
} as BookingDto;

const mockRestaurant = { id: 1, name: "Test Resto", address: "123 Main St" } as RestaurantDto;

describe("BookingResultPanel", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it("shows 'Booking Found' for an ordinary, non-justBooked upcoming booking", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={mockRestaurant}
        compact={false}
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(screen.getByText("Booking Found")).toBeTruthy();
    expect(screen.getByText("REF123")).toBeTruthy();
    expect(screen.getByText("Cancel This Booking")).toBeTruthy();
  });

  it("shows 'Booking Confirmed' instead when justBooked", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={mockRestaurant}
        compact={false}
        justBooked
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(screen.getByText("Booking Confirmed")).toBeTruthy();
    expect(screen.queryByText("Booking Found")).toBeNull();
  });

  it("shows 'Booking Cancelled' and drops the cancel button for a cancelled booking, even justBooked", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={{ ...mockBooking, isCancelled: true }}
        restaurant={mockRestaurant}
        compact={false}
        justBooked
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(screen.getByText("Booking Cancelled")).toBeTruthy();
    expect(screen.queryByText("Cancel This Booking")).toBeNull();
    expect(screen.getByText("This booking has been cancelled.")).toBeTruthy();
  });

  it("shows 'Booking Has Passed' and drops the cancel button for a past booking", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={{ ...mockBooking, date: "2020-01-01T12:00:00Z" }}
        restaurant={mockRestaurant}
        compact={false}
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(screen.getByText("Booking Has Passed")).toBeTruthy();
    expect(screen.queryByText("Cancel This Booking")).toBeNull();
    expect(
      screen.getByText("This booking has already passed and can no longer be cancelled.")
    ).toBeTruthy();
  });

  it("a past date wins over justBooked too", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={{ ...mockBooking, date: "2020-01-01T12:00:00Z" }}
        restaurant={mockRestaurant}
        compact={false}
        justBooked
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(screen.getByText("Booking Has Passed")).toBeTruthy();
  });

  it("calls onCancelPress when Cancel This Booking is pressed", () => {
    const onCancelPress = jest.fn();
    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={mockRestaurant}
        compact={false}
        cancelling={false}
        onCancelPress={onCancelPress}
      />
    );
    fireEvent.press(screen.getByText("Cancel This Booking"));
    expect(onCancelPress).toHaveBeenCalled();
  });

  it("copies the reference to the clipboard on web and reverts the label after a timeout", async () => {
    const mockClipboard = jest.fn();
    (navigator as any).clipboard = { writeText: mockClipboard };

    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={mockRestaurant}
        compact={false}
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    fireEvent.press(screen.getByText("Copy"));
    expect(mockClipboard).toHaveBeenCalledWith("REF123");
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Copy")).toBeTruthy(), { timeout: 3000 });
  }, 10000);

  it("keeps the calendar and directions actions on native, swapping Copy for Share", () => {
    // Calendar reaches native through the share sheet and directions through
    // Linking.openURL; the clipboard is covered by the share sheet, which also reaches the
    // messaging apps a diner actually sends a booking to.
    Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
    try {
      renderWithProviders(
        <BookingResultPanel
          booking={mockBooking}
          restaurant={mockRestaurant}
          compact={false}
          cancelling={false}
          onCancelPress={jest.fn()}
        />
      );
      expect(screen.getByText("ADD TO CALENDAR")).toBeTruthy();
      expect(screen.getByText("GET DIRECTIONS")).toBeTruthy();
      expect(screen.queryByText("Copy")).toBeNull();
      expect(screen.getByText("Share")).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, "OS", { get: () => "web", configurable: true });
    }
  });

  it("puts the reference, the restaurant, the time and the party on the share sheet", () => {
    Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    try {
      renderWithProviders(
        <BookingResultPanel
          booking={mockBooking}
          restaurant={mockRestaurant}
          compact={false}
          cancelling={false}
          onCancelPress={jest.fn()}
        />
      );
      fireEvent.press(screen.getByTestId("share-booking-btn"));
      expect(shareSpy).toHaveBeenCalledTimes(1);
      const { message } = shareSpy.mock.calls[0][0] as { message: string };
      expect(message).toContain("REF123");
      expect(message).toContain(mockRestaurant.name);
      expect(message).toContain(`${mockBooking.seats} guests`);
    } finally {
      shareSpy.mockRestore();
      Object.defineProperty(Platform, "OS", { get: () => "web", configurable: true });
    }
  });

  it("falls back to a generic restaurant name on the sheet, and survives a declined share", async () => {
    Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
    const shareSpy = jest.spyOn(Share, "share").mockRejectedValue(new Error("dismissed"));
    try {
      renderWithProviders(
        <BookingResultPanel
          booking={{ ...mockBooking, seats: 1 }}
          restaurant={null}
          compact={false}
          cancelling={false}
          onCancelPress={jest.fn()}
        />
      );
      fireEvent.press(screen.getByTestId("share-booking-btn"));
      const { message } = shareSpy.mock.calls[0][0] as { message: string };
      expect(message).toContain("at Restaurant");
      expect(message).toContain("1 guest");
      await waitFor(() => expect(screen.getByText("Share")).toBeTruthy());
    } finally {
      shareSpy.mockRestore();
      Object.defineProperty(Platform, "OS", { get: () => "web", configurable: true });
    }
  });

  describe("the link on the share sheet", () => {
    const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
    const flushBrand = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

    beforeEach(() => {
      delete process.env.EXPO_PUBLIC_API_URL;
    });

    afterEach(() => {
      process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
      Object.defineProperty(Platform, "OS", { get: () => "web", configurable: true });
    });

    it("hands iOS the confirmation link as its own item, built from the brand's website URL", async () => {
      Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ appName: "Open Resto", websiteUrl: "https://bookings.example.com/" }),
      });
      const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
      try {
        renderWithProviders(
          <BookingResultPanel
            booking={mockBooking}
            restaurant={mockRestaurant}
            compact={false}
            cancelling={false}
            onCancelPress={jest.fn()}
          />
        );
        await flushBrand();
        fireEvent.press(screen.getByTestId("share-booking-btn"));
        const content = shareSpy.mock.calls[0][0] as { message: string; url?: string };
        expect(content.url).toBe(
          "https://bookings.example.com/booking-confirmation/REF123?email=test%40test.com"
        );
        expect(content.message).not.toContain("https://");
      } finally {
        shareSpy.mockRestore();
      }
    });

    it("puts the link on its own line of the message on Android, falling back to the build's server", () => {
      Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
      process.env.EXPO_PUBLIC_API_URL = "https://bookings.example.com/api";
      const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
      try {
        renderWithProviders(
          <BookingResultPanel
            booking={mockBooking}
            restaurant={mockRestaurant}
            compact={false}
            cancelling={false}
            onCancelPress={jest.fn()}
          />
        );
        fireEvent.press(screen.getByTestId("share-booking-btn"));
        const content = shareSpy.mock.calls[0][0] as { message: string; url?: string };
        expect(content.url).toBeUndefined();
        expect(content.message).toMatch(
          /REF123 at Test Resto[^\n]*\nhttps:\/\/bookings\.example\.com\/booking-confirmation\/REF123\?email=test%40test\.com$/
        );
      } finally {
        shareSpy.mockRestore();
      }
    });

    it("shares the details alone when no origin is known, rather than a link to nowhere", () => {
      Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
      const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
      try {
        renderWithProviders(
          <BookingResultPanel
            booking={mockBooking}
            restaurant={mockRestaurant}
            compact={false}
            cancelling={false}
            onCancelPress={jest.fn()}
          />
        );
        fireEvent.press(screen.getByTestId("share-booking-btn"));
        const content = shareSpy.mock.calls[0][0] as { message: string; url?: string };
        expect(content).not.toHaveProperty("url");
        expect(content.message).not.toContain("booking-confirmation");
      } finally {
        shareSpy.mockRestore();
      }
    });
  });

  describe("Share on web", () => {
    const link = "http://localhost/booking-confirmation/REF123?email=test%40test.com";

    afterEach(() => {
      delete (navigator as { share?: unknown }).share;
      delete (navigator as { clipboard?: unknown }).clipboard;
    });

    it("sits beside Copy rather than replacing it", () => {
      renderWithProviders(
        <BookingResultPanel
          booking={mockBooking}
          restaurant={mockRestaurant}
          compact={false}
          cancelling={false}
          onCancelPress={jest.fn()}
        />
      );
      expect(screen.getByText("Copy")).toBeTruthy();
      expect(screen.getByText("Share")).toBeTruthy();
    });

    it("opens the browser's share sheet with the link as its own item where there is one", () => {
      (navigator as { share?: unknown }).share = jest.fn().mockResolvedValue(undefined);
      const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
      try {
        renderWithProviders(
          <BookingResultPanel
            booking={mockBooking}
            restaurant={mockRestaurant}
            compact={false}
            cancelling={false}
            onCancelPress={jest.fn()}
          />
        );
        fireEvent.press(screen.getByTestId("share-booking-btn"));
        expect(shareSpy).toHaveBeenCalledTimes(1);
        const content = shareSpy.mock.calls[0][0] as { message: string; url?: string };
        expect(content.url).toBe(link);
        expect(content.message).toContain("REF123");
        expect(content.message).not.toContain("http");
      } finally {
        shareSpy.mockRestore();
      }
    });

    it("copies the link instead where the browser has no share sheet, and reverts the label", async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      (navigator as { clipboard?: unknown }).clipboard = { writeText };
      const shareSpy = jest.spyOn(Share, "share");
      try {
        renderWithProviders(
          <BookingResultPanel
            booking={mockBooking}
            restaurant={mockRestaurant}
            compact={false}
            cancelling={false}
            onCancelPress={jest.fn()}
          />
        );
        fireEvent.press(screen.getByTestId("share-booking-btn"));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
        expect(shareSpy).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.getByText("Link copied")).toBeTruthy());
        await waitFor(() => expect(screen.getByText("Share")).toBeTruthy(), { timeout: 3000 });
      } finally {
        shareSpy.mockRestore();
      }
    }, 10000);

    it("stays on its resting label when the clipboard write is refused", async () => {
      (navigator as { clipboard?: unknown }).clipboard = {
        writeText: jest.fn().mockRejectedValue(new Error("denied")),
      };
      renderWithProviders(
        <BookingResultPanel
          booking={mockBooking}
          restaurant={mockRestaurant}
          compact={false}
          cancelling={false}
          onCancelPress={jest.fn()}
        />
      );
      fireEvent.press(screen.getByTestId("share-booking-btn"));
      await act(() => new Promise<void>((r) => setTimeout(r, 0)));
      expect(screen.queryByText("Link copied")).toBeNull();
      expect(screen.getByText("Share")).toBeTruthy();
    });
  });

  /**
   * The map is two third-party services, a geocoder and OpenStreetMap's embed. Neither is
   * contacted until the guest asks for the map, so opening the page tells them nothing and
   * costs a weak connection nothing; the directions links are there either way.
   */
  describe("the map", () => {
    const geocoderCalls = () =>
      (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes("nominatim"));
    const iframes = () => screen.UNSAFE_root.findAll((node) => node.type === "iframe");
    const renderPanel = (restaurant: RestaurantDto | null = mockRestaurant) =>
      renderWithProviders(
        <BookingResultPanel
          booking={mockBooking}
          restaurant={restaurant}
          compact={false}
          cancelling={false}
          onCancelPress={jest.fn()}
        />
      );

    beforeEach(() => {
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: "43.6532", lon: "-79.3832" }],
      });
    });

    it("contacts no third-party service until the guest asks for it", async () => {
      renderPanel();
      await act(() => new Promise<void>((r) => setTimeout(r, 0)));

      expect(geocoderCalls()).toHaveLength(0);
      expect(iframes()).toHaveLength(0);
      expect(screen.getByTestId("show-map-btn")).toBeTruthy();
      expect(screen.getByText("GET DIRECTIONS")).toBeTruthy();
    });

    it("geocodes the address and embeds the map once asked, then offers the button no more", async () => {
      renderPanel();
      fireEvent.press(screen.getByTestId("show-map-btn"));

      await waitFor(() => expect(geocoderCalls()).toHaveLength(1));
      expect(String(geocoderCalls()[0][0])).toContain(encodeURIComponent("123 Main St"));
      await waitFor(() => expect(iframes()).toHaveLength(1));
      expect(iframes()[0].props.src).toContain("marker=43.6532,-79.3832");
      expect(iframes()[0].props.title).toBe("Map of Test Resto");
      expect(screen.queryByTestId("show-map-btn")).toBeNull();
    });

    it("shows no map when the geocoder knows no such address", async () => {
      (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
      renderPanel();
      fireEvent.press(screen.getByTestId("show-map-btn"));

      await waitFor(() => expect(geocoderCalls()).toHaveLength(1));
      expect(iframes()).toHaveLength(0);
      expect(screen.getByText("GET DIRECTIONS")).toBeTruthy();
    });

    it("offers no map for a restaurant without an address", () => {
      renderPanel({ ...mockRestaurant, address: "" });
      expect(screen.queryByTestId("show-map-btn")).toBeNull();
    });

    it("offers none off the web, where the guest app has the platform's maps through Directions", async () => {
      Object.defineProperty(Platform, "OS", { get: () => "ios", configurable: true });
      try {
        renderPanel();
        await act(() => new Promise<void>((r) => setTimeout(r, 0)));
        expect(screen.queryByTestId("show-map-btn")).toBeNull();
        expect(geocoderCalls()).toHaveLength(0);
      } finally {
        Object.defineProperty(Platform, "OS", { get: () => "web", configurable: true });
      }
    });
  });

  it("omits the directions/map card when the restaurant has no address", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={{ ...mockRestaurant, address: "" }}
        compact={false}
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(screen.queryByText("GET DIRECTIONS")).toBeNull();
  });

  it("switches the calendar layout with the compact prop, keeping named directions", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={mockRestaurant}
        compact
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    // Only the calendar section has a compact layout: its rows collapse to short pills
    // ("Outlook", not "Outlook Calendar"). Directions stay named at every width.
    expect(screen.getByText("Outlook")).toBeTruthy();
    expect(screen.queryByText("Outlook Calendar")).toBeNull();
    expect(screen.getByText("GET DIRECTIONS")).toBeTruthy();
    expect(screen.getByText("Apple")).toBeTruthy();
  });

  it("shows a spinner via the loading prop while cancelling", () => {
    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={mockRestaurant}
        compact={false}
        cancelling
        onCancelPress={jest.fn()}
      />
    );
    const button = screen.getByLabelText("Cancel this booking");
    expect(button.props.accessibilityState.busy).toBe(true);
  });

  it("offers wallet passes only for an upcoming booking on a server that issues them", async () => {
    const brandFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        appName: "Open Resto",
        primaryColor: "#0a7ea4",
        wallet: { apple: true, google: true },
      }),
    });
    (global.fetch as jest.Mock) = brandFetch;

    renderWithProviders(
      <BookingResultPanel
        booking={mockBooking}
        restaurant={mockRestaurant}
        compact={false}
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(await screen.findByTestId("wallet-actions")).toBeTruthy();
    expect(screen.queryByTestId("reminder-toggle")).toBeNull();

    screen.unmount();
    renderWithProviders(
      <BookingResultPanel
        booking={{ ...mockBooking, isCancelled: true }}
        restaurant={mockRestaurant}
        compact={false}
        cancelling={false}
        onCancelPress={jest.fn()}
      />
    );
    expect(await screen.findByText("Booking Cancelled")).toBeTruthy();
    await waitFor(() => expect(brandFetch.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByTestId("wallet-actions")).toBeNull();
  });
});
