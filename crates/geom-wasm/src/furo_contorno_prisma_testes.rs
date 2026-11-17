//! Testes por invariantes de `furo_contorno_prisma` (furo sobre o prisma em planta da camada).
//!
//! O volume removido esperado é calculado de forma independente da booleana: a interseção entre o prisma
//! (planta x z0..z1) e o cortador (contorno x s) vale `integral de T(u) * W(u) du`, onde `T(u)` é o
//! comprimento em s da planta na posição u e `W(u)` o comprimento em z do contorno na posição u
//! (cruzamentos par-ímpar com a reta vertical, sem usar o kernel).

use crate::furo_contorno::{furar_parede, Vao};
use crate::furo_contorno_abi::Estado;
use crate::furo_contorno_prisma::*;
use crate::a3::furos_de;
use crate::perfil_quant::volume_faixa;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE};
use std::collections::HashMap;
use std::f64::consts::PI;

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

fn retangulo_vao(w: f64, h: f64) -> Vec<[f64; 2]> {
    vec![[-w / 2.0, 0.0], [w / 2.0, 0.0], [w / 2.0, h], [-w / 2.0, h]]
}

fn ret(u0: f64, s0: f64, u1: f64, s1: f64) -> Vec<[f64; 2]> {
    vec![[u0, s0], [u1, s0], [u1, s1], [u0, s1]]
}

fn camada(aneis: Vec<Vec<[f64; 2]>>, z0: f64, z1: f64) -> CamadaPrisma {
    CamadaPrisma { poligonos: vec![aneis], z0, z1 }
}

/// Comprimento (na 2ª coordenada) do conjunto de anéis na reta `1ª coordenada = u` (par-ímpar).
fn corda(aneis: &[Vec<[f64; 2]>], u: f64) -> f64 {
    let mut c: Vec<f64> = Vec::new();
    for a in aneis {
        for i in 0..a.len() {
            let (p, q) = (a[i], a[(i + 1) % a.len()]);
            if (p[0] <= u) != (q[0] <= u) {
                c.push(p[1] + (u - p[0]) * (q[1] - p[1]) / (q[0] - p[0]));
            }
        }
    }
    c.sort_by(|a, b| a.partial_cmp(b).unwrap());
    c.chunks(2).filter(|p| p.len() == 2).map(|p| p[1] - p[0]).sum()
}

/// Volume da interseção prisma x cortador, por integração em u (ponto médio).
fn removido_por_integracao(planta: &[Vec<[f64; 2]>], v: &Vao) -> f64 {
    let contorno: Vec<[f64; 2]> = v.contorno.iter().map(|p| [v.x + p[0], p[1]]).collect();
    let (a, b) = contorno.iter().fold((f64::MAX, f64::MIN), |(a, b), p| (a.min(p[0]), b.max(p[0])));
    let n = 200_000;
    let h = (b - a) / n as f64;
    (0..n).map(|i| a + (i as f64 + 0.5) * h).map(|u| corda(planta, u) * corda(std::slice::from_ref(&contorno), u)).sum::<f64>() * h
}

/// Malha fechada (cada aresta orientada tem a oposta uma vez) e volume pela divergência = volume do kernel.
/// Devolve o gênero (1 componente).
fn checar_fechada(c: &MalhaPrisma) -> i64 {
    assert_eq!(c.indices.len() % 3, 0);
    let nv = c.vertices.len() / 3;
    let mut arestas: HashMap<(u32, u32), u32> = HashMap::new();
    for t in c.indices.chunks(3) {
        assert!(t.iter().all(|&i| (i as usize) < nv));
        assert!(t[0] != t[1] && t[1] != t[2] && t[0] != t[2]);
        for k in 0..3 {
            *arestas.entry((t[k], t[(k + 1) % 3])).or_default() += 1;
        }
    }
    for (&(a, b), &n) in &arestas {
        assert_eq!(n, 1, "aresta orientada repetida");
        assert_eq!(arestas.get(&(b, a)), Some(&1), "malha aberta");
    }
    let p = |i: u32| &c.vertices[i as usize * 3..i as usize * 3 + 3];
    let mut v6 = 0.0;
    for t in c.indices.chunks(3) {
        let (a, b, d) = (p(t[0]), p(t[1]), p(t[2]));
        v6 += a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    }
    assert!((v6 / 6.0 - c.volume).abs() < 1e-9, "volume da malha {} x kernel {}", v6 / 6.0, c.volume);
    let chi = nv as i64 - (c.indices.len() as i64 / 2) + (c.indices.len() as i64 / 3);
    1 - chi / 2
}

