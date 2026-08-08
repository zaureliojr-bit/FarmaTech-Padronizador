import { buscarProdutoPorEan } from "./cosmosService";
import { obterCache, salvarCache } from "./imagemCache";

export async function buscarImagens(produto) {

    const emCache = obterCache(produto.ean);

    if (emCache) return emCache;

    let imagem = null;

    try {

        const cosmos = await buscarProdutoPorEan(produto.ean);

        if (cosmos?.imagem) imagem = cosmos.imagem;

    } catch (erro) {

        console.warn("Cosmos indisponível, caindo para busca manual.", erro);

    }

    const resultado = imagem
        ? { origem: "cosmos", imagens: [imagem] }
        : {
            origem: "manual",
            imagens: [],
            linkBusca: montarLinkBuscaGoogle(produto)
        };

    salvarCache(produto.ean, resultado);

    return resultado;

}

// Busca pelo código de barras (EAN) em vez da descrição do produto -
// reduz a chance de trazer imagem de um produto parecido mas errado.
function montarLinkBuscaGoogle(produto) {

    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(produto.ean)}`;

}
