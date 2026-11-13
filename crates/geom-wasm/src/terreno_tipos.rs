//! Terreno (PLANO do terreno A.4 e A.5): tipos comuns, leitura das fontes de UM terreno a partir das seções 160 a 162 e o cache da regra 16.
//!
//! O kernel só lê as seções (não conhece o `Project`). A ordem canônica dos vértices é a de `id_num` crescente (o adaptador TS numera pontos soltos, depois os
//! vértices de cada curva, depois os de cada quebra). As restrições seguem a ordem canônica das linhas: curvas e depois quebras, cada grupo por `id_num`.
//!
//! Cache (regra 16): T0 e E por terreno, pela assinatura das linhas e dos vértices daquele terreno. A linha da seção 160 (nível, espessura da base, intervalo e
//! mestra) não entra na assinatura porque T0 e E não dependem dela: ela é lida a cada consulta. A seção 165 (sondas) nunca invalida malha.

use std::collections::BTreeMap;
use std::rc::Rc;

use crate::cena::Cena;
use crate::esquema::ID_AUSENTE;
use crate::geo2d::{cross, sub, v, V};
use crate::secoes_terreno::{SecoesTerreno, LINHA_BORDA, LINHA_CURVA};
use crate::terreno_avalia::Malha;

/// Códigos de aviso do terreno (A.4 regra 14).
pub const AVISO_COTAS_DIFERENTES: u32 = 1;
pub const AVISO_LINHA_CRUZA: u32 = 2;
pub const AVISO_SEM_TRIANGULOS: u32 = 5;

/// Diferença de cota (m) acima da qual dois vértices fundidos geram o aviso 1.
pub const TOL_COTA_FUSAO: f64 = 0.001;

/// Chave de fusão de um vértice (regra 1): milímetros inteiros.
pub fn chave(x: f64, y: f64) -> (i64, i64) {
    ((x * 1000.0).round() as i64, (y * 1000.0).round() as i64)
}

/// Vértice de fonte (ponto solto, de curva ou de quebra).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VerticeFonte {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Curva ou quebra: os `id_num` dos seus vértices, na ordem da polilinha.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaFonte {
    pub id: u32,
    pub tipo: u8,
    pub fechada: bool,
    pub vertices: Vec<u32>,
}

/// Fontes de um terreno, já na ordem canônica.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Fontes {
    /// Pontos soltos e vértices de curvas e de quebras, por `id_num` crescente.
    pub vertices: Vec<VerticeFonte>,
    /// Curvas e depois quebras, cada grupo por `id_num` crescente.
    pub linhas: Vec<LinhaFonte>,
    /// Borda (polígono simples, sem ponto repetido). `None` = envoltória das fontes.
    pub borda: Option<Vec<V>>,
}

/// Um aviso do terreno, nas colunas da consulta 168.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AvisoTerreno {
    pub codigo: u32,
    pub regiao: u32,
    /// Aviso 1: `id_num` do vértice descartado. Aviso 2: `id_num` da linha. Demais: `ID_AUSENTE`.
    pub indice: u32,
    pub medido: f64,
    pub limite: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Resultado por terreno das regras 1 a 5.
pub struct Existente {
    /// Triangulação das fontes, sem a borda (regra 3).
    pub t0: Rc<Malha>,
    /// Superfície existente (regra 5). Sem borda é a própria T0.
    pub e: Rc<Malha>,
    pub avisos: Vec<AvisoTerreno>,
    /// A borda como chegou (sem adensar), quando existe.
    pub borda: Option<Vec<V>>,
}

/// Linha em leitura: tipo, fechada e os pares `(ordem, id_num)` dos seus vértices.
type LinhaEmLeitura = (u8, bool, Vec<(u32, u32)>);

