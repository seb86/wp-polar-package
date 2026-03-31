import { marked } from "marked";

/**
 * Convert a markdown string to HTML.
 * Used for rendering changelogs and descriptions from GitHub release notes.
 */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
