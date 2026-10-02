// Produtos que não são produto de verdade (taxa de entrega, item de
// teste do sistema, cadastro duplicado) - marcados uma vez aqui,
// ficam fora de toda importação futura (manual ou automática pelo
// painel), sem precisar excluir de novo a cada reimportação. Mesmo
// worker/D1 da hospedagem de imagens - ver imagens-proxy/worker.js.
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");
const PROXY_KEY = import.meta.env.VITE_IMAGENS_KEY;

/** Mapa código -> {motivo, excluidoEm}. Vazio se hospedagem não configurada. */
export async function buscarProdutosExcluidos() {

    if (!PROXY_URL) return new Map();

    const resposta = await fetch(`${PROXY_URL}/excluidos`);

    if (!resposta.ok) {
        console.error(`Falha ao buscar produtos excluídos (HTTP ${resposta.status}).`, await resposta.text().catch(() => ""));
        return new Map();
    }

    const dados = await resposta.json().catch(() => ({}));

    return new Map(Object.entries(dados));

}

export async function excluirProdutoDefinitivamente(codigo, motivo) {

    if (!PROXY_URL) {
        throw new Error("Hospedagem de imagens não configurada (falta VITE_IMAGENS_PROXY_URL no .env).");
    }

    const resposta = await fetch(`${PROXY_URL}/excluidos`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "X-Imagens-Key": PROXY_KEY || ""
        },

        body: JSON.stringify({ codigo: String(codigo), motivo: motivo || "" })

    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao excluir produto (HTTP ${resposta.status})`);
    }

    return dados;

}

/** Desfaz uma exclusão - o produto volta a aparecer na próxima importação. */
export async function restaurarProdutoExcluido(codigo) {

    if (!PROXY_URL) {
        throw new Error("Hospedagem de imagens não configurada (falta VITE_IMAGENS_PROXY_URL no .env).");
    }

    const resposta = await fetch(`${PROXY_URL}/excluidos/${encodeURIComponent(String(codigo))}`, {

        method: "DELETE",

        headers: { "X-Imagens-Key": PROXY_KEY || "" }

    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao restaurar produto (HTTP ${resposta.status})`);
    }

    return dados;

}
