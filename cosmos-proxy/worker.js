// Proxy da Cosmos API (Cloudflare Worker)
//
// A Cosmos bloqueia chamadas diretas do navegador (CORS). Esse worker
// fica no meio: recebe a chamada do app com o EAN, consulta a Cosmos
// usando o token guardado como secret (nunca exposto ao navegador) e
// devolve a resposta já com os headers de CORS liberados.
//
// Uso: GET https://<seu-worker>.workers.dev/?ean=7891234567895

const COSMOS_URL = "https://api.cosmos.bluesoft.io/gtins";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const ean = url.searchParams.get("ean");

        if (!ean) {

            return new Response(
                JSON.stringify({ erro: "Parâmetro 'ean' é obrigatório." }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
                }
            );

        }

        const resposta = await fetch(`${COSMOS_URL}/${ean}.json`, {

            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "X-Cosmos-Token": env.COSMOS_TOKEN
            }

        });

        const corpo = await resposta.text();

        return new Response(corpo, {

            status: resposta.status,

            headers: {
                "Content-Type": "application/json",
                ...CORS_HEADERS
            }

        });

    }

};
