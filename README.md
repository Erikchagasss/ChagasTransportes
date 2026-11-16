# Fretado App

PWA para gestão de contratos, rotas e corridas de fretado de funcionárias.
Admin vê tudo; motorista vê só o que está vinculado a ele (isolado via RLS
no Supabase — ver `schema_fretado.sql`).

## Setup

### Agenda por entrada/saída e turnos noturnos (migração v12)

Execute `migration_v12.sql` antes de publicar. As viagens são separadas
por rota, data de operação, sentido e horário previsto. Uma rota com
saídas às 16h e 18h passa a ter duas viagens de volta, sem colocar as
passageiras do segundo horário no embarque das 16h.

O painel mistura idas e voltas na ordem cronológica, com a viagem em
andamento no topo e as concluídas ao final. A próxima corrida recebe
destaque; nomes e horários ficam visíveis nos cartões. Falta de horário
fica explícita e aparece depois dos horários conhecidos. Dentro da rota,
entrada/saída tem prioridade; a ordem de embarque do admin desempata
passageiras do mesmo horário. Um grupo de horário é entregue antes da
busca do grupo posterior.

Se a saída for anterior ou igual à entrada, ela pertence ao dia seguinte.
Para uma volta às 06h de hoje, a geração consulta a escala e o dia da rota
do início do turno de ontem. Isso inclui retornos no sábado de turnos
que começaram na sexta. O horário da ida é a entrada na empresa, **não**
uma previsão de busca em casa ou de início da corrida: ainda não há
antecedência/trajeto medido que permita calcular essa partida com precisão.

Viagens antigas não iniciadas de hoje/futuras são substituídas por
viagens organizadas por horário, mantendo os registros anteriores como
cancelados. Viagens já iniciadas, concluídas ou canceladas pelo operador
não são divididas/recriadas. A unicidade passa a ser
`(route_id, trip_date, period, scheduled_slot)`; a função antiga da v11
é substituída na mesma transação. Inclusões de passageiras entram no
horário certo na próxima preparação das viagens, sem replicar em todos
os horários. Testes: `scripts/check-trip-slots.sql` (reverte os dados de
teste) e `node scripts/check-guided-trip.cjs`.

### Área do motorista e viagens do dia (migração v11)

Execute `migration_v11.sql` antes de publicar. A área do motorista tem
apenas **Corridas do dia**, **Minhas rotas** e **Sair**. O cadastro global
de funcionárias e a inclusão/remoção/ordenação de passageiras nas rotas
ficam exclusivamente no admin. As permissões antigas da v7 são revogadas;
o antigo endereço `/driver/employees` redireciona para as viagens do dia.
Nas viagens o motorista continua vendo as próprias passageiras e registrando
chegada, embarque, entrega, ausência, alteração de local e observações.

Ao abrir a página do dia, `ensure_daily_trips` prepara as viagens do
motorista autenticado, usando a data de Brasília, os dias da rota e a
escala de cada passageira. Cron e botão do admin usam a mesma função.
A geração é atômica, usa bloqueio por rota/dia e não duplica registros.
Corridas ainda planejadas que ficaram sem paradas são reparadas sem
reescrever tickets existentes. Viagens iniciadas/concluídas/canceladas
não são recriadas. Rotas sem passageiras escaladas não geram viagem vazia.

O motorista não escolhe outro motorista nem uma data arbitrária para
geração, não cria corridas avulsas diretamente e só lê cadastros vinculados
às próprias rotas/viagens. Falhas de geração ou consulta aparecem como erro,
nunca como confirmação de que não há viagens. Contas admin abrem `/admin`;
para testar a experiência do motorista é necessário entrar com a conta dele.

Validação de banco (com reversão): `scripts/check-driver-access.sql`.

### Precisão dos pontos (migração v10)

Execute `migration_v10.sql` antes de publicar esta versão. Coordenadas
anteriores ficam preservadas, mas exigem conferência. A navegação usa
coordenadas numéricas da funcionária/empresa quando o endereço do ticket
corresponde ao cadastro. Pontos residenciais pendentes de revisão não são
usados para navegação ou conclusão do cálculo de km. Um endereço alterado
no ticket não herda a coordenada do endereço antigo.

