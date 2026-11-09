"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contract, LegalTemplate, Profile } from "@/types/database";

const DEFAULT_CLIENT_TEMPLATE = `INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE DE FUNCIONÁRIOS (FRETAMENTO)

CONTRATADA: [NOME DA SUA EMPRESA], pessoa jurídica de direito privado, inscrita no CNPJ sob o nº [CNPJ DA SUA EMPRESA], com sede em [ENDEREÇO DA SUA EMPRESA], doravante denominada CONTRATADA.

CONTRATANTE: {{empresa_nome}}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {{empresa_cnpj}}, com sede em {{empresa_endereco}}, neste ato representada por {{empresa_representante}}, doravante denominada CONTRATANTE.

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Transporte de Funcionários, que se regerá pelas cláusulas seguintes:

CLÁUSULA 1ª — DO OBJETO
1.1. O presente contrato tem por objeto a prestação, pela CONTRATADA, de serviços de transporte (fretamento) dos funcionários indicados pela CONTRATANTE, entre suas respectivas residências e o endereço da CONTRATANTE, em veículo próprio da CONTRATADA, conduzido por motorista habilitado.
1.2. A relação de funcionários transportados, seus endereços e horários de embarque poderão ser alterados mediante comunicação prévia da CONTRATANTE à CONTRATADA, com antecedência mínima de 48 (quarenta e oito) horas.

CLÁUSULA 2ª — DO VALOR E FORMA DE PAGAMENTO
2.1. Pela prestação dos serviços, a CONTRATANTE pagará à CONTRATADA o valor mensal de R$ {{valor_mensal}}, a ser quitado até o dia [DIA] de cada mês, mediante [FORMA DE PAGAMENTO — boleto/PIX/transferência].
2.2. O valor poderá ser reajustado anualmente, ou em caso de alteração relevante no número de passageiros, quilometragem ou trajeto, mediante acordo prévio entre as partes.
2.3. O atraso no pagamento sujeitará a CONTRATANTE à multa de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês.

CLÁUSULA 3ª — DA VIGÊNCIA
3.1. O presente contrato vigorará a partir de {{data_inicio}}, por prazo indeterminado, podendo ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias.
3.2. A rescisão imotivada por qualquer das partes, sem observância do aviso prévio, sujeitará a parte infratora ao pagamento de multa equivalente a 1 (uma) mensalidade vigente.

CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA
4.1. Realizar o transporte com pontualidade, segurança e em veículo adequado, devidamente regularizado e com manutenção em dia.
4.2. Manter motorista habilitado, com CNH compatível com a categoria do veículo.
4.3. Comunicar imediatamente à CONTRATANTE eventuais atrasos, panes ou impossibilidade de realização do trajeto.
4.4. Manter seguro de responsabilidade civil e/ou seguro de passageiros vigente durante toda a execução do contrato.

CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATANTE
5.1. Fornecer à CONTRATADA, com antecedência, a relação atualizada de funcionários a serem transportados, contendo nome e endereço completo.
5.2. Efetuar o pagamento nas datas e condições pactuadas.
5.3. Comunicar com antecedência mudanças de endereço, inclusão ou exclusão de passageiros.

CLÁUSULA 6ª — DA RESPONSABILIDADE CIVIL
6.1. A CONTRATADA responde civilmente por danos causados aos passageiros durante a execução do transporte, nos termos da legislação aplicável, ressalvados casos fortuitos, de força maior ou culpa exclusiva de terceiros.

CLÁUSULA 7ª — DA CONFIDENCIALIDADE
7.1. As partes se comprometem a manter sigilo sobre os dados pessoais dos funcionários transportados, utilizando-os exclusivamente para a execução deste contrato, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

CLÁUSULA 8ª — DO FORO
8.1. Fica eleito o foro da comarca de [CIDADE/UF] para dirimir quaisquer dúvidas oriundas do presente contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor.

[CIDADE], {{data_inicio}}.


_________________________________________
CONTRATADA


_________________________________________
CONTRATANTE — {{empresa_nome}}
{{empresa_representante}}`;

const DEFAULT_DRIVER_TEMPLATE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE — MOTORISTA (PESSOA FÍSICA)

CONTRATANTE: [NOME DA SUA EMPRESA], pessoa jurídica de direito privado, inscrita no CNPJ sob o nº [CNPJ DA SUA EMPRESA], com sede em [ENDEREÇO DA SUA EMPRESA], doravante denominada CONTRATANTE.

