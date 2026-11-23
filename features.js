// 版本：2026-11-17 #1 20:41 待辦清單重整、行事曆日週月顯示待辦
        // ================================================================
        // ICON PICKER MODULE（日記天氣/心情：Font Awesome 線條圖示選單）
        // ================================================================
        const WEATHER_OPTIONS = [
            { code: 'clear', icon: 'fa-sun', label: '晴朗', legacyEmoji: '☀️' },
            { code: 'cloudy_sun', icon: 'fa-cloud-sun', label: '多雲', legacyEmoji: '⛅' },
            { code: 'cloudy', icon: 'fa-cloud', label: '陰天', legacyEmoji: '☁️' },
            { code: 'rain', icon: 'fa-cloud-rain', label: '雨天', legacyEmoji: '🌧️' },
            { code: 'storm', icon: 'fa-cloud-bolt', label: '雷雨', legacyEmoji: '⛈️' },
            { code: 'cold', icon: 'fa-snowflake', label: '寒冷', legacyEmoji: '❄️' },
            { code: 'wind', icon: 'fa-wind', label: '強風', legacyEmoji: '💨' }
        ];
        const MOOD_OPTIONS = [
            { code: 'happy', icon: 'fa-face-smile', label: '開心', legacyEmoji: '😊' },
            { code: 'loved', icon: 'fa-face-grin-hearts', label: '幸福', legacyEmoji: '🥰' },
            { code: 'neutral', icon: 'fa-face-meh', label: '平淡', legacyEmoji: '😐' },
            { code: 'tired', icon: 'fa-face-tired', label: '疲累', legacyEmoji: '😴' },
            { code: 'sad', icon: 'fa-face-sad-tear', label: '難過', legacyEmoji: '😢' },
            { code: 'shocked', icon: 'fa-face-surprise', label: '震驚', legacyEmoji: '😱' },
            { code: 'angry', icon: 'fa-face-angry', label: '生氣', legacyEmoji: '😡' }
        ];
        const ICON_PICKER_OPTIONS = { 'diary-weather': WEATHER_OPTIONS, 'diary-mood': MOOD_OPTIONS };

        // 找出選項：先比對新的 code，找不到再比對「舊版 emoji 資料」以維持向下相容，都找不到就用第一個當預設
        function resolveIconOption(list, value) {
            return list.find(o => o.code === value) || list.find(o => o.legacyEmoji === value) || list[0];
        }

        function toggleIconPicker(hiddenInputId) {
            document.querySelectorAll('.icon-picker-panel').forEach(p => {
                if (p.id !== hiddenInputId + '-picker') p.classList.add('hidden');
            });
            const panel = document.getElementById(hiddenInputId + '-picker');
            if (panel) panel.classList.toggle('hidden');
        }

        function renderIconPickerPanel(hiddenInputId) {
            const options = ICON_PICKER_OPTIONS[hiddenInputId];
            const panel = document.getElementById(hiddenInputId + '-picker');
            if (!panel || !options) return;
            panel.innerHTML = options.map(o => "\n                <div onclick=\"selectIconOption('" + hiddenInputId + "', '" + o.code + "')\" class=\"flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muji-paper cursor-pointer\">\n                    <i class=\"fa-solid " + o.icon + " text-muji-ochre w-4 text-center\"></i><span>" + o.label + "</span>\n                </div>").join('');
        }

        function selectIconOption(hiddenInputId, code) {
            const options = ICON_PICKER_OPTIONS[hiddenInputId];
            const opt = options.find(o => o.code === code);
            if (!opt) return;
            document.getElementById(hiddenInputId).value = opt.code;
            const label = document.getElementById(hiddenInputId + '-picker-label');
            if (label) label.innerHTML = "<i class=\"fa-solid " + opt.icon + " text-muji-ochre\"></i>" + opt.label;
            const panel = document.getElementById(hiddenInputId + '-picker');
            if (panel) panel.classList.add('hidden');
        }

        // 設定選擇器目前值（開啟表單時呼叫，value 可能是新版 code 或舊版 emoji 資料）
        function setIconPickerValue(hiddenInputId, value) {
            const options = ICON_PICKER_OPTIONS[hiddenInputId];
            const opt = resolveIconOption(options, value);
            document.getElementById(hiddenInputId).value = opt.code;
            const label = document.getElementById(hiddenInputId + '-picker-label');
            if (label) label.innerHTML = "<i class=\"fa-solid " + opt.icon + " text-muji-ochre\"></i>" + opt.label;
            renderIconPickerPanel(hiddenInputId);
        }

        // 點擊選擇器以外的區域，自動收合所有下拉面板
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.icon-picker-panel') && !e.target.closest('[onclick^="toggleIconPicker"]')) {
                document.querySelectorAll('.icon-picker-panel').forEach(p => p.classList.add('hidden'));
            }
        });

        // 手機版底部導覽列：向下捲動超過一點距離就滑出隱藏，只要稍微向上捲動就立刻滑入出現（類似FB App效果）
        let lastScrollYForNav = window.scrollY;
        const BOTTOM_NAV_HIDE_THRESHOLD = 10; // 累積捲動這個距離才觸發隱藏，避免手抖/慣性微小晃動誤判
        let bottomNavScrollRafPending = false;
        window.addEventListener('scroll', () => {
            if (bottomNavScrollRafPending) return;
            bottomNavScrollRafPending = true;
            requestAnimationFrame(() => {
                bottomNavScrollRafPending = false;
                const bottomNav = document.getElementById('mobile-bottom-nav');
                if (!bottomNav) return;
                const currentY = window.scrollY;
                const delta = currentY - lastScrollYForNav;
                if (delta > BOTTOM_NAV_HIDE_THRESHOLD && currentY > 80) {
                    bottomNav.classList.add('translate-y-full');
                } else if (delta < 0) {
                    bottomNav.classList.remove('translate-y-full');
                }
                lastScrollYForNav = currentY;
            });
        }, { passive: true });

        // 供日記時光軸/相片牆/檢視彈窗渲染天氣、心情圖示用
        function weatherIconHtml(value, sizeClass) {
            const opt = resolveIconOption(WEATHER_OPTIONS, value);
            return "<i class=\"fa-solid " + opt.icon + " text-muji-ochre " + (sizeClass || '') + "\" title=\"" + opt.label + "\"></i>";
        }
        function moodIconHtml(value, sizeClass) {
            const opt = resolveIconOption(MOOD_OPTIONS, value);
            return "<i class=\"fa-solid " + opt.icon + " text-muji-red " + (sizeClass || '') + "\" title=\"" + opt.label + "\"></i>";
        }

        // ================================================================
        // HABIT ICON PICKER MODULE（精選 FA 圖示 + 自訂輸入；舊版自由輸入 emoji 資料向下相容）
        // ================================================================
        const HABIT_ICON_OPTIONS = [
            { code: 'coffee', icon: 'fa-mug-hot', label: '咖啡/飲品' },
            { code: 'book', icon: 'fa-book-open', label: '閱讀' },
            { code: 'meditation', icon: 'fa-spa', label: '冥想/靜心' },
            { code: 'run', icon: 'fa-person-running', label: '跑步' },
            { code: 'walk', icon: 'fa-person-walking', label: '走路/散步' },
            { code: 'water', icon: 'fa-glass-water', label: '喝水' },
            { code: 'sleep', icon: 'fa-bed', label: '睡眠' },
            { code: 'workout', icon: 'fa-dumbbell', label: '健身' },
            { code: 'yoga', icon: 'fa-person-praying', label: '瑜珈/伸展' },
            { code: 'write', icon: 'fa-pen-nib', label: '書寫/日記' },
            { code: 'study', icon: 'fa-graduation-cap', label: '學習' },
            { code: 'plant', icon: 'fa-seedling', label: '植物照顧' },
            { code: 'clean', icon: 'fa-broom', label: '打掃整理' },
            { code: 'music', icon: 'fa-music', label: '音樂' },
            { code: 'guitar', icon: 'fa-guitar', label: '樂器練習' },
            { code: 'diet', icon: 'fa-apple-whole', label: '飲食控制' },
            { code: 'medicine', icon: 'fa-pills', label: '服藥/保健' },
            { code: 'no_phone', icon: 'fa-mobile-screen-button', label: '減少滑手機' },
            { code: 'save_money', icon: 'fa-piggy-bank', label: '記帳/存錢' },
            { code: 'sun', icon: 'fa-sun', label: '曬太陽/戶外' }
        ];

        function renderHabitIconGrid(selectedFaValue) {
            const grid = document.getElementById('habit-icon-grid');
            if (!grid) return;
            let html = HABIT_ICON_OPTIONS.map(o => {
                const active = selectedFaValue === ('fa:' + o.code);
                return "<button type=\"button\" onclick=\"selectHabitIconOption('" + o.code + "')\" title=\"" + o.label + "\" class=\"w-8 h-8 flex items-center justify-center rounded border " + (active ? 'border-muji-text bg-muji-paper text-muji-red' : 'border-muji-border text-muji-text') + " hover:bg-muji-paper transition-colors\"><i class=\"fa-solid " + o.icon + " text-xs\"></i></button>";
            }).join('');
            const customActive = !selectedFaValue || !selectedFaValue.startsWith('fa:');
            html += "<button type=\"button\" onclick=\"selectHabitIconOption('custom')\" title=\"自訂輸入\" class=\"w-8 h-8 flex items-center justify-center rounded border " + (customActive ? 'border-muji-text bg-muji-paper text-muji-red' : 'border-muji-border text-muji-muted') + " hover:bg-muji-paper transition-colors\"><i class=\"fa-solid fa-pen text-xs\"></i></button>";
            grid.innerHTML = html;
        }

        function selectHabitIconOption(code) {
            const customWrap = document.getElementById('habit-icon-custom-wrap');
            const customInput = document.getElementById('habit-icon-custom-input');
            if (code === 'custom') {
                customWrap.classList.remove('hidden');
                const current = document.getElementById('habit-icon').value;
                if (!current.startsWith('fa:')) customInput.value = current;
                customInput.focus();
                document.getElementById('habit-icon').value = customInput.value || '';
                renderHabitIconGrid(null);
                return;
            }
            customWrap.classList.add('hidden');
            document.getElementById('habit-icon').value = 'fa:' + code;
            renderHabitIconGrid('fa:' + code);
        }

        function onHabitCustomIconInput() {
            document.getElementById('habit-icon').value = document.getElementById('habit-icon-custom-input').value;
        }

        // 渲染習慣圖示：fa: 開頭代表精選圖示代碼，否則視為舊版/自訂的自由文字（emoji等），照原樣輸出
        function renderHabitIconContent(icon) {
            if (icon && icon.startsWith('fa:')) {
                const opt = HABIT_ICON_OPTIONS.find(o => o.code === icon.slice(3));
                if (opt) return "<i class=\"fa-solid " + opt.icon + "\"></i>";
            }
            return escapeHtml(icon || '⭐');
        }

        // NAVIGATION CONTROLLER
        // 右下浮動「＋」：依目前分頁新增待辦／日記／行程
        function fabAdd() {
            if (state.activeTab === 'diary') openDiaryModal();
            else if (state.activeTab === 'calendar') openEventModalWithDate(state.selectedDate);
            else openTodoModal();
        }

        function switchTab(tabName) {
            state.activeTab = tabName;
            ['home', 'diary', 'calendar'].forEach(t => {
                document.getElementById("page-" + t).classList.toggle('hidden', t !== tabName);
                
                const btn = document.getElementById("tab-btn-" + t);
                if (btn) {
                    btn.className = (t === tabName) ? 
                        "px-4 py-2 text-sm font-medium rounded-md transition-colors text-muji-red bg-muji-paper" : 
                        "px-4 py-2 text-sm font-medium rounded-md transition-colors text-muji-text hover:bg-muji-paper";
                }
                const mobBtn = document.getElementById("mob-tab-" + t);
                if (mobBtn) {
                    mobBtn.className = (t === tabName) ? 
                        "flex-1 py-2.5 font-medium border-t-2 border-muji-red text-muji-red" : 
                        "flex-1 py-2.5 font-medium border-t-2 border-transparent text-muji-muted";
                }
            });
            renderAll();
        }

        // MINI CALENDARS MODULE
// 通用小月曆格線繪製（首頁／日記／行事曆三處共用），只有「標記邏輯」與「點擊行為」不同
function renderMiniCalGrid(container, year, month, selectedDate, markerFn, onClickName) {
    if (!container) return;
    const firstDayIndex = new Date(year, month, 1).getDay();
    const startOffset = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = getLocalDateStr(new Date());

    let html = "<div class=\"grid grid-cols-7 gap-1 text-xs font-medium text-muji-muted mb-1 pb-1 border-b border-stone-200/60\">\n        <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span class=\"text-muji-red\">六</span><span class=\"text-muji-red\">日</span>\n    </div><div class=\"grid grid-cols-7 gap-1 text-xs\">";

    for (let i = 0; i < startOffset; i++) html += "<div class=\"h-8\"></div>";

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = year + "-" + String(month + 1).padStart(2, '0') + "-" + String(d).padStart(2, '0');
        const isSelected = dateStr === selectedDate;
        const isToday = dateStr === todayStr;
        const hasMarker = markerFn ? markerFn(dateStr) : false;

        let cellClass = "flex flex-col items-center justify-center h-8 w-8 mx-auto rounded-full cursor-pointer transition-all ";
        if (isSelected) {
            cellClass += "bg-muji-text text-white font-semibold ";
        } else if (isToday) {
            cellClass += "bg-muji-paper text-muji-red font-semibold border border-muji-red/50 ";
        } else {
            cellClass += "hover:bg-muji-paper text-muji-text ";
        }

        html += "<div onclick=\"" + onClickName + "('" + dateStr + "')\" aria-label=\"" + dateStr + (isToday ? '（今天）' : '') + "\"" + (isToday ? ' aria-current=\"date\"' : '') + " class=\"" + cellClass + "\">\n            <span class=\"leading-none\">" + d + "</span>\n            <span class=\"leading-none text-[8px] mt-0.5 " + (hasMarker ? isSelected ? 'text-white' : 'text-muji-red' : 'invisible') + "\">●</span>\n        </div>";
    }
    html += "</div>";
    container.innerHTML = html;
}

