# Ligação real do furo por contorno (Rust) de ponta a ponta

Data: 2026-11-18. Continua `24`, `25` e `26`. Marcas: [V] verificado nesta sessão (teste rodado ou código lido, com arquivo:linha); [I] inferência, a validar. Linhas valem para o branch `claude/lucid-bell-hwk4ln` nesta data.

Antes: o furo por contorno só rodava com cliente FALSO (doc 26) e o `.wasm` commitado só tinha `furo_contorno_furar` e `furo_prisma_furar`. Agora o cliente REAL (`furarPrisma` e `retornoDoVao` sobre o Rust) está instalado no carregador do kernel, o retorno e a quantificação têm ABI própria, e o `.wasm` foi regenerado.

## 1. O que foi ligado (arquivo:linha)

| Peça | Onde | O que faz |
|---|---|---|
| ABI de quantificação e retorno (Rust) | `crates/geom-wasm/src/furo_contorno_quant_abi.rs` (novo): `furo_quant_abi_versao` (:179), `furo_quant_vao` (:185), `furo_retorno_vao` (:199), `furo_quant_parede` (:213); núcleo puro `quant_vao_planos` (:86), `retorno_planos` (:115), `quant_parede_planos` (:138), `recuar` (:93) | Mesmo modelo de memória e mesmo estado de saída (`furo_saida_*`, `furo_erro_*`) de `furo_contorno_furar` e `furo_prisma_furar`. `furo_quant_vao` devolve largura, altura, área, perímetro e área do envelope. `furo_retorno_vao` devolve meta (espessura efetiva, limitada, y0, y1, área do anel, área livre, volume, área exposta), vértices e índices. `furo_quant_parede` fura (`furar_parede`) e mede sobre a malha (volume líquido, área de face líquida) por camada. [V] |
| Recuo no Rust | `furo_contorno_quant_abi.rs:93` `recuar` | O `recuo` do pedido (camadas envolventes entre a camada e o núcleo) vira offset do contorno para dentro ANTES do anel (`offset(-recuo)`, exige um polígono sem furo; senão ENTRADA "recuo consome o contorno"). A camada de recuo `r` revestida com espessura `t` ocupa a faixa entre `offset(-r)` e `offset(-r-t)`. [V: anel = 0,97 x 2,07 - 0,93 x 2,03 com recuo 1,5 cm e t = 2 cm; igual ao retorno de um retângulo menor] [I: a semântica "recuo = deslocar o contorno para dentro" é a do doc 26 §3; o caso retangular de `insertReturns` não foi comparado número a número] |
| Validação sem panic | `furo_contorno_quant_abi.rs` (`contorno_de`, `escalar_ok`, limites) e `furo_contorno_abi.rs:72` (`erro_do_furo` passou a `pub(crate)`; única mudança em arquivo existente de ABI) | Limites e finitude antes de ler ponteiros; contorno validado por `validar_anel` (simples, sem ponto repetido, anti-horário) antes de offset ou booleana; escalares limitados a +-1e6 m; modo inválido, recuo negativo, espessura 0 ou NaN, y1 <= y0, contorno com 4097 pontos: ENTRADA ou LIMITE, nunca trap. [V: 11 testes novos em `furo_contorno_quant_abi_testes.rs`; 65 testes `furo_contorno` verdes; e os mesmos caminhos exercitados no wasm32 real pelo cliente TS] |
| Cliente TS da quantificação | `packages/geom/src/furoQuant.ts` (novo): `carregarFuroQuant` (:97), `quantificarVao` (:146), `retornoDoContorno` (:162), `quantificarParede` (:180); exportado em `packages/geom/src/index.ts:37` | Instância própria (~1,1 MB de memória), versão conferida, buffers com `abi2_alocar`, saídas copiadas e liberadas. Erro de entrada: `ErroKernelLeve`; falha interna: `ErroKernelGrave`. [V: `furoQuant.test.ts`, 5 testes] |
| Cliente real da porta | `packages/engine/src/furoClienteReal.ts` (novo): `clienteFuroContornoReal` (:64), `furarPrisma` (:77), `retornoDoVao` (:93), `instalarClienteFuroReal` (:127); exportado em `packages/engine/src/index.ts` | `furarPrisma`: uma chamada `furo_prisma_furar` por pedido, com os anéis pós-junção em [u, s] exatamente como o pedido traz (sem faixas). `retornoDoVao`: `furo_retorno_vao` em modo contorno com o `recuo`. `furarParede`: o da ABI de prisma (`clienteFuroPrisma`). Qualquer falha devolve `null` (o `camadaFurada` recua para faixas retangulares) e erro grave reinstancia o módulo. `diagnosticoFuroReal()` conta chamadas, falhas e reinstanciações. [V] |
| Pré-filtro de vãos | `furoClienteReal.ts:36` `vaosNoEnvelope` | Vão que não toca o envelope (u, z) das camadas do pedido não remove nada e faria a ABI recusar o pedido inteiro (`VaoForaDaParede`): sai antes. Vão que SAI parcialmente do envelope continua recusado pela ABI, e o pedido recua para faixas retangulares. [V pelo código; sem teste dedicado] |
| Instalação no app | `packages/engine/src/kernelDespacho.ts:476` (import em :29), dentro de `iniciarDespachoKernel` | É o único lugar que baixa o `geom_wasm.wasm` (thread principal por `apps/web/src/main.tsx:26` e worker por `worker/servidor.ts:91`, a mesma função). Os mesmos bytes que instanciam o v2 e o v1 instalam o cliente, ANTES de `carregamentoConcluido`/`avisarKernelPendente`, então o pedido que esperou o wasm (`KernelPendente`) já resolve com o cliente. Nunca lança. `apps/web/src/editor/resolveWorker.ts` não muda: só instala o servidor e passa `urlWasm` (o worker chega ao mesmo `iniciarDespachoKernel`). [V: `tests/furo-contorno-instalacao.wasm.test.ts`] |
| Fallback | `furoClienteReal.ts:127` | Módulo sem `furo_prisma_furar`: não instala nada (furo retangular de sempre) e devolve o motivo. Sem `furo_retorno_vao`: instala só `furarPrisma`/`furarParede` (sem retorno). Já há cliente (teste ou outro carregador): não pisa nele. Bytes inválidos: devolve o motivo. [V: 3 testes] |
| Teste e config | `tests/furo-contorno-real.wasm.test.ts`, `tests/furo-contorno-instalacao.wasm.test.ts`; `vitest.wasm.config.ts` (padrão `tests/furo-contorno*.wasm.test.ts`) | Ver §2. |
| `.wasm` regenerado | `packages/geom/assets/geom_wasm.wasm` (3695,9 kB; teto 4 MB), `geom_wasm.sha256`, `geom_wasm.fonte.sha256` | `npm run build:wasm` e `npm run wasm:check` ok (blob e8820fe8fcfd, ABI 1). Nada commitado. [V] |

