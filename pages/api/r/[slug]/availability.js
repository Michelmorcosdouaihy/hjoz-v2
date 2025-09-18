export default async function handler(req, res) {
  const { slug } = req.query;
  const { date = new Date().toISOString().slice(0,10), party = '2' } = req.query;

  // For now, just return dummy times
  const all = ['18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30','22:00'];
  const times = all.map(t => ({ time: t, available: true }));

  res.status(200).json({
    restaurant: slug,
    date,
    party: Number(party),
    times
  });
}
