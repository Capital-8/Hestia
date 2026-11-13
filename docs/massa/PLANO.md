# Plano: massa conceitual (extrusão, mistura, loft, torção, arranjo polar)

Data: 2026-11-13. Estado: **plano aprovado para execução; nada implementado**.
Base conferida: `main` em `236aa298`, `SCHEMA_VERSION = 25`, contrato do kernel `versao 18`, `abi 2`.

Este arquivo é a única fonte do trabalho. Ele serve a três leitores:

- **o fiscal** (a sessão que coordena; pode ser um modelo mais simples): segue a Parte B passo a passo, sem decidir nada de projeto;
- **cada subagente**: recebe o bloco comum (Parte C) mais a sua ficha (Parte D);
- **o dono**: lê a Parte A (o que será entregue) e o §A.9 (o que fica de fora).

Regra de ouro: **tudo o que é decisão de projeto já está decidido na Parte A.** Se algo não estiver escrito aqui, ninguém inventa: o subagente para e relata, o fiscal pergunta ao dono.

---

# Parte A — O que será construído (decisões fechadas)

## A.1 Objetivo e resultado final

Um elemento novo, **Massa** (`kind: 'mass'`), para estudo volumétrico: torres, blocos, torres torcidas, bulbos e conjuntos de pétalas. A massa aparece em **3D, planta, corte, elevação e prancha**, tem **áreas por pavimento** em tabela e gera **pisos, lajes e paredes** a partir das suas fatias.

Pronto significa: o dono cria uma torre torcida, um bulbo e uma flor de 12 pétalas, vê as três em todas as vistas sem erro nem travamento, tira a tabela de áreas por pavimento e gera os pisos e as paredes de um pavimento com um comando, tudo com desfazer.

## A.2 A única primitiva: pilha de seções

Toda massa é uma **pilha de seções horizontais** em cotas crescentes. Não há outro tipo de sólido na v1. As "operações" da interface são só atalhos que montam a pilha:

| Ferramenta da interface | Pilha que ela cria |
|---|---|
| Extrusão | 2 seções com o mesmo perfil (z = 0 e z = altura) |
| Mistura | 2 seções com perfis diferentes |
| Loft | N seções (2 a 64) |
| Bulbo | N seções de círculo com raios diferentes, interpolação suave |
| Torção | não cria seção: escreve a rotação de cada seção |
| Arranjo polar | não cria seção: escreve `arranjo` na instância (N cópias em volta de um centro) |

Motivo: com uma primitiva só, a fatia horizontal em qualquer cota é exata (um anel interpolado), a malha fecha por construção e não é preciso booleana 3D. É isso que garante estabilidade.

## A.3 Modelo de dados (TS exato)

Arquivo novo `packages/model/src/massTypes.ts` (só tipos e constantes). Metros e radianos.

```ts
/** Perfil de uma seção, em coordenadas locais (origem no centro do perfil). */
export type PerfilMassa =
  | { forma: 'circulo'; raio: number }
  | { forma: 'elipse'; rx: number; ry: number }
  | { forma: 'poligono'; lados: number; raio: number }       // regular, inscrito em `raio`; lados 3..64
  | { forma: 'livre'; pontos: Vec2[] };                      // polígono simples, anti-horário, 3..256 pontos, sem arcos

export interface SecaoMassa {
  /** Altura acima da base da massa. A primeira é 0; as demais crescem estritamente (passo mínimo 0,01 m). */
  z: number;
  perfil: PerfilMassa;
  /** Rotação do perfil em torno do seu centro (rad). Diferença máxima entre vizinhas: π. */
  rotacao: number;
  /** Fator de escala do perfil (> 0). */
  escala: number;
  /** Deslocamento do centro do perfil em relação à origem da massa. */
  dx: number;
  dy: number;
}

export interface ArranjoMassa {
  /** Número de cópias, 2..64 (a original conta). */
  n: number;
  /** Centro do giro, em coordenadas de mundo (planta). */
  cx: number;
  cy: number;
  /** Ângulo total coberto (rad); 2π = volta completa (a última cópia não repete a primeira). */
  anguloTotal: number;
}

export interface Mass {
  id: Id;
  kind: 'mass';
  levelId: Id;
  name: string;
  /** Origem em planta (mundo). */
  origem: Vec2;
  /** Deslocamento da base em relação à cota do nível. */
  baseOffset: number;
  /** 2 a 64 seções. */
  secoes: SecaoMassa[];
  /** Como o kernel interpola entre seções. */
  interpolacao: 'linear' | 'suave';
  /** Pontos por anel antes de somar os vértices dos perfis: 16..128, padrão 64. */
  resolucao: number;
  arranjo?: ArranjoMassa;
  color?: string;
  order: number;
}

export const MASSA_LIMITES = {
  secoes: 64, pontosLivre: 256, resolucaoMin: 16, resolucaoMax: 128, resolucaoPadrao: 64,
  copias: 64, passoZMin: 0.01, rotacaoMaxVizinha: Math.PI,
} as const;
```

Decisões do modelo:

1. **Sem `MassType` na v1.** A massa é só instância (como `Room` e `Generic`). Repetição de forma se faz com `arranjo` ou com copiar.
2. `Element` ganha `Mass`. `GraphicsCategory` ganha `'mass'` (visível em planta, corte, elevação e 3D; opacidade 0,35 no 3D).
3. **`SCHEMA_VERSION` 25 → 26** com migração que não altera dados (protege versões antigas do app). Se a `main` já tiver passado de 25 quando o agente M1 começar, usa-se o número seguinte.
4. Comandos (todos com desfazer): `addMass`, `updateMass` (patch parcial), `removeMass` pelo comando genérico de apagar, `setMassSecoes`, `setMassArranjo`. O `transform` genérico leva `'mass'`: translação move `origem` (e `arranjo.cx/cy`); rotação soma o ângulo a **todas** as `rotacao` e gira `origem`, `dx/dy` e o centro do arranjo; espelho inverte o sentido dos pontos e o sinal das rotações.
5. Validação no modelo (`massIssue(m): string | null`, usada por `addMass`/`updateMass`, que **recusam** massa inválida): número de seções, z crescente com primeira em 0, dimensões > 0, `livre` simples e anti-horário (o comando normaliza o sentido), `escala > 0`, `resolucao` e `arranjo.n` dentro dos limites, diferença de rotação entre vizinhas ≤ π.

## A.4 Regras de geometria (o kernel Rust segue exatamente isto)

