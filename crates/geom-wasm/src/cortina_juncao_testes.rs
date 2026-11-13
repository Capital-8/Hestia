//! Testes de PROPRIEDADE da junção entre paredes da cortina (ADR 0056 §10, fase 3: sem referência TS; propriedade e casos dourados em planta).

use super::*;
use crate::cena::Cena;
use crate::cortina_malha::{montar, secao, testes::fechada_e_orientada, valor_em, volume_malha};
use crate::cortina_pecas::testes::*;
use crate::cortina_pecas::{resolver, CortinaR, Geom};
use crate::cortina_planta::planta;
use crate::cortina_quant::quant_cortina;
use crate::esquema::NIVEL_TODOS;
use crate::secoes_cortina::GradeLinha;
use crate::teste_util::Xorshift;

const ALTURA: f64 = 3.0;

fn perto(a: f64, b: f64, tol: f64) {
    assert!((a - b).abs() < tol, "{a} != {b} (tol {tol})");
}

// ───────────── construção das cenas ─────────────

/// Cena com o tipo 1 (profundidade `d1`) e o tipo 2 (profundidade `d2`); `canto` liga o montante de canto (`M_CANTO`) nos dois tipos.
fn cena_tipos(d1: f64, d2: f64, canto: bool) -> Cena {
    let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
    e.profundidade = d1;
    let mut c = cena_com_tipo(&e);
    let s = &mut c.cortina;
    let mut t2 = s.tipos[&1];
    t2.profundidade = d2;
    s.tipos.insert(2, t2);
    let (g1, g2) = (s.grades[&1], s.grades[&2]);
    s.grades.insert(3, GradeLinha { dono_num: 2, ..g1 });
    s.grades.insert(4, GradeLinha { dono_num: 2, ..g2 });
    if canto {
        s.tipos.get_mut(&1).expect("t1").montantes[6] = M_CANTO;
        s.tipos.get_mut(&2).expect("t2").montantes[6] = M_CANTO;
    }
    c
}

fn cortina(tipo: u32, a: V, b: V, loc: u8, invertida: bool) -> CortinaLinha {
    CortinaLinha { nivel: 0, tipo, a, b, z_base: 0.0, altura: ALTURA, sag: 0.0, invertida, loc, flags: 0, painel_padrao: ID_AUSENTE, hosp: ID_AUSENTE }
}

/// Os dois segmentos de face de uma cortina (como o TS os manda): as linhas `s_lo` e `s_hi` de `a` a `b`.
fn faces_da_cortina(c: &CortinaLinha, d: f64) -> ([f64; 4], [f64; 4]) {
    let (dx, dy) = (c.b[0] - c.a[0], c.b[1] - c.a[1]);
    let l = dx.hypot(dy);
    let n = [-dy / l, dx / l];
    let (lo, hi) = faixa_lateral(c, d);
    let f = |s: f64| [c.a[0] + n[0] * s, c.a[1] + n[1] * s, c.b[0] + n[0] * s, c.b[1] + n[1] * s];
    (f(lo), f(hi))
}

/// Os dois segmentos de face de uma parede comum de eixo `p → q` e espessura `t` (centrada no eixo).
fn faces_da_parede(p: V, q: V, t: f64) -> ([f64; 4], [f64; 4]) {
    let l = (q[0] - p[0]).hypot(q[1] - p[1]);
    let n = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
    let f = |s: f64| [p[0] + n[0] * s, p[1] + n[1] * s, q[0] + n[0] * s, q[1] + n[1] * s];
    (f(-t / 2.0), f(t / 2.0))
}

fn angulo_entre(w1: V, w2: V) -> f64 {
    dot(w1, w2).clamp(-1.0, 1.0).acos()
}

fn fim_no(c: &CortinaLinha, no: V) -> u8 {
    u8::from((c.a[0] - no[0]).hypot(c.a[1] - no[1]) >= 1e-9)
}

fn sai_do_no(c: &CortinaLinha, no: V) -> V {
    let l = (c.b[0] - c.a[0]).hypot(c.b[1] - c.a[1]);
    let fora = if fim_no(c, no) == 0 { c.b } else { c.a };
    [(fora[0] - no[0]) / l, (fora[1] - no[1]) / l]
}

/// Liga duas cortinas (ids `ia` e `ib`) no nó `no`, uma linha de extremidade para cada uma (como o TS manda).
fn ligar_cortinas(c: &mut Cena, ia: u32, ib: u32, no: V) {
    for (id, outro) in [(ia, ib), (ib, ia)] {
        let (eu, ele) = (c.cortina.cortinas[&id], c.cortina.cortinas[&outro]);
        let d = c.cortina.tipos[&ele.tipo].profundidade;
        let (f1, f2) = faces_da_cortina(&ele, d);
        let (w, wn) = (sai_do_no(&eu, no), sai_do_no(&ele, no));
        c.cortina.extremidades.insert(
            id * 10 + u32::from(fim_no(&eu, no)),
            ExtremidadeLinha { cortina: id, fim: fim_no(&eu, no), vizinha: outro, vizinha_cortina: true, lado: u8::from(cross(w, wn) < 0.0), flags: 0, angulo: angulo_entre(w, wn), face1: f1, face2: f2, espessura: d },
        );
    }
}

