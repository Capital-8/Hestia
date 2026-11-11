//! Casos de paridade da parede cortina (decisão 0056, fase 1): `tests/fixtures/cortina_paridade.json`.
//!
//! Cada caso tem a ENTRADA no formato `CortinaEntrada` da referência TS (`packages/engine/src/cortinaRef/tipos.ts`: `L`, `H`, `tipo`, `instancia`,
//! `montantes`, `paineis`, com os nomes do modelo: `fixedNumber`, `justify`, `minRemainder`...) e a SAÍDA esperada no formato `SaidaConsulta` dela
//! (`cortina_grade`, `cortina_pecas`, `quant_cortina`, `cortina_avisos`: vetores planos, grade de 1 µm), lida do Rust REAL por esta mesma rotina. A cortina
//! do caso é reta, de (0, 0) a (L, 0), com a linha de localização no centro, na cota 0: o mundo coincide com o plano (s, z). `cortina_pecas` sai da função de
//! teste `cortina_pecas::tabela_pecas` (não é uma consulta). Tolerância: posições e áreas 1e-6, contagens exatas. Caso de erro: `{ "erro": "ENTRADA" | "LIMITE" }`.
//!
//! Este teste faz as duas coisas: sem variável de ambiente, gera tudo de novo e confere com o arquivo (o arquivo não pode ficar defasado); com
//! `HESTIA_GERAR_FIXTURES=1`, regrava o arquivo:
//!
//! ```text
//! HESTIA_GERAR_FIXTURES=1 cargo test -p geom-wasm --test cortina_paridade
//! ```

use geom_wasm::cena::Cena;
use geom_wasm::consultas::{executar, Saida};
use geom_wasm::esquema::{self, bytes_coluna, Tipo, ENTRADA, ID_AUSENTE, LIMITE};
use serde_json::{json, Map, Value};

const CAMINHO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/cortina_paridade.json");
const NAN: f64 = f64::NAN;
const HERDA: f64 = 255.0;

// ───────────── catálogos fixos ─────────────

struct Montante {
    chave: &'static str,
    num: u32,
    forma: &'static str,
    largura: f64,
    profundidade: f64,
    material: u32,
}

struct Painel {
    chave: &'static str,
    num: u32,
    tipo: &'static str,
    espessura: f64,
    encaixe: Option<f64>,
    material: u32,
}

/// O mesmo catálogo de `cortinaRef/casos.ts` (ids, `num` e `materialNum`).
const MONTANTES: [Montante; 5] = [
    Montante { chave: "mul_ret_50x100", num: 1, forma: "rect", largura: 0.05, profundidade: 0.1, material: 1 },
    Montante { chave: "mul_ret_50x150", num: 2, forma: "rect", largura: 0.05, profundidade: 0.15, material: 1 },
    Montante { chave: "mul_red_50", num: 3, forma: "round", largura: 0.05, profundidade: 0.05, material: 1 },
    Montante { chave: "mul_junta_12", num: 4, forma: "rect", largura: 0.012, profundidade: 0.02, material: 3 },
    Montante { chave: "mul_largo_200", num: 5, forma: "rect", largura: 0.2, profundidade: 0.1, material: 1 },
];

const PAINEIS: [Painel; 3] = [
    Painel { chave: "pnl_vidro_10", num: 1, tipo: "glass", espessura: 0.01, encaixe: None, material: 2 },
    Painel { chave: "pnl_solido_alu_4", num: 2, tipo: "solid", espessura: 0.004, encaixe: Some(0.01), material: 1 },
    Painel { chave: "pnl_vazio", num: 3, tipo: "empty", espessura: 0.0, encaixe: None, material: 2 },
];

// ───────────── seções ─────────────

fn bytes(secao: u32, n: usize, valores: &[(&str, Vec<f64>)]) -> Vec<u8> {
    let s = esquema::secao(secao).expect("seção");
    let mut out = Vec::new();
    for c in s.colunas {
        let v: Vec<f64> = valores.iter().find(|(nome, _)| *nome == c.nome).map(|(_, v)| v.clone()).unwrap_or_else(|| vec![0.0; n]);
        assert_eq!(v.len(), n, "coluna {}", c.nome);
        let mut col = Vec::new();
        for x in v {
            match c.tipo {
                Tipo::U32 => col.extend_from_slice(&(x as u32).to_le_bytes()),
                Tipo::I32 => col.extend_from_slice(&(x as i32).to_le_bytes()),
                Tipo::F64 => col.extend_from_slice(&x.to_le_bytes()),
                Tipo::U8 => col.push(x as u8),
            }
        }
        col.resize(bytes_coluna(c.tipo, n).expect("tamanho"), 0);
        out.extend(col);
    }
    out
}

fn num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(Value::as_f64)
}

fn texto<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(Value::as_str)
}

const MODOS: [&str; 4] = ["fixedNumber", "fixedDistance", "maxDistance", "manual"];
const JUSTIFS: [&str; 3] = ["start", "center", "end"];
const ANCORAS: [&str; 2] = ["start", "end"];

fn indice(lista: &[&str], v: &str) -> f64 {
    lista.iter().position(|x| *x == v).unwrap_or_else(|| panic!("valor {v}")) as f64
}

