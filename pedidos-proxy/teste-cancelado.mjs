/* Pedido cancelado não é venda.

   O defeito, encontrado pela loja no segundo dia de uso: o pedido
   cancelado no painel continuava somando no relatório. E não era só o
   faturamento — ele puxava o ticket médio, entrava em "produtos mais
   vendidos" e ficava somado no total gasto do cliente, que é o número
   que a Reativação usa para decidir quem chamar de volta.

   O estrago desse tipo de erro é silencioso: ninguém olha duas vezes
   para um número que parece bom. A loja decidiria compra em cima de
   venda que não aconteceu.

   Uso: node teste-cancelado.mjs
*/

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

const ler = (nome) => readFileSync(new URL("./" + nome, import.meta.url), "utf8");

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

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
                bind(...a) { ligados = a; return stmt; },
                async first() { const [s, a] = traduzir(sql, ligados); return db.prepare(s).get(...a) ?? null; },
                async all() { const [s, a] = traduzir(sql, ligados); return { results: db.prepare(s).all(...a) }; },
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

banco.exec(ler("schema-lojas-colar.sql"));
banco.exec(ler("schema-acesso-colar.sql"));
banco.exec(ler("schema-colar.sql"));
banco.exec(ler("schema-cupons-colar.sql"));

const env = { DB: fingirD1(banco), PAINEL_KEY: SENHA };

