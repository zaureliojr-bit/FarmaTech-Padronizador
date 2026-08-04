/**
 * =====================================================
 * FarmaTech Intelligence
 * Produto Inteligente
 * =====================================================
 *
 * Responsabilidade:
 * Criar o objeto base utilizado por toda a inteligência
 * do FarmaTech.
 *
 * Nenhum módulo altera o produto original.
 * Cada etapa apenas enriquece esse objeto.
 *
 * Sprint:
 * 7.1 - O Despertar da Inteligência
 *
 */

export function criarProdutoInteligente(produto = {}) {

    return {

        // ============================
        // Dados Originais
        // ============================

        codigo: produto.codigo || "",

        ean: produto.ean || "",

        descricaoOriginal: produto.descricao || "",

        laboratorio: produto.laboratorio || "",

        categoriaOriginal: produto.categoria || "",

        marcaOriginal: produto.marca || "",

        aba: produto.__aba || "",

        // ============================
        // Inteligência
        // ============================

        descricaoPesquisa: "",

        descricaoSite: "",

        marca: "",

        categoria: "",

        linha: "",

        tamanho: "",

        quantidade: "",

        peso: "",

        volume: "",

        apresentacao: "",

        palavrasChave: [],

        // ============================
        // Comercial
        // ============================

        precoVenda: produto.precoVenda || "",

        precoPromocao: produto.precoPromocao || "",

        precoCusto: produto.precoCusto || "",

        estoque: produto.estoque || "",

        // ============================
        // Imagens
        // ============================

        imagem: "",

        statusImagem: "pendente",

        // ============================
        // Qualidade
        // ============================

        score: 0,
        
        diagnostico: "",

        erros: [],

        avisos: [],

        // ============================
        // Pipeline
        // ============================

        pipelineAtual: "Importado",

        historico: [
            {
                etapa: "Importação",
                mensagem: "Produto Inteligente criado."
            }
        ],

        // ============================
        // Metadados
        // ============================

        criadoEm: new Date(),

        atualizadoEm: new Date()

    };

}