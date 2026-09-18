// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import { renderToStaticMarkup } from "react-dom/server";

import type { DetailDocumentV2 } from "../../detail-document-next/src";
import type { AssetResolver } from "./assetResolver";
import { DocumentRenderer } from "./DocumentRenderer";

export function exportDocumentHtml(document: DetailDocumentV2, resolveAsset: AssetResolver): string {
  return "<!doctype html>" + renderToStaticMarkup(
    <DocumentRenderer document={document} resolveAsset={resolveAsset} />,
  );
}
