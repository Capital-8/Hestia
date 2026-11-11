//! Varredura de perfil do guarda-corpo (decisão 0055, Fase 3b, ADR §5.3 e §5.8): trilhos, travessa superior, corrimão e suportes.
//!
//! O que há aqui: perfil (circular, retangular, polígono), quadros sem torção (rotação mínima), varredura com esquadria (limite 2,5 e chanfro
//! acima), filete e solda nos cantos, transição lance-patamar do corrimão (simples e pescoço de ganso), extensões (com `maisPiso`) e suportes.
//! Entrada: nós 3D de um trecho (`TrechoGC::nos`). Saída: `PecaMalha`, que `MalhaGC::adicionar_grupo` solda. A referência TS é
//! `packages/engine/src/guardaCorpoRef/varredura.ts` e a paridade lê `varredura.paridade.json`.

use crate::gc_malha::PecaMalha;
use crate::gc_tipos::*;

pub type V3 = [f64; 3];

/// Limite de esquadria (ADR §5.1): acima de 2,5 vezes a largura o canto vira chanfro.
pub const LIMITE_ESQUADRIA: f64 = 2.5;
/// Raio da solda (`conexaoTrilho: soldar`) em múltiplos da largura do perfil, e seus segmentos (ADR §5.8).
pub const SOLDA_RAIO_LARGURAS: f64 = 1.0;
pub const SOLDA_SEGMENTOS: u32 = 8;
/// Segmentos do arco em S do pescoço de ganso.
pub const GANSO_SEGMENTOS: usize = 12;

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn mul(a: V3, s: f64) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}
fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
fn norma(a: V3) -> f64 {
    dot(a, a).sqrt()
}
fn unit(a: V3) -> V3 {
    let n = norma(a);
    if n < 1e-300 {
        a
    } else {
        mul(a, 1.0 / n)
    }
}
fn dist(a: V3, b: V3) -> f64 {
    norma(sub(a, b))
}

// ---------------------------------------------------------------- perfil

/// Perfil circular: 16 lados (24 acima de 80 mm de diâmetro); `lados > 0` força a contagem. Anti-horário, origem no centro.
pub fn perfil_circular(diametro: f64, lados: u32) -> Vec<[f64; 2]> {
    let n = if lados >= LADOS_MIN {
        lados.min(LADOS_MAX)
    } else if diametro > DIAMETRO_CIRCULO_GRANDE {
        LADOS_CIRCULO_GRANDE
    } else {
        LADOS_CIRCULO
    };
    let r = diametro / 2.0;
    (0..n).map(|k| {
        let a = std::f64::consts::TAU * k as f64 / n as f64;
        [r * a.cos(), r * a.sin()]
    }).collect()
}

pub fn perfil_retangular(largura: f64, altura: f64) -> Vec<[f64; 2]> {
    let (l, a) = (largura / 2.0, altura / 2.0);
    vec![[-l, -a], [l, -a], [l, a], [-l, a]]
}

fn area_com_sinal(p: &[[f64; 2]]) -> f64 {
    let n = p.len();
    (0..n).map(|i| p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1]).sum::<f64>() / 2.0
}

/// Perfil conforme `forma` da seção 73 (0 circular, 1 retangular, 2 polígono); o polígono é usado como está, só garantindo o sentido anti-horário.
pub fn perfil_de(forma: u8, largura: f64, altura: f64, pontos: &[[f64; 2]], lados: u32) -> Vec<[f64; 2]> {
    match forma {
        FORMA_CIRCULAR => perfil_circular(largura, lados),
        FORMA_RETANGULAR => perfil_retangular(largura, altura),
        _ => {
            let mut p = pontos.to_vec();
            if area_com_sinal(&p) < 0.0 {
                p.reverse();
            }
            p
        }
    }
}

/// Triangulação do perfil por orelhas (polígono simples anti-horário), para as tampas. Devolve índices do perfil.
pub fn triangular_perfil(p: &[[f64; 2]]) -> Vec<[usize; 3]> {
    let mut resto: Vec<usize> = (0..p.len()).collect();
    let mut saida = Vec::new();
    let cr = |a: [f64; 2], b: [f64; 2], c: [f64; 2]| (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    while resto.len() > 3 {
        let n = resto.len();
        let mut achou = None;
        for i in 0..n {
            let (a, b, c) = (resto[(i + n - 1) % n], resto[i], resto[(i + 1) % n]);
            if cr(p[a], p[b], p[c]) <= 1e-14 {
                continue;
            }
            let dentro = resto.iter().any(|&k| {
                k != a && k != b && k != c && cr(p[a], p[b], p[k]) >= 0.0 && cr(p[b], p[c], p[k]) >= 0.0 && cr(p[c], p[a], p[k]) >= 0.0
            });
            if !dentro {
                achou = Some(i);
                break;
            }
        }
        let i = achou.unwrap_or(0);
        let (a, b, c) = (resto[(i + n - 1) % n], resto[i], resto[(i + 1) % n]);
        saida.push([a, b, c]);
        resto.remove(i);
    }
    if resto.len() == 3 {
        saida.push([resto[0], resto[1], resto[2]]);
    }
    saida
}

// ---------------------------------------------------------------- quadros

#[derive(Clone, Copy, Debug)]
pub struct Quadro {
    pub t: V3,
    pub n: V3,
    pub b: V3,
}

fn rodar(v: V3, k: V3, ang: f64) -> V3 {
    let (s, c) = ang.sin_cos();
    add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1.0 - c)))
}

fn ortonormalizar(n: V3, t: V3) -> V3 {
    unit(sub(n, mul(t, dot(n, t))))
}

/// Remove nós repetidos (distância ≤ `tol`); em laço fechado remove também o último se coincidir com o primeiro.
pub fn limpar_nos(nos: &[V3], tol: f64, fechado: bool) -> Vec<V3> {
    let mut r: Vec<V3> = Vec::new();
    for &p in nos {
        if r.last().is_none_or(|&u| dist(u, p) > tol) {
            r.push(p);
        }
    }
    if fechado && r.len() > 1 && dist(r[0], r[r.len() - 1]) <= tol {
        r.pop();
    }
    r
}

/// Um quadro por segmento, por transporte paralelo (rotação mínima de um tangente ao seguinte): o perfil não gira em torno do eixo.
/// O primeiro `n` é horizontal e perpendicular ao trecho (`(1,0,0)` se o trecho é vertical).
pub fn quadros(nos: &[V3], fechado: bool) -> Vec<Quadro> {
    let m = nos.len();
    if m < 2 {
        return vec![];
    }
    let ns = if fechado { m } else { m - 1 };
    let mut q: Vec<Quadro> = Vec::with_capacity(ns);
    for s in 0..ns {
        let t = unit(sub(nos[(s + 1) % m], nos[s]));
        let n = if s == 0 {
            if t[0].hypot(t[1]) < 1e-9 {
                [1.0, 0.0, 0.0]
            } else {
                unit([-t[1], t[0], 0.0])
            }
        } else {
            let ant = q[s - 1];
            let k = cross(ant.t, t);
            let sen = norma(k);
            let n0 = if sen < 1e-14 { ant.n } else { rodar(ant.n, mul(k, 1.0 / sen), sen.atan2(dot(ant.t, t))) };
            ortonormalizar(n0, t)
        };
        q.push(Quadro { t, n, b: cross(t, n) });
    }
    q
}

// ---------------------------------------------------------------- varredura

