const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Referer": "https://khf.handballkorea.com/"
};

const gnKeywords = [
  "창원중앙고", "창원중앙중", "경남체", "반송초", "진주동중",
  "인지중", "양덕여중", "창원시청", "경남개발공사", "경상남도", "경남",
  "고등학교", "중학교", "초등학교"
];

function parsePlayerRecords($p) {
  const subConts = $p(".sub_cont");
  const parseSubCont = (container) => {
    const players = [];
    container.find(".table_wrap.record").each((_, wrap) => {
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
            const svVal = statsTds.eq(1).text().trim() || "0";
            players.push({
              no,
              name,
              isGoalie: true,
              rate: statsTds.eq(0).text().trim() || "0%",
              sv: svVal,
              gs: `SV:${svVal}`,
              gkg: statsTds.length > 2 ? statsTds.eq(2).text().trim() : "0",
              gkas: statsTds.length > 3 ? statsTds.eq(3).text().trim() : "0",
              as: statsTds.length > 3 ? statsTds.eq(3).text().trim() : "0",
              wing: statsTds.length > 4 ? statsTds.eq(4).text().trim() : "0/0",
              m6: statsTds.length > 5 ? statsTds.eq(5).text().trim() : "0/0",
              m9: statsTds.length > 6 ? statsTds.eq(6).text().trim() : "0/0",
              m7: statsTds.length > 7 ? statsTds.eq(7).text().trim() : "0/0",
              fb: statsTds.length > 8 ? statsTds.eq(8).text().trim() : "0/0",
              bt: statsTds.length > 9 ? statsTds.eq(9).text().trim() : "0/0",
              high: statsTds.length > 10 ? statsTds.eq(10).text().trim() : "0/0",
              mid: statsTds.length > 11 ? statsTds.eq(11).text().trim() : "0/0",
              low: statsTds.length > 12 ? statsTds.eq(12).text().trim() : "0/0",
              tf: "0",
              st: "0",
              yc: statsTds.length > 13 ? statsTds.eq(13).text().trim() : "0",
              m2: statsTds.length > 14 ? statsTds.eq(14).text().trim() : "0",
              rc: statsTds.length > 15 ? statsTds.eq(15).text().trim() : "0",
              report: statsTds.length > 16 ? statsTds.eq(16).text().trim() : "0",
              dr: statsTds.length > 16 ? statsTds.eq(16).text().trim() : "0",
              playTime: statsTds.length > 17 ? statsTds.eq(17).text().trim() : "00:00:00"
            });
          } else {
            players.push({
              no,
              name,
              isGoalie: false,
              gs: statsTds.eq(0).text().trim(),
              rate: statsTds.eq(1).text().trim(),
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
            });
          }
        }
      });
    });
    return players;
  };

  if (subConts.length >= 2) {
    return {
      home: parseSubCont(subConts.eq(0)),
      away: parseSubCont(subConts.eq(1))
    };
  } else if (subConts.length === 1) {
    return {
      home: parseSubCont(subConts.eq(0)),
      away: []
    };
  }
  return { home: [], away: [] };
}

async function runPool(items, concurrency, fn) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      try {
        results[cur] = await fn(items[cur], cur);
      } catch (e) {
        results[cur] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  const years = [2026, 2025, 2024];
  const schedules = {};
  const targetDetailMatches = [];

  for (const year of years) {
    const url = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${year}&DS_MONTH=ALL`;
    const res = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(res.data);
    let currentTournament = "";
    let currentDate = "";
    const matches = [];

    $(".table_wrap table tbody tr").each((_, element) => {
      const tds = $(element).find("td");
      const th = $(element).find("th");
      if (th.length > 0) {
        currentTournament = th.text().trim();
      }
      let timeOffset = 0;
      if (tds.length >= 8) {
        const dateText = $(tds[0]).text().replace(/\s+/g, " ").trim();
        if (dateText && (dateText.includes(".") || dateText.includes("-"))) {
          currentDate = dateText;
        }
        timeOffset = 1;
      }
      const time = $(tds[0 + timeOffset]).text().trim();
      const scoreCell = $(tds[1 + timeOffset]);
      const teamA = scoreCell.find(".team.home .name").text().trim();
      const teamB = scoreCell.find(".team.away .name").text().trim();
      const score = scoreCell.find(".score").text().replace(/\s+/g, " ").trim();
      const detailUrlRaw = scoreCell.find(".score").attr("href");
      const category = $(tds[2 + timeOffset]).text().trim();
      const group = $(tds[3 + timeOffset]).text().trim();
      const venue = $(tds[5 + timeOffset]).text().trim();

      let detailUrl = null;
      if (detailUrlRaw && detailUrlRaw !== "#" && !detailUrlRaw.startsWith("javascript")) {
        try {
          detailUrl = new URL(detailUrlRaw, "https://khf.handballkorea.com/competition/schedule_list.php").href;
        } catch (e) {}
      }

      if (teamA && teamB) {
        const cleanDate = (currentDate || "").match(/\d{4}[.-]\d{2}[.-]\d{2}/)?.[0]?.replace(/-/g, ".") || "";
        const mObj = {
          date: currentDate,
          cleanDate,
          time,
          tournament: currentTournament,
          teamA,
          teamB,
          score: score || "VS",
          category,
          group,
          venue,
          detailUrl
        };
        matches.push(mObj);

        if (detailUrl && score && score !== "VS" && score.includes(":")) {
          const isTarget = year === 2026 || gnKeywords.some(k => teamA.includes(k) || teamB.includes(k));
          if (isTarget) {
            targetDetailMatches.push({ ...mObj, year });
          }
        }
      }
    });
    schedules[year] = matches;
  }

  const uniqueTargets = Array.from(new Map(targetDetailMatches.map(m => [m.detailUrl, m])).values());
  console.log(`Fetching player records for ${uniqueTargets.length} matches...`);

  const matchRecordsMap = {};
  await runPool(uniqueTargets, 25, async (m) => {
    const playerRecordUrl = m.detailUrl.replace("detail_new.php", "detail_player_record_new.php");
    const res = await axios.get(playerRecordUrl, { headers, timeout: 12000 });
    const $p = cheerio.load(res.data);
    const pr = parsePlayerRecords($p);
    if (pr.home.length > 0 || pr.away.length > 0) {
      matchRecordsMap[m.detailUrl] = {
        date: m.cleanDate,
        fullDate: m.date,
        tournament: m.tournament,
        teamA: m.teamA,
        teamB: m.teamB,
        score: m.score,
        category: m.category,
        group: m.group,
        venue: m.venue,
        playerRecords: pr
      };
    }
  });

  console.log(`Saved player records for ${Object.keys(matchRecordsMap).length} matches.`);
  const outPath = path.join(__dirname, "..", "public", "khf-static-db.json");
  fs.writeFileSync(outPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    schedules,
    matchRecords: matchRecordsMap
  }));
  console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
})();
