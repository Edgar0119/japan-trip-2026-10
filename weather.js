(function () {
  'use strict';

  var CACHE_KEY = 'trip-2026-10-weather-v1';
  var CACHE_TTL = 30 * 60 * 1000;
  var FALLBACK_TTL = 24 * 60 * 60 * 1000;
  var REQUEST_TIMEOUT = 12000;
  var FORECAST_DAYS = 16;
  var SLOT_LABELS = ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'];
  var CODES = {
    0: ['☀️', '晴'], 1: ['🌤️', '晴時多雲'], 2: ['⛅', '多雲'], 3: ['☁️', '陰'],
    45: ['🌫️', '霧'], 48: ['🌫️', '霧凇'], 51: ['🌦️', '小毛雨'], 53: ['🌦️', '毛雨'],
    55: ['🌧️', '大毛雨'], 56: ['🌧️', '凍雨'], 57: ['🌧️', '凍雨'],
    61: ['🌦️', '小雨'], 63: ['🌧️', '雨'], 65: ['🌧️', '大雨'],
    66: ['🌧️', '凍小雨'], 67: ['🌧️', '凍雨'], 71: ['🌨️', '小雪'],
    73: ['🌨️', '雪'], 75: ['❄️', '大雪'], 77: ['❄️', '雪粒'],
    80: ['🌦️', '陣雨'], 81: ['🌧️', '陣雨'], 82: ['⛈️', '強陣雨'],
    85: ['🌨️', '陣雪'], 86: ['❄️', '強陣雪'], 95: ['⛈️', '雷雨'],
    96: ['⛈️', '雷雨'], 99: ['⛈️', '雷雨']
  };
  var panels = [];
  var state = { signature: '', data: {}, fetchedAt: null, loading: false, stale: false, error: false };
  var pending = null;

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function dateInTokyo(timestamp) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(timestamp === undefined ? Date.now() : timestamp));
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }

  function shiftDate(date, days) {
    var value = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(value.getTime())) return '';
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  function validDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && shiftDate(date, 0) === date;
  }

  function locationKey(location) {
    return String(location.lat) + ',' + String(location.lon);
  }

  function temperature(value) {
    return finite(value) ? String(Math.round(value)) + '°' : '—';
  }

  // Open-Meteo precipitation probability describes the hour ENDING at its timestamp.
  // Thus 00–04 uses 01:00, 02:00, 03:00, 04:00; 20–24 includes tomorrow at 00:00.
  function rainSlots(hourly, date) {
    var slots = [[], [], [], [], [], []];
    if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.precipitation_probability)) {
      return slots.map(function () { return null; });
    }
    var nextDate = shiftDate(date, 1);
    var seen = {};
    hourly.time.forEach(function (time, index) {
      if (typeof time !== 'string' || seen[time]) return;
      seen[time] = true;
      var endHour;
      if (time.slice(0, 10) === date && /^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(time)) {
        endHour = Number(time.slice(11, 13));
        if (endHour < 1 || endHour > 23) return;
      } else if (time === nextDate + 'T00:00') {
        endHour = 24;
      } else {
        return;
      }
      var value = hourly.precipitation_probability[index];
      if (finite(value) && value >= 0 && value <= 100) slots[Math.floor((endHour - 1) / 4)].push(value);
    });
    return slots.map(function (values) { return values.length === 4 ? Math.max.apply(null, values) : null; });
  }

  function addText(parent, tag, className, text) {
    var node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function setMini(panel, value) {
    panel.minis.forEach(function (mini) { mini.textContent = value; });
  }

  function setStatus(panel, message, status) {
    panel.element.dataset.state = status;
    panel.main.textContent = message;
    panel.main.removeAttribute('aria-label');
    panel.grid.replaceChildren();
    panel.grid.hidden = true;
    panel.updated.textContent = '';
    var location = panel.locations[panel.selected];
    setMini(panel, (location ? location.name + ' · ' : '') + message);
  }

  function fetchedLabel() {
    if (!finite(state.fetchedAt)) return '';
    var label = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(state.fetchedAt));
    return '更新 ' + label;
  }

  function renderPanel(panel) {
    var today = dateInTokyo();
    var location = panel.locations[panel.selected];
    panel.refresh.disabled = state.loading || panel.date < today || panel.date > shiftDate(today, FORECAST_DAYS - 1);
    panel.refresh.setAttribute('aria-busy', String(state.loading));
    if (!validDate(panel.date) || !location) {
      setStatus(panel, '暫無天氣資料', 'error');
      panel.refresh.disabled = true;
      return;
    }
    if (panel.date < today) {
      setStatus(panel, '行程已過', 'past');
      return;
    }
    if (panel.date > shiftDate(today, FORECAST_DAYS - 1)) {
      setStatus(panel, '尚未進入預報範圍', 'future');
      return;
    }
    var payload = state.data[locationKey(location)];
    if (!payload || !payload.daily || !Array.isArray(payload.daily.time)) {
      setStatus(panel, state.loading ? '載入中…' : '暫時無法取得', state.loading ? 'loading' : 'error');
      return;
    }
    var daily = payload.daily;
    var index = daily.time.indexOf(panel.date);
    if (index < 0) {
      setStatus(panel, '尚無當日預報', 'unavailable');
      return;
    }
    var code = Array.isArray(daily.weather_code) ? daily.weather_code[index] : null;
    var weather = finite(code) && CODES[code] ? CODES[code] : ['—', '天氣資料待更新'];
    var high = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[index] : null;
    var low = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[index] : null;
    var temps = temperature(high) + '／' + temperature(low);
    panel.element.dataset.state = state.stale ? 'stale' : 'ready';
    panel.main.replaceChildren();
    addText(panel.main, 'span', 'weather-icon', weather[0]).setAttribute('aria-hidden', 'true');
    addText(panel.main, 'span', 'weather-temp', temps);
    addText(panel.main, 'span', 'weather-description', weather[1]);
    panel.main.setAttribute('aria-label', location.name + '，' + weather[1] + '，最高 ' + temperature(high) + '，最低 ' + temperature(low));
    panel.grid.replaceChildren();
    panel.grid.hidden = false;
    panel.grid.setAttribute('aria-label', '每四小時區間最高降雨機率');
    rainSlots(payload.hourly, panel.date).forEach(function (value, slot) {
      var level = value === null ? 'rain-missing' : value < 30 ? 'rain-low' : value < 60 ? 'rain-mid' : 'rain-high';
      var cell = document.createElement('div');
      cell.className = 'rain-cell ' + level + (value !== null && value >= 60 ? ' high' : value !== null && value >= 30 ? ' mid' : '');
      addText(cell, 'small', 'rain-time', SLOT_LABELS[slot]);
      addText(cell, 'strong', 'rain-prob', value === null ? '—' : Math.round(value) + '%');
      cell.title = value === null ? '此時段資料尚未完整' : '此四小時內最高每小時降雨機率';
      panel.grid.appendChild(cell);
    });
    panel.updated.textContent = fetchedLabel() + (state.loading ? ' · 更新中…' : state.stale ? ' · 暫用上次資料' : '');
    setMini(panel, location.name + ' · ' + weather[0] + ' ' + temps);
  }

  function renderAll() {
    panels.forEach(renderPanel);
  }

  function readCache(signature) {
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      var age = cached && finite(cached.fetchedAt) ? Date.now() - cached.fetchedAt : -1;
      if (cached && cached.signature === signature && cached.data && typeof cached.data === 'object' && age >= 0 && age < FALLBACK_TTL) {
        return cached;
      }
    } catch (error) { /* Storage can be unavailable in private browsing. */ }
    return null;
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ signature: state.signature, data: state.data, fetchedAt: state.fetchedAt }));
    } catch (error) { /* The forecast remains usable without storage. */ }
  }

  function fetchForecast(url) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('Weather request timed out'));
      }, REQUEST_TIMEOUT);
    });
    var request = fetch(url, controller ? { signal: controller.signal } : {}).then(function (response) {
      if (!response.ok) throw new Error('Weather response ' + response.status);
      return response.json();
    });
    return Promise.race([request, timeout]).finally(function () { clearTimeout(timer); });
  }

  function loadWeather(force) {
    if (pending) return pending;
    var today = dateInTokyo();
    var lastDate = shiftDate(today, FORECAST_DAYS - 1);
    var locations = [];
    var keys = {};
    panels.forEach(function (panel) {
      if (!validDate(panel.date) || panel.date < today || panel.date > lastDate) return;
      panel.locations.forEach(function (location) {
        var key = locationKey(location);
        if (!keys[key]) { keys[key] = true; locations.push(location); }
      });
    });
    if (!locations.length) { renderAll(); return Promise.resolve(); }
    // Sorted coordinates make the cache shared by itinerary and summary views.
    locations.sort(function (a, b) { return locationKey(a).localeCompare(locationKey(b)); });
    var signature = today + '|Asia/Tokyo|' + locations.map(locationKey).join('|');
    var cache = readCache(signature);
    state.signature = signature;
    state.data = cache ? cache.data : {};
    state.fetchedAt = cache ? cache.fetchedAt : null;
    state.error = false;
    state.stale = Boolean(cache && Date.now() - cache.fetchedAt >= CACHE_TTL);
    if (!force && cache && !state.stale) { renderAll(); return Promise.resolve(); }
    state.loading = true;
    renderAll();
    var params = new URLSearchParams({
      latitude: locations.map(function (location) { return location.lat; }).join(','),
      longitude: locations.map(function (location) { return location.lon; }).join(','),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      hourly: 'precipitation_probability', timezone: 'Asia/Tokyo', forecast_days: String(FORECAST_DAYS)
    });
    pending = fetchForecast('https://api.open-meteo.com/v1/forecast?' + params.toString())
      .then(function (response) {
        var entries = Array.isArray(response) ? response : [response];
        if (entries.length !== locations.length || entries.some(function (entry) {
          return !entry || !entry.daily || !Array.isArray(entry.daily.time);
        })) throw new Error('Incomplete weather response');
        var data = {};
        locations.forEach(function (location, index) { data[locationKey(location)] = entries[index]; });
        state.data = data;
        state.fetchedAt = Date.now();
        state.stale = false;
        saveCache();
      })
      .catch(function () {
        state.error = true;
        if (cache && Date.now() - cache.fetchedAt < FALLBACK_TTL) {
          state.data = cache.data;
          state.fetchedAt = cache.fetchedAt;
          state.stale = true;
        } else {
          state.data = {};
          state.fetchedAt = null;
          state.stale = false;
        }
      })
      .finally(function () { state.loading = false; pending = null; renderAll(); });
    return pending;
  }

  function initialize() {
    document.querySelectorAll('.weather-panel[data-date][data-locations]').forEach(function (element) {
      var locations;
      try { locations = JSON.parse(element.dataset.locations); } catch (error) { locations = []; }
      if (!Array.isArray(locations)) locations = [];
      locations = locations.filter(function (location) {
        return location && typeof location.name === 'string' && finite(location.lat) && finite(location.lon) &&
          location.lat >= -90 && location.lat <= 90 && location.lon >= -180 && location.lon <= 180;
      });
      var panel = {
        element: element, date: element.dataset.date, locations: locations, selected: 0,
        select: element.querySelector('.weather-location'), main: element.querySelector('.weather-main'),
        grid: element.querySelector('.rain-grid'), updated: element.querySelector('.weather-updated'),
        refresh: element.querySelector('.weather-refresh'), minis: []
      };
      if (!panel.select || !panel.main || !panel.grid || !panel.updated || !panel.refresh) return;
      var dayId = element.id.replace(/^weather-/, '');
      document.querySelectorAll('.weather-mini[data-weather-for]').forEach(function (mini) {
        if (mini.dataset.weatherFor === dayId) panel.minis.push(mini);
      });
      panel.select.replaceChildren();
      locations.forEach(function (location, index) {
        var option = document.createElement('option');
        option.value = String(index);
        option.textContent = location.name;
        panel.select.appendChild(option);
      });
      panel.select.disabled = locations.length < 2;
      panel.main.setAttribute('aria-live', 'polite');
      panel.select.addEventListener('change', function () {
        var index = Number(panel.select.value);
        if (Number.isInteger(index) && index >= 0 && index < locations.length) panel.selected = index;
        renderPanel(panel);
      });
      panel.refresh.addEventListener('click', function () { loadWeather(true); });
      var details = element.tagName === 'DETAILS' ? element : element.closest('details');
      if (details) details.open = true;
      panels.push(panel);
    });
    if (!panels.length) return;
    if (typeof fetch !== 'function' || typeof Intl === 'undefined' || typeof URLSearchParams === 'undefined') {
      panels.forEach(function (panel) { setStatus(panel, '此瀏覽器無法讀取天氣', 'error'); panel.refresh.disabled = true; });
      return;
    }
    loadWeather(false);
    // A page restored from the back/forward cache may have crossed midnight.
    window.addEventListener('pageshow', function (event) { if (event.persisted) loadWeather(false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
