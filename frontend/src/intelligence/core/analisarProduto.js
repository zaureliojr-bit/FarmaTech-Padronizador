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
 * 8.1.1 - Refinamento da Inteligência
 * =====================================================
 */

import { criarProdutoInteligente } from "../models/produtoInteligente";

import {
    limparDescricao,
    gerarDescricaoPesquisa,
    refinarDescricaoPesquisa,
    gerarDescricaoSite
} from "../normalizers";

import {
    extrairMarca,
    extrairQuantidade,
    extrairPeso,
    extrairVolume,
    extrairApresentacao,
    extrairCategoria,
    extrairLinha,
    extrairControleEspecial
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
    // Refinamento
    // =====================================================

    produto = refinarDescricaoPesquisa(produto);

    produto = gerarDescricaoSite(produto);

    // =====================================================
    // ETAPA 05
    // Extração
    // =====================================================

    produto = extrairMarca(produto);
    produto = extrairLinha(produto);

    produto = extrairQuantidade(produto);
    produto = extrairPeso(produto);
    produto = extrairVolume(produto);

    produto = extrairApresentacao(produto);
    produto = extrairCategoria(produto);
    produto = extrairControleEspecial(produto);

    // =====================================================
    // ETAPA 06
    // Qualidade
    // =====================================================

    produto = validarProduto(produto);

    produto = calcularScore(produto);

    produto.diagnostico = diagnosticarProduto(produto);

    // =====================================================
    // ETAPA 07
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

        console.log("Código:");
        console.log(produto.codigo);

        console.log("");

        console.log("Descrição Original:");
        console.log(produto.descricaoOriginal);

        console.log("");

        console.log("Descrição Pesquisa:");
        console.log(produto.descricaoPesquisa);

        console.log("");

        console.log("Descrição Refinada:");
        console.log(produto.descricaoPesquisaRefinada);

        console.log("");

        console.log("Descrição Site:");
        console.log(produto.descricaoSite);

        console.log("");

        console.log("Marca:");
        console.log(produto.marca);

        console.log("");

        console.log("Pesquisa de Imagem:");
        console.log(produto.pesquisaImagem);

        console.log("====================================");

    }

    // =====================================================
    // Finalização
    // =====================================================

    return produto;

}