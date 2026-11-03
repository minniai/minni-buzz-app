// minni fork: finds visible English text in upstream source and rewrites it into
// catalog lookups at build time, so upstream files stay byte-identical. See
// docs/minni-i18n.md. Everything the transform cannot classify stays English.
import { parseSync } from "rolldown/utils";

export const RUNTIME = "/src/minni-i18n/runtime.ts";
const T = "__minniT";
const TN = "__minniTN";

const VISIBLE_NAME =
  /(label|title|description|placeholder|heading|message|hint|tooltip|caption|summary|error|notice)$/i;
const VISIBLE_ATTR = new Set(["alt", "action", "empty", "detail", "reason"]);
const NOT_VISIBLE_NAME = /^(aria-labelledby|aria-describedby|data-.*)$/;
const VISIBLE_SETTER =
  /^(label|notify|toast|toast\.\w+|set\w*(Error|Status|Notice|Message|Announcement|Title|Label|Description|Hint))$/;
const VISIBLE_DOM_FIELD =
  /^(textContent|innerText|ariaLabel|placeholder|title)$/;
const VERBATIM_ELEMENT = new Set([
  "code",
  "pre",
  "kbd",
  "samp",
  "style",
  "script",
]);
// Next to these keys a `description` is a tool schema read by agents, and a
// `message` is a JSON-RPC or wire error rather than text for people.
const AGENT_FACING_SIBLING = new Set([
  "code",
  "jsonrpc",
  "inputSchema",
  "input_schema",
  "parameters",
  "schema",
  "execute",
  "handler",
]);
// Labels that upstream also uses as identities (record keys, modes). Translating
// them would change behaviour, so they stay English. Re-check on upstream merges.
const IDENTITY_LABELS = {
  "src/bundled/reminders/model.ts": /^(Overdue|Today|Upcoming|Done)$/,
  "src/bundled/reminders/RemindersPage.tsx": /^Done$/,
  "src/bundled/workflows/WorkflowWebhookSecretDialog.tsx": /^URL$/,
  "src/app/PluginAccessReview.tsx": /^Removed$/,
  "src/bundled/github/pull-states.ts": /^DIRTY$/,
  // The form branches on `error.includes("YAML editor")`.
  "src/bundled/workflows/workflowFormTypes.ts": /YAML editor/,
  // ComposerFormattingTools matches these labels against its own English list.
  "src/features/messages/composer-dom.ts": /^/,
  "src/features/messages/ComposerFormattingTools.tsx": /^Link$/,
};
// Labels and copyStatus hold catalog text. `error` and `message` usually hold text
// from native code or the relay, and a bare `status` is a protocol value.
const isComparedName = (name) =>
  /(label|title)$/i.test(name) || name === "copyStatus";
const AGENT_PROMPT_FILE =
  /[-/](prompts?|instructions|migrate-keywords|tools?)[^/]*\.ts$/;
const JSON_SCHEMA_TYPE = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
]);
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function isTranslatableFile(path) {
  return (
    /^src\/.*\.tsx?$/.test(path) &&
    !/\.(test|spec|d)\.tsx?$/.test(path) &&
    !path.startsWith("src/buzz-mcp/") &&
    !path.startsWith("src/minni-i18n/") &&
    !path.startsWith("src/shared/design-system/viewer/") &&
    !path.includes("/fixtures/") &&
    !AGENT_PROMPT_FILE.test(path)
  );
}

function looksLikeCode(text) {
  const t = text.trim();
  if (t.includes("://")) return true;
  return (
    !/\s/.test(t) &&
    /[._/:#@=<>{}[\]\\|]|[a-z][A-Z]/.test(t.replace(/[.:]$/, ""))
  );
}

function isVisible(text, strict) {
  const fixed = text.replace(/\{\w+\}/g, " ");
  if (!/\p{L}{2}/u.test(fixed) || looksLikeCode(fixed)) return false;
  return !strict || /^\s*(\p{Lu}|\{\w+\}\s+\p{L})/u.test(text);
}

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, name) => {
    if (name[0] !== "#") return ENTITIES[name] ?? whole;
    const hex = name[1] === "x" || name[1] === "X";
    return String.fromCodePoint(
      Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10),
    );
  });
}

