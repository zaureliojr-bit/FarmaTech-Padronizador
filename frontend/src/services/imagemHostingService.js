// Hospedagem real das imagens (Cloudflare Worker + R2 + D1) - ver
// imagens-proxy/ na raiz do projeto. Diferente da Cosmos/Serper (que só
// acham um link em outro site), aqui a farmácia guarda o arquivo de
// verdade, indexado por EAN: não depende do site de origem continuar
// no ar, e fica acessível de qualquer sessão/computador.
const PROXY_URL = import.meta.env.VITE_IMAGENS_PROXY_URL;
const PROXY_KEY = import.meta.env.VITE_IMAGENS_KEY;

// O worker limita a 500 EANs por chamada (proteção contra lote gigante
// acidental) - um catálogo real passa disso fácil, então quem pede em
// lote maior precisa dividir em páginas.
const EANS_POR_PAGINA = 500;

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

            if (!resposta.ok) return {};

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

    if (!PROXY_URL) {
        throw new Error("Hospedagem de imagens não configurada (falta VITE_IMAGENS_PROXY_URL no .env).");
    }

    const resposta = await fetch(PROXY_URL, {

        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "X-Imagens-Key": PROXY_KEY || ""
        },

        body: JSON.stringify({ ean: String(ean), url: urlOrigem, origem })

    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(dados.erro || `Falha ao salvar imagem (HTTP ${resposta.status})`);
    }

    return dados;

}
