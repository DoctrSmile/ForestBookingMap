// controls.js (robust init with wait-for-map)
(function () {
  // ===== Helper: wait until condition becomes true (with timeout) =====
  function waitFor(condFn, onReady, {timeout=15000, interval=60} = {}) {
    const start = Date.now();
    (function check() {
      try {
        if (condFn()) return onReady();
      } catch (e) { /* ignore and keep waiting */ }
      if (Date.now() - start > timeout) {
        showError('초기화 시간 초과: 지도/아이콘 스크립트가 준비되지 않았습니다.');
        return;
      }
      setTimeout(check, interval);
    })();
  }

  function showError(msg) {
    const box = document.getElementById('errorBox');
    if (box) {
      box.style.display = 'block';
      box.textContent = '스크립트 오류로 지도를 꾸미지 못했습니다. 새로고침 또는 외부 브라우저(Chrome/Safari)로 열어주세요.\n(' + msg + ')';
    }
    console.error(msg);
  }

  // Folium이 만든 전역 지도 객체 키 찾기 (예: map_abc123)
  function getMapKey() {
    return Object.keys(window).find(
      k => /^map_/.test(k) && window[k] && typeof window[k].eachLayer === 'function'
    );
  }

  // ===== Main boot after map & plugins ready =====
  function boot() {
    const mapKey = getMapKey();
    if (!mapKey) { showError('Map instance not found'); return; }
    const MAP = window[mapKey];

    // 유틸
    function dateToYMDLocal(d) {
      const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), da = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${da}`;
    }
    function todayKSTDate(){
      const now = new Date();
      const s = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
      const k = new Date(s);
      return new Date(k.getFullYear(), k.getMonth(), k.getDate());
    }
    function parseISODateOnly(iso){
      const d = new Date(iso);
      if (isNaN(d)) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    function statusFor(opens, refDate){
      if (!opens || !opens.length) return 'unknown';
      const ref = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()).getTime();
      let hasToday=false, hasFuture=false;
      for (const iso of opens){
        const d = parseISODateOnly(iso);
        if (!d) continue;
        const t = d.getTime();
        if (t === ref) hasToday = true;
        else if (t > ref) hasFuture = true;
      }
      if (hasToday) return 'today';
      if (hasFuture) return 'future';
      return 'past';
    }
    function iconByStatus(st){
      const color = st === 'today' ? 'blue' : (st === 'future' ? 'green' : 'gray');
      return L.AwesomeMarkers.icon({ icon:'info-sign', markerColor: color, prefix:'glyphicon' });
    }

    // 모든 마커 + 오픈데이터 수집
    const MARKERS = [];
    MAP.eachLayer(function(layer){
      if (layer && layer.getPopup && layer.getLatLng){
        const popup = layer.getPopup && layer.getPopup();
        if (!popup) return;
        const div = document.createElement('div');
        div.innerHTML = popup.getContent();
        const data = div.querySelector('.open-data');
        let opens = [];
        if (data){
          try { opens = JSON.parse((data.getAttribute('data-opens')||'[]').replace(/'/g, '"')); } catch(e){ opens = []; }
        }
        MARKERS.push({ marker: layer, opens });
      }
    });

    const refDateInput = document.getElementById('refDate');
    const onlyTodayChk = document.getElementById('onlyToday');
    const resetBtn = document.getElementById('resetBtn');

    function ensureRefDate(){
      if (!refDateInput) return;
      if (!refDateInput.value){
        const t = todayKSTDate();
        refDateInput.value = dateToYMDLocal(t);
      }
    }
    ensureRefDate();

    function currentRefDate(){
      if (!refDateInput || !refDateInput.value) return todayKSTDate();
      const parts = (refDateInput.value || '').split('-').map(x=>parseInt(x,10));
      if (parts.length < 3 || parts.some(isNaN)) return todayKSTDate();
      return new Date(parts[0], parts[1]-1, parts[2]);
    }

    function showMarker(m){ if (!MAP.hasLayer(m)) m.addTo(MAP); }
    function hideMarker(m){ if (MAP.hasLayer(m)) MAP.removeLayer(m); }

    function update(){
      const ref = currentRefDate();
      const onlyToday = !!(onlyTodayChk && onlyTodayChk.checked);
      for (const it of MARKERS){
        const st = statusFor(it.opens, ref);
        it.marker.setIcon(iconByStatus(st));
        if (onlyToday){
          if (st === 'today') showMarker(it.marker); else hideMarker(it.marker);
        } else {
          showMarker(it.marker);
        }
      }
    }

    refDateInput && refDateInput.addEventListener('change', update);
    onlyTodayChk && onlyTodayChk.addEventListener('change', update);
    resetBtn && resetBtn.addEventListener('click', function(e){
      e.preventDefault();
      const t = todayKSTDate();
      if (refDateInput) refDateInput.value = dateToYMDLocal(t);
      update();
    });

    update();
  }

  // ===== Start: wait until Leaflet + AwesomeMarkers + Folium map are ready =====
  waitFor(
    () => window.L && L.AwesomeMarkers && getMapKey(),
    boot,
    { timeout: 20000, interval: 80 }
  );
})();
