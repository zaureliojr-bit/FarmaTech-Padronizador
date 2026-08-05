/**
 * =====================================================
 * FarmaTech Intelligence
 * Refinador de Descrição de Pesquisa
 * =====================================================
 *
 * Responsabilidade:
 * Transformar uma descrição padronizada em uma descrição
 * mais natural para pesquisas inteligentes.
 *
 * Esta etapa melhora a leitura sem alterar o significado
 * do produto.
 *
 * Sprint:
 * 8.1.1
 * =====================================================
 */

import { ABREVIACOES } from "../dictionary";

export function refinarDescricaoPesquisa(produto) {

    let descricao = produto.descricaoPesquisa;

    // =====================================================
    // Expandir abreviações (somente como palavra isolada)
    // =====================================================

    for (const [sigla, expandida] of Object.entries(ABREVIACOES)) {

        const regex = new RegExp(`\\b${sigla}\\b`, "g");

        descricao = descricao.replace(regex, expandida);

    }

    // =====================================================
    // Remover espaços duplicados
    // =====================================================

    descricao = descricao
        .replace(/\s+/g, " ")
        .trim();

    // =====================================================
    // Capitalizar palavras
    // =====================================================

    descricao = descricao
        .toLowerCase()
        .replace(/\b\w/g, letra => letra.toUpperCase());

    // =====================================================
    // Resultado
    // =====================================================

    produto.descricaoPesquisaRefinada = descricao;

    return produto;

}