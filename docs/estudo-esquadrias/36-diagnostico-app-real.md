# 36. Diagnóstico no app real: a parede não era recortada pelo contorno

Relato: "paredes não estão sendo recortadas ainda quando o tipo novo de forma entra" (build `npm run build:artifact` + `geom_wasm.wasm` ao lado).
Os e2e wasm (`tests/furo-contorno-*.wasm.test.ts`) passavam porque chamam `buildLevelSolids`/`wallLayerSolid`; o app usa outro caminho.

## Causa raiz [V]

O 3D do app monta as paredes por `buildLevelSolidsComCaixas` (`packages/render/src/model3d/paredesInstanciadas3d.ts`, usado em `scene3d.ts`).
Esse caminho transforma em CAIXA (instância) toda camada cujas faixas são retângulos sem furo. Num vão por contorno as faixas NÃO são
cortadas (o furo é a malha do cliente, `resolveContorno.ts`: os vãos por contorno "deixam de cortar as faixas"), então a camada parece uma
caixa cheia, vira caixa e nunca chega a `wallLayerSolid` → `camadaFurada` → `furarPrisma`. Resultado no navegador: parede inteira, sem
furo nenhum (nem retangular). Medido: `chamadasPrisma = 0` com o cliente instalado, `furosContorno` presente no nível, 3D sem furo.

Correção: a camada de parede com `rw.furosContorno` nunca vira caixa (fica como geometria). Vão retangular e parede sem forma: idêntico.

## O que foi conferido e NÃO era causa [V]

- Cliente real instalado: sim, nas duas threads (principal e worker), com o wasm de `geom_wasm.wasm` ao lado (`iniciarDespachoKernel` instala com os mesmos bytes).
- Fatias A/B: ligadas por padrão em produção (`main.tsx`/`configDoDespacho`); sem flag, localStorage ou URL a ligar.
- Wasm por URL relativa: o worker recebe `urlWasm` absoluta (relativa à página); busca 200. Sem worker (artifact: o `resolveWorker-*.js` dá 404 e o cliente cai para a thread principal) o cliente real é instalado na principal e o furo funciona igual.
- Cache: a chave do sólido da camada inclui `versaoClienteFuro()`; o nível só usa contorno depois do cliente (o pedido espera o wasm: `kernelPendente`).
- Aviso de ambiente do teste: `node_modules` ligado por link ao outro checkout fazia o bundle usar `@hestia/*` de lá (ESQUEMA 20 x 19). Não é do produto.
- Artifact servido sem `<meta charset>` quebra uma regex Unicode do bundle (o publicador do claude.ai envolve com doctype e charset; ao testar à mão, envolva igual).

## Correção e diagnóstico permanente

- `paredesInstanciadas3d.ts`: `rw.furosContorno?.length` impede a caixa.
- `window.__hestiaFuro` (sempre, só leitura): `clienteInstalado()`, `diagnostico()` (chamadas de prisma/retorno, falhas, último erro; falha de instalação também fica em `ultimoErro`) e `worker()` (mesmo diagnóstico, do worker de resolução, se houver).
- `DiagnosticoDespacho.furo` (por thread) e `diagnosticoFuroDoWorker()` em `kernelDespacho.ts`.

## Testes

- `packages/render/src/model3d/wallContornoSolid.test.ts`: sem o conserto a camada vira caixa (falha); com ele, não. Vão retangular segue em caixas, idêntico.
- `tests/furo-contorno-instalacao.wasm.test.ts` (wasm real): `buildLevelSolidsComCaixas` chama `furarPrisma` real e não deixa caixa cheia.

## Como verificar no app real [V]

1. `npm run build:artifact`; sirva `dist/index.html` (ou o artifact envolvido em doctype/charset) com `geom_wasm.wasm` ao lado, URL com `?debug=1`.
2. No console: `__hestiaFuro.clienteInstalado()` deve ser `true`. Insira P-86 ou J-60 numa parede reta, abra o 3D: `__hestiaFuro.diagnostico().chamadasPrisma > 0` e a parede tem o arco.
3. `chamadasPrisma` em 0 com cliente instalado = a camada não passou pelo furo; `ultimoErro` diz o motivo de qualquer falha.

[I] Parede curva, inclinada e com perfil seguem as regras de `rotaDoVao`; não foram reexaminadas aqui.
