import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { applyPatch, documentSha256, type DetailDocumentV2 } from "../../detail-document-next/src";
import { History, replaceText, useEditorController } from "../src";

describe("dpnext editor history", () => {
  it("restores the original canonical SHA after one hundred undo and redo document patches", async () => {
    const document: DetailDocumentV2 = {
      schema_version: "detail-document-v2",
      document_id: "dpnd_history",
      revision: 0,
      canvas: { width: 750 },
      sections: [{
        id: "sec",
        type: "section",
        children: [{ id: "txt", type: "text", content: "original" }],
      }],
      assets: {},
    };
    const original = { document, sha256: await documentSha256(document) };
    const history = new History(original);
    let current = original;
    for (let revision = 1; revision <= 100; revision += 1) {
      const patch = replaceText(current.document, current.sha256, "txt", `text ${revision}`);
      const nextDocument = applyPatch(current.document, patch, current.sha256);
      current = { document: nextDocument, sha256: await documentSha256(nextDocument) };
      history.push(current);
    }
    for (let index = 0; index < 100; index += 1) history.undo();
    expect(history.current().sha256).toBe(original.sha256);
    expect(history.current().document.revision).toBe(0);
    for (let index = 0; index < 100; index += 1) history.redo();
    expect(history.current().sha256).toBe(current.sha256);
    expect(history.current().document.revision).toBe(100);
  });

  it("turns undo and redo into new CAS patches instead of local-only stale revisions", async () => {
    const document: DetailDocumentV2 = {
      schema_version: "detail-document-v2",
      document_id: "dpnd_history_commit",
      revision: 0,
      canvas: { width: 750 },
      sections: [{
        id: "sec",
        type: "section",
        children: [{ id: "txt", type: "text", content: "original" }],
      }],
      assets: {},
    };
    const { result } = renderHook(() => useEditorController(document));
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      const patch = replaceText(
        result.current.state.document,
        result.current.state.sha256,
        "txt",
        "edited",
      );
      await result.current.applyValidatedPatch(patch);
    });
    expect(result.current.state.document.revision).toBe(1);

    const undoCommit = await act(async () => result.current.undo());
    expect(undoCommit?.patch.base_revision).toBe(1);
    expect(undoCommit?.patch.operations[0].op).toBe("replace_section");
    expect(result.current.state.document.revision).toBe(2);
    expect(result.current.state.document.sections[0].children?.[0].content).toBe("original");

    const redoCommit = await act(async () => result.current.redo());
    expect(redoCommit?.patch.base_revision).toBe(2);
    expect(result.current.state.document.revision).toBe(3);
    expect(result.current.state.document.sections[0].children?.[0].content).toBe("edited");
  });
});