/// Uma linha de `grades_cortina` a partir de um eixo em JSON (campo ausente = "herda").
fn linha_grade(id: u32, dono: u8, dono_num: u32, eixo: u8, a: &Value) -> Vec<(&'static str, f64)> {
    vec![
        ("id_num", id as f64),
        ("dono", dono as f64),
        ("dono_num", dono_num as f64),
        ("eixo", eixo as f64),
        ("modo", texto(a, "mode").map(|m| indice(&MODOS, m)).unwrap_or(HERDA)),
        ("numero", num(a, "count").unwrap_or(ID_AUSENTE as f64)),
        ("distancia", num(a, "distance").unwrap_or(NAN)),
        ("justificacao", texto(a, "justify").map(|m| indice(&JUSTIFS, m)).unwrap_or(HERDA)),
        ("ancora", texto(a, "anchor").map(|m| indice(&ANCORAS, m)).unwrap_or(HERDA)),
        ("deslocamento", num(a, "offset").unwrap_or(NAN)),
        ("angulo", num(a, "angle").unwrap_or(NAN)),
        ("resto_minimo", num(a, "minRemainder").unwrap_or(NAN)),
    ]
}

/// Monta a cena das seções 100 a 105 a partir de uma `entrada` (formato `CortinaEntrada`).
fn montar_cena(e: &Value) -> Cena {
    let mut c = Cena::novo();
    let col = |nome: &'static str, v: Vec<f64>| (nome, v);
    let ms = e["montantes"].as_array().expect("montantes");
    let n = ms.len();
    let b = bytes(
        esquema::SECAO_TIPOS_MONTANTE_CORTINA,
        n,
        &[
            col("id_num", ms.iter().map(|m| num(m, "num").expect("num")).collect()),
            col("forma", ms.iter().map(|m| if texto(&m["profile"], "shape") == Some("round") { 1.0 } else { 0.0 }).collect()),
            col("largura", ms.iter().map(|m| num(&m["profile"], "width").expect("width")).collect()),
            col("profundidade", ms.iter().map(|m| num(&m["profile"], "depth").expect("depth")).collect()),
            col("deslocamento", ms.iter().map(|m| num(m, "offset").unwrap_or(0.0)).collect()),
            col("material_num", ms.iter().map(|m| num(m, "materialNum").expect("materialNum")).collect()),
        ],
    );
    c.definir_secao(esquema::SECAO_TIPOS_MONTANTE_CORTINA, n as u32, &b).expect("montantes");
    let ps = e["paineis"].as_array().expect("paineis");
    let n = ps.len();
    let b = bytes(
        esquema::SECAO_TIPOS_PAINEL_CORTINA,
        n,
        &[
            col("id_num", ps.iter().map(|p| num(p, "num").expect("num")).collect()),
            col("tipo", ps.iter().map(|p| ["glass", "solid", "empty"].iter().position(|x| Some(*x) == texto(p, "kind")).expect("kind") as f64).collect()),
            col("espessura", ps.iter().map(|p| num(p, "thickness").expect("thickness")).collect()),
            col("deslocamento", ps.iter().map(|p| num(p, "offset").unwrap_or(0.0)).collect()),
            col("encaixe", ps.iter().map(|p| num(p, "bite").unwrap_or(NAN)).collect()),
            col("material_num", ps.iter().map(|p| num(p, "materialNum").expect("materialNum")).collect()),
        ],
    );
    c.definir_secao(esquema::SECAO_TIPOS_PAINEL_CORTINA, n as u32, &b).expect("painéis");
    let num_montante = |id: Option<&str>| -> f64 {
        id.map(|i| ms.iter().find(|m| texto(m, "id") == Some(i)).and_then(|m| num(m, "num")).unwrap_or_else(|| panic!("montante {i}"))).unwrap_or(ID_AUSENTE as f64)
    };
    let num_painel = |id: &str| -> f64 { ps.iter().find(|p| texto(p, "id") == Some(id)).and_then(|p| num(p, "num")).unwrap_or_else(|| panic!("painel {id}")) };

    // 101: o tipo (num 1).
    let tipo = &e["tipo"];
    let m = &tipo["mullions"];
    let papel = |k: &str| num_montante(texto(m, k));
    let b = bytes(
        esquema::SECAO_TIPOS_CORTINA,
        1,
        &[
            col("id_num", vec![1.0]),
            col("profundidade", vec![num(tipo, "depth").expect("depth")]),
            col("painel_padrao_num", vec![num_painel(texto(tipo, "defaultPanelTypeId").expect("painel"))]),
            col("mont_int_v", vec![papel("interiorVertical")]),
            col("mont_int_h", vec![papel("interiorHorizontal")]),
            col("mont_borda_ini", vec![papel("borderStart")]),
            col("mont_borda_fim", vec![papel("borderEnd")]),
            col("mont_borda_base", vec![papel("borderBottom")]),
            col("mont_borda_topo", vec![papel("borderTop")]),
            col("mont_canto", vec![ID_AUSENTE as f64]),
            col("prioridade", vec![if texto(m, "joinPriority") == Some("horizontal") { 1.0 } else { 0.0 }]),
            col("celula_minima", vec![num(tipo, "minCell").unwrap_or(NAN)]),
            col("faceta_max", vec![NAN]),
        ],
    );
    c.definir_secao(esquema::SECAO_TIPOS_CORTINA, 1, &b).expect("tipo");

    // 102 e 103: grades do tipo (ids 1 e 2) e da instância (3 e 4); posições manuais em 1000 + ordem etc.
    let mut linhas: Vec<Vec<(&'static str, f64)>> = vec![linha_grade(1, 0, 1, 0, &tipo["u"]), linha_grade(2, 0, 1, 1, &tipo["v"])];
    let cnum = num(e, "num").unwrap_or(1.0) as u32;
    let inst = e.get("instancia").filter(|v| !v.is_null());
    if let Some(i) = inst {
        for (eixo, k, id) in [(0u8, "u", 3u32), (1, "v", 4)] {
            if let Some(a) = i.get("grid").and_then(|g| g.get(k)) {
                linhas.push(linha_grade(id, 1, cnum, eixo, a));
            }
        }
    }
    let n = linhas.len();
    let colunas: Vec<(&str, Vec<f64>)> = linhas[0].iter().enumerate().map(|(k, (nome, _))| (*nome, linhas.iter().map(|l| l[k].1).collect())).collect();
    c.definir_secao(esquema::SECAO_GRADES_CORTINA, n as u32, &bytes(esquema::SECAO_GRADES_CORTINA, n, &colunas)).expect("grades");
    let mut posicoes: Vec<(u32, u32, u32, f64)> = Vec::new(); // (id, grade, ordem, pos)
    let mut juntar = |grade: u32, a: &Value, base: u32| {
        if let Some(p) = a.get("positions").and_then(Value::as_array) {
            for (k, x) in p.iter().enumerate() {
                posicoes.push((base + k as u32, grade, k as u32, x.as_f64().expect("posição")));
            }
        }
    };
    juntar(1, &tipo["u"], 1000);
    juntar(2, &tipo["v"], 2000);
    if let Some(i) = inst {
        for (k, id, base) in [("u", 3u32, 3000u32), ("v", 4, 4000)] {
            if let Some(a) = i.get("grid").and_then(|g| g.get(k)) {
                juntar(id, a, base);
            }
        }
    }
    let n = posicoes.len();
    let b = bytes(
        esquema::SECAO_GRADE_POSICOES_CORTINA,
        n,
        &[
            col("id_num", posicoes.iter().map(|p| p.0 as f64).collect()),
            col("grade_num", posicoes.iter().map(|p| p.1 as f64).collect()),
            col("ordem", posicoes.iter().map(|p| p.2 as f64).collect()),
            col("pos", posicoes.iter().map(|p| p.3).collect()),
        ],
    );
    c.definir_secao(esquema::SECAO_GRADE_POSICOES_CORTINA, n as u32, &b).expect("posições");

    // 100: a cortina, reta de (0, 0) a (L, 0).
    let painel_inst = inst.and_then(|i| texto(i, "defaultPanelTypeId")).map(num_painel).unwrap_or(ID_AUSENTE as f64);
    let b = bytes(
        esquema::SECAO_CORTINAS,
        1,
        &[
            col("id_num", vec![cnum as f64]),
            col("tipo_num", vec![1.0]),
            col("bx", vec![num(e, "L").expect("L")]),
            col("altura", vec![num(e, "H").expect("H")]),
            col("painel_padrao_num", vec![painel_inst]),
            col("hosp_num", vec![ID_AUSENTE as f64]),
        ],
    );
    c.definir_secao(esquema::SECAO_CORTINAS, 1, &b).expect("cortina");
    c
}

// ───────────── saídas ─────────────

fn u(s: &Saida) -> &[u32] {
    match s {
        Saida::U32(v) => v,
        _ => panic!("esperava u32"),
    }
}

fn f(s: &Saida) -> &[f64] {
    match s {
        Saida::F64(v) => v,
        _ => panic!("esperava f64"),
    }
}

fn nome_erro(c: u32) -> &'static str {
    match c {
        ENTRADA => "ENTRADA",
        LIMITE => "LIMITE",
        _ => "OUTRO",
    }
}

