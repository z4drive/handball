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
    console.warn("Direct match detail fetch failed, trying proxy...", err?.message);
  }

  // 2. Proxy 1
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const res = await axios.get(proxyUrl, { timeout: 12000 });
    if (res.data && typeof res.data === 'string') {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Proxy 1 match detail fetch failed:", err?.message);
  }

  // 3. Proxy 2
  try {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
    const res = await axios.get(proxyUrl, { timeout: 12000 });
    if (res.data && typeof res.data === 'string') {
      return res.data;
    }
  } catch (err: any) {
    console.warn("Proxy 2 match detail fetch failed:", err?.message);
  }

  throw new Error("상세 정보를 가져올 수 없습니다.");
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string' || url === 'null') {
      return res.status(400).json({ error: "URL이 필요합니다." });
    }

    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const infoHtml = $(".game_info_top").html() || "";
    const infoLines = infoHtml.split(/<br\s*\/?>/i).map(line => cheerio.load(line)("body").text().trim());
    
    let matchDate = "";
    let tournament = "";
    let group = "";
    
    const datePartMatch = infoHtml.match(/\d{4}[.-]\d{2}[.-]\d{2}/);
    const dayPartMatch = infoHtml.match(/\([^)]+\)/);
    const timePartMatch = infoHtml.match(/([012]\d:[0-5]\d)/);

    if (datePartMatch) {
      matchDate = datePartMatch[0];
      if (dayPartMatch) matchDate += ` ${dayPartMatch[0]}`;
      if (timePartMatch) matchDate += ` ${timePartMatch[1]}`;
    }

    infoLines.forEach(line => {
      if (line.includes("대회")) {
        tournament = line;
      } else if (line.includes("조") && !line.includes("보조")) {
        group = line;
      }
    });

    if (!tournament) tournament = $(".sub_title_area h3").text().trim() || "대회 정보 없음";
    if (!matchDate && infoLines.length > 0) {
      matchDate = infoLines[0].split(/\s+\d+:\d+$/)[0].trim();
    }
    if (!group && infoLines.length > 2) group = infoLines[2];
    
    const matchInfo = matchDate;
    
    const homeTeam = $(".vs_style.main .team.home .name").text().replace(/전반전|후반전/g, "").replace(/\(\d+-\d+\)/g, "").replace(/\d+/g, "").trim();
    const awayTeam = $(".vs_style.main .team.away .name").text().replace(/전반전|후반전/g, "").replace(/\(\d+-\d+\)/g, "").replace(/\d+/g, "").trim();
    const homeScore = $(".vs_style.main .team.home .number").text().trim();
    const awayScore = $(".vs_style.main .team.away .number").text().trim();
    const totalScore = homeScore && awayScore ? `${homeScore} : ${awayScore}` : "VS";
    
    const periodScores: any[] = [];
    $(".vs_style.sub").each((_, div) => {
      const label = $(div).find(".center").text().trim();
      const home = $(div).find(".team.home .name").text().trim();
      const away = $(div).find(".team.away .name").text().trim();
      if (label && home && away) {
        periodScores.push({ label, home, away });
      }
    });

    const extractIcons = (selector: string) => {
      const stats: any = {};
      $(selector).find("li").each((_, li) => {
        const type = $(li).find(".icon").attr("class")?.split(" ")[1];
        const value = $(li).find(".number").text().trim();
        if (type) stats[type] = value;
      });
      return stats;
    };

    const homeIcons = extractIcons(".game_icons.home");
    const awayIcons = extractIcons(".game_icons.away");

    const tableStats: any[] = [];
    $(".compare_table table tbody tr").each((_, tr) => {
      const home = $(tr).find("td").first().text().trim();
      const label = $(tr).find(".center").text().trim();
      const away = $(tr).find("td").last().text().trim();
      if (label) {
        tableStats.push({ label, home, away });
      }
    });

    let playerRecords: any = { home: [], away: [] };
    const playerRecordUrl = (url as string).replace("detail_new.php", "detail_player_record_new.php");
    
    try {
      const playerHtml = await fetchHtml(playerRecordUrl);
      const $p = cheerio.load(playerHtml);
      const subConts = $p(".sub_cont");
      
      const parseSubCont = (container: any) => {
        const players: any[] = [];
        container.find(".table_wrap.record").each((_: number, wrap: any) => {
          const isGoalieTable = $p(wrap).find("th:contains('SV')").length > 0 || $p(wrap).find("th:contains('방어율')").length > 0;
          const fixedRows = $p(wrap).find(".fixed_table table tbody tr");
          const scrollRows = $p(wrap).find(".scroll_table table tbody tr");
          
          fixedRows.each((i, tr) => {
            const tds = $p(tr).find("td");
            const name = tds.length > 1 ? tds.eq(1).text().trim() : "";
            if (!name || name === "합계") return;

            const no = tds.eq(0).text().trim();
            const statsTds = scrollRows.eq(i).find("td");
            
            if (statsTds.length > 0) {
              if (isGoalieTable) {
                players.push({
                  no,
                  name,
                  isGoalie: true,
                  rate: statsTds.eq(0).text().trim(),
                  gs: statsTds.eq(1).text().trim(),
                  as: statsTds.eq(2).text().trim(),
                  tf: statsTds.eq(3).text().trim(),
                  st: statsTds.eq(4).text().trim(),
                  playTime: statsTds.eq(5).text().trim(),
                });
              } else {
                players.push({ 
                  no, 
                  name,
                  isGoalie: false,
                  gs: statsTds.eq(0).text().trim(), 
                  rate: statsTds.eq(1).text().trim(), 
                  m6: statsTds.eq(2).text().trim(),
                  wing: statsTds.eq(3).text().trim(),
                  m9: statsTds.eq(4).text().trim(),
                  m7: statsTds.eq(5).text().trim(),
                  fb: statsTds.eq(6).text().trim(),
                  bt: statsTds.eq(7).text().trim(),
                  as: statsTds.eq(8).text().trim(),
                  tf: statsTds.eq(9).text().trim(),
                  bd: statsTds.eq(10).text().trim(),
                  bs: statsTds.eq(11).text().trim(),
                  st: statsTds.eq(12).text().trim(),
                  yc: statsTds.eq(14).text().trim(),
                  m2: statsTds.eq(15).text().trim(),
                  rc: statsTds.eq(16).text().trim(),
                  report: statsTds.eq(17).text().trim(),
                  playTime: statsTds.eq(18).text().trim()
                });
              }
            }
          });
        });
        return players;
      };

      if (subConts.length >= 2) {
        playerRecords = {
          home: parseSubCont(subConts.eq(0)),
          away: parseSubCont(subConts.eq(1))
        };
      } else if (subConts.length === 1) {
        playerRecords = {
          home: parseSubCont(subConts.eq(0)),
          away: []
        };
      }
    } catch (err) {
      console.warn("Vercel match player records fetch error:", err);
    }

    const compareBars: any[] = [];
    $(".compare_bar li").each((_, li) => {
      const homeVal = $(li).find(".team.home .number").text().trim();
      const awayVal = $(li).find(".team.away .number").text().trim();
      const label = $(li).find(".center").text().trim();
      if (label) {
        compareBars.push({ label, home: homeVal, away: awayVal });
      }
    });

    return res.status(200).json({
      tournament,
      matchInfo,
      homeTeam,
      awayTeam,
      totalScore,
      periodScores,
      homeIcons,
      awayIcons,
      tableStats,
      playerRecords,
      compareBars,
      group
    });
  } catch (error: any) {
    console.error("Match detail error:", error?.message);
    return res.status(500).json({ error: "상세 정보를 불러오지 못했습니다." });
  }
}