// 標記邏輯：首頁／行事曆看「行程、待辦」；日記與打卡頁看「日記、打卡」
function hasTodoOrEventOn(dateStr) {
    return state.events.some(e => eventOccursOn(e, dateStr)) ||
        state.todos.some(t => t.datetime && t.datetime.startsWith(dateStr));
}
function hasDiaryOrHabitOn(dateStr) {
    return state.diaries.some(d => d.datetime && d.datetime.startsWith(dateStr)) ||
        !!(state.habitLogs[dateStr] && state.habitLogs[dateStr].length > 0);
}

// 確保 state 中存在小月曆視圖的年月狀態
function renderMiniCalendars() {
    const { year, month } = state.miniCal;

    // 首頁：行程／待辦標記；日記頁：日記／打卡標記（行事曆頁使用獨立的 renderMiniCalendar()）
    renderMiniCalGrid(document.getElementById('mini-calendar-home'), year, month, state.selectedDate, hasTodoOrEventOn, 'selectDate');
    renderMiniCalGrid(document.getElementById('mini-calendar-diary'), year, month, state.selectedDate, hasDiaryOrHabitOn, 'selectDate');

    // 更新月曆標題文字與快速跳轉 Input 的預設值
    const monthTitleStr = year + " 年 " + (month + 1) + " 月";
    ['home', 'diary'].forEach(target => {
        const titleEl = document.getElementById("mini-cal-month-title-" + target);
        if (titleEl) titleEl.innerText = monthTitleStr;

        const inputEl = document.getElementById("mini-cal-jump-input-" + target);
        if (inputEl) {
            inputEl.value = state.selectedDate || year + "-" + String(month + 1).padStart(2, '0') + "-01";
        }
    });
}

function changeMiniCalMonth(delta) {
    let y = state.miniCal.year;
    let m = state.miniCal.month + delta;

    if (m < 0) {
        m = 11;
        y -= 1;
    } else if (m > 11) {
        m = 0;
        y += 1;
    }

    state.miniCal.year = y;
    state.miniCal.month = m;
    miniCalYear = y; miniCalMonth = m;
    renderMiniCalendars();
    renderMiniCalendar();
}

function jumpToMiniCalDate(dateStr) {
    if (!dateStr) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    selectDate(dateStr);
}

function resetMiniCalToToday() {
    selectDate(getLocalDateStr(new Date()));
}

// 全域日期：任何分頁點日期（小月曆、週／日卡片、月格、日記翻週）都走這裡，
// 首頁今日焦點、行事曆日週月、日記時光軸與打卡一起跳到同一天（同一週、同一月）
function setGlobalDate(dateStr, opts) {
    if (!dateStr) return;
    const d = getValidDateObj(dateStr);
    state.selectedDate = dateStr;
    state.miniCal = { year: d.getFullYear(), month: d.getMonth() };
    miniCalYear = d.getFullYear();   // 行事曆頁小月曆用的另一組月份狀態，一起同步
    miniCalMonth = d.getMonth();
    state.diaryWeekStart = getMondayOfDate(dateStr);
    renderAll();
    if (state.activeTab === 'diary' && !(opts && opts.noScroll)) setTimeout(() => scrollToDiaryDate(dateStr), 100);
}