fn arr_u(s: &Saida) -> Value {
    json!(u(s))
}

fn arr_f(s: &Saida) -> Value {
    // Sem -0.
    json!(f(s).iter().map(|x| x + 0.0).collect::<Vec<f64>>())
}

/// As saídas esperadas de um caso, no formato `SaidaConsulta` da referência.
fn saida_do_caso(e: &Value) -> Value {
    let mut c = montar_cena(e);
    let g = match executar(&mut c, esquema::CONSULTA_CORTINA_GRADE, &[0.0]) {
        Ok(g) => g,
        Err(cod) => return json!({ "erro": nome_erro(cod) }),
    };
    let q = executar(&mut c, esquema::CONSULTA_QUANT_CORTINA, &[0.0]).expect("quant");
    let a = executar(&mut c, esquema::CONSULTA_CORTINA_AVISOS, &[0.0]).expect("avisos");
    let t = geom_wasm::cortina_pecas::tabela_pecas(&c, 0).expect("peças");
    json!({
        "nome": texto(e, "nome").unwrap_or(""),
        "cortina_num": num(e, "num").unwrap_or(1.0),
        "cortina_grade": {
            "linhas": arr_u(&g[0]), "linhas_pos": arr_f(&g[1]), "celulas": arr_u(&g[2]), "celulas_ret": arr_f(&g[3]), "segmentos": arr_u(&g[4]), "segmentos_ext": arr_f(&g[5]),
        },
        "cortina_pecas": {
            "montantes": t.montantes, "montantes_geo": t.montantes_geo.iter().map(|x| x + 0.0).collect::<Vec<f64>>(),
            "paineis": t.paineis, "paineis_geo": t.paineis_geo.iter().map(|x| x + 0.0).collect::<Vec<f64>>(),
        },
        "quant_cortina": { "linhas": arr_u(&q[0]), "valores": arr_f(&q[1]) },
        "cortina_avisos": { "avisos": arr_u(&a[0]), "valores": arr_f(&a[1]) },
    })
}

