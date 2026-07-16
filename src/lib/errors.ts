// Typed application error carried from service layer to API responses.
// `code` + `params` let the API layer localize the message per request
// (see handleApi); `message` is the English fallback.

export type ErrorParams = Record<string, string | number>;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public params?: ErrorParams
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string, code?: string, params?: ErrorParams) {
  return new ApiError(400, message, code, params);
}

export function unauthorized(message = "You must be signed in.") {
  return new ApiError(401, message, "UNAUTHORIZED");
}

export function forbidden(
  message = "You don't have permission to do that.",
  code = "FORBIDDEN"
) {
  return new ApiError(403, message, code);
}

export function notFound(
  message = "Not found.",
  code = "NOT_FOUND",
  params?: ErrorParams
) {
  return new ApiError(404, message, code, params);
}

export function conflict(message: string, code?: string, params?: ErrorParams) {
  return new ApiError(409, message, code ?? "CONFLICT", params);
}
