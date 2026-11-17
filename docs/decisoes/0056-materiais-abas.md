# Decisão 0056 — Abas de material (identidade, gráficos, aparência, físico e térmico)

Data: 2026-11-17. Status: proposta. Esta decisão ainda não tem aprovação do dono.

**1. Contexto (como é hoje, fatos verificados no código).**
- `Material` (`packages/model/src/types.ts`) tem só `color`, `hatch`, `gloss`, `opacity`, `cost` e `unit`. Não há como guardar descrição, fabricante, padrão de planta separado para corte e superfície, nem propriedades físicas ou térmicas.
- O render lê `color`, `hatch` e `opacity` direto do material, e a rugosidade do 3D é calculada como `1 - gloss * 0.75`. Cada leitura faz sua própria conta.
- Os blocos novos ficam em `packages/model/src/materialBlocks.ts`: `identidade`, `graficos` (sombreamento, superfície e corte), `aparencia` (com textura reservada), `fisico` e `termico`. Todos são opcionais.
- `materialEfetivo(m)` é a leitura que devolve tudo preenchido. Sem blocos, devolve exatamente o que o render lia antes.
- `normalizarMaterial(m)` roda dentro de `migrateProject` e descarta valores inválidos (cor fora de `#rrggbb`, hachura desconhecida, números `NaN` ou infinitos). Material sem blocos passa com a mesma referência.
- `SCHEMA_VERSION` está em 28 (`packages/model/src/types.ts`). Outras linhas de trabalho (ex.: Fase 4 de vistas, decisão 0055) também mexem no schema, e esta decisão não deve competir com elas.

**2. Decisão.**

2.1 *Blocos opcionais em `Material`.* `identidade`, `graficos`, `aparencia`, `fisico` e `termico` são campos opcionais. Ausente = comportamento anterior. Nenhum projeto antigo muda de aparência.

2.2 *Sem bump de `SCHEMA_VERSION`.* Os campos são opcionais e a leitura trata a ausência. Um bump agora colidiria com outras linhas que também sobem a versão. A validação entra em `normalizarMaterial`, que roda sem nova versão, como já ocorre com as fontes de viewport de prancha.

2.3 *Precedência de cor e hachura.* Quando dois valores disputam o mesmo campo, vale a ordem abaixo:
1. o tipo do elemento (por exemplo, a hachura definida no tipo de piso ou de forro);
2. `material.graficos`;
3. `material.color`, `material.hatch` e `material.opacity`, que continuam sendo a reserva;
4. o padrão do tema.

2.4 *Leitura única.* `materialEfetivo(m)` é a única função que lê os campos do material para desenho. Quem desenha não lê `m.color`, `m.hatch` ou `m.gloss` diretamente.

2.5 *Validação na carga.* `normalizarMaterial` descarta valores inválidos na migração, em vez de rejeitar o projeto inteiro. O valor descartado volta à reserva.

2.6 *Fora de escopo nesta decisão.* Os itens abaixo têm ganchos e um marcador `TODO` no código, sem implementação agora:
- textura por imagem no 3D (imagem no zip, UV triplanar, escala real). O campo `aparencia.textura` existe só como dado;
- hachura parametrizável em shader;
- imagem como padrão de planta;
- cálculo térmico no kernel Rust. `fisico` e `termico` são só dados por enquanto, e o kernel (`crates/`) não muda.

Os ganchos com `TODO` no código são a textura por imagem e o cálculo térmico (`materialBlocks.ts`). Os outros itens desta lista ficam registrados só aqui.

**3. Consequências.**
- Projetos existentes não mudam de aparência, porque a ausência dos blocos cai na reserva.
- Um material com blocos inválidos é normalizado na carga, sem erro. O usuário não perde o projeto por causa de um campo ruim.
- Os campos novos não exigem migração própria.
- A parte física e térmica fica só como dado, sem efeito no cálculo, até a etapa do kernel.
- Quem desenha passa a depender de `materialEfetivo`. Qualquer leitura direta de `color`, `hatch` ou `gloss` no render é um desvio e deve ser corrigida.
