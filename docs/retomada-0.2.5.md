# Retomada da versão 0.2.5 (estado de 18/11/2026)

Documento de passagem de trabalho de um computador para outro. Branch: `integracao/0.2.5`, criado a partir de `release/0.2.5`
(que é a `main` mais o commit de versão e notas). **Nada daqui foi para `main`, `release/0.2.5` nem para o PR #41.**

## 1. O que está integrado no branch

| Frente | Resumo | Verificação feita |
|---|---|---|
| TR (Aparar/Estender) | Abre em "Ao canto" por padrão | Sem teste próprio |
| Editar tipo do terreno | Tipo com superfície e solo separados (3D e cortes), curvas, texto do rótulo, rótulos automáticos nas mestras. Seletor de tipo no topo das propriedades. Decisão 0059 | 90 testes de terreno, `tsc`, lint |
| Pasta do projeto | Renomeia a pasta ao mudar o nome. "Salvar como" grava em outro local e o projeto fica ligado a ele (só na sessão) | 1367 testes de `apps/web/src/editor`. **Rust do desktop (renomear pasta, escolher local) NÃO foi compilado** (sem `link.exe`) |
| Telhado | Chanfro em vez de recusar cantos agudos (limite 10x o balanço); solda de vértices e emendas no 3D; topo da parede cortado pelo telhado nas duas faces (`attachTopRoofFull`) e oferta de "Anexar ao telhado" ao criar | 8 testes do chanfro, regressão de roof* (50/51 antes do ajuste, agora ok), 64 testes de parede/telhado |
| Cortes e elevações | Mapa de corte e aterro nas seções; silhueta do terreno existente tracejada na elevação (papel 3 do kernel) | 28 testes de `section/terreno` |
| Snap das curvas | Rótulo de curva e Cota de ponto grudam nas curvas (só essas duas ferramentas), superfícies existente e proposta. Ajuste do teste MassOptionsBar | snapCurvas 12/12, contratoSnaps, tsc |
| Mapa de corte e aterro (planta) | Corte exato na linha de zero, só dentro do terreno existente, pedaços disjuntos | Rust: 93 testes, depois 101/101 no branch inteiro |
| Malha do terreno | Alcance do talude por iteração, medido sobre as regiões anteriores; aviso 7; curvas sem laços na região plana e na parede de 2 cm; **suavização Chaikin sempre ligada (ver pendência 1)** | Rust 101/101; 6 testes novos de talude |
| Pranchas | Janela larga "Adicionar vista" com prévia e escolha de escala; Shift ao soltar abre a janela; bateria de estabilidade com projetos grandes | 10/10 médio; grande 10/10 em ~1000 s |
| wasm | `geom_wasm.wasm` regenerado e commitado | `test:wasm`: 1434 testes, 4 falhas corrigidas (3 expectativas, 1 de tempo) |

Também verificado no branch inteiro: `tsc -p tsconfig.json --noEmit` passou (exit 0).

## 2. Pendências (em ordem de importância)

1. **Suavização das curvas de nível.** Hoje as curvas saem SEMPRE suavizadas (Chaikin, 2 rodadas), o que encolhe cantos
   (quadrado de 64 m vira cerca de 52,6 m) e desloca pontos sem limite em metros. Decisão do usuário: ter no Editar tipo do
   terreno a opção **Exata (padrão)** ou **Suavizada com tolerância (padrão 2 cm)**. Um agente estava implementando em
   `feat/0.2.5-suavizar` (consulta 161 de `crates/geom-wasm/src/terreno_curvas.rs`, tipo em `packages/model/src/terrainTipo.ts`,
   UI em `apps/web/src/ui/dialogs/TerrainTypeDialog.tsx`). Se não estiver integrada: o modo de fábrica correto é EXATO;
   sem a opção, desligue as rodadas do Chaikin no kernel, regenere o wasm e volte os 3 testes wasm de curvas ao quadrado
   exato (4 pontos, perímetros 64/48/32/16).