// JSX whitespace: lines are trimmed and joined; a space on a single line stays.
function jsxTextValue(raw) {
  const lines = raw.split(/\r?\n/);
  const kept = lines
    .map((line, i) => {
      let out = line.replace(/\t/g, " ");
      if (i > 0) out = out.replace(/^ +/, "");
      if (i < lines.length - 1) out = out.replace(/ +$/, "");
      return out;
    })
    .filter((line) => line !== "");
  return decodeEntities(kept.join(" "));
}

// `${n === 1 ? "" : "s"}` is an English plural ending. It gets a name of its own so
// a translation can leave it out, since no other language can use it.
function isPluralEnding(node) {
  if (node.type !== "ConditionalExpression") return false;
  const ends = [node.consequent.value, node.alternate.value];
  return ends.includes("") && ends.some((end) => end === "s" || end === "es");
}

function placeholderName(expr, used) {
  let base;
  let node = expr;
  while (node.type === "ChainExpression" || node.type === "TSNonNullExpression")
    node = node.expression;
  if (isPluralEnding(node)) base = "plural";
  else if (node.type === "Identifier") base = node.name;
  else if (node.type === "MemberExpression" && !node.computed)
    base = node.property.name;
  if (!base || !/^[A-Za-z_]\w*$/.test(base)) base = "value";
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}${n}`;
  used.add(name);
  return name;
}

function nameOf(node) {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node.type === "MemberExpression" && !node.computed)
    return node.property.name;
  return undefined;
}

function attrName(attr) {
  const n = attr.name;
  return n.type === "JSXNamespacedName"
    ? `${n.namespace.name}:${n.name.name}`
    : n.name;
}

function isVisibleAttr(name) {
  return (
    !NOT_VISIBLE_NAME.test(name) &&
    (VISIBLE_NAME.test(name) || VISIBLE_ATTR.has(name))
  );
}

// Returns the rewritten source and every message found, with its source offset.
export function transformSource(path, source) {
  const parsed = parseSync(path, source);
  if (parsed.errors.length) return { code: source, messages: [] };
  const edits = [];
  const messages = [];
  const identity = IDENTITY_LABELS[path];
  const found = (text, node) => messages.push({ text, offset: node.start });
  const replace = (start, end, text) => edits.push({ start, end, text });
  const callText = (fn, text, open) => `${fn}(${JSON.stringify(text)}${open}`;

  function translateTemplate(node, strict) {
    const used = new Set();
    let text = "";
    const names = [];
    node.quasis.forEach((quasi, i) => {
      text += quasi.value.cooked ?? "";
      if (i < node.expressions.length) {
        const name = placeholderName(node.expressions[i], used);
        names.push(name);
        text += `{${name}}`;
      }
    });
    if (!isVisible(text, strict)) {
      for (const expr of node.expressions) translateExpr(expr, false);
      return;
    }
    found(text, node);
    const trimmed = text;
    if (node.expressions.length === 0) {
      replace(node.start, node.end, callText(T, trimmed, ")"));
      return;
    }
    let cursor = node.start;
    node.expressions.forEach((expr, i) => {
      const lead = i === 0 ? callText(T, trimmed, ", { ") : ", ";
      replace(cursor, expr.start, `${lead}${JSON.stringify(names[i])}: `);
      translateExpr(expr, false);
      cursor = expr.end;
    });
    replace(cursor, node.end, " })");
  }

  // Follows the value through conditionals; anything else is an ordinary walk.
  function translateExpr(node, strict) {
    if (!node) return;
    switch (node.type) {
      case "Literal":
        if (
          typeof node.value === "string" &&
          isVisible(node.value, strict) &&
          !identity?.test(node.value)
        ) {
          found(node.value, node);
          replace(node.start, node.end, callText(T, node.value, ")"));
        }
        return;
      case "TemplateLiteral":
        translateTemplate(node, strict);
        return;
      case "ConditionalExpression":
        walk(node.test);
        translateExpr(node.consequent, strict);
        translateExpr(node.alternate, strict);
        return;
      case "LogicalExpression":
        translateExpr(node.left, strict);
        translateExpr(node.right, strict);
        return;
      case "ParenthesizedExpression":
      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
        translateExpr(node.expression, strict);
        return;
      default:
        walk(node);
    }
  }

  // A run is the adjacent text and expressions between child elements. It
  // becomes one message, so translators can reorder its placeholders.
  function translateRun(run) {
    const used = new Set();
    let text = "";
    const values = [];
    for (const item of run) {
      if (item.text !== undefined) text += item.text;
      else {
        const name = placeholderName(item.expr, used);
        values.push({ name, expr: item.expr });
        text += `{${name}}`;
      }
    }
    const start = run[0].node.start;
    const end = run.at(-1).node.end;
    const message = text.trim();
    if (!isVisible(message, false)) {
      for (const item of run) if (item.expr) translateExpr(item.expr, false);
      return false;
    }
    found(message, run[0].node);
    const lead = text.startsWith(" ") ? '{" "}' : "";
    const trail = text.endsWith(" ") ? '{" "}' : "";
    if (values.length === 0) {
      replace(start, end, `${lead}{${callText(T, message, ")")}}${trail}`);
      return true;
    }
    let cursor = start;
    values.forEach(({ name, expr }, i) => {
      const open = i === 0 ? `${lead}{${callText(TN, message, ", { ")}` : ", ";
      replace(cursor, expr.start, `${open}${JSON.stringify(name)}: `);
      translateExpr(expr, false);
      cursor = expr.end;
    });
    replace(cursor, end, ` })}${trail}`);
    return true;
  }

  function walkChildren(children) {
    let run = [];
    const flush = () => {
      if (run.length) translateRun(run);
      run = [];
    };
    for (const child of children) {
      if (child.type === "JSXText") {
        const text = jsxTextValue(child.raw ?? child.value);
        if (text === "") {
          if (run.length) run.push({ node: child, text: "" });
        } else run.push({ node: child, text });
      } else if (child.type === "JSXExpressionContainer") {
        const expr = child.expression;
        if (expr.type === "JSXEmptyExpression") flush();
        else if (expr.type === "Literal" && typeof expr.value === "string")
          run.push({ node: child, text: expr.value });
        else if (expr.type === "JSXElement" || expr.type === "JSXFragment") {
          flush();
          walk(expr);
        } else run.push({ node: child, expr });
      } else {
        flush();
        walk(child);
      }
    }
    flush();
  }

  function walkFunction(node, name) {
    const previous = fnVisible;
    fnVisible = !!name && VISIBLE_NAME.test(name);
    if (
      node.type === "ArrowFunctionExpression" &&
      node.expression &&
      fnVisible
    ) {
      node.params.forEach(walk);
      translateExpr(node.body, true);
    } else {
      node.params?.forEach(walk);
      walk(node.body);
    }
    fnVisible = previous;
  }

  let fnVisible = false;
  function isFn(n) {
    return (
      n?.type === "ArrowFunctionExpression" || n?.type === "FunctionExpression"
    );
  }

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    switch (node.type) {
      case "TSTypeAnnotation":
      case "TSInterfaceDeclaration":
      case "TSTypeAliasDeclaration":
      case "ImportDeclaration":
      case "ExportAllDeclaration":
        return;
      case "JSXElement": {
        const tag = node.openingElement.name;
        walk(node.openingElement.attributes);
        if (!(tag.type === "JSXIdentifier" && VERBATIM_ELEMENT.has(tag.name)))
          walkChildren(node.children);
        return;
      }
      case "JSXFragment":
        walkChildren(node.children);
        return;
      case "JSXAttribute": {
        const name = attrName(node);
        const value = node.value;
        if (!value) return;
        if (!isVisibleAttr(name)) {
          walk(value);
          return;
        }
        if (value.type === "Literal") {
          const text = decodeEntities(String(value.value));
          if (isVisible(text, false)) {
            found(text, value);
            replace(value.start, value.end, `{${callText(T, text, ")")}}`);
          }
        } else if (value.type === "JSXExpressionContainer")
          translateExpr(value.expression, false);
        else walk(value);
        return;
      }
      case "ObjectExpression": {
        const keys = new Set(node.properties.map((p) => nameOf(p.key)));
        const typeField = node.properties.find((p) => nameOf(p.key) === "type");
        const agentFacing =
          [...AGENT_FACING_SIBLING].some((k) => keys.has(k)) ||
          JSON_SCHEMA_TYPE.has(typeField?.value?.value);
        for (const prop of node.properties) {
          if (prop.type !== "Property" || prop.computed) {
            walk(prop);
            continue;
          }
          const key = nameOf(prop.key);
          if (isFn(prop.value)) walkFunction(prop.value, key);
          else if (key && !agentFacing && VISIBLE_NAME.test(key))
            translateExpr(prop.value, true);
          else walk(prop.value);
        }
        return;
      }
      case "VariableDeclarator": {
        const name = nameOf(node.id);
        if (isFn(node.init)) walkFunction(node.init, name);
        else if (name && VISIBLE_NAME.test(name))
          translateExpr(node.init, true);
        else walk(node.init);
        return;
      }
      case "FunctionDeclaration":
        walkFunction(node, node.id?.name);
        return;
      case "MethodDefinition":
        walkFunction(node.value, nameOf(node.key));
        return;
      case "ArrowFunctionExpression":
      case "FunctionExpression":
        walkFunction(node, undefined);
        return;
      case "ReturnStatement":
        if (fnVisible) translateExpr(node.argument, true);
        else walk(node.argument);
        return;
      case "AssignmentExpression": {
        const left = node.left;
        const name = nameOf(left);
        const visible =
          left.type === "MemberExpression"
            ? VISIBLE_DOM_FIELD.test(name ?? "")
            : VISIBLE_NAME.test(name ?? "");
        if (visible) translateExpr(node.right, true);
        else walk(node.right);
        return;
      }
      case "AssignmentPattern":
        if (VISIBLE_NAME.test(nameOf(node.left) ?? ""))
          translateExpr(node.right, true);
        else walk(node.right);
        return;
      // A value that went through the catalog must meet a translated literal.
      case "BinaryExpression": {
        const equality = node.operator === "===" || node.operator === "!==";
        const [other, literal] =
          node.right.type === "Literal"
            ? [node.left, node.right]
            : [node.right, node.left];
        if (
          equality &&
          literal.type === "Literal" &&
          isComparedName(nameOf(other) ?? "")
        ) {
          walk(other);
          translateExpr(literal, true);
        } else {
          walk(node.left);
          walk(node.right);
        }
        return;
      }
      case "CallExpression": {
        const callee = source.slice(node.callee.start, node.callee.end);
        walk(node.callee);
        if (VISIBLE_SETTER.test(callee) && node.arguments.length) {
          translateExpr(node.arguments[0], true);
          walk(node.arguments.slice(1));
        } else walk(node.arguments);
        return;
      }
      default:
        for (const key in node) {
          if (
            key === "typeAnnotation" ||
            key === "returnType" ||
            key === "typeArguments"
          )
            continue;
          const value = node[key];
          if (value && typeof value === "object") walk(value);
        }
    }
  }

  walk(parsed.program);
  if (edits.length === 0) return { code: source, messages };
  edits.sort((a, b) => a.start - b.start);
  let code = `import { ${T}, ${TN} } from ${JSON.stringify(RUNTIME)};`;
  let cursor = 0;
  for (const edit of edits) {
    code += source.slice(cursor, edit.start) + edit.text;
    // Keep line numbers, so errors and stack traces still point at upstream's lines.
    const removed = source.slice(edit.start, edit.end).split("\n").length - 1;
    code += "\n".repeat(removed);
    cursor = edit.end;
  }
  return { code: code + source.slice(cursor), messages };
}
