"use client";

import { useMemo, useState } from "react";
import { calculateContract, type CalculatorInput } from "@/lib/calculator";

const DEFAULT_INPUT: CalculatorInput = {
  dailyDistanceKm: 40,
  workDaysPerMonth: 22,
  kmPerLiter: 10,
  fuelPrice: 6.0,
  driverPct: 0.3,
  driverCount: 1,
  driverMonthlySalary: 0,
  monthlyDepreciation: 400,
  taxPct: 0.06,
  otherFixedCosts: 150,
  marginPct: 0.15,
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Field({
  label,
  suffix,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-graphite-600">{label}</span>
      <div className="flex items-center overflow-hidden rounded-card border border-graphite-200 bg-white focus-within:border-amber-500">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-4 py-3 outline-none"
        />
        {suffix && <span className="pr-4 text-sm text-graphite-600">{suffix}</span>}
      </div>
    </label>
  );
}

export default function CalculatorPage() {
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_INPUT);

  const result = useMemo(() => calculateContract(input), [input]);

  function update<K extends keyof CalculatorInput>(key: K, value: number) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl text-graphite-900">Calculadora de novo contrato</h1>
      <p className="mb-8 text-sm text-graphite-600">
        Preencha os dados operacionais. O valor sugerido já embute o repasse do
        motorista, o imposto e sua margem — não precisa somar depois.
      </p>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-graphite-600">
            Operação
          </h2>
          <Field
            label="Distância diária total (ida + volta + paradas)"
            suffix="km/dia"
            value={input.dailyDistanceKm}
            onChange={(v) => update("dailyDistanceKm", v)}
          />
          <Field
            label="Dias úteis por mês"
            value={input.workDaysPerMonth}
            onChange={(v) => update("workDaysPerMonth", v)}
          />
          <Field
            label="Consumo do veículo"
            suffix="km/l"
            value={input.kmPerLiter}
            onChange={(v) => update("kmPerLiter", v)}
            step={0.1}
          />
          <Field
            label="Preço do combustível"
            suffix="R$/l"
            value={input.fuelPrice}
            onChange={(v) => update("fuelPrice", v)}
            step={0.01}
          />

          <h2 className="pt-2 text-sm font-medium uppercase tracking-wide text-graphite-600">
            Custos fixos
          </h2>
          <Field
            label="Quantos motoristas essa operação precisa"
            value={input.driverCount}
            onChange={(v) => update("driverCount", v)}
          />
          <Field
            label="Salário fixo por motorista (deixe 0 se for só % de comissão)"
            suffix="R$/mês"
            value={input.driverMonthlySalary}
            onChange={(v) => update("driverMonthlySalary", v)}
          />
          <Field
            label="Depreciação mensal do veículo"
            suffix="R$/mês"
            value={input.monthlyDepreciation}
            onChange={(v) => update("monthlyDepreciation", v)}
          />
          <Field
            label="Outros custos fixos (seguro, manutenção, IPVA)"
            suffix="R$/mês"
            value={input.otherFixedCosts}
            onChange={(v) => update("otherFixedCosts", v)}
          />

          <h2 className="pt-2 text-sm font-medium uppercase tracking-wide text-graphite-600">
            Percentuais sobre o contrato
          </h2>
          <Field
            label="Repasse do motorista (comissão — deixe 0 se pagar só salário fixo acima)"
            suffix="%"
            value={input.driverPct * 100}
            onChange={(v) => update("driverPct", v / 100)}
          />
          <Field
            label="Imposto"
            suffix="%"
            value={input.taxPct * 100}
            onChange={(v) => update("taxPct", v / 100)}
          />
          <Field
            label="Margem de lucro desejada"
            suffix="%"
            value={input.marginPct * 100}
            onChange={(v) => update("marginPct", v / 100)}
          />
        </div>

        <div className="h-fit rounded-card border border-graphite-200 bg-graphite-950 p-6 text-white md:sticky md:top-8">
          <p className="text-sm text-graphite-600">Valor sugerido do contrato</p>

          {result.isViable ? (
            <>
              <p className="mb-6 text-4xl font-display font-semibold text-amber-500">
                {formatBRL(result.suggestedContractValue)}
                <span className="text-base font-body text-graphite-600">/mês</span>
              </p>

              <dl className="space-y-3 text-sm">
                <Row label="Distância mensal" value={`${result.monthlyDistanceKm.toFixed(0)} km`} />
                <Row label="Custo combustível" value={formatBRL(result.fuelCost)} />
                {result.driverFixedCost > 0 && (
                  <Row label="Salário fixo motorista(s)" value={formatBRL(result.driverFixedCost)} />
                )}
                <Row label="Custo direto total" value={formatBRL(result.directCost)} />
                <Row label="Repasse motorista (comissão)" value={formatBRL(result.driverPayment)} />
                <Row label="Imposto" value={formatBRL(result.taxAmount)} />
                <Row label="Margem" value={formatBRL(result.marginAmount)} />
                <Row label="Custo por km" value={formatBRL(result.costPerKm)} />
              </dl>
            </>
          ) : (
            <p className="mt-4 text-sm text-danger-500">{result.warning}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-graphite-800 pb-2">
      <dt className="text-graphite-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
