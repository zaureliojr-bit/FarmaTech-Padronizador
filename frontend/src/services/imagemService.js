import { buscarProdutoPorEan } from "./cosmosService";
import { buscarImagensPorTexto } from "./serperService";
import { obterCache, salvarCache } from "./imagemCache";

// Ordem das fontes: distribuidora primeiro, se a lista trouxer uma URL
// pronta (sem rede nenhuma, sem cota); Cosmos busca pelo EAN (mais
// preciso, cota diária pequena) em seguida; Serper busca por texto
// (marca + descrição, cota maior mas em créditos únicos) quando nenhuma
// das duas acha ou falha; manual é o último recurso, sem custo nenhum.
const ORIGENS_CONFIAVEIS = ["distribuidora", "cosmos", "serper"];

export async function buscarImagens(produto) {

    const emCache = obterCache(produto.ean);

    // Ignora cache antigo de modo manual (pode ter um link
    // desatualizado de antes de alguma mudança na lógica de busca).
    if (ORIGENS_CONFIAVEIS.includes(emCache?.origem)) return emCache;

    if (produto.imagemDistribuidor) {

        const resultado = { origem: "distribuidora", imagens: [produto.imagemDistribuidor] };

        salvarCache(produto.ean, resultado);

        return resultado;

    }

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

        // A Serper cobra crédito por busca, não por imagem devolvida -
        // então busca por EAN e só recorre à descrição (2º crédito) se a
        // primeira não achou nada, em vez de gastar as duas sempre.
        const porEan = await buscarImagensPorTexto(produto.ean);

        let imagens = porEan;

        if (!imagens.length) {

            const texto = produto.pesquisaImagem?.principal || produto.descricaoSite || produto.descricaoOriginal;

            imagens = await buscarImagensPorTexto(texto);

        }

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
