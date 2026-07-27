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
    atualizarProduto
}) {

    async function salvar() {

        if (!imagemSelecionada) {
            alert("Selecione uma imagem.");
            return;
        }

        const resultado = await salvarImagem(
            produto,
            imagemSelecionada
        );

        if (!resultado.sucesso) {
            alert("Erro ao salvar imagem.");
            return;
        }

        atualizarProduto({

            ...produto,

            imagem: resultado.caminho,

            statusImagem: "salva"

        });

        alert(resultado.mensagem);

        fechar();

    }

    if (!aberto) return null;

    return (

        <div className="modal-overlay">

            <div className="modal">

                <h2>Buscar imagem</h2>

                <p>
                    <strong>Produto:</strong> {produto?.descricao}
                </p>

                {loading ? (

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
                                onClick={() =>
                                    setImagemSelecionada(imagem)
                                }
                            />

                        ))}

                    </div>

                )}

                <div className="acoes">

                    <button
                        disabled={!imagemSelecionada}
                        onClick={salvar}
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