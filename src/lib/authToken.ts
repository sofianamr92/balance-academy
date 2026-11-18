// In-memory Firebase ID Token holder (never persisted to localStorage)
let inMemoryIdToken: string | null = null;

export function setInMemoryAuthToken(token: string | null): void {
  inMemoryIdToken = token;
}

export function getInMemoryAuthToken(): string | null {
  return inMemoryIdToken;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (inMemoryIdToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryIdToken}`);
  }
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });
}
