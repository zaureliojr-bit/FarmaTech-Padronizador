// Listas de referência (CMED, distribuidora) espelhadas no servidor -
// ver imagens-proxy/worker.js (rotas /referencias/:chave). Até aqui só
// viviam no IndexedDB de quem usava o padronizador; um site em outro
// domínio (ex.: o painel da loja) não enxerga esse IndexedDB
// (armazenamento de navegador é isolado por origem), então precisa
// buscar daqui pra rodar a mesma padronização sozinho.
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");
const PROXY_KEY = import.meta.env.VITE_IMAGENS_KEY;

/** Sobe o índice (já processado, serializável) pro servidor. Falha em silêncio - é um espelho, o IndexedDB local continua sendo a fonte usada na hora. */
export async function salvarReferencia(chave, indice) {

    if (!PROXY_URL) return false;

    try {

        const resposta = await fetch(`${PROXY_URL}/referencias/${chave}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Imagens-Key": PROXY_KEY || ""
            },
            body: JSON.stringify(indice)
        });

        return resposta.ok;

    } catch (erro) {

        console.warn(`Não consegui espelhar a referência "${chave}" no servidor.`, erro);

        return false;

    }

}

/** null se ainda não tiver sido enviada. */
export async function buscarReferencia(chave) {

    if (!PROXY_URL) return null;

    const resposta = await fetch(`${PROXY_URL}/referencias/${chave}`);

    if (!resposta.ok) return null;

    return resposta.json().catch(() => null);

}