fn quase(a: f64, b: f64, tol_rel: f64, msg: &str) {
    assert!((a - b).abs() <= tol_rel * b.abs().max(1e-12), "{msg}: {a} x {b}");
}

// (1) Camada retangular simples = `furar_parede`.
#[test]
fn prisma_retangular_igual_a_furar_parede() {
    let esp = [0.015, 0.02, 0.09, 0.02, 0.015];
    let (l, h) = (3.0, 2.8);
    let vaos = [
        Vao { contorno: meia_lua(0.9, 1.4, 32), x: 1.0, soleira: 0.0 },
        Vao { contorno: retangulo_vao(0.6, 0.8), x: 2.2, soleira: 0.9 },
    ];
    let ref_ = furar_parede(&vaos, &esp, l, h).unwrap();
    let mut y = 0.0;
    let camadas: Vec<CamadaPrisma> = esp
        .iter()
        .map(|&e| {
            let c = camada(vec![ret(0.0, y, l, y + e)], 0.0, h);
            y += e;
            c
        })
        .collect();
    let r = furar_prisma(&camadas, &vaos).unwrap();
    assert_eq!(r.camadas.len(), 5);
    for (a, b) in r.camadas.iter().zip(&ref_.camadas) {
        quase(a.volume, b.volume, 1e-10, "volume da camada");
        quase(a.volume_sem_furo, b.volume_sem_furo, 1e-12, "volume sem furo");
        assert_eq!(checar_fechada(a), 1, "meia-lua 'ilha' + janela: genus 1 pela janela fechada");
    }
    quase(r.volume, ref_.volume, 1e-10, "total");
    quase(r.volume_removido, ref_.volume_removido, 1e-9, "removido");
}

// (2) Trapézio (esquadria nas duas pontas), vão no trecho de espessura constante.
#[test]
fn prisma_esquadria_vao_no_trecho_de_espessura_constante() {
    let (l, e, d) = (3.0, 0.3, 0.3);
    let trap = vec![[0.0, 0.0], [l, 0.0], [l - d, e], [d, e]];
    let v = Vao { contorno: meia_lua(0.9, 1.4, 64), x: 1.5, soleira: 0.0 };
    let r = furar_prisma(&[camada(vec![trap.clone()], 0.0, 2.8)], std::slice::from_ref(&v)).unwrap();
    let c = &r.camadas[0];
    let area_trap = (l + (l - 2.0 * d)) / 2.0 * e;
    quase(c.volume_sem_furo, area_trap * 2.8, 1e-12, "volume sem furo");
    // Removido = área do contorno x espessura na posição do vão (e), conferido pela fórmula analítica da meia-lua.
    let area_poli = crate::furo_contorno::area_com_sinal(&v.contorno);
    quase(c.volume_sem_furo - c.volume, area_poli * e, 1e-9, "área do polígono x e");
    let r_ = 0.45;
    let exato = (0.9 * (1.4 - r_) + PI * r_ * r_ / 2.0) * e;
    quase(c.volume_sem_furo - c.volume, exato, 1e-3, "área analítica x e");
    quase(c.volume_sem_furo - c.volume, removido_por_integracao(&[trap], &v), 1e-6, "integração");
    assert_eq!(checar_fechada(c), 0);
}

