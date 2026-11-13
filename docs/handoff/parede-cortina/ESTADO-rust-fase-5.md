# Parede cortina, fase 5 (esquadria na célula e cortina embutida), lado Rust e adaptador de envio: estado

Branch `feat/parede-cortina-rust5` (a partir de `feat/parede-cortina`, com o merge do `grupos` no 3D). Contrato `versao` 17, seções 112 e 113 (mais a 7 `tipos_abertura`), consultas 106 e 107, avisos 11 a 13.
Segue o ADR 0056 §6.1, §7 e §8.

## Numeração (desvio do ADR §6.1)

O ADR previa a fase 5 em `versao` 18 porque a fase 4 (cadeias, seção 111) ocuparia a 17. A fase 4 ainda não existe e a junção está em 16, então a fase 5 usa a
**17**. Quando a fase 4 entrar, ela renumera a versão (os ids de seção e consulta são estáveis; a seção 111 fica reservada, por isso o salto 110 para 112).

## Onde está

- `crates/geom-wasm/src/cortina_porta.rs` (+ `cortina_porta_testes.rs`): vão virtual, soleira derivada, folha mínima, caixas da folha, símbolo de planta, linhas do ajuste de grade e a consulta 107.
- `cortina_pecas.rs`: `resolver_uma` remapeia `aberturas_celula` com `mapear_celulas` (a mesma chave das sobrescritas de painel), uma esquadria por região (a de menor id; a outra vira órfã, aviso 7), omite a base sob a porta, e a região com esquadria não tem painel (`Geom.esquadrias`, flag de célula bit 3).
- `cortina_malha.rs` (grupos papel 3 folha/batente opaco e papel 4 vidro da esquadria `transparente=1`; a chave dos grupos passou a incluir papel e transparência), `cortina_planta.rs` (papéis 4 contorno do vão e 5 giro/arco/traço), `cortina_quant.rs` (papéis 30 esquadria, 31 folha e batente, 32 vidro da esquadria).
- `cortina_hosp.rs`: a cortina embutida. `vaos_dos_hospedes` entra no `resolver_nivel` (`a3c.rs`) como um vão a mais do grupo do hospedeiro (id com o bit alto, sempre fura a planta, sem retorno de acabamento); a consulta 106 devolve o retângulo e as colisões. A seção 113 invalida os caches das paredes (as outras seções da cortina não).
- `secoes_cortina.rs` (decodificação e validação das seções 112 e 113), `esquema.rs`, `schema/cena-v11.json`, `esquema.gerado.ts`.
- Fixture `tests/fixtures/cortina_porta_f5.json` (9 casos, conferidos à mão, lidos por `casos_do_fixture_conferidos_a_mao`). Os fixtures `cortina_paridade*.json` mudaram só na linha `esquemaVersao`.
- TS (só envio): `kernelA3.ts` (`empurrarTipoAbertura`/`colunasDoTipoAbertura`, extraídos da montagem da seção 7), `kernelCortinaTabelas.ts` (seções 7, 112, 113, papéis, flags, avisos), `kernelCortina.ts` (`tiposAbertura`, `hospedeiroNum`, `CortinaKernel.hospedeiro`, `sobrescritas.esquadrias`), `cortinaSobrescritas.ts` (`opening` vira esquadria), `cortinaProjeto.ts` (host e tipos de abertura; entra na assinatura).
- Teste no wasm real: `tests/kernel-cortina-esquadria.wasm.test.ts`.

## Regras fixadas aqui