/// Liga a cortina `id` a uma parede comum de eixo `p → q` (espessura `t`) no nó `no`. `atravessa`: o nó está no meio da parede (T).
fn ligar_parede(c: &mut Cena, id: u32, no: V, p: V, q: V, t: f64, atravessa: bool) {
    let eu = c.cortina.cortinas[&id];
    let (f1, f2) = faces_da_parede(p, q, t);
    let w = sai_do_no(&eu, no);
    let fora = if (p[0] - no[0]).hypot(p[1] - no[1]) > (q[0] - no[0]).hypot(q[1] - no[1]) { p } else { q };
    let l = (fora[0] - no[0]).hypot(fora[1] - no[1]);
    let wn = [(fora[0] - no[0]) / l, (fora[1] - no[1]) / l];
    c.cortina.extremidades.insert(
        id * 10 + u32::from(fim_no(&eu, no)),
        ExtremidadeLinha {
            cortina: id,
            fim: fim_no(&eu, no),
            vizinha: 9000,
            vizinha_cortina: false,
            lado: if atravessa { 2 } else { u8::from(cross(w, wn) < 0.0) },
            flags: if atravessa { 4 } else { 0 },
            angulo: angulo_entre(w, wn),
            face1: f1,
            face2: f2,
            espessura: t,
        },
    );
}

/// Duas cortinas de 5 m que se encontram na origem com o ângulo interno `theta` (graus) entre as direções que saem do nó. A cortina 1 chega ao nó
/// pelo `b`; a 2 sai dele pelo `a`. `espelho`: a cena espelhada em y (e `invertida` trocada), que deve dar o resultado espelhado.
fn cena_canto(theta: f64, d1: f64, d2: f64, loc1: u8, loc2: u8, espelho: bool, canto: bool) -> Cena {
    let mut c = cena_tipos(d1, d2, canto);
    let t = theta.to_radians();
    let sy = if espelho { -1.0 } else { 1.0 };
    let (p1, p2) = ([-5.0, 0.0], [-5.0 * t.cos(), 5.0 * t.sin() * sy]);
    c.cortina.cortinas.insert(1, cortina(1, p1, [0.0, 0.0], loc1, espelho));
    c.cortina.cortinas.insert(2, cortina(2, [0.0, 0.0], p2, loc2, espelho));
    ligar_cortinas(&mut c, 1, 2, [0.0, 0.0]);
    c
}

fn resolve(c: &Cena) -> Vec<CortinaR> {
    resolver(c, NIVEL_TODOS).expect("resolver")
}

fn geom_de(rs: &[CortinaR], id: u32) -> &Geom {
    rs.iter().find(|r| r.id == id).and_then(|r| r.g.as_ref()).expect("geom")
}

// ───────────── geometria em planta ─────────────

fn dentro(poli: &[V], q: V) -> bool {
    let mut d = false;
    for k in 0..poli.len() {
        let (a, b) = (poli[k], poli[(k + 1) % poli.len()]);
        if (a[1] > q[1]) != (b[1] > q[1]) && q[0] < a[0] + (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) {
            d = !d;
        }
    }
    d
}

/// Faixa do sistema (retângulo em planta) da cortina RESOLVIDA, já com o recuo.
fn faixa_resolvida(g: &Geom) -> Vec<V> {
    let xy = |t: f64, y: f64| {
        let p = g.mundo(t, y, 0.0);
        [p[0], p[1]]
    };
    vec![xy(0.0, -g.d / 2.0), xy(g.l, -g.d / 2.0), xy(g.l, g.d / 2.0), xy(0.0, g.d / 2.0)]
}

fn area_poligono(p: &[V]) -> f64 {
    (0..p.len()).map(|k| cross(p[k], p[(k + 1) % p.len()])).sum::<f64>() / 2.0
}

/// O polígono é simples (nenhum par de arestas não vizinhas se cruza).
fn simples(p: &[V]) -> bool {
    let n = p.len();
    let cruza = |a: V, b: V, c: V, d: V| {
        let (d1, d2, d3, d4) = (cross(sub(b, a), sub(c, a)), cross(sub(b, a), sub(d, a)), cross(sub(d, c), sub(a, c)), cross(sub(d, c), sub(b, c)));
        d1 * d2 < -1e-18 && d3 * d4 < -1e-18
    };
    for i in 0..n {
        for j in i + 1..n {
            if j == i + 1 || (i == 0 && j == n - 1) {
                continue;
            }
            if cruza(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]) {
                return false;
            }
        }
    }
    true
}

/// Reta por dois pontos (ponto e direção) e interseção de duas retas.
fn interseccao(p1: V, d1: V, p2: V, d2: V) -> V {
    let t = cross(sub(p2, p1), d2) / cross(d1, d2);
    mais(p1, d1, t)
}

