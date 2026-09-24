// Cascata de busca de descrição por EAN, compartilhada entre a busca
// individual (ProductTable) e a busca em lote (BuscaLoteDescricoesBox):
// descrição da distribuidora (local, sem rede, se a lista já estiver
// carregada) -> Cosmos (catálogo de varejo em geral, pode estourar
// cota diária) -> Open Beauty/Food Facts (aberta, sem cota apertada) ->
// nome comercial da CMED (produtoCmed, só existe se for medicamento).
import { buscarProdutoPorEan } from "./cosmosService";
import { buscarDescricaoOpenFacts } from "./openFactsService";

// Mesma formatação que a descrição gerada automaticamente já usa
// (refinarDescricaoPesquisa.js) - sem isso, fonte que guarda tudo em
// maiúsculo (a planilha da distribuidora é assim) sugeria a descrição
// inteira em caixa alta, destoando do resto do catálogo.
function primeiraLetraMaiuscula(texto) {

    return texto
        .toLowerCase()
        .replace(/\b\w/g, (letra) => letra.toUpperCase());

}

export async function buscarDescricaoProduto(produto) {

    if (!produto.ean) return "";

    let sugestao = produto.descricaoDistribuidor?.trim() || "";

    if (!sugestao) {

        try {

            const cosmos = await buscarProdutoPorEan(produto.ean);
            sugestao = cosmos?.descricao?.trim() || "";

        } catch (erroCosmos) {

            // Cota estourada ou indisponível - não trava a busca, as
            // próximas fontes ainda podem achar algo.
            console.warn("Cosmos indisponível na busca de descrição, tentando outras fontes.", erroCosmos);

        }

    }

    if (!sugestao) sugestao = await buscarDescricaoOpenFacts(produto.ean);

    if (!sugestao) sugestao = produto.produtoCmed?.trim() || "";

    return sugestao ? primeiraLetraMaiuscula(sugestao) : "";

}
