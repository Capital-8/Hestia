# Plano de correção i18n — Hestia (PT-BR / EN)

> Base: 12 relatórios de mapeamento em `reports/i18n/` (01 a 12) + `MAPA-CONSOLIDADO.md`.
> Nenhum arquivo de código foi alterado nesta fase.

---

## 1. Diagnóstico em números

| Métrica | Valor |
|---|---:|
| Ocorrências únicas mapeadas | **3.949** |
| P0 (fluxo principal, visível no 1º uso) | **597** |
| P1 (diálogos secundários, mensagens, a11y) | **2.728** |
| P2 (casos raros, formatação, dívida) | **624** |
| Arquivos afetados | **438** |
| Chaves existentes no dicionário | 313 (51 sem nenhum consumidor) |
| Ternários PT/EN inline | 126 em 17 arquivos |
| Vocabulários paralelos de tradução | 4 (`I18N`, `Txt` do ribbon, tuplas do menu de contexto, dados PT de `packages/tools`) |
| Formatadores numéricos concorrentes | 3 (`fmtNum`, `formatQuantity`, `.toFixed().replace(...)`) |

Distribuição por módulo:

| Módulo | Total | P0 | P1 | P2 |
|---|---:|---:|---:|---:|
| `apps/web/src/ui` | 2.651 | 479 | 1.756 | 416 |
| `packages/engine` | 369 | 0 | 318 | 51 |
| `apps/web/src/editor` | 334 | 15 | 260 | 59 |
| `packages/tools` | 237 | 42 | 185 | 10 |
| `packages/model` | 113 | 22 | 81 | 10 |
| `packages/io` | 100 | 0 | 94 | 6 |
| `packages/render` | 71 | 38 | 20 | 13 |
| `packages/geom` | 69 | 0 | 11 | 58 |
| shell (`App`, `main`, `index.html`) | 3 | 1 | 2 | 0 |

---

## 2. Por que hoje fica metade PT e metade EN

O motor de i18n **funciona** (zustand + `I18N.pt/en` + re-render imediato). O problema é de **cobertura e de onde o texto mora**:

1. **Quatro vocabulários paralelos.** `I18N` (313 chaves), `Txt {pt,en}` do ribbon (245 literais), tuplas do menu de contexto (43) e `TOOL_LABEL`/`TOOL_GROUPS` PT-only em `packages/tools`. Nada garante que cubram o mesmo texto.
2. **Texto renderizado guardado no store.** `useUi.status` e `store.undoLabel` guardam **frases PT prontas**, não chave+parâmetros. Trocar o idioma não reescreve a barra de status nem o "Desfazer: …".
3. **Texto fora do React.** Hints das ferramentas em `packages/tools`, carimbo de prancha e rótulos de cota em `packages/render`, cabeçalhos de CSV em `packages/engine`, camadas DXF e nomes IFC em `packages/io` — nenhum recebe `lang`.
4. **Constantes de módulo.** `LOCATION_LABEL`, `graphicsLabels`, `CUBE_ZONES`, `SNAP`, `PERIMETER_*`, `FIELD_*`, `THRESHOLD_KINDS` etc. são avaliadas uma vez; mesmo que fossem traduzidas no lugar, não reagiriam à troca.
5. **Formatação sem idioma.** Vírgula decimal fixa (`fields.tsx:8`, `RampProperties.tsx:17`, `NivelCotaEditor.tsx:109`), datas `toLocaleDateString('pt-BR')`, collation `localeCompare(..., 'pt-BR')` e `<html lang="pt-BR">` estático.

---

## 3. Arquitetura-alvo (mínima, sem reescrever o app)

### 3.1 Dicionário por área + tipo único
```
apps/web/src/editor/i18n/
  index.ts        # mantém exports atuais: useI18n, I18N, toolLabel, fmtNum, nomeComandoLang
  tipos.ts        # type Lang, type Dict = typeof PT
  common.ts       # PT/EN comuns (botões, unidades, status)
  shell.ts        # ribbon, titlebar, statusbar, menus
  props.ts        # propriedades, campos, enums
  dialogs.ts      # diálogos gerais + tipos
  stair.ts        # escada/rampa (stt_* / ramp_*)
  schedules.ts    # tabelas e colunas
  canvas.ts       # canvas, cotas, pranchas, navegador
  exports.ts      # DXF/IFC/PDF/CSV/carimbo
```
- `const EN: Dict = { ... }` → **paridade vira erro de compilação**, não só teste.
- `i18n.ts` atual é dividido, mas **reexporta** `I18N` para não quebrar os 46 consumidores existentes.
- Cada área nova tem seu próprio arquivo → **zero conflito de merge** entre subagentes.

