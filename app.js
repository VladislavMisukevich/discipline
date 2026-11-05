// ===== Трекер самодисциплины =====
// Все данные хранятся только в браузере телефона (localStorage). Никуда не отправляются.
'use strict';

const KEY = 'discipline_v1';

// 4 привычки. id — внутреннее имя, min — «минимальная версия» (тоже засчитывается)
const HABITS = [
  { id: 'wake',  icon: '⏰', name: 'Подъём в 7:00',            min: 'встал до 8:00' },
  { id: 'gym',   icon: '💪', name: 'Зарядка 15 минут',          min: '5 минут' },
  { id: 'study', icon: '📚', name: 'Блок учёбы 25 минут',       min: '10 минут' },
  { id: 'sleep', icon: '📵', name: 'Телефон вне кровати и «не беспокоить» на ночь', min: 'хотя бы «не беспокоить»' },
];
const TABS = [['today','Сегодня','✅'],['habits','Привычки','🔥'],['report','Вечер','🌙'],['exams','Экзамены','🎓'],['more','Ещё','⚙️']];

let tab = 'today';      // текущий экран
let sel = null;         // выбранная дата для отчёта Claude
let lastText = '';      // последний сформированный отчёт

// ---------- Данные ----------
// Структура: days[дата] = { tasks:[{t,d}], h:{id:0|1|2}, r:{...отчёт} }, exams:[{name,date,topics:[{t,d}]}]
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.days && s.exams) return s; } catch (e) {}
  return { days: {}, exams: [0, 1, 2].map(() => ({ name: '', date: '', topics: [] })) };
}
let st = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { toast('Не удалось сохранить!'); }
}
// Данные дня (создаются при первом обращении)
function dayOf(k) {
  return st.days[k] || (st.days[k] = { tasks: [{ t: '', d: 0 }, { t: '', d: 0 }, { t: '', d: 0 }], h: {}, r: {} });
}

// ---------- Помощники ----------
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => key(new Date());
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2000); }

// ---------- Серии («огоньки») ----------
// Идём назад от сегодня. Выполнено (полная или минимум) — серия +1.
// Один пропуск подряд серию не рвёт, два пропуска подряд — обнуляют.
function streak(id) {
  const done = k => { const x = st.days[k]; return x && x.h && x.h[id] > 0; };
  const doneToday = done(today());
  let n = 0, miss = 0, d = new Date();
  if (!doneToday) d = addDays(d, -1);   // сегодняшний день ещё не закончился — пропуском не считаем
  for (let i = 0; i < 730; i++) {
    if (done(key(d))) { n++; miss = 0; } else if (++miss >= 2) break;
    d = addDays(d, -1);
  }
  // Предупреждение: вчера был пропуск, сегодня ещё нет отметки, а серия есть
  const warn = n > 0 && !doneToday && !done(key(addDays(new Date(), -1)));
  return { n, warn };
}

