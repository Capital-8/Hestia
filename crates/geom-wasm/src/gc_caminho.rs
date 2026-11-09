//! Caminho hospedado do guarda-corpo (decisão 0055, Fase 3a): a consulta `guarda_caminhos`.
//!
//! Para cada guarda-corpo do nível monta a cadeia de nós 3D do eixo (ADR §5.1): lances retos, curvos e caracol, patamares, lances e patamares de rampa e
//! caminho manual, com corte por lado e por tipo de trecho, emendas, deslocamento com esquadria (limite 2,5x, chanfro acima) e grade de saída de 1 µm.
//! Saída: `trechos` u32 `[guarda, trecho, origem, n_nos, flags]` (flags: bit0 curvo, bit1 fechado, bit2 soldado ao trecho anterior, bit3 lado direito),
//! `nos` f64 `[x, y, z]`, `avisos` u32 `[guarda, codigo, trecho, indice]` e `valores` f64 `[medido, limite, x, y, z]`.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::gc_tipos::*;
use crate::geo2d::{add, arco_da_flecha, arco_ponto, cross, dot, hipot, mul, perp, sub, v, V};
use crate::secoes_gc::{ComponenteGC, EscadaGC, EspelhoGC, GuardaCorpoLinha};

/// Código de aviso: hospedeiro descontínuo (medido = folga em planta, limite = tolerância).
pub const AVISO_HOSPEDEIRO_DESCONTINUO: u32 = 1;
/// Código de aviso: deslocamento excede a largura (medido = deslocamento pedido, limite = 0).
pub const AVISO_DESLOCAMENTO_EXCEDE: u32 = 2;
/// Limite de esquadria (múltiplos do deslocamento).
pub const LIMITE_ESQUADRIA: f64 = 2.5;

pub const FLAG_CURVO: u32 = 1;
pub const FLAG_FECHADO: u32 = 2;
pub const FLAG_SOLDADO: u32 = 4;
pub const FLAG_DIREITO: u32 = 8;

type P3 = [f64; 3];

struct Peca {
    origem: OrigemTrecho,
    curvo: bool,
    nos: Vec<P3>,
}

struct Item {
    ini_ref: Option<(V, V)>,
    fim_ref: Option<(V, V)>,
    /// Lance: cadeias esquerda e direita já prontas. Patamar: calculadas depois, com as arestas dos vizinhos.
    esq: Option<Peca>,
    dir: Option<Peca>,
    anel: Option<(Vec<V>, f64)>,
    lance: bool,
}

#[derive(Default)]
struct Acc {
    trechos: Vec<u32>,
    nos: Vec<f64>,
    avisos: Vec<u32>,
    valores: Vec<f64>,
}

fn grade(x: f64) -> f64 {
    (x / GRADE_SAIDA).round() * GRADE_SAIDA
}

fn dist(a: V, b: V) -> f64 {
    hipot(b.x - a.x, b.y - a.y)
}

fn ponto_segmento(p: V, a: V, b: V) -> (f64, f64) {
    let ab = sub(b, a);
    let l2 = dot(ab, ab);
    let t = if l2 < 1e-18 { 0.0 } else { (dot(sub(p, a), ab) / l2).clamp(0.0, 1.0) };
    (dist(p, add(a, mul(ab, t))), t)
}

fn normalizado(a: V) -> V {
    let l = hipot(a.x, a.y);
    if l < 1e-12 {
        v(0.0, 0.0)
    } else {
        v(a.x / l, a.y / l)
    }
}

// ---------------------------------------------------------------- polilinhas

