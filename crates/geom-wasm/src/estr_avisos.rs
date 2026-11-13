//! Avisos da estrutura (docs/estrutura/PLANO.md, A.4.7; consulta 204 `estr_avisos`; ficha K4): as MEDIDAS; o TS decide texto, severidade e "Ir para".
//!
//! `avisos [elemento_num, categoria, codigo, ref_num]` e `valores [medido, limite, x, y, z]`, id estável `(categoria, elemento_num, codigo)`, em ordem
//! de categoria, elemento e código. Onde não há medida, `medido` e `limite` dizem a contagem e o mínimo. Por código:
//! 1. perfil inválido: o tipo não existe, o perfil (base ou pescoço, na fundação) não forma contorno pela A.2 ou o tipo de fundação não bate com a
//!    linha; `ref_num` = `tipo_num`; medido = limite = 0; posição: a do elemento na cota do nível (0 se o nível não existe);
//! 2. pilar com altura menor que o eixo mínimo da A.4.1 (1 mm; inclui altura <= 0 e não finita): medido = topo - base, limite = 0,001; na base;
//! 3. viga com eixo 3D < 0,05 m: medido = comprimento, limite = 0,05; no meio do eixo;
//! 4. pilar estrutural sem fundação sob ele (informativo): nenhuma fundação (de qualquer nível) cujo contorno em planta (base, pescoço ou corrida)
//!    contenha a posição do pilar, com 5 cm de folga (A.4.5 d), e cujo fundo esteja abaixo da base do pilar. medido = 0 fundações, limite = 1; na base.
//!    Radier (laje) não passa pelo kernel: o pilar sobre radier também recebe este aviso;
//! 5. viga cujas DUAS extremidades não encostam em pilar, parede ou outra viga (informativo; uma ponta livre é balanço, sem aviso). Uma ponta encosta
//!    quando está dentro, ou a até 1 cm, do contorno em planta do outro elemento e as cotas da seção da viga naquela ponta cruzam as dele (com 1 cm).
//!    medido = 0 pontas apoiadas, limite = 1; no meio do eixo;
//! 6. fundação com o topo acima do nível do pilar que ela recebe (pilar estrutural com a posição dentro do contorno da fundação, 5 cm de folga):
//!    medido = cota do topo, limite = cota do nível do pilar (seção 19), `ref_num` = o pilar (o de menor `id_num`, se vários); no topo da fundação.
//!
//! Elemento cujo tipo ou nível falta só recebe o que dá para medir. `ref_num` = `ID_AUSENTE` onde não se aplica.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ID_AUSENTE, NIVEL_TODOS};
use crate::estr_juncoes::{caixa, distancia_ao_anel, na_caixa, paredes_planta, pilares_planta};
use crate::estr_malha::{cota_do_nivel, CATEGORIA_FUNDACAO, CATEGORIA_PILAR, CATEGORIA_VIGA, EIXO_MINIMO};
use crate::estr_perfil::{contorno_do_tipo, LADOS_CIRCULO, P2};
use crate::estr_planta::{elementos, ElementoEstr};
use crate::secoes_estr::{tipo_fundacao_valido, PerfilLinha, DISCIPLINA_ESTRUTURAL, FUNDACAO_CORRIDA, FUNDACAO_ISOLADA};

pub const AVISO_PERFIL_INVALIDO: u32 = 1;
pub const AVISO_PILAR_SEM_ALTURA: u32 = 2;
pub const AVISO_VIGA_CURTA: u32 = 3;
pub const AVISO_PILAR_SEM_FUNDACAO: u32 = 4;
pub const AVISO_VIGA_SOLTA: u32 = 5;
pub const AVISO_FUNDACAO_ALTA: u32 = 6;
/// Viga mais curta que isto: aviso 3 (m).
pub const VIGA_MINIMA: f64 = 0.05;
/// Folga da relação pilar × fundação (A.4.5 d) (m).
pub const FOLGA_FUNDACAO: f64 = 0.05;
/// Folga do encosto da ponta da viga (m).
pub const FOLGA_ENCOSTO: f64 = 0.01;

/// Contornos em planta de um elemento, com as caixas.
type Contornos = Vec<(Vec<P2>, [f64; 4])>;
/// Elementos com os contornos e a faixa de cotas.
type Vistos<'a> = Vec<(&'a ElementoEstr, Contornos, [f64; 2])>;

