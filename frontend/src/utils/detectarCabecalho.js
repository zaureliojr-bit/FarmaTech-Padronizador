export function encontrarCabecalho(matriz) {

    const palavras = [
        "ean",
        "codigo",
        "código",
        "cod",
        "produto",
        "descrição",
        "descricao",
        "marca",
        "laboratorio",
        "laboratório",
        "fabricante"
    ];

    for (let i = 0; i < matriz.length; i++) {

        const linha = matriz[i];

        if (!linha) continue;

        const texto = linha.join(" ").toLowerCase();

        let encontrados = 0;

        palavras.forEach((palavra) => {

            if (texto.includes(palavra)) {
                encontrados++;
            }

        });

        if (encontrados >= 2) {
            return i;
        }

    }

    return -1;

}