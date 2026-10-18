import axios from "axios";
import * as cheerio from "cheerio";

const scrapingHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Referer': 'https://khf.handballkorea.com/'
};

async function fetchHtml(targetUrl: string): Promise<string> {
  // 1. Direct fetch with headers
  try {
    const res = await axios.get(targetUrl, {
      headers: scrapingHeaders,
      timeout: 10000
    });
    if (res.data && typeof res.data === 'string' && res.data.includes("table_wrap")) {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Direct fetch failed on Vercel:", err?.message);
  }

  // 2. Proxy fallback 1 (allorigins)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const res = await axios.get(proxyUrl, { timeout: 12000 });
    if (res.data && typeof res.data === 'string') {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Proxy 1 fetch failed:", err?.message);
  }

  // 3. Proxy fallback 2 (corsproxy)
  try {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
    const res = await axios.get(proxyUrl, { timeout: 12000 });
    if (res.data && typeof res.data === 'string') {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Proxy 2 fetch failed:", err?.message);
  }

  throw new Error("데이터를 가져올 수 없습니다.");
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { year, month } = req.query;
    const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=${month}&GROUP_CD=`;
    
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const matches: any[] = [];
    let currentTournament = "";
    let currentDate = "";

    $(".table_wrap table tbody tr").each((_, element) => {
      const tds = $(element).find("td");
      const th = $(element).find("th");

      if (th.length > 0) {
        currentTournament = th.text().trim();
      }

      let timeOffset = 0;
      if (tds.length >= 8) {
        const dateText = $(tds[0]).text().replace(/\s+/g, ' ').trim();
        if (dateText && (dateText.includes('.') || dateText.includes('-'))) {
          currentDate = dateText;
        }
        timeOffset = 1;
      }

      const timeText = $(tds[0 + timeOffset]).text().trim();
      const timeMatch = timeText.match(/([012]\d:[0-5]\d)/);
      const time = timeMatch ? timeMatch[1] : "";

      const scoreCell = $(tds[1 + timeOffset]);
      const teamA = scoreCell.find(".team.home .name").text().trim();
      const teamB = scoreCell.find(".team.away .name").text().trim();
      const score = scoreCell.find(".score").text().trim();
      
      const categoryBase = $(tds[2 + timeOffset]).text().trim();
      const remarks = $(tds[5 + timeOffset]).text().trim();
      let category = categoryBase;
      if (remarks && remarks !== "기록지" && remarks !== "-" && !category.includes(remarks)) {
        category = `${category} - ${remarks}`;
      }
      
      const venue = $(tds[3 + timeOffset]).text().trim();
      const detailUrlRaw = scoreCell.find(".score").attr("href");
      let detailUrl = null;
      if (detailUrlRaw && detailUrlRaw !== "#" && !detailUrlRaw.startsWith("javascript")) {
        try {
          detailUrl = new URL(detailUrlRaw, "https://khf.handballkorea.com/competition/schedule_list.php").href;
        } catch (e) {
          detailUrl = null;
        }
      }
      const id = detailUrl ? new URLSearchParams(detailUrl.split('?')[1]).get('GAME_CD') || Math.random().toString(36).substr(2, 9) : Math.random().toString(36).substr(2, 9);

      if (teamA && teamB) {
        matches.push({
          id,
          date: `${currentDate} ${time}`.trim(),
          teamA,
          teamB,
          score: score || "VS",
          category: category || "기타",
          venue,
          detailUrl,
          tournament: currentTournament
        });
      }
    });

    const uniqueMatches = Array.from(new Map(matches.map(m => [`${m.teamA}-${m.teamB}-${m.date}`, m])).values());

    uniqueMatches.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return res.status(200).json({
      tournamentName: currentTournament || "조회된 대회 없음",
      matches: uniqueMatches
    });
  } catch (error: any) {
    console.error("Schedule error:", error?.message);
    return res.status(500).json({ error: "데이터를 불러오는 중 오류가 발생했습니다." });
  }
}