1. **Parâmetro do anel.** Cada perfil é uma curva fechada parametrizada por `t ∈ [0, 1)`: comprimento de arco normalizado, anti-horário, começando no ponto em que a semirreta +x local (a partir do centro) cruza o perfil.
2. **Conjunto comum de parâmetros `T`.** `T` = grade uniforme de `resolucao` pontos **mais** o parâmetro de cada vértice de cada perfil `poligono`/`livre` de todas as seções da massa (assim as quinas ficam vivas). Parâmetros a menos de `1e-9` um do outro são fundidos. Limite: `|T| ≤ 512`; passou, erro `LIMITE`.
3. **Anel de uma seção.** Para cada `t ∈ T`: ponto local do perfil × `escala`. Depois rotação `rotacao`, depois soma `(dx, dy) + origem`.
4. **Entre duas seções.** Interpolam-se **em separado**: os pontos locais já escalados (por `t`), a `rotacao`, o `dx` e o `dy`. Só depois se aplica a rotação e a translação. **Nunca** interpolar pontos de mundo (isso encolheria a torre torcida). `linear`: interpolação linear em z. `suave`: PCHIP (cúbica monótona de Fritsch-Carlson) em z, por coordenada; não gera ultrapassagem, então raio não fica negativo.
5. **Anéis intermediários da malha** entre as seções k e k+1: `n = max(1, ceil(|Δrot| / passoRot), n_forma)`, onde `n_forma = ceil(Δz / passoZ)` se a interpolação é `suave` ou os perfis diferem, senão 1. Por `lod`: 0 → 15° e 3 m; 1 → 5° e 1 m; 2 → 2,5° e 0,5 m. Teto: 256 por trecho e 2048 anéis por cópia (`LIMITE`).
6. **Malha.** Lateral: um quadrilátero por par de anéis e par de `t` vizinhos, dividido em 2 triângulos sempre pela mesma diagonal. Tampas: triangulação por orelhas do anel da base (normal para baixo) e do topo (normal para cima). A malha é fechada por construção: cada aresta pertence a exatamente 2 triângulos, normais para fora.
7. **Arranjo.** Cópia `i` (0..n-1) = a massa girada `i · anguloTotal / n` em torno de `(cx, cy)`. Cada cópia é uma casca separada. **Sem booleana entre cópias na v1.**
8. **Fatia horizontal na cota z** (planta, áreas, pisos, paredes): é o anel interpolado pela regra 4, calculado direto das seções, **independente do `lod` e da malha**. Um anel por cópia.
9. **Corte vertical** (corte e elevação), saída em `(s, z)` como o `guarda_corte`:
   - **cortado** (estilo 0): interseção do plano com a malha `lod 2`. Triângulo com vértice exatamente no plano conta como do lado positivo (regra única, garante laços fechados). Os segmentos são encadeados em polígonos fechados por extremidade quantizada em `1e-7`.
   - **projetado** (estilo 1), para a parte no lado visível até `profundidade`: contorno = faixa entre `s_min(z)` e `s_max(z)` dos pontos visíveis de cada anel (amostrado nos anéis da malha `lod 2`). Mais as **linhas de feição**: uma linha horizontal em cada seção do usuário e a curva de cada vértice de perfil (`t` de quina) cuja normal aponta para o observador.
   - Limitação aceita e documentada: anel côncavo cortado pelo plano pode ter a projeção um pouco maior que a real.
10. **Planta** na cota de corte `corte_z`, com faixa de vista `[z_min, z_max]`: anel cortado (estilo 0); anéis das **seções do usuário** abaixo do corte e dentro da faixa (estilo 1, linha fina); anéis das seções acima do corte (estilo 2, tracejado). Sem união 2D.
11. **Quantidades.** Volume pelo teorema da divergência sobre a malha `lod 2`; área lateral, da base e do topo; altura. Por pavimento: área e perímetro da fatia na cota de cada nível do projeto que cai dentro da massa, **somados por cópia**.
12. **Avisos do kernel** (não bloqueiam): `1` anel autointersecta (testado em cada seção do usuário e no meio de cada trecho); `2` cópias do arranjo se sobrepõem numa cota de nível (a área pode contar em dobro); `3` limite atingido; `4` face lateral com inclinação maior que 5° da vertical em algum pavimento (informativo, usado por "Paredes da massa").
13. **Determinismo.** Mesmas seções de entrada, mesmos bytes de saída. Ordem: `massa_num`, cópia, anel, `t`. Nenhum `NaN` ou infinito nas saídas (entrada com `NaN` é `ENTRADA`).

## A.5 Contrato TS ↔ Rust

Em `crates/geom-wasm/schema/cena-v11.json`. **Faixa reservada à massa: seções 140 a 159 e consultas 140 a 159** (livres hoje; em uso: seções 1–25, 60–81, 100–113; consultas 1–16, 60–65, 100–107). `versao` 18 → 19 (se outra frente já usou 19, usa-se a seguinte; os **ids** não mudam). `abi` continua 2. Mesmo esquema das outras frentes: `id_num u32` como chave, `definir_secao`/`upsert`/`remover`.

Seções de entrada:

| id | nome | colunas |
|---|---|---|
| 140 | `massas` | `id_num u32, nivel_num u32, ox f64, oy f64, z_base f64, interp u8 (0 linear, 1 suave), resolucao u32, arr_n u32 (1 = sem arranjo), arr_cx f64, arr_cy f64, arr_ang f64` |
| 141 | `massa_secoes` | `id_num u32, massa_num u32, ordem u32, z f64, forma u8 (0 círculo, 1 elipse, 2 polígono, 3 livre), p1 f64, p2 f64, lados u32, rot f64, escala f64, dx f64, dy f64` (`p1`/`p2`: raio; rx, ry; raio do polígono) |
| 142 | `massa_pontos` | `id_num u32, secao_num u32, ordem u32, x f64, y f64` (só perfil livre) |

Consultas (todas com `nivel_num`, `NIVEL_TODOS` aceito; a consulta 142 lê também a seção existente `niveis`):

| id | nome | args | saídas |
|---|---|---|---|
| 140 | `massa_malha` | `nivel_num, lod` | `grupos u32 [massa_num, copia, papel (0 lateral, 1 base, 2 topo), primeiro_indice, n_indices]`, `vertices f64 [x, y, z]`, `indices u32` |
| 141 | `massa_planta` | `nivel_num, corte_z, z_min, z_max` | `linhas u32 [massa_num, copia, estilo (0 cortado, 1 projetado, 2 acima), n_pontos]`, `pontos f64 [x, y]` |
| 142 | `massa_fatias` | `nivel_num` | `fatias u32 [massa_num, copia, nivel_alvo_num, n_pontos]`, `pontos f64 [x, y]`, `valores f64 [area, perimetro, z]` |
| 143 | `massa_corte` | `nivel_num, ox, oy, dx, dy, profundidade` | `linhas u32 [massa_num, copia, estilo (0 cortado, 1 projetado, 3 feição), n_pontos]`, `pontos f64 [s, z]` |
| 144 | `quant_massa` | `nivel_num` | `linhas u32 [massa_num]`, `valores f64 [volume, area_lateral, area_base, area_topo, altura]` |
| 145 | `massa_avisos` | `nivel_num` | `avisos u32 [massa_num, codigo, copia, indice]`, `valores f64 [medido, limite, x, y, z]` |