// (3) Vão junto do canto cortado pela esquadria: o cortador sai pela face inclinada.
#[test]
fn prisma_vao_junto_ao_canto_em_esquadria() {
    let (l, e, d) = (3.0, 0.3, 0.3);
    let trap = vec![[0.0, 0.0], [l, 0.0], [l - d, e], [d, e]];
    for (x, nome) in [(0.5, "esquerda"), (l - 0.5, "direita"), (0.45, "encostado")] {
        let v = Vao { contorno: meia_lua(0.9, 1.4, 64), x, soleira: 0.0 };
        let r = furar_prisma(&[camada(vec![trap.clone()], 0.0, 2.8)], std::slice::from_ref(&v)).unwrap();
        let c = &r.camadas[0];
        let esperado = removido_por_integracao(&[trap.clone()], &v);
        quase(c.volume_sem_furo - c.volume, esperado, 1e-6, nome);
        // Menor que o do trecho de espessura constante: o prisma é mais fino junto da ponta.
        let cheio = crate::furo_contorno::area_com_sinal(&v.contorno) * e;
        assert!(c.volume_sem_furo - c.volume < cheio - 1e-6, "{nome}: deveria remover menos que o cheio");
        assert_eq!(checar_fechada(c), 0);
    }
    // Vão que sai pela ponta cortada (u < 0 no envelope) é recusado; no limite exato (0.45) passa (testado acima).
    let v = Vao { contorno: meia_lua(0.9, 1.4, 16), x: 0.2, soleira: 0.0 };
    assert_eq!(furar_prisma(&[camada(vec![trap], 0.0, 2.8)], &[v]).unwrap_err(), ErroPrisma::Vao(crate::furo_contorno::ErroFuro::VaoForaDaParede(0)));
}

// (4) Camada com recorte (vazado em planta), com o vão cruzando o recorte.
#[test]
fn prisma_com_recorte_em_planta() {
    let (l, e) = (3.0, 0.3);
    let recorte = ret(1.2, 0.05, 1.8, 0.25); // passa em todo z; sobra 0,05 de cada lado
    let planta = vec![ret(0.0, 0.0, l, e), recorte.clone()];
    // vão fora do recorte, cruzando o recorte, e com o recorte dado em sentido anti-horário (normalizado)
    for (x, nome) in [(0.6, "fora"), (1.5, "dentro"), (1.15, "cruzando")] {
        let v = Vao { contorno: meia_lua(0.8, 1.4, 64), x, soleira: 0.0 };
        let r = furar_prisma(&[camada(planta.clone(), 0.0, 2.8)], std::slice::from_ref(&v)).unwrap();
        let c = &r.camadas[0];
        quase(c.volume_sem_furo, (l * e - 0.6 * 0.2) * 2.8, 1e-12, "volume sem furo");
        quase(c.volume_sem_furo - c.volume, removido_por_integracao(&planta, &v), 1e-6, nome);
        checar_fechada(c);
    }
    // Vão longe do recorte: o gênero é o do recorte (1).
    let v = Vao { contorno: meia_lua(0.8, 1.4, 32), x: 0.6, soleira: 0.0 };
    let r = furar_prisma(&[camada(planta.clone(), 0.0, 2.8)], &[v]).unwrap();
    assert_eq!(checar_fechada(&r.camadas[0]), 1);
    // Orientação do recorte não importa.
    let mut horario = planta.clone();
    horario[1].reverse();
    let v = Vao { contorno: meia_lua(0.8, 1.4, 32), x: 1.5, soleira: 0.0 };
    let a = furar_prisma(&[camada(planta, 0.0, 2.8)], std::slice::from_ref(&v)).unwrap();
    let b = furar_prisma(&[camada(horario, 0.0, 2.8)], &[v]).unwrap();
    quase(a.volume, b.volume, 1e-12, "orientação do recorte");
}

