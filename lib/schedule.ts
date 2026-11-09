import type { Employee } from "@/types/database";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Determina se a funcionária trabalha numa data específica.
 *
 * - shift_type='fixed': confere se o dia da semana da data está em
 *   work_weekdays (ex: seg-sex = [1,2,3,4,5]).
 * - shift_type='12x36': alterna trabalha/folga a cada dia a partir de
 *   shift_anchor_date (uma data em que ela trabalhou). Se não tiver
 *   anchor definido ainda, assume que trabalha todo dia — fallback
 *   seguro pra não sumir ninguém da rota por falta de configuração.
 */
export function employeeWorksOnDate(employee: Pick<Employee, "shift_type" | "work_weekdays" | "shift_anchor_date">, date: Date): boolean {
  if (employee.shift_type === "12x36") {
    if (!employee.shift_anchor_date) return true;

    const anchor = new Date(`${employee.shift_anchor_date}T00:00:00`);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    anchor.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays % 2 === 0;
  }

  const weekday = date.getDay();
  const days = employee.work_weekdays?.length ? employee.work_weekdays : [1, 2, 3, 4, 5];
  return days.includes(weekday);
}

export function formatShiftSummary(employee: Pick<Employee, "shift_type" | "work_weekdays" | "shift_anchor_date" | "shift_start_time" | "shift_end_time">): string {
  const timeRange =
    employee.shift_start_time && employee.shift_end_time
      ? ` · ${employee.shift_start_time.slice(0, 5)}–${employee.shift_end_time.slice(0, 5)}`
      : "";

  if (employee.shift_type === "12x36") {
    const anchor = employee.shift_anchor_date
      ? new Date(`${employee.shift_anchor_date}T00:00:00`).toLocaleDateString("pt-BR")
      : "não configurada";
    return `Escala 12x36 (referência: ${anchor})${timeRange}`;
  }

  const days = employee.work_weekdays?.length ? employee.work_weekdays : [1, 2, 3, 4, 5];
  const sorted = [...days].sort((a, b) => a - b);
  return `${sorted.map((d) => WEEKDAY_LABELS[d]).join(", ")}${timeRange}`;
}

export { WEEKDAY_LABELS };
