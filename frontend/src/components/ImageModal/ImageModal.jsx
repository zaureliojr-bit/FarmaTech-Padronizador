import { useState } from "react";

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
    mostrarToast,
    modoManual,
    linkBusca,
    adicionarImagemManual
}) {

    const [urlManual, setUrlManual] = useState("");
    const [arrastando, setArrastando] = useState(false);

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

        mostrarToast(resultado.mensagem, resultado.baixado ? "sucesso" : "aviso");

        fechar();
    }

    function adicionarUrl() {

        const url = urlManual.trim();

        if (!url) return;

        adicionarImagemManual(url);
        setUrlManual("");

    }

    function aoSoltar(event) {

        event.preventDefault();
        setArrastando(false);

        const urlSolta =
            event.dataTransfer.getData("text/uri-list") ||
            event.dataTransfer.getData("text/plain");

        if (urlSolta) {
            adicionarImagemManual(urlSolta.trim());
            return;
        }

        const arquivo = event.dataTransfer.files?.[0];

        if (arquivo && arquivo.type.startsWith("image/")) {

            const leitor = new FileReader();

            leitor.onload = () => {
                adicionarImagemManual(leitor.result);
            };

            leitor.readAsDataURL(arquivo);

        }

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
                        <>
                            {
                                imagens.length > 0 && (
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

                            <div className="busca-manual">

                                {
                                    modoManual && (
                                        <p className="busca-manual-aviso">
                                            Não encontramos a imagem automaticamente.
                                            Busque manualmente e adicione abaixo.
                                        </p>
                                    )
                                }

                                {
                                    linkBusca && (
                                        <a
                                            href={linkBusca}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn-busca-externa"
                                        >
                                            🔎 Abrir busca de imagens
                                        </a>
                                    )
                                }

                                <div
                                    className={`dropzone ${arrastando ? "arrastando" : ""}`}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setArrastando(true);
                                    }}
                                    onDragLeave={() => setArrastando(false)}
                                    onDrop={aoSoltar}
                                >
                                    Arraste uma imagem aqui
                                </div>

                                <div className="url-manual">
                                    <input
                                        type="text"
                                        placeholder="Cole a URL da imagem"
                                        value={urlManual}
                                        onChange={(event) => setUrlManual(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") adicionarUrl();
                                        }}
                                    />
                                    <button onClick={adicionarUrl}>
                                        Adicionar
                                    </button>
                                </div>

                            </div>
                        </>
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
