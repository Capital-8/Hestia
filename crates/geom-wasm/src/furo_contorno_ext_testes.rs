//! Testes por invariantes do retorno com base livre e recorte em planta (`furo_contorno_retorno_ext`) e do furo do prisma
//! com topo inclinado e política de envelope (`furo_contorno_prisma`), docs/estudo-esquadrias/33.

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE};
use crate::furo_contorno::{ErroFuro, Vao};
use crate::furo_contorno_prisma::*;
use crate::furo_contorno_quant::{retorno_do_vao, EntradaRetorno, ErroQuant, ModoRetorno, Retorno};
use crate::furo_contorno_quant_abi::EntradaRetornoAbi;
use crate::furo_contorno_retorno_ext::*;
use std::f64::consts::PI;

const T: f64 = 0.02;

fn retangulo(w: f64, h: f64) -> Vec<[f64; 2]> {
    vec![[w / 2.0, 0.0], [w / 2.0, h], [-w / 2.0, h], [-w / 2.0, 0.0]]
}

fn meia_lua(w: f64, h: f64, n: usize) -> Vec<[f64; 2]> {
    let r = w / 2.0;
    let nasc = h - r;
    let mut p = vec![[r, 0.0]];
    for i in 0..=n {
        let a = PI * i as f64 / n as f64;
        p.push([r * a.cos(), nasc + r * a.sin()]);
    }
    p.push([-r, 0.0]);
    p
}

/// Arco abatido: base reta em z = 0, ombreiras verticais até `nasc`, arco de corda `w` e flecha `f`.
fn arco_abatido(w: f64, nasc: f64, f: f64, n: usize) -> Vec<[f64; 2]> {
    let r = (w * w / 4.0 + f * f) / (2.0 * f);
    let cz = nasc + f - r;
    let mut p = vec![[w / 2.0, 0.0], [w / 2.0, nasc]];
    let a0 = ((w / 2.0) / r).asin();
    for i in 1..n {
        let a = a0 - 2.0 * a0 * i as f64 / n as f64;
        p.push([r * a.sin(), cz + r * a.cos()]);
    }
    p.push([-w / 2.0, nasc]);
    p.push([-w / 2.0, 0.0]);
    p
}

fn entrada(modo: ModoRetorno) -> EntradaRetorno {
    EntradaRetorno { espessura_pedida: T, espessura_acabamento: T, y0: -0.1, y1: 0.1, modo }
}

fn quase(a: f64, b: f64, tol: f64, r: &str) {
    assert!((a - b).abs() <= tol, "{r}: obtido {a}, esperado {b} (tol {tol})");
}

/// Volume pela divergência da malha (igual ao do kernel) e malha fechada.
fn checar_fechada(r: &Retorno) {
    use std::collections::HashMap;
    let mut arestas: HashMap<(u32, u32), u32> = HashMap::new();
    for t in r.indices.chunks(3) {
        for k in 0..3 {
            *arestas.entry((t[k], t[(k + 1) % 3])).or_default() += 1;
        }
    }
    for (&(a, b), &n) in &arestas {
        assert_eq!(n, 1);
        assert_eq!(arestas.get(&(b, a)), Some(&1), "malha aberta");
    }
    let p = |i: u32| &r.vertices[i as usize * 3..i as usize * 3 + 3];
    let mut v6 = 0.0;
    for t in r.indices.chunks(3) {
        let (a, b, d) = (p(t[0]), p(t[1]), p(t[2]));
        v6 += a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    }
    quase(v6 / 6.0, r.volume, 1e-9, "volume da malha do retorno");
}

fn vao(c: Vec<[f64; 2]>, x: f64, soleira: f64) -> Vao {
    Vao { contorno: c, x, soleira }
}

// --- base livre -----------------------------------------------------------------------------------------

