/* As ofertas de quantidade, do lado do servidor.

   A conta ("quem leva 7 com 3 por 10 paga quanto") mora no site, no
   promoQtd.js, e tem teste próprio. Aqui se prova o que é
   responsabilidade do worker:

   1. O QUE A LOJA PROMETEU FICA GUARDADO CERTO. A tela já recusa
      cadastro sem sentido, mas a tela é do lado de fora — qualquer um
      reescreve aquele JavaScript. "Pague 4 levando 3" não pode entrar
      no banco por nenhum caminho.

   2. A TABELA NOVA NÃO DERRUBA AS PROMOÇÕES ANTIGAS. Toda loja já
      instalada roda sem ela até colar o schema, e a vitrine depende da
      rota /promocoes para saber o preço: se ela falhasse por inteiro,
      a loja voltaria ao preço de tabela sem ninguém entender por quê.

   3. AS DUAS CONVIVEM. "R$ 5,90 cada, ou 3 por R$ 15" é como a
      farmácia anuncia de verdade, e as duas chegam na mesma resposta.

   Uso: node teste-promo-quantidade.mjs
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

function montarLoja({ comOfertas }) {
    const banco = new DatabaseSync(":memory:");
    banco.exec(ler("schema-lojas-colar.sql"));
    banco.exec(ler("schema-acesso-colar.sql"));
    banco.exec(ler("schema-colar.sql"));
    if (comOfertas) banco.exec(ler("schema-promo-quantidade-colar.sql"));
    return banco;
}

const comTabela = montarLoja({ comOfertas: true });
const semTabela = montarLoja({ comOfertas: false });

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

const salvar = (corpo) => pedir("/promocoes/quantidade", { metodo: "POST", corpo });
const publicas = async () => (await (await pedir("/promocoes", { semSenha: true })).json());
const doPainel = async () => (await (await pedir("/promocoes/todas")).json());

/* ---- 1. gravar as duas formas --------------------------------------- */
console.log("\n1. leve 3 pague 2, e 3 por R$ 10");
{
    bancoAtivo = comTabela;

    const leve = await salvar({ codigo: "000001", tipo: "leve-pague", leve: 3, pague: 2 });
    conferir("leve e pague entra", leve.status === 200, String(leve.status));

    const pacote = await salvar({ codigo: "000002", tipo: "pacote", quantidade: 3, preco: 10 });
    conferir("pacote entra", pacote.status === 200, String(pacote.status));

    const { quantidade } = await publicas();

    conferir("as duas chegam ao site", quantidade.length === 2,
        JSON.stringify(quantidade));

    const a = quantidade.find((o) => o.codigo === "000001");
    conferir("com os números que a loja digitou",
        a.tipo === "leve-pague" && a.leve === 3 && a.pague === 2, JSON.stringify(a));

    const b = quantidade.find((o) => o.codigo === "000002");
    conferir("e o preço do pacote",
        b.tipo === "pacote" && b.quantidade === 3 && b.preco === 10, JSON.stringify(b));
}

/* ---- 2. o que não pode entrar no banco ------------------------------- */
console.log("\n2. cadastro sem sentido é recusado aqui também");
{
    /* A tela já avisa antes de salvar, mas a tela é do lado de fora.
       Quem guarda o que a loja prometeu ao cliente não pode depender de
       um JavaScript que qualquer um reescreve. */
    const pagaMais = await salvar({ codigo: "X", tipo: "leve-pague", leve: 3, pague: 4 });
    conferir("pagar 4 levando 3", pagaMais.status === 400, String(pagaMais.status));

    const pagaTudo = await salvar({ codigo: "X", tipo: "leve-pague", leve: 3, pague: 3 });
    conferir("pagar 3 levando 3", pagaTudo.status === 400, String(pagaTudo.status));

    const pacoteDeUm = await salvar({ codigo: "X", tipo: "pacote", quantidade: 1, preco: 5 });
    conferir("pacote de 1", pacoteDeUm.status === 400, String(pacoteDeUm.status));

    const semPreco = await salvar({ codigo: "X", tipo: "pacote", quantidade: 3, preco: 0 });
    conferir("pacote sem preço", semPreco.status === 400, String(semPreco.status));

    const tipoInventado = await salvar({ codigo: "X", tipo: "pague-o-que-quiser", leve: 3 });
    conferir("tipo inventado", tipoInventado.status === 400, String(tipoInventado.status));

    const sobrou = comTabela.prepare(
        "SELECT COUNT(*) AS n FROM promocao_quantidade WHERE codigo = 'X'").get().n;
    conferir("e nada disso foi gravado", sobrou === 0, String(sobrou));
}

