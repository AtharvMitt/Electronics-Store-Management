// JSON requests to the API. The session cookie is HttpOnly, so the browser sends it automatically.
async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
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

export const inventoryApi = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== '' && value !== false && value != null) params.set(key, String(value));
    const query = params.size ? `?${params}` : '';
    return (await call(`/inventory${query}`)).inventory;
  },
  adjust: (productId, body) => call(`/inventory/${productId}/adjustments`, { method: 'POST', body }),
};

export const salesApi = {
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return (await call(`/sales${params.size ? `?${params}` : ''}`)).sales;
  },
  create: (body, requestId) => call('/sales', { method: 'POST', body, headers: { 'Idempotency-Key': requestId } }),
};

export const reportsApi = {
  sales: async (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return call(`/reports/sales${params.size ? `?${params}` : ''}`);
  },
  inventory: async (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return call(`/reports/inventory${params.size ? `?${params}` : ''}`);
  },
  lowStock: async (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return call(`/reports/low-stock${params.size ? `?${params}` : ''}`);
  },
};

export const login = async (email, password) => (await call('/auth/login', { method: 'POST', body: { email, password } })).user;
export const logout = () => call('/auth/logout', { method: 'POST' });
export const listUsers = async () => (await call('/users')).users;

// Only hides UI. The server checks the same permission on every request.
export const can = (user, permission) => Boolean(user?.permissions?.includes(permission));

export const catalogue = {
  products: async () => (await call('/products')).products,
  categories: async () => (await call('/categories')).categories,
  saveProduct: (id, body) => call(`/products${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body }),
  saveCategory: (id, body) => call(`/categories${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body }),
  deactivateProduct: (id) => call(`/products/${id}`, { method: 'DELETE' }),
  deleteCategory: (id) => call(`/categories/${id}`, { method: 'DELETE' }),
};