function pedir(caminho, { metodo = "GET", corpo, semSenha = false } = {}) {
    const cabecalhos = { "CF-Connecting-IP": "1.2.3.4" };
    if (!semSenha) cabecalhos["X-Painel-Key"] = SENHA;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo, headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

const enviarPedido = (ref, total, extras = {}) => pedir("/pedidos", {
    metodo: "POST", semSenha: true,
    corpo: {
        ref, cliente: "Djalma JR", telefone: "11940266948",
        entrega: "Retirada", pagamento: "Cartão", subtotal: total, frete: 0, total,
        itens: [{ ean: "7896004810140", codigo: "000054",
                  descricao: "Bismu-Jet Solução Gts 20ml", qtd: 1, preco: total }],
        ...extras
    }
});

const resumo = async () => (await (await pedir("/resumo?dias=30")).json());

/* ---- 1. dois pedidos, um cancelado ---------------------------------- */
console.log("\n1. o cancelado sai da conta");
{
    await enviarPedido("VALE-1", 100);
    await enviarPedido("CANCELA-1", 500);

    const antes = await resumo();
    conferir("com os dois, o faturamento é 600",
        antes.periodo.faturamento === 600, JSON.stringify(antes.periodo));

    await pedir("/status", { metodo: "POST", corpo: { ref: "CANCELA-1", status: "cancelado" } });

    const depois = await resumo();

    conferir("cancelado, o faturamento volta a 100",
        depois.periodo.faturamento === 100, JSON.stringify(depois.periodo));
    conferir("e o pedido não é contado", depois.periodo.pedidos === 1,
        String(depois.periodo.pedidos));

    /* O ticket médio era o pior deles: R$ 300 de média num dia em que a
       loja vendeu R$ 100. É o número que a loja usa para decidir se vale
       a pena a entrega. */
    conferir("o ticket médio também", depois.periodo.ticket === 100,
        String(depois.periodo.ticket));

    conferir("o gráfico por dia idem",
        (depois.porDia || []).reduce((t, d) => t + d.faturamento, 0) === 100,
        JSON.stringify(depois.porDia));

    /* "Produtos mais vendidos" vira lista de compras: um item cancelado
       ali faz a loja repor o que não vendeu. */
    const unidades = (depois.topProdutos || []).reduce((t, p) => t + p.unidades, 0);
    conferir("e produtos mais vendidos não conta o cancelado",
        unidades === 1, JSON.stringify(depois.topProdutos));
}

/* ---- 2. o resumo do cliente ------------------------------------------ */
console.log("\n2. o total gasto do cliente");
{
    const c = banco.prepare("SELECT pedidos, total_gasto FROM clientes WHERE telefone='11940266948'").get();

    /* A Reativação usa este número para decidir quem chamar de volta e
       com que mensagem. Inflado por um cancelamento, ela trata como bom
       cliente quem não chegou a comprar. */
    conferir("conta só o que não foi cancelado",
        c.pedidos === 1 && c.total_gasto === 100, JSON.stringify(c));
}

/* ---- 3. reabrir um pedido cancelado ---------------------------------- */
console.log("\n3. cancelou sem querer e voltou atrás");
{
    /* Recalcular (em vez de subtrair) é o que faz isto funcionar: uma
       subtração erraria assim que alguém cancelasse duas vezes ou
       reabrisse o pedido. */
    await pedir("/status", { metodo: "POST", corpo: { ref: "CANCELA-1", status: "novo" } });

    const r = await resumo();
    conferir("o faturamento volta a 600", r.periodo.faturamento === 600,
        JSON.stringify(r.periodo));

    const c = banco.prepare("SELECT pedidos, total_gasto FROM clientes WHERE telefone='11940266948'").get();
    conferir("e o cliente também", c.pedidos === 2 && c.total_gasto === 600, JSON.stringify(c));

    /* E cancelar duas vezes seguidas não subtrai duas. */
    await pedir("/status", { metodo: "POST", corpo: { ref: "CANCELA-1", status: "cancelado" } });
    await pedir("/status", { metodo: "POST", corpo: { ref: "CANCELA-1", status: "cancelado" } });

    const dobrado = await resumo();
    conferir("cancelar duas vezes não desconta duas",
        dobrado.periodo.faturamento === 100, JSON.stringify(dobrado.periodo));
}

/* ---- 4. o cupom volta ------------------------------------------------ */
console.log("\n4. o cupom do pedido cancelado volta para o cliente");
{
    await pedir("/cupons", { metodo: "POST", corpo: { codigo: "VOLTA10", tipo: "valor", valor: 10 } });

    await enviarPedido("COM-CUPOM", 80, { cupom: "VOLTA10" });

    const usouAntes = banco.prepare("SELECT COUNT(*) AS n FROM cupom_usos WHERE codigo='VOLTA10'").get().n;
    conferir("o uso foi registrado", usouAntes === 1, String(usouAntes));

    await pedir("/status", { metodo: "POST", corpo: { ref: "COM-CUPOM", status: "cancelado" } });

    /* O cliente teve o pedido cancelado — por falta do produto, por
       exemplo. Ficar sem poder usar o cupom que ele nunca aproveitou é
       punir quem já foi prejudicado. */
    const usouDepois = banco.prepare("SELECT COUNT(*) AS n FROM cupom_usos WHERE codigo='VOLTA10'").get().n;
    conferir("cancelado, o uso é devolvido", usouDepois === 0, String(usouDepois));

    const contador = banco.prepare("SELECT usos FROM cupons WHERE codigo='VOLTA10'").get().usos;
    conferir("e o contador do cupom acompanha", contador === 0, String(contador));

    const podeDeNovo = await (await pedir("/cupom/validar", {
        metodo: "POST", semSenha: true,
        corpo: { codigo: "VOLTA10", subtotal: 80, frete: 0, telefone: "11940266948" }
    })).json();
    conferir("o cliente pode usar de novo", podeDeNovo.valido === true, JSON.stringify(podeDeNovo));
}

/* ---- 5. o que o cancelado NÃO deixa de ser --------------------------- */
console.log("\n5. cancelado continua existindo");
{
    const existe = banco.prepare("SELECT status FROM pedidos WHERE ref='CANCELA-1'").get();

    /* Sair da conta não é sumir: o pedido cancelado continua no banco e
       na lista de últimos pedidos, com o status escrito. Apagar seria
       perder o registro de que alguém pediu e desistiu — que é
       informação, não sujeira. */
    conferir("o pedido segue no banco, marcado",
        existe && existe.status === "cancelado", JSON.stringify(existe));

    const r = await resumo();
    const naLista = (r.recentes || []).some((p) => p.ref === "CANCELA-1");
    conferir("e aparece em 'últimos pedidos'", naLista,
        JSON.stringify((r.recentes || []).map((p) => p.ref)));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
