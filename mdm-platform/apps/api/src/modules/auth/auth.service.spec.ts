import 'reflect-metadata';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { AuthService } from './auth.service';

vi.mock('./entities/user.entity', () => ({
  User: class {},
}));

const createService = () => new AuthService({} as any, { signAsync: vi.fn() } as any);

describe('AuthService - ensureTurnstileValidated', () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = originalSecret;
    }
  });

  it('sends the Turnstile verification request as form data and resolves on success', async () => {
    const jsonMock = vi.fn().mockResolvedValue({ success: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: jsonMock,
    });

    global.fetch = fetchMock as any;

    const service = createService();
    await expect((service as any).ensureTurnstileValidated('token-123')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(URLSearchParams);
    expect((options?.body as URLSearchParams).get('secret')).toBe('test-secret');
    expect((options?.body as URLSearchParams).get('response')).toBe('token-123');
    expect(options?.headers).toBeUndefined();
    expect(jsonMock).toHaveBeenCalledOnce();
  });

  it('throws a ForbiddenException including error codes when the validation fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    });

    global.fetch = fetchMock as any;

    const service = createService();
    const validation = (service as any).ensureTurnstileValidated('token-123');

    await expect(validation).rejects.toBeInstanceOf(ForbiddenException);
    await validation.catch((error: ForbiddenException) => {
      expect(error.message).toContain('invalid-input-response');
    });
  });

  it('throws a ForbiddenException when the Turnstile API responds with an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        success: false,
        'error-codes': ['bad-request'],
      }),
    });

    global.fetch = fetchMock as any;

    const service = createService();
    const validation = (service as any).ensureTurnstileValidated('token-123');

    await expect(validation).rejects.toBeInstanceOf(ForbiddenException);
    await validation.catch((error: ForbiddenException) => {
      expect(error.message).toContain('bad-request');
    });
  });

  it('throws an InternalServerErrorException when the secret is not configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = '';
    const service = createService();

    await expect((service as any).ensureTurnstileValidated('token-123')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
