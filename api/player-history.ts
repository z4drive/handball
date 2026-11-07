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

const isServerSchoolMatch = (nameA: string, nameB: string) => {
  if (!nameA || !nameB) return false;
  const norm = (s: string) => s
    .replace(/\s+/g, '')
    .replace(/\(남\)|\(여\)|\(남고\)|\(여고\)|\(남중\)|\(여중\)|\(남초\)|\(여초\)/g, '')
    .replace(/고등학교/g, '고')
    .replace(/중학교/g, '중')
    .replace(/초등학교/g, '초')
    .replace(/대학교/g, '대');
  const a = norm(nameA);
  const b = norm(nameB);
  return a === b || a.includes(b) || b.includes(a);
};

async function getPlayerYearTeams(playerName: string, currentTeam?: string): Promise<Record<number, string[]>> {
  const yearTeams: Record<number, string[]> = {
    2026: currentTeam ? [currentTeam] : [],
    2025: currentTeam ? [currentTeam] : [],
    2024: currentTeam ? [currentTeam] : []
  };
  try {
    const searchRes = await axios.post(
      "https://g1.sports.or.kr/stat/playerSearch.do",
      new URLSearchParams({
        gubun: "P",
        searchClassCd: "HB",
        searchSidoCd: "",
        searchSexCd: "",
        searchName: playerName
      }).toString(),
      {
        headers: {
          ...scrapingHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://g1.sports.or.kr/stat/playerSearch.do"
        },
        timeout: 6000
      }
    );
    const $ = cheerio.load(searchRes.data);
    let personNo = "";
    let classCd = "HB";
    $("table tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 7) {
        const pName = $(tds[1]).text().trim();
        const team = tds.length >= 8 ? $(tds[7]).text().trim() : "";
        if (pName === playerName && (!currentTeam || isServerSchoolMatch(team, currentTeam) || !personNo)) {
          const onclickAttr = $(tr).attr("onclick") || "";
          const m = onclickAttr.match(/viewHistory\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
          if (m) {
            classCd = m[1];
            personNo = m[2];
          }
        }
      }
    });

    if (personNo) {
      const detailRes = await axios.post(
        "https://g1.sports.or.kr/stat/playerSearchResult.do",
        new URLSearchParams({
          gubun: "P",
          searchClassCd: "HB",
          searchSidoCd: "",
          searchSexCd: "",
          searchName: playerName,
          classCd,
          personNo
        }).toString(),
        {
          headers: {
            ...scrapingHeaders,
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://g1.sports.or.kr/stat/playerSearch.do"
          },
          timeout: 6000
        }
      );
      const $d = cheerio.load(detailRes.data);
      $d(".lookup").each((_, lookup) => {
        const title = $d(lookup).find(".lookup-header__title").text().trim();
        if (title.includes("등록이력")) {
          $d(lookup).find("table tbody tr").each((__, tr) => {
            const tds = $d(tr).find("td");
            if (tds.length >= 6) {
              const yr = parseInt($d(tds[0]).text().trim(), 10);
              const tm = $d(tds[4]).text().trim();
              if (yr && tm) {
                if (!yearTeams[yr]) yearTeams[yr] = [];
                if (!yearTeams[yr].includes(tm)) {
                  yearTeams[yr].unshift(tm);
                }
              }
            }
          });
        }
      });
    }
  } catch (e) {
    // ignore portal errors
  }
  return yearTeams;
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

    const playerName = (name as string).trim();
    const targetTeam = team ? (team as string).trim() : "";
    const yearTeamsMap = await getPlayerYearTeams(playerName, targetTeam);

    const years = [2026, 2025, 2024];
    let allMatches: any[] = [];
    
    await Promise.all(years.map(async (year) => {
      const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=ALL`;
      const candidateTeamsForYear = yearTeamsMap[year] && yearTeamsMap[year].length > 0
        ? yearTeamsMap[year]
        : (targetTeam ? [targetTeam] : []);

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

          let matchedSide: 'home' | 'away' | 'any' = 'any';
          if (candidateTeamsForYear.length > 0) {
            const isHome = candidateTeamsForYear.some(t => isServerSchoolMatch(teamA, t));
            const isAway = candidateTeamsForYear.some(t => isServerSchoolMatch(teamB, t));
            if (!isHome && !isAway) return;
            matchedSide = isHome ? 'home' : 'away';
          }
          
          let detailUrl = null;
          if (detailUrlRaw && detailUrlRaw !== "#" && !detailUrlRaw.startsWith("javascript")) {
            try {
              detailUrl = new URL(detailUrlRaw, "https://khf.handballkorea.com/competition/schedule_list.php").href;
            } catch (e) {
              detailUrl = null;
            }
          }

          if (teamA && teamB && detailUrl && score && score !== "VS" && score.includes(":")) {
            const cleanDate = (currentDate || "").match(/\d{4}[.-]\d{2}[.-]\d{2}/)?.[0]?.replace(/-/g, '.') || currentDate.split(' ')[0] || "";
            allMatches.push({
              date: cleanDate,
              cleanDate,
              fullDate: currentDate,
              tournament: currentTournament,
              teamA,
              teamB,
              score: score.replace(/\s+/g, ' ').trim(),
              detailUrl,
              matchedSide
            });
          }
        });
      } catch (e) {
        console.warn(`Error fetching history for year ${year}:`, e);
      }
    }));

    allMatches.sort((a, b) => (b.cleanDate || "").localeCompare(a.cleanDate || ""));
    
    const seenMatchKey = new Set<string>();
    const uniqueMatches: any[] = [];
    for (const m of allMatches) {
      const key = `${m.cleanDate}_${m.teamA}_${m.teamB}`;
      if (!seenMatchKey.has(key)) {
        seenMatchKey.add(key);
        uniqueMatches.push(m);
      }
    }

    const matchesToFetch = uniqueMatches.slice(0, 35);
    
    const historyWithStats = await Promise.all(matchesToFetch.map(async (m) => {
      try {
        const playerRecordUrl = m.detailUrl.replace("detail_new.php", "detail_player_record_new.php");
        const playerHtml = await fetchHtml(playerRecordUrl);
        const $p = cheerio.load(playerHtml);
        let playerStats: any = null;

        const subConts = $p(".sub_cont");
        const targetContainers: any[] = [];
        if (subConts.length >= 2) {
          if (m.matchedSide === 'home') targetContainers.push(subConts.eq(0));
          else if (m.matchedSide === 'away') targetContainers.push(subConts.eq(1));
          else {
            targetContainers.push(subConts.eq(0));
            targetContainers.push(subConts.eq(1));
          }
        } else {
          targetContainers.push($p.root());
        }

        targetContainers.forEach((container) => {
          container.find(".table_wrap.record").each((_: number, wrap: any) => {
            const isGoalieTable = $p(wrap).find("th:contains('SV')").length > 0 || $p(wrap).find("th:contains('방어율')").length > 0;
            const fixedRows = $p(wrap).find(".fixed_table table tbody tr");
            const scrollRows = $p(wrap).find(".scroll_table table tbody tr");
            
            fixedRows.each((i: number, tr: any) => {
              const nameText = $p(tr).find("td").eq(1).text().trim();
              if (nameText === playerName) {
                const statsTds = scrollRows.eq(i).find("td");
                if (isGoalieTable) {
                  if (playerStats && !playerStats.isGoalie) return;
                  const svVal = statsTds.eq(1).text().trim() || "0";
                  const rateVal = statsTds.eq(0).text().trim().replace('%', '') || "0";
                  playerStats = {
                    isGoalie: true,
                    rate: rateVal,
                    sv: svVal,
                    gkg: statsTds.length > 2 ? statsTds.eq(2).text().trim() : "0",
                    gkas: statsTds.length > 3 ? statsTds.eq(3).text().trim() : "0",
                    wing: statsTds.length > 4 ? statsTds.eq(4).text().trim() : "0/0",
                    m6: statsTds.length > 5 ? statsTds.eq(5).text().trim() : "0/0",
                    m9: statsTds.length > 6 ? statsTds.eq(6).text().trim() : "0/0",
                    m7: statsTds.length > 7 ? statsTds.eq(7).text().trim() : "0/0",
                    fb: statsTds.length > 8 ? statsTds.eq(8).text().trim() : "0/0",
                    bt: statsTds.length > 9 ? statsTds.eq(9).text().trim() : "0/0",
                    high: statsTds.length > 10 ? statsTds.eq(10).text().trim() : "0/0",
                    mid: statsTds.length > 11 ? statsTds.eq(11).text().trim() : "0/0",
                    low: statsTds.length > 12 ? statsTds.eq(12).text().trim() : "0/0",
                    gs: `SV:${svVal}`,
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
                    dr: statsTds.length > 16 ? statsTds.eq(16).text().trim() : "0",
                    playTime: statsTds.length > 17 ? statsTds.eq(17).text().trim() : "00:00:00"
                  };
                } else {
                  const gsText = statsTds.eq(0).text().trim() || "0/0";
                  const [gStr, sStr] = gsText.split('/');
                  playerStats = {
                    isGoalie: false,
                    gs: gsText,
                    goals: parseInt(gStr) || 0,
                    shots: parseInt(sStr) || 0,
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
                    dr: statsTds.length > 17 ? statsTds.eq(17).text().trim() : "0",
                    playTime: statsTds.length > 18 ? statsTds.eq(18).text().trim() : "00:00:00"
                  };
                }
              }
            });
          });
        });

        if (!playerStats) return null;
        return {
          ...m,
          ...playerStats,
          hasPlayed: true
        };
      } catch (e) {
        return null;
      }
    }));

    const actualPlayedMatches = historyWithStats
      .filter(Boolean)
      .sort((a: any, b: any) => (b.cleanDate || "").localeCompare(a.cleanDate || ""));

    return res.status(200).json({ history: actualPlayedMatches }); 
  } catch (error: any) {
    console.error("Player history error:", error?.message);
    return res.status(500).json({ error: "선수 기록을 불러오지 못했습니다." });
  }
}
