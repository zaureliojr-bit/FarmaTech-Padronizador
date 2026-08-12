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
 *
 * Se o produto tiver uma descrição editada manualmente
 * (produto.descricaoManual), ela prevalece sobre a gerada
 * automaticamente - mas a versão automática continua sendo
 * calculada e guardada em descricaoSiteAuto, pra dar pra
 * comparar/reverter na interface.
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

    produto.descricaoSiteAuto = descricao;

    produto.descricaoSite = produto.descricaoManual || descricao;

    return produto;

}
