// Proxy de publicação (Cloudflare Worker)
//
// Recebe o catálogo já no formato que o site "Drogaria Mais Barato"
// espera e sobrescreve produtos.json no repositório GitHub
// zaureliojr-bit/Produtos, usando um token pessoal (PAT) guardado como
// secret - nunca exposto ao navegador.
//
// Uso: POST https://<seu-worker>.workers.dev/
//      Header: X-Publish-Key: <chave>
//      Body: { "produtos": [...] }

const REPO_OWNER = "zaureliojr-bit";
const REPO_NAME = "Produtos";
const ARQUIVO = "produtos.json";
const BRANCH = "main";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Publish-Key"
};

function jsonResponse(corpo, status = 200) {

    return new Response(JSON.stringify(corpo), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });

}

// btoa() sozinho quebra com acentos (fora do intervalo Latin1) - passa
// primeiro pelos bytes UTF-8 pra suportar descrição/marca em português.
function paraBase64Utf8(texto) {

    const bytes = new TextEncoder().encode(texto);

    let binario = "";
    bytes.forEach((b) => { binario += String.fromCharCode(b); });

    return btoa(binario);

}

// Caminho inverso - o conteúdo que a Contents API do GitHub devolve.
function deBase64Utf8(base64) {

    const binario = atob(base64.replace(/\n/g, ""));

    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));

    return new TextDecoder().decode(bytes);

}

// Junta o catálogo novo com o que já estava publicado, pelo EAN: quem
// veio na planilha atual substitui a versão antiga (preço/estoque
// atualizado); quem não veio, permanece como estava - só o modo
// "substituir" apaga o que não veio.
function mesclarPorEan(existentes, novos) {

    const porEan = new Map(existentes.map((produto) => [produto.ean, produto]));

    novos.forEach((produto) => porEan.set(produto.ean, produto));

    return [...porEan.values()];

}

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        if (request.method !== "POST") {
            return jsonResponse({ erro: "Método não permitido." }, 405);
        }

        if (!env.PUBLISH_KEY || request.headers.get("X-Publish-Key") !== env.PUBLISH_KEY) {
            return jsonResponse({ erro: "Não autorizado." }, 401);
        }

        let corpo;

        try {
            corpo = await request.json();
        } catch {
            return jsonResponse({ erro: "JSON inválido." }, 400);
        }

        const produtos = corpo?.produtos;

        // "mesclar" (padrão): atualiza/acrescenta pelo EAN, mantém quem
        // não veio na planilha atual. "substituir": apaga tudo que não
        // estiver na lista enviada - só faz sentido numa reimportação do
        // catálogo completo.
        const modo = corpo?.modo === "substituir" ? "substituir" : "mesclar";

        if (!Array.isArray(produtos) || !produtos.length) {
            return jsonResponse({ erro: "Lista de produtos vazia ou inválida." }, 400);
        }

        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${ARQUIVO}`;

        const headersGitHub = {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "farmatech-publish-proxy"
        };

        // Precisa do conteúdo atual (pra mesclar) e do sha (pra poder
        // sobrescrever) - as duas coisas vêm da mesma chamada.
        const atual = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: headersGitHub });

        if (!atual.ok && atual.status !== 404) {
            const erro = await atual.text();
            return jsonResponse({ erro: `Falha ao ler arquivo atual: ${erro}` }, 502);
        }

        let shaAtual;
        let produtosExistentes = [];

        if (atual.ok) {

            const dadosAtual = await atual.json();

            shaAtual = dadosAtual.sha;

            try {

                const jsonAtual = JSON.parse(deBase64Utf8(dadosAtual.content));

                if (Array.isArray(jsonAtual.produtos)) produtosExistentes = jsonAtual.produtos;

            } catch {

                // produtos.json corrompido ou em formato inesperado - segue
                // como se não houvesse nada publicado ainda, em vez de falhar.

            }

        }

        const produtosFinais = modo === "mesclar"
            ? mesclarPorEan(produtosExistentes, produtos)
            : produtos;

        const conteudoJson = JSON.stringify({ produtos: produtosFinais }, null, 2);

        const resposta = await fetch(apiUrl, {

            method: "PUT",
            headers: { ...headersGitHub, "Content-Type": "application/json" },

            body: JSON.stringify({
                message: modo === "mesclar"
                    ? `Atualizar ${produtos.length} produto(s) via FarmaTech Padronizador`
                    : `Publicar catálogo completo (${produtos.length} produtos) via FarmaTech Padronizador`,
                content: paraBase64Utf8(conteudoJson),
                branch: BRANCH,
                ...(shaAtual ? { sha: shaAtual } : {})
            })

        });

        if (!resposta.ok) {
            const erro = await resposta.text();
            return jsonResponse({ erro: `Falha ao publicar: ${erro}` }, 502);
        }

        return jsonResponse({ ok: true, total: produtosFinais.length, enviados: produtos.length, modo });

    }

};
