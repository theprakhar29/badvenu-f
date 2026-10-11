const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function apiFetch(endpoint, options = {}) {
  // console.log("🚀 apiFetch called");
  // console.log("➡️ URL:", `${API_URL}${endpoint}`);
  // console.log("➡️ Options:", options);

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  // console.log("⬅️ Response status:", response.status);

  const data = await response.json().catch(() => null);
 
  // console.log("📦 Response data:", data);


  if (!response.ok) {
    throw new Error(
      data?.error?.message || `Request failed with status ${response.status}`
    );
  }

  return data;
}

export { API_URL };