export class AppError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = retryable;
  }
}

export const asAppError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError('INTERNAL_ERROR', error.message, false);
  }

  return new AppError('INTERNAL_ERROR', 'Unknown error', false);
};
