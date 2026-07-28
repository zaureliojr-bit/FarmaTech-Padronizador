export function exportarJSON(produtos) {

    const dados = {
        versao: "1.0",
        geradoEm: new Date().toISOString(),
        totalProdutos: produtos.length,
        produtos
    };

    const json = JSON.stringify(dados, null, 4);

    const blob = new Blob(
        [json],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "produtos.json";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);

}