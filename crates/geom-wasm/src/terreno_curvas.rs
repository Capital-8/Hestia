//! Terreno (PLANO do terreno A.4 regra 10): curvas de nível, consulta 161 (`terreno_curvas`).
//!
//! Cotas `k · intervalo` (k inteiro) entre o mínimo e o máximo da superfície. Vértice com cota IGUAL à da curva conta como ACIMA (regra única): por isso não
//! há curva na cota mínima, e na cota de um pico isolado os segmentos têm comprimento zero e são descartados. Cada triângulo atravessado dá um segmento, cujas
//! pontas são calculadas sempre do vértice de baixo para o de cima da aresta: os dois triângulos de uma aresta chegam ao mesmo ponto, bit a bit. O segmento
//! é orientado com o lado alto à esquerda. Segmento menor que `1e-9` é descartado; os demais são encadeados pela extremidade quantizada em `1e-7`.
//!
//! Saída: `linhas [terreno_num, mestra, fechada, n_pontos]`, `pontos [x, y]` e `cotas [z]` (uma por linha). Linha fechada NÃO repete o primeiro ponto.
//! Ordem: terreno, cota crescente e, na mesma cota, as abertas e depois as fechadas, cada grupo pela ordem dos triângulos.

use std::collections::HashMap;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE};
use crate::terreno_avalia::Malha;
use crate::terreno_tipos::{existente, terrenos_do_nivel};

/// Máximo de cotas distintas por terreno (acima disso, `LIMITE`).
pub const MAX_COTAS: f64 = 2000.0;
/// Segmento mais curto que isto é descartado.
pub const SEGMENTO_MIN: f64 = 1e-9;
/// Passo da quantização das extremidades no encadeamento.
pub const QUANTO: f64 = 1e-7;

/// Uma curva de nível encadeada.
#[derive(Clone, Debug, PartialEq)]
pub struct Curva {
    /// Índice da cota: `z = k · intervalo`.
    pub k: i64,
    pub z: f64,
    pub mestra: bool,
    pub fechada: bool,
    /// Pontos em planta. Fechada: o último liga no primeiro (sem repetir).
    pub pontos: Vec<[f64; 2]>,
}

/// Chave de encadeamento de um ponto (quantizado em `QUANTO`).
pub fn chave_ponto(p: [f64; 2]) -> (i64, i64) {
    ((p[0] / QUANTO).round() as i64, (p[1] / QUANTO).round() as i64)
}

/// Um segmento orientado, com as chaves das duas pontas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Segmento {
    pub a: [f64; 2],
    pub b: [f64; 2],
}

/// Encadeia segmentos orientados pela extremidade quantizada. Devolve `(pontos, fechada)` por cadeia: primeiro as abertas (começam onde saem mais segmentos
/// do que chegam), depois as fechadas, cada grupo pela ordem dos segmentos. Em nó com mais de uma saída segue o segmento de menor índice ainda não usado.
/// Segmento cujas duas pontas caem na mesma chave não liga nada e é descartado.
pub fn encadear(segmentos: &[Segmento]) -> Vec<(Vec<[f64; 2]>, bool)> {
    let chaves: Vec<((i64, i64), (i64, i64))> = segmentos.iter().map(|s| (chave_ponto(s.a), chave_ponto(s.b))).collect();
    let mut saidas: HashMap<(i64, i64), Vec<u32>> = HashMap::with_capacity(segmentos.len());
    let mut saldo: HashMap<(i64, i64), i32> = HashMap::with_capacity(segmentos.len());
    let mut usado = vec![false; segmentos.len()];
    for (i, &(ka, kb)) in chaves.iter().enumerate() {
        if ka == kb {
            usado[i] = true;
            continue;
        }
        saidas.entry(ka).or_default().push(i as u32);
        *saldo.entry(ka).or_insert(0) += 1;
        *saldo.entry(kb).or_insert(0) -= 1;
    }
    // Próxima saída a tentar em cada nó (as listas estão em ordem crescente de índice).
    let mut cursor: HashMap<(i64, i64), usize> = HashMap::with_capacity(saidas.len());
    let mut out = Vec::new();
    for abertas in [true, false] {
        for inicio in 0..segmentos.len() {
            if usado[inicio] {
                continue;
            }
            let k0 = chaves[inicio].0;
            if abertas {
                match saldo.get_mut(&k0) {
                    Some(s) if *s > 0 => *s -= 1,
                    _ => continue,
                }
            }
            let mut pontos = vec![segmentos[inicio].a];
            let mut atual = inicio;
            let fechada = loop {
                usado[atual] = true;
                let fim = chaves[atual].1;
                if fim == k0 {
                    break true;
                }
                pontos.push(segmentos[atual].b);
                let lista = saidas.get(&fim).map_or(&[][..], |v| v.as_slice());
                let c = cursor.entry(fim).or_insert(0);
                while *c < lista.len() && usado[lista[*c] as usize] {
                    *c += 1;
                }
                match lista.get(*c) {
                    Some(&prox) => atual = prox as usize,
                    None => break false,
                }
            };
            out.push((pontos, fechada));
        }
    }
    out
}

