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
// Guarda também a EXTRAÇÃO DO PDV: a planilha que sai do Firebird do
// balcão espera aqui até o painel buscá-la e padronizar. Ver a seção
// "EXTRAÇÃO DO PDV", mais abaixo - o cuidado principal é que ela traz a
// coluna de preço de custo, então baixar pede a chave.
//
// Bindings necessários (Configurações -> Bindings, no painel):
//   R2 bucket        -> nome da variável: IMAGENS_BUCKET
//   D1 database       -> nome da variável: DB (rode schema.sql nela antes)
// Secret necessário (Configurações -> Variáveis e Secrets):
//   IMAGENS_KEY        -> senha inventada, autoriza salvar imagem/correção nova
//
// ATENÇÃO sobre a IMAGENS_KEY: hoje ela chega ao navegador, porque o
// frontend a recebe em VITE_IMAGENS_KEY e o Vite embute toda variável
// VITE_ no bundle em tempo de build. Ou seja: ela está legível em texto
// no importador-automatico.js servido publicamente, e trocá-la só a
// torna pública de novo no build seguinte. Enquanto o navegador precisar
// dela para escrever, trate-a como senha conhecida - o conserto é mover
// a escrita para trás de uma rota autenticada pelo login do painel, como
// o pedidos-proxy já faz. Ver o README.

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Imagens-Key"
};

function temChave(request, env) {

    return !!env.IMAGENS_KEY && request.headers.get("X-Imagens-Key") === env.IMAGENS_KEY;

}

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

/* ===================== EXTRAÇÃO DO PDV =====================

   O catálogo nasce num Firebird, dentro do computador do balcão. Alguém
   exporta uma planilha e ela precisa chegar ao painel, que roda no
   navegador e faz a padronização. Este worker é o ponto de encontro: o
   balcão envia, o painel busca.

   Uma extração pendente por vez, de propósito. Se acumulasse fila, o
   painel teria de decidir qual importar — e importar a errada
   republica o catálogo inteiro com preço velho.

   Guardado no R2 com `head()` para o status, em vez de uma linha no D1:
   o que o painel precisa saber (existe? qual nome? que tamanho? de
   quando?) o próprio R2 já responde, e uma tabela a mais seria um
   estado a mais para sair de sincronia com o arquivo.

   A chave tem prefixo "_" porque o resto do balde é indexado por EAN, e
   EAN é só dígito — então nada aqui colide com imagem de produto, e o
   servidor de imagem (mais abaixo) recusa qualquer chave com "_" na
   frente, para esta planilha nunca sair por aquela porta.
*/

const CHAVE_EXTRACAO = "_extracao/pendente";

// xlsx do PDV com 7 mil produtos dá uns 3 MB; 20 cobre uma rede grande
// sem virar porta para entupir o balde.
const MAX_EXTRACAO_BYTES = 20 * 1024 * 1024;

async function tratarExtracaoStatus(env) {

    const cabeca = await env.IMAGENS_BUCKET.head(CHAVE_EXTRACAO).catch(() => null);

    if (!cabeca) return json({ pendente: false });

    /* Só metadado: nome, tamanho e quando chegou. O conteúdo sai pela
       rota de baixo, que pede chave. Isto fica aberto porque o painel
       pergunta "tem coisa nova?" a cada poucos minutos e a resposta não
       diz nada sobre preço nem sobre produto. */
    return json({
        pendente: true,
        nomeArquivo: cabeca.customMetadata?.nome || "extracao.xlsx",
        tamanho: cabeca.size,
        enviadoEm: Number(cabeca.customMetadata?.enviadoEm) || cabeca.uploaded?.getTime?.() || 0
    });

}

async function tratarExtracaoArquivo(request, env) {

    /* PEDE CHAVE, e isto não é opcional.

       A planilha do PDV traz a coluna "Preço Custo" de cada produto. O
       produtos.json publicado remove esse campo justamente porque
       margem não é dado de vitrine — servir a planilha crua sem chave
       desfaz esse cuidado e entrega a margem de toda a loja a quem
       souber o endereço.

       Quem chama é o painel, que já tem a chave para marcar a extração
       como importada. */
    if (!temChave(request, env)) {
        return json({ erro: "Chave inválida." }, 401);
    }

    const objeto = await env.IMAGENS_BUCKET.get(CHAVE_EXTRACAO);

    if (!objeto) return json({ erro: "Nenhuma extração pendente." }, 404);

    return new Response(objeto.body, {
        headers: {
            "Content-Type": objeto.httpMetadata?.contentType
                || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            // nunca em cache: é dado de custo, e cada extração é outra
            "Cache-Control": "no-store",
            ...CORS_HEADERS
        }
    });

}