#[test]
fn base_livre_retangulo_so_ombreiras_e_verga() {
    let (w, h, d) = (0.9, 2.1, 0.2);
    let v = vao(retangulo(w, h), 3.0, 0.0);
    let cheio = retorno_do_vao(&v, &entrada(ModoRetorno::Contorno)).unwrap();
    let livre = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, true, &[]).unwrap();
    // Sem soleira: o anel perde exatamente a faixa da base (W - 2t) x t.
    quase(livre.area_anel, cheio.area_anel - T * (w - 2.0 * T), 1e-9, "anel sem a soleira");
    quase(livre.area_anel, 2.0 * T * h + T * (w - 2.0 * T), 1e-9, "ombreiras de altura total + verga");
    quase(livre.volume, livre.area_anel * d, 1e-9, "volume");
    // As ombreiras são as do retângulo atual: 2 t H D (o `Ombreiras` do quantitativo dá a mesma conta).
    let omb = retorno_do_vao(&v, &entrada(ModoRetorno::Ombreiras)).unwrap();
    quase(omb.volume, 2.0 * T * h * d, 1e-9, "ombreiras do retângulo");
    quase(livre.volume - omb.volume, T * (w - 2.0 * T) * d, 1e-9, "base livre = ombreiras + verga");
    checar_fechada(&livre);
    // Nenhum vértice abaixo do piso nem dentro do vão livre.
    for p in livre.vertices.chunks(3) {
        assert!(p[2] >= -1e-9, "vértice abaixo do piso: {}", p[2]);
        let (dx, dz) = (p[0] - 3.0, p[2]);
        assert!(!(dx.abs() < w / 2.0 - T - 1e-9 && dz > 1e-9 && dz < h - T - 1e-9), "vértice no vão livre");
    }
    quase(livre.area_livre, (w - 2.0 * T) * (h - T), 1e-9, "área livre: sem a soleira, o vão livre chega ao piso");
    // Área exposta: faces internas das duas ombreiras e a da verga, vezes a profundidade.
    quase(livre.area_exposta, (2.0 * (h - T) + (w - 2.0 * T)) * d, 1e-6, "área exposta");
}

#[test]
fn base_livre_com_recuo_ombreiras_chegam_ao_piso() {
    let (w, h, r) = (0.9, 2.1, 0.015);
    let v = vao(retangulo(w, h), 0.0, 0.0);
    let l = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), r, true, &[]).unwrap();
    // a = contorno recuado r (sem a base: o recuo não levanta as ombreiras), miolo = a recuado t, tudo acima do piso.
    let esperado = (w - 2.0 * r) * (h - r) - (w - 2.0 * r - 2.0 * T) * (h - r - T);
    quase(l.area_anel, esperado, 1e-9, "anel com recuo");
    let zmin = l.vertices.chunks(3).map(|p| p[2]).fold(f64::MAX, f64::min);
    quase(zmin, 0.0, 1e-9, "ombreira até o piso");
    // Sem base livre, o mesmo recuo levanta a base em r (e o anel ganha a soleira).
    let com = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), r, false, &[]).unwrap();
    let zmin_com = com.vertices.chunks(3).map(|p| p[2]).fold(f64::MAX, f64::min);
    quase(zmin_com, r, 1e-9, "sem base livre o recuo levanta a base");
    assert!(com.area_anel > l.area_anel);
}

#[test]
fn base_livre_arco_abatido_perde_so_a_soleira() {
    let c = arco_abatido(1.4, 2.1, 0.3, 96);
    let v = vao(c, 2.0, 0.0);
    let cheio = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, false, &[]).unwrap();
    let livre = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, true, &[]).unwrap();
    // A soleira que o doc 27 apontou: sem base livre o retorno reveste a soleira da porta em arco abatido.
    quase(cheio.area_anel - livre.area_anel, T * (1.4 - 2.0 * T), 1e-6, "faixa da soleira");
    let anterior = retorno_do_vao(&v, &entrada(ModoRetorno::Contorno)).unwrap();
    quase(cheio.area_anel, anterior.area_anel, 1e-9, "sem base livre e sem recuo é o retorno de sempre");
    checar_fechada(&livre);
    // Nenhum triângulo da base do vão (z = 0, no meio) no anel.
    let tem_base = livre.vertices.chunks(3).any(|p| p[2] < 1e-9 && (p[0] - 2.0).abs() < 0.3);
    assert!(!tem_base, "o miolo da base não pode ter retorno");
}