/// A região IDEAL do encontro, independente da implementação: a união das duas faixas infinitas partidas pela reta do esquadro (que passa pelos encontros
/// das faces internas e das externas, achadas pela proximidade da ponta distante da outra cortina). Em linha reta, as faixas partem no plano do nó.
fn regiao_ideal(c1: &CortinaLinha, d1: f64, c2: &CortinaLinha, d2: f64, no: V) -> Box<dyn Fn(V) -> bool> {
    let (w1, w2) = (sai_do_no(c1, no), sai_do_no(c2, no));
    let (f1, f2) = (mais(no, w1, 1.0), mais(no, w2, 1.0));
    // Duas retas de face de cada cortina, ordenadas: a interna é a mais próxima da ponta distante da outra.
    let faces = |c: &CortinaLinha, d: f64, alvo: V| {
        let (a, b) = faces_da_cortina(c, d);
        let dir = sub([a[2], a[3]], [a[0], a[1]]);
        let dist = |f: [f64; 4]| cross(dir, sub(alvo, [f[0], f[1]])).abs();
        if dist(a) < dist(b) {
            ([a[0], a[1]], [b[0], b[1]], dir)
        } else {
            ([b[0], b[1]], [a[0], a[1]], dir)
        }
    };
    let (in1, out1, dir1) = faces(c1, d1, f2);
    let (in2, out2, dir2) = faces(c2, d2, f1);
    let faixa = move |p_in: V, p_out: V, dir: V, q: V| cross(dir, sub(q, p_in)) * cross(dir, sub(q, p_out)) <= 0.0;
    if cross(w1, w2).abs() < SENO_COLINEAR {
        return Box::new(move |q| {
            (faixa(in1, out1, dir1, q) && dot(sub(q, no), w1) >= 0.0) || (faixa(in2, out2, dir2, q) && dot(sub(q, no), w2) >= 0.0)
        });
    }
    let (i, o) = (interseccao(in1, dir1, in2, dir2), interseccao(out1, dir1, out2, dir2));
    let lado = move |q: V| cross(sub(o, i), sub(q, i));
    let (l1, l2) = (lado(f1), lado(f2));
    Box::new(move |q| (faixa(in1, out1, dir1, q) && lado(q) * l1 > 0.0) || (faixa(in2, out2, dir2, q) && lado(q) * l2 > 0.0))
}

/// A propriedade do canto: amostra pontos ao redor do nó. Nenhum cai em dois sólidos (as duas faixas recuadas e o montante de canto); todo ponto da
/// região ideal do encontro cai em exatamente um (sem fresta) e o montante não sai dela (sem excesso). Devolve o polígono do canto.
fn confere_canto(c: &Cena, semente: u64) -> Vec<V> {
    let rs = resolve(c);
    let (g1, g2) = (geom_de(&rs, 1), geom_de(&rs, 2));
    assert_eq!(g1.cantos.len() + g2.cantos.len(), 1, "um canto só, emitido por uma delas");
    assert_eq!(g1.cantos.len(), 1, "a de menor id emite");
    let poste = g1.cantos[0].poligono.clone();
    assert!(poste.len() >= 4 && poste.len() <= 8, "{poste:?}");
    assert!(area_poligono(&poste) > 0.0, "anti-horário e com área");
    assert!(simples(&poste), "polígono simples: {poste:?}");
    let ideal = regiao_ideal(&c.cortina.cortinas[&1], g1.d, &c.cortina.cortinas[&2], g2.d, [0.0, 0.0]);
    let (r1, r2) = (faixa_resolvida(g1), faixa_resolvida(g2));
    let mut rng = Xorshift::novo(semente);
    let (mut cobertos, mut lacunas, mut excessos) = (0, 0, 0);
    for _ in 0..60_000 {
        let q = [rng.intervalo(-1.2, 1.2), rng.intervalo(-1.2, 1.2)];
        let n = usize::from(dentro(&r1, q)) + usize::from(dentro(&r2, q)) + usize::from(dentro(&poste, q));
        assert!(n <= 1, "sobreposição em {q:?}: {n} sólidos (faixas recuadas e canto)");
        if ideal(q) {
            cobertos += 1;
            lacunas += usize::from(n != 1);
        } else {
            excessos += n;
        }
    }
    assert!(cobertos > 1000, "amostra insuficiente: {cobertos}");
    assert_eq!(lacunas, 0, "fresta: {lacunas} pontos da região ideal sem sólido");
    assert_eq!(excessos, 0, "excesso: {excessos} pontos de sólido fora da região ideal");
    poste
}

// ───────────── encosto reto ─────────────

