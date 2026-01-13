import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    await redis.set("cobra:test", "ok");
    const value = await redis.get("cobra:test");

    res.status(200).json({
      status: "ok",
      redis: value,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
}
