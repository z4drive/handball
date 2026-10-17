/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Menu, ChevronDown, Home, ChevronRight, ArrowUp } from 'lucide-react';
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
      const response = await axios.get(`/api/schedule?year=${y}&month=${m}`);
      const fetchedData = response.data;
      setData(fetchedData);
      localStorage.setItem(cacheKey, JSON.stringify(fetchedData));
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
            onClick={() => {
              setMatchDetail(null);
              setActiveDetailTab('compare');
            }}
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

              {/* Redesigned Scoreboard */}
              <div className="flex items-center justify-center space-x-6 py-8 px-4 bg-white rounded-3xl border border-gray-50 shadow-xl shadow-slate-100/50">
                {/* Home */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`text-5xl font-black mb-4 transition-all duration-500 ${
                    (parseInt(matchDetail.totalScore.split(':')[0]) || 0) > (parseInt(matchDetail.totalScore.split(':')[1]) || 0) 
                      ? 'text-red-600 scale-110' : 'text-slate-800'}`}>
                    {matchDetail.totalScore.split(':')[0] || '0'}
                  </div>
                  <span className="text-base font-black text-slate-800 text-center break-keep leading-tight px-2">{matchDetail.homeTeam}</span>
                </div>

                {/* Periods */}
                <div className="flex flex-col items-center space-y-3 min-w-[80px]">
                  {matchDetail.periodScores.map((period, i) => (
                    <div key={i} className="flex items-center space-x-3 bg-gray-50/80 px-3 py-1 rounded-full">
                      <span className="text-xs font-bold text-slate-600">{period.home}</span>
                      <span className="text-[10px] text-gray-300 font-black uppercase">{period.label}</span>
                      <span className="text-xs font-bold text-slate-600">{period.away}</span>
                    </div>
                  ))}
                  <div className="w-full h-px bg-gray-100 my-2"></div>
                  <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest">SCOREBOARD</div>
                </div>

                {/* Away */}
                <div className="flex flex-col items-center flex-1">
                  <div className={`text-5xl font-black mb-4 transition-all duration-500 ${
                    (parseInt(matchDetail.totalScore.split(':')[1]) || 0) > (parseInt(matchDetail.totalScore.split(':')[0]) || 0) 
                      ? 'text-red-600 scale-110' : 'text-slate-800'}`}>
                    {matchDetail.totalScore.split(':')[1] || '0'}
                  </div>
                  <span className="text-base font-black text-slate-800 text-center break-keep leading-tight px-2">{matchDetail.awayTeam}</span>
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
                    <span className="text-xs font-black text-slate-800 flex-1">{matchDetail.homeTeam}</span>
                    <span className="text-[10px] font-black text-gray-300 mx-4">VS</span>
                    <span className="text-xs font-black text-slate-800 flex-1 text-right">{matchDetail.awayTeam}</span>
                  </div>

                  {/* Comparison Bars */}
                  <div className="space-y-6 px-2">
                    {(matchDetail.compareBars || []).map((stat, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <div className="flex justify-between w-full mb-1.5 px-2">
                          <span className="text-xs font-black text-slate-700">{stat.home}</span>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</span>
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

                  {/* Icon Stats (Cards/Major) */}
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { team: 'home', icons: matchDetail.homeIcons, name: matchDetail.homeTeam },
                      { team: 'away', icons: matchDetail.awayIcons, name: matchDetail.awayTeam }
                    ].map((t, idx) => (
                      <div key={idx} className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 mb-4 text-center truncate uppercase tracking-widest">{t.name}</p>
                        <div className="grid grid-cols-3 gap-3">
                          {Object.entries(t.icons).map(([type, val]) => (
                            <div key={type} className="flex flex-col items-center">
                              <div className={`w-6 h-7 rounded-md mb-1.5 flex items-center justify-center text-[10px] font-black text-white shadow-sm
                                ${type === 'yc' ? 'bg-yellow-400' : 
                                  type === 'min2' ? 'bg-indigo-500' : 
                                  type === 'rc' ? 'bg-red-500' : 
                                  type === 'bc' ? 'bg-blue-600' : 'bg-gray-400'}`}
                              >
                                {type === 'yc' ? 'Y' : type === 'min2' ? '2\'' : type === 'rc' ? 'R' : type === 'bc' ? 'B' : '?'}
                              </div>
                              <span className="text-[11px] font-black text-slate-800">{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Original table stats */}
                  <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Detailed Team Stats</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {matchDetail.tableStats.map((stat, i) => (
                        <div key={i} className="flex items-center px-6 py-4 hover:bg-slate-50 transition-colors">
                          <div className="w-1/3 text-sm font-black text-slate-800">{stat.home}</div>
                          <div className="w-1/3 text-center">
                            <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-3 py-1 rounded-full uppercase">{stat.label}</span>
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
                            <span className="text-sm font-black text-white">{t.name}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Player Roster</span>
                          </div>
                          <div className="overflow-x-auto scrollbar-hide">
                            <table className="w-full text-left border-collapse min-w-[1200px]">
                              <thead>
                                <tr className="bg-slate-50/50 border-b border-gray-100">
                                  <th className="px-4 py-3 text-[10px] font-black text-gray-400 sticky left-0 bg-slate-50/50 z-10 uppercase tracking-widest">No.</th>
                                  <th className="px-4 py-3 text-[10px] font-black text-gray-400 sticky left-[40px] bg-slate-50/50 z-10 border-r border-gray-100 uppercase tracking-widest">Name</th>
                                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 text-center uppercase">G/S</th>
                                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 text-center uppercase">%</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">6M</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">Wing</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">9M</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">7M</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">FB</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">BT</th>
                                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 text-center uppercase">AS</th>
                                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 text-center uppercase">TF</th>
                                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 text-center uppercase">BD</th>
                                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 text-center uppercase">BS</th>
                                  <th className="px-3 py-3 text-[10px] font-black text-gray-400 text-center uppercase">ST</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">YC</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">2'</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">RC</th>
                                  <th className="px-2 py-3 text-[10px] font-black text-gray-400 text-center uppercase">Rep</th>
                                  <th className="px-4 py-3 text-[10px] font-black text-gray-400 text-center uppercase">Time</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {t.players.map((p, i) => (
                                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-4 text-xs font-black text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50 z-10">{p.no}</td>
                                    <td className="px-4 py-4 text-xs font-black text-indigo-600 sticky left-[40px] bg-white group-hover:bg-slate-50 z-10 border-r border-gray-100 whitespace-nowrap">
                                      <button 
                                        onClick={() => fetchPlayerHistory(p.name, t.name)}
                                        className="hover:underline text-left"
                                      >
                                        {p.name}
                                      </button>
                                    </td>
                                    {p.isGoalie ? (
                                      <>
                                        <td className="px-3 py-4 text-sm font-black text-slate-800 text-center">{p.gs}</td>
                                        <td className="px-3 py-4 text-xs font-black text-slate-400 text-center">{p.rate}%</td>
                                        <td colSpan={6} className="bg-gray-50/30"></td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.as}</td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.tf}</td>
                                        <td className="px-3 py-4 text-xs font-black text-slate-400 text-center"></td>
                                        <td className="px-3 py-4 text-xs font-black text-slate-400 text-center"></td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.st}</td>
                                        <td colSpan={3}></td>
                                        <td className="px-3 py-4 text-[10px] font-bold text-gray-400 text-center"></td>
                                        <td className="px-4 py-4 text-[11px] font-bold text-slate-500 text-center">{p.playTime}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-3 py-4 text-sm font-black text-slate-800 text-center">{p.gs}</td>
                                        <td className="px-3 py-4 text-xs font-black text-slate-400 text-center">{p.rate}%</td>
                                        <td className="px-2 py-4 text-[11px] font-bold text-slate-500 text-center">{p.m6}</td>
                                        <td className="px-2 py-4 text-[11px] font-bold text-slate-500 text-center">{p.wing}</td>
                                        <td className="px-2 py-4 text-[11px] font-bold text-slate-500 text-center">{p.m9}</td>
                                        <td className="px-2 py-4 text-[11px] font-bold text-slate-500 text-center">{p.m7}</td>
                                        <td className="px-2 py-4 text-[11px] font-bold text-slate-500 text-center">{p.fb}</td>
                                        <td className="px-2 py-4 text-[11px] font-bold text-slate-500 text-center">{p.bt}</td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.as}</td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.tf}</td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.bd}</td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.bs}</td>
                                        <td className="px-3 py-4 text-xs font-black text-indigo-600 text-center bg-indigo-50/20">{p.st}</td>
                                        <td className="px-2 py-4 text-center">
                                          {p.yc !== '0' && p.yc && <span className="w-5 h-5 bg-yellow-400 rounded-md inline-flex items-center justify-center text-[10px] text-white font-black shadow-sm">{p.yc}</span>}
                                        </td>
                                        <td className="px-2 py-4 text-center">
                                          {p.m2 !== '0' && p.m2 && <span className="w-5 h-5 bg-indigo-500 rounded-md inline-flex items-center justify-center text-[10px] text-white font-black shadow-sm">{p.m2}</span>}
                                        </td>
                                        <td className="px-2 py-4 text-center">
                                          {p.rc !== '0' && p.rc && <span className="w-5 h-5 bg-red-500 rounded-md inline-flex items-center justify-center text-[10px] text-white font-black shadow-sm">{p.rc}</span>}
                                        </td>
                                        <td className="px-2 py-4 text-[10px] font-bold text-gray-400 text-center">{p.report}</td>
                                        <td className="px-4 py-4 text-[11px] font-bold text-slate-500 text-center">{p.playTime}</td>
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
                      <h2 className="text-2xl font-black text-slate-800">{selectedPlayer} 선수 기록</h2>
                      <p className="text-xs text-indigo-600 font-black mt-1 uppercase tracking-widest">Season Match History</p>
                    </div>
                    <button 
                      onClick={() => setSelectedPlayer(null)}
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

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {playerLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4">
                      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-black text-slate-300 uppercase tracking-widest">Fetching season data...</p>
                    </div>
                  ) : playerHistory.length > 0 ? (
                    <div className="space-y-4">
                      {playerHistory.map((h, i) => (
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
                              {h.teamA}
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
                              {h.teamB}
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
                      <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No matching records found.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
              <img src="https://khf.handballkorea.com/images/common/logo.png" alt="Logo" className="w-7 h-7 invert" />
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
                              <div className="flex-1 text-sm font-bold text-slate-700 truncate">{m.teamA}</div>
                              <div className="mx-6 flex items-center space-x-3 bg-red-50 px-3 py-1 rounded-full border border-red-100">
                                <span className="text-base font-black text-red-600">{m.score.includes(':') ? m.score.split(':')[0] : '-'}</span>
                                <span className="text-xs font-bold text-red-200">:</span>
                                <span className="text-base font-black text-red-600">{m.score.includes(':') ? m.score.split(':')[1] : '-'}</span>
                              </div>
                              <div className="flex-1 text-sm font-bold text-slate-700 text-right truncate">{m.teamB}</div>
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
                        <span className="flex-1 text-right text-lg font-medium text-slate-800">{match.teamA}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl font-bold text-red-600">
                            {match.score.includes(':') ? match.score.split(':')[0] : '-'}
                          </span>
                          <span className="text-xl font-bold text-red-600">:</span>
                          <span className="text-2xl font-bold text-red-600">
                            {match.score.includes(':') ? match.score.split(':')[1] : '-'}
                          </span>
                        </div>
                        <span className="flex-1 text-left text-lg font-medium text-slate-800">{match.teamB}</span>
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
                    onClick={() => setSelectedPlayer(null)}
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
                            {h.teamA}
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
                            {h.teamB}
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
    </div>
  );
}
