import { CliError, EXIT_CODES, getErrorMessage, HttpError } from './errors';

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
}

export interface CommandOutputOptions {
  json?: boolean;
  quiet?: boolean;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printResult(result: HttpResponse, options: CommandOutputOptions): void {
  if (options.json) {
    printJson({ success: true, status: result.status, data: result.data });
    return;
  }

  if (options.quiet) {
    if (typeof result.data === 'string') {
      console.log(result.data);
      return;
    }

    printJson(result.data);
    return;
  }

  console.log(`Status: ${result.status}`);
  console.log('Response:', JSON.stringify(result.data, null, 2));
}

export function printCommandError(error: unknown, options: CommandOutputOptions): never {
  if (options.json) {
    const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.GENERAL_ERROR;
    const payload: Record<string, unknown> = {
      success: false,
      error: getErrorMessage(error),
      exitCode,
    };

    if (error instanceof HttpError) {
      payload.status = error.status;
      payload.data = error.data;
    }

    printJson(payload);
  } else {
    console.error(`❌ Error: ${getErrorMessage(error)}`);
    if (error instanceof HttpError && error.data) {
      console.error(JSON.stringify(error.data, null, 2));
    }
  }

  process.exit(error instanceof CliError ? error.exitCode : EXIT_CODES.GENERAL_ERROR);
}
