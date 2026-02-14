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
    if (!normalizedApiUrl || !normalizedApiKey) {
      throw new Error("Missing API URL or API KEY.");
    }

    const query = buildParams(params);
    const url = query ? `${normalizedApiUrl}${path}?${query}` : `${normalizedApiUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": normalizedApiKey,
      },
    });

    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }

    return res.json();
  };

  return { fetchJson };
};