Regras: o Rust só lê as seções (não conhece `Project`); o adaptador TS é `packages/engine/src/kernelMassa.ts`; o esquema TS é regenerado por `scripts/gerar-esquema-kernel.mjs`; os testes `contrato_confere_com_json` (Rust) e `esquema.test.ts` (TS) cobrem os ids novos. **Sem dependência nova** em `Cargo.toml` nem em `package.json` (precisa de aprovação do dono).

**Kernel desligado ou com erro:** a massa continua no modelo; planta e 3D mostram só o contorno da base (tracejado) e o painel de avisos mostra `massa-sem-kernel` ou `massa-invalida`. **Nenhum caminho TS gera a geometria da massa** (sem segunda fonte da verdade).

## A.6 Interface

Aba **Massa e terreno** (hoje toda `soon` em `apps/web/src/ui/ribbon/tabsSoon.ts`): só os botões abaixo viram reais; o resto continua `soon`.

| Painel | Botão | Ação |
|---|---|---|
| Modelo de massa | **Extrusão** | Ferramenta: desenhar perfil (círculo, elipse, polígono regular ou livre por cliques) e altura |
| | **Mistura** | Idem, com perfil da base e do topo |
| | **Loft** | Cria com 2 seções e abre o diálogo "Seções da massa" |
| | **Bulbo** | Centro, raio máximo e altura; cria 5 seções de círculo, suave |
| | **Mostrar massa** | Liga e desliga a categoria `mass` na vista ativa |
| Modelo por massa | **Pisos da massa** | Diálogo: níveis, piso ou laje, tipo; cria um por nível |
| | **Paredes da massa** | Diálogo: níveis, tipo de parede, tolerância; cria as paredes do contorno |

Outros pontos da interface:

- **Propriedades** (`MassProperties.tsx`): nome, nível, deslocamento da base, altura total (somente leitura), interpolação, resolução, **Torção total (graus)** (campo que distribui a rotação linearmente pelas seções), **Arranjo polar** (ligar, número de cópias, centro, ângulo), cor, botão **Editar seções…**.
- **Diálogo "Seções da massa"**: tabela com uma linha por seção (altura, forma, dimensões, rotação em graus, escala, dx, dy), adicionar, remover, duplicar, e prévia ao vivo (planta das seções sobrepostas). Aplicar = um passo de desfazer.
- **Navegador**: categoria "Massas".
- **Tabela "Massas por pavimento"** com CSV: massa, nível, área, perímetro; rodapé com volume e áreas totais.
- **Textos**: pt e en, pelo sistema de i18n existente (chaves `md_ms_*`, `tl_ms_*`, `ui_ms_*`), valores exibidos pela unidade do projeto (`formatQuantity`).

## A.7 Derivação (massa vira projeto)

- **Pisos da massa**: para cada nível escolhido, a fatia (união 2D das cópias, com `@hestia/geom`) é simplificada (Douglas-Peucker, tolerância padrão 5 mm) e vira o contorno **estático** de um `Floor` ou `Slab`. Uma transação, um desfazer. Sem vínculo automático na v1: mudar a massa não muda o piso; o comando pode ser rodado de novo (apaga os gerados antes por essa massa e nível, guardados em `origemMassa?: { massaId: Id; nivelId: Id }`, campo opcional novo em `Floor` e `Slab`).
- **Paredes da massa**: para cada nível escolhido, o contorno simplificado (tolerância padrão 5 cm, segmento mínimo 0,40 m) vira uma cadeia de paredes retas do tipo escolhido, da cota do nível até o nível de cima (ou até o topo da massa), com `origemMassa` igual. As junções saem do motor de paredes existente. Torção aparece como degrau por pavimento. Onde o aviso 4 acusa face inclinada, o diálogo mostra "a parede vertical aproxima uma face inclinada".

## A.8 Critérios de estabilidade (valem para todas as fases)

1. Nenhuma entrada do usuário derruba o app: massa inválida é recusada pelo comando; erro do kernel vira aviso e desenho de reserva.
2. Fuzz: 200 massas aleatórias válidas (semente fixa) → malha fechada (cada aresta em 2 triângulos), volume > 0, saídas finitas, laços de corte fechados, mesma saída em duas execuções.
3. Valores de referência (fixtures de A.10) dentro das tolerâncias escritas.
4. Cache por assinatura, como a cortina: editar uma massa não recalcula as outras; mudar só a cor não recalcula geometria.
5. Tempo (medir e registrar no ESTADO; alvo, não bloqueio, salvo acima do dobro): flor de 12 pétalas, `massa_malha lod 1` ≤ 50 ms; `massa_corte` ≤ 50 ms; `massa_planta` ≤ 10 ms.
6. 3D: massa em lote transparente posterior sem escrita de profundidade (como o vidro da cortina); seleção, realce e picking funcionam; sem tremor entre tampa e laje.
7. Desfazer/refazer, copiar/colar, salvar/abrir e migração cobertos por teste.
8. E2E com navegador: as três massas de referência abertas em planta, corte, elevação, 3D e prancha, sem erro no console.

## A.9 Fora desta entrega (não fazer, mesmo que pareça fácil)

Booleana entre massas (unir, subtrair); NURBS e superfície livre; varredura por caminho; revolução de perfil não monótono (toro); arcos no perfil livre; `MassType`; fachada em painéis e telhado ou forro por face; vínculo automático massa → piso/parede; terreno e lote; importação de massa por IFC/OBJ; edição por alças no 3D (alças só em planta: origem e vértices do perfil livre da base).

## A.10 Massas de referência (fixture única, usada por todas as fases)

Arquivo `packages/engine/src/fixtureMassa.ts` (TS) e o equivalente em `crates/geom-wasm/src/massa_fixture.rs` (Rust, só em teste). Todas com origem (0, 0), resolução 64, salvo indicação.

