/* O funil: visita → busca → carrinho → pedido.

   O que este teste protege, em ordem de estrago:

   1. A ETAPA "pedido" NÃO PODE VIR DO SITE. Se a rota pública aceitasse
      "pedido", qualquer um mandaria dez e o painel mostraria dez vendas
      que não existem. O número que a farmácia leva para o banco não
      pode ser escrito por quem está do lado de fora.

   2. SEM A TABELA, NADA QUEBRA. A tabela é nova: toda loja já
      instalada roda sem ela até colar o schema. Contagem de visita
      derrubando o pedido de um cliente seria trocar dinheiro por
      estatística.

   3. O RESUMO NÃO CAI por falta da tabela. O funil é um pedaço da aba
      Relatórios; faltando a tabela, o pedaço fica vazio e o resto da
      tela continua de pé.

   4. CADA LOJA VÊ O FUNIL DELA. Mesmo erro que já apareceu em estoque e
      cupom: banco por loja, e um vazamento aqui mostraria o movimento
      do vizinho.

   Uso: node teste-funil.mjs
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

/* Dois bancos: um com a tabela do funil (a loja que colou o schema) e
   um sem (a loja que ainda não colou). O segundo é o que importa — é o
   estado em que TODAS as lojas estão no dia do deploy. */
function montarLoja({ comFunil }) {
    const banco = new DatabaseSync(":memory:");
    banco.exec(ler("schema-lojas-colar.sql"));
    banco.exec(ler("schema-acesso-colar.sql"));
    banco.exec(ler("schema-colar.sql"));
    if (comFunil) banco.exec(ler("schema-funil-colar.sql"));
    return banco;
}

const comFunil = montarLoja({ comFunil: true });
const semFunil = montarLoja({ comFunil: false });

let bancoAtivo = comFunil;
const env = {
    get DB() { return fingirD1(bancoAtivo); },
    PAINEL_KEY: SENHA
};