// ───────────── casos ─────────────

#[allow(clippy::too_many_arguments)]
#[allow(clippy::too_many_arguments)]
fn caso(id: &str, descricao: &str, comprimento: f64, altura: f64, u_: Value, v_: Value, mullions: Value, painel: &str) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("descricao".into(), json!(descricao));
    let montantes: Vec<Value> = MONTANTES
        .iter()
        .map(|x| json!({ "id": x.chave, "num": x.num, "profile": { "shape": x.forma, "width": x.largura, "depth": x.profundidade }, "materialId": format!("mat{}", x.material), "materialNum": x.material }))
        .collect();
    let paineis: Vec<Value> = PAINEIS
        .iter()
        .map(|x| {
            let mut p = json!({ "id": x.chave, "num": x.num, "kind": x.tipo, "thickness": x.espessura, "materialId": format!("mat{}", x.material), "materialNum": x.material });
            if let Some(b) = x.encaixe {
                p["bite"] = json!(b);
            }
            p
        })
        .collect();
    m.insert(
        "entrada".into(),
        json!({
            "nome": id, "L": comprimento, "H": altura,
            "tipo": { "depth": 0.12, "u": u_, "v": v_, "mullions": mullions, "defaultPanelTypeId": painel },
            "montantes": montantes, "paineis": paineis,
        }),
    );
    m
}

fn montantes_todos(chave: &str, prioridade: &str) -> Value {
    json!({ "interiorVertical": chave, "interiorHorizontal": chave, "borderStart": chave, "borderEnd": chave, "borderBottom": chave, "borderTop": chave, "joinPriority": prioridade })
}

fn com(mut c: Map<String, Value>, campo: &str, valor: Value) -> Map<String, Value> {
    let e = c.get_mut("entrada").and_then(Value::as_object_mut).expect("entrada");
    match campo {
        "minCell" => e["tipo"]["minCell"] = valor,
        "profundidade" => e["tipo"]["depth"] = valor,
        _ => {
            // instancia: { grid, defaultPanelTypeId }; sem campo nulo.
            let mut v = valor;
            if let Some(o) = v.as_object_mut() {
                o.retain(|_, x| !x.is_null());
            }
            e.insert(campo.into(), v);
        }
    }
    c
}

fn fixa(d: f64, j: &str) -> Value {
    json!({ "mode": "fixedDistance", "distance": d, "justify": j })
}

fn numero(n: u32) -> Value {
    json!({ "mode": "fixedNumber", "count": n })
}

fn maxima(d: f64) -> Value {
    json!({ "mode": "maxDistance", "distance": d })
}

fn manual(p: &[f64], ancora: &str) -> Value {
    json!({ "mode": "manual", "positions": p, "anchor": ancora })
}

fn deslocado(mut a: Value, o: f64) -> Value {
    a["offset"] = json!(o);
    a
}

fn resto(mut a: Value, r: f64) -> Value {
    a["minRemainder"] = json!(r);
    a
}

