import { supabase } from "../../../../lib/supabase";

/** helper: parse "HH:MM" into minutes */
function hmToMin(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
function minToHM(m) {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${mm}`;
}
/** overlap check inclusive of buffers */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export default async function handler(req, res) {
  try {
    const { slug } = req.query;
    let { date, party } = req.query;
    if (!slug) return res.status(400).json({ error: "missing slug" });

    // Defaults
    date = date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    party = Number(party || 2);

    // 1) Load restaurant
    const { data: restRows, error: restErr } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .limit(1);
    if (restErr) throw restErr;
    const restaurant = restRows?.[0];
    if (!restaurant) return res.status(404).json({ error: "restaurant not found" });

    const slotMin = restaurant.slot_minutes || 90;
    const bufferMin = restaurant.buffer_minutes || 15;

    // 2) Generate time grid for that date from open_rules
    const day = new Date(date + "T00:00:00");
    const dow = day.getDay(); // 0..6
    const rules = restaurant.open_rules || [];
    // Find a rule whose dow includes this day
    const openRule =
      rules.find(r => Array.isArray(r.dow) ? r.dow.includes(dow) : true) ||
      { start: "19:00", end: "23:00" };

    const startMin = hmToMin(openRule.start || "19:00");
    const endMin = hmToMin(openRule.end || "23:00");

    const candidates = [];
    for (let t = startMin; t + slotMin <= endMin; t += 30) { // 30-min step
      candidates.push(t);
    }

    // 3) Load active tables
    const { data: tables, error: tabErr } = await supabase
      .from("tables")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true);
    if (tabErr) throw tabErr;

    // 4) Load reservations for that date (+ buffers)
    // naive window: whole day
    const dayStartISO = new Date(date + "T00:00:00Z").toISOString();
    const dayEndISO = new Date(date + "T23:59:59Z").toISOString();
    const { data: resos, error: resErr } = await supabase
      .from("reservations")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .in("status", ["confirmed", "hold"])
      .gte("start_at", dayStartISO)
      .lte("end_at", dayEndISO);
    if (resErr) throw resErr;

    // 5) Build quick lookup of table busy windows
    // store as minutes since midnight in local; we assume times were stored as UTC aligned strings.
    function isoToMin(iso) {
      const d = new Date(iso);
      return d.getUTCHours() * 60 + d.getUTCMinutes(); // simple; fine for MVP
    }

    const busy = {}; // tableId -> [{s,e}]
    for (const r of resos) {
      // add buffer to the reservation window
      const s = isoToMin(r.start_at) - bufferMin;
      const e = isoToMin(r.end_at) + bufferMin;
      for (const tid of r.table_ids) {
        busy[tid] = busy[tid] || [];
        busy[tid].push({ s, e });
      }
    }

    // 6) allocation helper (First-Fit Decreasing within join groups)
    function allocateTables(partySize, freeTables) {
      // try single table
      const single = freeTables.filter(t => t.capacity >= partySize).sort((a,b)=>a.capacity-b.capacity)[0];
      if (single) return [single.id];

      // try join groups
      const groups = new Map();
      for (const t of freeTables) {
        const k = t.join_key || `solo-${t.id}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(t);
      }
      let best = null;
      for (const [, list] of groups) {
        const sorted = [...list].sort((a,b)=>b.capacity-a.capacity);
        const pick = [];
        let sum = 0;
        for (const t of sorted) {
          if (sum >= partySize) break;
          pick.push(t);
          sum += t.capacity;
        }
        if (sum >= partySize) {
          const leftover = sum - partySize;
          if (!best || leftover < best.leftover || (leftover === best.leftover && pick.length < best.ids.length)) {
            best = { ids: pick.map(p=>p.id), leftover };
          }
        }
      }
      return best ? best.ids : null;
    }

    // 7) For each candidate time, see if enough tables are free
    const times = [];
    for (const startM of candidates) {
      const endM = startM + slotMin;
      // check each table if it's free in this window
      const free = tables.filter(t => {
        const blocks = busy[t.id] || [];
        // convert candidate window to "minutes since midnight UTC" rough
        const s = startM; const e = endM; // same scale as isoToMin above (rough MVP)
        return !blocks.some(b => overlaps(s, e, b.s, b.e));
      });

      const alloc = allocateTables(party, free);
      times.push({ time: minToHM(startM), available: !!alloc });
    }

    return res.status(200).json({
      restaurant: restaurant.slug,
      restaurant_name: restaurant.name,
      date,
      party,
      slot_minutes: slotMin,
      times
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", detail: String(e.message || e) });
  }
}
