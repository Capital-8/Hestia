# Ficha A4b — Caminho: segmento quase nulo e vértice quase coincidente com o ponto de tangência

Modelo: **Haiku 5.5** · Onda 5 · Depende de: A4, A6 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` e `CONTRATO.md` (§2.3). Vale o CONTRATO se algo aqui divergir.

## Contexto
A ficha F1 achou um defeito do motor: na curva de 45° (e, por sorte de sinal, na de 90°), quando o arco começa exatamente no vértice A, o arredondamento a 1 µm produz um segmento de comprimento ~−1,7e-8 m com direção invertida e a malha da varredura vai a ±2,29 m. Origem: `filetarCaminho` (corposCaminho.ts) e `malhaVarredura` (corposMalhaVarredura.ts) tratam pontos praticamente coincidentes como segmentos válidos.

## Faça
1. Em `filetarCaminho`: depois de montar os pontos (retas e arcos), remova pontos consecutivos a distância < 1e-7 m (mantendo o primeiro e o último; se o ponto removido era vértice original, `vertices` aponta para o que sobrou). Nunca devolva segmento de comprimento ~0.
2. Em `malhaVarredura`/`corposQuadro.ts`: ignore segmentos de comprimento < 1e-7 m ao calcular tangentes e quadros (use o segmento vizinho), sem lançar.
3. Testes acrescentados (novos arquivos): caminho (0,0,0)→(0,0,0.5)→(0.5,0,0.5) com raio igual a 0,5 (arco começa no vértice; t = 0,5 = trecho inteiro) não gera segmento ~0 e a malha da varredura tem caixa dentro de [−0,05; 0,55]; caminho de 45° com trecho reto curto (1 µm) idem; volume de ambos dentro de ±1 % do analítico (área × comprimento do eixo). Os testes existentes (A4, A4-cego, A6, A6-cego) continuam verdes.


## Aceitação
Os dois casos novos verdes e os testes cegos existentes sem alteração.

## Arquivos permitidos
- `packages/engine/src/componentes/corposCaminho.ts`
- `packages/engine/src/componentes/corposQuadro.ts`
- `packages/engine/src/componentes/corposMalhaVarredura.ts`
- `packages/engine/src/componentes/corposCaminhoDegenerado.test.ts (NOVO)`

## Proibido
Tudo fora da lista; `crates/**`; testes existentes (só acrescentar); `docs/**`. Não chame ferramentas fora da ficha (nada de criar sessões, listar ou agendar tarefas, interromper sessões).

## Parada
Contrato contraditório ou necessidade de mexer fora da lista: PARE e relate.

## Entrega
Commits pequenos em português e o relatório de `REGRAS.md` §7.