| Id | Descrição | Valores esperados |
|---|---|---|
| **M1 caixa** | livre retângulo 10 × 6, extrusão 9 m, linear | volume 540 exato (1e-9); fatia em z = 3: área 60, perímetro 32 |
| **M2 cilindro** | círculo r = 5, extrusão 12 m | área da fatia = área do polígono inscrito com `|T|` pontos (1e-9); volume = essa área × 12 |
| **M3 torre torcida** | polígono 4 lados raio 5,657 (lado 8), 30 m, rotação 0 → π/2, linear | toda fatia com área 64 (1e-6); volume da malha `lod 2` = 1920 ± 0,5% |
| **M4 bulbo** | círculos r = 3; 5; 6; 4; 1,5 em z = 0; 4; 8; 12; 15, suave | raio da fatia nunca negativo nem maior que 6 + 1e-9; raio em z = 8 igual a 6 |
| **M5 flor** | M4 no centro mais uma pétala: livre em gota (8 pontos), 4 seções inclinadas para fora, arranjo n = 12, centro (0, 0), 2π | 12 cópias; cópia `i` = cópia 0 girada `i · 30°` (1e-9); aviso 2 presente se as pétalas se tocam |

---

# Parte B — Manual do fiscal

Você coordena. **Você não implementa as fichas.** Seu trabalho: lançar um agente por vez, conferir o que ele entregou com os comandos abaixo, mesclar ou devolver, e registrar o estado.

## B.1 Regras do fiscal

1. **Um agente por vez**, na ordem de B.4. Só há paralelismo onde B.4 diz "em paralelo", e mesmo assim é opcional: na dúvida, sequencial.
2. **Nunca confie no relatório do agente.** Rode você mesmo os comandos do portão (B.3).
3. **Não mude a Parte A.** Se um agente disser que uma regra da Parte A não funciona, pare e pergunte ao dono com o trecho exato e a evidência.
4. **Correções suas só se forem pequenas** (até cerca de 20 linhas, sem mudar comportamento: import esquecido, linha do `index.ts`, texto de i18n). O resto volta para o agente.
5. **Devolução:** no máximo 2 por ficha, sempre com a saída exata do comando que falhou. Na terceira falha, pare e relate ao dono.
6. **Registre tudo** em `docs/massa/ESTADO.md` (modelo em B.6) depois de cada ficha. Se a sessão reiniciar, é por ele que você retoma.
7. **Git:** todo o trabalho entra na branch `claude/youthful-dirac-l4egd1`. Não crie pull request sem o dono pedir. Faça `git push -u origin claude/youthful-dirac-l4egd1` depois de cada mescla aprovada.
8. **Nada de atalho para ficar verde:** não desligue teste, não aumente tolerância, não mexa em `eslint.config.js`, `vitest*.config.ts`, `scripts/check-*.mjs` nem em workflows.

## B.2 Passo 0 (antes da primeira ficha)

1. `git status` limpo e `git log -1` na branch certa.
2. `npm ci` (se `node_modules` não existir).
3. Rode a linha de base e **anote no ESTADO o resultado de cada comando** (passou, falhou, não roda neste ambiente):
   ```
   npm run typecheck
   npm run lint
   npm run test:rapido
   CARGO_TARGET_DIR=/tmp/hestia-target-massa cargo test -p geom-wasm --manifest-path crates/geom-wasm/Cargo.toml
   npm run build:wasm
   npm run wasm:check
   npm run test:wasm
   ```
   O portão de cada ficha compara com esta linha de base: **nenhum comando que passava pode passar a falhar, e a contagem de testes não pode cair.** Comando que já falhava na linha de base é relatado ao dono antes de começar.
4. Pergunte ao dono, uma vez: qual modelo usar nos subagentes. Recomendação: o mais forte disponível nas fichas R1, R2, R3 e V3; o padrão nas demais.
5. Crie `docs/massa/ESTADO.md` e faça o commit dele.

## B.3 Ciclo de cada ficha

**Lançar.** Use a ferramenta de agente com `isolation: "worktree"` e `subagent_type: "general-purpose"`. O prompt é, nesta ordem e sem resumir: (1) o **bloco comum** da Parte C, inteiro; (2) a **ficha** da Parte D, inteira; (3) a frase "Leia `docs/massa/PLANO.md` Parte A antes de escrever código."

**Conferir** (no worktree ou na branch que o agente devolveu):

1. **Escopo:** `git diff --stat <base>...<branch-do-agente>`. Todo arquivo alterado tem de estar na lista "Pode tocar" da ficha. Arquivo fora da lista = devolução (salvo linha de export em `index.ts`).
2. **Trapaça:** nenhum resultado nestes comandos sobre o diff:
   ```
   git diff <base>...<branch> | grep -nE "^\+.*(\.skip\(|\.only\(|it\.fails|xit\(|eslint-disable|@ts-ignore|@ts-expect-error|as any|console\.log|#\[ignore\]|todo!\(|unimplemented!\()"
   git diff <base>...<branch> --stat -- eslint.config.js "vitest*.config.ts" scripts/check-*.mjs .github package.json crates/geom-wasm/Cargo.toml
   ```
   Teste apagado ou tolerância afrouxada em arquivo de teste existente também é devolução (olhe as linhas `-` dos `.test.ts`).
3. **Portão geral:** `npm run typecheck && npm run lint && npm run test:rapido`. Fichas que tocam Rust: também `cargo test`, `cargo clippy -- -D warnings` (com o mesmo `CARGO_TARGET_DIR`), `npm run build:wasm`, `npm run wasm:check`, `npm run test:wasm`.
4. **Portão da ficha:** os comandos e os valores da seção "Aceite" da ficha.
5. **Lixo:** `node scripts/check-lixo.mjs`.

**Decidir.**

- Tudo verde → `git merge --no-ff <branch>` na branch de trabalho, rode o portão geral de novo, `git push`, atualize o ESTADO.
- Algo vermelho → devolva ao **mesmo** agente (continuação, não agente novo) com: o comando, a saída colada e a frase "corrija só isto, sem ampliar o escopo".
- Agente pede decisão de projeto → pare, pergunte ao dono, registre a resposta no ESTADO e na Parte A (como emenda datada).

## B.4 Ordem das fichas

```
Fase 0  fundação        M1 → M2
Fase 1  kernel Rust     R1 → R2 → R3
Fase 2  motor e vistas  E1 → V1 → V2 → V3        (V1 e V2 podem ir em paralelo)
Fase 3  ferramentas     T1 → U1 → U2             (U1 e U2 podem ir em paralelo)
Fase 4  derivação       D1 → D2
Fase 5  saída e fecho   X1 → Q1
```

Portões de fase (além do portão de cada ficha; o fiscal confere e anota):

- **Fim da fase 1:** os valores de A.10 batem nos testes Rust; fuzz de A.8 item 2 verde.
- **Fim da fase 2:** `npm run dev`, abrir o app com o projeto de referência das massas (fixture carregada por script do E2E) e tirar captura de planta, corte, elevação e 3D. Olhe as imagens: as três massas aparecem em todas. Guarde em `docs/massa/evidencias/fase2/`.
- **Fim da fase 3:** o roteiro manual de B.5 funciona do começo ao fim pelo E2E.
- **Fim da fase 5:** A.8 inteiro conferido, item por item, no ESTADO.