fn casos_curados() -> Vec<Map<String, Value>> {
    let ret = || montantes_todos("mul_ret_50x100", "vertical");
    let mut v = Vec::new();
    v.push(caso("numero-4x3", "fixedNumber nos dois eixos", 6.0, 3.0, numero(4), numero(3), ret(), "pnl_vidro_10"));
    v.push(caso("numero-1x1", "uma célula só", 2.0, 3.0, numero(1), numero(1), ret(), "pnl_vidro_10"));
    v.push(caso("maxima-exata", "maxDistance com divisão exata (3 / 1,5)", 3.0, 3.0, maxima(1.5), maxima(1.5), ret(), "pnl_vidro_10"));
    v.push(caso("maxima-nao-exata", "maxDistance 6 / 1,25 = 5 células de 1,2", 6.0, 2.5, maxima(1.25), maxima(0.9), ret(), "pnl_vidro_10"));
    v.push(caso("maxima-ponto-flutuante", "1,1 / 0,1 = 11,000000000000002 conta como 11 células", 1.1, 1.1, maxima(0.1), maxima(0.1), ret(), "pnl_vidro_10"));
    for j in ["start", "center", "end"] {
        v.push(caso(&format!("fixa-{j}-com-sobra"), "fixedDistance 4,7 m com d = 1,5 (sobra de 0,2 m) e 3,8 m com d = 1,2 (sobra de 0,2 m)", 4.7, 3.8, fixa(1.5, j), fixa(1.2, j), ret(), "pnl_vidro_10"));
        v.push(caso(&format!("fixa-{j}-sobra-fundida"), "sobra de 0,03 m (< 0,05) é fundida na célula vizinha", 4.53, 3.03, fixa(1.5, j), fixa(1.5, j), ret(), "pnl_vidro_10"));
        v.push(caso(&format!("fixa-{j}-divisao-exata"), "sem sobra: nenhuma linha nas pontas", 4.5, 3.0, fixa(1.5, j), fixa(1.5, j), ret(), "pnl_vidro_10"));
        v.push(caso(&format!("fixa-{j}-menor-que-d"), "parede menor que d: uma célula só", 0.8, 0.9, fixa(1.5, j), fixa(1.5, j), ret(), "pnl_vidro_10"));
    }
    v.push(caso("fixa-sobra-no-limiar", "sobra de 0,06 m (>= 0,05) vira célula própria", 4.56, 3.0, fixa(1.5, "start"), fixa(1.5, "start"), ret(), "pnl_vidro_10"));
    v.push(caso("fixa-limiar-configuravel", "minRemainder = 0,2: a sobra de 0,1 m é fundida", 4.6, 3.1, resto(fixa(1.5, "start"), 0.2), resto(fixa(1.5, "end"), 0.2), ret(), "pnl_vidro_10"));
    v.push(caso("fixa-limiar-zero", "minRemainder = 0 desliga a fusão", 4.53, 3.03, resto(fixa(1.5, "start"), 0.0), resto(fixa(1.5, "start"), 0.0), ret(), "pnl_vidro_10"));
    v.push(caso("fixa-sobra-fundida-aviso", "célula fundida passa de 1,5 d: aviso sobra-fundida", 3.7, 3.7, resto(fixa(1.0, "start"), 0.8), resto(fixa(1.0, "end"), 0.8), ret(), "pnl_vidro_10"));
    v.push(caso("manual-inicio", "posições medidas do início", 10.0, 4.0, manual(&[2.0, 7.5], "start"), manual(&[1.0, 2.5], "start"), ret(), "pnl_vidro_10"));
    v.push(caso("manual-fim", "posições medidas do fim", 10.0, 4.0, manual(&[2.0, 7.5], "end"), manual(&[0.9], "end"), ret(), "pnl_vidro_10"));
    v.push(caso("manual-fora-e-duplicada", "posições fora de (0, A) e duplicadas", 3.0, 3.0, manual(&[1.0, 1.0000001, 3.0, 4.0, 0.0], "start"), manual(&[2.0, 5.0], "start"), ret(), "pnl_vidro_10"));
    v.push(caso("manual-fora-de-ordem", "posições fora de ordem saem crescentes", 10.0, 4.0, manual(&[8.0, 2.0, 5.0], "start"), numero(1), ret(), "pnl_vidro_10"));
    v.push(caso("offset-numero-positivo", "deslocamento de 0,5 m em fixedNumber", 6.0, 3.0, deslocado(numero(4), 0.5), deslocado(numero(3), 0.3), ret(), "pnl_vidro_10"));
    v.push(caso("offset-numero-sai", "deslocamento de 1,6 m: a última linha sai do vão", 6.0, 3.0, deslocado(numero(4), 1.6), numero(2), ret(), "pnl_vidro_10"));
    v.push(caso("offset-numero-negativo", "deslocamento de -1,6 m: a primeira linha sai", 6.0, 3.0, deslocado(numero(4), -1.6), numero(2), ret(), "pnl_vidro_10"));
    v.push(caso("offset-numero-funde", "deslocamento deixa uma célula de ponta de 0,03 m: fundida", 4.0, 3.0, deslocado(numero(4), 0.97), numero(2), ret(), "pnl_vidro_10"));
    v.push(caso("offset-fixa", "deslocamento em fixedDistance: a primeira célula mede d + o", 6.0, 3.0, deslocado(fixa(1.5, "start"), 0.2), deslocado(fixa(1.0, "end"), -0.3), ret(), "pnl_vidro_10"));
    v.push(caso("offset-fixa-funde", "deslocamento negativo deixa 0,04 m na ponta: fundida", 6.0, 3.0, deslocado(fixa(1.5, "start"), -1.46), numero(1), ret(), "pnl_vidro_10"));
    v.push(caso("offset-manual", "o deslocamento move também as posições manuais", 5.2, 3.0, deslocado(manual(&[1.0, 5.0], "start"), 0.5), numero(1), ret(), "pnl_vidro_10"));
    // montantes
    v.push(caso("prioridade-vertical", "montante vertical contínuo, horizontal quebrado", 4.0, 3.0, numero(2), numero(2), montantes_todos("mul_ret_50x100", "vertical"), "pnl_vidro_10"));
    v.push(caso("prioridade-horizontal", "montante horizontal contínuo, vertical quebrado", 4.0, 3.0, numero(2), numero(2), montantes_todos("mul_ret_50x100", "horizontal"), "pnl_vidro_10"));
    v.push(caso("montantes-redondos", "montante redondo de 50 mm em todos os papéis", 4.0, 3.0, numero(3), numero(3), montantes_todos("mul_red_50", "vertical"), "pnl_vidro_10"));
    v.push(caso("montantes-mistos", "um tipo de montante por papel", 5.0, 3.6, numero(3), numero(3), json!({ "interiorVertical": "mul_ret_50x150", "interiorHorizontal": "mul_red_50", "borderStart": "mul_largo_200", "borderEnd": "mul_largo_200", "borderBottom": "mul_ret_50x100", "borderTop": "mul_ret_50x100", "joinPriority": "vertical" }), "pnl_vidro_10"));
    v.push(caso("montantes-mistos-horizontal", "o mesmo, com o horizontal contínuo", 5.0, 3.6, numero(3), numero(3), json!({ "interiorVertical": "mul_ret_50x150", "interiorHorizontal": "mul_red_50", "borderStart": "mul_largo_200", "borderEnd": "mul_largo_200", "borderBottom": "mul_ret_50x100", "borderTop": "mul_ret_50x100", "joinPriority": "horizontal" }), "pnl_vidro_10"));
    v.push(caso("sem-montante-de-borda", "bordas livres (vidro colado): o painel chega até a borda", 4.0, 3.0, numero(2), numero(2), json!({ "interiorVertical": "mul_junta_12", "interiorHorizontal": "mul_junta_12", "borderStart": Value::Null, "borderEnd": Value::Null, "borderBottom": Value::Null, "borderTop": Value::Null, "joinPriority": "horizontal" }), "pnl_solido_alu_4"));
    v.push(caso("sem-montante-nenhum", "nenhum montante: os painéis ocupam as células inteiras", 4.0, 3.0, numero(2), numero(2), json!({ "interiorVertical": Value::Null, "interiorHorizontal": Value::Null, "borderStart": Value::Null, "borderEnd": Value::Null, "borderBottom": Value::Null, "borderTop": Value::Null, "joinPriority": "vertical" }), "pnl_vidro_10"));
    // painéis
    v.push(caso("painel-solido", "painel sólido de 4 mm (encaixe de 10 mm)", 4.0, 3.0, numero(2), numero(2), ret(), "pnl_solido_alu_4"));
    v.push(caso("painel-vazio", "painel vazio: só os montantes, o vão sai da área líquida", 4.0, 3.0, numero(2), numero(2), ret(), "pnl_vazio"));
    // avisos
    v.push(caso("celula-pequena", "linhas a 3 cm uma da outra: célula pequena e montante sobreposto", 3.0, 2.0, manual(&[1.0, 1.03, 1.2], "start"), numero(1), ret(), "pnl_vidro_10"));
    v.push(com(caso("celula-minima-configuravel", "minCell = 0,6: todas as colunas de 0,5 m avisam", 2.0, 2.0, numero(4), numero(1), ret(), "pnl_vidro_10"), "minCell", json!(0.6)));
    v.push(com(caso("perfil-mais-fundo", "perfil de 150 mm num sistema de 80 mm", 4.0, 3.0, numero(2), numero(2), montantes_todos("mul_largo_200", "vertical"), "pnl_vidro_10"), "profundidade", json!(0.08)));
    v.push(caso("limite-de-celulas", "100 x 100 células: LIMITE", 50.0, 50.0, numero(100), numero(100), ret(), "pnl_vidro_10"));
    v.push(caso("limite-de-linhas", "130 linhas num eixo: LIMITE", 50.0, 3.0, numero(131), numero(1), ret(), "pnl_vidro_10"));
    // instância sobrescrevendo o tipo
    let mut c = caso("instancia-troca-justificacao", "a instância só troca a justificação e o deslocamento do eixo U; o resto vem do tipo", 6.0, 3.0, fixa(1.5, "start"), numero(2), ret(), "pnl_vidro_10");
    c = com(c, "instancia", json!({ "grid": { "u": { "justify": "end", "offset": 0.1 } }, "defaultPanelTypeId": Value::Null }));
    v.push(c);
    let mut c = caso("instancia-troca-modo", "a instância troca o modo do eixo V e o painel padrão", 6.0, 3.0, fixa(1.5, "start"), fixa(1.0, "start"), ret(), "pnl_vidro_10");
    c = com(c, "instancia", json!({ "grid": { "v": { "mode": "fixedNumber", "count": 3 } }, "defaultPanelTypeId": "pnl_solido_alu_4" }));
    v.push(c);
    let mut c = caso("instancia-posicoes-manuais", "a instância traz as próprias posições manuais", 8.0, 3.0, manual(&[1.0, 2.0], "start"), numero(1), ret(), "pnl_vidro_10");
    c = com(c, "instancia", json!({ "grid": { "u": { "positions": [3.0, 6.0] } }, "defaultPanelTypeId": Value::Null }));
    v.push(c);
    v
}

