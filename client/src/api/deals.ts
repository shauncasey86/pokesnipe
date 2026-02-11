import type { DealsResponse, DealDetail, SystemStatus, Preferences, LookupResult } from '../types/deals';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function getDeals(params?: {
  limit?: number;
  page?: number;
  tier?: string;
  sort?: string;
  order?: string;
  status?: string;
}): Promise<DealsResponse> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.page) qs.set('page', String(params.page));
  if (params?.tier) qs.set('tier', params.tier);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.order) qs.set('order', params.order);
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString();
  return apiFetch<DealsResponse>(`/api/deals${query ? `?${query}` : ''}`);
}

export async function getDealDetail(id: string): Promise<DealDetail> {
  return apiFetch<DealDetail>(`/api/deals/${id}`);
}

export async function reviewDeal(id: string, isCorrectMatch: boolean, reason?: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/deals/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ isCorrectMatch, reason: reason || undefined }),
  });
}

export async function fetchVelocity(dealId: string) {
  return apiFetch<{
    dealId: string;
    velocity: unknown;
    liquidity: { composite: number; grade: string; signals: Record<string, number> };
  }>(`/api/deals/${dealId}/velocity`);
}

export async function getStatus(): Promise<SystemStatus> {
  return apiFetch<SystemStatus>('/api/status');
}

export async function getPreferences(): Promise<Preferences> {
  return apiFetch<Preferences>('/api/preferences');
}

export async function updatePreferences(data: Record<string, unknown>): Promise<Preferences> {
  return apiFetch<Preferences>('/api/preferences', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function lookupEbayUrl(ebayUrl: string): Promise<LookupResult> {
  return apiFetch<LookupResult>('/api/lookup', {
    method: 'POST',
    body: JSON.stringify({ ebayUrl }),
  });
}

export async function login(password: string): Promise<void> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Login failed');
  }
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' });
}

export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch('/auth/check');
    const data = await res.json();
    return data.authenticated === true;
  } catch {
    return false;
  }
}
