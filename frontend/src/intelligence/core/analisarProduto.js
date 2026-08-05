/**
 * =====================================================
 * FarmaTech Intelligence
 * Pipeline Inteligente
 * =====================================================
 *
 * Responsabilidade:
 * Coordenar todas as etapas da Inteligência do FarmaTech.
 *
 * Nenhuma regra de negócio deve ficar neste arquivo.
 * Cada etapa delega sua responsabilidade para um módulo
 * especializado.
 *
 * Sprint:
 * 8.1 - Search Builder
 * =====================================================
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

import {
    montarPesquisaImagem
} from "../search";

const DEBUG = true;

export function analisarProduto(produtoImportado) {

    // =====================================================
    // ETAPA 01
    // Produto Inteligente
    // =====================================================

    let produto = criarProdutoInteligente(produtoImportado);

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
    produto = extrairLinha(produto);

    produto = extrairQuantidade(produto);
    produto = extrairPeso(produto);
    produto = extrairVolume(produto);

    produto = extrairApresentacao(produto);
    produto = extrairCategoria(produto);

    // =====================================================
    // ETAPA 05
    // Qualidade
    // =====================================================

    produto = validarProduto(produto);

    produto = calcularScore(produto);

    produto.diagnostico = diagnosticarProduto(produto);

    // =====================================================
    // ETAPA 06
    // Search Builder
    // =====================================================

    produto.pesquisaImagem = montarPesquisaImagem(produto);

    // =====================================================
    // DEBUG
    // =====================================================

    if (DEBUG && produto.codigo === "001496") {

        console.log("====================================");
        console.log("FarmaTech Intelligence");
        console.log("====================================");

        console.log("Produto Inteligente:");
        console.log(produto);

        console.log("Pesquisa de Imagem:");
        console.log(produto.pesquisaImagem);

    }

    // =====================================================
    // Finalização
    // =====================================================

    return produto;

}