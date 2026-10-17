import requests
from bs4 import BeautifulSoup
import json
import os

def fetch_handball_schedule(year, month, group_cd="114"):
    """
    대한핸드볼협회 경기 일정 및 결과를 크롤링합니다.
    """
    # 월 (예: 8 -> '8') - KHF 사이트는 패딩이 필요 없을 수 있음 (HTML 확인 결과)
    url = f"https://khf.handballkorea.com/competition/schedule_list.php?GROUP_CD={group_cd}&SEASON_ID={year}&DS_MONTH={month}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        matches = []
        current_tournament = ""
        current_date = ""
        
        table = soup.select_one('.table_wrap table')
        if not table:
            return {"tournamentName": "조회된 대회 없음", "matches": []}
            
        rows = table.select('tbody tr')
        
        for row in rows:
            tds = row.find_all('td')
            th = row.find('th')
            
            # 대회명 (rowspan th)
            if th:
                current_tournament = th.get_text(strip=True)
                
            time_offset = 0
            # 날짜 (rowspan td)
            if len(tds) >= 6:
                current_date = tds[0].get_text(strip=True)
                time_offset = 1
                
            if len(tds) < (1 + time_offset):
                continue
                
            time = tds[0 + time_offset].get_text(strip=True)
            game_score = row.select_one('.game_score')
            
            if not game_score:
                continue
                
            team_home = game_score.select_one('.team.home .name')
            team_away = game_score.select_one('.team.away .name')
            score_link = game_score.select_one('.score')
            
            team_a = team_home.get_text(strip=True) if team_home else ""
            team_b = team_away.get_text(strip=True) if team_away else ""
            score = score_link.get_text(strip=True) if score_link else "VS"
            
            category = tds[2 + time_offset].get_text(strip=True)
            venue = tds[3 + time_offset].get_text(strip=True)
            
            detail_link = score_link['href'] if score_link and score_link.has_attr('href') else "#"
            if detail_link != "#" and not detail_link.startswith('http'):
                detail_link = f"https://khf.handballkorea.com/competition/{detail_link}"
            
            if team_a and team_b:
                matches.append({
                    "date": f"{current_date} {time}",
                    "teamA": team_a,
                    "teamB": team_b,
                    "score": score,
                    "category": category,
                    "venue": venue,
                    "link": detail_link
                })
        
        return {
            "tournamentName": current_tournament,
            "matches": matches
        }
        
    except Exception as e:
        print(f"Error occurred: {e}")
        return None

if __name__ == "__main__":
    # 테스트: 2026년 8월 데이터 가져오기
    year = 2026
    month = 8
    
    print(f"Crawling {year}년 {month}월 schedule...")
    data = fetch_handball_schedule(year, month)
    
    if data:
        print(f"대회명: {data['tournamentName']}")
        print(f"총 {len(data['matches'])}개의 경기를 찾았습니다.\n")
        
        for idx, match in enumerate(data['matches'][:5], 1):
            print(f"{idx}. [{match['date']}] {match['teamA']} {match['score']} {match['teamB']} ({match['venue']})")
            
        # JSON 파일로 저장
        filename = f"schedule_{year}_{month}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n데이터가 '{filename}'에 저장되었습니다.")