/// Amostra a curva `a -> b` com flecha `sag` (flecha de corda <= `tol`, no mínimo 8 segmentos por quarto de volta). Inclui os dois extremos exatos.
fn amostrar_curva(a: V, b: V, sag: f64, tol: f64) -> (Vec<V>, bool) {
    let Some(arc) = arco_da_flecha(a, b, sag) else {
        return (vec![a, b], false);
    };
    let passo = 2.0 * (1.0 - tol / arc.radius).max(0.0).acos();
    let por_corda = if passo > 1e-9 { (arc.sweep.abs() / passo).ceil() } else { 720.0 };
    let por_quarto = (arc.sweep.abs() / std::f64::consts::FRAC_PI_2 * 8.0).ceil();
    let n = por_corda.max(por_quarto).clamp(2.0, 720.0) as usize;
    let mut out = Vec::with_capacity(n + 1);
    for i in 0..=n {
        out.push(arco_ponto(&arc, arc.length * i as f64 / n as f64, 0.0));
    }
    out[0] = a;
    out[n] = b;
    (out, true)
}

fn acumulado(p: &[V]) -> Vec<f64> {
    let mut c = vec![0.0];
    for w in p.windows(2) {
        let u = c[c.len() - 1] + dist(w[0], w[1]);
        c.push(u);
    }
    c
}

/// Projeta `q` na polilinha: `(s, distância)`.
fn projetar(p: &[V], cum: &[f64], q: V) -> (f64, f64) {
    let mut melhor = (0.0, f64::INFINITY);
    for i in 0..p.len() - 1 {
        let (d, t) = ponto_segmento(q, p[i], p[i + 1]);
        if d < melhor.1 {
            melhor = (cum[i] + t * (cum[i + 1] - cum[i]), d);
        }
    }
    melhor
}

fn ponto_em(p: &[V], cum: &[f64], s: f64) -> V {
    for i in 0..p.len() - 1 {
        if s <= cum[i + 1] || i == p.len() - 2 {
            let l = cum[i + 1] - cum[i];
            let t = if l < 1e-18 { 0.0 } else { ((s - cum[i]) / l).clamp(0.0, 1.0) };
            return add(p[i], mul(sub(p[i + 1], p[i]), t));
        }
    }
    p[0]
}

/// Remove vértices colineares (giro < 1e-9 rad) de uma cadeia de segmentos retos.
fn sem_colineares(nos: Vec<P3>) -> Vec<P3> {
    if nos.len() < 3 {
        return nos;
    }
    let mut out = vec![nos[0]];
    for k in 1..nos.len() - 1 {
        let a = out[out.len() - 1];
        let u = normalizado(v(nos[k][0] - a[0], nos[k][1] - a[1]));
        let w = normalizado(v(nos[k + 1][0] - nos[k][0], nos[k + 1][1] - nos[k][1]));
        if cross(u, w).abs() > 1e-9 || dot(u, w) < 0.0 {
            out.push(nos[k]);
        }
    }
    out.push(nos[nos.len() - 1]);
    out
}

fn sem_repetidos(p: Vec<V>) -> Vec<V> {
    let mut out: Vec<V> = Vec::with_capacity(p.len());
    for q in p {
        if out.last().is_none_or(|l| dist(*l, q) > 1e-9) {
            out.push(q);
        }
    }
    out
}

// ---------------------------------------------------------------- deslocamento

/// Desloca a polilinha `d` metros para a esquerda (negativo = direita) com esquadria. Devolve cada ponto com o índice do vértice de origem.
/// `None` se algum segmento se inverter (deslocamento excede a largura).
fn deslocar(p: &[V], d: f64, fechado: bool) -> Option<Vec<(V, usize)>> {
    let n = p.len();
    if d == 0.0 || n < 2 {
        return Some(p.iter().copied().enumerate().map(|(i, q)| (q, i)).collect());
    }
    let m = if fechado { n } else { n - 1 };
    let nor: Vec<V> = (0..m).map(|i| perp(normalizado(sub(p[(i + 1) % n], p[i])))).collect();
    let mut out: Vec<(V, usize)> = Vec::with_capacity(n);
    for k in 0..n {
        let (n1, n2) = if fechado {
            (nor[(k + m - 1) % m], nor[k % m])
        } else if k == 0 {
            (nor[0], nor[0])
        } else if k == n - 1 {
            (nor[m - 1], nor[m - 1])
        } else {
            (nor[k - 1], nor[k])
        };
        let den = 1.0 + dot(n1, n2);
        let mit = if den > 1e-9 { Some(mul(add(n1, n2), d / den)) } else { None };
        match mit {
            Some(w) if hipot(w.x, w.y) <= LIMITE_ESQUADRIA * d.abs() => out.push((add(p[k], w), k)),
            _ => {
                out.push((add(p[k], mul(n1, d)), k));
                out.push((add(p[k], mul(n2, d)), k));
            }
        }
    }
    let total = if fechado { out.len() } else { out.len() - 1 };
    for k in 0..total {
        let (a, b) = (out[k], out[(k + 1) % out.len()]);
        if b.1 == (a.1 + 1) % n && b.1 != a.1 {
            let o = sub(p[b.1], p[a.1]);
            if dot(sub(b.0, a.0), o) < 0.0 {
                return None;
            }
        }
    }
    Some(out)
}

