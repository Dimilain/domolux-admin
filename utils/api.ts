/**
 * Simple fetch wrapper for API calls
 */
export const apiFetch = async (path: string): Promise<any> => {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';
  const apiToken = process.env.NEXT_PUBLIC_API_TOKEN || '';
  const url = path.startsWith('/') ? `${base}/api${path}` : `${base}/api/${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
};

