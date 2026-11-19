# Plano de delegação: componentes e editor de famílias (ADR 0049)

Rascunho de 2026-11-02. Complementa `docs/decisoes/0049-componentes-e-editor-de-familias.md` e `docs/proposta_editor_familias.html`.
Valem as `docs/handoff/regras-gerais.md` (worktree próprio, `tsc` + `eslint` + `vitest` + `check-boundaries`, commits em português, nada de dado da máquina) e as regras do dono: nunca push na main, nunca mexer em `Hestia\Hestia`, só `opencode-go/deepseek-v4.1-flash` (nunca o pro).

## 1. Papéis

| Papel | Quem | Faz | Não faz |
|---|---|---|---|
| Orquestrador e fiscal | Claude (esta sessão) | escreve a ficha, escreve ou aprova os testes de aceite, lança o executor, roda os portões, revisa o diff, decide aceitar, devolver ou assumir | escrever código extenso; mudar contrato sem avisar o dono |
| Executor | `opencode-go/deepseek-v4.1-flash` | implementa **uma ficha** num worktree próprio e faz commits | decidir nome de API pública, esquema, formato de arquivo; tocar arquivos fora da lista; instalar dependência |
| Dono | você | aprova ADR e questões em aberto, valida telas, mescla na main | — |

## 2. Ciclo de uma tarefa (sempre igual)

1. **Ficha** (modelo na seção 4) em `docs/handoff/componentes/fichas/<id>.md`, escrita por mim. Contém o que fazer, os arquivos permitidos, as assinaturas exatas e os testes de aceite.
2. **Worktree novo** a partir da main (ou da branch da fase anterior já aprovada): `git worktree add ..\wt\comp-<id> -b feat/comp-<id> <base>`.
3. **Lançar** o executor no worktree:
   ```
   opencode run -m opencode-go/deepseek-v4.1-flash --dir ..\wt\comp-<id> \
     -f docs/handoff/regras-gerais.md -f docs/handoff/componentes/fichas/<id>.md \
     "Execute a ficha anexa. Siga as regras gerais. Termine com os comandos de verificação e um relatório."
   ```
   (Flags conferidas com `opencode run --help`, versão 1.19.5: `-m`, `--dir`, `-f`.) Nada de `--auto` sem eu ter lido as permissões da ficha.
4. **Portões que eu mesmo rodo** (o relatório do executor não conta): `npx tsc -p tsconfig.json --noEmit`, `npx eslint <pacotes>`, `npx vitest run <pacotes> --testTimeout=120000 --maxWorkers=4` em segundo plano e lendo o resumo final, `node scripts/check-boundaries.mjs`.
5. **Revisão do diff** pela lista da seção 3. Resultado: **aceito**, **devolvido** (uma volta, com a lista exata de falhas) ou **assumido** por mim ou por modelo mais forte.
6. **Registro**: atualizo `docs/handoff/componentes/ESTADO.md` (ficha, branch, commit, resultado dos portões, pendências). Só então a próxima ficha começa.
7. **Merge**: quem decide é o dono (e a sessão de integração). Eu não mesclo na main.

## 3. Roteiro de revisão (o que "como eu faria" significa)

- **Escopo**: só arquivos da lista; nenhum arquivo novo fora do caminho previsto; `index.ts` do pacote só ganhou a linha de export pedida.
- **Contrato**: assinaturas idênticas às da ficha (nomes, tipos, ordem dos parâmetros); nada de campo obrigatório novo em tipos existentes (opcionais, com padrão por leitura); `SCHEMA_VERSION` só muda na ficha F3.
- **Pureza**: o que é núcleo numérico (`packages/engine/src/componentes/`) não importa React nem three.js; entradas e saídas são números ou arrays, sem `Map` nem texto na fronteira.
- **Rust**: nenhum arquivo em `crates/`, nenhum `.wasm`, nenhum `cena-v*.json`; nada que leia `resolveLevel`, `wallZ` ou camadas.
- **Testes**: cada função nova tem teste ao lado; os testes de aceite da ficha existem **e falham sem a implementação** (confiro rodando antes); não foram afrouxados nem apagados; propriedades pedidas estão presentes.
- **Qualidade**: máximo de 420 linhas por arquivo, português nos textos e comentários, sem `console.log`, sem dependência nova, sem código morto.
- **Interface**: reutiliza `Group`/`Row`/`NumField`/`Check` de `fields.tsx` e os docks; uma linha na faixa por ferramenta nova; textos conferem com o protótipo aprovado.
- **Dados do dono**: nenhum projeto real nem caminho da máquina no repositório.

## 4. Modelo de ficha