fn anel(p: V3, q: &Quadro, m: V3, perfil: &[[f64; 2]]) -> Vec<V3> {
    let d = dot(q.t, m);
    perfil.iter().map(|&[a, b]| {
        let w = add(mul(q.n, a), mul(q.b, b));
        add(p, sub(w, mul(q.t, dot(w, m) / d)))
    }).collect()
}

fn faixa(pc: &mut PecaMalha, ra: u32, rb: u32, np: usize) {
    for j in 0..np {
        let j1 = (j + 1) % np;
        let (a0, a1, b0, b1) = (ra + j as u32, ra + j1 as u32, rb + j as u32, rb + j1 as u32);
        pc.triangulos.push([a0, a1, b1]);
        pc.triangulos.push([a0, b1, b0]);
    }
}

/// Varre `perfil` ao longo de `nos`. Cantos: esquadria (corte pelo plano bissetor, volume exato para perfis simétricos); quando
/// `1/cos(meio giro)` passa de `limite` o canto vira chanfro (dois anéis perpendiculares ligados por uma faixa). Pontas: topo plano.
/// Laço fechado: sem tampas.
pub fn varrer(nos: &[V3], fechado: bool, perfil: &[[f64; 2]], limite: f64) -> PecaMalha {
    let nos = limpar_nos(nos, 1e-9, fechado);
    let m = nos.len();
    let mut pc = PecaMalha::default();
    if m < 2 || perfil.len() < 3 || (fechado && m < 3) {
        return pc;
    }
    let q = quadros(&nos, fechado);
    let ns = q.len();
    let np = perfil.len();
    let mut ini = vec![0u32; m];
    let mut fim = vec![0u32; m];
    let mut bandas: Vec<(u32, u32)> = Vec::new();
    let empurrar = |pc: &mut PecaMalha, r: Vec<V3>| -> u32 {
        let i = pc.vertices.len() as u32;
        pc.vertices.extend(r);
        i
    };
    for i in 0..m {
        let ent = if fechado { Some((i + ns - 1) % ns) } else if i > 0 { Some(i - 1) } else { None };
        let sai = if fechado || i < ns { Some(i) } else { None };
        match (ent, sai) {
            (None, Some(s)) => {
                let r = anel(nos[i], &q[s], q[s].t, perfil);
                ini[i] = empurrar(&mut pc, r);
            }
            (Some(e), None) => {
                let r = anel(nos[i], &q[e], q[e].t, perfil);
                fim[i] = empurrar(&mut pc, r);
            }
            (Some(e), Some(s)) => {
                let soma = add(q[e].t, q[s].t);
                let cosm = norma(soma) / 2.0;
                if cosm > 1e-9 && 1.0 / cosm <= limite {
                    let mm = mul(soma, 1.0 / norma(soma));
                    let r = anel(nos[i], &q[e], mm, perfil);
                    let r2 = anel(nos[i], &q[s], mm, perfil);
                    let ig = r.iter().zip(&r2).all(|(a, b)| dist(*a, *b) < 1e-9);
                    let a = empurrar(&mut pc, r);
                    fim[i] = a;
                    if ig {
                        ini[i] = a;
                    } else {
                        ini[i] = empurrar(&mut pc, r2);
                        bandas.push((a, ini[i]));
                    }
                } else {
                    let r = anel(nos[i], &q[e], q[e].t, perfil);
                    fim[i] = empurrar(&mut pc, r);
                    let r2 = anel(nos[i], &q[s], q[s].t, perfil);
                    ini[i] = empurrar(&mut pc, r2);
                    bandas.push((fim[i], ini[i]));
                }
            }
            (None, None) => {}
        }
    }
    for s in 0..ns {
        faixa(&mut pc, ini[s], fim[(s + 1) % m], np);
    }
    for (a, b) in bandas {
        faixa(&mut pc, a, b, np);
    }
    if !fechado {
        for t in triangular_perfil(perfil) {
            pc.triangulos.push([fim[m - 1] + t[0] as u32, fim[m - 1] + t[1] as u32, fim[m - 1] + t[2] as u32]);
            pc.triangulos.push([ini[0] + t[0] as u32, ini[0] + t[2] as u32, ini[0] + t[1] as u32]);
        }
    }
    pc
}

// ---------------------------------------------------------------- cantos: filete e solda

/// Arredonda os nós interiores com arco tangente de raio `raio` no plano do canto (corrimão com `juncao: filete`; `conexaoTrilho: soldar`
/// usa `n_fixo = Some(8)`). A tangente é limitada à metade do menor segmento vizinho (o raio efetivo diminui). Sem `n_fixo`, a flecha de
/// corda não passa de `tol_corda`.
pub fn filete(nos: &[V3], raio: f64, tol_corda: f64, n_fixo: Option<u32>) -> Vec<V3> {
    let nos = limpar_nos(nos, 1e-9, false);
    let m = nos.len();
    if m < 3 || raio <= 0.0 {
        return nos;
    }
    let mut r = vec![nos[0]];
    for i in 1..m - 1 {
        let (t1, t2) = (unit(sub(nos[i], nos[i - 1])), unit(sub(nos[i + 1], nos[i])));
        let phi = dot(t1, t2).clamp(-1.0, 1.0).acos();
        if !(1e-6..=std::f64::consts::PI - 1e-6).contains(&phi) {
            r.push(nos[i]);
            continue;
        }
        let lim = 0.5 * dist(nos[i - 1], nos[i]).min(dist(nos[i], nos[i + 1]));
        let t = (raio * (phi / 2.0).tan()).min(lim);
        let re = t / (phi / 2.0).tan();
        let p1 = sub(nos[i], mul(t1, t));
        let k = unit(cross(t1, t2));
        let nc = unit(cross(k, t1));
        let c = add(p1, mul(nc, re));
        let u0 = sub(p1, c);
        let n = n_fixo.map(|v| v.max(1) as usize).unwrap_or_else(|| {
            let passo = 2.0 * (1.0 - (tol_corda / re).min(1.0)).acos().max(1e-6);
            ((phi / passo).ceil() as usize).max(2)
        });
        for j in 0..=n {
            r.push(add(c, rodar(u0, k, phi * j as f64 / n as f64)));
        }
    }
    r.push(nos[m - 1]);
    r
}

/// Cantos soldados do trilho (`conexaoTrilho: soldar`): arco de 8 segmentos com raio de uma largura do perfil.
pub fn soldar(nos: &[V3], largura_perfil: f64) -> Vec<V3> {
    filete(nos, largura_perfil * SOLDA_RAIO_LARGURAS, 0.0, Some(SOLDA_SEGMENTOS))
}

// ---------------------------------------------------------------- corrimão: transição lance -> patamar

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Transicao {
    Nenhuma,
    Simples,
    PescocoDeGanso,
}

impl Transicao {
    /// Código da seção 76 (`transicao`).
    pub fn de_codigo(c: u8) -> Transicao {
        match c {
            1 => Transicao::Simples,
            2 => Transicao::PescocoDeGanso,
            _ => Transicao::Nenhuma,
        }
    }
}

/// Raio da transição simples (ADR §5.3): `max(0,15 m, 2·diâmetro)`.
pub fn raio_transicao_simples(diametro: f64) -> f64 {
    (2.0 * diametro).max(0.15)
}
/// Distância horizontal do pescoço de ganso (ADR §5.3): `max(0,30 m, 3·diâmetro)`.
pub fn distancia_ganso(diametro: f64) -> f64 {
    (3.0 * diametro).max(0.30)
}

