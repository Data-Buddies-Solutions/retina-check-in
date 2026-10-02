export async function api(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  const serverError = 'The server is temporarily unavailable. Please try again shortly.';
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(serverError);
  }
  const data = await response.json().catch(() => { throw new Error(serverError); });
  if (!response.ok) throw new Error(data.error || serverError);
  return data;
}