2. **Suíte ampla de testes** (`npx vitest run packages apps/web/src`): terminou com **14176 passaram, 16 falharam**.
   Corrigidas (consequência direta das integrações): `terrenoIssues.test.ts` (agora 9 códigos de aviso, com o aviso 7 do
   talude) e `contratoModaisFamilia.test.ts` (TerrainTypeDialog classificado como exceção TODO; o ideal é migrá-lo para o
   esqueleto FamilyTypeDialog). **Ainda a conferir (podem ser timeout sob carga ou antigas):** `sheetInsert.test.ts` (lote de 3
   vistas, timeout de 5 s: foi tocado pela frente das pranchas), `contratoCamposEsquadria.test.ts`, `previewViews.test.ts`,
   `junctionReducao`, `projectIssues` (predio10), `wallTiltJoin*`/`wallTiltMulticamada`/`wallTiltJuncaoArco` (desempenho em ms),
   `terminoCamada3d` (2 testes de volume laje x parede), `openingCatalogoVistas`, `zoomSemRecriar` (2). Reexecute cada arquivo
   isolado, com a máquina livre, antes de concluir que é regressão; para os de desempenho compare com a `main`.
3. **Rust do desktop** (`desktop/src-tauri/src/biblioteca.rs`, 2 testes novos) nunca compilou: rodar `cargo check` e
   `cargo test` com um toolchain que linke.
4. **Teste visual** de tudo: mapa de corte e aterro no GPU (emendas), 3D do telhado (filetes), chanfro em formas orgânicas,
   encaixe parede x telhado (anexar paredes), cortes e elevações com o mapa ligado, janela de inserir vistas, snap das
   curvas, renomear pasta e "Salvar como". Nada disso foi visto em tela.
5. **Rodar de novo** `npm run test:wasm` e `npx tsc -p tsconfig.json --noEmit` depois de qualquer mudança no kernel.

## 3. Decisões já tomadas pelo usuário
- Cor e material do solo valem no 3D e nos cortes; escolha por família/tipo no Editar tipo; seletor de tipo no TOPO.
- Plataforma/região nivelada: talude 0 (parede vertical) por padrão, configurável na propriedade da região.
- Snap nas curvas só para Rótulo e Cota; superfícies existente e proposta. Borda da plataforma NÃO precisa aparecer como curva.
- Suavização: padrão Exata, tolerância 2 cm, opção no Editar tipo; vale também no DXF.
- Corte e aterro em cortes primeiro; elevações em paralelo se possível.
- Pasta do projeto: renomear automaticamente; "Salvar como" abre outro local e passa a gravar só lá.
- Tudo entra na 0.2.5. O usuário testa em localhost ANTES de gerar o instalador.
- A **massa** nunca aparece em título do PR, descrição do PR nem nota da release (já corrigido no PR #41; o commit
  `95fd7467` ainda cita "esconde a massa": reescrever a mensagem SÓ na hora de enviar tudo, com force-push em `release/0.2.5`).

## 4. Decisões que ainda esperam o usuário
1. Cores do tipo de terreno padrão (superfície `#7f9f5c`, solo `#8b6b4a`, curvas marrons).
2. Subir o esquema do arquivo para 30? (hoje continua 29, campos aditivos)
3. Aplicar o tipo de terreno também aos terrenos já existentes?
4. Talude medido na horizontal a partir do ponto mais próximo (atual) ou na normal do plano inclinado?
5. Aviso 7 ("talude não alcança o terreno") como código novo (já mapeado no TS).
6. Peso do snap das curvas (0,5).
7. Anexar paredes ao telhado automaticamente ao criar (hoje só sugere).
8. Limite do chanfro (10x o balanço) e texto da mensagem de cúspide.
9. Gesto da janela de inserir vistas (Shift ao soltar) e mover PDF/DXF para worker (hoje congelam 40-60 s em projeto de 3 mil elementos).
10. "Salvar como": a ligação com o local externo deve persistir entre sessões?
11. Instalar o Visual Studio Build Tools nesta máquina (3 a 6 GB)?
12. Pintar a face do talude como corte/aterro na elevação (contrato novo no kernel) e camada de DXF para o mapa.