/// Lê as fontes do terreno. Vértice cuja linha não existe ou é de outro terreno é ignorado (referência quebrada). Com mais de uma borda, vale a de menor
/// `id_num`. Borda com menos de 3 pontos distintos ou sem área é tratada como ausente.
pub fn fontes_do_terreno(s: &SecoesTerreno, terreno: u32) -> Fontes {
    let mut linhas: BTreeMap<u32, LinhaEmLeitura> = BTreeMap::new();
    for (&id, l) in s.linhas.iter().filter(|(_, l)| l.terreno == terreno) {
        linhas.insert(id, (l.tipo, l.fechada, Vec::new()));
    }
    let id_borda = linhas.iter().find(|(_, l)| l.0 == LINHA_BORDA).map(|(&id, _)| id);
    let mut f = Fontes::default();
    let mut borda: Vec<(u32, u32, V)> = Vec::new();
    for (&id, p) in s.vertices.iter().filter(|(_, p)| p.terreno == terreno) {
        if p.linha == ID_AUSENTE {
            f.vertices.push(VerticeFonte { id, x: p.x, y: p.y, z: p.z });
            continue;
        }
        let Some(l) = linhas.get_mut(&p.linha) else { continue };
        if l.0 == LINHA_BORDA {
            if Some(p.linha) == id_borda {
                borda.push((p.ordem, id, v(p.x, p.y)));
            }
        } else {
            l.2.push((p.ordem, id));
            f.vertices.push(VerticeFonte { id, x: p.x, y: p.y, z: p.z });
        }
    }
    let mut ordenadas: Vec<LinhaFonte> = Vec::new();
    for (id, (tipo, fechada, mut vs)) in linhas {
        if tipo == LINHA_BORDA {
            continue;
        }
        vs.sort_unstable();
        ordenadas.push(LinhaFonte { id, tipo, fechada: fechada && tipo == LINHA_CURVA, vertices: vs.into_iter().map(|x| x.1).collect() });
    }
    ordenadas.sort_by_key(|l| (l.tipo, l.id));
    f.linhas = ordenadas;
    borda.sort_unstable_by_key(|b| (b.0, b.1));
    f.borda = limpar_borda(borda.into_iter().map(|b| b.2).collect());
    f
}

/// Tira pontos consecutivos com a mesma chave de fusão (inclusive o último contra o primeiro). `None` se sobram menos de 3 pontos ou a área é nula.
fn limpar_borda(pontos: Vec<V>) -> Option<Vec<V>> {
    let mut b: Vec<V> = Vec::with_capacity(pontos.len());
    for p in pontos {
        if b.last().is_none_or(|u| chave(u.x, u.y) != chave(p.x, p.y)) {
            b.push(p);
        }
    }
    while b.len() > 1 && b.first().map(|p| chave(p.x, p.y)) == b.last().map(|p| chave(p.x, p.y)) {
        b.pop();
    }
    if b.len() < 3 || area_assinada(&b).abs() < 1e-12 {
        return None;
    }
    Some(b)
}

/// Área assinada de um polígono (positiva no sentido anti-horário).
pub fn area_assinada(p: &[V]) -> f64 {
    let mut s = 0.0;
    for k in 0..p.len() {
        s += cross(p[k], p[(k + 1) % p.len()]);
    }
    s / 2.0
}

/// Distância de `q` ao segmento `a`–`b`.
pub fn dist_ao_segmento(q: V, a: V, b: V) -> f64 {
    let d = sub(b, a);
    let l2 = d.x * d.x + d.y * d.y;
    let t = if l2 > 0.0 { (((q.x - a.x) * d.x + (q.y - a.y) * d.y) / l2).clamp(0.0, 1.0) } else { 0.0 };
    crate::geo2d::hipot(q.x - (a.x + d.x * t), q.y - (a.y + d.y * t))
}

