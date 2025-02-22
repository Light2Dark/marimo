/* Copyright 2024 Marimo. All rights reserved. */

import { describe, it, expect } from "vitest";
import { unwrapMarimoChatHTML } from "../parseHTML";

describe("unwrapMarimoChatHTML", () => {
  const marimoWrapper = (content: string) =>
    `<span class="markdown prose dark:prose-invert"><span class="paragraph">${content}</span></span>`;

  it("handles marimo chat", () => {
    const html = marimoWrapper("Echo: hello");
    expect(unwrapMarimoChatHTML(html)).toEqual("Echo: hello");
  });

  it("handles code in marimo chat", () => {
    const html = marimoWrapper("Echo: <code>hello</code>");
    expect(unwrapMarimoChatHTML(html)).toEqual("Echo: <code>hello</code>");
  });

  it("handles some other code", () => {
    const html = marimoWrapper("<span><i>hiya</i></span>");
    expect(unwrapMarimoChatHTML(html)).toEqual("<span><i>hiya</i></span>");
  });

  it("handles empty content", () => {
    const html = marimoWrapper("");
    expect(unwrapMarimoChatHTML(html)).toEqual("");
  });

  it("handles nested HTML elements", () => {
    const html = marimoWrapper("<div><span>nested <b>content</b></span></div>");
    expect(unwrapMarimoChatHTML(html)).toEqual(
      "<div><span>nested <b>content</b></span></div>",
    );
  });

  it("returns null for invalid HTML", () => {
    expect(unwrapMarimoChatHTML("<invalid>")).toBeNull();
  });

  it("handles special characters", () => {
    const html = marimoWrapper("Echo: Hello & World!");
    expect(unwrapMarimoChatHTML(html)).toEqual("Echo: Hello & World!");

    const html2 = marimoWrapper("Echo: Hello &amp; World!");
    expect(unwrapMarimoChatHTML(html2)).toEqual("Echo: Hello &amp; World!");

    const html3 = marimoWrapper("Echo: Hello < World!");
    expect(unwrapMarimoChatHTML(html3)).toEqual("Echo: Hello < World!");
  });

  it("handles multiple paragraphs", () => {
    const html = marimoWrapper("First line<br/>Second line");
    expect(unwrapMarimoChatHTML(html)).toEqual("First line<br/>Second line");
  });
});