#[test]
fn base_livre_circulo_sem_aresta_de_base_nao_muda() {
    // Base em um ponto: não há o que prolongar; o resultado é o do modo contorno.
    let n = 64;
    let c: Vec<[f64; 2]> = (0..n).map(|i| [0.5 * (2.0 * PI * i as f64 / n as f64).cos(), 0.5 + 0.5 * (2.0 * PI * i as f64 / n as f64).sin()]).collect();
    let v = vao(c, 0.0, 0.0);
    let a = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, true, &[]).unwrap();
    let b = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, false, &[]).unwrap();
    quase(a.area_anel, b.area_anel, 1e-9, "círculo");
}

// --- recorte em planta (retorno em canto) ------------------------------------------------------------------

fn plano(u0: f64, s0: f64, u1: f64, s1: f64) -> PoligonoPlanta {
    vec![vec![[u0, s0], [u1, s0], [u1, s1], [u0, s1]]]
}

#[test]
fn recorte_em_planta_tira_a_parte_que_invade_a_vizinha() {
    let (w, h, d) = (0.9, 2.1, 0.2);
    let v = vao(retangulo(w, h), 3.0, 0.0);
    let inteiro = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, false, &[]).unwrap();
    // A vizinha começa 1 cm para dentro da ombreira esquerda (u = 3 - 0.45 + 0.01 .. ): o que está antes sai.
    let u_corte = 3.0 - w / 2.0 + 0.01;
    let cortado = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, false, &[plano(u_corte, -5.0, 10.0, 5.0)]).unwrap();
    quase(cortado.volume, inteiro.volume - 0.01 * h * d, 1e-9, "volume = inteiro menos 1 cm de ombreira");
    // As áreas do anel no plano x-z não consideram o recorte.
    quase(cortado.area_anel, inteiro.area_anel, 1e-12, "area_anel é a do anel inteiro");
    assert!(cortado.vertices.chunks(3).all(|p| p[0] >= u_corte - 1e-9), "nenhum vértice antes do corte");
    checar_fechada(&cortado);
    // Corte em s (a vizinha ocupa y > 0.05): só a metade da profundidade fica.
    let meio = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, false, &[plano(-10.0, -5.0, 10.0, 0.0)]).unwrap();
    quase(meio.volume, inteiro.volume / 2.0, 1e-9, "metade da profundidade");
    // Recorte que cobre tudo: igual ao inteiro.
    let tudo = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, false, &[plano(-10.0, -5.0, 10.0, 5.0)]).unwrap();
    quase(tudo.volume, inteiro.volume, 1e-9, "recorte que cobre tudo");
}

#[test]
fn recorte_em_esquadria_diagonal_confere_com_a_area_do_corte() {
    // Pegada: s <= u - 2.55 + 0.45 ... diagonal a 45 graus cruzando a ombreira esquerda (u de 2.55 a 2.57).
    let v = vao(retangulo(0.9, 2.1), 3.0, 0.0);
    let (y0, y1) = (-0.1, 0.1);
    let e = EntradaRetorno { espessura_pedida: T, espessura_acabamento: T, y0, y1, modo: ModoRetorno::Contorno };
    let inteiro = retorno_do_vao_ext(&v, &e, 0.0, false, &[]).unwrap();
    // Polígono: tudo à direita da reta u = 2.56 + (s + 0.1) (diagonal), isto é u - s >= 2.66.
    let poli: PoligonoPlanta = vec![vec![[2.66 - 5.0, -5.0], [10.0, -5.0], [10.0, 5.0], [2.66 + 5.0, 5.0]]];
    let c = retorno_do_vao_ext(&v, &e, 0.0, false, &[poli]).unwrap();
    // Cálculo independente, em planta x altura. Ombreira esquerda (u de 2.55 a 2.57, altura 2.1): sobra o triângulo
    // {u - s >= 2.66} de catetos 0.01 (em s = -0.1, u de 2.56 a 2.57): área 0.5 x 0.01 x 0.01.
    let perda_ombreira = (0.2 * 0.02 - 0.5 * 0.01 * 0.01) * 2.1;
    // Verga e soleira (altura t cada uma, u de 2.57 a 3.43): perdem {u < 2.66 + s}, ou seja, para s de -0.09 a 0.1,
    // a largura 0.09 + s: integral = 0.5 x 0.19^2. A ombreira direita (u >= 3.43) fica inteira.
    let perda_tiras = 2.0 * T * 0.5 * 0.19 * 0.19;
    quase(c.volume, inteiro.volume - perda_ombreira - perda_tiras, 1e-9, "volume com a diagonal");
    checar_fechada(&c);
}

