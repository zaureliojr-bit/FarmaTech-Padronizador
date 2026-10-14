// Correções de categoria -> família (mesmo worker/D1 da hospedagem de
// imagens - ver imagens-proxy/). Existem pra não precisar mexer no
// dicionário fixo (familias.js) e esperar um deploy toda vez que uma
// planilha traz uma categoria nova que o site ainda não reconhece.
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");

// Ler é direto (público). Gravar passa pelo PORTEIRO com a senha do
// painel: a VITE_IMAGENS_KEY que ficava aqui ia embutida no pacote pelo
// Vite e era legível por qualquer um que baixasse o JavaScript.
import { PORTEIRO_URL, cabecalhoPainel } from "./credencialPainel";

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

    if (!PORTEIRO_URL) {
        throw new Error("Correção de família não configurada (falta VITE_PEDIDOS_PROXY_URL no .env).");
    }

    const credencial = cabecalhoPainel();

    if (!credencial) {
        throw new Error("Preciso da senha do painel para salvar a família.");
    }

    const resposta = await fetch(`${PORTEIRO_URL}/catalogo/familia`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            ...credencial
        },

        body: JSON.stringify({ categoria, familiaId })

    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao salvar correção de família (HTTP ${resposta.status})`);
    }

    return dados;

}
