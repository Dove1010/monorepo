import type { Request, Response, NextFunction } from 'express'
import { employerStore } from '../models/employerStore.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'

export interface EmployerAuthenticatedRequest extends Request {
  employer?: {
    id: string
    name: string
    status: string
  }
}

function extractApiKey(req: Request): string | undefined {
  const header = req.headers['x-employer-api-key']
  if (typeof header === 'string' && header.length > 0) {
    return header
  }
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim()
  }
  return undefined
}

export function requireEmployerApiKey(
  req: EmployerAuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const apiKey = extractApiKey(req)
  if (!apiKey) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, 401, 'Employer API key is required'))
  }

  const employer = employerStore.findByApiKey(apiKey)
  if (!employer || employer.status !== 'active') {
    return next(new AppError(ErrorCode.UNAUTHORIZED, 401, 'Invalid employer API key'))
  }

  req.employer = {
    id: employer.id,
    name: employer.name,
    status: employer.status,
  }
  next()
}