#[test]
fn t_com_parede_comum_recua_a_meia_espessura() {
    // Cortina de 6 m de (0,0) a (6,0); parede comum de 0,2 m de espessura ao longo de x = 0, de y = -3 a 3 (o nó está no meio dela: T).
    let mut c = cena_tipos(0.12, 0.12, false);
    c.cortina.cortinas.insert(1, cortina(1, [0.0, 0.0], [6.0, 0.0], 0, false));
    ligar_parede(&mut c, 1, [0.0, 0.0], [0.0, -3.0], [0.0, 3.0], 0.2, true);
    let rs = resolve(&c);
    let g = geom_de(&rs, 1);
    perto(g.l, 6.0 - 0.1, 1e-9);
    perto(g.a[0], 0.1, 1e-9);
    assert!(g.cantos.is_empty());
    // O montante de borda de início continua na ponta recuada, embutido: o centro dele fica a meia largura da ponta.
    let borda = g.pecas.iter().find(|p| p.eixo == EIXO_U && p.papel == PAPEL_BORDA_INI).expect("borda");
    perto(borda.pos, 0.025, 1e-9);
    // Sem sobreposição com a parede nem fresta: a face da cortina cai exatamente na face da parede.
    let parede = [[-0.1, -3.0], [0.1, -3.0], [0.1, 3.0], [-0.1, 3.0]];
    let mut rng = Xorshift::novo(7);
    for _ in 0..20_000 {
        let q = [rng.intervalo(-0.5, 1.0), rng.intervalo(-0.3, 0.3)];
        assert!(!(dentro(&parede, q) && dentro(&faixa_resolvida(g), q)), "sobreposição em {q:?}");
    }
    perto(g.mundo(0.0, 0.0, 0.0)[0], 0.1, 1e-9);
}

#[test]
fn l_com_parede_comum_a_noventa_e_a_sessenta_graus() {
    // L a 90°: a parede sai do nó para cima. Cortina com loc 0 (faixa centrada) e d = 0,12: recuo = meia espessura.
    let mut c = cena_tipos(0.12, 0.12, false);
    c.cortina.cortinas.insert(1, cortina(1, [0.0, 0.0], [6.0, 0.0], 0, false));
    ligar_parede(&mut c, 1, [0.0, 0.0], [0.0, 0.0], [0.0, 4.0], 0.2, false);
    perto(geom_de(&resolve(&c), 1).l, 6.0 - 0.1, 1e-9);
    // L a 60°: recuo analítico (d·cos60/2 + t/2) / sen60.
    let a = 60f64.to_radians();
    let com_parede = |sinal: f64| {
        let mut c = cena_tipos(0.12, 0.12, false);
        c.cortina.cortinas.insert(1, cortina(1, [0.0, 0.0], [6.0, 0.0], 0, false));
        ligar_parede(&mut c, 1, [0.0, 0.0], [0.0, 0.0], [4.0 * a.cos(), 4.0 * a.sin() * sinal], 0.2, false);
        6.0 - geom_de(&resolve(&c), 1).l
    };
    let esperado = (0.12 * a.cos() / 2.0 + 0.1) / a.sin();
    perto(com_parede(1.0), esperado, 1e-9);
    // Parede para o lado contrário (abaixo do eixo): o mesmo recuo, por simetria.
    perto(com_parede(-1.0), esperado, 1e-9);
}

#[test]
fn encosto_na_ponta_do_fim_e_com_linha_de_localizacao_na_face() {
    // A ponta `b` da cortina (de (-6,0) a (0,0)) encosta numa parede ao longo de x = 0, para qualquer linha de localização.
    for loc in [0u8, 2, 3] {
        let mut c = cena_tipos(0.12, 0.12, false);
        c.cortina.cortinas.insert(1, cortina(1, [-6.0, 0.0], [0.0, 0.0], loc, false));
        ligar_parede(&mut c, 1, [0.0, 0.0], [0.0, -3.0], [0.0, 3.0], 0.2, true);
        let rs = resolve(&c);
        let g = geom_de(&rs, 1);
        perto(g.l, 6.0 - 0.1, 1e-9);
        perto(g.mundo(g.l, 0.0, 0.0)[0], -0.1, 1e-9);
    }
}

#[test]
fn sem_vizinha_ou_com_nojoin_a_cortina_termina_no_eixo_do_no() {
    let base = |flags: u8, vizinha: u32| {
        let mut c = cena_tipos(0.12, 0.12, false);
        c.cortina.cortinas.insert(1, cortina(1, [0.0, 0.0], [6.0, 0.0], 0, false));
        ligar_parede(&mut c, 1, [0.0, 0.0], [0.0, -3.0], [0.0, 3.0], 0.2, true);
        let e = c.cortina.extremidades.get_mut(&10).expect("e");
        e.flags |= flags;
        e.vizinha = vizinha;
        resolve(&c)
    };
    for rs in [base(1, 9000), base(0, ID_AUSENTE)] {
        let g = geom_de(&rs, 1);
        perto(g.l, 6.0, 1e-12);
        perto(g.a[0], 0.0, 1e-12);
    }
    // Sem nenhuma linha de extremidade: igual a antes da fase 3.
    let mut c = cena_tipos(0.12, 0.12, false);
    c.cortina.cortinas.insert(1, cortina(1, [0.0, 0.0], [6.0, 0.0], 0, false));
    perto(geom_de(&resolve(&c), 1).l, 6.0, 1e-12);
}