#[test]
fn recorte_que_remove_tudo_da_volume_zero_sem_panic() {
    let v = vao(retangulo(0.9, 2.1), 3.0, 0.0);
    let r = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, false, &[plano(100.0, 100.0, 101.0, 101.0)]).unwrap();
    quase(r.volume, 0.0, 1e-12, "tudo cortado");
    assert!(r.indices.is_empty());
}

// --- entradas inválidas (sem panic) ------------------------------------------------------------------------------

fn abi<'a>(pontos: &'a [f64], modo: u32, recuo: f64) -> EntradaRetornoAbi<'a> {
    EntradaRetornoAbi { pontos, x: 1.0, soleira: 0.0, espessura: T, espessura_acabamento: T, recuo, y0: -0.1, y1: 0.1, modo }
}

fn contorno_plano() -> Vec<f64> {
    retangulo(0.9, 2.1).iter().flat_map(|p| [p[0], p[1]]).collect()
}

fn roda(e: EntradaRetornoExtAbi) -> Result<Vec<Saida>, (u32, String)> {
    retorno_ext_planos(&e)
}

#[test]
fn abi_do_retorno_ext_valida_sem_panic() {
    let c = contorno_plano();
    fn vazio(b: EntradaRetornoAbi<'_>) -> EntradaRetornoExtAbi<'_> {
        EntradaRetornoExtAbi { base: b, pontos: &[], aneis: &[0], poligonos: &[0] }
    }
    // Caminho feliz, sem recorte, os três modos.
    for m in 0..3 {
        let s = roda(vazio(abi(&c, m, 0.0))).unwrap();
        assert_eq!(s.len(), 3);
    }
    assert_eq!(roda(vazio(abi(&c, 3, 0.0))).unwrap_err().0, ENTRADA, "modo inválido");
    assert_eq!(roda(vazio(abi(&c, 2, -0.01))).unwrap_err().0, ENTRADA, "recuo negativo");
    assert_eq!(roda(vazio(abi(&c, 2, f64::NAN))).unwrap_err().0, ENTRADA, "recuo NaN");
    assert_eq!(roda(vazio(abi(&c, 2, 1e9))).unwrap_err().0, ENTRADA, "recuo absurdo");
    let mut b = abi(&c, 2, 0.0);
    b.espessura = 0.0;
    assert_eq!(roda(vazio(b)).unwrap_err().0, ENTRADA, "espessura 0");
    let mut b = abi(&c, 2, 0.0);
    b.y1 = b.y0;
    assert_eq!(roda(vazio(b)).unwrap_err().0, ENTRADA, "profundidade nula");
    // Recuo que consome o contorno: ENTRADA (retorno não cabe), nunca panic.
    assert_eq!(roda(vazio(abi(&c, 2, 5.0))).unwrap_err().0, ENTRADA);
    // Buffers de recorte incoerentes.
    let pts = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
    let ruim = EntradaRetornoExtAbi { base: abi(&c, 0, 0.0), pontos: &pts, aneis: &[0, 3], poligonos: &[0, 1] };
    assert_eq!(roda(ruim).unwrap_err().0, ENTRADA, "offsets que não fecham no total");
    let sem_offsets = EntradaRetornoExtAbi { base: abi(&c, 0, 0.0), pontos: &pts, aneis: &[], poligonos: &[0] };
    assert_eq!(roda(sem_offsets).unwrap_err().0, ENTRADA);
    let impar = EntradaRetornoExtAbi { base: abi(&c, 0, 0.0), pontos: &pts[..7], aneis: &[0, 3], poligonos: &[0, 1] };
    assert_eq!(roda(impar).unwrap_err().0, ENTRADA);
    // Recorte com anel auto-intersectado ("gravata") ou degenerado.
    let gravata = [0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0];
    let g = EntradaRetornoExtAbi { base: abi(&c, 0, 0.0), pontos: &gravata, aneis: &[0, 4], poligonos: &[0, 1] };
    assert_eq!(roda(g).unwrap_err().0, ENTRADA, "recorte auto-intersectado");
    let nan = [0.0, 0.0, f64::NAN, 0.0, 1.0, 1.0];
    let n = EntradaRetornoExtAbi { base: abi(&c, 0, 0.0), pontos: &nan, aneis: &[0, 3], poligonos: &[0, 1] };
    assert_eq!(roda(n).unwrap_err().0, ENTRADA, "recorte com NaN");
    // Limite por anel.
    let grande: Vec<f64> = (0..4097).flat_map(|i| { let a = 2.0 * PI * i as f64 / 4097.0; [a.cos(), a.sin()] }).collect();
    let l = EntradaRetornoExtAbi { base: abi(&c, 0, 0.0), pontos: &grande, aneis: &[0, 4097], poligonos: &[0, 1] };
    assert_eq!(roda(l).unwrap_err().0, LIMITE);
    // Contorno inválido (horário).
    let cw: Vec<f64> = retangulo(0.9, 2.1).iter().rev().flat_map(|p| [p[0], p[1]]).collect();
    assert_eq!(roda(vazio(abi(&cw, 0, 0.0))).unwrap_err().0, ENTRADA);
}

#[test]
fn abi_do_retorno_ext_com_recorte_confere_com_a_funcao() {
    let c = contorno_plano();
    let pts = [2.56, -5.0, 10.0, -5.0, 10.0, 5.0, 2.56, 5.0];
    let e = EntradaRetornoExtAbi { base: abi(&c, 2, 0.0), pontos: &pts, aneis: &[0, 4], poligonos: &[0, 1] };
    let s = roda(e).unwrap();
    let Saida::F64(meta) = &s[0] else { panic!() };
    let v = vao(retangulo(0.9, 2.1), 1.0, 0.0);
    let direto = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, true, &[vec![vec![[2.56, -5.0], [10.0, -5.0], [10.0, 5.0], [2.56, 5.0]]]]).unwrap();
    quase(meta[6], direto.volume, 1e-12, "volume pela ABI");
    // x = 1: a peça está em u de 0.55 a 1.45, inteira antes de 2.56: o recorte a remove toda.
    quase(meta[6], 0.0, 1e-12, "recorte fora da peça");
}