struct Aviso {
    chave: (u32, u32, u32),
    refe: u32,
    valores: [f64; 5],
}

fn aviso(out: &mut Vec<Aviso>, categoria: u32, elemento: u32, codigo: u32, refe: u32, valores: [f64; 5]) {
    out.push(Aviso { chave: (categoria, elemento, codigo), refe, valores });
}

/// Contornos em planta de um elemento (anel externo de cada prisma, projetado).
fn contornos(e: &ElementoEstr) -> Contornos {
    e.pecas.iter().map(|p| { let a = p.contorno_planta(); let c = caixa(&a); (a, c) }).collect()
}

fn perto(contornos: &[(Vec<P2>, [f64; 4])], p: P2, folga: f64) -> bool {
    contornos.iter().any(|(a, c)| na_caixa(c, p, folga) && distancia_ao_anel(p, a) <= folga)
}

fn faixa(e: &ElementoEstr) -> [f64; 2] {
    e.pecas.iter().map(|p| p.faixa_z()).fold([f64::INFINITY, f64::NEG_INFINITY], |f, z| [f[0].min(z[0]), f[1].max(z[1])])
}

fn cruzam(a: [f64; 2], b: [f64; 2], folga: f64) -> bool {
    a[0] <= b[1] + folga && b[0] <= a[1] + folga
}

