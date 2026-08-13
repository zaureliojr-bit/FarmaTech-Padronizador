import CAMPOS_PADRAO from "./camposPadrao";

export function normalizarProduto(produto) {

    const novo = {

    codigo: "",

    ean: "",

    descricao: "",

    marca: "",

    laboratorio: "",

    categoria: "",

    classe: "",

    precoVenda: 0,

    precoPromocao: 0,

    precoCusto: 0,

    estoque: 0,

    reajuste: "",

    imagem: "",

    statusImagem: "sem",

    // preenchidos pelo módulo da CMED, quando a lista é cruzada
    tarja: "",

    exigeReceita: false,

    substancia: "",

    classeTerapeutica: "",

    tipoProduto: "",

    registroAnvisa: "",

    pmc: "",

    acimaDoPmc: false,

    __aba: produto.__aba || ""

};

    Object.entries(CAMPOS_PADRAO).forEach(([campo, sinonimos]) => {

        Object.keys(produto).forEach((coluna) => {

            const nomeColuna = coluna
                .toLowerCase()
                .trim();

            if (sinonimos.includes(nomeColuna)) {

                novo[campo] = produto[coluna];

            }

        });

    });

    return novo;

}