// ───────────── canto entre cortinas ─────────────

#[test]
fn canto_de_trinta_a_cento_e_cinquenta_graus_sem_fresta_nem_sobreposicao() {
    let angulos = [30.0, 45.0, 60.0, 75.0, 90.0, 105.0, 120.0, 135.0, 150.0];
    let profundidades = [(0.12, 0.12), (0.12, 0.2), (0.3, 0.1)];
    let locs = [(0u8, 0u8), (2, 3), (3, 2), (2, 2)];
    let mut semente = 1;
    for &theta in &angulos {
        for &(d1, d2) in &profundidades {
            for &(l1, l2) in &locs {
                for espelho in [false, true] {
                    semente += 1;
                            let c = cena_canto(theta, d1, d2, l1, l2, espelho, true);
                    confere_canto(&c, semente);
                }
            }
        }
    }
}

#[test]
fn canto_sem_corner_usa_a_borda_da_menor_id() {
    // Sem `corner` no tipo, o montante do canto é o de borda da cortina de menor id (`M_RET`, material 11) para a ponta dela.
    let c = cena_canto(90.0, 0.12, 0.12, 0, 0, false, false);
    let rs = resolve(&c);
    let poste = &geom_de(&rs, 1).cantos[0];
    assert_eq!((poste.m.tipo, poste.m.material), (M_RET, 11));
    confere_canto(&c, 99);
    // Sem nenhum dos dois (nem corner nem borda), a junção não acontece: as duas terminam no eixo do nó, como antes.
    let mut c = cena_canto(90.0, 0.12, 0.12, 0, 0, false, false);
    for t in c.cortina.tipos.values_mut() {
        t.montantes[2] = ID_AUSENTE;
        t.montantes[3] = ID_AUSENTE;
    }
    let rs = resolve(&c);
    assert!(geom_de(&rs, 1).cantos.is_empty());
    perto(geom_de(&rs, 1).l, 5.0, 1e-12);
    perto(geom_de(&rs, 2).l, 5.0, 1e-12);
}

#[test]
fn simetria_por_espelho_do_canto() {
    for theta in [30.0, 60.0, 90.0, 135.0, 150.0] {
        for (d1, d2, l1, l2) in [(0.12, 0.12, 0u8, 0u8), (0.12, 0.25, 2, 3), (0.3, 0.1, 3, 2)] {
            let (a, b) = (resolve(&cena_canto(theta, d1, d2, l1, l2, false, true)), resolve(&cena_canto(theta, d1, d2, l1, l2, true, true)));
            for id in [1, 2] {
                let (ga, gb) = (geom_de(&a, id), geom_de(&b, id));
                perto(ga.l, gb.l, 1e-9);
                perto(ga.a[0], gb.a[0], 1e-9);
                perto(ga.a[1], -gb.a[1], 1e-9);
            }
            let (pa, pb) = (&geom_de(&a, 1).cantos[0].poligono, &geom_de(&b, 1).cantos[0].poligono);
            assert_eq!(pa.len(), pb.len());
            perto(area_poligono(pa), area_poligono(pb), 1e-9);
            // Cada vértice do espelhado tem o seu par no original refletido em y.
            for q in pb {
                assert!(pa.iter().any(|p| (p[0] - q[0]).abs() < 1e-9 && (p[1] + q[1]).abs() < 1e-9), "vértice {q:?} sem par");
            }
        }
    }
}

#[test]
fn colineares_viram_continuidade_com_um_unico_montante() {
    // Duas cortinas em linha reta, mesma profundidade: o montante do nó é um retângulo de largura = a do `corner` (60 mm) por 120 mm de profundidade.
    let mut c = cena_tipos(0.12, 0.12, true);
    c.cortina.cortinas.insert(1, cortina(1, [-5.0, 0.0], [0.0, 0.0], 0, false));
    c.cortina.cortinas.insert(2, cortina(2, [0.0, 0.0], [5.0, 0.0], 0, false));
    ligar_cortinas(&mut c, 1, 2, [0.0, 0.0]);
    let rs = resolve(&c);
    let (g1, g2) = (geom_de(&rs, 1), geom_de(&rs, 2));
    perto(g1.l, 5.0 - 0.03, 1e-9);
    perto(g2.l, 5.0 - 0.03, 1e-9);
    let poste = &g1.cantos[0];
    assert_eq!(poste.poligono.len(), 4);
    perto(poste.area_planta(), 0.06 * 0.12, 1e-9);
    assert!(g2.cantos.is_empty());
    // Sem montantes de borda duplicados no nó: nenhuma peça de borda `fim` na 1 nem de borda `início` na 2.
    assert!(g1.pecas.iter().all(|p| p.papel != PAPEL_BORDA_FIM));
    assert!(g2.pecas.iter().all(|p| p.papel != PAPEL_BORDA_INI));
    // Profundidades diferentes em linha: o preenchimento continua sem fresta (quadrilátero entre os dois cortes).
    let mut c = cena_tipos(0.12, 0.2, true);
    c.cortina.cortinas.insert(1, cortina(1, [-5.0, 0.0], [0.0, 0.0], 0, false));
    c.cortina.cortinas.insert(2, cortina(2, [0.0, 0.0], [5.0, 0.0], 0, false));
    ligar_cortinas(&mut c, 1, 2, [0.0, 0.0]);
    confere_canto(&c, 5);
}