CONTRATADO: {{motorista_nome}}, portador do CPF nº {{motorista_cpf}}, telefone {{motorista_telefone}}, doravante denominado CONTRATADO, na qualidade de prestador de serviços autônomo.

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Transporte, que se regerá pelas cláusulas seguintes:

CLÁUSULA 1ª — DO OBJETO
1.1. O presente contrato tem por objeto a prestação, pelo CONTRATADO, de serviços de condução de veículo para transporte (fretamento) de passageiros, nas rotas e horários designados pela CONTRATANTE.
1.2. O CONTRATADO prestará os serviços de forma autônoma e eventual, sem subordinação hierárquica, horário fixo de jornada imposto pela CONTRATANTE ou exclusividade, não se caracterizando vínculo empregatício nos termos da Consolidação das Leis do Trabalho (CLT).

CLÁUSULA 2ª — DA HABILITAÇÃO E DOCUMENTAÇÃO
2.1. O CONTRATADO declara possuir Carteira Nacional de Habilitação (CNH) ativa, dentro do prazo de validade e compatível com a categoria do veículo utilizado na prestação dos serviços, comprometendo-se a mantê-la nessas condições durante toda a vigência deste contrato.
2.2. O CONTRATADO obriga-se a comunicar imediatamente à CONTRATANTE qualquer suspensão, cassação, vencimento ou outra irregularidade na CNH, ficando impedido de prestar os serviços enquanto perdurar a irregularidade.
2.3. O veículo utilizado na prestação dos serviços deverá estar com a documentação regular (CRLV em dia, licenciamento quitado), sendo de responsabilidade do CONTRATADO mantê-la assim durante toda a vigência do contrato.

CLÁUSULA 3ª — DOS SEGUROS
3.1. O CONTRATADO obriga-se a manter, durante toda a vigência deste contrato, seguro do veículo (responsabilidade civil facultativa / seguro auto) vigente e em dia, cobrindo danos a terceiros e ao próprio veículo.
3.2. O CONTRATADO obriga-se a manter seguro de Acidentes Pessoais de Passageiros (APP) vigente e em dia, cobrindo os passageiros transportados durante a execução dos serviços.
3.3. A CONTRATANTE poderá solicitar, a qualquer momento, comprovação da vigência da CNH, da documentação do veículo e dos seguros mencionados nesta cláusula, podendo suspender a designação de rotas ao CONTRATADO até a regularização.

CLÁUSULA 4ª — DA REMUNERAÇÃO
4.1. Pela prestação dos serviços, o CONTRATADO receberá o valor de R$ [VALOR COMBINADO] [por mês / por rota / % do contrato — ajustar conforme acordado], a ser pago até o dia [DIA] de cada mês, mediante [FORMA DE PAGAMENTO — PIX/transferência].

CLÁUSULA 5ª — DA VIGÊNCIA E RESCISÃO
5.1. Este contrato vigorará a partir de {{data_inicio}}, por prazo indeterminado, podendo ser rescindido por qualquer das partes mediante aviso prévio de 15 (quinze) dias.
5.2. A CONTRATANTE poderá rescindir o contrato imediatamente, sem aviso prévio, em caso de irregularidade na CNH, na documentação do veículo, ausência de seguro vigente, ou conduta que coloque em risco a segurança dos passageiros.

CLÁUSULA 6ª — DAS OBRIGAÇÕES DO CONTRATADO
6.1. Conduzir o veículo com segurança, pontualidade e respeito às normas de trânsito.
6.2. Comunicar imediatamente à CONTRATANTE eventuais atrasos, panes, acidentes ou impossibilidade de realização do trajeto.
6.3. Tratar os passageiros com urbanidade e zelar por sua segurança durante todo o trajeto.

CLÁUSULA 7ª — DA RESPONSABILIDADE CIVIL
7.1. O CONTRATADO responde civilmente por danos causados a passageiros e terceiros decorrentes de sua conduta na condução do veículo, nos termos da legislação aplicável, ressalvados casos fortuitos, de força maior ou culpa exclusiva de terceiros.

CLÁUSULA 8ª — DA CONFIDENCIALIDADE E LGPD
8.1. O CONTRATADO se compromete a manter sigilo sobre os dados pessoais das funcionárias transportadas, utilizando-os exclusivamente para a execução deste contrato, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

