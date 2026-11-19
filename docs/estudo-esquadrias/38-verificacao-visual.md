# 38. Verificação visual no app real (build artifact)

Data: 2026-11-19. Continua `36` (parede não recortada) e `37` (portas com forma). Marcas: [V] visto/medido nesta sessão; [I] inferência.

## 1. Método [V]

- `NODE_OPTIONS=--max-old-space-size=8192 npm run build:artifact`; `apps/web/dist/index.html` + `geom_wasm.wasm` copiados para uma pasta temporária e servidos por http local (`index.html` já traz `<meta charset="UTF-8">`). URL `?gl=1&debug=1`, Chromium do sistema com SwiftShader (Playwright).
- Espera `__hestiaFuro.clienteInstalado() === true`, depois `editor.newProject('blank')` + `useUi.setState({ tela: 'editor' })` (o app abre na tela inicial). Paredes e vãos por `store.exec` (`addWall`, `upsertOpeningType`, `addOpening`), vista 3D, câmera por `__hestia3d` (`target/azimuth/elevation/distance` + `apply()`), e um `previewTick` para redesenhar (o 3D só desenha sob demanda).
- Em todas as execuções: cliente do furo instalado, `__hestiaFuro.diagnostico()` com `chamadasPrisma > 0`, `falhas: 0`, `ultimoErro: null`. Único erro de console: 404 do `resolveWorker-*.js` (esperado no artifact, o cliente cai para a thread principal, ver `36`).
- Capturas em `<scratchpad>/shots/` (não versionadas). Nomes abaixo.

## 2. O furo da parede acompanha a forma [V]

`1a-porta-P86-arco-pleno`, `1a-porta-P87-arco-abatido`, `1a-porta-P88-ogival`, `1a-janela-J60-arco-pleno`, `1a-janela-J61-arco-abatido`, `1a-janela-J62-ogival`, `1a-janela-J63-oculo`, `1a-janela-J64-empena`: close de cada vão numa parede de alvenaria (vista frontal, zoom 4 m).
Em todas o furo da parede tem o contorno da forma (arco pleno, abatido, ogival, círculo, empena), com batente em arco e vidro/folha recortados pelo mesmo contorno. Nenhum furo retangular, nenhuma parede inteira. `1b-visao-geral-parede`: os oito vãos na mesma parede, mesmo resultado de longe.

## 3. Estilos de folha, sem forma e com arco [V]

`2-estilo-{flush,panel,glass,louver,grille}-{SEM-forma,COM-arco}` (porta de giro 90 x 210 derivada de `ot_pgiro90`) e `4-obliqua-*` (vista oblíqua, mesma porta).

- As peças de cada estilo existem com e sem forma (medido: 4 almofadas, 11 barras da grade, 37 aletas, vidro, 8 maçanetas/3 dobradiças iguais; o modelo com forma tem as mesmas peças do sem forma, só recortadas).
- O vidro aparece nos dois (`glass`), recortado em arco no arco. Almofadas aparecem como 4 retângulos de relevo discreto; a grade como barras verticais; nos dois casos igual com e sem forma.
- [V] Achado que vale com e sem forma: o relevo da almofada (6 mm) e da grade (3 mm) é do mesmo material da folha e só se lê por sombreamento; de frente a porta parece quase lisa. É o desenho atual do estilo, não efeito da forma.
- [V] Defeito real, independente da forma: a **veneziana** de porta era uma chapa lisa. As aletas (`openingModelDoors.ts`) tinham exatamente a profundidade da folha (`s0..s1` iguais, mesmo material): ficavam embutidas e invisíveis, na porta retangular e na de arco (`4-obliqua-louver-*` mostram a porta lisa nas duas). Este é o "chapa única" reproduzido no app.

### Correção

`openingModelDoors.ts`: as aletas saem `LOUVER_PROUD = 12 mm` além de cada face da folha (como almofada e grade já faziam, em menor medida). `5-veneziana-corrigida-{SEM-forma,COM-arco}-{frontal,obliqua}`: com o artifact reconstruído, as aletas aparecem como faixas horizontais, na porta retangular e na de arco (recortadas pelo arco). Teste: `packages/engine/src/openingModelDoorsLouver.test.ts` (aletas passam da face da folha dos dois lados, sem forma e com arco pleno). Os testes de contorno (`openingModelContorno*`, 162 tipos x 4 formas) seguem passando.

## 4. Controles do diálogo com forma [V]

`3a..3g-controle-*`: porta em arco com almofadas, trocando o tipo por `upsertOpeningType` (mesmo comando do diálogo): base (3a), veneziana (3b), grade (3c), vidro (3d), sem maçaneta (3e), maçaneta redonda (3f), com bandeira em arco e folha reta embaixo (3g). Cada controle muda o 3D com a forma mantida.

Pelo diálogo real (`6a..6d`, "Editar tipo" > aba "Folha" > Estilo da folha): painel (6a) -> veneziana (6c) -> vidro (6d); triângulos da cena 2706 -> 4058 -> 3973; a forma (`round` 0,9 x 2,1) fica preservada no tipo. `6b` é o diálogo aberto (lista de estilos: Lisa, Painel, Vidro, Veneziana, Grade). O seletor de nº de folhas só aparece para famílias com mais de uma opção (não para `ot_pgiro90`).

## 5. Outras famílias com arco [V]

`7-ot_pgiro2_140-*` (duas folhas), `7-ot_ppainel_90-*` (painel lateral), `7-ot_pcorrer160-*` (de correr), sem forma e com arco.

- Duas folhas e lateral+folha: as duas folhas, maçanetas e o painel lateral acompanham o arco, como no retangular.
- **Porta de correr com arco: lacuna visível [V], não corrigida.** Fechada, o centro-alto da porta tem um recorte vazado (se vê o fundo) entre as duas folhas. Causa no código: `recortada` (`openingModelContorno.ts`) recorta a folha que desliza pela interseção do contorno com ele mesmo deslocado pelo curso (para a folha caber no arco durante todo o movimento); perto do eixo, onde o arco é mais alto, a interseção corta o canto da folha. É a decisão da seção 5 de `37` ("dentro do contorno em todo o curso"), com custo visual na posição fechada. [I] Alternativa: para folhas de correr, recortar na posição fechada (passo c) e aceitar que, aberta, a folha passa do arco (ela corre na frente da parede). Mexer nisso inverte os testes `openingModelContornoLacunas`/`Preserva` que verificam o curso inteiro; precisa de decisão.

## 6. Parede "inteira" e caixas LOD

Não se reproduziu. `buildLevelSolidsComCaixas` já não transforma em caixa a camada com `furosContorno` (`36`); `chamadasPrisma` ficou em 5 (> 0, furo real chamado) e nenhuma parede cheia apareceu nas capturas. As esquadrias vão como caixas instanciadas (`caixasEPrismasDoModelo`) a partir do mesmo modelo, que já traz as peças recortadas (`prisma` `tz`) e por isso aparecem com contorno de arco e vidro/almofadas.

## 7. Arquivos alterados

- `packages/engine/src/openingModelDoors.ts` (aletas da veneziana salientes)
- `packages/engine/src/openingModelDoorsLouver.test.ts` (novo)
- `docs/estudo-esquadrias/38-verificacao-visual.md` (este)
