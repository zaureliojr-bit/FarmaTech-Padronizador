// Planilha que o extrator do Firebird (firebird-extrator/) gerou no PC
// da loja e já enviou pro worker (rotas /extracao* do imagens-proxy) -
// ver imagens-proxy/worker.js. Mesmo proxy/chave da hospedagem de
// imagens, só rotas novas por cima do que já existia.
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");
const PROXY_KEY = import.meta.env.VITE_IMAGENS_KEY;

/** null se não tem nada esperando (ou hospedagem não configurada). */
export async function buscarExtracaoPendente() {

    if (!PROXY_URL) return null;

    const resposta = await fetch(`${PROXY_URL}/extracao`);

    if (!resposta.ok) return null;

    const dados = await resposta.json().catch(() => null);

    return dados?.pendente ? dados : null;

}

export async function baixarArquivoExtracao() {

    if (!PROXY_URL) {
        throw new Error("Hospedagem não configurada (falta VITE_IMAGENS_PROXY_URL no .env).");
    }

    const resposta = await fetch(`${PROXY_URL}/extracao/arquivo`);

    if (!resposta.ok) {
        throw new Error(`Falha ao baixar a extração (HTTP ${resposta.status}).`);
    }

    return resposta.blob();

}

/** Some com o aviso - chamar só depois de importar com sucesso. */
export async function marcarExtracaoImportada() {

    if (!PROXY_URL) return;

    await fetch(`${PROXY_URL}/extracao/importado`, {
        method: "POST",
        headers: { "X-Imagens-Key": PROXY_KEY || "" }
    });

}