/// Gerador pseudoaleatório (xorshift64*), com semente fixa: o arquivo é reproduzível.
struct Aleatorio(u64);

impl Aleatorio {
    fn proximo(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    fn unidade(&mut self) -> f64 {
        (self.proximo() >> 11) as f64 / (1u64 << 53) as f64
    }

    fn entre(&mut self, a: f64, b: f64) -> f64 {
        a + (b - a) * self.unidade()
    }

    fn inteiro(&mut self, a: u32, b: u32) -> u32 {
        a + (self.proximo() % (b - a + 1) as u64) as u32
    }

    fn escolhe<'a, T>(&mut self, v: &'a [T]) -> &'a T {
        &v[(self.proximo() % v.len() as u64) as usize]
    }

    /// Valor com no máximo 3 casas decimais (como o usuário digita).
    fn milimetros(&mut self, a: f64, b: f64) -> f64 {
        (self.entre(a, b) * 1000.0).round() / 1000.0
    }
}

fn eixo_aleatorio(r: &mut Aleatorio, a: f64) -> Value {
    let mut e = match r.inteiro(0, 3) {
        0 => numero(r.inteiro(1, 8)),
        1 => fixa(r.milimetros(0.4, 2.5), r.escolhe(&["start", "center", "end"])),
        2 => maxima(r.milimetros(0.4, 2.5)),
        _ => {
            let n = r.inteiro(0, 5);
            let mut p: Vec<f64> = (0..n).map(|_| r.milimetros(-0.2, a + 0.3)).collect();
            if r.inteiro(0, 3) == 0 {
                if let Some(&x) = p.first() {
                    p.push(x); // duplicada
                }
            }
            manual(&p, r.escolhe(&["start", "end"]))
        }
    };
    if r.inteiro(0, 3) == 0 {
        e["offset"] = json!(r.milimetros(-1.2, 1.2));
    }
    if r.inteiro(0, 4) == 0 {
        e["minRemainder"] = json!(*r.escolhe(&[0.0, 0.02, 0.1, 0.3]));
    }
    e
}

