# Ficha E3-ed1 — editor de famílias sobre o contrato novo (store, histórico, resolução, painéis)

Base: branch `feat/familias-interface` (com E1, E2, E3 e E4 integradas).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O editor (em `apps/web/src/ui/familia/`) nasceu como protótipo com um modelo local provisório (`expressao.ts`, `familiaModelo.ts`, `resolver.ts`, `familiaStore.ts`). Agora existe o contrato definitivo:
- `@hestia/model`: `Familia`, `validarFamilia`, `HistoricoFamilia`, `FAMILIA_ARMARIO`, e as operações de edição (`escreverCampo`, `lerCampo`, `CAMPOS_PECA`, `renomearParametro`, `adicionarParametro`, `excluirParametro`, `promoverParaParametro`, `adicionarTipo`, `duplicarTipo`, `excluirTipo`, `definirValorDeTipo`, `duplicarPeca`, `excluirPeca`, `espelharPecaEmX`, `arranjoLinear`…);
- `@hestia/engine`: `resolverFamilia(familia, { tipoId, valores })` → `{ pecas (METROS), erros, env (mm) }`, `resumirPecas`.
Sua tarefa é migrar o editor para eles e APAGAR o modelo provisório. Veja o protótipo rodando em `docs/proposta_editor_familias.html` (referência visual) e leia TODOS os arquivos atuais de `apps/web/src/ui/familia/` antes de começar. Aceite objetivo: `acoes.test.ts` e `familiaStore.test.ts` (já escritos, vermelhos).

## Faça
1. **`acoes.ts`**: implemente as 5 funções (especificação em comentário; aceite `acoes.test.ts`).
2. **`familiaStore.ts`** (reescreva) com a API exata que `familiaStore.test.ts` usa:
   - campos: `aberta`, `historico: HistoricoFamilia<Familia>`, `versao` (sobe a cada mudança do histórico, inclusive desfazer/refazer/novaFamilia; use `historico.assinar`), `tipoId: string | null`, `valores: Record<string, Valor>` (flex; fora do histórico), `sel: string | null`, `vista: '3d'|'frente'|'lateral'|'planta'`, `explodir: number` (0..1), `portas: boolean`, `detalhe: 'grosso'|'medio'|'fino'`, `opacidade: number` (1), `corte: { ativo: boolean; eixo: 'x'|'y'|'z'; posicao: number }` (padrão `{ ativo: false, eixo: 'y', posicao: 0.3 }`), `dialogo: null | 'parametros' | 'tipos' | 'pecas' | 'novo'`, `ferramenta: string | null`;
   - ações: `abrir`, `ocultar`, `familia()` (= `historico.atual`), `executar(rotulo, receita: (rascunho: Familia) => string | null): string | null` (a receita devolve `null` ou o motivo; com motivo NADA muda e o motivo é devolvido; exceção propaga sem rastro), `agrupar(rotulo, fn)`, `desfazer()`, `refazer()`, `setValor(id, v)`, `limparValor(id)`, `escolherTipo(id)` (ignora id inexistente; zera `valores`), `selecionarPeca(id | null)`, `novaFamilia(f)` (novo `HistoricoFamilia`, `tipoId = f.tipoPadrao ?? primeiro tipo ?? null`, zera `valores` e `sel`), `set(patch)`;
   - depois de QUALQUER mudança (executar, desfazer, refazer), se `sel` não existe mais em `familia().pecas`, vira `null`;
   - exporte `resolucaoCorrente()`: `resolverFamilia(familia(), { tipoId, valores })` memoizada por (`versao`, `tipoId`, `valores`): a mesma referência enquanto nada mudar;
   - estado inicial: `novaFamilia(structuredClone(FAMILIA_ARMARIO))`, `aberta` falso.
