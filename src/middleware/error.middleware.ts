import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config';

interface ErrorResponse {
    error: {
        message: string;
        details?: unknown;
        stack?: string;
    };
}

interface ClientHttpError extends Error {
    status: number;
    type?: string;
}

const isClientHttpError = (err: unknown): err is ClientHttpError => {
    if (!(err instanceof Error)) return false;
    const status = (err as { status?: unknown }).status;
    return typeof status === 'number' && status >= 400 && status < 500;
};

const clientErrorMessage = (err: ClientHttpError): string => {
    if (err.type === 'entity.parse.failed') return 'Invalid JSON body';
    if (err.type === 'entity.too.large') return 'Payload too large';
    return 'Bad request';
};

export const notFoundHandler = (
    req: Request,
    _res: Response,
    next: NextFunction,
): void => {
    next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler = (
    err: unknown,
    _req: Request,
    res: Response<ErrorResponse>,
    _next: NextFunction,
): void => {
    const isProduction = config.env === 'production';
    let status = 500;
    let message = 'Internal Server Error';
    let details: unknown;

    if (err instanceof ApiError) {
        status = err.status;
        message = err.message;
        details = err.details;
    } else if (isClientHttpError(err)) {
        status = err.status;
        message = clientErrorMessage(err);
    } else if (!isProduction && err instanceof Error) {
        message = err.message;
    }

    if (status >= 500) console.error(err);

    const payload: ErrorResponse = {
        error: { message, ...(details !== undefined ? { details } : {}) },
    };

    if (!isProduction && status >= 500 && err instanceof Error) {
        payload.error.stack = err.stack;
    }

    res.status(status).json(payload);
};