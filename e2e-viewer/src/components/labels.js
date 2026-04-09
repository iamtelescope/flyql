export const LANG_LABELS = {
  go: "Go",
  javascript: "JavaScript",
  python: "Python",
};

export const DB_LABELS = {
  clickhouse: "ClickHouse",
  starrocks: "StarRocks",
  postgresql: "PostgreSQL",
  matcher: "FlyQL Matcher",
};

export const LANG_ICONS = {
  go: "/icons/go.svg",
  javascript: "/icons/javascript.svg",
  python: "/icons/python.svg",
};

export const DB_ICONS = {
  clickhouse: "/icons/clickhouse_light.svg",
  postgresql: "/icons/postgresql.svg",
  starrocks: "/icons/starrocks.svg",
  matcher: "/icons/matcher.svg",
};

export const DB_ICONS_DARK = {
  clickhouse: "/icons/clickhouse_dark.svg",
};

export function langLabel(key) {
  return LANG_LABELS[key] || key;
}

export function dbLabel(key) {
  return DB_LABELS[key] || key;
}
