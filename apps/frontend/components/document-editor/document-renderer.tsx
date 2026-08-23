import type { CSSProperties, ReactNode } from "react";
import type {
  DseDocumentContent,
  DseTextNode,
  DseTextAlign,
} from "@/lib/document-content";
import { sanitizeDocumentContent } from "@/lib/document-content";

export type DocumentRendererTheme = {
  fontFamily?: string;
  bodyFontSize?: string;
  lineHeight?: number;
  paragraphSpacing?: string;
  defaultAlignment?: DseTextAlign;
  heading1Size?: string;
  heading2Size?: string;
  heading3Size?: string;
};

function inlineNode(node: DseTextNode, key: string): ReactNode {
  let child: ReactNode = node.text;
  if (node.marks?.bold) child = <strong>{child}</strong>;
  if (node.marks?.italic) child = <em>{child}</em>;
  if (node.marks?.underline) child = <u>{child}</u>;
  if (node.marks?.link) {
    child = (
      <a href={node.marks.link} target="_blank" rel="noopener noreferrer" className="text-primary underline">
        {child}
      </a>
    );
  }
  return <span key={key}>{child}</span>;
}

function alignment(align: DseTextAlign | undefined, fallback: DseTextAlign | undefined): CSSProperties["textAlign"] {
  return align ?? fallback;
}

export function DocumentRenderer({
  value,
  className = "",
  theme,
}: {
  value: DseDocumentContent;
  className?: string;
  theme?: DocumentRendererTheme;
}) {
  const document = sanitizeDocumentContent(value);
  const containerStyle: CSSProperties = {
    fontFamily: theme?.fontFamily,
    fontSize: theme?.bodyFontSize,
    lineHeight: theme?.lineHeight,
  };

  return (
    <div className={`text-foreground ${className}`} style={containerStyle}>
      {document.content.map((block, blockIndex) => {
        if (block.type === "paragraph") {
          return (
            <p
              key={blockIndex}
              style={{
                textAlign: alignment(block.align, theme?.defaultAlignment),
                marginTop: theme?.paragraphSpacing,
                marginBottom: theme?.paragraphSpacing,
              }}
              className="whitespace-pre-wrap"
            >
              {block.content.map((node, nodeIndex) => inlineNode(node, `${blockIndex}-${nodeIndex}`))}
            </p>
          );
        }

        if (block.type === "heading") {
          const children = block.content.map((node, nodeIndex) => inlineNode(node, `${blockIndex}-${nodeIndex}`));
          const style: CSSProperties = {
            textAlign: alignment(block.align, theme?.defaultAlignment),
            marginTop: theme?.paragraphSpacing,
            marginBottom: theme?.paragraphSpacing,
          };
          if (block.level === 1) {
            return <h1 key={blockIndex} style={{ ...style, fontSize: theme?.heading1Size }} className="font-semibold">{children}</h1>;
          }
          if (block.level === 2) {
            return <h2 key={blockIndex} style={{ ...style, fontSize: theme?.heading2Size }} className="font-semibold">{children}</h2>;
          }
          return <h3 key={blockIndex} style={{ ...style, fontSize: theme?.heading3Size }} className="font-semibold">{children}</h3>;
        }

        const ListTag = block.type === "orderedList" ? "ol" : "ul";
        return (
          <ListTag
            key={blockIndex}
            style={{
              textAlign: theme?.defaultAlignment,
              marginTop: theme?.paragraphSpacing,
              marginBottom: theme?.paragraphSpacing,
            }}
            className={`pl-6 ${block.type === "orderedList" ? "list-decimal" : "list-disc"}`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                {item.map((node, nodeIndex) => inlineNode(node, `${blockIndex}-${itemIndex}-${nodeIndex}`))}
              </li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}
