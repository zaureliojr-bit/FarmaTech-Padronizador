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
 * 8.1
 * =====================================================
 */

export function criarProdutoInteligente(produto = {}) {

    return {

        // =====================================================
        // Dados Originais
        // =====================================================

        codigo: produto.codigo || "",

        ean: produto.ean || "",

        descricaoOriginal: produto.descricao || "",

        classe: produto.classe || "",

        laboratorio: produto.laboratorio || "",

        categoriaOriginal: produto.categoria || "",

        marcaOriginal: produto.marca || "",

        aba: produto.__aba || "",

        // Sobrescrita manual da descrição - vinda do usuário, persiste
        // entre reimportações/reprocessamentos do pipeline (ver
        // gerarDescricaoSite, que a usa no lugar da versão automática).
        descricaoManual: produto.descricaoManual || "",

        // =====================================================
        // Inteligência
        // =====================================================

        descricaoPesquisa: "",
        
        descricaoPesquisaRefinada: "",


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

        // =====================================================
        // Comercial
        // =====================================================

        precoVenda: produto.precoVenda || "",

        precoPromocao: produto.precoPromocao || "",

        precoCusto: produto.precoCusto || "",

        estoque: produto.estoque || "",

        // =====================================================
        // Imagens
        // =====================================================
        // Preserva imagem já resolvida (busca anterior ou
        // reaproveitada do IndexedDB na importação) em vez de
        // descartar a cada passagem pelo pipeline.

        imagem: produto.imagem || "",

        statusImagem: produto.imagem
            ? "salva"
            : (produto.statusImagem || "pendente"),

        // =====================================================
        // Search Builder
        // =====================================================

        pesquisaImagem: null,

        pesquisasAlternativas: [],

        // =====================================================
        // Qualidade
        // =====================================================

        score: 0,

        diagnostico: "",

        erros: [],

        avisos: [],

        // =====================================================
        // Pipeline
        // =====================================================

        pipelineAtual: "Importado",

        historico: [
            {
                etapa: "Produto Inteligente",
                mensagem: "Objeto base criado."
            }
        ],

        // =====================================================
        // Versão do Modelo
        // =====================================================

        versaoModelo: "8.1",

        // =====================================================
        // Metadados
        // =====================================================

        criadoEm: new Date(),

        atualizadoEm: new Date()

    };

}