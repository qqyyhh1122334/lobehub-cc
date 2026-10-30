import { NodemailerImpl } from './nodemailer';
import { type EmailServiceImpl } from './type';

export enum EmailImplType {
  Nodemailer = 'nodemailer',
}

/** Only an explicitly configured internal SMTP server is supported. */
export const createEmailServiceImpl = (
  type: EmailImplType = EmailImplType.Nodemailer,
): EmailServiceImpl => {
  if (type !== EmailImplType.Nodemailer) {
    throw new Error('Only internal SMTP email is supported in the intranet edition');
  }
  return new NodemailerImpl();
};

export type { EmailServiceImpl, EmailPayload, EmailResponse } from './type';
