//! Malha da parede cortina (decisão 0056, §5.5; consulta `cortina_malha`, id 101): protótipos instanciáveis e as matrizes que os põem no mundo.
//!
//! Cada tipo de montante e cada tipo de painel vira UM protótipo (um prisma de seção fixa e comprimento unitário); cada peça é uma instância, com uma
//! matriz 3 × 4 que escala o comprimento (montante) ou a largura e a altura (painel) e posiciona. A cortina de 60 células dá ~4 protótipos e ~250
//! instâncias. As peças são as de `cortina_pecas::resolver`, as mesmas da planta e das quantidades.
//!
//! Formato (documentado também no JSON do contrato):
//! - protótipo de montante: perfil no plano local `(x, y)` (x na largura vista na face, y na profundidade, já com o deslocamento do tipo) extrudado em
//!   `z` de 0 a 1; protótipo de painel: caixa `x ∈ [-0,5; 0,5]`, `y` na espessura (com o deslocamento do tipo), `z ∈ [0, 1]`;
//! - cada face tem vértices próprios (sombreamento chapado) e os triângulos saem anti-horários vistos de fora; `indices` é LOCAL ao protótipo;
//! - matriz: 12 números por instância, três linhas `[r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz]` (linha-maior); mundo = M · (x, y, z, 1);
//!   a base é sempre destra e a translação cai na grade de 1 µm.

use std::collections::{BTreeMap, BTreeSet};

use crate::consultas::Saida;
use crate::cortina_pecas::{CortinaR, Geom, Montante, PainelPeca, PainelTipo, PecaMont};
use crate::cortina_tipos::*;
use crate::esquema::LIMITE;

/// Protótipo: geometria local de um tipo.
#[derive(Clone, Debug, PartialEq)]
pub struct Proto {
    pub papel: u32,
    pub tipo: u32,
    pub material: u32,
    pub vertices: Vec<[f64; 3]>,
    pub triangulos: Vec<[u32; 3]>,
}