fn casos_aleatorios(n: usize) -> Vec<Map<String, Value>> {
    let mut r = Aleatorio(0x9e37_79b9_7f4a_7c15);
    let chaves: Vec<&str> = MONTANTES.iter().map(|m| m.chave).collect();
    let paineis: Vec<&str> = PAINEIS.iter().map(|p| p.chave).collect();
    (0..n)
        .map(|k| {
            let (l, h) = (r.milimetros(0.5, 12.0), r.milimetros(0.5, 6.0));
            let (u_, v_) = (eixo_aleatorio(&mut r, l), eixo_aleatorio(&mut r, h));
            let papel = |r: &mut Aleatorio| if r.inteiro(0, 5) == 0 { Value::Null } else { json!(*r.escolhe(&chaves)) };
            let m = json!({
                "interiorVertical": papel(&mut r),
                "interiorHorizontal": papel(&mut r),
                "borderStart": papel(&mut r),
                "borderEnd": papel(&mut r),
                "borderBottom": papel(&mut r),
                "borderTop": papel(&mut r),
                "joinPriority": *r.escolhe(&["vertical", "horizontal"]),
            });
            let painel = *r.escolhe(&paineis);
            let mut c = caso(&format!("aleatorio-{k:03}"), "caso pseudoaleatório (semente fixa)", l, h, u_, v_, m, painel);
            if r.inteiro(0, 5) == 0 {
                c = com(c, "minCell", json!(r.milimetros(0.05, 0.6)));
            }
            if r.inteiro(0, 6) == 0 {
                let ei = eixo_aleatorio(&mut r, l);
                // A instância só traz alguns campos do eixo.
                let mut parcial = Map::new();
                for campo in ["offset", "minRemainder"] {
                    if let Some(x) = ei.get(campo) {
                        parcial.insert(campo.into(), x.clone());
                    }
                }
                if r.inteiro(0, 1) == 0 {
                    parcial.insert("offset".into(), json!(r.milimetros(-0.5, 0.5)));
                }
                c = com(c, "instancia", json!({ "grid": { "u": Value::Object(parcial) }, "defaultPanelTypeId": Value::Null }));
            }
            c
        })
        .collect()
}

const REGRAS: &str = "Regras numéricas (decisão 0056 §5 e README de cortinaRef): (1) posição 'dentro' é TOL < p < A - TOL, TOL = 1e-6; linha nas pontas é borda; linhas a menos de TOL viram uma (a primeira vale). (2) maxDistance: n = ceil(A/d - 1e-9) (mínimo 1); fixedDistance: m = floor(A/d + 1e-9), R = max(0, A - m*d); com m = 0 há uma célula só e o offset é ignorado. (3) fixedNumber/maxDistance: linhas A*k/n + offset para k = 0..n (as de k = 0 e k = n entram ou saem do vão); fixedDistance: padrão PERIÓDICO p0 + k*d + offset, p0 = 0 (start), R/2 (center) ou R (end). (4) Fusão da sobra: fixedDistance sempre; fixedNumber/maxDistance só com offset != 0; NUNCA no manual. Só as duas células de ponta, uma vez cada: primeira linha < r - 1e-9 some; A - última < r - 1e-9 some (r = minRemainder, padrão 0,05; r = 0 desliga). Aviso sobra-fundida (fixedDistance) quando a célula resultante passa de 1,5 d + 1e-9. (5) manual: posição = (anchor start ? p : A - p) + offset; fora de (TOL, A - TOL) é ignorada com aviso posicao-fora; aceita fora de ordem e duplicada (ordena e solda). (6) Eixo efetivo = {...tipo, ...instância} campo a campo; positions da instância (se houver) substituem as do tipo. (7) Montantes: o de BORDA fica EMBUTIDO em [0,L] x [0,H] (centro a meia largura da ponta); o interior fica centrado na linha. Peças POR SEGMENTO: a contínua vai de linha a linha (centro a centro nominal; a de borda também), a quebrada vai da face do contínuo à face do contínuo (centro + meia largura). round: profundidade = largura. (8) Painel livre = célula menos a meia largura dos montantes que a margeiam (a borda desconta a largura inteira, pois está embutida); um por célula, mesmo sem área; área bruta soma bite (padrão 0,012) por lado com montante (vazio e sem área: a visível). (9) Grade de 1 µm: Math.round(v*1e6)/1e6 (meio sobe). Tolerância: posições e áreas 1e-6; contagens e índices exatos.";