// Dois polígonos disjuntos na mesma camada (parede interrompida por um intervalo).
#[test]
fn prisma_com_dois_poligonos() {
    let e = 0.2;
    let pols = vec![vec![ret(0.0, 0.0, 1.5, e)], vec![ret(2.5, 0.0, 4.0, e)]];
    let c = CamadaPrisma { poligonos: pols, z0: 0.0, z1: 2.8 };
    let v = Vao { contorno: retangulo_vao(0.8, 2.1), x: 0.8, soleira: 0.0 };
    let r = furar_prisma(&[c], &[v]).unwrap();
    quase(r.volume_removido, 0.8 * 2.1 * e, 1e-9, "removido");
    quase(r.volume, 2.0 * 1.5 * e * 2.8 - 0.8 * 2.1 * e, 1e-9, "volume");
}

// (5) Paridade com o caminho retangular atual: faixas de `furos_de` + `volume_faixa` (a3c.rs).
#[test]
fn prisma_paridade_com_faixas_retangulares() {
    let esp = [0.015, 0.02, 0.09, 0.02, 0.015];
    let (l, h) = (4.0, 2.8);
    // (largura, altura, x, soleira)
    let vaos_rect = [(0.9, 2.1, 1.0, 0.0), (1.2, 1.2, 2.7, 0.9)];
    let vaos: Vec<Vao> = vaos_rect.iter().map(|&(w, ah, x, s)| Vao { contorno: retangulo_vao(w, ah), x, soleira: s }).collect();
    let mut cortes: Vec<f64> = vec![0.0, h];
    for &(_, ah, _, s) in &vaos_rect {
        cortes.extend([s, s + ah]);
    }
    cortes.sort_by(|a, b| a.partial_cmp(b).unwrap());
    cortes.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
    let mut y = 0.0;
    let mut camadas = Vec::new();
    let mut liquido_faixas = Vec::new();
    for &e in &esp {
        let frag = vec![vec![ret(0.0, y, l, y + e)]];
        let mut vol = 0.0;
        for par in cortes.windows(2) {
            let meio = (par[0] + par[1]) / 2.0;
            // retângulo do vão: largura cheia em u, folga em s (mais fundo que a parede), como `retangulo_do_vao`.
            let furos: Vec<_> = vaos_rect
                .iter()
                .filter(|&&(_, ah, _, s)| meio > s && meio < s + ah)
                .map(|&(w, _, x, _)| vec![vec![ret(x - w / 2.0, y - 0.1, x + w / 2.0, y + e + 0.1)]])
                .collect();
            let poly = if furos.is_empty() { frag.clone() } else { furos_de(&frag, &furos).unwrap() };
            vol += volume_faixa(&poly, par[0], par[1], None);
        }
        liquido_faixas.push(vol);
        camadas.push(camada(vec![ret(0.0, y, l, y + e)], 0.0, h));
        y += e;
    }
    let r = furar_prisma(&camadas, &vaos).unwrap();
    for (c, v) in r.camadas.iter().zip(&liquido_faixas) {
        quase(c.volume, *v, 1e-9, "volume líquido da camada (faixas x prisma)");
    }
    quase(r.volume, liquido_faixas.iter().sum(), 1e-9, "total");
}

// Camada que não começa em z = 0 (por exemplo, subida de um nível): o vão é em z da parede.
#[test]
fn prisma_com_z0_deslocado() {
    let v = Vao { contorno: retangulo_vao(0.8, 1.0), x: 1.0, soleira: 1.0 };
    let r = furar_prisma(&[camada(vec![ret(0.0, 0.0, 2.0, 0.2)], 0.5, 2.5)], &[v]).unwrap();
    quase(r.volume_removido, 0.8 * 1.0 * 0.2, 1e-9, "removido");
    quase(r.camadas[0].volume_sem_furo, 2.0 * 0.2 * 2.0, 1e-12, "sem furo");
}