/// Consulta 204 `estr_avisos`.
pub fn consulta_estr_avisos(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let estr = &cena.estr;
    let do_nivel = |n: u32| nivel == NIVEL_TODOS || n == nivel;
    let cota = |n: u32| cota_do_nivel(cena, n).unwrap_or(0.0);
    let valido = |p: &PerfilLinha| contorno_do_tipo(estr, p, LADOS_CIRCULO).is_ok();
    let todos = elementos(cena, NIVEL_TODOS, 2);
    let fundacoes: Vistos = todos.iter().filter(|e| e.categoria == CATEGORIA_FUNDACAO).map(|e| (e, contornos(e), faixa(e))).collect();
    let mut out = Vec::new();
    for (&num, l) in estr.pilares.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let base = cota(l.nivel) + l.deslocamento_base;
        let tipo = estr.tipos_pilar.get(&l.tipo);
        if !tipo.is_some_and(|t| valido(&t.perfil)) {
            aviso(&mut out, CATEGORIA_PILAR, num, AVISO_PERFIL_INVALIDO, l.tipo, [0.0, 0.0, l.pos[0], l.pos[1], base]);
        }
        if let Ok(c) = cota_do_nivel(cena, l.nivel) {
            let base = c + l.deslocamento_base;
            let topo = if l.nivel_topo == ID_AUSENTE { Ok(base + l.altura) } else { cota_do_nivel(cena, l.nivel_topo).map(|t| t + l.deslocamento_topo) };
            if let Ok(topo) = topo {
                if (topo - base).is_nan() || topo - base < EIXO_MINIMO {
                    aviso(&mut out, CATEGORIA_PILAR, num, AVISO_PILAR_SEM_ALTURA, ID_AUSENTE, [topo - base, EIXO_MINIMO, l.pos[0], l.pos[1], base]);
                }
            }
        }
        if tipo.is_some_and(|t| t.disciplina == DISCIPLINA_ESTRUTURAL) && todos.iter().any(|e| e.categoria == CATEGORIA_PILAR && e.num == num) {
            let apoiado = fundacoes.iter().any(|(_, c, z)| z[0] <= base + 1e-9 && perto(c, l.pos, FOLGA_FUNDACAO));
            if !apoiado {
                aviso(&mut out, CATEGORIA_PILAR, num, AVISO_PILAR_SEM_FUNDACAO, ID_AUSENTE, [0.0, 1.0, l.pos[0], l.pos[1], base]);
            }
        }
    }
    let pilares = pilares_planta(&todos, None);
    let paredes = paredes_planta(cena);
    let vigas: Vistos = todos.iter().filter(|e| e.categoria == CATEGORIA_VIGA).map(|e| (e, contornos(e), faixa(e))).collect();
    for (&num, l) in estr.vigas.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let c = cota(l.nivel);
        let (za, zb) = (c + l.deslocamento_z[0], c + l.deslocamento_z[1]);
        let meio = [(l.a[0] + l.b[0]) / 2.0, (l.a[1] + l.b[1]) / 2.0, (za + zb) / 2.0];
        if !estr.tipos_viga.get(&l.tipo).is_some_and(|t| valido(&t.perfil)) {
            aviso(&mut out, CATEGORIA_VIGA, num, AVISO_PERFIL_INVALIDO, l.tipo, [0.0, 0.0, meio[0], meio[1], meio[2]]);
        }
        let comprimento = ((l.b[0] - l.a[0]).powi(2) + (l.b[1] - l.a[1]).powi(2) + (zb - za).powi(2)).sqrt();
        if comprimento.is_nan() || comprimento < VIGA_MINIMA {
            aviso(&mut out, CATEGORIA_VIGA, num, AVISO_VIGA_CURTA, ID_AUSENTE, [comprimento, VIGA_MINIMA, meio[0], meio[1], meio[2]]);
        }
        let Some((e, _, _)) = vigas.iter().find(|(e, _, _)| e.num == num) else { continue };
        let Some(peca) = e.pecas.first() else { continue };
        let encosta = |k: usize| {
            let (p, z) = (if k == 0 { l.a } else { l.b }, peca.faixa_z_em(k as f64));
            pilares.iter().any(|pl| cruzam(z, pl.z, FOLGA_ENCOSTO) && na_caixa(&pl.caixa, p, FOLGA_ENCOSTO) && distancia_ao_anel(p, &pl.anel) <= FOLGA_ENCOSTO)
                || paredes.iter().any(|w| cruzam(z, w.z, FOLGA_ENCOSTO) && na_caixa(&w.caixa, p, FOLGA_ENCOSTO) && distancia_ao_anel(p, &w.anel) <= FOLGA_ENCOSTO)
                || vigas.iter().any(|(o, c, zo)| o.num != num && cruzam(z, *zo, FOLGA_ENCOSTO) && perto(c, p, FOLGA_ENCOSTO))
        };
        if !encosta(0) && !encosta(1) {
            aviso(&mut out, CATEGORIA_VIGA, num, AVISO_VIGA_SOLTA, ID_AUSENTE, [0.0, 1.0, meio[0], meio[1], meio[2]]);
        }
    }
    for (&num, l) in estr.fundacoes.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let topo = cota(l.nivel) + l.deslocamento_topo;
        let pos = l.pos.or(l.eixo.map(|(a, b)| [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0])).unwrap_or([0.0, 0.0]);
        let tipo = estr.tipos_fundacao.get(&l.tipo);
        let coerente = tipo.is_some_and(|t| {
            let modo_ok = (t.modo == FUNDACAO_ISOLADA && l.pos.is_some()) || (t.modo == FUNDACAO_CORRIDA && l.eixo.is_some());
            modo_ok && tipo_fundacao_valido(t) && valido(&t.base) && t.pescoco.is_none_or(|(p, _)| valido(&p))
        });
        if !coerente {
            aviso(&mut out, CATEGORIA_FUNDACAO, num, AVISO_PERFIL_INVALIDO, l.tipo, [0.0, 0.0, pos[0], pos[1], topo]);
        }
        let Some((_, c, _)) = fundacoes.iter().find(|(e, _, _)| e.num == num) else { continue };
        let alvo = estr.pilares.iter().find(|(_, p)| {
            let estrutural = estr.tipos_pilar.get(&p.tipo).is_some_and(|t| t.disciplina == DISCIPLINA_ESTRUTURAL);
            estrutural && perto(c, p.pos, FOLGA_FUNDACAO) && cota_do_nivel(cena, p.nivel).is_ok_and(|n| topo > n + 1e-9)
        });
        if let Some((&pilar, p)) = alvo {
            aviso(&mut out, CATEGORIA_FUNDACAO, num, AVISO_FUNDACAO_ALTA, pilar, [topo, cota(p.nivel), pos[0], pos[1], topo]);
        }
    }
    out.sort_by_key(|a| a.chave);
    let (mut tab, mut val) = (Vec::with_capacity(4 * out.len()), Vec::with_capacity(5 * out.len()));
    for a in out {
        tab.extend([a.chave.1, a.chave.0, a.chave.2, a.refe]);
        val.extend(a.valores);
    }
    Ok(vec![Saida::U32(tab), Saida::F64(val)])
}
