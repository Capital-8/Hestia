# Estado da implementação das famílias paramétricas (ADR 0061)

**Atualize este arquivo a CADA ficha integrada e faça commit + push junto.** É o ponto de retomada: uma sessão nova lê este arquivo, `EXECUCAO.md` e `CONTRATO.md` e continua da primeira ficha pendente da menor onda.

Branch de integração: `claude/lucid-euler-ddb7j6` (push só nela). Situação em 2026-11-24: **contrato de tipos no código (somente tipos, tsc/eslint/boundaries/units e 344 testes de família verdes), ADR, contrato de semântica, 51 fichas e protocolo prontos. Nenhuma ficha executada.**

Estados: `pendente` → `em curso` → `integrada` (portão aprovado e commit na branch) ou `devolvida (n)` / `escalada para Sonnet` / `dividida`. Fichas `*-cego` ficam `escrita` e depois `arbitrada`.

## Fichas
| Onda | Ficha | Título | Modelo | Depende de | Estado | Commit |
|---|---|---|---|---|---|---|
| 1 | [A1](fichas/A1.md) | Fórmulas: funções trigonométricas, `busca`, `PI` e parâmetro `angulo` | Haiku | — | integrada | f2453356 |
| 1 | [A2](fichas/A2.md) | Validação dos corpos e dos perfis | Haiku | — | integrada | 83db3cce |
| 1 | [A3](fichas/A3.md) | Resolução dos perfis em polígonos (`PerfilResolvido`) | Haiku | — | integrada | c8e3644c |
| 1 | [A3-cego](fichas/A3-cego.md) | Teste cego dos perfis | Haiku | A3 não precisa estar pronta (rodar depois contra ela) | arbitrada (48 verdes; 7 ambiguidades abertas) | b43b6c76 |
| 1 | [A4](fichas/A4.md) | Caminho 3D com curvas tangentes (cotovelo de tubo) | Sonnet | — | integrada | dabd70a4 |
| 1 | [A4-cego](fichas/A4-cego.md) | Teste cego do caminho com curvas | Haiku | rodar contra A4 | arbitrada (19 verdes; 4 ambiguidades abertas) | c237f83c |
| 1 | [A9](fichas/A9.md) | Arquivo `hestia-familia` versão 2 | Haiku | — | integrada | ad45f16a |
| 1 | [E1](fichas/E1.md) | Categorias novas: IFC padrão e galeria | Haiku | — | integrada | dcd5bc5b |
| 2 | [A2b](fichas/A2b.md) | Renomear e excluir parâmetro enxergam as fórmulas dos corpos | Haiku | A2 | pendente | |
| 2 | [A5](fichas/A5.md) | Malha dos corpos: extrusão e revolução | Haiku | A3 | integrada | 28a6ecab |
| 2 | [A5-cego](fichas/A5-cego.md) | Teste cego das malhas de extrusão e revolução | Haiku | rodar contra A5 | arbitrada (31 verdes, 1 ambiguidade: toro a 32 lados) | 6ee056c7 |
| 2 | [A6](fichas/A6.md) | Malha dos corpos: varredura e transição + agregador | Sonnet | A3, A4, A5 | pendente | |
| 2 | [A6-cego](fichas/A6-cego.md) | Teste cego da varredura e da transição | Haiku | rodar contra A6 | pendente | |
| 2 | [B1](fichas/B1.md) | Instância 3D (`inclinacao`), esquema 34 e matriz do componente | Sonnet | — | pendente | |
| 2 | [C1](fichas/C1.md) | Ligações: validação e resolução | Haiku | A1 (fórmulas) recomendado | integrada | 2a51cc81 |
| 3 | [A7](fichas/A7.md) | Integrar corpos e ligações em `resolverFamilia` | Haiku | A2, A3, A4, A5, A6, C1 | pendente | |
| 3 | [B2](fichas/B2.md) | Render 3D dos corpos (projeto e editor) | Haiku | A7, B1 | pendente | |
| 3 | [B3](fichas/B3.md) | Planta: silhueta dos corpos | Sonnet | A7, B1 | pendente | |
| 3 | [B4](fichas/B4.md) | Corte e elevação dos corpos | Sonnet | A7, B1 | pendente | |
| 3 | [B6](fichas/B6.md) | Operações puras de edição dos corpos | Haiku | A2 | pendente | |
| 3 | [D1](fichas/D1.md) | Símbolos 2D: validação e resolução | Haiku | A1 | pendente | |
| 3 | [D5](fichas/D5.md) | Verificações e tabelas de dimensões | Haiku | A1 | pendente | |
| 4 | [B5](fichas/B5.md) | Seleção (pick) por corpo no 3D, planta e corte | Haiku | B2, B3, B4 | pendente | |
| 4 | [B7](fichas/B7.md) | Editor: criar e editar corpos (interface) | Haiku | B2, B6 | pendente | |
| 4 | [C2](fichas/C2.md) | Editar ligações: operações e interface | Haiku | C1, B7 | pendente | |
| 4 | [C3](fichas/C3.md) | Conexões entre instâncias e sistemas MEP no projeto | Sonnet | B1, C1 | pendente | |
| 4 | [C4](fichas/C4.md) | Compatibilidade e encaixe de ligações (funções puras) | Haiku | C1, B1 | pendente | |
| 4 | [C4-cego](fichas/C4-cego.md) | Teste cego da compatibilidade e do encaixe | Haiku | rodar contra C4 | pendente | |
| 4 | [D2](fichas/D2.md) | Desenho dos símbolos 2D em planta, corte e elevação | Haiku | D1, A7, B3 | pendente | |
| 5 | [C5](fichas/C5.md) | Ferramenta Tubo: desenhar trecho entre pontos | Sonnet | B1, C3, C4, B2 | pendente | |
| 5 | [C6](fichas/C6.md) | Conexões automáticas (curva, tê, redução) | Sonnet | C5 | pendente | |
| 5 | [C7](fichas/C7.md) | Diagnóstico da rede MEP | Haiku | C3, C4 | pendente | |
| 5 | [D3](fichas/D3.md) | Visibilidade por vista e editor de símbolos | Haiku | D1, D2, B7 | pendente | |
| 5 | [D4](fichas/D4.md) | Detalhes da família: vistas nomeadas, cotas e cadeado | Sonnet | B4, D1, D2 | pendente | |
| 5 | [E2](fichas/E2.md) | Exportação IFC por categoria e portas de ligação | Haiku | A7, E1, C1 | pendente | |
| 5 | [E3](fichas/E3.md) | Quantitativos por categoria | Haiku | A7, E1 | pendente | |
| 6 | [D6](fichas/D6.md) | Inserir o detalhe da família numa prancha | Haiku | D4 | pendente | |
| 6 | [F1](fichas/F1.md) | Referência: tubo e conexões de esgoto (PVC) | Haiku | A7, C1, E1, B2 | pendente | |
| 6 | [F2](fichas/F2.md) | Referência: tubo e conexões de água fria (PVC soldável) | Haiku | F1 | pendente | |
| 6 | [F3](fichas/F3.md) | Referência: caixas de inspeção, de gordura e sifonada | Haiku | F1 | pendente | |
| 6 | [F4](fichas/F4.md) | Referência: fossa séptica, filtro anaeróbio e sumidouro | Sonnet | F3, D5 | pendente | |
| 6 | [F5](fichas/F5.md) | Referência: elétrica (eletroduto, caixas, tomada e interruptor) | Haiku | F1, D2 | pendente | |
| 6 | [F6](fichas/F6.md) | Referência: luminárias | Haiku | F5 | pendente | |
| 6 | [F7](fichas/F7.md) | Referência: estrutura metálica (perfis, chapa de base, parafuso) | Haiku | E3 | pendente | |
| 6 | [F8](fichas/F8.md) | Referência: HVAC e migração dos exemplos de disciplina | Haiku | F1, F5 | pendente | |
| 6 | [G1](fichas/G1.md) | Galeria e modelos-base por disciplina | Haiku | E1, B7, C2 | pendente | |
| 6 | [G3](fichas/G3.md) | Painel de propriedades da instância (MEP) | Haiku | B1, C3, D5 | pendente | |
| 7 | [G2](fichas/G2.md) | Editor: abas Inserir, Modificar, Vista e Gerenciar | Haiku | B7, C2, D3 | pendente | |
| 7 | [H1](fichas/H1.md) | Roteiros de navegador (E2E) das famílias de referência | Haiku | F1, F3, F7, C5, B7 | pendente | |
| 7 | [H2](fichas/H2.md) | Manual curto e atualização de documentos | Haiku | H1 | pendente | |
| 8 | [F-CSG](fichas/F-CSG.md) | (Opcional) Subtração real de vazios nos corpos | Sonnet | A6; só se a caixa de inspeção precisar | pendente | |
| 8 | [H3](fichas/H3.md) | (Opcional) Espelho Rust das malhas dos corpos | Sonnet | A6 e testes cegos verdes | pendente | |