/// Ponto da curva de cota `z` na aresta que vai de `baixo` (cota menor que `z`) a `cima` (cota maior ou igual).
fn cruzamento(baixo: [f64; 3], cima: [f64; 3], z: f64) -> [f64; 2] {
    let t = ((z - baixo[2]) / (cima[2] - baixo[2])).clamp(0.0, 1.0);
    if t >= 1.0 {
        return [cima[0], cima[1]];
    }
    [baixo[0] + (cima[0] - baixo[0]) * t, baixo[1] + (cima[1] - baixo[1]) * t]
}

/// Segmento da curva de cota `z` no triângulo `p` (anti-horário), com o lado alto à esquerda. `None` se o triângulo não é atravessado ou o segmento é
/// menor que `SEGMENTO_MIN`.
pub fn segmento_no_triangulo(p: [[f64; 3]; 3], z: f64) -> Option<Segmento> {
    let acima = p.map(|q| q[2] >= z);
    let (mut entra, mut sai) = (None, None);
    for i in 0..3 {
        let j = (i + 1) % 3;
        if !acima[i] && acima[j] {
            entra = Some(cruzamento(p[i], p[j], z));
        } else if acima[i] && !acima[j] {
            sai = Some(cruzamento(p[j], p[i], z));
        }
    }
    let (a, b) = (sai?, entra?);
    if crate::geo2d::hipot(b[0] - a[0], b[1] - a[1]) < SEGMENTO_MIN {
        return None;
    }
    Some(Segmento { a, b })
}

/// Curvas de nível de uma malha. `ENTRADA` se o intervalo não é positivo; `LIMITE` com mais de `MAX_COTAS` cotas entre o mínimo e o máximo.
pub fn curvas_da_malha(m: &Malha, intervalo: f64, mestra_cada: u32) -> Result<Vec<Curva>, u32> {
    let Some((z_min, z_max)) = m.z_min_max().filter(|_| !m.t.is_empty()) else { return Ok(Vec::new()) };
    if !(intervalo > 0.0 && intervalo.is_finite()) {
        return Err(ENTRADA);
    }
    let (k_min, k_max) = ((z_min / intervalo).ceil(), (z_max / intervalo).floor());
    // O teto de 1e15 mantém `k` exato em `f64` e longe do estouro de `i64`.
    if !(k_min.abs() <= 1e15 && k_max.abs() <= 1e15) || k_max - k_min + 1.0 > MAX_COTAS {
        return Err(LIMITE);
    }
    if k_max < k_min {
        return Ok(Vec::new());
    }
    let (k_min, n) = (k_min as i64, (k_max - k_min) as usize + 1);
    let mut por_cota: Vec<Vec<Segmento>> = vec![Vec::new(); n];
    for t in &m.t {
        let p = t.map(|i| m.v[i as usize]);
        let (lo, hi) = (p[0][2].min(p[1][2]).min(p[2][2]), p[0][2].max(p[1][2]).max(p[2][2]));
        // Folga de uma cota para cada lado: quem decide é a comparação exata com `k · intervalo` em `segmento_no_triangulo`.
        let de = (((lo / intervalo).floor() as i64) - 1).max(k_min);
        let ate = (((hi / intervalo).ceil() as i64) + 1).min(k_min + n as i64 - 1);
        for k in de..=ate {
            if let Some(s) = segmento_no_triangulo(p, k as f64 * intervalo) {
                por_cota[(k - k_min) as usize].push(s);
            }
        }
    }
    let mut out = Vec::new();
    for (d, segs) in por_cota.iter().enumerate() {
        let k = k_min + d as i64;
        let mestra = mestra_cada > 0 && k.rem_euclid(i64::from(mestra_cada)) == 0;
        for (pontos, fechada) in encadear(segs) {
            out.push(Curva { k, z: k as f64 * intervalo, mestra, fechada, pontos });
        }
    }
    Ok(out)
}

/// Consulta 161 (`terreno_curvas`): terrenos do nível por `id_num` crescente. Até a ficha R3 a superfície proposta devolve o mesmo que a existente.
pub fn consulta_terreno_curvas(cena: &Cena, nivel: u32, _superficie: u32) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut pontos, mut cotas) = (Vec::new(), Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let e = existente(cena, t)?;
        let Some(def) = cena.terreno.terrenos.get(&t) else { continue };
        for c in curvas_da_malha(&e.e, def.intervalo, def.mestra_cada)? {
            linhas.extend_from_slice(&[t, u32::from(c.mestra), u32::from(c.fechada), c.pontos.len() as u32]);
            pontos.extend(c.pontos.iter().flatten());
            cotas.push(c.z);
        }
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(pontos), Saida::F64(cotas)])
}

#[cfg(test)]
mod testes {
    use super::*;

    fn seg(a: [f64; 2], b: [f64; 2]) -> Segmento {
        Segmento { a, b }
    }

