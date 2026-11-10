//! Montagem do guarda-corpo (decisão 0055, integração das fases 3a, 3b, 3c e 4): junta o caminho (`guarda_caminhos`), a distribuição (`gc_distribuicao`)
//! e a varredura (`gc_varredura`) e produz, por nível, a malha soldada (`guarda_malha`), as peças lógicas (`PecaGC`, para planta, corte e quantidades) e
//! as medidas de aviso. As consultas 61 a 65 são fatias da mesma montagem.
//!
//! Escolhas desta etapa (registradas na ADR, seção de integração): trilhos e corrimão de uma sequência soldada (lance + patamar) saem de uma varredura
//! contínua; a transição do corrimão (simples ou pescoço de ganso) só vale para o par lance e patamar retos e colineares; `conexaoTrilho: soldar` (perfil circular) solda os cantos dos trilhos
//! e o filete do corrimão (`juncao: filete`) vale também nos trilhos, com o mesmo raio (o filete tem precedência sobre a solda); `lod` muda só os lados dos perfis circulares.

use std::collections::BTreeMap;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, ID_AUSENTE};
use crate::gc_avisos::{self, Aviso, VaoGC};
use crate::gc_caminho;
use crate::gc_distribuicao::{
    self as dist, ConfigDistribuicao, DegrauP, ElemP, PadraoP, PainelP, ParamPostes, Percurso, PerfilP, PorDegrauP, PosteP,
};
use crate::gc_malha::{self, MalhaGC, PecaMalha as PecaSolda};
use crate::gc_planta::{FormaGC, PecaGC};
use crate::gc_tipos::*;
use crate::gc_varredura::{self as var, ExtensaoPonta, Transicao, LIMITE_ESQUADRIA, V3};
use crate::secoes_gc::*;

/// Resultado da montagem de um nível.
#[derive(Default)]
pub struct Montagem {
    pub cadeia: CadeiaGC,
    pub malha: MalhaGC,
    pub pecas: Vec<PecaGC>,
    pub avisos: Vec<Aviso>,
    /// Avisos da distribuição `(guarda, trecho, codigo, s, valor)`.
    pub avisos_dist: Vec<(u32, u32, u8, f64, f64)>,
}

struct TrechoInfo {
    guarda: u32,
    trecho: u32,
    origem: OrigemTrecho,
    curvo: bool,
    fechado: bool,
    soldado: bool,
    nos: Vec<No3>,
}

fn ler_trechos(tr: &[u32], nos: &[f64]) -> Vec<TrechoInfo> {
    let mut out = Vec::new();
    let mut ini = 0usize;
    for t in tr.chunks_exact(5) {
        let n = t[3] as usize;
        let origem = match t[2] {
            0 => OrigemTrecho::Lance,
            1 => OrigemTrecho::Patamar,
            3 => OrigemTrecho::Caracol,
            _ => OrigemTrecho::Manual,
        };
        out.push(TrechoInfo {
            guarda: t[0],
            trecho: t[1],
            origem,
            curvo: t[4] & 1 != 0,
            fechado: t[4] & 2 != 0,
            soldado: t[4] & 4 != 0,
            nos: (ini..ini + n).map(|i| No3 { x: nos[3 * i], y: nos[3 * i + 1], z: nos[3 * i + 2] }).collect(),
        });
        ini += n;
    }
    out
}

fn perfil_p(cena: &Cena, num: u32, lod: u32) -> Result<PerfilP, u32> {
    let l = cena.gc.perfis.get(&num).ok_or(ENTRADA)?;
    let mut pontos: Vec<(u32, [f64; 2])> = cena.gc.perfis_pontos.values().filter(|p| p.perfil == num).map(|p| (p.indice, [p.x, p.y])).collect();
    pontos.sort_by_key(|p| p.0);
    let mut lados = l.lados;
    if l.forma == FORMA_CIRCULAR {
        lados = match lod {
            0 => lados.min(8).max(LADOS_MIN),
            2 => lados.max(24).min(LADOS_MAX),
            _ => lados,
        };
    }
    Ok(PerfilP { forma: l.forma, largura: l.largura, altura: l.altura, lados, pontos: pontos.into_iter().map(|p| p.1).collect() })
}

