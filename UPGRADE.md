# Runtime JS Upgrade Report (Spec v0.2 + Runner Go)

## Escopo e referência
- Spec analisada: `~/spec/README.md` + `~/spec/duckflux.schema.json` (v0.2, março/2026).
- Runner de referência: `~/runner` (README, `docs/HISTORY.md`, `schema/duckflux.schema.json` e código em `internal/`).
- Runtime auditado: `~/runtime-js`.

## Resumo executivo
O `runtime-js` está funcional para um subconjunto legado (próximo de v0.1), mas **não está atualizado para a spec v0.2** nem em **paridade comportamental com o runner Go**. Os gaps principais estão em: schema/DSL, `wait`, `emit`, `mcp`, inline participants, variáveis de runtime CEL, `cwd`/CLI, validação de inputs e semântica de execução.

---

## 1) DSL / Schema não atualizado

### 1.1 Schema ainda em v0.1 (não v0.2)
- `runtime-js/src/parser/schema/duckflux.schema.json` usa `$id` v0.1 e exige `participants`.
- A spec/runner v0.2 usa `$id` v0.2 e exige apenas `flow`.
- Impacto: workflows válidos na v0.2 (ex.: somente inline participants) são rejeitados no JS.

### 1.2 Campos e constructs v0.2 ausentes no schema JS
Não suportados no schema JS, mas presentes em spec/runner:
- `id` no topo do workflow.
- `defaults.cwd`.
- `wait` (`event`, `match`, `until`, `poll`, `timeout`, `onTimeout`).
- `loop.as`.
- `inlineParticipant` em `flow`.
- `emit` (`event`, `payload`, `ack`).
- nome reservado `event`.
- duração com sufixo `d` (ex.: `1d`).

### 1.3 Tipos de participante desatualizados
- JS schema/model ainda inclui legado (`hook`, `agent`, `human`) e não está alinhado com schema/runner Go (exec/http/mcp/workflow/emit).
- JS aceita `command/cmd` em `exec`, enquanto a spec atual usa `run`.

---

## 2) Parser e validação semântica com cobertura parcial

### 2.1 Reservados incompletos
- `validate.ts` não bloqueia `event` como nome reservado.

### 2.2 Validação CEL incompleta
- Valida alguns pontos (`if.condition`, `loop.until`, `override.when/input`), mas não cobre de forma equivalente ao runner Go:
- CEL de `loop.max` quando é expressão.
- CEL de `wait.*` (porque `wait` nem existe no parser/engine JS).
- validações ligadas a `emit.payload`.
- validações de inline participants.

### 2.3 Regras semânticas v0.2 ausentes
- Não valida semântica de `wait`.
- Não valida semântica de inline participant (`as` obrigatório, conflitos de nome etc.).
- Não valida `onTimeout` (wait) para redirect válido.

---

## 3) Engine / controle de fluxo divergente

### 3.1 `wait` não implementado
- `engine/control.ts` só trata `loop`, `parallel`, `if`.
- Sem suporte a sleep/poll/event wait.

### 3.2 Inline participant não implementado
- Step objeto com múltiplas chaves (`as`, `type`, ...) cai como erro de override inválido em `engine/sequential.ts`.

### 3.3 `loop.as` (alias de contexto) não implementado
- Não há rewrite de alias para `loop.*`.

### 3.4 `loop.max` CEL expression não executada
- O código assume valor numérico direto; string/CEL não é resolvida.

### 3.5 Verificação booleana de CEL não estrita
- `if`, `when`, `loop.until` usam coerção via `Boolean(...)`.
- Runner Go falha explicitamente quando expressão não retorna `bool`.

### 3.6 Paralelismo sem cancelamento cooperativo
- JS usa `Promise.all` sem cancelar branches restantes ao primeiro erro (runner Go cancela contexto compartilhado).

### 3.7 Semântica de fallback (`onError: <participant>`) divergente
- JS sobrescreve o resultado do step original com o resultado do fallback.
- Runner Go mantém step original como `failed` e executa fallback separadamente.

---

## 4) Participantes: lacunas de implementação

### 4.1 `emit` ausente
- Não existe executor `emit` no runtime JS.
- Na referência Go, `emit` existe (stub funcional com publicação interna de evento).

### 4.2 `mcp` ausente
- Em JS, `mcp` retorna “not yet implemented”.
- Na referência Go, há implementação baseline determinística.

### 4.3 `http` sem resolução dinâmica CEL
- JS não avalia CEL em `url/method/headers/body`.
- Runner Go resolve dinamicamente e mantém fallback literal quando não for CEL válido.

### 4.4 `exec.cwd` sem precedência v0.2
- JS usa apenas `participant.cwd ?? process.cwd()`.
- Faltam: `defaults.cwd`, `--cwd` do CLI, resolução relativa, CEL em `cwd`, e registro do `cwd` efetivo no step result.

---

## 5) Contexto CEL e variáveis de runtime incompletos

### 5.1 Variáveis globais faltando
Não disponíveis no JS (ou incompletas):
- `workflow.*`
- `execution.*` (id, number, startedAt, status, context, cwd)
- `now`
- `event`
- `output` (como conceito de saída final)

### 5.2 Variáveis de step incompletas
- JS expõe basicamente `step.output` e `step.status`.
- Faltam `startedAt`, `finishedAt`, `duration`, `retries`, `error`, `cwd`.
- Status usa `completed/failed/skipped` em vez de `success/failure/skipped`.

### 5.3 Contexto de loop incompleto
- JS expõe só `loop.index`.
- Faltam `iteration`, `first`, `last`.