function pedir(caminho, { metodo = "GET", corpo, semSenha = false, ip = "1.2.3.4" } = {}) {
    const cabecalhos = { "CF-Connecting-IP": ip };
    if (!semSenha) cabecalhos["X-Painel-Key"] = SENHA;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo, headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

/* O site marca a etapa com sendBeacon, que manda text/plain para não
   disparar verificação de CORS. O worker precisa ler isso como JSON —
   se exigisse application/json, a contagem nunca chegaria. */
function marcar(etapa, { ip = "1.2.3.4" } = {}) {
    return worker.fetch(new Request("https://exemplo.workers.dev/funil", {
        method: "POST",
        headers: { "CF-Connecting-IP": ip, "Content-Type": "text/plain" },
        body: JSON.stringify({ etapa })
    }), env);
}

const enviarPedido = (ref, total = 100) => pedir("/pedidos", {
    metodo: "POST", semSenha: true,
    corpo: {
        ref, cliente: "Djalma JR", telefone: "11940266948",
        entrega: "Retirada", pagamento: "Cartão", subtotal: total, frete: 0, total,
        itens: [{ ean: "7896004810140", codigo: "000054",
                  descricao: "Bismu-Jet Solução Gts 20ml", qtd: 1, preco: total }]
    }
});

const funilDoResumo = async () => (await (await pedir("/resumo?dias=30")).json()).funil;

const contarEtapa = (banco, etapa) => {
    const l = banco.prepare("SELECT total FROM funil WHERE etapa = ?").get(etapa);
    return l ? l.total : 0;
};

/* ---- 1. as três etapas que o site manda ------------------------------ */
console.log("\n1. visita, busca e carrinho chegam pelo site");
{
    bancoAtivo = comFunil;

    for (const etapa of ["visita", "busca", "carrinho"]) {
        const r = await marcar(etapa);
        conferir(`"${etapa}" é aceita`, r.status === 200, String(r.status));
    }

    conferir("visita contou 1", contarEtapa(comFunil, "visita") === 1);
    conferir("busca contou 1", contarEtapa(comFunil, "busca") === 1);
    conferir("carrinho contou 1", contarEtapa(comFunil, "carrinho") === 1);

    /* A soma é por dia e etapa, não uma linha por acesso: o banco de uma
       loja movimentada não pode crescer uma linha por visitante. */
    await marcar("visita");
    await marcar("visita");

    const linhas = comFunil.prepare(
        "SELECT COUNT(*) AS n FROM funil WHERE etapa='visita'").get().n;

    conferir("três visitas, uma linha só", linhas === 1, String(linhas));
    conferir("e o total é 3", contarEtapa(comFunil, "visita") === 3,
        String(contarEtapa(comFunil, "visita")));
}

/* ---- 2. o site NÃO escreve a última etapa ---------------------------- */
console.log("\n2. 'pedido' não vem de fora");
{
    const r = await marcar("pedido");

    conferir("a rota pública recusa 'pedido'", r.status === 400, String(r.status));
    conferir("e nada foi gravado", contarEtapa(comFunil, "pedido") === 0,
        String(contarEtapa(comFunil, "pedido")));

    const inventada = await marcar("comprou-tudo");
    conferir("etapa inventada também é recusada", inventada.status === 400,
        String(inventada.status));

    /* Uma etapa desconhecida não pode virar linha no banco: o painel
       desenha quatro barras, e uma quinta etapa só apareceria no SELECT
       como número que ninguém sabe de onde veio. */
    const etapas = comFunil.prepare("SELECT DISTINCT etapa FROM funil").all().map(l => l.etapa);
    conferir("o banco só tem etapas conhecidas",
        etapas.every(e => ["visita", "busca", "carrinho", "pedido"].includes(e)),
        JSON.stringify(etapas));
}

/* ---- 3. quem conta o pedido é o pedido ------------------------------- */
console.log("\n3. o pedido de verdade conta a etapa");
{
    await enviarPedido("FUNIL-1");

    conferir("entrou pedido, a etapa subiu", contarEtapa(comFunil, "pedido") === 1,
        String(contarEtapa(comFunil, "pedido")));

    await enviarPedido("FUNIL-2");
    conferir("dois pedidos, duas etapas", contarEtapa(comFunil, "pedido") === 2,
        String(contarEtapa(comFunil, "pedido")));
}

/* ---- 4. o resumo entrega o funil ------------------------------------- */
console.log("\n4. o painel recebe os quatro números");
{
    const funil = await funilDoResumo();

    conferir("visita", funil.visita === 3, JSON.stringify(funil));
    conferir("busca", funil.busca === 1, JSON.stringify(funil));
    conferir("carrinho", funil.carrinho === 1, JSON.stringify(funil));
    conferir("pedido", funil.pedido === 2, JSON.stringify(funil));
}

/* ---- 5. a loja que ainda não colou o schema -------------------------- */
console.log("\n5. sem a tabela, nada quebra");
{
    bancoAtivo = semFunil;

    /* Este é o cenário do dia do deploy, em TODAS as lojas já
       instaladas. Se qualquer uma destas três coisas falhar, o deploy
       tira a loja do ar. */

    const marcada = await marcar("visita");
    conferir("marcar etapa responde ok mesmo assim", marcada.status === 200,
        String(marcada.status));

    const pedido = await enviarPedido("SEM-TABELA-1");
    conferir("O PEDIDO ENTRA NORMALMENTE", pedido.status === 200,
        String(pedido.status));

    const existe = semFunil.prepare("SELECT ref FROM pedidos WHERE ref='SEM-TABELA-1'").get();
    conferir("e está no banco", !!existe, JSON.stringify(existe));

    const r = await pedir("/resumo?dias=30");
    conferir("o resumo responde", r.status === 200, String(r.status));

    const corpo = await r.json();
    conferir("o funil vem vazio", Object.keys(corpo.funil || {}).length === 0,
        JSON.stringify(corpo.funil));

    /* O resto da aba Relatórios é o que a loja usa todo dia. Vir vazio
       junto com o funil seria o pior resultado possível: a tela inteira
       em branco por causa de um gráfico novo. */
    conferir("e o faturamento do período continua lá",
        corpo.periodo && corpo.periodo.faturamento === 100,
        JSON.stringify(corpo.periodo));
}

/* ---- 6. uma loja não vê o funil da outra ----------------------------- */
console.log("\n6. cada loja com o seu");
{
    bancoAtivo = semFunil;
    semFunil.exec(ler("schema-funil-colar.sql"));

    await marcar("visita");
    await marcar("visita");

    const daSemFunil = await funilDoResumo();

    /* A loja que acabou de colar o schema tem 2 visitas. A outra tem 3.
       Se este número vier 5, ou vier 3, os bancos estão se misturando —
       e o dono de uma farmácia está olhando o movimento da outra. */
    conferir("a loja nova vê só as visitas dela", daSemFunil.visita === 2,
        JSON.stringify(daSemFunil));

    bancoAtivo = comFunil;
    const daOutra = await funilDoResumo();
    conferir("e a primeira continua com as suas", daOutra.visita === 3,
        JSON.stringify(daOutra));
}

/* ---- 7. corpo sem etapa ---------------------------------------------- */
console.log("\n7. requisição malformada");
{
    bancoAtivo = comFunil;

    const vazio = await worker.fetch(new Request("https://exemplo.workers.dev/funil", {
        method: "POST", headers: { "CF-Connecting-IP": "1.2.3.4" }, body: "{}"
    }), env);

    conferir("sem etapa, 400", vazio.status === 400, String(vazio.status));

    const lixo = await worker.fetch(new Request("https://exemplo.workers.dev/funil", {
        method: "POST", headers: { "CF-Connecting-IP": "1.2.3.4" }, body: "nada disso"
    }), env);

    conferir("corpo que não é JSON, 400", lixo.status === 400, String(lixo.status));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
