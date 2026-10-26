/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Menu, ChevronDown, Home, ChevronRight, ArrowUp, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';

interface Match {
  id: string;
  date: string;
  teamA: string;
  teamB: string;
  score: string;
  category: string;
  venue: string;
  detailUrl: string | null;
}

interface PlayerRecord {
  no: string;
  name: string;
  gs: string;
  rate: string;
  m6: string;
  wing: string;
  m9: string;
  m7: string;
  fb: string;
  bt: string;
  as: string;
  tf: string;
  bd?: string;
  bs: string;
  st: string;
  yc: string;
  m2: string;
  rc: string;
  report?: string;
  playTime?: string;
  isGoalie?: boolean;
}

interface MatchDetail {
  tournament: string;
  matchInfo: string;
  group?: string;
  homeTeam: string;
  awayTeam: string;
  totalScore: string;
  periodScores: { label: string; home: string; away: string }[];
  homeIcons: Record<string, string>;
  awayIcons: Record<string, string>;
  tableStats: { label: string; home: string; away: string }[];
  compareBars?: { label: string; home: string; away: string }[];
  playerRecords?: {
    home: PlayerRecord[];
    away: PlayerRecord[];
  };
}

interface ScheduleData {
  tournamentName: string;
  matches: Match[];
}

export default function App() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear.toString());
  const [month, setMonth] = useState(currentMonth.toString());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScheduleData | null>(null);
  const [showTopButton, setShowTopButton] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"list" | "bracket" | "stats">("list");
  const [matchDetail, setMatchDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'compare' | 'players'>('compare');

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedPlayerTeam, setSelectedPlayerTeam] = useState<string | undefined>(undefined);
  const [playerHistory, setPlayerHistory] = useState<any[]>([]);
  const [playerLoading, setPlayerLoading] = useState(false);
  
  // 대한체육회 스포츠지원포털 선수정보 상태
  const [playerPortalInfo, setPlayerPortalInfo] = useState<any | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showPortalTab, setShowPortalTab] = useState(false);

  // 용어설명 팝업 상태 (선택된 단일 용어만 용어 위치 바로 위에 팝업)
  const [activeTerm, setActiveTerm] = useState<{ 
    title: string; 
    desc: string; 
    rect?: { top: number; left: number; bottom: number; right: number; width: number; height: number }; 
  } | null>(null);

  // 학교명 뒤 축약 표시 함수 (대학교->대, 고등학교->고, 중학교->중, 초등학교->초)
  const formatSchoolName = (name?: string): string => {
    if (!name) return "";
    return name
      .replace(/여자고등학교/g, "여고")
      .replace(/고등학교/g, "고")
      .replace(/여자중학교/g, "여중")
      .replace(/중학교/g, "중")
      .replace(/초등학교/g, "초")
      .replace(/대학교/g, "대");
  };

  // 용어사전 (사용자 첨부 이미지 용어설명 기준 매핑)
  const TERM_EXPLANATIONS: Record<string, { title: string; desc: string }> = {
    "6PM": { title: "6PM", desc: "6PM득점" },
    "6M": { title: "6M", desc: "6m득점 (6PM)" },
    "TOTAL SHOOTS": { title: "Total shoots", desc: "슛성공률" },
    "2MIN": { title: "2MIN", desc: "2분퇴장" },
    "2'": { title: "2'", desc: "2분퇴장" },
    "AS": { title: "AS", desc: "어시스트" },
    "WING": { title: "Wing", desc: "윙 득점" },
    "6PM SHOOTS": { title: "6PM shoots", desc: "6m성공률" },
    "6M SHOOTS": { title: "6m shoots", desc: "6m성공률" },
    "RC": { title: "RC", desc: "레드카드" },
    "TF": { title: "TF", desc: "실책" },
    "9PM": { title: "9PM", desc: "9PM득점" },
    "9M": { title: "9M", desc: "9m득점 (9PM)" },
    "WING SHOOTS": { title: "Wing shoots", desc: "윙슛성공률" },
    "DR": { title: "DR", desc: "블루카드" },
    "BC": { title: "BC", desc: "블루카드" },
    "REP": { title: "Report", desc: "블루카드 (보고서 제출 퇴장)" },
    "ST": { title: "ST", desc: "스틸" },
    "7PM": { title: "7PM", desc: "7PM득점" },
    "7M": { title: "7M", desc: "7m득점 (7PM)" },
    "9PM SHOOTS": { title: "9PM shoots", desc: "9m성공률" },
    "9M SHOOTS": { title: "9m shoots", desc: "9m성공률" },
    "RUN": { title: "RUN", desc: "러닝타임" },
    "TIME": { title: "Time", desc: "러닝타임" },
    "BS": { title: "BS", desc: "블록슛" },
    "BD": { title: "BD", desc: "블록된 슛" },
    "FB": { title: "FB", desc: "속공" },
    "FAST SHOOTS": { title: "Fast shoots", desc: "속공성공률" },
    "7PM SHOOTS": { title: "7PM shoots", desc: "7m성공률" },
    "7M SHOOTS": { title: "7m shoots", desc: "7m성공률" },
    "RB": { title: "RB", desc: "리바운드" },
    "YC": { title: "YC", desc: "옐로우카드" },
    "BT": { title: "BT", desc: "돌파득점" },
    "G/S": { title: "G/S", desc: "골 / 슛시도" },
    "%": { title: "%", desc: "슛성공률" },
    "NO.": { title: "No.", desc: "등번호" },
    "NAME": { title: "Name", desc: "선수명" },
  };

  const getTermExplanation = (rawKey: string): { title: string; desc: string } => {
    const clean = rawKey.trim();
    const upper = clean.toUpperCase();
    if (TERM_EXPLANATIONS[upper]) return TERM_EXPLANATIONS[upper];
    if (TERM_EXPLANATIONS[clean]) return TERM_EXPLANATIONS[clean];
    if (upper.includes("TOTAL SHOOT")) return { title: clean, desc: "슛성공률" };
    if (upper.includes("6M") || upper.includes("6PM")) {
      return upper.includes("SHOOT") ? { title: clean, desc: "6m성공률" } : { title: clean, desc: "6PM득점" };
    }
    if (upper.includes("9M") || upper.includes("9PM")) {
      return upper.includes("SHOOT") ? { title: clean, desc: "9m성공률" } : { title: clean, desc: "9PM득점" };
    }
    if (upper.includes("7M") || upper.includes("7PM")) {
      return upper.includes("SHOOT") ? { title: clean, desc: "7m성공률" } : { title: clean, desc: "7PM득점" };
    }
    if (upper.includes("WING")) {
      return upper.includes("SHOOT") ? { title: clean, desc: "윙슛성공률" } : { title: clean, desc: "윙 득점" };
    }
    if (upper.includes("FAST") || upper.includes("FB")) {
      return upper.includes("SHOOT") ? { title: clean, desc: "속공성공률" } : { title: clean, desc: "속공" };
    }
    if (upper.includes("BT")) return { title: clean, desc: "돌파득점" };
    if (upper.includes("2MIN") || upper === "2'") return { title: clean, desc: "2분퇴장" };
    if (upper.includes("RC")) return { title: clean, desc: "레드카드" };
    if (upper.includes("YC")) return { title: clean, desc: "옐로우카드" };
    if (upper.includes("DR") || upper.includes("BC")) return { title: clean, desc: "블루카드" };
    if (upper.includes("TF")) return { title: clean, desc: "실책" };
    if (upper.includes("AS")) return { title: clean, desc: "어시스트" };
    if (upper.includes("ST")) return { title: clean, desc: "스틸" };
    if (upper.includes("BS")) return { title: clean, desc: "블록슛" };
    if (upper.includes("BD")) return { title: clean, desc: "블록된 슛" };
    if (upper.includes("RB")) return { title: clean, desc: "리바운드" };
    if (upper.includes("RUN") || upper.includes("TIME")) return { title: clean, desc: "러닝타임" };
    return { title: clean, desc: clean };
  };

  const handleOpenTerm = (termKey: string, e?: React.MouseEvent) => {
    const item = getTermExplanation(termKey);
    let rect: { top: number; left: number; bottom: number; right: number; width: number; height: number } | undefined;
    if (e && e.currentTarget) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      rect = {
        top: r.top,
        left: r.left,
        bottom: r.bottom,
        right: r.right,
        width: r.width,
        height: r.height,
      };
    }
    setActiveTerm({ ...item, rect });
  };

  const handleCloseTerm = () => {
    // 용어 설명 팝업 닫기: 히스토리 뒤로가기를 호출하지 않고 팝업만 닫아 상세화면에 그대로 머무름
    setActiveTerm(null);
  };

  // 용어 설명 팝업 렌더링 (블러효과 제거, 투명 배경으로 뒤가 보임, 용어 글자 위쪽에 안가리게 팝업 띄움)
  const renderTermExplanationPopup = () => {
    if (!activeTerm) return null;

    const rect = activeTerm.rect;
    let cardStyle: React.CSSProperties = {};
    let isAbove = true;

    if (rect) {
      const termCenterX = rect.left + rect.width / 2;
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 380;
      const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
      
      // 상단 공간이 90px 이상이면 용어 글자 위쪽, 부족하면 글자 아래쪽에 띄움
      isAbove = rect.top >= 90;

      // 팝업 카드가 모바일 화면 양옆으로 벗어나지 않도록 클램핑
      const popupHalfWidth = 85;
      const clampedLeft = Math.max(popupHalfWidth + 12, Math.min(screenWidth - popupHalfWidth - 12, termCenterX));

      if (isAbove) {
        // 글자 위쪽에 글자를 가리지 않게 띄움 (글자 위 8px 간격)
        cardStyle = {
          position: 'fixed',
          left: `${clampedLeft}px`,
          bottom: `${Math.max(12, screenHeight - rect.top + 8)}px`,
          transform: 'translateX(-50%)',
        };
      } else {
        // 글자 아래쪽에 글자를 가리지 않게 띄움 (글자 아래 8px 간격)
        cardStyle = {
          position: 'fixed',
          left: `${clampedLeft}px`,
          top: `${Math.max(12, rect.bottom + 8)}px`,
          transform: 'translateX(-50%)',
        };
      }
    } else {
      cardStyle = {
        position: 'fixed',
        left: '50%',
        top: '40%',
        transform: 'translate(-50%, -50%)',
      };
    }

    return (
      <div 
        className="fixed inset-0 z-[120] bg-transparent"
        onClick={handleCloseTerm}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          style={cardStyle}
          className="relative bg-white rounded-2xl p-3.5 shadow-2xl border border-slate-200/90 text-center space-y-1.5 animate-in zoom-in-95 duration-150 min-w-[150px] max-w-[240px] pointer-events-auto"
        >
          <div className="flex items-center justify-between pb-1 border-b border-gray-100 gap-2">
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              용어설명
            </span>
            <button 
              onClick={handleCloseTerm}
              className="text-gray-400 hover:text-gray-600 text-xs font-bold px-1 py-0.5 leading-none transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="py-0.5">
            <div className="text-sm font-black text-slate-900 tracking-tight">
              {activeTerm.title}
            </div>
            <div className="text-xs font-bold text-slate-700 mt-0.5">
              {activeTerm.desc}
            </div>
          </div>
          {/* 용어 위치 가리키는 꼬리 (글자 위쪽에 뜰 때) */}
          {rect && isAbove && (
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 border-r border-b border-slate-200/90 shadow-2xs pointer-events-none" />
          )}
          {/* 용어 위치 가리키는 꼬리 (글자 아래쪽에 뜰 때) */}
          {rect && !isAbove && (
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 border-l border-t border-slate-200/90 shadow-2xs pointer-events-none" />
          )}
        </div>
      </div>
    );
  };

  const handleClosePlayer = () => {
    if (window.history.state?.modal === 'player') {
      window.history.back();
    } else {
      setSelectedPlayer(null);
      setPlayerPortalInfo(null);
      setShowPortalTab(false);
    }
  };

  const handleCloseDetail = () => {
    if (window.history.state?.modal === 'matchDetail') {
      window.history.back();
    } else {
      setMatchDetail(null);
      setDetailLoading(false);
      setActiveDetailTab('compare');
    }
  };

  // 모바일 뒤로가기 버튼 클릭 시 앱이 닫히지 않고 직전 화면으로 이동
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // 1. 용어 팝업이 열려있다면 용어 팝업 닫기
      setActiveTerm(null);

      const state = e.state;
      if (!state || !state.modal) {
        // 메인 화면으로 복귀
        setSelectedPlayer(null);
        setPlayerPortalInfo(null);
        setShowPortalTab(false);
        setMatchDetail(null);
        setDetailLoading(false);
        setActiveDetailTab('compare');
      } else if (state.modal === 'matchDetail') {
        // 경기 상세 화면 유지 (선수 기록 모달만 닫기)
        setSelectedPlayer(null);
        setPlayerPortalInfo(null);
        setShowPortalTab(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const schools = [
    "창원중앙고등학교", 
    "창원중앙중", 
    "반송초등학교", 
    "고등학교", 
    "중학교", 
    "초등학교"
  ];

  // Cache key helper - Updated version to v18 to clear old data
  const getCacheKey = (y: string, m: string) => `handball_schedule_v18_${y}_${m}`;
  const getSavedKey = (y: string, m: string) => `handball_saved_v18_${y}_${m}`;

  const fetchScheduleFallback = async (y: string, m: string): Promise<ScheduleData | null> => {
    const targetUrl = `https://khf.handballkorea.com/competition/schedule_list.php?SEASON_ID=${y}&DS_MONTH=${m}&GROUP_CD=`;
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const pUrl of proxyUrls) {
      try {
        const res = await axios.get(pUrl, { timeout: 12000 });
        if (typeof res.data === 'string' && res.data.includes("table_wrap")) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(res.data, "text/html");
          const matches: Match[] = [];
          let currentTournament = "";
          let currentDate = "";

          const rows = doc.querySelectorAll(".table_wrap table tbody tr");
          rows.forEach((element) => {
            const tds = element.querySelectorAll("td");
            const th = element.querySelector("th");

            if (th) {
              currentTournament = th.textContent?.trim() || "";
            }

            let timeOffset = 0;
            if (tds.length >= 8) {
              const dateText = tds[0]?.textContent?.replace(/\s+/g, ' ').trim() || "";
              if (dateText && (dateText.includes('.') || dateText.includes('-'))) {
                currentDate = dateText;
              }
              timeOffset = 1;
            }

            const timeText = tds[0 + timeOffset]?.textContent?.trim() || "";
            const timeMatch = timeText.match(/([012]\d:[0-5]\d)/);
            const time = timeMatch ? timeMatch[1] : "";

            const scoreCell = tds[1 + timeOffset];
            if (!scoreCell) return;
            const teamA = scoreCell.querySelector(".team.home .name")?.textContent?.trim() || "";
            const teamB = scoreCell.querySelector(".team.away .name")?.textContent?.trim() || "";
            const score = scoreCell.querySelector(".score")?.textContent?.trim() || "";

            const categoryBase = tds[2 + timeOffset]?.textContent?.trim() || "";
            const remarks = tds[5 + timeOffset]?.textContent?.trim() || "";
            let category = categoryBase;
            if (remarks && remarks !== "기록지" && remarks !== "-" && !category.includes(remarks)) {
              category = `${category} - ${remarks}`;
            }

            const venue = tds[3 + timeOffset]?.textContent?.trim() || "";
            const detailUrlRaw = scoreCell.querySelector(".score")?.getAttribute("href");
            let detailUrl: string | null = null;
            if (detailUrlRaw && detailUrlRaw !== "#" && !detailUrlRaw.startsWith("javascript")) {
              try {
                detailUrl = new URL(detailUrlRaw, "https://khf.handballkorea.com/competition/schedule_list.php").href;
              } catch (e) {
                detailUrl = null;
              }
            }
            const id = detailUrl ? new URLSearchParams(detailUrl.split('?')[1]).get('GAME_CD') || Math.random().toString(36).substring(2, 11) : Math.random().toString(36).substring(2, 11);

            if (teamA && teamB) {
              matches.push({
                id,
                date: `${currentDate} ${time}`.trim(),
                teamA,
                teamB,
                score: score || "VS",
                category: category || "기타",
                venue,
                detailUrl
              });
            }
          });

          const uniqueMatches = Array.from(new Map(matches.map(m => [`${m.teamA}-${m.teamB}-${m.date}`, m])).values());
          uniqueMatches.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return b.date.localeCompare(a.date);
          });

          return {
            tournamentName: currentTournament || "조회된 대회 없음",
            matches: uniqueMatches
          };
        }
      } catch (err) {
        console.warn("Fallback proxy attempt failed:", err);
      }
    }
    return null;
  };

  const fetchData = async (y: string, m: string, isRefetch = false) => {
    const savedKey = getSavedKey(y, m);
    const cacheKey = getCacheKey(y, m);

    if (!isRefetch) {
      // Check saved data first
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        setData(JSON.parse(saved));
        return;
      }
      
      // Check normal cache
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setData(JSON.parse(cached));
        return;
      }
    }

    setLoading(true);
    try {
      let fetchedData: ScheduleData | null = null;
      try {
        const response = await axios.get(`/api/schedule?year=${y}&month=${m}`, { timeout: 15000 });
        if (response.data && response.data.matches && response.data.matches.length > 0) {
          fetchedData = response.data;
        } else if (response.data && response.data.tournamentName && response.data.tournamentName !== "조회된 대회 없음") {
          fetchedData = response.data;
        }
      } catch (apiErr) {
        console.warn("API route failed, trying client-side fallback proxy...", apiErr);
      }

      // If backend API returned empty or failed (such as on Vercel static or blocked IP)
      if (!fetchedData || !fetchedData.matches || fetchedData.matches.length === 0) {
        const fallbackData = await fetchScheduleFallback(y, m);
        if (fallbackData) {
          fetchedData = fallbackData;
        }
      }

      if (fetchedData) {
        setData(fetchedData);
        localStorage.setItem(cacheKey, JSON.stringify(fetchedData));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (data) {
      const savedKey = getSavedKey(year, month);
      localStorage.setItem(savedKey, JSON.stringify(data));
      // Simple feedback: could be a state but I'll avoid adding unrequested state for now
    }
  };

  const fetchDetail = async (url: string) => {
    window.history.pushState({ modal: 'matchDetail' }, '');
    const cacheKey = `match_detail_${url}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      setMatchDetail(JSON.parse(cached));
      return;
    }

    setDetailLoading(true);
    try {
      const response = await axios.get(`/api/match-detail?url=${encodeURIComponent(url)}`);
      setMatchDetail(response.data);
      localStorage.setItem(cacheKey, JSON.stringify(response.data));
    } catch (error) {
      console.error("Error fetching detail:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchPlayerHistory = async (playerName: string, teamName?: string, isRefetch = false) => {
    if (!selectedPlayer) {
      window.history.pushState({ modal: 'player' }, '');
    }
    setSelectedPlayer(playerName);
    setSelectedPlayerTeam(teamName);
    
    const savedKey = `player_saved_v18_${playerName}_${teamName || 'all'}`;
    const cacheKey = `player_history_v18_${playerName}_${teamName || 'all'}`;

    if (!isRefetch) {
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        setPlayerHistory(JSON.parse(saved));
        return;
      }

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setPlayerHistory(JSON.parse(cached));
        return;
      }
    }

    setPlayerLoading(true);
    setPlayerHistory([]);
    try {
      const url = `/api/player-history?name=${encodeURIComponent(playerName)}${teamName ? `&team=${encodeURIComponent(teamName)}` : ''}`;
      const response = await axios.get(url);
      const history = response.data.history || [];
      setPlayerHistory(history);
      localStorage.setItem(cacheKey, JSON.stringify(history));
    } catch (error) {
      console.error("Player history fetch error:", error);
    } finally {
      setPlayerLoading(false);
    }
  };

  const handlePlayerSave = () => {
    if (selectedPlayer && playerHistory.length > 0) {
      const savedKey = `player_saved_v18_${selectedPlayer}_${selectedPlayerTeam || 'all'}`;
      localStorage.setItem(savedKey, JSON.stringify(playerHistory));
    }
  };

  // 학교명 정규화 및 일치 여부 확인 함수 (동일이름 선수 구분)
  const normalizeSchool = (str?: string): string => {
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
  };

  const isSchoolMatch = (schoolA?: string, schoolB?: string): boolean => {
    if (!schoolA || !schoolB) return false;
    const a = normalizeSchool(schoolA);
    const b = normalizeSchool(schoolB);
    if (!a || !b) return false;
    if (a.includes(b) || b.includes(a)) return true;
    const rootA = a.replace(/(고|여고|중|여중|초|대)$/, "");
    const rootB = b.replace(/(고|여고|중|여중|초|대)$/, "");
    if (rootA && rootB && (rootA.includes(rootB) || rootB.includes(rootA))) return true;
    return false;
  };

  // 대한체육회 스포츠지원포털 선수통합검색 (종목: 핸드볼, 시도전체, 성별전체, 선수명, 학교정보)
  const fetchPlayerPortalInfo = async (playerName: string, teamName?: string, isRefetch = false) => {
    setShowPortalTab(true);
    const cacheKey = `portal_player_v2_${playerName}_${teamName || 'all'}`;

    if (!isRefetch) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          setPlayerPortalInfo(JSON.parse(cached));
          return;
        } catch (e) {
          // ignore cache parse error
        }
      }
    }

    setPortalLoading(true);
    setPlayerPortalInfo(null);

    try {
      const url = `/api/player-info?name=${encodeURIComponent(playerName)}${teamName ? `&team=${encodeURIComponent(teamName)}` : ''}`;
      const res = await axios.get(url);
      if (res.data && res.data.players) {
        setPlayerPortalInfo(res.data);
        localStorage.setItem(cacheKey, JSON.stringify(res.data));
      } else {
        throw new Error("No player data returned");
      }
    } catch (error) {
      console.warn("Backend /api/player-info failed, trying client fallback:", error);
      try {
        const targetUrl = "https://g1.sports.or.kr/stat/playerSearch.do";
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await axios.post(proxyUrl, new URLSearchParams({
          gubun: "P",
          searchClassCd: "HB",
          searchSidoCd: "",
          searchSexCd: "",
          searchName: playerName
        }).toString(), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000
        });

        const parser = new DOMParser();
        const doc = parser.parseFromString(res.data, 'text/html');
        const rows = doc.querySelectorAll('table tbody tr');
        let players: any[] = [];

        rows.forEach(tr => {
          const tds = tr.querySelectorAll('td');
          if (tds.length >= 7) {
            const no = tds[0]?.textContent?.trim() || "";
            const pName = tds[1]?.textContent?.trim() || "";
            const regYear = tds[2]?.textContent?.trim() || "";
            const gender = tds[3]?.textContent?.trim() || "";
            const sido = tds[4]?.textContent?.trim() || "";
            const sport = tds[5]?.textContent?.trim() || "";
            const category = tds[6]?.textContent?.trim() || "";
            const team = tds.length >= 8 ? (tds[7]?.textContent?.trim() || "") : "";
            if (pName && pName.includes(playerName)) {
              players.push({ no, name: pName, regYear, gender, sido, sport, category, team });
            }
          }
        });

        // 동일이름이 있고 학교정보(teamName)가 있을 경우 학교 일치 선수만 필터링
        if (teamName && players.length > 0) {
          const matched = players.filter(p => isSchoolMatch(p.team, teamName));
          if (matched.length > 0) {
            players = matched;
          }
        }

        const fallbackData = {
          success: true,
          source: "https://g1.sports.or.kr/stat/playerSearch.do?gubun=P",
          name: playerName,
          team: teamName,
          players
        };
        setPlayerPortalInfo(fallbackData);
        localStorage.setItem(cacheKey, JSON.stringify(fallbackData));
      } catch (fbErr) {
        console.error("Portal fallback fetch failed:", fbErr);
      }
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    fetchData(year, month);
  }, [year, month]);

  useEffect(() => {
    const handleScroll = () => {
      setShowTopButton(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (matchDetail || detailLoading) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900 pb-20">
        {/* Detail Page Header */}
        <div className="bg-white px-6 pt-8 pb-4 border-b border-gray-100 sticky top-0 z-50 flex items-center">
          <button 
            onClick={handleCloseDetail}
            className="p-2 -ml-2 bg-gray-50 rounded-full text-slate-600 mr-4"
          >
            <ChevronDown className="w-6 h-6 rotate-90" />
          </button>
          <h1 className="text-xl font-black text-slate-800">경기 결과 상세</h1>
        </div>

        <div className="max-w-md mx-auto">
          {detailLoading ? (
            <div className="py-20 flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-500 font-medium">데이터를 분석하고 있습니다...</p>
            </div>
          ) : matchDetail && (
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="text-center py-6 bg-gray-50 rounded-2xl mb-4 border border-gray-100 shadow-sm">
                <div className="text-slate-800 text-lg font-black mb-1">{matchDetail.tournament}</div>
                {matchDetail.group && (
                  <div className="inline-block bg-indigo-50 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full mb-2 uppercase">
                    {matchDetail.group}
                  </div>
                )}
                <div className="text-gray-400 text-sm font-medium">{matchDetail.matchInfo}</div>
              </div>

              {/* Professional Scoreboard */}
              <div className="flex items-center justify-between py-6 px-4 bg-white rounded-3xl border border-gray-100 shadow-lg shadow-slate-100/60">
                {/* Home */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`text-4xl sm:text-5xl font-black mb-2 transition-all duration-300 ${
                    (parseInt(matchDetail.totalScore.split(':')[0]) || 0) > (parseInt(matchDetail.totalScore.split(':')[1]) || 0) 
                      ? 'text-red-600 scale-105' : 'text-slate-800'}`}>
                    {matchDetail.totalScore.split(':')[0] || '0'}
                  </div>
                  <span className="text-sm sm:text-base font-black text-slate-800 text-center break-keep leading-tight px-1">
                    {formatSchoolName(matchDetail.homeTeam)}
                  </span>
                </div>

                {/* Center: Period Scores (전반전 / 후반전 각각 밑에 점수 표시) */}
                <div className="flex flex-col items-center justify-center px-4 py-2.5 bg-slate-900 text-white rounded-2xl shadow-md min-w-[90px] space-y-1.5 border border-slate-800 mx-2">
                  {matchDetail.periodScores && matchDetail.periodScores.length > 0 ? (
                    matchDetail.periodScores.map((period, i) => (
                      <div key={i} className="flex flex-col items-center w-full">
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider">
                          {period.label}
                        </span>
                        <span className="text-sm font-black text-white tracking-widest tabular-nums mt-0.5">
                          {period.home} : {period.away}
                        </span>
                        {i < matchDetail.periodScores.length - 1 && (
                          <div className="w-10 h-px bg-slate-800 my-1"></div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center py-1">
                      <span className="text-xs font-black text-slate-400 tracking-widest">VS</span>
                    </div>
                  )}
                </div>

                {/* Away */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`text-4xl sm:text-5xl font-black mb-2 transition-all duration-300 ${
                    (parseInt(matchDetail.totalScore.split(':')[1]) || 0) > (parseInt(matchDetail.totalScore.split(':')[0]) || 0) 
                      ? 'text-red-600 scale-105' : 'text-slate-800'}`}>
                    {matchDetail.totalScore.split(':')[1] || '0'}
                  </div>
                  <span className="text-sm sm:text-base font-black text-slate-800 text-center break-keep leading-tight px-1">
                    {formatSchoolName(matchDetail.awayTeam)}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex p-1 bg-gray-100 rounded-2xl mb-6">
                <button 
                  onClick={() => setActiveDetailTab('compare')}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                    activeDetailTab === 'compare' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  양팀비교
                </button>
                <button 
                  onClick={() => setActiveDetailTab('players')}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                    activeDetailTab === 'players' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  선수기록
                </button>
              </div>

              {activeDetailTab === 'compare' ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Team Header for comparison */}
                  <div className="flex items-center justify-between px-4 mb-4 bg-slate-50 py-3 rounded-2xl">
                    <span className="text-xs font-black text-slate-800 flex-1">{formatSchoolName(matchDetail.homeTeam)}</span>
                    <span className="text-[10px] font-black text-gray-300 mx-4">VS</span>
                    <span className="text-xs font-black text-slate-800 flex-1 text-right">{formatSchoolName(matchDetail.awayTeam)}</span>
                  </div>

                  {/* Comparison Bars */}
                  <div className="space-y-6 px-2">
                    {(matchDetail.compareBars || []).map((stat, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <div className="flex justify-between w-full mb-1.5 px-2">
                          <span className="text-xs font-black text-slate-700">{stat.home}</span>
                          <button 
                            onClick={(e) => handleOpenTerm(stat.label, e)}
                            className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-indigo-600 underline decoration-dotted decoration-gray-300 underline-offset-2"
                          >
                            {stat.label}
                          </button>
                          <span className="text-xs font-black text-slate-700">{stat.away}</span>
                        </div>
                        <div className="flex items-center w-full space-x-1">
                          <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden flex justify-end">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(parseFloat(stat.home) / (parseFloat(stat.home) + parseFloat(stat.away) || 1)) * 100}%` }}
                              className="bg-indigo-600 h-full rounded-full"
                            />
                          </div>
                          <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(parseFloat(stat.away) / (parseFloat(stat.home) + parseFloat(stat.away) || 1)) * 100}%` }}
                              className="bg-red-500 h-full rounded-full"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Detailed Team Stats */}
                  <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Detailed Team Stats</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {matchDetail.tableStats.map((stat, i) => (
                        <div key={i} className="flex items-center px-6 py-4 hover:bg-slate-50 transition-colors">
                          <div className="w-1/3 text-sm font-black text-slate-800">{stat.home}</div>
                          <div className="w-1/3 text-center">
                            <button 
                              onClick={(e) => handleOpenTerm(stat.label, e)}
                              className="text-[10px] font-black text-gray-400 bg-gray-50 px-3 py-1 rounded-full uppercase hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                              {stat.label}
                            </button>
                          </div>
                          <div className="w-1/3 text-right text-sm font-black text-slate-800">{stat.away}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
                  {matchDetail.playerRecords ? (
                    <div className="space-y-8">
                      {[
                        { team: 'home', name: matchDetail.homeTeam, players: matchDetail.playerRecords.home },
                        { team: 'away', name: matchDetail.awayTeam, players: matchDetail.playerRecords.away }
                      ].map((t, idx) => (
                        <div key={idx} className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-xl shadow-slate-100">
                          <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                            <span className="text-sm font-black text-white">{formatSchoolName(t.name)}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Player Roster</span>
                          </div>
                          <div className="overflow-x-auto scrollbar-hide">
                            <table className="w-full text-center border-collapse whitespace-nowrap min-w-max">
                              <thead>
                                <tr className="bg-slate-50/80 border-b border-gray-100">
                                  <th onClick={(e) => handleOpenTerm('No.', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 sticky left-0 bg-slate-50 z-20 cursor-pointer hover:text-indigo-600 uppercase min-w-[28px]">No.</th>
                                  <th onClick={(e) => handleOpenTerm('Name', e)} className="px-1.5 py-2 text-[10px] font-black text-gray-400 sticky left-[28px] bg-slate-50 z-20 border-r border-gray-100 cursor-pointer hover:text-indigo-600 uppercase text-left min-w-[48px]">Name</th>
                                  <th onClick={(e) => handleOpenTerm('G/S', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">G/S</th>
                                  <th onClick={(e) => handleOpenTerm('%', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">%</th>
                                  <th onClick={(e) => handleOpenTerm('6M', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">6M</th>
                                  <th onClick={(e) => handleOpenTerm('Wing', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">Wing</th>
                                  <th onClick={(e) => handleOpenTerm('9M', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">9M</th>
                                  <th onClick={(e) => handleOpenTerm('7M', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">7M</th>
                                  <th onClick={(e) => handleOpenTerm('FB', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">FB</th>
                                  <th onClick={(e) => handleOpenTerm('BT', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">BT</th>
                                  <th onClick={(e) => handleOpenTerm('AS', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">AS</th>
                                  <th onClick={(e) => handleOpenTerm('TF', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">TF</th>
                                  <th onClick={(e) => handleOpenTerm('BD', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">BD</th>
                                  <th onClick={(e) => handleOpenTerm('BS', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">BS</th>
                                  <th onClick={(e) => handleOpenTerm('ST', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">ST</th>
                                  <th onClick={(e) => handleOpenTerm('YC', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">YC</th>
                                  <th onClick={(e) => handleOpenTerm("2'", e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">2'</th>
                                  <th onClick={(e) => handleOpenTerm('RC', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">RC</th>
                                  <th onClick={(e) => handleOpenTerm('Rep', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">Rep</th>
                                  <th onClick={(e) => handleOpenTerm('Time', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">Time</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {t.players.map((p, i) => (
                                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-1 py-2 text-xs font-black text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50 z-10 text-center">{p.no}</td>
                                    <td className="px-1.5 py-2 text-xs font-black text-indigo-600 sticky left-[28px] bg-white group-hover:bg-slate-50 z-10 border-r border-gray-100 whitespace-nowrap text-left">
                                      <button 
                                        onClick={() => fetchPlayerHistory(p.name, t.name)}
                                        className="hover:underline text-left font-bold"
                                      >
                                        {p.name}
                                      </button>
                                    </td>
                                    {p.isGoalie ? (
                                      <>
                                        <td className="px-1 py-2 text-xs font-black text-slate-800 text-center">{p.gs}</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-400 text-center">{p.rate}%</td>
                                        <td colSpan={6} className="bg-gray-50/30"></td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.as}</td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.tf}</td>
                                        <td className="px-1 py-2 text-xs font-black text-slate-400 text-center"></td>
                                        <td className="px-1 py-2 text-xs font-black text-slate-400 text-center"></td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.st}</td>
                                        <td colSpan={3}></td>
                                        <td className="px-1 py-2 text-[10px] font-bold text-gray-400 text-center"></td>
                                        <td className="px-1 py-2 text-[10px] font-bold text-slate-500 text-center whitespace-nowrap">{p.playTime}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-1 py-2 text-xs font-black text-slate-800 text-center">{p.gs}</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-400 text-center">{p.rate}%</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.m6}</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.wing}</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.m9}</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.m7}</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.fb}</td>
                                        <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.bt}</td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.as}</td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.tf}</td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.bd}</td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.bs}</td>
                                        <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.st}</td>
                                        <td className="px-1 py-2 text-center">
                                          {p.yc !== '0' && p.yc && <span className="w-4 h-4 bg-yellow-400 rounded-xs inline-flex items-center justify-center text-[9px] text-white font-black shadow-2xs">{p.yc}</span>}
                                        </td>
                                        <td className="px-1 py-2 text-center">
                                          {p.m2 !== '0' && p.m2 && <span className="w-4 h-4 bg-indigo-500 rounded-xs inline-flex items-center justify-center text-[9px] text-white font-black shadow-2xs">{p.m2}</span>}
                                        </td>
                                        <td className="px-1 py-2 text-center">
                                          {p.rc !== '0' && p.rc && <span className="w-4 h-4 bg-red-500 rounded-xs inline-flex items-center justify-center text-[9px] text-white font-black shadow-2xs">{p.rc}</span>}
                                        </td>
                                        <td className="px-1 py-2 text-[10px] font-bold text-gray-400 text-center">{p.report}</td>
                                        <td className="px-1 py-2 text-[10px] font-bold text-slate-500 text-center whitespace-nowrap">{p.playTime}</td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 text-center bg-gray-50 rounded-3xl">
                      <p className="text-gray-400 font-bold">선수 기록 정보가 공개되지 않았습니다.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Player Modal (Keep for History) */}
        <AnimatePresence>
          {selectedPlayer && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
            >
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="bg-white w-full max-w-2xl rounded-t-[40px] sm:rounded-[40px] h-[85vh] flex flex-col overflow-hidden shadow-2xl"
              >
                <div className="p-8 border-b border-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10"></div>
                    <div className="text-center">
                      <h2 className="text-2xl font-black text-slate-800">
                        {selectedPlayer} {showPortalTab ? '선수 정보' : '선수 기록'}
                      </h2>
                      <p className="text-xs text-indigo-600 font-black mt-1 uppercase tracking-widest">
                        {showPortalTab ? '대한체육회 스포츠지원포털 통합검색' : 'Season Match History'}
                      </p>
                    </div>
                    <button 
                      onClick={handleClosePlayer}
                      className="p-3 bg-gray-50 rounded-full text-gray-400 hover:text-gray-600 transition-colors shadow-inner"
                    >
                      <ChevronDown className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button 
                      onClick={handlePlayerSave}
                      className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
                    >
                      저장
                    </button>
                    <button 
                      onClick={() => {
                        fetchPlayerHistory(selectedPlayer!, selectedPlayerTeam, true);
                        if (showPortalTab) {
                          fetchPlayerPortalInfo(selectedPlayer!, selectedPlayerTeam, true);
                        }
                      }}
                      className="px-4 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-black rounded-full border border-slate-200 hover:bg-slate-100 transition-colors"
                    >
                      재조회
                    </button>
                    <button 
                      onClick={() => {
                        if (showPortalTab) {
                          setShowPortalTab(false);
                        } else {
                          fetchPlayerPortalInfo(selectedPlayer!, selectedPlayerTeam);
                        }
                      }}
                      className={`px-4 py-1.5 ${showPortalTab ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200'} text-[10px] font-black rounded-full border hover:bg-indigo-50 hover:text-indigo-600 transition-colors`}
                    >
                      선수정보
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* 선수정보 클릭 시 선수이름 밑에 스크롤 되면서 보이는 선수상세정보 */}
                  {showPortalTab && (
                    <div className="bg-indigo-50/40 rounded-3xl p-5 border border-indigo-100/80 shadow-xs space-y-3 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between pb-2 border-b border-indigo-100/60">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-black text-indigo-950">대한체육회 선수 상세정보</span>
                          {selectedPlayerTeam && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                              {selectedPlayerTeam} 일치
                            </span>
                          )}
                        </div>
                        <a 
                          href="https://g1.sports.or.kr/stat/playerSearch.do?gubun=P"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-white text-indigo-600 text-[10px] font-black rounded-xl border border-indigo-200 shadow-sm hover:bg-indigo-50 flex items-center space-x-1"
                        >
                          <span>스포츠지원포털</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* 선수상세정보 내부 스크롤 영역 */}
                      <div className="max-h-64 sm:max-h-72 overflow-y-auto space-y-3 pr-1">
                        {portalLoading ? (
                          <div className="flex flex-col items-center justify-center py-10 space-y-3">
                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-bold text-slate-400">대한체육회 포털 선수 정보 조회 중...</p>
                          </div>
                        ) : (() => {
                          // 동일이름이 있으면 학교정보(selectedPlayerTeam)와 일치하는 선수만 필터링
                          const matchedPortalPlayers = (playerPortalInfo?.players || []).filter((p: any) => 
                            !selectedPlayerTeam || isSchoolMatch(p.team, selectedPlayerTeam)
                          );
                          const displayPlayers = matchedPortalPlayers.length > 0 ? matchedPortalPlayers : (playerPortalInfo?.players || []);

                          return displayPlayers.length > 0 ? (
                            <div className="space-y-4">
                              {/* 검색된 선수 카드 */}
                              {displayPlayers.map((p: any, idx: number) => (
                                <div key={idx} className="bg-white p-4 rounded-2xl border border-indigo-100/70 space-y-3 shadow-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-sm font-black text-slate-800">{p.name}</span>
                                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${p.gender === '남자' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                        {p.gender}
                                      </span>
                                      <span className="text-[9px] font-black px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
                                        {p.sport || '핸드볼'}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400">
                                      최초등록 {p.regYear}년
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
                                    <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                                      <div className="text-[9px] text-gray-400 font-bold uppercase">소속팀(학교)</div>
                                      <div className="text-xs font-black text-slate-800 mt-0.5 truncate">{p.team || '-'}</div>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                                      <div className="text-[9px] text-gray-400 font-bold uppercase">종별</div>
                                      <div className="text-xs font-black text-slate-800 mt-0.5 truncate">{p.category || '-'}</div>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                                      <div className="text-[9px] text-gray-400 font-bold uppercase">시도</div>
                                      <div className="text-xs font-black text-slate-800 mt-0.5 truncate">{p.sido || '-'}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {/* 경기인 등록 이력 (상세) */}
                              {playerPortalInfo?.detailedHistories && playerPortalInfo.detailedHistories.length > 0 && (
                                <div className="space-y-2 pt-1">
                                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                                    경기인 등록 이력
                                  </div>
                                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-gray-100">
                                          <th className="px-3 py-2 text-[9px] font-black text-gray-400 text-center">등록년도</th>
                                          <th className="px-3 py-2 text-[9px] font-black text-gray-400 text-center">소속팀(학교)</th>
                                          <th className="px-3 py-2 text-[9px] font-black text-gray-400 text-center">종별</th>
                                          <th className="px-3 py-2 text-[9px] font-black text-gray-400 text-center">시도</th>
                                          <th className="px-3 py-2 text-[9px] font-black text-gray-400 text-center">구분</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {playerPortalInfo.detailedHistories.map((hist: any, hIdx: number) => (
                                          <tr key={hIdx} className="hover:bg-slate-50/50">
                                            <td className="px-3 py-2 font-black text-slate-700 text-center">{hist.year}</td>
                                            <td className="px-3 py-2 font-bold text-slate-800 text-center">{hist.team}</td>
                                            <td className="px-3 py-2 text-slate-500 text-center">{hist.category}</td>
                                            <td className="px-3 py-2 text-slate-400 text-center">{hist.sido}</td>
                                            <td className="px-3 py-2 text-slate-400 text-center text-[10px]">{hist.regType}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="py-6 text-center text-xs text-slate-500 font-bold">
                              대한체육회 포털에 등록된 '{selectedPlayer}' 선수 정보가 없습니다.
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* 선수 경기 기록 (동일이름 구분: 학교정보와 일치하는 경기만 표시) */}
                  {playerLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4">
                      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-black text-slate-300 uppercase tracking-widest">Fetching season data...</p>
                    </div>
                  ) : (() => {
                    const filteredMatches = selectedPlayerTeam 
                      ? playerHistory.filter(h => isSchoolMatch(h.teamA, selectedPlayerTeam) || isSchoolMatch(h.teamB, selectedPlayerTeam))
                      : playerHistory;
                    const matchesToShow = filteredMatches.length > 0 ? filteredMatches : playerHistory;

                    return matchesToShow.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            시즌 경기 기록 ({matchesToShow.length}경기)
                          </span>
                          {selectedPlayerTeam && (
                            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full">
                              {selectedPlayerTeam}
                            </span>
                          )}
                        </div>
                        {matchesToShow.map((h, i) => (
                          <div key={i} className="bg-slate-50 p-6 rounded-[32px] border border-gray-100 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-indigo-600 px-3 py-1 bg-white rounded-full shadow-sm border border-indigo-50 uppercase">{h.tournament}</span>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{h.date}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div 
                                onClick={() => {
                                  if (h.detailUrl) {
                                    setActiveDetailTab('compare');
                                    fetchDetail(h.detailUrl);
                                    setSelectedPlayer(null);
                                  }
                                }}
                                className="flex-1 text-sm font-black text-slate-800 leading-tight cursor-pointer hover:text-indigo-600 hover:underline"
                              >
                                {formatSchoolName(h.teamA)}
                              </div>
                              <div className="mx-6 flex items-center space-x-3">
                                <span className={`text-xl font-black ${parseInt(h.score.split(':')[0]) > parseInt(h.score.split(':')[1]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score.split(':')[0]}</span>
                                <span className="text-sm font-black text-gray-200">:</span>
                                <span className={`text-xl font-black ${parseInt(h.score.split(':')[1]) > parseInt(h.score.split(':')[0]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score.split(':')[1]}</span>
                              </div>
                              <div 
                                onClick={() => {
                                  if (h.detailUrl) {
                                    setActiveDetailTab('compare');
                                    fetchDetail(h.detailUrl);
                                    setSelectedPlayer(null);
                                  }
                                }}
                                className="flex-1 text-sm font-black text-slate-800 text-right leading-tight cursor-pointer hover:text-indigo-600 hover:underline"
                              >
                                {formatSchoolName(h.teamB)}
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-100/50">
                              <div className="text-center">
                                <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">G/S</div>
                                <div className="text-sm font-black text-slate-800">{h.gs}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">%</div>
                                <div className="text-sm font-black text-slate-800">{h.rate}%</div>
                              </div>
                              <div className="text-center">
                                <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">AS</div>
                                <div className="text-sm font-black text-indigo-600">{h.as}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">ST</div>
                                <div className="text-sm font-black text-indigo-600">{h.st}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-24 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full mx-auto flex items-center justify-center text-slate-200 mb-4">
                          <ChevronDown className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-sm font-black text-slate-300 uppercase tracking-widest">
                          {selectedPlayerTeam ? `${selectedPlayerTeam} 경기 기록이 없습니다.` : 'No matching records found.'}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Term Explanation Popup (단일 용어 전용 팝업 - 블러 제거, 배경 보임, 글자 위쪽 팝업) */}
        {renderTermExplanationPopup()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-sans text-slate-900 pb-20">
      {/* Top Header */}
      <div className="bg-white px-6 pt-8 pb-4 border-b border-gray-200 sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
              <img src="/handball_icon.png" alt="Logo" className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">경기 일정/결과</h1>
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={handleSave}
              className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
            >
              저장
            </button>
            <button 
              onClick={() => fetchData(year, month, true)}
              className="px-3 py-1 bg-slate-50 text-slate-600 text-[10px] font-black rounded-full border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              재조회
            </button>
            <button className="p-2 bg-gray-100 rounded-full text-slate-600"><Menu className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Year & Month Selectors */}
        <div className="flex items-center space-x-2 mb-4">
          <div className="relative">
            <select 
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-semibold appearance-none pr-8 focus:outline-none"
            >
              {[2026, 2025, 2024, 2023, 2022].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white pointer-events-none opacity-60" />
          </div>
          
          <div className="flex-1 overflow-x-auto flex space-x-6 px-2 py-1 items-center scrollbar-hide no-scrollbar">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <button
                key={m}
                onClick={() => setMonth(m.toString())}
                className={`flex-shrink-0 transition-all ${
                  month === m.toString() 
                    ? 'text-slate-900 font-bold border-b-2 border-slate-900 pb-1' 
                    : 'text-gray-400 font-medium'
                }`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        {/* Tab-like switcher */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl mb-4">
          <button 
            onClick={() => setActiveTab("list")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500'}`}
          >
            일정/결과
          </button>
          <button 
            onClick={() => setActiveTab("bracket")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'bracket' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500'}`}
          >
            대진표
          </button>
          <button 
            onClick={() => setActiveTab("stats")}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'stats' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500'}`}
          >
            기록/순위
          </button>
        </div>

        {/* School Filters */}
        <div className="flex overflow-x-auto space-x-2 no-scrollbar pb-2">
          <button 
            onClick={() => setSelectedSchool(null)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              selectedSchool === null 
                ? 'bg-slate-800 text-white' 
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            전체
          </button>
          {schools.map(school => (
            <button 
              key={school}
              onClick={() => setSelectedSchool(school)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                selectedSchool === school 
                  ? 'bg-slate-800 text-white' 
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {school}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white">
        {/* Tournament Name Header (Box Style) */}
        <div className="px-4 py-4">
          <div className="border border-gray-300 bg-gray-50 py-3 px-4 text-center">
            <h2 className="text-lg font-bold text-slate-800">
              {data?.tournamentName || "조회된 대회 없음"}
            </h2>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-20 flex flex-col items-center justify-center space-y-4"
            >
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 font-medium">데이터를 불러오고 있습니다...</p>
            </motion.div>
          ) : activeTab === "bracket" ? (
            <motion.div 
              key="bracket"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-6 space-y-12"
            >
              {/* Group by category */}
              {Object.entries(
                (data?.matches || []).reduce((acc, match) => {
                  if (!acc[match.category]) acc[match.category] = [];
                  acc[match.category].push(match);
                  return acc;
                }, {} as Record<string, Match[]>)
              ).map(([category, matchesObj]) => {
                const matches = matchesObj as Match[];
                return (
                <div key={category} className="space-y-6">
                  <div className="flex items-center justify-center">
                    <div className="bg-indigo-100 px-6 py-2 rounded-lg border-2 border-indigo-200">
                      <div className="text-sm font-black text-indigo-800 text-center">{category}</div>
                    </div>
                  </div>

                  {/* Hierarchical Bracket Layout */}
                  <div className="relative flex flex-col items-center">
                    <div className="grid grid-cols-1 gap-6 w-full">
                      {matches.map((m, idx) => (
                        <div key={idx} className="relative flex flex-col items-center">
                          {/* Match Box */}
                          <div className="w-full bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden z-10">
                            <div className="bg-gray-50 px-3 py-1 flex justify-between items-center border-b border-gray-100">
                              <span className="text-[10px] font-bold text-gray-400">{m.date}</span>
                              <span className="text-[10px] font-bold text-gray-400">{m.venue}</span>
                            </div>
                            <div className="p-4 flex items-center justify-between">
                              <div className="flex-1 text-sm font-bold text-slate-700 truncate">{formatSchoolName(m.teamA)}</div>
                              <div className="mx-6 flex items-center space-x-3 bg-red-50 px-3 py-1 rounded-full border border-red-100">
                                <span className="text-base font-black text-red-600">{m.score.includes(':') ? m.score.split(':')[0] : '-'}</span>
                                <span className="text-xs font-bold text-red-200">:</span>
                                <span className="text-base font-black text-red-600">{m.score.includes(':') ? m.score.split(':')[1] : '-'}</span>
                              </div>
                              <div className="flex-1 text-sm font-bold text-slate-700 text-right truncate">{formatSchoolName(m.teamB)}</div>
                            </div>
                          </div>
                          
                          {/* Connector Line (if not last) */}
                          {idx < matches.length - 1 && (
                            <div className="h-6 w-0.5 bg-gray-200"></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );})}
            </motion.div>
          ) : (() => {
            const filteredMatches = data?.matches?.filter(m => {
              if (!selectedSchool) return true;
              
              // Direct team name match
              if (m.teamA.includes(selectedSchool) || m.teamB.includes(selectedSchool)) return true;
              
              // Flexible school level match
              if (selectedSchool === "고등학교") {
                const isHigh = m.category.includes("고등") || m.teamA.endsWith("고") || m.teamB.endsWith("고") || m.teamA.includes("고등학교") || m.teamB.includes("고등학교");
                if (isHigh) return true;
              }
              if (selectedSchool === "중학교") {
                const isMid = m.category.includes("중학") || m.teamA.endsWith("중") || m.teamB.endsWith("중") || m.teamA.includes("중학교") || m.teamB.includes("중학교");
                if (isMid) return true;
              }
              if (selectedSchool === "초등학교") {
                const isElem = m.category.includes("초등") || m.teamA.endsWith("초") || m.teamB.endsWith("초") || m.teamA.includes("초등학교") || m.teamB.includes("초등학교");
                if (isElem) return true;
              }

              // Category match
              if (m.category.includes(selectedSchool)) return true;

              return false;
            }) || [];
            if (filteredMatches.length > 0) {
              return (
                <div className="divide-y divide-gray-200">
                  {filteredMatches.map((match, idx) => (
                    <motion.div 
                      key={`match-${match.id}-${idx}-${match.date}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-4 py-8 flex flex-col items-center space-y-3"
                    >
                      {/* Date & Time */}
                      <div className="text-sm font-medium text-gray-500">
                        {match.date}
                      </div>
                      
                      {/* Score Line */}
                      <div className="flex items-center justify-center w-full space-x-4">
                        <span className="flex-1 text-right text-lg font-medium text-slate-800">{formatSchoolName(match.teamA)}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl font-bold text-red-600">
                            {match.score.includes(':') ? match.score.split(':')[0] : '-'}
                          </span>
                          <span className="text-xl font-bold text-red-600">:</span>
                          <span className="text-2xl font-bold text-red-600">
                            {match.score.includes(':') ? match.score.split(':')[1] : '-'}
                          </span>
                        </div>
                        <span className="flex-1 text-left text-lg font-medium text-slate-800">{formatSchoolName(match.teamB)}</span>
                      </div>

                      {/* Group Info (category) */}
                      <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
                        {match.category}
                      </div>
                      
                      {/* Venue */}
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-medium text-gray-400">{match.venue}</span>
                      </div>

                      {/* Buttons */}
                      <div className="w-full flex flex-col space-y-2 mt-4">
                        <button 
                          onClick={() => {
                            if (match.detailUrl) {
                              fetchDetail(match.detailUrl);
                            } else {
                              alert("아직 경기 상세 결과가 등록되지 않았습니다.");
                            }
                          }}
                          className={`w-full py-3 font-bold rounded-lg active:scale-[0.98] transition-all shadow-sm ${
                            match.detailUrl 
                              ? 'bg-[#003d82] text-white' 
                              : 'bg-gray-200 text-gray-400'
                          }`}
                        >
                          경기결과
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              );
            }
            return (
              <div className="py-20 text-center bg-gray-50">
                <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center text-gray-200 mb-4 shadow-sm border border-gray-100">
                  <ChevronDown className="w-8 h-8 opacity-20" />
                </div>
                <p className="text-gray-400 text-sm font-medium">해당 기간의 경기 일정이 없습니다.</p>
              </div>
            );
          })()}
        </AnimatePresence>
      </div>



      {/* TOP Button */}
      {showTopButton && (
        <button 
          onClick={scrollToTop}
          className="fixed bottom-24 right-4 w-12 h-12 bg-slate-800 text-white flex flex-col items-center justify-center z-50 shadow-xl rounded-full transition-all active:scale-90"
        >
          <ArrowUp className="w-5 h-5" />
          <span className="text-[9px] font-black">TOP</span>
        </button>
      )}

      {/* Player History Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="p-8 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10"></div>
                  <div className="text-center">
                    <h2 className="text-2xl font-black text-slate-800">{selectedPlayer} 선수 기록</h2>
                    <p className="text-xs text-indigo-600 font-black mt-1 uppercase tracking-widest">Season Match History</p>
                  </div>
                  <button 
                    onClick={handleClosePlayer}
                    className="p-3 bg-gray-50 rounded-full text-gray-400 hover:text-gray-600 transition-colors shadow-inner"
                  >
                    <ChevronDown className="w-6 h-6" />
                  </button>
                </div>
                <div className="flex justify-end space-x-2">
                  <button 
                    onClick={handlePlayerSave}
                    className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
                  >
                    저장
                  </button>
                  <button 
                    onClick={() => fetchPlayerHistory(selectedPlayer!, selectedPlayerTeam, true)}
                    className="px-4 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-black rounded-full border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    재조회
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {playerLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm font-bold text-slate-400">선수 기록을 불러오고 있습니다...</p>
                  </div>
                ) : playerHistory.length > 0 ? (
                  <div className="space-y-3">
                    {playerHistory.map((h, i) => (
                      <div key={i} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded">{h.tournament}</span>
                          <span className="text-[10px] font-medium text-gray-400">{h.date}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div 
                            onClick={() => {
                              if (h.detailUrl) {
                                setActiveDetailTab('compare');
                                fetchDetail(h.detailUrl);
                                setSelectedPlayer(null);
                              }
                            }}
                            className="flex-1 text-sm font-bold text-slate-700 cursor-pointer hover:text-indigo-600 hover:underline"
                          >
                            {formatSchoolName(h.teamA)}
                          </div>
                          <div className="mx-4 flex items-center space-x-2">
                            <span className={`text-sm font-black ${h.score.split(':')[0] > h.score.split(':')[1] ? 'text-indigo-600' : 'text-slate-400'}`}>{h.score.split(':')[0]}</span>
                            <span className="text-xs font-bold text-gray-300">:</span>
                            <span className={`text-sm font-black ${h.score.split(':')[1] > h.score.split(':')[0] ? 'text-indigo-600' : 'text-slate-400'}`}>{h.score.split(':')[1]}</span>
                          </div>
                          <div 
                            onClick={() => {
                              if (h.detailUrl) {
                                setActiveDetailTab('compare');
                                fetchDetail(h.detailUrl);
                                setSelectedPlayer(null);
                              }
                            }}
                            className="flex-1 text-sm font-bold text-slate-700 text-right cursor-pointer hover:text-indigo-600 hover:underline"
                          >
                            {formatSchoolName(h.teamB)}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-100">
                          <div className="text-center">
                            <div className="text-[10px] text-gray-400 font-medium">G/S</div>
                            <div className="text-xs font-black text-slate-700">{h.gs}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-gray-400 font-medium">성공률</div>
                            <div className="text-xs font-black text-slate-700">{h.rate}%</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-gray-400 font-medium">어시스트</div>
                            <div className="text-xs font-black text-slate-700">{h.as}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-gray-400 font-medium">스틸</div>
                            <div className="text-xs font-black text-slate-700">{h.st}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center text-gray-400">
                    <p className="text-sm font-medium">등록된 선수 기록이 없습니다.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Term Explanation Popup */}
      {renderTermExplanationPopup()}
    </div>
  );
}