async function tratarEnviarExtracao(request, env) {

    if (!temChave(request, env)) {
        return json({ erro: "Chave inválida." }, 401);
    }

    /* Aceita as duas formas que um enviador pode usar: multipart, como
       um formulário de navegador manda, ou o corpo cru com o nome em
       "?nome=", como o upload de banner do pedidos-proxy faz. Aceitar as
       duas evita que trocar o programa do balcão exija mexer no worker. */
    const tipo = request.headers.get("content-type") || "";
    let bytes;
    let nome = new URL(request.url).searchParams.get("nome") || "";

    if (tipo.includes("multipart/form-data")) {
        const form = await request.formData().catch(() => null);
        const arquivo = form?.get("arquivo") || form?.get("file");
        if (!arquivo || typeof arquivo === "string") {
            return json({ erro: "Envie o arquivo no campo 'arquivo'." }, 400);
        }
        bytes = await arquivo.arrayBuffer();
        nome = nome || arquivo.name || "";
    } else {
        bytes = await request.arrayBuffer();
    }

    if (!bytes || !bytes.byteLength) {
        return json({ erro: "Corpo vazio." }, 400);
    }

    if (bytes.byteLength > MAX_EXTRACAO_BYTES) {
        return json({ erro: "Extração acima do limite." }, 413);
    }

    /* O nome é só rótulo para o painel mostrar, mas vem de fora: tira
       caminho e deixa o que é seguro guardar em metadado. */
    nome = String(nome).split(/[\\/]/).pop().replace(/[^\w.-]/g, "_").slice(0, 80)
        || "extracao.xlsx";

    const enviadoEm = Date.now();

    await env.IMAGENS_BUCKET.put(CHAVE_EXTRACAO, bytes, {
        httpMetadata: {
            contentType: tipo.includes("multipart") || !tipo
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : tipo
        },
        customMetadata: { nome, enviadoEm: String(enviadoEm) }
    });

    return json({ sucesso: true, nomeArquivo: nome, tamanho: bytes.byteLength, enviadoEm });

}

async function tratarExtracaoImportada(request, env) {

    if (!temChave(request, env)) {
        return json({ erro: "Chave inválida." }, 401);
    }

    /* Apaga, não marca. Uma planilha "já importada" que ficasse no balde
       seria a tabela de custo da loja parada à espera de alguém achar o
       endereço, sem servir mais para nada. Importou, sai. */
    await env.IMAGENS_BUCKET.delete(CHAVE_EXTRACAO).catch(() => {});

    return json({ sucesso: true });

}

async function tratarDescartarExtracao(request, env) {

    if (!temChave(request, env)) {
        return json({ erro: "Chave inválida." }, 401);
    }

    // mesma coisa que importada, mas dito por quem desistiu: serve para
    // tirar do ar uma extração errada sem ter de importá-la antes
    await env.IMAGENS_BUCKET.delete(CHAVE_EXTRACAO).catch(() => {});

    return json({ sucesso: true });

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

        // Extração do PDV. O status é aberto (só diz se há coisa nova);
        // baixar, enviar, marcar importada e descartar pedem a chave.
        if (request.method === "GET" && caminho === "/extracao") {
            return tratarExtracaoStatus(env);
        }

        if (request.method === "GET" && caminho === "/extracao/arquivo") {
            return tratarExtracaoArquivo(request, env);
        }

        if (request.method === "POST" && caminho === "/extracao") {
            return tratarEnviarExtracao(request, env);
        }

        if (request.method === "POST" && caminho === "/extracao/importado") {
            return tratarExtracaoImportada(request, env);
        }

        if (request.method === "DELETE" && caminho === "/extracao") {
            return tratarDescartarExtracao(request, env);
        }

        if (request.method === "GET" && caminho.length > 1) {
            const ean = decodeURIComponent(caminho.slice(1));

            /* O balde guarda imagem por EAN e, com prefixo "_", coisa
               que não é imagem — hoje a extração do PDV. Como esta rota
               é o curinga que serve qualquer chave do balde, sem esta
               recusa um GET /_extracao/pendente entregaria a planilha de
               custo por aqui, passando por fora da chave que a rota
               /extracao/arquivo exige. EAN é só dígito, então nada
               legítimo começa com "_". */
            if (ean.startsWith("_")) {
                return json({ erro: "Imagem não encontrada." }, 404);
            }

            return tratarServirImagem(ean, env);
        }

        return json({ erro: "Rota não encontrada." }, 404);

    }

};