/// Eixo do corrimão num lance seguido de um patamar. `lance` e `patamar` são as cadeias do eixo do guarda-corpo (linha das quinas; o lance
/// termina onde o patamar começa); `h_lance` e `h_patamar` são as alturas do EIXO do corrimão sobre elas. Devolve um ou dois caminhos.
/// Quando lance e patamar não são colineares em planta (giro > 3 graus) devolve um só caminho com o degrau vertical no nó, e a esquadria
/// fica por conta de `varrer`. Colineares: `Nenhuma` corta no nó (dois caminhos); `Simples` põe um arco vertical tangente às duas retas;
/// `PescocoDeGanso` sobe do nível do lance ao do patamar numa curva em S de Hermite (inclinação do lance na entrada, horizontal na saída).
pub fn corrimao_lance_patamar(lance: &[V3], patamar: &[V3], h_lance: f64, h_patamar: f64, diametro: f64, transicao: Transicao) -> Vec<Vec<V3>> {
    let l: Vec<V3> = lance.iter().map(|p| [p[0], p[1], p[2] + h_lance]).collect();
    let p: Vec<V3> = patamar.iter().map(|p| [p[0], p[1], p[2] + h_patamar]).collect();
    if l.len() < 2 || p.len() < 2 {
        return vec![l, p].into_iter().filter(|v| v.len() >= 2).collect();
    }
    let (lu, pu) = (l[l.len() - 1], p[0]);
    let dl = unit(sub(lu, l[l.len() - 2]));
    let dp = unit(sub(p[1], pu));
    let dlh = unit([dl[0], dl[1], 0.0]);
    let dph = unit([dp[0], dp[1], 0.0]);
    let colinear = dot(dlh, dph) > (3.0f64).to_radians().cos();
    let junta = |mut a: Vec<V3>, b: &[V3]| {
        a.extend_from_slice(b);
        a
    };
    if !colinear {
        return vec![junta(l, &p)];
    }
    if transicao == Transicao::Nenhuma {
        return vec![l, p];
    }
    // plano vertical: s horizontal ao longo de dlh, z; inclinação do lance
    let h_len = dl[0].hypot(dl[1]);
    let m = if h_len < 1e-12 { 0.0 } else { dl[2] / h_len };
    let (z_l, z_p) = (lu[2], pu[2]);
    let ponto = |s: f64, z: f64| -> V3 { [lu[0] + dlh[0] * s, lu[1] + dlh[1] * s, z] };
    let s0 = -dist([l[0][0], l[0][1], 0.0], [lu[0], lu[1], 0.0]);
    match transicao {
        Transicao::Simples => {
            if m.abs() < 1e-9 {
                return vec![junta(l, &p[1..])];
            }
            let s_q = (z_p - z_l) / m;
            let ultimo = p[p.len() - 1];
            let s_fim = dist([ultimo[0], ultimo[1], 0.0], [lu[0], lu[1], 0.0]);
            if s_q <= s0 || s_q >= s_fim {
                return vec![junta(l, &p)];
            }
            let q = ponto(s_q, z_p);
            let cam = vec![l[0], q, ultimo];
            vec![filete(&cam, raio_transicao_simples(diametro), 0.002, None)]
        }
        _ => {
            let dg = distancia_ganso(diametro).min(0.9 * (-s0));
            let g = ponto(-dg, z_l - m * dg);
            let e = ponto(0.0, z_p);
            let mut cam: Vec<V3> = vec![l[0]];
            if dg > 1e-9 {
                cam.push(g);
                for j in 1..GANSO_SEGMENTOS {
                    let u = j as f64 / GANSO_SEGMENTOS as f64;
                    let (h00, h10, h01, h11) = (2.0 * u * u * u - 3.0 * u * u + 1.0, u * u * u - 2.0 * u * u + u, -2.0 * u * u * u + 3.0 * u * u, u * u * u - u * u);
                    let z = h00 * g[2] + h10 * dg * m + h01 * e[2] + h11 * dg * 0.0;
                    cam.push(ponto(-dg + dg * u, z));
                }
            }
            cam.push(e);
            cam.extend_from_slice(&p[1..]);
            vec![cam]
        }
    }
}

// ---------------------------------------------------------------- extensões

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ExtensaoPonta {
    pub comprimento: f64,
    /// `maisPiso`: soma uma profundidade de degrau.
    pub mais_piso: bool,
    /// Horizontal (extensão superior) ou seguindo a inclinação do último segmento (extensão inferior).
    pub horizontal: bool,
}

fn ponta(caminho: &[V3], fim: bool, e: ExtensaoPonta, profundidade_piso: f64) -> Option<V3> {
    let comp = e.comprimento + if e.mais_piso { profundidade_piso } else { 0.0 };
    if comp <= 0.0 || caminho.len() < 2 {
        return None;
    }
    let n = caminho.len();
    let (p, v) = if fim { (caminho[n - 1], sub(caminho[n - 1], caminho[n - 2])) } else { (caminho[0], sub(caminho[0], caminho[1])) };
    let d = if e.horizontal { unit([v[0], v[1], 0.0]) } else { unit(v) };
    if norma(d) < 0.5 {
        return None;
    }
    Some(add(p, mul(d, comp)))
}

/// Prolonga as pontas do caminho (ADR §5.3, `maisPiso`): a inferior segue a inclinação, a superior é horizontal.
pub fn estender(caminho: &[V3], ini: Option<ExtensaoPonta>, fim: Option<ExtensaoPonta>, profundidade_piso: f64) -> Vec<V3> {
    let mut r = caminho.to_vec();
    let novo_ini = ini.and_then(|e| ponta(caminho, false, e, profundidade_piso));
    let novo_fim = fim.and_then(|e| ponta(caminho, true, e, profundidade_piso));
    if let Some(p) = novo_ini {
        r.insert(0, p);
    }
    if let Some(p) = novo_fim {
        r.push(p);
    }
    r
}

// ---------------------------------------------------------------- suportes

/// Comprimento desenvolvido do caminho.
pub fn comprimento_caminho(c: &[V3]) -> f64 {
    c.windows(2).map(|w| dist(w[0], w[1])).sum()
}

/// Ponto e tangente à distância `s` (desenvolvida) do início.
pub fn ponto_em(c: &[V3], s: f64) -> Option<(V3, V3)> {
    if c.len() < 2 {
        return None;
    }
    let mut resto = s.max(0.0);
    for (i, w) in c.windows(2).enumerate() {
        let l = dist(w[0], w[1]);
        if resto <= l || i == c.len() - 2 {
            let t = unit(sub(w[1], w[0]));
            return Some((add(w[0], mul(t, resto.min(l))), t));
        }
        resto -= l;
    }
    None
}

/// Posições (distância desenvolvida) dos suportes do corrimão (seção 76: `sup_layout` 0 nenhum, 1 distância fixa, 2 alinhar com postes,
/// 3 número fixo, 4 espaçamento máximo, 5 espaçamento mínimo; `justif` 0 início, 1 fim, 2 centro, 3 distribuir). Máximo e mínimo incluem as pontas.
pub fn posicoes_suportes(l: f64, layout: u8, espac: f64, numero: u32, justif: u8, postes: &[f64]) -> Vec<f64> {
    if l <= 0.0 {
        return vec![];
    }
    let uniforme = |n: usize| -> Vec<f64> {
        if n <= 1 {
            vec![l / 2.0]
        } else {
            (0..n).map(|i| l * i as f64 / (n - 1) as f64).collect()
        }
    };
    match layout {
        1 if espac > 0.0 => match justif {
            0 => (0..).map(|i| i as f64 * espac).take_while(|&s| s <= l + 1e-9).collect(),
            1 => {
                let mut v: Vec<f64> = (0..).map(|i| l - i as f64 * espac).take_while(|&s| s >= -1e-9).collect();
                v.reverse();
                v
            }
            2 => {
                let n = (l / espac + 1e-9).floor() as usize + 1;
                let p0 = (l - (n - 1) as f64 * espac) / 2.0;
                (0..n).map(|i| p0 + i as f64 * espac).collect()
            }
            _ => uniforme((l / espac).ceil() as usize + 1),
        },
        2 => postes.iter().copied().filter(|&s| s >= -1e-9 && s <= l + 1e-9).collect(),
        3 if numero > 0 => uniforme(numero as usize),
        4 if espac > 0.0 => uniforme((l / espac).ceil().max(1.0) as usize + 1),
        5 if espac > 0.0 => uniforme((l / espac).floor().max(1.0) as usize + 1),
        _ => vec![],
    }
}

