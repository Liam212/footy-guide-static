const formatLocalIso = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const todayIso = () => {
  const now = new Date();
  return formatLocalIso(now);
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
  return formatLocalIso(date);
};

export const getStartOfWeek = value => {
  const date = parseDate(value || todayIso());
  const day = date.getDay();
  const offset = (day + 6) % 7;
  date.setDate(date.getDate() - offset);
  return formatLocalIso(date);
};

export const readDateFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("date");
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

export const readViewFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("view");
  return value === "week" ? "week" : null;
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

export const writeViewToUrl = value => {
  const url = new URL(window.location.href);
  if (value === "week") {
    url.searchParams.set("view", value);
  } else {
    url.searchParams.delete("view");
  }
  const nextUrl = `${url.pathname}${url.search}`;
  window.history.replaceState({}, "", nextUrl);
};