#[test]
fn nojoin_de_uma_delas_ou_falta_de_reciproca_vira_encosto() {
    // A cortina 2 desliga a junção na ponta dela: a 1 a trata como parede comum (encosto reto contra a faixa inteira da 2), e a 2 termina no eixo.
    let mut c = cena_canto(90.0, 0.12, 0.12, 0, 0, false, true);
    c.cortina.extremidades.get_mut(&20).expect("e").flags = 1;
    let rs = resolve(&c);
    assert!(geom_de(&rs, 1).cantos.is_empty() && geom_de(&rs, 2).cantos.is_empty());
    perto(geom_de(&rs, 2).l, 5.0, 1e-12);
    perto(geom_de(&rs, 1).l, 5.0 - 0.06, 1e-9);
    // Sem a linha da outra: a 1 encosta, a 2 termina no eixo.
    let mut c = cena_canto(90.0, 0.12, 0.12, 0, 0, false, true);
    c.cortina.extremidades.remove(&20);
    let rs = resolve(&c);
    assert!(geom_de(&rs, 1).cantos.is_empty());
    perto(geom_de(&rs, 1).l, 5.0 - 0.06, 1e-9);
    perto(geom_de(&rs, 2).l, 5.0, 1e-12);
}

#[test]
fn cortina_encurtada_demais_ignora_a_juncao() {
    let mut c = cena_tipos(0.12, 0.12, false);
    c.cortina.cortinas.insert(1, cortina(1, [0.0, 0.0], [0.1005, 0.0], 0, false));
    ligar_parede(&mut c, 1, [0.0, 0.0], [0.0, -3.0], [0.0, 3.0], 0.2, true);
    perto(geom_de(&resolve(&c), 1).l, 0.1005, 1e-12);
}

// ───────────── malha, quantidades e planta do canto ─────────────

#[test]
fn montante_de_canto_tem_malha_fechada_orientada_volume_e_quantidade() {
    for theta in [30.0, 90.0, 135.0, 150.0] {
        let rs = resolve(&cena_canto(theta, 0.12, 0.2, 0, 3, false, true));
        let g = geom_de(&rs, 1);
        let poste = &g.cantos[0];
        let malha = montar(&rs, 1).expect("malha");
        let grupo = malha.grupos.iter().find(|x| x.cortina == 1 && x.material == 15).expect("grupo do canto");
        assert!(fechada_e_orientada(&grupo.vertices, &grupo.triangulos), "theta {theta}: malha do canto fechada e orientada");
        let tris: Vec<[[f64; 3]; 3]> = grupo.triangulos.iter().map(|t| [grupo.vertices[t[0] as usize], grupo.vertices[t[1] as usize], grupo.vertices[t[2] as usize]]).collect();
        perto(volume_malha(&tris), poste.area_planta() * ALTURA, 1e-4);
        // Quantidade: uma peça de altura total, volume = área em planta × altura.
        let q = quant_cortina(&rs);
        let linha = q.iter().find(|x| x.cortina == 1 && x.papel == PAPEL_CANTO).expect("linha do canto");
        assert_eq!(linha.n, 1);
        perto(linha.comprimento, ALTURA, 1e-6);
        perto(linha.volume, poste.area_planta() * ALTURA, 1e-5);
        assert!(q.iter().all(|x| !(x.cortina == 2 && x.papel == PAPEL_CANTO)), "só a emissora conta o canto");
    }
}

// ───────────── casos dourados de planta ─────────────

fn contorno(rs: &[CortinaR], id: u32) -> Vec<V> {
    planta(rs, 1.2, 0).into_iter().find(|l| l.cortina == id && l.papel == 0).expect("contorno").pontos
}

fn igual_pontos(obtido: &[V], esperado: &[V]) {
    assert_eq!(obtido.len(), esperado.len(), "{obtido:?}");
    for (a, b) in obtido.iter().zip(esperado) {
        assert!((a[0] - b[0]).abs() < 1e-9 && (a[1] - b[1]).abs() < 1e-9, "{obtido:?} != {esperado:?}");
    }
}

