// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { resolveLocale, translateNode, translateText } from "./translate";

it("prefers the stored choice, then the first supported system language", () => {
  expect(resolveLocale("is", ["en-US"])).toBe("is");
  expect(resolveLocale("en", ["is-IS"])).toBe("en");
  expect(resolveLocale(null, ["fr", "is-IS", "en"])).toBe("is");
  expect(resolveLocale(null, ["en-GB", "is"])).toBe("en");
  expect(resolveLocale("de", ["fr"])).toBe("en");
});

it("falls back to the English source", () => {
  expect(translateText({ Save: "Vista" }, "Save")).toBe("Vista");
  expect(translateText({ Save: "Vista" }, "Cancel")).toBe("Cancel");
  expect(translateText(null, "Save")).toBe("Save");
  expect(translateText({}, "constructor")).toBe("constructor");
});

it("lets a translation reorder placeholders", () => {
  const catalog = { "Open {a} in {b}": "Í {b}, opna {a}" };
  expect(translateText(catalog, "Open {a} in {b}", { a: "x", b: 2 })).toBe(
    "Í 2, opna x",
  );
});

it("coerces string values like a template literal and nodes like React", () => {
  expect(translateText(null, "Is {a}", { a: null })).toBe("Is null");
  expect(translateNode(null, "Is {a}{b}", { a: null, b: false })).toBe("Is ");
  expect(translateNode(null, "{n} left", { n: 3 })).toBe("3 left");
});

it("renders element values in the translated position", () => {
  const node = translateNode({ "Hi {who}": "{who}, hæ" }, "Hi {who}", {
    who: <b>Ari</b>,
  });
  const { container } = render(<p>{node}</p>);
  expect(screen.getByText("Ari").tagName).toBe("B");
  expect(container.textContent).toBe("Ari, hæ");
});

it("keeps literal braces no value claims", () => {
  expect(translateNode(null, "{x} {y}", { x: "a" })).toBe("a {y}");
  expect(translateText(null, "{x} {y}", { x: "a" })).toBe("a {y}");
});
