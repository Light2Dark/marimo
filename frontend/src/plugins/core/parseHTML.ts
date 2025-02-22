/* Copyright 2024 Marimo. All rights reserved. */
import parse from "html-react-parser";
import React from "react";
import ReactDOMServer from "react-dom/server";

export const unwrapMarimoChatHTML = (html: string): string | null => {
  // Backend chat.py wraps the content in html to render on
  // <span class="markdown prose dark:prose-invert"><span class="paragraph">${content}</span></span>
  // This function unwraps the content from the above html
  try {
    const parsed = parse(html);

    if (!React.isValidElement(parsed)) {
      return null;
    }

    // Find the inner wrapper element
    const wrapper = (parsed as React.ReactElement).props.children;
    if (!wrapper || !React.isValidElement(wrapper)) {
      return null;
    }

    // Convert the children back to HTML string
    const innerContent = ReactDOMServer.renderToStaticMarkup(
      (wrapper as React.ReactElement).props.children,
    );

    return innerContent;
  } catch {
    return null;
  }
};
