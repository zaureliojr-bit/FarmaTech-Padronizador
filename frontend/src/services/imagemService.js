import { buscarProdutoPorEan } from "./cosmosService";
import { buscarImagensGoogle } from "./googleImageService";
import { obterCache, salvarCache } from "./imagemCache";
import { termoDeBusca } from "./termoBusca";

export async function buscarImagens(produto) {

    const emCache = obterCache(produto.ean);

    if (emCache) return emCache;

    const [cosmos, google] = await Promise.allSettled([
        buscarProdutoPorEan(produto.ean),
        buscarImagensGoogle(produto)
    ]);

    const imagens = [];

    if (cosmos.status === "fulfilled" && cosmos.value?.imagem) {
        imagens.push(cosmos.value.imagem);
    }

    if (google.status === "fulfilled") {

        google.value.forEach((url) => {
            if (!imagens.includes(url)) imagens.push(url);
        });

    }

    const resultado = imagens.length > 0
        ? { origem: "busca", imagens }
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