## B.5 Roteiro de aceite final (o E2E da ficha Q1 automatiza)

1. Extrusão de um quadrado de 8 m, altura 30 m. Torção total 90°. A planta de cada nível mostra o quadrado girado.
2. Bulbo de raio 6 m e altura 15 m.
3. Loft de uma pétala, arranjo polar de 12 em volta do bulbo.
4. Abrir corte, elevação, 3D e uma prancha com as quatro vistas. Sem erro no console.
5. Tabela "Massas por pavimento": a torre mostra 64 m² em todos os níveis.
6. "Pisos da massa" e "Paredes da massa" num nível da torre. Um Ctrl+Z desfaz cada um.
7. Salvar, reabrir: tudo igual. Desligar o kernel: aparece o aviso e o contorno de reserva, sem travar.

## B.6 Modelo do `docs/massa/ESTADO.md`

```
# Massa conceitual: estado
Linha de base (data, commit): typecheck ✔ | lint ✔ | test:rapido N arquivos / N testes | cargo test N | wasm ✔/✘
Modelo dos subagentes: ...

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
| M1 | pendente / em curso / mesclada / parada | | 0 | |
...
## Decisões do dono durante a execução (data, pergunta, resposta)
## Pendências conhecidas
## Tempos medidos (A.8 item 5)
```

---

# Parte C — Bloco comum (vai inteiro no prompt de todo subagente)

```
REGRAS (valem para toda a tarefa)

1. Você trabalha no repositório Hestia, SOMENTE no diretório atual (um git worktree próprio). Não leia para alterar
   nem rode comandos em outros diretórios. Não faça push, não crie pull request, não troque de branch.
2. Antes de codar leia: docs/massa/PLANO.md (Parte A inteira e a sua ficha), docs/contratos/familias-e-ferramentas.md,
   docs/contratos/trabalho-de-agentes.md. A Parte A é lei: não mude modelo, contrato, regra de geometria nem escopo.
   Se uma regra parecer errada ou faltar informação, PARE e relate; não invente.
3. Toque só nos arquivos da lista "Pode tocar" da sua ficha. Exceção única: a linha de export no index.ts do pacote.
   Nunca edite: package.json, Cargo.toml (dependências), eslint.config.js, vitest*.config.ts, scripts/check-*.mjs,
   .github/, docs/paridade/ORDEM.json, docs/07-STATUS-V1.md, docs/massa/PLANO.md, docs/massa/ESTADO.md.
4. Estilo: código, comentários e textos em português, como os arquivos vizinhos. Limite de 420 linhas por arquivo
   (ESLint max-lines): arquivo perto do limite se divide, não se espreme. Siga o padrão do guarda-corpo e da parede
   cortina (arquivos gc_*, cortina_*, guardaCorpo*, cortina*), que são o molde desta frente.
5. Proibido: dependência nova; .skip, .only, it.fails, #[ignore]; eslint-disable; @ts-ignore; `as any`; console.log;
   todo!()/unimplemented!(); apagar ou afrouxar teste existente; arquivo de depuração no repositório.
6. Toda função nova tem teste ao lado. Texto de interface passa pelo i18n (pt e en) e número exibido por formatQuantity.
7. Rust: compile com CARGO_TARGET_DIR=/tmp/hestia-target-massa. Nunca deixe crates/*/target no worktree.
8. Commits pequenos na branch atual. Faça `wip: ...` a cada marco que passe em typecheck e nos testes do pacote
   (o contêiner pode reiniciar). O último commit é `feat(massa): ...`.
9. Antes de terminar, rode e deixe verde: npm run typecheck ; npm run lint ; npm run test:rapido ; e os comandos do
   "Aceite" da sua ficha. Se tocou Rust: cargo test -p geom-wasm, cargo clippy -- -D warnings, npm run build:wasm,
   npm run wasm:check, npm run test:wasm.
10. RELATÓRIO FINAL obrigatório, neste formato:
    - Branch e hash do último commit.
    - Arquivos criados e alterados.
    - Resultado de cada comando do item 9 (cole a linha de resumo de cada um).
    - Cada item do "Aceite" da ficha: feito / não feito, com o nome do teste que prova.
    - Decisões que tomou que não estavam escritas (deveria ser nenhuma) e dúvidas.
    - O que NÃO foi feito. Não declare sucesso sem ter rodado os comandos.
```

---

# Parte D — Fichas dos subagentes

Cada ficha tem: objetivo, depende de, pode tocar, passos, aceite. "Molde" é o arquivo existente a imitar.

## Fase 0 — Fundação

### M1 · Modelo, comandos e migração (TS)

- **Depende de:** nada.
- **Pode tocar:** `packages/model/src/` (novos `massTypes.ts`, `mass.ts`, `massCommands.ts`, `validateMass.ts` e testes; `types.ts`, `commands.ts`, `migrate.ts`, `graphics.ts`, `elementLevel.ts`, `index.ts`, i18n do modelo); e, **só para o projeto voltar a compilar**, os arquivos que têm `Record<Element['kind'], …>` ou `switch` exaustivo sobre `kind` em `packages/*` e `apps/web/src`.
- **Passos:**
  1. Criar os tipos de A.3 exatamente como escritos. `Element` ganha `Mass`; `GraphicsCategory` ganha `'mass'`.
  2. `massIssue`, `addMass`, `updateMass`, `setMassSecoes`, `setMassArranjo` e o caso `'mass'` no `transform` (A.3 item 4).
  3. `SCHEMA_VERSION` + 1 com migração sem alteração de dados; teste de ida e volta em `esquema.test.ts`.
  4. Rodar `npm run typecheck` e, em **cada** ponto que quebrar por kind novo, pôr a entrada mínima: nos contratos (`contratoModificacao.test.ts`, `contratoSnaps.test.ts`, `extensaoDoModelo.ts`) usar `null` / `entra: false` com o motivo `"massa: ficha T1"` ou `"massa: ficha V2"`. Não implementar comportamento de vista nem de ferramenta aqui.
- **Aceite:**
  - Testes novos: validação (um caso por regra de A.3 item 5), cada comando com desfazer e refazer, `transform` (mover, girar 90°, espelhar) e migração.
  - `npm run typecheck`, `npm run lint`, `npm run test:rapido` verdes; contagem de testes só sobe.
  - Lista, no relatório, de todos os pontos onde entrou marcador `"massa: ficha …"`.

