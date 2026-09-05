# Auditoria — Metas por Origem: separação MQL x FMQL

Status: **bloqueado** (pendência documentada, sem alteração de Apps Script nesta PR).
Relacionado: PR #95 (mergeada em `main`) — separou MQL/FMQL em todas as views exceto
Visão do Mês. Esta PR (`fix/metas-origem-mql-fmql`) audita a única pendência que ficou
de fora: a view **Metas por Origem**.

## Regra oficial

- **Visão do Mês**: MQL + F/MQL + FMQL + F MQL → agrupados em `IB` (intencional, não mexer).
- **Todas as demais views** (Painel Geral, Dados Específicos, Comparativo Mensal,
  Forecast, Evolução Mensal, Metas por Origem): MQL e FMQL separados.

## O que já está implementado no frontend (PR #95)

- `lib/sheets.js` → `parsePerformanceOrigem()` preserva `origemRaw` (o valor bruto tal
  como está na coluna `ORIGEM` da aba `PERFORMANCE_ORIGEM`), além do campo `origem`
  (já normalizado pela regra agrupada, `normalizeOrigem()`).
- `pages/index.js` → `MetasOrigemView` agrega por `origemRaw` usando a regra granular
  (`normalizarOrigemGranular()`), não mais pelo campo `origem` já agrupado.

Ou seja: **o frontend já está pronto para separar MQL/FMQL assim que a fonte de dados
fornecer essa distinção.** Não há nenhum código no frontend/repo que force MQL e FMQL
a se juntarem em "IB" nesta view.

## O que não pôde ser verificado (e por quê)

Esta sessão não tem acesso a:

1. **O código do Apps Script** que gera a aba `PERFORMANCE_ORIGEM` — inclusive a
   função `normalizarOrigemPerformance()` citada na tarefa. Esse script é vinculado
   diretamente à planilha MASTER DASHBOARD (Google Sheets → Extensões → Apps Script)
   e **não existe em nenhum arquivo deste repositório git** (confirmado por busca:
   não há `.gs`, `.clasp.json`, `appsscript.json` ou qualquer cópia do script no
   projeto). Não há como abrir ou ler esse código a partir daqui.
2. **Os valores reais das linhas da aba `PERFORMANCE_ORIGEM`** (nem da aba de origem
   dos dados, `METAS_ORIGEM`, citada na tarefa — que também não é lida diretamente
   por este frontend; o único range consultado pelo código é
   `PERFORMANCE_ORIGEM!A1:P5000`, em `lib/sheets.js:82`). Este sandbox não tem
   `GOOGLE_SHEET_ID` / `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` /
   `GOOGLE_API_KEY` configurados (nenhuma dessas variáveis está definida no
   ambiente), então não é possível consultar a Google Sheets API a partir daqui —
   nem para ler a planilha nem para inspecionar o script.

**Portanto: não é possível confirmar, a partir deste ambiente, se `METAS_ORIGEM`
possui linhas separadas para MQL e FMQL, ou apenas uma linha agrupada em "IB".**
Isso não foi inferido — é uma limitação declarada de acesso, conforme pedido.

## Os dois cenários possíveis (a confirmar por quem tem acesso ao Apps Script)

### Cenário A — `METAS_ORIGEM` já tem metas separadas para MQL e FMQL

Se a aba-fonte `METAS_ORIGEM` já tiver linhas distintas com metas próprias para MQL
e para FMQL/F/MQL, o bloqueio está apenas na geração de `PERFORMANCE_ORIGEM`: a
função `normalizarOrigemPerformance()` do Apps Script está agrupando essas linhas em
"IB" antes de escrever na aba `PERFORMANCE_ORIGEM`.

**Ajuste necessário, se este for o caso:**
- Alterar *apenas* a normalização de Origem usada nessa geração específica (dentro de
  `normalizarOrigemPerformance()`, ou equivalente), para que MQL e FMQL/F/MQL/F MQL
  sejam preservados como categorias distintas ao escrever `PERFORMANCE_ORIGEM` —
  igual ao que já foi feito no frontend com `normalizeOrigemGranular()` /
  `normalizarOrigemGranular()` (mesma regra, mesmo conceito, só que no Apps Script).
- Não alterar as regras de RECUPERAÇÃO, INDICAÇÃO ou qualquer outra origem.
- Não alterar REUNIOES_GERAL, DASH, SEMANAS, FORECAST nem o histórico já gravado.
- Assim que a aba `PERFORMANCE_ORIGEM` passar a ter linhas próprias de MQL e FMQL, a
  view Metas por Origem já vai exibi-las separadas automaticamente — o frontend não
  precisa de nenhuma alteração adicional (já lê por `origemRaw`).

### Cenário B — `METAS_ORIGEM` só tem uma meta agrupada ("IB")

Se a fonte de metas nunca teve MQL e FMQL como metas distintas — ou seja, sempre
existiu como uma única meta consolidada de "IB" — então não existe informação
granular para recuperar. Nesse caso:

- **Não há ajuste técnico de frontend ou de Apps Script que resolva isso sem uma
  decisão de negócio primeiro**, porque não existe meta real de MQL nem de FMQL
  separadas — só a meta de IB.
- Dividir essa meta (50/50, por proporção do realizado, etc.) seria inventar dado
  financeiro, o que esta tarefa proíbe explicitamente. Não foi feito.
- **Decisão pendente do usuário/negócio**: definir se a empresa passará a lançar
  metas separadas para MQL e FMQL na aba `METAS_ORIGEM` (ex.: duas linhas por
  empresa/ano/mês, uma para cada origem, cada uma com sua própria meta). Só depois
  disso o Cenário A passa a se aplicar, e o ajuste do Apps Script descrito acima
  passa a fazer sentido.

## Como confirmar (para quem tem acesso à planilha/Apps Script)

1. Abrir a planilha MASTER DASHBOARD → aba `METAS_ORIGEM` → conferir se há linhas
   separadas por origem `MQL` e `FMQL`/`F/MQL`/`F MQL`, ou só `IB`.
2. Abrir Extensões → Apps Script → localizar `normalizarOrigemPerformance()` (ou
   função equivalente usada na geração de `PERFORMANCE_ORIGEM`) e conferir se ela
   agrupa MQL/FMQL em "IB" antes de escrever na aba `PERFORMANCE_ORIGEM`.
3. Com essas duas respostas, aplicar o Cenário A ou manter o Cenário B conforme
   descrito acima.

## Matriz de validação — estado atual (após esta PR)

| View | MQL/FMQL |
|---|---|
| Visão do Mês | agrupados em IB (intencional, correto) |
| Painel Geral | separados (PR #95) |
| Dados Específicos | separados (PR #95) |
| Comparativo Mensal | separados (PR #95) |
| Forecast | separados (já estava correto) |
| Evolução Mensal | separados (já estava correto) |
| Metas por Origem | **bloqueado** — frontend pronto para separar (usa `origemRaw`), mas depende da fonte `PERFORMANCE_ORIGEM`/`METAS_ORIGEM`/Apps Script, não verificável a partir deste ambiente. Ver cenários A e B acima. |
