import { salvarImagemHospedada } from "./imagemHostingService";

export async function salvarImagem(produto, imagem, origem) {

    try {

        const resultado = await salvarImagemHospedada(produto.ean, imagem, origem);

        return {
            sucesso: true,
            baixado: true,
            caminho: resultado.url,
            mensagem: "Imagem baixada e hospedada!"
        };

    } catch (erro) {

        return {
            sucesso: false,
            baixado: false,
            caminho: "",
            mensagem: erro.message || "Erro ao salvar imagem."
        };

    }

}
