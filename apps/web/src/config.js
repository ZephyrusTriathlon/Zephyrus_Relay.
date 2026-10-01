// Public build-time configuration. Never put secrets in VITE_ variables.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
export async function getHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error(`API health request failed (${response.status})`);
  return response.json();
}

window.relayDevTools = import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true';
