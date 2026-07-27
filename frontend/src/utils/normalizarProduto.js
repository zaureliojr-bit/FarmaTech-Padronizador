import CAMPOS_PADRAO from "./camposPadrao";

export function normalizarProduto(produto) {

    const novo = {

        ean: "",
        descricao: "",
        marca: "",
        laboratorio: "",
        categoria: "",
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