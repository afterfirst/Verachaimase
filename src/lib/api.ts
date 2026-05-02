import axios from 'axios';

// Get the URL from environment
const rawAppUrl = process.env.VITE_APP_URL || '';

// Smart base URL detection:
let APP_URL = rawAppUrl;

if (typeof window !== 'undefined') {
  const isLocalEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const currentProtocol = window.location.protocol; // http: or https:

  // Fallback 1: If we are in the cloud (not localhost) and trying to hit localhost, force relative.
  if (!isLocalEnv && rawAppUrl.includes('localhost')) {
    console.warn('API: Cloud environment detected with localhost config. Falling back to relative paths.');
    APP_URL = '';
  }
  
  // Fallback 2: Ensure Protocol matching (Avoid Mixed Content errors)
  if (APP_URL && APP_URL.startsWith('http')) {
    const urlProtocol = APP_URL.split(':')[0] + ':';
    if (currentProtocol === 'https:' && urlProtocol === 'http:') {
       console.warn('API: HTTPS site attempting to call HTTP API. This will be blocked by browsers. Attempting to use path relative to current domain.');
       APP_URL = ''; // Relative path will use the same protocol as the current page
    }
  }

  // Fallback 3: If no URL provided at all, use relative
  if (!APP_URL) {
    console.info('API: Using relative paths for API calls.');
    APP_URL = '';
  }
}

// Clean up trailing slash
if (APP_URL && APP_URL.endsWith('/')) {
  APP_URL = APP_URL.slice(0, -1);
}

console.log('API: Base URL sequence configured as:', APP_URL || '(relative)');

const api = axios.create({
  baseURL: APP_URL,
  timeout: 60000, // global 60s timeout for browser requests
});

// Add a request interceptor for logging
api.interceptors.request.use((config) => {
  console.debug(`[API Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Add a response interceptor for logging errors
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  console.error('[API Error]', {
    message: error.message,
    code: error.code,
    url: error.config?.url,
    baseURL: error.config?.baseURL,
    status: error.response?.status
  });
  
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    console.error('API: Request timed out. This could be due to a slow backend or firewall blocking the connection.');
  }
  
  return Promise.reject(error);
});

export default api;
