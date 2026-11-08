//! Geometria do kernel experimental, em **Rust puro**.
//!
//! # Por que não Clipper
//!
//! A primeira tentativa usou o crate `clipper2`, que embrulha a biblioteca C++ Clipper2 via `cc-rs`.
//! Isso exigiria clang/LLVM + sysroot para compilar em `wasm32-unknown-unknown` — toolchain que não
//! existe no ambiente do projeto e que seria mais uma dependência de build para todo mundo. A
//! decisão é usar `i_overlay`, puramente Rust: `cargo build --target wasm32-unknown-unknown`
//! funciona com o toolchain Rust padrão.
//!
//! # Contrato de equivalência
//!
//! 1. **Quantização a 1 µm**: toda coordenada vira inteiro com escala `1e6` usando o arredondamento
//!    do `Math.round` do JS, `floor(x * 1e6 + 0.5)` (meio para +∞). A saída volta dividida por
//!    `1e6`. As operações usam `scale = 1.0` sobre coordenadas já inteiras e o motor `i64` do
//!    `i_overlay`, então não há reescala automática que perca precisão.
//! 2. **Orientação normalizada** antes de operar, como `operandPaths`: anel 0 de cada polígono
//!    (externo) anti-horário, os demais (furos) horários. Furos acompanham o polígono no offset.
//! 3. **Preenchimento `NonZero`**, como `FillRule::NonZero` do `i_overlay` e o `pftNonZero` do TS.
//! 4. **Saída** no modelo do ABI: cada `Shape` do `i_overlay` já vem com o externo primeiro e os
//!    furos em seguida, na mesma convenção de orientação.
//! 5. **Nunca panicar**: entradas degeneradas devolvem `Err(ERRO_ENTRADA)`; erros internos do
//!    `i_overlay` (faixa de coordenadas/escala) devolvem `Err(ERRO_INTERNO)`. `panic = "abort"` no
//!    release derrubaria a instância wasm, por isso a validação é defensiva.
//! 6. **Offset**: `delta` em metros (positivo dilata), cantos em esquadria (miter). O `miter_limit`
//!    2 do Clipper equivale a permitir miter até 60° de ângulo interno; `LineJoin::Miter(π/3)`
//!    reproduz isso. `arc_tolerance` do Clipper só afeta cantos arredondados, que não usamos.

use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay::{Overlay, ShapeType};
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::i_float::int::point::IntPoint;
use i_overlay::float::scale::FixedScaleFloatOverlay;
use i_overlay::mesh::float::outline::offset::OutlineOffset;
use i_overlay::mesh::float::style::{LineJoin, OutlineStyle};

use crate::{Anel, MultiPoligono, Poligono, ERRO_ENTRADA, ERRO_INTERNO};

/// Escala da quantização: 1 µm, a mesma de `CLIP_SCALE` em `boolean.ts`.
pub const ESCALA: f64 = 1e6;

/// Escala fina (1 nm) para o pintor da sub-etapa A2. Com 1 µm a quantização desloca cada aresta até 0,5 µm e a área de
/// um fragmento de perímetro de alguns metros até ~1e-5 m² — mais que a tolerância de 1e-6 m² da decisão 0046 §2.4 —,
/// enquanto o TypeScript (`difference` = polygon-clipping, exato em todas as medições) não quantiza. A 1 nm o erro cai
/// três ordens de grandeza e as coordenadas ficam muito abaixo de 1 µm. Mesmo algoritmo (non-zero, `i_overlay`).
pub const ESCALA_FINA: f64 = 1e9;

/// Limite de coordenada escalada para o arredondamento continuar exato em `f64` (bem abaixo de
/// 2^53). Coordenadas acima disso não são representáveis em µm sem perder precisão; recusar é
/// melhor que arredondar em silêncio.
const LIMITE_ESCALADO: f64 = 9.0e15;

/// Ângulo interno mínimo para manter o canto em miter (`1 / sin(θ/2) <= 2` ⇔ `θ >= 60°`).
/// É o equivalente geométrico do `miter_limit = 2` do Clipper.
const MITER_MINIMO: f64 = std::f64::consts::FRAC_PI_3;

/// `i_overlay` chama de `Shape` o que aqui é `Poligono` (externo + furos) e de `Shapes` o que aqui
/// é `MultiPoligono`. O modelo é idêntico: `Vec<Vec<Vec<[f64; 2]>>>`.
type Formas = Vec<Poligono>;

/// Área com sinal (positiva = anti-horário), igual a `ringArea` do TypeScript.
fn area_com_sinal(anel: &Anel) -> f64 {
    let mut s = 0.0;
    for i in 0..anel.len() {
        let a = anel[i];
        let b = anel[(i + 1) % anel.len()];
        s += a[0] * b[1] - b[0] * a[1];
    }
    s * 0.5
}

/// `Math.round(x * 1e6)` do JS, inclusive para negativos (meio para +∞). Recusa NaN, infinito e
/// coordenadas fora da faixa exata de `f64`.
fn quantizar(valor: f64, escala: f64) -> Result<f64, u32> {
    if !valor.is_finite() {
        return Err(ERRO_ENTRADA);
    }
    let escalado = valor * escala;
    if !escalado.is_finite() || escalado.abs() > LIMITE_ESCALADO {
        return Err(ERRO_ENTRADA);
    }
    Ok((escalado + 0.5).floor())
}

/// Valida, orienta e quantiza um multipolígono para o formato do `i_overlay`.
fn preparar(m: &MultiPoligono, escala: f64) -> Result<Formas, u32> {
    let mut formas: Formas = Vec::with_capacity(m.len());
    for poli in m {
        // Geometria degenerada (polígono sem anéis, anel externo com menos de 3 pontos) não tem área: o TypeScript a
        // ignora, então aqui também. Devolver erro desligava o kernel inteiro na primeira ocorrência (os dados reais
        // trazem anéis de 2 pontos). Só coordenada inválida (NaN, infinito, fora da faixa) continua sendo erro.
        if poli.is_empty() || poli[0].len() < 3 {
            continue;
        }
        let mut aneis: Poligono = Vec::with_capacity(poli.len());
        for (i, anel) in poli.iter().enumerate() {
            if anel.len() < 3 {
                continue; // furo degenerado: sem efeito
            }
            let inverter = (area_com_sinal(anel) > 0.0) != (i == 0);
            let mut pontos: Anel = Vec::with_capacity(anel.len());
            if inverter {
                for p in anel.iter().rev() {
                    pontos.push([quantizar(p[0], escala)?, quantizar(p[1], escala)?]);
                }
            } else {
                for p in anel.iter() {
                    pontos.push([quantizar(p[0], escala)?, quantizar(p[1], escala)?]);
                }
            }
            aneis.push(pontos);
        }
        if aneis.len() > 1 && aneis[1..].iter().any(|furo| !furo_dentro_do_externo(furo, &aneis[0])) {
            // O furo passa da borda do contorno (entrada inválida, como o furo de escada que sai do piso). O polígono é "externo menos furos": a parte
            // do furo que cai fora do contorno não é região. Com a regra NonZero ela contaria como região (enrolamento -1), então o polígono é
            // refeito aqui como a diferença entre o contorno e os furos (o mesmo que o `polygon-clipping` do TypeScript entende por polígono).
            let mut it = aneis.into_iter();
            let externo = it.next().unwrap_or_default();
            let furos: Formas = it.map(|mut f| {
                f.reverse();
                vec![f]
            })
            .collect();
            formas.extend(aplicar(&vec![vec![externo]], &furos, OverlayRule::Difference)?);
            continue;
        }
        formas.push(aneis);
    }
    Ok(formas)
}

