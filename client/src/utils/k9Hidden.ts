/**
 * Strips internal K9 hidden blocks from text before rendering in the UI.
 * Supports HTML comment wrappers like:
 *   <!-- k9_style ... -->
 */
export function stripK9Hidden(input?: string | null): string {
  if (!input) return '';

  return String(input)
    // New style block (your current one)
    .replace(/<!--\s*k9_style[\s\S]*?-->/gi, '')
    // Older/other internal blocks (safe to keep)
    .replace(/<!--\s*k9_hidden[\s\S]*?-->/gi, '')
    .replace(/<!--\s*k9_defeat[\s\S]*?-->/gi, '')
    .replace(/<!--\s*k9_baseline[\s\S]*?-->/gi, '')
    .replace(/<!--\s*k9_humanised[\s\S]*?-->/gi, '')
    // Clean up excess whitespace/newlines left behind
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
