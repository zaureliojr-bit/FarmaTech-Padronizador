export async function salvarImagem(produto, imagem) {

    // Simula um pequeno tempo de processamento
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
        sucesso: true,
        caminho: imagem,
        mensagem: "Imagem salva com sucesso!"
    };

}