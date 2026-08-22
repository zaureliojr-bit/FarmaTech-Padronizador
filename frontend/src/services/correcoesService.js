// Correções manuais (descrição/classe/categoria) guardadas por EAN no
// mesmo worker/D1 da hospedagem de imagens - ver imagens-proxy/. Sem
// nada específico de loja (preço/estoque/código nunca entram aqui), pra
// que uma correção feita numa loja já sirva pra outra que importar o
// mesmo EAN no futuro.
// Mesma normalização do imagemHostingService.js - sem isso, uma URL com
// barra final vira "//correcoes" e quebra o roteamento do worker.
const PROXY_URL = (import.meta.env.VITE_IMAGENS_PROXY_URL || "").replace(/\/+$/, "");
const PROXY_KEY = import.meta.env.VITE_IMAGENS_KEY;

// Mesmo limite de 100 parâmetros por consulta do D1 - ver imagemHostingService.js.
const EANS_POR_PAGINA = 100;

function dividirEmPaginas(lista, tamanho) {

    const paginas = [];

    for (let i = 0; i < lista.length; i += tamanho) {
        paginas.push(lista.slice(i, i + tamanho));
    }

    return paginas;

}

/**
 * Busca em lote as correções já salvas pra uma lista de EANs. Usado na
 * importação, pra reaplicar descrição/classe/categoria corrigidas
 * manualmente numa sessão anterior (ou em outra loja).
 */
export async function buscarCorrecoes(eans) {

    // Sempre string - mesmo motivo do imagemHostingService: o Map de
    // retorno usa as chaves do JSON (sempre string), e comparar contra
    // um EAN number nunca bate.
    const lista = [...new Set(eans.filter(Boolean).map(String))];

    if (!PROXY_URL || !lista.length) return new Map();

    const paginas = dividirEmPaginas(lista, EANS_POR_PAGINA);

    const resultados = await Promise.all(

        paginas.map(async (pagina) => {

            const resposta = await fetch(`${PROXY_URL}/correcoes?eans=${encodeURIComponent(pagina.join(","))}`);

            if (!resposta.ok) {
                console.error(`Falha ao buscar correções em lote (HTTP ${resposta.status}).`, await resposta.text().catch(() => ""));
                return {};
            }

            return resposta.json();

        })

    );

    return new Map(resultados.flatMap((dados) => Object.entries(dados)));

}

/**
 * Salva a correção de um produto. Só envia os campos passados - os
 * outros dois continuam como estavam salvos (o worker faz merge, não
 * sobrescreve tudo). Falha em silêncio (não interrompe a edição na
 * tabela) - é um "espelhamento" pro futuro, não o dado principal.
 */
export async function salvarCorrecao(ean, correcao) {

    if (!PROXY_URL || !ean) return;

    try {

        await fetch(`${PROXY_URL}/correcoes`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "X-Imagens-Key": PROXY_KEY || ""
            },

            body: JSON.stringify({ ean: String(ean), ...correcao })

        });

    } catch (erro) {

        console.warn("Não consegui salvar a correção compartilhada.", erro);

    }

}
