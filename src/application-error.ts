export const ApplicationErrorCodes = [
  "CANCELED",
  "UNKNOWN",
  "INVALID_ARGUMENT",
  "DEADLINE_EXCEEDED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "FAILED_PRECONDITION",
  "ABORTED",
  "OUT_OF_RANGE",
  "UNIMPLEMENTED",
  "INTERNAL",
  "UNAVAILABLE",
  "DATA_LOSS",
  "UNAUTHENTICATED",
] as const;

export type ApplicationErrorCode = (typeof ApplicationErrorCodes)[number];

export class ApplicationError extends Error {
  readonly code;
  readonly metadata;
  readonly cause;

  constructor(
    message: string,
    code: ApplicationErrorCode,
    metadata?: Record<string, string | string[]>,
    cause?: unknown
  ) {
    super(message);
    this.code = code;
    this.metadata = metadata;
    this.cause = cause;
  }

  static from = (cause: unknown, message: string, code: ApplicationErrorCode) =>
    new ApplicationError(message, code, undefined, cause);
}
