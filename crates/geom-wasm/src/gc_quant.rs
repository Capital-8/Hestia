//! Quantidades do guarda-corpo (decisão 0055, Fase 4a; consulta `quant_guarda`, id 64, ADR §6.2 e §7.1). Um único caminho de agregação:
//!
//! 1. `quantificar_pecas` gera as peças do nível (`PecaGC`, a mesma peça que planta, corte e malha usam) a partir das cadeias reais da Fase 3a
//!    (`guarda_caminhos`) e das seções do tipo;
//! 2. `quant_guarda` agrupa as peças por `(guarda, papel, perfil, material)`: número de peças, comprimento, área lateral, volume e área projetada.
//!
//! Regras de contagem (ADR §5.2, §5.5, §5.6, §5.7), com as escolhas registradas em 0055 §16:
//! - Nós: extremos de cada trecho, vértices com giro acima de `postes.canto.ang_canto` e vértices com mudança de inclinação. Trecho curvo
//!   (caracol) não tem nó no meio do arco.
//! - Postes: início e fim de cada trecho; canto em cada nó interior (com `canto.ativo`); intermediários por segmento entre nós, pelo espaçamento
//!   horizontal, descartando os que cairiam a menos de meia largura de um poste de nó.
//! - Balaústres: por vão entre postes (`escopo` 0) ou por segmento (`escopo` 1), com a folga de meia largura do poste e do primeiro/último
//!   elemento. Justificações `inicio`, `fim`, `centro`, `folga-nas-pontas` e `distribuir` (n + 1 repetições, a última no fim do vão). Elementos que
//!   colidem com um poste saem. Elemento vazio ocupa espaço e não conta.
//! - Painéis: um por vão entre postes, dividido em `ceil(Lu / larguraMaxima)` painéis iguais com `folgaLateral` entre eles.
//! - Trilhos e corrimãos: a peça é a varredura do trecho (3D). Extensões do corrimão somam ao comprimento da ponta; `posicao` ambas gera duas peças.
//!
//! Pendente (0055 §16): balaústres de `porDegrau`, quebra `nunca` com remoção por canto da 3c, área líquida de painel perfurado, suportes, cabos,
//! extensão `maisPiso`. As peças são só de quantidade até a 3b (a posição x, y delas é 0 onde a 3b ainda não define o eixo).

use std::collections::BTreeMap;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, ID_AUSENTE, INTERNO, NIVEL_TODOS};
use crate::gc_caminho::{FLAG_CURVO, FLAG_FECHADO};
use crate::gc_planta::{na_grade, FormaGC, PecaGC, PAPEL_BALAUSTRE, PAPEL_CORRIMAO, PAPEL_POSTE, PAPEL_TRAVESSA, PAPEL_TRILHO};
use crate::gc_tipos::*;
use crate::secoes_gc::{ElementoPadraoLinha, PadraoLinha, PerfilGuardaLinha, PosteLinha, SecoesGC, TrilhoLinha};

/// `justif` de `padroes_guarda`: 0 início, 1 fim, 2 centro, 3 distribuir.
const JUSTIF_INICIO: u8 = 0;
const JUSTIF_FIM: u8 = 1;
const JUSTIF_CENTRO: u8 = 2;
const JUSTIF_DISTRIBUIR: u8 = 3;
/// `sobra`: 1 balaústre extra, 2 folga nas pontas.
const SOBRA_BALAUSTRE_EXTRA: u8 = 1;
const SOBRA_FOLGA_NAS_PONTAS: u8 = 2;
/// `quebra`: 0 cada segmento, 1 ângulo, 2 nunca.
const QUEBRA_CADA_SEGMENTO: u8 = 0;
const QUEBRA_ANGULO: u8 = 1;
/// `escopo`: 0 vão, 1 segmento.
const ESCOPO_VAO: u8 = 0;
const ESCOPO_SEGMENTO: u8 = 1;
/// `modo` do intermediário de `postes_guarda`.
const MODO_ESPACAMENTO_MAXIMO: u8 = 1;
const MODO_ESPACAMENTO_FIXO: u8 = 2;
const MODO_NUMERO_FIXO: u8 = 3;
/// `posicao` do corrimão: 3 = ambas as laterais.
const POSICAO_AMBAS: u8 = 3;
/// `funcao` do corrimão: 0 topo (travessa superior), 1 corrimão.
const FUNCAO_TOPO: u8 = 0;
/// `estilo` da extensão: 0 nenhum.
const ESTILO_NENHUM: u8 = 0;
/// Giro em planta padrão de canto (rad, 5°) quando o tipo não tem a linha de canto.
const ANG_CANTO_PADRAO: f64 = 0.0873;

/// Uma linha agregada de `quant_guarda`.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaQuant {
    pub guarda: u32,
    pub papel: u32,
    pub perfil_num: u32,
    pub material_num: u32,
    pub n_pecas: u32,
    pub comprimento: f64,
    pub area: f64,
    pub volume: f64,
    pub area_projetada: f64,
}

/// `(comprimento, largura em elevação, área lateral, volume)` de uma peça.
fn medidas(p: &PecaGC) -> (f64, f64, f64, f64) {
    match &p.forma {
        FormaGC::Vertical { z0, z1, largura, .. } => {
            let c = (z1 - z0).abs();
            (c, *largura, p.perimetro * c, p.area_secao * c)
        }
        FormaGC::Varrida { nos, largura, .. } => {
            let c: f64 = nos.windows(2).map(|w| ((w[1].x - w[0].x).powi(2) + (w[1].y - w[0].y).powi(2) + (w[1].z - w[0].z).powi(2)).sqrt()).sum();
            (c, *largura, p.perimetro * c, p.area_secao * c)
        }
        FormaGC::Painel { a, b, altura, espessura } => {
            let c = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2)).sqrt();
            (c, *altura, 2.0 * c * altura, c * altura * espessura)
        }
    }
}

/// Agrupa as peças por `(guarda, papel, perfil, material)`, em ordem de chave; números na grade de 1 µm.
pub fn quant_guarda(pecas: &[PecaGC]) -> Vec<LinhaQuant> {
    let mut g: BTreeMap<(u32, u32, u32, u32), LinhaQuant> = BTreeMap::new();
    for p in pecas {
        let (c, w, area, vol) = medidas(p);
        let l = g.entry((p.guarda, p.papel, p.perfil_num, p.material_num)).or_insert(LinhaQuant {
            guarda: p.guarda,
            papel: p.papel,
            perfil_num: p.perfil_num,
            material_num: p.material_num,
            n_pecas: 0,
            comprimento: 0.0,
            area: 0.0,
            volume: 0.0,
            area_projetada: 0.0,
        });
        l.n_pecas += 1;
        l.comprimento += c;
        l.area += area;
        l.volume += vol;
        l.area_projetada += w * c;
    }
    g.into_values()
        .map(|mut l| {
            l.comprimento = na_grade(l.comprimento);
            l.area = na_grade(l.area);
            l.volume = na_grade(l.volume);
            l.area_projetada = na_grade(l.area_projetada);
            l
        })
        .collect()
}

