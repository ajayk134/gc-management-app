const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE;
  }

  getToken() {
    return localStorage.getItem('token');
  }

  async request(method, path, body = null, isFormData = false) {
    const headers = {};
    const token = this.getToken();
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (!isFormData && body) {
      headers['Content-Type'] = 'application/json';
    }

    const config = { method, headers };
    if (body) {
      config.body = isFormData ? body : JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, config);
    const data = isFormData ? await response.blob() : await response.json();

    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/api/auth/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path) { return this.request('DELETE', path); }

  async downloadFile(path) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!response.ok) throw new Error('Download failed');
    return response;
  }
}

export const api = new ApiClient();
export default api;