### 3.2 API única
```ts
t(lang, 'props.wall.height')                 // fora do React
const { t, lang } = useT();                  // no React (assina zustand)
t('status.walls_created', { n: 3 })          // interpolação/plural
```
- Fallback: chave ausente em EN → PT + `console.warn` em dev; nunca `undefined` nem id cru.
- Reaproveita as 313 chaves atuais e elimina as 51 órfãs (a UI passa a consumi-las).

### 3.3 Estado guarda chave, não texto
- `status: { key, args }` e `undoLabel: { key, args }`; `StatusBar`/`TitleBar` traduzem no render.
- Resolve a classe inteira "congelou no idioma antigo" (inclui `App.tsx:245`, `state.ts:337`).
- Helper `mensagem(key, args)` para os ~275 pontos da camada `editor`.

### 3.4 Um único formatador
- `fmtNum(v, dec, lang)` como API de UI.
- `formatQuantity` recebe `lang` (ou deriva `decimalSymbol` do idioma quando o projeto não sobrescreveu).
- `fmtDate(lang)`, `cmpTexto(a, b, lang)`.
- Remove `.toFixed().replace('.', ',')` espalhado.

### 3.5 Sincronização de documento
- Efeito único: `document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'` e `document.title = viewTitle(...)`.
- Validação na hidratação: `safeGet('hestia.lang')` só aceita `'pt' | 'en'`.

### 3.6 Guarda de regressão (o mais importante)
- `scripts/check-i18n.mjs` + `i18n.cobertura.test.ts`:
  - varre `apps/web/src/**/*.tsx` e falha em texto PT hardcoded em JSX/`title`/`aria-label`/`placeholder`;
  - varre `packages/*/src` para mensagens conhecidas;
  - allowlist versionada para dados do usuário e siglas;
  - valida toda chave referenciada por template (`tool_*`, `col_*`, `sched_*`, `roof_shape_*`).
- Sem isso, a 4ª fonte de tradução volta a aparecer na próxima feature.

---

## 4. Execução em ondas paralelas

Regras de ouro para não haver conflito:
- **1 arquivo pertence a 1 subagente por onda.** Ninguém edita arquivo de outro.
- Dicionário: cada agente edita **somente** o arquivo da sua área (`i18n/<area>.ts`), nunca o `index.ts`.
- Nenhum agente roda `npm install`, formata o repo inteiro ou mexe em `package.json`.
- Todo agente entrega: código + `npm run typecheck` do pacote + lista de testes ajustados.

### Onda 0 — Fundação (bloqueante, 2 agentes)
| Agente | Entrega |
|---|---|
| **F0-A** | Estrutura `i18n/`, `Dict`/`EN` tipado, `t()`, `useT()`, fallback+params, split do dicionário, reexports |
| **F0-B** | `statusKey/undoKey` no store + `StatusBar`/`TitleBar`, sync `<html lang>`/`title`, `fmtNum/fmtDate/cmpTexto`, validação de `Lang`, guarda `check-i18n` + teste de cobertura |

Aceite: app compila, testes atuais passam (ajustados só onde o contrato mudou), trocar idioma atualiza barra de status e título da aba.

### Onda 1 — P0 (3–4 agentes, ~600 ocorrências)
| Agente | Arquivos |
|---|---|
| **P0-1** | `Properties.tsx`, `AnnotationProps.tsx`, `PlacementProperties.tsx`, `RoomProperties.tsx` |
| **P0-2** | `OptionsBar.tsx` + `ui/perimeter/**` + `StatusBar`/`SnapButton`/`OrthoButton` |
| **P0-3** | `ViewportCanvas`, `ViewportOverlays`, `SectionCanvas`, `PlanLabels`, `ui/dims/**`, `ui/sheet/**`, `ui/browser/**` |
| **P0-4** | `ribbon/**`, `Ribbon`, `TitleBar`, `ViewTabs`, `Tutorial`, diálogos P0 (DXF, CAD, Units, níveis) |

Aceite: em EN, os fluxos "abrir → desenhar parede → inserir porta → ver propriedades → exportar" ficam 100% EN, com screenshot e2e.