/// Saída plana: `linhas` `[guarda_num, papel, perfil_num, material_num, n_pecas]`, `valores` `[comprimento, area, volume, area_projetada]`.
pub fn achatar_quant(l: &[LinhaQuant]) -> (Vec<u32>, Vec<f64>) {
    let mut a = Vec::new();
    let mut v = Vec::new();
    for x in l {
        a.extend_from_slice(&[x.guarda, x.papel, x.perfil_num, x.material_num, x.n_pecas]);
        v.extend_from_slice(&[x.comprimento, x.area, x.volume, x.area_projetada]);
    }
    (a, v)
}

/// Geometria de um perfil: área da seção, perímetro, largura e altura vistas (m).
#[derive(Clone, Copy, Debug)]
struct Secao {
    area: f64,
    perimetro: f64,
    largura: f64,
    altura: f64,
    circular: bool,
}

fn secao_do_perfil(gc: &SecoesGC, perfil: u32) -> Result<Secao, u32> {
    let p: &PerfilGuardaLinha = gc.perfis.get(&perfil).ok_or(ENTRADA)?;
    match p.forma {
        FORMA_CIRCULAR => {
            let d = p.largura;
            Ok(Secao { area: std::f64::consts::PI * d * d / 4.0, perimetro: std::f64::consts::PI * d, largura: d, altura: d, circular: true })
        }
        FORMA_RETANGULAR => Ok(Secao { area: p.largura * p.altura, perimetro: 2.0 * (p.largura + p.altura), largura: p.largura, altura: p.altura, circular: false }),
        FORMA_POLIGONO => {
            let mut pts: Vec<(u32, f64, f64)> = gc.perfis_pontos.values().filter(|x| x.perfil == perfil).map(|x| (x.indice, x.x, x.y)).collect();
            pts.sort_by_key(|x| x.0);
            if pts.len() < 3 {
                return Err(ENTRADA);
            }
            let n = pts.len();
            let mut dupla = 0.0;
            let mut perim = 0.0;
            for i in 0..n {
                let (a, b) = (pts[i], pts[(i + 1) % n]);
                dupla += a.1 * b.2 - b.1 * a.2;
                perim += (b.1 - a.1).hypot(b.2 - a.2);
            }
            let (x0, x1) = pts.iter().fold((f64::MAX, f64::MIN), |(lo, hi), x| (lo.min(x.1), hi.max(x.1)));
            let (y0, y1) = pts.iter().fold((f64::MAX, f64::MIN), |(lo, hi), x| (lo.min(x.2), hi.max(x.2)));
            Ok(Secao { area: dupla.abs() / 2.0, perimetro: perim, largura: x1 - x0, altura: y1 - y0, circular: false })
        }
        _ => Err(ENTRADA),
    }
}

/// Peça vertical de `z0` a `z1` com a seção do perfil.
fn peca_vertical(guarda: u32, papel: u32, perfil: u32, material: u32, s: &Secao, z0: f64, z1: f64) -> PecaGC {
    PecaGC {
        guarda,
        papel,
        perfil_num: perfil,
        material_num: material,
        area_secao: s.area,
        perimetro: s.perimetro,
        forma: FormaGC::Vertical { x: 0.0, y: 0.0, z0, z1, largura: s.largura, profundidade: s.altura, circular: s.circular },
    }
}

/// Peça varrida ao longo de `nos` com a seção do perfil.
fn peca_varrida(guarda: u32, papel: u32, perfil: u32, material: u32, s: &Secao, nos: Vec<No3>) -> PecaGC {
    PecaGC {
        guarda,
        papel,
        perfil_num: perfil,
        material_num: material,
        area_secao: s.area,
        perimetro: s.perimetro,
        forma: FormaGC::Varrida { nos, largura: s.largura, altura: s.altura },
    }
}

/// Cota da base de um padrão ou painel (0 = hospedeiro; 1 = trilho `indice`).
fn cota_base(gc: &SecoesGC, tipo: u32, de: u8, indice: u32) -> Result<f64, u32> {
    match de {
        REF_HOSPEDEIRO_OU_ALTURA => Ok(0.0),
        REF_TRILHO => Ok(trilho_de(gc, tipo, indice)?.altura),
        _ => Err(ENTRADA),
    }
}

/// Cota do topo: 0 = altura do guarda-corpo `h`; 1 = trilho; 2 = corrimão.
fn cota_topo(gc: &SecoesGC, tipo: u32, h: f64, de: u8, indice: u32) -> Result<f64, u32> {
    match de {
        REF_HOSPEDEIRO_OU_ALTURA => Ok(h),
        REF_TRILHO => Ok(trilho_de(gc, tipo, indice)?.altura),
        REF_CORRIMAO => Ok(gc.corrimaos.values().find(|c| c.tipo == tipo && c.indice == indice).ok_or(ENTRADA)?.altura),
        _ => Err(ENTRADA),
    }
}

fn trilho_de(gc: &SecoesGC, tipo: u32, indice: u32) -> Result<&TrilhoLinha, u32> {
    gc.trilhos.values().find(|t| t.tipo == tipo && t.indice == indice).ok_or(ENTRADA)
}

/// Largura de um elemento de padrão (0 quando vazio).
fn largura_elemento(gc: &SecoesGC, e: &ElementoPadraoLinha) -> Result<f64, u32> {
    if e.perfil == ID_AUSENTE {
        Ok(0.0)
    } else {
        Ok(secao_do_perfil(gc, e.perfil)?.largura)
    }
}

/// Nó de um trecho: comprimento horizontal acumulado e giro em planta.
#[derive(Clone, Copy, Debug)]
struct No {
    s: f64,
    virada: f64,
}

