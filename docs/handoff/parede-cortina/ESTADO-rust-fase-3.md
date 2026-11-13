# Parede cortina, fase 3, parte 1 (perfis e prioridade), lado Rust: estado

Branch `feat/parede-cortina-pc3-rust`. Contrato `versao` 15 (sem mudança nesta parte). A junção entre paredes (seção 110) continua reservada para a
versão 16, como manda o ADR §6.1; esta parte não altera o contrato, então não sobe a versão.

## Onde está

- `crates/geom-wasm/src/cortina_malha.rs`: primitivas de seção (`secao`), sólido por faixas de profundidade (`solido`), envelope de vizinho
  (`faixas_do_vizinho`), protótipos de L, trapézio e canto, e as peças avulsas `grupos` (malha no mundo, uma por cortina e material).
- `crates/geom-wasm/src/cortina_pecas.rs`: `Montante` com `espessura` e `largura2`; áreas e perímetro pela fórmula de cada forma; validação
  (`montante_de`); `PecaEsq` (peça com esquadria); laço de aparo com a envoltória do vizinho; testes da fase 3 em `testes_f3`.
- `crates/geom-wasm/src/cortina_planta.rs` e `cortina_quant.rs`: contorno de L, trapézio e canto na planta; volume da esquadria pela malha.

## Convenções (conferidas com `packages/model/src/curtainMullionProfile.ts`, branch `feat/parede-cortina-pc3-ui`)

- Áreas: `rect` w·d; `round` πw²/4; `L` w·d − (w−t)(d−t); `trapezoid` (w+wb)/2·d; `corner` w·d − (w−2t)(d−2t). Iguais ao TS.
- Validação: `L` exige 0 < t < min(w,d); `corner` exige 0 < 2t < min(w,d); `trapezoid` exige wb > 0. Falha vira ENTRADA.
- Alinhamento ao TS: a primeira versão do Rust punha a aba do `L` na face externa (y alto). Foi trocada para a face interna, como no TS.
  Os vértices agora são os de `contornoMontante` (L, trapezoid, corner).
- Contornos: `L` com a aba na face interna (y baixo, largura w) e a alma na borda esquerda, de profundidade d; `trapezoid` com a face externa
  (w) em y positivo e a interna (wb) em y negativo; `corner` é tubo oco de chapa t. Mesmos vértices do TS.
- `round`: o Rust discretiza em 8, 16 ou 24 lados (LOD, fixado pelos fixtures e pelo contrato); o TS usa 96 na prévia. A área pela fórmula é a mesma.

## Esquadria e prioridade

- Ponta de peça quebrada contra vizinho contínuo `L` ou `trapezoid`: a envoltória do vizinho por profundidade (`faixas_do_vizinho`). Se a envoltória
  varia dentro da peça, a peça vai a `pecas_esq` (sólido por faixas) e a `grupos`; senão é prisma, como antes.
- `rect`, `round` e `corner` como vizinho continuam com face plana em `c ± largura/2` (o `corner` dá o mesmo valor em toda profundidade).
  O `round` vizinho deixa uma fresta longe do plano médio; é o comportamento anterior, travado pelos fixtures. Fica para decisão.
- As quatro interseções (borda/borda, borda/interior, interior/borda, cruz) têm teste numérico nas duas prioridades.
- Convenção a confirmar com o dono: invertida gira cada perfil 180° no próprio eixo. Perfil simétrico dá o mesmo volume total; o `L` troca o lado
  da alma em relação às horizontais, então a esquadria muda de lado (testado em `invertida_nao_muda_o_volume_de_perfil_simetrico`).

## Protótipos e malha

- `L`, `trapezoid` e `corner` viram protótipos (sólido de comprimento unitário), com malha fechada e orientada.
- `grupos`: `vertices_av` em coordenadas do mundo; `indices_av` absolutos; um grupo por cortina e material. A descrição do JSON ainda diz
  "vazio na fase 1": não foi editada porque o contrato não mudou de valor. Atualizar junto com a regeneração do `esquema.gerado.ts`.
- O TS (`kernelCortinaServico.ts`) ainda não lê `grupos`. Então a esquadria não aparece no 3D até a integração. Os perfis L, trapézio e canto
  sem esquadria já saem como instâncias.

## Testes

- `cargo test` em `crates/geom-wasm`: 415 unitários (1 ignorado) e 6 de paridade. A paridade dos fixtures `cortina_paridade*.json` não mudou.
  Os fixtures só usam `rect` e `round`.
- Cortina (filtro `cortina`): 96 testes. Área e volume pela fórmula de cada perfil; malha fechada e orientada; ponta com degrau (volume analítico);
  esquadria contra L e contra trapézio (volume analítico); as quatro interseções; contorno na planta; quantitativo; validação; invertida.
- LACUNA: a propriedade "nenhuma sobreposição no plano (s, z)" só é testada para `rect` (teste antigo). Para L, trapézio e canto não há teste.
  Teste de caixa envolvente não serve: dá falso positivo no trapézio e no L com degrau. O certo é testar por y amostrado (dois sólidos se sobrepõem
  se alguma seção em y se sobrepõe). Fica para a próxima parte.

## Wasm

- `packages/geom/assets/geom_wasm.wasm`: 2.333.403 bytes (2278,7 kB). Teto de `scripts/verificar-wasm.mjs`: 2,25 MiB = 2.359.296 bytes. Cabe, com
  folga de cerca de 25 kB. O teto não foi alterado.

## Pendências

- Seção 110 (junção entre paredes e extremidades) e a versão 16 do contrato: próxima parte.
- TS: ler `grupos` no 3D; editor de montante com as formas novas; C16 em `docs/paridade/paredes.md`.
- Fresta do `round` como vizinho contra quebrado (decisão de comportamento).
