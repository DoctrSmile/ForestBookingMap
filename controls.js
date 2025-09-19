/* global L, Papa, dayjs */
(function(){
  // ---- Utils ----
  const qs = new URLSearchParams(location.search);
  const CSV_URL = qs.get('csv') || 'data_2025_map.csv';          // 일정 CSV (이번에 만든 1년치)
  const COORDS_URL = qs.get('coords') || 'facilities.csv';       // 좌표/홈페이지 CSV (예전 파일 그대로)
  const DEFAULT_D  = qs.get('d') || dayjs().format('YYYY-MM-DD'); // 초기 기준일
  const TODAY_ONLY = qs.get('todayOnly') === '1';

  dayjs.extend(window.dayjs_plugin_utc);
  dayjs.extend(window.dayjs_plugin_timezone);
  dayjs.tz.setDefault('Asia/Seoul');

  const MONTH_KEYS = Array.from({length:12}, (_,i)=> `${i+1}월 일반예약 오픈일시(복수)`);

  const $month = document.getElementById('month');
  const $todayOnly = document.getElementById('todayOnly');
  const $baseDate = document.getElementById('baseDate');
  const $err = document.getElementById('error');

  // init controls
  $todayOnly.checked = TODAY_ONLY;
  $baseDate.value = DEFAULT_D;
  if(qs.get('m')) $month.value = String(parseInt(qs.get('m'),10) || 0);

  // ---- Map ----
  const map = L.map('map',{zoomControl:true}).setView([36.4, 127.9], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  const layerGroup = L.layerGroup().addTo(map);

  // ---- Data Loaders ----
  function parseCsv(url){
    return new Promise((resolve, reject)=>{
      Papa.parse(url, {
        download: true, header: true, skipEmptyLines: true,
        complete: (res)=>{
          // trim keys/values
          const rows = res.data.map(r=>{
            const out = {};
            for(const k in r){
              const key = (k||'').replace(/\u00A0/g,' ').trim();
              out[key] = String(r[k] ?? '').replace(/\u00A0/g,' ').trim();
            }
            return out;
          });
          resolve(rows);
        },
        error: reject
      });
    });
  }

  // 날짜 문자열들(세미콜론 구분)을 파싱 → Dayjs 배열
  function parseOpens(str){
    if(!str) return [];
    return str.split(';').map(s=>s.trim()).filter(Boolean).map(s=>{
      // 기대 포맷: YYYY-MM-DD HH:mm
      const d = dayjs.tz(s, 'YYYY-MM-DD HH:mm', 'Asia/Seoul', true);
      return d.isValid() ? d : null;
    }).filter(Boolean);
  }

  function classifyStatus(dt, base){
    if(!dt) return 'past';
    if(dt.isSame(base, 'day')) return 'today';     // 같은 날짜면 파랑
    if(dt.isAfter(base)) return 'upcoming';        // 미래면 초록
    return 'past';                                 // 과거면 회색
  }

  function colorBy(status){
    if(status==='today') return '#1d4ed8';
    if(status==='upcoming') return '#16a34a';
    return '#9ca3af';
  }

  // ---- Main ----
  Promise.all([parseCsv(CSV_URL), parseCsv(COORDS_URL)]).then(([schedules, coords])=>{
    // coords: {휴양림명, 위도, 경도, 홈페이지, (선택)권역/지자체}
    const coordMap = new Map();
    coords.forEach(r=>{
      const key = (r['휴양림명']||'').trim();
      if(!key) return;
      const lat = parseFloat(r['위도']);
      const lng = parseFloat(r['경도']);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        coordMap.set(key, {
          lat, lng,
          home: (r['공식URL']||r['홈페이지']||'').trim(),
          region: (r['권역']||r['지역']||'').trim(),
          muni: (r['지자체']||'').trim()
        });
      }
    });

    function render(){
      layerGroup.clearLayers();
      $err.style.display = 'none';

      const base = dayjs.tz($baseDate.value || DEFAULT_D, 'YYYY-MM-DD', 'Asia/Seoul');

      const monthSel = parseInt($month.value,10) || 0;
      let shown = 0;

      schedules.forEach(row=>{
        const name = (row['휴양림명']||'').trim();
        if(!name) return;

        const pos = coordMap.get(name);
        if(!pos){
          // 좌표 없는 시설은 스킵 (원하면 에러박스로 개수 표시 가능)
          return;
        }

        // 월별 시간들 모으기
        let openList = [];
        if(monthSel===0){
          MONTH_KEYS.forEach(k=>{
            openList = openList.concat(parseOpens(row[k]));
          });
        }else{
          const key = `${monthSel}월 일반예약 오픈일시(복수)`;
          openList = parseOpens(row[key]);
        }

        if(openList.length===0) return;

        // 상태 산정 (가장 가까운 오픈을 대표로)
        const sorted = openList.sort((a,b)=>a.valueOf()-b.valueOf());
        let rep = sorted[0];
        // "오늘만 보기"인 경우 필터
        if($todayOnly.checked){
          const todays = openList.filter(dt=>dt.isSame(base,'day'));
          if(todays.length===0) return;
          rep = todays[0];
        }

        const st = classifyStatus(rep, base);
        const color = colorBy(st);

        const marker = L.circleMarker([pos.lat, pos.lng],{
          radius: 8, color, fillColor: color, fillOpacity: 0.9, weight: 1
        });

        // 팝업 콘텐츠
        const timesHtml = openList
          .map(d=>`<li>${d.format('YYYY-MM-DD HH:mm')}</li>`).join('');
        const home = pos.home ? `<div>공식홈페이지: <a href="${pos.home}" target="_blank" rel="noopener">바로가기</a></div>` : '';
        const meta = `<div style="color:#6b7280">${row['구분']||''} · ${pos.region||row['지역']||''} · ${pos.muni||row['지자체']||''}</div>`;

        marker.bindPopup(`
          <div class="popup">
            <div style="font-weight:700;margin-bottom:4px">${name}</div>
            ${meta}
            ${home}
            <div style="margin-top:6px;font-weight:600">오픈일시</div>
            <ul style="margin:6px 0 0 18px">${timesHtml}</ul>
          </div>
        `);

        marker.addTo(layerGroup);
        shown++;
      });

      if(shown===0){
        $err.textContent = '표시할 마커가 없습니다. (월/오늘만/기준일 필터를 확인하세요)';
        $err.style.display = 'block';
      }
    }

    // First render + listeners
    render();
    $month.addEventListener('change', render);
    $todayOnly.addEventListener('change', render);
    $baseDate.addEventListener('change', render);
  })
  .catch(err=>{
    const $err = document.getElementById('error');
    $err.textContent = '데이터를 불러오지 못했습니다: ' + (err && err.message ? err.message : err);
    $err.style.display = 'block';
  });
})();
