import { stripListMarkers } from '~/lib/recipeFields';

// A paste handler for a box that holds one line per entry: a pasted block loses its bullets, list numbers and blank lines, and goes in
// where the cursor is. A single plain line is left to the browser.
export function pasteLines(value: string, onChange: (value: string) => void): (event: React.ClipboardEvent<HTMLTextAreaElement>) => void {
  return event => {
    const text = event.clipboardData.getData('text');
    const cleaned = stripListMarkers(text);
    if (!text.includes('\n') && cleaned === text) return;
    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd).replace(/^\n/, '');
    onChange(`${before}${before !== '' && !before.endsWith('\n') ? '\n' : ''}${cleaned}${after !== '' ? `\n${after}` : ''}`);
  };
}