/// Suporte do corrimão: varredura reta de `comprimento` a partir do ponto do eixo, na horizontal e perpendicular à tangente, para o lado
/// `lado` (+1 esquerda da direção do caminho, -1 direita).
pub fn suporte(ponto: V3, tangente: V3, lado: f64, comprimento: f64, perfil: &[[f64; 2]]) -> PecaMalha {
    let h = unit([-tangente[1], tangente[0], 0.0]);
    varrer(&[ponto, add(ponto, mul(h, lado * comprimento))], false, perfil, LIMITE_ESQUADRIA)
}

// ---------------------------------------------------------------- testes

#[cfg(test)]
mod testes {
    use super::*;
    use crate::gc_malha::{MalhaGC, PAPEL_TRILHO};

    fn nos_da_cadeia(c: &CadeiaGC) -> Vec<V3> {
        let mut r: Vec<V3> = Vec::new();
        for t in &c.trechos {
            for n in &t.nos {
                let p = [n.x, n.y, n.z];
                if r.last().is_none_or(|&u| dist(u, p) > TOL_SOLDA_NOS) {
                    r.push(p);
                }
            }
        }
        r
    }

    fn medir(nos: &[V3], fechado: bool, perfil: &[[f64; 2]]) -> (crate::gc_malha::Analise, MalhaGC) {
        let mut m = MalhaGC::new();
        let g = m.adicionar_grupo(1, PAPEL_TRILHO, 0, &varrer(nos, fechado, perfil, LIMITE_ESQUADRIA));
        (m.analisar(g), m)
    }

    fn area_poligono(p: &[[f64; 2]]) -> f64 {
        area_com_sinal(p).abs()
    }

    #[test]
    fn perfis_circular_16_e_24_lados() {
        assert_eq!(perfil_circular(0.04, 0).len(), 16);
        assert_eq!(perfil_circular(0.08, 0).len(), 16);
        assert_eq!(perfil_circular(0.09, 0).len(), 24);
        assert_eq!(perfil_circular(0.04, 8).len(), 8);
        assert!(area_com_sinal(&perfil_circular(0.04, 0)) > 0.0);
    }

    #[test]
    fn perfil_poligono_horario_e_invertido() {
        let h = [[0.0, 0.0], [0.0, 0.1], [0.1, 0.1], [0.1, 0.0]];
        assert!(area_com_sinal(&perfil_de(FORMA_POLIGONO, 0.0, 0.0, &h, 0)) > 0.0);
        assert_eq!(triangular_perfil(&perfil_de(FORMA_POLIGONO, 0.0, 0.0, &h, 0)).len(), 2);
    }

    #[test]
    fn reta_circular_fechada_euler_2_e_volume() {
        let pf = perfil_circular(0.04, 0);
        let c = CadeiaGC::reta(1, (0.0, 0.0), (2.0, 0.0), 1.0);
        let (a, _) = medir(&nos_da_cadeia(&c), false, &pf);
        assert!(a.fechada);
        assert_eq!(a.euler, 2);
        assert!(a.volume > 0.0);
        assert!((a.volume / (area_poligono(&pf) * 2.0) - 1.0).abs() < 1e-3);
    }

    #[test]
    fn esquadria_90_graus_volume_exato() {
        let pf = perfil_retangular(0.05, 0.05);
        let (a, _) = medir(&nos_da_cadeia(&CadeiaGC::em_l(1, 2.0, 0.0)), false, &pf);
        assert!(a.fechada && a.euler == 2);
        assert!((a.volume - 0.0025 * 4.0).abs() < 1e-7, "{}", a.volume);
    }

    #[test]
    fn esquadria_135_graus_volume_exato() {
        let pf = perfil_retangular(0.05, 0.05);
        let r = 2.0f64.sqrt();
        let nos = vec![[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0 + r, r, 0.0]];
        let (a, _) = medir(&nos, false, &pf);
        assert!(a.fechada && a.euler == 2);
        assert!((a.volume - 0.0025 * 4.0).abs() < 1e-7, "{}", a.volume);
    }

    #[test]
    fn lance_inclinado_e_patamar_esquadria_vertical() {
        let pf = perfil_retangular(0.04, 0.04);
        let c = CadeiaGC::lance_inclinado(1, 3.0, 0.0, 1.5, 1.0);
        let nos = nos_da_cadeia(&c);
        let (a, _) = medir(&nos, false, &pf);
        let comp = comprimento_caminho(&nos);
        assert!(a.fechada && a.euler == 2);
        assert!((a.volume - 0.0016 * comp).abs() < 1e-7, "{} {}", a.volume, comp);
    }

