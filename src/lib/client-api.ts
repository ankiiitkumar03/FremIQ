"use client";

export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed with HTTP ${response.status}`;
    const error = new Error(message) as Error & { status?: number; data?: unknown };
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data as T;
}

export function postJson<T = unknown>(url: string, body: unknown) {
  return apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function patchJson<T = unknown>(url: string, body: unknown) {
  return apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) });
}

export function putJson<T = unknown>(url: string, body: unknown) {
  return apiFetch<T>(url, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteJson<T = unknown>(url: string) {
  return apiFetch<T>(url, { method: "DELETE" });
}
