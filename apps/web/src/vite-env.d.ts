/// <reference types="vite/client" />

interface TelegramWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
  requestContact?(callback?: (shared: boolean) => void): void;
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
}

interface Window {
  Telegram?: { WebApp: TelegramWebApp };
}
