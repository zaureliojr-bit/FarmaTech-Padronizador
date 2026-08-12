/**
 * =====================================================
 * FarmaTech Intelligence
 * Extrator de Categoria
 * =====================================================
 *
 * Mantém a categoria bruta do FarmaxPDV intacta em produto.categoria
 * (é ela que vai pro site, onde o próprio script.js agrupa por
 * família) - mas já calcula aqui produto.familia/familiaNome, pra
 * avisar o farmacêutico ANTES de publicar quando uma categoria não
 * bate com nenhuma família conhecida (cairia em "Outros" no site).
 */

import { familiaDe } from "../dictionary";

export function extrairCategoria(produto) {

    if (produto.categoriaOriginal) {

        produto.categoria =
            produto.categoriaOriginal;

    }

    const familia = familiaDe(produto.categoria);

    produto.familia = familia.id;
    produto.familiaNome = familia.nome;

    return produto;

}