/// Nós de um trecho (extremos e, em trecho não curvo, vértices de canto ou de mudança de inclinação), com o comprimento horizontal acumulado.
fn nos_do_trecho(t: &TrechoGC, ang_canto: f64) -> (Vec<f64>, Vec<No>) {
    let n = t.nos.len();
    let mut s = vec![0.0; n];
    for k in 1..n {
        let (a, b) = (t.nos[k - 1], t.nos[k]);
        s[k] = s[k - 1] + (b.x - a.x).hypot(b.y - a.y);
    }
    let mut nos = vec![No { s: 0.0, virada: 0.0 }];
    if !t.curvo && n >= 3 {
        for k in 1..n - 1 {
            let (a, b, c) = (t.nos[k - 1], t.nos[k], t.nos[k + 1]);
            let (d1x, d1y) = (b.x - a.x, b.y - a.y);
            let (d2x, d2y) = (c.x - b.x, c.y - b.y);
            let (l1, l2) = (d1x.hypot(d1y), d2x.hypot(d2y));
            if l1 <= 1e-12 || l2 <= 1e-12 {
                continue;
            }
            let virada = (d1x * d2y - d1y * d2x).atan2(d1x * d2x + d1y * d2y).abs();
            let trans = ((b.z - a.z) / l1 - (c.z - b.z) / l2).abs() > 1e-9;
            if virada > ang_canto + 1e-12 || trans {
                nos.push(No { s: s[k], virada });
            }
        }
    }
    nos.push(No { s: s[n - 1], virada: 0.0 });
    (s, nos)
}

/// Poste de um trecho, com o que as contagens precisam.
#[derive(Clone, Copy, Debug)]
struct PostePos {
    s: f64,
    largura: f64,
    perfil: u32,
    material: u32,
    altura: f64,
}

fn linha_poste(gc: &SecoesGC, tipo: u32, papel: u8) -> Option<&PosteLinha> {
    gc.postes.values().find(|p| p.tipo == tipo && p.papel == papel && p.ativo)
}

/// Postes de um trecho (ver a regra no topo do arquivo).
fn postes_do_trecho(gc: &SecoesGC, tipo: u32, h: f64, flags: u8, nos: &[No]) -> Result<Vec<PostePos>, u32> {
    let mut out: Vec<PostePos> = Vec::new();
    let altura = |p: &PosteLinha| h + p.acima + p.abaixo;
    let poste = |p: &PosteLinha, s: f64| -> Result<PostePos, u32> {
        let sec = secao_do_perfil(gc, p.perfil)?;
        Ok(PostePos { s, largura: sec.largura, perfil: p.perfil, material: p.material, altura: altura(p) })
    };
    let inicio = linha_poste(gc, tipo, POSTE_INICIO);
    let fim = linha_poste(gc, tipo, POSTE_FIM);
    let canto = linha_poste(gc, tipo, POSTE_CANTO);
    let intermediario = linha_poste(gc, tipo, POSTE_INTERMEDIARIO);
    let largura_no = |i: usize| -> Result<f64, u32> {
        let linha = if i == 0 {
            inicio
        } else if i == nos.len() - 1 {
            fim
        } else {
            canto
        };
        match linha {
            Some(p) => Ok(secao_do_perfil(gc, p.perfil)?.largura),
            None => Ok(0.0),
        }
    };
    let ultimo_s = nos[nos.len() - 1].s;
    if let Some(p) = inicio {
        out.push(poste(p, 0.0)?);
    }
    if let Some(p) = fim {
        out.push(poste(p, ultimo_s)?);
    }
    if let Some(p) = canto {
        for no in &nos[1..nos.len() - 1] {
            out.push(poste(p, no.s)?);
        }
    }
    if let (true, Some(r)) = (flags & FLAG_POSTES_INTERMEDIARIOS != 0, intermediario) {
        if r.modo != 0 {
            let wi = secao_do_perfil(gc, r.perfil)?.largura;
            for w in 0..nos.len() - 1 {
                let (a, b) = (nos[w], nos[w + 1]);
                let l = b.s - a.s;
                if l <= 1e-12 {
                    continue;
                }
                let (wa, wb) = (largura_no(w)?, largura_no(w + 1)?);
                let posicoes: Vec<f64> = match r.modo {
                    MODO_ESPACAMENTO_MAXIMO => {
                        if r.espacamento <= 0.0 {
                            return Err(ENTRADA);
                        }
                        let n = ((l / r.espacamento - 1e-9).ceil() as i64 - 1).max(0) as u32;
                        (1..=n).map(|j| a.s + l * j as f64 / (n + 1) as f64).collect()
                    }
                    MODO_ESPACAMENTO_FIXO => {
                        if r.espacamento <= 0.0 {
                            return Err(ENTRADA);
                        }
                        let mut v = Vec::new();
                        let mut k = 1u32;
                        while (k as f64) * r.espacamento < l - 1e-12 {
                            v.push(a.s + (k as f64) * r.espacamento);
                            k += 1;
                        }
                        v
                    }
                    MODO_NUMERO_FIXO => (1..=r.numero).map(|j| a.s + l * j as f64 / (r.numero + 1) as f64).collect(),
                    _ => return Err(ENTRADA),
                };
                for s in posicoes {
                    if s - a.s >= wi / 2.0 + wa / 2.0 - 1e-9 && b.s - s >= wi / 2.0 + wb / 2.0 - 1e-9 {
                        out.push(poste(r, s)?);
                    }
                }
            }
        }
    }
    Ok(out)
}

/// Quebras de padrão do trecho (índices em `nos`).
fn quebras(nos: &[No], quebra: u8, ang_quebra: f64) -> Vec<usize> {
    let ultimo = nos.len() - 1;
    match quebra {
        QUEBRA_CADA_SEGMENTO => (0..nos.len()).collect(),
        QUEBRA_ANGULO => (0..nos.len()).filter(|&i| i == 0 || i == ultimo || nos[i].virada > ang_quebra).collect(),
        _ => vec![0, ultimo],
    }
}

/// Vãos entre `s_a` e `s_b`: (início, fim, largura do poste em cada ponta). `escopo` vão = por poste; segmento = inteiro.
fn vaos(posts: &[PostePos], s_a: f64, s_b: f64, escopo: u8) -> Vec<(f64, f64, f64, f64)> {
    let largura_em = |s: f64| posts.iter().filter(|x| (x.s - s).abs() < 1e-9).map(|x| x.largura).fold(0.0, f64::max);
    if escopo == ESCOPO_SEGMENTO {
        return vec![(s_a, s_b, largura_em(s_a), largura_em(s_b))];
    }
    let mut pts: Vec<f64> = vec![s_a];
    let mut meio: Vec<f64> = posts.iter().map(|x| x.s).filter(|&s| s > s_a + 1e-9 && s < s_b - 1e-9).collect();
    meio.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    for s in meio {
        if (s - pts[pts.len() - 1]).abs() > 1e-9 {
            pts.push(s);
        }
    }
    pts.push(s_b);
    pts.windows(2).map(|w| (w[0], w[1], largura_em(w[0]), largura_em(w[1]))).collect()
}

