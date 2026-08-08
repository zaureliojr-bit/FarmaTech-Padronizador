import { baixarBlob, salvarImagemLocal } from "./imagemDB";

export async function salvarImagem(produto, imagem) {

    const blob = await baixarBlob(imagem);

    if (blob) {

        await salvarImagemLocal(produto.ean, blob, imagem);

        return {
            sucesso: true,
            baixado: true,
            caminho: URL.createObjectURL(blob),
            mensagem: "Imagem baixada e salva localmente!"
        };

    }

    // Não deu pra baixar o arquivo (CORS do site de origem), mas ainda
    // guardamos a referência por EAN pra não perder a escolha ao
    // reimportar a planilha depois.
    await salvarImagemLocal(produto.ean, null, imagem);

    return {
        sucesso: true,
        baixado: false,
        caminho: imagem,
        mensagem: "Site de origem não permite baixar o arquivo (CORS); o link original foi salvo."
    };

}
