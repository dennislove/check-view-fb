import { useState, useEffect, useCallback } from 'react';
import { FacebookPage } from '@/types/facebook';
import { storage, FacebookSession } from '@/lib/storage';
import { getManagedPages } from '@/lib/facebook';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function useFacebookPages() {
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [userToken, setUserToken] = useState<string>('');
  const [appId, setAppId] = useState<string>('');
  const [appSecret, setAppSecret] = useState<string>('');
  const [session, setSession] = useState<FacebookSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedSession = storage.getFbSession();
    const savedPages = storage.getFbPages();
    const token = savedSession?.accessToken || storage.getFbUserToken();
    const savedAppId = storage.getFbAppId();
    const savedSecret = storage.getFbAppSecret();

    setSession(savedSession);
    setPages(savedPages);
    setUserToken(token);
    setAppId(savedAppId);
    setAppSecret(savedSecret);

    if (savedPages.length > 0) {
      setSelectedPageId(savedPages[0].id);
    }
  }, []);

  const refreshPages = useCallback(async (tokenToUse?: string) => {
    const activeToken = tokenToUse || userToken || storage.getFbUserToken();
    if (!activeToken) {
      setError('Chưa có Facebook User Access Token.');
      return [];
    }

    setIsLoading(true);
    setError(null);

    const { pages: fetchedPages, error: fetchError } = await getManagedPages(activeToken);

    if (fetchError) {
      setError(fetchError);
      setIsLoading(false);
      return [];
    }

    setPages(fetchedPages);
    storage.setFbPages(fetchedPages);

    if (fetchedPages.length > 0 && !selectedPageId) {
      setSelectedPageId(fetchedPages[0].id);
    }

    setIsLoading(false);
    return fetchedPages;
  }, [userToken, selectedPageId]);

  const saveSession = useCallback(async (
    newSession: Omit<FacebookSession, 'loginAt' | 'expiresAt'>,
    customDays: number = 7
  ) => {
    const fullSession: FacebookSession = {
      ...newSession,
      loginAt: Date.now(),
      expiresAt: Date.now() + customDays * 24 * 60 * 60 * 1000,
    };

    setSession(fullSession);
    setUserToken(fullSession.accessToken);
    storage.setFbSession(fullSession);

    await refreshPages(fullSession.accessToken);
  }, [refreshPages]);

  const renewSession = useCallback(async (days: number = 7) => {
    const current = storage.getFbSession();
    if (current) {
      const updated: FacebookSession = {
        ...current,
        expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
      };
      setSession(updated);
      storage.setFbSession(updated);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    storage.clearFbSession();
    setSession(null);
    setPages([]);
    setUserToken('');
    setSelectedPageId('');
  }, []);

  const handleExchangeToken = async (shortToken?: string) => {
    const activeToken = shortToken || userToken;
    const activeAppId = appId || storage.getFbAppId();
    const activeSecret = appSecret || storage.getFbAppSecret();

    if (!activeAppId || !activeSecret || !activeToken) {
      setError('Vui lòng nhập App ID, App Secret và Token để đổi Long-lived Token.');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/facebook/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: activeAppId,
          appSecret: activeSecret,
          shortLivedToken: activeToken,
        }),
      });

      const result = await res.json();

      if (result.access_token) {
        setUserToken(result.access_token);
        const currentSession = storage.getFbSession();
        if (currentSession) {
          const updated: FacebookSession = {
            ...currentSession,
            accessToken: result.access_token,
            isLongLived: true,
            expiresAt: Date.now() + SEVEN_DAYS_MS,
          };
          setSession(updated);
          storage.setFbSession(updated);
        } else {
          storage.setFbUserToken(result.access_token);
        }
        await refreshPages(result.access_token);
        setIsLoading(false);
        return true;
      } else {
        setError(result.error || 'Đổi Long-lived Token thất bại.');
        setIsLoading(false);
        return false;
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi kết nối khi đổi token.');
      setIsLoading(false);
      return false;
    }
  };

  const selectedPage = pages.find((p) => p.id === selectedPageId) || pages[0] || null;

  return {
    pages,
    selectedPage,
    selectedPageId,
    setSelectedPageId,
    userToken,
    setUserToken,
    appId,
    setAppId,
    appSecret,
    setAppSecret,
    session,
    saveSession,
    renewSession,
    logout,
    isLoading,
    error,
    refreshPages,
    handleExchangeToken,
  };
}