/// Largura e altura do envelope do perfil (em `u`, `v`).
fn envelope(p: &PerfilP) -> (f64, f64) {
    let a = p.anel();
    let (mut u0, mut u1, mut v0, mut v1) = (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
    for q in &a {
        u0 = u0.min(q[0]);
        u1 = u1.max(q[0]);
        v0 = v0.min(q[1]);
        v1 = v1.max(q[1]);
    }
    if a.is_empty() {
        (p.largura, p.altura)
    } else {
        (u1 - u0, v1 - v0)
    }
}

fn area_perimetro(p: &PerfilP) -> (f64, f64) {
    let a = p.anel();
    let n = a.len();
    if n < 3 {
        return (0.0, 0.0);
    }
    let mut area = 0.0;
    let mut per = 0.0;
    for i in 0..n {
        let (q, r) = (a[i], a[(i + 1) % n]);
        area += q[0] * r[1] - r[0] * q[1];
        per += (r[0] - q[0]).hypot(r[1] - q[1]);
    }
    (area.abs() / 2.0, per)
}

fn posto_vazio() -> PosteP {
    PosteP { ativo: false, perfil: PerfilP::circular(0.04), material: 0, acima: 0.0, abaixo: 0.0 }
}

fn peca_vertical(guarda: u32, papel: u32, perfil_num: u32, material: u32, perfil: &PerfilP, x: f64, y: f64, z0: f64, z1: f64) -> PecaGC {
    let (l, pr) = envelope(perfil);
    let (area, per) = area_perimetro(perfil);
    PecaGC {
        guarda,
        papel,
        perfil_num,
        material_num: material,
        area_secao: area,
        perimetro: per,
        forma: FormaGC::Vertical { x, y, z0, z1, largura: l, profundidade: pr, circular: perfil.forma == FORMA_CIRCULAR },
    }
}

fn sub3(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/// Desloca lateralmente (esquerda positiva, no plano horizontal) uma polilinha pela bissetriz; limita o alongamento a 2,5 vezes.
fn deslocar(nos: &[V3], d: f64) -> Vec<V3> {
    if d.abs() < 1e-12 || nos.len() < 2 {
        return nos.to_vec();
    }
    // Normal de cada segmento da planta; segmento de comprimento nulo (degrau vertical: dois nós no mesmo ponto da planta, cotas diferentes)
    // não tem direção e fica de fora, para o canto ser calculado com os segmentos reais vizinhos.
    let n = nos.len();
    let segs: Vec<Option<[f64; 2]>> = (0..n - 1)
        .map(|i| {
            let (dx, dy) = (nos[i + 1][0] - nos[i][0], nos[i + 1][1] - nos[i][1]);
            let l = dx.hypot(dy);
            (l >= 1e-9).then(|| [-dy / l, dx / l])
        })
        .collect();
    let Some(primeira) = segs.iter().flatten().next().copied() else { return nos.to_vec() };
    (0..n)
        .map(|i| {
            let n1 = segs[..i].iter().rev().flatten().next().copied().unwrap_or(primeira);
            let n2 = segs[i..].iter().flatten().next().copied().unwrap_or(n1);
            let s = [n1[0] + n2[0], n1[1] + n2[1]];
            let l = s[0].hypot(s[1]);
            let m = if l < 1e-9 { n1 } else { [s[0] / l, s[1] / l] };
            let c = (m[0] * n1[0] + m[1] * n1[1]).max(1.0 / LIMITE_ESQUADRIA);
            [nos[i][0] + m[0] * d / c, nos[i][1] + m[1] * d / c, nos[i][2]]
        })
        .collect()
}

fn pt(n: &No3) -> V3 {
    [n.x, n.y, n.z]
}

/// Posição horizontal `s` da projeção de `p` sobre a polilinha (ponto mais próximo).
fn s_da_projecao(nos: &[No3], p: [f64; 2]) -> f64 {
    let mut melhor = (f64::INFINITY, 0.0);
    let mut acc = 0.0;
    for w in nos.windows(2) {
        let (dx, dy) = (w[1].x - w[0].x, w[1].y - w[0].y);
        let l2 = dx * dx + dy * dy;
        if l2 < 1e-18 {
            continue;
        }
        let t = (((p[0] - w[0].x) * dx + (p[1] - w[0].y) * dy) / l2).clamp(0.0, 1.0);
        let q = (w[0].x + t * dx, w[0].y + t * dy);
        let d = (p[0] - q.0).hypot(p[1] - q.1);
        if d < melhor.0 - 1e-12 {
            melhor = (d, acc + t * l2.sqrt());
        }
        acc += l2.sqrt();
    }
    melhor.1
}

struct Tipo<'a> {
    linha: &'a TipoGuardaLinha,
    trilhos: Vec<(u32, TrilhoLinha)>,
    corrimaos: Vec<(u32, CorrimaoLinha)>,
    padroes: Vec<(u32, PadraoLinha)>,
    paineis: Vec<(u32, PainelLinha)>,
}

fn do_tipo<'a>(cena: &'a Cena, id: u32) -> Tipo<'a> {
    let mut trilhos: Vec<(u32, TrilhoLinha)> = cena.gc.trilhos.iter().filter(|(_, t)| t.tipo == id).map(|(&k, t)| (k, *t)).collect();
    trilhos.sort_by_key(|t| (t.1.indice, t.0));
    let mut corrimaos: Vec<(u32, CorrimaoLinha)> = cena.gc.corrimaos.iter().filter(|(_, t)| t.tipo == id).map(|(&k, t)| (k, *t)).collect();
    corrimaos.sort_by_key(|t| (t.1.indice, t.0));
    let mut padroes: Vec<(u32, PadraoLinha)> = cena.gc.padroes.iter().filter(|(_, t)| t.tipo == id).map(|(&k, t)| (k, *t)).collect();
    padroes.sort_by_key(|t| (t.1.indice, t.0));
    let mut paineis: Vec<(u32, PainelLinha)> = cena.gc.paineis.iter().filter(|(_, t)| t.tipo == id).map(|(&k, t)| (k, *t)).collect();
    paineis.sort_by_key(|t| (t.1.indice, t.0));
    Tipo { linha: &cena.gc.tipos[&id], trilhos, corrimaos, padroes, paineis }
}

/// Altura (m sobre a cota da cadeia) de uma referência de base ou topo.
#[allow(clippy::too_many_arguments)]
fn altura_ref(cena: &Cena, tipo: &Tipo, tipo_ref: u8, idx: u32, topo: bool, h_guarda: f64, lod: u32) -> Result<f64, u32> {
    match tipo_ref {
        REF_TRILHO => {
            let (_, t) = tipo.trilhos.iter().find(|(_, t)| t.indice == idx).ok_or(ENTRADA)?;
            let p = perfil_p(cena, t.perfil, lod)?;
            let meia = envelope(&p).1 / 2.0;
            Ok(t.altura + if topo { -meia } else { meia })
        }
        REF_CORRIMAO => {
            let (_, c) = tipo.corrimaos.iter().find(|(_, t)| t.indice == idx).ok_or(ENTRADA)?;
            let p = perfil_p(cena, c.perfil, lod)?;
            Ok(c.altura - if topo { envelope(&p).1 } else { 0.0 })
        }
        _ => Ok(if topo { h_guarda } else { tipo.linha.folga_inferior }),
    }
}

fn ext(estilo: u8, comp: f64, mais_piso: bool, horizontal: bool) -> Option<ExtensaoPonta> {
    (estilo != 0 && (comp > 0.0 || mais_piso)).then_some(ExtensaoPonta { comprimento: comp, mais_piso, horizontal })
}

fn peca_varrida(guarda: u32, papel: u32, perfil_num: u32, material: u32, perfil: &PerfilP, nos: &[V3]) -> PecaGC {
    let (l, h) = envelope(perfil);
    let (area, per) = area_perimetro(perfil);
    PecaGC {
        guarda,
        papel,
        perfil_num,
        material_num: material,
        area_secao: area,
        perimetro: per,
        forma: FormaGC::Varrida { nos: nos.iter().map(|p| No3 { x: p[0], y: p[1], z: p[2] }).collect(), largura: l, altura: h },
    }
}

fn adicionar_varredura(m: &mut Montagem, com_malha: bool, guarda: u32, trecho: u32, papel_malha: u32, perfil_num: u32, material: u32, perfil: &PerfilP, caminhos: &[Vec<V3>]) {
    for c in caminhos {
        if c.len() < 2 {
            continue;
        }
        m.avisos.extend(gc_avisos::aviso_perfil_auto_intersecta(guarda, trecho, c, envelope(perfil).0 / 2.0, false));
        m.pecas.push(peca_varrida(guarda, papel_malha, perfil_num, material, perfil, c));
        if com_malha {
            let pc = var::varrer(c, false, &perfil.anel(), LIMITE_ESQUADRIA);
            m.malha.adicionar_grupo(guarda, papel_malha, material, &pc);
        }
    }
}

