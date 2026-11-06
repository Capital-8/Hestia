# Nota de retomada: migração do kernel Rust (fatias A e B)

Data: 2026-11-06. Pasta de trabalho: `wt/release-b` (branch `claude/release-b`).
Escrito para retomar sem perder contexto. Nada aqui é decisão nova: são as decisões já aprovadas pelo dono.

## 1. Estado do código

- **Enviado ao GitHub (PR #5, branch `claude/great-ptolemy-cngq9y`)**: até o commit `4c7a45f0` (merge da `main`). Aprovação do PR #5: **pendente do dono**.
- **Commits locais ainda não enviados** (em `claude/release-b`, a partir de `4c7a45f0`):
  - `75a20ca2` e `961711e1` (volume de sobreposição exato, quando as alturas são afins; testes com valor analítico).
  - `ba6b48a9` (clamp de líquido por camada, uma vez por camada e não por faixa).
  - `957f08a7`, `dfce9676`, `faa65fea`, `87bd0f45`, `90819b07` (quantização dos cortes da junção na grade de 1 µm; referência do teste de conservação; `.wasm` regenerado; fronteira Z_EPS).
  - `6b12e349` (falha do Rust vira erro explícito; **sem fallback silencioso para TypeScript**).
  - `4d190a6b` (anéis da saída booleana não tocam a si mesmos depois do arredondamento).
- **Não commitado (working tree)**, em estado parcial, **não verificado como conjunto**:
  - `crates/geom-wasm/src/b3.rs`: grade de 1 µm na junção do Rust (`na_grade`) e correção pendente da flag `cut` (parada no meio; conferir antes de usar).
  - `packages/engine/src/kernelComparaB.ts`, `kernelComparaA3c.ts`: regra de topologia por região (aprovada).
  - `packages/engine/src/kernelComparaB3.ts` e `tests/kernel-b3-altura-faixa.test.ts` (novo): altura de faixa medida só com peças de área acima de 1e-6 m² (aprovada; implementação parcial).
  - `apps/web/src/editor/geometriaAbertura.ts`: `VERSAO_MOTOR_GEOMETRIA = 4`.
  - `tests/kernel-b1-referencia.test.ts`, `tests/kernel-b3.wasm.test.ts`, `docs/decisoes/0049-...md`: alterações de teste e ADR aprovadas.

## 2. Decisões aprovadas (valem para A e B)

1. **Só Rust calcula as partes de A e B.** O TypeScript não substitui resultado do Rust. Falha do Rust vira erro explícito (commit `6b12e349`).
2. **Arredondamento à grade de 1 µm (`EPS_Z`) acontece no Rust**, e não no TypeScript. A causa do desencontro de 1 µm (semente 43) é o empate de arredondamento, não erro de um dos lados.
3. **Contenção de partes após arredondamento**: limite `1e-6 + perímetro × EPS_Z/2` (ADR 0049).
4. **Topologia diferente é aceita pela região** (área simétrica dentro do limite da ADR 0049, K = 6), **somente se o resultado do Rust for válido** (anéis simples, furos dentro do externo).
5. **Altura de faixa medida só com peças de área acima de 1e-6 m²** (resíduos de arredondamento não são material).
6. **Flag `cut` de parede**: uma perda só conta se for maior que `área × Z_EPS` (resolução da grade). Correção **pendente**.

## 3. Verificação do último estado limpo

Medição única do working tree em 2026-11-05 (build de teste em `tmp-verif4`):
- Suítes oficiais: `kernel-b3` 43/43 (inclusive semente 43), `kernel-b3-fronteira` 6/6, `kernel-a3-frio` 20/20, `kernel-b5` 17/17, `kernel-b1-referencia` 8/8, `kernel-b3-referencia` 10/10, `kernel-a3c` 24/24, `kernel-a3d` 22/22, `kernel-b1` 21/21, `kernel-b2` 69/69; `cargo test` 160/160; `tsc` limpo.
- Projetos reais (11): **6 sem divergência de junção**; quantidades abaixo de 1e-6 em todos.
- Divergências do script de diagnóstico (247), classificadas pela regra oficial:
  - **221 aceitas** (região e topologia iguais dentro do limite; Rust válido).
  - **24** de altura de faixa (sem-titulo-8, -9, -10): **resolvidas pela decisão 5** (implementação parcial, ver seção 1).
  - **2** de flag `cut` (sintético S1 com anexos): **resolvidas pela decisão 6** (correção pendente). O efeito é só de desenho (corte e 3D); não altera volume.

## 4. O que falta, em ordem

1. **Concluir a correção da flag `cut` no Rust** (`b3.rs`): teste que falha antes (perda de ~1e-8 m³ deve dar flag falsa), depois a correção com limiar `área × Z_EPS`, e manter verdadeiro quando a perda é real.
2. **Concluir a medição de altura no comparador**: `kernelComparaB3.ts` e o teste `tests/kernel-b3-altura-faixa.test.ts` precisam ser revisados e rodados. Conferir se a regra está aplicada nos dois comparadores e se a ADR 0049 tem a subseção correspondente.
3. **Verificar o conjunto** (uma medição única, como em 2026-11-05): build de teste, todas as suítes da seção 3, junção e quantidades nos projetos reais (só agregados).
4. **Commitar em partes lógicas** (Rust grade; Rust flag; comparador e ADR; testes), **regenerar o `.wasm` versionado** (`node scripts/build-wasm.mjs`, depois `--check`) e commitar o artefato.
5. **Portar as quantidades para o Rust** (o maior item; hoje o desconto de piso e laje, o volume de corte e a área coberta são geometria em TypeScript). Inventário já feito: ~230 linhas a portar (volume de sobreposição, volume exato por células, área coberta, integral, recorte de anel, volume de faixa inclinada, média de perfil), ~290 linhas já no Rust que faltam ser ligadas, e ~700 linhas de agregação que podem ficar em TypeScript. Plano: consulta do Rust com as quantidades por camada; trocar os consumidores; método exato para alturas não lineares (sem triangulação).
6. **Testes de invariantes para o caminho só-Rust** (área, volume, contenção, conservação, topologia válida), sem depender do TypeScript como oráculo.
7. **Desempenho**: medição limpa, sozinha (sem outros testes pesados em paralelo). Ponto de partida: no caminho frio o Rust está mais lento que o TypeScript (níveis 1,35×, IFC 1,64×, DXF 2,99×). Hipótese principal: aquecimento do WebAssembly nas primeiras consultas. Ainda não confirmada.
8. **Documentação**: ADR 0049 e `docs/handoff/fatia-b-validacao-e-resumo.md` (atualizar com a decisão "só Rust" e os erros explícitos).
9. **CI do PR #5 verde** com o código final; **aprovação do dono**; **validação visual** de A e B com a fatia ligada.
10. **Decisão do dono**: publicar só depois de tudo pronto (caminho A, recomendado) ou publicar antes só a parte geométrica (caminho B, não recomendado pela regra "só Rust").

## 5. Riscos e aprendizados (não repetir)

- Quando vários agentes rodam ao mesmo tempo, as medições de desempenho saem contaminadas. Medir sozinho.
- Mudanças de etapas diferentes acumuladas no mesmo working tree fazem cada agente testar um estado diferente. Usar um worktree por etapa e commitar cada etapa verificada.
- Um comparador só é válido se a métrica for a certa: a medida de altura usando peças de área zero e a flag de desenho geraram divergências falsas.
- Ao aumentar a precisão (grade de 1 µm), tolerâncias de volume de 1e-9 ficam pequenas. Usar limites derivados da própria grade, documentados na ADR.

## 6. Outros itens do projeto (fora de A e B)

- **Site e app**: v0.1.0 publicada (2026-11-05), com a seção de downloads e o instalador. O workflow do desktop gera o instalador por tag `v*`.
- **Releases v0.2.0 e v0.2.1**: publicadas em 2026-11-05 pela conta do repositório, via PR #12. Confirmar com o dono de quem foi a ação.
- **PR #8** (README com links de download): aberto, aguardando aprovação.
- **PR #4** (Fase 0 do Rust, rascunho): fechar quando o PR #5 for mesclado.
- **Componentes e renderização GPU**: fora desta versão (decisão do dono).
- **B4** (altura e perfis de paredes anexadas): fora da fatia B, ainda no JavaScript.

## 7. Como retomar

```
cd wt/release-b
git status --short          # ver o que está não commitado
git log --oneline -15       # ver os commits locais ainda não enviados
```

Wasm de teste: `node scripts/build-wasm.mjs --saida ./tmp-verif4/wasm` e depois `KERNEL_WASM_PATH=./tmp-verif4/wasm/geom_wasm.wasm`. O `.wasm` versionado só deve ser regenerado depois de tudo verificado.

Pastas `tmp-*` são locais e não são versionadas. Projetos reais ficam fora do repositório e não devem ser commitados.
