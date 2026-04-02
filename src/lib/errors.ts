export const EXIT_CODES = {
  GENERAL_ERROR: 1,
  AUTH_ERROR: 2,
  NETWORK_ERROR: 3,
  API_ERROR: 4,
} as const;

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = EXIT_CODES.GENERAL_ERROR,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class HttpError extends CliError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown,
    exitCode: number = EXIT_CODES.API_ERROR,
  ) {
    super(message, exitCode);
    this.name = 'HttpError';
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
