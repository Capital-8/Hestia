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
2. **Topologia igual.** Mesmo número de peças, furos e itens; mesma identidade e ordem.
3. **Dentro de um limite medido e documentado**, proporcional à área e ao número de peças somadas, com a medição registrada
   (amostra, máximo observado, folga). O limite não é escolhido para fazer o teste passar.
4. **Guarda de erro grosseiro.** Qualquer valor muito acima do limite reprova (garante que um defeito real não passe por
   "arredondamento").

Fora dessas condições a tolerância geral continua: 1 µm de coordenada e 1e-6 m² / m³. Cada nova aplicação desta regra registra a
medição no ADR da sub-etapa; não há exceção implícita.

## Aplicação ao A3c

- Regiões por material e silhueta (`cluster_resolvido`): limite `1e-5 + 5e-4 × área` (máximo observado no estresse: `1e-5 + 4,2e-4 × área`),
  topologia igual (nº de peças e furos), guarda de erro grosseiro de `1e-2 m²`.
- O caso da semente 1, nível 0, material 2 (o `unionClipper` do TS infla a região em 3,5e-3 m² e preenche um entalhe de 3 × 12 cm
  junto a uma parede curva) é defeito do TS: o Rust (2,382905) está a 2e-6 m² da união exata (2,382907). Segue a pendência de
  correção do TS, separada, e o caso fica numa lista de exceções nomeadas do harness (não no limite geral).
- Faixas, `fragment`, `cut` e `raw` não usam esta regra (continuam sob 0048 e as tolerâncias gerais).
