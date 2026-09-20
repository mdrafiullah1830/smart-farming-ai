import type { Env } from '../types.ts';
import { corsHeaders, json, error } from '../http.ts';

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  custom?: (value: unknown) => string | null;
}

export function validateBody(rules: ValidationRule[]) {
  return async (request: Request, env: Env): Promise<{ valid: boolean; data?: Record<string, unknown>; message?: string }> => {
    let data: Record<string, unknown>;
    try {
      data = await request.json<Record<string, unknown>>();
    } catch {
      return { valid: false, message: 'Invalid JSON body' };
    }

    for (const rule of rules) {
      const value = data[rule.field];

      if (rule.required && (value === undefined || value === null)) {
        return { valid: false, message: `${rule.field} is required` };
      }

      if (value === undefined || value === null) continue;

      if (rule.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
          return { valid: false, message: `${rule.field} must be a ${rule.type}` };
        }
      }

      if (rule.type === 'string' && typeof value === 'string') {
        if (rule.min !== undefined && value.length < rule.min) {
          return { valid: false, message: `${rule.field} must be at least ${rule.min} characters` };
        }
        if (rule.max !== undefined && value.length > rule.max) {
          return { valid: false, message: `${rule.field} must be at most ${rule.max} characters` };
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          return { valid: false, message: `${rule.field} has invalid format` };
        }
        if (rule.enum && !rule.enum.includes(value)) {
          return { valid: false, message: `${rule.field} must be one of: ${rule.enum.join(', ')}` };
        }
      }

      if (rule.type === 'number' && typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          return { valid: false, message: `${rule.field} must be at least ${rule.min}` };
        }
        if (rule.max !== undefined && value > rule.max) {
          return { valid: false, message: `${rule.field} must be at most ${rule.max}` };
        }
      }

      if (rule.custom) {
        const customError = rule.custom(value);
        if (customError) {
          return { valid: false, message: customError };
        }
      }
    }

    return { valid: true, data };
  };
}

export function validateQuery(rules: ValidationRule[]) {
  return async (request: Request, env: Env): Promise<{ valid: boolean; data?: Record<string, unknown>; message?: string }> => {
    const url = new URL(request.url);
    const data: Record<string, unknown> = {};
    url.searchParams.forEach((value, key) => {
      // Try to parse numbers
      if (!isNaN(Number(value)) && value !== '') {
        data[key] = Number(value);
      } else {
        data[key] = value;
      }
    });

    for (const rule of rules) {
      const value = data[rule.field];

      if (rule.required && (value === undefined || value === null)) {
        return { valid: false, message: `${rule.field} is required` };
      }

      if (value === undefined || value === null) continue;

      if (rule.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
          return { valid: false, message: `${rule.field} must be a ${rule.type}` };
        }
      }

      if (rule.type === 'string' && typeof value === 'string') {
        if (rule.min !== undefined && value.length < rule.min) {
          return { valid: false, message: `${rule.field} must be at least ${rule.min} characters` };
        }
        if (rule.max !== undefined && value.length > rule.max) {
          return { valid: false, message: `${rule.field} must be at most ${rule.max} characters` };
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          return { valid: false, message: `${rule.field} has invalid format` };
        }
        if (rule.enum && !rule.enum.includes(value)) {
          return { valid: false, message: `${rule.field} must be one of: ${rule.enum.join(', ')}` };
        }
      }

      if (rule.type === 'number' && typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          return { valid: false, message: `${rule.field} must be at least ${rule.min}` };
        }
        if (rule.max !== undefined && value > rule.max) {
          return { valid: false, message: `${rule.field} must be at most ${rule.max}` };
        }
      }

      if (rule.custom) {
        const customError = rule.custom(value);
        if (customError) {
          return { valid: false, message: customError };
        }
      }
    }

    return { valid: true, data };
  };
}