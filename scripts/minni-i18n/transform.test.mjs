import { describe, expect, it } from "vitest";
import { isTranslatableFile, transformSource } from "./transform.mjs";

const messages = (source, path = "a.tsx") =>
  transformSource(path, source).messages.map((m) => m.text);
const body = (source, path = "a.tsx") =>
  transformSource(path, source).code.replace(
    /^import \{[^}]*\} from "[^"]*";/,
    "",
  );

describe("JSX", () => {
  it("rewrites text and keeps significant spaces", () => {
    expect(body("const a = <p> Hello world </p>;")).toBe(
      'const a = <p>{" "}{__minniT("Hello world")}{" "}</p>;',
    );
  });

  it("joins multi-line text the way JSX does and keeps line numbers", () => {
    const out = body("const a = <p>\n  Hello\n  world\n</p>;\nconst b = 1;");
    expect(messages("const a = <p>\n  Hello\n  world\n</p>;")).toEqual([
      "Hello world",
    ]);
    expect(out.split("\n").length).toBe(5);
  });

  it("merges text and expressions into one reorderable message", () => {
    const source = 'const a = <p>Delete{" "}{name} forever?</p>;';
    expect(messages(source)).toEqual(["Delete {name} forever?"]);
    expect(body(source)).toBe(
      'const a = <p>{__minniTN("Delete {name} forever?", { "name": name })}</p>;',
    );
  });

  it("splits runs at child elements", () => {
    expect(messages("const a = <p>Open <b>the door</b> now</p>;")).toEqual([
      "Open",
      "the door",
      "now",
    ]);
  });

  it("decodes entities", () => {
    expect(messages("const a = <p>Rock &amp; roll</p>;")).toEqual([
      "Rock & roll",
    ]);
  });

  it("rewrites label attributes, not technical ones", () => {
    const source =
      'const a = <input aria-label="Search all" className="Big box" type="text" title={x ? "Yes it is" : "No it is not"} />;';
    expect(messages(source)).toEqual([
      "Search all",
      "Yes it is",
      "No it is not",
    ]);
    expect(body(source)).toContain('aria-label={__minniT("Search all")}');
    expect(body(source)).toContain('className="Big box"');
  });

  it("leaves verbatim elements and punctuation alone", () => {
    expect(messages("const a = <code>Run this now</code>;")).toEqual([]);
    expect(messages("const a = <p>·</p>;")).toEqual([]);
  });

  it("does not touch conditions", () => {
    const source = 'const a = <p>{kind === "Big one" ? "Large" : "Small"}</p>;';
    expect(messages(source)).toEqual(["Large", "Small"]);
    expect(body(source)).toContain('kind === "Big one"');
  });
});

describe("templates", () => {
  it("uses identifiers as placeholder names", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source under test
    const source = "const label = `Open ${item.name} and ${other}`;";
    expect(messages(source)).toEqual(["Open {name} and {other}"]);
    expect(body(source)).toBe(
      'const label = __minniT("Open {name} and {other}", { "name": item.name, "other": other });',
    );
  });

  it("names English plural endings so translations can drop them", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source under test
    const source = 'const label = `${n} field${n === 1 ? "" : "s"}`;';
    expect(messages(source)).toEqual(["{n} field{plural}"]);
  });

  it("translates literals nested in placeholders", () => {
    const source =
      // biome-ignore lint/suspicious/noTemplateCurlyInString: source under test
      'const a = <p title={`Has ${n === 1 ? "member" : "members"} here`} />;';
    expect(messages(source)).toEqual(["Has {value} here", "member", "members"]);
  });
});

describe("non-JSX contexts", () => {
  it("rewrites visible object fields and setters only", () => {
    const source = `
      const a = { label: "Sign in", status: "Online", id: "Plain value" };
      setError("Could not save");
      log("Not for people");
      function roomTitle() { return "Notes to self"; }
      function other() { return "Internal value"; }
    `;
    expect(messages(source, "a.ts")).toEqual([
      "Sign in",
      "Could not save",
      "Notes to self",
    ]);
  });

  it("requires a capitalised sentence outside JSX", () => {
    expect(messages('const a = { label: "lower-case-id" };', "a.ts")).toEqual(
      [],
    );
  });

  it("leaves agent tool schemas in English", () => {
    const source = 'const a = { description: "Run a tool", inputSchema: {} };';
    expect(messages(source, "a.ts")).toEqual([]);
  });

  it("translates literals compared against translated values only", () => {
    const source =
      'const a = group.label === "Agents"; const b = kind === "Agents";';
    expect(body(source, "a.ts")).toBe(
      'const a = group.label === __minniT("Agents"); const b = kind === "Agents";',
    );
  });

  it("treats copyStatus as a notice and status as a protocol value", () => {
    const source =
      'const a = copyStatus === "Link copied"; const b = status === "ACTIVE";';
    expect(messages(source, "a.ts")).toEqual(["Link copied"]);
  });

  it("keeps labels upstream uses as identities", () => {
    const source = 'const label = "Overdue"; const title = "Other";';
    expect(messages(source, "src/bundled/reminders/model.ts")).toEqual([
      "Other",
    ]);
  });

  it("leaves JSON schema fields in English", () => {
    const source =
      'const a = { type: "string", description: "The channel id" };';
    expect(messages(source, "a.ts")).toEqual([]);
    expect(
      messages('const b = { type: "button", label: "Sign in" };', "a.ts"),
    ).toEqual(["Sign in"]);
  });

  it("leaves wire errors in English", () => {
    const source = 'const a = { code: -32700, message: "Parse error" };';
    expect(messages(source, "a.ts")).toEqual([]);
  });

  it("does not rewrite thrown errors", () => {
    expect(messages('throw new Error("Something failed");', "a.ts")).toEqual(
      [],
    );
  });
});

it("only reads app source and leaves unparseable files alone", () => {
  expect(isTranslatableFile("src/app/App.tsx")).toBe(true);
  expect(isTranslatableFile("src/app/App.test.tsx")).toBe(false);
  expect(isTranslatableFile("src/buzz-mcp/server.ts")).toBe(false);
  expect(isTranslatableFile("node_modules/x/index.ts")).toBe(false);
  expect(isTranslatableFile("src/bundled/codex/prompt.ts")).toBe(false);
  expect(
    isTranslatableFile("src/features/agent-harness/attention-prompt.ts"),
  ).toBe(false);
  expect(isTranslatableFile("src/features/decisions/agent-tool.ts")).toBe(
    false,
  );
  expect(
    isTranslatableFile("src/bundled/builderlab/adapter-type/Instructions.tsx"),
  ).toBe(true);
  expect(transformSource("a.tsx", "const = <").code).toBe("const = <");
});

it("adds no import when nothing is rewritten", () => {
  const source = "export const a = 1;";
  expect(transformSource("a.ts", source).code).toBe(source);
});