## 2. O que os testes provam (Rust real, nenhum cliente falso)

`KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm npx vitest run --config vitest.wasm.config.ts tests/furo-contorno` (2 arquivos, 18 testes verdes) [V]. Parede `wt_alv14` de 6 m x 3 m com 5 camadas (2, 20, 140, 20, 2 mm; as quatro externas envolvem), uma porta retangular e um vão com forma, em dois projetos: meia-lua (janela 1,2 m, nascença a 2,1 m) e arco abatido (porta 1,4 x 2,4 com flecha 0,3).

- Cada camada é furada pelo cliente (malhas não nulas, zero falhas, contador de chamadas sobe) e `removido` = área do contorno x espessura da camada, a 1e-9 m3.
- Quantitativo: volume do projeto sem o vão menos o volume com o vão = área do contorno x espessura total (1e-9); contra o mesmo vão retangular, a diferença é exatamente (W x H bruto - área) x espessura; `openingsArea` troca W x H pela área real.
- 3D: o volume de malha do bloco fura o contorno real (= cheio - porta - área x 0,14, a 1e-6) e difere da rota retangular por (W x H - área) x 0,14; concorda com `camadaFurada.volume`.
- Parede nunca sem vão: cliente que responde `null` em tudo recua e dá os MESMOS números do vão retangular (quantitativo a 1e-9, malha 3D a 1e-6).
- Vão retangular: `resolveLevel`, `quantifyLevel`, quadro de esquadrias e malhas 3D idênticos, em JSON, com e sem o cliente real (3 projetos).
- Quadro de esquadrias: `unitArea` = área real do contorno com o cliente e W x H sem ele; a área e o perímetro do Rust (`quantificarVao`) batem com `areaPerimetroDoContorno` do TS a 1e-9.
- Retorno (`closure: both`): um retorno por camada envolvente, volume entre 70 (com recuo) ou 90 (sem recuo) % e 100 % de perímetro x espessura x profundidade; malha com índices válidos, y exatamente na faixa pedida e volume da malha (divergência) = volume do cliente; o quantitativo cresce exatamente pela soma dos retornos.
- `quantificarParede` (Rust): removido = área x espessura total, área do furo na face = área do contorno, volume líquido por camada.
- Regressão: `furoPrisma`, `furoContorno`, `furoClienteEngine`, `furoContornoTroca` (cliente falso), `openingShapeIssues`, `wallContornoSolid`, `simboloContorno`, `kernelDespacho`, `kernelDespachoB`, `worker/servidor` passam (os que dependem do wasm, contra o binário novo). `cargo test --lib furo_contorno`: 65 verdes. `tsc -p tsconfig.json --noEmit`, `eslint` nos arquivos alterados e `check-boundaries` limpos.