CLÁUSULA 9ª — DO FORO
9.1. Fica eleito o foro da comarca de [CIDADE/UF] para dirimir quaisquer dúvidas oriundas do presente contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor.

[CIDADE], {{data_inicio}}.


_________________________________________
CONTRATANTE


_________________________________________
CONTRATADO — {{motorista_nome}}
CPF: {{motorista_cpf}}`;

function fillClientTemplate(template: string, contract: Contract): string {
  return template
    .replaceAll("{{empresa_nome}}", contract.company_name || "[NOME DA EMPRESA]")
    .replaceAll("{{empresa_cnpj}}", contract.company_cnpj || "[CNPJ]")
    .replaceAll("{{empresa_endereco}}", contract.company_address || "[ENDEREÇO]")
    .replaceAll("{{empresa_representante}}", contract.company_representative || "[REPRESENTANTE]")
    .replaceAll(
      "{{valor_mensal}}",
      contract.monthly_value?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "[VALOR]"
    )
    .replaceAll(
      "{{data_inicio}}",
      contract.started_at
        ? new Date(contract.started_at).toLocaleDateString("pt-BR")
        : "[DATA DE INÍCIO]"
    );
}

function fillDriverTemplate(template: string, driver: Profile): string {
  return template
    .replaceAll("{{motorista_nome}}", driver.full_name || "[NOME DO MOTORISTA]")
    .replaceAll("{{motorista_cpf}}", driver.cpf || "[CPF NÃO CADASTRADO — preencha em Motoristas]")
    .replaceAll("{{motorista_telefone}}", driver.phone || "[TELEFONE]")
    .replaceAll(
      "{{data_inicio}}",
      driver.created_at
        ? new Date(driver.created_at).toLocaleDateString("pt-BR")
        : "[DATA DE INÍCIO]"
    );
}

type Tab = "cliente" | "motorista";

export default function LegalPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("cliente");

  const [clientTemplate, setClientTemplate] = useState<LegalTemplate | null>(null);
  const [clientTemplateText, setClientTemplateText] = useState(DEFAULT_CLIENT_TEMPLATE);
  const [driverTemplate, setDriverTemplate] = useState<LegalTemplate | null>(null);
  const [driverTemplateText, setDriverTemplateText] = useState(DEFAULT_DRIVER_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: clientTplData } = await supabase
      .from("legal_templates")
      .select("*")
      .eq("name", "contrato_padrao")
      .maybeSingle();
    if (clientTplData) {
      setClientTemplate(clientTplData as LegalTemplate);
      setClientTemplateText((clientTplData as LegalTemplate).content);
    }

    const { data: driverTplData } = await supabase
      .from("legal_templates")
      .select("*")
      .eq("name", "contrato_motorista")
      .maybeSingle();
    if (driverTplData) {
      setDriverTemplate(driverTplData as LegalTemplate);
      setDriverTemplateText((driverTplData as LegalTemplate).content);
    }

    const { data: contractsData } = await supabase
      .from("contracts")
      .select("*")
      .order("company_name");
    setContracts(contractsData ?? []);
    if (contractsData && contractsData.length > 0) setSelectedContractId(contractsData[0].id);

    const { data: driversData } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "driver")
      .order("full_name");
    setDrivers(driversData ?? []);
    if (driversData && driversData.length > 0) setSelectedDriverId(driversData[0].id);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setGenerated(null);
  }, [tab]);

  async function saveTemplate() {
    setSavingTemplate(true);
    const isClient = tab === "cliente";
    const existing = isClient ? clientTemplate : driverTemplate;
    const text = isClient ? clientTemplateText : driverTemplateText;
    const name = isClient ? "contrato_padrao" : "contrato_motorista";

    if (existing) {
      await supabase
        .from("legal_templates")
        .update({ content: text, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("legal_templates").insert({ name, content: text });
    }
    setSavingTemplate(false);
    load();
  }

  function generateContract() {
    if (tab === "cliente") {
      const contract = contracts.find((c) => c.id === selectedContractId);
      if (!contract) return;
      setGenerated(fillClientTemplate(clientTemplateText, contract));
    } else {
      const driver = drivers.find((d) => d.id === selectedDriverId);
      if (!driver) return;
      setGenerated(fillDriverTemplate(driverTemplateText, driver));
    }
  }

  function downloadGenerated() {
    if (!generated) return;
    const label =
      tab === "cliente"
        ? contracts.find((c) => c.id === selectedContractId)?.company_name
        : drivers.find((d) => d.id === selectedDriverId)?.full_name;
    const blob = new Blob([generated], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contrato_${(label ?? "gerado").replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const templateText = tab === "cliente" ? clientTemplateText : driverTemplateText;
  const setTemplateText = tab === "cliente" ? setClientTemplateText : setDriverTemplateText;

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="mb-2 text-2xl text-graphite-900">Jurídico</h1>
      <p className="mb-6 max-w-2xl text-sm text-graphite-600">
        Estes são modelos de partida pra agilizar a rotina — não é aconselhamento
        jurídico. Vale revisar com um advogado antes de usar em produção, e
        completar os campos entre colchetes com os dados da sua empresa.
      </p>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab("cliente")}
          className={`rounded-card px-4 py-2 text-sm font-medium ${
            tab === "cliente" ? "bg-graphite-950 text-white" : "border border-graphite-200 text-graphite-700"
          }`}
        >
          Contrato com cliente
        </button>
        <button
          onClick={() => setTab("motorista")}
          className={`rounded-card px-4 py-2 text-sm font-medium ${
            tab === "motorista"
              ? "bg-graphite-950 text-white"
              : "border border-graphite-200 text-graphite-700"
          }`}
        >
          Contrato com motorista
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-graphite-600">
            Contrato modelo
          </h2>
          <textarea
            value={templateText}
            onChange={(e) => setTemplateText(e.target.value)}
            rows={22}
            className="w-full rounded-card border border-graphite-200 bg-white p-4 font-mono text-xs leading-relaxed"
          />
          <button
            onClick={saveTemplate}
            disabled={savingTemplate}
            className="mt-3 rounded-card bg-graphite-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingTemplate ? "Salvando..." : "Salvar modelo"}
          </button>
          {tab === "cliente" ? (
            <p className="mt-2 text-xs text-graphite-600">
              Placeholders disponíveis: <code>{"{{empresa_nome}}"}</code>,{" "}
              <code>{"{{empresa_cnpj}}"}</code>, <code>{"{{empresa_endereco}}"}</code>,{" "}
              <code>{"{{empresa_representante}}"}</code>, <code>{"{{valor_mensal}}"}</code>,{" "}
              <code>{"{{data_inicio}}"}</code>. Preenchidos com os dados do contrato
              selecionado ao lado.
            </p>
          ) : (
            <p className="mt-2 text-xs text-graphite-600">
              Placeholders disponíveis: <code>{"{{motorista_nome}}"}</code>,{" "}
              <code>{"{{motorista_cpf}}"}</code>, <code>{"{{motorista_telefone}}"}</code>,{" "}
              <code>{"{{data_inicio}}"}</code>. Preenchidos com os dados do motorista
              selecionado ao lado — cadastre o CPF em &quot;Motoristas&quot; se ainda
              não tiver.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-graphite-600">
            {tab === "cliente" ? "Gerar contrato para um contratante" : "Gerar contrato para um motorista"}
          </h2>

          {tab === "cliente" ? (
            <div className="mb-3 flex gap-3">
              <select
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                className="flex-1 rounded-card border border-graphite-200 px-4 py-2"
              >
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
              <button
                onClick={generateContract}
                className="rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-graphite-950"
              >
                Gerar
              </button>
            </div>
          ) : (
            <div className="mb-3 flex gap-3">
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="flex-1 rounded-card border border-graphite-200 px-4 py-2"
              >
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                    {!d.cpf ? " (sem CPF cadastrado)" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={generateContract}
                className="rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-graphite-950"
              >
                Gerar
              </button>
            </div>
          )}

          {tab === "cliente" && contracts.length === 0 && (
            <p className="text-sm text-graphite-600">
              Cadastre um contrato em &quot;Contratos&quot; primeiro — inclua CNPJ e
              representante para o contrato ficar completo.
            </p>
          )}
          {tab === "motorista" && drivers.length === 0 && (
            <p className="text-sm text-graphite-600">
              Cadastre um motorista em &quot;Motoristas&quot; primeiro.
            </p>
          )}

          {generated && (
            <div className="rounded-card border border-graphite-200 bg-white p-4">
              <pre className="max-h-[500px] overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {generated}
              </pre>
              <button
                onClick={downloadGenerated}
                className="mt-3 rounded-card border border-graphite-200 px-4 py-2 text-sm font-medium text-graphite-700 hover:border-amber-500"
              >
                Baixar .txt
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
