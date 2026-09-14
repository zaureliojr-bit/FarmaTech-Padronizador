// Correções de categoria -> família (mesmo worker/D1 da hospedagem de
// imagens - ver imagens-proxy/). Existem pra não precisar mexer no
// dicionário fixo (familias.js) e esperar um deploy toda vez que uma
// planilha traz uma categoria nova que o site ainda não reconhece.
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");
const PROXY_KEY = import.meta.env.VITE_IMAGENS_KEY;

/**
 * Busca todas as correções de categoria -> família já salvas. Lista
 * costuma ser pequena (uma linha por categoria nova encontrada, não por
 * produto), então busca tudo de uma vez, sem paginação.
 */
export async function buscarFamiliasOverride() {

    if (!PROXY_URL) return new Map();

    const resposta = await fetch(`${PROXY_URL}/familias`);

    if (!resposta.ok) {
        console.error(`Falha ao buscar correções de família (HTTP ${resposta.status}).`, await resposta.text().catch(() => ""));
        return new Map();
    }

    const dados = await resposta.json().catch(() => ({}));

    return new Map(Object.entries(dados));

}

/**
 * Salva que uma categoria (bruta, do PDV) pertence a uma família do
 * site. Fica valendo imediatamente nesta sessão e também pra quem
 * reimportar depois (nesta loja ou em outra).
 */
export async function salvarFamiliaOverride(categoria, familiaId) {

    if (!PROXY_URL) {
        throw new Error("Hospedagem de imagens não configurada (falta VITE_IMAGENS_PROXY_URL no .env).");
    }

    const resposta = await fetch(`${PROXY_URL}/familias`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "X-Imagens-Key": PROXY_KEY || ""
        },

        body: JSON.stringify({ categoria, familiaId })

    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao salvar correção de família (HTTP ${resposta.status})`);
    }

    return dados;

}