### M2 · Contrato do kernel (JSON, esboços Rust, esquema TS)

- **Depende de:** M1.
- **Pode tocar:** `crates/geom-wasm/schema/cena-v11.json`; `crates/geom-wasm/src/esquema.rs`, `lib.rs`, `abi2.rs`, `consultas.rs` (só o registro dos ids novos); `packages/geom/src/kernel/v2/esquema.gerado.ts` (regenerado pelo script) e os testes de contrato dos dois lados.
- **Passos:** declarar as seções 140–142 e as consultas 140–145 de A.5, coluna por coluna; subir `versao`; acrescentar ao `$comentario` o parágrafo da versão nova (o que entrou; "consultas ainda sem implementação devolvem `NAO_IMPLEMENTADO`"); regenerar o esquema TS; deixar as seções aceitando `definir_secao` e as consultas devolvendo `NAO_IMPLEMENTADO`.
- **Aceite:** `contrato_confere_com_json` e `esquema.test.ts` verdes cobrindo os ids novos; todos os testes de kernel existentes verdes; nenhuma seção ou consulta antiga alterada (`git diff` do JSON só acrescenta).
- **Depois desta ficha o contrato fica congelado.** Mudança de coluna exige emenda na Parte A aprovada pelo dono.

## Fase 1 — Kernel Rust

Moldes: `gc_tipos.rs`, `gc_malha.rs`, `gc_planta.rs`, `gc_corte.rs`, `gc_quant.rs`, `gc_avisos.rs`, `secoes_gc.rs`.

### R1 · Perfil, pilha de seções e malha (`massa_malha`)

- **Depende de:** M2.
- **Pode tocar:** novos `crates/geom-wasm/src/massa_tipos.rs`, `massa_perfil.rs`, `massa_pilha.rs`, `massa_malha.rs`, `massa_fixture.rs`, `secoes_massa.rs`, `massa_testes*.rs`; registro em `lib.rs`, `consultas.rs`, `cena.rs`; `tests/kernel-massa-malha.wasm.test.ts`.
- **Passos:** leitura das seções 140–142 com validação (`ENTRADA`); A.4 regras 1 a 7 e 13; consulta 140.
- **Aceite (testes Rust nomeados):**
  - `m1_caixa_volume_exato`, `m2_cilindro_area_do_poligono`, `m3_torcida_area_constante`, `m4_bulbo_sem_ultrapassagem`, `m5_copias_sao_rotacoes` com os valores de A.10.
  - `malha_fechada`: em M1–M5 e nos três `lod`, cada aresta em exatamente 2 triângulos, orientação coerente.
  - `interpola_parametros_nao_mundo`: em M3, o raio do anel do meio é igual ao das pontas (1e-9).
  - `fuzz_200`: A.8 item 2 (malha, volume, finitos, determinismo).
  - `limites`: `|T|` > 512 e mais de 2048 anéis devolvem `LIMITE`; `NaN` devolve `ENTRADA`.
  - Teste WASM chama a consulta 140 pela ABI real e confere contagens de M1.

### R2 · Fatias, planta, quantidades e avisos

- **Depende de:** R1.
- **Pode tocar:** novos `massa_fatia.rs`, `massa_planta.rs`, `massa_quant.rs`, `massa_avisos.rs` e testes; registro em `consultas.rs`, `secoes_massa.rs`; `tests/kernel-massa-planta.wasm.test.ts`.
- **Passos:** A.4 regras 8, 10, 11 e 12; consultas 141, 142, 144 e 145.
- **Aceite:**
  - `fatia_independe_de_lod`: a fatia não muda quando o `lod` muda.
  - `m1_fatia_z3` (área 60, perímetro 32), `m3_fatias_64` (todas as cotas de nível), `m4_raio_em_z8`.
  - `planta_estilos`: em M3 com corte a 1,20 m, um anel estilo 0, o da base estilo 1 e os de cima estilo 2.
  - `quant_bate_com_malha`: volume da consulta 144 igual ao da malha `lod 2`.
  - `aviso_anel_autointersecta`, `aviso_copias_sobrepostas`, `aviso_face_inclinada`: um caso positivo e um negativo cada.
  - Fuzz estendido: saídas finitas e determinísticas nas quatro consultas.

### R3 · Corte e elevação (`massa_corte`)

- **Depende de:** R2.
- **Pode tocar:** novos `massa_corte.rs`, `massa_corte_testes.rs`; registro em `consultas.rs`; `tests/kernel-massa-corte.wasm.test.ts`.
- **Passos:** A.4 regra 9, com o formato de `(s, z)` e a convenção de lado visível idênticos aos do `guarda_corte` (ler `gc_corte.rs` antes).
- **Aceite:**
  - `m1_corte_pelo_meio`: um polígono cortado, retângulo 6 × 9 (ou 10 × 9, conforme a direção), área exata.
  - `m2_corte_pelo_eixo`: largura do polígono = diâmetro do polígono inscrito.
  - `lacos_fechados_fuzz`: 200 massas × 4 planos, todo laço cortado fecha e tem área > 0.
  - `plano_no_vertice`: plano passando exatamente por vértices e arestas de M1 ainda devolve laço fechado.
  - `elevacao_m1`: plano fora da massa com profundidade grande → nenhum polígono cortado, contorno projetado igual ao retângulo da fachada.
  - `feicoes_m3`: aparecem as linhas das seções do usuário e as curvas das quinas voltadas ao observador.
  - Tempo de `massa_corte` em M5 registrado no relatório.

## Fase 2 — Motor e vistas (TS)

### E1 · Adaptador e serviço no motor

- **Depende de:** R3.
- **Pode tocar:** novos `packages/engine/src/kernelMassa.ts`, `massaProjeto.ts`, `massaServico.ts`, `massaIssues.ts`, `massaQuantities.ts`, `fixtureMassa.ts` e testes; `index.ts`; os pontos de despacho do kernel que listam frentes (molde: como `kernelCortinaServico.ts` e `cortinaProjeto.ts` são ligados).
- **Passos:** `Project` → seções 140–142; envio por diferença e cache por assinatura (A.8 item 4); funções `malha`, `planta`, `fatias`, `corte`, `quantidades`, `avisos`; avisos `massa-sem-kernel` e `massa-invalida` no painel de avisos; `fixtureMassa.ts` com M1–M5.
- **Aceite:** teste WASM de integração com M1–M5 pelas seis funções; teste de cache (editar M1 não reenvia M2; mudar `color` não muda a assinatura de geometria); teste do kernel desligado (funções devolvem `null`, aviso presente, sem exceção).

### V1 · Vista 3D

