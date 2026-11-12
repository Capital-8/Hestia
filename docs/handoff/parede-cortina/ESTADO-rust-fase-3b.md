# Parede cortina, fase 3, parte 2 (junção entre paredes): estado

Branch `feat/parede-cortina-junta`. Contrato `versao` 16 (seção 110 `cortina_extremidades`). Segue o ADR 0056 §5.3, §6.1, §6.5 e a Fase 3 da §10; a emenda de §6.5
descreve as regras como foram feitas.

## Onde está

- `crates/geom-wasm/src/cortina_juncao.rs`: a junção. `resolver_ponta(sec, id, c, t, fim)` devolve o recuo da ponta e, se há canto com outra cortina, o polígono
  do montante. Encosto reto = `recuo_encosto` (fecho convexo dos quatro pontos de face, recortado pela faixa do sistema). Canto = encontro das faces internas
  e externas (esquadro), recuo `max(encontros, meia largura do canto)`, hexágono de preenchimento (`limpar` tira vértices repetidos e colineares).
  Colinear = o mesmo, sem encontros e com degrau no plano do nó.
- `crates/geom-wasm/src/cortina_juncao_testes.rs`: os testes de propriedade e os dourados (arquivo à parte, incluído por `#[path]`).
- `crates/geom-wasm/src/cortina_pecas.rs`: `resolver_uma` calcula as pontas logo depois do quadro e encurta a cortina (`a` recuado, comprimento menos os
  recuos); o montante de canto substitui os de borda da ponta (`mont_u[0]`/`[nu]` = `None`); `Geom.cantos` leva `PecaCanto` (só a cortina de menor id emite).
- `cortina_malha.rs` (`prisma_simples` com orelhas, canto em `grupos`), `cortina_planta.rs` (contorno do canto, detalhes médio e fino), `cortina_quant.rs`
  (papel 6 `PAPEL_CANTO`: n, comprimento = altura, volume = área em planta × altura).
- `secoes_cortina.rs`: `ExtremidadeLinha` e validação (`validar_extremidades`). `esquema.rs`/`cena-v11.json`/`esquema.gerado.ts`: seção 110 e versão 16.
- TS: `packages/engine/src/cortinaExtremidades.ts` (vizinhança: `endPartners`/`findTee` do projeto, tolerância `settings.joinTolerance`),
  `cortinaProjeto.ts` (envia `CortinaKernel.extremidades`), `kernelCortina.ts` (linhas da seção 110; `flags` bits 2 e 3 da cortina), `kernelCortinaTabelas.ts`.

## Convenções

- Uma linha por ponta, sempre (`vizinha_num` = `ID_AUSENTE` quando não há vizinha). `flags` da ponta: bit 0 `noJoin`, bit 2 a vizinha atravessa (T).
- A vizinha cortina só forma canto se a linha dela aponta de volta, está com a junção ligada e não atravessa; senão esta ponta encosta nela como parede comum.
- Nó com 3 ou mais paredes em direções diferentes: não resolvido na v1 (TS manda a ponta sem vizinha; a cortina termina no eixo do nó). A passante dividida no
  nó (duas candidatas paralelas) vale como T.
- Cortina encurtada a menos de 1 mm pela junção: a junção é ignorada (as duas pontas).
- `angulo` e `lado` são informativos (o Rust só valida o domínio); a geometria vem das faces.
- Convenção do dono para o L invertido: a esquadria espelha, a aba troca de lado junto com a alma (a invertida gira o perfil 180°); já era assim, agora tem teste.

## Testes

- Rust: `cargo test -p geom-wasm` (ver o relatório da entrega para os números). Propriedade: cantos de 30° a 150° em nove ângulos, três pares de profundidades,
  quatro pares de linhas de localização, normal e espelhado; amostragem de 60 000 pontos: nenhum em dois sólidos, nenhum da região ideal do esquadro sem
  sólido, nenhum sólido fora dela. Espelho: recuos e vértices refletidos. Malha do canto fechada e orientada, volume = área × altura. Dourados de planta: L
  entre cortinas a 90°, T com parede comum, canto de 135°. Não sobreposição em (s, z) para L, trapézio e canto (e rect) por amostragem de y (32 profundidades),
  as 16 combinações vertical × horizontal, as duas prioridades, normal e invertida.
- Os fixtures `cortina_paridade*.json` mudaram só na linha `esquemaVersao` (15 para 16), porque o gerador grava `VERSAO_ESQUEMA`; os casos e os números não
  mudaram e a paridade com a referência TS segue passando.
- TS: `cortinaExtremidades.test.ts` (vizinhança e seção 110), `kernelCortina.test.ts`, `quadros.test.ts` (versão 16).

## Pendências

- (Atualizado: o TS já lê `grupos` e os desenha no 3D desde a integração da fase 3b.) O TS NÃO lia `grupos` de `cortina_malha`: o montante de canto e as peças com esquadria (fase 3, parte 1) saem em `grupos` e só aparecem no 3D quando a
  integração do render ler `vertices_av`/`indices_av`. Até lá, no 3D, o canto entre cortinas mostra a fresta do montante (as cortinas já recuaram). A planta e
  as quantidades já usam o canto.
- Aviso `cortina-juncao-sem-vizinha` (§5.8): não implementado.
- UI: o botão de "não unir" da ferramenta de junção já grava `noJoinStart/End` na parede; conferir que a ferramenta aceita clicar na ponta da cortina.
- Regressão visual dos três cantos (aceite da fase 3) e o editor de tipo de montante: partes de UI e render.
- Nó com 3 ou mais paredes.
