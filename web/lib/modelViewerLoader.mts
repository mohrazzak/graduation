export type ModelViewerModuleImporter = () => Promise<unknown>;

/** Start the lazy viewer import and suppress every callback after teardown. */
export function loadModelViewerModule(
  importModule: ModelViewerModuleImporter,
  onReady: () => void,
  onError: () => void,
): () => void {
  let cancelled = false;
  void importModule().then(
    () => {
      if (!cancelled) onReady();
    },
    () => {
      if (!cancelled) onError();
    },
  );
  return () => {
    cancelled = true;
  };
}