/// Posição de `p` em relação ao anel (coordenadas inteiras da grade): `1` dentro, `-1` fora, `0` sobre a borda.
fn posicao_no_anel(p: [f64; 2], anel: &Anel) -> i8 {
    let (px, py) = (p[0] as i128, p[1] as i128);
    let n = anel.len();
    let mut dentro = false;
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        let (ax, ay, bx, by) = (a[0] as i128, a[1] as i128, b[0] as i128, b[1] as i128);
        let cruz = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        if cruz == 0 && px >= ax.min(bx) && px <= ax.max(bx) && py >= ay.min(by) && py <= ay.max(by) {
            return 0;
        }
        if (ay > py) != (by > py) {
            // x da aresta na altura de p, comparado sem divisão: p.x < ax + (py-ay)(bx-ax)/(by-ay)
            let esquerda = if by > ay { cruz > 0 } else { cruz < 0 };
            if esquerda {
                dentro = !dentro;
            }
        }
    }
    if dentro {
        1
    } else {
        -1
    }
}

/// Sinal do produto vetorial `(b-a) x (c-a)` em inteiros.
fn orientacao(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> i8 {
    let v = (b[0] as i128 - a[0] as i128) * (c[1] as i128 - a[1] as i128) - (b[1] as i128 - a[1] as i128) * (c[0] as i128 - a[0] as i128);
    v.signum() as i8
}

/// O furo está dentro do contorno externo (encostar na borda vale)? Nenhum vértice fora e nenhum cruzamento próprio entre as arestas dos dois anéis.
fn furo_dentro_do_externo(furo: &Anel, externo: &Anel) -> bool {
    if furo.iter().any(|&p| posicao_no_anel(p, externo) < 0) {
        return false;
    }
    let (nf, ne) = (furo.len(), externo.len());
    for i in 0..nf {
        let (a, b) = (furo[i], furo[(i + 1) % nf]);
        for j in 0..ne {
            let (c, d) = (externo[j], externo[(j + 1) % ne]);
            if orientacao(a, b, c) * orientacao(a, b, d) < 0 && orientacao(c, d, a) * orientacao(c, d, b) < 0 {
                return false;
            }
        }
    }
    true
}

/// Divide um anel (em coordenadas já inteiras da grade) em anéis simples nos vértices que ele visita mais de uma vez. Um anel
/// que toca a si mesmo é geometria inválida; cada laço entre duas visitas ao mesmo vértice vira um anel próprio, com a sua
/// área e o seu sentido, então a soma das áreas com sinal não muda. Vértices consecutivos repetidos (aresta de comprimento
/// zero) são o laço mais curto: um laço de menos de 3 vértices (um ponto, ou ida e volta pela mesma aresta) tem área
/// exatamente zero, não é região, e por isso é removido (não é descarte por limiar de área).
fn dividir_em_aneis_simples(anel: Vec<[f64; 2]>) -> Vec<Anel> {
    let mut pilha: Vec<[f64; 2]> = Vec::with_capacity(anel.len());
    let mut saida: Vec<Anel> = Vec::new();
    for p in anel {
        if let Some(k) = pilha.iter().position(|q| *q == p) {
            let laco: Anel = pilha.split_off(k + 1);
            // `pilha[k]` é o próprio vértice repetido: o laço é [p, laco...].
            if laco.len() >= 2 {
                let mut a: Anel = Vec::with_capacity(laco.len() + 1);
                a.push(p);
                a.extend(laco);
                saida.push(a);
            }
        } else {
            pilha.push(p);
        }
    }
    if pilha.len() >= 3 {
        saida.push(pilha);
    }
    saida
}

/// Ponto dentro do anel (par-ímpar), para ligar um lobo horário ao polígono que o contém.
fn ponto_no_anel(p: [f64; 2], anel: &Anel) -> bool {
    let n = anel.len();
    let mut dentro = false;
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] {
            dentro = !dentro;
        }
    }
    dentro
}

/// Ponto de teste de um anel que toca outro só em vértices: o meio da primeira aresta cujo meio não é vértice do outro anel.
fn ponto_de_teste(anel: &Anel, outro: &Anel) -> [f64; 2] {
    let n = anel.len();
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        let m = [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0];
        if !outro.contains(&m) {
            return m;
        }
    }
    anel[0]
}

/// Garante polígonos de anéis simples (sem toque do anel consigo mesmo) na grade. O anel externo que se divide em lobos
/// anti-horários gera um polígono por lobo; um lobo horário (recorte que volta ao vértice) vira furo do lobo que o contém.
/// Os furos originais, divididos ou não, vão para o lobo externo que os contém; um lobo anti-horário vindo de um furo (ilha
/// encostada no furo) vira polígono próprio.
fn poligono_simples(anel_externo: Vec<[f64; 2]>, furos: Vec<Vec<[f64; 2]>>) -> Vec<Poligono> {
    let mut externos: Vec<Anel> = Vec::new();
    let mut buracos: Vec<Anel> = Vec::new();
    for lobo in dividir_em_aneis_simples(anel_externo) {
        if area_com_sinal(&lobo) > 0.0 {
            externos.push(lobo);
        } else if area_com_sinal(&lobo) < 0.0 {
            buracos.push(lobo);
        }
    }
    let mut ilhas: Vec<Anel> = Vec::new();
    for furo in furos {
        for lobo in dividir_em_aneis_simples(furo) {
            let a = area_com_sinal(&lobo);
            if a < 0.0 {
                buracos.push(lobo);
            } else if a > 0.0 {
                ilhas.push(lobo);
            }
        }
    }
    let mut polis: Vec<Poligono> = externos.into_iter().map(|e| vec![e]).collect();
    for b in buracos {
        // O menor externo que contém o buraco (um buraco encostado no externo tem o meio de uma aresta dentro dele).
        let dono = (0..polis.len())
            .filter(|&i| ponto_no_anel(ponto_de_teste(&b, &polis[i][0]), &polis[i][0]))
            .min_by(|&i, &j| area_absoluta(&polis[i][0]).partial_cmp(&area_absoluta(&polis[j][0])).unwrap_or(std::cmp::Ordering::Equal));
        match dono {
            Some(i) => polis[i].push(b),
            // Sem externo que o contenha (entrada inconsistente): mantém o anel como estava, em vez de perder área.
            None => polis.push(vec![b]),
        }
    }
    polis.extend(ilhas.into_iter().map(|i| vec![i]));
    polis
}

/// Converte a saída do `i_overlay` para o modelo do ABI, de volta em metros. Antes de dividir pela escala, os anéis passam
/// por [`poligono_simples`]: depois do arredondamento à grade, dois vértices distintos podem cair no mesmo ponto e o anel
/// passaria a tocar a si mesmo.
fn converter(formas: Formas, escala: f64) -> MultiPoligono {
    let mut saida: MultiPoligono = Vec::with_capacity(formas.len());
    for poli in formas {
        let mut it = poli.into_iter();
        let Some(externo) = it.next() else { continue };
        let furos: Vec<Vec<[f64; 2]>> = it.collect();
        for aneis in poligono_simples(externo, furos) {
            let aneis: Poligono = aneis
                .into_iter()
                .map(|anel| anel.into_iter().map(|p| [p[0] / escala, p[1] / escala]).collect())
                .collect();
            if !aneis.is_empty() {
                saida.push(aneis);
            }
        }
    }
    saida
}

/// Leva uma forma que veio de fora (sem passar por booleana) à grade da `escala` e a deixa em anéis simples: o mesmo caminho de saída
/// de toda operação ([`preparar`] e [`converter`]), sem nenhuma região subtraída ou somada. Dois vértices a menos de uma célula da grade
/// viram o mesmo ponto e o anel que tocaria a si mesmo é dividido, como na saída da união e da diferença.
pub fn normalizar_na_grade(m: &MultiPoligono, escala: f64) -> Result<MultiPoligono, u32> {
    Ok(converter(preparar(m, escala)?, escala))
}

/// Operação booleana em coordenadas quantizadas (µm) com escala fixa `1.0` e motor `i64`.
fn aplicar(a: &Formas, b: &Formas, regra: OverlayRule) -> Result<Formas, u32> {
    a.overlay_with_fixed_scale_as::<i64>(b, regra, FillRule::NonZero, 1.0)
        .map_err(|_| ERRO_INTERNO)
}

