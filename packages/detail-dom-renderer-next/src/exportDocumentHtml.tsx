import { renderToStaticMarkup } from "react-dom/server";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import type { AssetResolver } from "./assetResolver";
import { DocumentRenderer } from "./DocumentRenderer";

export function exportDocumentHtml(document: DetailDocumentV2, resolveAsset: AssetResolver): string {
  return "<!doctype html>" + renderToStaticMarkup(
    <DocumentRenderer document={document} resolveAsset={resolveAsset} />,
  );
}
