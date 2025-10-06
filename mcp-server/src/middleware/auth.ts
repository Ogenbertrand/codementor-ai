import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Logger } from '../utils/logger';

const logger = new Logger('auth-middleware');

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    email?: string;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        error: {
          code: 4001,
          message: 'Authorization header required'
        }
      });
      return;
    }

    // Support Bearer token or API key
    let token: string;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Treat as API key
      if (authHeader === config.apiKey) {
        req.user = { id: 'api-key-user' };
        next();
        return;
      } else {
        res.status(401).json({
          error: {
            code: 4001,
            message: 'Invalid API key'
          }
        });
        return;
      }
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.user = {
      id: decoded.sub || decoded.userId || 'unknown',
      username: decoded.username,
      email: decoded.email
    };

    logger.debug('Authentication successful', { userId: req.user.id });
    next();
  } catch (error) {
    logger.warn('Authentication failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(401).json({
      error: {
        code: 4001,
        message: 'Invalid or expired token'
      }
    });
  }
}

export function generateToken(payload: any, expiresIn: string = '1h'): string {
  return jwt.sign(payload, config.jwtSecret, { 
    expiresIn,
    issuer: 'codementor-ai-mcp',
    audience: 'codementor-ai-clients'
  });
}

export function validateToken(token: string): boolean {
  try {
    jwt.verify(token, config.jwtSecret);
    return true;
  } catch {
    return false;
  }
}