// ---------------------------------------------------------------- hospedeiros

fn cadeia_lance_escada(cena: &Cena, comp_id: u32, esc: &EscadaGC, lado: u8, tol: f64) -> Option<(Vec<P3>, bool)> {
    let mut curvas: Vec<_> = cena.gc.curvas.values().filter(|c| c.componente == comp_id && c.lado == lado).collect();
    curvas.sort_by_key(|c| c.ordem);
    if curvas.is_empty() {
        return None;
    }
    let mut poly: Vec<V> = Vec::new();
    let mut curvo = false;
    for c in curvas {
        let (pts, arco) = amostrar_curva(v(c.a[0], c.a[1]), v(c.b[0], c.b[1]), c.sag, tol);
        curvo |= arco;
        poly.extend(pts);
    }
    let mut poly = sem_repetidos(poly);
    if poly.len() < 2 {
        return None;
    }
    let mut esp: Vec<&EspelhoGC> = cena.gc.espelhos.values().filter(|e| e.componente == comp_id).collect();
    esp.sort_by_key(|e| e.indice);
    if esp.is_empty() {
        return Some((poly.iter().map(|q| [q.x, q.y, esc.z_base]).collect(), curvo));
    }
    let s_do = |poly: &[V], cum: &[f64], i: usize| -> f64 {
        let (a, b) = (v(esp[i].a[0], esp[i].a[1]), v(esp[i].b[0], esp[i].b[1]));
        let (sa, da) = projetar(poly, cum, a);
        let (sb, db) = projetar(poly, cum, b);
        if da <= db {
            sa
        } else {
            sb
        }
    };
    let ult = esp.len() - 1;
    let mut cum = acumulado(&poly);
    let (mut s0, mut s1) = (s_do(&poly, &cum, 0), s_do(&poly, &cum, ult));
    if s0 > s1 {
        poly.reverse();
        cum = acumulado(&poly);
        s0 = s_do(&poly, &cum, 0);
        s1 = s_do(&poly, &cum, ult);
    }
    let (z0, z1) = (esp[0].z1, esp[ult].z1);
    if ult == 0 || (s1 - s0).abs() < 1e-9 {
        return Some((poly.iter().map(|q| [q.x, q.y, z1]).collect(), curvo));
    }
    let z_em = |s: f64| z0 + (z1 - z0) * (s - s0) / (s1 - s0);
    let mut nos: Vec<P3> = Vec::new();
    let p0 = ponto_em(&poly, &cum, s0);
    nos.push([p0.x, p0.y, z0]);
    for (k, q) in poly.iter().enumerate() {
        if cum[k] > s0 + 1e-9 && cum[k] < s1 - 1e-9 {
            nos.push([q.x, q.y, z_em(cum[k])]);
        }
    }
    let p1 = ponto_em(&poly, &cum, s1);
    nos.push([p1.x, p1.y, z1]);
    Some((if curvo { nos } else { sem_colineares(nos) }, curvo))
}

