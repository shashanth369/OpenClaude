import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'OpenClaude — Free, multi-provider Claude experience',
  description:
    'OpenClaude replicates the Claude experience — chat, artifacts, cowork multi-agent harness, projects — powered by free models from OpenRouter, Google Gemini, Groq and Airforce.',
  icons: [{ rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' }],
};

export const viewport: Viewport = {
  themeColor: '#1e1d1b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('openclaude-theme');if(t){document.documentElement.dataset.theme=t;}}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
