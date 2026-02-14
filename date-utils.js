export const todayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDate = value => {
  if (!value) return new Date();
  return new Date(`${value}T00:00:00`);
};

export const formatBannerDate = value => {
  const date = parseDate(value);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const getShiftedDate = (value, direction) => {
  const date = parseDate(value || todayIso());
  date.setDate(date.getDate() + direction);
  return date.toISOString().split("T")[0];
};

export const readDateFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("date");
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

export const writeDateToUrl = value => {
  const url = new URL(window.location.href);
  if (value) {
    url.searchParams.set("date", value);
  } else {
    url.searchParams.delete("date");
  }
  const nextUrl = `${url.pathname}${url.search}`;
  window.history.replaceState({}, "", nextUrl);
};
