/** Data operacional de Brasília, independentemente do fuso do servidor. */
export function operationalDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"}).format(date);
}