### Onda 2 — P1 da UI (8 agentes, ~1.900 ocorrências)
Divididos por diretório/arquivo, ~250 ocorrências cada:
1. `ui/dialogs/*TypeDialog` + previews + cotas
2. `ui/dialogs` gerais (DXF/CAD/pranchas/unidades/atalhos)
3. `ui/dialogs/openingType/**`
4. `ui/*Properties` restantes + `fields` + `TypeSelector`/`TypeRow`
5. `ui/ribbon` restante + `FileMenu` + `InfoCenter` + `NavBar`
6. `ui/canvas` restante + `ViewCube` + `schematic`
7. `ui/sheet/**` + `ui/browser/**` restantes
8. `editor/**` (status, erros, contexto, nomes padrão)

### Onda 3 — Pacotes + P2 (6 agentes, ~1.400 ocorrências)
1. `packages/tools`: hints/`ToolEnv.lang`, `TOOL_GROUPS`, `PERFIL_NOMES`, `nomeComando`
2. `packages/model`: nomes padrão, enums, unidades, famílias de cota
3. `packages/render`: carimbo, rótulos de canvas, `SNAP_TOOLTIPS`, `SOBE`
4. `packages/io`: 33 camadas DXF, nomes IFC, metadados PDF, mensagens de import/export
5. `packages/engine`: 124 cabeçalhos de CSV, mensagens, `Total`, collation
6. UI P2 restante + `graphicsLabels`/`ViewCube`/arias

### Onda 4 — Verificação (3 agentes, em paralelo)
| Agente | Entrega |
|---|---|
| **V1** | `typecheck` + `lint` + `test:rapido`; corrige regressões |
| **V2** | e2e EN: abre app, troca idioma, percorre 12 telas, screenshots; valida `<html lang>`/`title` |
| **V3** | amostras de exportação em EN: DXF (camadas), IFC (nomes), CSV (cabeçalhos), PDF (carimbo) |

---

## 5. Critérios de aceite

1. `npm run typecheck` e `npm run lint` verdes.
2. `npm run test:rapido` verde (testes de texto PT ajustados para fixar `lang='pt'` quando necessário).
3. `node scripts/check-i18n.mjs` → **0 ocorrências** fora da allowlist.
4. E2E em EN sem nenhum texto PT visível nas 12 telas principais (screenshot anexado).
5. Exportações em EN: DXF, IFC, CSV e PDF com textos no idioma ativo.
6. Trocar PT↔EN em tempo real atualiza **tudo**, inclusive barra de status, título da aba, tooltips e diálogos já abertos.
7. Nenhum dado do usuário é traduzido (nomes de ambiente, material, tipo criado à mão).

---

## 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Conflito de merge entre agentes | ownership rígido + dicionário por área + revisão final |
| Testes que comparam texto PT exato (~40 asserções mapeadas) | fixar `lang='pt'` no setup; atualizar apenas os que testam o contrato novo |
| Regressão silenciosa em validações que comparam prefixo de status (`startsWith('Distância inválida')`) | trocar por código de erro (`status.code`) antes de traduzir esses pontos |
| `packages/render`/`io` sem `lang` | threading explícito a partir das entradas (render, export, import) — sem estado global |
| Documentos existentes com nomes PT | não renomear dados; localizar apenas **criação nova** |
| Build publicado (`site/app`) desatualizado | rebuild no final e publicação só após aprovação |

---

## 7. Estimativa

- Onda 0: 2 rodadas (~1–1,5 h)
- Onda 1 (P0): 1 rodada (~1 h) → **EN já utilizável nos fluxos principais**
- Onda 2 (P1 UI): 1 rodada (~1,5 h)
- Onda 3 (pacotes/P2): 1 rodada (~1,5 h)
- Onda 4 (verificação): 1 rodada (~1 h)

**Total: ~5–7 h de execução paralela**, com entrega utilizável já após a Onda 1.
Comparativo: feito por 1 agente sequencial, seriam ~40–60 h.

---

## 8. Decisões que preciso de você antes de executar

1. **Exportações** (DXF/IFC/PDF/CSV): traduzir conforme o idioma ativo **ou** manter PT (padrão de mercado BR)?
2. **Nomes padrão do documento** ("Nível 1", "Vista 3D", "Pavimento 2"): criar no idioma ativo **ou** manter PT sempre?
3. **Onde executar**: worktree/branch dedicada `feat/i18n-completo` (recomendado, não mexe nos 4 arquivos não commitados) **ou** direto na branch atual?
4. **Entrega**: tudo de uma vez **ou** staged (P0 primeiro para você validar, depois o resto)?