/* ---- 3. a data --------------------------------------------------------- */
console.log("\n3. prazo");
{
    const invertida = await salvar({
        codigo: "000003", tipo: "pacote", quantidade: 2, preco: 9,
        inicio: "2026-11-30", fim: "2026-11-01"
    });
    conferir("fim antes do início é recusado", invertida.status === 400,
        String(invertida.status));

    /* Oferta vencida não pode chegar ao site: é promoção de preço que a
       loja não pratica mais, e o cliente chega ao balcão cobrando. */
    await salvar({
        codigo: "000004", tipo: "pacote", quantidade: 2, preco: 9,
        inicio: "2020-01-01", fim: "2020-12-31"
    });

    const { quantidade } = await publicas();
    conferir("oferta vencida não vai para a vitrine",
        !quantidade.some((o) => o.codigo === "000004"),
        JSON.stringify(quantidade.map((o) => o.codigo)));

    /* Mas continua na lista do painel, senão a loja não encontra o que
       precisa apagar ou renovar. */
    const painel = await doPainel();
    conferir("mas o painel enxerga",
        painel.quantidade.some((o) => o.codigo === "000004"),
        JSON.stringify(painel.quantidade.map((o) => o.codigo)));
}

/* ---- 4. um lote de uma vez -------------------------------------------- */
console.log("\n4. a mesma oferta em vários produtos");
{
    const r = await salvar({
        codigos: ["F1", "F2", "F3"],
        tipo: "leve-pague", leve: 3, pague: 2, lote: "Fraldas de outubro"
    });

    const dados = await r.json();
    conferir("os três entram numa chamada", dados.gravados === 3, JSON.stringify(dados));

    /* E saem numa só. Sem o lote, desfazer uma campanha de 300 itens
       seria trezentos cliques — e na prática ninguém desfaz. */
    const fora = await pedir("/promocoes/quantidade/excluir", {
        metodo: "POST", corpo: { lote: "Fraldas de outubro" }
    });

    const saida = await fora.json();
    conferir("e saem juntos", saida.apagados === 3, JSON.stringify(saida));
}

/* ---- 5. as duas promoções convivem ------------------------------------ */
console.log("\n5. 'R$ 5,90 cada, ou 3 por R$ 15'");
{
    await pedir("/promocoes", {
        metodo: "POST",
        corpo: { itens: [{ codigo: "000005", preco: 5.9 }] }
    });

    await salvar({ codigo: "000005", tipo: "pacote", quantidade: 3, preco: 15 });

    const corpo = await publicas();

    /* As duas na mesma resposta, de propósito: o site precisa das duas
       para montar o preço, e duas idas ao worker fariam a vitrine
       piscar o preço de tabela antes de corrigi-lo. */
    conferir("o preço promocional está lá",
        corpo.promocoes.some((p) => p.codigo === "000005" && p.preco === 5.9),
        JSON.stringify(corpo.promocoes));

    conferir("e a oferta de quantidade também",
        corpo.quantidade.some((o) => o.codigo === "000005" && o.preco === 15),
        JSON.stringify(corpo.quantidade));
}

/* ---- 6. a loja que ainda não colou o schema --------------------------- */
console.log("\n6. sem a tabela, a vitrine não cai");
{
    bancoAtivo = semTabela;

    await pedir("/promocoes", {
        metodo: "POST",
        corpo: { itens: [{ codigo: "000009", preco: 3.5 }] }
    });

    const corpo = await publicas();

    /* Este é o cenário do dia do deploy, em todas as lojas já
       instaladas. Se a consulta nova derrubasse a rota, a loja
       inteira voltaria ao preço de tabela — e ninguém ligaria uma
       coisa à outra. */
    conferir("as promoções de sempre continuam saindo",
        corpo.promocoes.length === 1 && corpo.promocoes[0].codigo === "000009",
        JSON.stringify(corpo.promocoes));

    conferir("e a lista de ofertas vem vazia",
        Array.isArray(corpo.quantidade) && corpo.quantidade.length === 0,
        JSON.stringify(corpo.quantidade));

    const painel = await doPainel();
    conferir("o painel também abre", painel.promocoes.length === 1,
        JSON.stringify(painel.promocoes));

    /* E tentar criar uma oferta diz o que falta fazer, em vez de
       falhar calado — a loja montaria o encarte achando que a oferta
       está no ar. */
    const tentativa = await salvar({ codigo: "000009", tipo: "pacote", quantidade: 3, preco: 9 });
    const erro = await tentativa.json();

    conferir("criar oferta avisa o que falta",
        tentativa.status === 500 && /schema-promo-quantidade/.test(erro.erro || ""),
        JSON.stringify(erro));
}

/* ---- 7. uma loja não vê a oferta da outra ----------------------------- */
console.log("\n7. cada loja com as suas");
{
    bancoAtivo = semTabela;
    semTabela.exec(ler("schema-promo-quantidade-colar.sql"));

    await salvar({ codigo: "DA-NOVA", tipo: "leve-pague", leve: 2, pague: 1 });

    const daNova = await publicas();
    conferir("a loja nova vê só a dela",
        daNova.quantidade.length === 1 && daNova.quantidade[0].codigo === "DA-NOVA",
        JSON.stringify(daNova.quantidade.map((o) => o.codigo)));

    bancoAtivo = comTabela;
    const daPrimeira = await publicas();
    conferir("e a primeira não enxerga a da outra",
        !daPrimeira.quantidade.some((o) => o.codigo === "DA-NOVA"),
        JSON.stringify(daPrimeira.quantidade.map((o) => o.codigo)));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