fn anel_de(mut pts: Vec<(u32, V, f64)>) -> Option<(Vec<V>, f64)> {
    pts.sort_by_key(|x| x.0);
    let z = pts.first()?.2;
    let mut a: Vec<V> = pts.into_iter().map(|x| x.1).collect();
    if a.len() > 1 && dist(a[0], a[a.len() - 1]) < 1e-9 {
        a.pop();
    }
    if a.len() < 3 {
        None
    } else {
        Some((a, z))
    }
}

fn itens_escada(cena: &Cena, esc_id: u32, tol: f64) -> Vec<Item> {
    let esc = &cena.gc.escadas[&esc_id];
    let mut comps: Vec<(u32, &ComponenteGC)> = cena.gc.componentes.iter().filter(|(_, c)| c.escada == esc_id).map(|(k, c)| (*k, c)).collect();
    comps.sort_by_key(|(_, c)| c.indice);
    let mut itens = Vec::new();
    for (id, c) in comps {
        if c.tipo == COMPONENTE_LANCE {
            let mut esp: Vec<&EspelhoGC> = cena.gc.espelhos.values().filter(|e| e.componente == id).collect();
            esp.sort_by_key(|e| e.indice);
            let r = |e: &&EspelhoGC| (v(e.a[0], e.a[1]), v(e.b[0], e.b[1]));
            let origem = if c.caracol { OrigemTrecho::Caracol } else { OrigemTrecho::Lance };
            let mk = |lado: u8| cadeia_lance_escada(cena, id, esc, lado, tol).map(|(nos, curvo)| Peca { origem, curvo: curvo || c.caracol, nos });
            itens.push(Item { ini_ref: esp.first().map(r), fim_ref: esp.last().map(r), esq: mk(0), dir: mk(1), anel: None, lance: true });
        } else {
            let pts = cena.gc.patamares_escada.values().filter(|p| p.dono == id).map(|p| (p.indice, v(p.p[0], p.p[1]), p.z)).collect();
            itens.push(Item { ini_ref: None, fim_ref: None, esq: None, dir: None, anel: anel_de(pts), lance: false });
        }
    }
    itens
}

fn itens_rampa(cena: &Cena, rampa_id: u32) -> Vec<Item> {
    let mut ordem: Vec<(u32, bool)> = Vec::new();
    for l in cena.gc.lances_rampa.values().filter(|l| l.rampa == rampa_id) {
        ordem.push((l.indice, true));
    }
    let mut pats: Vec<u32> = cena.gc.patamares_rampa.values().filter(|p| p.dono == rampa_id).map(|p| p.componente).collect();
    pats.sort_unstable();
    pats.dedup();
    for c in pats {
        ordem.push((c, false));
    }
    ordem.sort();
    let mut itens = Vec::new();
    for (idx, lance) in ordem {
        if lance {
            let l = cena.gc.lances_rampa.values().find(|l| l.rampa == rampa_id && l.indice == idx).expect("lance");
            let (a, b, c, d) = (v(l.a[0], l.a[1]), v(l.b[0], l.b[1]), v(l.c[0], l.c[1]), v(l.d[0], l.d[1]));
            let mut dir = v(l.fim[0] - l.inicio[0], l.fim[1] - l.inicio[1]);
            if hipot(dir.x, dir.y) < 1e-9 {
                dir = sub(mul(add(c, d), 0.5), mul(add(a, b), 0.5));
            }
            let ref0 = mul(add(a, b), 0.5);
            let a_esq = cross(dir, sub(a, ref0)) >= cross(dir, sub(b, ref0));
            let c_esq = cross(dir, sub(c, ref0)) >= cross(dir, sub(d, ref0));
            let (ea, da) = if a_esq { (a, b) } else { (b, a) };
            let (ec, dc) = if c_esq { (c, d) } else { (d, c) };
            let mk = |p: V, q: V| Some(Peca { origem: OrigemTrecho::Lance, curvo: false, nos: vec![[p.x, p.y, l.z0], [q.x, q.y, l.z1]] });
            itens.push(Item { ini_ref: Some((a, b)), fim_ref: Some((c, d)), esq: mk(ea, ec), dir: mk(da, dc), anel: None, lance: true });
        } else {
            let pts = cena.gc.patamares_rampa.values().filter(|p| p.dono == rampa_id && p.componente == idx).map(|p| (p.indice, v(p.p[0], p.p[1]), p.z)).collect();
            itens.push(Item { ini_ref: None, fim_ref: None, esq: None, dir: None, anel: anel_de(pts), lance: false });
        }
    }
    itens
}

