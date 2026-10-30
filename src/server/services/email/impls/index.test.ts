import { describe, expect, it, vi } from 'vitest';

import { createEmailServiceImpl, EmailImplType } from './index';

vi.mock('./nodemailer', () => ({
  NodemailerImpl: vi.fn().mockImplementation(() => ({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    verify: vi.fn().mockResolvedValue(true),
  })),
}));

describe('createEmailServiceImpl', () => {
  it('should create NodemailerImpl by default', () => {
    const impl = createEmailServiceImpl();

    expect(impl).toBeDefined();
    expect(impl.sendMail).toBeDefined();
  });

  it('should create NodemailerImpl when explicitly specified', () => {
    const impl = createEmailServiceImpl(EmailImplType.Nodemailer);

    expect(impl).toBeDefined();
    expect(impl.sendMail).toBeDefined();
  });

  it('rejects removed or unknown cloud providers instead of silently falling back', () => {
    expect(() => createEmailServiceImpl('resend' as EmailImplType)).toThrow(/Only internal SMTP/);
    expect(() => createEmailServiceImpl('unknown' as EmailImplType)).toThrow(/Only internal SMTP/);
  });
});

describe('EmailImplType enum', () => {
  it('should have Nodemailer as a valid type', () => {
    expect(EmailImplType.Nodemailer).toBe('nodemailer');
  });
});
