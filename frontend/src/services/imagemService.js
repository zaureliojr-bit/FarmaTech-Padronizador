import { buscarProdutoPorEan } from "./cosmosService";

export async function buscarImagens(produto) {

    try {

        const resultado = await buscarProdutoPorEan(produto.ean);

        if (resultado?.imagem) {

            return {
                origem: "cosmos",
                imagens: [resultado.imagem]
            };

        }

    } catch (erro) {

        console.warn("Cosmos indisponível, caindo para busca manual.", erro);

    }

    return {
        origem: "manual",
        imagens: [],
        linkBusca: montarLinkBuscaGoogle(produto)
    };

}

function montarLinkBuscaGoogle(produto) {

    const termo = [produto.marca, produto.descricao]
        .filter(Boolean)
        .join(" ");

    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(termo)}`;

}