fn custo_aresta(a: V, b: V, r: (V, V)) -> f64 {
    ponto_segmento(a, r.0, r.1).0 + ponto_segmento(b, r.0, r.1).0
}

/// Cadeias esquerda e direita de um anel de patamar, sem as arestas de entrada e de saída, orientadas da entrada para a saída.
fn cadeias_patamar(anel: &[V], z: f64, entrada: Option<(V, V)>, saida: Option<(V, V)>) -> (Option<Peca>, Option<Peca>) {
    let n = anel.len();
    let ar = |i: usize| (anel[i], anel[(i + 1) % n]);
    let mel = |i: usize| mul(add(ar(i).0, ar(i).1), 0.5);
    let melhor = |r: (V, V), fora: Option<usize>| {
        (0..n)
            .filter(|i| Some(*i) != fora)
            .min_by(|&i, &j| custo_aresta(ar(i).0, ar(i).1, r).total_cmp(&custo_aresta(ar(j).0, ar(j).1, r)).then(i.cmp(&j)))
            .unwrap_or(0)
    };
    let longe = |de: usize| (0..n).filter(|&i| i != de).max_by(|&i, &j| dist(mel(i), mel(de)).total_cmp(&dist(mel(j), mel(de))).then(j.cmp(&i))).unwrap_or(0);
    let (a, b) = match (entrada, saida) {
        (Some(e), Some(s)) => {
            let a = melhor(e, None);
            (a, melhor(s, Some(a)))
        }
        (Some(e), None) => {
            let a = melhor(e, None);
            (a, longe(a))
        }
        (None, Some(s)) => {
            let b = melhor(s, None);
            (longe(b), b)
        }
        (None, None) => (0, longe(0)),
    };
    let mut c1: Vec<V> = Vec::new();
    let mut i = (a + 1) % n;
    loop {
        c1.push(anel[i]);
        if i == b {
            break;
        }
        i = (i + 1) % n;
    }
    let mut c2: Vec<V> = Vec::new();
    let mut i = (b + 1) % n;
    loop {
        c2.push(anel[i]);
        if i == a {
            break;
        }
        i = (i + 1) % n;
    }
    c2.reverse();
    let me = mel(a);
    let soma = |c: &[V]| c.iter().fold(v(0.0, 0.0), |s, q| add(s, *q));
    let cen = mul(soma(anel), 1.0 / n as f64);
    let din = sub(cen, me);
    let k1 = cross(din, sub(mul(soma(&c1), 1.0 / c1.len() as f64), me));
    let k2 = cross(din, sub(mul(soma(&c2), 1.0 / c2.len() as f64), me));
    let (esq, dir) = if k1 >= k2 { (c1, c2) } else { (c2, c1) };
    let mk = |c: Vec<V>| {
        if c.len() < 2 {
            None
        } else {
            Some(Peca { origem: OrigemTrecho::Patamar, curvo: false, nos: c.iter().map(|q| [q.x, q.y, z]).collect() })
        }
    };
    (mk(esq), mk(dir))
}

// ---------------------------------------------------------------- montagem

fn emitir(acc: &mut Acc, guarda: u32, trecho: &mut u32, p: &Peca, nos: &[P3], flags: u32, inverter: bool) {
    let mut nos: Vec<P3> = nos.to_vec();
    if inverter {
        nos.reverse();
    }
    let f = flags | if p.curvo { FLAG_CURVO } else { 0 };
    acc.trechos.extend([guarda, *trecho, p.origem as u32, nos.len() as u32, f]);
    for q in nos {
        acc.nos.extend([grade(q[0]), grade(q[1]), grade(q[2])]);
    }
    *trecho += 1;
}

