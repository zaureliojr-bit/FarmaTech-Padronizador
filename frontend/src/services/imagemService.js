import { buscarProdutoPorEan } from "./cosmosService";
import { obterCache, salvarCache } from "./imagemCache";

export async function buscarImagens(produto) {

    const emCache = obterCache(produto.ean);

    // Ignora cache antigo de modo manual (pode ter um link
    // desatualizado de antes de alguma mudança na lógica de busca).
    if (emCache?.origem === "cosmos") return emCache;

    let imagem = null;

    try {

        const cosmos = await buscarProdutoPorEan(produto.ean);

        if (cosmos?.imagem) imagem = cosmos.imagem;

    } catch (erro) {

        console.warn("Cosmos indisponível, caindo para busca manual.", erro);

    }

    // Modo manual não chama nenhuma API - não custa nada recalcular
    // toda vez, então não cacheamos (evita link salvo desatualizado
    // se a lógica de busca mudar depois).
    if (!imagem) {

        return {
            origem: "manual",
            imagens: [],
            linkBusca: montarLinkBuscaGoogle(produto)
        };

    }

    const resultado = { origem: "cosmos", imagens: [imagem] };

    salvarCache(produto.ean, resultado);

    return resultado;

}

// Busca pelo código de barras (EAN) em vez da descrição do produto -
// reduz a chance de trazer imagem de um produto parecido mas errado.
function montarLinkBuscaGoogle(produto) {

    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(produto.ean)}`;

}
