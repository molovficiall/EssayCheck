export async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = response.headers
    .get('content-type')
    ?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    const error = new Error(
      data?.error || `Request failed (${response.status})`,
    );
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}
