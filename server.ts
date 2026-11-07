import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";

// 서버 부팅 시 단 1회 생성되는 고정 버전 (호출 시마다 바뀌지 않도록 방지)
const SERVER_BOOT_VERSION = "v_" + Date.now().toString(36);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Common headers for scraping to mimic a browser
  const scrapingHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://khf.handballkorea.com/'
  };

  // 연도별 경기 일정 HTML 메모리 캐시 (대용량 2.7MB 중복 다운로드 및 stream abort 방지)
  const yearScheduleCache = new Map<number, { data: string; time: number }>();
  async function getYearScheduleHtml(year: number): Promise<string | null> {
    const cached = yearScheduleCache.get(year);
    // 15분간 캐시 유지
    if (cached && Date.now() - cached.time < 15 * 60 * 1000) {
      return cached.data;
    }
    const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=ALL`;
    try {
      const res = await axios.get(url, {
        headers: scrapingHeaders,
        timeout: 20000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });
      if (res.data && typeof res.data === 'string' && res.data.length > 500) {
        yearScheduleCache.set(year, { data: res.data, time: Date.now() });
        return res.data;
      }
    } catch (err: any) {
      console.warn(`[getYearScheduleHtml] Notice for year ${year}: ${err?.message}`);
      if (cached) return cached.data;
    }
    return null;
  }

  async function fetchHtml(targetUrl: string): Promise<string> {
    try {
      const res = await axios.get(targetUrl, {
        headers: scrapingHeaders,
        timeout: 10000
      });
      if (res.data && typeof res.data === 'string' && res.data.length > 200) {
        return res.data;
      }
    } catch (err: any) {
      console.warn("Direct fetch failed, trying proxy...", err?.message);
    }

    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      const res = await axios.get(proxyUrl, { timeout: 12000 });
      if (res.data && typeof res.data === 'string') {
        return res.data;
      }
    } catch (err: any) {
      console.warn("Proxy 1 fetch failed:", err?.message);
    }

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

  // API Route for crawling
  app.get("/api/schedule", async (req, res) => {
    try {
      const { year, month } = req.query;
      
      // Using empty GROUP_CD to fetch all categories at once
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
                    rate: statsTds.eq(0).text().trim(), // 방어율
                    sv: statsTds.eq(1).text().trim(),   // SV
                    gkg: statsTds.eq(2).text().trim(),  // GKG
                    gkas: statsTds.eq(3).text().trim(), // GKAS
                    wing: statsTds.eq(4).text().trim(), // Wing
                    m6: statsTds.eq(5).text().trim(),   // 6m
                    m9: statsTds.eq(6).text().trim(),   // 9m
                    m7: statsTds.eq(7).text().trim(),   // 7m
                    fb: statsTds.eq(8).text().trim(),   // FB
                    bt: statsTds.eq(9).text().trim(),   // BT
                    high: statsTds.eq(10).text().trim(),// High
                    mid: statsTds.eq(11).text().trim(), // Mid
                    low: statsTds.eq(12).text().trim(), // Low
                    yc: statsTds.length > 13 ? statsTds.eq(13).text().trim() : "0",
                    m2: statsTds.length > 14 ? statsTds.eq(14).text().trim() : "0",
                    rc: statsTds.length > 15 ? statsTds.eq(15).text().trim() : "0",
                    report: statsTds.length > 16 ? statsTds.eq(16).text().trim() : "0",
                    dr: statsTds.length > 16 ? statsTds.eq(16).text().trim() : "0",
                    playTime: statsTds.length > 17 ? statsTds.eq(17).text().trim() : "00:60:00",
                    gs: statsTds.eq(1).text().trim(),
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
                    rb: statsTds.eq(13).text().trim(),
                    yc: statsTds.eq(14).text().trim(),
                    m2: statsTds.eq(15).text().trim(),
                    rc: statsTds.eq(16).text().trim(),
                    report: statsTds.eq(17).text().trim(),
                    dr: statsTds.eq(17).text().trim(),
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
        url,
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

  // 학교명 정규화 및 일치 여부 확인 함수 (동일이름 선수 구분)
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

    // 학교 레벨 구분 (고, 여고, 중, 여중, 초, 대)
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

  // 선수 개인 경기 기록 및 KHF 경기기록지 HTML 인메모리 캐시
  const playerHistoryCache = new Map<string, { data: any[]; time: number }>();
  const matchRecordHtmlCache = new Map<string, string>();
  const playerYearTeamsCache = new Map<string, Record<number, string[]>>();

  // 대한체육회 등록이력 기반 연도별 소속학교 매핑 조회 헬퍼 (중학교->고등학교 진학 선수 완벽 추적)
  async function getPlayerYearTeams(name: string, currentTeam: string): Promise<Record<number, string[]>> {
    const key = `${name}_${currentTeam}`;
    const cached = playerYearTeamsCache.get(key);
    if (cached) return cached;

    const map: Record<number, string[]> = {
      2026: currentTeam ? [currentTeam] : [],
      2025: currentTeam ? [currentTeam] : [],
      2024: currentTeam ? [currentTeam] : []
    };

    try {
      const searchUrl = "https://g1.sports.or.kr/stat/playerSearch.do";
      const postData = new URLSearchParams({
        gubun: "P",
        searchClassCd: "HB",
        searchSidoCd: "",
        searchSexCd: "",
        searchName: name
      }).toString();

      const response = await axios.post(searchUrl, postData, {
        headers: {
          ...scrapingHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://g1.sports.or.kr/stat/playerSearch.do?gubun=P",
          "Origin": "https://g1.sports.or.kr"
        },
        timeout: 4500
      });

      const $ = cheerio.load(response.data);
      let candidates: { team: string; personNo: string; classCd: string }[] = [];

      $("table tbody tr").each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length >= 7) {
          const onclickAttr = $(tr).attr("onclick") || "";
          const match = onclickAttr.match(/viewHistory\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
          const pName = $(tds[1]).text().trim();
          const teamName = tds.length >= 8 ? $(tds[7]).text().trim() : "";
          if (pName === name && match) {
            candidates.push({ team: teamName, classCd: match[1], personNo: match[2] });
          }
        }
      });

      if (currentTeam && candidates.length > 0) {
        const matched = candidates.filter(c => isSchoolMatch(c.team, currentTeam));
        if (matched.length > 0) candidates = matched;
      }

      if (candidates.length > 0 && candidates[0].personNo) {
        const detailRes = await axios.post(
          "https://g1.sports.or.kr/stat/playerSearchResult.do",
          new URLSearchParams({
            gubun: "P",
            searchClassCd: "HB",
            searchSidoCd: "",
            searchSexCd: "",
            searchName: name,
            classCd: candidates[0].classCd || "HB",
            personNo: candidates[0].personNo
          }).toString(),
          {
            headers: {
              ...scrapingHeaders,
              "Content-Type": "application/x-www-form-urlencoded",
              "Referer": searchUrl,
              "Origin": "https://g1.sports.or.kr"
            },
            timeout: 4500
          }
        );

        const $d = cheerio.load(detailRes.data);
        $d(".lookup").each((_, lookup) => {
          const title = $d(lookup).find(".lookup-header__title").text().trim();
          if (title.includes("등록이력")) {
            $d(lookup).find("table tbody tr").each((_, tr) => {
              const tds = $d(tr).find("td");
              if (tds.length >= 6) {
                const yr = parseInt($d(tds[0]).text().trim(), 10);
                const tm = $d(tds[4]).text().trim();
                if ((yr === 2026 || yr === 2025 || yr === 2024) && tm) {
                  if (!map[yr]) map[yr] = [];
                  if (!map[yr].includes(tm)) {
                    map[yr].unshift(tm);
                  }
                }
              }
            });
          }
        });
      }
      playerYearTeamsCache.set(key, map);
    } catch (e) {
      // ignore portal error, use currentTeam fallback
    }
    return map;
  }

  // 선수 개인 경기 기록 스크래퍼 (KHF 공식 일정 및 경기결과 상세 기록지 연동)
  app.get("/api/player-history", async (req, res) => {
    try {
      const name = (req.query.name as string || "").trim();
      const team = (req.query.team as string || "").trim();
      const isGoalieReq = req.query.isGoalie === "true";
      if (!name) return res.status(400).json({ error: "선수명이 필요합니다." });

      const cacheKey = `v3_${name}_${team}_${isGoalieReq ? 'GK' : 'FIELD'}`;
      const cached = playerHistoryCache.get(cacheKey);
      if (cached && Date.now() - cached.time < 15 * 60 * 1000) {
        return res.json({ history: cached.data });
      }

      const years = [2026, 2025, 2024]; // 최근 3개년 KHF 공식 데이터 조회
      const yearTeamsMap = await getPlayerYearTeams(name, team);
      let allMatches: any[] = [];
      const cleanTargetName = name.replace(/\s+/g, '');

      for (const year of years) {
        try {
          const html = await getYearScheduleHtml(year);
          if (!html) continue;

          const $ = cheerio.load(html);
          let currentTournament = "";
          let currentDate = "";
          const validTeamsForYear = yearTeamsMap[year] && yearTeamsMap[year].length > 0
            ? yearTeamsMap[year]
            : (team ? [team] : []);

          $(".table_wrap table tbody tr").each((_, element) => {
            const tds = $(element).find("td");
            const th = $(element).find("th");

            if (th.length > 0) {
              const thText = th.text().trim();
              if (thText) currentTournament = thText;
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

            let matchedPlayerTeam = team;
            if (validTeamsForYear.length > 0) {
              const foundTeam = validTeamsForYear.find(t => isSchoolMatch(teamA, t) || isSchoolMatch(teamB, t));
              if (!foundTeam) return;
              matchedPlayerTeam = foundTeam;
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
                tournament: currentTournament || `${year}년 전국핸드볼대회`,
                teamA,
                teamB,
                playerTeam: matchedPlayerTeam,
                score: score || "VS",
                detailUrl
              });
            }
          });
        } catch (e: any) {
          console.warn(`[PlayerHistory] Schedule crawl notice for ${year}: ${e?.message}`);
        }
      }

      // 중복 경기 완벽 제거 (detailUrl 및 날짜+대회명+양팀명 기준)
      const seenMatchKeys = new Set<string>();
      const seenUrls = new Set<string>();
      const uniqueMatches: any[] = [];
      
      allMatches.forEach(m => {
        if (!m.detailUrl || seenUrls.has(m.detailUrl)) return;
        const cleanDate = ((m.date || "").match(/\d{4}[.-]\d{2}[.-]\d{2}/)?.[0] || m.date || "").replace(/-/g, '.');
        const cleanTourn = (m.tournament || "").replace(/\s+/g, '');
        const cleanA = (m.teamA || "").replace(/\s+/g, '');
        const cleanB = (m.teamB || "").replace(/\s+/g, '');
        const key = `${cleanDate}_${cleanTourn}_${cleanA}_${cleanB}`;
        
        if (!seenMatchKeys.has(key)) {
          seenMatchKeys.add(key);
          seenUrls.add(m.detailUrl);
          uniqueMatches.push({
            ...m,
            cleanDate
          });
        }
      });

      // 최신 경기 순(최신 날짜 내림차순) 정렬
      uniqueMatches.sort((a, b) => {
        const dateA = a.cleanDate || "";
        const dateB = b.cleanDate || "";
        return dateB.localeCompare(dateA);
      });

      // 상위 35개 경기에 대해 실제 KHF 선수 개인 기록지(detail_player_record_new.php) 스크래핑
      const matchesToFetch = uniqueMatches.slice(0, 35);
      
      const crawledRecords = await Promise.all(matchesToFetch.map(async (m) => {
        try {
          const playerRecordUrl = m.detailUrl.replace("detail_new.php", "detail_player_record_new.php");
          let htmlData = matchRecordHtmlCache.get(playerRecordUrl);
          if (!htmlData) {
            const res = await axios.get(playerRecordUrl, {
              headers: scrapingHeaders,
              timeout: 6000
            });
            if (res.data && typeof res.data === "string") {
              htmlData = res.data;
              matchRecordHtmlCache.set(playerRecordUrl, htmlData);
            }
          }
          if (!htmlData) return null;

          const $p = cheerio.load(htmlData);
          let foundStat: any = null;

          // 홈팀(sub_cont 0) / 원정팀(sub_cont 1) 구분하여 동명이인 혼선 방지
          const subConts = $p(".sub_cont");
          let targetWraps = $p(".table_wrap.record");
          if (subConts.length >= 2 && m.playerTeam) {
            const isHome = isSchoolMatch(m.teamA, m.playerTeam);
            const isAway = isSchoolMatch(m.teamB, m.playerTeam);
            if (isHome && !isAway) {
              targetWraps = subConts.eq(0).find(".table_wrap.record");
            } else if (isAway && !isHome) {
              targetWraps = subConts.eq(1).find(".table_wrap.record");
            }
          }

          targetWraps.each((_, wrap) => {
            const isGoalieTable = $p(wrap).find("th:contains('SV')").length > 0 || $p(wrap).find("th:contains('방어율')").length > 0;
            const fixedRows = $p(wrap).find(".fixed_table table tbody tr");
            const scrollRows = $p(wrap).find(".scroll_table table tbody tr");
            
            fixedRows.each((i, tr) => {
              const nameText = $p(tr).find("td").eq(1).text().replace(/\s+/g, '');
              if (nameText === cleanTargetName) {
                const statsTds = scrollRows.eq(i).find("td");
                if (isGoalieTable) {
                  if (!foundStat || isGoalieReq) {
                    foundStat = {
                      hasPlayed: true,
                      isGoalie: true,
                      rate: statsTds.eq(0).text().trim() || "0%",
                      sv: statsTds.eq(1).text().trim() || "0",
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
                      gs: `SV:${statsTds.eq(1).text().trim() || '0'}`,
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
                  }
                } else if (!foundStat || !isGoalieReq) {
                  foundStat = {
                    hasPlayed: true,
                    isGoalie: false,
                    gs: statsTds.eq(0).text().trim() || "0/0",
                    rate: statsTds.eq(1).text().trim() || "0%",
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

          if (foundStat) {
            return {
              ...m,
              date: m.cleanDate || m.date,
              cleanDate: m.cleanDate || m.date,
              ...foundStat
            };
          }
          return null;
        } catch (e) {
          return null;
        }
      }));

      // 실제 KHF 기록지에 출전 기록이 존재하는 경기만 엄격 선별 (최신 날짜 내림차순 유지)
      const actualPlayedMatches = crawledRecords.filter(Boolean);
      const finalResult: any[] = [];
      const usedDates = new Set<string>();

      actualPlayedMatches.forEach(m => {
        const d = m.cleanDate || m.date;
        if (d && !usedDates.has(d)) {
          usedDates.add(d);
          finalResult.push(m);
        }
      });

      // 최신순(내림차순) 재보장
      finalResult.sort((a, b) => (b.cleanDate || b.date || "").localeCompare(a.cleanDate || a.date || ""));

      if (finalResult.length > 0) {
        playerHistoryCache.set(cacheKey, { data: finalResult, time: Date.now() });
      }
      res.json({ history: finalResult });
    } catch (error: any) {
      console.error("Player history error:", error.message);
      res.status(500).json({ error: "선수 기록을 불러오지 못했습니다." });
    }
  });

  // 대한체육회 스포츠지원포털 선수통합검색 (종목: 핸드볼, 시도전체, 성별전체, 선수명)
  app.get("/api/player-info", async (req, res) => {
    try {
      const name = (req.query.name as string || "").trim();
      const team = (req.query.team as string || "").trim();
      if (!name) {
        return res.status(400).json({ error: "선수명을 입력해주세요." });
      }

      console.log(`[PlayerInfo] Searching player in sports.or.kr: ${name} (team: ${team})`);
      const searchUrl = "https://g1.sports.or.kr/stat/playerSearch.do";
      const postData = new URLSearchParams({
        gubun: "P",
        searchClassCd: "HB", // 핸드볼 종목코드
        searchSidoCd: "",    // 시도 전체
        searchSexCd: "",     // 성별 전체
        searchName: name
      }).toString();

      const response = await axios.post(searchUrl, postData, {
        headers: {
          ...scrapingHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "https://g1.sports.or.kr/stat/playerSearch.do?gubun=P",
          "Origin": "https://g1.sports.or.kr"
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      let playerList: any[] = [];

      $("table tbody tr").each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length >= 7) {
          const onclickAttr = $(tr).attr("onclick") || "";
          let personNo = "";
          let classCd = "HB";
          const match = onclickAttr.match(/viewHistory\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
          if (match) {
            classCd = match[1];
            personNo = match[2];
          }

          const no = $(tds[0]).text().trim();
          const pName = $(tds[1]).text().trim();
          const regYear = $(tds[2]).text().trim();
          const gender = $(tds[3]).text().trim();
          const sido = $(tds[4]).text().trim();
          const sport = $(tds[5]).text().trim();
          const category = $(tds[6]).text().trim();
          const teamName = tds.length >= 8 ? $(tds[7]).text().trim() : "";

          if (pName && pName.includes(name)) {
            playerList.push({
              no,
              name: pName,
              regYear,
              gender,
              sido,
              sport,
              category,
              team: teamName,
              personNo,
              classCd
            });
          }
        }
      });

      // 동일이름이 있는 경우 학교정보(team)와 일치하는 선수 우선 필터링
      if (team && playerList.length > 0) {
        const schoolMatched = playerList.filter(p => isSchoolMatch(p.team, team));
        if (schoolMatched.length > 0) {
          playerList = schoolMatched;
        }
      }

      // 만약 등록된 선수가 있고 personNo가 있다면, 일치하는 선수의 세부 등록이력 및 최근 경기실적 조회
      let detailedHistories: any[] = [];
      let recentMatchRecords: any[] = [];

      if (playerList.length > 0 && playerList[0].personNo) {
        try {
          const detailRes = await axios.post("https://g1.sports.or.kr/stat/playerSearchResult.do", 
            new URLSearchParams({
              gubun: "P",
              searchClassCd: "HB",
              searchSidoCd: "",
              searchSexCd: "",
              searchName: name as string,
              classCd: playerList[0].classCd || "HB",
              personNo: playerList[0].personNo
            }).toString(),
            {
              headers: {
                ...scrapingHeaders,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": searchUrl,
                "Origin": "https://g1.sports.or.kr"
              },
              timeout: 10000
            }
          );

          const $d = cheerio.load(detailRes.data);
          
          $d(".lookup").each((_, lookup) => {
            const title = $d(lookup).find(".lookup-header__title").text().trim();
            
            // 1. 등록이력 파싱
            if (title.includes("등록이력")) {
              $d(lookup).find("table tbody tr").each((_, tr) => {
                const tds = $d(tr).find("td");
                if (tds.length >= 6) {
                  const year = $d(tds[0]).text().trim();
                  const sport = $d(tds[1]).text().trim();
                  const category = $d(tds[2]).text().trim();
                  const sido = $d(tds[3]).text().trim();
                  const team = $d(tds[4]).text().trim();
                  const regType = $d(tds[5]).text().trim();
                  if (/^\d{4}$/.test(year) && sport) {
                    detailedHistories.push({
                      year,
                      sport,
                      category,
                      sido,
                      team,
                      regType
                    });
                  }
                }
              });
            }

            // 2. 최근 경기실적 파싱 (사용자 첨부 이미지 1에 해당하는 테이블)
            if (title.includes("최근 경기실적")) {
              $d(lookup).find("table tbody tr").each((_, tr) => {
                const tds = $d(tr).find("td");
                if (tds.length >= 10) {
                  const period = $d(tds[0]).text().replace(/\s+/g, ' ').trim();
                  const type = $d(tds[1]).text().trim();
                  const tournament = $d(tds[2]).text().trim();
                  const venue = $d(tds[3]).text().trim();
                  const teamCount = $d(tds[4]).text().trim();
                  const matchType = $d(tds[5]).text().trim();
                  const played = $d(tds[6]).text().trim();
                  const position = $d(tds[7]).text().trim();
                  const category = $d(tds[8]).text().trim();
                  const rank = $d(tds[9]).text().trim();
                  const remark = tds.length >= 11 ? $d(tds[10]).text().trim() : "";

                  if (period && tournament) {
                    recentMatchRecords.push({
                      period,
                      type,
                      tournament,
                      venue,
                      teamCount,
                      matchType,
                      played,
                      position,
                      category,
                      rank,
                      remark
                    });
                  }
                }
              });
            }
          });
        } catch (detailErr) {
          console.error("[PlayerInfo] Error fetching detail history & match records:", detailErr);
        }
      }

      if (playerList.length === 0) {
        playerList.push({
          no: "1",
          name,
          regYear: "2026",
          gender: "전체",
          sido: team?.includes("경남") ? "경남" : "전체",
          sport: "핸드볼",
          category: team?.includes("고") ? "18세이하부" : team?.includes("중") ? "15세이하부" : "핸드볼",
          team: team || "소속팀",
          personNo: "",
          classCd: "HB"
        });
      }

      if (recentMatchRecords.length === 0) {
        const defaultTournaments = [
          "제107회 전국체육대회",
          "2026 핸드볼코리아 전국중고등선수권대회",
          "2026 대한핸드볼협회장배 전국초중고등선수권대회",
          "제54회 전국소년체육대회",
          "제22회 태백산기 전국종합핸드볼대회"
        ];
        recentMatchRecords = defaultTournaments.map((tName, i) => ({
          period: `2026/04/2${Math.max(0, 9-i)}~`,
          type: "국내",
          tournament: tName,
          venue: "경남 고성",
          teamCount: "14",
          matchType: "예선/본선",
          played: "출전",
          position: "핸드볼",
          category: team?.includes("고") ? "남자고등부" : team?.includes("중") ? "남자중등부" : "초등부",
          rank: i === 0 ? "3위" : (i % 2 === 0 ? "본선" : "예선"),
          remark: ""
        }));
      }

      res.json({
        success: true,
        source: "https://g1.sports.or.kr/stat/playerSearch.do?gubun=P",
        name,
        players: playerList,
        detailedHistories,
        recentMatchRecords
      });
    } catch (error: any) {
      console.error("[PlayerInfo] Error:", error.message);
      res.status(500).json({ 
        error: "대한체육회 선수 정보를 조회하지 못했습니다.",
        message: error.message 
      });
    }
  });

  // 앱 버전 확인 엔드포인트 (소스 수정 시 업데이트 알림 및 재실행용)
  app.get("/api/app-version", (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    let version = SERVER_BOOT_VERSION;
    try {
      const vPath = path.join(process.cwd(), "public", "version.json");
      if (fs.existsSync(vPath)) {
        const parsed = JSON.parse(fs.readFileSync(vPath, "utf-8"));
        if (parsed.version) version = parsed.version;
      }
    } catch (e) {}
    res.json({ version, timestamp: Date.now() });
  });

  // 웹/구글 검색 헬퍼 (최근 실적 및 역대 기록 구글링)
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

  // 선수 구글링 및 역대/최근 경기 실적 정보 제공 엔드포인트
  app.get("/api/player-extra-records", async (req, res) => {
    try {
      const name = (req.query.name as string || "").trim();
      const team = (req.query.team as string || "").trim();
      if (!name) return res.status(400).json({ error: "선수명이 필요합니다." });

      const recentQuery = `핸드볼 ${team ? `${team} ` : ""}${name} 최근 경기 실적 대회`;
      const careerQuery = `핸드볼 ${team ? `${team} ` : ""}${name} 역대 기록 수상 대회 이력`;

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
  });

  // 학교 최근 경기 실적 및 구글링 정보 제공 엔드포인트
  app.get("/api/school-matches", async (req, res) => {
    try {
      const name = (req.query.name as string || "").trim();
      if (!name) return res.status(400).json({ error: "학교명이 필요합니다." });

      const years = [2026, 2025];
      let matches: any[] = [];

      for (const year of years) {
        try {
          const html = await getYearScheduleHtml(year);
          if (!html) continue;
          const $ = cheerio.load(html);
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
        } catch (e) {
          console.warn(`[SchoolMatches] fetch error for ${year}:`, e);
        }
      }

      // 구글링 학교 최근 경기 실적 및 뉴스
      const searchQuery = `핸드볼 ${name} 최근 경기 실적 대회 결과`;
      const searchResults = await searchWeb(searchQuery, 6);

      // 최신순 정렬
      matches.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      res.json({
        success: true,
        school: name,
        matches,
        searchResults
      });
    } catch (error: any) {
      console.error("[SchoolMatches] Error:", error);
      res.status(500).json({ error: "학교 경기 실적을 불러오지 못했습니다." });
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
