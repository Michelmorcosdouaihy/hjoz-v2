import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function RestaurantPage() {
  const router = useRouter();
  const { slug } = router.query;

  const today = new Date().toISOString().slice(0,10);
  const [date, setDate] = useState(today);
  const [party, setParty] = useState(2);
  const [times, setTimes] = useState([]);
  const [restName, setRestName] = useState("");

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const r = await fetch(`/api/r/${slug}/availability?date=${date}&party=${party}`, { cache: "no-store" });
      const data = await r.json();
      setTimes(data.times || []);
      setRestName(data.restaurant_name || (slug || "").replace(/-/g, " "));
    })();
  }, [slug, date, party]);

  return (
    <div style={{maxWidth: 880, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Arial"}}>
      <h1 style={{margin: "0 0 6px"}}>{restName} — availability</h1>
      <p style={{color:"#555", margin: 0}}>Pick a date & party size, then choose a time.</p>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 12, marginTop: 16}}>
        <div>
          <label style={{fontSize:14, fontWeight:600, display:"block", marginBottom:6}}>Date</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inputStyle}/>
        </div>
        <div>
          <label style={{fontSize:14, fontWeight:600, display:"block", marginBottom:6}}>Party size</label>
          <input type="number" min="1" max="20" value={party} onChange={e=>setParty(Number(e.target.value || 1))} style={inputStyle}/>
        </div>
      </div>

      <div style={{display:"flex", flexWrap:"wrap", gap: 8, marginTop: 16}}>
        {times.map(t => (
          <button key={t.time}
            disabled={!t.available}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #eee",
              background:"#fff",
              cursor: t.available ? "pointer" : "not-allowed",
              opacity: t.available ? 1 : 0.5
            }}
            onClick={() => alert(`Booking flow for ${t.time} comes next`)}
          >
            {t.time}
          </button>
        ))}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: 12,
  border: "1px solid #eee",
  fontSize: 15
};
