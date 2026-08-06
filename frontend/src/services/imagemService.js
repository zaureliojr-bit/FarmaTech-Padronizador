import { buscarProdutoPorEan } from "./cosmosService";
import { obterCache, salvarCache } from "./imagemCache";
import { termoDeBusca } from "./termoBusca";

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

function montarLinkBuscaGoogle(produto) {

    const termo = termoDeBusca(produto);

    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(termo)}`;

}
