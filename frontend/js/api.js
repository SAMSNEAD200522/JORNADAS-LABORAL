const API = (() => {
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    return '/api/v1';
  }
  const loc = window.location;
  return `${loc.protocol}//${loc.hostname}:${loc.port || '3000'}/api/v1`;
})();

async function request(method, path, body) {
  const token = localStorage.getItem('token');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = { message: text };
  }

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showLogin();
    }
    throw { status: res.status, ...data };
  }
  return data;
}

function get(path) { return request('GET', path); }
function post(path, body) { return request('POST', path, body); }
function patch(path, body) { return request('PATCH', path, body); }
function del(path) { return request('DELETE', path); }

async function uploadFile(path, formData) {
  const token = localStorage.getItem('token');
  const opts = {
    method: 'POST',
    headers: {},
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  opts.body = formData;

  const res = await fetch(`${API}${path}`, opts);
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = { message: text };
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showLogin();
    }
    throw { status: res.status, ...data };
  }
  return data;
}
