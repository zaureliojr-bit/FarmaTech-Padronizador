// Proxy da Serper API (Cloudflare Worker)
//
// A Serper (serper.dev) devolve resultados de imagem do Google a partir
// de um texto de busca - diferente da Cosmos, que busca por EAN. Esse
// worker esconde a chave da Serper (nunca exposta ao navegador) e
// devolve só o que o app precisa: uma lista enxuta de URLs de imagem.
//
// Uso: GET https://<seu-worker>.workers.dev/?q=texto+de+busca

const SERPER_URL = "https://google.serper.dev/images";

// Quantas imagens candidatas devolver pro modal de seleção - o
// suficiente pra escolher a melhor sem carregar resultado demais.
const MAX_IMAGENS = 8;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

function erro(mensagem, status) {

    return new Response(
        JSON.stringify({ erro: mensagem }),
        { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );

}

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const q = url.searchParams.get("q");

        if (!q) return erro("Parâmetro 'q' é obrigatório.", 400);

        const resposta = await fetch(SERPER_URL, {

            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "X-API-KEY": env.SERPER_KEY
            },

            // gl/hl = resultado em português, priorizando o Brasil - sem
            // isso a Serper mistura resultado de qualquer país/idioma.
            body: JSON.stringify({ q, gl: "br", hl: "pt-br" })

        });

        if (!resposta.ok) {

            const corpo = await resposta.text();
            return erro(`Serper respondeu ${resposta.status}: ${corpo.slice(0, 200)}`, resposta.status);

        }

        const dados = await resposta.json();

        const imagens = (dados.images || [])
            .slice(0, MAX_IMAGENS)
            .map((img) => img.imageUrl)
            .filter(Boolean);

        return new Response(
            JSON.stringify({ imagens }),
            { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        );

    }

};