function selectDate(dateStr) { setGlobalDate(dateStr); }


        // HOME AGENDA CONTROLLER
        function renderTodayHeader() {
            const el = document.getElementById('home-today-date-str');
            if (el) el.innerText = state.selectedDate;

            const listEl = document.getElementById('home-today-events-list');
            if (!listEl) return;

            const todayEvents = sortEventsByTime(getEventsOnDate(state.selectedDate));
            const todayTodos = state.todos.filter(t => t.datetime && t.datetime.startsWith(state.selectedDate));

            if (todayEvents.length === 0 && todayTodos.length === 0) {
                listEl.innerHTML = "<div class=\"text-muji-muted py-2\">本日尚無焦點行程。</div>";
                return;
            }

            let html = '';
            todayEvents.forEach(e => {
                html += "<div onclick=\"editEvent('" + e.id + "')\" class=\"p-2 rounded border border-muji-border bg-muji-paper flex items-center justify-between cursor-pointer\">\n                    <div>\n                        <span class=\"inline-block w-2 h-2 rounded-full mr-1.5\" style=\"background-color: " + e.color + "\"></span>\n                        <span class=\"font-medium\">" + escapeHtml(e.title) + "</span>\n                    </div>\n                    <span class=\"text-[11px] text-muji-muted\">" + (e.time || '全天') + "</span>\n                </div>";
            });
            todayTodos.forEach(t => {
                html += "<div onclick=\"editTodo('" + t.id + "')\" class=\"p-2 rounded border border-muji-border bg-white flex items-center justify-between cursor-pointer\">\n                    <div class=\"flex items-center space-x-1.5\">\n                        <i class=\"fa-regular fa-circle-check text-muji-muted\"></i>\n                        <span class=\"" + (t.completed ? 'line-through text-muji-muted' : '') + "\">" + escapeHtml(t.title) + "</span>\n                    </div>\n                    <span class=\"text-[11px] text-muji-muted\">待辦</span>\n                </div>";
            });
            listEl.innerHTML = html;
        }

        // TODO CONTROLLER MODULE
        const TODO_CLOUD_ARCHIVE_DAYS = 365; // 完成超過這麼多天的待辦：後端每天凌晨移到「待辦封存」分頁，前端不再重送
        // 待辦到期提醒分級：3天內到期／24小時內到期／已逾期，只對未完成且有設定時間的項目生效
        function getTodoDueStatus(t) {
            if (t.completed || !t.datetime) return null;
            const dateOnly = /T00:00$/.test(t.datetime); // 00:00 視為「只有日期」（Google 工作沒有時間），當天 23:59 前都不算逾期
            const due = new Date(dateOnly ? t.datetime.slice(0, 10) + 'T23:59:59' : t.datetime);
            if (isNaN(due.getTime())) return null;
            const diffMs = due.getTime() - Date.now();
            const ONE_DAY = 24 * 60 * 60 * 1000;
            if (diffMs < 0) {
                const overdueDays = Math.max(1, Math.ceil(-diffMs / ONE_DAY));
                return { cls: 'text-muji-red font-medium', icon: 'fa-solid fa-triangle-exclamation', text: '逾期' + overdueDays + '天' };
            } else if (dateOnly && t.datetime.slice(0, 10) === getLocalDateStr(new Date())) {
                return { cls: 'text-red-500 font-medium', icon: 'fa-regular fa-clock', text: '今天到期' };
            } else if (diffMs <= ONE_DAY) {
                return { cls: 'text-red-500 font-medium', icon: 'fa-regular fa-clock', text: '24小時內到期' };
            } else if (diffMs <= 3 * ONE_DAY) {
                return { cls: 'text-muji-ochre font-medium', icon: 'fa-regular fa-clock', text: '3天內到期' };
            }
            return null;
        }

        // 待辦列：單行緊湊。標題最多 2 行（完整標題在編輯視窗與滑過提示）；電腦版日期等資訊靠右，手機版放在標題下方
        function renderTodoCard(t) {
            const dateDisplay = t.datetime ? t.datetime.replace(/T00:00$/, '').replace('T', ' ') : '無日期'; // 00:00 視為「只有日期」（Google 工作沒有時間）
            const dueStatus = getTodoDueStatus(t);
            const dateCls = dueStatus ? dueStatus.cls : '';
            const dueIcon = dueStatus ? dueStatus.icon : 'fa-regular fa-clock';
            const dueSuffix = dueStatus ? ' <span class="' + dueStatus.cls + '">（' + dueStatus.text + '）</span>' : '';
            const thumb = t.image ? '<img src="' + escapeHtml(t.image) + '" alt="' + escapeHtml(t.title || '待辦圖片') + '" onclick="event.stopPropagation(); openImageLightbox(this.src)" style="object-position:' + imageFocusCss(t.imagePosition) + '" class="w-10 h-10 rounded border border-muji-border object-cover shrink-0 cursor-pointer">' : '';
            const meta = (t.tags && t.tags.length ? renderTagChipsReadonly(t.tags) : '')
                + '<span class="' + dateCls + '"><i class="' + dueIcon + ' mr-1"></i>' + dateDisplay + dueSuffix + '</span>'
                + (t.person ? '<span><i class="fa-regular fa-user mr-1"></i>' + escapeHtml(t.person) + '</span>' : '')
                + (t.location ? '<span><i class="fa-solid fa-location-dot mr-1"></i>' + escapeHtml(t.location) + '</span>' : '')
                + (t.syncGcal ? '<span class="text-muji-red" title="已同步 Google 工作"><i class="fa-brands fa-google"></i></span>' : '');
            return '<div data-item-id="' + escapeHtml(t.id) + '" class="flex items-start gap-3 py-2 group relative">'
                + '<input type="checkbox" ' + (t.completed ? 'checked' : '') + ' onchange="toggleTodo(\'' + t.id + '\')" aria-label="完成：' + escapeHtml(t.title) + '" class="mt-1 rounded text-muji-red focus:ring-muji-red cursor-pointer shrink-0">'
                + thumb
                + '<div class="flex-1 min-w-0 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">'
                +   '<p class="sm:flex-1 min-w-0 text-sm font-medium line-clamp-2 ' + (t.completed ? 'line-through text-muji-muted' : 'text-muji-text') + '" title="' + escapeHtml(t.title) + '">' + escapeHtml(t.title) + '</p>'
                +   '<div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muji-muted sm:shrink-0 sm:justify-end">' + meta + '</div>'
                + '</div>'
                + '<div class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex space-x-2 shrink-0 mt-1">'
                +   '<button onclick="editTodo(\'' + t.id + '\')" class="text-xs text-muji-muted hover:text-muji-text" title="編輯"><i class="fa-solid fa-pen"></i></button>'
                +   '<button onclick="deleteTodo(\'' + t.id + '\')" class="text-xs text-muji-muted hover:text-muji-red" title="刪除"><i class="fa-solid fa-trash"></i></button>'
                + '</div></div>';
        }

        // 「已完成」摺疊區與各月份的展開狀態：重畫清單時沿用；沒操作過的用預設（已完成收起、最新月份展開）
        const todoFoldState = {};
        function todoFoldOpen(key, dflt) { return (key in todoFoldState ? todoFoldState[key] : dflt) ? ' open' : ''; }

        // 未完成的依日期由近到遠排在上面（沒日期的最後）；已完成的收進摺疊區，依待辦日期的年月分組
        function renderTodos() {
            const container = document.getElementById('todo-list-container');
            if (!container) return;

            if (state.todos.length === 0) {
                container.innerHTML = "<div class=\"text-center py-6 text-xs text-muji-muted\">無待辦事項，點擊右上方按鈕新增</div>";
                return;
            }

            const byDateAsc = (a, b) => (a.datetime ? 0 : 1) - (b.datetime ? 0 : 1) || String(a.datetime).localeCompare(String(b.datetime));
            const active = state.todos.filter(t => !t.completed).sort(byDateAsc);
            const done = state.todos.filter(t => t.completed);
            let html = active.length > 0
                ? active.map(renderTodoCard).join('')
                : "<div class=\"text-center py-4 text-xs text-muji-muted\">目前沒有未完成的待辦</div>";

            if (done.length > 0) {
                const groups = {};
                done.forEach(t => { const k = t.datetime ? t.datetime.slice(0, 7) : 'none'; (groups[k] = groups[k] || []).push(t); });
                const keys = Object.keys(groups).sort((a, b) => a === 'none' ? 1 : b === 'none' ? -1 : b.localeCompare(a)); // 月份新→舊，沒日期的最後
                const months = keys.map((k, i) => {
                    const list = groups[k].sort((a, b) => (b.datetime || '').localeCompare(a.datetime || '') || (b.completedAt || 0) - (a.completedAt || 0));
                    const label = k === 'none' ? '無日期' : k.slice(0, 4) + ' 年 ' + Number(k.slice(5)) + ' 月';
                    return '<details data-fold="m:' + k + '" ontoggle="todoFoldState[this.dataset.fold]=this.open" class="mt-1"' + todoFoldOpen('m:' + k, i === 0) + '>'
                        + '<summary class="text-xs text-muji-muted cursor-pointer select-none hover:text-muji-text py-1">' + label + '（' + list.length + '）</summary>'
                        + '<div class="divide-y divide-muji-border/60">' + list.map(renderTodoCard).join('') + '</div></details>';
                }).join('');
                html += '<details data-fold="done" ontoggle="todoFoldState[this.dataset.fold]=this.open" class="pt-2"' + todoFoldOpen('done', false) + '>'
                    + '<summary class="text-xs text-muji-muted cursor-pointer select-none hover:text-muji-text py-1">已完成（' + done.length + '）</summary>' + months + '</details>';
            }
            container.innerHTML = html;
        }

        // 日期字串（yyyy-MM-ddTHH:mm）依重複規則往後推一次
        function advanceTodoDatetime(datetime, repeat) {
            const [datePart, timePart] = datetime.split('T');
            const [y, m, d] = datePart.split('-').map(Number);
            let nd;
            if (repeat === 'daily') nd = new Date(y, m - 1, d + 1);
            else if (repeat === 'weekly') nd = new Date(y, m - 1, d + 7);
            else { // monthly：下個月同一天；遇到沒有該日的月份取月底
                const dim = new Date(y, m + 1, 0).getDate();
                nd = new Date(y, m, Math.min(d, dim));
            }
            return getLocalDateStr(nd) + (timePart ? 'T' + timePart : '');
        }

        // 完成「重複待辦」時，建立下一筆（日期一定排到今天之後）；原本這筆的重複設定移交給新的一筆，避免重複產生
        function spawnNextRepeatTodo(item) {
            const todayStr = getLocalDateStr(new Date());
            let next = advanceTodoDatetime(item.datetime, item.repeat);
            let guard = 0;
            while (next.slice(0, 10) <= todayStr && guard++ < 400) next = advanceTodoDatetime(next, item.repeat);
            const copy = Object.assign({}, item, {
                id: 't_' + Date.now() + 'r', datetime: next, completed: false, completedAt: null,
                gcalTaskId: null, image: '', imageFileId: null, updatedAt: Date.now()
            });
            item.repeat = '';
            state.todos.push(copy);
            saveState();
            refreshTodoViews();
            if (copy.syncGcal) syncTodoToGcalTask(copy);
        }

        function toggleTodo(id) {
            const item = state.todos.find(t => t.id === id);
            if (item) {
                item.completed = !item.completed;
                item.completedAt = item.completed ? Date.now() : null;
                item.updatedAt = Date.now();
                saveState();
                refreshTodoViews();
                if (item.syncGcal) syncTodoToGcalTask(item); // 勾選／取消完成也推到 Google 工作
                if (item.completed && item.repeat && item.datetime) spawnNextRepeatTodo(item);
            }
        }

        // 重複需要日期：沒填日期時停用重複下拉並清掉選擇
        function syncTodoRepeatState() {
            const rep = document.getElementById('todo-repeat');
            const hasDate = !!document.getElementById('todo-date').value;
            rep.disabled = !hasDate;
            if (!hasDate) rep.value = '';
        }

        function openTodoModal(id = null) {
            markFormClean('todo-modal');
            document.getElementById('todo-form').reset();
            document.getElementById('todo-id').value = '';
            document.getElementById('todo-date').value = '';
            document.getElementById('todo-time').value = '';
            clearImagePreview('todo-img-preview', 'todo-image-data', 'todo-image-file');
            document.getElementById('todo-modal-title').innerText = id ? '編輯待辦' : '新增待辦';
            initTagPicker('todo-tag-chips', []);

            if (id) {
                const item = state.todos.find(t => t.id === id);
                if (item) {
                    document.getElementById('todo-id').value = item.id;
                    document.getElementById('todo-title').value = item.title;
                    const dtp = String(item.datetime || '').split('T'); // 00:00 視為只有日期
                    document.getElementById('todo-date').value = dtp[0] || '';
                    document.getElementById('todo-time').value = dtp[1] && dtp[1].slice(0, 5) !== '00:00' ? dtp[1].slice(0, 5) : '';
                    document.getElementById('todo-person').value = item.person || '';
                    document.getElementById('todo-location').value = item.location || '';
                    document.getElementById('todo-sync-gcal').checked = !!item.syncGcal;
                    document.getElementById('todo-repeat').value = item.repeat || '';
                    setImagePreviewFromData(item.image, 'todo-img-preview', 'todo-image-data', item.imagePosition);
                    initTagPicker('todo-tag-chips', item.tags || []);
                }
            }
            syncTodoRepeatState();
            openModal('todo-modal');
        }

        function handleSaveTodo(e) {
            e.preventDefault();
            if (!guardDoubleSubmit(e.target)) return;
            const id = document.getElementById('todo-id').value || 't_' + Date.now();
            const title = document.getElementById('todo-title').value;
            const tdate = document.getElementById('todo-date').value;
            const ttime = document.getElementById('todo-time').value;
            if (!tdate && ttime) { showToast('請先選擇日期', 'error'); document.getElementById('todo-date').focus(); return; }
            const datetime = tdate ? tdate + 'T' + (ttime || '00:00') : '';
            const person = document.getElementById('todo-person').value;
            const location = document.getElementById('todo-location').value;
            const image = document.getElementById('todo-image-data').value;
            const imagePosition = getImagePosition('todo-image-data');
            const syncGcal = document.getElementById('todo-sync-gcal').checked;
            const tags = getTagDraft('todo-tag-chips');

            const existingIdx = state.todos.findIndex(t => t.id === id);
            const prevGcalTaskId = existingIdx >= 0 ? state.todos[existingIdx].gcalTaskId : null;
            const prevImageFileId = existingIdx >= 0 ? state.todos[existingIdx].imageFileId : null;
            const prevCompletedAt = existingIdx >= 0 ? state.todos[existingIdx].completedAt : null;
            const todoData = { id, title, datetime, person, location, image, imagePosition, syncGcal, tags, repeat: (datetime && document.getElementById('todo-repeat').value) || '', gcalTaskId: prevGcalTaskId || null, imageFileId: prevImageFileId || null, completed: existingIdx >= 0 ? state.todos[existingIdx].completed : false, completedAt: prevCompletedAt || null, updatedAt: Date.now() };

            if (existingIdx >= 0) {
                recordUndoAction('todos', state.todos[existingIdx]);
                state.todos[existingIdx] = todoData;
            } else {
                state.todos.push(todoData);
            }
            saveState();
            markFormClean('todo-modal');
            closeModal('todo-modal');
            refreshTodoViews();
            renderHomeTagFilters();
            syncTodoToGcalTask(todoData);
            syncItemImageToCloud('todo', id, prevImageFileId);
        }

        // 依 syncGcal 勾選狀態，決定要新增/更新/刪除對應的 Google Tasks 工作項目
        // 同一筆待辦的 Google 工作同步排隊執行（等上一次回傳 taskId 後再送下一次），並一律用「目前最新」的資料，
        // 避免新增後馬上勾選時，因 taskId 還沒回來而在 Google 工作裡又新增一筆
        const taskSyncChains = {};
        function syncTodoToGcalTask(todoData) {
            const prev = taskSyncChains[todoData.id] || Promise.resolve();
            const next = prev.then(() => doSyncTodoToGcalTask(todoData.id));
            taskSyncChains[todoData.id] = next.catch(() => {});
            return next;
        }

        async function doSyncTodoToGcalTask(todoId) {
            const todoData = state.todos.find(t => t.id === todoId);
            if (!todoData) return; // 已被刪除，不用同步
            try {
                if (todoData.syncGcal) {
                    const json = await callGasBackend({
                        action: 'syncTask',
                        task: { id: todoData.id, taskId: todoData.gcalTaskId, title: todoData.title, datetime: todoData.datetime, notes: [todoData.person, todoData.location].filter(Boolean).join(' / '), completed: todoData.completed, adoptStamp: todoData.gcalDirty === 'adopt' ? todoData.updatedAt : 0 }
                    });
                    if (json.skipped) { // Google 端在採用的版本之後又改過：不蓋掉，改拉 Google 的版本
                        delete todoData.gcalDirty; saveLocalOnly();
                        state.lastTasksSyncedAt = Math.max(0, Math.min(state.lastTasksSyncedAt || 0, (json.googleUpdated || Date.now()) - 1));
                        pullTasksFromGas().catch(err => console.error('Google工作拉取失敗', err));
                        showToast('Google 工作上的版本較新，已保留 Google 的版本');
                        return;
                    }
                    if (todoData.gcalDirty) { delete todoData.gcalDirty; saveLocalOnly(); }
                    const idx = state.todos.findIndex(t => t.id === todoData.id);
                    if (idx >= 0 && json.taskId && state.todos[idx].gcalTaskId !== json.taskId) { // 只有 id 真的變了才回寫並更新時間，避免多裝置互相推來推去
                        state.todos[idx].gcalTaskId = json.taskId;
                        state.todos[idx].updatedAt = Date.now(); // 讓這個回寫能被備份、也贏過雲端舊值
                        saveState();
                    }
                    showGasSyncStatus('success', '已同步至 Google 工作');
                } else if (todoData.gcalTaskId) {
                    await callGasBackend({ action: 'deleteTask', taskId: todoData.gcalTaskId });
                    const idx = state.todos.findIndex(t => t.id === todoData.id);
                    if (idx >= 0) { state.todos[idx].gcalTaskId = null; state.todos[idx].updatedAt = Date.now(); saveState(); }
                }
            } catch (err) {
                console.error('Google Tasks 同步失敗', err);
                const failedTodo = state.todos.find(t => t.id === todoId);
                if (failedTodo) { if (!failedTodo.gcalDirty) failedTodo.gcalDirty = true; saveLocalOnly(); } // 記下「還沒同步成功」，開機與恢復網路時重送
                showGasSyncStatus('error', 'Google 工作同步失敗：' + err.message);
            }
        }

        function editTodo(id) { openTodoModal(id); }
        async function deleteTodo(id) {
            if (!(await uiConfirm('確定要刪除此待辦事項嗎？', { okText: '刪除', danger: true }))) return;
            const item = state.todos.find(t => t.id === id);
            if (item) recordUndoAction('todos', item);
            state.todos = state.todos.filter(t => t.id !== id);
            saveState();
            refreshTodoViews();
            renderHomeTagFilters();
            if (item && item.gcalTaskId && IS_GAS) {
                enqueueOp({ action: 'deleteTask', taskId: item.gcalTaskId });
            }
            markItemImageDeletedIfAny(item);
            recordDeletionToGas('todos', id, item);
        }

        // MEMO / NOTES CONTROLLER MODULE
        function renderNotes() {
            const container = document.getElementById('memo-grid-container');
            if (!container) return;

            if (state.notes.length === 0) {
                container.innerHTML = "<div class=\"col-span-full text-center py-6 text-xs text-muji-muted\">無隨記內容，點擊新增</div>";
                return;
            }

            let html = '';
            state.notes.forEach(n => {
                const hasImage = n.image && n.image.trim() !== '';
                html += "\n                <div data-item-id=\"" + escapeHtml(n.id) + "\" class=\"p-4 muji-card flex flex-col justify-between space-y-3 group relative\">\n                    " + (hasImage ? "<img src=\"" + escapeHtml(n.image) + "\" alt=\"" + escapeHtml(n.title || '隨記圖片') + "\" onclick=\"openImageLightbox(this.src)\" style=\"object-position:" + imageFocusCss(n.imagePosition) + "\" class=\"rounded-lg border border-muji-border h-32 w-full object-cover cursor-pointer\">" : '') + "\n                    <div>\n                        <div class=\"flex justify-between items-start gap-2 mb-1\">\n                            <h3 class=\"font-serif font-semibold text-sm text-muji-text flex-1\">" + escapeHtml(n.title || '無標題隨記') + "</h3>\n                            <div class=\"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex space-x-2 flex-shrink-0\">\n                                <button onclick=\"editNote('" + n.id + "')\" class=\"text-xs text-muji-muted hover:text-muji-text\" title=\"編輯隨記\"><i class=\"fa-solid fa-pen\"></i></button>\n                                <button onclick=\"deleteNote('" + n.id + "')\" class=\"text-xs text-muji-muted hover:text-muji-red\" title=\"刪除隨記\"><i class=\"fa-solid fa-trash\"></i></button>\n                            </div>\n                        </div>\n                        <div class=\"rich-content text-sm leading-relaxed text-muji-text\">" + n.content + "</div>\n                        " + (n.tags && n.tags.length ? "<div class=\"pt-1.5\">" + renderTagChipsReadonly(n.tags) + "</div>" : '') + "\n                    </div>\n                </div>";
            });
            container.innerHTML = html;
        }

        function openNoteModal(id = null) {
            markFormClean('note-modal');
            document.getElementById('note-form').reset();
            document.getElementById('note-id').value = '';
            document.getElementById('note-editor').innerHTML = '';
            clearImagePreview('note-img-preview', 'note-image-data', 'note-image-file');
            document.getElementById('note-modal-title').innerText = id ? '編輯隨記' : '新增隨記';
            initTagPicker('note-tag-chips', []);

            if (id) {
                const item = state.notes.find(n => n.id === id);
                if (item) {
                    document.getElementById('note-id').value = item.id;
                    document.getElementById('note-title').value = item.title || '';
                    document.getElementById('note-editor').innerHTML = item.content || '';
                    setImagePreviewFromData(item.image, 'note-img-preview', 'note-image-data', item.imagePosition);
                    initTagPicker('note-tag-chips', item.tags || []);
                }
            }
            openModal('note-modal');
        }

        function handleSaveNote(e) {
            e.preventDefault();
            if (!guardDoubleSubmit(e.target)) return;
            const id = document.getElementById('note-id').value || 'n_' + Date.now();
            const title = document.getElementById('note-title').value;
            const content = sanitizeRichHtml(document.getElementById('note-editor').innerHTML);
            const image = document.getElementById('note-image-data').value;
            const imagePosition = getImagePosition('note-image-data');
            const tags = getTagDraft('note-tag-chips');

            const existingIdx = state.notes.findIndex(n => n.id === id);
            const prevImageFileId = existingIdx >= 0 ? state.notes[existingIdx].imageFileId : null;
            const noteData = { id, title, content, image, imagePosition, tags, imageFileId: prevImageFileId || null, updatedAt: Date.now() };

            if (existingIdx >= 0) {
                recordUndoAction('notes', state.notes[existingIdx]);
                state.notes[existingIdx] = noteData;
            } else {
                state.notes.push(noteData);
            }
            saveState();
            markFormClean('note-modal');
            closeModal('note-modal');
            renderNotes();
            if (state.activeTab === 'calendar') renderEvents();
            renderHomeTagFilters();
            syncItemImageToCloud('notes', id, prevImageFileId);
        }

        function editNote(id) { openNoteModal(id); }
        async function deleteNote(id) {
            if (!(await uiConfirm('確定要刪除此隨記嗎？', { okText: '刪除', danger: true }))) return;
            const item = state.notes.find(n => n.id === id);
            if (item) recordUndoAction('notes', item);
            state.notes = state.notes.filter(n => n.id !== id);
            saveState();
            renderNotes();
            if (state.activeTab === 'calendar') renderEvents();
            renderHomeTagFilters();
            markItemImageDeletedIfAny(item);
            recordDeletionToGas('notes', id, item);
        }

        // 顏色按鈕加上 onmousedown="event.preventDefault()"（見下方 HTML）避免點擊時搶走 contenteditable 的選取範圍
        // 富文本編輯：使用瀏覽器原生 document.execCommand（雖標記為已棄用，但主流瀏覽器仍穩定支援、沒有移除時間表）。
        // 原生指令已正確處理選取範圍對齊標籤邊界、只選一部分等情況，且天生是「切換」邏輯，比自刻 Range 邏輯可靠。
        // 隨記編輯器用 execEditor*，日記編輯器用 execDiary*，各自操作自己的 contenteditable。
        function execEditorCommand(cmd) { document.execCommand(cmd, false, null); }
        function execEditorColor(color) { document.execCommand('foreColor', false, color); }
        function clearNoteFormatting() { document.execCommand('removeFormat', false, null); }

        function execDiaryEditorCommand(cmd) { document.execCommand(cmd, false, null); }
        function execDiaryEditorColor(color) { document.execCommand('foreColor', false, color); }
        function clearDiaryFormatting() { document.execCommand('removeFormat', false, null); }

        // 貼上外部內容時只貼純文字，避免外部字型/顏色/大小把手帳風格弄亂（換行轉成 <br>）
        function insertPlainTextAtCursor(text) {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();

            const lines = text.split(/\r\n|\r|\n/);
            const frag = document.createDocumentFragment();
            lines.forEach((line, idx) => {
                frag.appendChild(document.createTextNode(line));
                if (idx < lines.length - 1) frag.appendChild(document.createElement('br'));
            });
            const lastNode = frag.lastChild;
            range.insertNode(frag);

            if (lastNode) {
                const newRange = document.createRange();
                newRange.setStartAfter(lastNode);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
        }

        function handleEditorPaste(e) {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            insertPlainTextAtCursor(text);
        }

        // HABITS TRACKER CONTROLLER MODULE
        function renderHabits() {
            const container = document.getElementById('habit-tracker-row');
            if (!container) return;

            if (state.habits.length === 0) {
                container.innerHTML = "<div class=\"text-xs text-muji-muted py-2\">尚無習慣項目，點擊上方按鈕創建習慣</div>";
                return;
            }

            const realToday = getLocalDateStr(new Date());
            const todayStr = state.selectedDate || realToday; // 打卡對象＝目前選取的日期（選過去的日子就是補打卡）
            const isFutureDay = todayStr > realToday;
            const todayLogs = state.habitLogs[todayStr] || [];
            const hintEl = document.getElementById('habit-date-hint');
            if (hintEl) {
                hintEl.innerHTML = todayStr === realToday ? '' : (isFutureDay
                    ? "<span>" + todayStr + "（未來的日子還不能打卡）</span>"
                    : "<span>補打卡：" + todayStr + "</span>") + " <button type=\"button\" onclick=\"resetMiniCalToToday()\" class=\"underline ml-2\">回到今天</button>";
            }

            let html = '';
            state.habits.forEach(h => {
                const isChecked = todayLogs.includes(h.id);
                const isWeekly = h.freq === 'weekly';
                const progressLabel = isWeekly
                    ? "本週 " + countHabitChecksThisWeek(h.id) + "/" + (h.weeklyTarget || 3) + (calculateWeeklyHabitStreak(h) > 0 ? " · 連續" + calculateWeeklyHabitStreak(h) + "週" : "")
                    : calculateHabitStreak(h.id) + " 天";

                html += "\n                <div class=\"flex-shrink-0 flex flex-col items-center space-y-1.5 p-3 rounded-xl border border-muji-border bg-white dark:bg-[#2F2C29] min-w-[100px] text-center group relative\">\n                    <button onclick=\"toggleHabitCheck('" + h.id + "')\" " + (isFutureDay ? 'disabled ' : '') + "aria-label=\"" + escapeHtml(h.title) + (isChecked ? "（已完成）" : "（點擊打卡）") + "\" aria-pressed=\"" + (isChecked ? 'true' : 'false') + "\" class=\"w-12 h-12 rounded-full border-2 " + (isChecked ? 'bg-muji-red border-muji-red text-white' : 'border-muji-border text-muji-text hover:border-muji-muted') + (isFutureDay ? ' opacity-40 cursor-not-allowed' : '') + " flex items-center justify-center text-lg transition-all shadow-sm\">\n                        " + (isChecked ? '<i class="fa-solid fa-check"></i>' : renderHabitIconContent(h.icon)) + "\n                    </button>\n                    <span class=\"text-xs font-medium text-muji-text truncate max-w-[90px]\">" + escapeHtml(h.title) + "</span>\n                    <span class=\"text-[11px] text-muji-muted font-sans\"><i class=\"fa-solid fa-fire text-muji-ochre mr-0.5\"></i>" + progressLabel + "</span>\n                    \n                    <div class=\"absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex space-x-1\">\n                        <button onclick=\"editHabit('" + h.id + "')\" class=\"p-1.5 text-xs text-muji-muted hover:text-muji-text\"><i class=\"fa-solid fa-pen\"></i></button>\n                        <button onclick=\"deleteHabit('" + h.id + "')\" class=\"p-1.5 text-xs text-muji-muted hover:text-muji-red\"><i class=\"fa-solid fa-trash\"></i></button>\n                    </div>\n                </div>";
            });
            container.innerHTML = html;
        }

        // 每週固定週一為起點，計算本週已打卡次數（不綁定星期幾，累積滿次數即達標）
        function getWeekStartDate(dateObj) {
            const d = new Date(dateObj);
            const day = d.getDay(); // 0 = 週日
            const diff = (day === 0) ? 6 : day - 1;
            d.setDate(d.getDate() - diff);
            d.setHours(0, 0, 0, 0);
            return d;
        }

        function countHabitChecksThisWeek(habitId) {
            const monday = getWeekStartDate(new Date());
            let count = 0;
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                const dateStr = getLocalDateStr(d);
                if ((state.habitLogs[dateStr] || []).includes(habitId)) count++;
            }
            return count;
        }

        // 每週型習慣：從「上一週」往回算，連續幾週打卡次數達標；本週若已達標也一併計入
        function calculateWeeklyHabitStreak(h) {
            const target = h.weeklyTarget || 3;
            const countWeek = (monday) => {
                let c = 0;
                for (let i = 0; i < 7; i++) {
                    const d = new Date(monday); d.setDate(monday.getDate() + i);
                    if ((state.habitLogs[getLocalDateStr(d)] || []).includes(h.id)) c++;
                }
                return c;
            };
            let monday = getWeekStartDate(new Date());
            let streak = countWeek(monday) >= target ? 1 : 0;
            for (let i = 0; i < 520; i++) {
                monday = new Date(monday); monday.setDate(monday.getDate() - 7);
                if (countWeek(monday) >= target) streak++; else break;
            }
            return streak;
        }

        function calculateHabitStreak(habitId) {
            let streak = 0;
            let checkDate = new Date();
            while (true) {
                const dateStr = getLocalDateStr(checkDate);
                const logs = state.habitLogs[dateStr] || [];
                if (logs.includes(habitId)) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    if (streak === 0 && dateStr === getLocalDateStr(new Date())) {
                        checkDate.setDate(checkDate.getDate() - 1);
                        continue;
                    }
                    break;
                }
            }
            return streak;
        }

        function toggleHabitCheck(habitId) {
            const realToday = getLocalDateStr(new Date());
            const todayStr = state.selectedDate || realToday;
            if (todayStr > realToday) { showToast('未來的日子還不能打卡'); return; }
            if (!state.habitLogs[todayStr]) state.habitLogs[todayStr] = [];

            const idx = state.habitLogs[todayStr].indexOf(habitId);
            if (idx >= 0) {
                state.habitLogs[todayStr].splice(idx, 1);
            } else {
                state.habitLogs[todayStr].push(habitId);
            }
            // 記下這次動作的時間：取消打卡也是一筆「較新的紀錄」，其他裝置才不會又把它補回來
            state.habitLogMeta[todayStr + '|' + habitId] = { done: idx < 0, updatedAt: Date.now() };
            saveState();
            renderHabits();
        }

        function openHabitModal(id = null) {
            markFormClean('habit-modal');
            document.getElementById('habit-form').reset();
            document.getElementById('habit-id').value = '';
            document.getElementById('habit-icon-custom-wrap').classList.add('hidden');
            document.getElementById('habit-modal-title').innerText = id ? '編輯習慣' : '新增習慣';

            if (id) {
                const item = state.habits.find(h => h.id === id);
                if (item) {
                    document.getElementById('habit-id').value = item.id;
                    document.getElementById('habit-title').value = item.title;
                    document.getElementById('habit-freq').value = item.freq || 'daily';
                    document.getElementById('habit-weekly-target').value = item.weeklyTarget || 3;
                    document.getElementById('habit-icon').value = item.icon;
                    if (item.icon && item.icon.startsWith('fa:')) {
                        renderHabitIconGrid(item.icon);
                    } else {
                        document.getElementById('habit-icon-custom-wrap').classList.remove('hidden');
                        document.getElementById('habit-icon-custom-input').value = item.icon || '';
                        renderHabitIconGrid(null);
                    }
                }
            } else {
                document.getElementById('habit-icon').value = 'fa:coffee';
                renderHabitIconGrid('fa:coffee');
            }
            toggleHabitFreqUI();
            openModal('habit-modal');
        }

        function toggleHabitFreqUI() {
            const isWeekly = document.getElementById('habit-freq').value === 'weekly';
            document.getElementById('habit-weekly-target-wrap').classList.toggle('hidden', !isWeekly);
        }

        function handleSaveHabit(e) {
            e.preventDefault();
            if (!guardDoubleSubmit(e.target)) return;
            const id = document.getElementById('habit-id').value || 'h_' + Date.now();
            const icon = document.getElementById('habit-icon').value;
            const title = document.getElementById('habit-title').value;
            const freq = document.getElementById('habit-freq').value;
            const weeklyTarget = freq === 'weekly' ? (parseInt(document.getElementById('habit-weekly-target').value, 10) || 3) : null;

            const existingIdx = state.habits.findIndex(h => h.id === id);
            const habitData = { id, icon, title, freq, weeklyTarget, updatedAt: Date.now() };

            if (existingIdx >= 0) {
                recordUndoAction('habits', state.habits[existingIdx]);
                state.habits[existingIdx] = habitData;
            } else {
                state.habits.push(habitData);
            }
            saveState();
            markFormClean('habit-modal');
            closeModal('habit-modal');
            renderHabits();
        }

        function editHabit(id) { openHabitModal(id); }
        async function deleteHabit(id) {
            if (!(await uiConfirm('確定要刪除此習慣嗎？打卡紀錄會一併移除。', { okText: '刪除', danger: true }))) return;
            const item = state.habits.find(h => h.id === id);
            if (item) recordUndoAction('habits', item);
            state.habits = state.habits.filter(h => h.id !== id);
            const habitLogDates = Object.keys(state.habitLogs).filter(d => state.habitLogs[d].includes(id)); // 回收桶復原打卡用
            // 順手清掉本機端這個習慣的打卡紀錄（跨裝置的部分因為打卡紀錄是聯集合併，
            // 不會自動跟著清掉，留著是無害的孤兒資料，畫面本來就只列出目前存在的習慣）
            Object.keys(state.habitLogs).forEach(dateStr => {
                const idx = state.habitLogs[dateStr].indexOf(id);
                if (idx !== -1) state.habitLogs[dateStr].splice(idx, 1);
            });
            Object.keys(state.habitLogMeta).forEach(k => { if (k.split('|')[1] === id) delete state.habitLogMeta[k]; });
            saveState();
            renderHabits();
            recordDeletionToGas('habits', id, item, { __logDates: habitLogDates });
        }

        // DIARY MODULE (TIMELINE & PHOTO WALL)
