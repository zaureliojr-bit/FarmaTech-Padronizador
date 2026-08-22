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

    // EAN e código são chave de identidade do produto (usados como chave
    // de Map/objeto em vários lugares: hospedagem de imagem, correções,
    // CMED) - se a coluna do Excel estiver formatada como número, o XLSX
    // devolve um Number aqui, não string. "7896111901984" (texto) e
    // 7896111901984 (número) são o "mesmo" EAN pra gente, mas Map.get()
    // exige tipo idêntico, então a comparação falhava sem isto - a busca
    // por HTTP funcionava (a URL vira texto de qualquer jeito), mas a
    // resposta nunca era encontrada de volta no Map local. Pior: EAN com
    // zero à esquerda formatado como número perde o zero pra sempre.
    novo.ean = String(novo.ean ?? "").trim();
    novo.codigo = String(novo.codigo ?? "").trim();

    return novo;

}