- **Depende de:** E1. Pode ir em paralelo com V2.
- **Pode tocar:** novos `packages/render/src/model3d/massa3d.ts` e testes; `scene3d.ts`, `chaveNivel3d.ts` (registro); seleção e picking no 3D onde os kinds são listados; `apps/web/src/editor/viewVisibility.ts`.
- **Molde:** `cortina3d.ts`, `guardaCorpo3d.ts`.
- **Aceite:** A.8 item 6, com testes: lote transparente posterior; `ElementRange` por massa (seleção e realce, decisão 0016); categoria `mass` desligada some do 3D; reserva sem kernel (contorno da base); atualização só da massa editada.

### V2 · Planta, snaps e extensão do modelo

- **Depende de:** E1. Pode ir em paralelo com V1.
- **Pode tocar:** novos `packages/render/src/plan/massa.ts`, `massaCamada.ts` e testes; `plan/build.ts`, `view.ts`, `planOverlay.ts`, `versoesPlanta.ts`, `planFrame.ts`, `extensaoDoModelo.ts` (+ teste); `packages/engine/src/apoioDeSnap.ts` (+ teste), `assinaturasNivel.ts`, `resolveLevels.ts`; `packages/tools/src/contratoSnaps.test.ts`.
- **Molde:** `plan/guardaCorpo.ts`, `guardaCorpoCamada.ts`.
- **Aceite:** planta desenha os três estilos de A.4 regra 10 com os pesos de linha da vista; massa de outro nível que atravessa o nível ativo aparece (a massa ocupa vários pavimentos); snaps de vértice, meio e aresta do anel cortado, com chave estável (cota associativa); `COLETORES.mass = entra: true` e `CLASSIFICACAO.mass` de snaps apontando código real (os marcadores da ficha M1 saem); seleção por clique e por caixa.

### V3 · Corte e elevação

- **Depende de:** V2.
- **Pode tocar:** novos `packages/render/src/section/massa.ts` e testes; `section/build.ts`, `pick.ts`, `visibility.ts`; no motor, só o que liga a camada da massa ao resultado do corte (molde: `corteGuardaCorpoDaSecao`, `linhasVisiveisGC`).
- **Passos:** primeiro ler como o guarda-corpo entra no corte (`section/guardaCorpo.ts`) e usar **o mesmo mecanismo** de desenho, visibilidade, seleção e realce. Não criar mecanismo novo de oclusão. Cortado: contorno pesado e preenchimento; projetado: contorno fino; feição: linha mais fina.
- **Aceite:** testes com M1 e M3 em corte e em elevação (contagem e estilo das operações de desenho); seleção e realce da massa na vista; categoria desligada some; elevação de edifício só com massas no projeto é gerada (extensão do modelo); capturas de corte e elevação de M5 anexadas ao relatório (caminho em `docs/massa/evidencias/`).

## Fase 3 — Ferramentas e interface

### T1 · Ferramentas de criação e contrato de modificação

- **Depende de:** V3.
- **Pode tocar:** novos `packages/tools/src/massTool.ts`, `massToolPerfis.ts`, `massPick.ts`, `massHandles.ts` e testes; `registry.ts`, `selectTool.ts`, `edit.ts`, `clipboard.ts`, `pasteLevels/command.ts`, `alignFeatures.ts`, `contratoModificacao.test.ts`; `sectionMoverElementos.ts`.
- **Passos:** ferramenta única `mass` com modos `extrusao`, `mistura`, `loft`, `bulbo` e perfis `circulo`, `elipse`, `poligono`, `livre`, usando o **núcleo comum de desenho** (regra 1 do contrato de famílias); altura e número de lados digitáveis; prévia; regra 3 inteira (mover, copiar, girar, espelhar, matriz, alinhar, apagar, copiar/colar entre pavimentos, alças de origem e de vértices do perfil livre da base, mover no corte: horizontal move `origem`, vertical muda `baseOffset`). Aparar, estender, dividir e deslocar: `null` com motivo escrito "massa não é linear".
- **Aceite:** `contratoModificacao.test.ts` com `mass` apontando código real; um teste por ferramenta de modificação com desfazer; criação de M1, M2 e M4 pela ferramenta em teste (sem navegador).

### U1 · Faixa, propriedades, diálogo de seções, navegador

- **Depende de:** T1. Pode ir em paralelo com U2.
- **Pode tocar:** `apps/web/src/ui/ribbon/tabsSoon.ts`, `tabsMain.ts`, `actions.ts`; novos `apps/web/src/ui/MassProperties.tsx`, `ui/dialogs/MassSecoesDialog.tsx`, `massSecoesForm.ts` e testes; `OptionsBar.tsx`, `Properties.tsx`, `ui/browser/`; arquivos de i18n de `apps/web/src/editor/i18n/areas/` (arquivo novo `massa.ts` se os existentes estiverem perto do limite).
- **Aceite:** A.6 inteiro; `npm run check:ribbon-i18n`, `npm run test:i18n` e `npm run audit:i18n` verdes; lógica do formulário (torção total → rotações; adicionar, remover, duplicar seção; validação ao vivo com a mensagem de `massIssue`) testada em `massSecoesForm.test.ts`; `node scripts/check-props-density.mjs` e `check-units.mjs` verdes.

### U2 · Tabela "Massas por pavimento" e avisos

- **Depende de:** T1. Pode ir em paralelo com U1 (arquivos distintos).
- **Pode tocar:** novos `packages/engine/src/massaSchedule.ts` e teste; `apps/web/src/ui/dialogs/MassScheduleDialog.tsx`; o ponto onde as tabelas são listadas; `useIssues.ts`.
- **Molde:** `curtainSchedule.ts`, `guardaCorpoSchedule.ts`.
- **Aceite:** tabela e CSV com M3 (64 m² em todos os níveis) e M5 (soma por cópia e aviso 2 visível); avisos 1 a 4 aparecem no painel com "Ir para".

## Fase 4 — Derivação

### D1 · Pisos da massa

- **Depende de:** U1 e U2.
- **Pode tocar:** novos `packages/engine/src/massaDerivaPisos.ts` e teste; `packages/model/src/floor.ts`, `slab.ts` (campo opcional `origemMassa`), novo `massDerivaCommands.ts`; `apps/web/src/ui/dialogs/MassPisosDialog.tsx`; `ribbon/actions.ts`; i18n.
- **Aceite (A.7):** M3 em 3 níveis → 3 pisos com área 64 ± 1e-3; M5 → contorno é a união das cópias (um anel externo quando se tocam); um desfazer remove tudo; rodar de novo substitui os gerados (não duplica); `origemMassa` é opcional e arquivos antigos abrem sem migração; os pisos gerados passam em `validateFloors`.

### D2 · Paredes da massa