/// `union(...)` e `unionClipper(...)`.
pub fn uniao(args: &[MultiPoligono]) -> Result<MultiPoligono, u32> {
    uniao_com_escala(args, ESCALA)
}

/// `uniao` com a escala da quantização à escolha de quem chama. A sub-etapa B2 usa [`ESCALA_FINA`] nas zonas bloqueadas das paredes (a mesma
/// razão do corte dos furos da B1: o `polygon-clipping` do TS não quantiza).
pub fn uniao_com_escala(args: &[MultiPoligono], escala: f64) -> Result<MultiPoligono, u32> {
    if args.is_empty() {
        return Ok(Vec::new());
    }
    let mut todas: Formas = Vec::new();
    for m in args {
        todas.extend(preparar(m, escala)?);
    }
    if todas.is_empty() {
        return Ok(Vec::new());
    }
    // Todos os operandos entram como sujeito único: com NonZero isso é a união de todos, sem
    // depender da ordem (equivale ao `unionClipper` do TS).
    let vazio: Formas = Vec::new();
    let resultado = aplicar(&todas, &vazio, OverlayRule::Union)?;
    Ok(converter(resultado, escala))
}

/// `difference(a, ...bs)` e `differenceClipper(a, ...bs)`.
pub fn diferenca(args: &[MultiPoligono]) -> Result<MultiPoligono, u32> {
    diferenca_com_escala(args, ESCALA)
}

/// `diferenca` com a escala da quantização (inteiros por metro) à escolha de quem chama. A sub-etapa A2 usa
/// [`ESCALA_FINA`] (ver lá).
pub fn diferenca_com_escala(args: &[MultiPoligono], escala: f64) -> Result<MultiPoligono, u32> {
    let Some(primeiro) = args.first() else {
        return Err(ERRO_ENTRADA);
    };
    // Valida todos antes dos atalhos: entrada degenerada nunca chega ao `i_overlay`.
    let mut preparados: Vec<Formas> = args
        .iter()
        .map(|m| preparar(m, escala))
        .collect::<Result<_, _>>()?;
    if primeiro.is_empty() || preparados[0].is_empty() {
        return Ok(Vec::new());
    }
    // UMA passada: todos os subtraendos entram juntos como clip. Com NonZero e a orientação normalizada em `preparar`,
    // o conjunto de clips equivale à união deles, então `a − (b1 ∪ b2 ∪ ...)` é igual a subtrair um a um — sem refazer
    // a varredura sobre o acumulado a cada subtraendo (com ~300 subtraendos, a versão em laço era 10× mais lenta que o TS).
    // Os subtraendos são MOVIDOS para o clip (nada é clonado).
    let mut resto = preparados.drain(..);
    let a = resto.next().unwrap_or_default();
    let mut todos: Formas = Vec::new();
    for subtraendo in resto {
        todos.extend(subtraendo);
    }
    diferenca_final(primeiro, &a, &todos, escala)
}

/// Forma já validada, orientada e quantizada em `escala` (o primeiro passo de toda operação). Quem repete a mesma entrada em várias
/// diferenças (a junção B3) prepara uma vez e reaproveita com [`diferenca_de_preparadas`].
pub(crate) type FormasPreparadas = Formas;

/// [`preparar`] para uso fora deste módulo.
pub(crate) fn preparar_forma(m: &MultiPoligono, escala: f64) -> Result<FormasPreparadas, u32> {
    preparar(m, escala)
}

/// `diferenca_com_escala(&[primeiro, subtraendos...], escala)` com as entradas JÁ preparadas na mesma `escala`: o resultado é idêntico bit a bit, sem
/// requantizar. `primeiro` é a entrada bruta (devolvida como está quando não há nada a subtrair); `todos` é um buffer reaproveitável do chamador.
pub(crate) fn diferenca_de_preparadas(primeiro: &MultiPoligono, a: &FormasPreparadas, subtraendos: &[&FormasPreparadas], escala: f64, todos: &mut Formas) -> Result<MultiPoligono, u32> {
    if primeiro.is_empty() || a.is_empty() {
        return Ok(Vec::new());
    }
    todos.clear();
    for s in subtraendos {
        todos.extend(s.iter().cloned());
    }
    diferenca_final(primeiro, a, todos, escala)
}

fn diferenca_final(primeiro: &MultiPoligono, a: &Formas, todos: &Formas, escala: f64) -> Result<MultiPoligono, u32> {
    if todos.is_empty() {
        return Ok(primeiro.clone());
    }
    let resultado = aplicar(a, todos, OverlayRule::Difference)?;
    if resultado.is_empty() {
        return Ok(Vec::new());
    }
    Ok(descartar_residuos(converter(resultado, escala)))
}

fn caixa(m: &MultiPoligono) -> Option<[f64; 4]> {
    let mut c: Option<[f64; 4]> = None;
    for p in m.iter().flat_map(|poli| poli.iter().take(1)) {
        for q in p {
            let b = c.get_or_insert([q[0], q[1], q[0], q[1]]);
            b[0] = b[0].min(q[0]);
            b[1] = b[1].min(q[1]);
            b[2] = b[2].max(q[0]);
            b[3] = b[3].max(q[1]);
        }
    }
    c
}

/// Escala da grade inteira onde se decide se um subtraendo corta o minuendo: 1 pm. Em coordenadas inteiras a interseção é exata (dois polígonos
/// que só compartilham borda ou ponto não têm interseção), e o ruído de ponto flutuante das entradas (~1e-16 em valores de metros) fica abaixo
/// de uma célula da grade.
const ESCALA_DE_RELEVANCIA: f64 = 1e12;

/// O subtraendo corta o minuendo? Falso só quando a interseção exata, em inteiros numa grade de 1 pm, é vazia: as caixas não se sobrepõem, ou os
/// dois só compartilham borda ou ponto. Sem limiar de área nem de espessura: qualquer sobreposição, por menor que seja, conta.
fn corta_de_verdade(minuendo: &MultiPoligono, sub: &MultiPoligono) -> Result<bool, u32> {
    let (Some(a), Some(b)) = (caixa(minuendo), caixa(sub)) else { return Ok(false) };
    if b[0] >= a[2] || b[2] <= a[0] || b[1] >= a[3] || b[3] <= a[1] {
        return Ok(false);
    }
    let comum = interseccao_com_escala(minuendo, sub, ESCALA_DE_RELEVANCIA)?;
    Ok(!comum.is_empty())
}

/// `diferenca` só com os subtraendos que cortam de verdade o minuendo. Quantizados a 1 µm cada um por si, um vizinho que só encosta entra alguns
/// décimos de µm na região e deixa vértices novos na borda; a mesma região, com e sem ele, saía com vértices diferentes (e a camada de parede
/// ganhava uma faixa de cota a mais). Sem ele a entrada da varredura é a mesma, então a saída é a mesma. A decisão de cada subtraendo depende só
/// dele e do minuendo, nunca dos outros operandos.
pub fn diferenca_relevante(args: &[MultiPoligono]) -> Result<MultiPoligono, u32> {
    let Some((minuendo, subs)) = args.split_first() else {
        return Err(ERRO_ENTRADA);
    };
    let mut uteis: Vec<MultiPoligono> = Vec::with_capacity(args.len());
    uteis.push(minuendo.clone());
    for s in subs {
        if corta_de_verdade(minuendo, s)? {
            uteis.push(s.clone());
        }
    }
    diferenca(&uteis)
}

/// Limiar de área (m²) abaixo do qual a diferença descarta um anel: 1e-9 m². O `polygon-clipping` do TS devolve vazio onde a subtração zera a peça; o
/// `i_overlay` em escala fina deixa resíduos de ~1e-11 m² (anel de 3 a 4 vértices, ruído de quantização a 1 nm) dentro da junção (B3) e do corte.
/// 1e-9 m² é muito menor que qualquer peça real e fica acima do ruído de 1 nm, então nenhuma área ou volume acima de 1e-6 muda.
const AREA_RESIDUO: f64 = 1e-9;