O geocodificador pede até cinco resultados e valida cidade, estado quando
informado, rua, número, CEP quando disponível e qualidade da correspondência.
Não aceita centro de rua/cidade, aproximação, interpolação ou múltiplos
pontos conflitantes como localização precisa. O fato de o provedor não
confirmar um número não prova que o endereço esteja errado: pode faltar
cobertura de numeração no mapa. Não há troca automática por outro provedor.

Em Funcionárias/Contratos, **Conferir ponto** permite colar um par explícito
de latitude/longitude e conferir no Google Maps. O GPS do aparelho exige
ação do usuário, captura nova em alta precisão e estimativa de erro até
25 m; deve ser usado fisicamente no local correto. O ponto só é salvo
após confirmação. Alterar endereço invalida a coordenada anterior.

Distância e valor sugerido do contrato ficam pendentes enquanto houver
funcionárias ativas sem ponto conferido, preservando o valor mensal acordado.
Auditoria privada: `node scripts/audit-geocoding.cjs`; `--apply` altera
somente correspondências precisas. Usa endereços residenciais na LocationIQ:
requer autorização do responsável. Backups em `.location-audit/` são privados
e ignorados pelo Git. Teste: `node scripts/check-geocode.cjs`.

### Rota guiada do motorista (migração v9)

Execute `migration_v9.sql` depois da v8 **antes de publicar** esta versão.
A tela da viagem agora destaca a próxima parada e avança conforme os
registros salvos. Não inicia rastreamento GPS nem estima chegada ao vivo.

- Na ida, cada busca tem **Cheguei no local** e **Funcionária embarcou**.
  Depois das buscas, passageiras com o mesmo destino são entregues juntas.
  Um destino alterado gera uma entrega separada.
- Na volta, passageiras no mesmo local de busca aparecem juntas, com
  confirmação individual de embarque/ausência. As entregas são casa a casa.
- A chegada (`arrived_at` / `dropoff_arrived_at`) é separada do embarque
  e desembarque. Datas anteriores ficam vazias, sem horários inventados.
- Google Maps e Waze abrem a navegação para o endereço da parada atual.
  Mudanças salvas de local atualizam a sequência e os próximos atalhos.
- Ausência pede confirmação e aceita motivo. Observações e locais podem
  ser editados na sequência; a edição deve ser salva/cancelada antes de
  avançar. Só a confirmação gravada no banco avança a parada.
- O progresso distingue embarcadas, entregues e ausentes. A finalização
  continua validada pela API e pelo banco.

A aba de tickets no Excel inclui quatro novas colunas de chegada:
busca/entrega da ida e busca/entrega da volta, além dos horários já existentes.
Teste da sequência: `node scripts/check-guided-trip.cjs`.

### Salários fixos e atividade por motorista (migração v8)

Execute `migration_v8.sql` depois da v7 antes de publicar esta versão.
Em **Salários e km**, o administrador seleciona o mês e cadastra o salário
fixo mensal de cada motorista. O valor vigora desde aquele mês até o
próximo reajuste; cadastrar um reajuste em dezembro preserva outubro e
novembro. Corrigir uma vigência já cadastrada altera o valor daquela
vigência e dos meses seguintes até o próximo reajuste.

O painel mostra salário mensal integral, corridas concluídas, dias com
corridas, km registrados e custo salarial por km. Não há comissão,
adicional por km, rateio por faltas/dias, encargos ou processamento de
pagamento bancário. Salário não cadastrado aparece como pendência,
nunca como zero. Apenas administradores podem ler ou alterar salários;
o motorista não tem acesso à tabela de remuneração.

Km são calculados por rota, não medidos por GPS/hodômetro. Corridas
antigas ficam identificadas como método desconhecido. Nas novas corridas,
a origem do cálculo fica salva; se faltarem coordenadas ou se os locais
do ticket divergirem dos endereços geocodificados, a distância fica
ausente, em vez de registrar um valor enganoso. O custo salarial por km
fica indisponível quando há distâncias ausentes ou total de km zero.
No mês em andamento, os indicadores de atividade são parciais.

Validação: `node scripts/check-driver-payroll.cjs`, `npx tsc --noEmit`
e `npm run build`. Verifique a interface com conta admin e a negativa
de acesso à tabela de salários com conta de motorista. A FK de salários
usa `on delete restrict` para preservar histórico ao tentar apagar um
perfil de motorista que já tem salários cadastrados.

### Tickets de entrada e saída (migração v7)

