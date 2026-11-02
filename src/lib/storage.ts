import { FacebookPage } from '@/types/facebook';

export interface FacebookSession {
  user: {
    id: string;
    name: string;
    email?: string;
    picture?: string;
  };
  accessToken: string;
  loginAt: number;
  expiresAt: number;
  isLongLived?: boolean;
}

const STORAGE_KEYS = {
  FB_APP_ID: 'fb_app_id',
  FB_APP_SECRET: 'fb_app_secret',
  FB_USER_TOKEN: 'fb_user_token',
  FB_SESSION: 'fb_session',
  FB_PAGES: 'fb_pages',
};

const isBrowser = typeof window !== 'undefined';

export const storage = {
  // Facebook App ID
  getFbAppId: (): string => {
    if (!isBrowser) return process.env.NEXT_PUBLIC_FB_APP_ID || process.env.FB_APP_ID || '';
    return localStorage.getItem(STORAGE_KEYS.FB_APP_ID) || process.env.NEXT_PUBLIC_FB_APP_ID || '';
  },
  setFbAppId: (id: string): void => {
    if (isBrowser) localStorage.setItem(STORAGE_KEYS.FB_APP_ID, id);
  },

  // Facebook App Secret
  getFbAppSecret: (): string => {
    if (!isBrowser) return process.env.FB_APP_SECRET || process.env.NEXT_PUBLIC_FB_APP_SECRET || '';
    return localStorage.getItem(STORAGE_KEYS.FB_APP_SECRET) || process.env.NEXT_PUBLIC_FB_APP_SECRET || '';
  },
  setFbAppSecret: (secret: string): void => {
    if (isBrowser) localStorage.setItem(STORAGE_KEYS.FB_APP_SECRET, secret);
  },

  // Facebook Session
  getFbSession: (): FacebookSession | null => {
    if (!isBrowser) return null;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FB_SESSION);
      if (!data) return null;
      const session: FacebookSession = JSON.parse(data);
      // Check session expiry
      if (session.expiresAt && Date.now() > session.expiresAt) {
        localStorage.removeItem(STORAGE_KEYS.FB_SESSION);
        localStorage.removeItem(STORAGE_KEYS.FB_USER_TOKEN);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },
  setFbSession: (session: FacebookSession): void => {
    if (isBrowser) {
      localStorage.setItem(STORAGE_KEYS.FB_SESSION, JSON.stringify(session));
      localStorage.setItem(STORAGE_KEYS.FB_USER_TOKEN, session.accessToken);
    }
  },
  clearFbSession: (): void => {
    if (isBrowser) {
      localStorage.removeItem(STORAGE_KEYS.FB_SESSION);
      localStorage.removeItem(STORAGE_KEYS.FB_USER_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.FB_PAGES);
    }
  },

  // Facebook User Token
  getFbUserToken: (): string => {
    if (!isBrowser) return process.env.FB_USER_TOKEN || process.env.NEXT_PUBLIC_FB_USER_TOKEN || '';
    const session = storage.getFbSession();
    if (session?.accessToken) return session.accessToken;
    return localStorage.getItem(STORAGE_KEYS.FB_USER_TOKEN) || process.env.NEXT_PUBLIC_FB_USER_TOKEN || '';
  },
  setFbUserToken: (token: string): void => {
    if (isBrowser) localStorage.setItem(STORAGE_KEYS.FB_USER_TOKEN, token);
  },

  // Facebook Pages
  getFbPages: (): FacebookPage[] => {
    if (!isBrowser) return [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FB_PAGES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  setFbPages: (pages: FacebookPage[]): void => {
    if (isBrowser) localStorage.setItem(STORAGE_KEYS.FB_PAGES, JSON.stringify(pages));
  },
};
