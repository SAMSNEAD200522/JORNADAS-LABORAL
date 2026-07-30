import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

function formatMessage(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(String).join('; ');
  if (raw && typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

function writeErrorLog(entry: Record<string, unknown>): void {
  try {
    const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'errors.log');
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (_) {
    // best-effort
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor';
    let code = 'ERROR_INTERNO';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        const r = res as Record<string, unknown>;
        message = formatMessage(r.message) || message;
        code = (r.code as string) || `HTTP_${status}`;
      }
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      status,
      code,
      message,
      path: request?.url,
      method: request?.method,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    writeErrorLog(logEntry);

    response.status(status).json({
      statusCode: status,
      mensaje: message,
      codigo: code,
      timestamp: logEntry.timestamp,
      path: request?.url,
    });
  }
}
