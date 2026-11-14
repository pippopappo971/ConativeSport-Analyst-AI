const TOKEN_STORAGE_KEY = 'conative_access_token';

export type AuthRole = 'owner' | 'friend' | 'guest';

export interface AuthStatusResponse {
  authorized: boolean;
  role: AuthRole;
  gateEnabled: boolean;
  autoToken?: string;
  friendPin?: string;
  ownerInviteKey?: string;
  sharedAppUrl?: string;
}

export function getStoredAuthToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAuthToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { 'x-conative-token': token } : {};
}

export async function checkAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch('/api/auth/status', {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (!response.ok) {
    throw new Error(`Errore verifica accesso HTTP ${response.status}`);
  }
  const data = (await response.json()) as AuthStatusResponse;
  if (data.autoToken) {
    setStoredAuthToken(data.autoToken);
  }
  return data;
}

export async function verifyAccessCode(params: {
  pin?: string;
  ownerKey?: string;
}): Promise<AuthStatusResponse & { token?: string }> {
  const response = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Codice di accesso non valido.');
  }

  if (data.token) {
    setStoredAuthToken(data.token);
  }
  return data;
}

export async function updateAccessConfig(params: {
  gateEnabled?: boolean;
  friendPin?: string;
}): Promise<{ gateEnabled: boolean; friendPin: string; ownerInviteKey: string; sharedAppUrl?: string }> {
  const response = await fetch('/api/auth/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Impossibile aggiornare le impostazioni di accesso.');
  }
  return data;
}
