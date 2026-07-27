import "./Card.css";

function Card({ title, value, color, icon }) {
  return (
    <div className="card">
      <div className="card-icon" style={{ background: color }}>
        {icon}
      </div>

      <div className="card-info">
        <span>{title}</span>
        <h2>{value}</h2>
      </div>
    </div>
  );
}

export default Card;