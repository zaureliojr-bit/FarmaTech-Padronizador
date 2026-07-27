import "./SearchBar.css";

function SearchBar({ valor, onChange }) {

    return (

        <div className="search-bar">

            <input
                type="text"
                placeholder="Pesquisar por EAN, descrição, marca ou laboratório..."
                value={valor}
                onChange={(e) => onChange(e.target.value)}
            />

        </div>

    );

}

export default SearchBar;