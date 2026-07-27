import "./Pagination.css";

function Pagination({

    paginaAtual,
    totalPaginas,
    mudarPagina

}) {

    if (totalPaginas <= 1) return null;

    return (

        <div className="pagination">

            <button
                disabled={paginaAtual === 1}
                onClick={() => mudarPagina(paginaAtual - 1)}
            >
                ◀
            </button>

            <span>

                Página {paginaAtual} de {totalPaginas}

            </span>

            <button
                disabled={paginaAtual === totalPaginas}
                onClick={() => mudarPagina(paginaAtual + 1)}
            >
                ▶
            </button>

        </div>

    );

}

export default Pagination;