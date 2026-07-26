const assert = require("node:assert/strict");
const test = require("node:test");

const modelPath = process.env.AI_RESPONSE_CONTENT_PATH;
if (!modelPath) {
  throw new Error("Set AI_RESPONSE_CONTENT_PATH to the compiled response model.");
}
const model = require(modelPath);

test("extracts inline, display, and chemistry math without exposing delimiters", () => {
  const source = String.raw`Use $F=ma$, then:

\[
\ce{2H2 + O2 -> 2H2O}
\]`;
  const prepared = model.prepareAIResponseContent(source);

  assert.equal(prepared.math.length, 2);
  assert.equal(prepared.markdown.includes("$F=ma$"), false);
  assert.equal(prepared.markdown.includes("\\ce"), false);
  assert.equal(
    model.restoreAIResponseMath(prepared.markdown, prepared.math),
    source.replace("$F=ma$,", String.raw`$F=ma\text{,}$`),
  );
});

test("preserves markdown tables, ordinary code fences, and inline code", () => {
  const source = [
    "| Symbol | Meaning |",
    "| --- | --- |",
    "| $F$ | force |",
    "",
    "Keep `$cost` literal.",
    "",
    "```python",
    'price = "$5"',
    "```",
  ].join("\n");
  const prepared = model.prepareAIResponseContent(source);

  assert.equal(prepared.math.length, 1);
  assert.match(prepared.markdown, /\| Symbol \| Meaning \|/);
  assert.match(prepared.markdown, /Keep `\$cost` literal\./);
  assert.match(prepared.markdown, /price = "\$5"/);
});

test("converts completed math fences but protects incomplete streamed fences", () => {
  const completed = model.prepareAIResponseContent(
    ["```latex", String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, "```"].join("\n"),
  );
  const partial = model.prepareAIResponseContent(
    ["```latex", String.raw`\frac{-b}{2a}`].join("\n"),
  );

  assert.deepEqual(completed.math, [
    String.raw`\[\frac{-b\pm\sqrt{b^2-4ac}}{2a}\]`,
  ]);
  assert.equal(partial.math.length, 0);
  assert.match(partial.markdown, /^```latex/);
});

test("leaves incomplete streamed math readable until its delimiter closes", () => {
  const partial = model.prepareAIResponseContent(
    String.raw`The result is \(\frac{a}{b}`,
  );

  assert.equal(partial.math.length, 0);
  assert.equal(partial.markdown, String.raw`The result is \(\frac{a}{b}`);
});

test("protects an incomplete streamed inline code span from math parsing", () => {
  const partial = model.prepareAIResponseContent(
    "Use `price = $5 while the code block streams",
  );

  assert.equal(partial.math.length, 0);
  assert.equal(
    partial.markdown,
    "Use `price = $5 while the code block streams",
  );
});

test("keeps punctuation attached to emphasized phrases for mobile wrapping", () => {
  const prepared = model.prepareAIResponseContent(
    "This is **the key idea**, followed by **a warning:** read carefully.",
  );

  assert.equal(
    prepared.markdown,
    "This is **the key idea,** followed by **a warning:** read carefully.",
  );
});

test("keeps punctuation inside the preceding formula to prevent orphan wraps", () => {
  const prepared = model.prepareAIResponseContent(
    String.raw`For $ax^2+bx+c=0$, use the formula.`,
  );

  assert.deepEqual(prepared.math, [
    String.raw`$ax^2+bx+c=0\text{,}$`,
  ]);
  assert.equal(
    model.restoreAIResponseMath(prepared.markdown, prepared.math),
    String.raw`For $ax^2+bx+c=0\text{,}$ use the formula.`,
  );
});
