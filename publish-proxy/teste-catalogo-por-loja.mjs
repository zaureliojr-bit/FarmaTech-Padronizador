/* O publish-proxy escreve no arquivo da farmácia certa.

   O que está sendo provado, e por que importa: até a Fase 4 havia um
   produtos.json só. Publicar pela segunda farmácia apagaria o catálogo da
   primeira — preço e estoque de uma loja substituídos pelos da outra, em
   um commit. É o erro mais caro que esta plataforma poderia cometer.

   E a seção 2 é a que não dá para pular: o slug vira NOME DE ARQUIVO numa
   chamada à API do GitHub. Um "../" dentro dele escreveria fora da pasta.

   Uso: node teste-catalogo-por-loja.mjs
*/

import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

/* GitHub de mentira: guarda em qual caminho foi lido e escrito. */
function fingirGitHub() {
    const chamadas = [];
    globalThis.fetch = async (url, opcoes = {}) => {
        const endereco = String(url);
        chamadas.push({ url: endereco, metodo: opcoes.method || "GET" });

        if ((opcoes.method || "GET") === "GET") {
            /* Arquivo ainda não existe: é o caso de uma filial publicando
               pela primeira vez, e tem de funcionar. */
            return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
        }
        return new Response(JSON.stringify({ commit: { sha: "abc" } }), { status: 200 });
    };
    return chamadas;
}

const env = { PUBLISH_KEY: "chave", GITHUB_TOKEN: "token" };

const publicar = (query) => worker.fetch(new Request(
    "https://publicar.exemplo.dev/" + query,
    {
        method: "POST",
        headers: { "X-Publish-Key": "chave", "Content-Type": "application/json" },
        body: JSON.stringify({ produtos: [{ ean: "7891234567890", descricao: "Teste" }] })
    }
), env);

/* ---- 1. o arquivo de cada farmácia ---------------------------------- */
console.log("\n1. cada farmácia no arquivo dela");
{
    let chamadas = fingirGitHub();
    const r1 = await publicar("");
    conferir("sem loja, publica em produtos.json",
        chamadas.some((c) => c.metodo === "PUT" && /\/contents\/produtos\.json$/.test(c.url)),
        chamadas.map((c) => c.metodo + " " + c.url.split("/contents/")[1]).join(" | "));
    conferir("e diz em qual arquivo publicou", (await r1.json()).arquivo === "produtos.json");

    chamadas = fingirGitHub();
    const r2 = await publicar("?loja=farma-centro");
    conferir("com loja, publica no arquivo dela",
        chamadas.some((c) => c.metodo === "PUT" && /\/contents\/produtos-farma-centro\.json$/.test(c.url)),
        chamadas.map((c) => c.metodo + " " + c.url.split("/contents/")[1]).join(" | "));
    conferir("e devolve o nome", (await r2.json()).arquivo === "produtos-farma-centro.json");

    /* Arquivo que ainda não existe (o GET devolveu 404) tem de ser criado,
       e não dar erro: é a primeira publicação de toda filial nova. */
    conferir("filial publicando pela primeira vez cria o arquivo",
        r2.status === 200, String(r2.status));
}

/* ---- 2. o slug vira nome de arquivo --------------------------------- */
console.log("\n2. slug malicioso não escreve fora da pasta");
{
    for (const [slug, esperado] of [
        ["../../../etc/senha", "produtos-etcsenha.json"],
        ["..%2F..%2Foutro", "produtos-2f2foutro.json"],
        ["FARMA Centro!", "produtos-farmacentro.json"],
        ["a/b", "produtos-ab.json"]
    ]) {
        const chamadas = fingirGitHub();
        await publicar("?loja=" + encodeURIComponent(slug));
        const escrita = chamadas.find((c) => c.metodo === "PUT");
        const caminho = escrita ? escrita.url.split("/contents/")[1] : "";
        conferir(`${JSON.stringify(slug)} vira ${esperado}`, caminho === esperado, caminho);
        conferir(`  e não sobe de pasta`, !caminho.includes("..") && !caminho.includes("/"), caminho);
    }
}

/* ---- 3. a chave continua obrigatória -------------------------------- */
console.log("\n3. a chave de publicação continua obrigatória");
{
    fingirGitHub();
    const r = await worker.fetch(new Request("https://publicar.exemplo.dev/?loja=farma-centro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtos: [{ ean: "1" }] })
    }), env);
    conferir("sem a chave, 401", r.status === 401, String(r.status));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