function viewDiary(id) {
    const item = state.diaries.find(d => d.id === id);
    if (!item) return;

    // 填入文字資料
    document.getElementById('diary-view-title').innerText = item.title || '無標題';
    document.getElementById('diary-view-datetime').innerText = item.datetime ? item.datetime.replace('T', ' ') : '';
    document.getElementById('diary-view-weather').innerHTML = weatherIconHtml(item.weather);
    document.getElementById('diary-view-mood').innerHTML = moodIconHtml(item.mood);
    document.getElementById('diary-view-content').innerHTML = item.content || '';
    document.getElementById('diary-view-tags').innerHTML = renderTagChipsReadonly(item.tags);

    // 處理圖片
    const imgContainer = document.getElementById('diary-view-image-container');
    const imgEl = document.getElementById('diary-view-image');
    if (item.image && item.image.trim() !== '') {
        imgEl.src = safeImg(item.image);
        imgContainer.classList.remove('hidden');
    } else {
        imgContainer.classList.add('hidden');
    }

    // 處理人物與地點標籤
    const metaEl = document.getElementById('diary-view-meta');
    const personWrap = document.getElementById('diary-view-person-wrap');
    const personEl = document.getElementById('diary-view-person');
    const locWrap = document.getElementById('diary-view-location-wrap');
    const locEl = document.getElementById('diary-view-location');

    let hasMeta = false;
    if (item.person) {
        personEl.innerText = item.person;
        personWrap.classList.remove('hidden');
        hasMeta = true;
    } else {
        personWrap.classList.add('hidden');
    }

    if (item.location) {
        locEl.innerText = item.location;
        locWrap.classList.remove('hidden');
        hasMeta = true;
    } else {
        locWrap.classList.add('hidden');
    }

    metaEl.classList.toggle('hidden', !hasMeta);

    // 綁定右上角列印、編輯與刪除按鈕事件
    const printBtn = document.getElementById('diary-view-print-btn');
    const editBtn = document.getElementById('diary-view-edit-btn');
    const deleteBtn = document.getElementById('diary-view-delete-btn');

    printBtn.onclick = () => printSingleDiary(item.id);

    editBtn.onclick = () => {
        closeModal('diary-view-modal');
        editDiary(item.id);
    };

    deleteBtn.onclick = () => {
        closeModal('diary-view-modal');
        deleteDiary(item.id);
    };

    openModal('diary-view-modal');
}

