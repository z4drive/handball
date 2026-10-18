import axios from "axios";
import * as cheerio from "cheerio";

const scrapingHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
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
  if (a.includes(b) || b.includes(a)) return true;
  const rootA = a.replace(/(고|여고|중|여중|초|대)$/, "");
  const rootB = b.replace(/(고|여고|중|여중|초|대)$/, "");
  if (rootA && rootB && (rootA.includes(rootB) || rootB.includes(rootA))) return true;
  return false;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const name = (req.query.name as string || "").trim();
    const team = (req.query.team as string || "").trim();
    if (!name) {
      return res.status(400).json({ error: "선수명을 입력해주세요." });
    }

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

    let detailedHistories: any[] = [];
    if (playerList.length > 0 && playerList[0].personNo) {
      try {
        const detailRes = await axios.post("https://g1.sports.or.kr/stat/playerSearchResult.do", 
          new URLSearchParams({
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
            timeout: 8000
          }
        );

        const $d = cheerio.load(detailRes.data);
        $d("table tbody tr").each((_, tr) => {
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
      } catch (e) {
        console.error("Detail history fetch failed", e);
      }
    }

    res.json({
      success: true,
      source: "https://g1.sports.or.kr/stat/playerSearch.do?gubun=P",
      name,
      players: playerList,
      detailedHistories
    });
  } catch (error: any) {
    console.error("Player info error:", error.message);
    res.status(500).json({ error: "선수 정보를 불러오지 못했습니다.", message: error.message });
  }
}
