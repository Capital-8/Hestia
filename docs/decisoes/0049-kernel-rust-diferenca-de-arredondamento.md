# 0049 — Diferença de arredondamento entre bibliotecas (kernel Rust)

Data: 2026-11-02. Decisão do dono. Generaliza a 0048 (pintor da A2) e fecha a parada do A3c (regiões e silhueta).

## Contexto

O TypeScript usa `polygon-clipping` e Clipper; o Rust usa `i_overlay`. Quando duas bibliotecas diferentes quantizam em inteiros
(1 µm, ou 1 nm no pintor), os vértices de interseção caem em pontos ligeiramente diferentes. Em uma operação isolada o desvio é
menor que 1 µm por vértice; ao somar dezenas de peças (união dos cortes em regiões por material e silhueta) a área final difere em
1e-4 a 3e-4 m² em regiões de 5 a 20 m². Perseguir igualdade abaixo disso exigiria portar a biblioteca do TS (e junto o seu defeito).

## Regra

Uma diferença entre o Rust e a referência TS **não é divergência** quando valem as quatro condições:

1. **Causa só de arredondamento.** Cada lado fica a menos de 1 µm por vértice do resultado exato, ou a diferença encolhe ao usar
   escala mais fina. Registra-se como a causa foi verificada.
2. **Topologia igual nos componentes significativos.** Mesma identidade e ordem de itens; mesmo número de peças e furos entre os
   componentes com área acima do limiar de fiapo (`1e-4 m²` por padrão; ajustável só com medição registrada). Componentes menores
   (fiapos de arredondamento, frestas que o fechamento preenche de um lado e não do outro) são contados à parte, e sua área já
   entra no limite do item 3. Se algum componente acima do limiar não tiver par, é divergência.
3. **Dentro de um limite medido e documentado.** O erro de arredondamento cresce com o comprimento do contorno (cada aresta desloca
   até ~1 grade), não com a área: o limite é `1e-5 + K × perímetro × 1e-6` m², com `K` medido (maior razão observada no estresse,
   fora das exceções nomeadas, com folga de 1,5×) e registrado. O limite não é escolhido para fazer o teste passar.
4. **Guarda de erro grosseiro.** Qualquer valor muito acima do limite reprova (garante que um defeito real não passe por
   "arredondamento").

Fora dessas condições a tolerância geral continua: 1 µm de coordenada e 1e-6 m² / m³. Cada nova aplicação desta regra registra a
medição no ADR da sub-etapa; não há exceção implícita.

## Aplicação ao A3c

- Regiões por material e silhueta (`cluster_resolvido`, `resolver_nivel`): limite `1e-5 + K × perímetro × 1e-6` (K medido; a medição do A3d
  mostrou que o limite por área falha em regiões pequenas de contorno longo, como a do fixture da casa de 2 quartos, 0,083 m²,
  simétrica 6,7e-5 contra limite 5,2e-5, com diferença de área de 2,2e-7), topologia nos componentes acima do fiapo, guarda de erro
  grosseiro de `1e-2 m²`.
- O caso da semente 1, nível 0, material 2 (o `unionClipper` do TS infla a região em 3,5e-3 m² e preenche um entalhe de 3 × 12 cm
  junto a uma parede curva) é defeito do TS: o Rust (2,382905) está a 2e-6 m² da união exata (2,382907). Segue a pendência de
  correção do TS, separada, e o caso fica numa lista de exceções nomeadas do harness (não no limite geral).
- Faixas, `fragment`, `cut` e `raw` não usam esta regra (continuam sob 0048 e as tolerâncias gerais).

## Exceções nomeadas (defeitos do TS, não arredondamento)

Cada exceção é um caso identificado no harness, reproduzível, e só vale se o Rust concordar com a geometria exata (a área do Rust
bate com a união ou interseção exata a 1e-6 m²). Lista inicial:

1. Semente 1, nível 0, material 2 (`unionClipper` infla a região em 3,5e-3 m² e preenche um entalhe de 3 × 12 cm junto a parede
   curva): a exceção cobre a região **e a silhueta do mesmo grupo**, que é derivada da mesma união.
2. Estresse retas, semente 101, parede 18, camada 4 (`polygon-clipping` em `intersection`, no recorte pelo perfil: devolve fatias que
   somam 0,0570 m² num polígono de 0,0494; o Rust soma 0,0494). É o mesmo tipo de defeito da 0048, com ganho de área em vez de perda.

Ambos seguem como pendência separada de correção no TS (subir `VERSAO_MOTOR_GEOMETRIA`).