    #[test]
    fn chanfro_acima_do_limite_continua_fechado() {
        let pf = perfil_retangular(0.05, 0.05);
        // giro de 170 graus: 1/cos(85) >> 2,5
        let a = 170.0f64.to_radians();
        let nos = vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0 + a.cos(), a.sin(), 0.0]];
        let (an, _) = medir(&nos, false, &pf);
        assert!(an.fechada, "chanfro aberto");
        assert!(an.volume > 0.0);
    }

    #[test]
    fn laco_fechado_sem_tampas_e_toro() {
        let pf = perfil_retangular(0.03, 0.03);
        let nos = vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]];
        let (a, _) = medir(&nos, true, &pf);
        assert!(a.fechada);
        assert_eq!(a.euler, 0);
        assert!((a.volume - 0.0009 * 4.0).abs() < 1e-7, "{}", a.volume);
    }

    fn helice(r: f64, passo: f64, voltas: f64, por_volta: usize) -> Vec<V3> {
        let n = (voltas * por_volta as f64) as usize;
        (0..=n).map(|i| {
            let a = std::f64::consts::TAU * i as f64 / por_volta as f64;
            [r * a.cos(), r * a.sin(), passo * a / std::f64::consts::TAU]
        }).collect()
    }

    #[test]
    fn helice_sem_torcao_e_malha_fechada() {
        let (r, p) = (1.0, 0.5);
        let nos = helice(r, p, 2.0, 360);
        let q = quadros(&nos, false);
        // cada passo e a rotação mínima do anterior: nenhuma componente de giro em torno do tangente
        for w in q.windows(2) {
            let k = cross(w[0].t, w[1].t);
            let s = norma(k);
            let esperado = if s < 1e-14 { w[0].n } else { ortonormalizar(rodar(w[0].n, mul(k, 1.0 / s), s.atan2(dot(w[0].t, w[1].t))), w[1].t) };
            assert!(dist(esperado, w[1].n) < 1e-12);
            assert!(dot(w[1].n, w[1].t).abs() < 1e-12 && (dot(cross(w[1].n, w[1].b), w[1].t) - 1.0).abs() < 1e-12);
        }
        // o quadro de Frenet gira em torno do tangente a uma taxa igual à torção; o transportado não: ao fim de 2 voltas a diferença
        // angular é 2·2π·p/sqrt(r²+p²)... (mod 2π), no passo médio do último segmento
        let ang = |i: usize| {
            let a = std::f64::consts::TAU * (i as f64 + 0.5) / 360.0;
            let nf = [-a.cos(), -a.sin(), 0.0];
            let tf = unit([-r * a.sin(), r * a.cos(), p / std::f64::consts::TAU]);
            let bf = cross(tf, nf);
            dot(q[i].n, bf).atan2(dot(q[i].n, nf))
        };
        let c = p / std::f64::consts::TAU;
        let esperado = 2.0 * std::f64::consts::TAU * c / (r * r + c * c).sqrt();
        let d = ang(q.len() - 1) - ang(0);
        let mut diff = (d.abs() - esperado).rem_euclid(std::f64::consts::TAU);
        if diff > std::f64::consts::PI {
            diff -= std::f64::consts::TAU;
        }
        assert!(diff.abs() < 2e-2, "d={d} esperado={esperado} diff={diff}");
        let (a, _) = medir(&nos, false, &perfil_circular(0.03, 0));
        assert!(a.fechada && a.euler == 2 && a.volume > 0.0);
        let arco = comprimento_caminho(&nos);
        assert!((a.volume / (area_poligono(&perfil_circular(0.03, 0)) * arco) - 1.0).abs() < 2e-3);
    }

    #[test]
    fn varredura_e_deterministica() {
        let pf = perfil_circular(0.04, 0);
        let nos = nos_da_cadeia(&CadeiaGC::lance_inclinado(1, 3.0, 0.0, 1.5, 1.0));
        let a = varrer(&nos, false, &pf, LIMITE_ESQUADRIA);
        let b = varrer(&nos, false, &pf, LIMITE_ESQUADRIA);
        assert_eq!(a, b);
    }

    #[test]
    fn filete_90_pontos_no_arco() {
        let nos = nos_da_cadeia(&CadeiaGC::em_l(1, 2.0, 0.0));
        let f = filete(&nos, 0.3, 0.002, None);
        assert!(f.len() > 5);
        // centro do arco em (1.7, 0.3)
        for p in &f[1..f.len() - 1] {
            assert!((dist(*p, [1.7, 0.3, 0.0]) - 0.3).abs() < 1e-9);
        }
        assert!(dist(f[1], [1.7, 0.0, 0.0]) < 1e-9 && dist(f[f.len() - 2], [2.0, 0.3, 0.0]) < 1e-9);
        let s = soldar(&nos, 0.04);
        assert_eq!(s.len(), 2 + 9);
        let (a, _) = medir(&f, false, &perfil_circular(0.04, 0));
        assert!(a.fechada && a.euler == 2);
    }

    #[test]
    fn filete_limita_a_tangente_a_metade_do_segmento() {
        let nos = vec![[0.0, 0.0, 0.0], [0.2, 0.0, 0.0], [0.2, 2.0, 0.0]];
        let f = filete(&nos, 1.0, 0.002, None);
        assert!(dist(f[1], [0.1, 0.0, 0.0]) < 1e-9);
    }

    fn lance_e_patamar() -> (Vec<V3>, Vec<V3>) {
        (vec![[0.0, 0.0, 0.0], [3.0, 0.0, 1.5]], vec![[3.0, 0.0, 1.5], [4.2, 0.0, 1.5]])
    }

    #[test]
    fn gooseneck_sobe_ao_nivel_do_patamar_e_chega_horizontal() {
        let (l, p) = lance_e_patamar();
        let cams = corrimao_lance_patamar(&l, &p, 0.9, 1.0, 0.04, Transicao::PescocoDeGanso);
        assert_eq!(cams.len(), 1);
        let c = &cams[0];
        let e = c.iter().position(|q| (q[0] - 3.0).abs() < 1e-9 && (q[2] - 2.5).abs() < 1e-9);
        assert!(e.is_some(), "o corrimão deve chegar a 2,5 m (patamar 1,5 + 1,0) no nó");
        let e = e.unwrap();
        // inclinação na saída ~ 0 (último passo do S) e na entrada = a do lance
        let ent = (c[2][2] - c[1][2]) / (c[2][0] - c[1][0]);
        assert!(ent > 0.45 && ent < 0.5 + 0.2, "{ent}");
        let sai = (c[e][2] - c[e - 1][2]) / (c[e][0] - c[e - 1][0]);
        assert!(sai.abs() < 0.25, "{sai}");
        assert!((c[c.len() - 1][0] - 4.2).abs() < 1e-9 && (c[c.len() - 1][2] - 2.5).abs() < 1e-9);
        // monotônico
        assert!(c.windows(2).all(|w| w[1][0] >= w[0][0] - 1e-12));
    }

    #[test]
    fn transicao_nenhuma_corta_no_no_e_simples_tem_arco() {
        let (l, p) = lance_e_patamar();
        assert_eq!(corrimao_lance_patamar(&l, &p, 0.9, 1.0, 0.04, Transicao::Nenhuma).len(), 2);
        let s = corrimao_lance_patamar(&l, &p, 0.9, 0.9, 0.04, Transicao::Simples);
        assert_eq!(s.len(), 1);
        let q = &s[0];
        assert!(q.len() > 4);
        // com a mesma altura o canto está no nó: todos os pontos do arco ficam a raio 0.15 do centro
        let r = raio_transicao_simples(0.04);
        assert!((r - 0.15).abs() < 1e-12);
        assert!(q.iter().all(|p| p[2] >= 0.9 - 1e-9));
    }

    #[test]
    fn nao_colinear_junta_com_degrau_vertical() {
        let l = vec![[0.0, 0.0, 0.0], [2.0, 0.0, 1.0]];
        let p = vec![[2.0, 0.0, 1.0], [2.0, 1.0, 1.0]];
        let c = corrimao_lance_patamar(&l, &p, 0.9, 1.0, 0.04, Transicao::PescocoDeGanso);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].len(), 4);
    }

    #[test]
    fn extensoes_inclinada_e_horizontal_com_mais_piso() {
        let c = vec![[0.0, 0.0, 0.0], [3.0, 0.0, 1.5], [4.0, 0.0, 1.5]];
        let r = estender(
            &c,
            Some(ExtensaoPonta { comprimento: 0.3, mais_piso: true, horizontal: false }),
            Some(ExtensaoPonta { comprimento: 0.3, mais_piso: false, horizontal: true }),
            0.28,
        );
        assert_eq!(r.len(), 5);
        let ext = dist(r[0], r[1]);
        assert!((ext - 0.58).abs() < 1e-12);
        assert!(r[0][2] < 0.0 && (r[0][0] + 0.58 * 3.0 / (3.0f64.powi(2) + 1.5f64.powi(2)).sqrt()).abs() < 1e-9);
        assert_eq!(r[4], [4.3, 0.0, 1.5]);
        assert_eq!(estender(&c, None, None, 0.28), c);
    }

    #[test]
    fn posicoes_dos_suportes() {
        assert_eq!(posicoes_suportes(2.0, 0, 0.5, 0, 0, &[]), Vec::<f64>::new());
        assert_eq!(posicoes_suportes(2.0, 1, 0.5, 0, 0, &[]), vec![0.0, 0.5, 1.0, 1.5, 2.0]);
        let f = posicoes_suportes(1.0, 1, 0.4, 0, 1, &[]);
        assert!(f.len() == 3 && (f[0] - 0.2).abs() < 1e-12 && (f[1] - 0.6).abs() < 1e-12 && (f[2] - 1.0).abs() < 1e-12);
        let c = posicoes_suportes(1.0, 1, 0.4, 0, 2, &[]);
        assert_eq!(c.len(), 3);
        assert!((c[0] - 0.1).abs() < 1e-12 && (c[2] - 0.9).abs() < 1e-12);
        assert_eq!(posicoes_suportes(1.0, 3, 0.0, 3, 0, &[]), vec![0.0, 0.5, 1.0]);
        assert_eq!(posicoes_suportes(2.0, 4, 0.7, 0, 0, &[]).len(), 4);
        assert_eq!(posicoes_suportes(2.0, 5, 0.7, 0, 0, &[]).len(), 3);
        assert_eq!(posicoes_suportes(2.0, 2, 0.0, 0, 0, &[0.0, 1.0, 5.0]), vec![0.0, 1.0]);
    }

    #[test]
    fn suporte_e_um_prisma_fechado_horizontal() {
        let pf = perfil_circular(0.02, 0);
        let pc = suporte([1.0, 0.0, 1.0], [1.0, 0.0, 0.0], 1.0, 0.06, &pf);
        let mut m = MalhaGC::new();
        let g = m.adicionar_grupo(1, crate::gc_malha::PAPEL_SUPORTE, 0, &pc);
        let a = m.analisar(g);
        assert!(a.fechada && a.euler == 2);
        assert!(m.vertices.iter().all(|v| v[1] >= -1e-9 && v[1] <= 0.06 + 1e-9));
    }

    #[test]
    fn perfil_poligonal_nao_convexo_fecha() {
        let ele = [[0.0, 0.0], [0.04, 0.0], [0.04, 0.01], [0.01, 0.01], [0.01, 0.04], [0.0, 0.04]];
        let pf = perfil_de(FORMA_POLIGONO, 0.0, 0.0, &ele, 0);
        let (a, _) = medir(&nos_da_cadeia(&CadeiaGC::reta(1, (0.0, 0.0), (1.0, 0.0), 0.0)), false, &pf);
        assert!(a.fechada && a.euler == 2);
        assert!((a.volume - area_poligono(&pf)).abs() < 1e-7);
    }

    // ------------------------------------------------------------ paridade com a referência TS

    use serde_json::Value;

    fn helice_p(r: f64, passo: f64, voltas: f64, por_volta: usize) -> Vec<V3> {
        helice(r, passo, voltas, por_volta)
    }

    fn malha_json(nos: &[V3], fechado: bool, perfil: &[[f64; 2]]) -> Vec<f64> {
        let (a, m) = medir(nos, fechado, perfil);
        let s = m.soma_coordenadas(0);
        vec![a.vertices as f64, a.arestas as f64, a.faces as f64, a.euler as f64, if a.fechada { 1.0 } else { 0.0 }, a.volume, s[0], s[1], s[2]]
    }

    fn pontos_json(c: &[Vec<V3>]) -> Vec<f64> {
        c.iter().flatten().flat_map(|p| p.iter().copied()).collect()
    }

    #[test]
    fn paridade() {
        let ref_json: Value = serde_json::from_str(include_str!("../../../packages/engine/src/guardaCorpoRef/varredura.paridade.json")).unwrap();
        let circ = perfil_circular(0.04, 0);
        let em_l: Vec<V3> = vec![[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 2.0, 0.0]];
        let lance: Vec<V3> = vec![[0.0, 0.0, 0.0], [3.0, 0.0, 1.5]];
        let patamar: Vec<V3> = vec![[3.0, 0.0, 1.5], [4.2, 0.0, 1.5]];
        let a170 = 170.0f64.to_radians();
        let ele = [[0.0, 0.0], [0.04, 0.0], [0.04, 0.01], [0.01, 0.01], [0.01, 0.04], [0.0, 0.04]];
        let fil = filete(&em_l, 0.3, 0.002, None);
        let mut casos: Vec<(&str, Vec<f64>)> = vec![
            ("reta_circular", malha_json(&[[0.0, 0.0, 1.0], [2.0, 0.0, 1.0]], false, &circ)),
            ("em_l_retangular", malha_json(&em_l, false, &perfil_retangular(0.05, 0.03))),
            ("lance_patamar", malha_json(&[[0.0, 0.0, 0.0], [3.0, 0.0, 1.5], [4.0, 0.0, 1.5]], false, &circ)),
            ("helice", malha_json(&helice_p(1.0, 0.5, 2.0, 90), false, &perfil_circular(0.03, 0))),
            ("chanfro_170", malha_json(&[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0 + a170.cos(), a170.sin(), 0.0]], false, &perfil_retangular(0.05, 0.05))),
            ("laco_fechado", malha_json(&[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]], true, &perfil_retangular(0.03, 0.03))),
            ("poligono_ele", malha_json(&[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]], false, &perfil_de(FORMA_POLIGONO, 0.0, 0.0, &ele, 0))),
            ("filete_pontos", pontos_json(&[fil.clone()])),
            ("filete_malha", malha_json(&fil, false, &circ)),
            ("solda_pontos", pontos_json(&[soldar(&em_l, 0.04)])),
            ("ganso", pontos_json(&corrimao_lance_patamar(&lance, &patamar, 0.9, 1.0, 0.04, Transicao::PescocoDeGanso))),
            ("simples", pontos_json(&corrimao_lance_patamar(&lance, &patamar, 0.9, 0.9, 0.04, Transicao::Simples))),
            ("nenhuma", pontos_json(&corrimao_lance_patamar(&lance, &patamar, 0.9, 1.0, 0.04, Transicao::Nenhuma))),
            ("nao_colinear", pontos_json(&corrimao_lance_patamar(&[[0.0, 0.0, 0.0], [2.0, 0.0, 1.0]], &[[2.0, 0.0, 1.0], [2.0, 1.0, 1.0]], 0.9, 1.0, 0.04, Transicao::PescocoDeGanso))),
            (
                "extensoes",
                pontos_json(&[estender(
                    &[[0.0, 0.0, 0.0], [3.0, 0.0, 1.5], [4.0, 0.0, 1.5]],
                    Some(ExtensaoPonta { comprimento: 0.3, mais_piso: true, horizontal: false }),
                    Some(ExtensaoPonta { comprimento: 0.3, mais_piso: false, horizontal: true }),
                    0.28,
                )]),
            ),
        ];
        let mut sup = Vec::new();
        for (l, lay, e, n, j, po) in [(2.0, 1, 0.5, 0, 0, vec![]), (1.0, 1, 0.4, 0, 1, vec![]), (1.0, 1, 0.4, 0, 2, vec![]), (1.0, 3, 0.0, 3, 0, vec![]), (2.0, 4, 0.7, 0, 0, vec![]), (2.0, 5, 0.7, 0, 0, vec![]), (2.0, 2, 0.0, 0, 0, vec![0.0, 1.0, 5.0])] {
            sup.extend(posicoes_suportes(l, lay, e, n, j, &po));
            sup.push(-1.0);
        }
        sup.pop();
        casos.push(("suportes", sup));
        let pc = suporte([1.0, 0.0, 1.0], [1.0, 0.0, 0.0], 1.0, 0.06, &perfil_circular(0.02, 0));
        let mut m = MalhaGC::new();
        let g = m.adicionar_grupo(1, crate::gc_malha::PAPEL_SUPORTE, 0, &pc);
        let a = m.analisar(g);
        let s = m.soma_coordenadas(g);
        casos.push(("suporte_malha", vec![a.vertices as f64, a.arestas as f64, a.faces as f64, a.euler as f64, 1.0, a.volume, s[0], s[1], s[2]]));

        assert_eq!(ref_json.as_object().unwrap().len(), casos.len());
        for (nome, rust) in casos {
            let r = &ref_json[nome];
            let esperado: Vec<f64> = match r["tipo"].as_str().unwrap() {
                "malha" => {
                    let soma: Vec<f64> = r["soma"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
                    let g = |k: &str| r[k].as_f64().unwrap();
                    vec![g("vertices"), g("arestas"), g("faces"), g("euler"), if r["fechada"].as_bool().unwrap() { 1.0 } else { 0.0 }, g("volume"), soma[0], soma[1], soma[2]]
                }
                "pontos" => r["pontos"].as_array().unwrap().iter().flat_map(|p| p.as_array().unwrap().iter().map(|v| v.as_f64().unwrap())).collect(),
                _ => r["valores"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect(),
            };
            assert_eq!(rust.len(), esperado.len(), "{nome}: tamanho");
            let eh_malha = r["tipo"] == "malha";
            for (k, (a, b)) in rust.iter().zip(&esperado).enumerate() {
                // contagens (vértices, arestas, faces, Euler, fechada) exatas; posições, volume e somas a 1e-6
                let exato = eh_malha && k < 5;
                let tol = if exato { 0.0 } else { 1e-6 };
                assert!((a - b).abs() <= tol, "{nome}[{k}]: rust {a} ref {b}");
            }
        }
    }
}

