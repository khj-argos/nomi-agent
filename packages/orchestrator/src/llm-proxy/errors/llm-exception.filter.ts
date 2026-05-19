import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface AnthropicErrorBody {
  type: 'error';
  error: { type: string; message: string };
}

const STATUS_TO_ERROR_TYPE: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  404: 'not_found_error',
  408: 'request_timeout',
  409: 'conflict_error',
  413: 'request_too_large',
  422: 'invalid_request_error',
  429: 'rate_limit_error',
  500: 'api_error',
  502: 'api_error',
  503: 'overloaded_error',
  504: 'request_timeout',
};

@Catch()
export class LlmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(LlmExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorType = 'api_error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (isAnthropicShape(payload)) {
        res.status(status);
        if (!res.headersSent) {
          res.setHeader('content-type', 'application/json');
        }
        res.end(JSON.stringify(payload));
        return;
      } else if (
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof (payload as { message: unknown }).message === 'string'
      ) {
        message = (payload as { message: string }).message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    errorType = STATUS_TO_ERROR_TYPE[status] ?? 'api_error';

    const body: AnthropicErrorBody = {
      type: 'error',
      error: { type: errorType, message },
    };

    if (status >= 500) {
      this.logger.error(`LLM proxy ${status}: ${message}`, exceptionStack(exception));
    } else {
      this.logger.warn(`LLM proxy ${status}: ${message}`);
    }

    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }
}

function isAnthropicShape(payload: unknown): payload is AnthropicErrorBody {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as { type?: unknown; error?: unknown };
  if (p.type !== 'error') return false;
  const e = p.error;
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { type?: unknown; message?: unknown };
  return typeof err.type === 'string' && typeof err.message === 'string';
}

function exceptionStack(exception: unknown): string | undefined {
  return exception instanceof Error ? exception.stack : undefined;
}
