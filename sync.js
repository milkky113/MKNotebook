// 版本：2026-11-23 #1 17:20 呼叫後端改為可走 fetch（登入 token）
        // ================================================================
        // 跨裝置合併同步模組：待辦/隨記/習慣/日記/行程 依每筆 updatedAt 時間戳記比對合併，
        // 較新的留下、較舊的丟棄；只做新增/更新，不處理「跨裝置刪除」同步（避免誤刪，
        // 跟下面 Google日曆拉取的既有邏輯一致），打卡紀錄則用聯集合併（只增不減）
        // ================================================================
        const SYNCABLE_CATEGORIES = ['todos', 'notes', 'habits', 'diaries', 'events'];

        // Sheets 讀回來的資料做型別安全處理：數字欄位轉數字、若曾被Sheets自動判讀成日期物件則轉回原本的文字格式
        function coerceRemoteRecord(remote) {
            const rec = Object.assign({}, remote);
            if ('updatedAt' in rec) rec.updatedAt = Number(rec.updatedAt) || 0;
            if ('completedAt' in rec) rec.completedAt = rec.completedAt ? Number(rec.completedAt) : null;
            if ('weeklyTarget' in rec) rec.weeklyTarget = rec.weeklyTarget ? Number(rec.weeklyTarget) : null;
            if ('tags' in rec) {
                try {
                    const parsed = JSON.parse(rec.tags);
                    rec.tags = Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    rec.tags = [];
                }
            }
            ['completed', 'syncGcal'].forEach(f => { // 試算表可能把布林存成 'TRUE' 字串
                if (f in rec && typeof rec[f] === 'string') rec[f] = rec[f].toLowerCase() === 'true';
            });
            if (typeof rec.date === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(rec.date)) rec.date = getLocalDateStr(new Date(rec.date)); // 舊資料殘留的 ISO 日期
            if ('content' in rec) { // 隨記/日記內文：舊資料是純文字（換行會消失），統一轉成安全的 HTML
                let c = String(rec.content || '');
                if (c && !/<[a-z][\s\S]*>/i.test(c)) c = escapeHtml(c).replace(/\n/g, '<br>');
                rec.content = sanitizeRichHtml(c);
            }
            ['datetime', 'date'].forEach(f => {
                if (rec[f] instanceof Date) {
                    const hh = String(rec[f].getHours()).padStart(2, '0');
                    const mm = String(rec[f].getMinutes()).padStart(2, '0');
                    rec[f] = f === 'date' ? getLocalDateStr(rec[f]) : (getLocalDateStr(rec[f]) + 'T' + hh + ':' + mm);
                }
            });
            delete rec.gcalDirty; delete rec.gcalReadonly; // 這兩個是本機暫態旗標，不接受外部來源
            if (!normalizeRemoteDates(rec)) { remoteBadIds.push(String(rec.id || '?')); return null; } // 日期格式錯誤：略過這筆並彙整提示
            return scrubItem(rec); // 進站消毒（圖片網址／顏色／id）；id 不合格回傳 null
        }

        // 手改試算表常見的日期格式：2026/11/2、2026-11-02 09:30、9:30 → 自動轉成標準格式；轉不了就回傳 false
        let remoteBadIds = [];
        function normalizeRemoteDates(rec) {
            const pad = n => String(n).padStart(2, '0');
            const fixDate = v => { const m = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/.exec(v); return m ? m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) : v; };
            for (const f of ['date', 'repeatUntil']) {
                if (typeof rec[f] !== 'string' || !rec[f]) continue;
                rec[f] = fixDate(rec[f].trim());
                if (!/^\d{4}-\d{2}-\d{2}$/.test(rec[f])) return false;
            }
            if (typeof rec.time === 'string' && rec.time) {
                const m = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(rec.time.trim());
                if (!m) return false;
                rec.time = pad(m[1]) + ':' + m[2];
            }
            if (typeof rec.datetime === 'string' && rec.datetime) {
                const m = /^(\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(rec.datetime.trim());
                if (!m) return false;
                rec.datetime = fixDate(m[1]) + (m[2] !== undefined ? 'T' + pad(m[2]) + ':' + m[3] : '');
            }
            return true;
        }

        function mergeRemoteIntoLocal(localList, remoteList) {
            let changed = false;
            remoteList.forEach(remote => {
                if (!remote || !remote.id) return;
                if (String(remote.id).indexOf('gcal_') === 0) return; // Google 日曆行程由本機即時拉取，不從試算表合併
                const rec = coerceRemoteRecord(remote);
                if (!rec) return;
                const idx = localList.findIndex(item => item.id === rec.id);
                if (idx === -1) {
                    // 在試算表手動新增、已勾選同步 Google 但還沒有 Google 端 id：標記待同步，稍後建立。
                    // 只對「上次同步之後才改過」的列這樣做，避免新裝置第一次拉取時把舊資料全部重建一遍
                    const handAdded = rec.syncGcal && !rec.gcalReadonly && !rec.repeat && !rec.gcalTaskId && !rec.gcalEventId
                        && ('completed' in rec || 'date' in rec) && rec.updatedAt >= (state.lastSyncedAt || Infinity) - 10 * 60 * 1000;
                    if (handAdded) rec.gcalDirty = true;
                    localList.push(rec);
                    changed = true;
                } else if (rec.updatedAt > (Number(localList[idx].updatedAt) || 0)) {
                    const merged = Object.assign({}, localList[idx], rec);
                    // image欄位若雲端這筆是空的、但本機已經有雲端網址，保留本機的，
                    // 避免另一裝置編輯文字時剛好圖片網址還沒同步上去，合併後反而把圖片弄丟
                    if (!rec.image && localList[idx].image) { merged.image = localList[idx].image; if (!rec.imageFileId && localList[idx].imageFileId) merged.imageFileId = localList[idx].imageFileId; }
                    // 已同步 Google 的項目，內容是從試算表（手改或其他裝置）採用來的：標記待同步，稍後推到 Google；
                    // 推完前拉 Google 時不會用舊值蓋回來。gcal_ 開頭的行程不進試算表，不受影響
                    if (merged.syncGcal && (merged.gcalTaskId || merged.gcalEventId) && !merged.gcalReadonly) merged.gcalDirty = 'adopt'; // 'adopt'：推回 Google 前先比對 Google 端是否較新
                    localList[idx] = merged;
                    changed = true;
                }
            });
            return changed;
        }

        async function pullAllDataFromGas(force) {
            const since = force ? 0 : (state.lastSyncedAt || 0); // 手動更新＝完整檢查（含直接在試算表改的內容）；平常只拉這個時間點之後有變動的資料，資料量隨年份累積後能省下不少傳輸量
            const json = await callGasBackend({ action: 'pullAllData', since, force: !!force });
            if (json.unchanged) { // 雲端自上次同步後沒有任何寫入：只推進基準點就好
                state.lastSyncedAt = json.serverTime || Date.now();
                return;
            }
            let changed = false;
            if (force) state.lastFullPullAt = Date.now();
            remoteBadIds = [];

            SYNCABLE_CATEGORIES.forEach(key => {
                if (mergeRemoteIntoLocal(state[key], json[key] || [])) changed = true;
            });
            if (remoteBadIds.length > 0) showToast('試算表有 ' + remoteBadIds.length + ' 筆日期或時間格式錯誤，已略過（' + remoteBadIds.slice(0, 3).join('、') + (remoteBadIds.length > 3 ? '…' : '') + '）', 'error');

            // 套用刪除紀錄（墓碑）：某筆本機資料如果有對應的刪除紀錄、且刪除時間比這筆本機資料的
            // updatedAt還新，代表已在其他裝置被刪除，本機也跟著刪掉；如果本機這筆是「刪除之後才又被編輯過」
            // （updatedAt比刪除時間新），視為使用者後來又動過它，不刪，尊重比較新的那個動作
            const deletions = json.deletions || [];
            if (deletions.length > 0) {
                SYNCABLE_CATEGORIES.forEach(key => {
                    const beforeLen = state[key].length;
                    state[key] = state[key].filter(item => {
                        const tomb = deletions.find(d => d.category === key && String(d.id) === String(item.id));
                        if (!tomb) return true;
                        return Number(tomb.deletedAt) < (Number(item.updatedAt) || 0);
                    });
                    if (state[key].length !== beforeLen) changed = true;
                });

                // 習慣本身被刪除的墓碑，額外連帶清掉本機端這個習慣的所有打卡紀錄；
                // 打卡紀錄是「只增不減」的聯集合併，不會自動跟著習慣一起消失，這裡補上清理
                const deletedHabitIds = deletions.filter(d => d.category === 'habits' && !state.habits.some(h => String(h.id) === String(d.id))).map(d => String(d.id)); // 已從回收桶復原的習慣（本機還在）不清打卡
                if (deletedHabitIds.length > 0) {
                    Object.keys(state.habitLogs).forEach(dateStr => {
                        const beforeLogLen = state.habitLogs[dateStr].length;
                        state.habitLogs[dateStr] = state.habitLogs[dateStr].filter(hid => !deletedHabitIds.includes(String(hid)));
                        if (state.habitLogs[dateStr].length !== beforeLogLen) changed = true;
                    });
                }
            }

            // 打卡紀錄：先套用帶時間戳記的明細（含「取消打卡」），較新者為準；
            // 再補上舊格式（沒有時間戳記）的已打卡紀錄——本機若對這筆有過明確動作（打卡或取消）就不覆蓋
            const logCutoff = new Date(); logCutoff.setDate(logCutoff.getDate() - 730);
            const logCutoffStr = getLocalDateStr(logCutoff); // 超過保留期限的不再拉回（本機開機會清掉，不然會反覆清了又補）
            (json.habitLogOps || []).forEach(op => {
                if (!op || !/^\d{4}-\d{2}-\d{2}$/.test(String(op.date)) || !op.habitId || op.date < logCutoffStr) return;
                const habitId = safeId(op.habitId);
                const key = op.date + '|' + habitId;
                const ru = Number(op.updatedAt) || 0;
                const m = state.habitLogMeta[key];
                if (m && (Number(m.updatedAt) || 0) >= ru) return; // 本機這筆比較新或一樣新
                const done = op.done === true || String(op.done).toLowerCase() === 'true';
                const list = state.habitLogs[op.date] || (state.habitLogs[op.date] = []);
                const at = list.indexOf(habitId);
                if (done && at === -1) { list.push(habitId); changed = true; }
                if (!done && at !== -1) { list.splice(at, 1); changed = true; }
                state.habitLogMeta[key] = { done, updatedAt: ru };
            });
            const remoteHabitLogs = json.habitLogs || {};
            Object.keys(remoteHabitLogs).forEach(dateStr => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || dateStr < logCutoffStr) return;
                if (!state.habitLogs[dateStr]) state.habitLogs[dateStr] = [];
                (remoteHabitLogs[dateStr] || []).forEach(rawId => {
                    const habitId = safeId(rawId);
                    if (state.habitLogMeta[dateStr + '|' + habitId]) return; // 本機有明確紀錄（打卡或取消）就以它為準
                    if (state.habitLogs[dateStr].indexOf(habitId) === -1) {
                        state.habitLogs[dateStr].push(habitId);
                        changed = true;
                    }
                });
            });

            // 不管這次有沒有新資料要合併，都要往前推進同步基準點，下次才不會又從很久以前重新掃一次；
            // 用「伺服器時間」而非本機時間當基準，避免多裝置時鐘誤差造成漏抓或重複抓
            state.lastSyncedAt = json.serverTime || Date.now();
            if (changed) {
                saveState();
                renderAll();
                retryDirtyGcalSync(); // 從試算表採用了已同步 Google 的更新：推回 Google 工作／日曆
            } else {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 存不進去就下次再拉一次，不影響功能 */ }
            }
        }

        // 從 Google Tasks（預設清單）拉回變動並併入本機待辦（只動：標題、到期日、完成狀態）
        // 比對鍵：gcalTaskId。Tasks 的 due 只有日期，所以日期沒變就保留本機原有的時間
        // 注意：這裡只改本機資料、不呼叫 syncTodoToGcalTask，避免「拉回→推回」互相觸發
        async function pullTasksFromGas() {
            const json = await callGasBackend({ action: 'pullTasks', since: state.lastTasksSyncedAt || 0 });
            let changed = false;
            const deletedTodoIds = [];

            // 本機日期是否等於 Task 的 due 日期（相容舊版以 UTC 轉換推送、台北凌晨會少一天的情況）
            const sameDueDate = (datetime, due) => {
                if (!datetime) return !due;
                const localDate = datetime.slice(0, 10);
                let utcDate = localDate;
                try { utcDate = new Date(datetime).toISOString().slice(0, 10); } catch (e) { /* 保持 localDate */ }
                return due === localDate || due === utcDate;
            };

            (json.tasks || []).forEach(task => {
                const idx = state.todos.findIndex(t => t.gcalTaskId === task.id);
                if (task.deleted) {
                    if (idx >= 0) {
                        deletedTodoIds.push(state.todos[idx].id);
                        markItemImageDeletedIfAny(state.todos[idx]);
                        state.todos.splice(idx, 1);
                        changed = true;
                    }
                    return; // 本機沒有的已刪除任務，直接略過，不建立
                }
                if (idx === -1) {
                    if (!task.title) return;
                    if (task.completed && !state.lastTasksSyncedAt) return; // 第一次拉取不匯入歷史上已完成的工作，避免一次灌進大量舊待辦
                    const newTodo = scrubItem({
                        id: 'task_' + task.id, title: task.title,
                        datetime: task.due ? task.due + 'T00:00' : '',
                        person: '', location: '', image: '', imagePosition: 'center',
                        syncGcal: true, tags: [], gcalTaskId: task.id, imageFileId: null,
                        completed: task.completed, completedAt: task.completed ? Date.now() : null,
                        updatedAt: Date.now()
                    });
                    if (newTodo) { newTodo.title = task.title; state.todos.push(newTodo); changed = true; } // 標題保留原樣（顯示時會跳脫）
                    return;
                }
                const item = state.todos[idx];
                if (item.gcalDirty) return; // 本機有還沒送出的編輯，先不覆蓋
                if (task.updated <= (Number(item.updatedAt) || 0)) return; // 本機比較新，以本機為準
                let touched = false;
                if (task.title && item.title !== task.title) { item.title = task.title; touched = true; }
                if (!sameDueDate(item.datetime, task.due)) {
                    item.datetime = task.due ? task.due + 'T00:00' : '';
                    touched = true;
                }
                if (item.completed !== task.completed) {
                    item.completed = task.completed;
                    item.completedAt = task.completed ? Date.now() : null;
                    touched = true;
                }
                if (touched) { item.updatedAt = Date.now(); changed = true; }
            });

            state.lastTasksSyncedAt = json.serverTime || Date.now();
            if (changed) {
                saveState();
                renderAll();
                deletedTodoIds.forEach(id => recordDeletionToGas('todos', id));
            } else {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 下次再拉 */ }
            }
        }

        // Header「立即更新」：一次更新雲端資料、Google 日曆、Google 工作
        let manualRefreshing = false;
        async function refreshAllFromGoogle() {
            if (!IS_GAS || manualRefreshing) return;
            manualRefreshing = true;
            const icon = document.getElementById('manual-refresh-icon');
            if (icon) icon.classList.add('fa-spin');
            try {
                // 先合併雲端資料，再拉日曆與工作（兩者互不影響，可同時進行）
                await pullAllDataFromGas(true); // 手動更新一律完整檢查（含你直接在試算表改的內容）
                const jobs = [pullTasksFromGas()];
                if (state.syncedCalendarIds && state.syncedCalendarIds.length > 0) jobs.push(pullGoogleCalendarEvents());
                const results = await Promise.allSettled(jobs);
                const failed = results.filter(r => r.status === 'rejected');
                if (failed.length > 0) throw failed[0].reason;
                showGasSyncStatus('success', '已更新完成');
                showToast('已更新完成');
            } catch (err) {
                console.error('立即更新失敗', err);
                showGasSyncStatus('error', '更新失敗：' + (err && err.message ? err.message : err));
            } finally {
                manualRefreshing = false;
                if (icon) icon.classList.remove('fa-spin');
            }
        }

        // 從GAS拉取使用者勾選的Google日曆行程，合併進本機events清單
        // 比對規則：用 gcalCalendarId+gcalEventId 當唯一鍵，找到就更新內容、找不到就新增一筆本機行程
        // 也會偵測刪除：查詢範圍內、來自已勾選日曆、但這次Google那邊已經抓不到的行程，視為在Google日曆
        // 端被刪除了，本機一併移除（僅限已勾選讀取的日曆，範圍外或沒勾選讀取的日曆不會被誤判刪除）
        // 已向 Google 抓取過的日期範圍；翻到範圍外的月份時，renderEvents 會呼叫 ensureGcalRangeCovered 補抓
        let gcalCovered = null, gcalPulling = false, gcalLastTryKey = '', gcalLastTryAt = 0;
        async function pullGoogleCalendarEvents(extra) {
            if (gcalPulling) return;
            gcalPulling = true;
            try { await pullGoogleCalendarEventsImpl(extra); } finally { gcalPulling = false; }
        }
        function ensureGcalRangeCovered() {
            if (!IS_GAS || gcalPulling || !gcalCovered || !(state.syncedCalendarIds || []).length) return; // 還沒抓過：由開機那次負責
            const months = [[getValidDateObj(state.selectedDate).getFullYear(), getValidDateObj(state.selectedDate).getMonth()]];
            if (state.miniCal) months.push([state.miniCal.year, state.miniCal.month]);
            let lo = null, hi = null;
            months.forEach(([y, m]) => {
                const a = new Date(y, m, 1); a.setDate(a.getDate() - 7);
                const b = new Date(y, m + 1, 0); b.setDate(b.getDate() + 7);
                if (!lo || a < lo) lo = a;
                if (!hi || b > hi) hi = b;
            });
            const start = getLocalDateStr(lo), end = getLocalDateStr(hi);
            if (start >= gcalCovered.start && end <= gcalCovered.end) return;
            const key = start + '~' + end;
            if (key === gcalLastTryKey && Date.now() - gcalLastTryAt < 60000) return; // 失敗時 1 分鐘內不重試，避免每次重繪都打 Google
            gcalLastTryKey = key; gcalLastTryAt = Date.now();
            pullGoogleCalendarEvents({ start, end }).catch(err => console.error('補抓 Google 日曆失敗', err));
        }

        async function pullGoogleCalendarEventsImpl(extra) {
            if (!IS_GAS) return;
            // 清理本機殘留的 Google 日曆行程：同 id 重複、或所屬日曆已不在勾選清單的，一律移除（有效的下面會重新拉回來）
            const syncedIds = state.syncedCalendarIds || [];
            const seenGcalIds = new Set();
            const beforeCleanCount = state.events.length;
            state.events = state.events.filter(ev => {
                if (String(ev.id).indexOf('gcal_') !== 0) return true;
                if (seenGcalIds.has(ev.id)) return false;
                seenGcalIds.add(ev.id);
                return !!ev.gcalCalendarId && syncedIds.includes(ev.gcalCalendarId);
            });
            const cleaned = state.events.length !== beforeCleanCount;
            if (syncedIds.length === 0) {
                if (cleaned) { saveState(); renderEvents(); renderTodayHeader(); renderMiniCalendars(); }
                return;
            }

            const today = new Date();
            const startD = new Date(today); startD.setDate(startD.getDate() - 7);
            const monthStartD = new Date(today.getFullYear(), today.getMonth(), 1); monthStartD.setDate(monthStartD.getDate() - 7); // 月視圖第一列會帶到上個月的日子
            if (monthStartD < startD) startD.setTime(monthStartD.getTime());
            const endD = new Date(today); endD.setDate(endD.getDate() + 90);
            let startDate = getLocalDateStr(startD);
            let endDate = getLocalDateStr(endD);
            if (extra && extra.start && extra.end) { // 正在看的月份在預設範圍外：合併範圍（超過約一年就只抓正在看的那段）
                const s = extra.start < startDate ? extra.start : startDate, e = extra.end > endDate ? extra.end : endDate;
                if ((new Date(e) - new Date(s)) / 86400000 > 370) { startDate = extra.start; endDate = extra.end; } else { startDate = s; endDate = e; }
            }

            const json = await callGasBackend({
                action: 'pullCalendarEvents',
                calendarIds: state.syncedCalendarIds,
                startDate, endDate
            });

            gcalCovered = { start: startDate, end: endDate };
            const fetched = json.events || [];
            let changed = cleaned;
            // 重複行程：Google 每個實例的 eventId 都一樣，所以用「eventId + 日期 + 時間」當實例鍵；
            // 重複行程只能在 Google 日曆修改（唯讀），避免改一個實例卻動到整個系列
            const instKeyOf = g => g.eventId + (g.isRecurring ? '@' + g.date + (g.time || '') : '');
            const fetchedKeys = new Set(fetched.map(e => e.calendarId + '::' + instKeyOf(e)));
            fetched.forEach(gEv => {
                const instKey = instKeyOf(gEv);
                const idx = state.events.findIndex(e => e.gcalCalendarId === gEv.calendarId && (e.gcalInstanceKey || e.gcalEventId) === instKey);
                if (idx >= 0) {
                    const item = state.events[idx];
                    if (item.gcalDirty) return; // 本機有還沒送出的編輯，不用 Google 的舊值覆蓋
                    // 內容真的有變才更新（否則每次開機都會把全部行程標成「剛改過」而重傳）
                    if (item.title !== gEv.title || item.date !== gEv.date || (item.endDate || '') !== (gEv.endDate || '') || item.time !== gEv.time || item.location !== gEv.location || item.gcalCalendarName !== gEv.calendarName) {
                        item.title = gEv.title;
                        item.date = gEv.date;
                        item.endDate = gEv.endDate || '';
                        item.gcalReadonly = !!(gEv.isRecurring || gEv.endDate);
                        item.time = gEv.time;
                        item.location = gEv.location;
                        item.gcalCalendarName = gEv.calendarName;
                        item.updatedAt = Date.now();
                        changed = true;
                    }
                } else {
                    const ev = scrubItem({
                        id: 'gcal_' + gEv.calendarId + '_' + instKey,
                        title: gEv.title, date: gEv.date, endDate: gEv.endDate || '', time: gEv.time,
                        person: '', location: gEv.location, color: '#2E4057', image: '', imagePosition: 'center',
                        syncGcal: true, gcalEventId: gEv.eventId, gcalCalendarId: gEv.calendarId, gcalCalendarName: gEv.calendarName,
                        gcalInstanceKey: instKey, gcalReadonly: !!(gEv.isRecurring || gEv.endDate), // 多日事件與重複行程一樣唯讀：手帳只有單一日期，回寫會把整段改成一天
                        imageFileId: null, updatedAt: Date.now()
                    });
                    if (ev) { ev.title = gEv.title; ev.location = gEv.location; ev.gcalCalendarName = gEv.calendarName; state.events.push(ev); changed = true; } // 文字欄位保留原樣（顯示時會跳脫）
                }
            });

            const beforeDeleteCount = state.events.length;
            state.events = state.events.filter(ev => {
                if (String(ev.id).indexOf('gcal_') !== 0) return true; // 自己建立的行程不由 Google 端判定刪除（否則會本機消失又被試算表拉回，反覆循環）
                if (ev.gcalDirty) return true; // 有還沒送出的編輯，先保留
                if (!ev.gcalEventId || !ev.gcalCalendarId) return true; // 不是來自日曆同步的，不動
                if (!state.syncedCalendarIds.includes(ev.gcalCalendarId)) return true; // 這個日曆沒勾選讀取，無從判斷，保留
                if (ev.date < startDate || ev.date > endDate) return true; // 不在這次查詢範圍內，避免誤刪
                return fetchedKeys.has(ev.gcalCalendarId + '::' + (ev.gcalInstanceKey || ev.gcalEventId));
            });
            if (state.events.length !== beforeDeleteCount) changed = true;

            if (changed) {
                saveState();
                renderEvents();
                renderTodayHeader();
                renderMiniCalendars();
            }
        }

        // 設定頁：向GAS要目前使用者帳號底下所有日曆清單，畫成勾選框
        async function refreshAvailableCalendars() {
            try {
                showGasSyncStatus('loading', '讀取日曆清單中...');
                const json = await callGasBackend({ action: 'listCalendars' });
                state.availableCalendars = json.calendars || [];
                saveState();
                renderCalendarChecklist();
                showGasSyncStatus('success', "找到 " + state.availableCalendars.length + " 個日曆");
            } catch (err) {
                console.error('讀取日曆清單失敗', err);
                showGasSyncStatus('error', '讀取日曆清單失敗：' + err.message);
            }
        }

        function renderCalendarChecklist() {
            const container = document.getElementById('calendar-checklist-container');
            if (!container) return;
            if (!state.availableCalendars || state.availableCalendars.length === 0) {
                container.innerHTML = "<p class=\"text-xs text-muji-muted\">點擊上方按鈕讀取你的 Google 日曆清單</p>";
                return;
            }
            container.innerHTML = state.availableCalendars.map(c => {
                const checked = (state.syncedCalendarIds || []).includes(c.id);
                return "<label class=\"flex items-center gap-2 py-1 text-xs cursor-pointer\">\n                    <input type=\"checkbox\" value=\"" + escapeHtml(c.id) + "\" " + (checked ? 'checked' : '') + " class=\"calendar-checklist-item rounded text-muji-red focus:ring-muji-red\">\n                    <span class=\"text-muji-text\">" + escapeHtml(c.name) + "</span>\n                </label>";
            }).join('');
        }

        function getCheckedCalendarIds() {
            return Array.from(document.querySelectorAll('.calendar-checklist-item:checked')).map(el => el.value);
        }


        async function syncEventToGcal(eventData) {
            if (eventData && eventData.gcalReadonly) return; // 重複行程唯讀，不回寫 Google
            try {
                if (eventData.syncGcal) {
                    const json = await callGasBackend({
                        action: 'syncCalendarEvent',
                        event: { id: eventData.id, eventId: eventData.gcalEventId, calendarId: eventData.gcalCalendarId || null, title: eventData.title, date: eventData.date, time: eventData.time, location: eventData.location, reminder: eventData.reminder || '', description: eventData.person ? "參與人員：" + eventData.person : '', adoptStamp: eventData.gcalDirty === 'adopt' && eventData.gcalCalendarId && (state.syncedCalendarIds || []).includes(eventData.gcalCalendarId) ? eventData.updatedAt : 0 }
                    });
                    const idx = state.events.findIndex(ev => ev.id === eventData.id);
                    if (json.skipped) { // Google 端在採用的版本之後又改過：不蓋掉，改拉 Google 的版本
                        if (idx >= 0) { delete state.events[idx].gcalDirty; saveLocalOnly(); }
                        if (state.syncedCalendarIds && state.syncedCalendarIds.length > 0) pullGoogleCalendarEvents().catch(err => console.error('Google日曆同步失敗', err));
                        showToast('Google 日曆上的行程較新，已保留 Google 的版本');
                        return;
                    }
                    if (idx >= 0 && state.events[idx].gcalDirty) { delete state.events[idx].gcalDirty; saveLocalOnly(); }
                    const evChanged = idx >= 0 && json.eventId && (state.events[idx].gcalEventId !== json.eventId || (json.calendarId && state.events[idx].gcalCalendarId !== json.calendarId));
                    if (evChanged) { // 只有 id 真的變了才回寫並更新時間，避免多裝置互相推來推去
                        state.events[idx].gcalEventId = json.eventId;
                        if (json.calendarId) state.events[idx].gcalCalendarId = json.calendarId;
                        state.events[idx].updatedAt = Date.now();
                        saveState();
                    }
                    showGasSyncStatus('success', eventData.gcalCalendarName ? "已同步至 " + eventData.gcalCalendarName : '已同步至 MK手帳 日曆');
                } else if (eventData.gcalEventId) {
                    await callGasBackend({ action: 'deleteCalendarEvent', eventId: eventData.gcalEventId, calendarId: eventData.gcalCalendarId || null });
                    const idx = state.events.findIndex(ev => ev.id === eventData.id);
                    if (idx >= 0) { state.events[idx].gcalEventId = null; state.events[idx].updatedAt = Date.now(); saveState(); }
                }
            } catch (err) {
                console.error('Google 日曆同步失敗', err);
                const failedEv = state.events.find(ev => ev.id === eventData.id);
                if (failedEv) { if (!failedEv.gcalDirty) failedEv.gcalDirty = true; saveLocalOnly(); } // 記下「還沒同步成功」，開機與恢復網路時重送
                showGasSyncStatus('error', 'Google 日曆同步失敗：' + err.message);
            }
        }

        const READONLY_EVENT_MSG = 'Google 日曆的重複或多日行程請到 Google 日曆修改';
        function editEvent(id) {
            const ev = state.events.find(e => e.id === id);
            if (ev && ev.gcalReadonly) { showToast(READONLY_EVENT_MSG); return; }
            openEventModal(id);
        }
        async function deleteEvent(id) {
            const evToDelete = state.events.find(e => e.id === id);
            if (evToDelete && evToDelete.gcalReadonly) { showToast(READONLY_EVENT_MSG); return; }
            if (!(await uiConfirm(evToDelete && evToDelete.repeat ? '這是重複行程，刪除會移除整個系列，確定嗎？' : '確定要刪除此行程嗎？', { okText: '刪除', danger: true }))) return;
            const item = state.events.find(e => e.id === id);
            if (item) recordUndoAction('events', item);
            state.events = state.events.filter(e => e.id !== id);
            saveState();
            renderEvents();
            renderTodayHeader();
            const dayModal = document.getElementById('modal-day-events');
            if (dayModal && !dayModal.classList.contains('hidden')) openDayEventsModal(state.selectedDate); // 就地刷新當日清單
            if (item && item.gcalEventId && IS_GAS) {
                enqueueOp({ action: 'deleteCalendarEvent', eventId: item.gcalEventId, calendarId: item.gcalCalendarId || null });
            }
            markItemImageDeletedIfAny(item);
            recordDeletionToGas('events', id, item);
        }

        // SETTINGS & DATA MANAGEMENT MODULE
        function renderLocalStorageUsage() {
            const el = document.getElementById('local-storage-usage');
            if (!el) return;
            const raw = localStorage.getItem(STORAGE_KEY) || '';
            const bytes = new Blob([raw]).size;
            const kb = bytes / 1024;
            const display = kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB';
            // 大部分瀏覽器 localStorage 上限約 5-10MB，抓5MB當概略基準顯示比例僅供參考
            const pct = Math.min(100, Math.round(bytes / (5 * 1024 * 1024) * 100));
            el.innerText = '目前本機資料佔用約 ' + display + '（概略估計，約為5MB上限的 ' + pct + '%）';
        }

        // 設定頁「未儲存」偵測：開啟時記下日曆勾選與地點，關閉時比對
        let settingsSnapshot = null;
        function currentSettingsSig() {
            const city = document.getElementById('weather-city-select');
            const district = document.getElementById('weather-district-select');
            return JSON.stringify([city ? city.value : '', district ? district.value : '', getCheckedCalendarIds().slice().sort()]);
        }
        function settingsIsDirty() { return settingsSnapshot !== null && currentSettingsSig() !== settingsSnapshot; }

        function openSettingsModal() {
            renderWeatherLocationSelects();
            renderCalendarChecklist();
            renderLocalStorageUsage();
            settingsSnapshot = currentSettingsSig();
            const geoStatusEl = document.getElementById('geo-detect-status');
            if (geoStatusEl) geoStatusEl.classList.add('hidden');
            openModal('settings-modal');
        }

        function saveSettings() {
            const newCity = document.getElementById('weather-city-select').value;
            const newDistrict = document.getElementById('weather-district-select').value;
            const locationChanged = (newCity !== state.weatherCity) || (newDistrict !== state.weatherDistrict);
            state.weatherCity = newCity;
            state.weatherDistrict = newDistrict;
            if (locationChanged) {
                // 手動選了縣市/鄉鎮，視為要蓋過舊的GPS定位結果，
                // 否則空品那邊會一直優先用weatherCoords、不會跟著下拉選單切換，跟天氣查詢的地點基準對不起來
                state.weatherCoords = null;
            }
            const newSyncedCalendarIds = (state.availableCalendars && state.availableCalendars.length > 0) ? getCheckedCalendarIds() : (state.syncedCalendarIds || []); // 日曆清單還沒載入（例如剛匯入）時不動原本的勾選
            const calendarSelectionChanged = JSON.stringify(newSyncedCalendarIds.slice().sort()) !== JSON.stringify((state.syncedCalendarIds || []).slice().sort());
            state.syncedCalendarIds = newSyncedCalendarIds;
            saveState();
            settingsSnapshot = null; // 已儲存，關閉時不再詢問
            closeModal('settings-modal');
            if (locationChanged) {
                // 手動改了地點，清快取強制重抓
                state.weatherCache = null;
                state.aqiCache = null;
                refreshWeatherAndAqi(true);
            }
            if (calendarSelectionChanged && state.syncedCalendarIds.length > 0) {
                pullGoogleCalendarEvents().catch(err => console.error('Google日曆同步失敗', err));
            }
        }

        // 請求瀏覽器定位權限，成功後用CWA氣象觀測站反查行政區，帶入手動選單但不自動套用，
        // 需使用者按下方「儲存設定」確認才會真的生效（維持「手動選單永遠優先」的單一邏輯，不做自動/手動雙模式）
        function requestGeolocationAndRefresh() {
            if (!navigator.geolocation) {
                uiAlert('此瀏覽器不支援定位功能，請手動輸入縣市/鄉鎮。');
                return;
            }
            const statusEl = document.getElementById('geo-detect-status');
            if (statusEl) { statusEl.classList.remove('hidden'); statusEl.innerText = '定位中...'; }
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                    try {
                        const result = await callGasBackend({ action: 'cwaWeather' });
                        const stations = normalizeCwaStations(result.data?.records?.Station);
                        // 反查行政區：不限定縣市/鄉鎮，直接找離目前座標最近的氣象觀測站
                        const nearest = stations
                            .map(s => ({ ...s, dist: haversineDistanceKm(coords.lat, coords.lon, s.lat, s.lon) }))
                            .sort((a, b) => a.dist - b.dist)[0];
                        if (!nearest || !nearest.city || !nearest.township) {
                            if (statusEl) statusEl.innerText = '定位成功，但反查行政區失敗，請手動選擇。';
                            return;
                        }
                        const citySel = document.getElementById('weather-city-select');
                        if (citySel) citySel.value = nearest.city;
                        renderWeatherDistrictSelect(nearest.city, nearest.township);
                        if (statusEl) statusEl.innerText = "定位到：" + nearest.city + nearest.township + "，請按下方「儲存設定」確認";
                    } catch (err) {
                        console.error('定位反查失敗', err);
                        if (statusEl) statusEl.innerText = '反查行政區失敗：' + err.message;
                    }
                },
                (err) => {
                    console.error('定位失敗', err);
                    if (statusEl) { statusEl.classList.remove('hidden'); statusEl.innerText = '定位失敗或被拒絕，請手動選擇縣市/鄉鎮。'; }
                },
                { timeout: 8000 }
            );
        }

        // 同步基準點屬於「這台裝置」的狀態，不該跟著備份檔走：
        // 否則匯入舊檔後，匯入的項目 updatedAt 都比 lastBackupAt 舊，增量備份就不會把它們送上雲端
        const SYNC_CURSORS = ['lastBackupAt', 'lastSyncedAt', 'lastTasksSyncedAt', 'lastFullPullAt'];
        const EXPORT_EXCLUDE_KEYS = ['weatherCoords', 'availableCalendars', 'weatherCache', 'aqiCache', 'epaStationCache', 'quoteCache', 'activeTab', 'selectedDate', 'pendingOps', 'schemaV4'];

        // 匯入檔只收「已知欄位」，並逐筆消毒；其他未知欄位一律丟掉（不信任檔案內容）
        function sanitizeImportedState(imp) {
            const out = {};
            ['todos', 'notes', 'habits', 'diaries', 'events'].forEach(k => { if (k in imp) out[k] = scrubList(imp[k]); });
            ['todos', 'notes', 'diaries'].forEach(k => { (out[k] || []).forEach(x => { if (x.content) x.content = sanitizeRichHtml(x.content); }); });
            if (out.events) out.events = out.events.filter(e => String(e.id).indexOf('gcal_') !== 0); // Google 日曆行程開機時會重拉，不收匯入檔的
            ['todos', 'events'].forEach(k => { (out[k] || []).forEach(x => { delete x.gcalDirty; delete x.gcalReadonly; }); }); // 暫態旗標不接受外部來源
            if (imp.habitLogs) {
                out.habitLogs = {};
                Object.keys(imp.habitLogs).forEach(d => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Array.isArray(imp.habitLogs[d])) out.habitLogs[d] = imp.habitLogs[d].map(safeId);
                });
            }
            if ('isDarkMode' in imp) out.isDarkMode = !!imp.isDarkMode;
            if (Array.isArray(imp.syncedCalendarIds)) out.syncedCalendarIds = imp.syncedCalendarIds.map(safeId);
            ['weatherCity', 'weatherDistrict'].forEach(k => { if (typeof imp[k] === 'string') out[k] = stripUnsafeChars(imp[k]).slice(0, 30); });
            if (['timeline', 'photowall'].includes(imp.diaryViewMode)) out.diaryViewMode = imp.diaryViewMode;
            if (['day', 'week', 'month'].includes(imp.calView)) out.calView = imp.calView;
            return out;
        }

        function exportDataJSON(namePart) {
            // 匯出備份只含手帳資料：不含同步基準點、快取、GPS 座標與待送佇列
            const exportState = Object.assign({}, state);
            SYNC_CURSORS.forEach(k => delete exportState[k]);
            EXPORT_EXCLUDE_KEYS.forEach(k => delete exportState[k]); // 快取與定位座標不屬於使用者資料
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportState, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "mk_notebook_" + (namePart || "backup") + "_" + getLocalDateStr(new Date()) + ".json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        }

        function triggerImportJSON() {
            document.getElementById('import-json-file').click();
        }

        // 匯入前檢查基本欄位型別，避免結構不對的檔案把 APP 弄壞
        function isValidBackupData(data) {
            if (!data || typeof data !== 'object') return false;
            const arrayFields = ['todos', 'notes', 'habits', 'diaries', 'events'];
            for (const field of arrayFields) {
                if (field in data && !Array.isArray(data[field])) return false;
            }
            if ('habitLogs' in data && (typeof data.habitLogs !== 'object' || Array.isArray(data.habitLogs))) return false;
            return true;
        }

        function importDataJSON(input) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    if (!isValidBackupData(imported)) {
                        uiAlert('匯入失敗：檔案格式不符合手帳備份格式。');
                        return;
                    }
                    const ok = await uiConfirm('匯入會取代目前這台裝置上的手帳資料。\n匯入前會先自動下載一份目前資料的備份檔。\n\n⚠️ 只匯入你自己從這個手帳匯出的檔案，來路不明的檔案請不要匯入。\n（行程若帶有 Google 日曆關聯，匯入後會沿用原本的關聯。）\n\n確定要匯入嗎？', { okText: '匯入' });
                    input.value = ''; // 讓同一個檔案之後還能再選一次
                    if (!ok) return;
                    exportDataJSON('before_import');
                    state = Object.assign(state, sanitizeImportedState(imported));
                    SYNC_CURSORS.forEach(k => { state[k] = 0; }); // 歸零：下次備份／同步做全量，匯入的資料才會上雲端
                    saveState();
                    applyDarkModeUI();
                    renderAll();
                    closeModal('settings-modal');
                } catch(err) {
                    console.error("無效的 JSON 檔案", err);
                    uiAlert('匯入失敗：無法解析此 JSON 檔案。');
                }
            };
            reader.readAsText(file);
        }

        async function clearAllData() {
            const msg = IS_GAS
                ? '只會清除這台裝置上的本機資料，Google 試算表裡的雲端資料不會被刪除，重新開啟後會自動同步回來。\n\n確定要清除本機資料嗎？'
                : '確定要清除本機手帳資料嗎？此動作無法復原。';
            if (!(await uiConfirm(msg, { okText: '清除', danger: true }))) return;
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }

        // 加 debounce：連續操作(1.5秒內)只送最後一次，避免頻繁打 API
        let gasSyncTimer = null;
        // 只送「上次成功備份之後有變動」的項目（後端是 upsert，不依賴整份 state，送子集是安全的）。
        // 沒有 updatedAt 的舊資料一律視為有變動；首次（lastBackupAt=0）等於全量備份。
        function buildBackupPayload() {
            const since = state.lastBackupAt || 0;
            const pick = list => (list || []).filter(x => !x.updatedAt || x.updatedAt >= since);
            const cloudCutoff = Date.now() - TODO_CLOUD_ARCHIVE_DAYS * 86400000;
            const todosToSend = pick(state.todos).filter(t => !(t.completed && t.completedAt && t.completedAt < cloudCutoff));
            // 還沒上傳完成的 Base64 圖片不送（體積大、容易超過單次呼叫上限），上傳成功換成網址後會再備份一次
            const noBase64 = x => (x.image && String(x.image).indexOf('data:') === 0) ? Object.assign({}, x, { image: '' }) : x;
            // Google 日曆拉回來的行程（id 以 gcal_ 開頭）不進試算表：每次開機會即時重拉，存了只會造成重複與過期資料
            const ownEvents = pick(state.events).filter(e => String(e.id).indexOf('gcal_') !== 0);
            return {
                todos: todosToSend.map(noBase64), notes: pick(state.notes).map(noBase64), habits: pick(state.habits),
                diaries: pick(state.diaries).map(noBase64), events: ownEvents.map(noBase64), habitLogs: since ? {} : state.habitLogs, // 舊版打卡路徑只在全量備份時送，否則手動刪掉的打卡列會被補回
                habitLogOps: Object.keys(state.habitLogMeta || {}).filter(k => (state.habitLogMeta[k].updatedAt || 0) >= since).map(k => {
                    const [date, habitId] = k.split('|');
                    return { date, habitId, done: !!state.habitLogMeta[k].done, updatedAt: state.habitLogMeta[k].updatedAt };
                })
            };
        }

        let gasBackupRetries = 0;
        let lastBackupLogsSig = null; // 上次成功備份的打卡紀錄快照（只存在記憶體，重新開啟頁面後第一次一定會備份）
        function syncToGas() {
            clearTimeout(gasSyncTimer);
            gasSyncTimer = setTimeout(() => {
                gasSyncTimer = null;
                const startedAt = Date.now(); // 用「送出前」的時間當基準，送出期間的新修改下次會再送
                const payload = buildBackupPayload();
                const logsSig = JSON.stringify(payload.habitLogs);
                const nothingNew = ['todos', 'notes', 'habits', 'diaries', 'events', 'habitLogOps'].every(k => payload[k].length === 0);
                if (nothingNew && logsSig === lastBackupLogsSig) { gasBackupRetries = 0; return; } // 沒有任何新變動，不打後端
                callGasBackend({ action: 'backupSheets', state: payload })
                    .then((res) => {
                        gasBackupRetries = 0;
                        lastBackupLogsSig = logsSig;
                        state.lastBackupAt = startedAt;
                        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 存不進去下次再送一次而已 */ }
                        showGasSyncStatus('success', '已備份至 Google Sheets');
                        // 存檔後提示（不擋這次寫入）：後端偵測到雲端某幾筆的updatedAt比這次送出的還新，
                        // 代表被別的裝置搶先同步過、這次寫入蓋掉了它，事後告知使用者去對一下
                        if (res.conflicts && res.conflicts.length > 0) {
                            // 後端已保留較新的版本、沒有被覆蓋：提示一聲並重新拉一次，讓本機跟雲端一致
                            showToast('其他裝置有較新的版本（' + res.conflicts.length + ' 筆），已保留較新版本並重新同步');
                            pullAllDataFromGas(true).catch(err => console.error('衝突後重新同步失敗', err));
                        }
                    })
                    .catch(err => {
                        console.error('GAS Sync Error', err);
                        showGasSyncStatus('error', '備份失敗，稍後自動重試：' + err.message);
                        // 基準時間不前進，失敗的內容下次會一併重送；最多重試5次（間隔 30 秒起遞增）
                        if (gasBackupRetries < 5) { gasBackupRetries++; setTimeout(syncToGas, 30000 * gasBackupRetries); }
                    });
            }, 1500);
        }
        window.addEventListener('online', syncToGas); // 網路恢復時補送離線期間的修改

        // 統一的後端呼叫工具：回傳解析後的 JSON（失敗會 reject）。傳輸方式依 MK_API_URL 決定（見 core）
        function callGasBackend(payload) {
            if (!IS_GAS) return Promise.reject(new Error('非 GAS 環境'));
            showGasSyncStatus('loading', '同步中...');
            return (MK_API_URL ? callViaFetch(payload) : callViaGoogleScript(payload))
                .then(json => {
                    if (!json.success) throw new Error(json.error || '未知錯誤');
                    showGasSyncStatus('success', '同步完成');
                    return json;
                })
                .catch(err => {
                    showGasSyncStatus('error', '同步失敗：' + err.message);
                    throw err;
                });
        }

        function callViaGoogleScript(payload) {
            return new Promise((resolve, reject) => {
                google.script.run
                    .withSuccessHandler(text => { try { resolve(JSON.parse(text)); } catch (err) { reject(err); } })
                    .withFailureHandler(err => reject(new Error(err && err.message ? err.message : String(err))))
                    .api(JSON.stringify(payload));
            });
        }

        // ------------------------------------------------------------------
        // GitHub Pages 版：fetch 呼叫 GAS doPost。token 存 localStorage，閒置 8 小時失效（後端每次回傳新 token 順延）
        // 必須用 text/plain（簡單請求，不觸發 CORS 預檢，GAS 不支援預檢）；GAS 會 302 轉址，fetch 預設跟隨即可
        // ------------------------------------------------------------------
        const MK_TOKEN_KEY = 'MK_NOTEBOOK_TOKEN_V1'; // github.io 同帳號所有專案共用 localStorage，所以鍵名要獨特
        const MK_TOKEN_TTL_MS = 8 * 3600e3;
        const MK_FETCH_TIMEOUT_MS = 90000;

        function readToken() {
            try {
                const t = JSON.parse(localStorage.getItem(MK_TOKEN_KEY) || 'null');
                return t && t.token && t.exp > Date.now() ? t.token : '';
            } catch (err) { return ''; }
        }
        function saveToken(token) {
            try { localStorage.setItem(MK_TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + MK_TOKEN_TTL_MS })); } catch (err) { /* 無痕模式等無法儲存：下次呼叫會再要求登入 */ }
        }
        function clearToken() {
            try { localStorage.removeItem(MK_TOKEN_KEY); } catch (err) { /* ignore */ }
        }

        async function postToApi(body) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), MK_FETCH_TIMEOUT_MS);
            try {
                const res = await fetch(MK_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), credentials: 'omit', signal: ctrl.signal });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.json();
            } catch (err) {
                throw new Error(err.name === 'AbortError' ? '連線逾時' : err.message);
            } finally {
                clearTimeout(timer);
            }
        }

        async function callViaFetch(payload) {
            for (let attempt = 0; attempt < 2; attempt++) {
                if (!readToken()) await requireLogin();
                const json = await postToApi(Object.assign({ token: readToken() }, payload));
                if (json.auth === false) { clearToken(); continue; } // token 過期或密碼已更改：重新登入後重送一次
                if (json.token) saveToken(json.token);
                return json;
            }
            throw new Error('登入失效，請重新登入');
        }

        // 多個呼叫同時發現沒 token 時共用同一個登入視窗，登入成功後一起繼續
        let loginPending = null, loginResolve = null;
        function requireLogin() {
            if (!loginPending) loginPending = new Promise(resolve => { loginResolve = () => { loginPending = null; resolve(); }; });
            document.getElementById('login-overlay').classList.add('open');
            setTimeout(() => document.getElementById('login-password').focus(), 50);
            return loginPending;
        }

        async function submitLogin(e) {
            e.preventDefault();
            const input = document.getElementById('login-password');
            const msg = document.getElementById('login-msg');
            const btn = document.getElementById('login-submit');
            btn.disabled = true;
            msg.textContent = '';
            try {
                const json = await postToApi({ action: 'login', pw: input.value });
                if (json.success && json.token) {
                    saveToken(json.token);
                    input.value = '';
                    document.getElementById('login-overlay').classList.remove('open');
                    if (loginResolve) loginResolve();
                } else {
                    msg.textContent = json.error || '登入失敗';
                }
            } catch (err) {
                msg.textContent = '連線失敗：' + err.message;
            } finally {
                btn.disabled = false;
            }
        }

        function logoutWeb() {
            clearToken();
            location.reload();
        }

        // 刪除紀錄（墓碑）：待辦/隨記/習慣/日記/行程被刪除時立刻記一筆，不等debounce（比較急，
        // 避免另一台裝置在這筆紀錄送達前就已經開機合併過，錯過這次刪除同步的時機）
        // 刪除當下的完整快照（回收桶復原用）：未上傳的 Base64 圖片不存（容量），並標記 _imageLost
        function buildTrashSnapshot(item, extra) {
            if (!item) return '';
            try {
                const copy = JSON.parse(JSON.stringify(item));
                if (extra) Object.assign(copy, extra);
                if (copy.image && String(copy.image).indexOf('data:') === 0) { copy.image = ''; copy.imageFileId = null; copy._imageLost = true; }
                let s = JSON.stringify(copy);
                if (s.length > 48000) { copy.image = ''; copy._imageLost = true; s = JSON.stringify(copy); }
                return s.length > 48000 ? '' : s;
            } catch (e) { return ''; }
        }

        function recordDeletionToGas(category, id, item, extra) {
            enqueueOp({ action: 'recordDeletion', category, id, snapshot: buildTrashSnapshot(item, extra), deletedAt: Date.now() }); // 帶上「按下刪除的當下」時間，離線補送時墓碑時間才不會被拖晚
        }

        // ------------------------------------------------------------------
        // 待送佇列：刪除紀錄、刪 Google 工作／日曆活動、標記雲端圖片刪除這些「副作用」，先存進本機（state.pendingOps），
        // 送成功才移除；離線或失敗時，開機與恢復網路會自動重送（這些動作重送是安全的）
        // ------------------------------------------------------------------
        let flushingOps = false, flushTimer = null;
        function enqueueOp(op) {
            if (!IS_GAS) return;
            state.pendingOps.push({ id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), op, tries: 0, createdAt: Date.now() });
            saveLocalOnly();
            flushPendingOps();
        }
        async function flushPendingOps() {
            if (!IS_GAS || flushingOps || !state.pendingOps || state.pendingOps.length === 0) return;
            flushingOps = true;
            let failed = false;
            try {
                for (const entry of state.pendingOps.slice()) {
                    try {
                        await callGasBackend(entry.op);
                        state.pendingOps = state.pendingOps.filter(e => e.id !== entry.id);
                    } catch (err) {
                        failed = true;
                        if (navigator.onLine !== false) entry.tries = (entry.tries || 0) + 1; // 離線造成的失敗不算次數
                        if (entry.tries >= 5) { // 連續被後端拒絕 5 次：放棄這筆，避免卡住後面的
                            console.error('待送動作放棄', entry.op.action, err);
                            showToast('有一筆雲端同步動作（' + entry.op.action + '）多次失敗，已放棄：' + (err && err.message ? err.message : err), 'error');
                            state.pendingOps = state.pendingOps.filter(e => e.id !== entry.id);
                            failed = state.pendingOps.length > 0;
                            continue;
                        }
                        break; // 保持順序，等下一輪再試
                    }
                }
            } finally {
                flushingOps = false;
                saveLocalOnly();
            }
            if (failed && !flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushPendingOps(); }, 60000);
        }

        // 上次 Google 工作／日曆同步失敗的項目（gcalDirty）：重送最新版本
        const dirtyRetrying = new Set(); // 同一筆同時只重送一次（開機時會從兩個地方呼叫）
        function retryDirtyGcalSync() {
            if (!IS_GAS) return;
            state.todos.filter(t => t.gcalDirty && !dirtyRetrying.has(t.id)).forEach(t => { dirtyRetrying.add(t.id); syncTodoToGcalTask(t).finally(() => dirtyRetrying.delete(t.id)); });
            state.events.filter(e => e.gcalDirty && !e.gcalReadonly && !dirtyRetrying.has(e.id)).forEach(e => { dirtyRetrying.add(e.id); syncEventToGcal(e).finally(() => dirtyRetrying.delete(e.id)); });
        }
        window.addEventListener('online', () => { flushPendingOps(); retryDirtyGcalSync(); });

        // ================================================================
        // 回收桶：資料來自試算表「刪除紀錄」分頁的 snapshot 欄（跨裝置共用，保留30天）
        // ================================================================
        const TRASH_CATEGORY_LABEL = { todos: '待辦', notes: '隨記', habits: '習慣', diaries: '日記', events: '行程' };
        let trashItems = [];
        let trashFilter = 'all';

        function toggleHeaderMenu(ev) {
            ev.stopPropagation();
            document.getElementById('header-more-menu').classList.toggle('hidden');
        }
        function closeHeaderMenu() {
            const m = document.getElementById('header-more-menu');
            if (m) m.classList.add('hidden');
        }
        document.addEventListener('click', closeHeaderMenu);

        function openTrashModal() {
            openModal('trash-modal');
            loadTrash();
        }

        async function loadTrash() {
            const box = document.getElementById('trash-list');
            if (box) box.innerHTML = '<p class="text-xs text-muji-muted">讀取中...</p>';
            try {
                const json = await callGasBackend({ action: 'listTrash' });
                trashItems = (json.items || []).map(r => {
                    try { r.data = JSON.parse(r.snapshot); } catch (e) { r.data = null; }
                    return r;
                }).filter(r => r.data && TRASH_CATEGORY_LABEL[r.category]);
                renderTrash();
            } catch (err) {
                if (box) box.innerHTML = '<p class="text-xs text-muji-red">讀取失敗：' + escapeHtml(err.message) + '</p>';
            }
        }

        function setTrashFilter(cat) {
            trashFilter = cat;
            renderTrash();
        }

        function renderTrash() {
            const box = document.getElementById('trash-list');
            const bar = document.getElementById('trash-filter-bar');
            if (!box || !bar) return;
            const cats = ['all'].concat(Object.keys(TRASH_CATEGORY_LABEL));
            bar.innerHTML = cats.map(c => {
                const active = c === trashFilter;
                const label = c === 'all' ? '全部' : TRASH_CATEGORY_LABEL[c];
                return '<button onclick="setTrashFilter(\'' + c + '\')" class="text-xs px-2 py-1 rounded border ' + (active ? 'bg-muji-text text-white border-muji-text' : 'border-muji-border text-muji-muted') + '">' + label + '</button>';
            }).join('');
            const rows = trashItems.map((r, i) => ({ r, i })).filter(x => trashFilter === 'all' || x.r.category === trashFilter);
            if (rows.length === 0) {
                box.innerHTML = '<p class="text-xs text-muji-muted">回收桶是空的</p>';
                return;
            }
            box.innerHTML = rows.map(({ r, i }) => {
                const d = r.data;
                const title = (d.icon ? d.icon + ' ' : '') + (d.title || stripHtmlForTrash(d.content) || '（無標題）');
                const when = new Date(Number(r.deletedAt)).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                const note = d._imageLost ? '<span class="text-muji-red">（圖片未上傳雲端，無法復原）</span>' : '';
                return '<div class="border border-muji-border rounded p-2 space-y-1">'
                    + '<div class="text-xs text-muji-muted">' + TRASH_CATEGORY_LABEL[r.category] + ' · 刪除於 ' + when + ' ' + note + '</div>'
                    + '<div class="text-sm break-words">' + escapeHtml(title.slice(0, 80)) + '</div>'
                    + '<div class="flex space-x-2 pt-1">'
                    + '<button onclick="restoreTrashItem(' + i + ')" class="text-xs px-2 py-1 rounded border border-muji-border">復原</button>'
                    + '<button onclick="purgeTrashItem(' + i + ')" class="text-xs px-2 py-1 rounded border border-muji-border text-muji-red">永久刪除</button>'
                    + '</div></div>';
            }).join('');
        }

        function stripHtmlForTrash(html) {
            return html ? String(html).replace(/<[^>]*>/g, '').trim() : '';
        }

        function clearTrashOnServer(list) {
            return callGasBackend({ action: 'clearTrashSnapshots', items: list.map(r => ({ id: r.id, category: r.category })) });
        }

        async function restoreTrashItem(i) {
            const r = trashItems[i];
            if (!r) return;
            const cat = r.category;
            const item = scrubItem(r.data);
            if (!item) { showToast('這筆資料格式不正確，無法復原', 'error'); return; }
            const logDates = ((r.data && r.data.__logDates) || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d)));
            delete item.__logDates;
            delete item._imageLost;
            if (typeof item.content === 'string') item.content = sanitizeRichHtml(item.content); // 回收桶快照可能被竄改，復原前一律消毒內文
            // 蓋上新的時間戳記，贏過刪除紀錄（墓碑）與其他裝置的舊資料
            item.updatedAt = Date.now();
            if (cat === 'todos') item.gcalTaskId = null; // 原Google工作已被刪，復原後重新建立
            if (!state[cat].some(x => x.id === item.id)) state[cat].push(item);
            if (cat === 'habits') {
                logDates.forEach(dateStr => {
                    if (!state.habitLogs[dateStr]) state.habitLogs[dateStr] = [];
                    if (!state.habitLogs[dateStr].includes(item.id)) state.habitLogs[dateStr].push(item.id);
                    state.habitLogMeta[dateStr + '|' + item.id] = { done: true, updatedAt: Date.now() };
                });
            }
            saveState();
            renderAll();
            if (item.imageFileId) callGasBackend({ action: 'unmarkImageDeleted', fileId: item.imageFileId }).catch(err => console.error('還原雲端圖片標記失敗', err));
            if (item.syncGcal) {
                if (cat === 'todos') syncTodoToGcalTask(item);
                else if (cat === 'events') syncEventToGcal(item);
            }
            trashItems.splice(i, 1);
            renderTrash();
            try { await clearTrashOnServer([r]); } catch (err) { console.error('清除回收桶快照失敗', err); }
        }

        async function purgeTrashItem(i) {
            const r = trashItems[i];
            if (!r || !(await uiConfirm('永久刪除後無法復原，確定嗎？', { okText: '永久刪除', danger: true }))) return;
            trashItems.splice(i, 1);
            renderTrash();
            try { await clearTrashOnServer([r]); } catch (err) { console.error('清除回收桶快照失敗', err); }
        }

        async function emptyTrash() {
            if (trashItems.length === 0 || !(await uiConfirm('清空回收桶後全部無法復原，確定嗎？', { okText: '清空', danger: true }))) return;
            const all = trashItems.slice();
            trashItems = [];
            renderTrash();
            try { await clearTrashOnServer(all); } catch (err) { console.error('清空回收桶失敗', err); }
        }

        // 常駐同步狀態指示燈：疊在 header「立即更新」鈕右上角，跟 settings-modal 內的文字狀態分開，
        // 不用打開設定頁也能一眼看出目前雲端同步是否正常；滑過按鈕可看到最近一次狀態文字
        function updateGlobalSyncDot(kind, text) {
            const dot = document.getElementById('global-sync-dot');
            const btn = document.getElementById('manual-refresh-btn');
            if (!dot || !btn) return;
            // 紅＝異常、黃（赭）＝處理中、藍（藍灰）＝完成
            const colorMap = { loading: ['#A66E38', ' animate-pulse'], success: ['#2E4057', ''], error: ['#8C2B2B', ''] };
            const cm = colorMap[kind] || colorMap.loading;
            dot.className = 'absolute right-1.5 top-1.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-[#2D2A27]' + cm[1] + (IS_GAS ? '' : ' hidden');
            dot.style.backgroundColor = cm[0];
            btn.title = '立即更新｜' + (text || (kind === 'success' ? '已同步至雲端' : kind === 'error' ? '同步發生問題' : '同步中...'));
        }

        let gasStatusHideTimer = null;
        function showGasSyncStatus(kind, text) {
            updateGlobalSyncDot(kind, text);
            if (kind === 'error') { // 設定頁沒開時使用者看不到狀態列，錯誤另外用提示條告知（10 秒內不重複）
                const nowT = Date.now();
                if (nowT - (showGasSyncStatus._lastToast || 0) > 10000) { showGasSyncStatus._lastToast = nowT; showToast(text, 'error'); }
            }
            const el = document.getElementById('gas-sync-status');
            if (!el) return;
            clearTimeout(gasStatusHideTimer);
            el.classList.remove('hidden');
            const iconMap = { loading: 'fa-circle-notch fa-spin text-muji-muted', success: 'fa-circle-check text-muji-olive', error: 'fa-circle-exclamation text-muji-red' };
            el.innerHTML = "<i class=\"fa-solid " + (iconMap[kind] || iconMap.loading) + "\"></i><span>" + escapeHtml(text) + "</span>";
            if (kind !== 'loading') {
                gasStatusHideTimer = setTimeout(() => el.classList.add('hidden'), 4000);
            }
        }

        // ================================================================
        // 雲端圖片模組：待辦/隨記/日記/行程 圖片改上傳至 Google Drive，
        // 本機仍先用 Base64 立即顯示（離線也能用），有網路+已設定GAS時才在背景上傳並換成雲端網址
        // ================================================================
        const IMAGE_CATEGORY_STATE_KEY = { todo: 'todos', notes: 'notes', diary: 'diaries', events: 'events' };
        const IMAGE_CATEGORY_LABEL = { todo: '待辦照片', notes: '備忘照片', diary: '日記照片', events: '行程照片' };

        function findItemById(category, id) {
            const key = IMAGE_CATEGORY_STATE_KEY[category];
            return key ? state[key].find(x => x.id === id) : null;
        }

        function updateItemImageField(category, id, url, fileId) {
            const item = findItemById(category, id);
            if (!item) return;
            item.image = url || '';
            item.imageFileId = fileId || null;
            item.updatedAt = Date.now();
            saveState();
            // 依類型刷新對應畫面，讓圖片從本機預覽無縫換成雲端網址
            if (category === 'todo') renderTodos();
            else if (category === 'notes') renderNotes();
            else if (category === 'diary') renderDiaries();
            else if (category === 'events') renderEvents();
        }

        // 離線時新增的圖片只會存成本機Base64（連不上GAS），恢復連線後不會自動補傳，
        // 這裡開機時、以及瀏覽器偵測到重新連上網路時，掃一輪「本機有Base64但雲端還沒有」的圖片自動補傳
        async function retryPendingImageUploads() {
            // 序列化逐張上傳（而非同時併發全部送出）：離線圖片一多時同時打十幾個 uploadImage 請求，
            // GAS 是單執行緒＋LockService排隊，容易互相卡住甚至逾時；個人使用量體下慢一點點沒關係，穩定優先
            const categories = [
                { key: 'todos', cat: 'todo' },
                { key: 'notes', cat: 'notes' },
                { key: 'diaries', cat: 'diary' },
                { key: 'events', cat: 'events' }
            ];
            for (const { key, cat } of categories) {
                for (const item of state[key]) {
                    if (item.image && item.image.indexOf('data:image') === 0) {
                        await syncItemImageToCloud(cat, item.id, item.imageFileId).catch(err => console.error('離線圖片補傳失敗', err));
                    }
                }
            }
        }
        window.addEventListener('online', retryPendingImageUploads);

        // 存檔後呼叫：如果是全新的本機圖片（Base64）就上傳；如果使用者把圖片清空了，就把雲端舊檔標記刪除
        const imageUploadsInFlight = new Set(); // 同一張圖只讓一個上傳流程在跑（儲存、開機補傳、網路恢復可能同時觸發）
        async function syncItemImageToCloud(category, itemId, prevImageFileId) {
            const flightKey = category + ':' + itemId;
            if (imageUploadsInFlight.has(flightKey)) return;
            imageUploadsInFlight.add(flightKey);
            try { return await doSyncItemImageToCloud(category, itemId, prevImageFileId); }
            finally { imageUploadsInFlight.delete(flightKey); }
        }
        async function doSyncItemImageToCloud(category, itemId, prevImageFileId) {
            const item = findItemById(category, itemId);
            if (!item) return;

            if (item.image && item.image.startsWith('data:image')) {
                try {
                    const json = await callGasBackend({
                        action: 'uploadImage',
                        category,
                        id: item.id,
                        label: IMAGE_CATEGORY_LABEL[category] || '照片',
                        dataUrl: item.image
                    });
                    if (json.success && json.url) {
                        updateItemImageField(category, itemId, json.url, json.fileId);
                        // 換照片時，舊的雲端檔案標記刪除（不真刪，檔名加 _DELETED_ 方便你之後手動清理）
                        if (prevImageFileId && prevImageFileId !== json.fileId) {
                            enqueueOp({ action: 'markImageDeleted', fileId: prevImageFileId });
                        }
                        showGasSyncStatus('success', '圖片已上傳至雲端');
                    }
                } catch (err) {
                    console.error('圖片上傳雲端失敗', err);
                    showGasSyncStatus('error', '圖片上傳失敗：' + err.message);
                }
            } else if (!item.image && prevImageFileId) {
                // 使用者把圖片清空了，標記舊雲端檔案刪除
                enqueueOp({ action: 'markImageDeleted', fileId: prevImageFileId });
                updateItemImageField(category, itemId, '', null);
            }
        }

        // 項目整筆刪除時呼叫：標記對應雲端圖片刪除
        function markItemImageDeletedIfAny(item) {
            if (item && item.imageFileId && IS_GAS) {
                enqueueOp({ action: 'markImageDeleted', fileId: item.imageFileId });
            }
        }

        // GLOBAL SEARCH MODULE
        function toggleSearch() {
            const container = document.getElementById('search-bar-container');
            container.classList.toggle('hidden');
            if (!container.classList.contains('hidden')) {
                document.getElementById('global-search-input').focus();
            }
        }

        // 輸入時加 debounce，中文輸入法連續打字不會每個字都全資料掃描一次
        let searchDebounceTimer = null;
        function handleSearch() {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(executeSearch, 250);
        }

        function executeSearch() {
            const query = document.getElementById('global-search-input').value.trim().toLowerCase();
            const resultsEl = document.getElementById('search-results');
            if (!query) {
                resultsEl.classList.add('hidden');
                resultsEl.innerHTML = '';
                return;
            }

            // 比對前先濾掉零寬字元，避免關鍵字剛好橫跨樣式標籤邊界時搜尋不到
            const match = (str) => (str || '').toLowerCase().includes(query);
            const matchTags = (tags) => (tags || []).some(t => getTagText(t).toLowerCase().includes(query));
            const plain = (h) => String(h || '').replace(/<[^>]*>/g, ' '); // 內文是 HTML，先去掉標籤再比對，避免搜「span」「br」誤中

            let results = [];
            state.todos.forEach(t => {
                if (match(t.title) || (t.location && match(t.location)) || matchTags(t.tags)) {
                    results.push({ type: '待辦', title: t.title, date: t.datetime ? t.datetime.split('T')[0] : '無日期', action: () => { switchTab('home'); focusItemById(t.id); } });
                }
            });
            state.notes.forEach(n => {
                if ((n.title && match(n.title)) || (n.content && match(plain(n.content))) || matchTags(n.tags)) {
                    results.push({ type: '隨記', title: n.title || '隨記', date: '隨記', action: () => { switchTab('home'); focusItemById(n.id); } });
                }
            });
            state.diaries.forEach(d => {
                if (match(d.title) || (d.content && match(plain(d.content))) || matchTags(d.tags)) {
                    results.push({ type: '日記', title: d.title, date: (d.datetime || '').split('T')[0], action: () => { switchTab('diary'); selectDate(d.datetime.split('T')[0]); } });
                }
            });
            state.events.forEach(e => {
                if (match(e.title) || (e.location && match(e.location))) {
                    results.push({ type: '行程', title: e.title, date: e.date, action: () => { switchTab('calendar'); selectDate(e.date); } });
                }
            });
            state.habits.forEach(h => {
                if (match(h.title)) {
                    results.push({ type: '習慣', title: h.title, date: h.freq === 'weekly' ? '每週' : '每天', action: () => { switchTab('diary'); } });
                }
            });

            if (results.length === 0) {
                resultsEl.innerHTML = "<div class=\"p-3 text-xs text-muji-muted text-center\">未找到相關結果</div>";
            } else {
                resultsEl.innerHTML = results.map((r, idx) => "\n                    <div onclick=\"executeSearchResult(" + idx + ")\" class=\"p-3 hover:bg-muji-paper cursor-pointer flex justify-between items-center text-xs\">\n                        <div>\n                            <span class=\"bg-muji-paper px-1.5 py-0.5 rounded text-[11px] font-semibold text-muji-red border border-muji-border mr-2\">[" + r.type + "]</span>\n                            <span class=\"font-medium text-muji-text\">" + highlightSearchMatch(r.title, query) + "</span>\n                        </div>\n                        <span class=\"text-muji-muted text-[11px]\">" + r.date + "</span>\n                    </div>\n                ").join('');
                window.currentSearchResults = results;
            }
            resultsEl.classList.remove('hidden');
        }

        // 搜尋結果標題中，把符合的關鍵字用顏色標出來
        function highlightSearchMatch(text, query) {
            const cleanText = text || '';
            if (!query) return escapeHtml(cleanText);
            const idx = cleanText.toLowerCase().indexOf(query.toLowerCase());
            if (idx === -1) return escapeHtml(cleanText);
            const before = cleanText.slice(0, idx);
            const matched = cleanText.slice(idx, idx + query.length);
            const after = cleanText.slice(idx + query.length);
            return escapeHtml(before) + "<mark class=\"bg-muji-red/20 text-muji-red rounded px-0.5\">" + escapeHtml(matched) + "</mark>" + escapeHtml(after);
        }

        function executeSearchResult(index) {
            if (window.currentSearchResults && window.currentSearchResults[index]) {
                window.currentSearchResults[index].action();
                document.getElementById('search-results').classList.add('hidden');
                document.getElementById('search-bar-container').classList.add('hidden');
            }
        }
