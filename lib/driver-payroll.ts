export interface SalaryEntry {
  driver_id: string;
  effective_month: string;
  monthly_salary: number;
}
export interface DriverActivity {
  id: string;
  driver_id: string;
  trip_date: string;
  status: string;
  distance_km: number | null;
  fuel_cost: number | null;
  distance_source: string;
}

export function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mês inválido");
  const [year, number] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}` };
}

export function summarizeDriver(driverId: string, month: string, salaries: SalaryEntry[], trips: DriverActivity[]) {
  const { from, to } = monthRange(month);
  const salaryEntry = salaries.filter(s => s.driver_id === driverId && s.effective_month <= from)
    .sort((a,b) => b.effective_month.localeCompare(a.effective_month))[0];
  const activity = trips.filter(t => t.driver_id === driverId && t.trip_date >= from && t.trip_date <= to);
  const completed = activity.filter(t => t.status === "completed");
  const withDistance = completed.filter(t => t.distance_source !== "none" && t.distance_km != null && Number.isFinite(Number(t.distance_km)) && Number(t.distance_km) >= 0);
  const km = withDistance.reduce((sum,t) => sum + Number(t.distance_km), 0);
  const salary = salaryEntry ? Number(salaryEntry.monthly_salary) : null;
  return {
    salary, salarySince: salaryEntry?.effective_month ?? null,
    totalTrips: activity.length, completedTrips: completed.length,
    daysWorked: new Set(completed.map(t => t.trip_date)).size,
    km, missingDistance: completed.length - withDistance.length,
    legacyDistance: withDistance.filter(t => t.distance_source === "legacy").length,
    fuelCost: completed.reduce((sum,t) => sum + Number(t.fuel_cost || 0), 0),
    salaryPerKm: salary != null && km > 0 && withDistance.length === completed.length ? salary / km : null,
  };
}
