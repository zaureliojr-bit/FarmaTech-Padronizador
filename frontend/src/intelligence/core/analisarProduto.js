/**
 * =====================================================
 * FarmaTech Intelligence
 * Analisador de Produtos
 * =====================================================
 *
 * Responsabilidade:
 * Coordenar todo o Pipeline Inteligente do FarmaTech.
 *
 * Sprint:
 * 7.7
 */

import { criarProdutoInteligente } from "../models/produtoInteligente";

import {
    limparDescricao,
    gerarDescricaoPesquisa
} from "../normalizers";

import {
    extrairMarca,
    extrairQuantidade,
    extrairPeso,
    extrairVolume,
    extrairApresentacao,
    extrairCategoria,
    extrairLinha
} from "../extractors";

import {
    validarProduto,
    calcularScore,
    diagnosticarProduto
} from "../quality";

export function analisarProduto(produtoImportado) {

    let produto = criarProdutoInteligente(produtoImportado);

    // =====================================================
    // ETAPA 01
    // Produto Inteligente
    // =====================================================

    // Produto criado

    // =====================================================
    // ETAPA 02
    // Sanitização
    // =====================================================

    produto = limparDescricao(produto);

    // =====================================================
    // ETAPA 03
    // Normalização
    // =====================================================

    produto = gerarDescricaoPesquisa(produto);

    // =====================================================
    // ETAPA 04
    // Extração
    // =====================================================

    produto = extrairMarca(produto);
    produto = extrairQuantidade(produto);
    produto = extrairPeso(produto);
    produto = extrairVolume(produto);
    produto = extrairApresentacao(produto);
    produto = extrairCategoria(produto);
    produto = extrairLinha(produto);

    // =====================================================
    // ETAPA 05
    // Qualidade
    // =====================================================

    produto = validarProduto(produto);

    produto = calcularScore(produto);

    produto.diagnostico = diagnosticarProduto(produto);

    return produto;

}