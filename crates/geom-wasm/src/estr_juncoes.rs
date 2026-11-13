//! Junções da estrutura (docs/estrutura/PLANO.md, A.4.5; consulta 206 `estr_juncoes`; ficha K4). O kernel só MEDE; o TS aplica os recortes às paredes.
//!
//! - (a) recortes: o pilar ESTRUTURAL vence a parede. Há recorte quando o anel externo do pilar em planta cobre área (> 1e-8 m²) da faixa da parede e
//!   as cotas se sobrepõem; o contorno do recorte é o anel externo do pilar (perfil exato, 96 lados no círculo; anti-horário, sem repetir o primeiro) e
//!   `recortes_z` o trecho vertical comum `[max(bases), min(topos)]`. A faixa da parede vem do quadro da A1 (`quadros_do_nivel`: faces reais, arco
//!   amostrado) e as cotas de `paredes_quadro` (z0 e topo). Nível cujas paredes não formam quadro (seções 2, 3 ou 4 incompletas): a faixa centrada
//!   no segmento da seção 1 com a espessura dela, sem limite de cota. Cena sem paredes: listas vazias.
//! - (b) uniões: o pilar arquitetônico com `hosp_num` de uma parede presente na seção 1 une com ela (sem recorte, mesma hachura do acabamento).
//! - (c) aparos: a ponta do eixo da viga que cai DENTRO do anel externo de um pilar estrutural (em planta, com as cotas da seção da viga naquela ponta
//!   sobrepostas às do pilar) recua ao longo do eixo até onde o eixo sai do anel (a primeira saída). `aparos_recuo` é o recuo ao longo do eixo 3D (m);
//!   na viga horizontal é a distância em planta. Pilar arquitetônico não apara (é revestimento). Ponta dentro de vários pilares: o maior recuo (empate,
//!   o menor `id_num`). Viga de eixo vertical em planta (< 1 mm) ou que sumiria (sobra < 1 mm): sem aparo.
//! - (d) a fundação sob o pilar (herda a rotação) é comando do TS, não sai aqui.
//!
//! Os pilares e paredes de QUALQUER nível entram (a cota decide); `nivel_num` filtra o elemento do lado esquerdo de cada lista (parede, viga, pilar).

use std::collections::BTreeSet;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::NIVEL_TODOS;
use crate::estr_malha::{CATEGORIA_PILAR, CATEGORIA_VIGA, EIXO_MINIMO, PARTE_CORPO};
use crate::estr_perfil::{area_com_sinal, dentro, P2};
use crate::estr_planta::{elementos, ElementoEstr};
use crate::geo2d::{arco_amostra, v};
use crate::quadro::ponto_em;
use crate::secoes_estr::{DISCIPLINA_ARQUITETONICO, DISCIPLINA_ESTRUTURAL};

const EPS: f64 = 1e-9;
/// Área mínima de sobreposição pilar × parede para haver recorte (m²).
const AREA_RECORTE: f64 = 1e-8;

/// Caixa `[xmin, ymin, xmax, ymax]` de um anel.
pub fn caixa(anel: &[P2]) -> [f64; 4] {
    anel.iter().fold([f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY], |c, p| [c[0].min(p[0]), c[1].min(p[1]), c[2].max(p[0]), c[3].max(p[1])])
}

/// O ponto está na caixa expandida por `folga`.
pub fn na_caixa(c: &[f64; 4], p: P2, folga: f64) -> bool {
    p[0] >= c[0] - folga && p[0] <= c[2] + folga && p[1] >= c[1] - folga && p[1] <= c[3] + folga
}