fn aviso(acc: &mut Acc, guarda: u32, codigo: u32, trecho: u32, indice: u32, vals: [f64; 5]) {
    acc.avisos.extend([guarda, codigo, trecho, indice]);
    acc.valores.extend(vals);
}

fn hospedado(cena: &Cena, gid: u32, g: &GuardaCorpoLinha, tol_juncao: f64, acc: &mut Acc) {
    let tipo = &cena.gc.tipos[&g.tipo];
    let mut itens = if g.hosp == HOSP_ESCADA { itens_escada(cena, g.hosp_num, tipo.tol_corda) } else { itens_rampa(cena, g.hosp_num) };
    for k in 0..itens.len() {
        if itens[k].lance {
            continue;
        }
        let entrada = if k > 0 { itens[k - 1].fim_ref } else { None };
        let saida = itens.get(k + 1).and_then(|i| i.ini_ref);
        if let Some((anel, z)) = itens[k].anel.take() {
            let (e, d) = cadeias_patamar(&anel, z, entrada, saida);
            itens[k].esq = e;
            itens[k].dir = d;
        }
    }
    let mut trecho = 0u32;
    for lado in 0..2u8 {
        let (bit_lance, bit_pat) = if lado == 0 { (LADO_ESQ_LANCE, LADO_ESQ_PATAMAR) } else { (LADO_DIR_LANCE, LADO_DIR_PATAMAR) };
        // Sequências de itens adjacentes, ligados e contínuos; o resto abre uma nova sequência.
        let mut runs: Vec<Vec<(usize, &Peca)>> = Vec::new();
        let mut run: Vec<(usize, &Peca)> = Vec::new();
        let mut avisos_gap: Vec<(usize, [f64; 5])> = Vec::new();
        for (k, it) in itens.iter().enumerate() {
            let ligado = g.lados & if it.lance { bit_lance } else { bit_pat } != 0;
            let peca = if lado == 0 { it.esq.as_ref() } else { it.dir.as_ref() };
            match (ligado, peca) {
                (true, Some(p)) => {
                    if let Some(&(ka, pa)) = run.last() {
                        let (fim, ini) = (pa.nos[pa.nos.len() - 1], p.nos[0]);
                        let folga = hipot(ini[0] - fim[0], ini[1] - fim[1]);
                        if ka + 1 != k {
                            runs.push(std::mem::take(&mut run));
                        } else if folga > tol_juncao {
                            avisos_gap.push((k, [folga, tol_juncao, ini[0], ini[1], ini[2]]));
                            runs.push(std::mem::take(&mut run));
                        }
                    }
                    run.push((k, p));
                }
                _ => {
                    if !run.is_empty() {
                        runs.push(std::mem::take(&mut run));
                    }
                }
            }
        }
        if !run.is_empty() {
            runs.push(run);
        }
        // O índice do trecho no aviso é o do primeiro trecho da sequência que começa no item.
        let mut prox = trecho;
        let mut inicio_de: Vec<(usize, u32)> = Vec::new();
        for r in &runs {
            inicio_de.push((r[0].0, prox));
            prox += r.len() as u32;
        }
        for (k, vals) in avisos_gap {
            let t = inicio_de.iter().find(|(i, _)| *i == k).map_or(trecho, |x| x.1);
            aviso(acc, gid, AVISO_HOSPEDEIRO_DESCONTINUO, t, k as u32, vals);
        }
        let d = if (g.pos_base == 0) == (lado == 1) { g.desloc } else { -g.desloc };
        for run in runs {
            let mut plano: Vec<V> = Vec::new();
            let mut inicio: Vec<usize> = Vec::new();
            for (i, (_, p)) in run.iter().enumerate() {
                let salto = usize::from(i > 0);
                inicio.push(plano.len() - salto);
                for q in &p.nos[salto..] {
                    plano.push(v(q[0], q[1]));
                }
            }
            let Some(off) = deslocar(&plano, d, false) else {
                let q = run[0].1.nos[0];
                aviso(acc, gid, AVISO_DESLOCAMENTO_EXCEDE, trecho, run[0].0 as u32, [g.desloc, 0.0, q[0], q[1], q[2]]);
                trecho += run.len() as u32;
                continue;
            };
            for (i, (_, p)) in run.iter().enumerate() {
                let (a, b) = (inicio[i], inicio[i] + p.nos.len() - 1);
                let nos: Vec<P3> = off.iter().filter(|(_, s)| *s >= a && *s <= b).map(|(q, s)| [q.x, q.y, p.nos[*s - a][2]]).collect();
                let flags = if i > 0 { FLAG_SOLDADO } else { 0 } | if lado == 1 { FLAG_DIREITO } else { 0 };
                emitir(acc, gid, &mut trecho, p, &nos, flags, g.inverter);
            }
        }
    }
}

