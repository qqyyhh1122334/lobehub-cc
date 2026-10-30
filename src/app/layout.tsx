import { type ReactNode } from 'react';

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html suppressHydrationWarning lang={'en'} style={{ height: '100%' }}>
      <head>
        <script src="/intranet-browser-guard.js" />
      </head>
      <body style={{ height: '100%', margin: 0 }}>{children}</body>
    </html>
  );
};

export default RootLayout;