## 3. O que ficou de fora (e achados)

- Retorno em canto (recorte contra a parede vizinha no 3D) e retorno de vão que toca o piso (a soleira do `ModoRetorno::Contorno` é revestida mesmo com `soleira = 0`, no arco abatido do teste): como no doc 26 §3, não tratados. [V: o teste do arco abatido gera retorno na base] 
- O retorno é emitido no 3D (`wallContornoSolid.ts:31`, malha do cliente em coordenadas do mundo) [V pela leitura]; a conferência é por volume e geometria de malha, não visual. Sem navegador nesta sessão: o carregamento no app real (worker + `urlWasm`) não foi exercitado, só `iniciarDespachoKernel` com os bytes em Node. [I]
- O quantitativo continua usando `volume / espessura` para áreas de face (doc 26); `furo_quant_parede` existe e foi validada, mas o engine ainda não a chama (a área de face por malha por camada não entrou no `quantities.ts`). [I]
- `areaPerimetroDoContorno` (TS) segue como a conta do quadro e do quantitativo; o Rust (`quantificarVao`) é conferido contra ela nos testes, não a substitui. Mesma fórmula, mesmo polígono.
- Vão que sai parcialmente do envelope de uma camada (por exemplo, camada recortada por piso ou laje que não cobre o vão inteiro) faz a ABI recusar o pedido; a camada recua para faixas retangulares. Não medi a frequência no projeto real. [I]
- A instalação só ocorre quando uma fatia (A ou B) está ligada, porque `iniciarDespachoKernel` só carrega o wasm nesse caso (hoje é o padrão de produção, `preferenciasKernel.ts`). Com as duas desligadas (depuração) o furo segue retangular. [V pelo código]
- Um cliente instalado por um teste (falso) impede a instalação do real; testes de outras suítes que chamam `iniciarDespachoKernel` com o wasm real passam a ter o cliente real instalado no processo (afeta só vãos com forma). [I: nenhum teste existente quebrou nos arquivos rodados; a suíte inteira não foi rodada, por instrução]
- Vista de corte, elevação, IFC e DXF continuam retangulares (doc 26 §3), e a booleana não foi medida em tempo no wasm com contorno de 4096 pontos. [I]
- Tempo e memória: o cliente cria mais duas instâncias do wasm (prisma e quantificação, ~1,1 MB cada) na thread principal e no worker. [V: tamanho inicial da memória]; custo de CPU não medido.

## 4. Como rodar

```
npm run build:wasm && npm run wasm:check
cd crates/geom-wasm && cargo test --lib furo_contorno
KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm npx vitest run --config vitest.wasm.config.ts tests/furo-contorno
KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm npx vitest run packages/geom/src/furoQuant.test.ts packages/geom/src/furoPrisma.test.ts packages/engine/src/furoContornoTroca.test.ts
npx tsc -p tsconfig.json --noEmit && node scripts/check-boundaries.mjs
```