3. **Apague** `expressao.ts`, `familiaModelo.ts`, `resolver.ts` e `familia.test.ts` (o que eles testavam agora está em `@hestia/model` e `@hestia/engine`).
4. **Painéis e vistas sobre o contrato novo** (mantenha o visual atual):
   - Navegador da família: parâmetros (contagem real), planos de referência (da família), peças (cada uma com `×n` resolvidas, "oculta (condição)" se zero, `!` vermelho se houver erro com `onde` começando por `peca:<id>.`), ferragens (da família), tipos (clique troca o tipo). Peça selecionada destacada; clicar seleciona;
   - Flexionar GERADO por `controlesDeFlex(familia())` agrupado por `agruparParametros`: slider/número/select/check/texto conforme o controle; o valor mostrado é `valorEfetivo`; alterar chama `setValor`; um botão "↺" por controle chama `limparValor`; use `lerEntrada` nos campos de texto/número;
   - Validação: lista (no máximo 6 + "+N") de `validarFamilia(familia())` (erros em vermelho, avisos em laranja) e dos `erros` de `resolucaoCorrente()`; sem nada, "Sem problemas: N peças";
   - Propriedades da peça: para a peça selecionada, os 8 campos de `CAMPOS_PECA` (rótulos: Origem X, Origem Y, Origem Z, Tamanho a, Tamanho b, Espessura, Repetir (n), Existe se) editáveis; cada edição chama `executar('Editar <campo>', (f) => escreverCampo(f, id, campo, texto))`; campo cuja fórmula não compila fica com borda vermelha e a mensagem do `compilar`; abaixo, a medida resolvida da peça em mm (multiplique os metros por 1000);
   - Vistas Frente, Lateral e Planta (SVG) passam a ler `PecaResolvida` em METROS (converta para mm só nos rótulos de cota); a vista 3D continua o SVG oblíquo atual por enquanto, num componente à parte `Familia3D.tsx` (props: `pecas`, `sel`, `onSel`, `explodir`, `portas`, `detalhe`) que outra ficha vai trocar por three.js — deixe o contrato dele estável;
   - Lista de peças (diálogo): colunas atuais lendo `PecaResolvida` (em mm), resumo por `resumirPecas`;
   - Diálogos de Parâmetros e Tipos: por enquanto SOMENTE LEITURA, gerados de `familia().parametros` e `familia().tipos` (outra ficha os torna editáveis).
5. **Desfazer/refazer**: botões Desfazer e Refazer na faixa do editor (painel "Editor de família"), desabilitados quando não há passo, com o rótulo no tooltip (`historico.rotuloDesfazer`); atalhos Ctrl+Z, Ctrl+Y e Ctrl+Shift+Z enquanto o editor está aberto e o foco NÃO está num campo de texto. Esses atalhos não podem acionar o desfazer do projeto (hoje o `App.tsx` já ignora teclas com a aba da família aberta; confirme).
6. Mantenha o `FamilyEditor.tsx`, a faixa e o CSS funcionando como hoje; só ajuste o necessário. Nenhum arquivo passa de 420 linhas (divida em componentes novos).
7. Tudo que formata medida precisa de `// units-ok: <motivo>` na linha ou na anterior (o portão `scripts/check-units.mjs` reprova `toFixed`, `m²`, etc.); rode `node scripts/check-units.mjs`.

## Arquivos permitidos
Tudo em `apps/web/src/ui/familia/` (incluindo novos arquivos e a exclusão dos três provisórios e de `familia.test.ts`), mais `apps/web/src/ui/ribbon/actions.ts` e `apps/web/src/App.tsx` SOMENTE se for indispensável (relate).

## Proibido
`acoes.test.ts` e `familiaStore.test.ts` (aceite), `packages/**`, `crates/**`, `docs/**`.

## Aceite (o orquestrador roda)
`npx vitest run apps/web/src/ui/familia` verde, `npx vitest run apps/web` verde, `tsc`, `eslint --max-warnings 0` nos arquivos, `node scripts/check-units.mjs`, `check-boundaries`. Depois o orquestrador abre o app, clica em Componente e confere: abre com o armário A80; flexionar atualiza as vistas; editar uma fórmula da peça atualiza e Ctrl+Z desfaz; fórmula quebrada fica vermelha sem derrubar.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