// --- prisma: topo inclinado e política de envelope ---------------------------------------------------------------

fn camada_ret(l: f64, e: f64, z0: f64, z1: f64) -> CamadaPrisma {
    CamadaPrisma { poligonos: vec![vec![vec![[0.0, 0.0], [l, 0.0], [l, e], [0.0, e]]]], z0, z1 }
}

/// Cortes do contorno [x, z] (absoluto) na vertical u: pares [lo, hi] em z.
fn intervalos(c: &[[f64; 2]], u: f64) -> Vec<[f64; 2]> {
    let mut z: Vec<f64> = Vec::new();
    for i in 0..c.len() {
        let (p, q) = (c[i], c[(i + 1) % c.len()]);
        if (p[0] <= u) != (q[0] <= u) {
            z.push(p[1] + (u - p[0]) * (q[1] - p[1]) / (q[0] - p[0]));
        }
    }
    z.sort_by(|a, b| a.partial_cmp(b).unwrap());
    z.chunks(2).filter(|p| p.len() == 2).map(|p| [p[0], p[1]]).collect()
}

/// Removido esperado = espessura x integral de (comprimento em z do contorno abaixo do topo e acima de z0).
fn removido_com_topo(c: &[[f64; 2]], x: f64, soleira: f64, e: f64, z0: f64, topo: impl Fn(f64) -> f64, l: f64) -> f64 {
    let abs: Vec<[f64; 2]> = c.iter().map(|p| [x + p[0], soleira + p[1]]).collect();
    let n = 200_000;
    let h = l / n as f64;
    (0..n)
        .map(|i| {
            let u = (i as f64 + 0.5) * h;
            intervalos(&abs, u).iter().map(|[lo, hi]| (hi.min(topo(u)) - lo.max(z0)).max(0.0)).sum::<f64>()
        })
        .sum::<f64>()
        * h
        * e
}