/// Validação com o caminho real da Fase 3a: monta cenas de escada reta, com patamar, em U, caracol e rampa com patamar, roda
/// `guarda_caminhos` e varre os trechos devolvidos (trilho de 40 mm a 0,90 m e corrimão com transição lance-patamar).
#[cfg(test)]
mod caminho_real {
    use super::*;
    use crate::cena::Cena;
    use crate::consultas::Saida;
    use crate::esquema::{ID_AUSENTE, NIVEL_TODOS};
    use crate::gc_caminho::guarda_caminhos;
    use crate::gc_malha::{MalhaGC, PAPEL_CORRIMAO, PAPEL_TRILHO};
    use crate::secoes_gc::*;

    fn cadeia(c: &Cena) -> CadeiaGC {
        let s = guarda_caminhos(c, NIVEL_TODOS, 1e-6).expect("consulta");
        let (Saida::U32(t), Saida::F64(n)) = (&s[0], &s[1]) else { panic!() };
        let mut trechos = Vec::new();
        let mut ini = 0usize;
        for r in t.chunks_exact(5) {
            let k = r[3] as usize;
            let origem = match r[2] {
                0 => OrigemTrecho::Lance,
                1 => OrigemTrecho::Patamar,
                2 => OrigemTrecho::Manual,
                _ => OrigemTrecho::Caracol,
            };
            let nos = (ini..ini + k).map(|i| No3 { x: n[i * 3], y: n[i * 3 + 1], z: n[i * 3 + 2] }).collect();
            trechos.push(TrechoGC { guarda: r[0], indice: r[1], origem, curvo: r[4] & 1 != 0, fechado: false, nos });
            ini += k;
        }
        CadeiaGC { trechos }
    }