// ---------- Экраны ----------
function taskRows(k) {
  return dayOf(k).tasks.map((x, i) =>
    `<div class="row"><button class="chk ${x.d ? 'on' : ''}" data-a="td" data-k="${k}" data-i="${i}">${x.d ? '✓' : ''}</button>
     <input class="inp" placeholder="Задача ${i + 1}" value="${esc(x.t)}" data-f="tt" data-k="${k}" data-i="${i}"></div>`).join('');
}
function vToday() {
  const k = today(), tk = key(addDays(new Date(), 1));
  const n = dayOf(k).tasks.filter(x => x.d).length;
  return `<h2>3 главные задачи</h2><p class="sub">Выполнено ${n} из 3</p>${taskRows(k)}
    <h2>План на завтра</h2><p class="sub">Запиши вечером — завтра они появятся наверху</p>${taskRows(tk)}`;
}
function vHabits() {
  const h = dayOf(today()).h;
  return HABITS.map(x => {
    const v = h[x.id] || 0, s = streak(x.id);
    return `<div class="card"><div class="hd"><b>${x.icon} ${x.name}</b><span class="fire">🔥 ${s.n}</span></div>
      ${s.warn ? '<div class="warn">⚠️ Вчера пропуск. Сегодня обязательно сделай — второй пропуск подряд обнулит серию</div>' : ''}
      <div class="btns">
        <button class="btn ${v == 2 ? 'on' : ''}" data-a="h" data-id="${x.id}" data-v="2">Сделано полностью</button>
        <button class="btn min ${v == 1 ? 'on' : ''}" data-a="h" data-id="${x.id}" data-v="1">Минимум: ${x.min}</button>
      </div></div>`;
  }).join('');
}
function rate(r, n, label) {
  return `<div class="lbl">${label}</div><div class="rate">` +
    [1, 2, 3, 4, 5].map(v => `<button class="${r[n] == v ? 'on' : ''}" data-a="rate" data-n="${n}" data-v="${v}">${v}</button>`).join('') + '</div>';
}
function ri(r, n, label, type, ph) {
  return `<div><div class="lbl">${label}</div><input class="inp" type="${type}" ${type === 'number' ? 'inputmode="numeric" min="0"' : ''} placeholder="${ph || ''}" value="${esc(r[n])}" data-f="r" data-n="${n}"></div>`;
}
function vReport() {
  const r = dayOf(today()).r;
  return `<h2>Вечерний отчёт</h2><p class="sub">Минута, не больше</p>
    ${rate(r, 'mood', 'Настроение (1–5)')}${rate(r, 'energy', 'Энергия (1–5)')}
    <div class="g2">${ri(r, 'wake', 'Проснулся', 'time')}${ri(r, 'sleep', 'Лёг спать', 'time')}</div>
    <div class="lbl">Минуты в соцсетях</div>
    <div class="g3">${ri(r, 'tg', 'Telegram', 'number', '0')}${ri(r, 'tt', 'TikTok', 'number', '0')}${ri(r, 'yt', 'YouTube', 'number', '0')}</div>
    <div class="lbl">Что сделал</div><textarea data-f="r" data-n="done">${esc(r.done)}</textarea>
    <div class="lbl">Что было впустую</div><textarea data-f="r" data-n="waste">${esc(r.waste)}</textarea>
    <div class="lbl">Одна фраза о дне</div><input class="inp" value="${esc(r.note)}" data-f="r" data-n="note">`;
}
// Считаем, сколько дней осталось до даты
function cd(date) {
  const n = Math.round((new Date(date + 'T00:00') - new Date(today() + 'T00:00')) / 864e5);
  return n > 0 ? `осталось ${n} дн.` : n === 0 ? 'сегодня!' : 'дата прошла';
}
const pct = e => e.topics.length ? Math.round(e.topics.filter(t => t.d).length / e.topics.length * 100) : 0;
function vExams() {
  return st.exams.map((e, i) => `<div class="card">
    <input class="inp" placeholder="Название экзамена ${i + 1}" value="${esc(e.name)}" data-f="en" data-e="${i}">
    <div class="row"><input class="inp" type="date" value="${esc(e.date)}" data-f="ed" data-e="${i}">${e.date ? `<span class="cd">${cd(e.date)}</span>` : ''}</div>
    <div class="hd"><span>Готовность</span><b>${pct(e)}%</b></div><div class="bar"><i style="width:${pct(e)}%"></i></div>
    ${e.topics.map((t, j) => `<div class="topic ${t.d ? 'd' : ''}"><button class="chk ${t.d ? 'on' : ''}" data-a="tp" data-e="${i}" data-i="${j}">${t.d ? '✓' : ''}</button><span>${esc(t.t)}</span><button class="x" data-a="tx" data-e="${i}" data-i="${j}">✕</button></div>`).join('')}
    <div class="row"><input class="inp" id="nt${i}" placeholder="Новая тема"><button class="btn pri sm" data-a="ta" data-e="${i}">+</button></div></div>`).join('');
}
function vMore() {
  return `<h2>Отчёт для Claude</h2><p class="sub">Текст копируется в буфер и открывается меню «Поделиться»</p>
    <input class="inp" type="date" id="sd" value="${sel || today()}" data-f="sd">
    <div class="g2" style="margin-top:10px"><button class="btn pri" data-a="send" data-v="1">За день</button><button class="btn pri" data-a="send" data-v="7">За неделю</button></div>
    ${lastText ? `<textarea readonly style="min-height:160px;margin-top:10px">${esc(lastText)}</textarea>` : ''}
    <h2>Резервная копия</h2><p class="sub">Делай экспорт регулярно: если очистить данные Chrome, всё исчезнет</p>
    <div class="g2"><button class="btn" data-a="exp">Экспорт JSON</button><button class="btn" data-a="imp">Импорт JSON</button></div>
    <input type="file" id="file" accept=".json,application/json" hidden data-f="imp">`;
}

