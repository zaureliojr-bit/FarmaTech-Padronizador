/* Campanhas: do clique no anúncio ao pedido pago.

   O que este arquivo protege, em ordem de estrago:

   1. NINGUÉM DE FORA ESCREVE O RELATÓRIO. Se qualquer ?c=qualquer-coisa
      virasse linha, a aba Marketing encheria de campanha que a loja
      nunca criou — e o número que decide onde pôr o dinheiro do mês
      estaria sendo escrito por quem está do lado de fora.

   2. PEDIDO CANCELADO NÃO É VENDA DA CAMPANHA. Já fomos mordidos por
      isso no relatório geral. Aqui seria pior: a loja repetiria no mês
      que vem a campanha que "deu certo" e não deu.

   3. SEM A TABELA, NADA QUEBRA. A tabela é nova. Toda loja já
      instalada roda sem ela até colar o schema, e contagem de anúncio
      não pode derrubar o pedido de um cliente.

   Uso: node teste-campanhas.mjs
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

function montarLoja({ comCampanhas }) {
    const banco = new DatabaseSync(":memory:");
    banco.exec(ler("schema-lojas-colar.sql"));
    banco.exec(ler("schema-acesso-colar.sql"));
    banco.exec(ler("schema-colar.sql"));
    if (comCampanhas) banco.exec(ler("schema-campanhas-colar.sql"));
    return banco;
}

const comTabela = montarLoja({ comCampanhas: true });
const semTabela = montarLoja({ comCampanhas: false });

let bancoAtivo = comTabela;
const env = { get DB() { return fingirD1(bancoAtivo); }, PAINEL_KEY: SENHA };

function pedir(caminho, { metodo = "GET", corpo, semSenha = false } = {}) {
    const cabecalhos = { "CF-Connecting-IP": "1.2.3.4" };
    if (!semSenha) cabecalhos["X-Painel-Key"] = SENHA;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo, headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

/* O site manda com sendBeacon, que usa text/plain para não disparar
   verificação de CORS. */
