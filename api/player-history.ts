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
  // 1. Direct fetch
  try {
    const res = await axios.get(targetUrl, {
      headers: scrapingHeaders,
      timeout: 10000
    });
    if (res.data && typeof res.data === 'string' && res.data.length > 200) {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Direct fetch player history failed, trying proxy...", err?.message);
  }

  // 2. Proxy 1
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const res = await axios.get(proxyUrl, { timeout: 12000 });
    if (res.data && typeof res.data === 'string') {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Proxy 1 fetch player history failed:", err?.message);
  }

  // 3. Proxy 2
  try {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
    const res = await axios.get(proxyUrl, { timeout: 12000 });
    if (res.data && typeof res.data === 'string') {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Proxy 2 fetch player history failed:", err?.message);
  }

  throw new Error("선수 기록을 가져올 수 없습니다.");
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { name, team } = req.query;
    if (!name) return res.status(400).json({ error: "선수명이 필요합니다." });

    const years = [2026, 2025, 2024];
    let allMatches: any[] = [];
    const targetTeam = team as string;
    
    for (const year of years) {
      const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=ALL`;
      
      try {
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);
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

          const scoreCell = $(tds[1 + timeOffset]);
          const teamA = scoreCell.find(".team.home .name").text().trim();
          const teamB = scoreCell.find(".team.away .name").text().trim();
          const score = scoreCell.find(".score").text().trim();
          const detailUrlRaw = scoreCell.find(".score").attr("href");

          if (targetTeam) {
            const isMatch = teamA.includes(targetTeam) || targetTeam.includes(teamA) || 
                            teamB.includes(targetTeam) || targetTeam.includes(teamB);
            if (!isMatch) return;
          }
          
          let detailUrl = null;
          if (detailUrlRaw && detailUrlRaw !== "#" && !detailUrlRaw.startsWith("javascript")) {
            try {
              detailUrl = new URL(detailUrlRaw, "https://khf.handballkorea.com/competition/schedule_list.php").href;
            } catch (e) {
              detailUrl = null;
            }
          }

          if (teamA && teamB && detailUrl) {
            allMatches.push({
              date: currentDate,
              tournament: currentTournament,
              teamA,
              teamB,
              score: score || "VS",
              detailUrl
            });
          }
        });
      } catch (e) {
        console.warn(`Error fetching history for year ${year}:`, e);
      }
    }

    allMatches.sort((a, b) => {
      const dateA = a.date.split(' ')[0] || "";
      const dateB = b.date.split(' ')[0] || "";
      return dateB.localeCompare(dateA);
    });
    
    const uniqueMatches = Array.from(new Map(allMatches.map(m => [`${m.tournament}-${m.date}-${m.teamA}-${m.teamB}`, m])).values());
    const matchesToFetch = uniqueMatches.slice(0, 10);
    
    const historyWithStats = await Promise.all(matchesToFetch.map(async (m) => {
      try {
        const playerRecordUrl = m.detailUrl.replace("detail_new.php", "detail_player_record_new.php");
        const playerHtml = await fetchHtml(playerRecordUrl);
        const $p = cheerio.load(playerHtml);
        let playerStats = null;

        $p(".table_wrap.record").each((_, wrap) => {
          const isGoalieTable = $p(wrap).find("th:contains('SV')").length > 0 || $p(wrap).find("th:contains('방어율')").length > 0;
          const fixedRows = $p(wrap).find(".fixed_table table tbody tr");
          const scrollRows = $p(wrap).find(".scroll_table table tbody tr");
          
          fixedRows.each((i, tr) => {
            const nameText = $p(tr).find("td").eq(1).text().trim();
            if (nameText === name) {
              const statsTds = scrollRows.eq(i).find("td");
              if (isGoalieTable) {
                playerStats = {
                  gs: `SV:${statsTds.eq(1).text().trim()}`,
                  rate: statsTds.eq(0).text().trim().replace('%', ''),
                  as: statsTds.length > 3 ? statsTds.eq(3).text().trim() : "0",
                  st: "0"
                };
              } else {
                playerStats = {
                  gs: statsTds.eq(0).text().trim(),
                  rate: statsTds.eq(1).text().trim().replace('%', ''),
                  as: statsTds.length > 8 ? statsTds.eq(8).text().trim() : "0",
                  st: statsTds.length > 12 ? statsTds.eq(12).text().trim() : "0"
                };
              }
            }
          });
        });

        return {
          ...m,
          gs: playerStats ? (playerStats as any).gs : "0/0",
          rate: playerStats ? (playerStats as any).rate : "0",
          as: playerStats ? (playerStats as any).as : "0",
          st: playerStats ? (playerStats as any).st : "0"
        };
      } catch (e) {
        return {
          ...m,
          gs: "0/0",
          rate: "0",
          as: "0",
          st: "0"
        };
      }
    }));

    return res.status(200).json({ history: historyWithStats }); 
  } catch (error: any) {
    console.error("Player history error:", error?.message);
    return res.status(500).json({ error: "선수 기록을 불러오지 못했습니다." });
  }
}