- Vão (m, em `s` ao longo da cortina e `z` acima da base): **preencher** = entre as faces dos montantes menos 4 mm de cada lado, de `z0 + peitoril` à face do montante de cima; **grade** = tamanho nominal do tipo (largura e altura da seção 7, sem a folga de obra) alinhado no centro/início/fim da região entre as linhas, recortado pelo livre. Sobra menor que `max(resto_minimo, celula_minima)` absorve o centro para o início (igual ao `linhasDoAjuste` do modelo). Aviso 13 só se o nominal passa da região entre as linhas.
- Peitoril efetivo = `soleira` da instância, senão 0 (como o comando do modelo; o `sill` do tipo não entra). Soleira derivada = porta (não janela) com peitoril efetivo 0: o segmento horizontal da base da região some (`removido` na `cortina_grade`), em toda a largura da região.
- A fusão por esquadria maior é do modelo (comando com confirmação, grava `removedSegments`); o Rust só lê as regiões da fase 2. Não funde sozinho.
- Folha mínima: giro 0,60, correr/pocket/garagem 0,50, janela 0,30, vão livre 0; medida = largura entre as folgas. Porta fora do piso: soleira derivada e base da região acima de 1 µm.
- O vidro da esquadria nunca é instância nem papel 10: sai em `grupos` (papel 4) e no quantitativo no papel 32.
- Recorte: o vão da cortina é limitado ao hospedeiro (pontas e topo; diag bit 0). Colisão compara `t` e `z` (o aviso do TS compara só `t`; o ADR diz `[t, z]`). Total = a cortina cobre a abertura inteira (bit 2, o comando recusa); parcial = bit 1.

## Simplificações registradas

- A composição de esquadrias do projeto (`openingParts.ts`) é TS; o Rust desenha uma folha simples: quadro de perfis de 50 mm com `esp_folha` de espessura, uma folha por `folhas`, e um vidro de 8 mm dentro; batente de `larg_batente` por toda a profundidade só nos lados sem montante (e na base da janela sem montante). Sem ferragens, soleira de porta, almofadas nem bandeira.
- Planta: contorno do vão e, nos planos de giro (swing, double, dblact, hinged), folha e arco; nos outros planos, um traço. O ADR prevê o símbolo do TS (`openingSymbol.ts`) desenhado no vão da consulta 107; o TS pode trocar este símbolo usando `portas` e `vaos`.
- As medidas do vão no Rust são entre as faces reais (o montante de borda é embutido, face a 1 largura da ponta); o `folgasDaRegiao` do modelo usa meia largura também na borda, então o TS pode julgar "cabe" com até meia largura de diferença nas bordas.

## Pendências (não feitas)

- **Cortina embutida no kernel das paredes**: a seção 113 e o recorte moram no `Cena` das paredes (precisam do `Quadro` do hospedeiro e das aberturas). O adaptador envia a 113 só à cena da cortina (`ServicoCortina`), onde ela não recorta nada. Falta mandá-la também ao kernel das paredes (`kernelDespachoA/B.ts`, com `hospedeiro_num` = `id_num` da seção 1) e invalidar o cache do nível; aí o recorte vale nas camadas, na planta e nas quantidades. `EntradaCenaCortina.hospedeiroNum` já existe para o mapa de ids.
- Leitores TS das consultas 106 e 107 e de `linhas` (`kernelCortinaConsultas.ts`, fora do escopo pedido): a UI precisa deles para o ajuste de grade (linhas presas), o destaque do vão e a colisão.
- Tabela de esquadrias e marca (§7.8) e IFC: dependem dos leitores acima.
- A regra do hospedeiro curvo (bit 3) e o hospedeiro que muda de nível não têm teste de integração.
- Sem referência TS nesta fase (economia): a cobertura é por testes Rust e pelo fixture conferido à mão.

## Testes

`cargo test -p geom-wasm`: 453 testes da biblioteca (os novos: 15 em `cortina_porta`, 6 em `cortina_hosp`) mais 6 de paridade, todos passando; `node scripts/verificar-wasm.mjs --estrito`: wasm de 2381,7 kB (teto 3 MB).
TS: `kernelCortina.test.ts` (14), `cortinaSobrescritas.test.ts` (16) e `tests/kernel-cortina-esquadria.wasm.test.ts` (3, no wasm real).