### 5.4 Sem precompile/cache CEL de workflow
- Runner Go precompila e cacheia programas CEL.
- JS reparseia expressões em runtime sem estratégia equivalente.

---

## 6) Inputs/Outputs: diferenças relevantes

### 6.1 Validação de inputs simplificada demais
`validate_inputs.ts` não cobre paridade com runner/spec para:
- coerção de tipos de `--input` string para integer/number/boolean,
- `format` (`date`, `date-time`, `uri`, `email`),
- `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `items`.

### 6.2 Saída padrão do workflow incorreta
- Se `workflow.output` não for definido, JS retorna `undefined`.
- Spec/runner: saída padrão é o output do último step executado.

### 6.3 `output` com `schema + map` não implementado no runtime
- O schema aceita variação, mas o runtime JS não executa/valida esse formato corretamente.

### 6.4 Avaliação de output com fallback literal indevido
- Em `state.resolveOutput`, erros de CEL viram literal silenciosamente.
- Runner Go trata como erro de compilação/execução de expressão.

---

## 7) CLI sem paridade com o runner Go

### 7.1 Sem `version` command
- JS CLI não implementa `duckflux version`.

### 7.2 Sem `--cwd`
- JS CLI não oferece `--cwd` em `run`.

### 7.3 Prioridade de inputs incorreta
- JS merge atual em `run/validate`: `input-file` sobrescreve `--input`.
- Esperado (spec/runner): `--input` > `--input-file` > stdin.

### 7.4 `quiet`/`verbose` sem efeito real
- Flags existem no parse inicial, mas não há pipeline de logging equivalente.

### 7.5 Formato de saída do `run` divergente
- JS imprime objeto completo `WorkflowResult`.
- Runner Go imprime a saída resolvida do workflow.

---

## 8) Testes também estão desatualizados para v0.2

### 8.1 Cobertura faltante
Não há testes de paridade para:
- `wait` (sleep/poll/event/onTimeout),
- `emit`,
- inline participants,
- `loop.as`,
- `cwd` precedence e `--cwd`,
- variáveis CEL (`workflow`, `execution`, `event`, `now`),
- erro em expressão não booleana,
- validação completa de input constraints.

### 8.2 Testes reforçam comportamento legado
- Testes assumem `participants` obrigatório.
- Testes usam `agent`/`command`/`when` em definição de participante (padrão antigo).

---

## 9) Itens “legado” no runtime-js que precisam decisão

Funcionalidades presentes no JS, mas fora da linha atual do runner/schema v0.2:
- `hook` no model/schema.
- `human` implementado localmente (não no runner Go).
- aceitação de `command/cmd` em `exec`.

Recomendação: definir política explícita de compatibilidade retroativa. Sem essa decisão, o runtime JS continuará híbrido entre v0.1 e v0.2.

---

## Backlog alinhado às 9 frentes (com dependências)

1. **B1 — DSL/Schema v0.2 (Seção 1)**  
   Entregas: atualizar `duckflux.schema.json` no JS para v0.2, ajustar tipos TS do model e remover incompatibilidades de estrutura.  
   Depende de: nenhum.  
   Desbloqueia: B2, B3, B4, B5, B6, B7, B8.

2. **B2 — Parser/Semântica v0.2 (Seção 2)**  
   Entregas: validações semânticas faltantes (`event` reservado, `wait`, inline, CEL pendente, redirects).  
   Depende de: B1.  
   Desbloqueia: B3, B4, B5, B6, B8.

3. **B3 — Engine de controle de fluxo (Seção 3)**  
   Entregas: `wait`, inline participant, `loop.as`, `loop.max` CEL, bool estrito em expressões de controle, comportamento de fallback e paralelismo alinhado ao runner Go.  
   Depende de: B1, B2.  
   Desbloqueia: B4, B5, B6, B8.

4. **B4 — Participantes (Seção 4)**  
   Entregas: `emit`, `mcp` baseline, resolução CEL em `http`, cadeia completa de `cwd` no `exec`.  
   Depende de: B1, B2, B3.  
   Desbloqueia: B7, B8.

5. **B5 — Contexto CEL e variáveis de runtime (Seção 5)**  
   Entregas: `workflow`, `execution`, `event`, `now`, loop completo, metadados de step e alinhamento de status.  
   Depende de: B1, B2, B3.  
   Desbloqueia: B6, B8.

6. **B6 — Inputs/Outputs (Seção 6)**  
   Entregas: coerção e constraints de input, output padrão do último step, suporte correto a `output schema+map`, sem fallback literal indevido.  
   Depende de: B1, B2, B5.  
   Desbloqueia: B7, B8.

7. **B7 — CLI parity (Seção 7)**  
   Entregas: `version`, `--cwd`, precedência correta de inputs, `quiet/verbose`, formato de saída alinhado ao runner Go.  
   Depende de: B4, B6.  
   Desbloqueia: B8.

8. **B8 — Testes de aceitação v0.2 (Seção 8)**  
   Entregas: suíte de integração/paridade cobrindo B1-B7 e remoção de expectativas legadas.  
   Depende de: B1, B2, B3, B4, B5, B6, B7.  
   Desbloqueia: release de paridade.

9. **B9 — Decisão de compatibilidade legado (Seção 9)**  
   Entregas: decisão explícita sobre `hook`, `human`, `agent`, `command/cmd` (remover, manter como compat, ou feature flag).  
   Depende de: nenhum (deve começar cedo).  
   Impacta: B1, B4, B8 (define escopo e critérios de aceitação).