function visitar(campanha) {
    return worker.fetch(new Request("https://exemplo.workers.dev/campanha", {
        method: "POST",
        headers: { "CF-Connecting-IP": "1.2.3.4", "Content-Type": "text/plain" },
        body: JSON.stringify({ campanha })
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

const campanhas = async () => (await (await pedir("/campanhas?dias=30")).json()).campanhas;
const umaCampanha = async (id) => (await campanhas()).find((c) => c.id === id);

/* ---- 1. criar ------------------------------------------------------- */
console.log("\n1. a campanha, como o painel cria");
{
    bancoAtivo = comTabela;

    const r = await pedir("/campanhas", {
        metodo: "POST",
        corpo: { nome: "Instagram outubro — fraldas", canal: "instagram", gasto: 80 }
    });

    const dados = await r.json();

    /* O carimbo sai do nome. Pedir ao dono que invente um
       "identificador" à parte é pedir que ele entenda uma coisa que só
       existe por causa da URL. */
    conferir("o carimbo vem do nome, pronto para a barra de endereço",
        dados.id === "instagram-outubro-fraldas", JSON.stringify(dados));

    const c = await umaCampanha("instagram-outubro-fraldas");
    conferir("e a campanha nasce zerada",
        c && c.visitas === 0 && c.pedidos === 0 && c.receita === 0, JSON.stringify(c));
    conferir("com o gasto que foi digitado", c.gasto === 80, String(c.gasto));
}

/* ---- 2. a visita que veio do anúncio -------------------------------- */
console.log("\n2. quem clicou no anúncio");
{
    await visitar("instagram-outubro-fraldas");
    await visitar("instagram-outubro-fraldas");
    await visitar("instagram-outubro-fraldas");

    const c = await umaCampanha("instagram-outubro-fraldas");
    conferir("três cliques, três visitas", c.visitas === 3, String(c.visitas));

    /* Uma linha por dia, não uma por pessoa: loja movimentada não pode
       ganhar uma linha de banco por visitante. */
    const linhas = comTabela.prepare("SELECT COUNT(*) AS n FROM campanha_dia").get().n;
    conferir("e uma linha só no banco", linhas === 1, String(linhas));
}

/* ---- 3. campanha inventada ------------------------------------------ */
console.log("\n3. ninguém de fora cria campanha");
{
    const r = await visitar("promocao-que-nunca-existiu");

    /* Responde ok de propósito: dizer "não existe" entregaria, a quem
       sonda o endereço, a lista das campanhas da loja. */
    conferir("a resposta não denuncia o que existe", r.status === 200, String(r.status));

    const inventadas = comTabela.prepare(
        "SELECT COUNT(*) AS n FROM campanha_dia WHERE campanha = 'promocao-que-nunca-existiu'").get().n;

    conferir("e nada é gravado", inventadas === 0, String(inventadas));

    const lista = await campanhas();
    conferir("a aba Marketing segue com uma campanha só",
        lista.length === 1, JSON.stringify(lista.map((c) => c.id)));
}

/* ---- 4. o pedido que veio dela -------------------------------------- */
console.log("\n4. do clique ao pedido");
{
    await enviarPedido("CAMP-1", 150, { campanha: "instagram-outubro-fraldas" });
    await enviarPedido("CAMP-2", 130, { campanha: "instagram-outubro-fraldas" });

    /* E um pedido que não veio de campanha nenhuma — a maioria é
       assim, e é a comparação com esses que diz se o anúncio valeu. */
    await enviarPedido("ORGANICO-1", 500);

    const c = await umaCampanha("instagram-outubro-fraldas");

    conferir("dois pedidos da campanha", c.pedidos === 2, String(c.pedidos));
    conferir("e a receita é só deles", c.receita === 280, String(c.receita));

    /* O pedido orgânico de R$ 500 entraria na conta se a consulta
         somasse por data em vez de por carimbo — e a campanha pareceria
         ter dado 2,8× mais do que deu. */
    conferir("o pedido que não veio de anúncio fica de fora",
        c.receita !== 780, String(c.receita));
}

/* ---- 5. cancelado não é venda --------------------------------------- */
console.log("\n5. pedido cancelado sai da conta da campanha");
{
    await pedir("/status", { metodo: "POST", corpo: { ref: "CAMP-2", status: "cancelado" } });

    const c = await umaCampanha("instagram-outubro-fraldas");

    conferir("a receita cai", c.receita === 150, String(c.receita));
    conferir("e o pedido não é contado", c.pedidos === 1, String(c.pedidos));

    /* Sem isto a loja repetiria no mês que vem a campanha que "deu
       certo" e não deu. */
    conferir("o gasto continua o mesmo — ele foi gasto de verdade",
        c.gasto === 80, String(c.gasto));

    /* Cancelar não apaga de onde o pedido veio: reabrir devolve o
       número, como no relatório geral. */
    await pedir("/status", { metodo: "POST", corpo: { ref: "CAMP-2", status: "novo" } });

    const voltou = await umaCampanha("instagram-outubro-fraldas");
    conferir("reabrindo, a venda volta para a campanha",
        voltou.receita === 280 && voltou.pedidos === 2, JSON.stringify(voltou));
}

/* ---- 6. carimbo inventado no pedido --------------------------------- */
console.log("\n6. o pedido também não inventa campanha");
{
    await enviarPedido("CAMP-FALSO", 999, { campanha: "campanha-inventada" });

    const existe = comTabela.prepare(
        "SELECT COUNT(*) AS n FROM pedido_campanha WHERE campanha = 'campanha-inventada'").get().n;

    conferir("carimbo de campanha que não existe é ignorado", existe === 0, String(existe));

    const pedido = comTabela.prepare("SELECT ref FROM pedidos WHERE ref='CAMP-FALSO'").get();
    conferir("mas o PEDIDO entra normalmente", !!pedido, JSON.stringify(pedido));
}

/* ---- 7. desligar guarda o histórico --------------------------------- */
console.log("\n7. desligar não apaga o que ela vendeu");
{
    await pedir("/campanhas/excluir", {
        metodo: "POST", corpo: { id: "instagram-outubro-fraldas" }
    });

    const c = await umaCampanha("instagram-outubro-fraldas");

    conferir("a campanha continua na lista", !!c, JSON.stringify(c));
    conferir("marcada como desligada", c.ativa === 0, String(c.ativa));

    /* É este número que a loja vai olhar no mês que vem para decidir se
       repete. Apagar a campanha o levaria junto. */
    conferir("e o que ela vendeu continua lá", c.receita === 280, String(c.receita));
}

/* ---- 8. a loja que ainda não colou o schema ------------------------- */
console.log("\n8. sem a tabela, nada quebra");
{
    bancoAtivo = semTabela;

    const visita = await visitar("qualquer-uma");
    conferir("a visita responde ok", visita.status === 200, String(visita.status));

    /* Este é o cenário do dia do deploy, em todas as lojas já
       instaladas. */
    const pedido = await enviarPedido("SEM-TABELA-1", 100, { campanha: "qualquer-uma" });
    conferir("O PEDIDO ENTRA NORMALMENTE", pedido.status === 200, String(pedido.status));

    const existe = semTabela.prepare("SELECT ref FROM pedidos WHERE ref='SEM-TABELA-1'").get();
    conferir("e está no banco", !!existe, JSON.stringify(existe));

    const r = await pedir("/campanhas?dias=30");
    conferir("a aba Marketing responde", r.status === 200, String(r.status));

    const corpo = await r.json();
    conferir("com a lista vazia", (corpo.campanhas || []).length === 0,
        JSON.stringify(corpo.campanhas));
}

/* ---- 9. uma loja não vê a campanha da outra ------------------------- */
console.log("\n9. cada loja com as suas");
{
    bancoAtivo = semTabela;
    semTabela.exec(ler("schema-campanhas-colar.sql"));

    await pedir("/campanhas", {
        metodo: "POST", corpo: { nome: "Google da loja nova", canal: "google", gasto: 20 }
    });

    const daNova = await campanhas();
    conferir("a loja nova vê só a dela",
        daNova.length === 1 && daNova[0].id === "google-da-loja-nova",
        JSON.stringify(daNova.map((c) => c.id)));

    bancoAtivo = comTabela;
    const daPrimeira = await campanhas();
    conferir("e a primeira continua com a sua",
        daPrimeira.length === 1 && daPrimeira[0].id === "instagram-outubro-fraldas",
        JSON.stringify(daPrimeira.map((c) => c.id)));
}

/* ---- 10. nome que não vira endereço --------------------------------- */
console.log("\n10. nome impossível");
{
    const r = await pedir("/campanhas", { metodo: "POST", corpo: { nome: "!!!" } });
    conferir("recusa com recado", r.status === 400, String(r.status));

    const vazio = await pedir("/campanhas", { metodo: "POST", corpo: { nome: "" } });
    conferir("e sem nome também", vazio.status === 400, String(vazio.status));

    /* Acento vira endereço limpo: "Promoção de Férias" tem de virar
       link que não quebra ao ser copiado no WhatsApp. */
    const acento = await pedir("/campanhas", {
        metodo: "POST", corpo: { nome: "Promoção de Férias", canal: "facebook" }
    });
    const dados = await acento.json();
    conferir("acento vira endereço limpo", dados.id === "promocao-de-ferias",
        JSON.stringify(dados));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