#[test]
fn dourado_de_planta_l_entre_cortinas_a_noventa_graus() {
    // 1: de (-5,0) a (0,0); 2: de (0,0) a (0,5). Profundidade 0,12 e linha central: o recuo é a meia profundidade da outra (0,06 > 0,03 do canto).
    let c = cena_canto(90.0, 0.12, 0.12, 0, 0, false, true);
    let rs = resolve(&c);
    // Mesmos vértices, em qualquer ordem de partida.
    let mesmos = |obtido: &[V], esperado: &[V]| {
        assert_eq!(obtido.len(), esperado.len(), "{obtido:?}");
        for e in esperado {
            assert!(obtido.iter().any(|p| (p[0] - e[0]).abs() < 1e-9 && (p[1] - e[1]).abs() < 1e-9), "falta {e:?} em {obtido:?}");
        }
    };
    mesmos(&contorno(&rs, 1), &[[-5.0, -0.06], [-0.06, -0.06], [-0.06, 0.06], [-5.0, 0.06]]);
    mesmos(&contorno(&rs, 2), &[[-0.06, 0.06], [0.06, 0.06], [0.06, 5.0], [-0.06, 5.0]]);
    mesmos(&geom_de(&rs, 1).cantos[0].poligono, &[[-0.06, -0.06], [0.06, -0.06], [0.06, 0.06], [-0.06, 0.06]]);
}

#[test]
fn dourado_de_planta_t_com_parede_comum() {
    // Cortina de (0,0) a (6,0) encostada no meio de uma parede de 0,2 m ao longo de x = 0 (y de -3 a 3): a cortina começa na face, em x = 0,1.
    let mut c = cena_tipos(0.12, 0.12, false);
    c.cortina.cortinas.insert(1, cortina(1, [0.0, 0.0], [6.0, 0.0], 0, false));
    ligar_parede(&mut c, 1, [0.0, 0.0], [0.0, -3.0], [0.0, 3.0], 0.2, true);
    let rs = resolve(&c);
    igual_pontos(&contorno(&rs, 1), &[[0.1, -0.06], [6.0, -0.06], [6.0, 0.06], [0.1, 0.06]]);
}

#[test]
fn dourado_de_planta_canto_de_cento_e_trinta_e_cinco_graus() {
    // Ângulo interno de 135° entre as direções que saem do nó: 1 vem de (-5,0); 2 sai para (-5·cos135, 5·sen135) = (3,5355, 3,5355).
    // Faixas de 0,12 centradas: os encontros ficam a 0,06/tan(67,5°) = 0,024853 m do nó; o canto de 60 mm pede 0,03, que domina.
    let c = cena_canto(135.0, 0.12, 0.12, 0, 0, false, true);
    let rs = resolve(&c);
    let (g1, g2) = (geom_de(&rs, 1), geom_de(&rs, 2));
    perto(g1.l, 5.0 - 0.03, 1e-9);
    perto(g2.l, 5.0 - 0.03, 1e-9);
    let poste = &g1.cantos[0].poligono;
    assert_eq!(poste.len(), 6);
    // Contorno da 1: a ponta fica em x = -0,03, a faixa de y = -0,06 a 0,06.
    igual_pontos(&contorno(&rs, 1), &[[-5.0, -0.06], [-0.03, -0.06], [-0.03, 0.06], [-5.0, 0.06]]);
    // Os seis vértices do preenchimento (relativos ao nó na origem): os dois encontros em ±0,024853 e os cantos dos cortes a 0,03 do nó.
    let esperado = [[0.063639610, -0.021213203], [0.024852814, -0.06], [-0.03, -0.06], [-0.03, 0.06], [-0.024852814, 0.06], [-0.021213203, 0.063639610]];
    for e in esperado {
        assert!(poste.iter().any(|p| (p[0] - e[0]).abs() < 1e-8 && (p[1] - e[1]).abs() < 1e-8), "falta {e:?} em {poste:?}");
    }
    confere_canto(&c, 135);
}

// ───────────── perfis L, trapézio e canto: nenhuma sobreposição em (s, z) ─────────────

/// Intervalos em x que a seção ocupa na profundidade `y` (um por triângulo que cruza a linha).
fn x_na_profundidade(m: &crate::cortina_pecas::Montante, y: f64) -> Vec<(f64, f64)> {
    let sec = secao(m, 2);
    let mut v: Vec<(f64, f64)> = Vec::new();
    for t in &sec.tris {
        let mut xs = Vec::new();
        for k in 0..3 {
            let (p, q) = (t[k], t[(k + 1) % 3]);
            if (p[1] - y) * (q[1] - y) < 0.0 {
                xs.push(p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]));
            }
        }
        if xs.len() == 2 {
            v.push((xs[0].min(xs[1]), xs[0].max(xs[1])));
        }
    }
    v
}

/// Extensão em `s` (ou em `z`) de um intervalo `[x0, x1]` do perfil, pela mesma convenção das matrizes: vertical `t = pos + σ·x`; horizontal `z = pos − σ·x`.
fn estende(pos: f64, sinal: f64, x0: f64, x1: f64) -> (f64, f64) {
    if sinal > 0.0 {
        (pos + x0, pos + x1)
    } else {
        (pos - x1, pos - x0)
    }
}

