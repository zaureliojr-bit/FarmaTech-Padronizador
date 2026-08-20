// Proxy de hospedagem de imagens (Cloudflare Worker + R2 + D1)
//
// Até aqui, a imagem "salva" de um produto era só um link pra Cosmos,
// Serper ou site de terceiro, guardado no navegador - se aquele link
// caísse um dia, a imagem sumia do catálogo sem aviso, e o link nunca
// era compartilhável entre sessões/computadores.
//
// Este worker baixa a imagem UMA VEZ (server-to-server, sem o problema
// de CORS que o navegador tem), guarda o arquivo de verdade no R2 e
// indexa por EAN no D1. Dali pra frente, tanto o padronizador quanto o
// site publicado servem a imagem direto daqui - dono do arquivo passa
// a ser a farmácia, não mais o site de origem.
//
// Bindings necessários (Configurações -> Bindings, no painel):
//   R2 bucket        -> nome da variável: IMAGENS_BUCKET
//   D1 database       -> nome da variável: DB (rode schema.sql nela antes)
// Secret necessário (Configurações -> Variáveis e Secrets):
//   IMAGENS_KEY        -> senha inventada, autoriza salvar imagem nova

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Imagens-Key"
};

// Nenhum EAN de verdade passa disso - protege contra lote gigante
// acidental (planilha inteira de uma vez, por exemplo).
const MAX_EANS_POR_LOTE = 500;

function json(dados, status = 200) {

    return new Response(JSON.stringify(dados), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });

}

async function tratarSalvar(request, env) {

    if (request.headers.get("X-Imagens-Key") !== env.IMAGENS_KEY) {
        return json({ erro: "Chave inválida." }, 401);
    }

    const { ean, url, origem } = await request.json().catch(() => ({}));

    if (!ean || !url) {
        return json({ erro: "'ean' e 'url' são obrigatórios." }, 400);
    }

    const resposta = await fetch(url);

    if (!resposta.ok) {
        return json({ erro: `Não consegui baixar a imagem de origem (HTTP ${resposta.status}).` }, 502);
    }

    const bytes = await resposta.arrayBuffer();
    const contentType = resposta.headers.get("content-type") || "image/jpeg";

    await env.IMAGENS_BUCKET.put(ean, bytes, {
        httpMetadata: { contentType }
    });

    const salvoEm = Date.now();

    await env.DB.prepare(
        `INSERT INTO imagens (ean, content_type, origem, url_original, salvo_em)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(ean) DO UPDATE SET
            content_type = excluded.content_type,
            origem = excluded.origem,
            url_original = excluded.url_original,
            salvo_em = excluded.salvo_em`
    ).bind(ean, contentType, origem || "desconhecida", url, salvoEm).run();

    const base = new URL(request.url).origin;

    return json({ sucesso: true, url: `${base}/${encodeURIComponent(ean)}` });

}

async function tratarServirImagem(ean, env) {

    const objeto = await env.IMAGENS_BUCKET.get(ean);

    if (!objeto) return json({ erro: "Imagem não encontrada." }, 404);

    return new Response(objeto.body, {
        headers: {
            "Content-Type": objeto.httpMetadata?.contentType || "image/jpeg",
            // um dia de cache: raro trocar a imagem do mesmo EAN, e
            // quando trocar, vale a pena esperar não mais que isso.
            "Cache-Control": "public, max-age=86400",
            ...CORS_HEADERS
        }
    });

}

async function tratarLote(request, env) {

    const url = new URL(request.url);
    const eans = (url.searchParams.get("eans") || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .slice(0, MAX_EANS_POR_LOTE);

    if (!eans.length) return json({});

    const placeholders = eans.map((_, i) => `?${i + 1}`).join(",");

    const { results } = await env.DB.prepare(
        `SELECT ean, origem, salvo_em FROM imagens WHERE ean IN (${placeholders})`
    ).bind(...eans).all();

    const base = url.origin;
    const mapa = {};

    (results || []).forEach((linha) => {
        mapa[linha.ean] = {
            url: `${base}/${encodeURIComponent(linha.ean)}`,
            origem: linha.origem,
            salvoEm: linha.salvo_em
        };
    });

    return json(mapa);

}

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);

        if (request.method === "POST" && url.pathname === "/") {
            return tratarSalvar(request, env);
        }

        if (request.method === "GET" && url.pathname === "/lote") {
            return tratarLote(request, env);
        }

        if (request.method === "GET" && url.pathname.length > 1) {
            const ean = decodeURIComponent(url.pathname.slice(1));
            return tratarServirImagem(ean, env);
        }

        return json({ erro: "Rota não encontrada." }, 404);

    }

};