// ================================================================
// 日記匯出PDF模組：用瀏覽器原生列印排版，使用者選「另存為PDF」即可存成PDF檔
// ================================================================
function buildDiaryPrintHtml(diaryList) {
    return diaryList.map(d => {
        const w = resolveIconOption(WEATHER_OPTIONS, d.weather).label;
        const m = resolveIconOption(MOOD_OPTIONS, d.mood).label;
        const dt = d.datetime ? d.datetime.replace('T', ' ') : '';
        const metaLine = [d.person, d.location].filter(Boolean).map(escapeHtml).join('　');
        const imgHtml = d.image ? "<img src=\"" + escapeHtml(d.image) + "\" alt=\"" + escapeHtml(d.title || '日記照片') + "\" style=\"max-width:100%;border-radius:6px;margin:12px 0;\">" : '';
        return "\n            <div class=\"print-entry\" style=\"font-family:'Noto Serif TC',serif;padding:24px;color:#2D2B2A;\">\n                <div style=\"font-size:12px;color:#8C857B;margin-bottom:4px;\">" + escapeHtml(dt) + "　" + w + "　" + m + "</div>\n                <h2 style=\"font-size:20px;margin:0 0 12px;\">" + escapeHtml(d.title || '無標題') + "</h2>\n                " + (metaLine ? "<div style=\"font-size:12px;color:#8C857B;margin-bottom:8px;\">" + metaLine + "</div>" : '') + "\n                " + imgHtml + "\n                <div style=\"font-size:14px;line-height:1.8;\">" + d.content + "</div>\n            </div>";
    }).join('');
}

function printDiaryEntries(diaryList) {
    if (diaryList.length === 0) {
        uiAlert('這個範圍內沒有日記可以匯出');
        return;
    }
    const area = document.getElementById('print-area');
    area.innerHTML = buildDiaryPrintHtml(diaryList);
    // 雲端圖片可能還沒載入完就列印會是空白：等圖片載入（最多 4 秒）再開列印畫面
    const pending = [...area.querySelectorAll('img')].filter(i => !i.complete);
    if (!pending.length) { window.print(); return; }
    Promise.race([
        Promise.all(pending.map(i => new Promise(r => { i.onload = i.onerror = r; }))),
        new Promise(r => setTimeout(r, 4000))
    ]).then(() => window.print());
}

function printSingleDiary(id) {
    const item = state.diaries.find(d => d.id === id);
    if (item) printDiaryEntries([item]);
}

function openDiaryExportModal() {
    document.getElementById('diary-export-start').value = '';
    document.getElementById('diary-export-end').value = '';
    openModal('diary-export-modal');
}

function printDiaryRange() {
    const start = document.getElementById('diary-export-start').value;
    const end = document.getElementById('diary-export-end').value;
    if (!start || !end) {
        uiAlert('請選擇起訖日期');
        return;
    }
    if (start > end) {
        uiAlert('起始日期不能晚於結束日期');
        return;
    }
    const list = state.diaries
        .filter(d => {
            const dateOnly = d.datetime ? d.datetime.split('T')[0] : '';
            return dateOnly >= start && dateOnly <= end;
        })
        .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    closeModal('diary-export-modal');
    printDiaryEntries(list);
}

function scrollToDiaryDate(dateStr) {
    if (!dateStr) return;
    
    // 尋找含有該日期資料標籤的日記卡片
    const targetEl = document.querySelector("[data-diary-date=\"" + dateStr + "\"]");
    if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 短暫高亮提醒
        targetEl.classList.add('ring-2', 'ring-muji-red', 'transition-all', 'duration-300');
        setTimeout(() => {
            targetEl.classList.remove('ring-2', 'ring-muji-red');
        }, 2000);
    }
}
        function switchDiaryView(mode) {
            state.diaryViewMode = mode;
            document.getElementById('diary-mode-timeline').className = (mode === 'timeline') ? 
                "px-3 py-1 rounded-md bg-white text-muji-text font-medium shadow-sm" : "px-3 py-1 rounded-md text-muji-muted";
            document.getElementById('diary-mode-photowall').className = (mode === 'photowall') ? 
                "px-3 py-1 rounded-md bg-white text-muji-text font-medium shadow-sm" : "px-3 py-1 rounded-md text-muji-muted";
            
            document.getElementById('diary-timeline-container').classList.toggle('hidden', mode !== 'timeline');
            document.getElementById('diary-photowall-container').classList.toggle('hidden', mode !== 'photowall');

            renderDiaries();
        }

        // 日記時光軸／相片牆：以「週」為一頁，預設本週，可往前/往後翻頁；小月曆點日期會自動跳到那天所在的週
        function getMondayOfDate(dateStr) {
            const d = getValidDateObj(dateStr);
            const day = d.getDay(); // 0 = 週日
            const diff = (day === 0) ? 6 : day - 1;
            d.setDate(d.getDate() - diff);
            return getLocalDateStr(d);
        }

        function setDiaryWeekFromDate(dateStr) {
            state.diaryWeekStart = getMondayOfDate(dateStr);
        }

        function navigateDiaryWeek(delta) {
            const d = getValidDateObj(state.diaryWeekStart);
            d.setDate(d.getDate() + delta * 7);
            setGlobalDate(getLocalDateStr(d), { noScroll: true }); // 翻週也帶動全域日期
        }

        function getDiaryWeekDates() {
            const start = getValidDateObj(state.diaryWeekStart);
            const dates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                dates.push(getLocalDateStr(d));
            }
            return dates;
        }

        function updateDiaryWeekLabel() {
            const dates = getDiaryWeekDates();
            const labelEl = document.getElementById('diary-week-range-label');
            if (labelEl) labelEl.innerText = dates[0] + " ～ " + dates[6];
        }

        // 每種心情的熱力圖底色
        const MOOD_HEAT_COLORS = { happy: '#E3B94F', loved: '#E08A93', neutral: '#B9B1A3', tired: '#8EA2B6', sad: '#6F8FB0', shocked: '#B592C6', angry: '#CF5F5F' };
        let moodHeatMonth = null; // { y, m }（m 為 0-11）

        function shiftMoodMonth(delta) {
            if (!moodHeatMonth) { const n = new Date(); moodHeatMonth = { y: n.getFullYear(), m: n.getMonth() }; }
            const d = new Date(moodHeatMonth.y, moodHeatMonth.m + delta, 1);
            moodHeatMonth = { y: d.getFullYear(), m: d.getMonth() };
            renderMoodHeatmap();
        }

        function renderMoodHeatmap() {
            const box = document.getElementById('mood-heatmap');
            if (!box) return;
            if (!moodHeatMonth) { const n = new Date(); moodHeatMonth = { y: n.getFullYear(), m: n.getMonth() }; }
            const { y, m } = moodHeatMonth;
            document.getElementById('mood-heatmap-label').textContent = y + ' 年 ' + (m + 1) + ' 月';
            const prefix = y + '-' + String(m + 1).padStart(2, '0');
            const byDay = {};
            state.diaries.forEach(d => { // 同一天多篇日記，以最晚那篇的心情為準
                if (!d.datetime || !d.mood || String(d.datetime).slice(0, 7) !== prefix) return;
                const day = Number(String(d.datetime).slice(8, 10));
                if (!byDay[day] || d.datetime > byDay[day].datetime) byDay[day] = d;
            });
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            const lead = (new Date(y, m, 1).getDay() + 6) % 7; // 週一為每週第一天
            let html = '<div class="grid grid-cols-7 gap-1 text-center text-[11px] text-muji-muted mb-1">' + ['一', '二', '三', '四', '五', '六', '日'].map(w => '<div>' + w + '</div>').join('') + '</div>';
            html += '<div class="grid grid-cols-7 gap-1">';
            for (let i = 0; i < lead; i++) html += '<div></div>';
            const counts = {};
            for (let day = 1; day <= daysInMonth; day++) {
                const diary = byDay[day];
                if (diary) {
                    const opt = resolveIconOption(MOOD_OPTIONS, diary.mood);
                    counts[opt.code] = (counts[opt.code] || 0) + 1;
                    html += '<div class="aspect-square rounded flex items-center justify-center text-white text-xs" style="background:' + (MOOD_HEAT_COLORS[opt.code] || '#B9B1A3') + '" title="' + (m + 1) + '/' + day + ' ' + opt.label + '"><i class="fa-solid ' + opt.icon + '"></i></div>';
                } else {
                    html += '<div class="aspect-square rounded bg-muji-paper flex items-center justify-center text-[11px] text-muji-muted">' + day + '</div>';
                }
            }
            html += '</div>';
            box.innerHTML = html;
            const legend = document.getElementById('mood-heatmap-legend');
            legend.innerHTML = MOOD_OPTIONS.filter(o => counts[o.code]).map(o =>
                '<span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:' + MOOD_HEAT_COLORS[o.code] + '"></span>' + o.label + ' ' + counts[o.code] + '</span>'
            ).join('') || '這個月還沒有帶心情的日記';
        }

        function renderDiaries() {
            renderMoodHeatmap();
            updateDiaryWeekLabel();
            if (state.diaryViewMode === 'photowall') {
                renderPhotoWall();
            } else {
                renderDiaryTimeline();
            }
        }

// 卡片右上的編輯／刪除鈕（滑過或鍵盤聚焦才顯示）；extraCls 用來指定定位
function diaryActionButtons(id, extraCls) {
    return '<div class="opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity flex space-x-1 bg-white/80 dark:bg-zinc-800/80 p-1 rounded z-10 ' + (extraCls || '') + '" onclick="event.stopPropagation()">'
        + '<button onclick="editDiary(\'' + id + '\')" class="p-1 text-xs text-muji-muted hover:text-muji-text" title="編輯日記"><i class="fa-solid fa-pen"></i></button>'
        + '<button onclick="deleteDiary(\'' + id + '\')" class="p-1 text-xs text-muji-muted hover:text-muji-red" title="刪除日記"><i class="fa-solid fa-trash"></i></button></div>';
}

function diaryDateRow(d, dt) {
    return '<span>' + escapeHtml(dt) + '</span><span>' + weatherIconHtml(d.weather) + '</span><span>' + moodIconHtml(d.mood) + '</span>';
}
// 卡片底部：參與人員、地點、標籤（compact=true 時單行截斷，給相片牆小卡用）
function diaryFootHtml(d, compact) {
    const info = (d.person ? '<span class="truncate"><i class="fa-regular fa-user mr-1"></i>' + escapeHtml(d.person) + '</span>' : '')
        + (d.location ? '<span class="truncate"><i class="fa-solid fa-location-dot mr-1"></i>' + escapeHtml(d.location) + '</span>' : '');
    const tags = d.tags && d.tags.length ? '<div class="' + (compact ? 'truncate' : '') + '">' + renderTagChipsReadonly(d.tags) + '</div>' : '';
    if (!info && !tags) return '';
    return '<div class="flex items-center justify-between gap-2 text-xs text-muji-muted pt-2 border-t border-muji-border/40 mt-auto min-w-0"><div class="flex items-center gap-x-3 min-w-0 ' + (compact ? 'overflow-hidden' : 'flex-wrap') + '">' + info + '</div>' + tags + '</div>';
}

function renderDiaryTimeline() {
    const container = document.getElementById('diary-timeline-container');
    if (!container) return;

    if (state.diaries.length === 0) {
        container.innerHTML = "<div class=\"text-center py-8 text-xs text-muji-muted pl-6\">尚未撰寫日記，點擊右上方新增</div>";
        return;
    }

    const weekDates = new Set(getDiaryWeekDates());
    const weekDiaries = state.diaries.filter(d => d.datetime && weekDates.has(d.datetime.split('T')[0]));

    if (weekDiaries.length === 0) {
        container.innerHTML = "<div class=\"text-center py-8 text-xs text-muji-muted pl-6\">這一週尚無日記，可切換上週／下週查看，或點擊右上方新增</div>";
        return;
    }

    const sorted = weekDiaries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    let html = '';
    sorted.forEach(d => {
        const dtStr = d.datetime ? d.datetime.replace('T', ' ') : '';
        const dateOnly = d.datetime ? d.datetime.split('T')[0] : '';
        const hasImage = d.image && d.image.trim() !== '';

        html += '<div data-diary-date="' + dateOnly + '" class="pl-8 relative group transition-all duration-300">'
            + '<div class="absolute left-2.5 top-5 w-3 h-3 rounded-full bg-muji-red border-2 border-white ring-2 ring-muji-paper z-10"></div>'
            + '<div onclick="viewDiary(\'' + d.id + '\')" class="muji-card h-52 flex cursor-pointer hover:shadow-md transition-all relative group/card overflow-hidden">'
            + (hasImage ? '<div class="w-20 sm:w-28 h-full shrink-0 overflow-hidden"><img src="' + escapeHtml(d.image) + '" alt="' + escapeHtml(d.title || '日記照片') + '" style="object-position:' + imageFocusCss(d.imagePosition) + '" class="w-full h-full object-cover"></div>' : '')
            + '<div class="p-5 flex-1 min-w-0 flex flex-col justify-between"><div>'
            + '<div class="flex justify-between items-start mb-2"><div class="min-w-0">'
            + '<h3 class="font-serif font-semibold text-sm text-muji-text truncate pr-16">' + escapeHtml(d.title) + '</h3>'
            + '<div class="flex items-center space-x-2 text-xs text-muji-muted mt-1">' + diaryDateRow(d, dtStr) + '</div></div>'
            + diaryActionButtons(d.id) + '</div>'
            + '<div class="rich-content text-sm leading-relaxed text-muji-muted line-clamp-3">' + d.content + '</div></div>'
            + diaryFootHtml(d) + '</div></div></div>';
    });
    container.innerHTML = html;
}

