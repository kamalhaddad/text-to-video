import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:8000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// API service functions
export const apiService = {
  // Submit a new video generation job
  submitJob: async (jobData) => {
    const response = await api.post('/jobs/submit', jobData);
    return response.data;
  },

  // Get job status by ID
  getJobStatus: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}/status`);
    return response.data;
  },

  // List all jobs with pagination and filtering
  listJobs: async (params = {}) => {
    const response = await api.get('/jobs/list', { params });
    return response.data;
  },

  // Download generated video
  downloadVideo: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}/download`, {
      responseType: 'blob',
    });
    return response;
  },

  // Get system status
  getSystemStatus: async () => {
    const response = await api.get('/system/status');
    return response.data;
  },

  // Cancel a job
  cancelJob: async (jobId) => {
    const response = await api.delete(`/jobs/${jobId}`);
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await axios.get(
      process.env.NODE_ENV === 'production' ? '/health' : 'http://localhost:8000/health'
    );
    return response.data;
  },
};

// Helper function to download a blob as a file
export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Helper function to format file size
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper function to format duration
export const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

export default api; 