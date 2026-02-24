import type { AppError } from './errors.js';
import { APP_VERSION } from './version.js';

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
  meta: {
    timestamp: string;
    version: string;
  };
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export const success = <T>(data: T): SuccessEnvelope<T> => ({
  ok: true,
  data,
  meta: {
    timestamp: new Date().toISOString(),
    version: APP_VERSION
  }
});

export const failure = (error: AppError): ErrorEnvelope => ({
  ok: false,
  error: {
    code: error.code,
    message: error.message,
    retryable: error.retryable
  }
});

export const printJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