    fn v3(t: &TrechoGC, dz: f64) -> Vec<V3> {
        t.nos.iter().map(|n| [n.x, n.y, n.z + dz]).collect()
    }

    /// Varre todos os trechos como trilhos e confere malha fechada, orientada e de volume positivo.
    fn varrer_tudo(c: &CadeiaGC, min_trechos: usize) {
        assert!(c.trechos.len() >= min_trechos, "{} trechos", c.trechos.len());
        let pf = perfil_circular(0.04, 0);
        for t in &c.trechos {
            let mut m = MalhaGC::new();
            let g = m.adicionar_grupo(t.guarda, PAPEL_TRILHO, 0, &varrer(&v3(t, 0.9), false, &pf, LIMITE_ESQUADRIA));
            let a = m.analisar(g);
            assert!(a.fechada && a.euler == 2 && a.volume > 0.0, "trecho {} {:?}", t.indice, a);
        }
    }

    fn cena_base(hosp: u8, lados: u8, pos_base: u8) -> Cena {
        let mut c = Cena::novo();
        c.gc.tipos.insert(1, TipoGuardaLinha { altura: 1.1, desloc: 0.035, ajuste_patamar: 0.0, folga_inferior: 0.0, junc_angular: 0, junc_tangente: 0, conexao: 0, tol_corda: 0.002, norma: ID_AUSENTE });
        c.gc.guardas.insert(1, GuardaCorpoLinha { nivel: 0, tipo: 1, hosp, hosp_num: 1, lados, pos_base, desloc: 0.0, altura: f64::NAN, inverter: false, fechado: false, lado_desloc: 0, cota_base: 0.0, flags: 7 });
        c
    }

    fn comp(c: &mut Cena, id: u32, indice: u32, tipo: u8, caracol: bool) {
        c.gc.componentes.insert(id, ComponenteGC { escada: 1, indice, tipo, caracol, centro: [0.0, 0.0], r_int: 0.0, r_ext: 0.0 });
    }
    fn curva(c: &mut Cena, comp: u32, lado: u8, a: [f64; 2], b: [f64; 2], sag: f64) {
        let id = c.gc.curvas.len() as u32 + 1;
        c.gc.curvas.insert(id, CurvaGC { componente: comp, lado, ordem: 0, a, b, sag });
    }
    fn espelho(c: &mut Cena, comp: u32, indice: u32, a: [f64; 2], b: [f64; 2], z1: f64) {
        let id = c.gc.espelhos.len() as u32 + 1;
        c.gc.espelhos.insert(id, EspelhoGC { componente: comp, indice, a, b, z0: z1 - 0.17, z1, bocel: 0.0, z_piso: z1 });
    }
    fn lance_reto(c: &mut Cena, id: u32, indice: u32, x0: f64, n: u32, zi: f64, w: f64) {
        comp(c, id, indice, COMPONENTE_LANCE, false);
        let fim = x0 + (n - 1) as f64 * 0.28;
        curva(c, id, 0, [x0 - 0.5, w / 2.0], [fim + 0.5, w / 2.0], 0.0);
        curva(c, id, 1, [x0 - 0.5, -w / 2.0], [fim + 0.5, -w / 2.0], 0.0);
        for k in 0..n {
            let x = x0 + k as f64 * 0.28;
            espelho(c, id, k, [x, -w / 2.0], [x, w / 2.0], zi + 0.17 * k as f64);
        }
    }
    fn anel(c: &mut Cena, dono: u32, pts: &[(f64, f64)], z: f64) {
        for (k, &(x, y)) in pts.iter().enumerate() {
            let id = c.gc.patamares_escada.len() as u32 + 1;
            c.gc.patamares_escada.insert(id, PontoAnelGC { dono, componente: 0, indice: k as u32, p: [x, y], z });
        }
    }
    fn escada(c: &mut Cena) {
        c.gc.escadas.insert(1, EscadaGC { nivel: 0, z_base: 0.0, z_topo: 3.0, altura_espelho: 0.17, profundidade_piso: 0.28 });
    }

    #[test]
    fn escada_reta() {
        let mut c = cena_base(HOSP_ESCADA, 0b1111, 0);
        escada(&mut c);
        lance_reto(&mut c, 1, 0, 0.0, 6, 0.17, 1.2);
        varrer_tudo(&cadeia(&c), 2);
    }