function renderPhotoWall() {
    const container = document.getElementById('diary-photowall-container');
    if (!container) return;

    if (state.diaries.length === 0) {
        container.innerHTML = "<div class=\"col-span-full text-center py-12 text-xs text-muji-muted\">尚未撰寫日記，點擊右上方新增</div>";
        return;
    }

    const weekDates = new Set(getDiaryWeekDates());
    const weekDiaries = state.diaries.filter(d => d.datetime && weekDates.has(d.datetime.split('T')[0]));

    if (weekDiaries.length === 0) {
        container.innerHTML = "<div class=\"col-span-full text-center py-12 text-xs text-muji-muted\">這一週尚無日記，可切換上週／下週查看</div>";
        return;
    }

    const sorted = weekDiaries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    let html = '';
    sorted.forEach(d => {
        const dateOnly = d.datetime ? d.datetime.split('T')[0] : '';
        const hasImage = d.image && d.image.trim() !== '';

        if (hasImage) {
            html += '<div data-diary-date="' + dateOnly + '" onclick="viewDiary(\'' + d.id + '\')" class="muji-card overflow-hidden group/card cursor-pointer relative aspect-square flex flex-col bg-white hover:shadow-md transition-all">'
                + diaryActionButtons(d.id, 'absolute top-2 right-2')
                + '<div class="h-2/5 w-full overflow-hidden bg-muji-paper shrink-0"><img src="' + escapeHtml(d.image) + '" alt="' + escapeHtml(d.title || '日記照片') + '" style="object-position:' + imageFocusCss(d.imagePosition) + '" class="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300"></div>'
                + '<div class="p-2.5 flex-1 min-h-0 flex flex-col justify-between bg-white overflow-hidden"><div class="min-w-0">'
                + '<h4 class="font-serif font-semibold text-sm truncate text-muji-text">' + escapeHtml(d.title) + '</h4>'
                + '<div class="flex items-center gap-1.5 text-[11px] text-muji-muted mt-0.5">' + diaryDateRow(d, dateOnly) + '</div>'
                + '<div class="text-xs text-muji-muted line-clamp-1 leading-relaxed rich-content mt-0.5">' + d.content + '</div></div>'
                + diaryFootHtml(d, true) + '</div></div>';
        } else {
            html += '<div data-diary-date="' + dateOnly + '" onclick="viewDiary(\'' + d.id + '\')" class="muji-card overflow-hidden group/card cursor-pointer relative aspect-square p-3.5 flex flex-col justify-between bg-[#FDFBF7] dark:bg-[#2F2C29] border border-[#E8E2D5] dark:border-[#423E3A] hover:shadow-md transition-all">'
                + diaryActionButtons(d.id, 'absolute top-2 right-2')
                + '<div class="min-w-0"><h4 class="font-serif font-semibold text-sm text-muji-text truncate pr-12">' + escapeHtml(d.title) + '</h4>'
                + '<div class="flex items-center gap-1.5 text-[11px] text-muji-muted mt-0.5 mb-1.5">' + diaryDateRow(d, dateOnly) + '</div>'
                + '<div class="text-xs text-muji-muted line-clamp-3 leading-relaxed rich-content">' + d.content + '</div></div>'
                + diaryFootHtml(d, true) + '</div>';
        }
    });
    container.innerHTML = html;
}

        // 右下「回到頁首」：捲動超過一屏的 1/3 才顯示
        function updateBackToTop() {
            const btn = document.getElementById('back-to-top-btn'); // 按鈕在 script 之後才建立，所以每次捲動時才取得
            if (!btn) return;
            const show = window.scrollY > window.innerHeight / 3;
            btn.classList.toggle('hidden', !show);
            btn.classList.toggle('flex', show);
        }
        window.addEventListener('scroll', updateBackToTop, { passive: true });

        function openDiaryModal(id = null) {
            markFormClean('diary-modal');
            document.getElementById('diary-form').reset();
            document.getElementById('diary-id').value = '';
            document.getElementById('diary-editor').innerHTML = '';
            clearImagePreview('diary-img-preview', 'diary-image-data', 'diary-image-file');
            document.getElementById('diary-modal-title').innerText = id ? '編輯日記' : '新增日記';
            setIconPickerValue('diary-weather', 'clear');
            setIconPickerValue('diary-mood', 'happy');
            initTagPicker('diary-tag-chips', []);

            if (id) {
                const item = state.diaries.find(d => d.id === id);
                if (item) {
                    document.getElementById('diary-id').value = item.id;
                    document.getElementById('diary-title').value = item.title;
                    document.getElementById('diary-datetime').value = item.datetime;
                    setIconPickerValue('diary-weather', item.weather || 'clear');
                    setIconPickerValue('diary-mood', item.mood || 'happy');
                    document.getElementById('diary-person').value = item.person || '';
                    document.getElementById('diary-location').value = item.location || '';
                    document.getElementById('diary-editor').innerHTML = item.content || '';
                    setImagePreviewFromData(item.image, 'diary-img-preview', 'diary-image-data', item.imagePosition);
                    initTagPicker('diary-tag-chips', item.tags || []);
                }
            } else {
                const now = new Date();
                const nowStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                document.getElementById('diary-datetime').value = nowStr;
            }
            openModal('diary-modal');
        }

        function handleSaveDiary(e) {
            e.preventDefault();
            if (!guardDoubleSubmit(e.target)) return;
            const id = document.getElementById('diary-id').value || 'd_' + Date.now();
            const title = document.getElementById('diary-title').value;
            const datetime = document.getElementById('diary-datetime').value;
            const weather = document.getElementById('diary-weather').value;
            const mood = document.getElementById('diary-mood').value;
            const person = document.getElementById('diary-person').value;
            const location = document.getElementById('diary-location').value;
            const content = sanitizeRichHtml(document.getElementById('diary-editor').innerHTML);
            const image = document.getElementById('diary-image-data').value;
            const imagePosition = getImagePosition('diary-image-data');
            const tags = getTagDraft('diary-tag-chips');

            const existingIdx = state.diaries.findIndex(d => d.id === id);
            const prevImageFileId = existingIdx >= 0 ? state.diaries[existingIdx].imageFileId : null;
            const diaryData = { id, title, datetime, weather, mood, person, location, content, image, imagePosition, tags, imageFileId: prevImageFileId || null, updatedAt: Date.now() };

            if (existingIdx >= 0) {
                recordUndoAction('diaries', state.diaries[existingIdx]);
                state.diaries[existingIdx] = diaryData;
            } else {
                state.diaries.push(diaryData);
            }
            saveState();
            markFormClean('diary-modal');
            closeModal('diary-modal');
            if (datetime) setDiaryWeekFromDate(datetime.split('T')[0]);
            renderDiaries();
            renderMiniCalendars();
            renderHomeTagFilters();
            syncItemImageToCloud('diary', id, prevImageFileId);
        }

        function editDiary(id) { openDiaryModal(id); }
        async function deleteDiary(id) {
            if (!(await uiConfirm('確定要刪除此篇日記嗎？此動作無法復原。', { okText: '刪除', danger: true }))) return;
            const item = state.diaries.find(d => d.id === id);
            if (item) recordUndoAction('diaries', item);
            state.diaries = state.diaries.filter(d => d.id !== id);
            saveState();
            renderDiaries();
            renderMiniCalendars();
            renderHomeTagFilters();
            markItemImageDeletedIfAny(item);
            recordDeletionToGas('diaries', id, item);
        }

// 小月曆獨立視角年月狀態 (初始化時確保正確載入)
let miniCalYear = (typeof state !== 'undefined' && state && state.selectedDate) 
    ? new Date(state.selectedDate.replace(/-/g, '/')).getFullYear() 
    : new Date().getFullYear();

let miniCalMonth = (typeof state !== 'undefined' && state && state.selectedDate) 
    ? new Date(state.selectedDate.replace(/-/g, '/')).getMonth() 
    : new Date().getMonth();

// 安全跳轉工具：確保 state.selectedDate 轉 Date 物件不為 NaN
function getValidDateObj(dateStr) {
    if (!dateStr) return new Date();
    const d = new Date(dateStr.replace(/-/g, '/'));
    return isNaN(d.getTime()) ? new Date() : d;
}

// 1. 核心時間排序函式：全天 / 無時間行程優先排序，有時間者依早到晚 (chronological) 排序
function sortEventsByTime(eventsList) {
    if (!Array.isArray(eventsList)) return [];
    return [...eventsList].sort((a, b) => {
        const timeA = a.time || '';
        const timeB = b.time || '';
        const isAllDayA = !timeA;
        const isAllDayB = !timeB;

        if (isAllDayA && !isAllDayB) return -1;
        if (!isAllDayA && isAllDayB) return 1;
        if (isAllDayA && isAllDayB) return (a.title || '').localeCompare(b.title || '');

        return timeA.localeCompare(timeB);
    });
}

// 行事曆日／週／月視圖與當日彈窗顯示待辦：勾選、編輯、刪除都走首頁同一組函式（toggleTodo／editTodo／deleteTodo）
function getTodoTime(t) { // 00:00 視為「只有日期」
    const m = /T(\d{2}:\d{2})$/.exec(t.datetime || '');
    return m && m[1] !== '00:00' ? m[1] : '';
}
function getTodosOnDate(dateStr) { // 含已完成；沒時間的排前面（比照全天行程）
    return state.todos.filter(t => t.datetime && t.datetime.startsWith(dateStr))
        .sort((a, b) => getTodoTime(a).localeCompare(getTodoTime(b)) || (a.title || '').localeCompare(b.title || ''));
}
function calTodoCheckbox(t, sizeCls) {
    return '<input type="checkbox" ' + (t.completed ? 'checked ' : '') + 'onclick="event.stopPropagation()" onchange="toggleTodo(\'' + t.id + '\')" aria-label="完成：' + escapeHtml(t.title) + '" class="rounded text-muji-red focus:ring-muji-red cursor-pointer shrink-0 ' + (sizeCls || '') + '">';
}
function calTodoTitleCls(t) { return t.completed ? 'line-through text-muji-muted' : 'text-muji-text'; }

function calDayTodoCard(t) {
    const time = getTodoTime(t);
    return '<div class="p-3 muji-card flex justify-between items-center group hover:shadow-sm transition-shadow">'
        + '<div class="flex items-center gap-3 min-w-0">' + calTodoCheckbox(t)
        + '<div class="min-w-0"><div class="text-sm font-medium ' + calTodoTitleCls(t) + '">' + escapeHtml(t.title || '無標題') + '</div>'
        + (time ? '<div class="text-xs text-muji-muted mt-0.5"><i class="fa-regular fa-clock mr-1"></i>' + time + '</div>' : '') + '</div></div>'
        + '<div class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex space-x-1 shrink-0">'
        + '<button onclick="editTodo(\'' + t.id + '\')" class="p-1.5 text-muji-muted hover:text-muji-text transition-colors text-xs" title="編輯待辦"><i class="fa-solid fa-pen"></i></button>'
        + '<button onclick="deleteTodo(\'' + t.id + '\')" class="p-1.5 text-muji-muted hover:text-muji-red transition-colors text-xs" title="刪除待辦"><i class="fa-solid fa-trash"></i></button></div></div>';
}
function calWeekTodoRow(t) {
    return '<div class="flex items-center justify-between gap-2 py-1 group/ev">'
        + '<div class="flex items-center gap-1.5 min-w-0">' + calTodoCheckbox(t, 'w-3.5 h-3.5')
        + '<span class="text-xs truncate ' + calTodoTitleCls(t) + '">' + escapeHtml(t.title || '無標題') + '</span></div>'
        + '<div class="flex items-center gap-1.5 shrink-0"><span class="text-[11px] text-muji-muted">' + getTodoTime(t) + '</span>'
        + '<div class="hidden group-hover/ev:flex items-center space-x-1">'
        + '<button onclick="event.stopPropagation(); editTodo(\'' + t.id + '\')" class="text-muji-muted hover:text-muji-text text-[11px]" title="編輯"><i class="fa-solid fa-pen"></i></button>'
        + '<button onclick="event.stopPropagation(); deleteTodo(\'' + t.id + '\')" class="text-muji-muted hover:text-muji-red text-[11px]" title="刪除"><i class="fa-solid fa-trash"></i></button></div></div></div>';
}
function calModalTodoRow(t) {
    const time = getTodoTime(t);
    return '<div class="p-3 bg-muji-paper rounded-lg border border-muji-border flex items-center justify-between">'
        + '<div class="flex items-center gap-2.5 flex-1 min-w-0 pr-3">' + calTodoCheckbox(t)
        + '<div class="min-w-0"><span class="text-xs font-semibold ' + calTodoTitleCls(t) + '">' + escapeHtml(t.title || '無標題') + '</span>'
        + (time ? '<div class="text-xs text-muji-muted mt-0.5"><i class="fa-regular fa-clock mr-1"></i>' + time + '</div>' : '') + '</div></div>'
        + '<div class="flex items-center space-x-1 shrink-0">'
        + '<button onclick="closeDayEventsModal(); editTodo(\'' + t.id + '\')" class="p-1.5 text-muji-muted hover:text-muji-text transition-colors text-xs" title="編輯待辦"><i class="fa-solid fa-pen"></i></button>'
        + '<button onclick="deleteTodo(\'' + t.id + '\')" class="p-1.5 text-muji-muted hover:text-muji-red transition-colors text-xs" title="刪除待辦"><i class="fa-solid fa-trash"></i></button></div></div>';
}