fn gerar() -> Value {
    let mut casos = casos_curados();
    casos.extend(casos_aleatorios(200));
    let casos: Vec<Value> = casos
        .into_iter()
        .map(|mut c| {
            let saida = saida_do_caso(&c["entrada"]);
            c.insert("saida".into(), saida);
            Value::Object(c)
        })
        .collect();
    json!({
        "descricao": "Casos de paridade da parede cortina (ADR 0056, fase 1): entradas (formato CortinaEntrada de cortinaRef) e saídas esperadas (formato SaidaConsulta) geradas pelo Rust (crates/geom-wasm/tests/cortina_paridade.rs).",
        "contrato": { "esquemaVersao": esquema::VERSAO_ESQUEMA, "consultas": ["cortina_grade", "quant_cortina", "cortina_avisos"], "tabelaDePecas": "cortina_pecas::tabela_pecas (função de teste, não é consulta)" },
        "tolerancias": { "posicaoEArea": 1e-6, "contagens": "exatas" },
        "regras": REGRAS,
        "legenda": {
            "entrada": "CortinaEntrada de cortinaRef/tipos.ts (L, H, tipo, instancia, montantes, paineis); a cortina é reta de (0,0) a (L,0), linha de localização no centro, cota 0",
            "saida": "SaidaConsulta de cortinaRef/consulta.ts; ou { erro: ENTRADA | LIMITE }",
            "papel": "montante 0 a 5 (interior vertical, interior horizontal, borda início, borda fim, borda base, borda topo); painel 10 vidro, 11 sólido, 12 vazio; 20 sistema",
            "avisos": "1 celula-pequena, 2 montante-sobreposto, 3 sobra-fundida, 4 posicao-fora, 5 profundidade-menor-que-perfil, 6 arco-nao-suportado (o montante-sobreposto mede entre os centros dos montantes)",
        },
        "casos": casos,
    })
}

/// O cabeçalho em JSON indentado e cada caso numa linha só (o arquivo fica legível no diff e com ~1/3 do tamanho).
fn texto_do_arquivo(v: &Value) -> String {
    let mut cabecalho = v.clone();
    let casos = cabecalho.as_object_mut().and_then(|o| o.remove("casos")).expect("casos");
    let mut texto = serde_json::to_string_pretty(&cabecalho).expect("json");
    assert!(texto.ends_with("\n}"));
    texto.truncate(texto.len() - 2);
    texto.push_str(",\n  \"casos\": [\n");
    let linhas: Vec<String> = casos.as_array().expect("lista").iter().map(|c| format!("    {}", serde_json::to_string(c).expect("json"))).collect();
    texto.push_str(&linhas.join(",\n"));
    texto.push_str("\n  ]\n}\n");
    texto
}

#[test]
fn fixture_de_paridade_esta_atualizada() {
    let gerado = gerar();
    if std::env::var("HESTIA_GERAR_FIXTURES").is_ok() {
        std::fs::create_dir_all(std::path::Path::new(CAMINHO).parent().expect("pasta")).expect("criar pasta");
        std::fs::write(CAMINHO, texto_do_arquivo(&gerado)).expect("gravar");
        return;
    }
    let texto = std::fs::read_to_string(CAMINHO).unwrap_or_else(|_| panic!("falta {CAMINHO}: rode `HESTIA_GERAR_FIXTURES=1 cargo test -p geom-wasm --test cortina_paridade`"));
    let lido: Value = serde_json::from_str(&texto).expect("JSON válido");
    assert_eq!(lido, gerado, "o arquivo de paridade está defasado: rode `HESTIA_GERAR_FIXTURES=1 cargo test -p geom-wasm --test cortina_paridade` e revise o diff");
}

#[test]
fn casos_sao_deterministicos_e_cobrem_o_que_o_adr_pede() {
    let a = gerar();
    let b = gerar();
    assert_eq!(a, b);
    let casos = a["casos"].as_array().expect("casos");
    assert!(casos.len() >= 200 + 40, "{} casos", casos.len());
    let ids: Vec<&str> = casos.iter().filter_map(|c| c["id"].as_str()).collect();
    let mut unicos = ids.clone();
    unicos.sort_unstable();
    unicos.dedup();
    assert_eq!(ids.len(), unicos.len(), "ids repetidos");
    // Cada modo, cada justificação e o deslocamento aparecem nas entradas; cada aviso e o erro de limite, nas saídas.
    let entradas = serde_json::to_string(&casos.iter().map(|c| c["entrada"].clone()).collect::<Vec<_>>()).expect("texto");
    for trecho in ["fixedNumber", "fixedDistance", "maxDistance", "\"manual\"", "\"start\"", "\"center\"", "\"end\"", "\"offset\"", "\"minRemainder\"", "\"minCell\"", "\"instancia\""] {
        assert!(entradas.contains(trecho), "nenhum caso com {trecho}");
    }
    let mut codigos = std::collections::BTreeSet::new();
    for c in casos {
        if let Some(a) = c["saida"]["cortina_avisos"]["avisos"].as_array() {
            for r in a.chunks(4) {
                codigos.insert(r[1].as_u64().expect("codigo"));
            }
        }
    }
    assert_eq!(codigos.into_iter().collect::<Vec<_>>(), vec![1, 2, 3, 4, 5], "códigos de aviso cobertos");
    assert!(casos.iter().any(|c| c["saida"]["erro"] == "LIMITE"));
    // A maioria dos aleatórios passa (os que falham com ENTRADA ou LIMITE são raros).
    let erros = casos.iter().filter(|c| c["saida"].get("erro").is_some()).count();
    assert!(erros <= 12, "{erros} casos com erro");
}