/// `true` se `q` está estritamente dentro do polígono (paridade de cruzamentos; a fronteira não é garantida).
pub fn ponto_no_poligono(q: V, p: &[V]) -> bool {
    let mut dentro = false;
    for k in 0..p.len() {
        let (a, b) = (p[k], p[(k + 1) % p.len()]);
        if (a.y > q.y) != (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x {
            dentro = !dentro;
        }
    }
    dentro
}

/// `true` se `q` está dentro do polígono ou sobre ele (a até `tol` da fronteira).
pub fn dentro_ou_sobre(q: V, p: &[V], tol: f64) -> bool {
    ponto_no_poligono(q, p) || (0..p.len()).any(|k| dist_ao_segmento(q, p[k], p[(k + 1) % p.len()]) <= tol)
}

/// Assinatura de 128 bits das fontes de um terreno.
pub type Assinatura = (u64, u64);

const SEMENTE: Assinatura = (0xcbf2_9ce4_8422_2325, 0x9e37_79b9_7f4a_7c15);

fn misturar(h: &mut Assinatura, x: u64) {
    h.0 = (h.0 ^ x).wrapping_mul(0x0000_0100_0000_01b3).rotate_left(5);
    h.1 = (h.1 ^ x.rotate_left(31)).wrapping_mul(0xff51_afd7_ed55_8ccd).rotate_left(27);
}

/// Assinatura das linhas (161) e dos vértices (162) de cada terreno.
fn assinaturas(s: &SecoesTerreno) -> BTreeMap<u32, Assinatura> {
    let mut m: BTreeMap<u32, Assinatura> = BTreeMap::new();
    for (&id, l) in &s.linhas {
        let h = m.entry(l.terreno).or_insert(SEMENTE);
        for x in [1, u64::from(id), u64::from(l.tipo), u64::from(l.fechada)] {
            misturar(h, x);
        }
    }
    for (&id, p) in &s.vertices {
        let h = m.entry(p.terreno).or_insert(SEMENTE);
        for x in [2, u64::from(id), u64::from(p.linha), u64::from(p.ordem), p.x.to_bits(), p.y.to_bits(), p.z.to_bits()] {
            misturar(h, x);
        }
    }
    m
}

/// Cache da regra 16: T0 e E por terreno.
#[derive(Default)]
pub struct CacheTerreno {
    /// Geração das fontes (`SecoesTerreno::geracao_fontes`) a que `assinaturas` se refere.
    geracao: Option<u64>,
    assinaturas: BTreeMap<u32, Assinatura>,
    existentes: BTreeMap<u32, (Assinatura, Rc<Existente>)>,
    /// Quantas vezes T0 e E foram calculadas (só nos testes).
    #[cfg(test)]
    pub(crate) triangulacoes: u32,
}

/// T0 e E do terreno, do cache ou calculadas agora. Erro (`ENTRADA`) não fica no cache.
pub fn existente(cena: &Cena, terreno: u32) -> Result<Rc<Existente>, u32> {
    let mut guarda = cena.cache_terreno.borrow_mut();
    let cache = &mut *guarda;
    let geracao = cena.terreno.geracao_fontes();
    if cache.geracao != Some(geracao) {
        cache.assinaturas = assinaturas(&cena.terreno);
        cache.geracao = Some(geracao);
        let atuais = &cache.assinaturas;
        cache.existentes.retain(|t, (a, _)| atuais.get(t).copied().unwrap_or(SEMENTE) == *a);
    }
    let assinatura = cache.assinaturas.get(&terreno).copied().unwrap_or(SEMENTE);
    if let Some((_, e)) = cache.existentes.get(&terreno).filter(|(a, _)| *a == assinatura) {
        return Ok(Rc::clone(e));
    }
    let fontes = fontes_do_terreno(&cena.terreno, terreno);
    let e = Rc::new(crate::terreno_tin::calcular_existente(&fontes)?);
    #[cfg(test)]
    {
        cache.triangulacoes += 1;
    }
    cache.existentes.insert(terreno, (assinatura, Rc::clone(&e)));
    Ok(e)
}

/// `id_num` dos terrenos do nível (`NIVEL_TODOS` = todos), em ordem crescente.
pub fn terrenos_do_nivel(s: &SecoesTerreno, nivel: u32) -> Vec<u32> {
    s.terrenos.iter().filter(|(_, t)| nivel == crate::esquema::NIVEL_TODOS || t.nivel == nivel).map(|(&id, _)| id).collect()
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::secoes_terreno::{LinhaTerrenoLinha, VerticeTerrenoLinha, LINHA_QUEBRA};

    fn vert(terreno: u32, linha: u32, ordem: u32, x: f64, y: f64) -> VerticeTerrenoLinha {
        VerticeTerrenoLinha { terreno, linha, ordem, x, y, z: 1.0 }
    }

    #[test]
    fn chave_arredonda_ao_milimetro() {
        assert_eq!(chave(1.0004, -2.0004), (1000, -2000));
        assert_eq!(chave(1.0006, 0.0), (1001, 0));
        assert_ne!(chave(0.0004, 0.0), chave(0.0006, 0.0));
    }

    #[test]
    fn fontes_na_ordem_canonica_e_referencia_quebrada_ignorada() {
        let mut s = SecoesTerreno::default();
        s.linhas.insert(5, LinhaTerrenoLinha { terreno: 1, tipo: LINHA_QUEBRA, fechada: true });
        s.linhas.insert(6, LinhaTerrenoLinha { terreno: 1, tipo: LINHA_CURVA, fechada: true });
        s.linhas.insert(7, LinhaTerrenoLinha { terreno: 1, tipo: LINHA_BORDA, fechada: true });
        s.linhas.insert(8, LinhaTerrenoLinha { terreno: 2, tipo: LINHA_CURVA, fechada: false });
        s.vertices.insert(0, vert(1, ID_AUSENTE, 0, 0.0, 0.0));
        s.vertices.insert(1, vert(1, 6, 1, 2.0, 0.0));
        s.vertices.insert(2, vert(1, 6, 0, 1.0, 0.0));
        s.vertices.insert(3, vert(1, 5, 0, 3.0, 0.0));
        s.vertices.insert(4, vert(1, 5, 1, 4.0, 0.0));
        s.vertices.insert(9, vert(1, 99, 0, 9.0, 9.0));
        s.vertices.insert(10, vert(1, 8, 0, 9.0, 9.0));
        s.vertices.insert(11, vert(2, ID_AUSENTE, 0, 9.0, 9.0));
        for (k, p) in [[0.0, 0.0], [4.0, 0.0], [4.0, 0.0002], [4.0, 4.0], [0.0, 0.0001]].iter().enumerate() {
            s.vertices.insert(20 + k as u32, vert(1, 7, k as u32, p[0], p[1]));
        }
        let f = fontes_do_terreno(&s, 1);
        assert_eq!(f.vertices.iter().map(|p| p.id).collect::<Vec<_>>(), vec![0, 1, 2, 3, 4]);
        assert_eq!(f.linhas.len(), 2);
        assert_eq!((f.linhas[0].id, f.linhas[0].fechada, f.linhas[0].vertices.clone()), (6, true, vec![2, 1]), "curva primeiro, vértices por ordem");
        assert_eq!((f.linhas[1].id, f.linhas[1].fechada), (5, false), "quebra nunca é fechada");
        assert_eq!(f.borda, Some(vec![v(0.0, 0.0), v(4.0, 0.0), v(4.0, 4.0)]), "pontos repetidos da borda saem");
        assert_eq!(fontes_do_terreno(&s, 2).vertices.len(), 1);
        assert_eq!(fontes_do_terreno(&s, 3), Fontes::default());
    }

    #[test]
    fn borda_degenerada_e_ausente() {
        assert_eq!(limpar_borda(vec![v(0.0, 0.0), v(1.0, 0.0)]), None);
        assert_eq!(limpar_borda(vec![v(0.0, 0.0), v(1.0, 0.0), v(2.0, 0.0)]), None);
        assert!(limpar_borda(vec![v(0.0, 0.0), v(1.0, 0.0), v(0.0, 1.0)]).is_some());
    }

    #[test]
    fn poligono_area_distancia_e_pertinencia() {
        let q = [v(0.0, 0.0), v(2.0, 0.0), v(2.0, 2.0), v(0.0, 2.0)];
        assert_eq!(area_assinada(&q), 4.0);
        assert!(ponto_no_poligono(v(1.0, 1.0), &q));
        assert!(!ponto_no_poligono(v(3.0, 1.0), &q));
        assert_eq!(dist_ao_segmento(v(1.0, 1.0), q[0], q[1]), 1.0);
        assert_eq!(dist_ao_segmento(v(-3.0, 4.0), q[0], q[1]), 5.0);
        assert_eq!(dist_ao_segmento(v(3.0, 4.0), q[0], q[0]), 5.0);
        assert!(dentro_ou_sobre(v(2.0, 1.0), &q, 1e-9));
        assert!(dentro_ou_sobre(v(0.0, 0.0), &q, 1e-9));
        assert!(!dentro_ou_sobre(v(2.001, 1.0), &q, 1e-9));
    }

    #[test]
    fn assinatura_separa_os_terrenos() {
        let mut s = SecoesTerreno::default();
        s.vertices.insert(0, vert(1, ID_AUSENTE, 0, 0.0, 0.0));
        s.vertices.insert(1, vert(2, ID_AUSENTE, 0, 0.0, 0.0));
        let a = assinaturas(&s);
        s.vertices.insert(1, vert(2, ID_AUSENTE, 0, 0.5, 0.0));
        let b = assinaturas(&s);
        assert_eq!(a[&1], b[&1]);
        assert_ne!(a[&2], b[&2]);
        assert_eq!(terrenos_do_nivel(&s, 0), Vec::<u32>::new());
    }
}
