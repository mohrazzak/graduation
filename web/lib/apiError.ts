// The error type shared by the FastAPI transport and its response validation.
//
// Its own module so `api.ts` (which fetches) and `apiContract.ts` (which
// validates) can both use it without importing each other. Consumers keep
// importing it from `@/lib/api`, which re-exports it.

/** Why a call failed, in terms the UI can translate. Never prose. */
export type ApiErrorKind = "bad_file" | "no_detection" | "server" | "network" | "timeout";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