// Vão que não toca a camada: nada é removido (camada intacta, malha fechada).
#[test]
fn prisma_vao_que_nao_toca_a_camada() {
    let v = Vao { contorno: retangulo_vao(0.5, 0.5), x: 1.0, soleira: 0.0 };
    let r = furar_prisma(&[camada(vec![ret(0.0, 0.0, 2.0, 0.2)], 1.0, 2.0), camada(vec![ret(0.0, 0.2, 2.0, 0.3)], 0.0, 2.0)], &[v]).unwrap();
    assert!(r.camadas[0].volume_sem_furo - r.camadas[0].volume < 1e-12);
    quase(r.camadas[1].volume_sem_furo - r.camadas[1].volume, 0.5 * 0.5 * 0.1, 1e-9, "segunda camada");
    checar_fechada(&r.camadas[0]);
}

#[test]
fn prisma_sem_vaos_e_o_prisma_inteiro() {
    let r = furar_prisma(&[camada(vec![ret(0.0, 0.0, 2.0, 0.2)], 0.0, 2.8)], &[]).unwrap();
    quase(r.volume, 2.0 * 0.2 * 2.8, 1e-12, "volume");
    assert!(r.volume_removido.abs() < 1e-12);
    assert_eq!(checar_fechada(&r.camadas[0]), 0);
}

// Validação.
#[test]
fn prisma_valida_a_entrada() {
    use crate::furo_contorno::ErroFuro as F;
    let ok = || camada(vec![ret(0.0, 0.0, 2.0, 0.2)], 0.0, 2.8);
    let v = || Vao { contorno: retangulo_vao(0.5, 0.5), x: 1.0, soleira: 0.0 };
    assert_eq!(furar_prisma(&[], &[]).unwrap_err(), ErroPrisma::SemCamadas);
    assert_eq!(furar_prisma(&[camada(vec![ret(0.0, 0.0, 2.0, 0.2)], 1.0, 1.0)], &[]).unwrap_err(), ErroPrisma::AlturaInvalida(0));
    assert_eq!(furar_prisma(&[camada(vec![ret(0.0, 0.0, 2.0, 0.2)], 0.0, f64::NAN)], &[]).unwrap_err(), ErroPrisma::AlturaInvalida(0));
    assert_eq!(furar_prisma(&[CamadaPrisma { poligonos: vec![], z0: 0.0, z1: 1.0 }], &[]).unwrap_err(), ErroPrisma::PlantaVazia(0));
    // anel de planta em gravata borboleta
    let gravata = vec![[0.0, 0.0], [2.0, 0.2], [2.0, 0.0], [0.0, 0.2]];
    assert!(matches!(furar_prisma(&[camada(vec![gravata], 0.0, 1.0)], &[]).unwrap_err(), ErroPrisma::AnelPlanta(0, 0, F::AutoInterseccao(_))));
    // furo fora do externo / tocando o externo / cruzando o externo / furos que se tocam
    for furo in [ret(3.0, 0.05, 3.5, 0.15), ret(1.0, 0.0, 1.5, 0.1), ret(1.8, 0.05, 2.5, 0.15)] {
        assert_eq!(furar_prisma(&[camada(vec![ret(0.0, 0.0, 2.0, 0.2), furo], 0.0, 1.0)], &[]).unwrap_err(), ErroPrisma::AneisInconsistentes(0, 0));
    }
    let dois = camada(vec![ret(0.0, 0.0, 2.0, 0.2), ret(0.5, 0.05, 1.0, 0.15), ret(0.9, 0.05, 1.4, 0.15)], 0.0, 1.0);
    assert_eq!(furar_prisma(&[dois], &[]).unwrap_err(), ErroPrisma::AneisInconsistentes(0, 0));
    // vão: horário, auto-intersectado, fora do envelope
    let mut horario = retangulo_vao(0.5, 0.5);
    horario.reverse();
    assert_eq!(furar_prisma(&[ok()], &[Vao { contorno: horario, x: 1.0, soleira: 0.0 }]).unwrap_err(), ErroPrisma::Vao(F::ContornoInvalido(0)));
    let g = vec![[-0.2, 0.0], [0.2, 0.4], [0.2, 0.0], [-0.2, 0.4]];
    assert_eq!(furar_prisma(&[ok()], &[v(), Vao { contorno: g, x: 1.0, soleira: 0.0 }]).unwrap_err(), ErroPrisma::Vao(F::AutoInterseccao(1)));
    assert_eq!(furar_prisma(&[ok()], &[Vao { x: 1.9, ..v() }]).unwrap_err(), ErroPrisma::Vao(F::VaoForaDaParede(0)));
    assert_eq!(furar_prisma(&[ok()], &[Vao { soleira: 2.6, ..v() }]).unwrap_err(), ErroPrisma::Vao(F::VaoForaDaParede(0)));
    assert_eq!(furar_prisma(&[ok()], &[Vao { x: f64::NAN, ..v() }]).unwrap_err(), ErroPrisma::Vao(F::ContornoInvalido(0)));
}

