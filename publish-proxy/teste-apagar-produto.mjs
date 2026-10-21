/* Apagar um produto do catálogo publicado.

   O botão "Apagar" do painel existia desde sempre e NUNCA funcionou:
   ele chamava apagarProdutoCatalogo, uma função que ninguém escreveu.
   A tela dizia "Apagando..." e terminava em "is not a function".

   O que está sendo provado aqui é o lado do worker — e as duas travas
   importam mais que o caso feliz:

     1. apagar tira só o que foi pedido, e mantém o resto intacto;
     2. se o catálogo atual não puder ser LIDO, não se publica nada. Sem
        isso, uma falha de leitura cairia no caminho normal com a lista
        vazia e um "apagar um produto" publicaria um catálogo vazio —
        a loja inteira fora do ar por um clique de limpeza;
     3. e, mesmo lendo, uma conta que esvazia o catálogo não é publicada.

   Uso: node teste-apagar-produto.mjs
*/

import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

const CATALOGO = {
    produtos: [
        { ean: "7891234567890", codigo: "001", descricao: "Dipirona 500mg C/10", precoVenda: 9.9 },
        { ean: "7891234567891", codigo: "002", descricao: "Taxa de Entrega", precoVenda: 8 },
        { ean: "", codigo: "003", descricao: "Item interno sem EAN", precoVenda: 1 }
    ]
};

/* GitHub de mentira. `leitura` decide o que a busca do arquivo atual
   responde — é por ali que entram os casos de falha.

   "grande" é o caso REAL, e por muito tempo o único: acima de 1 MB a
   Contents API devolve a ficha do arquivo com content vazio, e o
   conteúdo só vem pela API de blobs. O produtos.json desta farmácia
   tem 2,7 MB — ou seja, produção é sempre este caminho. */
function fingirGitHub({ leitura = "ok", conteudo = CATALOGO, blob = "ok" } = {}) {

    const escritas = [];

    globalThis.fetch = async (url, opcoes = {}) => {

        const metodo = opcoes.method || "GET";
        const endereco = String(url);

        if (metodo === "GET") {

            /* A API de blobs, que é de onde vem todo catálogo de
               verdade. */
            if (endereco.includes("/git/blobs/")) {

                if (blob !== "ok") return new Response("sem permissão", { status: 403 });

                return new Response(JSON.stringify(conteudo), { status: 200 });

            }

            if (leitura === "404") {
                return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
            }

            if (leitura === "erro") {
                return new Response("boom", { status: 500 });
            }

            if (leitura === "grande") {
                /* Exatamente o que o GitHub responde para arquivo acima
                   de 1 MB: ficha completa, conteúdo vazio. */
                return new Response(JSON.stringify({
                    sha: "sha-atual", size: 2698682, content: "", encoding: "none"
                }), { status: 200 });
            }

            if (leitura === "ilegivel") {
                return new Response(JSON.stringify({
                    sha: "sha-atual",
                    content: Buffer.from("isto não é json", "utf8").toString("base64"),
                    encoding: "base64"
                }), { status: 200 });
            }

            return new Response(JSON.stringify({
                sha: "sha-atual",
                encoding: "base64",
                content: Buffer.from(JSON.stringify(conteudo), "utf8").toString("base64")
            }), { status: 200 });

        }

        escritas.push(JSON.parse(opcoes.body));
        return new Response(JSON.stringify({ commit: { sha: "novo" } }), { status: 200 });

    };

    return escritas;
}

const env = { PUBLISH_KEY: "chave", GITHUB_TOKEN: "token" };