#[test]
fn topo_inclinado_volume_bruto_e_removido_por_integracao() {
    let (l, e, z0) = (4.0, 0.2, 0.0);
    let topo = TopoInclinado { t0: 0.0, t1: l, h0: 2.0, h1: 3.0 };
    let camada = camada_ret(l, e, z0, 3.0);
    let f = |u: f64| 2.0 + u / l;
    let v = Vao { contorno: meia_lua(1.2, 1.5, 96), x: 2.0, soleira: 0.9 };
    let r = furar_prisma_gen(std::slice::from_ref(&camada), &[Some(topo)], std::slice::from_ref(&v), ForaDoEnvelope::Recusar).unwrap();
    let m = &r.camadas[0];
    quase(m.volume_sem_furo, l * e * 2.5, 1e-9, "bruto = comprimento x espessura x altura média");
    let esperado = removido_com_topo(&v.contorno, 2.0, 0.9, e, z0, f, l);
    quase(m.volume_sem_furo - m.volume, esperado, 1e-6, "removido por integração (topo inclinado)");
    quase(r.volume_removido, m.volume_sem_furo - m.volume, 1e-12, "total");
    // Vértices nunca acima do plano do topo.
    for p in m.vertices.chunks(3) {
        assert!(p[2] <= f(p[0]) + 1e-9, "vértice {:?} acima do topo", p);
        assert!(p[2] >= z0 - 1e-9);
    }
}

#[test]
fn topo_inclinado_vao_que_o_topo_corta_remove_so_o_que_existe() {
    // O arco passa do topo: o furo (lenient) remove só o que está abaixo do plano.
    let (l, e) = (4.0, 0.2);
    let topo = TopoInclinado { t0: 0.0, t1: l, h0: 1.5, h1: 2.5 };
    let camada = camada_ret(l, e, 0.0, 2.5);
    let v = Vao { contorno: meia_lua(1.2, 2.4, 96), x: 1.0, soleira: 0.0 };
    let f = |u: f64| 1.5 + u / l;
    let r = furar_prisma_gen(std::slice::from_ref(&camada), &[Some(topo)], std::slice::from_ref(&v), ForaDoEnvelope::Recortar).unwrap();
    let esperado = removido_com_topo(&v.contorno, 1.0, 0.0, e, 0.0, f, l);
    quase(r.camadas[0].volume_sem_furo - r.camadas[0].volume, esperado, 1e-6, "removido abaixo do topo");
    // Com a política de recusa o mesmo vão sai do envelope em z (o topo mais alto é 2.5 < 2.4 + 0? não: cabe), usa outro.
    let alto = Vao { contorno: meia_lua(1.2, 2.9, 96), x: 1.0, soleira: 0.0 };
    let e1 = furar_prisma_gen(std::slice::from_ref(&camada), &[Some(topo)], std::slice::from_ref(&alto), ForaDoEnvelope::Recusar).unwrap_err();
    assert_eq!(e1, ErroPrisma::Vao(ErroFuro::VaoForaDaParede(0)));
    let ok = furar_prisma_gen(std::slice::from_ref(&camada), &[Some(topo)], std::slice::from_ref(&alto), ForaDoEnvelope::Recortar).unwrap();
    let esp = removido_com_topo(&alto.contorno, 1.0, 0.0, e, 0.0, f, l);
    quase(ok.camadas[0].volume_sem_furo - ok.camadas[0].volume, esp, 1e-6, "vão alto recortado pelo topo");
}

