import type { CSSProperties, ReactNode } from "react";
import type {
  DseDocumentContent,
  DseTextNode,
  DseTextAlign,
} from "@/lib/document-content";
import { sanitizeDocumentContent } from "@/lib/document-content";

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

function alignStyle(align?: DseTextAlign): CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}

export function DocumentRenderer({
  value,
  className = "",
}: {
  value: DseDocumentContent;
  className?: string;
}) {
  const document = sanitizeDocumentContent(value);

  return (
    <div className={`text-sm leading-7 text-foreground ${className}`}>
      {document.content.map((block, blockIndex) => {
        if (block.type === "paragraph") {
          return (
            <p key={blockIndex} style={alignStyle(block.align)} className="my-2 whitespace-pre-wrap">
              {block.content.map((node, nodeIndex) => inlineNode(node, `${blockIndex}-${nodeIndex}`))}
            </p>
          );
        }

        if (block.type === "heading") {
          const children = block.content.map((node, nodeIndex) => inlineNode(node, `${blockIndex}-${nodeIndex}`));
          if (block.level === 1) return <h1 key={blockIndex} style={alignStyle(block.align)} className="my-4 text-2xl font-semibold">{children}</h1>;
          if (block.level === 2) return <h2 key={blockIndex} style={alignStyle(block.align)} className="my-3 text-xl font-semibold">{children}</h2>;
          return <h3 key={blockIndex} style={alignStyle(block.align)} className="my-3 text-lg font-semibold">{children}</h3>;
        }

        const ListTag = block.type === "orderedList" ? "ol" : "ul";
        return (
          <ListTag
            key={blockIndex}
            className={`my-2 pl-6 ${block.type === "orderedList" ? "list-decimal" : "list-disc"}`}
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