/// Monta todos os guarda-corpos do nível (`NIVEL_TODOS` aceito). `norma_num` é a norma usada quando o tipo não fixa uma (`ID_AUSENTE` = nenhuma).
pub fn montar(cena: &Cena, nivel: u32, lod: u32, norma_num: u32, tol_juncao: f64, com_malha: bool) -> Result<Montagem, u32> {
    let s = crate::gc_caminho::guarda_caminhos(cena, nivel, tol_juncao)?;
    let (Saida::U32(tr), Saida::F64(nos), Saida::U32(av), Saida::F64(vals)) = (&s[0], &s[1], &s[2], &s[3]) else { return Err(crate::esquema::INTERNO) };
    let trechos = ler_trechos(tr, nos);
    let mut m = Montagem::default();
    m.avisos.extend(gc_avisos::de_caminho(av, vals));
    for t in &trechos {
        m.cadeia.trechos.push(TrechoGC { guarda: t.guarda, indice: t.trecho, origem: t.origem, curvo: t.curvo, fechado: t.fechado, nos: t.nos.clone() });
    }
    let mut ids: Vec<u32> = trechos.iter().map(|t| t.guarda).collect();
    ids.dedup();
    for gid in ids {
        let g = cena.gc.guardas[&gid];
        let tipo = do_tipo(cena, g.tipo);
        // Trecho que vira ponto (menos de dois nós ou comprimento nulo em planta): nada a distribuir nem varrer; avisa em vez de calar.
        let mut meus: Vec<&TrechoInfo> = Vec::new();
        for t in trechos.iter().filter(|t| t.guarda == gid) {
            let comp_t: f64 = t.nos.windows(2).map(|w| (w[1].x - w[0].x).hypot(w[1].y - w[0].y)).sum();
            let p = t.nos.first().map_or([0.0; 3], |n| [n.x, n.y, n.z]);
            match gc_avisos::aviso_trecho_curto(gid, t.trecho, comp_t, gc_caminho::COMPRIMENTO_MIN_TRECHO, p[0], p[1], p[2]) {
                Some(a) => m.avisos.push(a),
                None => meus.push(t),
            }
        }
        montar_guarda(cena, gid, &g, &tipo, &meus, lod, norma_num, com_malha, &mut m)?;
    }
    Ok(m)
}

