import "./DashboardStats.css";

function DashboardStats({ produtos }) {

    const totalProdutos = produtos.length;

    const imagensSalvas = produtos.filter(
        produto => produto.statusImagem === "salva"
    ).length;

    const semImagem = totalProdutos - imagensSalvas;

    const totalLaboratorios = new Set(
        produtos
            .map(produto => produto.laboratorio)
            .filter(Boolean)
    ).size;

    const totalCategorias = new Set(
        produtos
            .map(produto => produto.categoria)
            .filter(Boolean)
    ).size;

    const totalAbas = new Set(
        produtos
            .map(produto => produto.__aba)
            .filter(Boolean)
    ).size;

    const cards = [

        {
            titulo: "Produtos",
            valor: totalProdutos,
            icone: "📦"
        },

        {
            titulo: "Imagens",
            valor: imagensSalvas,
            icone: "🖼️"
        },

        {
            titulo: "Sem imagem",
            valor: semImagem,
            icone: "🚫"
        },

        {
            titulo: "Laboratórios",
            valor: totalLaboratorios,
            icone: "🏭"
        },

        {
            titulo: "Categorias",
            valor: totalCategorias,
            icone: "📂"
        },

        {
            titulo: "Abas",
            valor: totalAbas,
            icone: "📑"
        }

    ];

    return (

        <div className="dashboard-stats">

            {

                cards.map((card) => (

                    <div
                        key={card.titulo}
                        className="dashboard-card"
                    >

                        <span className="dashboard-icon">

                            {card.icone}

                        </span>

                        <span className="dashboard-title">

                            {card.titulo}

                        </span>

                        <strong className="dashboard-value">

                            {card.valor.toLocaleString("pt-BR")}

                        </strong>

                    </div>

                ))

            }

        </div>

    );

}

export default DashboardStats;