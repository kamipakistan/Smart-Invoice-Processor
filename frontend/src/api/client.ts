export const getDefaultApiBase = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || 'localhost';
    const port = window.location.port;
    if (port === '3001' || port === '8001') {
      return `${window.location.protocol}//${hostname}:8001`;
    }
    return `${window.location.protocol}//${hostname}:8000`;
  }
  return 'http://localhost:8000';
};

let currentApiBaseUrl: string = getDefaultApiBase();
let inMemoryAccessToken: string | null = null;
let onUnauthenticatedCallback: (() => void) | null = null;

export const setApiBaseUrl = (url: string) => {
  currentApiBaseUrl = url;
};

export const getApiBaseUrl = (): string => {
  return currentApiBaseUrl;
};

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const getAccessToken = (): string | null => {
  return inMemoryAccessToken;
};

export const setOnUnauthenticated = (cb: () => void) => {
  onUnauthenticatedCallback = cb;
};

let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string | null) => void) => {
  refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token: string | null) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
    ? endpoint
    : `${currentApiBaseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  let response = await fetch(url, config);

  // If 401 and not an auth endpoint, try to refresh token
  if (response.status === 401 && !url.includes('/api/v1/auth/')) {
    if (isRefreshing) {
      return new Promise<Response>((resolve) => {
        subscribeTokenRefresh((newToken) => {
          if (newToken) {
            headers.set('Authorization', `Bearer ${newToken}`);
          }
          resolve(fetch(url, { ...config, headers }));
        });
      });
    }

    isRefreshing = true;
    try {
      const refreshRes = await fetch(`${currentApiBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setAccessToken(data.access_token);
        onTokenRefreshed(data.access_token);
        headers.set('Authorization', `Bearer ${data.access_token}`);
        response = await fetch(url, { ...config, headers });
      } else {
        setAccessToken(null);
        onTokenRefreshed(null);
        if (onUnauthenticatedCallback) {
          onUnauthenticatedCallback();
        }
      }
    } catch (err) {
      setAccessToken(null);
      onTokenRefreshed(null);
      if (onUnauthenticatedCallback) {
        onUnauthenticatedCallback();
      }
    } finally {
      isRefreshing = false;
    }
  }

  return response;
}

export async function apiFetchBlob(endpoint: string, options: RequestInit = {}): Promise<Blob> {
  const response = await apiFetch(endpoint, options);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  return await response.blob();
}