/// Distância do ponto ao anel (0 dentro).
pub fn distancia_ao_anel(p: P2, anel: &[P2]) -> f64 {
    if anel.len() >= 3 && dentro(p, anel) {
        return 0.0;
    }
    let n = anel.len();
    (0..n)
        .map(|i| {
            let (a, b) = (anel[i], anel[(i + 1) % n]);
            let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
            let l2 = dx * dx + dy * dy;
            let t = if l2 > 0.0 { (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
            (p[0] - a[0] - t * dx).hypot(p[1] - a[1] - t * dy)
        })
        .fold(f64::INFINITY, f64::min)
}

/// Uma parede em planta: a faixa (anel) e as cotas.
#[derive(Clone, Debug, PartialEq)]
pub struct ParedePlanta {
    pub id: u32,
    pub anel: Vec<P2>,
    pub z: [f64; 2],
    pub caixa: [f64; 4],
}

/// As paredes de todos os níveis em planta, em ordem de `id_num` (ver o topo do arquivo).
pub fn paredes_planta(cena: &Cena) -> Vec<ParedePlanta> {
    let refs = cena.paredes.do_nivel(NIVEL_TODOS);
    let niveis: BTreeSet<u32> = refs.iter().map(|w| w.nivel).collect();
    let mut out = Vec::new();
    let mut push = |id: u32, anel: Vec<P2>, z: [f64; 2]| {
        if anel.len() >= 3 && anel.iter().flatten().all(|c| c.is_finite()) {
            out.push(ParedePlanta { id, caixa: caixa(&anel), anel, z });
        }
    };
    for n in niveis {
        match crate::a1::quadros_do_nivel(cena, n) {
            Ok(qs) => {
                for q in qs {
                    let anel: Vec<P2> = match &q.arc {
                        Some(arco) => {
                            let lo = arco_amostra(arco, 0.0, q.length, q.s_lo, 0.005);
                            let hi = arco_amostra(arco, 0.0, q.length, q.s_hi, 0.005);
                            lo.iter().chain(hi.iter().rev()).map(|p| [p.x, p.y]).collect()
                        }
                        None => [(0.0, q.s_lo), (q.length, q.s_lo), (q.length, q.s_hi), (0.0, q.s_hi)].iter().map(|&(t, s)| { let p = ponto_em(&q, t, s); [p.x, p.y] }).collect(),
                    };
                    let z = if q.z0.is_finite() && q.topo.is_finite() { [q.z0, q.topo] } else { [f64::NEG_INFINITY, f64::INFINITY] };
                    push(q.id, anel, z);
                }
            }
            Err(_) => {
                for w in refs.iter().filter(|w| w.nivel == n) {
                    let (a, b) = (v(w.ax, w.ay), v(w.bx, w.by));
                    let (dx, dy) = (b.x - a.x, b.y - a.y);
                    let l = dx.hypot(dy);
                    if l.is_nan() || l <= 1e-4 || w.espessura.is_nan() || w.espessura <= 0.0 {
                        continue;
                    }
                    let (nx, ny) = (-dy / l * w.espessura / 2.0, dx / l * w.espessura / 2.0);
                    push(w.id, vec![[a.x - nx, a.y - ny], [b.x - nx, b.y - ny], [b.x + nx, b.y + ny], [a.x + nx, a.y + ny]], [f64::NEG_INFINITY, f64::INFINITY]);
                }
            }
        }
    }
    out.sort_by_key(|p| p.id);
    out
}

/// Ponta de viga aparada por um pilar.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aparo {
    pub viga: u32,
    pub extremidade: u32,
    pub pilar: u32,
    /// Recuo ao longo do eixo 3D (m).
    pub recuo: f64,
    /// O mesmo recuo como fração do eixo.
    pub fracao: f64,
}

/// Pilar visto em planta: anel externo, caixa e cotas.
pub struct PilarPlanta {
    pub num: u32,
    pub anel: Vec<P2>,
    pub caixa: [f64; 4],
    pub z: [f64; 2],
}

/// Os pilares (da disciplina dada, ou todos com `None`) em planta.
pub fn pilares_planta(todos: &[ElementoEstr], disciplina: Option<u8>) -> Vec<PilarPlanta> {
    todos
        .iter()
        .filter(|e| e.categoria == CATEGORIA_PILAR && disciplina.is_none_or(|d| e.disciplina == d))
        .filter_map(|e| {
            let p = e.pecas.iter().find(|p| p.parte == PARTE_CORPO)?;
            let anel = p.anel_planta(&p.contorno.anel);
            Some(PilarPlanta { num: e.num, caixa: caixa(&anel), anel, z: p.faixa_z() })
        })
        .collect()
}

/// Menor parâmetro `t ∈ (0, 1]` em que o segmento `p → q` cruza uma aresta do anel.
fn primeira_saida(p: P2, q: P2, anel: &[P2]) -> Option<f64> {
    let d = [q[0] - p[0], q[1] - p[1]];
    let n = anel.len();
    let mut melhor: Option<f64> = None;
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        let e = [b[0] - a[0], b[1] - a[1]];
        let den = d[0] * e[1] - d[1] * e[0];
        if den.abs() < 1e-18 {
            continue;
        }
        let ap = [a[0] - p[0], a[1] - p[1]];
        let t = (ap[0] * e[1] - ap[1] * e[0]) / den;
        let u = (ap[0] * d[1] - ap[1] * d[0]) / den;
        if t > 1e-12 && t <= 1.0 && (-EPS..=1.0 + EPS).contains(&u) && melhor.is_none_or(|m| t < m) {
            melhor = Some(t);
        }
    }
    melhor
}

