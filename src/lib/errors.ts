// Typed application error carried from service layer to API responses.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string, code?: string) {
  return new ApiError(400, message, code);
}

export function unauthorized(message = "You must be signed in.") {
  return new ApiError(401, message, "UNAUTHORIZED");
}

export function forbidden(message = "You don't have permission to do that.") {
  return new ApiError(403, message, "FORBIDDEN");
}

export function notFound(message = "Not found.") {
  return new ApiError(404, message, "NOT_FOUND");
}

export function conflict(message: string, code?: string) {
  return new ApiError(409, message, code ?? "CONFLICT");
}
