import { buscarProdutoPorEan } from "./cosmosService";
import { buscarImagensPorTexto } from "./serperService";
import { obterCache, salvarCache } from "./imagemCache";

// Ordem das fontes: Cosmos busca pelo EAN (mais preciso, cota diária
// pequena) primeiro; Serper busca por texto (marca + descrição, cota
// maior mas em créditos únicos) quando a Cosmos não encontra ou falha;
// manual é o último recurso, sem custo nenhum.
const ORIGENS_CONFIAVEIS = ["cosmos", "serper"];

export async function buscarImagens(produto) {

    const emCache = obterCache(produto.ean);

    // Ignora cache antigo de modo manual (pode ter um link
    // desatualizado de antes de alguma mudança na lógica de busca).
    if (ORIGENS_CONFIAVEIS.includes(emCache?.origem)) return emCache;

    try {

        const cosmos = await buscarProdutoPorEan(produto.ean);

        if (cosmos?.imagem) {

            const resultado = { origem: "cosmos", imagens: [cosmos.imagem] };

            salvarCache(produto.ean, resultado);

            return resultado;

        }

    } catch (erro) {

        console.warn("Cosmos indisponível, tentando a próxima fonte.", erro);

    }

    try {

        const texto = produto.pesquisaImagem?.principal || produto.descricaoSite || produto.descricaoOriginal;

        const imagens = await buscarImagensPorTexto(texto);

        if (imagens.length) {

            const resultado = { origem: "serper", imagens };

            salvarCache(produto.ean, resultado);

            return resultado;

        }

    } catch (erro) {

        console.warn("Serper indisponível, caindo para busca manual.", erro);

    }

    // Modo manual não chama nenhuma API - não custa nada recalcular
    // toda vez, então não cacheamos (evita link salvo desatualizado
    // se a lógica de busca mudar depois).
    return {
        origem: "manual",
        imagens: [],
        linkBusca: montarLinkBuscaGoogle(produto)
    };

}

// Busca pelo código de barras (EAN) em vez da descrição do produto -
// reduz a chance de trazer imagem de um produto parecido mas errado.
function montarLinkBuscaGoogle(produto) {

    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(produto.ean)}`;

}
