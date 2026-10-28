/* As duas listas de busca do relatório, e por que a ordem delas difere.

   A loja olhou a tela e reclamou com razão: em "Procuraram e não
   acharam", um termo de 20/10 aparecia ACIMA de um de 28/10. A ordem
   era por quantidade — quem repetiu mais no período inteiro subia —, e
   isso faz sentido num ranking e nenhum sentido aqui.

   Porque esta lista não é um ranking: é uma fila de coisas para a loja
   resolver. "Pomada assadura", buscada hoje e não achada, ainda dá para
   atender com uma mensagem no WhatsApp. "Artriflex", buscado há oito
   dias, já foi comprado em outro lugar.

   A outra lista, "O que mais procuram", continua por quantidade — é o
   que o título dela promete. Ordenar as duas igual seria perder uma
   das duas leituras.

   Este arquivo existe para ninguém "uniformizar" as duas mais tarde.

   Uso: node teste-buscas-relatorio.mjs
*/

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

const ler = (nome) => readFileSync(new URL("./" + nome, import.meta.url), "utf8");

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

function fingirD1(db) {
    const traduzir = (sql, ligados) => {
        const usados = [];
        const novo = sql.replace(/\?(\d+)/g, (_, n) => {
            usados.push(ligados[Number(n) - 1]);
            return "?";
        });
        return [novo, usados.length ? usados : ligados];
    };

    return {
        prepare(sql) {
            let ligados = [];
            const stmt = {
                _sql: sql,
                get _ligados() { return ligados; },
                bind(...args) { ligados = args; return stmt; },
                async first() {
                    const [s, a] = traduzir(sql, ligados);
                    return db.prepare(s).get(...a) ?? null;
                },
                async all() {
                    const [s, a] = traduzir(sql, ligados);
                    return { results: db.prepare(s).all(...a) };
                },
                async run() {
                    const [s, a] = traduzir(sql, ligados);
                    const r = db.prepare(s).run(...a);
                    return { success: true, meta: { changes: r.changes } };
                }
            };
            return stmt;
        },
        async batch(comandos) {
            const saidas = [];
            for (const c of comandos) {
                const [s, a] = traduzir(c._sql, c._ligados);
                if (/^\s*(select|with)\b/i.test(c._sql)) {
                    saidas.push({ results: db.prepare(s).all(...a), success: true });
                } else {
                    const r = db.prepare(s).run(...a);
                    saidas.push({ results: [], success: true, meta: { changes: r.changes } });
                }
            }
            return saidas;
        }
    };
}

const SENHA = "senha-do-worker";
const banco = new DatabaseSync(":memory:");

banco.exec((ler("schema-lojas-colar.sql") + "\n" + ler("schema-acesso-colar.sql")
    + "\n" + ler("schema-colar.sql")).replace(/\r?\n/g, " "));

const env = { DB: fingirD1(banco), PAINEL_KEY: SENHA, DONO_KEY: SENHA };

const DIA = 24 * 60 * 60 * 1000;
const agora = Date.now();

/* O cenário da tela que a loja mostrou, com as datas reais:

     artriflex          2 buscas, a última 8 dias atrás
     pomada assadura    1 busca, hoje
     penis de borracha  1 busca, ontem

   Pela ordem antiga, "artriflex" liderava por ter 2 em vez de 1. */
const registrar = (termo, resultados, quandoDias) =>
    banco.prepare(
        "INSERT INTO buscas (termo, criado_em, resultados) VALUES (?,?,?)"
    ).run(termo, agora - quandoDias * DIA, resultados);

registrar("artriflex", 0, 8);
registrar("artriflex", 0, 8);
registrar("pomada assadura", 0, 0);
registrar("penis de borracha", 0, 1);

/* E um termo com MUITA busca, para a outra lista ter um campeão claro
   que não é o mais recente. */
for (let i = 0; i < 20; i++) registrar("ibuprofeno", 5, 15);

/* Fora do período: 90 dias atrás. Nenhuma das duas listas pode trazê-lo
   quando o relatório pede 30 dias. */
registrar("coisa antiga que ninguem procura mais", 0, 90);

const resumo = await (await worker.fetch(
    new Request("https://exemplo.workers.dev/resumo?dias=30", {
        headers: { "CF-Connecting-IP": "1.2.3.4", "X-Painel-Key": SENHA }
    }), env)).json();

/* ---- 1. a fila do que faltou, do mais novo para o mais velho -------- */
console.log("\n1. procuraram e não acharam: por data, do mais recente");
{
    const lista = resumo.naoEncontrados || [];
    const termos = lista.map((b) => b.termo);

    conferir("as três entraram", lista.length === 3, JSON.stringify(termos));

    /* A asserção que descreve o defeito: "artriflex" tem o DOBRO de
       buscas e mesmo assim desce, porque é o mais antigo. */
    conferir("o de hoje vem primeiro",
        termos[0] === "pomada assadura", JSON.stringify(termos));

    conferir("e o de 8 dias atrás vem por último, mesmo com o dobro de buscas",
        termos[termos.length - 1] === "artriflex", JSON.stringify(termos));

    const datas = lista.map((b) => b.ultima);
    const emOrdem = datas.every((d, i) => i === 0 || datas[i - 1] >= d);
    conferir("a coluna de data desce sem exceção", emOrdem, JSON.stringify(datas));
}

/* ---- 2. o ranking continua ranking ---------------------------------- */
console.log("\n2. o que mais procuram: por quantidade, como o título diz");
{
    const lista = resumo.maisProcurados || [];
    const primeiro = lista[0];

    /* "ibuprofeno" tem 20 buscas e é o MAIS ANTIGO dos ativos. Se
       alguém uniformizar a ordem das duas listas, ele cai do topo e a
       tela deixa de responder "o que mais procuram". */
    conferir("o campeão de buscas lidera, mesmo sendo o mais antigo",
        primeiro && primeiro.termo === "ibuprofeno" && primeiro.buscas === 20,
        JSON.stringify(primeiro));

    /* A data entra como coluna — ela muda a leitura do número — sem
       mandar na ordem. */
    conferir("mas a data vem junto, para a loja saber se ainda é demanda viva",
        primeiro && typeof primeiro.ultima === "number", JSON.stringify(primeiro));

    conferir("e o contador de buscas vazias continua",
        lista.some((b) => b.termo === "artriflex" && b.vazias === 2),
        JSON.stringify(lista.map((b) => [b.termo, b.vazias])));
}

/* ---- 3. o período vale para as duas --------------------------------- */
console.log("\n3. as duas respeitam o período do relatório");
{
    const todos = [...(resumo.naoEncontrados || []), ...(resumo.maisProcurados || [])]
        .map((b) => b.termo);

    conferir("a busca de 90 dias atrás fica fora dos 30 dias",
        !todos.some((t) => t.includes("coisa antiga")), JSON.stringify(todos));

    /* E aparece quando o período alcança: o filtro existe, não é a
       linha nunca ter sido gravada. */
    const largo = await (await worker.fetch(
        new Request("https://exemplo.workers.dev/resumo?dias=180", {
            headers: { "CF-Connecting-IP": "1.2.3.4", "X-Painel-Key": SENHA }
        }), env)).json();

    const emSeisMeses = (largo.naoEncontrados || []).map((b) => b.termo);
    conferir("e aparece quando o período é de 180 dias",
        emSeisMeses.some((t) => t.includes("coisa antiga")), JSON.stringify(emSeisMeses));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
