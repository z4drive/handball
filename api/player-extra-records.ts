import axios from "axios";
import * as cheerio from "cheerio";

const scrapingHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive'
};

async function searchWeb(query: string, limit = 6): Promise<any[]> {
  const results: any[] = [];
  try {
    const duckUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const duckRes = await axios.get(duckUrl, {
      headers: scrapingHeaders,
      timeout: 7000
    });
    const $d = cheerio.load(duckRes.data);
    $d(".result").each((i, el) => {
      if (results.length < limit) {
        const title = $d(el).find(".result__title").text().trim();
        const snippet = $d(el).find(".result__snippet").text().trim();
        const link = $d(el).find(".result__url").text().trim();
        if (title && snippet) {
          results.push({ title, snippet, link });
        }
      }
    });
  } catch (err) {
    console.warn("searchWeb error for query:", query, err);
  }
  return results;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const name = (req.query.name as string || "").trim();
    const team = (req.query.team as string || "").trim();
    if (!name) return res.status(400).json({ error: "선수명이 필요합니다." });

    const recentQuery = `핸드볼 ${team ? `${team} ` : ""}${name} 최근 경기 실적 대회`;
    const careerQuery = `핸드볼 ${team ? `${team} ` : ""}${name} 역대 기록 수상 대회 이력 대한체육회`;

    const [recentSearchResults, careerSearchResults] = await Promise.all([
      searchWeb(recentQuery, 6),
      searchWeb(careerQuery, 6)
    ]);

    res.json({
      success: true,
      name,
      team,
      recentSearchResults: recentSearchResults.length > 0 ? recentSearchResults : careerSearchResults,
      careerSearchResults: careerSearchResults.length > 0 ? careerSearchResults : recentSearchResults,
      searchResults: recentSearchResults.concat(careerSearchResults).slice(0, 8)
    });
  } catch (error: any) {
    res.status(500).json({ error: "선수 기록 정보를 검색하지 못했습니다." });
  }
}
