export type EditorHtmlSyncState = {
  currentHtml: string;
  nextHtml: string;
  lastEmittedHtml: string;
  isFocused: boolean;
};

export function shouldApplyEditorHtml({
  currentHtml,
  nextHtml,
  lastEmittedHtml,
  isFocused,
}: EditorHtmlSyncState): boolean {
  if (currentHtml === nextHtml) return false;
  if (isFocused && nextHtml === lastEmittedHtml) return false;
  return true;
}