```md
# Ficha <id> — <título>
Base: <branch e commit>   Worktree: ..\wt\comp-<id>   Modelo: opencode-go/deepseek-v4.1-flash
Contexto (3 linhas): <o que existe e por quê>
Faça: 1. … 2. … (passos curtos, verificáveis)
Arquivos permitidos: <lista exata>   Proibido: <lista exata, inclui crates/, resolve.ts, wallZ.ts, cena-v*.json>
Assinaturas exatas: <código TypeScript copiado, não descrito>
Teste de aceite (já escrito em <arquivo>): <o que prova que está certo>
Propriedades: <invariantes a testar>
Critérios de parada: se precisar mudar algo fora da lista, PARE e relate; não improvise.
Entrega: commits pequenos; relatório com arquivos, comandos e resultado; o que ficou de fora.
```

## 5. O que vai para o flash e o que não vai

| Ficha | Conteúdo | Vai para o flash? |
|---|---|---|
| F1 | tipos de `component.ts`, **parser e avaliador de expressões** | **Não**: eu escrevo ou um modelo forte; o flash só escreve os testes de tabela a partir da gramática |
| F2 | `resolverComponente` com peças-caixa | **Não**: contrato das peças resolvidas é a fronteira do Rust |
| F3 | elemento `component`, comandos, migração 23 → 24 | desenho dos comandos comigo; **edição de cada `switch`** no flash, com lista de pontos (busca por `isGeneric`) |
| F4 | render 3D/planta/seleção | contorno e instanciamento comigo ou Sonnet; registro de categoria e seleção no flash |
| F5 | ferramenta Colocar | linha da faixa, `PlacementProperties` e textos no flash; lógica de encaixe revisada de perto |
| I0 a I6 | telas do protótipo (ver `proposta_editor_familias.html`, aba 9) | **Sim**, na ordem do protótipo, cada uma com o protótipo anexo como referência visual |
| F6 | catálogo base de 10 famílias | **Sim**, a partir de tabela de parâmetros e peças que eu escrevo; validador automático da família decide |
| F7 | editor completo | telas no flash (I1 a I4); integração e desfazer comigo |
| F8 | marcenaria (chapas, fitas, usinagens, assistente) | fórmulas do módulo-base comigo; telas e cadastros no flash |
| F9 | lista de peças e CSV | **Sim**, com testes de soma que eu escrevo |
| F10 | plano de corte | **Não** no flash |
| F12 | seções do esquema Rust | **Não** no flash; só a branch dona do `.wasm` |

Se o flash falhar duas vezes na mesma ficha, a ficha sobe de nível (Sonnet médio) em vez de ganhar uma terceira volta.

## 6. Exemplo de ficha: I0, dados da faixa do editor

```md
# Ficha I0 — Aba "Editor de família" e contextual "Colocar Componente"
Contexto: a faixa é guiada por dados (apps/web/src/ui/ribbon/model.ts:56-59). Ferramenta nova = uma linha (docs/decisoes/0032 §Faixa).
Faça:
1. Em apps/web/src/ui/ribbon/tabsMain.ts:17 troque `soon(t('Componente','Component'),'component')` por `tool('component')`.
2. Acrescente `'component'` ao `ToolId` (packages/tools/src/registry.ts:42) e um `case 'component'` em `createTool` (registry.ts:52) que devolva `new ComponentTool(env)` (stub: `start/stop/pointerMove` vazios).
3. Crie `apps/web/src/ui/ribbon/tabsFamilia.ts` com a aba "Editor de família" nos painéis do protótipo (Peças de chapa, Forma livre, Ferragens, Usinagem, Referência, Propriedades, Testar, Editor de família). Itens ainda sem ação usam `soon(...)`.
Arquivos permitidos: os três acima, e testes ao lado.
Proibido: packages/engine, packages/model, crates/, qualquer .wasm.
Teste de aceite (escrito por mim): a lista da faixa contém `component` como tool; nenhum item `soon` com nome repetido no painel; a aba tem 8 painéis na ordem do protótipo.
Critério de parada: se `ToolId` for usado num `switch` exaustivo que quebre, PARE e relate o arquivo.
```

## 7. Como saber que "saiu como eu faria"

1. O aceite é executável, não opinião: testes que eu escrevi falham antes e passam depois.
2. Eu repito os portões; o relatório do executor é só um índice.
3. Comparo o resultado de telas com o protótipo (captura lado a lado, mesmo tema claro e escuro).
4. Para núcleo numérico, qualquer divergência de 1 µm ou 1e-6 m²/m³ é defeito, nunca afrouxo o teste.
5. `docs/handoff/componentes/ESTADO.md` guarda o que cada ficha entregou, para outra sessão (ou outro computador) retomar sem depender desta conversa.