/// Centros dos elementos de um padrão num vão: (índice do elemento, posição horizontal). Ver §5.6 e a regra no topo.
fn centros_do_padrao(gc: &SecoesGC, els: &[ElementoPadraoLinha], pad: &PadraoLinha, vao: (f64, f64, f64, f64), posts: &[PostePos]) -> Result<Vec<(usize, f64)>, u32> {
    if els.is_empty() {
        return Ok(Vec::new());
    }
    let (p, q, wp, wq) = vao;
    let n = els.len();
    let w: Vec<f64> = els.iter().map(|e| largura_elemento(gc, e)).collect::<Result<_, _>>()?;
    let mut e = vec![0.0; n];
    for i in 1..n {
        e[i] = e[i - 1] + els[i].dist_anterior;
    }
    let d = e[n - 1];
    let a = p + wp / 2.0 + w[0] / 2.0;
    let b = q - wq / 2.0 - w[n - 1] / 2.0;
    let lu = b - a;
    if lu < -1e-9 {
        return Ok(Vec::new());
    }
    let per = pad.periodo;
    let mut bases: Vec<f64> = vec![0.0];
    let mut sobra_extra = false;
    if lu + 1e-9 >= d {
        let folga = lu - d;
        match pad.justif {
            JUSTIF_DISTRIBUIR => {
                if per > 1e-12 && folga > 1e-12 {
                    let k = (folga / per - 1e-9).ceil() as u32;
                    bases = (0..=k).map(|j| j as f64 * folga / k as f64).collect();
                }
            }
            JUSTIF_INICIO | JUSTIF_FIM | JUSTIF_CENTRO => {
                let k = if per > 1e-12 { (folga / per + 1e-9).floor() as u32 + 1 } else { 1 };
                let s_sobra = lu - ((k - 1) as f64 * per + d);
                let base = if pad.sobra == SOBRA_FOLGA_NAS_PONTAS {
                    s_sobra / 2.0
                } else {
                    match pad.justif {
                        JUSTIF_INICIO => 0.0,
                        JUSTIF_FIM => s_sobra,
                        _ => s_sobra / 2.0,
                    }
                };
                bases = (0..k).map(|j| base + j as f64 * per).collect();
                sobra_extra = pad.sobra == SOBRA_BALAUSTRE_EXTRA && s_sobra >= per / 2.0 - 1e-9;
            }
            _ => return Err(ENTRADA),
        }
    } else {
        // O padrão inteiro não cabe: só o início do padrão, sem cortar elemento (ADR §5.6).
        bases = vec![0.0];
    }
    let mut centros: Vec<(usize, f64)> = Vec::new();
    for base in &bases {
        for (i, ei) in e.iter().enumerate() {
            let c = a + base + ei;
            if c <= b + 1e-9 {
                centros.push((i, c));
            }
        }
    }
    if sobra_extra {
        centros.push((0, b));
    }
    let mut kept = Vec::new();
    for (i, c) in centros {
        if els[i].perfil == ID_AUSENTE {
            continue;
        }
        let colide = posts.iter().any(|x| (c - x.s).abs() < w[i] / 2.0 + x.largura / 2.0 - 1e-9);
        if !colide {
            kept.push((i, c));
        }
    }
    Ok(kept)
}

/// Trecho com nós e postes, já calculados.
type TrechoPlano<'a> = (&'a TrechoGC, Vec<f64>, Vec<No>, Vec<PostePos>);

