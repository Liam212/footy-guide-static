export const buildParams = params => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => query.append(key, String(item)));
      return;
    }
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
};

export const createApiClient = ({ apiUrl, apiKey }) => {
  const normalizedApiUrl = (apiUrl || "").replace(/\/$/, "");
  const normalizedApiKey = apiKey || "";

  const fetchJson = async (path, params = {}) => {
    if (!normalizedApiUrl) {
      throw new Error("Missing API URL.");
    }

    const query = buildParams(params);
    const url = query ? `${normalizedApiUrl}${path}?${query}` : `${normalizedApiUrl}${path}`;
    const headers = {
      "Content-Type": "application/json",
    };

    if (normalizedApiKey) {
      headers["x-api-key"] = normalizedApiKey;
    }

    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }

    return res.json();
  };

  return { fetchJson };
};