// 待辦異動後，顯示待辦的地方一起重畫：首頁清單與焦點行程、小月曆紅點、行事曆日／週／月視圖、當日彈窗
function refreshTodoViews() {
    renderTodos();
    renderTodayHeader();
    renderMiniCalendars();
    renderEvents();
    const dayModal = document.getElementById('modal-day-events');
    if (dayModal && !dayModal.classList.contains('hidden')) fillDayEventsModal(state.selectedDate);
}

// 2. 小月曆渲染與操控 (首次開啟即正確寫入年月，點擊純選取不滑出頁面)
function renderMiniCalendar() {
    const container = document.getElementById('mini-calendar-main');
    const jumpInput = document.getElementById('mini-cal-jump-input');
    const titleElem = document.getElementById('mini-cal-month-title');
    if (!container) return;

    if (!state.selectedDate) {
        state.selectedDate = getLocalDateStr(new Date());
    }

    if (jumpInput && state.selectedDate) jumpInput.value = state.selectedDate;
    if (titleElem) titleElem.innerText = miniCalYear + " 年 " + (miniCalMonth + 1) + " 月";

    // 行事曆頁小月曆：有行程／待辦才顯示標記
    renderMiniCalGrid(container, miniCalYear, miniCalMonth, state.selectedDate, hasTodoOrEventOn, 'selectMiniCalDate');
}

function selectMiniCalDate(dateStr) {
    setGlobalDate(dateStr);
}

function jumpCalToToday() {
    const todayStr = getLocalDateStr(new Date());
    selectMiniCalDate(todayStr);
}

// 3. 日視角渲染（切換前後日，自動連帶更新當日行程與小月曆）
function renderDayView() {
    const container = document.getElementById('cal-view-day-container');
    if (!container) return;

    const rawEvents = getEventsOnDate(state.selectedDate);
    const dayEvents = sortEventsByTime(rawEvents);
    const dayTodos = getTodosOnDate(state.selectedDate);

    let html = "\n    <div class=\"flex justify-between items-center border-b border-muji-border pb-3\">\n        <button onclick=\"navigateCalDay(-1)\" class=\"px-3 py-1 bg-muji-paper hover:bg-stone-200/60 text-xs rounded border border-muji-border text-muji-text transition-colors flex items-center gap-1\">\n            <i class=\"fa-solid fa-chevron-left text-[11px]\"></i> 上日\n        </button>\n        <h3 class=\"font-serif font-semibold text-sm text-muji-text\">" + state.selectedDate + "</h3>\n        <button onclick=\"navigateCalDay(1)\" class=\"px-3 py-1 bg-muji-paper hover:bg-stone-200/60 text-xs rounded border border-muji-border text-muji-text transition-colors flex items-center gap-1\">\n            下日 <i class=\"fa-solid fa-chevron-right text-[11px]\"></i>\n        </button>\n    </div>\n    <div class=\"space-y-3 pt-2\">";

    if (dayEvents.length === 0 && dayTodos.length === 0) {
        html += "<p class=\"text-xs text-muji-muted py-8 text-center\">尚無行程或待辦。</p>";
    } else {
        dayEvents.forEach(e => {
            const thumb = e.image ? "<img src=\"" + escapeHtml(e.image) + "\" alt=\"" + escapeHtml(e.title || '行程圖片') + "\" onclick=\"event.stopPropagation(); openImageLightbox(this.src)\" style=\"object-position:" + imageFocusCss(e.imagePosition) + "\" class=\"w-12 h-12 rounded-lg border border-muji-border object-cover shrink-0 cursor-pointer\">" : '';
            html += "\n            <div class=\"p-3 muji-card border-l-4 flex justify-between items-center group hover:shadow-sm transition-shadow\" style=\"border-left-color: " + (e.color || '#8C2B2B') + "\">\n                <div class=\"flex items-center space-x-3 min-w-0\">\n                    " + thumb + "\n                    <div class=\"space-y-1 min-w-0\">\n                        <div class=\"font-medium text-sm text-muji-text\">" + escapeHtml(e.title || '無標題') + (e.repeat ? " <i class=\"fa-solid fa-repeat text-[11px] text-muji-muted ml-1\" title=\"重複行程\"></i>" : '') + "</div>\n                        <div class=\"text-xs text-muji-muted flex items-center space-x-3\">\n                            <span><i class=\"fa-regular fa-clock mr-1\"></i>" + (e.time || '全天') + "</span>\n                            " + (e.person ? "<span><i class=\"fa-regular fa-user mr-1\"></i>" + escapeHtml(e.person) + "</span>" : '') + "\n                            " + (e.location ? "<span><i class=\"fa-solid fa-location-dot mr-1\"></i>" + escapeHtml(e.location) + "</span>" : '') + "\n                        </div>\n                    </div>\n                </div>\n                <!-- 無字無邊框純圖示按鈕 -->\n                <div class=\"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex space-x-1\">\n                    <button onclick=\"editEvent('" + e.id + "')\" class=\"p-1.5 text-muji-muted hover:text-muji-text transition-colors text-xs\" title=\"編輯行程\"><i class=\"fa-solid fa-pen\"></i></button>\n                    <button onclick=\"deleteEvent('" + e.id + "')\" class=\"p-1.5 text-muji-muted hover:text-muji-red transition-colors text-xs\" title=\"刪除行程\"><i class=\"fa-solid fa-trash\"></i></button>\n                </div>\n            </div>";
        });
        dayTodos.forEach(t => { html += calDayTodoCard(t); });
    }
    html += "</div>";
    container.innerHTML = html;
}

function navigateCalDay(delta) {
    const d = getValidDateObj(state.selectedDate);
    d.setDate(d.getDate() + delta);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    selectMiniCalDate(year + "-" + month + "-" + day);
}

// 4. 週視角渲染 (前後週切換 + 行程按時間排序)
function navigateCalWeek(delta) {
    const d = getValidDateObj(state.selectedDate);
    d.setDate(d.getDate() + (delta * 7));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    selectMiniCalDate(year + "-" + month + "-" + day);
}

// 5. 月視角渲染 (前後月切換 + 大月曆格子隨內容自動增高 + 點擊彈出當日行程)
function renderMonthGrid() {
    const container = document.getElementById('month-grid-cells');
    const monthLabel = document.getElementById('month-view-label');
    if (!container) return;

    const curr = getValidDateObj(state.selectedDate);
    const year = curr.getFullYear();
    const month = curr.getMonth();

    if (monthLabel) monthLabel.innerText = year + " 年 " + (month + 1) + " 月";
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay === 0 ? 6 : firstDay - 1);

    let html = '';
    for (let i = 0; i < startOffset; i++) {
        html += "<div class=\"bg-white dark:bg-[#2F2C29] p-1.5 sm:p-2 min-h-[56px] sm:min-h-[100px]\"></div>";
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = year + "-" + String(month + 1).padStart(2, '0') + "-" + String(d).padStart(2, '0');
        const isToday = (dateStr === getLocalDateStr(new Date()));
        const isSelected = (dateStr === state.selectedDate);
        const dayEvents = sortEventsByTime(getEventsOnDate(dateStr));
        const dayTodos = getTodosOnDate(dateStr);

        // 格子採用 min-h-[100px] h-auto 彈性增高，隨行程多寡伸展
        html += "\n        <div onclick=\"openDayEventsModal('" + dateStr + "')\" class=\"bg-white dark:bg-[#2F2C29] p-1.5 sm:p-2 min-h-[56px] sm:min-h-[100px] h-auto border border-transparent " + (isSelected ? 'ring-2 ring-muji-text z-10' : '') + " hover:bg-muji-paper/50 cursor-pointer transition-all flex flex-col justify-start gap-1.5\">\n            <div class=\"flex justify-between items-center mb-0.5\">\n                <span class=\"text-xs font-semibold " + (isToday ? 'w-5 h-5 rounded-full bg-muji-red text-white flex items-center justify-center' : 'text-muji-text') + "\">" + d + "</span>\n                " + (dayEvents.length + dayTodos.length > 0 ? "<span class=\"text-[11px] text-muji-muted font-normal\">" + (dayEvents.length + dayTodos.length) + " 項</span>" : '') + "\n            </div>\n            <div class=\"flex gap-0.5 sm:hidden\">" + dayEvents.slice(0, 3).map(e => "<span class=\"w-2 h-2 rounded-full\" style=\"background-color: " + (e.color || '#8C2B2B') + "\"></span>").join('') + (dayTodos.length > 0 ? "<span class=\"w-2 h-2 rounded-full border border-muji-text\"></span>" : '') + "</div>\n            <div class=\"space-y-1 w-full\">\n                " + dayEvents.map(e => "\n                    <div class=\"hidden sm:block text-[11px] truncate px-1.5 py-0.5 rounded text-white font-normal\" style=\"background-color: " + (e.color || '#8C2B2B') + "\" title=\"" + escapeHtml(e.title || '無標題') + "\">\n                        " + ((e.time ? '<span class="opacity-80 mr-1">' + e.time + '</span>' : '') + escapeHtml(e.title || '無標題')) + "\n                    </div>\n                ").join('')
                + dayTodos.slice(0, 2).map(t => "<div class=\"hidden sm:block text-[11px] truncate px-1.5 py-0.5 rounded border border-muji-border " + calTodoTitleCls(t) + "\" title=\"" + escapeHtml(t.title || '無標題') + "\"><i class=\"fa-regular fa-square-check mr-1\"></i>" + escapeHtml(t.title || '無標題') + "</div>").join('')
                + (dayTodos.length > 2 ? "<div class=\"hidden sm:block text-[11px] text-muji-muted px-1.5\">+" + (dayTodos.length - 2) + " 項待辦</div>" : '') + "\n            </div>\n        </div>";
    }
    container.innerHTML = html;
}