/// Peças de quantidade de um nível: os guarda-corpos de `nivel` com as cadeias `cadeias` (o trecho de cada um). Guarda sem trecho não gera peça.
pub fn quantificar_pecas(gc: &SecoesGC, nivel: u32, cadeias: &CadeiaGC) -> Result<Vec<PecaGC>, u32> {
    let mut pecas: Vec<PecaGC> = Vec::new();
    for (&id, g) in &gc.guardas {
        if g.nivel != nivel {
            continue;
        }
        let trechos: Vec<&TrechoGC> = cadeias.do_guarda(id).collect();
        if trechos.is_empty() {
            continue;
        }
        let tipo_num = g.tipo;
        let tipo = gc.tipos.get(&tipo_num).ok_or(ENTRADA)?;
        let h = if g.altura.is_finite() { g.altura } else { tipo.altura };
        let ang_canto = gc.postes.values().find(|p| p.tipo == tipo_num && p.papel == POSTE_CANTO).map_or(ANG_CANTO_PADRAO, |p| p.ang_canto);
        let corrimao_on = g.flags & FLAG_CORRIMAO != 0;
        let preench_on = g.flags & FLAG_PREENCHIMENTO != 0;

        let mut por_trecho: Vec<TrechoPlano> = Vec::new();
        for &t in &trechos {
            if t.nos.len() < 2 {
                return Err(ENTRADA);
            }
            let (s, nos) = nos_do_trecho(t, ang_canto);
            let posts = postes_do_trecho(gc, tipo_num, h, g.flags, &nos)?;
            por_trecho.push((t, s, nos, posts));
        }

        // Postes.
        for (_, _, _, posts) in &por_trecho {
            for p in posts {
                let sec = secao_do_perfil(gc, p.perfil)?;
                pecas.push(peca_vertical(id, PAPEL_POSTE, p.perfil, p.material, &sec, 0.0, p.altura));
            }
        }

        // Trilhos: a varredura de cada trecho, na cota do trilho.
        for t in gc.trilhos.values().filter(|t| t.tipo == tipo_num) {
            let sec = secao_do_perfil(gc, t.perfil)?;
            for (tr, _, _, _) in &por_trecho {
                let nos: Vec<No3> = tr.nos.iter().map(|q| No3 { x: q.x, y: q.y, z: q.z + t.altura }).collect();
                pecas.push(peca_varrida(id, PAPEL_TRILHO, t.perfil, t.material, &sec, nos));
            }
        }

        // Corrimãos: o trecho mais as extensões de cada ponta (com estilo), uma peça por lateral.
        if corrimao_on {
            for c in gc.corrimaos.values().filter(|c| c.tipo == tipo_num) {
                let sec = secao_do_perfil(gc, c.perfil)?;
                let laterais = if c.posicao == POSICAO_AMBAS { 2 } else { 1 };
                let papel = if c.funcao == FUNCAO_TOPO { PAPEL_TRAVESSA } else { PAPEL_CORRIMAO };
                for (tr, _, _, _) in &por_trecho {
                    let mut nos: Vec<No3> = tr.nos.iter().map(|q| No3 { x: q.x, y: q.y, z: q.z + c.altura }).collect();
                    if c.ext_inicio.estilo != ESTILO_NENHUM && nos.len() >= 2 {
                        let (p0, p1) = (nos[0], nos[1]);
                        let (dx, dy) = (p1.x - p0.x, p1.y - p0.y);
                        let l = dx.hypot(dy).max(1e-12);
                        let ini = No3 { x: p0.x - dx / l * c.ext_inicio.comprimento, y: p0.y - dy / l * c.ext_inicio.comprimento, z: p0.z };
                        nos.insert(0, ini);
                    }
                    if c.ext_fim.estilo != ESTILO_NENHUM && nos.len() >= 2 {
                        let k = nos.len();
                        let (p0, p1) = (nos[k - 2], nos[k - 1]);
                        let (dx, dy) = (p1.x - p0.x, p1.y - p0.y);
                        let l = dx.hypot(dy).max(1e-12);
                        nos.push(No3 { x: p1.x + dx / l * c.ext_fim.comprimento, y: p1.y + dy / l * c.ext_fim.comprimento, z: p1.z });
                    }
                    for _ in 0..laterais {
                        pecas.push(peca_varrida(id, papel, c.perfil, c.material, &sec, nos.clone()));
                    }
                }
            }
        }

        // Balaústres (padrões do tipo) e painéis, por trecho, quebra e vão.
        if preench_on {
            let padroes: Vec<(u32, &PadraoLinha)> = gc.padroes.iter().filter(|(_, p)| p.tipo == tipo_num).map(|(k, p)| (*k, p)).collect();
            for (pid, pad) in padroes {
                let mut els: Vec<ElementoPadraoLinha> = gc.padrao_elementos.values().filter(|e| e.padrao == pid).copied().collect();
                els.sort_by_key(|e| e.indice);
                for (_, _, nos, posts) in &por_trecho {
                    for pair in quebras(nos, pad.quebra, pad.ang_quebra).windows(2) {
                        let (s_a, s_b) = (nos[pair[0]].s, nos[pair[1]].s);
                        if s_b - s_a <= 1e-12 {
                            continue;
                        }
                        for v in vaos(posts, s_a, s_b, pad.escopo) {
                            for (i, _c) in centros_do_padrao(gc, &els, pad, v, posts)? {
                                let e = els[i];
                                let sec = secao_do_perfil(gc, e.perfil)?;
                                let base = cota_base(gc, tipo_num, pad.base_tipo, pad.base_idx)? + e.desloc_base;
                                let topo = cota_topo(gc, tipo_num, h, pad.topo_tipo, pad.topo_idx)? + e.desloc_topo;
                                let alt = (topo - base).max(0.0);
                                pecas.push(peca_vertical(id, PAPEL_BALAUSTRE, e.perfil, e.material, &sec, 0.0, alt));
                            }
                        }
                    }
                }
            }
            for pn in gc.paineis.values().filter(|p| p.tipo == tipo_num) {
                for (_, _, nos, posts) in &por_trecho {
                    for pair in quebras(nos, QUEBRA_CADA_SEGMENTO, 0.0).windows(2) {
                        let (s_a, s_b) = (nos[pair[0]].s, nos[pair[1]].s);
                        if s_b - s_a <= 1e-12 {
                            continue;
                        }
                        for (p, q, wp, wq) in vaos(posts, s_a, s_b, ESCOPO_VAO) {
                            let lu = (q - p) - wp / 2.0 - wq / 2.0 - 2.0 * pn.folga_lateral;
                            if lu <= 1e-12 {
                                continue;
                            }
                            let n = if pn.largura_max > 0.0 { ((lu / pn.largura_max - 1e-9).ceil() as u32).max(1) } else { 1 };
                            let w = (lu - (n - 1) as f64 * pn.folga_lateral) / n as f64;
                            if w <= 1e-12 {
                                continue;
                            }
                            let base = cota_base(gc, tipo_num, pn.base_tipo, pn.base_idx)? + pn.desl_base;
                            let topo = cota_topo(gc, tipo_num, h, pn.topo_tipo, pn.topo_idx)? + pn.desl_topo;
                            let alt = (topo - base).max(0.0);
                            for _ in 0..n {
                                let mut pc = PecaGC::painel(id, No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: w, y: 0.0, z: 0.0 }, alt, pn.espessura);
                                pc.material_num = pn.material;
                                pecas.push(pc);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(pecas)
}

/// Cadeias do nível, lidas da saída de `guarda_caminhos` (Fase 3a): `trechos` (5 u32 por trecho: guarda, trecho, origem, n_nos, flags) e `nos`
/// (3 f64 por nó, em sequência, na grade de 1 µm).
fn cadeias_do_nivel(cena: &Cena, nivel: u32) -> Result<CadeiaGC, u32> {
    let saidas = crate::gc_caminho::guarda_caminhos(cena, nivel, TOL_SOLDA_NOS)?;
    let (Some(Saida::U32(t)), Some(Saida::F64(n))) = (saidas.first(), saidas.get(1)) else {
        return Err(INTERNO);
    };
    let mut trechos = Vec::with_capacity(t.len() / 5);
    let mut cursor = 0usize;
    for linha in t.chunks_exact(5) {
        let (guarda, indice, origem, n_nos, flags) = (linha[0], linha[1], linha[2], linha[3] as usize, linha[4]);
        let origem = match origem {
            0 => OrigemTrecho::Lance,
            1 => OrigemTrecho::Patamar,
            2 => OrigemTrecho::Manual,
            3 => OrigemTrecho::Caracol,
            _ => return Err(INTERNO),
        };
        let mut nos = Vec::with_capacity(n_nos);
        for k in 0..n_nos {
            let i = (cursor + k) * 3;
            let v = n.get(i..i + 3).ok_or(INTERNO)?;
            nos.push(No3 { x: v[0], y: v[1], z: v[2] });
        }
        cursor += n_nos;
        trechos.push(TrechoGC { guarda, indice, origem, curvo: flags & FLAG_CURVO != 0, fechado: flags & FLAG_FECHADO != 0, nos });
    }
    Ok(CadeiaGC { trechos })
}

/// Consulta `quant_guarda` (`nivel_num`): `linhas` U32 de 5 por linha e `valores` F64 de 4 por linha (esquema v13).
pub fn consulta_quant_guarda(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    cena.gc.validar_referencias()?;
    let cadeias = cadeias_do_nivel(cena, nivel)?;
    let pecas = quantificar_pecas(&cena.gc, nivel, &cadeias)?;
    let (u, f) = achatar_quant(&quant_guarda(&pecas));
    Ok(vec![Saida::U32(u), Saida::F64(f)])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::secoes_gc::{CorrimaoLinha, ExtensaoLinha, GuardaCorpoLinha, PainelLinha, TipoGuardaLinha};
    use crate::gc_planta::PAPEL_PAINEL;

    const TIPO: u32 = 1;
    const GUARDA: u32 = 1;
    const NIVEL: u32 = 0;
    const FLAGS_TUDO: u8 = FLAG_POSTES_INTERMEDIARIOS | FLAG_PREENCHIMENTO | FLAG_CORRIMAO;

    fn perfil_circ(d: f64) -> PerfilGuardaLinha {
        PerfilGuardaLinha { forma: FORMA_CIRCULAR, largura: d, altura: 0.0, n_pontos: 0, lados: 16 }
    }

    fn poste(papel: u8, ativo: bool, perfil: u32, modo: u8, espacamento: f64, numero: u32) -> PosteLinha {
        PosteLinha { tipo: TIPO, papel, ativo, perfil, material: 7, acima: 0.0, abaixo: 0.0, ang_canto: ANG_CANTO_PADRAO, modo, espacamento, numero }
    }

    fn tipo(altura: f64) -> TipoGuardaLinha {
        TipoGuardaLinha { altura, desloc: 0.0, ajuste_patamar: 0.0, folga_inferior: 0.0, junc_angular: 0, junc_tangente: 0, conexao: 0, tol_corda: 0.002, norma: ID_AUSENTE }
    }

    /// Guarda-corpo de 1,1 m, postes de início e fim (5 cm), intermediário por `modo`, canto por `canto_ativo`.
    fn gc_base(modo: u8, espacamento: f64, numero: u32, canto_ativo: bool, flags: u8) -> SecoesGC {
        let mut gc = SecoesGC::default();
        gc.guardas.insert(
            GUARDA,
            GuardaCorpoLinha { nivel: NIVEL, tipo: TIPO, hosp: HOSP_MANUAL, hosp_num: ID_AUSENTE, lados: 0, pos_base: 0, desloc: 0.0, altura: f64::NAN, inverter: false, fechado: false, lado_desloc: 2, cota_base: 0.0, flags },
        );
        gc.tipos.insert(TIPO, tipo(1.1));
        gc.perfis.insert(10, perfil_circ(0.05));
        gc.postes.insert(1, poste(POSTE_INICIO, true, 10, 0, 0.0, 0));
        gc.postes.insert(2, poste(POSTE_FIM, true, 10, 0, 0.0, 0));
        gc.postes.insert(3, poste(POSTE_CANTO, canto_ativo, 10, 0, 0.0, 0));
        gc.postes.insert(4, poste(POSTE_INTERMEDIARIO, true, 10, modo, espacamento, numero));
        gc
    }

    fn trecho(nos: Vec<No3>, curvo: bool) -> TrechoGC {
        TrechoGC { guarda: GUARDA, indice: 0, origem: OrigemTrecho::Manual, curvo, fechado: false, nos }
    }

    fn cadeia(t: TrechoGC) -> CadeiaGC {
        CadeiaGC { trechos: vec![t] }
    }

    fn reta(comp: f64) -> CadeiaGC {
        cadeia(trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: comp, y: 0.0, z: 0.0 }], false))
    }

    /// Peças e linhas agregadas do nível.
    fn quant(gc: &SecoesGC, c: &CadeiaGC) -> (Vec<PecaGC>, Vec<LinhaQuant>) {
        let p = quantificar_pecas(gc, NIVEL, c).expect("peças");
        let l = quant_guarda(&p);
        (p, l)
    }

    fn pecas_do(p: &[PecaGC], papel: u32) -> u32 {
        p.iter().filter(|x| x.papel == papel).count() as u32
    }

    fn soma(l: &[LinhaQuant], papel: u32, f: impl Fn(&LinhaQuant) -> f64) -> f64 {
        l.iter().filter(|x| x.papel == papel).map(f).sum()
    }

    fn n_pecas(l: &[LinhaQuant], papel: u32) -> u32 {
        l.iter().filter(|x| x.papel == papel).map(|x| x.n_pecas).sum()
    }

    #[test]
    fn postes_de_reta_com_intermediarios_por_espacamento() {
        // Reta de 3 m, intermediário a cada 1 m: 2 intermediários; com início e fim, 4 postes de 1,1 m.
        let gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        let (_, l) = quant(&gc, &reta(3.0));
        assert_eq!(n_pecas(&l, PAPEL_POSTE), 4);
        assert!((soma(&l, PAPEL_POSTE, |x| x.comprimento) - 4.4).abs() < 1e-9);
        // Sem intermediários (flag desligada): só início e fim.
        let gc2 = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO & !FLAG_POSTES_INTERMEDIARIOS);
        let (_, l2) = quant(&gc2, &reta(3.0));
        assert_eq!(n_pecas(&l2, PAPEL_POSTE), 2);
    }

    #[test]
    fn postes_de_l_com_e_sem_canto() {
        // L de 2 m + 2 m: canto em (2,0). Intermediário a cada 1 m: 1 por segmento.
        let t = trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 2.0, y: 0.0, z: 0.0 }, No3 { x: 2.0, y: 2.0, z: 0.0 }], false);
        let com = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, true, FLAGS_TUDO);
        let (_, l) = quant(&com, &cadeia(t.clone()));
        assert_eq!(n_pecas(&l, PAPEL_POSTE), 5); // início, fim, canto e 2 intermediários
        let sem = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        let (_, l2) = quant(&sem, &cadeia(t));
        assert_eq!(n_pecas(&l2, PAPEL_POSTE), 4);
    }

    fn helice(n: usize) -> Vec<No3> {
        (0..=n)
            .map(|k| {
                let a = 2.0 * std::f64::consts::PI * k as f64 / n as f64;
                No3 { x: a.cos(), y: a.sin(), z: 0.2 * k as f64 / n as f64 }
            })
            .collect()
    }

    #[test]
    fn postes_de_caracol_com_numero_fixo() {
        // Hélice de um giro (curva, sem nó no arco): intermediário de número fixo 3, mais início e fim.
        let gc = gc_base(MODO_NUMERO_FIXO, 0.0, 3, true, FLAGS_TUDO);
        let (_, l) = quant(&gc, &cadeia(trecho(helice(64), true)));
        assert_eq!(n_pecas(&l, PAPEL_POSTE), 5);
    }

    #[test]
    fn caracol_com_espacamento_maximo_conta_exato() {
        // Arco de 2π (~6,28 m em planta) com intermediário máximo de 0,5 m: ceil(6,28 / 0,5) - 1 = 12, mais início e fim = 14.
        let gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 0.5, 0, false, FLAGS_TUDO);
        let (_, l) = quant(&gc, &cadeia(trecho(helice(64), true)));
        assert_eq!(n_pecas(&l, PAPEL_POSTE), 14);
    }

    #[test]
    fn trilho_e_corrimao_em_metros() {
        let mut gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        gc.perfis.insert(20, perfil_circ(0.04));
        gc.trilhos.insert(1, TrilhoLinha { tipo: TIPO, indice: 0, altura: 0.5, desloc: 0.0, perfil: 10, material: 7 });
        let ext = |estilo: u8, comp: f64| ExtensaoLinha { estilo, comprimento: comp, mais_piso: false };
        gc.corrimaos.insert(
            1,
            CorrimaoLinha {
                tipo: TIPO,
                indice: 0,
                funcao: 1,
                posicao: 0,
                altura: 0.92,
                afastamento: 0.04,
                perfil: 20,
                material: 8,
                ext_inicio: ext(1, 0.3),
                ext_fim: ext(1, 0.3),
                sup_layout: 0,
                sup_espac: 0.0,
                sup_numero: 0,
                sup_justif: 0,
                sup_perfil: ID_AUSENTE,
                sup_comp: 0.0,
                transicao: 0,
                juncao: 0,
                raio_filete: 0.0,
            },
        );
        let (_, l) = quant(&gc, &reta(3.0));
        assert!((soma(&l, PAPEL_TRILHO, |x| x.comprimento) - 3.0).abs() < 1e-9);
        // Corrimão no eixo com extensões de 0,3 m nas duas pontas: 3 + 0,6 = 3,6 m.
        assert!((soma(&l, PAPEL_CORRIMAO, |x| x.comprimento) - 3.6).abs() < 1e-9);
        // Duas laterais: 7,2 m e duas peças.
        gc.corrimaos.get_mut(&1).expect("corrimão").posicao = POSICAO_AMBAS;
        let (_, l2) = quant(&gc, &reta(3.0));
        assert!((soma(&l2, PAPEL_CORRIMAO, |x| x.comprimento) - 7.2).abs() < 1e-9);
        assert_eq!(n_pecas(&l2, PAPEL_CORRIMAO), 2);
    }

    /// Padrão de balaústre circular de 1,2 cm, período 11 cm, base no hospedeiro e topo na altura do guarda-corpo.
    fn gc_com_padrao(justif: u8, escopo: u8, sobra: u8) -> SecoesGC {
        let mut gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        gc.perfis.insert(30, perfil_circ(0.012));
        gc.padroes.insert(
            100,
            PadraoLinha {
                tipo: TIPO,
                indice: 0,
                base_tipo: REF_HOSPEDEIRO_OU_ALTURA,
                base_idx: 0,
                topo_tipo: REF_HOSPEDEIRO_OU_ALTURA,
                topo_idx: 0,
                periodo: 0.11,
                justif,
                sobra,
                quebra: QUEBRA_CADA_SEGMENTO,
                ang_quebra: 0.0,
                escopo,
                pd_ativo: false,
                pd_qtd: 0,
                pd_dist: 0.0,
                pd_perfil: ID_AUSENTE,
                pd_material: ID_AUSENTE,
            },
        );
        gc.padrao_elementos.insert(1000, ElementoPadraoLinha { padrao: 100, indice: 0, perfil: 30, material: 9, dist_anterior: 0.0, desloc_lateral: 0.0, desloc_base: 0.0, desloc_topo: 0.0 });
        gc
    }

    #[test]
    fn baluastres_justificados_no_inicio_de_cada_vao() {
        // Três vãos de 1 m. Folgas de 0,031 m (poste de 5 cm e balaústre de 1,2 cm): Lu = 0,938 m, período 0,11 m, k = 9. Total 27.
        let gc = gc_com_padrao(JUSTIF_INICIO, ESCOPO_VAO, 0);
        let (_, l) = quant(&gc, &reta(3.0));
        assert_eq!(n_pecas(&l, PAPEL_BALAUSTRE), 27);
        assert!((soma(&l, PAPEL_BALAUSTRE, |x| x.comprimento) - 27.0 * 1.1).abs() < 1e-9);
    }

    #[test]
    fn baluastres_distribuidos_tem_n_mais_um_por_vao() {
        // `distribuir`: n = ceil(0,938 / 0,11) = 9, n + 1 = 10 repetições por vão. Total 30.
        let gc = gc_com_padrao(JUSTIF_DISTRIBUIR, ESCOPO_VAO, 0);
        let (_, l) = quant(&gc, &reta(3.0));
        assert_eq!(n_pecas(&l, PAPEL_BALAUSTRE), 30);
    }

    #[test]
    fn padrao_que_nao_cabe_gera_so_o_inicio() {
        // Padrão de dois elementos a 0,5 m num segmento de 0,3 m: só o primeiro elemento cabe, sem cortar.
        let mut gc = gc_com_padrao(JUSTIF_INICIO, ESCOPO_SEGMENTO, 0);
        gc.padrao_elementos.insert(1001, ElementoPadraoLinha { padrao: 100, indice: 1, perfil: 30, material: 9, dist_anterior: 0.5, desloc_lateral: 0.0, desloc_base: 0.0, desloc_topo: 0.0 });
        gc.postes.insert(4, poste(POSTE_INTERMEDIARIO, false, 10, 0, 0.0, 0));
        let (_, l) = quant(&gc, &cadeia(trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 0.3, y: 0.0, z: 0.0 }], false)));
        assert_eq!(n_pecas(&l, PAPEL_BALAUSTRE), 1);
    }

    #[test]
    fn paineis_de_vao_entre_postes() {
        // Reta de 3 m, postes a cada 1 m. Painel de 1,1 m de altura, folga lateral de 1 cm, largura máxima de 0,5 m. Por vão: Lu = 0,93,
        // n = 2, largura 0,46. Área lateral (duas faces) = 2 × 3 vãos × 2 × 0,46 × 1,1 = 6,072 m²; uma face = 3,036 m².
        let mut gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        gc.paineis.insert(
            1,
            PainelLinha {
                tipo: TIPO,
                indice: 0,
                familia: 0,
                base_tipo: REF_HOSPEDEIRO_OU_ALTURA,
                base_idx: 0,
                topo_tipo: REF_HOSPEDEIRO_OU_ALTURA,
                topo_idx: 0,
                desl_base: 0.0,
                desl_topo: 0.0,
                espessura: 0.01,
                folga_lateral: 0.01,
                largura_max: 0.5,
                material: 11,
                perf_diam: 0.0,
                perf_passo_x: 0.0,
                perf_passo_y: 0.0,
                perf_alternado: false,
                tela_larg: 0.0,
                tela_alt: 0.0,
                tela_fio: 0.0,
                cabo_diam: 0.0,
                cabo_espac: 0.0,
                cabo_orient: 0,
            },
        );
        let (p, l) = quant(&gc, &reta(3.0));
        assert_eq!(pecas_do(&p, PAPEL_PAINEL), 6);
        assert!((soma(&l, PAPEL_PAINEL, |x| x.area) - 6.072).abs() < 1e-9);
        assert!((soma(&l, PAPEL_PAINEL, |x| x.volume) - 3.036 * 0.01).abs() < 1e-9);
    }

    #[test]
    fn guarda_sem_cadeia_nao_conta_e_nivel_todos_recusa() {
        let gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        assert!(quantificar_pecas(&gc, NIVEL, &CadeiaGC::default()).expect("peças").is_empty());
        assert_eq!(consulta_quant_guarda(&Cena::novo(), NIVEL_TODOS), Err(ENTRADA));
    }

    /// Guarda-corpo manual com o caminho real da 3a (`guarda_caminhos`), tipo de 1,1 m, trilho e postes de início e fim.
    fn cena_manual(pts: &[(f64, f64)]) -> Cena {
        use crate::secoes_gc::CaminhoLinha;
        let mut c = Cena::novo();
        c.gc.tipos.insert(TIPO, tipo(1.1));
        c.gc.guardas.insert(
            GUARDA,
            GuardaCorpoLinha { nivel: NIVEL, tipo: TIPO, hosp: HOSP_MANUAL, hosp_num: ID_AUSENTE, lados: 0, pos_base: 0, desloc: 0.0, altura: f64::NAN, inverter: false, fechado: false, lado_desloc: 2, cota_base: 0.0, flags: FLAGS_TUDO },
        );
        for (i, (x, y)) in pts.iter().enumerate() {
            c.gc.caminhos.insert(i as u32 + 1, CaminhoLinha { guarda: GUARDA, indice: i as u32, x: *x, y: *y, dz: 0.0 });
        }
        c.gc.perfis.insert(10, perfil_circ(0.05));
        c.gc.trilhos.insert(1, TrilhoLinha { tipo: TIPO, indice: 0, altura: 0.5, desloc: 0.0, perfil: 10, material: 7 });
        c.gc.postes.insert(1, poste(POSTE_INICIO, true, 10, 0, 0.0, 0));
        c.gc.postes.insert(2, poste(POSTE_FIM, true, 10, 0, 0.0, 0));
        c
    }

    fn trilho_real(c: &Cena) -> f64 {
        let cad = cadeias_do_nivel(c, NIVEL).expect("cadeias");
        let p = quantificar_pecas(&c.gc, NIVEL, &cad).expect("peças");
        soma(&quant_guarda(&p), PAPEL_TRILHO, |x| x.comprimento)
    }

    #[test]
    fn caminho_real_reta_tem_trilho_de_tres_metros() {
        let c = cena_manual(&[(0.0, 0.0), (3.0, 0.0)]);
        assert!((trilho_real(&c) - 3.0).abs() < 1e-6);
        assert!(consulta_quant_guarda(&c, NIVEL).is_ok());
    }

    #[test]
    fn caminho_real_l_tem_trilho_de_quatro_metros() {
        // Dois trechos de 2 m em L: 4 m de eixo, e o canto não muda o comprimento.
        let c = cena_manual(&[(0.0, 0.0), (2.0, 0.0), (2.0, 2.0)]);
        assert!((trilho_real(&c) - 4.0).abs() < 1e-6);
    }

    /// Testes de agregação herdados da Fase 4a da frente f4 (peças de planta, sem geometria de cadeia).
    #[test]
    fn agregacao_contagens_e_comprimentos_exatos_de_pecas() {
        let mut p: Vec<PecaGC> = (0..10).map(|k| PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, k as f64 * 0.11, 0.0, 0.0, 1.0, 0.012)).collect();
        p.push(PecaGC::vertical_retangular(1, PAPEL_POSTE, 0.0, 0.0, 0.0, 1.1, 0.05, 0.05));
        p.push(PecaGC::varrida_redonda(1, PAPEL_CORRIMAO, vec![No3 { x: 0.0, y: 0.0, z: 1.0 }, No3 { x: 3.0, y: 0.0, z: 5.0 }], 0.04));
        let q = quant_guarda(&p);
        assert_eq!(q.len(), 3);
        let bal = q.iter().find(|x| x.papel == PAPEL_BALAUSTRE).expect("balaústres");
        assert_eq!(bal.n_pecas, 10);
        assert!((bal.comprimento - 10.0).abs() < 1e-9);
        assert!((bal.volume - 10.0 * std::f64::consts::PI * 0.012f64.powi(2) / 4.0).abs() < 1e-6);
        let cor = q.iter().find(|x| x.papel == PAPEL_CORRIMAO).expect("corrimão");
        assert!((cor.comprimento - 5.0).abs() < 1e-9, "desenvolvido: 3-4-5");
        let poste = q.iter().find(|x| x.papel == PAPEL_POSTE).expect("poste");
        assert!((poste.volume - 0.05 * 0.05 * 1.1).abs() < 1e-9);
        assert!((poste.area - 4.0 * 0.05 * 1.1).abs() < 1e-9);
    }

    #[test]
    fn agregacao_painel_e_material() {
        let a = No3 { x: 0.0, y: 0.0, z: 0.1 };
        let b = No3 { x: 2.0, y: 0.0, z: 0.1 };
        let mut p1 = PecaGC::painel(7, a, b, 1.0, 0.012);
        let mut p2 = p1.clone();
        p2.material_num = 3;
        p1.material_num = 2;
        let q = quant_guarda(&[p1.clone(), p1, p2]);
        assert_eq!(q.len(), 2);
        assert_eq!(q[0].material_num, 2);
        assert_eq!(q[0].n_pecas, 2);
        assert!((q[0].area - 8.0).abs() < 1e-9, "duas faces, dois painéis");
        assert!((q[0].area_projetada - 4.0).abs() < 1e-9);
        assert!((q[0].volume - 2.0 * 2.0 * 1.0 * 0.012).abs() < 1e-9);
        let (l, v) = achatar_quant(&q);
        assert_eq!((l.len(), v.len()), (10, 8));
    }

    #[test]
    fn agregacao_sem_pecas_sem_linhas() {
        assert!(quant_guarda(&[]).is_empty());
    }

    #[test]
    fn codificar_tem_cinco_e_quatro_valores_por_linha() {
        let l = LinhaQuant { guarda: 1, papel: 0, perfil_num: 2, material_num: 3, n_pecas: 4, comprimento: 1.0, area: 2.0, volume: 3.0, area_projetada: 4.0 };
        let (u, f) = achatar_quant(&[l]);
        assert_eq!(u, vec![1, 0, 2, 3, 4]);
        assert_eq!(f, vec![1.0, 2.0, 3.0, 4.0]);
    }
}
