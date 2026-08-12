import { useState, useEffect } from "react";
import "./Pagination.css";

function Pagination({

    paginaAtual,
    totalPaginas,
    mudarPagina,
    totalItens,
    itensPorPagina = 50

}) {

    const [campoPagina, setCampoPagina] = useState(String(paginaAtual));

    useEffect(() => {

        setCampoPagina(String(paginaAtual));

    }, [paginaAtual]);

    if (totalPaginas <= 1) return null;

    function irParaPagina(valor) {

        const pagina = Math.min(Math.max(1, valor), totalPaginas);

        mudarPagina(pagina);

    }

    function confirmarCampoPagina() {

        const valor = parseInt(campoPagina, 10);

        if (!isNaN(valor)) {
            irParaPagina(valor);
        } else {
            setCampoPagina(String(paginaAtual));
        }

    }

    const inicio = (paginaAtual - 1) * itensPorPagina + 1;
    const fim = Math.min(paginaAtual * itensPorPagina, totalItens ?? Infinity);

    return (

        <div className="pagination">

            {

                Number.isFinite(fim) && (

                    <span className="pagination-intervalo">

                        Mostrando {inicio.toLocaleString("pt-BR")}–{fim.toLocaleString("pt-BR")}
                        {totalItens != null && ` de ${totalItens.toLocaleString("pt-BR")}`}

                    </span>

                )

            }

            <div className="pagination-controles">

                <button
                    className="pagination-btn"
                    disabled={paginaAtual === 1}
                    onClick={() => irParaPagina(1)}
                    title="Primeira página"
                >
                    «
                </button>

                <button
                    className="pagination-btn"
                    disabled={paginaAtual === 1}
                    onClick={() => irParaPagina(paginaAtual - 1)}
                    title="Página anterior"
                >
                    ‹
                </button>

                <span className="pagination-jump">

                    Página

                    <input
                        type="text"
                        inputMode="numeric"
                        value={campoPagina}
                        onChange={(e) => setCampoPagina(e.target.value.replace(/\D/g, ""))}
                        onBlur={confirmarCampoPagina}
                        onKeyDown={(e) => e.key === "Enter" && confirmarCampoPagina()}
                    />

                    de {totalPaginas}

                </span>

                <button
                    className="pagination-btn"
                    disabled={paginaAtual === totalPaginas}
                    onClick={() => irParaPagina(paginaAtual + 1)}
                    title="Próxima página"
                >
                    ›
                </button>

                <button
                    className="pagination-btn"
                    disabled={paginaAtual === totalPaginas}
                    onClick={() => irParaPagina(totalPaginas)}
                    title="Última página"
                >
                    »
                </button>

            </div>

        </div>

    );

}

export default Pagination;
