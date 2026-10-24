/**
 * =====================================================
 * DrogaLink Intelligence
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

import { expandirAbreviacoes } from "../dictionary";
import { primeiraLetraMaiuscula } from "../../utils/texto";

export function refinarDescricaoPesquisa(produto) {

    let descricao = produto.descricaoPesquisa;

    // =====================================================
    // Expandir abreviações
    // =====================================================
    // A regra mora no dicionário porque deixou de ser uma
    // troca de palavra: FR pode ser frasco ou fralda, SOL
    // pode ser solução ou protetor solar, e quem decide é o
    // resto da descrição. Ver o cabeçalho do abreviacoes.js.

    descricao = expandirAbreviacoes(descricao);

    // =====================================================
    // Remover espaços duplicados
    // =====================================================

    descricao = descricao
        .replace(/\s+/g, " ")
        .trim();

    // =====================================================
    // Capitalizar palavras
    // =====================================================

    descricao = primeiraLetraMaiuscula(descricao);

    // =====================================================
    // Resultado
    // =====================================================

    produto.descricaoPesquisaRefinada = descricao;

    return produto;

}