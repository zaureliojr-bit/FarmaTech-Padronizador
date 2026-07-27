import "./ImageModal.css";
import { salvarImagem } from "../../services/downloadService";

function ImageModal({
    aberto,
    produto,
    imagens,
    imagemSelecionada,
    setImagemSelecionada,
    loading,
    fechar,
    atualizarProduto,
    mostrarToast
}) {

    if (!aberto) return null;

    async function salvar() {

        if (!imagemSelecionada) {
            mostrarToast("Selecione uma imagem.", "erro");
            return;
        }

        const resultado = await salvarImagem(produto, imagemSelecionada);

        if (!resultado.sucesso) {
            mostrarToast("Erro ao salvar imagem.", "erro");
            return;
        }

        atualizarProduto({
            ...produto,
            imagem: resultado.caminho,
            statusImagem: "salva"
        });

        mostrarToast(resultado.mensagem, "sucesso");

        fechar();
    }

    return (
        <div className="modal-overlay">
            <div className="modal">

                <h2>Buscar imagem</h2>

                <p>
                    <strong>Produto:</strong> {produto?.descricao}
                </p>

                {
                    loading ? (
                        <p>Buscando imagens...</p>
                    ) : (
                        <div className="galeria">
                            {imagens.map((imagem, index) => (
                                <img
                                    key={index}
                                    src={imagem}
                                    alt={`Imagem ${index + 1}`}
                                    className={
                                        imagemSelecionada === imagem
                                            ? "selecionada"
                                            : ""
                                    }
                                    onClick={() => setImagemSelecionada(imagem)}
                                />
                            ))}
                        </div>
                    )
                }

                <div className="acoes">
                    <button
                        onClick={salvar}
                        disabled={!imagemSelecionada}
                    >
                        💾 Salvar imagem
                    </button>

                    <button onClick={fechar}>
                        Fechar
                    </button>
                </div>

            </div>
        </div>
    );
}

export default ImageModal;