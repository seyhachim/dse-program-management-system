"use client";

import { useEffect, useRef } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import {
  documentContentToEditorHtml,
  sanitizeDocumentContent,
  type DseDocumentContent,
  type DseDocumentBlock,
  type DseTextAlign,
  type DseTextMarks,
  type DseTextNode,
} from "@/lib/document-content";

type RichTextEditorProps = {
  value: DseDocumentContent;
  onChange: (value: DseDocumentContent) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

type ActiveMarks = Required<Pick<DseTextMarks, "bold" | "italic" | "underline">> & {
  link?: string;
};

const EMPTY_MARKS: ActiveMarks = { bold: false, italic: false, underline: false };

function marksToOutput(marks: ActiveMarks): DseTextMarks | undefined {
  const output: DseTextMarks = {};
  if (marks.bold) output.bold = true;
  if (marks.italic) output.italic = true;
  if (marks.underline) output.underline = true;
  if (marks.link) output.link = marks.link;
  return Object.keys(output).length > 0 ? output : undefined;
}

function safeHref(element: HTMLAnchorElement): string | undefined {
  const raw = element.getAttribute("href")?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return raw;
  } catch {
    return undefined;
  }
  return undefined;
}

function parseInlineNodes(node: Node, inherited: ActiveMarks = EMPTY_MARKS): DseTextNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ type: "text", text, marks: marksToOutput(inherited) }] : [];
  }

  if (!(node instanceof HTMLElement)) return [];

  const next: ActiveMarks = { ...inherited };
  const tag = node.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (node instanceof HTMLAnchorElement) next.link = safeHref(node);

  if (tag === "br") return [{ type: "text", text: "\n", marks: marksToOutput(next) }];

  return Array.from(node.childNodes).flatMap((child) => parseInlineNodes(child, next));
}

function readAlign(element: HTMLElement): DseTextAlign | undefined {
  const inline = element.style.textAlign;
  if (inline === "left" || inline === "center" || inline === "right" || inline === "justify") return inline;
  return undefined;
}

function parseEditorElement(root: HTMLElement): DseDocumentContent {
  const blocks: DseDocumentBlock[] = [];

  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "p" || tag === "div") {
      blocks.push({ type: "paragraph", align: readAlign(child), content: parseInlineNodes(child) });
      continue;
    }
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      blocks.push({
        type: "heading",
        level: Number(tag.slice(1)) as 1 | 2 | 3,
        align: readAlign(child),
        content: parseInlineNodes(child),
      });
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      const items = Array.from(child.children)
        .filter((item) => item.tagName.toLowerCase() === "li")
        .map((item) => parseInlineNodes(item));
      blocks.push({ type: tag === "ol" ? "orderedList" : "bulletList", items });
      continue;
    }

    blocks.push({ type: "paragraph", content: parseInlineNodes(child) });
  }

  if (blocks.length === 0 && root.textContent) {
    blocks.push({ type: "paragraph", content: [{ type: "text", text: root.textContent }] });
  }

  return sanitizeDocumentContent({ type: "doc", version: 1, content: blocks });
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  ariaLabel = "Rich text editor",
  className = "",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastExternalHtml = useRef("");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = documentContentToEditorHtml(value);
    if (document.activeElement === editor && editor.innerHTML !== lastExternalHtml.current) return;
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
    lastExternalHtml.current = nextHtml;
  }, [value]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    lastExternalHtml.current = editor.innerHTML;
    onChange(parseEditorElement(editor));
  }

  function run(command: string, commandValue?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  }

  function createLink() {
    if (disabled) return;
    const href = window.prompt("Link URL (https://, http://, or mailto:)");
    if (!href) return;
    try {
      const url = new URL(href, window.location.origin);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return;
      run("createLink", href);
    } catch {
      return;
    }
  }

  return (
    <div className={`overflow-hidden rounded-lg border bg-background ${className}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1.5" aria-label="Formatting toolbar">
        <ToolbarButton label="Undo" disabled={disabled} onClick={() => run("undo")}><Undo2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={disabled} onClick={() => run("redo")}><Redo2 className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton label="Paragraph" disabled={disabled} onClick={() => run("formatBlock", "p")}><Pilcrow className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Heading 1" disabled={disabled} onClick={() => run("formatBlock", "h1")}><Heading1 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Heading 2" disabled={disabled} onClick={() => run("formatBlock", "h2")}><Heading2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Heading 3" disabled={disabled} onClick={() => run("formatBlock", "h3")}><Heading3 className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton label="Bold" disabled={disabled} onClick={() => run("bold")}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Italic" disabled={disabled} onClick={() => run("italic")}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Underline" disabled={disabled} onClick={() => run("underline")}><Underline className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Link" disabled={disabled} onClick={createLink}><LinkIcon className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton label="Bulleted list" disabled={disabled} onClick={() => run("insertUnorderedList")}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Numbered list" disabled={disabled} onClick={() => run("insertOrderedList")}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton label="Align left" disabled={disabled} onClick={() => run("justifyLeft")}><AlignLeft className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Align center" disabled={disabled} onClick={() => run("justifyCenter")}><AlignCenter className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Align right" disabled={disabled} onClick={() => run("justifyRight")}><AlignRight className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Justify" disabled={disabled} onClick={() => run("justifyFull")}><AlignJustify className="h-4 w-4" /></ToolbarButton>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={emitChange}
        onBlur={emitChange}
        className="min-h-40 px-4 py-3 text-sm leading-7 outline-none [&_a]:text-primary [&_a]:underline [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
      />
    </div>
  );
}