const chamar = (corpo) => worker.fetch(new Request("https://publicar.exemplo.dev/", {
    method: "POST",
    headers: { "X-Publish-Key": "chave", "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
}), env);

const publicado = (escritas) =>
    JSON.parse(Buffer.from(escritas[0].content, "base64").toString("utf8")).produtos;

/* ---- 1. apagar de verdade -------------------------------------------- */
console.log("\n1. apaga o que foi pedido, e só isso");
{
    const escritas = fingirGitHub();

    const r = await chamar({ modo: "remover", produtos: [{ ean: "7891234567891", codigo: "002" }] });
    const corpo = await r.json();

    conferir("responde ok", r.status === 200, `${r.status} ${JSON.stringify(corpo)}`);
    conferir("publicou uma vez", escritas.length === 1, String(escritas.length));

    const lista = publicado(escritas);

    conferir("a taxa de entrega saiu",
        !lista.some((p) => p.codigo === "002"), JSON.stringify(lista.map((p) => p.codigo)));

    conferir("e o resto do catálogo ficou inteiro",
        lista.length === 2 && lista.some((p) => p.codigo === "001") && lista.some((p) => p.codigo === "003"),
        JSON.stringify(lista.map((p) => p.codigo)));

    conferir("a mensagem do commit diz que apagou",
        /Apagar 1 produto/.test(escritas[0].message), escritas[0].message);
}

/* ---- 2. produto sem EAN ---------------------------------------------- */
console.log("\n2. o produto que só tem código");
{
    const escritas = fingirGitHub();

    /* Cadastro interno da loja chega com EAN vazio. Se a remoção casasse
       por EAN vazio, ela levaria junto qualquer outro produto sem EAN. */
    await chamar({ modo: "remover", produtos: [{ ean: "", codigo: "003" }] });

    const lista = publicado(escritas);

    conferir("sai pelo código", !lista.some((p) => p.codigo === "003"),
        JSON.stringify(lista.map((p) => p.codigo)));
    conferir("e o EAN vazio não leva ninguém junto", lista.length === 2, String(lista.length));
}

/* ---- 3. a trava que importa ------------------------------------------ */
console.log("\n3. sem conseguir ler o catálogo, não se apaga nada");
{
    for (const leitura of ["404", "erro"]) {

        const escritas = fingirGitHub({ leitura });

        const r = await chamar({ modo: "remover", produtos: [{ ean: "7891234567891", codigo: "002" }] });

        conferir(`leitura ${leitura}: não publica`, escritas.length === 0, String(escritas.length));
        conferir(`leitura ${leitura}: e avisa em vez de dizer que apagou`,
            r.status >= 400, String(r.status));
    }

    /* O desastre que isso impede, dito por extenso: o catálogo vazio. */
    const escritas = fingirGitHub({ leitura: "404" });
    await chamar({ modo: "remover", produtos: [{ ean: "7891234567891", codigo: "002" }] });
    conferir("nenhum catálogo vazio é publicado", escritas.length === 0, String(escritas.length));
}

/* ---- 4. apagar tudo não é apagar um -------------------------------- */
console.log("\n4. uma conta que esvazia o catálogo não é publicada");
{
    const escritas = fingirGitHub();

    const r = await chamar({
        modo: "remover",
        produtos: CATALOGO.produtos.map((p) => ({ ean: p.ean, codigo: p.codigo }))
    });

    conferir("recusa", r.status === 400, String(r.status));
    conferir("e não escreve", escritas.length === 0, String(escritas.length));
}

/* ---- 5. os outros modos continuam iguais ---------------------------- */
console.log("\n5. publicar normal não foi afetado");
{
    const escritas = fingirGitHub();

    await chamar({ produtos: [{ ean: "7891234567899", codigo: "009", descricao: "Novo" }] });

    const lista = publicado(escritas);

    conferir("mesclar continua acrescentando",
        lista.length === 4 && lista.some((p) => p.codigo === "009"),
        JSON.stringify(lista.map((p) => p.codigo)));
}

/* ---- 6. o catálogo de verdade, que passa de 1 MB -------------------- */
console.log("\n6. o arquivo grande — o caso que apagou a loja de verdade");
{
    /* 21/10/2026, 17:53: um clique em "Apagar" publicou um catálogo
       vazio no lugar de 6.793 produtos. Não foi a regra de remoção que
       errou — foi a LEITURA. Acima de 1 MB a Contents API devolve
       content vazio, o parse falhava, o catch tratava como "não há nada
       publicado" e a remoção tirou um item de uma lista vazia.

       É a seção mais importante deste arquivo: ela roda o caminho que
       produção roda todo dia, e que nenhum teste cobria. */
    const escritas = fingirGitHub({ leitura: "grande" });

    const r = await chamar({ modo: "remover", produtos: [{ ean: "7891234567891", codigo: "002" }] });

    conferir("responde ok", r.status === 200, String(r.status));

    const lista = publicado(escritas);

    conferir("o catálogo NÃO foi esvaziado", lista.length === 2, String(lista.length));
    conferir("saiu só o pedido", !lista.some((p) => p.codigo === "002"),
        JSON.stringify(lista.map((p) => p.codigo)));

    /* E o outro lado do mesmo defeito: com a leitura vindo vazia, todo
       "mesclar" se comportava como "substituir". Publicar uma planilha
       parcial apagava o resto do catálogo, sem erro nenhum na tela. */
    const escritasMescla = fingirGitHub({ leitura: "grande" });

    await chamar({ produtos: [{ ean: "7891234567899", codigo: "009", descricao: "Novo" }] });

    const comMescla = publicado(escritasMescla);

    conferir("mesclar com arquivo grande mantém quem já estava",
        comMescla.length === 4, JSON.stringify(comMescla.map((p) => p.codigo)));
}

/* ---- 7. quando nem o blob dá -------------------------------------- */
console.log("\n7. não dá para ler: não se publica");
{
    for (const caso of [
        { nome: "blob recusado", opcoes: { leitura: "grande", blob: "403" } },
        { nome: "arquivo ilegível", opcoes: { leitura: "ilegivel" } }
    ]) {

        const escritas = fingirGitHub(caso.opcoes);

        const r = await chamar({ modo: "remover", produtos: [{ codigo: "002" }] });

        conferir(`${caso.nome}: não publica`, escritas.length === 0, String(escritas.length));
        conferir(`${caso.nome}: avisa`, r.status >= 400, String(r.status));

        /* Vale para publicar também: antes, um arquivo ilegível virava
           "está vazio" e a publicação seguia por cima. */
        const outras = fingirGitHub(caso.opcoes);
        const normal = await chamar({ produtos: [{ ean: "789", codigo: "009", descricao: "Novo" }] });

        conferir(`${caso.nome}: nem publicando normal`, outras.length === 0, String(outras.length));
        conferir(`${caso.nome}: e o erro aparece`, normal.status >= 400, String(normal.status));

    }
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