- **Depende de:** D1.
- **Pode tocar:** novos `packages/engine/src/massaDerivaParedes.ts` e teste; `packages/model/src/wall.ts` (campo opcional `origemMassa`), `massDerivaCommands.ts`; `apps/web/src/ui/dialogs/MassParedesDialog.tsx`; `ribbon/actions.ts`; i18n.
- **Aceite (A.7):** M1 num nível → 4 paredes fechando o retângulo, junções resolvidas sem aviso; M2 → polígono com segmentos ≥ 0,40 m, cadeia fechada; M3 em 2 níveis → contornos girados entre si; nenhum segmento menor que o mínimo; `validate` do projeto sem erro novo; um desfazer; rodar de novo substitui.

## Fase 5 — Saída e fecho

### X1 · IFC, DXF e prancha

- **Depende de:** D2.
- **Pode tocar:** `packages/io/src/ifc/` (massa sai como `IfcBuildingElementProxy` com a malha `lod 2`, molde: o `Generic`), `packages/io/src/dxf*.ts` (camada `MASSA` na planta e no corte), o 3D vetorial da prancha onde os kinds são listados; testes ao lado.
- **Aceite:** `npm run test:ifc-export` verde com uma massa no fixture; teste DXF com a camada `MASSA`; prancha com planta, corte, elevação e 3D vetorial de M5 gera PDF sem erro (teste existente de PDF estendido).

### Q1 · E2E, desempenho, paridade e documentação

- **Depende de:** X1.
- **Pode tocar:** novo `tests/e2e/massa.mjs`; novo `docs/paridade/massas.md`; novo `docs/decisoes/00NN-massa-conceitual.md` (próximo número livre; conteúdo = Parte A deste plano mais o que mudou por decisão do dono); `tests/` (teste de perf da massa no molde dos `*.perf.test.ts`).
- **Passos:** E2E com o navegador já instalado (Playwright, `--trace off`) executando B.5; capturas em `docs/massa/evidencias/final/`; medir A.8 item 5.
- **Aceite:** `node tests/e2e/massa.mjs` sai com código 0 e sem erro de console; A.8 itens 1 a 8 marcados um a um no relatório com o teste que prova cada um; checklist de paridade escrito com cada item marcado feito ou fora de escopo (A.9).
- **Só o fiscal** (depois desta ficha): acrescentar `massas` em `docs/paridade/ORDEM.json`, atualizar `docs/07-STATUS-V1.md` e `docs/04-ROTEIRO.md`, rodar `npm run check` completo e relatar ao dono.

---

# Parte E — Riscos e o que fazer

| Risco | Sinal | Ação do fiscal |
|---|---|---|
| Agente amplia o escopo (booleana, NURBS, `MassType`) | Arquivos fora da lista ou itens de A.9 no diff | Devolver; citar A.9 |
| Agente cria segunda geometria em TS | Cálculo de anel ou malha em `packages/engine` ou `render` fora de teste | Devolver; citar A.5 "Kernel desligado" |
| Contrato muda depois de M2 | Diff em `cena-v11.json` fora da ficha M2 | Parar; perguntar ao dono |
| `versao` ou `SCHEMA_VERSION` colide com outra frente | Conflito ao mesclar a `main` | Renumerar para o próximo livre; os ids de seção e consulta não mudam |
| Arquivo estoura 420 linhas | `npm run lint` | Devolver pedindo divisão; nunca mexer no limite |
| Corte ou elevação instável | Laço aberto no fuzz de R3 | Não aceitar tolerância maior; devolver com a semente que falha |
| Desempenho ruim com muitas cópias | Tempos de A.8 item 5 acima do dobro | Registrar; perguntar ao dono se bloqueia; sugestão já aprovada: `lod 0` durante o arraste |
| Ambiente sem WASM ou sem navegador | Comando falha já na linha de base | Relatar ao dono antes da ficha que depende dele; não pular o portão em silêncio |
| Sessão reinicia no meio | — | Ler `docs/massa/ESTADO.md`, conferir `git log`, retomar da primeira ficha não mesclada |

---

# Emendas (registradas pelo fiscal durante a execução)

**E1 · 2026-11-13 · ficha M1 (esclarecem A.3 item 4 e A.4; não mudam o escopo).**
1. **Espelho no `transform`.** "Inverte o sentido dos pontos e o sinal das rotações" vale só para espelho em torno de uma linha paralela a x. Para a linha de ângulo φ: perfil local espelhado em y (perfil livre com a ordem dos pontos invertida, para seguir anti-horário), `rotacao' = 2φ − rotacao`, `dx`/`dy` refletidos como vetor, e `arranjo.anguloTotal` troca de sinal. Para φ = 0 é exatamente a regra escrita. Implementado em `packages/model/src/mass.ts` (`transformMass`).
2. **Fase do polígono regular (vale para o Rust, ficha R1).** O polígono regular tem um vértice no ângulo 0 local (+x), o que é compatível com a regra 1 de A.4 (o parâmetro `t = 0` é a interseção com +x). O espelho em y mantém o perfil simétrico.
3. **`setMassArranjo(massaId, arranjo | null)`**: `null` remove o campo.
4. **Validações extras** em `massIssue`: valores não finitos recusados; `lados` inteiro de 3 a 64; ponto repetido ou área nula no perfil livre conta como "não simples"; tolerância 1e-9 nas comparações de z e de rotação.
5. **Estilo gráfico padrão da categoria `mass`:** peso de corte 2, peso de projeção 1; cor DXF ACI 8; camada DXF de corte `CORTE_MASSA`.
6. `SCHEMA_VERSION` agora é **26**. A ficha M2 sobe a `versao` do contrato do kernel de 18 para 19.

**E2 · 2026-11-13 · ficha M2 (corrige a lista "Pode tocar"; o fiscal responde pelo plano).** Para as seções 140–142 aceitarem `definir_secao`/`upsert`/`remover`, a M2 também pode tocar: `crates/geom-wasm/src/cena.rs` (SOMENTE: o `use`, o campo `massa` em `Cena`, os três braços de roteamento em `definir_secao`/`upsert`/`remover` e a condição que deixa a seção fora de `invalidar_caches`), o módulo novo `crates/geom-wasm/src/secoes_massa.rs` (molde `secoes_gc.rs`/`secoes_cortina.rs`, com recusa atômica `ENTRADA` para enum fora da faixa e `NaN`) e `crates/geom-wasm/tests/fixtures/cortina_paridade*.json` (regenerados, mudando só `esquemaVersao`). As fichas R1, R2 e R3 já listam `cena.rs` e `secoes_massa.rs`; a partir da M2 o módulo existe e elas só o estendem. `cargo clippy` faz parte do portão e agora está instalado no ambiente do fiscal.
