import {
  FacebookPage,
  LongLivedTokenResponse,
} from '@/types/facebook';

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Exchange Short-lived User Access Token for Long-lived User Access Token (60 days)
 */
export async function exchangeForLongLivedToken(
  appId: string,
  appSecret: string,
  shortLivedToken: string
): Promise<LongLivedTokenResponse> {
  const url = `${GRAPH_BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
    appId
  )}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(
    shortLivedToken
  )}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      error: {
        message: `Lỗi kết nối khi đổi token: ${errorMessage}`,
        code: -1,
      },
    };
  }
}

/**
 * Fetch all Facebook Fanpages managed by the authorized user
 */
export async function getManagedPages(userAccessToken: string): Promise<{
  pages: FacebookPage[];
  error?: string;
}> {
  if (!userAccessToken) {
    return { pages: [], error: 'Vui lòng cung cấp User Access Token Facebook.' };
  }

  const url = `${GRAPH_BASE_URL}/me/accounts?fields=id,name,access_token,category,picture.type(large)&access_token=${encodeURIComponent(
    userAccessToken
  )}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      return { pages: [], error: data.error.message };
    }

    // Exchange short-lived page tokens for long-lived page tokens if possible
    const pages: FacebookPage[] = await Promise.all(
      (data.data || []).map(async (p: any) => {
        let pageToken = p.access_token;

        try {
          const llRes = await fetch(
            `${GRAPH_BASE_URL}/${p.id}?fields=access_token&access_token=${encodeURIComponent(userAccessToken)}`
          );
          const llData = await llRes.json();
          if (llData.access_token && !llData.error) {
            pageToken = llData.access_token;
          }
        } catch {
          // Fallback to initial token if exchange fails
        }

        return {
          id: p.id,
          name: p.name,
          access_token: pageToken,
          category: p.category,
          picture: p.picture,
        };
      })
    );

    return { pages };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { pages: [], error: `Lỗi kết nối Facebook API: ${errorMessage}` };
  }
}