## 5. Como rodar as verificações
```
npm ci
npx tsc -p tsconfig.json --noEmit
npx vitest run packages apps/web/src
# Rust (terreno): na pasta crates/geom-wasm
cargo test --lib terreno -- --test-threads=2        # ~22 min em debug (2 fuzz pesados)
# wasm
npm run build:wasm
npm run test:wasm
```
Neste computador de origem o toolchain MSVC não tinha `link.exe` (o `link` do Git atrapalha). Foi usado o GNU:
`RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu`, `CARGO_INCREMENTAL=0` e um `CARGO_TARGET_DIR` fora do repositório.
Em um computador com Visual Studio Build Tools não é preciso.

## 6. Armadilhas conhecidas
- Vários `npm ci` ao mesmo tempo corrompem `node_modules` no Windows: rode um por vez.
- Pasta com dono diferente: o Git pede `safe.directory`; use `git -c safe.directory=<pasta>` em vez de mexer na configuração.
- O repositório versiona o `.wasm`: depois de mudar o kernel, regenerar e commitar `geom_wasm.wasm`, `geom_wasm.sha256`
  e `geom_wasm.fonte.sha256`.
- Strings com aspas simples em francês e italiano precisam de `\'` em `i18n.ts`; um escape faltando quebra o dicionário inteiro.
- Testes de render com timeout de 5 s falham sob carga; reexecute isolados antes de concluir que são regressão.

## 7. Depois que os testes passarem (só com aval do usuário)
1. Reescrever a mensagem do commit `95fd7467` (sem citar a massa) e dar `push --force-with-lease` em `release/0.2.5`.
2. Atualizar o PR #41 com o conteúdo do `integracao/0.2.5` e conferir a CI.
3. Mesclar o PR #39 (instalador do macOS), se for na release.
4. Gerar o instalador de teste com o workflow `build-desktop` (não publica nada) e testar.
5. Só então criar a tag `v0.2.5`.

## Suavização — TS/UI (executor TS, commit `6af3cc88`)
- Modelo: `suavizarCurvas` (ausente = exata) e `toleranciaSuavizacao` (m). Tolerância inválida ou fora de [0,001; 0,5] cai em 0,02; `toleranciaCurvasDoTerreno` devolve 0 para exata.
- `terrainTypeIssue` recusa tolerância fora dos limites com `md_tn_tolerancia` (params em metros); só checa com a suavização ligada.
- Serviço: `ServicoTerreno.curvas` faz uma consulta `terreno_curvas` por tolerância distinta; a chave de memória ganha `id=tol` só para terrenos suavizados.
- DXF, planta, pranchas e snap usam `servico.curvas()`, então herdam a tolerância. Não há chamada direta a `terreno_curvas` no TS.
- UI: Editar tipo tem select Exata/Suavizada e campo de tolerância em `quantity="length"` (unidade do projeto; sem "cm" fixo, que o check-units proíbe). Propriedades do terreno mostram a opção e a tolerância só de leitura.
- Testes (17 novos, valores literais) passam; pastas de model, engine, UI de terreno e i18n passam sem falha. Typecheck RC=0; eslint limpo nos arquivos tocados.
- Pendente: `check-units` falha por `pranchasEstabilidadeSuite.ts`, `pranchasFixture.ts` e `model3d/solids.ts` (outra frente). `check-i18n-placeholders` tem 1 divergência pré-existente (`pct_mullion_copy_name`).
- Depende do Rust: a consulta 161 com 3º argumento `tolerancia` precisa do wasm novo para as curvas suavizadas saírem certas na tela; o teste de memória usa cena falsa.
