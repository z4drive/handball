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
    const matchesToFetch = uniqueMatches.slice(0, 30);
    
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
                  isGoalie: true,
                  rate: statsTds.eq(0).text().trim().replace('%', '') || "0",
                  sv: statsTds.eq(1).text().trim() || "0",
                  gkg: statsTds.length > 2 ? statsTds.eq(2).text().trim() : "0",
                  gkas: statsTds.length > 3 ? statsTds.eq(3).text().trim() : "0",
                  wing: statsTds.length > 4 ? statsTds.eq(4).text().trim() : "-",
                  m6: statsTds.length > 5 ? statsTds.eq(5).text().trim() : "-",
                  m9: statsTds.length > 6 ? statsTds.eq(6).text().trim() : "-",
                  m7: statsTds.length > 7 ? statsTds.eq(7).text().trim() : "-",
                  fb: statsTds.length > 8 ? statsTds.eq(8).text().trim() : "-",
                  bt: statsTds.length > 9 ? statsTds.eq(9).text().trim() : "-",
                  high: statsTds.length > 10 ? statsTds.eq(10).text().trim() : "-",
                  mid: statsTds.length > 11 ? statsTds.eq(11).text().trim() : "-",
                  low: statsTds.length > 12 ? statsTds.eq(12).text().trim() : "-",
                  gs: `SV:${statsTds.eq(1).text().trim()}`,
                  as: statsTds.length > 3 ? statsTds.eq(3).text().trim() : "0",
                  tf: "0",
                  bd: "0",
                  bs: "0",
                  st: "0",
                  rb: "0",
                  yc: statsTds.length > 13 ? statsTds.eq(13).text().trim() : "0",
                  m2: statsTds.length > 14 ? statsTds.eq(14).text().trim() : "0",
                  rc: statsTds.length > 15 ? statsTds.eq(15).text().trim() : "0",
                  report: statsTds.length > 16 ? statsTds.eq(16).text().trim() : "0",
                  playTime: statsTds.length > 17 ? statsTds.eq(17).text().trim() : "00:60:00"
                };
              } else {
                playerStats = {
                  isGoalie: false,
                  gs: statsTds.eq(0).text().trim() || "0/0",
                  rate: statsTds.eq(1).text().trim().replace('%', '') || "0",
                  m6: statsTds.length > 2 ? statsTds.eq(2).text().trim() : "0/0",
                  wing: statsTds.length > 3 ? statsTds.eq(3).text().trim() : "0/0",
                  m9: statsTds.length > 4 ? statsTds.eq(4).text().trim() : "0/0",
                  m7: statsTds.length > 5 ? statsTds.eq(5).text().trim() : "0/0",
                  fb: statsTds.length > 6 ? statsTds.eq(6).text().trim() : "0/0",
                  bt: statsTds.length > 7 ? statsTds.eq(7).text().trim() : "0/0",
                  as: statsTds.length > 8 ? statsTds.eq(8).text().trim() : "0",
                  tf: statsTds.length > 9 ? statsTds.eq(9).text().trim() : "0",
                  bd: statsTds.length > 10 ? statsTds.eq(10).text().trim() : "0",
                  bs: statsTds.length > 11 ? statsTds.eq(11).text().trim() : "0",
                  st: statsTds.length > 12 ? statsTds.eq(12).text().trim() : "0",
                  rb: statsTds.length > 13 ? statsTds.eq(13).text().trim() : "0",
                  yc: statsTds.length > 14 ? statsTds.eq(14).text().trim() : "0",
                  m2: statsTds.length > 15 ? statsTds.eq(15).text().trim() : "0",
                  rc: statsTds.length > 16 ? statsTds.eq(16).text().trim() : "0",
                  report: statsTds.length > 17 ? statsTds.eq(17).text().trim() : "0",
                  playTime: statsTds.length > 18 ? statsTds.eq(18).text().trim() : "00:60:00"
                };
              }
            }
          });
        });

        return {
          ...m,
          isGoalie: playerStats ? (playerStats as any).isGoalie : false,
          sv: playerStats ? (playerStats as any).sv : "0",
          gkg: playerStats ? (playerStats as any).gkg : "0",
          gkas: playerStats ? (playerStats as any).gkas : "0",
          wing: playerStats ? (playerStats as any).wing : "0/0",
          m6: playerStats ? (playerStats as any).m6 : "0/0",
          m9: playerStats ? (playerStats as any).m9 : "0/0",
          m7: playerStats ? (playerStats as any).m7 : "0/0",
          fb: playerStats ? (playerStats as any).fb : "0/0",
          bt: playerStats ? (playerStats as any).bt : "0/0",
          high: playerStats ? (playerStats as any).high : "-",
          mid: playerStats ? (playerStats as any).mid : "-",
          low: playerStats ? (playerStats as any).low : "-",
          gs: playerStats ? (playerStats as any).gs : "0/0",
          rate: playerStats ? (playerStats as any).rate : "0",
          as: playerStats ? (playerStats as any).as : "0",
          tf: playerStats ? (playerStats as any).tf : "0",
          bd: playerStats ? (playerStats as any).bd : "0",
          bs: playerStats ? (playerStats as any).bs : "0",
          st: playerStats ? (playerStats as any).st : "0",
          rb: playerStats ? (playerStats as any).rb : "0",
          yc: playerStats ? (playerStats as any).yc : "0",
          m2: playerStats ? (playerStats as any).m2 : "0",
          rc: playerStats ? (playerStats as any).rc : "0",
          report: playerStats ? (playerStats as any).report : "0",
          dr: playerStats ? (playerStats as any).report : "0",
          playTime: playerStats ? (playerStats as any).playTime : "00:60:00"
        };
      } catch (e) {
        return {
          ...m,
          isGoalie: false,
          sv: "0",
          gkg: "0",
          gkas: "0",
          wing: "0/0",
          m6: "0/0",
          m9: "0/0",
          m7: "0/0",
          fb: "0/0",
          bt: "0/0",
          high: "-",
          mid: "-",
          low: "-",
          gs: "0/0",
          rate: "0",
          as: "0",
          tf: "0",
          bd: "0",
          bs: "0",
          st: "0",
          rb: "0",
          yc: "0",
          m2: "0",
          rc: "0",
          report: "0",
          dr: "0",
          playTime: "-"
        };
      }
    }));

    return res.status(200).json({ history: historyWithStats }); 
  } catch (error: any) {
    console.error("Player history error:", error?.message);
    return res.status(500).json({ error: "선수 기록을 불러오지 못했습니다." });
  }
}
