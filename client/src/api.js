// JSON requests to the API. The session cookie is HttpOnly, so the browser sends it automatically.
async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function currentUser() {
  try {
    return (await call('/auth/me')).user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

export const login = async (email, password) => (await call('/auth/login', { method: 'POST', body: { email, password } })).user;
export const logout = () => call('/auth/logout', { method: 'POST' });