/// Os aparos de todas as vigas de `todos` pelos pilares estruturais de `todos`, em ordem de viga e extremidade.
pub fn aparos(todos: &[ElementoEstr]) -> Vec<Aparo> {
    let pilares = pilares_planta(todos, Some(DISCIPLINA_ESTRUTURAL));
    let mut out = Vec::new();
    if pilares.is_empty() {
        return out;
    }
    for e in todos.iter().filter(|e| e.categoria == CATEGORIA_VIGA) {
        let (Some(eixo), Some(peca)) = (e.eixo, e.pecas.first()) else { continue };
        let (a, b) = ([eixo[0][0], eixo[0][1]], [eixo[1][0], eixo[1][1]]);
        if (b[0] - a[0]).hypot(b[1] - a[1]) < EIXO_MINIMO || e.comprimento.is_nan() || e.comprimento <= 0.0 {
            continue;
        }
        let mut pontas: [Option<(f64, u32)>; 2] = [None, None];
        for (k, (p, q)) in [(a, b), (b, a)].into_iter().enumerate() {
            let zv = peca.faixa_z_em(k as f64);
            for pl in &pilares {
                if !na_caixa(&pl.caixa, p, EPS) || !(zv[0] < pl.z[1] - EPS && zv[1] > pl.z[0] + EPS) || !dentro(p, &pl.anel) {
                    continue;
                }
                if let Some(t) = primeira_saida(p, q, &pl.anel) {
                    if pontas[k].is_none_or(|(m, _)| t > m + 1e-15) {
                        pontas[k] = Some((t, pl.num));
                    }
                }
            }
        }
        let soma: f64 = pontas.iter().flatten().map(|x| x.0).sum();
        if soma >= 1.0 - EIXO_MINIMO / e.comprimento {
            continue;
        }
        for (k, ponta) in pontas.iter().enumerate() {
            if let Some((t, pilar)) = *ponta {
                out.push(Aparo { viga: e.num, extremidade: k as u32, pilar, recuo: t * e.comprimento, fracao: t });
            }
        }
    }
    out
}

/// Encurta o prisma das vigas aparadas (o eixo 3D, pelas frações).
pub fn aplicar_aparos(todos: &mut [ElementoEstr], aparos: &[Aparo]) {
    for e in todos.iter_mut().filter(|e| e.categoria == CATEGORIA_VIGA) {
        let f = |k: u32| aparos.iter().find(|a| a.viga == e.num && a.extremidade == k).map_or(0.0, |a| a.fracao);
        let (fa, fb) = (f(0), f(1));
        if fa == 0.0 && fb == 0.0 {
            continue;
        }
        for p in &mut e.pecas {
            let q = &mut p.quadro;
            for k in 0..3 {
                q.origem[k] += q.eixo[k] * fa;
                q.eixo[k] *= 1.0 - fa - fb;
            }
        }
    }
}

/// Área da interseção de dois anéis (0 se a booleana falhar).
fn area_comum(a: &[P2], b: &[P2]) -> f64 {
    crate::ops::interseccao(&vec![vec![a.to_vec()]], &vec![vec![b.to_vec()]]).map_or(0.0, |m| m.iter().flatten().map(|r| area_com_sinal(r)).sum::<f64>().abs())
}

/// Consulta 206 `estr_juncoes`.
pub fn consulta_estr_juncoes(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let todos = elementos(cena, NIVEL_TODOS, 2);
    let do_nivel = |n: u32| nivel == NIVEL_TODOS || n == nivel;
    let (mut recortes, mut recortes_z, mut pontos) = (Vec::new(), Vec::new(), Vec::new());
    let paredes = paredes_planta(cena);
    let paredes_do_nivel: BTreeSet<u32> = cena.paredes.do_nivel(nivel).iter().map(|w| w.id).collect();
    if !paredes.is_empty() {
        let pilares = pilares_planta(&todos, Some(DISCIPLINA_ESTRUTURAL));
        for w in paredes.iter().filter(|w| paredes_do_nivel.contains(&w.id)) {
            for pl in &pilares {
                let (z0, z1) = (pl.z[0].max(w.z[0]), pl.z[1].min(w.z[1]));
                let cruzam = pl.caixa[0] < w.caixa[2] && w.caixa[0] < pl.caixa[2] && pl.caixa[1] < w.caixa[3] && w.caixa[1] < pl.caixa[3];
                if !cruzam || (z1 - z0).is_nan() || z1 - z0 <= EPS || area_comum(&pl.anel, &w.anel) <= AREA_RECORTE {
                    continue;
                }
                recortes.extend([w.id, pl.num, pl.anel.len() as u32]);
                recortes_z.extend([z0, z1]);
                pontos.extend(pl.anel.iter().flatten());
            }
        }
    }
    let (mut tab_aparos, mut recuos) = (Vec::new(), Vec::new());
    let niveis_viga: std::collections::BTreeMap<u32, u32> = todos.iter().filter(|e| e.categoria == CATEGORIA_VIGA).map(|e| (e.num, e.nivel)).collect();
    for a in aparos(&todos).iter().filter(|a| niveis_viga.get(&a.viga).is_some_and(|&n| do_nivel(n))) {
        tab_aparos.extend([a.viga, a.extremidade, a.pilar]);
        recuos.push(a.recuo);
    }
    let existe: BTreeSet<u32> = cena.paredes.do_nivel(NIVEL_TODOS).iter().map(|w| w.id).collect();
    let mut unioes = Vec::new();
    for (&num, l) in cena.estr.pilares.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let arq = cena.estr.tipos_pilar.get(&l.tipo).map_or(l.disciplina, |t| t.disciplina) == DISCIPLINA_ARQUITETONICO;
        if arq && existe.contains(&l.hosp) {
            unioes.extend([num, l.hosp]);
        }
    }
    Ok(vec![Saida::U32(recortes), Saida::F64(recortes_z), Saida::F64(pontos), Saida::U32(tab_aparos), Saida::F64(recuos), Saida::U32(unioes)])
}
