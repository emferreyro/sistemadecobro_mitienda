export default async function handler(req, res) {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      return res.status(500).json({
        status: "error",
        error: "Missing KV_REST_API_URL or KV_REST_API_TOKEN in env vars",
      });
    }

    // SET health_check = timestamp
    const setResp = await fetch(`${url}/set/health_check/${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const setJson = await setResp.json();

    // GET health_check
    const getResp = await fetch(`${url}/get/health_check`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const getJson = await getResp.json();

    return res.status(200).json({
      status: "ok",
      upstash_set: setJson,
      upstash_get: getJson,
      time: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({
      status: "error",
      error: e.message,
    });
  }
}
