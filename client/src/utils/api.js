const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE;
  }

  getUser() {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  }

  async request(method, path, body = null, isFormData = false) {
    const headers = {};
    const user = this.getUser();
    
    if (user) {
      headers['x-user-id'] = user.id || user._id;
      headers['x-user-email'] = user.email;
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
      // Do not auto-logout on auth errors; only logout when explicitly clicked.
      const error = new Error(data.error || 'Request failed');
      error.code = data.code;
      error.downtime = data.downtime;
      if (response.status === 503 && data.code === 'DOWNTIME_ACTIVE') {
        window.dispatchEvent(new CustomEvent('gc:downtime-active', { detail: data.downtime }));
      }
      throw error;
    }

    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path) { return this.request('DELETE', path); }

  async downloadFile(path) {
    const headers = {};
    const user = this.getUser();
    if (user) {
      headers['x-user-id'] = user.id || user._id;
      headers['x-user-email'] = user.email;
    }
    
    const response = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!response.ok) throw new Error('Download failed');
    return response;
  }
}

export const api = new ApiClient();
export default api;