fn manual(cena: &Cena, gid: u32, g: &GuardaCorpoLinha, acc: &mut Acc) {
    let mut pts: Vec<_> = cena.gc.caminhos.values().filter(|c| c.guarda == gid).collect();
    pts.sort_by_key(|c| c.indice);
    let mut plano: Vec<V> = Vec::new();
    let mut z: Vec<f64> = Vec::new();
    for c in pts {
        let q = v(c.x, c.y);
        if plano.last().is_none_or(|l| dist(*l, q) > 1e-9) {
            plano.push(q);
            z.push(g.cota_base + c.dz);
        }
    }
    if g.fechado && plano.len() > 2 && dist(plano[0], plano[plano.len() - 1]) < 1e-9 {
        plano.pop();
        z.pop();
    }
    if plano.len() < 2 {
        return;
    }
    let d = match g.lado_desloc {
        0 => g.desloc,
        1 => -g.desloc,
        _ => 0.0,
    };
    let Some(off) = deslocar(&plano, d, g.fechado) else {
        aviso(acc, gid, AVISO_DESLOCAMENTO_EXCEDE, 0, 0, [g.desloc, 0.0, plano[0].x, plano[0].y, z[0]]);
        return;
    };
    let nos: Vec<P3> = off.iter().map(|(q, s)| [q.x, q.y, z[*s]]).collect();
    let p = Peca { origem: OrigemTrecho::Manual, curvo: false, nos: Vec::new() };
    let mut trecho = 0u32;
    emitir(acc, gid, &mut trecho, &p, &nos, if g.fechado { FLAG_FECHADO } else { 0 }, g.inverter);
}

/// Consulta `guarda_caminhos` (id 60): confere as referências entre as seções e monta as cadeias de todos os guarda-corpos do nível.
pub fn guarda_caminhos(cena: &Cena, nivel: u32, tol_juncao: f64) -> Result<Vec<Saida>, u32> {
    cena.gc.validar_referencias()?;
    let mut acc = Acc::default();
    for (&gid, g) in &cena.gc.guardas {
        if nivel != NIVEL_TODOS && g.nivel != nivel {
            continue;
        }
        let tipo = &cena.gc.tipos[&g.tipo];
        if !(TOL_CORDA_MIN..=TOL_CORDA_MAX).contains(&tipo.tol_corda) {
            return Err(ENTRADA);
        }
        if g.hosp == HOSP_MANUAL {
            manual(cena, gid, g, &mut acc);
        } else {
            hospedado(cena, gid, g, tol_juncao, &mut acc);
        }
    }
    Ok(vec![Saida::U32(acc.trechos), Saida::F64(acc.nos), Saida::U32(acc.avisos), Saida::F64(acc.valores)])
}

#[cfg(test)]
#[path = "gc_caminho_testes.rs"]
mod testes;
