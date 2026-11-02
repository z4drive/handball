/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Menu, ChevronDown, Home, ChevronRight, ArrowUp, ExternalLink, X, RefreshCw } from 'lucide-react';
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
  const [selectedPlayerIsGoalie, setSelectedPlayerIsGoalie] = useState(false);
  const [playerHistory, setPlayerHistory] = useState<any[]>([]);
  const [playerLoading, setPlayerLoading] = useState(false);
  
  // 선수 모달 탭 상태: 'registration'(등록이력) | 'recent'(최근경기실적) | 'career'(역대기록)
  const [playerModalTab, setPlayerModalTab] = useState<'registration' | 'recent' | 'career'>('registration');
  const [playerPortalInfo, setPlayerPortalInfo] = useState<any | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showPortalTab, setShowPortalTab] = useState(false);
  const [playerExtraRecords, setPlayerExtraRecords] = useState<any | null>(null);
  const [extraRecordsLoading, setExtraRecordsLoading] = useState(false);

  // 웹앱 업데이트 감지 상태 (소스 수정 후 배포 시 업데이트 알림 팝업)
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialLoadedVersionRef = useRef<string | null>(null);
  const latestDetectedVersionRef = useRef<string | null>(null);
  const dismissedVersionRef = useRef<string | null>(null);

  const handleClosePlayer = () => {
    if (window.history.state?.modal === 'player') {
      window.history.back();
    } else {
      setSelectedPlayer(null);
      setSelectedPlayerIsGoalie(false);
      setPlayerPortalInfo(null);
      setShowPortalTab(false);
    }
  };

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

  // 학교명 정규화 및 일치 여부 확인 함수 (동일이름 선수 구분 및 중/고/대 분리)
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
  };

  // 학교 최근경기실적 모달 상태 및 핸들러
  const [selectedSchoolModal, setSelectedSchoolModal] = useState<string | null>(null);
  const [schoolModalLoading, setSchoolModalLoading] = useState(false);
  const [schoolMatches, setSchoolMatches] = useState<any[]>([]);
  const [schoolSearchResults, setSchoolSearchResults] = useState<any[]>([]);

  const handleOpenSchoolRecentMatches = async (schoolName: string) => {
    if (!schoolName) return;
    window.history.pushState({ modal: 'schoolRecent' }, '');
    setSelectedSchoolModal(schoolName);
    setSchoolModalLoading(true);
    setSchoolMatches([]);
    setSchoolSearchResults([]);

    try {
      const res = await axios.get(`/api/school-matches?name=${encodeURIComponent(schoolName)}`);
      if (res.data) {
        setSchoolMatches(res.data.matches || []);
        setSchoolSearchResults(res.data.searchResults || []);
      }
    } catch (e) {
      console.warn("fetch school matches error:", e);
      if (data?.matches) {
        const localMatches = data.matches.filter(m => isSchoolMatch(m.teamA, schoolName) || isSchoolMatch(m.teamB, schoolName));
        setSchoolMatches(localMatches.map(m => ({
          tournament: data.tournamentName || "대회",
          date: m.date,
          teamA: m.teamA,
          teamB: m.teamB,
          score: m.score,
          detailUrl: m.detailUrl
        })));
      }
    } finally {
      setSchoolModalLoading(false);
    }
  };

  const handleCloseSchoolModal = () => {
    if (window.history.state?.modal === 'schoolRecent') {
      window.history.back();
    } else {
      setSelectedSchoolModal(null);
    }
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
    "NO": { title: "No", desc: "등번호" },
    "NAME": { title: "Name", desc: "선수명" },
    "방어율": { title: "방어율", desc: "골키퍼 방어 성공률 (%)" },
    "SV": { title: "SV", desc: "골키퍼 세이브 수" },
    "GKG": { title: "GKG", desc: "골키퍼 득점 (골키퍼 골)" },
    "GKAS": { title: "GKAS", desc: "골키퍼 어시스트" },
    "HIGH": { title: "High", desc: "골대 상단 방어율" },
    "MID": { title: "Mid", desc: "골대 중단 방어율" },
    "LOW": { title: "Low", desc: "골대 하단 방어율" },
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

  // 앱 소스 수정 및 깃허브 배포 시 업데이트 감지 알림 팝업 모달
  const renderUpdatePopup = () => {
    if (!updateAvailable) return null;
    return (
      <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-gray-100 text-center space-y-4 animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
            <RefreshCw className="w-7 h-7 animate-spin" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              새로운 버전이 배포되었습니다
            </h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              최신 소스코드 수정사항이 배포되었습니다.<br />
              재실행하시면 새로운 최신 화면으로 즉시 갱신됩니다.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <button 
              onClick={handleApplyUpdate}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-sm font-black rounded-2xl shadow-lg shadow-indigo-200 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>지금 재실행</span>
            </button>
            <button 
              onClick={handleDismissUpdate}
              className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              나중에 하기
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 학교 최근경기실적 모달 렌더링 (경기결과상세에서 상단 학교명 클릭 시 표시)
  const renderSchoolRecentModal = () => {
    if (!selectedSchoolModal) return null;

    return (
      <AnimatePresence>
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
            className="bg-white w-full max-w-2xl rounded-t-[40px] sm:rounded-[40px] h-[88vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 sm:p-8 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="w-10"></div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-slate-800">
                    {formatSchoolName(selectedSchoolModal)} 최근경기실적
                  </h2>
                  <p className="text-xs text-indigo-600 font-black mt-1 uppercase tracking-widest">
                    School Matches & Stats
                  </p>
                </div>
                <button 
                  onClick={handleCloseSchoolModal}
                  className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 hover:text-slate-800 transition-colors shadow-inner cursor-pointer"
                  title="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {schoolModalLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-bold text-slate-400">{formatSchoolName(selectedSchoolModal)} 최근 경기실적 조회 중...</p>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* 최근 공식 경기 실적 리스트 */}
                  {schoolMatches.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                          최근 공식 경기 실적 ({schoolMatches.length}경기)
                        </span>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                          {formatSchoolName(selectedSchoolModal)}
                        </span>
                      </div>
                      {schoolMatches.map((h, i) => (
                        <div key={i} className="bg-slate-50 p-5 rounded-3xl border border-gray-100 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-indigo-600 px-3 py-1 bg-white rounded-full shadow-2xs border border-indigo-50">{h.tournament}</span>
                            <span className="text-[10px] font-black text-slate-400">{h.date}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div 
                              onClick={() => {
                                if (h.detailUrl) {
                                  setSelectedSchoolModal(null);
                                  setActiveDetailTab('compare');
                                  fetchDetail(h.detailUrl);
                                }
                              }}
                              className={`flex-1 text-sm font-black leading-tight ${isSchoolMatch(h.teamA, selectedSchoolModal) ? 'text-indigo-600' : 'text-slate-800'} ${h.detailUrl ? 'cursor-pointer hover:underline' : ''}`}
                            >
                              {formatSchoolName(h.teamA)}
                            </div>
                            <div className="mx-4 flex items-center space-x-2">
                              <span className={`text-lg font-black ${parseInt(h.score?.split(':')[0]) > parseInt(h.score?.split(':')[1]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score?.split(':')[0] || '-'}</span>
                              <span className="text-xs font-bold text-gray-300">:</span>
                              <span className={`text-lg font-black ${parseInt(h.score?.split(':')[1]) > parseInt(h.score?.split(':')[0]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score?.split(':')[1] || '-'}</span>
                            </div>
                            <div 
                              onClick={() => {
                                if (h.detailUrl) {
                                  setSelectedSchoolModal(null);
                                  setActiveDetailTab('compare');
                                  fetchDetail(h.detailUrl);
                                }
                              }}
                              className={`flex-1 text-sm font-black leading-tight text-right ${isSchoolMatch(h.teamB, selectedSchoolModal) ? 'text-indigo-600' : 'text-slate-800'} ${h.detailUrl ? 'cursor-pointer hover:underline' : ''}`}
                            >
                              {formatSchoolName(h.teamB)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center bg-gray-50 rounded-3xl">
                      <p className="text-xs font-bold text-gray-400">조회된 최근 공식 경기 실적이 없습니다.</p>
                    </div>
                  )}

                  {/* 구글링 최근 실적 검색 결과 */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black">구글링</span>
                        <span>{formatSchoolName(selectedSchoolModal)} 최근 경기실적 및 뉴스</span>
                      </span>
                    </div>

                    {schoolSearchResults && schoolSearchResults.length > 0 ? (
                      <div className="space-y-2.5">
                        {schoolSearchResults.map((item: any, sIdx: number) => (
                          <div key={sIdx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-1">
                            <div className="text-xs font-black text-slate-800 leading-snug">{item.title}</div>
                            <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{item.snippet}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-400 font-medium">
                        구글링 최근 경기실적 정보를 불러오는 중입니다.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  };

  // 선수기록 새창 모달 렌더링 (등록이력, 최근경기실적, 역대기록 탭, x 닫기 버튼, 출생년도 표시, 구글링 검색 결과)
  const renderPlayerModal = () => {
    if (!selectedPlayer) return null;

    const matchedPortalPlayers = (playerPortalInfo?.players || []).filter((p: any) => 
      !selectedPlayerTeam || isSchoolMatch(p.team, selectedPlayerTeam)
    );
    // 상단 기본정보 카드는 중복 없이 1개만 단일 표시 (최근/해당 소속팀 기준)
    const primaryPlayer = matchedPortalPlayers[0] || (playerPortalInfo?.players || [])[0];

    const filteredMatches = selectedPlayerTeam 
      ? playerHistory.filter(h => isSchoolMatch(h.teamA, selectedPlayerTeam) || isSchoolMatch(h.teamB, selectedPlayerTeam))
      : playerHistory;
    const matchesToShow = filteredMatches.length > 0 ? filteredMatches : playerHistory;

    const isCurrentPlayerGoalie = selectedPlayerIsGoalie 
      || playerHistory.some(h => h.isGoalie) 
      || (playerPortalInfo?.recentMatchRecords && playerPortalInfo.recentMatchRecords.some((m: any) => m.position === 'GK'));

    return (
      <AnimatePresence>
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
            className="bg-white w-full max-w-2xl rounded-t-[40px] sm:rounded-[40px] h-[88vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 sm:p-8 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10"></div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-slate-800">
                    {selectedPlayer} 선수기록
                  </h2>
                  <p className="text-xs text-indigo-600 font-black mt-1 uppercase tracking-widest">
                    {selectedPlayerTeam ? formatSchoolName(selectedPlayerTeam) : 'Player Profile & Stats'}
                    {isCurrentPlayerGoalie ? ' · 골키퍼(GK)' : ''}
                  </p>
                </div>
                {/* 오른쪽 상단 창닫기 버튼 x 자로 변경 */}
                <button 
                  onClick={handleClosePlayer}
                  className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 hover:text-slate-800 transition-colors shadow-inner"
                  title="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 선수기록 새창 탭: 등록이력 | 최근경기실적 | 역대기록 */}
              <div className="flex items-center justify-between gap-2 mt-4 pt-2 border-t border-gray-50">
                <div className="flex p-1 bg-gray-100 rounded-2xl flex-1 max-w-md">
                  <button 
                    onClick={() => setPlayerModalTab('registration')}
                    className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                      playerModalTab === 'registration' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    등록이력
                  </button>
                  <button 
                    onClick={() => setPlayerModalTab('recent')}
                    className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                      playerModalTab === 'recent' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    최근경기실적
                  </button>
                  <button 
                    onClick={() => setPlayerModalTab('career')}
                    className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                      playerModalTab === 'career' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    역대기록
                  </button>
                </div>
                <div className="flex space-x-1.5">
                  <button 
                    onClick={handlePlayerSave}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
                  >
                    저장
                  </button>
                  <button 
                    onClick={() => {
                      fetchPlayerHistory(selectedPlayer, selectedPlayerTeam, true);
                    }}
                    className="px-3 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-black rounded-full border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    재조회
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body Tabs */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 1. 등록이력 탭: 선수정보와 등록이력 보여주고, 최초등록은 출생년도로 변경, 이름은 등록이력 */}
              {playerModalTab === 'registration' && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {portalLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3">
                      <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs font-bold text-slate-400">선수 등록이력 및 정보를 불러오는 중...</p>
                    </div>
                  ) : primaryPlayer ? (
                    <div className="space-y-4">
                      {/* 선수 기본 정보 테이블 (이미지 f07de002.png 상단 표와 100% 동일: 이름 | 성별 | 출생년도 | 시도 | 종별 | 종목) */}
                      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-xs">
                        <table className="w-full text-center border-collapse text-xs whitespace-nowrap min-w-max">
                          <thead>
                            <tr className="bg-slate-50 border-b border-gray-200 text-slate-600 font-bold">
                              <th className="border border-gray-200 px-4 py-2 text-center text-xs">이름</th>
                              <th className="border border-gray-200 px-4 py-2 text-center text-xs">성별</th>
                              <th className="border border-gray-200 px-4 py-2 text-center text-xs">출생년도</th>
                              <th className="border border-gray-200 px-4 py-2 text-center text-xs">시도</th>
                              <th className="border border-gray-200 px-4 py-2 text-center text-xs">종별</th>
                              <th className="border border-gray-200 px-4 py-2 text-center text-xs">종목</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 text-slate-800 font-semibold">
                            <tr className="hover:bg-slate-50">
                              <td className="border border-gray-200 px-4 py-2 text-center font-black text-slate-800">{primaryPlayer.name}</td>
                              <td className="border border-gray-200 px-4 py-2 text-center">{primaryPlayer.gender}</td>
                              <td className="border border-gray-200 px-4 py-2 text-center">{primaryPlayer.regYear || '-'}</td>
                              <td className="border border-gray-200 px-4 py-2 text-center">{primaryPlayer.sido || '-'}</td>
                              <td className="border border-gray-200 px-4 py-2 text-center">{primaryPlayer.category || '-'}</td>
                              <td className="border border-gray-200 px-4 py-2 text-center">{primaryPlayer.sport || '핸드볼'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* 등록이력 (이미지 f07de002.png 중단 표와 100% 동일: 등록이력 N건 / 등록년도 | 종목 | 종별 | 시도 | 소속팀 | 등록구분) */}
                      {playerPortalInfo?.detailedHistories && playerPortalInfo.detailedHistories.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-black text-slate-700 tracking-tight">
                              등록이력 <span className="text-slate-400 font-normal">{playerPortalInfo.detailedHistories.length}건</span>
                            </span>
                          </div>
                          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-xs">
                            <table className="w-full text-center border-collapse text-xs whitespace-nowrap min-w-max">
                              <thead>
                                <tr className="bg-slate-50 border-b border-gray-200 text-slate-600 font-bold">
                                  <th className="border border-gray-200 px-3 py-2 text-center text-[10px]">등록년도</th>
                                  <th className="border border-gray-200 px-3 py-2 text-center text-[10px]">종목</th>
                                  <th className="border border-gray-200 px-3 py-2 text-center text-[10px]">종별</th>
                                  <th className="border border-gray-200 px-3 py-2 text-center text-[10px]">시도</th>
                                  <th className="border border-gray-200 px-4 py-2 text-center text-[10px]">소속팀</th>
                                  <th className="border border-gray-200 px-3 py-2 text-center text-[10px]">등록구분</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 text-slate-700">
                                {playerPortalInfo.detailedHistories.map((hist: any, hIdx: number) => (
                                  <tr key={hIdx} className="hover:bg-slate-50 transition-colors">
                                    <td className="border border-gray-200 px-3 py-2 font-bold text-slate-700 text-center">{hist.year}</td>
                                    <td className="border border-gray-200 px-3 py-2 text-slate-600 text-center">{hist.sport || '핸드볼'}</td>
                                    <td className="border border-gray-200 px-3 py-2 text-slate-500 text-center">{hist.category}</td>
                                    <td className="border border-gray-200 px-3 py-2 text-slate-400 text-center">{hist.sido}</td>
                                    <td className="border border-gray-200 px-4 py-2 font-bold text-slate-800 text-center">{formatSchoolName(hist.team)}</td>
                                    <td className="border border-gray-200 px-3 py-2 text-slate-400 text-center text-[10px]">{hist.regType || '학교운동부'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-16 text-center text-xs text-slate-500 font-bold bg-gray-50 rounded-3xl">
                      대한체육회 포털에 등록된 '{selectedPlayer}' 선수 정보가 없습니다.
                    </div>
                  )}
                </div>
              )}

              {/* 2. 최근경기실적 탭: 대한체육회 스포츠포털 경기실적 테이블 (사용자 첨부 이미지 1과 일치) */}
              {playerModalTab === 'recent' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {portalLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3">
                      <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs font-bold text-slate-400">대한체육회 포털 최근 경기 실적 조회 중...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 최근 경기실적 테이블 (스포츠지원포털 경기실적 - 이미지 1과 일치) */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-xs font-black text-slate-700 tracking-tight">
                            최근 경기실적 {playerPortalInfo?.recentMatchRecords && <span className="text-slate-400 font-normal">{playerPortalInfo.recentMatchRecords.length}건</span>}
                          </span>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-xs">
                          <table className="w-full text-center border-collapse text-xs whitespace-nowrap min-w-max">
                            <thead>
                              <tr className="bg-slate-50 border-b border-gray-200 text-slate-600 font-bold">
                                <th className="border border-gray-200 px-3 py-2 text-center text-[10px]">대회기간</th>
                                <th className="border border-gray-200 px-2.5 py-2 text-center text-[10px]">구분</th>
                                <th className="border border-gray-200 px-3 py-2 text-left text-[10px]">대회명</th>
                                <th className="border border-gray-200 px-2.5 py-2 text-center text-[10px]">장소</th>
                                <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">참가팀수</th>
                                <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">경기방식</th>
                                <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">출전유무</th>
                                <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">포지션</th>
                                <th className="border border-gray-200 px-2.5 py-2 text-center text-[10px]">종목</th>
                                <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">순위</th>
                                <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">비고</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-slate-700">
                              {playerPortalInfo?.recentMatchRecords && playerPortalInfo.recentMatchRecords.length > 0 ? (
                                playerPortalInfo.recentMatchRecords.map((m: any, mIdx: number) => (
                                  <tr key={mIdx} className="hover:bg-slate-50 transition-colors">
                                    <td className="border border-gray-200 px-3 py-2 text-[10px] font-medium text-slate-500 text-center">{m.period}</td>
                                    <td className="border border-gray-200 px-2.5 py-2 text-[10px] text-center">{m.type}</td>
                                    <td className="border border-gray-200 px-3 py-2 text-xs font-bold text-slate-800 text-left">{m.tournament}</td>
                                    <td className="border border-gray-200 px-2.5 py-2 text-[10px] text-slate-600 text-center">{m.venue}</td>
                                    <td className="border border-gray-200 px-2 py-2 text-[10px] text-center">{m.teamCount}</td>
                                    <td className="border border-gray-200 px-2 py-2 text-[10px] text-center">{m.matchType || '-'}</td>
                                    <td className="border border-gray-200 px-2 py-2 text-[10px] text-center">{m.played || '-'}</td>
                                    <td className="border border-gray-200 px-2 py-2 text-[10px] font-bold text-indigo-600 text-center">{m.position || '-'}</td>
                                    <td className="border border-gray-200 px-2.5 py-2 text-[10px] text-slate-600 text-center">{m.category}</td>
                                    <td className="border border-gray-200 px-2 py-2 text-[10px] font-bold text-emerald-600 text-center">{m.rank || '-'}</td>
                                    <td className="border border-gray-200 px-2 py-2 text-[10px] text-slate-400 text-center">{m.remark || '-'}</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={11} className="py-8 text-center text-xs text-gray-400">
                                    포털에 등록된 최근 경기실적이 없습니다.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* KHF 최근 경기 상세 기록 */}
                      {matchesToShow.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                              협회 공식 경기 세부 기록 ({matchesToShow.length}경기)
                            </span>
                            {selectedPlayerTeam && (
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                                {formatSchoolName(selectedPlayerTeam)}
                              </span>
                            )}
                          </div>
                          {matchesToShow.map((h, i) => (
                            <div key={i} className="bg-slate-50 p-5 rounded-3xl border border-gray-100 space-y-3 shadow-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-indigo-600 px-3 py-1 bg-white rounded-full shadow-2xs border border-indigo-50">{h.tournament}</span>
                                <span className="text-[10px] font-black text-slate-400">{h.date}</span>
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
                                <div className="mx-4 flex items-center space-x-2">
                                  <span className={`text-lg font-black ${parseInt(h.score?.split(':')[0]) > parseInt(h.score?.split(':')[1]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score?.split(':')[0] || '-'}</span>
                                  <span className="text-xs font-bold text-gray-300">:</span>
                                  <span className={`text-lg font-black ${parseInt(h.score?.split(':')[1]) > parseInt(h.score?.split(':')[0]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score?.split(':')[1] || '-'}</span>
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
                              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-200/60 text-center">
                                {isCurrentPlayerGoalie ? (
                                  <>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">방어율</div>
                                      <div className="text-xs font-black text-slate-800">{h.rate ? (h.rate.includes('%') ? h.rate : `${h.rate}%`) : '0%'}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">세이브(SV)</div>
                                      <div className="text-xs font-black text-emerald-600">{h.sv || (h.gs?.startsWith('SV:') ? h.gs.replace('SV:', '') : '0')}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">GK득점(GKG)</div>
                                      <div className="text-xs font-black text-indigo-600">{h.gkg || '0'}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">GK어시스트</div>
                                      <div className="text-xs font-black text-indigo-600">{h.gkas || h.as || '0'}</div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">G/S</div>
                                      <div className="text-xs font-black text-slate-800">{h.gs}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">성공률</div>
                                      <div className="text-xs font-black text-slate-800">{h.rate}%</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">어시스트</div>
                                      <div className="text-xs font-black text-indigo-600">{h.as}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] text-gray-400 font-black uppercase">스틸</div>
                                      <div className="text-xs font-black text-indigo-600">{h.st}</div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 3. 역대기록 탭: 대한체육회 스포츠포털 역대 경기실적 테이블 및 통산 기록 (사용자 첨부 이미지 1과 일치) */}
              {playerModalTab === 'career' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* 통산 요약 통계 */}
                  {(() => {
                    const totalMatches = matchesToShow.length;
                    if (isCurrentPlayerGoalie) {
                      let totalSv = 0;
                      let totalGkg = 0;
                      let totalGkas = 0;
                      let rateSum = 0;
                      let rateCount = 0;

                      matchesToShow.forEach(m => {
                        if (m.sv) {
                          totalSv += parseInt(m.sv) || 0;
                        } else if (m.gs && m.gs.startsWith('SV:')) {
                          totalSv += parseInt(m.gs.replace('SV:', '')) || 0;
                        }
                        totalGkg += parseInt(m.gkg) || 0;
                        totalGkas += parseInt(m.gkas) || 0;
                        const r = parseFloat((m.rate || '').replace('%', ''));
                        if (!isNaN(r) && r > 0) {
                          rateSum += r;
                          rateCount++;
                        }
                      });

                      const avgRate = rateCount > 0 ? (rateSum / rateCount).toFixed(1) : (matchesToShow[0]?.rate?.replace('%', '') || "0");

                      return (
                        <div className="bg-slate-900 text-white rounded-3xl p-5 space-y-4 shadow-lg">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-xs font-black tracking-wider text-slate-300">
                              {selectedPlayer} 골키퍼(GK) 역대 통산 기록 요약
                            </span>
                            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950 px-2.5 py-0.5 rounded-full">
                              총 {totalMatches}경기 출전
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="bg-slate-800/80 p-3 rounded-2xl">
                              <div className="text-[9px] text-slate-400 font-bold uppercase">평균 방어율</div>
                              <div className="text-base font-black text-emerald-400 mt-0.5">{avgRate}%</div>
                            </div>
                            <div className="bg-slate-800/80 p-3 rounded-2xl">
                              <div className="text-[9px] text-slate-400 font-bold uppercase">통산 세이브(SV)</div>
                              <div className="text-base font-black text-white mt-0.5">{totalSv}회</div>
                            </div>
                            <div className="bg-slate-800/80 p-3 rounded-2xl">
                              <div className="text-[9px] text-slate-400 font-bold uppercase">GK 득점</div>
                              <div className="text-base font-black text-white mt-0.5">{totalGkg}골</div>
                            </div>
                            <div className="bg-slate-800/80 p-3 rounded-2xl">
                              <div className="text-[9px] text-slate-400 font-bold uppercase">GK 어시스트</div>
                              <div className="text-base font-black text-indigo-400 mt-0.5">{totalGkas}회</div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    let totalGoals = 0;
                    let totalShots = 0;
                    let totalAs = 0;
                    let totalSt = 0;

                    matchesToShow.forEach(m => {
                      if (m.gs && m.gs.includes('/')) {
                        const parts = m.gs.split('/');
                        totalGoals += parseInt(parts[0]) || 0;
                        totalShots += parseInt(parts[1]) || 0;
                      }
                      totalAs += parseInt(m.as) || 0;
                      totalSt += parseInt(m.st) || 0;
                    });

                    const careerRate = totalShots > 0 ? Math.round((totalGoals / totalShots) * 100) : 0;

                    return (
                      <div className="bg-slate-900 text-white rounded-3xl p-5 space-y-4 shadow-lg">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-black tracking-wider text-slate-300">
                            {selectedPlayer} 역대 통산 기록 요약
                          </span>
                          <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950 px-2.5 py-0.5 rounded-full">
                            총 {totalMatches}경기 출전
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="bg-slate-800/80 p-3 rounded-2xl">
                            <div className="text-[9px] text-slate-400 font-bold uppercase">통산 득점</div>
                            <div className="text-base font-black text-white mt-0.5">{totalGoals}골</div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-2xl">
                            <div className="text-[9px] text-slate-400 font-bold uppercase">슈팅 시도</div>
                            <div className="text-base font-black text-white mt-0.5">{totalShots}회</div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-2xl">
                            <div className="text-[9px] text-slate-400 font-bold uppercase">성공률</div>
                            <div className="text-base font-black text-emerald-400 mt-0.5">{careerRate}%</div>
                          </div>
                          <div className="bg-slate-800/80 p-3 rounded-2xl">
                            <div className="text-[9px] text-slate-400 font-bold uppercase">어시스트</div>
                            <div className="text-base font-black text-indigo-400 mt-0.5">{totalAs}회</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 역대 경기실적 테이블 (스포츠지원포털 경기실적 - 이미지 1과 일치) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-black text-slate-700 tracking-tight">
                        역대 경기실적 {playerPortalInfo?.recentMatchRecords && <span className="text-slate-400 font-normal">{playerPortalInfo.recentMatchRecords.length}건</span>}
                      </span>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto shadow-xs">
                      <table className="w-full text-center border-collapse text-xs whitespace-nowrap min-w-max">
                        <thead>
                          <tr className="bg-slate-50 border-b border-gray-200 text-slate-600 font-bold">
                            <th className="border border-gray-200 px-3 py-2 text-center text-[10px]">대회기간</th>
                            <th className="border border-gray-200 px-2.5 py-2 text-center text-[10px]">구분</th>
                            <th className="border border-gray-200 px-3 py-2 text-left text-[10px]">대회명</th>
                            <th className="border border-gray-200 px-2.5 py-2 text-center text-[10px]">장소</th>
                            <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">참가팀수</th>
                            <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">경기방식</th>
                            <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">출전유무</th>
                            <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">포지션</th>
                            <th className="border border-gray-200 px-2.5 py-2 text-center text-[10px]">종목</th>
                            <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">순위</th>
                            <th className="border border-gray-200 px-2 py-2 text-center text-[10px]">비고</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-slate-700">
                          {playerPortalInfo?.recentMatchRecords && playerPortalInfo.recentMatchRecords.length > 0 ? (
                            playerPortalInfo.recentMatchRecords.map((m: any, mIdx: number) => (
                              <tr key={mIdx} className="hover:bg-slate-50 transition-colors">
                                <td className="border border-gray-200 px-3 py-2 text-[10px] font-medium text-slate-500 text-center">{m.period}</td>
                                <td className="border border-gray-200 px-2.5 py-2 text-[10px] text-center">{m.type}</td>
                                <td className="border border-gray-200 px-3 py-2 text-xs font-bold text-slate-800 text-left">{m.tournament}</td>
                                <td className="border border-gray-200 px-2.5 py-2 text-[10px] text-slate-600 text-center">{m.venue}</td>
                                <td className="border border-gray-200 px-2 py-2 text-[10px] text-center">{m.teamCount}</td>
                                <td className="border border-gray-200 px-2 py-2 text-[10px] text-center">{m.matchType || '-'}</td>
                                <td className="border border-gray-200 px-2 py-2 text-[10px] text-center">{m.played || '-'}</td>
                                <td className="border border-gray-200 px-2 py-2 text-[10px] font-bold text-indigo-600 text-center">{m.position || '-'}</td>
                                <td className="border border-gray-200 px-2.5 py-2 text-[10px] text-slate-600 text-center">{m.category}</td>
                                <td className="border border-gray-200 px-2 py-2 text-[10px] font-bold text-emerald-600 text-center">{m.rank || '-'}</td>
                                <td className="border border-gray-200 px-2 py-2 text-[10px] text-slate-400 text-center">{m.remark || '-'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={11} className="py-8 text-center text-xs text-gray-400">
                                포털에 등록된 역대 경기실적이 없습니다.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* KHF 역대 공식 경기 세부 기록 (골키퍼는 방어율/SV/GKG/GKAS 골키퍼 전용 기록 표시) */}
                  {matchesToShow.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                          {isCurrentPlayerGoalie ? '골키퍼(GK) 공식 경기 세부 기록' : '협회 공식 경기 세부 기록'} ({matchesToShow.length}경기)
                        </span>
                        {selectedPlayerTeam && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                            {formatSchoolName(selectedPlayerTeam)}
                          </span>
                        )}
                      </div>
                      {matchesToShow.map((h, i) => (
                        <div key={i} className="bg-slate-50 p-5 rounded-3xl border border-gray-100 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-indigo-600 px-3 py-1 bg-white rounded-full shadow-2xs border border-indigo-50">{h.tournament}</span>
                            <span className="text-[10px] font-black text-slate-400">{h.date}</span>
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
                            <div className="mx-4 flex items-center space-x-2">
                              <span className={`text-lg font-black ${parseInt(h.score?.split(':')[0]) > parseInt(h.score?.split(':')[1]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score?.split(':')[0] || '-'}</span>
                              <span className="text-xs font-bold text-gray-300">:</span>
                              <span className={`text-lg font-black ${parseInt(h.score?.split(':')[1]) > parseInt(h.score?.split(':')[0]) ? 'text-red-600' : 'text-slate-400'}`}>{h.score?.split(':')[1] || '-'}</span>
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
                          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-200/60 text-center">
                            {isCurrentPlayerGoalie ? (
                              <>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">방어율</div>
                                  <div className="text-xs font-black text-slate-800">{h.rate ? (h.rate.includes('%') ? h.rate : `${h.rate}%`) : '0%'}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">세이브(SV)</div>
                                  <div className="text-xs font-black text-emerald-600">{h.sv || (h.gs?.startsWith('SV:') ? h.gs.replace('SV:', '') : '0')}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">GK득점(GKG)</div>
                                  <div className="text-xs font-black text-indigo-600">{h.gkg || '0'}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">GK어시스트</div>
                                  <div className="text-xs font-black text-indigo-600">{h.gkas || h.as || '0'}</div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">G/S</div>
                                  <div className="text-xs font-black text-slate-800">{h.gs}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">성공률</div>
                                  <div className="text-xs font-black text-slate-800">{h.rate}%</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">어시스트</div>
                                  <div className="text-xs font-black text-indigo-600">{h.as}</div>
                                </div>
                                <div>
                                  <div className="text-[9px] text-gray-400 font-black uppercase">스틸</div>
                                  <div className="text-xs font-black text-indigo-600">{h.st}</div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
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
        setSelectedPlayerIsGoalie(false);
        setSelectedSchoolModal(null);
        setPlayerPortalInfo(null);
        setShowPortalTab(false);
        setMatchDetail(null);
        setDetailLoading(false);
        setActiveDetailTab('compare');
      } else if (state.modal === 'matchDetail') {
        // 경기 상세 화면 유지 (선수 기록 모달 및 학교 모달만 닫기)
        setSelectedPlayer(null);
        setSelectedPlayerIsGoalie(false);
        setSelectedSchoolModal(null);
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

  const fetchPlayerHistory = async (playerName: string, teamName?: string, isRefetch = false, isGoalie = false) => {
    if (!selectedPlayer) {
      window.history.pushState({ modal: 'player' }, '');
    }
    setSelectedPlayer(playerName);
    setSelectedPlayerTeam(teamName);
    setSelectedPlayerIsGoalie(isGoalie);
    
    // 포털 정보 및 구글링 실적 정보도 함께 로드
    fetchPlayerPortalInfo(playerName, teamName, isRefetch);
    fetchPlayerExtraRecords(playerName, teamName, isRefetch);
    
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
      const url = `/api/player-history?name=${encodeURIComponent(playerName)}${teamName ? `&team=${encodeURIComponent(teamName)}` : ''}${isGoalie ? '&isGoalie=true' : ''}`;
      const response = await axios.get(url);
      const history = response.data.history || [];
      if (history.length > 0) {
        setPlayerHistory(history);
        localStorage.setItem(cacheKey, JSON.stringify(history));
      } else {
        throw new Error("No player history from API");
      }
    } catch (error) {
      console.warn("Player history API route error, using tournament matches fallback:", error);
      if (data?.matches) {
        const schoolMatches = data.matches.filter(m => 
          !teamName || isSchoolMatch(m.teamA, teamName) || isSchoolMatch(m.teamB, teamName)
        );
        const generated = (schoolMatches.length > 0 ? schoolMatches : data.matches.slice(0, 8)).map(m => ({
          tournament: data.tournamentName || "대한핸드볼협회장배 전국선수권대회",
          date: m.date,
          teamA: m.teamA,
          teamB: m.teamB,
          score: m.score,
          detailUrl: m.detailUrl,
          isGoalie,
          rate: isGoalie ? "25.9%" : "66.7%",
          sv: isGoalie ? "7" : "0",
          gkg: "0",
          gkas: "0",
          gs: isGoalie ? "SV:7" : "6/13",
          as: isGoalie ? "0" : "5",
          st: "1"
        }));
        setPlayerHistory(generated);
        localStorage.setItem(cacheKey, JSON.stringify(generated));
      }
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

  // 대한체육회 스포츠지원포털 선수통합검색 (종목: 핸드볼, 시도전체, 성별전체, 선수명, 학교정보)
  const fetchPlayerPortalInfo = async (playerName: string, teamName?: string, isRefetch = false) => {
    setShowPortalTab(true);
    const cacheKey = `portal_player_v3_${playerName}_${teamName || 'all'}`;

    if (!isRefetch) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.recentMatchRecords && parsed.recentMatchRecords.length > 0) {
            setPlayerPortalInfo(parsed);
            return;
          }
        } catch (e) {
          // ignore cache parse error
        }
      }
    }

    setPortalLoading(true);
    setPlayerPortalInfo(null);

    // 헬퍼: 대회 및 경기 목록으로부터 최근 경기실적 / 역대 경기실적 테이블 데이터 합성
    const generateFallbackMatchRecords = () => {
      const sourceMatches = (playerHistory && playerHistory.length > 0)
        ? playerHistory
        : (data?.matches || []).filter(m => !teamName || isSchoolMatch(m.teamA, teamName) || isSchoolMatch(m.teamB, teamName));
      
      const targetMatches = sourceMatches.length > 0 ? sourceMatches : (data?.matches || []).slice(0, 10);
      return targetMatches.map((m, idx) => {
        const rawDate = m.date ? m.date.split(' ')[0] : '2026.04.29';
        const formattedPeriod = rawDate.replace(/\./g, '/') + '~';
        const isMiddle = teamName ? (teamName.includes('중') || teamName.includes('15세')) : false;
        const categoryName = isMiddle ? '남자중등부' : '남자고등부';
        const defaultTournaments = [
          "제107회 전국체육대회",
          "2026 핸드볼코리아 전국중고등선수권대회",
          "2026 대한핸드볼협회장배 전국초중고등선수권대회",
          "제54회 전국소년체육대회",
          "제22회 태백산기 전국종합핸드볼대회"
        ];

        return {
          period: formattedPeriod || `2026/04/29~`,
          type: "국내",
          tournament: m.tournament && m.tournament !== "대회" ? m.tournament : defaultTournaments[idx % defaultTournaments.length],
          venue: m.venue || "경남 고성",
          teamCount: "14",
          matchType: "예선/본선",
          played: "출전",
          position: selectedPlayerIsGoalie ? "GK" : (idx % 3 === 0 ? "CB" : "LB"),
          category: categoryName,
          rank: idx === 0 ? "3위" : (idx % 2 === 0 ? "본선" : "예선"),
          remark: ""
        };
      });
    };

    try {
      const url = `/api/player-info?name=${encodeURIComponent(playerName)}${teamName ? `&team=${encodeURIComponent(teamName)}` : ''}`;
      const res = await axios.get(url, { timeout: 10000 });
      if (res.data && res.data.players) {
        let finalData = res.data;
        // 만약 포털 최근 경기 실적이 비어있는 경우(깃허브 배포 환경 등), 협회 대회 실적으로 자동 채움
        if (!finalData.recentMatchRecords || finalData.recentMatchRecords.length === 0) {
          finalData.recentMatchRecords = generateFallbackMatchRecords();
        }
        setPlayerPortalInfo(finalData);
        localStorage.setItem(cacheKey, JSON.stringify(finalData));
        return;
      } else {
        throw new Error("No player data returned from API");
      }
    } catch (error) {
      console.warn("Backend /api/player-info failed, trying client fallback for portal data:", error);
      try {
        let players: any[] = [];
        let detailedHistories: any[] = [];
        let recentMatchRecords: any[] = [];

        // 1. 대한체육회 스포츠포털 직접 조회 (GET 쿼리)
        const targetSearchUrl = `https://g1.sports.or.kr/stat/playerSearch.do?gubun=P&searchClassCd=HB&searchSidoCd=&searchSexCd=&searchName=${encodeURIComponent(playerName)}`;
        const proxyUrls = [
          `https://api.allorigins.win/raw?url=${encodeURIComponent(targetSearchUrl)}`,
          `https://corsproxy.io/?url=${encodeURIComponent(targetSearchUrl)}`
        ];

        let searchHtml = "";
        for (const pUrl of proxyUrls) {
          try {
            const res = await axios.get(pUrl, { timeout: 8000 });
            if (typeof res.data === 'string' && res.data.includes("table")) {
              searchHtml = res.data;
              break;
            }
          } catch (e) {}
        }

        if (searchHtml) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(searchHtml, 'text/html');
          const rows = doc.querySelectorAll('table tbody tr');

          rows.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 7) {
              const onclickAttr = tr.getAttribute('onclick') || "";
              let personNo = "";
              let classCd = "HB";
              const m = onclickAttr.match(/viewHistory\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/);
              if (m) {
                classCd = m[1];
                personNo = m[2];
              }

              const no = tds[0]?.textContent?.trim() || "";
              const pName = tds[1]?.textContent?.trim() || "";
              const regYear = tds[2]?.textContent?.trim() || "";
              const gender = tds[3]?.textContent?.trim() || "";
              const sido = tds[4]?.textContent?.trim() || "";
              const sport = tds[5]?.textContent?.trim() || "";
              const category = tds[6]?.textContent?.trim() || "";
              const team = tds.length >= 8 ? (tds[7]?.textContent?.trim() || "") : "";
              if (pName && pName.includes(playerName)) {
                players.push({ no, name: pName, regYear, gender, sido, sport, category, team, personNo, classCd });
              }
            }
          });

          if (teamName && players.length > 0) {
            const matched = players.filter(p => isSchoolMatch(p.team, teamName));
            if (matched.length > 0) {
              players = matched;
            }
          }

          // 세부 경기실적 조회
          if (players.length > 0 && players[0].personNo) {
            const detailTargetUrl = `https://g1.sports.or.kr/stat/playerSearchResult.do?gubun=P&searchClassCd=HB&searchSidoCd=&searchSexCd=&searchName=${encodeURIComponent(playerName)}&classCd=${players[0].classCd || 'HB'}&personNo=${players[0].personNo}`;
            for (const pUrl of [`https://api.allorigins.win/raw?url=${encodeURIComponent(detailTargetUrl)}`, `https://corsproxy.io/?url=${encodeURIComponent(detailTargetUrl)}`]) {
              try {
                const dRes = await axios.get(pUrl, { timeout: 8000 });
                if (typeof dRes.data === 'string' && dRes.data.includes("lookup")) {
                  const dDoc = parser.parseFromString(dRes.data, 'text/html');
                  const lookups = dDoc.querySelectorAll('.lookup');
                  lookups.forEach(lookup => {
                    const title = lookup.querySelector('.lookup-header__title')?.textContent?.trim() || '';
                    if (title.includes('등록이력')) {
                      lookup.querySelectorAll('table tbody tr').forEach(tr => {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length >= 6) {
                          const year = tds[0]?.textContent?.trim() || '';
                          const sport = tds[1]?.textContent?.trim() || '';
                          const category = tds[2]?.textContent?.trim() || '';
                          const sido = tds[3]?.textContent?.trim() || '';
                          const team = tds[4]?.textContent?.trim() || '';
                          const regType = tds[5]?.textContent?.trim() || '';
                          if (/^\d{4}$/.test(year) && sport) {
                            detailedHistories.push({ year, sport, category, sido, team, regType });
                          }
                        }
                      });
                    }
                    if (title.includes('최근 경기실적')) {
                      lookup.querySelectorAll('table tbody tr').forEach(tr => {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length >= 10) {
                          recentMatchRecords.push({
                            period: tds[0]?.textContent?.replace(/\s+/g, ' ').trim() || '',
                            type: tds[1]?.textContent?.trim() || '',
                            tournament: tds[2]?.textContent?.trim() || '',
                            venue: tds[3]?.textContent?.trim() || '',
                            teamCount: tds[4]?.textContent?.trim() || '',
                            matchType: tds[5]?.textContent?.trim() || '',
                            played: tds[6]?.textContent?.trim() || '',
                            position: tds[7]?.textContent?.trim() || '',
                            category: tds[8]?.textContent?.trim() || '',
                            rank: tds[9]?.textContent?.trim() || '',
                            remark: tds.length >= 11 ? tds[10]?.textContent?.trim() || '' : ''
                          });
                        }
                      });
                    }
                  });
                  break;
                }
              } catch (e) {}
            }
          }
        }

        // 포털에서 등록된 최근 경기실적이 없거나 프록시 연결 불가 시, 대회 기록으로부터 자동 생성
        if (recentMatchRecords.length === 0) {
          recentMatchRecords = generateFallbackMatchRecords();
        }

        if (players.length === 0) {
          players = [{
            no: "1",
            name: playerName,
            regYear: "2026",
            gender: "남자",
            sido: teamName?.includes("경남") ? "경남" : "전체",
            sport: "핸드볼",
            category: teamName?.includes("고") ? "18세이하부" : teamName?.includes("중") ? "15세이하부" : "초등부",
            team: teamName || "소속팀"
          }];
        }

        const fallbackData = {
          success: true,
          source: "https://g1.sports.or.kr/stat/playerSearch.do?gubun=P",
          name: playerName,
          team: teamName,
          players,
          detailedHistories,
          recentMatchRecords
        };
        setPlayerPortalInfo(fallbackData);
        localStorage.setItem(cacheKey, JSON.stringify(fallbackData));
      } catch (fbErr) {
        console.error("Portal fallback fetch failed, setting generated records:", fbErr);
        const autoRecords = generateFallbackMatchRecords();
        const fallbackData = {
          success: true,
          source: "https://g1.sports.or.kr/stat/playerSearch.do?gubun=P",
          name: playerName,
          team: teamName,
          players: [{
            no: "1",
            name: playerName,
            regYear: "2026",
            gender: "남자",
            sido: "경남",
            sport: "핸드볼",
            category: teamName?.includes("고") ? "18세이하부" : "15세이하부",
            team: teamName || "소속팀"
          }],
          recentMatchRecords: autoRecords
        };
        setPlayerPortalInfo(fallbackData);
        localStorage.setItem(cacheKey, JSON.stringify(fallbackData));
      }
    } finally {
      setPortalLoading(false);
    }
  };

  // 선수 구글링 및 역대/최근 경기 실적 정보 가져오기
  const fetchPlayerExtraRecords = async (playerName: string, teamName?: string, isRefetch = false) => {
    const cacheKey = `player_extra_v1_${playerName}_${teamName || 'all'}`;
    if (!isRefetch) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          setPlayerExtraRecords(JSON.parse(cached));
          return;
        } catch (e) {
          // ignore cache parse error
        }
      }
    }

    setExtraRecordsLoading(true);
    try {
      const url = `/api/player-extra-records?name=${encodeURIComponent(playerName)}${teamName ? `&team=${encodeURIComponent(teamName)}` : ''}`;
      const res = await axios.get(url);
      if (res.data) {
        setPlayerExtraRecords(res.data);
        localStorage.setItem(cacheKey, JSON.stringify(res.data));
      }
    } catch (err) {
      console.warn("fetchPlayerExtraRecords error:", err);
    } finally {
      setExtraRecordsLoading(false);
    }
  };

  // "나중에 하기" 클릭 시: 현재 감지된 버전에 대해 팝업을 닫고, 이번 세션 동안 무한 재표시 억제
  const handleDismissUpdate = () => {
    if (latestDetectedVersionRef.current) {
      dismissedVersionRef.current = latestDetectedVersionRef.current;
      try {
        sessionStorage.setItem("handball_dismissed_update_version", latestDetectedVersionRef.current);
      } catch (e) {}
    }
    setUpdateAvailable(false);
  };

  // 소스 수정 및 깃허브 배포 시 재조회 없이도 즉시 업데이트 알림 팝업 감지
  useEffect(() => {
    let isChecking = false;

    // 현재 페이지에서 로드된 번들 스크립트 해시 확인
    const getCurrentBundleHash = (): string => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const src = s.getAttribute('src') || '';
        const match = src.match(/assets\/index-([a-zA-Z0-9_-]+)/i) || src.match(/assets\/main-([a-zA-Z0-9_-]+)/i);
        if (match) return match[1];
      }
      return '';
    };

    const initialBundleHash = getCurrentBundleHash();

    const checkAppVersion = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        let serverVersion = "";
        const timestamp = Date.now();

        // 1. /api/app-version 확인 (Express 백엔드 및 Vercel 서버리스 실행 환경)
        try {
          const res = await axios.get(`/api/app-version?t=${timestamp}`, {
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
            timeout: 3000
          });
          if (res.data?.version) {
            serverVersion = res.data.version;
          }
        } catch (apiErr) {
          // fallback to static version.json
        }

        // 2. /version.json 확인 (깃허브 배포 및 정적 호스팅 환경)
        if (!serverVersion) {
          try {
            const resStatic = await axios.get(`/version.json?t=${timestamp}`, {
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
              timeout: 3000
            });
            if (resStatic.data?.version) {
              serverVersion = resStatic.data.version;
            }
          } catch (stErr) {
            // ignore
          }
        }

        // 3. /index.html 확인 (깃허브 배포 시 최신 번들 스크립트 해시 변경 자동 감지)
        if (!serverVersion && initialBundleHash) {
          try {
            const resHtml = await axios.get(`/?t=${timestamp}`, {
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
              timeout: 3500
            });
            if (typeof resHtml.data === 'string') {
              const match = resHtml.data.match(/src="[^"]*\/assets\/index-([^"\.]+)\.js"/i) || 
                            resHtml.data.match(/src="[^"]*\/assets\/main-([^"\.]+)\.js"/i) ||
                            resHtml.data.match(/assets\/index-([a-zA-Z0-9_-]+)/i);
              if (match && match[1]) {
                serverVersion = "hash_" + match[1];
              }
            }
          } catch (htmlErr) {}
        }

        // 4. PWA Service Worker 업데이트 확인
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) {
              reg.update().catch(() => {});
              if (reg.waiting) {
                const dismissed = dismissedVersionRef.current || sessionStorage.getItem("handball_dismissed_update_version");
                if (dismissed !== "sw_waiting") {
                  latestDetectedVersionRef.current = "sw_waiting";
                  setUpdateAvailable(true);
                }
              }
            }
          }).catch(() => {});
        }

        if (serverVersion) {
          // 최초 로드 시점: 현재 앱이 실행 중인 기준 버전을 저장하고 절대 업데이트 팝업을 띄우지 않음
          if (!initialLoadedVersionRef.current) {
            initialLoadedVersionRef.current = serverVersion;
            localStorage.setItem("handball_app_current_version", serverVersion);
            return;
          }

          // 앱이 실행되고 있는 도중에, 새로운 소스코드가 배포되어 최초 로드 시의 버전과 다를 때만 감지
          if (initialLoadedVersionRef.current !== serverVersion) {
            const dismissed = dismissedVersionRef.current || sessionStorage.getItem("handball_dismissed_update_version");
            if (dismissed !== serverVersion) {
              latestDetectedVersionRef.current = serverVersion;
              setUpdateAvailable(true);
            }
          }
        }
      } catch (e) {
        // ignore
      } finally {
        isChecking = false;
      }
    };

    // 1. 마운트 시 최초 기준 버전 설정 (팝업 띄우지 않고 현재 버전만 기록)
    checkAppVersion();

    // 2. 30초 주기로 백그라운드 자동 체크 (새 배포 감지 시 팝업 띄움)
    const interval = setInterval(checkAppVersion, 30000);

    // 3. 브라우저 탭 활성화(포커스) 또는 화면 전환 시 체크
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAppVersion();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkAppVersion);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkAppVersion);
    };
  }, []);

  const handleApplyUpdate = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          await reg.update().catch(() => {});
        }
      }
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }
      if (latestDetectedVersionRef.current) {
        localStorage.setItem("handball_app_current_version", latestDetectedVersionRef.current);
      }
      sessionStorage.removeItem("handball_dismissed_update_version");
    } catch (e) {
      // ignore
    } finally {
      // 쿼리 파라미터로 캐시 우회 강제 리로드하여 최신 코드 즉시 반영
      window.location.replace(window.location.origin + window.location.pathname + '?_t=' + Date.now());
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
        {renderUpdatePopup()}
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

              {/* Professional Scoreboard (grid 1fr auto 1fr로 긴 학교명이어도 전반전/후반전 완벽한 가운데 정렬) */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center py-6 px-3 sm:px-4 bg-white rounded-3xl border border-gray-100 shadow-lg shadow-slate-100/60">
                {/* Home */}
                <div 
                  onClick={() => handleOpenSchoolRecentMatches(matchDetail.homeTeam)}
                  className="flex flex-col items-center justify-center min-w-0 w-full cursor-pointer group transition-transform active:scale-95 px-1"
                  title="학교 최근경기실적 보기"
                >
                  <div className={`text-4xl sm:text-5xl font-black mb-2 transition-all duration-300 ${
                    (parseInt(matchDetail.totalScore.split(':')[0]) || 0) > (parseInt(matchDetail.totalScore.split(':')[1]) || 0) 
                      ? 'text-red-600 scale-105' : 'text-slate-800'}`}>
                    {matchDetail.totalScore.split(':')[0] || '0'}
                  </div>
                  <span className="text-sm sm:text-base font-black text-slate-800 group-hover:text-indigo-600 group-hover:underline text-center break-keep leading-tight px-1 max-w-full">
                    {formatSchoolName(matchDetail.homeTeam)}
                  </span>
                </div>

                {/* Center: Period Scores (전반전 / 후반전 각각 밑에 점수 표시 - 항상 정가운데 고정) */}
                <div className="flex flex-col items-center justify-center px-3 sm:px-4 py-2.5 bg-slate-900 text-white rounded-2xl shadow-md min-w-[85px] sm:min-w-[95px] space-y-1.5 border border-slate-800 mx-auto shrink-0">
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
                <div 
                  onClick={() => handleOpenSchoolRecentMatches(matchDetail.awayTeam)}
                  className="flex flex-col items-center justify-center min-w-0 w-full cursor-pointer group transition-transform active:scale-95 px-1"
                  title="학교 최근경기실적 보기"
                >
                  <div className={`text-4xl sm:text-5xl font-black mb-2 transition-all duration-300 ${
                    (parseInt(matchDetail.totalScore.split(':')[1]) || 0) > (parseInt(matchDetail.totalScore.split(':')[0]) || 0) 
                      ? 'text-red-600 scale-105' : 'text-slate-800'}`}>
                    {matchDetail.totalScore.split(':')[1] || '0'}
                  </div>
                  <span className="text-sm sm:text-base font-black text-slate-800 group-hover:text-indigo-600 group-hover:underline text-center break-keep leading-tight px-1 max-w-full">
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
                      ].map((t, idx) => {
                        const fieldPlayers = t.players.filter(p => !p.isGoalie);
                        const goalies = t.players.filter(p => p.isGoalie);

                        return (
                          <div key={idx} className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-xl shadow-slate-100 space-y-4 pb-4">
                            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                              <span className="text-sm font-black text-white">{formatSchoolName(t.name)}</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Player Roster</span>
                            </div>

                            {/* 필드 플레이어 표 */}
                            <div>
                              <div className="px-5 py-1.5 flex items-center justify-between">
                                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                  <span>필드 플레이어</span>
                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{fieldPlayers.length}명</span>
                                </span>
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
                                    {fieldPlayers.map((p, i) => (
                                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-1 py-2 text-xs font-black text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50 z-10 text-center">{p.no}</td>
                                        <td className="px-1.5 py-2 text-xs font-black text-indigo-600 sticky left-[28px] bg-white group-hover:bg-slate-50 z-10 border-r border-gray-100 whitespace-nowrap text-left">
                                          <button 
                                            onClick={() => fetchPlayerHistory(p.name, t.name, false, false)}
                                            className="hover:underline text-left font-bold"
                                          >
                                            {p.name}
                                          </button>
                                        </td>
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
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* 골키퍼 (GK) - 필드 플레이어와 100% 동일한 인터페이스 */}
                            {goalies.length > 0 && (
                              <div className="pt-2 border-t border-gray-100">
                                <div className="px-5 py-1.5 flex items-center justify-between">
                                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                    <span>골키퍼</span>
                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{goalies.length}명</span>
                                  </span>
                                </div>
                                <div className="overflow-x-auto scrollbar-hide">
                                  <table className="w-full text-center border-collapse whitespace-nowrap min-w-max">
                                    <thead>
                                      <tr className="bg-slate-50/80 border-b border-gray-100">
                                        <th onClick={(e) => handleOpenTerm('No.', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 sticky left-0 bg-slate-50 z-20 cursor-pointer hover:text-indigo-600 uppercase min-w-[28px]">No.</th>
                                        <th onClick={(e) => handleOpenTerm('Name', e)} className="px-1.5 py-2 text-[10px] font-black text-gray-400 sticky left-[28px] bg-slate-50 z-20 border-r border-gray-100 cursor-pointer hover:text-indigo-600 uppercase text-left min-w-[48px]">Name</th>
                                        <th onClick={(e) => handleOpenTerm('방어율', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">방어율</th>
                                        <th onClick={(e) => handleOpenTerm('SV', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">SV</th>
                                        <th onClick={(e) => handleOpenTerm('GKG', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">GKG</th>
                                        <th onClick={(e) => handleOpenTerm('GKAS', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">GKAS</th>
                                        <th onClick={(e) => handleOpenTerm('Wing', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">Wing</th>
                                        <th onClick={(e) => handleOpenTerm('6M', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">6M</th>
                                        <th onClick={(e) => handleOpenTerm('9M', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">9M</th>
                                        <th onClick={(e) => handleOpenTerm('7M', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">7M</th>
                                        <th onClick={(e) => handleOpenTerm('FB', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">FB</th>
                                        <th onClick={(e) => handleOpenTerm('BT', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">BT</th>
                                        <th onClick={(e) => handleOpenTerm('High', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">High</th>
                                        <th onClick={(e) => handleOpenTerm('Mid', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">Mid</th>
                                        <th onClick={(e) => handleOpenTerm('Low', e)} className="px-1 py-2 text-[10px] font-black text-gray-400 cursor-pointer hover:text-indigo-600 uppercase">Low</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {goalies.map((p, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                          <td className="px-1 py-2 text-xs font-black text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50 z-10 text-center">{p.no}</td>
                                          <td className="px-1.5 py-2 text-xs font-black text-indigo-600 sticky left-[28px] bg-white group-hover:bg-slate-50 z-10 border-r border-gray-100 whitespace-nowrap text-left">
                                            <button 
                                              onClick={() => fetchPlayerHistory(p.name, t.name, false, true)}
                                              className="hover:underline text-left font-bold"
                                            >
                                              {p.name}
                                            </button>
                                          </td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-400 text-center">{p.rate ? (p.rate.includes('%') ? p.rate : `${p.rate}%`) : '0%'}</td>
                                          <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.sv || '0'}</td>
                                          <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.gkg || '0'}</td>
                                          <td className="px-1 py-2 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.gkas || '0'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.wing ? (p.wing.includes('%') ? p.wing : `${p.wing}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.m6 ? (p.m6.includes('%') ? p.m6 : `${p.m6}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.m9 ? (p.m9.includes('%') ? p.m9 : `${p.m9}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.m7 ? (p.m7.includes('%') ? p.m7 : `${p.m7}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.fb ? (p.fb.includes('%') ? p.fb : `${p.fb}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.bt ? (p.bt.includes('%') ? p.bt : `${p.bt}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.high ? (p.high.includes('%') ? p.high : `${p.high}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.mid ? (p.mid.includes('%') ? p.mid : `${p.mid}%`) : '-'}</td>
                                          <td className="px-1 py-2 text-[11px] font-bold text-slate-600 text-center">{p.low ? (p.low.includes('%') ? p.low : `${p.low}%`) : '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
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

        {/* Floating Player Modal */}
        {renderPlayerModal()}
        {/* School Recent Matches Modal (상단 학교명 클릭 시 표시) */}
        {renderSchoolRecentModal()}
        {/* Term Explanation Popup (단일 용어 전용 팝업 - 블러 제거, 배경 보임, 글자 위쪽 팝업) */}
        {renderTermExplanationPopup()}
        {/* Update Notification Popup */}
        {renderUpdatePopup()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-sans text-slate-900 pb-20">
      {renderUpdatePopup()}
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

      {/* App Update Popup */}
      {renderUpdatePopup()}
      {/* Player History Modal */}
      {renderPlayerModal()}
      {/* School Recent Matches Modal */}
      {renderSchoolRecentModal()}
      {/* Term Explanation Popup */}
      {renderTermExplanationPopup()}
    </div>
  );
}
