import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Common headers for scraping to mimic a browser
  const scrapingHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://khf.handballkorea.com/'
  };

  // API Route for crawling
  app.get("/api/schedule", async (req, res) => {
    try {
      const { year, month } = req.query;
      
      // Using empty GROUP_CD to fetch all categories at once
      const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=${month}&GROUP_CD=`;
      
      const response = await axios.get(url, {
        headers: scrapingHeaders,
        timeout: 20000
      });

      const $ = cheerio.load(response.data);
      const matches: any[] = [];
      let currentTournament = "";
      let currentDate = "";

      $(".table_wrap table tbody tr").each((_, element) => {
        const tds = $(element).find("td");
        const th = $(element).find("th");

        if (th.length > 0) {
          currentTournament = th.text().trim();
        }

        // Determine column mapping based on presence of Date column (rowspan)
        // 9 columns: Tournament(TH), Date(TD), Time(TD), Score(TD), Category(TD), Venue(TD), Sheet(TD), Remarks(TD), Broadcast(TD)
        // If Date is missing: 7 TDs. If Date is present: 8 TDs.
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
        
        // Combine Category (부별) and Remarks (비고) for full group info
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

      // Deduplicate
      const uniqueMatches = Array.from(new Map(matches.map(m => [`${m.teamA}-${m.teamB}-${m.date}`, m])).values());

      // Sort by date/time descending (most recent first)
      uniqueMatches.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      });

      res.json({
        tournamentName: currentTournament || "조회된 대회 없음",
        matches: uniqueMatches
      });
    } catch (error: any) {
      console.error("Scraping error:", error.message);
      res.status(500).json({ error: "데이터를 불러오는 중 오류가 발생했습니다." });
    }
  });

  // Detailed match info crawling
  app.get("/api/match-detail", async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string' || url === 'null') {
        return res.status(400).json({ error: "URL이 필요합니다." });
      }

      console.log(`Scraping match detail: ${url}`);
      const response = await axios.get(url, {
        headers: scrapingHeaders,
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      
      const infoHtml = $(".game_info_top").html() || "";
      const infoLines = infoHtml.split(/<br\s*\/?>/i).map(line => cheerio.load(line)("body").text().trim());
      
      let matchDate = "";
      let tournament = "";
      let group = "";
      
      // Look for Date (YYYY.MM.DD), Day (요일), and Time (HH:mm)
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

      // Fallbacks with cleaning
      if (!tournament) tournament = $(".sub_title_area h3").text().trim() || "대회 정보 없음";
      if (!matchDate && infoLines.length > 0) {
        matchDate = infoLines[0].split(/\s+\d+:\d+$/)[0].trim(); // Remove trailing score if present
      }
      if (!group && infoLines.length > 2) group = infoLines[2];
      
      const matchInfo = matchDate;
      
      // Main scores and teams
      const homeTeam = $(".vs_style.main .team.home .name").text().replace(/전반전|후반전/g, "").replace(/\(\d+-\d+\)/g, "").replace(/\d+/g, "").trim();
      const awayTeam = $(".vs_style.main .team.away .name").text().replace(/전반전|후반전/g, "").replace(/\(\d+-\d+\)/g, "").replace(/\d+/g, "").trim();
      const homeScore = $(".vs_style.main .team.home .number").text().trim();
      const awayScore = $(".vs_style.main .team.away .number").text().trim();
      const totalScore = homeScore && awayScore ? `${homeScore} : ${awayScore}` : "VS";
      
      // Period scores
      const periodScores: any[] = [];
      $(".vs_style.sub").each((_, div) => {
        const label = $(div).find(".center").text().trim();
        const home = $(div).find(".team.home .name").text().trim();
        const away = $(div).find(".team.away .name").text().trim();
        if (label && home && away) {
          periodScores.push({ label, home, away });
        }
      });

      // Team Stats (Icons)
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

      // Table Stats (Comparison)
      const tableStats: any[] = [];
      $(".compare_table table tbody tr").each((_, tr) => {
        const home = $(tr).find("td").first().text().trim();
        const label = $(tr).find(".center").text().trim();
        const away = $(tr).find("td").last().text().trim();
        if (label) {
          tableStats.push({ label, home, away });
        }
      });

      // Fetch player records if available
      let playerRecords: any = { home: [], away: [] };
      const playerRecordUrl = (url as string).replace("detail_new.php", "detail_player_record_new.php");
      
      try {
        const playerRes = await axios.get(playerRecordUrl, {
          headers: scrapingHeaders,
          timeout: 10000
        });
        const $p = cheerio.load(playerRes.data);
        
        // Find Home and Away containers
        const subConts = $p(".sub_cont");
        
        const parseSubCont = (container: any) => {
          const players: any[] = [];
          // Each team has multiple tables (Field players, then Goalies)
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
                    gs: statsTds.eq(1).text().trim(), // SV/S
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
          // Fallback if structure is different
          playerRecords = {
            home: parseSubCont(subConts.eq(0)),
            away: []
          };
        }
      } catch (err) {
        console.error("Player record fetch error:", err);
      }

      // Fetch comparison bars
      const compareBars: any[] = [];
      $(".compare_bar li").each((_, li) => {
        const homeVal = $(li).find(".team.home .number").text().trim();
        const awayVal = $(li).find(".team.away .number").text().trim();
        const label = $(li).find(".center").text().trim();
        if (label) {
          compareBars.push({ label, home: homeVal, away: awayVal });
        }
      });

      res.json({
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
      console.error("Detail scraping error:", error.message);
      res.status(500).json({ error: "상세 정보를 불러오지 못했습니다." });
    }
  });

  // 선수 개인 경기 기록 스크래퍼
  app.get("/api/player-history", async (req, res) => {
    try {
      const { name, team } = req.query;
      if (!name) return res.status(400).json({ error: "선수명이 필요합니다." });

      const years = [2026, 2025, 2024]; // 최근 3개년 데이터 조회
      let allMatches: any[] = [];
      const targetTeam = team as string;
      
      for (const year of years) {
        // DS_MONTH=ALL을 사용하여 해당 연도의 모든 경기를 가져옵니다.
        const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=ALL`;
        
        try {
          const response = await axios.get(url, {
            headers: scrapingHeaders,
            timeout: 15000
          });

          const $ = cheerio.load(response.data);
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

            // 관계없는 데이터 필터링: 팀명 포함 여부 확인 (더 유연하게)
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
          console.error(`Error fetching history for year ${year}:`, e);
        }
      }

      // 최근 경기 순으로 정렬 (날짜 형식이 2024.08.15 (목) 형태이므로 점 기준으로 정렬)
      allMatches.sort((a, b) => {
        const dateA = a.date.split(' ')[0] || "";
        const dateB = b.date.split(' ')[0] || "";
        return dateB.localeCompare(dateA);
      });
      
      // 중복 제거 (토너먼트, 날짜, 팀이 같으면 동일 경기로 간주)
      const uniqueMatches = Array.from(new Map(allMatches.map(m => [`${m.tournament}-${m.date}-${m.teamA}-${m.teamB}`, m])).values());
      
      // 상위 10개 경기에 대해 실제 선수 기록 추출 (조금 더 늘림)
      const matchesToFetch = uniqueMatches.slice(0, 10);
      
      const historyWithStats = await Promise.all(matchesToFetch.map(async (m) => {
        try {
          const playerRecordUrl = m.detailUrl.replace("detail_new.php", "detail_player_record_new.php");
          const res = await axios.get(playerRecordUrl, {
            headers: scrapingHeaders,
            timeout: 5000
          });
          const $p = cheerio.load(res.data);
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

      res.json({ history: historyWithStats }); 
    } catch (error: any) {
      console.error("Player history error:", error.message);
      res.status(500).json({ error: "선수 기록을 불러오지 못했습니다." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
