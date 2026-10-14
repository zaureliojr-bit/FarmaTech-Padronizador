// Hospedagem real das imagens (Cloudflare Worker + R2 + D1) - ver
// imagens-proxy/ na raiz do projeto. Diferente da Cosmos/Serper (que só
// acham um link em outro site), aqui a farmácia guarda o arquivo de
// verdade, indexado por EAN: não depende do site de origem continuar
// no ar, e fica acessível de qualquer sessão/computador.
// Remove a barra final, se tiver - "url/" + "/lote" viraria "url//lote",
// que não bate com a rota exata do worker (cai no fallback de servir
// imagem por engano, e some tudo com "Imagem não encontrada.").
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");

// LER imagem continua indo direto ao imagens-proxy: imagem é pública
// por natureza e são milhares por tela, então dar a volta pelo porteiro
// seria lento e caro sem proteger nada.
//
// GRAVAR passa pelo porteiro. Antes, salvar exigia a VITE_IMAGENS_KEY,
// que o Vite embutia no pacote - a chave ficava legível para qualquer
// um que baixasse o JavaScript. Agora vai a senha do painel, e quem
// carimba a chave de verdade é o pedidos-proxy, no servidor.
import { PORTEIRO_URL, cabecalhoPainel, esquecerSenhaPainel } from "./credencialPainel";

// O D1 recusa consulta com mais de 100 parâmetros amarrados (limite da
// plataforma, não do worker) - IN (?1,...,?500) simplesmente falha e a
// paginação existe pra nunca bater nisso. Catálogo real passa fácil de
// 100 EANs, então sempre precisa dividir em páginas.
const EANS_POR_PAGINA = 100;

function dividirEmPaginas(lista, tamanho) {

    const paginas = [];

    for (let i = 0; i < lista.length; i += tamanho) {
        paginas.push(lista.slice(i, i + tamanho));
    }

    return paginas;

}

/**
 * Busca em lote quais EANs já têm imagem hospedada. Usado na
 * importação (reaproveitar imagem de sessão anterior) e na publicação
 * (montar o link definitivo de cada produto).
 */
export async function buscarImagensHospedadas(eans) {

    // Sempre string: o Map de retorno usa as chaves do JSON (sempre
    // string) - comparar um EAN number contra isso nunca bate, mesmo
    // sendo "o mesmo" EAN (bug real que já aconteceu aqui).
    const lista = [...new Set(eans.filter(Boolean).map(String))];

    if (!PROXY_URL || !lista.length) return new Map();

    const paginas = dividirEmPaginas(lista, EANS_POR_PAGINA);

    const resultados = await Promise.all(

        paginas.map(async (pagina) => {

            const resposta = await fetch(`${PROXY_URL}/lote?eans=${encodeURIComponent(pagina.join(","))}`);

            if (!resposta.ok) {
                console.error(`Falha ao buscar imagens hospedadas em lote (HTTP ${resposta.status}).`, await resposta.text().catch(() => ""));
                return {};
            }

            return resposta.json();

        })

    );

    return new Map(resultados.flatMap((dados) => Object.entries(dados)));

}

/** true se o link já aponta pro nosso próprio worker (já migrado/salvo). */
export function ehImagemHospedada(url) {

    return !!PROXY_URL && !!url && url.startsWith(PROXY_URL);

}

/**
 * Manda o worker baixar a imagem escolhida (a partir do link da
 * Cosmos/Serper/manual) e guardar no R2. Devolve a URL definitiva,
 * hospedada pela própria farmácia.
 */
export async function salvarImagemHospedada(ean, urlOrigem, origem) {

    if (!PORTEIRO_URL) {
        throw new Error("Publicação não configurada (falta VITE_PEDIDOS_PROXY_URL no .env).");
    }

    const credencial = cabecalhoPainel();

    if (!credencial) {
        throw new Error("Preciso da senha do painel para salvar a imagem.");
    }

    const resposta = await fetch(`${PORTEIRO_URL}/catalogo/imagem`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            ...credencial
        },

        body: JSON.stringify({ ean: String(ean), url: urlOrigem, origem })

    });

    /* Senha errada ou expirada: esquece a guardada, senão a próxima
       tentativa repete o erro sem nunca perguntar de novo. */
    if (resposta.status === 401) {
        esquecerSenhaPainel();
        throw new Error("Senha do painel incorreta.");
    }

    if (resposta.status === 429) {
        const espera = await resposta.json().catch(() => ({}));
        throw new Error(espera.erro || "Tentativas demais. Espere alguns minutos.");
    }

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao salvar imagem (HTTP ${resposta.status})`);
    }

    return dados;

}

/**
 * Apaga a imagem hospedada de um produto (R2 + D1) - volta pro estado
 * "sem imagem", sem apagar o produto nem nenhum outro dado dele.
 */
export async function excluirImagemHospedada(ean) {

    if (!PORTEIRO_URL) {
        throw new Error("Exclusão de imagem não configurada (falta VITE_PEDIDOS_PROXY_URL no .env).");
    }

    const credencial = cabecalhoPainel();

    if (!credencial) {
        throw new Error("Preciso da senha do painel para excluir a imagem.");
    }

    const resposta = await fetch(
        `${PORTEIRO_URL}/catalogo/imagem/${encodeURIComponent(String(ean))}`, {

        method: "DELETE",

        headers: credencial

    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao excluir imagem (HTTP ${resposta.status})`);
    }

    return dados;

}
