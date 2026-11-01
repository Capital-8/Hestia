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
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::scale::FixedScaleFloatOverlay;
use i_overlay::mesh::float::outline::offset::OutlineOffset;
use i_overlay::mesh::float::style::{LineJoin, OutlineStyle};

use crate::{Anel, MultiPoligono, Poligono, ERRO_ENTRADA, ERRO_INTERNO};

/// Escala da quantização: 1 µm, a mesma de `CLIP_SCALE` em `boolean.ts`.
const ESCALA: f64 = 1e6;

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
fn quantizar(valor: f64) -> Result<f64, u32> {
    if !valor.is_finite() {
        return Err(ERRO_ENTRADA);
    }
    let escalado = valor * ESCALA;
    if !escalado.is_finite() || escalado.abs() > LIMITE_ESCALADO {
        return Err(ERRO_ENTRADA);
    }
    Ok((escalado + 0.5).floor())
}

/// Valida, orienta e quantiza um multipolígono para o formato do `i_overlay`.
fn preparar(m: &MultiPoligono) -> Result<Formas, u32> {
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
                    pontos.push([quantizar(p[0])?, quantizar(p[1])?]);
                }
            } else {
                for p in anel.iter() {
                    pontos.push([quantizar(p[0])?, quantizar(p[1])?]);
                }
            }
            aneis.push(pontos);
        }
        formas.push(aneis);
    }
    Ok(formas)
}

/// Converte a saída do `i_overlay` para o modelo do ABI, de volta em metros.
fn converter(formas: Formas) -> MultiPoligono {
    let mut saida: MultiPoligono = Vec::with_capacity(formas.len());
    for poli in formas {
        let mut aneis: Poligono = Vec::with_capacity(poli.len());
        for mut anel in poli {
            // O Clipper/`i_overlay` não repetem o primeiro ponto, mas não custa garantir.
            if anel.len() > 1 && anel[0] == anel[anel.len() - 1] {
                anel.pop();
            }
            if anel.len() < 3 {
                continue;
            }
            aneis.push(
                anel
                    .into_iter()
                    .map(|p| [p[0] / ESCALA, p[1] / ESCALA])
                    .collect(),
            );
        }
        if !aneis.is_empty() {
            saida.push(aneis);
        }
    }
    saida
}

/// Operação booleana em coordenadas quantizadas (µm) com escala fixa `1.0` e motor `i64`.
fn aplicar(a: &Formas, b: &Formas, regra: OverlayRule) -> Result<Formas, u32> {
    a.overlay_with_fixed_scale_as::<i64>(b, regra, FillRule::NonZero, 1.0)
        .map_err(|_| ERRO_INTERNO)
}

/// `union(...)` e `unionClipper(...)`.
pub fn uniao(args: &[MultiPoligono]) -> Result<MultiPoligono, u32> {
    if args.is_empty() {
        return Ok(Vec::new());
    }
    let mut todas: Formas = Vec::new();
    for m in args {
        todas.extend(preparar(m)?);
    }
    if todas.is_empty() {
        return Ok(Vec::new());
    }
    // Todos os operandos entram como sujeito único: com NonZero isso é a união de todos, sem
    // depender da ordem (equivale ao `unionClipper` do TS).
    let vazio: Formas = Vec::new();
    let resultado = aplicar(&todas, &vazio, OverlayRule::Union)?;
    Ok(converter(resultado))
}

/// `difference(a, ...bs)` e `differenceClipper(a, ...bs)`.
pub fn diferenca(args: &[MultiPoligono]) -> Result<MultiPoligono, u32> {
    let Some(primeiro) = args.first() else {
        return Err(ERRO_ENTRADA);
    };
    // Valida todos antes dos atalhos: entrada degenerada nunca chega ao `i_overlay`.
    let preparados: Vec<Formas> = args
        .iter()
        .map(preparar)
        .collect::<Result<_, _>>()?;
    if primeiro.is_empty() || preparados[0].is_empty() {
        return Ok(Vec::new());
    }
    // UMA passada: todos os subtraendos entram juntos como clip. Com NonZero e a orientação normalizada em `preparar`,
    // o conjunto de clips equivale à união deles, então `a − (b1 ∪ b2 ∪ ...)` é igual a subtrair um a um — sem refazer
    // a varredura sobre o acumulado a cada subtraendo (com ~300 subtraendos, a versão em laço era 10× mais lenta que o TS).
    let mut todos: Formas = Vec::new();
    for subtraendo in preparados.iter().skip(1) {
        todos.extend(subtraendo.iter().cloned());
    }
    if todos.is_empty() {
        return Ok(primeiro.clone());
    }
    let resultado = aplicar(&preparados[0], &todos, OverlayRule::Difference)?;
    if resultado.is_empty() {
        return Ok(Vec::new());
    }
    Ok(converter(resultado))
}

/// `intersection(a, b)`.
pub fn interseccao(a: &MultiPoligono, b: &MultiPoligono) -> Result<MultiPoligono, u32> {
    if a.is_empty() || b.is_empty() {
        return Ok(Vec::new());
    }
    let a = preparar(a)?;
    let b = preparar(b)?;
    if a.is_empty() || b.is_empty() {
        return Ok(Vec::new());
    }
    let resultado = aplicar(&a, &b, OverlayRule::Intersect)?;
    Ok(converter(resultado))
}

/// `offsetMulti(m, delta)`.
pub fn offset(m: &MultiPoligono, delta: f64) -> Result<MultiPoligono, u32> {
    if m.is_empty() {
        return Ok(Vec::new());
    }
    if !delta.is_finite() {
        return Err(ERRO_ENTRADA);
    }
    let delta_em_um = delta * ESCALA;
    if !delta_em_um.is_finite() || delta_em_um.abs() > LIMITE_ESCALADO {
        return Err(ERRO_ENTRADA);
    }
    let formas = preparar(m)?;
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
    Ok(converter(resultado))
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
}
