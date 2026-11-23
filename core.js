// 版本：2026-11-23 #1 17:20 新增 API_URL 模式（GitHub Pages）
        // GLOBAL STATE
        const STORAGE_KEY = 'MUJI_NOTEBOOK_STATE_V2';
        // 後端有兩種連法：config.js 填了 API_URL（GitHub Pages 新版，fetch + 密碼登入）；或頁面由 GAS 吐出（google.script.run）
        const MK_API_URL = (window.MK_CONFIG && window.MK_CONFIG.API_URL) || '';
        const IS_GAS = !!MK_API_URL || (typeof google !== 'undefined' && !!(google.script && google.script.run));
        let state = {
            activeTab: 'home',
            diaryViewMode: 'timeline',
            selectedDate: getLocalDateStr(new Date()),
            calView: 'week',
            lastBackupAt: 0, // 上次「成功」備份到試算表的時間（增量備份基準；0=下次做全量備份）
            lastTasksSyncedAt: 0, // Google Tasks 增量拉取基準點（伺服器毫秒時間）
            lastFullPullAt: 0, // 上次「完整拉取」的時間：超過 12 小時就強制完整拉一次，補上離線編輯在增量拉取裡漏掉的項目
            lastSyncedAt: 0, // 增量同步基準點：pullAllData只拉這個時間點之後有變動的雲端資料，減少長期累積後的傳輸量
            weatherCity: '',
            weatherDistrict: '',
            weatherCoords: null, // { lat, lon }
            weatherCache: null, // { data, fetchedAt }
            aqiCache: null,     // { data, fetchedAt }
            epaStationCache: null, // { list, fetchedAt, version } 環境部官方測站基本資料
            quoteCache: null,   // { text, dateStr }
            isDarkMode: false,
            availableCalendars: [], // [{id,name,color}] 從GAS listCalendars抓回來的日曆清單，供設定頁勾選
            syncedCalendarIds: [], // 使用者勾選要讀取/顯示的Google日曆id清單
            todos: [],
            notes: [],
            habits: [],
            habitLogs: {},
            habitLogMeta: {}, // { 'yyyy-MM-dd|habitId': { done, updatedAt } } 每次打卡／取消的時間戳記，跨裝置以較新者為準
            pendingOps: [],   // 還沒送達後端的副作用（刪除紀錄、刪 Google 工作／日曆活動、標記雲端圖片刪除），開機與恢復網路時重送
            diaries: [],
            events: []
        };

        // INITIALIZATION
        window.onload = function() {
            if (!IS_GAS) {
                document.body.innerHTML = '<p style="text-align:center;margin-top:20vh;font-family:sans-serif;color:#8C857B;">尚未設定後端：請從 GAS 線上網址開啟，或在 config.js 填入 API_URL</p>';
                return;
            }
            if (MK_API_URL) document.getElementById('logout-btn').classList.remove('hidden');
            loadState();
            state.activeTab = 'home'; // 頁面一律從首頁開始，畫面與資料狀態才一致
            resetNavigationPositionToToday();
            pruneOldHabitLogs();
            backfillTodoCompletedAt();
            applyDarkModeUI();
            renderAll();
            try { changeCalView(state.calView || 'week'); switchDiaryView(state.diaryViewMode || 'timeline'); } catch (e) { console.error(e); } // 讓切換鈕外觀與還原的狀態一致
            initWeatherAndAqiModule();
            // 有設定GAS網址時，開機自動跟雲端合併一次待辦/隨記/習慣/日記/行程（依updatedAt比對，不是整批覆蓋）
            if (IS_GAS) {
                pullAllDataFromGas(Date.now() - (state.lastFullPullAt || 0) > 12 * 3600e3).catch(err => console.error('跨裝置資料合併失敗', err))
                    .finally(() => pullTasksFromGas().catch(err => console.error('Google工作拉取失敗', err)));
            }
            // 有設定GAS網址且勾選了要顯示的Google日曆時，開機自動拉一次最新行程
            if (IS_GAS && state.syncedCalendarIds && state.syncedCalendarIds.length > 0) {
                pullGoogleCalendarEvents().catch(err => console.error('Google日曆同步失敗', err));
            }
            syncToGas(); // 開機補送上次失敗／離線期間尚未備份的修改（首次升級會做一次全量備份）
            // 開機順便補傳「離線時新增、本機還是Base64、雲端還沒有」的圖片
            retryPendingImageUploads();
            flushPendingOps();      // 補送上次沒送達的刪除紀錄等副作用
            retryDirtyGcalSync();   // 補送上次沒同步成功的 Google 工作／日曆編輯
            // 首次載入且尚未有任何定位/手動地點設定時，主動嘗試一次靜默定位（使用者可拒絕，不影響其他功能）
            if (!state.weatherCoords && !state.weatherCity && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        state.weatherCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                        saveState();
                        refreshWeatherAndAqi(true);
                    },
                    () => { /* 使用者拒絕定位，維持預設台中東區備援，不特別提示 */ },
                    { timeout: 6000 }
                );
            }
        };

        function loadState() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    state = Object.assign(state, JSON.parse(saved));
                    ['todos', 'notes', 'habits', 'diaries', 'events'].forEach(k => { state[k] = scrubList(state[k]); });
                    if (!state.habitLogMeta || typeof state.habitLogMeta !== 'object' || Array.isArray(state.habitLogMeta)) state.habitLogMeta = {};
                    if (!Array.isArray(state.pendingOps)) state.pendingOps = [];
                    if (!state.schemaV4) { state.schemaV4 = true; state.lastBackupAt = 0; } // 試算表新增 imageFileId／imagePosition 欄：升級後做一次全量備份把舊資料補齊
                } catch(e) {
                    console.error("Failed to load local storage state", e);
                }
            }
        }

        // 開啟App／重新整理頁面時，把「目前瀏覽位置」（不是資料本身）強制重置回今日/本週/本月，
        // 避免上次瀏覽到未來或過去的日期後，重開App還停留在那裡；
        // 只在頁面載入這個時間點重置一次，同一次使用期間切換分頁不會受影響，瀏覽位置會保留
        // （不呼叫saveState()，純粹是記憶體內的畫面狀態修正，不需要為此觸發一次雲端同步）
        function resetNavigationPositionToToday() {
            const today = new Date();
            const todayStr = getLocalDateStr(today);
            state.selectedDate = todayStr;
            state.miniCal = { year: today.getFullYear(), month: today.getMonth() };
            state.diaryWeekStart = getMondayOfDate(todayStr);
            miniCalYear = today.getFullYear();
            miniCalMonth = today.getMonth();
        }

        // habitLogs 是每日打卡紀錄，只是自動產生的資料，不像日記是使用者手寫內容，
        // 保留兩年份即可（連續打卡天數計算只看最近的連續區間），避免無限累積佔用 localStorage
        function pruneOldHabitLogs() {
            if (!state.habitLogs) return;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 730);
            const cutoffStr = getLocalDateStr(cutoff);
            Object.keys(state.habitLogs).forEach(dateStr => {
                if (dateStr < cutoffStr) delete state.habitLogs[dateStr];
            });
            Object.keys(state.habitLogMeta || {}).forEach(k => { if (k.slice(0, 10) < cutoffStr) delete state.habitLogMeta[k]; });
        }

        // 已完成但沒有 completedAt 的舊資料，用該筆的 updatedAt（最後編輯時間）當作推測值；
        // completedAt 是雲端封存（TODO_CLOUD_ARCHIVE_DAYS）判斷「完成多久」的依據
        function backfillTodoCompletedAt() {
            let changed = false;
            state.todos.forEach(t => {
                if (t.completed && !t.completedAt) {
                    t.completedAt = t.updatedAt || Date.now();
                    changed = true;
                }
            });
            if (changed) saveState();
        }

        // 只存本機、不觸發雲端備份：天氣／空品／語錄這類快取用（不是使用者資料，不該每次都打一次備份）
        function saveLocalOnly() {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { console.error('localStorage 儲存失敗', err); }
        }

        function saveState() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (err) {
                console.error('localStorage 儲存失敗', err);
                uiAlert('儲存失敗：裝置本機儲存空間可能已滿，這次修改沒有存到本機。\n請至「設定」查看目前用量，考慮清理較舊的圖片或內容。');
                return; // 存不進去就不觸發雲端備份，避免拿一份沒真的存進本機的資料去蓋掉雲端
            }
            syncToGas();
        }

        // 上一步復原（輕量版）：只記最近一次的「編輯覆蓋前版本」或「被刪除的項目」，只能復原一步
        let lastUndoAction = null; // { listName, item }

        function recordUndoAction(listName, previousItem) {
            lastUndoAction = { listName, item: JSON.parse(JSON.stringify(previousItem)) };
            const btn = document.getElementById('undo-last-action-btn');
            if (btn) btn.classList.remove('hidden');
        }

        function undoLastAction() {
            if (!lastUndoAction) return;
            const { listName, item } = lastUndoAction;
            // 復原後蓋上新的時間戳記，避免被舊的刪除紀錄（墓碑）或其他裝置的舊資料在下次同步時又蓋掉
            item.updatedAt = Date.now();
            const idx = state[listName].findIndex(x => x.id === item.id);
            if (idx >= 0) {
                state[listName][idx] = item; // 復原「編輯覆蓋」
            } else {
                state[listName].push(item); // 復原「被刪除」
            }
            saveState();
            // 復原「換圖／刪除」：舊圖已被改名並取消分享，要還原標記，否則圖片會破圖
            if (item.imageFileId && IS_GAS && typeof callGasBackend === 'function') callGasBackend({ action: 'unmarkImageDeleted', fileId: item.imageFileId }).catch(err => console.error('還原雲端圖片標記失敗', err));
            lastUndoAction = null;
            document.getElementById('undo-last-action-btn').classList.add('hidden');
            renderAll();

            // 有勾選同步Google日曆/工作的待辦或行程，復原後重新觸發一次同步：
            // 如果原本是被刪除，Google那邊的活動/工作項目已經真的被刪掉了，這裡補建立回來
            if (item.syncGcal) {
                if (listName === 'todos') syncTodoToGcalTask(item);
                else if (listName === 'events') syncEventToGcal(item);
            }
        }

        function toggleDarkMode() {
            state.isDarkMode = !state.isDarkMode;
            applyDarkModeUI();
            saveState();
        }

        function applyDarkModeUI() {
            if (state.isDarkMode) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            const toggleBtn = document.getElementById('dark-mode-toggle-btn');
            if (toggleBtn) {
                const ic = toggleBtn.querySelector('i');
                if (ic) ic.className = (state.isDarkMode ? 'fa-solid fa-sun' : 'fa-solid fa-moon') + ' w-4 mr-1';
                const lb = toggleBtn.querySelector('span');
                if (lb) lb.textContent = state.isDarkMode ? '淺色主題' : '深色主題';
            }
        }


        function renderAll() {
            renderTodayHeader();
            renderTodos();
            renderNotes();
            renderHabits();
            renderDiaries();
            renderEvents();
            renderMiniCalendars();
            renderDailyQuote();
            renderHomeTagFilters();
        }

        // ================================================================
        // WEATHER + AIR QUALITY MODULE (中央氣象署 + 環境部空品測站)
        // ================================================================
        const DEFAULT_WEATHER_LOCATION = { city: '臺中市', district: '東區' };

        // 22縣市 → 鄉鎮市區清單
        // 資料來源：維基百科「臺灣行政區劃」＋內政部縣市/行政區代碼檔案交叉比對確認（含臺中市大甲區更正）
        const TOWNSHIP_DATA = {
            '臺北市': ['中正區','大同區','中山區','松山區','大安區','萬華區','信義區','士林區','北投區','內湖區','南港區','文山區'],
            '新北市': ['板橋區','三重區','中和區','永和區','新莊區','新店區','樹林區','鶯歌區','三峽區','淡水區','汐止區','瑞芳區','土城區','蘆洲區','五股區','泰山區','林口區','深坑區','石碇區','坪林區','三芝區','石門區','八里區','平溪區','雙溪區','貢寮區','金山區','萬里區','烏來區'],
            '桃園市': ['桃園區','中壢區','大溪區','楊梅區','蘆竹區','大園區','龜山區','八德區','龍潭區','平鎮區','新屋區','觀音區','復興區'],
            '臺中市': ['中區','東區','南區','西區','北區','北屯區','西屯區','南屯區','太平區','大里區','霧峰區','烏日區','豐原區','后里區','石岡區','東勢區','和平區','新社區','潭子區','大雅區','神岡區','大肚區','沙鹿區','龍井區','梧棲區','清水區','大甲區','外埔區','大安區'],
            '臺南市': ['中西區','東區','南區','北區','安平區','安南區','永康區','歸仁區','新化區','左鎮區','玉井區','楠西區','南化區','仁德區','關廟區','龍崎區','官田區','麻豆區','佳里區','西港區','七股區','將軍區','學甲區','北門區','新營區','後壁區','白河區','東山區','六甲區','下營區','柳營區','鹽水區','善化區','大內區','山上區','新市區','安定區'],
            '高雄市': ['新興區','前金區','苓雅區','鹽埕區','鼓山區','旗津區','前鎮區','三民區','楠梓區','小港區','左營區','仁武區','大社區','岡山區','路竹區','阿蓮區','田寮區','燕巢區','橋頭區','梓官區','彌陀區','永安區','湖內區','鳳山區','大寮區','林園區','鳥松區','大樹區','旗山區','美濃區','六龜區','內門區','杉林區','甲仙區','桃源區','那瑪夏區','茂林區','茄萣區'],
            '基隆市': ['仁愛區','信義區','中正區','中山區','安樂區','暖暖區','七堵區'],
            '新竹市': ['東區','北區','香山區'],
            '嘉義市': ['東區','西區'],
            '宜蘭縣': ['宜蘭市','頭城鎮','礁溪鄉','壯圍鄉','員山鄉','羅東鎮','三星鄉','大同鄉','五結鄉','冬山鄉','蘇澳鎮','南澳鄉'],
            '新竹縣': ['竹北市','湖口鄉','新豐鄉','新埔鎮','關西鎮','芎林鄉','寶山鄉','竹東鎮','五峰鄉','橫山鄉','尖石鄉','北埔鄉','峨眉鄉'],
            '苗栗縣': ['竹南鎮','頭份市','三灣鄉','南庄鄉','獅潭鄉','後龍鎮','通霄鎮','苑裡鎮','苗栗市','造橋鄉','頭屋鄉','公館鄉','大湖鄉','泰安鄉','銅鑼鄉','三義鄉','西湖鄉','卓蘭鎮'],
            '彰化縣': ['彰化市','芬園鄉','花壇鄉','秀水鄉','鹿港鎮','福興鄉','線西鄉','和美鎮','伸港鄉','員林市','社頭鄉','永靖鄉','埔心鄉','溪湖鎮','大村鄉','埔鹽鄉','田中鎮','北斗鎮','田尾鄉','埤頭鄉','溪州鄉','竹塘鄉','二林鎮','大城鄉','芳苑鄉','二水鄉'],
            '南投縣': ['南投市','中寮鄉','草屯鎮','國姓鄉','埔里鎮','仁愛鄉','名間鄉','集集鎮','水里鄉','魚池鄉','信義鄉','竹山鎮','鹿谷鄉'],
            '雲林縣': ['斗六市','斗南鎮','虎尾鎮','土庫鎮','褒忠鄉','東勢鄉','臺西鄉','崙背鄉','麥寮鄉','大埤鄉','林內鄉','古坑鄉','莿桐鄉','西螺鎮','二崙鄉','北港鎮','水林鄉','口湖鄉','四湖鄉','元長鄉'],
            '嘉義縣': ['太保市','朴子市','番路鄉','梅山鄉','竹崎鄉','阿里山鄉','中埔鄉','大埔鄉','水上鄉','鹿草鄉','東石鄉','六腳鄉','新港鄉','民雄鄉','大林鎮','溪口鄉','義竹鄉','布袋鎮'],
            '屏東縣': ['屏東市','三地門鄉','霧臺鄉','瑪家鄉','九如鄉','里港鄉','高樹鄉','鹽埔鄉','長治鄉','麟洛鄉','竹田鄉','內埔鄉','萬丹鄉','潮州鎮','泰武鄉','來義鄉','萬巒鄉','崁頂鄉','新埤鄉','南州鄉','林邊鄉','東港鎮','琉球鄉','佳冬鄉','新園鄉','枋寮鄉','枋山鄉','春日鄉','獅子鄉','車城鄉','牡丹鄉','恆春鎮','滿州鄉'],
            '臺東縣': ['臺東市','綠島鄉','蘭嶼鄉','延平鄉','卑南鄉','鹿野鄉','關山鎮','海端鄉','池上鄉','東河鄉','成功鎮','長濱鄉','太麻里鄉','金峰鄉','大武鄉','達仁鄉'],
            '花蓮縣': ['花蓮市','新城鄉','秀林鄉','吉安鄉','壽豐鄉','鳳林鎮','光復鄉','豐濱鄉','瑞穗鄉','萬榮鄉','玉里鎮','卓溪鄉','富里鄉'],
            '澎湖縣': ['馬公市','西嶼鄉','望安鄉','七美鄉','白沙鄉','湖西鄉'],
            '金門縣': ['金城鎮','金沙鎮','金湖鎮','金寧鄉','烈嶼鄉','烏坵鄉'],
            '連江縣': ['南竿鄉','北竿鄉','莒光鄉','東引鄉']
        };

        // 依縣市名稱重建「縣市/鄉鎮」下拉選單並選中目前 state 設定值
        function renderWeatherLocationSelects() {
            const citySel = document.getElementById('weather-city-select');
            const districtSel = document.getElementById('weather-district-select');
            if (!citySel || !districtSel) return;

            const counties = Object.keys(TOWNSHIP_DATA);
            const currentCity = state.weatherCity || DEFAULT_WEATHER_LOCATION.city;
            citySel.innerHTML = counties.map(c => "<option value=\"" + c + "\" " + (c === currentCity ? 'selected' : '') + ">" + c + "</option>").join('');

            renderWeatherDistrictSelect(currentCity, state.weatherDistrict || DEFAULT_WEATHER_LOCATION.district);
        }

        function renderWeatherDistrictSelect(city, selectedDistrict) {
            const districtSel = document.getElementById('weather-district-select');
            if (!districtSel) return;
            const townships = TOWNSHIP_DATA[city] || [];
            districtSel.innerHTML = townships.map(t => "<option value=\"" + t + "\" " + (t === selectedDistrict ? 'selected' : '') + ">" + t + "</option>").join('');
        }

        // 縣市下拉選單變動時，鄉鎮下拉選單要跟著換成該縣市的鄉鎮清單（預設選第一個）
        function onWeatherCitySelectChange() {
            const citySel = document.getElementById('weather-city-select');
            if (!citySel) return;
            renderWeatherDistrictSelect(citySel.value, null);
        }
        const WEATHER_REFRESH_MS = 10 * 60 * 1000; // 天氣：10分鐘
        const AQI_REFRESH_MS = 5 * 60 * 1000;      // 空品：5分鐘

        let weatherTimerHandle = null;
        let aqiTimerHandle = null;

        function initWeatherAndAqiModule() {
            refreshWeatherAndAqi(false);
            if (weatherTimerHandle) clearInterval(weatherTimerHandle);
            if (aqiTimerHandle) clearInterval(aqiTimerHandle);
            weatherTimerHandle = setInterval(() => fetchWeather().catch(e => console.error(e)), WEATHER_REFRESH_MS);
            aqiTimerHandle = setInterval(() => fetchAirQuality().catch(e => console.error(e)), AQI_REFRESH_MS);
        }

        async function refreshWeatherAndAqi(forced) {
            try { await fetchWeather(forced); } catch (e) { console.error('天氣更新失敗', e); }
            try { await fetchAirQuality(forced); } catch (e) { console.error('空品更新失敗', e); }
        }

        // 判斷目前應該用什麼地點查天氣：手動設定優先，其次用定位座標反查，都沒有則用預設台中東區
        function getWeatherTargetLocationLabel() {
            if (state.weatherCity && state.weatherDistrict) {
                return { city: state.weatherCity, district: state.weatherDistrict };
            }
            return DEFAULT_WEATHER_LOCATION;
        }

        // 整理CWA自動氣象站原始資料成統一格式 {name, city, township, lat, lon, wx, temp}，供 findNearestStationMatch() 比對
        function normalizeCwaStations(rawStations) {
            return (rawStations || []).map(s => {
                const wgs84 = (s.GeoInfo?.Coordinates || []).find(c => c.CoordinateName === 'WGS84');
                const lat = parseFloat(wgs84?.StationLatitude);
                const lon = parseFloat(wgs84?.StationLongitude);
                if (isNaN(lat) || isNaN(lon)) return null;
                const we = s.WeatherElement || {};
                const tempRaw = parseFloat(we.AirTemperature);
                return {
                    name: s.StationName,
                    city: s.GeoInfo?.CountyName || '',
                    township: s.GeoInfo?.TownName || '',
                    lat, lon,
                    wx: (we.Weather && we.Weather !== '-99') ? we.Weather : null, // -99是CWA的缺值標記
                    temp: (!isNaN(tempRaw) && we.AirTemperature !== '-99') ? tempRaw : null
                };
            }).filter(Boolean);
        }

        async function fetchWeather(forced) {
            const el = document.getElementById('home-weather-text');
            if (!el) return;

            // 快取：非強制模式下，10分鐘內不重打
            if (!forced && state.weatherCache && state.weatherCache.fetchedAt && (Date.now() - state.weatherCache.fetchedAt < WEATHER_REFRESH_MS)) {
                renderWeatherUI(state.weatherCache.data);
                return;
            }

            try {
                const loc = getWeatherTargetLocationLabel();
                const normalizedCity = loc.city.replace('台', '臺');
                const coords = getEffectiveCoords();
                // O-A0003-001：全台自動氣象站每10分鐘觀測資料，同時含測站座標/行政區與即時氣溫/天氣現象
                const result = await callGasBackend({ action: 'cwaWeather' });
                const stations = normalizeCwaStations(result.data?.records?.Station);
                const best = findNearestStationMatch(stations, normalizedCity, loc.district, coords);
                if (!best) throw new Error('查無可用的氣象觀測站資料');
                const useGps = !!state.weatherCoords && best.city; // 用 GPS 定位時，顯示實際最近測站所在的縣市／區，而不是設定頁的預設地點
                const data = { city: useGps ? best.city : loc.city, district: useGps ? (best.township || '') : loc.district, wx: best.wx, temp: best.temp, stationName: best.name, fetchedAt: Date.now() };
                state.weatherCache = { data, fetchedAt: Date.now() };
                saveLocalOnly();
                renderWeatherUI(data);
            } catch (err) {
                console.error(err);
                el.innerText = '天氣資料取得失敗';
            }
        }

        // 06:00-17:59算白天、18:00-05:59算晚上；只有「晴」「多雲」牽涉太陽意象需要分日夜，
        // 其他天氣現象本來就沒有太陽圖示，不受影響
        function isDaytimeNow() {
            const h = new Date().getHours();
            return h >= 6 && h < 18;
        }

        function weatherIconClass(wx) {
            const isDay = isDaytimeNow();
            if (!wx) return isDay ? 'fa-cloud-sun' : 'fa-cloud-moon';
            if (wx.includes('雷')) return 'fa-cloud-bolt';
            if (wx.includes('雨')) return 'fa-cloud-rain';
            if (wx.includes('霧') || wx.includes('靄')) return 'fa-smog';
            if (wx.includes('多雲')) return isDay ? 'fa-cloud-sun' : 'fa-cloud-moon';
            if (wx.includes('陰')) return 'fa-cloud';
            if (wx.includes('晴')) return isDay ? 'fa-sun' : 'fa-moon';
            return isDay ? 'fa-cloud-sun' : 'fa-cloud-moon';
        }

        function renderWeatherUI(data) {
            const el = document.getElementById('home-weather-text');
            const iconEl = document.querySelector('#home-weather-block i');
            if (!el) return;
            const tempStr = (data.temp !== null && data.temp !== undefined) ? Math.round(data.temp) + "°C" : '--';
            const wxStr = data.wx || '--';
            const locationStr = data.city + (data.district || '');
            el.innerText = locationStr + " " + tempStr + " " + wxStr;
            if (iconEl) {
                const colorClass = isDaytimeNow() ? 'text-muji-ochre' : 'text-muji-indigo';
                iconEl.className = "fa-solid " + weatherIconClass(data.wx || '') + " " + colorClass + " text-lg";
            }
        }

        // --- 空氣品質：環境部官方 AQI 測站（需 API Key，經 GAS 代理） ---
        // 環境部環境資料開放平臺（原環保署，2023年改制搬家）：空氣品質監測站基本資料 + 即時AQI/PM2.5資料
        // 全台80個政府正式監測站，每站都有正確的縣市+鄉鎮標記（跟智慧城鄉IoT微型感測器不同，
        // 那邊很多縣市的township欄位是空的，這份官方資料集實測22縣市全部都有覆蓋且鄉鎮欄位正確）
        const EPA_STATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 測站基本資料（含座標）很少變動，快取30天
        const EPA_CACHE_VERSION = 1;

        function haversineDistanceKm(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        // 共用測站比對邏輯（CWA氣象觀測站／EPA空品測站共用）：優先找「行政區名稱（city+township）完全對上」的測站，
        // 比純座標距離準確，避免抓到座標較近、但其實屬於隔壁區的測站；該行政區內沒有測站時，才退回全台找最近站當備援
        function findNearestStationMatch(stations, city, township, coords) {
            const exactMatches = stations
                .filter(s => s.city === city && s.township === township)
                .map(s => ({ ...s, dist: haversineDistanceKm(coords.lat, coords.lon, s.lat, s.lon) }))
                .sort((a, b) => a.dist - b.dist);
            const candidates = exactMatches.length > 0 ? exactMatches : stations
                .map(s => ({ ...s, dist: haversineDistanceKm(coords.lat, coords.lon, s.lat, s.lon) }))
                .sort((a, b) => a.dist - b.dist);
            return candidates[0] || null;
        }

        // 22縣市概略中心座標（縣市政府所在地），供沒有裝置定位時換算「地點文字」用的備援座標
        const CITY_FALLBACK_COORDS = {
            '臺北市': { lat: 25.0330, lon: 121.5654 },
            '新北市': { lat: 25.0169, lon: 121.4627 },
            '桃園市': { lat: 24.9936, lon: 121.3010 },
            '臺中市': { lat: 24.1477, lon: 120.6736 },
            '臺南市': { lat: 22.9997, lon: 120.2270 },
            '高雄市': { lat: 22.6273, lon: 120.3014 },
            '基隆市': { lat: 25.1276, lon: 121.7392 },
            '新竹市': { lat: 24.8138, lon: 120.9675 },
            '嘉義市': { lat: 23.4801, lon: 120.4491 },
            '宜蘭縣': { lat: 24.7021, lon: 121.7377 },
            '新竹縣': { lat: 24.8388, lon: 121.0178 },
            '苗栗縣': { lat: 24.5602, lon: 120.8214 },
            '彰化縣': { lat: 24.0518, lon: 120.5161 },
            '南投縣': { lat: 23.9609, lon: 120.9718 },
            '雲林縣': { lat: 23.7092, lon: 120.4313 },
            '嘉義縣': { lat: 23.4518, lon: 120.2555 },
            '屏東縣': { lat: 22.5519, lon: 120.5487 },
            '臺東縣': { lat: 22.7583, lon: 121.1444 },
            '花蓮縣': { lat: 23.9871, lon: 121.6015 },
            '澎湖縣': { lat: 23.5711, lon: 119.5793 },
            '金門縣': { lat: 24.4324, lon: 118.3170 },
            '連江縣': { lat: 26.1608, lon: 119.9370 }
        };

        function getEffectiveCoords() {
            if (state.weatherCoords) return state.weatherCoords;
            const loc = getWeatherTargetLocationLabel();
            const normalized = loc.city.replace('台', '臺');
            if (CITY_FALLBACK_COORDS[normalized]) return CITY_FALLBACK_COORDS[normalized];
            return CITY_FALLBACK_COORDS['臺中市']; // 最終備援：台中東區概略座標
        }

        // 測站基本資料（含縣市/鄉鎮/座標），變動很少，快取30天
        async function ensureEpaStations() {
            if (state.epaStationCache && state.epaStationCache.fetchedAt &&
                (Date.now() - state.epaStationCache.fetchedAt < EPA_STATION_CACHE_TTL_MS) &&
                Array.isArray(state.epaStationCache.list) && state.epaStationCache.list.length > 0 &&
                state.epaStationCache.version === EPA_CACHE_VERSION) {
                return state.epaStationCache.list;
            }
            const result = await callGasBackend({ action: 'epaStations' });
            const json = result.data;
            const records = Array.isArray(json) ? json : (json.records || []);
            const list = records.map(r => {
                const lat = parseFloat(r.twd97lat);
                const lon = parseFloat(r.twd97lon);
                if (isNaN(lat) || isNaN(lon)) return null;
                return { id: r.siteid, name: r.sitename, city: r.county || '', township: r.township || '', lat, lon };
            }).filter(Boolean);
            state.epaStationCache = { list, fetchedAt: Date.now(), version: EPA_CACHE_VERSION };
            saveLocalOnly();
            return list;
        }

        // 即時AQI/PM2.5資料，用siteid對應到測站基本資料，5分鐘更新一次
        async function fetchEpaLiveReadings() {
            const result = await callGasBackend({ action: 'epaLive' });
            const json = result.data;
            const records = Array.isArray(json) ? json : (json.records || []);
            const map = {};
            records.forEach(r => {
                const aqi = parseFloat(r.aqi);
                if (isNaN(aqi) || aqi < 0 || aqi > 500 || !r.status) return; // 明顯離譜或缺資料視為異常
                map[r.siteid] = { aqi, status: r.status };
            });
            return map;
        }

        // 依環境部官方公告的AQI等級狀態文字對應顯示顏色（狀態文字本身已經是政府算好的正式分級，不用自己再算一次）
        const AQI_STATUS_COLORS = {
            '良好': '#6B705C',
            '普通': '#A66E38',
            '對敏感族群不良': '#C97B3D',
            '對所有族群不良': '#8C2B2B',
            '非常不良': '#5C1F1F',
            '危害': '#5C1F1F'
        };
        function aqiStatusColor(status) {
            return AQI_STATUS_COLORS[status] || '#787571';
        }

        async function fetchAirQuality(forced) {
            const badgeEl = document.getElementById('home-aqi-badge');
            if (!badgeEl) return;

            // unavailable（查詢失敗/查無資料）不當作有效快取，否則失敗一次要卡5分鐘才會重試，
            // 失敗結果不該有跟成功結果一樣長的快取效期
            if (!forced && state.aqiCache && state.aqiCache.fetchedAt && !state.aqiCache.data?.unavailable &&
                (Date.now() - state.aqiCache.fetchedAt < AQI_REFRESH_MS)) {
                renderAqiUI(state.aqiCache.data);
                return;
            }

            try {
                const coords = getEffectiveCoords();
                const loc = getWeatherTargetLocationLabel();
                const normalizedCity = loc.city.replace('台', '臺');

                const [stations, liveMap] = await Promise.all([ensureEpaStations(), fetchEpaLiveReadings()]);
                const stationsWithReadings = stations
                    .filter(s => liveMap[s.id] !== undefined)
                    .map(s => ({ ...s, ...liveMap[s.id] }));

                const best = findNearestStationMatch(stationsWithReadings, normalizedCity, loc.district, coords);
                if (!best) {
                    const data = { unavailable: true };
                    state.aqiCache = { data, fetchedAt: Date.now() };
                    saveLocalOnly();
                    renderAqiUI(data);
                    return;
                }

                const data = { aqi: best.aqi, status: best.status, color: aqiStatusColor(best.status), stationName: best.name, fetchedAt: Date.now() };
                state.aqiCache = { data, fetchedAt: Date.now() };
                saveLocalOnly();
                renderAqiUI(data);
            } catch (err) {
                console.error(err);
                renderAqiUI({ unavailable: true });
            }
        }

        function renderAqiUI(data) {
            const badgeEl = document.getElementById('home-aqi-badge');
            if (!badgeEl) return;
            if (!data || data.unavailable) {
                badgeEl.innerText = '暫無資料';
                badgeEl.style.backgroundColor = '#E3DDD3';
                badgeEl.style.color = '#787571';
                badgeEl.title = '';
                return;
            }
            badgeEl.innerText = "AQI " + Math.round(data.aqi) + " " + data.status;
            badgeEl.style.backgroundColor = data.color + '22';
            badgeEl.style.color = data.color;
            badgeEl.title = "測站：" + data.stationName + "（環境部官方監測站 AQI 即時資料）";
        }

        // ================================================================
        // 每日一句 MODULE（Sheets 當語錄資料庫，GAS 讀取端點，前端每日隨機快取）
        // ================================================================
        const FALLBACK_QUOTES = [
            '簡約不是妥協，而是對生活品質的精確提煉。',
            '留白，是為了讓真正重要的事物被看見。',
            '生活的秩序，從整理一張書桌開始。',
            '不必擁有很多，只需擁有剛剛好。',
            '每一天的紀錄，都是給未來自己的一封信。'
        ];

        async function renderDailyQuote() {
            const el = document.getElementById('home-daily-quote');
            if (!el) return;
            const todayStr = getLocalDateStr(new Date());

            if (state.quoteCache && state.quoteCache.dateStr === todayStr && state.quoteCache.text) {
                el.innerText = "「" + state.quoteCache.text + "」";
                return;
            }

            let pool = FALLBACK_QUOTES;
            if (IS_GAS) {
                try {
                    const json = await callGasBackend({ action: 'getQuotes' });
                    if (Array.isArray(json.quotes) && json.quotes.length > 0) pool = json.quotes;
                } catch (err) {
                    console.warn('語錄讀取失敗，使用內建備援語錄', err);
                }
            }

            const picked = pool[Math.floor(Math.random() * pool.length)];
            state.quoteCache = { text: picked, dateStr: todayStr };
            saveLocalOnly();
            el.innerText = "「" + picked + "」";
        }

        // UTILITY FUNCTIONS
        // 以「本地時區」取得 YYYY-MM-DD 字串，取代 toISOString()（UTC 換算在台灣時間凌晨易少一天）
        function getLocalDateStr(dateObj) {
            const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
            if (isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return y + "-" + m + "-" + day;
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // ================================================================
        // 標籤系統（純視覺分類，不用於篩選畫面，但全域搜尋會比對）：待辦/隨記/日記共用，
        // 文字自由輸入 + 5色票單選（比照行程的顏色選擇器），每次新增後色票重置回預設色（臙脂紅），
        // 避免手滑連續新增時忘記換色、沿用上一個標籤的顏色
        // ================================================================
        const TAG_COLOR_PALETTE = [
            { hex: '#8C2B2B', name: '臙脂紅' },
            { hex: '#2D2B2A', name: '炭灰' },
            { hex: '#A66E38', name: '赭黃' },
            { hex: '#6B705C', name: '苔綠' },
            { hex: '#2E4057', name: '藍灰' }
        ];
        const TAG_DEFAULT_COLOR = TAG_COLOR_PALETTE[0].hex;

        // 舊資料相容：舊版標籤存的是純文字（沒有自選顏色），用文字hash自動配色，
        // 同一個文字永遠對應同一色，不會每次刷新畫面顏色亂跳
        function tagColorFor(text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
            return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length].hex;
        }

        // 標籤資料可能是舊格式(純文字字串)或新格式({text,color})，這兩個函式統一取值介面
        function getTagText(tag) {
            return typeof tag === 'string' ? tag : (tag && tag.text) || '';
        }
        function getTagColorValue(tag) {
            if (typeof tag === 'string') return tagColorFor(tag);
            return (tag && tag.color) || tagColorFor(getTagText(tag));
        }

        // 表單編輯中的標籤暫存區：containerId -> 目前的標籤陣列；tagColorDraftMap記錄「準備要新增的下一個標籤」目前選的顏色
        let tagDraftMap = {};
        let tagColorDraftMap = {};

        function initTagPicker(containerId, initialTags) {
            tagDraftMap[containerId] = (initialTags || []).slice();
            tagColorDraftMap[containerId] = TAG_DEFAULT_COLOR;
            renderTagChips(containerId, tagDraftMap[containerId]);
            renderTagColorSwatches(containerId);
        }

        function renderTagColorSwatches(containerId) {
            const picker = document.getElementById(containerId + '-color-picker');
            if (!picker) return;
            const current = tagColorDraftMap[containerId] || TAG_DEFAULT_COLOR;
            picker.innerHTML = TAG_COLOR_PALETTE.map(c => {
                const active = c.hex === current;
                return "<button type=\"button\" onclick=\"selectTagDraftColor('" + containerId + "','" + c.hex + "')\" title=\"" + c.name + "\" class=\"w-5 h-5 rounded-full transition-all " + (active ? 'ring-2 ring-offset-1 ring-muji-text scale-110' : '') + "\" style=\"background-color:" + c.hex + "\"></button>";
            }).join('');
        }

        function selectTagDraftColor(containerId, hex) {
            tagColorDraftMap[containerId] = hex;
            renderTagColorSwatches(containerId);
        }

        function renderTagChips(containerId, tags) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = (tags || []).map((t, i) => {
                const text = getTagText(t), color = getTagColorValue(t);
                return "<span class=\"inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full text-white\" style=\"background-color:" + color + "\">" + escapeHtml(text) +
                    "<i onclick=\"removeTagChip('" + containerId + "', " + i + ")\" title=\"移除標籤\" class=\"fa-solid fa-xmark cursor-pointer opacity-80 hover:opacity-100 text-[11px]\"></i></span>";
            }).join('');
        }

        function addTagFromInput(inputId, containerId) {
            const input = document.getElementById(inputId);
            if (!input) return;
            const val = input.value.trim();
            if (!val) return;
            if (!tagDraftMap[containerId]) tagDraftMap[containerId] = [];
            const color = tagColorDraftMap[containerId] || TAG_DEFAULT_COLOR;
            // 同文字已存在就更新顏色，不重複新增一筆
            const existingIdx = tagDraftMap[containerId].findIndex(t => getTagText(t) === val);
            if (existingIdx >= 0) {
                tagDraftMap[containerId][existingIdx] = { text: val, color };
            } else {
                tagDraftMap[containerId].push({ text: val, color });
            }
            input.value = '';
            tagColorDraftMap[containerId] = TAG_DEFAULT_COLOR; // 新增後重置回預設色
            renderTagChips(containerId, tagDraftMap[containerId]);
            renderTagColorSwatches(containerId);
        }

        function removeTagChip(containerId, idx) {
            if (!tagDraftMap[containerId]) return;
            tagDraftMap[containerId].splice(idx, 1);
            renderTagChips(containerId, tagDraftMap[containerId]);
        }

        function getTagDraft(containerId) {
            // 輸入框裡打了字但還沒按 Enter／加入，儲存時一併收進來，避免標籤默默消失
            const inputId = { 'todo-tag-chips': 'todo-tag-input', 'note-tag-chips': 'note-tag-input', 'diary-tag-chips': 'diary-tag-input' }[containerId];
            if (inputId) addTagFromInput(inputId, containerId);
            return (tagDraftMap[containerId] || []).slice();
        }

        // 卡片上顯示用的唯讀標籤（不可點擊移除），待辦/隨記/日記卡片渲染時共用
        function renderTagChipsReadonly(tags) {
            if (!tags || tags.length === 0) return '';
            return tags.map(t => {
                const text = getTagText(t), color = getTagColorValue(t);
                return "<span class=\"inline-block text-[11px] px-1.5 py-0.5 rounded-full text-white mr-1\" style=\"background-color:" + (safeColor(color) || TAG_DEFAULT_COLOR) + "\">" + escapeHtml(text) + "</span>";
            }).join('');
        }

        // 標籤可發現性：首頁列出目前所有條目用過的標籤（去重），點擊直接帶入既有的全域搜尋機制查詢該標籤文字，
        // 不另外做一套獨立篩選畫面（太重），借用「標籤=可搜尋文字」達到快篩效果
        function collectAllUsedTags() {
            const seen = new Map(); // text -> color，同文字只留第一次出現的顏色
            [...state.todos, ...state.notes, ...state.diaries].forEach(item => {
                (item.tags || []).forEach(t => {
                    const text = getTagText(t);
                    if (text && !seen.has(text)) seen.set(text, getTagColorValue(t));
                });
            });
            return Array.from(seen, ([text, color]) => ({ text, color }));
        }

        function renderHomeTagFilters() {
            const container = document.getElementById('home-tag-filter-row');
            if (!container) return;
            const tags = collectAllUsedTags();
            if (tags.length === 0) { container.innerHTML = ''; return; }
            container.innerHTML = '<span class="text-[11px] text-muji-muted">常用標籤：</span>' +
                tags.map(t => "<span data-tag=\"" + escapeHtml(t.text) + "\" onclick=\"quickFilterByTag(this.dataset.tag)\" class=\"inline-flex items-center text-[11px] px-2 py-0.5 rounded-full text-white cursor-pointer opacity-90 hover:opacity-100\" style=\"background-color:" + (safeColor(t.color) || TAG_DEFAULT_COLOR) + "\">" + escapeHtml(t.text) + "</span>").join('');
        }

        function quickFilterByTag(text) {
            document.getElementById('search-bar-container').classList.remove('hidden');
            const input = document.getElementById('global-search-input');
            input.value = text;
            executeSearch();
            input.focus();
        }

        function openModal(id) {
            const el = document.getElementById(id);
            if (el) { el.classList.remove('hidden'); retakeFormSnapshot(id); }
        }

        // 未存檔離頁警告：只對「有表單可以填」的5個modal生效，其餘（設定/放大圖/檢視類）不受影響
        const UNSAVED_GUARD_FORM_IDS = { 'todo-modal': 'todo-form', 'note-modal': 'note-form', 'habit-modal': 'habit-form', 'diary-modal': 'diary-form', 'event-modal': 'event-form' };
        // 以「開啟當下的表單快照」比對目前內容：改了又改回去不算未存檔；標籤、圖片、符號選單等不會觸發 input 事件的欄位也算
        const formSnapshots = {};
        function formSig(modalId) {
            const form = document.getElementById(UNSAVED_GUARD_FORM_IDS[modalId]);
            if (!form) return '';
            const parts = [];
            form.querySelectorAll('input,select,textarea').forEach(el => {
                if (el.type === 'file') return;
                parts.push((el.id || el.name || '') + '=' + (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value));
            });
            form.querySelectorAll('[contenteditable="true"]').forEach(el => parts.push('#' + el.id + '=' + el.innerHTML));
            form.querySelectorAll('[id$="-tag-chips"]').forEach(el => parts.push('@' + el.id + '=' + el.textContent));
            return parts.join('\u0001');
        }
        function retakeFormSnapshot(modalId) { if (UNSAVED_GUARD_FORM_IDS[modalId]) formSnapshots[modalId] = formSig(modalId); }
        function isFormDirty(modalId) {
            return UNSAVED_GUARD_FORM_IDS[modalId] && modalId in formSnapshots && formSnapshots[modalId] !== null && formSig(modalId) !== formSnapshots[modalId];
        }
        function markFormClean(modalId) { formSnapshots[modalId] = null; } // 開啟前或存檔後呼叫：openModal() 會在欄位填好後重拍快照
        function anyFormDirty() {
            return Object.keys(UNSAVED_GUARD_FORM_IDS).some(id => { const m = document.getElementById(id); return m && !m.classList.contains('hidden') && isFormDirty(id); });
        }
        // 關閉分頁/重新整理前提醒（瀏覽器會顯示自己的標準提示文字）
        window.addEventListener('beforeunload', (e) => {
            if (anyFormDirty() || (typeof settingsIsDirty === 'function' && !document.getElementById('settings-modal').classList.contains('hidden') && settingsIsDirty())) {
                e.preventDefault(); e.returnValue = '';
            }
        });

        // 輕量提示（右下／手機底部上方浮出 3 秒）：kind = 'error' 時用紅色底線
        let toastTimer = null;
        function showToast(msg, kind) {
            let el = document.getElementById('muji-toast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'muji-toast';
                el.setAttribute('role', 'status');
                el.setAttribute('aria-live', 'polite');
                document.body.appendChild(el);
            }
            el.className = 'muji-toast' + (kind === 'error' ? ' muji-toast-error' : '');
            el.textContent = msg;
            el.style.display = 'block';
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => { el.style.display = 'none'; }, kind === 'error' ? 5000 : 3000);
        }

        function closeModal(id) {
            // 設定頁：日曆勾選或天氣地點有改但還沒按「儲存設定」，先確認是否放棄
            if (id === 'settings-modal' && typeof settingsIsDirty === 'function' && settingsIsDirty()) {
                uiConfirm('設定尚未儲存，確定要放棄嗎？', { okText: '放棄', danger: true }).then(ok => {
                    if (!ok) return;
                    settingsSnapshot = null;
                    closeModal(id);
                });
                return;
            }
            if (isFormDirty(id)) {
                uiConfirm('內容尚未儲存，確定要放棄嗎？', { okText: '放棄', danger: true }).then(ok => {
                    if (!ok) return;
                    markFormClean(id);
                    const m = document.getElementById(id);
                    if (m) m.classList.add('hidden');
                });
                return;
            }
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        }

        // 防止表單重複送出：送出當下把送出按鈕短暫disable，避免手殘連點兩下觸發兩次儲存
        function guardDoubleSubmit(formEl) {
            const btn = formEl.querySelector('button[type="submit"]');
            if (!btn || btn.disabled) return false;
            btn.disabled = true;
            setTimeout(() => { btn.disabled = false; }, 800);
            return true;
        }

        // 待辦/隨記/日行程的縮圖點擊後看大圖（共用同一個放大檢視層）
        function openImageLightbox(url) {
            url = safeImg(url);
            if (!url) return;
            document.getElementById('image-lightbox-img').src = url;
            document.getElementById('image-lightbox').classList.remove('hidden');
        }

        // ------------------------------------------------------------------
        // 樣式化對話框：uiConfirm 回傳 Promise<boolean>；uiAlert 只有「確定」鈕
        // ------------------------------------------------------------------
        let uiDialogResolve = null;
        let uiDialogLastFocus = null;
        function uiDialog(message, opts) {
            opts = opts || {};
            const dlg = document.getElementById('ui-dialog');
            return new Promise(resolve => {
                if (uiDialogResolve) uiDialogResolve(false);
                const okBtn = document.getElementById('ui-dialog-ok');
                const cancelBtn = document.getElementById('ui-dialog-cancel');
                document.getElementById('ui-dialog-msg').textContent = message;
                okBtn.textContent = opts.okText || '確定';
                okBtn.classList.toggle('ui-danger', !!opts.danger);
                cancelBtn.textContent = opts.cancelText || '取消';
                cancelBtn.style.display = opts.cancelText === null ? 'none' : '';
                uiDialogLastFocus = document.activeElement;
                uiDialogResolve = resolve;
                dlg.classList.add('open');
                (opts.danger && opts.cancelText !== null ? cancelBtn : okBtn).focus(); // 危險操作預設停在「取消」
            });
        }
        function uiDialogClose(result) {
            if (!uiDialogResolve) return;
            document.getElementById('ui-dialog').classList.remove('open');
            const done = uiDialogResolve;
            uiDialogResolve = null;
            try { if (uiDialogLastFocus && uiDialogLastFocus.focus) uiDialogLastFocus.focus(); } catch (e) { /* 原本的元素可能已不在畫面上 */ }
            done(result);
        }
        const uiConfirm = (message, opts) => uiDialog(message, opts);
        const uiAlert = (message) => uiDialog(message, { cancelText: null });
        // 捕獲階段先攔 Esc：對話框開著時只關對話框，不要連底下的彈窗一起關
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && uiDialogResolve) {
                e.preventDefault();
                e.stopImmediatePropagation();
                uiDialogClose(false);
            }
        }, true);

        // ------------------------------------------------------------------
        // 無障礙：彈窗標成 dialog；只有圖示的按鈕補上名稱（含動態產生的）
        // ------------------------------------------------------------------
        const A11Y_ICON_LABELS = {
            'fa-xmark': '關閉', 'fa-pen': '編輯', 'fa-trash': '刪除', 'fa-trash-can': '刪除', 'fa-chevron-left': '上一個',
            'fa-chevron-right': '下一個', 'fa-rotate': '重新整理', 'fa-magnifying-glass': '搜尋', 'fa-ellipsis': '更多',
            'fa-print': '列印', 'fa-plus': '新增', 'fa-caret-down': '展開', 'fa-text-slash': '清除格式', 'fa-gear': '設定'
        };
        function applyA11y(root) {
            (root || document).querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(textarea):not(label):not([role]):not([id$="-modal"]):not(#modal-day-events):not(#image-lightbox)').forEach(el => {
                if (el.closest('[role="dialog"]') && el.classList.contains('fixed')) return; // 背景遮罩不當按鈕
                el.setAttribute('role', 'button');
                if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
            });
            (root || document).querySelectorAll('button:not([aria-label])').forEach(b => {
                const t = b.getAttribute('title');
                if (t) { b.setAttribute('aria-label', t); return; }
                if (b.textContent.trim()) return; // 有文字的按鈕本身就有名稱
                const icon = b.querySelector('i[class*="fa-"]');
                if (!icon) return;
                for (const cls of icon.classList) {
                    if (A11Y_ICON_LABELS[cls]) { b.setAttribute('aria-label', A11Y_ICON_LABELS[cls]); b.setAttribute('title', A11Y_ICON_LABELS[cls]); return; }
                }
            });
        }
        document.querySelectorAll('[id$="-modal"], #modal-day-events, #image-lightbox').forEach(m => {
            m.setAttribute('role', 'dialog');
            m.setAttribute('aria-modal', 'true');
            const h = m.querySelector('h1, h2, h3');
            m.setAttribute('aria-label', (h && h.textContent.trim()) || '視窗');
        });
        const gasStatusEl = document.getElementById('gas-sync-status');
        if (gasStatusEl) { gasStatusEl.setAttribute('role', 'status'); gasStatusEl.setAttribute('aria-live', 'polite'); }
        applyA11y();
        // 鍵盤操作：role=button 的非按鈕元素，Enter／空白鍵等同點擊
        document.addEventListener('keydown', (e) => {
            if ((e.key !== 'Enter' && e.key !== ' ') || e.target !== document.activeElement) return;
            const el = e.target;
            if (el && el.getAttribute && el.getAttribute('role') === 'button' && el.tagName !== 'BUTTON') { e.preventDefault(); el.click(); }
        });
        // 彈窗開啟時鎖住背景捲動、關閉時把焦點還給原本的元素
        let lastFocusBeforeModal = null, modalWasOpen = false;
        function syncBodyLock() {
            const open = [...document.querySelectorAll('[role="dialog"]')].some(m => !m.classList.contains('hidden'));
            document.body.style.overflow = open ? 'hidden' : '';
            if (open && !modalWasOpen) lastFocusBeforeModal = document.activeElement;
            if (!open && modalWasOpen && lastFocusBeforeModal && lastFocusBeforeModal.focus && document.contains(lastFocusBeforeModal)) { try { lastFocusBeforeModal.focus(); } catch (e) { /* ignore */ } }
            modalWasOpen = open;
        }
        document.querySelectorAll('[role="dialog"]').forEach(m => new MutationObserver(syncBodyLock).observe(m, { attributes: true, attributeFilter: ['class'] }));
        let a11yTimer = null;
        new MutationObserver(() => {
            clearTimeout(a11yTimer);
            a11yTimer = setTimeout(applyA11y, 300);
        }).observe(document.body, { childList: true, subtree: true });

        // 搜尋結果跳轉後，捲動到該筆並短暫高亮（在「已完成」摺疊區裡的待辦，外層與月份兩層都會展開）
        function focusItemById(id) {
            setTimeout(() => {
                const el = document.querySelector('[data-item-id="' + String(id).replace(/"/g, '') + '"]');
                if (!el) return;
                for (let det = el.closest('details'); det; det = det.parentElement && det.parentElement.closest('details')) det.open = true;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-muji-red');
                setTimeout(() => el.classList.remove('ring-2', 'ring-muji-red'), 2000);
            }, 80);
        }

        // Esc鍵關閉目前開啟的彈窗（通用套用到所有全螢幕彈窗，不限表單那五個）；
        // 一律經 closeModal() 關閉，未存檔警告才會在 Esc 時生效
        const ESC_CLOSABLE_MODAL_IDS = ['todo-modal', 'note-modal', 'habit-modal', 'diary-modal', 'diary-view-modal', 'diary-export-modal', 'event-modal', 'modal-day-events', 'settings-modal', 'trash-modal', 'image-lightbox'];
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const sb = document.getElementById('search-bar-container');
            if (sb && !sb.classList.contains('hidden') && !ESC_CLOSABLE_MODAL_IDS.some(id => { const m = document.getElementById(id); return m && !m.classList.contains('hidden'); })) { sb.classList.add('hidden'); const sr = document.getElementById('search-results'); if (sr) sr.classList.add('hidden'); return; }
            for (const id of ESC_CLOSABLE_MODAL_IDS) {
                const el = document.getElementById(id);
                if (el && !el.classList.contains('hidden')) {
                    closeModal(id);
                    break; // 一次只關最上層那個，避免Esc一次把疊在一起的彈窗全部關掉
                }
            }
        });

        // IMAGE FILE CONVERSION CONTROLLER
        // 裁切焦點選項：縮圖仍用 object-fit:cover 維持排版整齊，但可指定重點對齊上/中/下
        const IMAGE_FOCUS_OPTIONS = [
            { key: 'top', label: '上', value: 'center top' },
            { key: 'center', label: '中', value: 'center center' },
            { key: 'bottom', label: '下', value: 'center bottom' }
        ];

        function imageFocusCss(key) {
            const found = IMAGE_FOCUS_OPTIONS.find(o => o.key === key);
            return found ? found.value : 'center center';
        }

        // 圖片上傳前先用 canvas 壓縮/縮小尺寸，避免 localStorage 容量被大圖佔滿
        function compressImageToDataURL(file, maxDim = 1280, quality = 0.82) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        let { width, height } = img;
                        if (width > maxDim || height > maxDim) {
                            if (width > height) {
                                height = Math.round(height * (maxDim / width));
                                width = maxDim;
                            } else {
                                width = Math.round(width * (maxDim / height));
                                height = maxDim;
                            }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx2d = canvas.getContext('2d');
                        ctx2d.fillStyle = '#fff'; ctx2d.fillRect(0, 0, width, height); // 透明 PNG 轉 JPEG 前先鋪白底，避免變黑
                        ctx2d.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.onerror = () => reject(new Error('圖片讀取失敗'));
                    img.src = e.target.result;
                };
                reader.onerror = () => reject(new Error('檔案讀取失敗'));
                reader.readAsDataURL(file);
            });
        }

        function getImagePositionInputId(dataInputId) {
            return dataInputId + '-position';
        }

        function getImagePosition(dataInputId) {
            const posInput = document.getElementById(getImagePositionInputId(dataInputId));
            return posInput ? (posInput.value || 'center') : 'center';
        }

        // 圖片預覽下方顯示「上/中/下」裁切焦點選擇列（沒有現成 hidden input 就動態建立一個）
        function renderImageFocusPicker(previewContainerId, dataInputId) {
            const container = document.getElementById(previewContainerId);
            if (!container) return;

            let posInput = document.getElementById(getImagePositionInputId(dataInputId));
            if (!posInput) {
                posInput = document.createElement('input');
                posInput.type = 'hidden';
                posInput.id = getImagePositionInputId(dataInputId);
                posInput.value = 'center';
                document.getElementById(dataInputId).insertAdjacentElement('afterend', posInput);
            }

            let picker = container.querySelector('.img-focus-picker');
            if (!picker) {
                picker = document.createElement('div');
                picker.className = 'img-focus-picker flex gap-1 mt-1.5';
                container.appendChild(picker);
            }
            picker.innerHTML = IMAGE_FOCUS_OPTIONS.map(opt => {
                const active = posInput.value === opt.key;
                return "<button type=\"button\" onclick=\"setImageFocus('" + previewContainerId + "', '" + dataInputId + "', '" + opt.key + "')\" class=\"px-2 py-0.5 text-[11px] rounded border transition-colors " + (active ? 'border-muji-text bg-muji-text text-white' : 'border-muji-border text-muji-muted hover:bg-muji-paper') + "\">" + opt.label + "</button>";
            }).join('');

            applyImageFocusToPreview(previewContainerId, dataInputId);
        }

        function setImageFocus(previewContainerId, dataInputId, key) {
            const posInput = document.getElementById(getImagePositionInputId(dataInputId));
            if (posInput) posInput.value = key;
            renderImageFocusPicker(previewContainerId, dataInputId);
        }

        function applyImageFocusToPreview(previewContainerId, dataInputId) {
            const container = document.getElementById(previewContainerId);
            const img = container ? container.querySelector('img') : null;
            if (img) img.style.objectPosition = imageFocusCss(getImagePosition(dataInputId));
        }

        function handleImageFileSelect(inputEl, previewContainerId, dataInputId) {
            const file = inputEl.files[0];
            if (!file) return;

            compressImageToDataURL(file).then(dataUrl => {
                document.getElementById(dataInputId).value = dataUrl;
                const container = document.getElementById(previewContainerId);
                container.querySelector('img').src = dataUrl;
                container.classList.remove('hidden');
                setImageFocus(previewContainerId, dataInputId, 'center'); // 新照片預設置中，同時建立/刷新焦點選擇列
            }).catch(err => {
                console.error('圖片壓縮失敗', err);
            });
        }

        function clearImagePreview(previewContainerId, dataInputId, fileInputId) {
            document.getElementById(dataInputId).value = '';
            document.getElementById(fileInputId).value = '';
            const posInput = document.getElementById(getImagePositionInputId(dataInputId));
            if (posInput) posInput.value = 'center';
            const container = document.getElementById(previewContainerId);
            container.querySelector('img').removeAttribute('src');
            const picker = container.querySelector('.img-focus-picker');
            if (picker) picker.remove();
            container.classList.add('hidden');
        }

        function setImagePreviewFromData(dataUrl, previewContainerId, dataInputId, position) {
            const container = document.getElementById(previewContainerId);
            document.getElementById(dataInputId).value = dataUrl || '';
            if (dataUrl) {
                container.querySelector('img').src = dataUrl;
                container.classList.remove('hidden');
                setImageFocus(previewContainerId, dataInputId, position || 'center');
            } else {
                container.querySelector('img').removeAttribute('src');
                const picker = container.querySelector('.img-focus-picker');
                if (picker) picker.remove();
                container.classList.add('hidden');
            }
        }

        // 富文字消毒（白名單）：只留編輯器會產生的格式標籤，其餘標籤拆掉只留文字（script／style 等整段移除）；屬性只留 color
        const RICH_TAGS = new Set(['B','I','U','S','STRIKE','STRONG','EM','BR','P','DIV','SPAN','UL','OL','LI','FONT']);
        const SAFE_COLOR_VALUE_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]{3,20})$/i;
        function sanitizeRichHtml(html) {
            const doc = new DOMParser().parseFromString(html || '', 'text/html'); // 解析但不執行腳本
            doc.body.querySelectorAll('*').forEach(el => {
                if (!RICH_TAGS.has(el.tagName)) {
                    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'SVG', 'MATH', 'TEMPLATE'].includes(el.tagName)) el.remove();
                    else el.replaceWith(...el.childNodes);
                    return;
                }
                [...el.attributes].forEach(a => {
                    const n = a.name.toLowerCase(), v = a.value.trim();
                    if (n === 'color' && SAFE_COLOR_VALUE_RE.test(v)) return;
                    if (n === 'style') { // 只保留 color 這一項
                        const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(v);
                        if (m && SAFE_COLOR_VALUE_RE.test(m[1].trim())) { el.setAttribute('style', 'color: ' + m[1].trim()); return; }
                    }
                    el.removeAttribute(a.name);
                });
            });
            return doc.body.innerHTML;
        }

        // ------------------------------------------------------------------
        // 資料進站消毒：雲端、匯入檔、本機還原、回收桶復原的資料，一律先過這一關，
        // 避免惡意或損壞的欄位（圖片網址、顏色、id）被塞進 HTML 屬性造成注入
        // ------------------------------------------------------------------
        const SAFE_ID_CHARS_RE = /[^\w.@:#\-]/g; // 含 #：Google 節慶日曆的 id 帶有 #，不能被改寫，否則比對不到會一直重複新增
        function safeId(v) { return String(v == null ? '' : v).replace(SAFE_ID_CHARS_RE, '_'); }
        function safeColor(v) { v = String(v || '').trim(); return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : ''; }
        function safeImg(v) {
            v = String(v || '').trim();
            if (!v) return '';
            // 只收 App 自己上傳的 Drive 縮圖／googleusercontent 直連網址（不收任意外部網址，避免網址裡的 & # ; 跳出屬性）
            if (/^https:\/\/(drive\.google\.com\/thumbnail\?id=[\w-]+(&sz=w\d+)?|lh3\.googleusercontent\.com\/d\/[\w-]+(=s\d+)?)$/.test(v)) return v;
            if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/i.test(v)) return v;
            return '';
        }
        function stripUnsafeChars(v) { return String(v == null ? '' : v).replace(/["'<>&\\`]/g, ''); }
        function scrubItem(it) {
            if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
            const r = Object.assign({}, it);
            r.id = safeId(r.id);
            if (!r.id) return null;
            if ('image' in r) r.image = safeImg(r.image);
            if ('updatedAt' in r) r.updatedAt = Math.min(Number(r.updatedAt) || 0, Date.now() + 10 * 60 * 1000); // 時間戳不可超過「現在＋10分鐘」，避免手貼超大值讓該筆永遠勝出
            if ('color' in r) r.color = safeColor(r.color);
            if ('endDate' in r) r.endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(r.endDate)) ? String(r.endDate) : ''; // 多日行程的最後一天
            ['imageFileId', 'gcalTaskId', 'gcalEventId', 'gcalCalendarId', 'gcalInstanceKey'].forEach(k => { if (r[k]) r[k] = safeId(r[k]); });
            ['imagePosition', 'icon', 'weather', 'mood', 'freq', 'repeat', 'reminder'].forEach(k => { if (k in r && r[k] != null) r[k] = stripUnsafeChars(r[k]); });
            ['date', 'time', 'datetime', 'repeatUntil'].forEach(k => { if (typeof r[k] === 'string') r[k] = r[k].replace(/[^\d\-T: ]/g, ''); });
            if (Array.isArray(r.tags)) {
                r.tags = r.tags.map(t => (t && typeof t === 'object')
                    ? { text: stripUnsafeChars(t.text).slice(0, 40), color: safeColor(t.color) }
                    : stripUnsafeChars(t).slice(0, 40)).filter(t => getTagText(t));
            }
            return r;
        }
        function scrubList(list) { return (Array.isArray(list) ? list : []).map(scrubItem).filter(Boolean); }

        // 圖片載入失敗（雲端網址失效等）：淡化顯示，不留破圖
        document.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.classList.add('img-broken'); }, true);
