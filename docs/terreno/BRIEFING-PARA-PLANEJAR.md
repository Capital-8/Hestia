# Terreno e lote: briefing para quem for planejar

Data: 2026-11-13. Escrito pelo fiscal da frente **Massa conceitual** (`docs/massa/PLANO.md`) para quem vai planejar a frente **Terreno e lote**. Este arquivo não decide nada de projeto: diz o que já está ocupado, onde as duas frentes se tocam e qual método seguir. O dono decide o resto.

## 1. O que a frente da massa já usa (não reutilize)

| Recurso | Ocupado pela massa | Também ocupado por outras frentes |
|---|---|---|
| Seções do kernel | 140–159 (hoje só 140–142 em uso) | 1–25 base, 60–81 guarda-corpo, 100–139 cortina |
| Consultas do kernel | 140–159 (hoje só 140–145 em uso) | 1–16 base, 60–65 guarda-corpo, 100–119 cortina |
| `versao` do contrato (`cena-v11.json`) | 19 (a massa sobe de 18 para 19 na ficha M2) | |
| `SCHEMA_VERSION` do modelo | 26 (já mesclado na branch `claude/youthful-dirac-l4egd1`) | |
| `Element['kind']` | `'mass'` | |
| `GraphicsCategory` | `'mass'` | |
| Chaves de i18n | `md_cat_mass`, `md_mass_*`, `md_cmd_mass_missing`, `cvn_cat_mass`, e as futuras `md_ms_*`, `tl_ms_*`, `ui_ms_*` | |

**Proposta de faixa para o terreno (a confirmar com o dono):** seções **160–179**, consultas **160–179**, categoria gráfica `'site'` (terreno) e, se houver elemento de lote separado, outro `kind`. Se a massa precisar de mais ids, ela usa só até 159.

**Regra do contrato:** `versao` sobe uma unidade por fase que mexe no contrato; se outra frente já usou o número na hora de mesclar, renumere. O que é estável para sempre são os **ids** de seção e de consulta. `abi` continua 2.

## 2. Arquivos compartilhados (onde o conflito de merge vai acontecer)

Conflito de texto, resolvível à mão, mas combine a ordem de mescla:

- `packages/model/src/types.ts` (união `Element`), `graphics.ts`, `elementLevel.ts`, `commands.ts`, `migrate.ts`, `index.ts`, `i18n.ts`.
- `crates/geom-wasm/schema/cena-v11.json`, `src/esquema.rs`, `src/cena.rs`, `src/lib.rs`, `src/consultas.rs`, `src/abi2.rs`; `packages/geom/src/kernel/v2/esquema.gerado.ts` (regenerar, nunca editar à mão).
- `apps/web/src/ui/ribbon/tabsSoon.ts`: **a aba "Massa e terreno" é uma só.** A massa ativa os botões do painel "Modelo de massa" e acrescenta botões novos; o painel "Terreno" (Topografia, Subdivisão, Plataforma, Componente de terreno, Linhas de propriedade) é do terreno. Cada frente mexe só no seu painel.
- Os testes-guarda de contrato: `packages/tools/src/contratoModificacao.test.ts`, `contratoSnaps.test.ts`, `packages/render/src/plan/extensaoDoModelo.ts`. Kind novo sem linha não compila; use `null` e `entra: false` com o motivo escrito, como a massa fez.

Conflito que **não** se resolve à mão: os artefatos WASM em `packages/geom/assets/` (`geom_wasm.wasm`, `geom_wasm.sha256`, `geom_wasm.fonte.sha256`). Depois de qualquer merge que traga Rust de outra frente, rode `npm run build:wasm` de novo e comite o resultado. O teste `tests/hash-fontes.test.ts` falha se o hash das fontes não bater.

**Ordem recomendada:** planejar agora (só documentos, sem conflito). Implementar o kernel do terreno **depois** que a massa passar da fase 1 (kernel Rust: fichas R1 a R3), ou então trabalhar em branch própria e mesclar uma de cada vez. Duas frentes mexendo em `cena.rs` e no JSON ao mesmo tempo funcionam, mas cada merge exige regenerar o esquema TS e o WASM.

## 3. Onde a massa e o terreno se tocam

1. **A base da massa sobre o terreno.** Hoje a massa tem `baseOffset` em relação ao nível. Se o terreno for inclinado, a pergunta é: a base da massa acompanha o terreno, ou é plana? A massa v1 é plana (decisão da massa). O terreno deve oferecer uma consulta "cota do terreno em (x, y)" que a massa e as paredes possam usar no futuro, mas **não obrigue a massa a usá-la**.
2. **Paredes em terreno inclinado.** O modelo de parede já tem perfil de base (decisão 0023 P9, `baseProfile`). Antes de inventar mecanismo novo, veja se "anexar base da parede ao terreno" cabe nele (veja como "anexar topo ao telhado" foi feito, `attachTargets.ts`).
3. **Plataforma (Building Pad)** corta e aterra o terreno sob o edifício. Quem calcula o volume de corte e aterro é o terreno; a massa não participa.
4. **Linhas de propriedade e lote.** Área do lote, recuos, taxa de ocupação, coeficiente de aproveitamento e permeabilidade usam a **área projetada da edificação**. A massa já entrega área por pavimento (consulta `massa_fatias`) e a projeção em planta. O lote deve **consumir** isso por consulta, sem a massa conhecer o lote.
5. **Corte e elevação** desenham o solo (linha do terreno com hachura). Isso passa pelo mesmo mecanismo do corte do guarda-corpo e da massa (`packages/render/src/section/`); reaproveite, não crie um novo.
6. **Planta**: curvas de nível e o contorno do lote. Use as camadas de visibilidade por categoria (`GraphicsCategory`) para ligar e desligar.
7. **IFC e DXF.** O DXF de entrada já existe (`packages/io/src/dxfImport.ts`): curvas de nível de levantamento topográfico costumam chegar assim. O IFC tem `IfcSite` e `IfcGeographicElement`.

