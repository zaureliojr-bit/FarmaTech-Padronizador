/**
 * =====================================================
 * FarmaTech Intelligence
 * Gerador de Descrição para Site
 * =====================================================
 *
 * Responsabilidade:
 * Montar o nome final padronizado do produto, pronto pra
 * publicação no site/catálogo.
 *
 * Parte da descrição já refinada (abreviações expandidas,
 * capitalizada) e só ajusta a leitura entre embalagem e
 * quantidade - ex: "Caixa 30 Comprimidos" vira
 * "Caixa com 30 Comprimidos".
 * =====================================================
 */

const EMBALAGENS_COM_QUANTIDADE = [
    "Caixa",
    "Frasco",
    "Tubo",
    "Pote",
    "Envelope",
    "Kit",
    "Cartela",
    "Blister",
    "Ampola",
    "Bisnaga",
    "Sachê"
];

const REGEX_EMBALAGEM_QUANTIDADE = new RegExp(
    `\\b(${EMBALAGENS_COM_QUANTIDADE.join("|")})\\s+(\\d)`,
    "i"
);

export function gerarDescricaoSite(produto) {

    let descricao =
        produto.descricaoPesquisaRefinada ||
        produto.descricaoOriginal;

    descricao = descricao.replace(REGEX_EMBALAGEM_QUANTIDADE, "$1 com $2");

    produto.descricaoSite = descricao;

    return produto;

}
