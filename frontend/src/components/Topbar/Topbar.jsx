import "./Topbar.css";
import { FiBell, FiSearch, FiUser } from "react-icons/fi";

function Topbar() {
  return (
    <header className="topbar">

      <div className="search">

        <FiSearch />

        <input
          type="text"
          placeholder="Pesquisar produto, EAN ou descrição..."
        />

      </div>

      <div className="topbar-right">

        <FiBell className="icon" />

        <div className="user">

          <FiUser />

          <span>Zaurélio</span>

        </div>

      </div>

    </header>
  );
}

export default Topbar;