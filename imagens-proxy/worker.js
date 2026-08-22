// Proxy de hospedagem de imagens e correções (Cloudflare Worker + R2 + D1)
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
// Também guarda "correções" - descrição/classe/categoria que alguém
// ajustou manualmente na tabela, por cima do que a planilha do PDV ou
// o pipeline automático geraram. Guardado por EAN, sem nada específico
// da loja: se um dia existir mais de uma loja usando o padronizador,
// toda correção feita numa já nasce pronta pras outras herdarem ao
// importar - preço/estoque/código continuam de fora de propósito, são
// dados que têm que ficar por loja, nunca compartilhados.
//
// Bindings necessários (Configurações -> Bindings, no painel):
//   R2 bucket        -> nome da variável: IMAGENS_BUCKET
//   D1 database       -> nome da variável: DB (rode schema.sql nela antes)
// Secret necessário (Configurações -> Variáveis e Secrets):
//   IMAGENS_KEY        -> senha inventada, autoriza salvar imagem/correção nova

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Imagens-Key"
};

// D1 recusa consulta com mais de 100 parâmetros amarrados (limite da
// plataforma) - um IN (...) com mais EANs que isso falha a query
// inteira, então este teto tem que ficar dentro do limite do D1, não
// só "razoável". O front-end já pagina em blocos de 100 por causa
// disso, mas o corte aqui garante que uma chamada direta (fora do
// front-end) nunca estoure o D1 por engano.
const MAX_EANS_POR_LOTE = 100;

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

    // ?v=salvoEm muda toda vez que a imagem é trocada - sem isso a URL
    // fica idêntica de antes (mesmo EAN), e o Cache-Control de 1 dia
    // (tratarServirImagem) faz o navegador continuar mostrando a versão
    // antiga por até 24h mesmo com o R2 já atualizado.
    return json({ sucesso: true, url: `${base}/${encodeURIComponent(ean)}?v=${salvoEm}` });

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

async function tratarExcluir(ean, request, env) {

    if (request.headers.get("X-Imagens-Key") !== env.IMAGENS_KEY) {
        return json({ erro: "Chave inválida." }, 401);
    }

    await env.IMAGENS_BUCKET.delete(ean);

    await env.DB.prepare(`DELETE FROM imagens WHERE ean = ?1`).bind(ean).run();

    return json({ sucesso: true });

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
            // mesma URL versionada do tratarSalvar - senão o padronizador
            // (e o site publicado) continuam mostrando a imagem antiga em
            // cache depois de uma troca, mesmo com o arquivo já certo no R2.
            url: `${base}/${encodeURIComponent(linha.ean)}?v=${linha.salvo_em}`,
            origem: linha.origem,
            salvoEm: linha.salvo_em
        };
    });

    return json(mapa);

}

async function tratarSalvarCorrecao(request, env) {

    if (request.headers.get("X-Imagens-Key") !== env.IMAGENS_KEY) {
        return json({ erro: "Chave inválida." }, 401);
    }

    const { ean, descricaoManual, classe, categoria } = await request.json().catch(() => ({}));

    if (!ean) {
        return json({ erro: "'ean' é obrigatório." }, 400);
    }

    // nulo (não undefined) apaga só aquele campo da correção sem mexer
    // nos outros dois - undefined (campo nem enviado) deixa como estava.
    await env.DB.prepare(
        `INSERT INTO correcoes (ean, descricao_manual, classe, categoria, atualizado_em)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(ean) DO UPDATE SET
            descricao_manual = COALESCE(?2, descricao_manual),
            classe = COALESCE(?3, classe),
            categoria = COALESCE(?4, categoria),
            atualizado_em = ?5`
    ).bind(
        ean,
        descricaoManual ?? null,
        classe ?? null,
        categoria ?? null,
        Date.now()
    ).run();

    return json({ sucesso: true });

}

async function tratarLoteCorrecoes(request, env) {

    const url = new URL(request.url);
    const eans = (url.searchParams.get("eans") || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .slice(0, MAX_EANS_POR_LOTE);

    if (!eans.length) return json({});

    const placeholders = eans.map((_, i) => `?${i + 1}`).join(",");

    const { results } = await env.DB.prepare(
        `SELECT ean, descricao_manual, classe, categoria FROM correcoes WHERE ean IN (${placeholders})`
    ).bind(...eans).all();

    const mapa = {};

    (results || []).forEach((linha) => {
        mapa[linha.ean] = {
            descricaoManual: linha.descricao_manual || "",
            classe: linha.classe || "",
            categoria: linha.categoria || ""
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

        // Tolera barra dupla ("//lote", "//correcoes") vinda de um
        // PROXY_URL configurado com "/" no final em algum cliente - sem
        // isso a rota exata não bate e cai no fallback de servir imagem,
        // devolvendo "Imagem não encontrada." pra tudo sem aviso nenhum.
        const caminho = url.pathname.replace(/\/{2,}/g, "/");

        if (request.method === "POST" && caminho === "/") {
            return tratarSalvar(request, env);
        }

        if (request.method === "GET" && caminho === "/lote") {
            return tratarLote(request, env);
        }

        if (request.method === "POST" && caminho === "/correcoes") {
            return tratarSalvarCorrecao(request, env);
        }

        if (request.method === "GET" && caminho === "/correcoes") {
            return tratarLoteCorrecoes(request, env);
        }

        if (request.method === "GET" && caminho.length > 1) {
            const ean = decodeURIComponent(caminho.slice(1));
            return tratarServirImagem(ean, env);
        }

        if (request.method === "DELETE" && caminho.length > 1) {
            const ean = decodeURIComponent(caminho.slice(1));
            return tratarExcluir(ean, request, env);
        }

        return json({ erro: "Rota não encontrada." }, 404);

    }

};