// ---------- Отчёт для Claude ----------
function report(end, n) {
  const ds = [];
  for (let i = n - 1; i >= 0; i--) ds.push(key(addDays(new Date(end + 'T12:00'), -i)));
  const L = ['Отчёт самодисциплины: ' + (n > 1 ? ds[0] + ' — ' + end : end), '', 'Привычки (✓ полностью, ~ минимум, · нет), серия на сегодня:'];
  HABITS.forEach(h => {
    const m = ds.map(k => { const v = ((st.days[k] || {}).h || {})[h.id] || 0; return v == 2 ? '✓' : v == 1 ? '~' : '·'; }).join('');
    L.push(`- ${h.name}: ${m}, серия ${streak(h.id).n}`);
  });
  L.push('', 'По дням:');
  ds.forEach(k => {
    const d = st.days[k]; if (!d) return;
    const r = d.r || {}, tk = d.tasks.filter(x => x.t);
    L.push(`${k}: задачи ${tk.filter(x => x.d).length}/${tk.length} [${tk.map(x => (x.d ? '+' : '-') + x.t).join('; ')}]; настроение ${r.mood || '?'}, энергия ${r.energy || '?'}; подъём ${r.wake || '?'}, отбой ${r.sleep || '?'}; TG/TikTok/YT ${r.tg || 0}/${r.tt || 0}/${r.yt || 0} мин` +
      (r.done ? `; сделал: ${r.done}` : '') + (r.waste ? `; впустую: ${r.waste}` : '') + (r.note ? `; итог: ${r.note}` : ''));
  });
  L.push('', 'Экзамены:');
  st.exams.filter(e => e.name).forEach(e => {
    const left = e.topics.filter(t => !t.d).map(t => t.t).join(', ') || '—';
    L.push(`- ${e.name}${e.date ? ' (' + e.date + ', ' + cd(e.date) + ')' : ''}: готовность ${pct(e)}%; не изучено: ${left}`);
  });
  return L.join('\n');
}
async function send(n) {
  sel = $('#sd').value || today();
  lastText = report(sel, n);
  try { await navigator.clipboard.writeText(lastText); toast('Скопировано'); } catch (e) { toast('Скопируй текст вручную'); }
  render();
  if (navigator.share) { try { await navigator.share({ text: lastText }); } catch (e) {} }
}

// ---------- Экспорт / импорт ----------
function exportJson() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(st, null, 1)], { type: 'application/json' }));
  a.download = 'discipline-backup-' + today() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function importJson(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const s = JSON.parse(fr.result);
      if (!s || typeof s.days !== 'object' || !Array.isArray(s.exams)) throw 0;
      if (!confirm('Заменить текущие данные данными из файла?')) return;
      st = s; save(); render(); toast('Импорт выполнен');
    } catch (e) { toast('Неверный файл'); }
  };
  fr.readAsText(file);
}

// ---------- Отрисовка ----------
function render() {
  $('#top').innerHTML = `<b>Дисциплина</b><span>${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</span>`;
  $('#nav').innerHTML = TABS.map(t => `<button class="${tab === t[0] ? 'on' : ''}" data-a="tab" data-v="${t[0]}"><i>${t[2]}</i>${t[1]}</button>`).join('');
  $('#app').innerHTML = { today: vToday, habits: vHabits, report: vReport, exams: vExams, more: vMore }[tab]();
}

// ---------- События ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, D = b.dataset;
  if (a === 'send') { send(+D.v); return; }
  if (a === 'imp') { $('#file').click(); return; }
  if (a === 'exp') { exportJson(); return; }
  if (a === 'tab') { tab = D.v; window.scrollTo(0, 0); }
  else if (a === 'td') { const x = dayOf(D.k).tasks[D.i]; x.d = x.d ? 0 : 1; }
  else if (a === 'h') { const h = dayOf(today()).h; h[D.id] = h[D.id] == D.v ? 0 : +D.v; }
  else if (a === 'rate') { const r = dayOf(today()).r; r[D.n] = r[D.n] == D.v ? '' : +D.v; }
  else if (a === 'ta') { const i = $('#nt' + D.e); if (i.value.trim()) st.exams[D.e].topics.push({ t: i.value.trim(), d: 0 }); }
  else if (a === 'tp') { const t = st.exams[D.e].topics[D.i]; t.d = t.d ? 0 : 1; }
  else if (a === 'tx') { st.exams[D.e].topics.splice(D.i, 1); }
  save(); render();
});
// Ввод текста: сохраняем сразу, экран не перерисовываем (чтобы не терять фокус)
document.addEventListener('input', e => {
  const t = e.target, f = t.dataset.f, D = t.dataset;
  if (f === 'tt') dayOf(D.k).tasks[D.i].t = t.value;
  else if (f === 'r') dayOf(today()).r[D.n] = t.value;
  else if (f === 'en') st.exams[D.e].name = t.value;
  else if (f === 'ed') st.exams[D.e].date = t.value;
  else return;
  save();
});
document.addEventListener('change', e => {
  const t = e.target, f = t.dataset.f;
  if (f === 'ed') render();
  else if (f === 'sd') { sel = t.value; lastText = ''; }
  else if (f === 'imp' && t.files[0]) { importJson(t.files[0]); t.value = ''; }
});
// При возврате в приложение обновляем экран (вдруг наступил новый день)
document.addEventListener('visibilitychange', () => { if (!document.hidden && document.activeElement.tagName !== 'INPUT') render(); });

// ---------- Запуск ----------
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();   // просим не удалять данные
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');       // офлайн-режим
render();