Depois das migrações anteriores, execute `migration_v7.sql` no SQL Editor
do Supabase. Não reaplique o schema completo em banco existente. Em banco
novo, execute o schema e depois a v7. Publique esta versão do app somente
após a migração.

- O motorista acessa **Funcionárias** para cadastrar nome, telefone,
  endereço e escala, editar ou desativar sem apagar o histórico.
- Em **Minhas rotas**, adiciona/remove funcionárias das suas rotas.
  A composição atualiza corridas ainda não iniciadas, respeitando a escala;
  corridas iniciadas e concluídas preservam a lista de tickets.
- Inicia a corrida, confirma a busca e depois a entrega de cada pessoa.
  Os horários reais são capturados no momento da confirmação. Ausências
  são registradas separadamente. Locais e observações têm botão próprio
  de salvar e só podem ser alterados pelo motorista durante a corrida.
- O banco bloqueia conclusão com passageiras pendentes ou sem desembarque.
- **Relatórios → Exportar Excel** inclui a aba **Tickets de transporte**:
  uma linha por data, rota e funcionária, entrada/saída previstas, quatro
  horários reais, locais, observações, identificação de tickets e motoristas.
  Há filtros, cabeçalho fixo e cores alternadas. O PDF continua sendo o
  resumo financeiro de corridas.

Tickets guardam uma cópia do nome, telefone, turno e endereços para que
edições posteriores no cadastro não reescrevam o histórico. Para registros
anteriores à v7, a migração usa os dados disponíveis hoje; não cria horários
de entrega retroativos. A planilha não calcula tarifas por passageira:
os valores do exemplo não foram assumidos como preços do contrato.

Validação local: `npx tsc --noEmit` e
`node scripts/check-transport-report.cjs`. Valide também no Supabase com
duas contas de motorista: isolamento entre contratos, cadastro e rota,
ida/volta, ausência, alteração de local, observação, conclusão incompleta
e exportação. O teste local do Excel não substitui a validação das policies
e triggers no banco.

1. Crie um projeto em supabase.com
2. Rode o `schema_fretado.sql` (SQL Editor do Supabase)
3. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key
   do seu projeto (Project Settings → API)
4. `npm install`
5. `npm run dev`

## Primeiro acesso (criar o admin)

O Supabase Auth cria o usuário, mas o `role` fica em `public.profiles`.
Esse primeiro acesso — só ele — ainda precisa de um passo manual, porque
é preciso ter pelo menos um admin logado pra criar os motoristas pelo
painel.

Depois de criar seu usuário (Authentication → Users → Add user), rode:

```bash
node scripts/create-admin.js SEU_USER_ID_AQUI "Seu Nome"
```

(`SEU_USER_ID_AQUI` é o UID que aparece na tela de Authentication →
Users, ao lado do e-mail que você criou.)

Esse script usa a **service role key**, que ignora RLS por completo —
funciona mesmo que o SQL Editor do seu projeto Supabase não deixe rodar
`ALTER TABLE ... DISABLE ROW LEVEL SECURITY` (comum em projetos mais
novos, que retornam `must be owner of table`). Só rode `npm install`
antes, se ainda não rodou (o script usa `dotenv` e `@supabase/supabase-js`,
já estão no `package.json`).

Motoristas, a partir daqui, são cadastrados direto pelo painel em
"Motoristas" — ver seção abaixo.

## Repreço automático

Quando uma funcionária muda de endereço, é adicionada ou é desativada num
contrato, um gatilho no Postgres (seção 11 do `schema_fretado.sql`)
recalcula a distância diária estimada e o valor sugerido do contrato,
usando a mesma fórmula da calculadora. Se a diferença passar de 5%, o
contrato fica marcado com `needs_price_review = true` e aparece um alerta
em `/admin` e `/admin/contracts`, com botão para aplicar o novo valor
direto.

**Isso só funciona com endereços geocodificados** (ver "Geocoding" abaixo).

**Se seu banco já existe** (você já rodou o schema alguma vez), nunca
rode o `schema_fretado.sql` completo de novo — ele assume banco vazio e
vai dar erro de "already exists" nas tabelas/tipos. Use os arquivos de
migração (`migration_v2.sql`, `migration_v3.sql`, ...) que forem sendo
adicionados — cada um só aplica o que mudou desde a versão anterior, e
são seguros rodar mais de uma vez.

## Notificações push (tempo real pro admin)