fn area_absoluta(anel: &Anel) -> f64 {
    let n = anel.len();
    let mut s = 0.0;
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        s += a[0] * b[1] - b[0] * a[1];
    }
    (s / 2.0).abs()
}

/// Remove anéis (furos inclusive) e polígonos cujo anel externo tem área absoluta abaixo de [`AREA_RESIDUO`].
fn descartar_residuos(m: MultiPoligono) -> MultiPoligono {
    m.into_iter()
        .filter_map(|poli| {
            if poli.first().map_or(true, |ext| area_absoluta(ext) < AREA_RESIDUO) {
                return None;
            }
            Some(poli.into_iter().enumerate().filter(|(i, r)| *i == 0 || area_absoluta(r) >= AREA_RESIDUO).map(|(_, r)| r).collect())
        })
        .collect()
}

/// `intersection(a, b)`.
pub fn interseccao(a: &MultiPoligono, b: &MultiPoligono) -> Result<MultiPoligono, u32> {
    interseccao_com_escala(a, b, ESCALA)
}

/// `interseccao` com a escala da quantização à escolha de quem chama. A sub-etapa A3d usa [`ESCALA_FINA`] no recorte das faixas
/// pelo perfil (a mesma razão do pintor: o `polygon-clipping` do TS não quantiza).
pub fn interseccao_com_escala(a: &MultiPoligono, b: &MultiPoligono, escala: f64) -> Result<MultiPoligono, u32> {
    if a.is_empty() || b.is_empty() {
        return Ok(Vec::new());
    }
    let a = preparar(a, escala)?;
    let b = preparar(b, escala)?;
    if a.is_empty() || b.is_empty() {
        return Ok(Vec::new());
    }
    let resultado = aplicar(&a, &b, OverlayRule::Intersect)?;
    Ok(converter(resultado, escala))
}

/// `offsetMulti(m, delta)`.
pub fn offset(m: &MultiPoligono, delta: f64) -> Result<MultiPoligono, u32> {
    if !delta.is_finite() {
        return Err(ERRO_ENTRADA);
    }
    offset_em_um(m, delta * ESCALA)
}

/// Offset com `delta` já em unidades de 1 µm (positivo dilata), cantos em esquadria.
fn offset_em_um(m: &MultiPoligono, delta_em_um: f64) -> Result<MultiPoligono, u32> {
    if m.is_empty() {
        return Ok(Vec::new());
    }
    if !delta_em_um.is_finite() || delta_em_um.abs() > LIMITE_ESCALADO {
        return Err(ERRO_ENTRADA);
    }
    let formas = preparar(m, ESCALA)?;
    if formas.is_empty() {
        return Ok(Vec::new());
    }
    // Miter até 60° de ângulo interno (miter_limit 2). `miter_min_turn(0)` desliga o corte para
    // bevel em cantos quase retos, aproximando o comportamento do Clipper.
    let estilo = OutlineStyle::new(delta_em_um)
        .line_join(LineJoin::Miter(MITER_MINIMO))
        .miter_min_turn(0.0);
    let resultado = formas
        .outline_fixed_scale_as::<i64>(&estilo, 1.0)
        .map_err(|_| ERRO_INTERNO)?;
    Ok(converter(resultado, ESCALA))
}

/// `closeGaps(m, eps)` de `boolean.ts` (A3c): fechamento morfológico, dilata `eps` metros, une (non-zero), contrai `eps` e une de
/// novo. O TS usa `ClipperOffset(2, ...)` em inteiros de 1 µm; aqui o offset é o de `offset` (i_overlay, miter até 60°), o mesmo
/// que a ABI v1 já expõe como `offsetMulti`. `eps` vira inteiros de 1 µm exatos (`eps * 1e6` arredondado, 3 para 3e-6).
pub fn fechar_frestas(m: &MultiPoligono, eps: f64) -> Result<MultiPoligono, u32> {
    if m.is_empty() {
        return Ok(Vec::new());
    }
    let passo = (eps * ESCALA).round();
    let dilatado = uniao(&[offset_em_um(m, passo)?])?;
    let contraido = offset_em_um(&dilatado, -passo)?;
    uniao(&[contraido])
}

