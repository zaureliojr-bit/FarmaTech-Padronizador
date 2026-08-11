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

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        if (request.method !== "POST") {
            return jsonResponse({ erro: "Método não permitido." }, 405);
        }

        if (!env.PUBLISH_KEY || request.headers.get("X-Publish-Key") !== env.PUBLISH_KEY) {

            // DIAGNÓSTICO TEMPORÁRIO - remover depois de descobrir a causa
            // do 401. Não expõe os valores reais, só metadados seguros.
            return jsonResponse({
                erro: "Não autorizado.",
                debug: {
                    chaveConfiguradaNoWorker: !!env.PUBLISH_KEY,
                    tamanhoChaveConfigurada: env.PUBLISH_KEY ? env.PUBLISH_KEY.length : 0,
                    chaveRecebida: !!request.headers.get("X-Publish-Key"),
                    tamanhoChaveRecebida: (request.headers.get("X-Publish-Key") || "").length
                }
            }, 401);

        }

        let corpo;

        try {
            corpo = await request.json();
        } catch {
            return jsonResponse({ erro: "JSON inválido." }, 400);
        }

        const produtos = corpo?.produtos;

        if (!Array.isArray(produtos) || !produtos.length) {
            return jsonResponse({ erro: "Lista de produtos vazia ou inválida." }, 400);
        }

        const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${ARQUIVO}`;

        const headersGitHub = {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "farmatech-publish-proxy"
        };

        // Precisa do sha do arquivo atual pra poder sobrescrevê-lo.
        const atual = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: headersGitHub });

        if (!atual.ok && atual.status !== 404) {
            const erro = await atual.text();
            return jsonResponse({ erro: `Falha ao ler arquivo atual: ${erro}` }, 502);
        }

        const shaAtual = atual.ok ? (await atual.json()).sha : undefined;

        const conteudoJson = JSON.stringify({ produtos }, null, 2);

        const resposta = await fetch(apiUrl, {

            method: "PUT",
            headers: { ...headersGitHub, "Content-Type": "application/json" },

            body: JSON.stringify({
                message: `Publicar catálogo (${produtos.length} produtos) via FarmaTech Padronizador`,
                content: paraBase64Utf8(conteudoJson),
                branch: BRANCH,
                ...(shaAtual ? { sha: shaAtual } : {})
            })

        });

        if (!resposta.ok) {
            const erro = await resposta.text();
            return jsonResponse({ erro: `Falha ao publicar: ${erro}` }, 502);
        }

        return jsonResponse({ ok: true, total: produtos.length });

    }

};
