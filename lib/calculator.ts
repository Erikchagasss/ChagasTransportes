// ============================================================
// MOTOR DE CÁLCULO — Calculadora de Novo Contrato
// ============================================================
//
// Ideia central: o valor do contrato (X) paga, ao mesmo tempo,
// custo direto (combustível + depreciação + custos fixos) E
// uma série de percentuais SOBRE o próprio X (motorista, imposto,
// margem). Isso cria uma equação circular — resolvida abaixo em
// forma fechada, em vez de tentar "chutar" o valor e ajustar.
//
//   X = custoDireto + driverPct*X + taxPct*X + marginPct*X
//   X * (1 - driverPct - taxPct - marginPct) = custoDireto
//   X = custoDireto / (1 - driverPct - taxPct - marginPct)
// ============================================================

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CalculatorInput {
  /** Km totais rodados por dia (ida + volta + todas as paradas) */
  dailyDistanceKm: number;
  /** Dias úteis de operação por mês (normalmente 22) */
  workDaysPerMonth: number;
  kmPerLiter: number;
  fuelPrice: number;
  /** 0.30 = 30% do valor do contrato vai para o(s) motorista(s) — modelo de comissão */
  driverPct: number;
  /** Quantos motoristas/colaboradores esse contrato precisa (a operação toda,
   * não só um veículo) */
  driverCount: number;
  /** Salário fixo mensal por motorista (R$) — modelo de custo fixo, em vez de
   * (ou além de) comissão. Multiplicado por driverCount. Use 0 se o motorista
   * for remunerado só pelo % acima. */
  driverMonthlySalary: number;
  /** Depreciação mensal do veículo (R$) */
  monthlyDepreciation: number;
  /** 0.06 = 6% de imposto sobre o valor do contrato (ex: Simples Nacional) */
  taxPct: number;
  /** Seguro, manutenção preventiva, IPVA rateado, etc (R$/mês) */
  otherFixedCosts: number;
  /** Margem de lucro desejada como % do valor do contrato */
  marginPct: number;
}

export interface CalculatorResult {
  monthlyDistanceKm: number;
  fuelCost: number;
  driverFixedCost: number;
  directCost: number;
  suggestedContractValue: number;
  driverPayment: number;
  taxAmount: number;
  marginAmount: number;
  costPerKm: number;
  isViable: boolean;
  warning?: string;
}

export function calculateContract(input: CalculatorInput): CalculatorResult {
  const {
    dailyDistanceKm,
    workDaysPerMonth,
    kmPerLiter,
    fuelPrice,
    driverPct,
    driverCount,
    driverMonthlySalary,
    monthlyDepreciation,
    taxPct,
    otherFixedCosts,
    marginPct,
  } = input;

  const monthlyDistanceKm = dailyDistanceKm * workDaysPerMonth;
  const fuelCost = kmPerLiter > 0 ? (monthlyDistanceKm / kmPerLiter) * fuelPrice : 0;
  const driverFixedCost = Math.max(driverCount, 0) * Math.max(driverMonthlySalary, 0);
  const directCost = fuelCost + driverFixedCost + monthlyDepreciation + otherFixedCosts;

  const percentageSum = driverPct + taxPct + marginPct;
  const denominator = 1 - percentageSum;

  // Se os percentuais somados chegarem a 100% ou mais, não existe valor
  // de contrato que feche a conta — sinaliza em vez de devolver número absurdo.
  if (denominator <= 0) {
    return {
      monthlyDistanceKm,
      fuelCost,
      driverFixedCost,
      directCost,
      suggestedContractValue: 0,
      driverPayment: 0,
      taxAmount: 0,
      marginAmount: 0,
      costPerKm: monthlyDistanceKm > 0 ? directCost / monthlyDistanceKm : 0,
      isViable: false,
      warning:
        "A soma de % motorista + % imposto + % margem é maior ou igual a 100%. Reduza algum percentual — o contrato nunca fecharia a conta assim.",
    };
  }

  const suggestedContractValue = directCost / denominator;
  const driverPayment = driverPct * suggestedContractValue;
  const taxAmount = taxPct * suggestedContractValue;
  const marginAmount = marginPct * suggestedContractValue;
  const costPerKm = monthlyDistanceKm > 0 ? directCost / monthlyDistanceKm : 0;

  return {
    monthlyDistanceKm,
    fuelCost,
    driverFixedCost,
    directCost,
    suggestedContractValue,
    driverPayment,
    taxAmount,
    marginAmount,
    costPerKm,
    isViable: true,
  };
}

/**
 * Estimativa de distância via haversine (linha reta) como fallback quando
 * não há chamada a uma API de rotas real. Multiplica por um fator de
 * correção porque ruas nunca são linha reta — 1.4x é uma aproximação
 * razoável para trajetos urbanos.
 *
 * Para produção: trocar por Google Distance Matrix API ou OSRM, que dão
 * a distância real rodada (a rota do dia deve ser recalculada assim
 * quando a corrida é concluída, não só na calculadora).
 */
const URBAN_ROUTE_FACTOR = 1.4;
const EARTH_RADIUS_KM = 6371;

function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Estima o trajeto do dia: garagem/motorista -> cada funcionária, em
 * ordem, -> empresa -> volta. Aceita um ponto de partida (casa do
 * motorista) opcional; se omitido, começa da primeira funcionária.
 */
export function estimateDailyDistance(
  companyLocation: Coordinates,
  employeeLocations: Coordinates[],
  driverStartLocation?: Coordinates
): number {
  if (employeeLocations.length === 0) return 0;

  const stops = driverStartLocation
    ? [driverStartLocation, ...employeeLocations, companyLocation, driverStartLocation]
    : [...employeeLocations, companyLocation];

  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineKm(stops[i], stops[i + 1]);
  }

  return total * URBAN_ROUTE_FACTOR;
}