    #[test]
    fn chave_quantiza_em_1e_7() {
        assert_eq!(chave_ponto([1.0, -2.0]), (10_000_000, -20_000_000));
        assert_eq!(chave_ponto([1.0 + 4e-8, 0.0]), chave_ponto([1.0, 0.0]));
        assert_ne!(chave_ponto([1.0 + 6e-8, 0.0]), chave_ponto([1.0, 0.0]));
    }

    #[test]
    fn encadeia_aberta_e_fechada_fora_de_ordem() {
        let p = [[0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [3.0, 0.0]];
        let q = [[0.0, 5.0], [1.0, 5.0], [1.0, 6.0]];
        let segs = [seg(q[1], q[2]), seg(p[2], p[3]), seg(q[2], q[0]), seg(p[0], p[1]), seg(q[0], q[1]), seg(p[1], [2.0 + 3e-8, 0.0])];
        let c = encadear(&segs);
        assert_eq!(c.len(), 2);
        assert_eq!(c[0], (vec![p[0], p[1], [2.0 + 3e-8, 0.0], p[3]], false), "a aberta primeiro, do começo ao fim, colada pela chave");
        assert_eq!(c[1], (vec![q[1], q[2], q[0]], true), "a fechada não repete o primeiro ponto");
        assert!(encadear(&[]).is_empty());
        assert!(encadear(&[seg(p[0], [2e-8, 0.0])]).is_empty(), "pontas na mesma chave: descartado");
    }

    #[test]
    fn no_com_duas_saidas_segue_o_menor_indice() {
        // Dois laços que se tocam em O.
        let o = [0.0, 0.0];
        let segs = [seg(o, [1.0, 0.0]), seg([1.0, 0.0], o), seg(o, [-1.0, 0.0]), seg([-1.0, 0.0], o)];
        let c = encadear(&segs);
        assert_eq!(c, vec![(vec![o, [1.0, 0.0]], true), (vec![o, [-1.0, 0.0]], true)]);
    }

    #[test]
    fn segmento_com_o_lado_alto_a_esquerda_e_cota_igual_conta_como_acima() {
        let t = [[0.0, 0.0, 0.0], [2.0, 0.0, 2.0], [0.0, 2.0, 0.0]];
        let s = segmento_no_triangulo(t, 1.0).expect("atravessado");
        assert_eq!((s.a, s.b), ([1.0, 1.0], [1.0, 0.0]), "desce em y com o lado alto (x maior) à esquerda");
        assert_eq!(segmento_no_triangulo(t, 0.0), None, "tudo acima ou igual: sem curva");
        assert_eq!(segmento_no_triangulo(t, 2.0), None, "só um vértice na cota: segmento de comprimento zero");
        assert_eq!(segmento_no_triangulo(t, 3.0), None);
        // Aresta inteira na cota, com o terceiro vértice abaixo: a própria aresta.
        let u = [[0.0, 0.0, 1.0], [2.0, 0.0, 1.0], [0.0, 2.0, 0.0]];
        let s = segmento_no_triangulo(u, 1.0).expect("aresta");
        assert_eq!((s.a, s.b), ([2.0, 0.0], [0.0, 0.0]));
    }

    #[test]
    fn curvas_de_um_triangulo_intervalo_invalido_e_limite() {
        let m = Malha::nova(vec![[0.0, 0.0, -1.0], [4.0, 0.0, 3.0], [0.0, 4.0, -1.0]], vec![0, 1, 2], vec![[0, 1, 2]], Vec::new());
        let c = curvas_da_malha(&m, 1.0, 2).expect("curvas");
        assert_eq!(c.iter().map(|c| (c.k, c.z, c.mestra, c.fechada, c.pontos.len())).collect::<Vec<_>>(), vec![(0, 0.0, true, false, 2), (1, 1.0, false, false, 2), (2, 2.0, true, false, 2)]);
        assert_eq!(c[0].pontos, vec![[1.0, 3.0], [1.0, 0.0]]);
        assert!(curvas_da_malha(&m, 1.0, 0).expect("curvas").iter().all(|c| !c.mestra), "mestra_cada 0: nenhuma mestra");
        assert_eq!(curvas_da_malha(&m, 0.0, 5), Err(ENTRADA));
        assert_eq!(curvas_da_malha(&m, -1.0, 5), Err(ENTRADA));
        assert_eq!(curvas_da_malha(&m, f64::NAN, 5), Err(ENTRADA));
        assert_eq!(curvas_da_malha(&m, 0.001, 5), Err(LIMITE));
        assert_eq!(curvas_da_malha(&m, 1e-320, 5), Err(LIMITE));
        assert_eq!(curvas_da_malha(&m, 0.002, 5), Err(LIMITE), "de −500 a 1500 são 2001 cotas");
        assert!(curvas_da_malha(&m, 0.0025, 5).is_ok_and(|c| (1598..=1601).contains(&c.len())), "1601 cotas cabem");
        assert_eq!(curvas_da_malha(&Malha::default(), 0.0, 5), Ok(Vec::new()), "sem triângulos não há o que conferir");
        assert_eq!(curvas_da_malha(&m, 10.0, 5).map(|c| c.len()), Ok(1), "só a cota 0");
    }
}
