import { encode } from "uqr";
import { menuUrl, QUIET_ZONE, qrBaseUrl, qrMatrix, qrToSvg, svgToDataUri } from "@/utils/qrCode";

const URL_R = "https://resto.example/menu/r/abc";

describe("qrToSvg", () => {
  it("is black on white whatever the brand colour is", () => {
    const svg = qrToSvg(URL_R);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });

  it("leaves the four-module quiet zone the spec asks for", () => {
    const modules = qrMatrix(URL_R).length;
    const total = modules + QUIET_ZONE * 2;
    expect(qrToSvg(URL_R)).toContain(`viewBox="0 0 ${total} ${total}"`);
  });

  it("draws exactly the modules the encoder produced", () => {
    const matrix = encode(URL_R, { ecc: "Q", border: 0 }).data;
    const svg = qrToSvg(URL_R);
    const path = /d="([^"]*)"/.exec(svg)![1];
    const drawn = new Set<string>();
    for (const [, x, y, run] of path.matchAll(/M(\d+),(\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(run); i++) drawn.add(`${Number(x) + i},${y}`);
    }
    const expected = new Set<string>();
    matrix.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) expected.add(`${x + QUIET_ZONE},${y + QUIET_ZONE}`);
      })
    );
    expect(drawn).toEqual(expected);
  });

  it("encodes a different address as a different code", () => {
    expect(qrToSvg(URL_R)).not.toBe(qrToSvg("https://resto.example/menu/t/abc"));
  });
});

describe("svgToDataUri", () => {
  it("wraps the markup in a data URI an img can load", () => {
    const uri = svgToDataUri('<svg a="1"/>');
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(uri.split(",")[1])).toBe('<svg a="1"/>');
  });
});

describe("menuUrl", () => {
  it("builds the restaurant and table addresses", () => {
    expect(menuUrl("https://resto.example", "r", "abc")).toBe("https://resto.example/menu/r/abc");
    expect(menuUrl("https://resto.example", "t", "abc")).toBe("https://resto.example/menu/t/abc");
  });

  it("never doubles a trailing slash", () => {
    expect(menuUrl("https://resto.example/", "r", "abc")).toBe("https://resto.example/menu/r/abc");
  });

  it("escapes a token that is not URL-safe", () => {
    expect(menuUrl("https://resto.example", "r", "a/b")).toBe("https://resto.example/menu/r/a%2Fb");
  });
});

describe("qrBaseUrl", () => {
  it("prefers the configured website address", () => {
    expect(qrBaseUrl("https://resto.example/", "http://localhost:8081")).toBe(
      "https://resto.example"
    );
  });

  it("falls back to the origin the admin is open on", () => {
    expect(qrBaseUrl(undefined, "http://localhost:8081/")).toBe("http://localhost:8081");
    expect(qrBaseUrl("   ", "http://localhost:8081")).toBe("http://localhost:8081");
  });

  it("ignores an address that is not http(s)", () => {
    expect(qrBaseUrl("javascript:alert(1)", "http://localhost:8081")).toBe("http://localhost:8081");
    expect(qrBaseUrl("resto.example", "http://localhost:8081")).toBe("http://localhost:8081");
  });
});
