import type { CSSProperties, ReactNode } from "react";

import type { DetailDocumentV2, DpnextNode, DpnextScalar } from "../../detail-document-next/src";
import type { AssetResolver } from "./assetResolver";
import { styleToCss } from "./styleToCss";

interface NodeRendererProps {
  node: DpnextNode;
  document: DetailDocumentV2;
  resolveAsset: AssetResolver;
}

function children(node: DpnextNode, document: DetailDocumentV2, resolveAsset: AssetResolver): ReactNode {
  return node.children?.map((child) => (
    <NodeRenderer key={child.id} node={child} document={document} resolveAsset={resolveAsset} />
  ));
}

function common(node: DpnextNode): { "data-dpnext-node-id": string; "data-dpnext-node-type": string; style: CSSProperties } {
  return {
    "data-dpnext-node-id": node.id,
    "data-dpnext-node-type": node.type,
    style: styleToCss(node.layout, node.style),
  };
}

function markedText(node: DpnextNode): ReactNode {
  const marks = Array.isArray(node.marks) ? node.marks : [];
  const records = marks.filter((mark): mark is Record<string, DpnextScalar> => Boolean(mark) && typeof mark === "object" && !Array.isArray(mark));
  const highlight = records.find((mark) => mark.kind === "cardnews_text_highlight");
  const segments = records.filter((mark) => typeof mark.text === "string");
  const source = Array.from(node.content ?? "");
  let offset = 0;
  const rendered: ReactNode[] = segments.map((segment, index) => {
    const length = Array.from(String(segment.text ?? "")).length;
    const text = source.slice(offset, offset + length).join("");
    offset += length;
    const highlight = typeof segment.highlight_color === "string" ? segment.highlight_color : undefined;
    const style: CSSProperties = {
      color: typeof segment.color === "string" ? segment.color : undefined,
      fontWeight: typeof segment.font_weight === "string" ? segment.font_weight : undefined,
      fontSize: typeof segment.font_size === "number" ? segment.font_size : undefined,
      background: highlight,
      boxDecorationBreak: highlight ? "clone" : undefined,
      WebkitBoxDecorationBreak: highlight ? "clone" : undefined,
    };
    return <span key={`${node.id}-segment-${index}`} style={style}>{text}</span>;
  });
  if (offset < source.length) rendered.push(<span key={`${node.id}-segment-rest`}>{source.slice(offset).join("")}</span>);
  const content = segments.length ? rendered : node.content;
  if (!highlight || typeof highlight.color !== "string") return content;
  return <span data-dpnext-text-highlight="true" style={{
    background: highlight.color,
    borderRadius: typeof highlight.radius === "number" ? `${highlight.radius}em` : undefined,
    paddingInline: typeof highlight.pad_x === "number" ? `${highlight.pad_x}em` : undefined,
    mixBlendMode: highlight.multiply === true ? "multiply" : undefined,
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  }}>{content}</span>;
}

function particleValues(node: DpnextNode) {
  const config = node.particles ?? {};
  const count = Math.max(0, Math.min(500, Math.floor(Number(config.count ?? 24))));
  let seed = Number(config.seed ?? 1) >>> 0;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const colors = Array.isArray(config.colors) ? config.colors.filter((value): value is string => typeof value === "string") : ["#FFFFFF"];
  const min = Number(config.size_min ?? 6);
  const max = Math.max(min, Number(config.size_max ?? 14));
  const shape = String(config.shape ?? "dot");
  const rotate = typeof config.rotate === "boolean" ? config.rotate : shape === "confetti";
  const width = Number(node.layout?.width ?? 0);
  const height = Number(node.layout?.height ?? 0);
  return Array.from({ length: count }, (_, index) => ({
    index,
    x: random() * width,
    y: random() * height,
    size: min + random() * (max - min),
    color: colors[Math.floor(random() * Math.max(1, colors.length))] ?? "#FFFFFF",
    rotation: rotate ? random() * 360 : 0,
    aspect: 0.25 + random() * 0.75,
  }));
}

export function NodeRenderer({ node, document, resolveAsset }: NodeRendererProps) {
  const props = common(node);
  if (node.type === "text") return <div {...props}>{markedText(node)}</div>;
  if (node.type === "image") {
    const asset = document.assets[node.assetId!];
    return <img {...props} src={resolveAsset(node.assetId!, asset)} alt={node.alt ?? ""} draggable={false} />;
  }
  if (node.type === "video") {
    const asset = document.assets[node.assetId!];
    return <video {...props} src={resolveAsset(node.assetId!, asset)} aria-label={node.alt ?? ""} muted loop playsInline />;
  }
  if (node.type === "svg") {
    return <div {...props} aria-label={node.name} dangerouslySetInnerHTML={{ __html: node.svg ?? "" }} />;
  }
  if (node.type === "shape") return <div {...props} aria-label={node.name} />;
  if (node.type === "particles") {
    const shape = String(node.particles?.shape ?? "dot");
    return <div {...props} aria-hidden="true">{particleValues(node).map((particle) => (
      <i key={particle.index} style={{
        position: "absolute",
        left: particle.x,
        top: particle.y,
        width: particle.size,
        height: shape === "confetti" ? Math.max(2, particle.size * particle.aspect) : particle.size,
        borderRadius: shape === "dot" ? "50%" : shape === "star" ? 0 : 1,
        clipPath: shape === "star" ? "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" : undefined,
        background: particle.color,
        transform: `translate(-50%, -50%) rotate(${particle.rotation}deg)`,
      }} />
    ))}</div>;
  }
  if (node.type === "divider") return <hr {...props} />;
  if (node.type === "section") {
    return <section {...props} aria-label={node.name}>{children(node, document, resolveAsset)}</section>;
  }
  return <div {...props}>{children(node, document, resolveAsset)}</div>;
}