function navigateCalMonth(delta) {
    const d = getValidDateObj(state.selectedDate);
    const keepDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    d.setDate(Math.min(keepDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); // 31 號切到沒有 31 號的月份時取該月最後一天
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    selectMiniCalDate(year + "-" + month + "-" + day);
}

// 6. 當日行程檢視彈窗邏輯 (按鈕純圖示、無邊框、無文字)
function fillDayEventsModal(dateStr) {
    const modal = document.getElementById('modal-day-events');
    const title = document.getElementById('modal-day-events-title');
    const subtitle = document.getElementById('modal-day-events-subtitle');
    const list = document.getElementById('modal-day-events-list');
    const addBtn = document.getElementById('modal-day-add-btn');

    if (!modal || !list) return;

    if (title) title.innerText = dateStr + " 行程與待辦";
    const dayEvents = sortEventsByTime(getEventsOnDate(dateStr));
    const dayTodos = getTodosOnDate(dateStr);
    const countParts = [];
    if (dayEvents.length) countParts.push(dayEvents.length + " 項行程");
    if (dayTodos.length) countParts.push(dayTodos.length + " 項待辦");
    if (subtitle) subtitle.innerText = countParts.length ? "共 " + countParts.join("、") : "";

    if (addBtn) {
        addBtn.onclick = () => {
            closeDayEventsModal();
            openEventModalWithDate(dateStr);
        };
    }

    if (dayEvents.length === 0 && dayTodos.length === 0) {
        list.innerHTML = "<p class=\"text-xs text-muji-muted py-8 text-center border border-dashed border-muji-border rounded\">本日尚無行程或待辦。</p>";
    } else {
        list.innerHTML = dayEvents.map(e => "\n            <div class=\"p-3 bg-muji-paper rounded-lg border border-muji-border flex items-center justify-between\">\n                <div class=\"space-y-1 flex-1 pr-3\">\n                    <div class=\"flex items-center space-x-2\">\n                        <span class=\"w-2.5 h-2.5 rounded-full inline-block shrink-0\" style=\"background-color: " + (e.color || '#8C2B2B') + "\"></span>\n                        <span class=\"text-xs font-semibold text-muji-text\">" + escapeHtml(e.title || '無標題') + "</span>\n                    </div>\n                    <div class=\"text-xs text-muji-muted flex items-center space-x-3 pl-4\">\n                        <span><i class=\"fa-regular fa-clock mr-1\"></i>" + (e.time || '全天') + "</span>\n                        " + (e.location ? "<span><i class=\"fa-solid fa-location-dot mr-1\"></i>" + escapeHtml(e.location) + "</span>" : '') + "\n                    </div>\n                </div>\n                <!-- 無文字、無邊框純圖示編輯與刪除按鈕 -->\n                <div class=\"flex items-center space-x-1 shrink-0\">\n                    <button onclick=\"closeDayEventsModal(); editEvent('" + e.id + "')\" class=\"p-1.5 text-muji-muted hover:text-muji-text transition-colors text-xs\" title=\"編輯行程\">\n                        <i class=\"fa-solid fa-pen\"></i>\n                    </button>\n                    <button onclick=\"deleteEvent('" + e.id + "')\" class=\"p-1.5 text-muji-muted hover:text-muji-red transition-colors text-xs\" title=\"刪除行程\">\n                        <i class=\"fa-solid fa-trash\"></i>\n                    </button>\n                </div>\n            </div>\n        ").join('') + dayTodos.map(calModalTodoRow).join('');
    }
}

function openDayEventsModal(dateStr) {
    setGlobalDate(dateStr, { noScroll: true });
    fillDayEventsModal(dateStr);
    const modal = document.getElementById('modal-day-events');
    if (modal) modal.classList.remove('hidden');
}

function closeDayEventsModal() {
    const modal = document.getElementById('modal-day-events');
    if (modal) modal.classList.add('hidden');
}

// 7. 統一的行事曆渲染進入點：切換視角、翻頁、跳轉日期最終都會走到這裡，
//    同時刷新小月曆與當前視角面板，避免兩者狀態不同步。
function changeCalView(viewName) {
    state.calView = viewName;
    ['day', 'week', 'month'].forEach(v => {
        const btn = document.getElementById("view-btn-" + v);
        const container = document.getElementById("cal-view-" + v + "-container");
        if (v === viewName) {
            if (btn) btn.className = "px-3 py-1 rounded-md bg-white text-muji-text font-medium shadow-sm";
            if (container) container.classList.remove('hidden');
        } else {
            if (btn) btn.className = "px-3 py-1 rounded-md text-muji-muted hover:text-muji-text transition-colors";
            if (container) container.classList.add('hidden');
        }
    });
    renderEvents();
}

function renderEvents() {
    renderMiniCalendar();
    if (typeof ensureGcalRangeCovered === 'function') ensureGcalRangeCovered(); // 翻到已載入範圍之外的月份時，補抓那個月的 Google 行程
    if (state.calView === 'day') {
        renderDayView();
    } else if (state.calView === 'month') {
        renderMonthGrid();
    } else {
        renderMujiWeekSpread();
    }
}

// 週視角單日卡片（左四右三版面）
function createMujiWeekDayCard(dateStr) {
    const dateObj = getValidDateObj(dateStr);
    const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const isToday = dateStr === getLocalDateStr(new Date());
    const isSelected = dateStr === state.selectedDate;
    const dayEvents = sortEventsByTime(getEventsOnDate(dateStr));

    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

    const todosHtml = getTodosOnDate(dateStr).map(calWeekTodoRow).join('');
    const eventsHtml = dayEvents.length === 0
        ? ""
        : dayEvents.map(e => "\n            <div class=\"flex items-center justify-between gap-2 py-1 group/ev\">\n                <div class=\"flex items-center gap-1.5 min-w-0\">\n                    <span class=\"w-2 h-2 rounded-full shrink-0\" style=\"background-color: " + (e.color || '#8C2B2B') + "\"></span>\n                    <span class=\"text-xs text-muji-text truncate\">" + escapeHtml(e.title || '無標題') + "</span>\n                </div>\n                <div class=\"flex items-center gap-1.5 shrink-0\">\n                    <span class=\"text-[11px] text-muji-muted\">" + (e.time || '全天') + "</span>\n                    <div class=\"hidden group-hover/ev:flex items-center space-x-1\">\n                        <button onclick=\"event.stopPropagation(); editEvent('" + e.id + "')\" class=\"text-muji-muted hover:text-muji-text text-[11px]\" title=\"編輯\"><i class=\"fa-solid fa-pen\"></i></button>\n                        <button onclick=\"event.stopPropagation(); deleteEvent('" + e.id + "')\" class=\"text-muji-muted hover:text-muji-red text-[11px]\" title=\"刪除\"><i class=\"fa-solid fa-trash\"></i></button>\n                    </div>\n                </div>\n            </div>").join('');

    return "\n    <div onclick=\"selectMiniCalDate('" + dateStr + "')\" class=\"border " + (isSelected ? 'border-muji-text' : 'border-muji-border') + " rounded-lg p-3 " + (isToday ? 'bg-muji-paper/60' : 'bg-white dark:bg-[#2F2C29]') + " cursor-pointer hover:shadow-sm transition-all\">\n        <div class=\"flex justify-between items-center mb-1.5 pb-1.5 border-b border-muji-border/50\">\n            <div class=\"flex items-baseline gap-1.5\">\n                <span class=\"font-serif font-semibold text-sm " + (isToday ? 'text-muji-red' : 'text-muji-text') + "\">" + dateObj.getDate() + "</span>\n                <span class=\"text-[11px] " + (isWeekend ? 'text-muji-red' : 'text-muji-muted') + "\">週" + weekdayNames[dateObj.getDay()] + "</span>\n            </div>\n            <button onclick=\"event.stopPropagation(); openEventModalWithDate('" + dateStr + "')\" class=\"text-muji-muted hover:text-muji-red text-xs\" title=\"新增行程\">\n                <i class=\"fa-solid fa-plus\"></i>\n            </button>\n        </div>\n        <div class=\"space-y-0.5\">" + eventsHtml + todosHtml + "</div>\n    </div>";
}

        function renderMujiWeekSpread() {
            const leftCol = document.getElementById('week-left-col');
            const rightCol = document.getElementById('week-right-col');
            if (!leftCol || !rightCol) return;

            const curr = getValidDateObj(state.selectedDate);
            const firstDayOfWeek = new Date(curr.setDate(curr.getDate() - (curr.getDay() === 0 ? 6 : curr.getDay() - 1)));

            const weekDays = [];
            for (let i = 0; i < 7; i++) {
                const day = new Date(firstDayOfWeek);
                day.setDate(day.getDate() + i);
                weekDays.push(getLocalDateStr(day));
            }

            const rangeLabelEl = document.getElementById('week-view-range-label');
            if (rangeLabelEl) rangeLabelEl.innerText = weekDays[0] + " ~ " + weekDays[6];

            let leftHtml = '';
            let rightHtml = '';

            for (let i = 0; i < 4; i++) {
                leftHtml += createMujiWeekDayCard(weekDays[i]);
            }
            for (let i = 4; i < 7; i++) {
                rightHtml += createMujiWeekDayCard(weekDays[i]);
            }

            // Weekly Memo Box Component
            let memoListHtml = '';
            if (state.notes.length === 0) {
                memoListHtml = "<p class=\"text-xs text-muji-muted\">尚無隨記。</p>";
            } else {
                state.notes.forEach(n => {
                    memoListHtml += "\n                    <div class=\"p-2 rounded border border-muji-border bg-white dark:bg-[#2F2C29] flex justify-between items-center group relative\">\n                        <div class=\"truncate text-xs flex-1 pr-2\">\n                            <span class=\"font-medium text-muji-text\">" + escapeHtml(n.title || '無標題隨記') + "</span>\n                        </div>\n                        <div class=\"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex space-x-2\">\n                            <button onclick=\"editNote('" + n.id + "')\" class=\"text-xs text-muji-muted hover:text-muji-text\" title=\"編輯\"><i class=\"fa-solid fa-pen\"></i></button>\n                            <button onclick=\"deleteNote('" + n.id + "')\" class=\"text-xs text-muji-muted hover:text-muji-red\" title=\"刪除\"><i class=\"fa-solid fa-trash\"></i></button>\n                        </div>\n                    </div>";
                });
            }

            rightHtml += "\n            <div class=\"border border-dashed border-muji-border rounded p-3 bg-muji-paper/50 min-h-[110px] space-y-2\">\n                <div class=\"flex justify-between items-center mb-1\">\n                    <h4 class=\"font-serif text-sm font-semibold text-muji-muted\"><i class=\"fa-solid fa-thumbtack mr-1\"></i>MEMO / 隨記</h4>\n                    <button onclick=\"openNoteModal()\" class=\"text-[11px] text-muji-red hover:underline\">+ 新增備忘</button>\n                </div>\n                <div class=\"space-y-1.5\">" + memoListHtml + "</div>\n            </div>";

            leftCol.innerHTML = leftHtml;
            rightCol.innerHTML = rightHtml;
        }


        // EVENT ACTION HANDLERS
        function openEventModalWithDate(dateStr) {
            openEventModal();
            if (dateStr) { document.getElementById('event-date').value = dateStr; retakeFormSnapshot('event-modal'); }
        }

        // 重複行程：只在顯示時依規則展開（不會真的產生多筆資料），主檔的日期就是第一次發生的日期
        function eventOccursOn(ev, dateStr) {
            if (ev.date === dateStr) return true;
            if (ev.endDate && ev.date && dateStr > ev.date && dateStr <= ev.endDate) return true; // 多日行程（連假）每天都顯示
            const rep = ev.repeat;
            if (!rep || !ev.date || dateStr < ev.date) return false;
            if (ev.repeatUntil && dateStr > ev.repeatUntil) return false;
            const [y, m, d] = ev.date.split('-').map(Number);
            const [Y, M, D] = dateStr.split('-').map(Number);
            const days = Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(y, m - 1, d)) / 86400000);
            const dim = new Date(Y, M, 0).getDate(); // 該月天數
            if (rep === 'daily') return true;
            if (rep === 'weekly') return days % 7 === 0;
            if (rep === 'monthly') return D === Math.min(d, dim);
            if (rep === 'yearly') return M === m && D === Math.min(d, dim);
            return false;
        }

        function getEventsOnDate(dateStr) {
            return state.events.filter(e => eventOccursOn(e, dateStr))
                .map(e => e.date === dateStr ? e : Object.assign({}, e, { date: dateStr, _occurrence: true }));
        }

        function onEventRepeatChange() {
            const rep = document.getElementById('event-repeat').value;
            const sync = document.getElementById('event-sync-gcal');
            document.getElementById('event-repeat-until-wrap').classList.toggle('hidden', !rep);
            document.getElementById('event-repeat-hint').classList.toggle('hidden', !rep);
            if (rep) { sync.checked = false; sync.disabled = true; } else { sync.disabled = false; }
        }

        function openEventModal(id = null) {
            markFormClean('event-modal');
            document.getElementById('event-form').reset();
            document.getElementById('event-id').value = '';
            clearImagePreview('event-img-preview', 'event-image-data', 'event-image-file');
            document.getElementById('event-modal-title').innerText = id ? '編輯行程' : '新增行程';

            if (id) {
                const item = state.events.find(e => e.id === id);
                if (item) {
                    if (item.repeat) document.getElementById('event-modal-title').innerText = '編輯行程（整個系列）';
                    document.getElementById('event-id').value = item.id;
                    document.getElementById('event-title').value = item.title;
                    document.getElementById('event-date').value = item.date;
                    document.getElementById('event-time').value = item.time || '';
                    document.getElementById('event-person').value = item.person || '';
                    document.getElementById('event-location').value = item.location || '';
                    selectEventColor(item.color || '#8C2B2B');
                    document.getElementById('event-sync-gcal').checked = !!item.syncGcal;
                    document.getElementById('event-repeat').value = item.repeat || '';
                    document.getElementById('event-repeat-until').value = item.repeatUntil || '';
                    document.getElementById('event-reminder').value = item.reminder || '';
                    setImagePreviewFromData(item.image, 'event-img-preview', 'event-image-data', item.imagePosition);
                }
            } else {
                document.getElementById('event-date').value = state.selectedDate;
                selectEventColor('#8C2B2B');
            }
            onEventRepeatChange();
            openModal('event-modal');
        }

        // 選色器：點擊色塊時更新隱藏欄位並在選中的色塊加上外框，讓使用者看得到目前選了哪個顏色
        function selectEventColor(color) {
            document.getElementById('event-color').value = color;
            document.querySelectorAll('#event-color-picker [data-color-btn]').forEach(btn => {
                const active = btn.dataset.colorBtn === color;
                btn.classList.toggle('ring-2', active);
                btn.classList.toggle('ring-offset-2', active);
                btn.classList.toggle('ring-muji-text', active);
                btn.classList.toggle('scale-110', active);
            });
        }

        function handleSaveEvent(e) {
            e.preventDefault();
            if (!guardDoubleSubmit(e.target)) return;
            const id = document.getElementById('event-id').value || 'e_' + Date.now();
            const title = document.getElementById('event-title').value;
            const date = document.getElementById('event-date').value;
            const time = document.getElementById('event-time').value;
            const person = document.getElementById('event-person').value;
            const location = document.getElementById('event-location').value;
            const color = document.getElementById('event-color').value;
            const image = document.getElementById('event-image-data').value;
            const imagePosition = getImagePosition('event-image-data');
            const repeat = document.getElementById('event-repeat').value;
            const repeatUntil = repeat ? document.getElementById('event-repeat-until').value : '';
            const reminder = document.getElementById('event-reminder').value;
            const syncGcal = !repeat && document.getElementById('event-sync-gcal').checked; // 重複行程不同步到 Google 日曆

            const existingIdx = state.events.findIndex(ev => ev.id === id);
            const prevEv = existingIdx >= 0 ? state.events[existingIdx] : null;
            const prevGcalEventId = existingIdx >= 0 ? state.events[existingIdx].gcalEventId : null;
            const prevImageFileId = existingIdx >= 0 ? state.events[existingIdx].imageFileId : null;
            const eventData = { id, title, date, time, person, location, color, image, imagePosition, syncGcal, repeat, repeatUntil, reminder, gcalEventId: prevGcalEventId || null, gcalCalendarId: prevEv ? prevEv.gcalCalendarId || null : null, gcalCalendarName: prevEv ? prevEv.gcalCalendarName || '' : '', imageFileId: prevImageFileId || null, updatedAt: Date.now() };

            if (existingIdx >= 0) {
                recordUndoAction('events', state.events[existingIdx]);
                state.events[existingIdx] = eventData;
            } else {
                state.events.push(eventData);
            }
            saveState();
            markFormClean('event-modal');
            closeModal('event-modal');
            renderEvents();
            renderTodayHeader();
            syncEventToGcal(eventData);
            syncItemImageToCloud('events', id, prevImageFileId);
        }
