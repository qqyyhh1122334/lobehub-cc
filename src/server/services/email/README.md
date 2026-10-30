# Internal SMTP email

The intranet edition only supports Nodemailer with an explicitly configured internal SMTP server. Resend and cloud provider selection have been removed.

Set `SMTP_HOST`, `SMTP_FROM`, and `SMTP_PORT` (default 587). Set `SMTP_SECURE=true` for implicit TLS. Configure `SMTP_USER` and `SMTP_PASS` together when authentication is required; omit both for an isolated internal relay. Add the SMTP host and port to `LOBE_INTRANET_ALLOWED_ENDPOINTS` and the network policy.

Email/password sign-in does not require SMTP. Password-reset emails, magic links and optional email verification do require the internal relay. Keep `AUTH_EMAIL_VERIFICATION=0` and `AUTH_ENABLE_MAGIC_LINK=0` unless the relay is available. SMTP failure is returned as an error; emails are never reported as sent without successful SMTP submission.

Only `EMAIL_SERVICE_PROVIDER=nodemailer` is accepted. Authentication trusts only the configured internal `APP_URL` origin. Outbound SSO clients are disabled; this does not remove the application's own local OIDC provider.