#[test]
fn topo_inclinado_sem_topo_e_igual_a_furar_prisma_e_planta_esquadrejada() {
    let camada = camada_ret(4.0, 0.2, 0.0, 3.0);
    let v = Vao { contorno: meia_lua(1.2, 1.5, 64), x: 2.0, soleira: 0.5 };
    let a = furar_prisma(std::slice::from_ref(&camada), std::slice::from_ref(&v)).unwrap();
    let b = furar_prisma_gen(std::slice::from_ref(&camada), &[None], std::slice::from_ref(&v), ForaDoEnvelope::Recusar).unwrap();
    assert_eq!(a.camadas[0].volume, b.camadas[0].volume);
    // Topo plano (h0 = h1 = z1): mesma resposta do prisma sem topo.
    let plano = TopoInclinado { t0: 0.0, t1: 4.0, h0: 3.0, h1: 3.0 };
    let c = furar_prisma_gen(std::slice::from_ref(&camada), &[Some(plano)], std::slice::from_ref(&v), ForaDoEnvelope::Recusar).unwrap();
    quase(c.camadas[0].volume, a.camadas[0].volume, 1e-9, "topo plano");
    quase(c.camadas[0].volume_sem_furo, a.camadas[0].volume_sem_furo, 1e-9, "bruto, topo plano");
}

#[test]
fn topo_inclinado_validacao() {
    let camada = camada_ret(4.0, 0.2, 0.0, 3.0);
    let v = Vao { contorno: meia_lua(1.2, 1.5, 32), x: 2.0, soleira: 0.5 };
    let casos = [
        TopoInclinado { t0: 0.0, t1: 4.0, h0: f64::NAN, h1: 3.0 },
        TopoInclinado { t0: 0.0, t1: 4.0, h0: 3.0, h1: 3.5 }, // acima de z1
        TopoInclinado { t0: 0.0, t1: 4.0, h0: -0.5, h1: 3.0 }, // abaixo de z0
        TopoInclinado { t0: 0.0, t1: 4.0, h0: 0.0, h1: 0.0 }, // altura nula
        TopoInclinado { t0: 4.0, t1: 4.0, h0: 3.0, h1: 3.0 }, // t1 = t0
    ];
    for t in casos {
        let r = furar_prisma_gen(std::slice::from_ref(&camada), &[Some(t)], std::slice::from_ref(&v), ForaDoEnvelope::Recortar);
        assert!(matches!(r, Err(ErroPrisma::AlturaInvalida(0))), "{t:?}: {r:?}");
    }
    // Tamanho de `topos` incoerente.
    let r = furar_prisma_gen(std::slice::from_ref(&camada), &[None, None], std::slice::from_ref(&v), ForaDoEnvelope::Recusar);
    assert!(matches!(r, Err(ErroPrisma::AlturaInvalida(_))));
}

