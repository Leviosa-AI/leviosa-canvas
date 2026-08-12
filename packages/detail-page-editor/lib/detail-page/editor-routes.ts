const PRODUCTION_EDITOR_PATH =
  "/branding/detail-page-generator/editor";

/** Routes that render the shared full-screen detail-page editor chrome. */
export function isDetailPageEditorPath(pathname: string): boolean {
  return (
    pathname.startsWith(PRODUCTION_EDITOR_PATH) ||
    pathname.startsWith("/dev-canvas")
  );
}