#[allow(clippy::too_many_arguments)]
fn montar_guarda(cena: &Cena, gid: u32, g: &GuardaCorpoLinha, tipo: &Tipo, trechos: &[&TrechoInfo], lod: u32, norma_arg: u32, com_malha: bool, m: &mut Montagem) -> Result<(), u32> {
    let altura = if g.altura.is_nan() { tipo.linha.altura } else { g.altura };
    let norma = {
        let n = if tipo.linha.norma != ID_AUSENTE { tipo.linha.norma } else { norma_arg };
        cena.gc.normas.get(&n)
    };
    let lim = |k: usize| norma.and_then(|n| n.limite[k]);
    // Sentido do caminho: inverter troca início e fim, mas não o lado físico. Tudo que é medido para a esquerda do caminho (deslocamento de trilho,
    // de corrimão, do elemento do padrão) troca de sinal junto com a ordem dos nós; a pisada do degrau passa a correr para trás.
    let sentido = if g.inverter { -1.0 } else { 1.0 };
    let prof_piso = if g.hosp == HOSP_ESCADA { cena.gc.escadas.get(&g.hosp_num).map(|e| e.profundidade_piso).unwrap_or(0.0) } else { 0.0 };

    // Postes.
    let mut postes_cfg = [posto_vazio(), posto_vazio(), posto_vazio(), posto_vazio()];
    let mut nums_poste = [0u32; 4];
    let (mut modo, mut espac, mut numero, mut ang) = (MODO_NENHUM_GC, 0.0, 0u32, 5.0f64.to_radians());
    for p in cena.gc.postes.values().filter(|p| p.tipo == g.tipo) {
        let k = (p.papel as usize).min(3);
        postes_cfg[k] = PosteP { ativo: p.ativo, perfil: perfil_p(cena, p.perfil, lod)?, material: p.material, acima: p.acima, abaixo: p.abaixo };
        nums_poste[k] = p.perfil;
        if p.papel == POSTE_INTERMEDIARIO {
            modo = p.modo;
            espac = p.espacamento;
            numero = p.numero;
        }
        if p.papel == POSTE_CANTO {
            ang = p.ang_canto;
        }
    }
    if g.flags & FLAG_POSTES_INTERMEDIARIOS == 0 {
        modo = MODO_NENHUM_GC;
    }
    let [inicio, fim, canto, interm] = postes_cfg;
    let params = ParamPostes { inicio, fim, canto, intermediario: interm, ang_canto: ang, modo, espacamento: espac, numero };

    // Escada: componentes de lance em ordem e seus degraus.
    let lances: Vec<u32> = if g.hosp == HOSP_ESCADA {
        let mut v: Vec<(u32, u32)> = cena.gc.componentes.iter().filter(|(_, c)| c.escada == g.hosp_num && c.tipo == COMPONENTE_LANCE).map(|(&k, c)| (c.indice, k)).collect();
        v.sort();
        v.into_iter().map(|x| x.1).collect()
    } else {
        Vec::new()
    };
    // Ordem do lance de cada trecho no sentido normal: com o sentido invertido a sequência soldada vem ao contrário.
    let mut ordem_lance: BTreeMap<u32, usize> = BTreeMap::new();
    {
        let mut n = 0usize;
        let mut i = 0;
        while i < trechos.len() {
            let mut j = i + 1;
            while j < trechos.len() && trechos[j].soldado {
                j += 1;
            }
            let seq: Vec<&&TrechoInfo> = if g.inverter { trechos[i..j].iter().rev().collect() } else { trechos[i..j].iter().collect() };
            for t in seq {
                if t.origem == OrigemTrecho::Lance {
                    ordem_lance.insert(t.trecho, n);
                    n += 1;
                }
            }
            i = j;
        }
    }
    let mut restante = LIMITE_BALAUSTRES;

    // Posições (planta) dos postes por trecho: alimentam o layout "alinhar com postes" dos suportes do corrimão.
    let mut postes_xy: BTreeMap<u32, Vec<[f64; 2]>> = BTreeMap::new();
    // Padrões e painéis (as alturas dependem do trecho: patamar soma o ajuste).
    for t in trechos.iter() {
        let ajuste = if t.origem == OrigemTrecho::Patamar { tipo.linha.ajuste_patamar } else { 0.0 };
        let h_t = altura + ajuste;
        let mut padroes: Vec<PadraoP> = Vec::new();
        let mut nums_elem: Vec<(Vec<u32>, u32)> = Vec::new();
        if g.flags & FLAG_PREENCHIMENTO != 0 {
            for (pid, p) in &tipo.padroes {
                let mut elementos: Vec<(u32, ElementoPadraoLinha)> = cena.gc.padrao_elementos.iter().filter(|(_, e)| e.padrao == *pid).map(|(&i, e)| (i, *e)).collect();
                elementos.sort_by_key(|e| (e.1.indice, e.0));
                let mut el = Vec::new();
                let mut nums = Vec::new();
                for (_, e) in &elementos {
                    let perfil = if e.perfil == ID_AUSENTE { None } else { Some(perfil_p(cena, e.perfil, lod)?) };
                    nums.push(e.perfil);
                    el.push(ElemP { perfil, material: e.material, dist_anterior: e.dist_anterior, desloc_lateral: sentido * e.desloc_lateral, desloc_base: e.desloc_base, desloc_topo: e.desloc_topo });
                }
                let pd_perfil = if p.pd_ativo && p.pd_perfil != ID_AUSENTE { Some(perfil_p(cena, p.pd_perfil, lod)?) } else { None };
                nums_elem.push((nums, p.pd_perfil));
                padroes.push(PadraoP {
                    elementos: el,
                    periodo: p.periodo,
                    justif: p.justif,
                    sobra: p.sobra,
                    quebra: p.quebra,
                    ang_quebra: p.ang_quebra,
                    escopo: p.escopo,
                    h_base: altura_ref(cena, tipo, p.base_tipo, p.base_idx, false, h_t, lod)?,
                    h_topo: altura_ref(cena, tipo, p.topo_tipo, p.topo_idx, true, h_t, lod)?,
                    por_degrau: PorDegrauP { ativo: p.pd_ativo, quantidade: p.pd_qtd, dist_quina: p.pd_dist.max(0.0), centro: p.pd_dist < 0.0, perfil: pd_perfil, material: p.pd_material },
                });
            }
        }
        let mut paineis: Vec<PainelP> = Vec::new();
        if g.flags & FLAG_PREENCHIMENTO != 0 {
            for (_, p) in &tipo.paineis {
                paineis.push(PainelP {
                    familia: p.familia,
                    h_base: altura_ref(cena, tipo, p.base_tipo, p.base_idx, false, h_t, lod)?,
                    h_topo: altura_ref(cena, tipo, p.topo_tipo, p.topo_idx, true, h_t, lod)?,
                    desl_base: p.desl_base,
                    desl_topo: p.desl_topo,
                    espessura: p.espessura,
                    folga_lateral: p.folga_lateral,
                    largura_max: p.largura_max,
                    material: p.material,
                    perf_diam: p.perf_diam,
                    perf_passo_x: p.perf_passo_x,
                    perf_passo_y: p.perf_passo_y,
                    perf_alternado: p.perf_alternado,
                    tela_larg: p.tela_larg,
                    tela_alt: p.tela_alt,
                    tela_fio: p.tela_fio,
                    cabo_diam: p.cabo_diam,
                    cabo_espac: p.cabo_espac,
                    cabo_orient: p.cabo_orient,
                });
            }
        }
        // Degraus do lance (só se algum padrão usa "por degrau").
        let mut degraus: Vec<DegrauP> = Vec::new();
        if t.origem == OrigemTrecho::Lance && padroes.iter().any(|p| p.por_degrau.ativo) {
            // O lado do trecho vem da ordem: esquerdo primeiro, depois o direito, na ordem dos componentes.
            let n_lance = lances.len().max(1);
            let ordem = ordem_lance.get(&t.trecho).copied().unwrap_or(0);
            if let Some(&comp) = lances.get(ordem % n_lance) {
                let mut esp: Vec<&EspelhoGC> = cena.gc.espelhos.values().filter(|e| e.componente == comp).collect();
                esp.sort_by_key(|e| e.indice);
                let prof = prof_piso;
                for e in esp {
                    let mid = [(e.a[0] + e.b[0]) / 2.0, (e.a[1] + e.b[1]) / 2.0];
                    degraus.push(DegrauP { s0: s_da_projecao(&t.nos, mid), profundidade: sentido * prof, z: e.z1 });
                }
            }
        }
        let cfg = ConfigDistribuicao { altura: h_t, postes: params.clone(), padroes: padroes.clone(), paineis: paineis.clone(), degraus, gerar_malha: com_malha };
        let tr = TrechoGC { guarda: gid, indice: t.trecho, origem: t.origem, curvo: t.curvo, fechado: t.fechado, nos: t.nos.clone() };
        let saida = dist::distribuir(&tr, &cfg, restante)?;
        postes_xy.insert(t.trecho, saida.postes.iter().map(|p| [p.x, p.y]).collect());
        for a in &saida.avisos {
            m.avisos_dist.push((gid, t.trecho, a.codigo, a.s, a.valor));
            m.avisos.extend(gc_avisos::de_distribuicao(gid, t.trecho, a.codigo, a.s, a.valor));
        }
        for l in &saida.balaustres {
            restante = restante.saturating_sub(l.len());
        }
        // Peças lógicas.
        for p in &saida.postes {
            let k = (p.papel as usize).min(3);
            let par = cfg.postes.do_papel(p.papel);
            m.pecas.push(peca_vertical(gid, 0, nums_poste[k], par.material, &par.perfil, p.x, p.y, p.z0, p.z1));
        }
        for ((pad, lista), (nums, pd_num)) in padroes.iter().zip(&saida.balaustres).zip(&nums_elem) {
            for b in lista {
                let (perfil, mat, num) = match b.elem {
                    Some(j) => (pad.elementos[j].perfil.as_ref(), pad.elementos[j].material, nums[j]),
                    None => (pad.por_degrau.perfil.as_ref(), pad.por_degrau.material, *pd_num),
                };
                if let Some(pf) = perfil {
                    m.pecas.push(peca_vertical(gid, 1, num, mat, pf, b.x, b.y, b.z0, b.z1));
                }
            }
        }
        let perc = Percurso::de(&tr);
        for (pn, lista) in paineis.iter().zip(&saida.paineis) {
            for gp in lista {
                let (a, b) = (perc.amostra(gp.s0), perc.amostra(gp.s1));
                let z0 = a.z.min(b.z) + pn.h_base + pn.desl_base;
                let h = pn.h_topo + pn.desl_topo - (pn.h_base + pn.desl_base);
                if h > 1e-9 && pn.familia != dist::FAM_CABO {
                    let mut pc = PecaGC::painel(gid, No3 { x: a.x, y: a.y, z: z0 }, No3 { x: b.x, y: b.y, z: z0 }, h, pn.espessura);
                    pc.material_num = pn.material;
                    // Área líquida: a seção do painel perde a fração aberta (furos da chapa perfurada, malha da tela); `gc_quant` lê a razão.
                    pc.area_secao *= 1.0 - fracao_aberta(pn);
                    m.pecas.push(pc);
                }
            }
        }
        // Cabos: peça lógica por cabo (a malha vem de `saida.pecas`).
        for (pn, lista) in paineis.iter().zip(&saida.cabos) {
            let rd = PerfilP::circular(pn.cabo_diam);
            for eixo in lista {
                let nos: Vec<V3> = eixo.clone();
                m.pecas.push(peca_varrida(gid, 6, 0, pn.material, &rd, &nos));
            }
        }
        if com_malha {
            for p in &saida.pecas {
                let peca = PecaSolda {
                    vertices: p.malha.vertices.clone(),
                    triangulos: p.malha.indices.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect(),
                };
                m.malha.adicionar_grupo(gid, p.papel as u32, p.material, &peca);
            }
        }
        // Avisos de geometria.
        if let Some(min) = lim(limite::ALTURA_MINIMA) {
            m.avisos.extend(gc_avisos::aviso_altura(gid, t.trecho, h_t, min));
        }
        if let Some(maxima) = lim(limite::FOLGA_INFERIOR_MAXIMA) {
            if !paineis.is_empty() || !padroes.is_empty() {
                m.avisos.extend(gc_avisos::aviso_vao_inferior(gid, t.trecho, tipo.linha.folga_inferior, maxima));
            }
        }
        if let Some(esfera) = lim(limite::ESFERA_MAXIMA) {
            if !paineis.is_empty() || !padroes.is_empty() || !saida.postes.is_empty() {
                let mut v = VaoGC { comprimento: perc.total, altura: h_t, verticais: Vec::new(), horizontais: Vec::new() };
                for p in &saida.postes {
                    v.verticais.push((p.s - p.meia, p.s + p.meia));
                }
                for (pad, lista) in padroes.iter().zip(&saida.balaustres) {
                    for b in lista {
                        let meia = match b.elem {
                            Some(j) => pad.elementos[j].perfil.as_ref(),
                            None => pad.por_degrau.perfil.as_ref(),
                        }
                        .map(|p| p.largura_ao_longo() / 2.0);
                        if let Some(me) = meia {
                            v.verticais.push((b.s - me, b.s + me));
                        }
                    }
                }
                for (pn, lista) in paineis.iter().zip(&saida.paineis) {
                    if pn.familia == dist::FAM_VIDRO || pn.familia == dist::FAM_CHAPA {
                        for gp in lista {
                            v.verticais.push((gp.s0, gp.s1));
                        }
                    }
                }
                for (_, tr_l) in &tipo.trilhos {
                    let hp = perfil_p(cena, tr_l.perfil, lod).map(|p| envelope(&p).1).unwrap_or(0.0);
                    v.horizontais.push((tr_l.altura - hp / 2.0, tr_l.altura + hp / 2.0));
                }
                if v.comprimento > 0.0 {
                    m.avisos.extend(gc_avisos::aviso_vao_grande(gid, t.trecho, &v, tipo.linha.folga_inferior, h_t, esfera));
                }
            }
        }
    }

    // Trilhos e corrimãos: varridos por sequência soldada (lance + patamar são um só caminho).
    let mut cadeias: Vec<Vec<&TrechoInfo>> = Vec::new();
    for t in trechos {
        match cadeias.last_mut() {
            Some(c) if t.soldado && c.last().is_some_and(|u| u.trecho + 1 == t.trecho) => c.push(t),
            _ => cadeias.push(vec![*t]),
        }
    }
    for ch in &cadeias {
        let fechado = ch.len() == 1 && ch[0].fechado;
        let junta = |dz: &dyn Fn(&TrechoInfo) -> f64| -> Vec<V3> {
            let mut r: Vec<V3> = Vec::new();
            for t in ch {
                let d = dz(t);
                for n in &t.nos {
                    let p = [n.x, n.y, n.z + d];
                    if r.last().is_none_or(|&u| (sub3(u, p)).iter().map(|c| c * c).sum::<f64>().sqrt() > 1e-9) {
                        r.push(p);
                    }
                }
            }
            r
        };
        let ajuste_de = |t: &TrechoInfo| if t.origem == OrigemTrecho::Patamar { tipo.linha.ajuste_patamar } else { 0.0 };
        // Filete nos trilhos: acompanha o corrimão do tipo com `juncao: filete` (raio do primeiro); a ADR só define o raio no corrimão.
        let raio_filete_trilho = tipo.corrimaos.iter().find(|(_, c)| c.juncao == 1 && c.raio_filete > 0.0).map(|(_, c)| c.raio_filete);
        for (_, tr_l) in &tipo.trilhos {
            let perfil = perfil_p(cena, tr_l.perfil, lod)?;
            let base = junta(&|t| tr_l.altura + ajuste_de(t));
            let cam = deslocar(&base, sentido * tr_l.desloc);
            let cam = if fechado {
                cam
            } else if let Some(r) = raio_filete_trilho {
                var::filete(&cam, r, tipo.linha.tol_corda, None)
            } else if tipo.linha.conexao == 1 && perfil.forma == FORMA_CIRCULAR {
                var::soldar(&cam, envelope(&perfil).0)
            } else {
                cam
            };
            if fechado {
                m.avisos.extend(gc_avisos::aviso_perfil_auto_intersecta(gid, ch[0].trecho, &cam, envelope(&perfil).0 / 2.0, true));
                m.pecas.push(peca_varrida(gid, 2, tr_l.perfil, tr_l.material, &perfil, &cam));
                if com_malha {
                    let pc = var::varrer(&cam, true, &perfil.anel(), LIMITE_ESQUADRIA);
                    m.malha.adicionar_grupo(gid, gc_malha::PAPEL_TRILHO, tr_l.material, &pc);
                }
            } else {
                adicionar_varredura(m, com_malha, gid, ch[0].trecho, gc_malha::PAPEL_TRILHO, tr_l.perfil, tr_l.material, &perfil, &[cam]);
            }
        }
        if g.flags & FLAG_CORRIMAO == 0 {
            continue;
        }
        for (_, c) in &tipo.corrimaos {
            let perfil = perfil_p(cena, c.perfil, lod)?;
            let (larg, alt) = envelope(&perfil);
            let largura_poste = m_largura_poste(&params);
            let lado_off = sentido * (c.afastamento + larg / 2.0 + largura_poste / 2.0);
            let lados: Vec<f64> = match c.posicao {
                1 => vec![lado_off],
                2 => vec![-lado_off],
                3 => vec![lado_off, -lado_off],
                _ => vec![0.0],
            };
            let papel = if c.funcao == 0 { gc_malha::PAPEL_TRAVESSA } else { gc_malha::PAPEL_CORRIMAO };
            let h_centro = c.altura - alt / 2.0;
            let mut caminhos: Vec<Vec<V3>>;
            for off in lados {
                if ch.len() == 2 && ch[0].origem == OrigemTrecho::Lance && ch[1].origem == OrigemTrecho::Patamar && !ch[0].curvo && !ch[1].curvo && c.transicao != 0 {
                    let l: Vec<V3> = deslocar(&ch[0].nos.iter().map(pt).collect::<Vec<_>>(), off);
                    let p: Vec<V3> = deslocar(&ch[1].nos.iter().map(pt).collect::<Vec<_>>(), off);
                    caminhos = var::corrimao_lance_patamar(&l, &p, h_centro, h_centro + tipo.linha.ajuste_patamar, larg.max(alt), Transicao::de_codigo(c.transicao));
                } else {
                    let base = junta(&|t| h_centro + ajuste_de(t));
                    caminhos = vec![deslocar(&base, off)];
                }
                if c.juncao == 1 && c.raio_filete > 0.0 && !fechado {
                    caminhos = caminhos.into_iter().map(|p| var::filete(&p, c.raio_filete, tipo.linha.tol_corda, None)).collect();
                }
                // Extensões nas pontas da sequência.
                if !fechado && caminhos.len() >= 1 {
                    let ini = ext(c.ext_inicio.estilo, c.ext_inicio.comprimento, c.ext_inicio.mais_piso, false);
                    let fim = ext(c.ext_fim.estilo, c.ext_fim.comprimento, c.ext_fim.mais_piso, true);
                    if caminhos.len() == 1 {
                        caminhos[0] = var::estender(&caminhos[0], ini, fim, prof_piso);
                    } else {
                        let n = caminhos.len();
                        caminhos[0] = var::estender(&caminhos[0], ini, None, prof_piso);
                        caminhos[n - 1] = var::estender(&caminhos[n - 1], None, fim, prof_piso);
                    }
                    let comp_ini = c.ext_inicio.comprimento + if c.ext_inicio.mais_piso { prof_piso } else { 0.0 };
                    let comp_fim = c.ext_fim.comprimento + if c.ext_fim.mais_piso { prof_piso } else { 0.0 };
                    if let Some(min) = lim(limite::CORRIMAO_EXTENSAO_MIN) {
                        {
                            m.avisos.extend(gc_avisos::aviso_corrimao_extensao(gid, ch[0].trecho, 0, comp_ini, min));
                            m.avisos.extend(gc_avisos::aviso_corrimao_extensao(gid, ch[ch.len() - 1].trecho, 1, comp_fim, min));
                        }
                    }
                }
                if c.funcao != 0 {
                    if let (Some(mn), Some(mx)) = (lim(limite::CORRIMAO_ALTURA_MIN), lim(limite::CORRIMAO_ALTURA_MAX)) {
                        m.avisos.extend(gc_avisos::aviso_corrimao_altura(gid, ch[0].trecho, c.indice, c.altura, mn, mx));
                    }
                }
                adicionar_varredura(m, com_malha, gid, ch[0].trecho, papel, c.perfil, c.material, &perfil, &caminhos);
                // Suportes.
                if c.funcao != 0 && c.sup_layout != 0 && c.sup_perfil != ID_AUSENTE && c.sup_comp > 0.0 && off != 0.0 && caminhos.len() == 1 {
                    let sp = perfil_p(cena, c.sup_perfil, lod)?;
                    let total = var::comprimento_caminho(&caminhos[0]);
                    let mut s_postes: Vec<f64> = Vec::new();
                    if c.sup_layout == 2 {
                        let nos_c: Vec<No3> = caminhos[0].iter().map(|p| No3 { x: p[0], y: p[1], z: p[2] }).collect();
                        for t in ch {
                            for xy in postes_xy.get(&t.trecho).into_iter().flatten() {
                                s_postes.push(s_da_projecao(&nos_c, *xy));
                            }
                        }
                        s_postes.sort_by(|a, b| a.total_cmp(b));
                        s_postes.dedup_by(|a, b| (*a - *b).abs() < 1e-6);
                    }
                    for s in var::posicoes_suportes(total, c.sup_layout, c.sup_espac, c.sup_numero, c.sup_justif, &s_postes) {
                        if let Some((p, t)) = var::ponto_em(&caminhos[0], s) {
                            let lado = if off > 0.0 { -1.0 } else { 1.0 };
                            let comp = off.abs().min(c.sup_comp);
                            let pc = var::suporte(p, t, lado, comp, &sp.anel());
                            let fim = [p[0] + (-t[1]) * lado * comp / t[0].hypot(t[1]).max(1e-12), p[1] + t[0] * lado * comp / t[0].hypot(t[1]).max(1e-12), p[2]];
                            m.pecas.push(peca_varrida(gid, 4, c.sup_perfil, c.material, &sp, &[p, fim]));
                            if com_malha {
                                m.malha.adicionar_grupo(gid, gc_malha::PAPEL_SUPORTE, c.material, &pc);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

const MODO_NENHUM_GC: u8 = 0;

/// Fração aberta (0 a 1) do painel: chapa perfurada = área do furo por célula (`passo_x * passo_y`, vale também no quincôncio); tela = área
/// da abertura da malha `(larg - fio)(alt - fio)` sobre `larg * alt`. Outras famílias: 0. Limitada a 0,99 (sempre sobra material).
fn fracao_aberta(p: &PainelP) -> f64 {
    let f = match p.familia {
        dist::FAM_PERFURADA if p.perf_passo_x > 0.0 && p.perf_passo_y > 0.0 && p.perf_diam > 0.0 => {
            std::f64::consts::PI * p.perf_diam * p.perf_diam / 4.0 / (p.perf_passo_x * p.perf_passo_y)
        }
        dist::FAM_TELA if p.tela_larg > 0.0 && p.tela_alt > 0.0 => ((p.tela_larg - p.tela_fio).max(0.0) * (p.tela_alt - p.tela_fio).max(0.0)) / (p.tela_larg * p.tela_alt),
        _ => 0.0,
    };
    f.clamp(0.0, 0.99)
}

fn m_largura_poste(p: &ParamPostes) -> f64 {
    let mut l: f64 = 0.0;
    for q in [&p.inicio, &p.fim, &p.canto, &p.intermediario] {
        if q.ativo {
            l = l.max(envelope(&q.perfil).0);
        }
    }
    l
}

/// Agrupa por guarda para as consultas.
pub fn pecas_por_guarda(m: &Montagem) -> BTreeMap<u32, Vec<&PecaGC>> {
    let mut r: BTreeMap<u32, Vec<&PecaGC>> = BTreeMap::new();
    for p in &m.pecas {
        r.entry(p.guarda).or_default().push(p);
    }
    r
}

/// Saídas de `guarda_malha`: `grupos`, `vertices`, `indices`.
pub fn saida_malha(m: &Montagem) -> Vec<Saida> {
    let mut g = Vec::new();
    for x in &m.malha.grupos {
        g.extend_from_slice(&[x.guarda, x.papel, x.material, x.primeiro, x.n]);
    }
    let v: Vec<f64> = m.malha.vertices.iter().flat_map(|p| p.iter().copied()).collect();
    vec![Saida::U32(g), Saida::F64(v), Saida::U32(m.malha.indices.clone())]
}

#[cfg(test)]
pub(crate) mod testes {
    use super::*;
    use crate::esquema::NIVEL_TODOS;

    fn ext0() -> ExtensaoLinha {
        ExtensaoLinha { estilo: 0, comprimento: 0.0, mais_piso: false }
    }

    /// Guarda manual em L (4 m por 3 m), com postes, dois trilhos, balaústres entre os trilhos, um painel de vidro e um corrimão.
    pub(crate) fn cena_l(painel: bool) -> Cena {
        let mut c = Cena::novo();
        c.gc.perfis.insert(1, PerfilGuardaLinha { forma: FORMA_CIRCULAR, largura: 0.04, altura: 0.04, n_pontos: 0, lados: 16 });
        c.gc.perfis.insert(2, PerfilGuardaLinha { forma: FORMA_RETANGULAR, largura: 0.06, altura: 0.06, n_pontos: 0, lados: 16 });
        c.gc.tipos.insert(
            1,
            TipoGuardaLinha { altura: 1.1, desloc: 0.0, ajuste_patamar: 0.0, folga_inferior: 0.0, junc_angular: 0, junc_tangente: 0, conexao: 0, tol_corda: 0.002, norma: ID_AUSENTE },
        );
        for (i, (papel, ativo)) in [(POSTE_INICIO, true), (POSTE_FIM, true), (POSTE_CANTO, true), (POSTE_INTERMEDIARIO, true)].into_iter().enumerate() {
            c.gc.postes.insert(
                i as u32 + 1,
                PosteLinha { tipo: 1, papel, ativo, perfil: 2, material: 1, acima: 0.0, abaixo: 0.0, ang_canto: 0.0873, modo: 1, espacamento: 1.2, numero: 0 },
            );
        }
        c.gc.trilhos.insert(1, TrilhoLinha { tipo: 1, indice: 0, altura: 0.1, desloc: 0.0, perfil: 1, material: 2 });
        c.gc.trilhos.insert(2, TrilhoLinha { tipo: 1, indice: 1, altura: 1.05, desloc: 0.0, perfil: 1, material: 2 });
        c.gc.corrimaos.insert(
            1,
            CorrimaoLinha {
                tipo: 1,
                indice: 0,
                funcao: 1,
                posicao: 0,
                altura: 0.92,
                afastamento: 0.04,
                perfil: 1,
                material: 3,
                ext_inicio: ext0(),
                ext_fim: ext0(),
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
        c.gc.padroes.insert(
            1,
            PadraoLinha {
                tipo: 1,
                indice: 0,
                base_tipo: REF_TRILHO,
                base_idx: 0,
                topo_tipo: REF_TRILHO,
                topo_idx: 1,
                periodo: 0.12,
                justif: 3,
                sobra: 0,
                quebra: 0,
                ang_quebra: 0.0,
                escopo: 0,
                pd_ativo: false,
                pd_qtd: 0,
                pd_dist: 0.0,
                pd_perfil: ID_AUSENTE,
                pd_material: 0,
            },
        );
        c.gc.padrao_elementos.insert(1, ElementoPadraoLinha { padrao: 1, indice: 0, perfil: 1, material: 4, dist_anterior: 0.0, desloc_lateral: 0.0, desloc_base: 0.0, desloc_topo: 0.0 });
        if painel {
            c.gc.padroes.clear();
            c.gc.padrao_elementos.clear();
            c.gc.paineis.insert(
                1,
                PainelLinha {
                    tipo: 1,
                    indice: 0,
                    familia: 0,
                    base_tipo: REF_TRILHO,
                    base_idx: 0,
                    topo_tipo: REF_TRILHO,
                    topo_idx: 1,
                    desl_base: 0.0,
                    desl_topo: 0.0,
                    espessura: 0.012,
                    folga_lateral: 0.01,
                    largura_max: 1.5,
                    material: 5,
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
        }
        c.gc.guardas.insert(
            1,
            GuardaCorpoLinha {
                nivel: 0,
                tipo: 1,
                hosp: HOSP_MANUAL,
                hosp_num: 0,
                lados: 0b0101,
                pos_base: 0,
                desloc: 0.0,
                altura: f64::NAN,
                inverter: false,
                fechado: false,
                lado_desloc: 0,
                cota_base: 0.0,
                flags: 7,
            },
        );
        for (i, (x, y)) in [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0)].into_iter().enumerate() {
            c.gc.caminhos.insert(i as u32 + 1, CaminhoLinha { guarda: 1, indice: i as u32, x, y, dz: 0.0 });
        }
        c
    }

    /// Fonte unica: cada grupo da malha tem exatamente uma peca logica do mesmo papel (quantidade e desenho nunca divergem).
    fn confere_fonte_unica(m: &Montagem) {
        for papel in 0..8u32 {
            let na_malha = m.malha.grupos.iter().filter(|g| g.papel == papel).count();
            let nas_pecas = m.pecas.iter().filter(|p| p.papel == papel).count();
            assert_eq!(na_malha, nas_pecas, "papel {papel}: malha x quantidade");
        }
    }

    #[test]
    fn quantidade_e_malha_contam_as_mesmas_pecas_com_cabos_e_suportes() {
        let mut c = cena_l(false);
        c.gc.padroes.clear();
        c.gc.padrao_elementos.clear();
        for orient in [0u8, 1] {
            let id = 1 + orient as u32;
            c.gc.paineis.insert(
                id,
                PainelLinha {
                    tipo: 1, indice: id - 1, familia: 4, base_tipo: REF_TRILHO, base_idx: 0, topo_tipo: REF_TRILHO, topo_idx: 1, desl_base: 0.0, desl_topo: 0.0,
                    espessura: 0.0, folga_lateral: 0.01, largura_max: 0.0, material: 6, perf_diam: 0.0, perf_passo_x: 0.0, perf_passo_y: 0.0, perf_alternado: false,
                    tela_larg: 0.0, tela_alt: 0.0, tela_fio: 0.0, cabo_diam: 0.008, cabo_espac: 0.1, cabo_orient: orient,
                },
            );
        }
        let co = c.gc.corrimaos.get_mut(&1).unwrap();
        co.posicao = 1;
        co.sup_layout = 3;
        co.sup_numero = 3;
        co.sup_perfil = 1;
        co.sup_comp = 0.1;
        let m = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).expect("montar");
        assert!(m.pecas.iter().any(|p| p.papel == 6), "cabos viram pecas");
        assert!(m.pecas.iter().any(|p| p.papel == 4), "suportes viram pecas");
        confere_fonte_unica(&m);
        let sem_malha = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).expect("montar");
        assert_eq!(sem_malha.pecas.len(), m.pecas.len(), "a quantidade nao depende de gerar a malha");
        assert_eq!(crate::gc_quant::quant_guarda(&sem_malha.pecas), crate::gc_quant::quant_guarda(&m.pecas));
    }

    fn nos_do_trilho(m: &Montagem, altura: f64) -> usize {
        m.pecas
            .iter()
            .filter(|p| p.papel == 2)
            .find_map(|p| match &p.forma {
                FormaGC::Varrida { nos, .. } if (nos[0].z - altura).abs() < 1e-6 => Some(nos.len()),
                _ => None,
            })
            .expect("trilho")
    }

    #[test]
    fn trilho_soldado_e_com_filete_ganham_nos_no_canto() {
        let mut c = cena_l(false);
        let base = nos_do_trilho(&montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).unwrap(), 1.05);
        c.gc.tipos.get_mut(&1).unwrap().conexao = 1;
        let soldado = nos_do_trilho(&montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).unwrap(), 1.05);
        assert!(soldado > base, "soldar: arco de 8 segmentos no canto ({soldado} > {base})");
        c.gc.tipos.get_mut(&1).unwrap().conexao = 0;
        let co = c.gc.corrimaos.get_mut(&1).unwrap();
        co.juncao = 1;
        co.raio_filete = 0.3;
        let filete = nos_do_trilho(&montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).unwrap(), 1.05);
        assert!(filete > base, "filete acompanha o corrimão ({filete} > {base})");
    }

    #[test]
    fn suporte_alinhado_com_postes_usa_as_posicoes_dos_postes() {
        let mut c = cena_l(false);
        let co = c.gc.corrimaos.get_mut(&1).unwrap();
        co.posicao = 1;
        co.sup_layout = 2;
        co.sup_perfil = 1;
        co.sup_comp = 0.1;
        let m = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).unwrap();
        let sup = m.pecas.iter().filter(|p| p.papel == 4).count();
        let postes = m.pecas.iter().filter(|p| p.papel == 0).count();
        assert!(sup > 0, "o layout alinhar com postes gera suportes");
        assert_eq!(sup, postes, "um suporte por poste (dos 2 lados do eixo só um corrimão)");
    }

    #[test]
    fn area_liquida_do_painel_perfurado_e_da_tela() {
        let mut c = cena_l(true);
        let bruta = crate::gc_quant::quant_guarda(&montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).unwrap().pecas);
        let area = |l: &[crate::gc_quant::LinhaQuant]| l.iter().filter(|x| x.papel == gc_malha::PAPEL_PAINEL).map(|x| (x.area, x.volume)).fold((0.0, 0.0), |a, b| (a.0 + b.0, a.1 + b.1));
        let (a0, v0) = area(&bruta);
        let p = c.gc.paineis.get_mut(&1).unwrap();
        p.familia = 2;
        p.perf_diam = 0.01;
        p.perf_passo_x = 0.02;
        p.perf_passo_y = 0.02;
        let fr = std::f64::consts::PI * 0.01 * 0.01 / 4.0 / (0.02 * 0.02);
        let (a1, v1) = area(&crate::gc_quant::quant_guarda(&montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).unwrap().pecas));
        assert!((a1 / a0 - (1.0 - fr)).abs() < 1e-6 && (v1 / v0 - (1.0 - fr)).abs() < 1e-4);
        let p = c.gc.paineis.get_mut(&1).unwrap();
        p.familia = 3;
        p.tela_larg = 0.05;
        p.tela_alt = 0.05;
        p.tela_fio = 0.005;
        let (a2, _) = area(&crate::gc_quant::quant_guarda(&montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, false).unwrap().pecas));
        assert!((a2 / a0 - (1.0 - 0.9 * 0.9)).abs() < 1e-4);
    }

    #[test]
    fn guarda_l_com_balaustres_trilhos_e_corrimao() {
        let c = cena_l(false);
        let m = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).expect("montar");
        let papeis: Vec<u32> = m.malha.grupos.iter().map(|g| g.papel).collect();
        for p in [gc_malha::PAPEL_POSTE, gc_malha::PAPEL_BALAUSTRE, gc_malha::PAPEL_TRILHO, gc_malha::PAPEL_CORRIMAO] {
            assert!(papeis.contains(&p), "falta o papel {p}");
        }
        assert!(m.malha.grupos.iter().filter(|g| g.papel == gc_malha::PAPEL_BALAUSTRE).count() > 40);
        assert_eq!(m.malha.grupos.iter().filter(|g| g.papel == gc_malha::PAPEL_TRILHO).count(), 2);
        // Toda peça é um sólido fechado e orientado.
        for (i, g) in m.malha.grupos.iter().enumerate() {
            let a = m.malha.analisar(i);
            assert!(a.fechada && a.volume > 0.0, "grupo {i} (papel {}) aberto ou invertido: {a:?}", g.papel);
        }
        assert!(!m.pecas.is_empty());
        confere_fonte_unica(&m);
        let m2 = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).expect("montar");
        assert_eq!(m.malha.vertices, m2.malha.vertices);
        assert_eq!(m.malha.indices, m2.malha.indices);
    }

    #[test]
    fn guarda_l_com_painel_de_vidro_e_consultas_planta_corte_quant() {
        let c = cena_l(true);
        let m = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).expect("montar");
        assert!(m.malha.grupos.iter().any(|g| g.papel == gc_malha::PAPEL_PAINEL));
        let planta = crate::gc_planta::guarda_planta(&m.cadeia, &m.pecas, 0.5, 1);
        assert!(planta.len() > 1, "eixo e peças na planta");
        let corte = crate::gc_corte::guarda_corte(&m.pecas, -1.0, 0.0, 1.0, 0.0, 10.0);
        assert!(!corte.is_empty());
        let q = crate::gc_quant::quant_guarda(&m.pecas);
        assert!(q.iter().any(|l| l.papel == gc_malha::PAPEL_PAINEL && l.area > 1.0));
    }

    #[test]
    fn lado_desligado_e_flags_tiram_as_pecas() {
        let mut c = cena_l(false);
        c.gc.guardas.get_mut(&1).unwrap().flags = 0;
        let m = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).expect("montar");
        assert!(m.malha.grupos.iter().all(|g| g.papel == gc_malha::PAPEL_POSTE || g.papel == gc_malha::PAPEL_TRILHO));
    }
}