#[test]
fn politica_recortar_vao_que_sai_da_ponta_remove_so_a_parte_que_cabe() {
    // Parede de 0 a 4; o vão (1,2 m) com origem em u = 3.7 passa da ponta (4.0) em 0.3 m.
    let camada = camada_ret(4.0, 0.2, 0.0, 3.0);
    let v = Vao { contorno: retangulo(1.2, 2.0), x: 3.7, soleira: 0.0 };
    assert_eq!(furar_prisma(std::slice::from_ref(&camada), std::slice::from_ref(&v)).unwrap_err(), ErroPrisma::Vao(ErroFuro::VaoForaDaParede(0)));
    let r = furar_prisma_gen(std::slice::from_ref(&camada), &[], std::slice::from_ref(&v), ForaDoEnvelope::Recortar).unwrap();
    // Cabe de u = 3.1 a 4.0 (0.9 m) x 2.0 m x 0.2 m.
    quase(r.volume_removido, 0.9 * 2.0 * 0.2, 1e-9, "removido = parte que cabe");
    // Vão inteiramente fora: não remove nada e não dá erro.
    let fora = Vao { contorno: retangulo(1.2, 2.0), x: 10.0, soleira: 0.0 };
    let r = furar_prisma_gen(std::slice::from_ref(&camada), &[], std::slice::from_ref(&fora), ForaDoEnvelope::Recortar).unwrap();
    quase(r.volume_removido, 0.0, 1e-12, "vão fora não remove");
    // Contorno inválido continua recusado nos dois modos.
    let ruim = Vao { contorno: retangulo(1.2, 2.0).into_iter().rev().collect(), x: 1.0, soleira: 0.0 };
    assert!(furar_prisma_gen(std::slice::from_ref(&camada), &[], std::slice::from_ref(&ruim), ForaDoEnvelope::Recortar).is_err());
}

#[test]
fn abi_do_prisma_ext_topo_e_politica() {
    use crate::furo_contorno_prisma::EntradasPrisma;
    let pts = [0.0, 0.0, 4.0, 0.0, 4.0, 0.2, 0.0, 0.2];
    let vp: Vec<f64> = retangulo(1.2, 3.5).iter().flat_map(|p| [p[0], p[1]]).collect();
    let e = EntradasPrisma { pontos_planta: &pts, aneis: &[0, 4], poligonos: &[0, 1], camadas: &[0, 1], z: &[0.0, 3.0], pontos: &vp, vaos: &[0, 4], x: &[2.0], soleira: &[0.0] };
    // Sem topo e recusando: o vão passa do topo (3.5 > 3.0).
    assert_eq!(furar_prisma_planos(&e).unwrap_err().0, ENTRADA);
    // Recortando: aceito.
    assert!(furar_prisma_planos_gen(&e, &[], ForaDoEnvelope::Recortar).is_ok());
    // Topo com tamanho errado e topo inválido: ENTRADA.
    assert_eq!(furar_prisma_planos_gen(&e, &[0.0, 4.0, 2.0], ForaDoEnvelope::Recortar).unwrap_err().0, ENTRADA);
    assert_eq!(furar_prisma_planos_gen(&e, &[0.0, 4.0, 2.0, 9.0], ForaDoEnvelope::Recortar).unwrap_err().0, ENTRADA);
    // Topo válido: volume sem furo = 4 x 0.2 x 2.5.
    let s = furar_prisma_planos_gen(&e, &[0.0, 4.0, 2.0, 3.0], ForaDoEnvelope::Recortar).unwrap();
    let Saida::F64(meta) = &s[0] else { panic!() };
    quase(meta[3], 4.0 * 0.2 * 2.5, 1e-9, "volume sem furo com topo");
    // `t1 <= t0` (tudo zero) = sem topo inclinado.
    let s = furar_prisma_planos_gen(&e, &[0.0, 0.0, 0.0, 0.0], ForaDoEnvelope::Recortar).unwrap();
    let Saida::F64(meta) = &s[0] else { panic!() };
    quase(meta[3], 4.0 * 0.2 * 3.0, 1e-9, "sem topo");
}

#[test]
fn erro_quant_do_retorno_ext_nao_cabe() {
    let v = vao(retangulo(0.03, 2.1), 0.0, 0.0);
    let r = retorno_do_vao_ext(&v, &entrada(ModoRetorno::Contorno), 0.0, true, &[]);
    assert_eq!(r.unwrap_err(), ErroQuant::RetornoNaoCabe);
}