Toda vez que um motorista dá baixa numa passageira (embarque) ou conclui a
corrida, o admin recebe uma notificação push — funciona até com o app
fechado, porque é Web Push nativo do navegador (não depende do Firebase).

Setup:

1. As chaves VAPID já vêm geradas no `.env.example` — copie pro seu
   `.env.local` (ou gere as suas com `npx web-push generate-vapid-keys`).
2. Pegue a **service role key** em Project Settings → API no Supabase e
   coloque em `SUPABASE_SERVICE_ROLE_KEY`. Essa chave ignora RLS —
   só é usada em rotas server-side (`app/api/**`), nunca no client.
3. No painel admin, clique em "Ativar notificações" na barra lateral
   (pede permissão do navegador). Só quem tem `role = 'admin'` consegue
   se inscrever — a policy de `push_subscriptions` garante isso.
4. Rode `schema_fretado.sql` atualizado (seção 12) se já tiver rodado a
   versão anterior — só precisa da tabela nova, não quebra nada existente.

Em produção (Vercel), configure as mesmas variáveis de ambiente no
dashboard do projeto.

## Geocoding e distância real de rota (LocationIQ)

Contratos e funcionárias são geocodificados automaticamente pela
**LocationIQ Geocoding API** assim que você salva o endereço (criação
ou edição). Isso é o que alimenta o repreço automático (seção acima) e
o cálculo de distância nas corridas.

Ao concluir uma corrida, o sistema também tenta calcular a distância
real rodada (ruas de verdade, na ordem de embarque) via **LocationIQ
Directions API** (roteamento sobre dados OpenStreetMap/OSRM). Se a API
falhar ou não estiver configurada, cai automaticamente na estimativa
por linha reta (não trava a conclusão da corrida). O campo
`distance_source` retornado pela rota (`directions_api` ou
`straight_line_estimate`) mostra qual método foi usado.

Setup:

1. Crie uma conta grátis em [locationiq.com/register](https://locationiq.com/register)
   — **não pede cartão de crédito**. Pegue o token em "Access Tokens" no
   painel.
2. Coloque em `LOCATIONIQ_API_KEY` no `.env.local`.
3. Se um endereço não for localizado (erro de digitação, endereço
   incompleto), aparece um aviso "⚠ Endereço não localizado" no card,
   com botão pra tentar de novo depois de corrigir.

O plano grátis dá **5.000 requisições/dia**, cobrindo geocoding e rotas
no mesmo token — de sobra pro volume de uma operação de fretado (só
geocodifica quando endereço muda, só calcula rota quando corrida é
concluída). Sem essa chave, o app funciona normalmente — só que
endereços ficam sem `lat/lng`, e o repreço automático e o cálculo de
distância real ficam inativos até você configurar.

## Aviso de segurança (Next.js)

O `package.json` já está fixado em `next@15.5.21`, a versão LTS de
manutenção mais recente da série 15 — corrige o RCE crítico
(CVE-2025-66478) e as vulnerabilidades subsequentes de dezembro/2025
(CVE-2025-55183/55184/67779). **Não rebaixe essa versão.**

Um `npm audit` ainda acusa avisos de alta severidade em `postcss` e
`sharp`, dependências internas do próprio Next.js — só se resolvem
migrando pra Next 16 (mudança maior, com breaking changes). Como são
ferramentas de build/otimização de imagem, não pontos que recebem input
direto de usuário, o risco pra este app é baixo; migrar pra Next 16 é
um passo futuro razoável, não urgente.

## Rotas e geração automática de corridas

Fecha o ciclo admin → motorista:

1. Em **Rotas**, crie uma rota vinculada a um contrato e um motorista,
   marque os dias da semana em que ela roda, e monte a ordem de embarque
   das passageiras (setas ↑↓ pra reordenar).
2. Todo dia, o sistema verifica quais rotas ativas rodam naquele dia da
   semana e gera a `trip` (corrida) + `trip_stops` (passageiras daquele
   dia) automaticamente — é o que faz aparecer no portal do motorista.
3. **Dois jeitos de disparar a geração:**
   - **Automático**: `vercel.json` já tem um cron configurado pra rodar
     todo dia às 9h UTC (6h em Brasília — o Brasil não tem mais horário
     de verão, então o offset é fixo -3). Funciona só se o projeto
     estiver hospedado na Vercel; se preferir, dá pra apontar o mesmo
     endpoint (`/api/trips/generate-today`) num workflow do n8n com
     schedule trigger, já que você tem n8n conectado.
   - **Manual**: botão "Gerar corridas de hoje" no dashboard do admin,
     pra rodar na hora sem esperar o cron (ou reprocessar se mudou algo
     de última hora).
4. A rota é **idempotente**: rodar duas vezes no mesmo dia não duplica
   corrida (constraint `unique(route_id, trip_date)` no banco).

Se estiver usando o cron da Vercel, configure `CRON_SECRET` nas env vars
do projeto — a Vercel manda esse valor automaticamente no header
`Authorization` das chamadas agendadas, e o endpoint valida contra ele.

## Escala de trabalho por funcionária

Cada funcionária tem uma escala própria, independente da rota:

- **Dias fixos** (padrão) — marca quais dias da semana ela trabalha
  (ex: seg-sex). Funcionárias diferentes na mesma rota podem ter dias
  diferentes.
- **12x36** — em vez de dias da semana, você marca uma **data de
  referência** (um dia em que ela trabalhou). A partir daí, o sistema
  alterna trabalha/folga a cada dia sozinho — não precisa recalcular
  manualmente toda semana.
- **Horário do turno** (início/fim) — guardado pra referência, aparece
  no cadastro da funcionária.

A geração automática de corridas (`/api/trips/generate-today`) usa essa
escala pra decidir quem entra na corrida de cada dia — mesmo que duas
funcionárias estejam na mesma rota, só a que está escalada pra aquele
dia específico aparece na corrida do motorista. Se ninguém da rota
estiver escalado num dia, a corrida nem é criada.

**Fallback de segurança**: se uma funcionária de escala 12x36 não tiver
a data de referência preenchida ainda, o sistema assume que ela
trabalha todo dia — pra não sumir ninguém da rota silenciosamente por
falta de configuração. Preencha a data assim que possível.

## Empresa de destino (terceirização)

Cobre o caso onde quem paga o contrato não é o local de trabalho —
comum em terceirização. Exemplo: a contratante é a "Casa Tempero", mas
as funcionárias trabalham dentro da "Xhara".

No cadastro (ou edição) do contrato, tem uma seção "Empresa de destino"
separada dos dados do contratante:

- Deixe em branco se a contratante já é o local de trabalho (caso mais
  comum) — o app usa o endereço do contratante normalmente.
- Preencha nome + endereço de destino quando forem diferentes — esse
  endereço (geocodificado à parte, com o mesmo botão de "tentar
  novamente" se não localizar) passa a ser usado como destino real em:
  - Cálculo de distância ao concluir a corrida
  - Repreço automático (o gatilho no banco usa o destino, não o
    contratante, pra calcular a rota)
  - Portal do motorista — aparece "Destino: Xhara — endereço" na lista
    de corridas e no topo da tela de embarque, pra ele saber pra onde
    está levando as passageiras

Os dados do contratante (CNPJ, representante, endereço) continuam
sendo os dela mesma — servem pro contrato jurídico e pra cobrança,
independente de onde as funcionárias realmente trabalham.

## Relatórios com exportação

A tela `/admin/reports` agora tem filtro por contrato e período, cards
de resumo (corridas concluídas, km total, combustível total), e dois
botões de exportação:

- **Excel** (`exceljs`) — planilha com cabeçalho, linha de totais
- **PDF** (`jspdf` + `jspdf-autotable`) — tabela formatada com contrato/
  período no cabeçalho e linha de totais no rodapé

Ambos geram o arquivo no navegador (client-side), sem precisar de rota
de API dedicada.

## Cadastro de motorista pelo painel (sem abrir o Supabase)

Em **Motoristas**, o botão "Novo motorista" cria o usuário direto —
Auth + perfil — via uma rota server-side com a service role key
(`app/api/admin/drivers/route.ts`). Você preenche nome, e-mail e uma
senha inicial (ou clica em "Gerar outra" pra sortear uma), e o
motorista já consegue logar na hora. A senha só aparece uma vez na
tela — anote ou copie pra mandar pra ele antes de sair da página.

Cada motorista também tem "Editar" (nome/telefone) e "Resetar senha"
(gera uma nova, novamente visível só uma vez — útil se ele esquecer a
senha). Remover motorista também é pelo painel — apaga o usuário do
Auth, o que derruba o perfil junto (`on delete cascade`).

## Múltiplos motoristas por contrato

Contratos grandes normalmente precisam de mais de um motorista pra dar
conta da operação toda. No cadastro/edição do contrato, o campo de
motorista virou uma lista de checkboxes — marque quantos forem
necessários (ou nenhum, se ainda não definiu). Fica salvo numa tabela
própria (`contract_drivers`, N:N), não mais um campo único no contrato.

Isso não muda como as rotas funcionam: cada rota continua tendo **um**
motorista específico executando ela (em Rotas). A lista no contrato é
o "quem pode atender esse contrato" — você ainda cria uma rota por
motorista/veículo dentro dele.

## Correção importante: cálculo de distância do repreço automático

Se você configurou o repreço automático antes desta versão, **o
cálculo estava errado** e provavelmente mostrou distâncias e alertas de
revisão de valor absurdamente altos (por exemplo, um contrato com
centenas de funcionárias podia aparecer com milhares de km/dia).

**O bug**: a fórmula somava "destino → funcionária → destino" (ida e
volta) **pra cada funcionária separadamente**, em vez de calcular uma
rota só passando por todo mundo. Isso multiplicava o resultado pelo
número de funcionárias.

**A correção**: agora o cálculo usa a rota de verdade — pra cada rota
ativa do contrato, soma a distância sequencial entre as funcionárias
**na ordem de embarque configurada em Rotas**, terminando no destino, e
depois soma entre as rotas do contrato (cada rota é um veículo/motorista
fazendo um trajeto separado). Isso também significa que a **ordem de
embarque em Rotas agora afeta diretamente o valor sugerido** — capriche
nela, não é só cosmético.

Se você já rodou o schema antes desta correção, rode o
`migration_v3.sql` — ele também recalcula todos os contratos existentes
automaticamente no final, corrigindo os números inflados.

## Edição completa de contratos e veículos

**Contratos** (`/admin/contracts`): clique em "Editar" em qualquer
contrato pra alterar nome, CNPJ, representante, endereço, valor mensal,
status (ativo/pausado/encerrado), motorista, veículo vinculado, e todos
os percentuais/custos usados no repreço automático (% motorista, %
imposto, % margem, outros custos fixos, dias úteis/mês). Se o endereço
mudar na edição, regeocodifica sozinho, igual no cadastro de
funcionária.

**Veículos** (`/admin/vehicles`) — tela nova: cadastre e edite placa,
modelo, km/l, preço do combustível e depreciação mensal, e vincule a um
contrato pela edição do contrato. Sem veículo vinculado, o cálculo de
combustível nas corridas e o repreço automático ficam inativos pra
aquele contrato — antes dessa tela existir, não tinha como configurar
isso pelo painel.

## Logo do contratante

No cadastro (ou edição) de um contrato, dá pra subir a logo da empresa
contratante. Ela fica salva no Supabase Storage, bucket público
`contract-logos` (upload restrito a admin via RLS; leitura é pública,
já que é só uma logo de empresa, não dado sensível).

Onde ela aparece:
- Painel admin, ao lado do nome do contrato
- Portal do motorista — lista de corridas do dia e no topo da tela de
  embarque, pra ele saber rapidamente qual contrato tá atendendo
- Relatórios exportados (Excel e PDF) — só quando o filtro é de **um**
  contrato específico (com "todos os contratos" não tem uma marca única
  pra estampar)

Sem logo cadastrada, aparece um círculo com as iniciais do nome da
empresa no lugar — nunca fica quebrado.

## O que ainda falta (próximos passos)

- **Ícones do PWA**: `public/icons/icon-192.png`, `icon-512.png` e as
  versões maskable — gerar a partir do logo do negócio.
- **Modelo jurídico**: o texto em `app/admin/legal/page.tsx`
  (`DEFAULT_TEMPLATE`) é um ponto de partida — preencha os colchetes
  `[NOME DA SUA EMPRESA]`, `[CNPJ]`, forma de pagamento, foro etc. com os
  dados reais, e idealmente peça revisão de um advogado antes de usar com
  clientes.
- **Migrar pra Next 16**: zeraria os últimos avisos de `postcss`/`sharp`
  do `npm audit` (baixo risco hoje, ver seção de segurança acima), mas é
  mudança maior — não é urgente.

## Stack

Next.js 15 (App Router) + Supabase (Auth + Postgres + RLS) + Tailwind CSS.
PWA nativo (manifest + service worker), sem lib de terceiros — funciona
igual em Android e iOS via "Adicionar à tela inicial".