/// Uma instância de protótipo.
#[derive(Clone, Debug, PartialEq)]
pub struct Instancia {
    pub cortina: u32,
    pub proto: u32,
    pub papel: u32,
    pub ref_i: u32,
    pub ref_j: u32,
    pub transparente: u32,
    pub matriz: [f64; 12],
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Malha {
    pub protos: Vec<Proto>,
    pub instancias: Vec<Instancia>,
}

/// Lados do círculo de um perfil redondo: 8 no LOD grosso; senão 16, ou 24 acima de 80 mm de diâmetro.
pub fn lados_redondo(diametro: f64, lod: u32) -> usize {
    if lod == 0 {
        LADOS_REDONDO_GROSSO
    } else if diametro > DIAMETRO_GRANDE {
        LADOS_REDONDO_GRANDE
    } else {
        LADOS_REDONDO
    }
}

/// Prisma de `poligono` (anti-horário em `(x, y)`) de `z = 0` a `z = 1`, com vértices próprios por face.
pub fn prisma(poligono: &[[f64; 2]]) -> (Vec<[f64; 3]>, Vec<[u32; 3]>) {
    let n = poligono.len();
    let mut v: Vec<[f64; 3]> = Vec::with_capacity(4 * n + 2 * n);
    let mut t: Vec<[u32; 3]> = Vec::new();
    for k in 0..n {
        let (p, q) = (poligono[k], poligono[(k + 1) % n]);
        let b = v.len() as u32;
        v.extend_from_slice(&[[p[0], p[1], 0.0], [q[0], q[1], 0.0], [q[0], q[1], 1.0], [p[0], p[1], 1.0]]);
        t.extend_from_slice(&[[b, b + 1, b + 2], [b, b + 2, b + 3]]);
    }
    // Tampas em leque (o perfil é convexo): a de baixo olha para -z, a de cima para +z.
    let base = v.len() as u32;
    for p in poligono {
        v.push([p[0], p[1], 0.0]);
    }
    for k in 1..n.saturating_sub(1) as u32 {
        t.push([base, base + k + 1, base + k]);
    }
    let topo = v.len() as u32;
    for p in poligono {
        v.push([p[0], p[1], 1.0]);
    }
    for k in 1..n.saturating_sub(1) as u32 {
        t.push([topo, topo + k, topo + k + 1]);
    }
    (v, t)
}

fn poligono_retangular(x0: f64, x1: f64, y0: f64, y1: f64) -> Vec<[f64; 2]> {
    vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

fn grade_proto(p: Proto) -> Proto {
    let q = |x: f64| na_grade(x);
    Proto { vertices: p.vertices.iter().map(|v| [q(v[0]), q(v[1]), q(v[2])]).collect(), ..p }
}

pub fn proto_montante(m: &Montante, lod: u32) -> Proto {
    let poligono = if m.forma == FORMA_REDONDA {
        let (n, r) = (lados_redondo(m.largura, lod), m.largura / 2.0);
        (0..n)
            .map(|k| {
                let a = std::f64::consts::TAU * k as f64 / n as f64;
                [r * a.cos(), m.desloc + r * a.sin()]
            })
            .collect()
    } else {
        poligono_retangular(-m.largura / 2.0, m.largura / 2.0, m.desloc - m.profundidade / 2.0, m.desloc + m.profundidade / 2.0)
    };
    let (vertices, triangulos) = prisma(&poligono);
    grade_proto(Proto { papel: MALHA_MONTANTE, tipo: m.tipo, material: m.material, vertices, triangulos })
}

pub fn proto_painel(p: &PainelTipo) -> Proto {
    let (vertices, triangulos) = prisma(&poligono_retangular(-0.5, 0.5, p.desloc - p.espessura / 2.0, p.desloc + p.espessura / 2.0));
    let papel = if p.kind == PAINEL_VIDRO { MALHA_VIDRO } else { MALHA_SOLIDO };
    grade_proto(Proto { papel, tipo: p.tipo, material: p.material, vertices, triangulos })
}

/// Matriz 3 × 4 linha-maior a partir das três colunas da base e da translação.
fn matriz(x: [f64; 3], y: [f64; 3], z: [f64; 3], t: [f64; 3]) -> [f64; 12] {
    [x[0], y[0], z[0], na_grade(t[0]), x[1], y[1], z[1], na_grade(t[1]), x[2], y[2], z[2], na_grade(t[2])]
}

fn matriz_montante(g: &Geom, p: &PecaMont) -> [f64; 12] {
    let len = na_grade(p.comprimento());
    let (sx, sy) = (g.sigma * g.u[0], g.sigma * g.u[1]);
    let fora = [g.sigma * g.n[0], g.sigma * g.n[1], 0.0];
    if p.eixo == EIXO_U {
        matriz([sx, sy, 0.0], fora, [0.0, 0.0, len], g.mundo(p.pos, 0.0, p.de))
    } else {
        matriz([0.0, 0.0, -g.sigma], fora, [g.u[0] * len, g.u[1] * len, 0.0], g.mundo(p.de, 0.0, p.pos))
    }
}

fn matriz_painel(g: &Geom, p: &PainelPeca) -> [f64; 12] {
    let (s0, s1, z0, z1) = p.retangulo_bruto();
    let (w, h) = (na_grade(s1 - s0), na_grade(z1 - z0));
    matriz([g.sigma * g.u[0] * w, g.sigma * g.u[1] * w, 0.0], [g.sigma * g.n[0], g.sigma * g.n[1], 0.0], [0.0, 0.0, h], g.mundo((s0 + s1) / 2.0, 0.0, z0))
}

/// Protótipos e instâncias das cortinas resolvidas. `LIMITE` com mais de 20 000 instâncias.
pub fn montar(cortinas: &[CortinaR], lod: u32) -> Result<Malha, u32> {
    let geoms: Vec<(&CortinaR, &Geom)> = cortinas.iter().filter_map(|c| c.g.as_ref().map(|g| (c, g))).collect();
    let mut n = 0usize;
    let mut chaves: BTreeSet<(u32, u32)> = BTreeSet::new();
    let mut protos: BTreeMap<(u32, u32), Proto> = BTreeMap::new();
    for (_, g) in &geoms {
        n += g.pecas.len();
        for p in &g.pecas {
            if chaves.insert((MALHA_MONTANTE, p.m.tipo)) {
                protos.insert((MALHA_MONTANTE, p.m.tipo), proto_montante(&p.m, lod));
            }
        }
        for p in g.paineis.iter().filter(|p| p.p.kind != PAINEL_VAZIO && p.tem_area()) {
            n += 1;
            let proto = proto_painel(&p.p);
            if chaves.insert((proto.papel, p.p.tipo)) {
                protos.insert((proto.papel, p.p.tipo), proto);
            }
        }
    }
    if n > LIMITE_INSTANCIAS {
        return Err(LIMITE);
    }
    let ordem: Vec<(u32, u32)> = protos.keys().copied().collect();
    let id_de = |papel: u32, tipo: u32| ordem.iter().position(|&k| k == (papel, tipo)).unwrap_or(0) as u32;
    let mut instancias = Vec::with_capacity(n);
    for (c, g) in &geoms {
        for p in &g.pecas {
            instancias.push(Instancia {
                cortina: c.id,
                proto: id_de(MALHA_MONTANTE, p.m.tipo),
                papel: MALHA_MONTANTE,
                ref_i: p.linha,
                ref_j: (p.k << 1) | p.eixo as u32,
                transparente: 0,
                matriz: matriz_montante(g, p),
            });
        }
        for p in g.paineis.iter().filter(|p| p.p.kind != PAINEL_VAZIO && p.tem_area()) {
            let papel = if p.p.kind == PAINEL_VIDRO { MALHA_VIDRO } else { MALHA_SOLIDO };
            instancias.push(Instancia {
                cortina: c.id,
                proto: id_de(papel, p.p.tipo),
                papel,
                ref_i: p.i,
                ref_j: p.j,
                transparente: u32::from(p.p.kind == PAINEL_VIDRO),
                matriz: matriz_painel(g, p),
            });
        }
    }
    Ok(Malha { protos: ordem.iter().filter_map(|k| protos.remove(k)).collect(), instancias })
}

/// Saída plana (ver o JSON): `prototipos`, `vertices`, `indices`, `instancias`, `matrizes`, `grupos`, `vertices_av` e `indices_av` (os dois últimos e
/// os grupos ficam vazios na fase 1: não há peça avulsa antes dos perfis L, trapézio e canto e das facetas de arco).
pub fn achatar(m: &Malha) -> Vec<Saida> {
    let (mut protos, mut vertices, mut indices) = (Vec::new(), Vec::new(), Vec::new());
    let (mut pv, mut pi) = (0u32, 0u32);
    for (k, p) in m.protos.iter().enumerate() {
        let (nv, ni) = (p.vertices.len() as u32, 3 * p.triangulos.len() as u32);
        protos.extend_from_slice(&[k as u32, p.papel, p.tipo, p.material, pv, nv, pi, ni]);
        for v in &p.vertices {
            vertices.extend_from_slice(v);
        }
        for t in &p.triangulos {
            indices.extend_from_slice(t);
        }
        pv += nv;
        pi += ni;
    }
    let mut inst = Vec::new();
    let mut mats = Vec::new();
    for i in &m.instancias {
        inst.extend_from_slice(&[i.cortina, i.proto, i.papel, i.ref_i, i.ref_j, i.transparente]);
        mats.extend_from_slice(&i.matriz);
    }
    vec![Saida::U32(protos), Saida::F64(vertices), Saida::U32(indices), Saida::U32(inst), Saida::F64(mats), Saida::U32(Vec::new()), Saida::F64(Vec::new()), Saida::U32(Vec::new())]
}

pub fn consulta_cortina_malha(cena: &crate::cena::Cena, nivel: u32, lod: u32) -> Result<Vec<Saida>, u32> {
    let cortinas = crate::cortina_pecas::resolver(cena, nivel)?;
    Ok(achatar(&montar(&cortinas, lod)?))
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cortina_pecas::testes::*;
    use std::collections::HashMap;

    fn aplica(m: &[f64; 12], v: [f64; 3]) -> [f64; 3] {
        [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
            m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
            m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
        ]
    }

    /// Volume com sinal da malha (positivo com as normais para fora).
    fn volume(v: &[[f64; 3]], t: &[[u32; 3]]) -> f64 {
        t.iter()
            .map(|t| {
                let (a, b, c) = (v[t[0] as usize], v[t[1] as usize], v[t[2] as usize]);
                (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
            })
            .sum()
    }

    /// Solda os vértices a 1 µm e confere que toda aresta orientada aparece uma vez e a inversa também: fechada e orientada.
    fn fechada_e_orientada(v: &[[f64; 3]], t: &[[u32; 3]]) -> bool {
        let q = |x: f64| (x * 1e6).round() as i64;
        let mut ids: HashMap<[i64; 3], u32> = HashMap::new();
        let id: Vec<u32> = v
            .iter()
            .map(|p| {
                let n = ids.len() as u32;
                *ids.entry([q(p[0]), q(p[1]), q(p[2])]).or_insert(n)
            })
            .collect();
        let mut dir: HashMap<(u32, u32), u32> = HashMap::new();
        for t in t {
            for k in 0..3 {
                *dir.entry((id[t[k] as usize], id[t[(k + 1) % 3] as usize])).or_insert(0) += 1;
            }
        }
        dir.iter().all(|(&(a, b), &n)| n == 1 && dir.get(&(b, a)) == Some(&1))
    }

    #[test]
    fn prototipos_sao_solidos_fechados_com_normais_para_fora_e_volume_da_secao() {
        let ret = Montante { tipo: 1, forma: FORMA_RETANGULAR, largura: 0.05, profundidade: 0.1, desloc: 0.01, material: 7 };
        let p = proto_montante(&ret, 2);
        assert!(fechada_e_orientada(&p.vertices, &p.triangulos));
        assert!((volume(&p.vertices, &p.triangulos) - 0.005).abs() < 1e-9);
        let red = Montante { tipo: 2, forma: FORMA_REDONDA, largura: 0.05, profundidade: 0.05, desloc: 0.0, material: 7 };
        for (lod, lados) in [(0u32, 8usize), (1, 16), (2, 16)] {
            let p = proto_montante(&red, lod);
            assert!(fechada_e_orientada(&p.vertices, &p.triangulos), "lod {lod}");
            // O polígono inscrito tem área n/2 · r² · sen(2π/n).
            let area = lados as f64 / 2.0 * 0.025f64.powi(2) * (std::f64::consts::TAU / lados as f64).sin();
            assert!((volume(&p.vertices, &p.triangulos) - area).abs() < 1e-6, "lod {lod}");
        }
        assert_eq!(lados_redondo(0.1, 1), 24, "acima de 80 mm");
        let pn = proto_painel(&PainelTipo { tipo: 3, kind: PAINEL_VIDRO, espessura: 0.01, desloc: 0.0, encaixe: 0.012, material: 9 });
        assert!(fechada_e_orientada(&pn.vertices, &pn.triangulos));
        assert!((volume(&pn.vertices, &pn.triangulos) - 0.01).abs() < 1e-9);
        assert_eq!(pn.papel, MALHA_VIDRO);
    }

    #[test]
    fn instancias_e_prototipos_da_grade_de_4_por_3() {
        let e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(3));
        let cena = cena_simples(&e, 6.0, 3.0);
        let m = montar(&crate::cortina_pecas::resolver(&cena, 0).expect("r"), 1).expect("malha");
        // 2 protótipos: o montante retangular e o painel de vidro.
        assert_eq!(m.protos.len(), 2);
        assert_eq!((m.protos[0].papel, m.protos[0].tipo), (MALHA_MONTANTE, M_RET));
        assert_eq!((m.protos[1].papel, m.protos[1].tipo), (MALHA_VIDRO, P_VIDRO));
        // 5 linhas verticais x 3 segmentos + 4 linhas horizontais x 4 segmentos + 12 painéis (as peças são por segmento).
        assert_eq!(m.instancias.len(), 15 + 16 + 12);
        assert_eq!(m.instancias.iter().filter(|i| i.transparente == 1).count(), 12);
        assert!(m.instancias.iter().filter(|i| i.papel == MALHA_MONTANTE).all(|i| i.transparente == 0));
    }

    #[test]
    fn volume_das_instancias_bate_com_comprimento_vezes_secao_e_area_bruta_vezes_espessura() {
        // Parede girada e invertida: a base tem de continuar destra e as normais para fora.
        let mut e = Espec::novo(EixoEfetivo::numero(3), EixoEfetivo::distancia_fixa(1.2, JUSTIF_FIM));
        e.mont = [M_RET, M_RED, M_RET, M_RET, M_RED, M_RED];
        for prioridade in [PRIORIDADE_VERTICAL, PRIORIDADE_HORIZONTAL] {
            e.prioridade = prioridade;
            let mut cena = cena_simples(&e, 4.5, 3.0);
            let c = cena.cortina.cortinas.get_mut(&1).expect("c");
            c.a = [1.0, 2.0];
            c.b = [1.0 + 4.5 * 0.6, 2.0 + 4.5 * 0.8];
            c.invertida = true;
            c.z_base = 3.0;
            let cortinas = crate::cortina_pecas::resolver(&cena, 0).expect("r");
            let g = cortinas[0].g.as_ref().expect("g");
            let m = montar(&cortinas, 2).expect("malha");
            let mut vol_mont = 0.0;
            let mut vol_pnl = 0.0;
            for i in &m.instancias {
                let p = &m.protos[i.proto as usize];
                let v: Vec<[f64; 3]> = p.vertices.iter().map(|&v| aplica(&i.matriz, v)).collect();
                let vol = volume(&v, &p.triangulos);
                assert!(vol > 0.0, "instância com volume negativo (base canhota ou normais para dentro)");
                assert!(fechada_e_orientada(&v, &p.triangulos));
                if i.papel == MALHA_MONTANTE {
                    vol_mont += vol;
                } else {
                    vol_pnl += vol;
                }
            }
            // Volume dos montantes: o redondo é um polígono inscrito de 16 lados (lod 2), o resto é exato.
            let esperado_mont: f64 = g
                .pecas
                .iter()
                .map(|p| {
                    let area = if p.m.forma == FORMA_REDONDA { 16.0 / 2.0 * 0.025f64.powi(2) * (std::f64::consts::TAU / 16.0).sin() } else { p.m.area_secao() };
                    area * p.comprimento()
                })
                .sum();
            assert!((vol_mont - esperado_mont).abs() < 1e-6, "montantes {vol_mont} vs {esperado_mont}");
            let esperado_pnl: f64 = g.paineis.iter().map(|p| p.area_bruta() * p.p.espessura).sum();
            assert!((vol_pnl - esperado_pnl).abs() < 1e-6, "painéis {vol_pnl} vs {esperado_pnl}");
        }
    }

    #[test]
    fn painel_vazio_nao_gera_instancia_nem_prototipo() {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        e.painel = P_VAZIO;
        let m = montar(&crate::cortina_pecas::resolver(&cena_simples(&e, 4.0, 3.0), 0).expect("r"), 1).expect("malha");
        assert_eq!(m.protos.len(), 1);
        assert!(m.instancias.iter().all(|i| i.papel == MALHA_MONTANTE));
    }

    #[test]
    fn posicao_no_mundo_do_montante_e_do_painel() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let cena = cena_simples(&e, 4.0, 3.0);
        let m = montar(&crate::cortina_pecas::resolver(&cena, 0).expect("r"), 1).expect("malha");
        // Vertical interior em s = 2 (segunda vertical, índice 1): origem em (2, 0, 0), comprimento 3 em z, largura em x, profundidade em y.
        let v = m.instancias.iter().find(|i| i.papel == MALHA_MONTANTE && i.ref_i == 1 && i.ref_j & 1 == EIXO_U as u32).expect("vertical");
        let o = aplica(&v.matriz, [0.0, 0.0, 0.0]);
        assert!((o[0] - 2.0).abs() < 1e-9 && o[1].abs() < 1e-9 && o[2].abs() < 1e-9);
        let topo = aplica(&v.matriz, [0.0, 0.0, 1.0]);
        assert!((topo[2] - 3.0).abs() < 1e-9);
        // Painel da primeira célula: livre de 0,05 (borda embutida) a 1,975; com o encaixe de 12 mm, de 0,038 a 1,987.
        let p = m.instancias.iter().find(|i| i.papel == MALHA_VIDRO && i.ref_i == 0).expect("painel");
        let (a, b) = (aplica(&p.matriz, [-0.5, 0.0, 0.0]), aplica(&p.matriz, [0.5, 0.0, 1.0]));
        assert!((a[0] - (0.05 - 0.012)).abs() < 1e-6, "borda esquerda do painel com encaixe: {}", a[0]);
        assert!((b[0] - (2.0 - 0.025 + 0.012)).abs() < 1e-6);
        assert!((a[2] - (0.05 - 0.012)).abs() < 1e-6 && (b[2] - (3.0 - 0.05 + 0.012)).abs() < 1e-6);
    }

    #[test]
    fn mais_de_vinte_mil_instancias_e_limite() {
        let e = Espec::novo(EixoEfetivo::numero(64), EixoEfetivo::numero(64));
        let mut cena = cena_simples(&e, 60.0, 60.0);
        for id in 2..8 {
            cena = com_cortina(cena, id, 60.0, 60.0);
        }
        let r = crate::cortina_pecas::resolver(&cena, 0).expect("r");
        assert_eq!(montar(&r, 1).err(), Some(LIMITE));
    }
}