## 4. Método de planejamento (o que funcionou nas frentes anteriores)

Siga o molde de `docs/decisoes/0055-guarda-corpo-e-corrimao.md` e `0056-parede-cortina.md`, e o de `docs/massa/PLANO.md`:

1. **Primeiro uma decisão (ADR)**, não código. Numeração: o maior número hoje é 0056; a massa vai usar o próximo livre ao fechar. Pegue o seguinte e confira em `origin` antes de gravar.
2. **Decisões do dono no começo**, marcadas como "não reabrir". Pergunte ao dono o que só ele sabe: formato de entrada (pontos, curvas de nível, DXF, CSV de levantamento), sistema de coordenadas (projetadas UTM ou locais), norma de recuos por município ou configurável por perfil, se corte e aterro entram na v1.
3. **Pesquisa com marcação de confiança**: `[LIDO]` (página aberta), `[BUSCA]` (só o resultado), `[A CONFIRMAR]` (norma paga, fonte secundária). Valor não verificado de norma entra como configurável e "(a conferir)", como a rampa e o guarda-corpo fazem.
4. **Uma primitiva só.** A massa ficou com "pilha de seções" por isso. Para o terreno, a pergunta equivalente é: **TIN** (triangulação de pontos, com linhas de quebra) como única representação interna, com curvas de nível, perfil de corte e volumes derivados dela. Evite duas representações paralelas (grade e TIN).
5. **Geometria pesada no Rust, modelo e interface em TS** (decisão do dono, repetida em 0055 e na massa). O Rust só lê as seções do contrato e nunca conhece o `Project`. **Nenhum caminho TS gera a geometria** (sem segunda fonte da verdade); sem kernel, desenho de reserva e aviso.
6. **Fixtures com valores analíticos**: terreno plano, plano inclinado, pirâmide, vale. Todos com área, volume e curva de nível conhecidos em fórmula. É o que dá confiança ao agente mais fraco.
7. **Critérios de estabilidade escritos** (fuzz com semente fixa, saída finita e determinística, tempos-alvo, cache por assinatura, desfazer e refazer, salvar e abrir, migração).
8. **Escopo fechado e lista do que NÃO entra** (como A.9 da massa). Candidatos a ficar fora: curvas de nível a partir de nuvem de pontos enorme, hidrologia, terraplenagem com camadas, importação de levantamento 3D.
9. **Fichas para subagentes**, cada uma com: objetivo, "depende de", **"Pode tocar" (lista fechada)**, passos, aceite com nomes de teste e valores. Lista fechada completa: se faltar arquivo, o agente para (foi o que aconteceu com `cena.rs` na M2).
10. **Manual do fiscal** com portões objetivos: escopo do diff, busca por atalhos (`.skip`, `eslint-disable`, `as any`, tolerância afrouxada), `typecheck`, `lint`, `test:rapido`, e para Rust `cargo test`, `clippy -D warnings`, `build:wasm`, `wasm:check`, `test:wasm`. No máximo duas devoluções por ficha.
11. **Processo de worktree** (aprendido na marra): `isolation: "worktree"` parte do `main` local e não da branch de trabalho. Crie à mão: `git worktree add /home/user/hestia-wt/<ficha> -b <frente>/<ficha> <branch-de-trabalho>`, rode `npm ci` dentro dele (nunca symlink de `node_modules`) e dê o caminho ao agente.
12. **Regras permanentes do repositório** que valem para elemento novo: `docs/contratos/familias-e-ferramentas.md` (regras 1 a 6: ferramenta de criação usa o núcleo comum, painel de propriedades de família, todo kind entra nas ferramentas de modificação, modal de tipo, não deixar lixo, todo kind fornece snaps) e `docs/contratos/trabalho-de-agentes.md`. Limite de 420 linhas por arquivo. Texto de interface em pt e en pelo i18n, valores por `formatQuantity`, unidades do projeto (decisão 0038).
13. **Checklist de paridade** (`docs/paridade/`) para o elemento novo e `docs/04-ROTEIRO.md` atualizado ao final, só pelo fiscal.

## 5. Perguntas que o plano do terreno precisa responder (e que a massa deixou em aberto)

- A cota do terreno em um ponto, o terreno como "nível 0" do projeto, ou os níveis continuam absolutos? (Hoje níveis têm cota própria.)
- Subdivisão do terreno com material (grama, pavimento): é região no TIN ou elemento próprio?
- Lote com várias linhas de propriedade (ex.: duas testadas): um elemento por polígono, ou uma lista?
- Recuos: configuráveis por lado do lote, e por perfil de município? (Como a norma configurável do guarda-corpo.)
- Taxa de ocupação e coeficiente de aproveitamento: calculados por consulta ao kernel, ou na camada TS sobre o resultado de `massa_fatias`?
- O que acontece com os elementos já existentes quando o terreno muda? Nada (v1), ou o motor reanexa paredes?

## 6. Como saber o estado da massa

Leia `docs/massa/ESTADO.md` (tabela das fichas, lições de processo) e a Parte "Emendas" no fim de `docs/massa/PLANO.md`. Se um id ou arquivo citado aqui já mudou, o estado vale mais que este briefing.