// ---- ABI -------------------------------------------------------------------------------------

struct Buf {
    pontos_planta: Vec<f64>,
    aneis: Vec<u32>,
    poligonos: Vec<u32>,
    camadas: Vec<u32>,
    z: Vec<f64>,
    pontos: Vec<f64>,
    vaos: Vec<u32>,
    x: Vec<f64>,
    soleira: Vec<f64>,
}

impl Buf {
    fn novo(camadas: &[CamadaPrisma], vaos: &[Vao]) -> Buf {
        let mut b = Buf { pontos_planta: vec![], aneis: vec![0], poligonos: vec![0], camadas: vec![0], z: vec![], pontos: vec![], vaos: vec![0], x: vec![], soleira: vec![] };
        let (mut na, mut np) = (0u32, 0u32);
        for c in camadas {
            for pol in &c.poligonos {
                for anel in pol {
                    for p in anel {
                        b.pontos_planta.extend_from_slice(p);
                    }
                    na += anel.len() as u32;
                    b.aneis.push(na);
                }
                np += pol.len() as u32;
                b.poligonos.push(np);
            }
            b.camadas.push(b.poligonos.len() as u32 - 1);
            b.z.extend([c.z0, c.z1]);
        }
        let mut n = 0u32;
        for v in vaos {
            for p in &v.contorno {
                b.pontos.extend_from_slice(p);
            }
            n += v.contorno.len() as u32;
            b.vaos.push(n);
            b.x.push(v.x);
            b.soleira.push(v.soleira);
        }
        b
    }
    fn entradas(&self) -> EntradasPrisma<'_> {
        EntradasPrisma {
            pontos_planta: &self.pontos_planta,
            aneis: &self.aneis,
            poligonos: &self.poligonos,
            camadas: &self.camadas,
            z: &self.z,
            pontos: &self.pontos,
            vaos: &self.vaos,
            x: &self.x,
            soleira: &self.soleira,
        }
    }
}

fn f64s(s: &Saida) -> &[f64] {
    match s {
        Saida::F64(v) => v,
        _ => panic!("esperava f64"),
    }
}
fn u32s(s: &Saida) -> &[u32] {
    match s {
        Saida::U32(v) => v,
        _ => panic!("esperava u32"),
    }
}