/// Retângulos `(s0, s1, z0, z1)` que as peças da cortina ocupam no plano (s, z) na profundidade `y`.
fn retangulos_em_y(g: &Geom, y: f64) -> Vec<(f64, f64, f64, f64)> {
    let mut out = Vec::new();
    let na_faixa = |m: &crate::cortina_pecas::Montante| y > m.desloc - m.prof() / 2.0 && y < m.desloc + m.prof() / 2.0;
    for p in g.pecas.iter().filter(|p| na_faixa(&p.m)) {
        for (x0, x1) in x_na_profundidade(&p.m, y) {
            if p.eixo == EIXO_U {
                let (a, b) = estende(p.pos, g.sigma, x0, x1);
                out.push((a, b, p.de, p.ate));
            } else {
                let (a, b) = estende(p.pos, -g.sigma, x0, x1);
                out.push((p.de, p.ate, a, b));
            }
        }
    }
    for p in g.pecas_esq.iter().filter(|p| na_faixa(&p.m)) {
        let (lo, hi) = (valor_em(&p.lo, y), valor_em(&p.hi, y));
        for (x0, x1) in x_na_profundidade(&p.m, y) {
            if p.eixo == EIXO_U {
                let (a, b) = estende(p.pos, g.sigma, x0, x1);
                out.push((a, b, lo, hi));
            } else {
                let (a, b) = estende(p.pos, -g.sigma, x0, x1);
                out.push((lo, hi, a, b));
            }
        }
    }
    out
}

#[test]
fn perfis_l_trapezio_e_canto_nunca_se_sobrepoem_no_plano_s_z() {
    // Teste por amostragem de y (a caixa envolvente dá falso positivo no trapézio e no L com degrau): em cada profundidade, os retângulos (s, z) das
    // peças não se sobrepõem. Todas as combinações de perfil para vertical e horizontal, as duas prioridades, normal e invertida.
    let perfis = [M_RET, M_L, M_TRAP, M_CANTO];
    let (mut conferidas, mut com_pecas) = (0, 0);
    for &mv in &perfis {
        for &mh in &perfis {
            for prioridade in [PRIORIDADE_VERTICAL, PRIORIDADE_HORIZONTAL] {
                for invertida in [false, true] {
                    let mut e = Espec::novo(EixoEfetivo::numero(3), EixoEfetivo::numero(3));
                    e.mont = [mv, mh, mv, mv, mh, mh];
                    e.prioridade = prioridade;
                    let mut c = cena_simples(&e, 3.0, 3.0);
                    c.cortina.cortinas.get_mut(&1).expect("c").invertida = invertida;
                    let rs = resolve(&c);
                    let g = geom_de(&rs, 1);
                    for k in 0..32 {
                        let y = -0.06 + 0.12 * (k as f64 + 0.37) / 32.0;
                        let rets = retangulos_em_y(g, y);
                        com_pecas += usize::from(rets.len() > 10);
                        for (a, ra) in rets.iter().enumerate() {
                            for rb in rets.iter().skip(a + 1) {
                                let (ox, oy) = (ra.1.min(rb.1) - ra.0.max(rb.0), ra.3.min(rb.3) - ra.2.max(rb.2));
                                assert!(ox < 1e-9 || oy < 1e-9, "vertical {mv}, horizontal {mh}, prioridade {prioridade}, invertida {invertida}, y {y}: {ra:?} x {rb:?}");
                            }
                        }
                        conferidas += 1;
                    }
                }
            }
        }
    }
    assert_eq!(conferidas, 4 * 4 * 2 * 2 * 32);
    assert!(com_pecas > conferidas * 2 / 3, "a amostragem de y precisa cair nas peças: {com_pecas} de {conferidas}");
}

#[test]
fn l_invertido_espelha_a_aba_junto_com_a_alma() {
    // Convenção do dono: a invertida gira o perfil 180° no próprio eixo, então a alma (em x) e a aba (em y) trocam de lado juntas. Em planta, o contorno
    // do L vertical invertido é o do normal refletido em torno do centro da linha.
    let monta = |invertida: bool| {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        e.mont = [M_L, M_R12, M_R12, M_R12, M_R12, M_R12];
        let mut c = cena_simples(&e, 2.0, 2.0);
        c.cortina.cortinas.get_mut(&1).expect("c").invertida = invertida;
        resolve(&c)
    };
    let perfil = |rs: &[CortinaR]| planta(rs, 1.0, 1).into_iter().find(|l| l.papel == PLANTA_MONTANTE && l.pontos.len() == 6).expect("L").pontos;
    let (pa, pb) = (perfil(&monta(false)), perfil(&monta(true)));
    // Linha interior da cortina em x = 1, y = 0: a reflexão em torno de (1, 0) leva (x, y) a (2 − x, −y).
    for q in &pb {
        assert!(pa.iter().any(|p| (2.0 - p[0] - q[0]).abs() < 1e-9 && (-p[1] - q[1]).abs() < 1e-9), "vértice {q:?} sem par refletido");
    }
}
