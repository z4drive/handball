import axios from "axios";
import * as cheerio from "cheerio";

const scrapingHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Upgrade-Insecure-Requests': '1',
  'Referer': 'https://khf.handballkorea.com/'
};

function normalizeSchool(str: string): string {
  if (!str) return "";
  return str
    .replace(/\s+/g, "")
    .replace(/여자고등학교/g, "여고")
    .replace(/고등학교/g, "고")
    .replace(/여자중학교/g, "여중")
    .replace(/중학교/g, "중")
    .replace(/초등학교/g, "초")
    .replace(/대학교/g, "대")
    .replace(/학교/g, "");
}

function isSchoolMatch(schoolA: string, schoolB: string): boolean {
  if (!schoolA || !schoolB) return false;
  const a = normalizeSchool(schoolA);
  const b = normalizeSchool(schoolB);
  if (!a || !b) return false;
  if (a === b) return true;

  const levelA = a.match(/(여고|고|여중|중|초|대)$/)?.[1] || "";
  const levelB = b.match(/(여고|고|여중|중|초|대)$/)?.[1] || "";
  if (levelA && levelB && levelA !== levelB) {
    return false;
  }

  if (a.includes(b) || b.includes(a)) return true;
  const rootA = a.replace(/(여고|고|여중|중|초|대)$/, "");
  const rootB = b.replace(/(여고|고|여중|중|초|대)$/, "");
  if (rootA && rootB && (rootA === rootB || rootA.includes(rootB) || rootB.includes(rootA))) return true;
  return false;
}

async function searchWeb(query: string, limit = 6): Promise<any[]> {
  const results: any[] = [];
  try {
    const duckUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const duckRes = await axios.get(duckUrl, {
      headers: scrapingHeaders,
      timeout: 7000
    });
    const $d = cheerio.load(duckRes.data);
    $d(".result").each((_, el) => {
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
    if (!name) return res.status(400).json({ error: "학교명이 필요합니다." });

    const years = [2026, 2025];
    let matches: any[] = [];

    for (const year of years) {
      try {
        const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=ALL`;
        const resp = await axios.get(url, { headers: scrapingHeaders, timeout: 12000 });
        if (resp.data && typeof resp.data === 'string') {
          const $ = cheerio.load(resp.data);
          let currentTournament = "";
          let currentDate = "";

          $(".table_wrap table tbody tr").each((_, tr) => {
            const th = $(tr).find("th");
            if (th.length > 0) currentTournament = th.text().trim();
            const tds = $(tr).find("td");
            let timeOffset = 0;
            if (tds.length >= 8) {
              const dt = $(tds[0]).text().replace(/\s+/g, ' ').trim();
              if (dt && (dt.includes('.') || dt.includes('-'))) currentDate = dt;
              timeOffset = 1;
            }
            const time = $(tds[0 + timeOffset]).text().trim();
            const scoreCell = $(tds[1 + timeOffset]);
            const teamA = scoreCell.find(".team.home .name").text().trim();
            const teamB = scoreCell.find(".team.away .name").text().trim();
            const score = scoreCell.find(".score").text().trim();
            const detailUrlRaw = scoreCell.find(".score").attr("href");
            let detailUrl = null;
            if (detailUrlRaw && detailUrlRaw !== "#" && !detailUrlRaw.startsWith("javascript")) {
              try {
                detailUrl = new URL(detailUrlRaw, "https://khf.handballkorea.com/competition/schedule_list.php").href;
              } catch (e) {}
            }
            if (teamA && teamB && (isSchoolMatch(teamA, name) || isSchoolMatch(teamB, name))) {
              matches.push({
                tournament: currentTournament || `${year}년 대회`,
                date: `${currentDate} ${time}`.trim(),
                teamA,
                teamB,
                score: score || "VS",
                detailUrl
              });
            }
          });
        }
      } catch (e) {
        console.warn(`[SchoolMatches] fetch error for ${year}:`, e);
      }
    }

    const searchQuery = `핸드볼 ${name} 최근 경기 실적 대회 결과`;
    const searchResults = await searchWeb(searchQuery, 6);

    matches.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    res.json({
      success: true,
      school: name,
      matches,
      searchResults
    });
  } catch (error: any) {
    res.status(500).json({ error: "학교 경기 실적을 불러오지 못했습니다." });
  }
}
