import type { Employee } from "@/types/database";

// Média de dias num mês (365.25/12) — mesma lógica usada em folha de
// pagamento pra "dias úteis médios", evita variar o resultado conforme
// o mês tem 28, 30 ou 31 dias.
const AVG_DAYS_PER_MONTH = 30.44;

/**
 * Quantos dias por mês, em média, essa funcionária precisa de
 * transporte — baseado na escala real dela, não um número fixo pra
 * todo mundo:
 * - 12x36: trabalha metade dos dias do mês (~15,2)
 * - fixo: proporcional a quantos dias da semana ela trabalha
 *   (ex: seg-sex = 5/7 do mês ≈ 21,7)
 */
export function daysPerMonthForEmployee(
  employee: Pick<Employee, "shift_type" | "work_weekdays">
): number {
  if (employee.shift_type === "12x36") {
    return AVG_DAYS_PER_MONTH / 2;
  }

  const weekdayCount = employee.work_weekdays?.length || 5;
  return (weekdayCount / 7) * AVG_DAYS_PER_MONTH;
}