    #[test]
    fn escada_com_patamar_e_corrimao_com_ganso_e_extensoes() {
        let mut c = cena_base(HOSP_ESCADA, 0b1111, 0);
        escada(&mut c);
        lance_reto(&mut c, 1, 0, 0.0, 4, 0.17, 1.2);
        comp(&mut c, 2, 1, COMPONENTE_PATAMAR, false);
        anel(&mut c, 2, &[(0.84, -0.6), (1.84, -0.6), (1.84, 0.6), (0.84, 0.6)], 0.51);
        lance_reto(&mut c, 3, 2, 1.84, 4, 0.68, 1.2);
        let ca = cadeia(&c);
        varrer_tudo(&ca, 6);
        let l = ca.trechos.iter().find(|t| t.origem == OrigemTrecho::Lance).unwrap();
        let ult = l.nos[l.nos.len() - 1];
        let p = ca.trechos.iter().find(|t| t.origem == OrigemTrecho::Patamar && (t.nos[0].y - ult.y).abs() < 1e-9 && (t.nos[0].x - ult.x).abs() < 1e-6).unwrap();
        for tr in [Transicao::Nenhuma, Transicao::Simples, Transicao::PescocoDeGanso] {
            let cams = corrimao_lance_patamar(&v3(l, 0.0), &v3(p, 0.0), 0.9, 1.0, 0.04, tr);
            assert!(!cams.is_empty());
            for cam in cams {
                let cam = estender(
                    &cam,
                    Some(ExtensaoPonta { comprimento: 0.3, mais_piso: true, horizontal: false }),
                    Some(ExtensaoPonta { comprimento: 0.3, mais_piso: false, horizontal: true }),
                    0.28,
                );
                let mut m = MalhaGC::new();
                let g = m.adicionar_grupo(1, PAPEL_CORRIMAO, 0, &varrer(&cam, false, &perfil_circular(0.04, 0), LIMITE_ESQUADRIA));
                let a = m.analisar(g);
                assert!(a.fechada && a.euler == 2 && a.volume > 0.0, "{tr:?} {a:?}");
            }
        }
    }

    #[test]
    fn patamar_de_giro_em_u() {
        let mut c = cena_base(HOSP_ESCADA, 0b1111, 0);
        escada(&mut c);
        lance_reto(&mut c, 1, 0, 0.0, 4, 0.17, 1.2);
        comp(&mut c, 3, 2, COMPONENTE_LANCE, false);
        curva(&mut c, 3, 0, [1.5, 1.3], [-1.0, 1.3], 0.0);
        curva(&mut c, 3, 1, [1.5, 2.5], [-1.0, 2.5], 0.0);
        for k in 0..3 {
            let x = 0.84 - 0.28 * k as f64;
            espelho(&mut c, 3, k, [x, 1.3], [x, 2.5], 0.68 + 0.17 * k as f64);
        }
        comp(&mut c, 2, 1, COMPONENTE_PATAMAR, false);
        anel(&mut c, 2, &[(0.84, 0.0), (2.4, 0.0), (2.4, 2.5), (0.84, 2.5), (0.84, 1.3), (0.84, 1.2)], 0.51);
        let ca = cadeia(&c);
        varrer_tudo(&ca, 4);
        // a cadeia externa do giro tem cantos de 90 graus: esquadria com volume exato (perfil quadrado)
        let ext = ca.trechos.iter().find(|t| t.nos.len() == 4).unwrap();
        let nos = v3(ext, 0.9);
        let mut m = MalhaGC::new();
        let g = m.adicionar_grupo(1, PAPEL_TRILHO, 0, &varrer(&nos, false, &perfil_retangular(0.04, 0.04), LIMITE_ESQUADRIA));
        assert!((m.analisar(g).volume - 0.0016 * comprimento_caminho(&nos)).abs() < 1e-7);
    }

    #[test]
    fn caracol_helice_malha_fechada_e_sem_torcao() {
        let mut c = cena_base(HOSP_ESCADA, 0b0101, 1);
        escada(&mut c);
        comp(&mut c, 1, 0, COMPONENTE_LANCE, true);
        let q = std::f64::consts::FRAC_1_SQRT_2;
        for (lado, r) in [(0u8, 0.5), (1u8, 1.5)] {
            curva(&mut c, 1, lado, [r, 0.0], [0.0, r], -r * (1.0 - q));
        }
        for k in 0..10u32 {
            let th = std::f64::consts::FRAC_PI_2 * (0.05 + 0.9 * k as f64 / 9.0);
            espelho(&mut c, 1, k, [0.4 * th.cos(), 0.4 * th.sin()], [1.6 * th.cos(), 1.6 * th.sin()], 0.17 * (k + 1) as f64);
        }
        let ca = cadeia(&c);
        assert!(ca.trechos[0].curvo);
        varrer_tudo(&ca, 2);
        let qs = quadros(&v3(&ca.trechos[0], 0.9), false);
        for w in qs.windows(2) {
            assert!(dot(w[1].n, w[1].t).abs() < 1e-12);
            let k = cross(w[0].t, w[1].t);
            let s = norma(k);
            if s > 1e-14 {
                let esperado = ortonormalizar(rodar(w[0].n, mul(k, 1.0 / s), s.atan2(dot(w[0].t, w[1].t))), w[1].t);
                assert!(dist(esperado, w[1].n) < 1e-12);
            }
        }
    }

    #[test]
    fn rampa_com_patamar() {
        let mut c = cena_base(HOSP_RAMPA, 0b1111, 0);
        c.gc.rampas.insert(1, RampaGC { nivel: 0, z_base: 0.0, z_topo: 0.6 });
        c.gc.lances_rampa.insert(1, LanceRampaGC { rampa: 1, indice: 0, inicio: [0.0, 0.0], fim: [5.0, 0.0], a: [0.0, -0.75], b: [0.0, 0.75], c: [5.0, -0.75], d: [5.0, 0.75], z0: 0.0, z1: 0.4 });
        for (k, (x, y)) in [(5.0, -0.75), (6.5, -0.75), (6.5, 0.75), (5.0, 0.75)].into_iter().enumerate() {
            c.gc.patamares_rampa.insert(k as u32 + 1, PontoAnelGC { dono: 1, componente: 1, indice: k as u32, p: [x, y], z: 0.4 });
        }
        c.gc.lances_rampa.insert(2, LanceRampaGC { rampa: 1, indice: 2, inicio: [6.5, 0.0], fim: [10.0, 0.0], a: [6.5, -0.75], b: [6.5, 0.75], c: [10.0, -0.75], d: [10.0, 0.75], z0: 0.4, z1: 0.6 });
        let ca = cadeia(&c);
        varrer_tudo(&ca, 6);
        // lance, patamar e lance de um lado viram um único trilho com esquadrias suaves nas mudanças de inclinação
        let mut esq: Vec<V3> = Vec::new();
        for t in ca.trechos.iter().filter(|t| t.nos[0].y > 0.0) {
            for p in v3(t, 0.9) {
                if esq.last().is_none_or(|&u| dist(u, p) > 1e-6) {
                    esq.push(p);
                }
            }
        }
        let mut m = MalhaGC::new();
        let g = m.adicionar_grupo(1, PAPEL_TRILHO, 0, &varrer(&esq, false, &perfil_retangular(0.04, 0.04), LIMITE_ESQUADRIA));
        let a = m.analisar(g);
        assert!(a.fechada && a.euler == 2);
        assert!((a.volume - 0.0016 * comprimento_caminho(&esq)).abs() < 1e-6);
    }
}