#[test]
fn abi_prisma_layout_e_valores() {
    let trap = vec![[0.0, 0.0], [3.0, 0.0], [2.7, 0.3], [0.3, 0.3]];
    let camadas = [camada(vec![trap], 0.0, 2.8), camada(vec![ret(0.0, 0.3, 3.0, 0.5), ret(1.2, 0.35, 1.8, 0.45)], 0.0, 2.8)];
    let vaos = [Vao { contorno: meia_lua(0.9, 1.4, 24), x: 1.5, soleira: 0.0 }];
    let direto = furar_prisma(&camadas, &vaos).unwrap();
    let b = Buf::novo(&camadas, &vaos);
    let mut e = Estado::novo();
    let (e_a, e_b) = (b.entradas(), ());
    let _ = e_b;
    assert_eq!(e.guardar(furar_prisma_planos(&e_a)), 0);
    assert_eq!(e.saida_n(), 5);
    let meta = f64s(e.saida(0).unwrap());
    assert_eq!(meta.len(), 8);
    for (k, c) in direto.camadas.iter().enumerate() {
        assert_eq!(&meta[4 * k..4 * k + 4], &[c.z0, c.z1, c.volume, c.volume_sem_furo]);
    }
    let cont = u32s(e.saida(1).unwrap());
    let (nv, ni): (u32, u32) = (cont.iter().step_by(2).sum(), cont.iter().skip(1).step_by(2).sum());
    assert_eq!(f64s(e.saida(2).unwrap()).len() as u32, 3 * nv);
    assert_eq!(u32s(e.saida(3).unwrap()).len() as u32, ni);
    let tot = f64s(e.saida(4).unwrap());
    quase(tot[0], direto.volume, 1e-12, "volume total");
    quase(tot[1], direto.volume_removido, 1e-12, "removido");
    // índices locais à camada
    let ind = u32s(e.saida(3).unwrap());
    assert!(ind[..cont[1] as usize].iter().all(|&i| i < cont[0]));
    assert!(ind[cont[1] as usize..].iter().all(|&i| i < cont[2]));
}

#[test]
fn abi_prisma_erros() {
    let c = [camada(vec![ret(0.0, 0.0, 2.0, 0.2)], 0.0, 2.8)];
    let v = [Vao { contorno: retangulo_vao(0.5, 0.5), x: 1.0, soleira: 0.0 }];
    // incoerência de tamanhos
    let mut b = Buf::novo(&c, &v);
    b.soleira.clear();
    assert_eq!(furar_prisma_planos(&b.entradas()).unwrap_err().0, ENTRADA);
    // offsets
    let mut b = Buf::novo(&c, &v);
    *b.aneis.last_mut().unwrap() += 1;
    assert_eq!(furar_prisma_planos(&b.entradas()).unwrap_err().0, ENTRADA);
    let mut b = Buf::novo(&c, &v);
    b.camadas = vec![0, 5];
    assert_eq!(furar_prisma_planos(&b.entradas()).unwrap_err().0, ENTRADA);
    // zero camadas
    let mut b = Buf::novo(&c, &v);
    b.camadas = vec![0];
    b.z.clear();
    assert_eq!(furar_prisma_planos(&b.entradas()).unwrap_err().0, ENTRADA);
    // entrada inválida vinda do núcleo, com texto de erro pelo Estado
    let mut b = Buf::novo(&c, &v);
    b.z = vec![1.0, 0.5];
    let mut e = Estado::novo();
    assert_eq!(e.guardar(furar_prisma_planos(&b.entradas())), ENTRADA);
    assert!(e.erro().contains("camada 0"), "{}", e.erro());
    assert_eq!(e.saida_n(), 0);
    // limite de pontos por anel de planta
    let n = (LIMITE_PONTOS_POR_ANEL + 1) as usize;
    let circulo: Vec<[f64; 2]> = (0..n).map(|i| [2.0 + 0.4 * (2.0 * PI * i as f64 / n as f64).cos(), 0.1 + 0.05 * (2.0 * PI * i as f64 / n as f64).sin()]).collect();
    let b = Buf::novo(&[camada(vec![circulo], 0.0, 1.0)], &[]);
    assert_eq!(furar_prisma_planos(&b.entradas()).unwrap_err().0, LIMITE);
    // limite de camadas
    let muitas: Vec<CamadaPrisma> = (0..=LIMITE_CAMADAS).map(|_| camada(vec![ret(0.0, 0.0, 1.0, 0.1)], 0.0, 1.0)).collect();
    let b = Buf::novo(&muitas, &[]);
    assert_eq!(furar_prisma_planos(&b.entradas()).unwrap_err().0, LIMITE);
    // sucesso depois de erro limpa o texto
    let b = Buf::novo(&c, &v);
    assert_eq!(e.guardar(furar_prisma_planos(&b.entradas())), 0);
    assert!(e.erro().is_empty());
    assert_eq!(e.saida_n(), 5);
}
