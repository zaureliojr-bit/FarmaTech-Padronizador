// Converte um link blob: (só existe durante a sessão atual do
// navegador) em data: URI, que funciona em qualquer lugar - inclusive
// depois de fechar o navegador ou abrir o JSON exportado noutra máquina.
async function blobUrlParaDataUri(blobUrl) {

    const resposta = await fetch(blobUrl);
    const blob = await resposta.blob();

    return new Promise((resolve, reject) => {

        const leitor = new FileReader();

        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = reject;

        leitor.readAsDataURL(blob);

    });

}

export async function exportarJSON(produtos) {

    const produtosExport = await Promise.all(

        produtos.map(async (produto) => {

            if (!produto.imagem?.startsWith("blob:")) return produto;

            try {

                const dataUri = await blobUrlParaDataUri(produto.imagem);

                return { ...produto, imagem: dataUri };

            } catch {

                // Link blob: expirado (sessão antiga) - exporta sem
                // imagem em vez de gravar um link já quebrado.
                return { ...produto, imagem: "", statusImagem: "sem" };

            }

        })

    );

    const dados = {
        versao: "1.0",
        geradoEm: new Date().toISOString(),
        totalProdutos: produtosExport.length,
        produtos: produtosExport
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