## Registro de calibração (preencher a cada ficha)
| Ficha | Modelo | 1ª (portão aprovou de primeira) | Devoluções | Correções minhas | Nota |
|---|---|---|---|---|---|

## Decisões tomadas durante a execução
- 2026-11-24 · A4/A4-cego: `filetarCaminho` devolve `{ ok: true; caminho } | { ok: false; erro }` (nunca lança); `raios` tem `pontos.length − 2` valores (raios[i] = vértice i+1); erros por diagnóstico (`ok: false`), N de "curvas se sobrepõem no trecho N" conta a partir de 1; `vertices` = índices de ponto de início, fim e cantos vivos (cantos arredondados não entram). N2 a ±0,05 mm exige 64 passos por curva; com 12 passos (padrão) a tolerância é 0,5 mm.
- 2026-11-24 · REGRAS: worktree às vezes nasce em base antiga; avançar com `git merge --ff-only claude/lucid-euler-ddb7j6` antes de começar.
- 2026-11-24 · A9: `FAMILIA_VERSAO` = 2. OBSERVAÇÃO (fora de escopo, tratar depois): `caixaria` existe em `Familia` mas NÃO está na lista branca de `arquivo.ts`, então é descartada ao salvar/abrir arquivo de família (possível perda de dados pré-existente). `tsc` do monorepo fica vermelho (import de `corposPerfil.ts`) até a A3 ser integrada — esperado, é o teste cego A3-cego.
- 2026-11-24 · A2: códigos de diagnóstico de corpos: `obrigatorio`, `faixa`, `limite`, `tipo`, `formula`, `referencia`, `id_invalido`, `id_duplicado`. Faixas extras validadas: `segmentos` do perfil 8..128 e `segmentosPorCurva` 2..64. Renomear/excluir parâmetro ainda NÃO enxerga corpos: ficha nova A2b.
- 2026-11-24 · Revolução: novo campo `afastamento?: Expr` em `FormaCorpo.revolucao`; perfis centrados encostam no eixo (u_min = afastamento), `poligono` usa u literal + afastamento; ver CONTRATO §2.3 e ficha A5 (teste do toro).
- 2026-11-24 · A1: `busca` só aceita chaves numéricas (texto fica para depois); `PI` como id de parâmetro recusado em `validarParametros`; `angulo` ainda NÃO está no seletor de tipos da UI (`TIPOS_PARAMETRO` em `familiaDialogos.ts`, pendente para a ficha G2); `edicaoApoio.ts` (RESERVADOS) e `validarEstrutura.ts` ainda não reservam `PI` → coberto na ficha A2b. Integração: `acoes.ts` ganhou o caso `angulo` (2 linhas).
- 2026-11-24 · A3/A3-cego: `segmentos` do círculo/anel fica entre 8 e 128 (CONTRATO §2.2), valores fora são limitados; `resolverPerfil` devolve `{ ok: true; perfil } | { ok: false; erro }`; vértices trigonométricos não são arredondados a 1 µm (só as medidas de entrada).
- 2026-11-24 · E1: rótulos das categorias novas ficam em pt-BR fixo em `ROTULO_CATEGORIA` (sem i18n nas 7 línguas por ora); tarefa de i18n entra na ficha G1.
- 2026-11-24 · A5: `malhaRevolucao(perfil, anguloRad, segmentos)` recebe o NÚMERO DE PASSOS do ângulo dado (o padrão de 32 por volta é convertido por quem chama); `posicionarPerfilRevolucao(perfil, afastamento_m, centrado)` aplica a regra do afastamento; `pecaDoTriangulo` sai 0 e `malhaDosCorpos` (A6) reatribui o índice do corpo; `triangulate` de `@hestia/geom` aceita furos (sem ponte de corte); normais suaves com limiar de 60° entre arestas.
- (Registre abaixo as próximas; registre aqui toda decisão que mude o CONTRATO, com a data, e atualize o CONTRATO no mesmo commit)