/// `closeGapsSafe(m, eps, maxLoss)`: o fechamento só vale se a área não cair mais que `max_perda` nem subir mais que 1e-3 m².
pub fn fechar_frestas_seguro(m: &MultiPoligono, eps: f64, max_perda: f64) -> Result<MultiPoligono, u32> {
    let fechado = fechar_frestas(m, eps)?;
    let delta = crate::pintor::area_da_forma(&fechado) - crate::pintor::area_da_forma(m);
    Ok(if delta >= -max_perda && delta <= 1e-3 { fechado } else { m.clone() })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Offset fiel ao Clipper (B2): `ClipperOffset(2, ...)` do TS com cantos em esquadria, polígonos fechados.
//
// O `offset` acima usa o miter do `i_overlay`, que para cantos mais agudos que 60° faz chanfro (bevel); o Clipper faz o canto
// "quadrado" (`DoSquare`), que acrescenta área (~delta² por canto agudo: 3,3e-4 m² num canto de 49° com delta de 2 cm, medido na B2).
// Isto NÃO é arredondamento (a diferença não encolhe com escala fina), por isso o `{cm}` das camadas de piso e laje usa este porte, ponto a ponto:
// `AddPath` (sem pontos repetidos), `FixOrientations`, `OffsetPoint`/`DoMiter`/`DoSquare`, arredondamento de cada ponto a inteiro de 1 µm
// (`Clipper.Round`: meio afastando do zero) e a união final pelo enrolamento POSITIVO (`pftPositive`; para delta < 0 o Clipper soma um
// retângulo externo invertido e usa `pftNegative`, que é o mesmo conjunto: enrolamento > 0 dos caminhos deslocados).
// O `offset` acima segue como está (a A3c o usa no fechamento de frestas).
// ---------------------------------------------------------------------------------------------------------------------------------

/// `ClipperLib.Clipper.Round`: meio afastando do zero.
fn arredonda_clipper(a: f64) -> f64 {
    if a < 0.0 {
        (a - 0.5).ceil()
    } else {
        (a + 0.5).floor()
    }
}

/// `Clipper.Area` (positivo = anti-horário, y para cima) de um caminho em inteiros.
fn area_clipper(p: &[[f64; 2]]) -> f64 {
    let n = p.len();
    if n < 3 {
        return 0.0;
    }
    let mut a = 0.0;
    let mut j = n - 1;
    for i in 0..n {
        a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
        j = i;
    }
    -a * 0.5
}

/// `GetUnitNormal`.
fn normal_unitaria(a: [f64; 2], b: [f64; 2]) -> [f64; 2] {
    if a == b {
        return [0.0, 0.0];
    }
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let f = 1.0 / (dx * dx + dy * dy).sqrt();
    [dy * f, -(dx * f)]
}

/// Os pontos deslocados do vértice `j` (anterior `k`), como `OffsetPoint` com `jtMiter` e `miterLimit = 2` (`m_miterLim = 0.5`).
fn deslocar_vertice(src: &[[f64; 2]], normais: &[[f64; 2]], j: usize, k: usize, delta: f64, saida: &mut Vec<[f64; 2]>) {
    let pt = src[j];
    let (nk, nj) = (normais[k], normais[j]);
    let mut sen = nk[0] * nj[1] - nj[0] * nk[1];
    if (sen * delta).abs() < 1.0 {
        let cos = nk[0] * nj[0] + nj[1] * nk[1];
        if cos > 0.0 {
            saida.push([arredonda_clipper(pt[0] + nk[0] * delta), arredonda_clipper(pt[1] + nk[1] * delta)]);
            return;
        }
    } else if sen > 1.0 {
        sen = 1.0;
    } else if sen < -1.0 {
        sen = -1.0;
    }
    if sen * delta < 0.0 {
        saida.push([arredonda_clipper(pt[0] + nk[0] * delta), arredonda_clipper(pt[1] + nk[1] * delta)]);
        saida.push(pt);
        saida.push([arredonda_clipper(pt[0] + nj[0] * delta), arredonda_clipper(pt[1] + nj[1] * delta)]);
        return;
    }
    let r = 1.0 + (nj[0] * nk[0] + nj[1] * nk[1]);
    if r >= 0.5 {
        // DoMiter
        let q = delta / r;
        saida.push([arredonda_clipper(pt[0] + (nk[0] + nj[0]) * q), arredonda_clipper(pt[1] + (nk[1] + nj[1]) * q)]);
    } else {
        // DoSquare
        let dx = (sen.atan2(nk[0] * nj[0] + nk[1] * nj[1]) / 4.0).tan();
        saida.push([arredonda_clipper(pt[0] + delta * (nk[0] - nk[1] * dx)), arredonda_clipper(pt[1] + delta * (nk[1] + nk[0] * dx))]);
        saida.push([arredonda_clipper(pt[0] + delta * (nj[0] + nj[1] * dx)), arredonda_clipper(pt[1] + delta * (nj[1] - nj[0] * dx))]);
    }
}

/// `ClipperOffset(2, ...)` + `AddPaths(jtMiter, etClosedPolygon)` + `Execute(delta)` do TS (`offsetMulti`), em metros.
pub fn offset_clipper(m: &MultiPoligono, delta: f64) -> Result<MultiPoligono, u32> {
    if !delta.is_finite() {
        return Err(ERRO_ENTRADA);
    }
    if m.is_empty() {
        return Ok(Vec::new());
    }
    let delta_um = delta * ESCALA;
    if delta_um.abs() > LIMITE_ESCALADO {
        return Err(ERRO_ENTRADA);
    }
    // operandPaths + AddPath: orientação normalizada, pontos a 1 µm (`Math.round`), sem repetidos consecutivos nem o último igual ao primeiro.
    let mut caminhos: Vec<Vec<[f64; 2]>> = Vec::new();
    for poligono in m {
        for (i, anel) in poligono.iter().enumerate() {
            let anti_horario = area_com_sinal(anel) > 0.0;
            let orientado: Vec<[f64; 2]> = if anti_horario == (i == 0) { anel.clone() } else { anel.iter().rev().copied().collect() };
            let mut q: Vec<[f64; 2]> = Vec::with_capacity(orientado.len());
            for p in &orientado {
                q.push([quantizar(p[0], ESCALA)?, quantizar(p[1], ESCALA)?]);
            }
            if q.is_empty() {
                continue;
            }
            let mut alto = q.len() - 1;
            while alto > 0 && q[0] == q[alto] {
                alto -= 1;
            }
            let mut limpo: Vec<[f64; 2]> = vec![q[0]];
            for p in q.iter().take(alto + 1).skip(1) {
                if *limpo.last().unwrap_or(&q[0]) != *p {
                    limpo.push(*p);
                }
            }
            if limpo.len() < 3 {
                continue;
            }
            caminhos.push(limpo);
        }
    }
    if caminhos.is_empty() {
        return Ok(Vec::new());
    }
    // FixOrientations: se o caminho do vértice mais baixo (maior Y; em empate, menor X) não é anti-horário, inverte todos.
    let mut mais_baixo = (0usize, 0usize);
    for (ci, c) in caminhos.iter().enumerate() {
        let mut k = 0usize;
        for (pi, p) in c.iter().enumerate() {
            if p[1] > c[k][1] || (p[1] == c[k][1] && p[0] < c[k][0]) {
                k = pi;
            }
        }
        let (a, b) = (c[k], caminhos[mais_baixo.0][mais_baixo.1]);
        if ci == 0 || a[1] > b[1] || (a[1] == b[1] && a[0] < b[0]) {
            mais_baixo = (ci, k);
        }
    }
    if area_clipper(&caminhos[mais_baixo.0]) < 0.0 {
        for c in caminhos.iter_mut() {
            c.reverse();
        }
    }
    // DoOffset
    let mut deslocados: Vec<Vec<[f64; 2]>> = Vec::with_capacity(caminhos.len());
    for src in &caminhos {
        let n = src.len();
        let mut normais: Vec<[f64; 2]> = Vec::with_capacity(n);
        for j in 0..n - 1 {
            normais.push(normal_unitaria(src[j], src[j + 1]));
        }
        normais.push(normal_unitaria(src[n - 1], src[0]));
        let mut saida: Vec<[f64; 2]> = Vec::with_capacity(n * 2);
        let mut k = n - 1;
        for j in 0..n {
            deslocar_vertice(src, &normais, j, k, delta_um, &mut saida);
            k = j;
        }
        deslocados.push(saida);
    }
    // Execute: união pelo enrolamento positivo, direto sobre os inteiros de 1 µm (`Overlay` do `i_overlay`, sem o adaptador de ponto flutuante: ele
    // centra a grade na caixa dos pontos e, com a caixa de extensão ímpar, devolve coordenadas em meio micrômetro; o Clipper trabalha na grade
    // absoluta de 1 µm). O enrolamento decide externo e furo, por isso todo caminho entra como contorno do mesmo operando.
    let total: usize = deslocados.iter().map(|c| c.len()).sum();
    let mut sobrepor: Overlay<i64> = Overlay::new(total);
    let mut algum = false;
    for c in &deslocados {
        if c.len() < 3 {
            continue;
        }
        let pontos: Vec<IntPoint<i64>> = c.iter().map(|p| IntPoint::new(p[0] as i64, p[1] as i64)).collect();
        sobrepor.add_contour(&pontos, ShapeType::Subject);
        algum = true;
    }
    if !algum {
        return Ok(Vec::new());
    }
    let resultado = sobrepor.overlay(OverlayRule::Union, FillRule::Positive);
    let mut saida: MultiPoligono = Vec::with_capacity(resultado.len());
    for forma in resultado {
        let mut aneis: Poligono = Vec::with_capacity(forma.len());
        for contorno in forma {
            let mut anel: Anel = contorno.iter().map(|p| [p.x as f64 / ESCALA, p.y as f64 / ESCALA]).collect();
            if anel.len() > 1 && anel[0] == anel[anel.len() - 1] {
                anel.pop();
            }
            if anel.len() >= 3 {
                aneis.push(anel);
            }
        }
        if !aneis.is_empty() {
            saida.push(aneis);
        }
    }
    Ok(saida)
}

#[cfg(test)]
mod testes {
    use super::*;

    /// `multiArea` de `polygon.ts`: externo menos furos.
    fn area(m: &MultiPoligono) -> f64 {
        let mut total = 0.0;
        for poli in m {
            for (i, anel) in poli.iter().enumerate() {
                let a = area_com_sinal(anel).abs();
                total += if i == 0 { a } else { -a };
            }
        }
        total
    }

    /// Quadrado `lado × lado` com canto inferior esquerdo em `(x, y)`, anti-horário.
    fn quadrado(x: f64, y: f64, lado: f64) -> MultiPoligono {
        vec![vec![vec![
            [x, y],
            [x + lado, y],
            [x + lado, y + lado],
            [x, y + lado],
        ]]]
    }

    fn erro(r: Result<MultiPoligono, u32>) -> Option<u32> {
        r.err()
    }

    /// Quadrado de 10 m com um furo de 2 x 3 m que ultrapassa a borda de cima em 1 m (o furo de escada que sai do contorno, como no fixture de
    /// estresse). Como o TypeScript (`polygon-clipping`), o polígono é "externo menos furos": a parte do furo que cai fora do contorno não é região.
    fn quadrado_com_furo_que_sai() -> MultiPoligono {
        let mut q = quadrado(0.0, 0.0, 10.0);
        q[0].push(vec![[4.0, 7.0], [6.0, 7.0], [6.0, 11.0], [4.0, 11.0]]);
        q
    }

    #[test]
    fn furo_que_sai_do_contorno_nao_vira_regiao_fora_dele() {
        let p = quadrado_com_furo_que_sai();
        let grande = quadrado(-5.0, -5.0, 30.0);
        // dentro do contorno o furo ocupa 2 x 3 = 6 m²
        for escala in [ESCALA, ESCALA_FINA] {
            let i = interseccao_com_escala(&p, &grande, escala).expect("interseccao");
            assert!((area(&i) - 94.0).abs() < 1e-9, "interseccao a {escala}: {}", area(&i));
            let u = uniao_com_escala(&[p.clone()], escala).expect("uniao");
            assert!((area(&u) - 94.0).abs() < 1e-9, "uniao a {escala}: {}", area(&u));
            let d = diferenca_com_escala(&[grande.clone(), p.clone()], escala).expect("diferenca");
            assert!((area(&d) - (900.0 - 94.0)).abs() < 1e-9, "diferenca a {escala}: {}", area(&d));
        }
    }

    #[test]
    fn fechar_frestas_cola_pecas_separadas_por_2_micrometros() {
        // dois quadrados de 1 m com uma fresta de 2 µm: o fechamento (eps 3 µm) os une num retângulo só
        let a = quadrado(0.0, 0.0, 1.0);
        let mut b = quadrado(1.000002, 0.0, 1.0);
        let mut dois = a.clone();
        dois.append(&mut b);
        let r = fechar_frestas(&dois, 3e-6).expect("fechar");
        assert_eq!(r.len(), 1, "uma peça só");
        assert!((area(&r) - 2.000002).abs() < 1e-5, "área {}", area(&r));
        // fresta de 10 µm (maior que 2 x eps): continua em duas peças
        let mut c = quadrado(1.00001, 0.0, 1.0);
        let mut dois = a.clone();
        dois.append(&mut c);
        assert_eq!(fechar_frestas(&dois, 3e-6).expect("fechar").len(), 2);
        assert!(fechar_frestas(&Vec::new(), 3e-6).expect("vazio").is_empty());
    }

    #[test]
    fn fechar_frestas_seguro_devolve_a_entrada_se_a_area_muda_demais() {
        // quadrado de 0,5 m com furo quadrado de 2 µm de lado: o fechamento preencheria o furo (ganho < 1e-3: vale)
        let mut q = quadrado(0.0, 0.0, 0.5);
        q[0].push(vec![[0.2, 0.2], [0.2, 0.200002], [0.200002, 0.200002], [0.200002, 0.2]]);
        let r = fechar_frestas_seguro(&q, 3e-6, 2e-5).expect("seguro");
        assert!((area(&r) - 0.25).abs() < 1e-5);
        // tira fina de 2 µm x 20 m: o fechamento a mantém (dilata e contrai), mas se perdesse mais que maxLoss devolveria a entrada
        let fina: MultiPoligono = vec![vec![vec![[0.0, 0.0], [20.0, 0.0], [20.0, 0.000002], [0.0, 0.000002]]]];
        let s = fechar_frestas_seguro(&fina, 3e-6, 2e-5).expect("seguro");
        assert!(area(&s) >= area(&fina) - 2e-5 - 1e-12);
    }

    fn tem_vertice_repetido(anel: &Anel) -> bool {
        (0..anel.len()).any(|i| (i + 1..anel.len()).any(|j| anel[i] == anel[j]))
    }

    #[test]
    fn converter_divide_anel_que_toca_a_si_mesmo_no_vertice_repetido() {
        // Dois triângulos unidos pelo vértice (2,2), visitado duas vezes pelo mesmo anel: 4 + 4 = 8 m².
        let gravata: Formas = vec![vec![vec![[0.0, 0.0], [4.0, 0.0], [2.0, 2.0], [4.0, 4.0], [0.0, 4.0], [2.0, 2.0]]]];
        let r = converter(gravata, 1.0);
        assert_eq!(r.len(), 2, "dois polígonos simples: {r:?}");
        for poli in &r {
            assert_eq!(poli.len(), 1);
            assert!(!tem_vertice_repetido(&poli[0]), "vértice repetido: {:?}", poli[0]);
            assert!(area_com_sinal(&poli[0]) > 0.0, "externo anti-horário");
        }
        let total: f64 = r.iter().map(|p| area_absoluta(&p[0])).sum();
        assert!((total - 8.0).abs() < 1e-12, "área {total}");
    }

    #[test]
    fn converter_poe_como_furo_o_lobo_horario_do_anel_externo_e_descarta_espigao_de_area_zero() {
        // Externo 10x10 com um recorte que volta ao vértice (0,0): lobo interno horário (2x2 = 4 m²) vira furo do externo.
        // O espigão (1,0)-(0,0)-(1,0) tem área exatamente zero e some.
        let f: Formas = vec![vec![vec![
            [0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0], [0.0, 2.0], [2.0, 2.0], [2.0, 0.0], [0.0, 0.0], [-1.0, 0.0],
        ]]];
        let r = converter(f, 1.0);
        let total_liquido: f64 = r.iter().map(|p| p.iter().map(area_com_sinal).sum::<f64>()).sum();
        for poli in &r {
            for anel in poli {
                assert!(!tem_vertice_repetido(anel), "vértice repetido: {anel:?}");
            }
        }
        assert!(r.iter().all(|p| area_com_sinal(&p[0]) > 0.0));
        assert!((total_liquido - (100.0 - 4.0)).abs() < 1e-12, "área líquida {total_liquido}: {r:?}");
    }

    #[test]
    fn uniao_de_dois_quadrados_deslocados() {
        // 4×4 + 4×4 com sobreposição 2×2: 16 + 16 − 4 = 28.
        let r = uniao(&[quadrado(0.0, 0.0, 4.0), quadrado(2.0, 2.0, 4.0)]).expect("união");
        assert!((area(&r) - 28.0).abs() < 1e-9, "área {}", area(&r));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].len(), 1);
    }

    #[test]
    fn uniao_de_quadrados_disjuntos() {
        let r = uniao(&[quadrado(0.0, 0.0, 4.0), quadrado(10.0, 0.0, 4.0)]).expect("união");
        assert!((area(&r) - 32.0).abs() < 1e-9, "área {}", area(&r));
        assert_eq!(r.len(), 2);
        for poli in &r {
            assert_eq!(poli.len(), 1);
        }
    }

    #[test]
    fn uniao_de_tres_quadrados() {
        let r = uniao(&[
            quadrado(0.0, 0.0, 2.0),
            quadrado(3.0, 0.0, 2.0),
            quadrado(6.0, 0.0, 2.0),
        ])
        .expect("união");
        assert!((area(&r) - 12.0).abs() < 1e-9, "área {}", area(&r));
        assert_eq!(r.len(), 3);
    }

    #[test]
    fn diferenca_quadrado_10x10_menos_4x4_central() {
        let r = diferenca(&[quadrado(0.0, 0.0, 10.0), quadrado(3.0, 3.0, 4.0)]).expect("diferença");
        assert!((area(&r) - 84.0).abs() < 1e-9, "área {}", area(&r));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].len(), 2, "externo + furo");
        assert!(area_com_sinal(&r[0][1]) < 0.0, "furo deve sair horário");
    }

    #[test]
    fn interseccao_de_quadrados_sobrepostos() {
        let r = interseccao(&quadrado(0.0, 0.0, 4.0), &quadrado(2.0, 2.0, 4.0)).expect("interseção");
        assert!((area(&r) - 4.0).abs() < 1e-9, "área {}", area(&r));
    }

    #[test]
    fn interseccao_sem_sobreposicao_e_vazia() {
        let r = interseccao(&quadrado(0.0, 0.0, 1.0), &quadrado(5.0, 5.0, 1.0)).expect("interseção");
        assert!(r.is_empty());
    }

    #[test]
    fn offset_positivo_de_quadrado_10x10() {
        // 10×10 dilatado em 0,1 m: 10,2 × 10,2 = 104,04.
        let r = offset(&quadrado(0.0, 0.0, 10.0), 0.1).expect("offset");
        assert!((area(&r) - 104.04).abs() < 1e-3, "área {}", area(&r));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].len(), 1);
    }

    #[test]
    fn offset_negativo_encolhe_quadrado_10x10() {
        // 10×10 contraído em 0,1 m: 9,8 × 9,8 = 96,04.
        let r = offset(&quadrado(0.0, 0.0, 10.0), -0.1).expect("offset");
        assert!((area(&r) - 96.04).abs() < 1e-3, "área {}", area(&r));
    }

    #[test]
    fn poligono_com_furo_tem_area_liquida_correta() {
        // Entrada com orientações "erradas" (externo horário, furo anti-horário) para exercitar a
        // normalização: 100 − 16 = 84.
        let externo_horario: Anel = vec![[0.0, 0.0], [0.0, 10.0], [10.0, 10.0], [10.0, 0.0]];
        let furo_anti_horario: Anel = vec![[3.0, 3.0], [7.0, 3.0], [7.0, 7.0], [3.0, 7.0]];
        let m: MultiPoligono = vec![vec![externo_horario, furo_anti_horario]];

        let r = uniao(&[m]).expect("união");
        assert!((area(&r) - 84.0).abs() < 1e-9, "área {}", area(&r));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].len(), 2);
        assert!(area_com_sinal(&r[0][0]) > 0.0, "externo deve sair anti-horário");
        assert!(area_com_sinal(&r[0][1]) < 0.0, "furo deve sair horário");
    }

    #[test]
    fn offset_de_poligono_com_furo_acompanha_o_furo() {
        // 10×10 com furo 4×4; delta −0,5: externo 9×9, furo 5×5 → 81 − 25 = 56.
        let externo: Anel = vec![[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]];
        let furo: Anel = vec![[3.0, 3.0], [3.0, 7.0], [7.0, 7.0], [7.0, 3.0]];
        let m: MultiPoligono = vec![vec![externo, furo]];
        let r = offset(&m, -0.5).expect("offset");
        assert!((area(&r) - 56.0).abs() < 1e-3, "área {}", area(&r));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].len(), 2);
    }

    #[test]
    fn diferenca_sequencial_com_dois_subtraendos() {
        // 10×10 menos dois quadrados 2×2 disjuntos: 100 − 4 − 4 = 92.
        let r = diferenca(&[
            quadrado(0.0, 0.0, 10.0),
            quadrado(1.0, 1.0, 2.0),
            quadrado(6.0, 6.0, 2.0),
        ])
        .expect("diferença");
        assert!((area(&r) - 92.0).abs() < 1e-9, "área {}", area(&r));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].len(), 3, "externo + dois furos");
    }

    #[test]
    fn diferenca_com_um_arg_devolve_copia_fiel() {
        let m = quadrado(0.0, 0.0, 4.0);
        let r = diferenca(&[m.clone()]).expect("diferença");
        assert_eq!(r, m);
    }

    #[test]
    fn atalhos_de_vazio() {
        let vazio: MultiPoligono = Vec::new();
        assert!(uniao(&[]).expect("união vazia").is_empty());
        assert!(uniao(&[vazio.clone(), vazio.clone()]).expect("união vazia").is_empty());
        assert!(interseccao(&vazio, &quadrado(0.0, 0.0, 1.0)).expect("interseção vazia").is_empty());
        assert!(interseccao(&quadrado(0.0, 0.0, 1.0), &vazio).expect("interseção vazia").is_empty());
        assert!(diferenca(&[vazio.clone(), quadrado(0.0, 0.0, 1.0)]).expect("diferença vazia").is_empty());
        assert!(offset(&vazio, 0.1).expect("offset vazio").is_empty());
    }

    #[test]
    fn degenerados_sao_ignorados_e_coordenada_invalida_e_erro() {
        // Sem área: o resultado é vazio, não erro (o kernel não pode se desligar por causa disso).
        let anel_com_dois_pontos: MultiPoligono = vec![vec![vec![[0.0, 0.0], [1.0, 1.0]]]];
        assert!(uniao(&[anel_com_dois_pontos]).expect("união degenerada").is_empty());

        let anel_vazio: MultiPoligono = vec![vec![Vec::new()]];
        assert!(uniao(&[anel_vazio]).expect("anel vazio").is_empty());

        let poligono_sem_aneis: MultiPoligono = vec![Vec::new()];
        assert!(uniao(&[poligono_sem_aneis]).expect("polígono sem anéis").is_empty());

        // Degenerado misturado com um quadrado válido: só o quadrado conta.
        let misto: MultiPoligono = vec![vec![vec![[0.0, 0.0], [1.0, 1.0]]], quadrado(0.0, 0.0, 2.0).remove(0)];
        assert!((area(&uniao(&[misto]).expect("misto")) - 4.0).abs() < 1e-9);

        // Subtraendo degenerado não muda o minuendo; minuendo degenerado dá vazio.
        let dois_pontos: MultiPoligono = vec![vec![vec![[0.0, 0.0], [1.0, 1.0]]]];
        assert!((area(&diferenca(&[quadrado(0.0, 0.0, 2.0), dois_pontos.clone()]).expect("dif")) - 4.0).abs() < 1e-9);
        assert!(diferenca(&[dois_pontos, quadrado(0.0, 0.0, 2.0)]).expect("dif2").is_empty());

        let com_nan: MultiPoligono = vec![vec![vec![
            [f64::NAN, 0.0],
            [1.0, 0.0],
            [1.0, 1.0],
        ]]];
        assert_eq!(erro(uniao(&[com_nan])), Some(ERRO_ENTRADA));

        let com_infinito: MultiPoligono = vec![vec![vec![
            [0.0, 0.0],
            [f64::INFINITY, 0.0],
            [1.0, 1.0],
        ]]];
        assert_eq!(erro(offset(&com_infinito, 0.1)), Some(ERRO_ENTRADA));

        // Delta inválido também não pode chegar ao `i_overlay`.
        assert_eq!(erro(offset(&quadrado(0.0, 0.0, 1.0), f64::NAN)), Some(ERRO_ENTRADA));
        assert_eq!(
            erro(offset(&quadrado(0.0, 0.0, 1.0), f64::INFINITY)),
            Some(ERRO_ENTRADA)
        );

        // Subtraendo com coordenada inválida continua recusado, antes de qualquer operação.
        let invalido: MultiPoligono = vec![vec![vec![[f64::NAN, 0.0], [1.0, 0.0], [1.0, 1.0]]]];
        assert_eq!(
            erro(diferenca(&[quadrado(0.0, 0.0, 10.0), invalido])),
            Some(ERRO_ENTRADA)
        );
    }

    #[test]
    fn offset_clipper_quadrado_cresce_e_encolhe_em_esquadria() {
        let q = quadrado(0.0, 0.0, 1.0);
        let fora = offset_clipper(&q, 0.02).expect("offset");
        assert_eq!(fora.len(), 1);
        assert!((area(&fora) - 1.04 * 1.04).abs() < 1e-9, "área {}", area(&fora));
        let dentro = offset_clipper(&q, -0.02).expect("offset");
        assert!((area(&dentro) - 0.96 * 0.96).abs() < 1e-9, "área {}", area(&dentro));
        // encolher além do tamanho some com a forma; vazio devolve vazio
        assert!(offset_clipper(&q, -0.6).expect("offset").is_empty());
        assert!(offset_clipper(&Vec::new(), 0.1).expect("offset").is_empty());
        assert_eq!(offset_clipper(&q, f64::NAN).err(), Some(ERRO_ENTRADA));
    }

    #[test]
    fn offset_clipper_com_furo_acompanha_o_furo() {
        let mut q = quadrado(0.0, 0.0, 2.0);
        q[0].push(vec![[0.8, 0.8], [0.8, 1.2], [1.2, 1.2], [1.2, 0.8]]);
        let fora = offset_clipper(&q, 0.1).expect("offset");
        // o externo vai a 2,2 x 2,2 e o furo (0,4 x 0,4) encolhe para 0,2 x 0,2
        assert!((area(&fora) - (2.2 * 2.2 - 0.2 * 0.2)).abs() < 1e-9, "área {}", area(&fora));
    }

    #[test]
    fn offset_clipper_canto_agudo_faz_quadrado_e_nao_o_miter_do_i_overlay() {
        // triângulo isósceles de ponta 28° (mais agudo que 60°): o Clipper faz o canto quadrado no vértice agudo (turno de 152°: r = 0,117 < 0,5)
        // e esquadria nos dois da base (76°). Área = triângulo (4) + perímetro x d + miter exato nos dois cantos da base + o quadrado do canto agudo.
        let t: MultiPoligono = vec![vec![vec![[0.0, 0.0], [4.0, -1.0], [4.0, 1.0]]]];
        let d: f64 = 0.05;
        let clip = area(&offset_clipper(&t, d).expect("offset"));
        let perimetro = 2.0 * 17f64.sqrt() + 2.0;
        let miter_exato_agudo = d * d * (76f64.to_radians()).tan();
        let miter_base = 2.0 * d * d * (52f64.to_radians()).tan();
        let sem_canto_agudo = 4.0 + perimetro * d + miter_base;
        assert!(clip > sem_canto_agudo && clip < sem_canto_agudo + miter_exato_agudo, "área {clip}: o quadrado fica entre o chanfro e o miter exato");
        // o miter do i_overlay deixa passar mais área neste canto: as duas operações NÃO são a mesma
        let miter_do_overlay = area(&offset(&t, d).expect("offset"));
        assert!((miter_do_overlay - clip).abs() > 1e-4, "i_overlay {miter_do_overlay} x Clipper {clip}");
        // canto de 90°: igual ao miter do i_overlay
        let q = quadrado(0.0, 0.0, 1.0);
        assert!((area(&offset_clipper(&q, 0.05).expect("a")) - area(&offset(&q, 0.05).expect("b"))).abs() < 1e-9);
    }

    #[test]
    fn offset_clipper_fica_na_grade_absoluta_de_1_micrometro() {
        // caixa de extensão ímpar em y (o adaptador de ponto flutuante do i_overlay centraria a grade e devolveria meio micrômetro)
        let m: MultiPoligono = vec![vec![vec![[4.092, 4.121], [5.879, 4.121], [5.879, 6.520283], [5.726803, 6.507855], [5.266106, 6.454609], [4.807458, 6.385917], [4.351376, 6.301856], [4.092, 6.244978]]]];
        for delta in [-0.03, 0.02] {
            let r = offset_clipper(&m, delta).expect("offset");
            assert!(!r.is_empty());
            for p in r.iter().flatten().flatten() {
                for v in p {
                    assert!((v * 1e6 - (v * 1e6).round()).abs() < 1e-6, "coordenada {v} fora da grade de 1 µm");
                }
            }
        }
    }

    /// Assinatura de uma forma na precisão que o TypeScript compara (1e-6): vértices arredondados, anel girado ao menor vértice, tudo ordenado.
    fn assinatura(m: &MultiPoligono) -> Vec<Vec<String>> {
        let mut polis: Vec<Vec<String>> = m
            .iter()
            .map(|p| {
                let mut aneis: Vec<String> = p
                    .iter()
                    .map(|r| {
                        let pts: Vec<String> = r.iter().map(|q| format!("{:.6},{:.6}", q[0], q[1])).collect();
                        let k = (0..pts.len()).min_by(|&a, &b| pts[a].cmp(&pts[b])).unwrap_or(0);
                        pts[k..].iter().chain(pts[..k].iter()).cloned().collect::<Vec<_>>().join(";")
                    })
                    .collect();
                aneis.sort();
                aneis
            })
            .collect();
        polis.sort();
        polis
    }

    /// Região `a` com a aresta de baixo e a da esquerda inclinadas, e a vizinha `s2` que só ENCOSTA na aresta inclinada da direita: os vértices dela ficam
    /// sobre a reta da aresta (pontos em outras posições da reta, fora da grade). Interseção exata: área zero.
    fn regiao_e_vizinha_que_encosta(k: usize) -> (MultiPoligono, MultiPoligono, MultiPoligono) {
        let d = |n: usize, m: usize| ((n * 7919 + m * 104729) % 1000) as f64 * 1e-9; // deslocamentos fora da grade, de 0 a 1 µm
        let p = [1.0 + d(k, 1), 0.0 + d(k, 2)];
        let q = [1.3 + d(k, 3), 0.2 + d(k, 4)];
        let a: MultiPoligono = vec![vec![vec![[0.0 + d(k, 5), 0.0], p, q, [0.0, 0.2 + d(k, 6)]]]];
        let pt = |t: f64| [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
        let (t1, t2) = (0.1 + (k % 7) as f64 * 0.01, 0.6 + (k % 11) as f64 * 0.03);
        let (r1, r2) = (pt(t1), pt(t2));
        let s2: MultiPoligono = vec![vec![vec![r1, [r1[0] + 0.1, r1[1]], [r2[0] + 0.1, r2[1]], r2]]];
        let s1: MultiPoligono = vec![vec![vec![[-1.0, -1.0], [0.4, -1.0], [0.4, 1.0], [-1.0, 1.0]]]]; // corta de verdade a ponta esquerda
        (a, s1, s2)
    }

    #[test]
    fn vizinha_que_so_encosta_nao_muda_os_vertices_da_diferenca() {
        // A mesma região, com e sem uma vizinha que só encosta nela, tem de sair com os mesmos vértices (a precisão de 1e-6 do TypeScript). A 1 µm,
        // a vizinha quantizada separadamente entra alguns décimos de µm na região e deixa vértices novos na borda: era o que dividia uma camada de
        // parede em duas faixas de cota quando a vizinha só existia numa delas.
        let mut mudou_em_1um = 0;
        for k in 0..200 {
            let (a, s1, s2) = regiao_e_vizinha_que_encosta(k);
            let sem = crate::executar_op(crate::OP_DIFERENCA, &[a.clone(), s1.clone()], 1.0).expect("sem");
            let com = crate::executar_op(crate::OP_DIFERENCA, &[a.clone(), s1.clone(), s2.clone()], 1.0).expect("com");
            assert_eq!(assinatura(&sem), assinatura(&com), "caso {k}: a vizinha que só encosta mudou a região");
            let antigo_sem = diferenca(&[a.clone(), s1.clone()]).expect("a");
            let antigo_com = diferenca(&[a, s1, s2]).expect("b");
            if assinatura(&antigo_sem) != assinatura(&antigo_com) {
                mudou_em_1um += 1;
            }
        }
        assert!(mudou_em_1um > 0, "a premissa do teste: a 1 µm a vizinha que só encosta muda a região em algum caso");
    }

    #[test]
    fn corta_de_verdade_so_descarta_o_que_apenas_encosta() {
        // Os 200 vizinhos que só encostam (vértices sobre a reta da aresta, em ponto flutuante) são descartados; um vizinho que entra 1 nm na região
        // (sobreposição real, mínima e não nula) NÃO é: sem número arbitrário, qualquer sobreposição conta.
        for k in 0..200 {
            let (a, _s1, s2) = regiao_e_vizinha_que_encosta(k);
            assert!(!corta_de_verdade(&a, &s2).expect("encosta"), "caso {k}: vizinho que só encosta deveria ser descartado");
            let entra: MultiPoligono = s2.iter().map(|p| p.iter().map(|r| r.iter().map(|q| [q[0] - 1e-9, q[1]]).collect()).collect()).collect();
            assert!(corta_de_verdade(&a, &entra).expect("entra"), "caso {k}: vizinho que entra 1 nm deveria cortar");
        }
    }
}
